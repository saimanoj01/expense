import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import module from 'node:module';

// Register extensionless TypeScript resolver hook for Node 24
if (typeof module.registerHooks === 'function') {
  module.registerHooks({
    resolve(specifier, context, nextResolve) {
      if (
        (specifier.startsWith('./') || specifier.startsWith('../')) &&
        !path.extname(specifier) &&
        context.parentURL
      ) {
        const parentPath = fileURLToPath(context.parentURL);
        const parentDir = path.dirname(parentPath);
        for (const ext of ['.ts', '.tsx', '.mjs', '.js']) {
          const candidate = path.resolve(parentDir, `${specifier}${ext}`);
          if (fs.existsSync(candidate)) {
            return nextResolve(pathToFileURL(candidate).href, context);
          }
        }
      }
      return nextResolve(specifier, context);
    },
  });
}

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, '../..');

const { LocalStorageAdapter, DEFAULT_CATEGORIES } = await import(
  pathToFileURL(path.join(repoRoot, 'src/services/storage.ts')).href
);
const {
  planIngestion,
  ingestTransactions,
  recordDeletionTombstones,
  markUserEditedFields,
  resolveTransactionReview,
} = await import(
  pathToFileURL(
    path.join(repoRoot, 'src/services/ingestion/transactionIngestService.ts')
  ).href
);
const { allocateLargestRemainderCents } = await import(
  pathToFileURL(path.join(repoRoot, 'src/services/ingestion/normalizer.ts')).href
);

function createCleanAdapter(projectId = 'test-proj') {
  globalThis.localStorage.clear();
  const adapter = new LocalStorageAdapter();
  globalThis.localStorage.setItem(`expense_txs_${projectId}`, '[]');
  globalThis.localStorage.setItem(
    `expense_categories_${projectId}`,
    JSON.stringify(DEFAULT_CATEGORIES)
  );
  globalThis.localStorage.setItem(`expense_locks_${projectId}`, '[]');
  return adapter;
}

test('1. Largest-Remainder cents allocation has zero penny drift', () => {
  const split3 = allocateLargestRemainderCents(100, [1, 1, 1]);
  assert.deepEqual(split3, [33.34, 33.33, 33.33]);
  const sum = Math.round(split3.reduce((a, b) => a + b, 0) * 100) / 100;
  assert.equal(sum, 100.0);
});

test('2. Idempotent re-run skips 100% of previously ingested transactions', async () => {
  const projectId = 'test-idempotent';
  const adapter = createCleanAdapter(projectId);

  const batch = [
    {
      externalId: 'bilt_tx_101',
      date: '2026-07-05',
      description: 'TRADER JOES #129 CA',
      merchant: "Trader Joe's",
      amount: 64.25,
    },
    {
      externalId: 'bilt_tx_102',
      date: '2026-07-06',
      description: 'NETFLIX.COM',
      amount: 15.99,
    },
  ];

  const run1 = await ingestTransactions(
    {
      projectId,
      sourceId: 'bilt-plaid',
      triggerMode: 'automated',
      transactions: batch,
      options: { skipLlm: true },
    },
    adapter
  );

  assert.equal(run1.summary.inserted, 2);
  assert.equal(run1.summary.skippedDuplicate, 0);

  const run2 = await ingestTransactions(
    {
      projectId,
      sourceId: 'bilt-plaid',
      triggerMode: 'automated',
      transactions: batch,
      options: { skipLlm: true },
    },
    adapter
  );

  assert.equal(run2.summary.inserted, 0);
  assert.equal(run2.summary.skippedDuplicate, 2);
  const stored = await adapter.getTransactions(projectId);
  assert.equal(stored.length, 2);
});

test('3. Deletion tombstones prevent automated syncs from resurrecting deleted rows', async () => {
  const projectId = 'test-tombstones';
  const adapter = createCleanAdapter(projectId);

  const res1 = await ingestTransactions(
    {
      projectId,
      sourceId: 'bilt-plaid',
      triggerMode: 'automated',
      transactions: [
        {
          externalId: 'bilt_del_1',
          date: '2026-07-08',
          description: 'CHIPOTLE 1923',
          amount: 14.5,
        },
      ],
      options: { skipLlm: true },
    },
    adapter
  );

  assert.equal(res1.summary.inserted, 1);
  const insertedTx = res1.records[0].transactions[0];

  // Simulate user deleting the transaction in UI
  await adapter.deleteTransaction(projectId, insertedTx.id);
  const prevState = await adapter.getIngestState(projectId);
  const nextState = recordDeletionTombstones([insertedTx], prevState);
  await adapter.saveIngestState(projectId, nextState);

  // Re-run ingestion with the deleted transaction
  const res2 = await ingestTransactions(
    {
      projectId,
      sourceId: 'bilt-plaid',
      triggerMode: 'automated',
      transactions: [
        {
          externalId: 'bilt_del_1',
          date: '2026-07-08',
          description: 'CHIPOTLE 1923',
          amount: 14.5,
        },
      ],
      options: { skipLlm: true },
    },
    adapter
  );

  assert.equal(res2.summary.skippedTombstoned, 1);
  assert.equal((await adapter.getTransactions(projectId)).length, 0);
});

test('4. Plaid pending -> posted handoff (supersedesExternalId), op=remove void, and userEdited protection', async () => {
  const projectId = 'test-plaid-lifecycle';
  const adapter = createCleanAdapter(projectId);

  // Step A: Ingest 2 pending transactions
  const stepA = await ingestTransactions(
    {
      projectId,
      sourceId: 'bilt-plaid',
      triggerMode: 'automated',
      transactions: [
        {
          externalId: 'plaid_pend_dinner',
          date: '2026-07-10',
          description: 'TST* OSTERIA BELLA',
          categoryHint: 'FOOD_AND_DRINK_RESTAURANTS',
          amount: 50.0,
        },
        {
          externalId: 'plaid_pend_hotel_hold',
          date: '2026-07-10',
          description: 'MARRIOTT HOTEL HOLD',
          categoryHint: 'TRAVEL_LODGING',
          amount: 150.0,
        },
      ],
      options: { skipLlm: true },
    },
    adapter
  );
  assert.equal(stepA.summary.inserted, 2);
  const dinnerPending = stepA.records[0].transactions[0];

  // Simulate user manually editing dinner category to 'entertainment'
  const editedDinner = {
    ...dinnerPending,
    category: 'entertainment',
    subCategory: null,
  };
  editedDinner.meta = markUserEditedFields(dinnerPending, editedDinner);
  await adapter.saveTransaction(projectId, editedDinner);

  // Step B: Dinner posts with $60.00 (tip added) and new externalId superseding plaid_pend_dinner;
  //         Hotel hold is voided (op: 'remove')
  const stepB = await ingestTransactions(
    {
      projectId,
      sourceId: 'bilt-plaid',
      triggerMode: 'automated',
      transactions: [
        {
          externalId: 'plaid_post_dinner',
          supersedesExternalId: 'plaid_pend_dinner',
          date: '2026-07-11',
          description: 'TST* OSTERIA BELLA',
          categoryHint: 'FOOD_AND_DRINK_RESTAURANTS',
          amount: 60.0,
        },
        {
          externalId: 'plaid_pend_hotel_hold',
          op: 'remove',
          date: '2026-07-10',
          description: 'MARRIOTT HOTEL HOLD',
          amount: 150.0,
        },
      ],
      options: { skipLlm: true },
    },
    adapter
  );

  assert.equal(stepB.summary.updatedFromSource, 1);
  assert.equal(stepB.summary.removed, 1);

  const ledger = await adapter.getTransactions(projectId);
  assert.equal(ledger.length, 1);
  const finalDinner = ledger[0];
  assert.equal(finalDinner.id, dinnerPending.id);
  assert.equal(finalDinner.amount, 60.0);
  assert.equal(finalDinner.date, '2026-07-11');
  // User-edited category must be preserved!
  assert.equal(finalDinner.category, 'entertainment');
  assert.equal(finalDinner.meta?.externalIds?.['bilt-plaid'], 'plaid_post_dinner');

  // Step C: If upstream sends op: 'remove' for a user-edited row, it must NOT delete it—it flags as voided
  const stepC = await ingestTransactions(
    {
      projectId,
      sourceId: 'bilt-plaid',
      triggerMode: 'automated',
      transactions: [
        {
          externalId: 'plaid_post_dinner',
          op: 'remove',
          date: '2026-07-11',
          description: 'TST* OSTERIA BELLA',
          amount: 60.0,
        },
      ],
      options: { skipLlm: true },
    },
    adapter
  );

  assert.equal(stepC.summary.removed, 0);
  assert.equal(stepC.summary.updatedFromSource, 1);
  const afterVoid = (await adapter.getTransactions(projectId))[0];
  assert.ok(afterVoid.labels.includes('needs-review'));
  assert.equal(afterVoid.meta?.review?.reason, 'voided');
});

test('5. First-sync claiming of legacy manual/CSV rows + syncStartDate cutoff', async () => {
  const projectId = 'test-first-sync';
  const adapter = createCleanAdapter(projectId);

  // Seed a legacy manual transaction without any `meta`
  await adapter.saveTransaction(projectId, {
    id: 'manual-rent-1',
    date: '2026-07-01',
    description: 'Bilt Rent Payment',
    amount: 2400.0,
    category: 'housing',
    subCategory: 'housing-rent',
    spendingBucket: 'fixed',
    type: 'expense',
    labels: ['recurring'],
    notes: 'Manual entry',
    hash: '2026-07-01|bilt rent payment|2400.00|expense',
  });

  const res = await ingestTransactions(
    {
      projectId,
      sourceId: 'bilt-plaid',
      triggerMode: 'automated',
      options: {
        syncStartDate: '2026-07-01',
        skipLlm: true,
      },
      transactions: [
        {
          externalId: 'bilt_old_june',
          date: '2026-06-15',
          description: 'STARBUCKS',
          amount: 5.25,
        },
        {
          externalId: 'bilt_july_rent',
          date: '2026-07-02',
          description: 'BILT REWARDS RENT',
          merchant: 'Bilt Rent',
          amount: 2400.0,
        },
      ],
    },
    adapter
  );

  assert.equal(res.summary.skippedBeforeCutoff, 1);
  assert.equal(res.summary.mergedEnriched, 1);

  const ledger = await adapter.getTransactions(projectId);
  assert.equal(ledger.length, 1);
  assert.equal(ledger[0].id, 'manual-rent-1');
  assert.equal(ledger[0].meta?.externalIds?.['bilt-plaid'], 'bilt_july_rent');
});

test('6. Same-day identical transactions: automated flags duplicate & Looks Good resolves; interactive requests confirmation', async () => {
  const projectId = 'test-sameday-dup';
  const adapter = createCleanAdapter(projectId);

  const twoCoffees = [
    {
      date: '2026-07-12',
      description: 'STARBUCKS STORE 104',
      amount: 5.75,
    },
    {
      date: '2026-07-12',
      description: 'STARBUCKS STORE 104',
      amount: 5.75,
    },
  ];

  // Interactive mode should return needs_confirmation for the second coffee
  const interactivePlan = await ingestTransactions(
    {
      projectId,
      sourceId: 'csv-upload',
      triggerMode: 'interactive',
      transactions: twoCoffees,
      options: { dryRun: true, skipLlm: true },
    },
    adapter
  );
  assert.equal(interactivePlan.summary.inserted, 1);
  assert.equal(interactivePlan.summary.needsConfirmation, 1);

  // Automated mode commits both and flags the second with needs-review (duplicate)
  const autoRes = await ingestTransactions(
    {
      projectId,
      sourceId: 'bilt-plaid',
      triggerMode: 'automated',
      transactions: twoCoffees,
      options: { skipLlm: true },
    },
    adapter
  );
  assert.equal(autoRes.summary.inserted, 1);
  assert.equal(autoRes.summary.insertedFlagged, 1);
  assert.equal(autoRes.flaggedTransactions.length, 1);
  const flaggedCoffee = autoRes.flaggedTransactions[0];
  assert.equal(flaggedCoffee.meta?.review?.reason, 'duplicate');
  assert.ok(flaggedCoffee.labels.includes('needs-review'));

  // Resolve review via "Looks Good" helper
  const resolvedCoffee = resolveTransactionReview(flaggedCoffee);
  assert.ok(!resolvedCoffee.labels.includes('needs-review'));
  assert.ok(resolvedCoffee.labels.includes('duplicate-verified'));
  assert.ok(Boolean(resolvedCoffee.meta?.review?.resolvedAt));
});

test('7. Cross-source Amazon enrichment works in BOTH arrival orders (Statement -> Email and Email -> Statement)', async () => {
  const projectId = 'test-amazon-cross';
  const adapter = createCleanAdapter(projectId);

  // ORDER A: Synchrony opaque statement arrives first, then Amazon Order Email arrives 2 days later
  const syncStmt1 = await ingestTransactions(
    {
      projectId,
      sourceId: 'amazon-synchrony',
      triggerMode: 'automated',
      transactions: [
        {
          externalId: 'sync_stmt_1',
          date: '2026-07-14',
          description: 'AMZN Mktp US*1A2B3C',
          amount: 29.99,
          metadataRichness: 'low',
        },
      ],
      options: { skipLlm: true },
    },
    adapter
  );

  // Bare "AMZN Mktp US*1A2B3C" is an opaque multi-category marketplace -> committed as shopping-amazon & flagged for category review
  assert.equal(syncStmt1.summary.insertedFlagged, 1);
  const initialRow = syncStmt1.records[0].transactions[0];
  assert.equal(initialRow.category, 'shopping');
  assert.equal(initialRow.subCategory, 'shopping-amazon');
  assert.ok(initialRow.labels.includes('needs-review'));
  assert.equal(initialRow.meta?.review?.reason, 'category');

  // Now Amazon Email arrives with item details ("Whole Foods Organic Olive Oil" -> dining-groceries)
  const emailEnrich1 = await ingestTransactions(
    {
      projectId,
      sourceId: 'amazon-email',
      triggerMode: 'automated',
      transactions: [
        {
          externalId: 'amzn_order_111',
          date: '2026-07-13',
          description: 'Amazon: Whole Foods Grocery Delivery',
          merchant: 'Amazon',
          amount: 29.99,
          metadataRichness: 'high',
        },
      ],
      options: { skipLlm: true },
    },
    adapter
  );

  assert.equal(emailEnrich1.summary.mergedEnriched, 1);
  const enrichedRow = (await adapter.getTransactions(projectId))[0];
  assert.equal(enrichedRow.id, initialRow.id);
  assert.equal(enrichedRow.description, 'Amazon: Whole Foods Grocery Delivery');
  assert.equal(enrichedRow.category, 'groceries');
  assert.equal(enrichedRow.subCategory, 'groceries-supermarket');
  // Review flag is automatically cleared because high-richness email resolved the opaque category!
  assert.ok(!enrichedRow.labels.includes('needs-review'));
  assert.ok(Boolean(enrichedRow.meta?.review?.resolvedAt));
  assert.deepEqual(enrichedRow.meta?.sources, ['amazon-synchrony', 'amazon-email']);

  // ORDER B: High-richness Amazon Order Email arrives FIRST, then Synchrony statement arrives 2 days later
  const emailFirst2 = await ingestTransactions(
    {
      projectId,
      sourceId: 'amazon-email',
      triggerMode: 'automated',
      transactions: [
        {
          externalId: 'amzn_order_222',
          date: '2026-07-18',
          description: 'Amazon: Hardcover Sci-Fi Novel',
          merchant: 'Amazon',
          amount: 19.99,
          categoryHint: 'books',
          metadataRichness: 'high',
        },
      ],
      options: { skipLlm: true },
    },
    adapter
  );
  assert.equal(emailFirst2.summary.inserted, 1);
  const emailRow2 = emailFirst2.records[0].transactions[0];

  const syncStmt2 = await ingestTransactions(
    {
      projectId,
      sourceId: 'amazon-synchrony',
      triggerMode: 'automated',
      transactions: [
        {
          externalId: 'sync_stmt_2',
          date: '2026-07-20',
          description: 'AMZN Mktp US*9Z8Y7X',
          amount: 19.99,
          metadataRichness: 'low',
        },
      ],
      options: { skipLlm: true },
    },
    adapter
  );

  assert.equal(syncStmt2.summary.mergedEnriched, 1);
  const allRows = await adapter.getTransactions(projectId);
  assert.equal(allRows.length, 2);
  const mergedRow2 = allRows.find((t) => t.id === emailRow2.id);
  assert.equal(mergedRow2.description, 'Amazon: Hardcover Sci-Fi Novel');
  assert.deepEqual(mergedRow2.meta?.sources, ['amazon-email', 'amazon-synchrony']);
  assert.equal(mergedRow2.meta?.externalIds?.['amazon-synchrony'], 'sync_stmt_2');
});

test('8. Multi-item Amazon order consolidation & category splitting + cross-source statement matching in both orders', async () => {
  const projectId = 'test-amazon-split';
  const adapter = createCleanAdapter(projectId);

  // Case A: Multi-item email arrives FIRST ($45.00 = $30.00 Groceries + $15.00 Streaming/Entertainment)
  const emailFirst = await ingestTransactions(
    {
      projectId,
      sourceId: 'amazon-email',
      triggerMode: 'automated',
      transactions: [
        {
          externalId: 'order-999',
          orderId: '112-9999999',
          date: '2026-07-15',
          description: 'Amazon Order #112-9999999',
          merchant: 'Amazon',
          amount: 45.0,
          items: [
            { title: 'Whole Foods Coffee Beans', price: 18.0, categoryHint: 'grocery' },
            { title: 'Whole Foods Almond Milk', price: 12.0, categoryHint: 'grocery' },
            { title: 'Movie Night Rental', price: 15.0, categoryHint: 'movie' },
          ],
        },
      ],
      options: { skipLlm: true },
    },
    adapter
  );

  assert.equal(emailFirst.summary.inserted, 1);
  // The 2 grocery items should consolidate into 1 row ($30.00), and the movie item into a 2nd row ($15.00) -> 2 rows total!
  const splitRows = emailFirst.records[0].transactions;
  assert.equal(splitRows.length, 2);
  assert.equal(splitRows[0].amount + splitRows[1].amount, 45.0);

  // Now Synchrony statement arrives 2 days later with a single $45.00 charge -> matches the split group by orderId sum!
  const stmtSecond = await ingestTransactions(
    {
      projectId,
      sourceId: 'amazon-synchrony',
      triggerMode: 'automated',
      transactions: [
        {
          externalId: 'sync_tx_999',
          date: '2026-07-17',
          description: 'AMZN Mktp US*999XYZ',
          amount: 45.0,
          metadataRichness: 'low',
        },
      ],
      options: { skipLlm: true },
    },
    adapter
  );

  assert.equal(stmtSecond.summary.mergedEnriched, 1);
  assert.equal((await adapter.getTransactions(projectId)).length, 2);

  // Case B: Synchrony single row ($60.00) arrives FIRST, then multi-category Amazon email arrives SECOND
  const stmtFirst = await ingestTransactions(
    {
      projectId,
      sourceId: 'amazon-synchrony',
      triggerMode: 'automated',
      transactions: [
        {
          externalId: 'sync_tx_888',
          date: '2026-07-20',
          description: 'AMZN Mktp US*888ABC',
          amount: 60.0,
          metadataRichness: 'low',
        },
      ],
      options: { skipLlm: true },
    },
    adapter
  );
  const originalStmtId = stmtFirst.records[0].transactions[0].id;

  const emailSecond = await ingestTransactions(
    {
      projectId,
      sourceId: 'amazon-email',
      triggerMode: 'automated',
      transactions: [
        {
          externalId: 'order-888',
          orderId: '112-8888888',
          date: '2026-07-19',
          description: 'Amazon Order #112-8888888',
          merchant: 'Amazon',
          amount: 60.0,
          items: [
            { title: 'Whole Foods Olive Oil', price: 20.0, categoryHint: 'grocery' },
            { title: 'Pharmacy Cold Medicine', price: 40.0, categoryHint: 'pharmacy' },
          ],
        },
      ],
      options: { skipLlm: true },
    },
    adapter
  );

  assert.equal(emailSecond.summary.mergedEnriched, 1);
  assert.equal(emailSecond.records[0].transactions.length, 2);
  // First split child reuses original statement row ID!
  assert.equal(emailSecond.records[0].transactions[0].id, originalStmtId);
  assert.equal((await adapter.getTransactions(projectId)).length, 4);
});

test('9. Refund detection assigns type=income, #refund label, and merchant expense category (never category=refund)', async () => {
  const projectId = 'test-refund';
  const adapter = createCleanAdapter(projectId);

  const res = await ingestTransactions(
    {
      projectId,
      sourceId: 'amazon-synchrony',
      triggerMode: 'automated',
      transactions: [
        {
          externalId: 'sync_refund_1',
          date: '2026-07-22',
          description: 'AMZN Mktp US REFUND',
          merchant: 'Amazon',
          amount: -24.99,
          metadataRichness: 'medium',
        },
      ],
      options: { skipLlm: true },
    },
    adapter
  );

  assert.equal(res.summary.inserted, 1);
  const refundTx = res.records[0].transactions[0];
  assert.equal(refundTx.type, 'income');
  assert.equal(refundTx.amount, 24.99);
  assert.ok(refundTx.labels.includes('refund'));
  assert.equal(refundTx.category, 'shopping');
  assert.equal(refundTx.subCategory, 'shopping-amazon');
});

test('10. Opt-in provisional tip drift merges pre-tip tap with post-tip posted charge', async () => {
  const projectId = 'test-tip-drift';
  const adapter = createCleanAdapter(projectId);

  // 1. Provisional Google Wallet tap ($40.00 at sushi restaurant)
  await ingestTransactions(
    {
      projectId,
      sourceId: 'bilt-wallet-tap',
      triggerMode: 'automated',
      transactions: [
        {
          externalId: 'tap_1',
          date: '2026-07-25',
          description: 'SUSHI RAN',
          amount: 40.0,
          provisional: true,
        },
      ],
      options: { skipLlm: true },
    },
    adapter
  );

  // 2. Posted Plaid charge 2 days later ($48.00 = $40.00 + $8.00 tip)
  const postRes = await ingestTransactions(
    {
      projectId,
      sourceId: 'bilt-plaid',
      triggerMode: 'automated',
      transactions: [
        {
          externalId: 'plaid_post_sushi',
          date: '2026-07-27',
          description: 'TST* SUSHI RAN',
          amount: 48.0,
        },
      ],
      options: { skipLlm: true, matchProvisionalTipDrift: true },
    },
    adapter
  );

  assert.equal(postRes.summary.mergedTipAdjusted, 1);
  const ledger = await adapter.getTransactions(projectId);
  assert.equal(ledger.length, 1);
  assert.equal(ledger[0].amount, 48.0);
  assert.equal(ledger[0].meta?.provisional, false);
});

test('11. Multi-item amount mismatch (>25% deviation from gift card/promo) commits and flags amount-mismatch', async () => {
  const projectId = 'test-amt-mismatch';
  const adapter = createCleanAdapter(projectId);

  const res = await ingestTransactions(
    {
      projectId,
      sourceId: 'amazon-email',
      triggerMode: 'automated',
      transactions: [
        {
          externalId: 'order-gc-1',
          date: '2026-07-28',
          description: 'Amazon Order with Gift Card',
          merchant: 'Amazon',
          amount: 25.0, // $80 item minus $55 gift card
          items: [{ title: 'Nike Running Shoes', price: 80.0, categoryHint: 'apparel' }],
        },
      ],
      options: { skipLlm: true },
    },
    adapter
  );

  assert.equal(res.summary.insertedFlagged, 1);
  const tx = res.records[0].transactions[0];
  assert.equal(tx.amount, 25.0);
  assert.ok(tx.labels.includes('needs-review'));
  assert.equal(tx.meta?.review?.reason, 'amount-mismatch');
});

test('12. Stage 1 History Memory learns from user-verified merchant categories', async () => {
  const projectId = 'test-history-memory';
  const adapter = createCleanAdapter(projectId);

  // Seed a user-categorized transaction for an obscure merchant ("ACME CLIMBING GYM")
  await adapter.saveTransaction(projectId, {
    id: 'hist-1',
    date: '2026-06-10',
    description: 'ACME CLIMBING GYM',
    amount: 95.0,
    category: 'healthcare',
    subCategory: null,
    spendingBucket: 'fixed',
    type: 'expense',
    labels: [],
    notes: '',
    hash: '2026-06-10|acme climbing gym|95.00|expense',
    meta: {
      categorizedBy: 'user',
      userEdited: ['category', 'spendingBucket'],
      confidence: 1.0,
    },
  });

  // Ingest a new charge from the same merchant (which would otherwise fail keyword matching)
  const res = await ingestTransactions(
    {
      projectId,
      sourceId: 'bilt-plaid',
      triggerMode: 'automated',
      transactions: [
        {
          externalId: 'bilt_gym_july',
          date: '2026-07-10',
          description: 'SQ *ACME CLIMBING GYM #2',
          amount: 95.0,
        },
      ],
      options: { skipLlm: true },
    },
    adapter
  );

  assert.equal(res.summary.inserted, 1);
  assert.equal(res.records[0].categorizedBy, 'history');
  const newTx = res.records[0].transactions[0];
  assert.equal(newTx.category, 'healthcare');
  assert.equal(newTx.spendingBucket, 'fixed');
  assert.ok(!newTx.labels.includes('needs-review'));
});

test('13. [H1] Distinct externalIds on same or consecutive days are NOT false-flagged as duplicates', async () => {
  const projectId = 'test-h1-distinct-ext-ids';
  const adapter = createCleanAdapter(projectId);

  // Two distinct Plaid transaction_ids for subway taps on consecutive days + two on the same day
  const res = await ingestTransactions(
    {
      projectId,
      sourceId: 'bilt-plaid',
      triggerMode: 'automated',
      transactions: [
        {
          externalId: 'plaid_mta_mon_am',
          date: '2026-07-06',
          description: 'MTA*NYCT PAYGO',
          amount: 2.9,
        },
        {
          externalId: 'plaid_mta_mon_pm',
          date: '2026-07-06',
          description: 'MTA*NYCT PAYGO',
          amount: 2.9,
        },
        {
          externalId: 'plaid_mta_tue_am',
          date: '2026-07-07',
          description: 'MTA*NYCT PAYGO',
          amount: 2.9,
        },
      ],
      options: { skipLlm: true },
    },
    adapter
  );

  assert.equal(res.summary.inserted, 3);
  assert.equal(res.summary.insertedFlagged, 0);
  assert.equal(res.flaggedTransactions.length, 0);
});

test('14. [H2] Utility/insurance online & autopay bills are expenses, while card/bank transfers map to transfer subcategories', async () => {
  const projectId = 'test-h2-transfers-vs-bills';
  const adapter = createCleanAdapter(projectId);

  const res = await ingestTransactions(
    {
      projectId,
      sourceId: 'bilt-plaid',
      triggerMode: 'automated',
      transactions: [
        {
          externalId: 'tx_comcast',
          date: '2026-07-05',
          description: 'COMCAST CABLE ONLINE PAYMENT',
          amount: 79.99,
        },
        {
          externalId: 'tx_geico',
          date: '2026-07-06',
          description: 'GEICO AUTO PAY',
          amount: 145.0,
        },
        {
          externalId: 'tx_sync_pay',
          date: '2026-07-07',
          description: 'SYNCHRONY BANK PAYMENT - THANK YOU',
          categoryHint: 'LOAN_PAYMENTS_CREDIT_CARD_PAYMENT',
          amount: 250.0,
        },
        {
          externalId: 'tx_bank_xfer',
          date: '2026-07-08',
          description: 'ONLINE BANK TRANSFER TO SAVINGS',
          amount: 500.0,
        },
      ],
      options: { skipLlm: true },
    },
    adapter
  );

  const byExtId = Object.fromEntries(
    res.records.map((r) => [r.externalId, r.transactions[0]])
  );

  // Comcast & Geico must be expenses, NOT transfers!
  assert.equal(byExtId.tx_comcast.type, 'expense');
  assert.equal(byExtId.tx_comcast.category, 'utilities');
  assert.equal(byExtId.tx_comcast.subCategory, 'utilities-internet');

  assert.equal(byExtId.tx_geico.type, 'expense');
  assert.equal(byExtId.tx_geico.category, 'transport');
  assert.equal(byExtId.tx_geico.subCategory, 'transport-maint');

  // Synchrony payment & bank transfer must be transfers with accurate subcategories
  assert.equal(byExtId.tx_sync_pay.type, 'transfer');
  assert.equal(byExtId.tx_sync_pay.category, 'transfers');
  assert.equal(byExtId.tx_sync_pay.subCategory, 'transfers-cc');

  assert.equal(byExtId.tx_bank_xfer.type, 'transfer');
  assert.equal(byExtId.tx_bank_xfer.category, 'transfers');
  assert.equal(byExtId.tx_bank_xfer.subCategory, 'transfers-bank');
});

test('15. [H3 & M4] op=remove deletes all split children of a canceled order and reports skipped_not_found for unknown IDs', async () => {
  const projectId = 'test-h3-split-remove';
  const adapter = createCleanAdapter(projectId);

  // 1. Insert a 2-category split order
  const ins = await ingestTransactions(
    {
      projectId,
      sourceId: 'amazon-email',
      triggerMode: 'automated',
      transactions: [
        {
          externalId: 'amzn_cancel_order',
          orderId: '112-5555555',
          date: '2026-07-10',
          description: 'Amazon Order #112-5555555',
          merchant: 'Amazon',
          amount: 50.0,
          items: [
            { title: 'Whole Foods Granola', price: 20.0, categoryHint: 'grocery' },
            { title: 'Sci-Fi Blu-Ray Movie', price: 30.0, categoryHint: 'movie' },
          ],
        },
      ],
      options: { skipLlm: true },
    },
    adapter
  );
  assert.equal((await adapter.getTransactions(projectId)).length, 2);
  assert.equal(ins.records[0].transactions[0].meta?.externalIds?.['amazon-email'], 'amzn_cancel_order#split-1');
  assert.equal(ins.records[0].transactions[1].meta?.externalIds?.['amazon-email'], 'amzn_cancel_order#split-2');

  // 2. Send op: 'remove' with parent externalId 'amzn_cancel_order' + an unknown ID 'unknown_void_999'
  const rem = await ingestTransactions(
    {
      projectId,
      sourceId: 'amazon-email',
      triggerMode: 'automated',
      transactions: [
        {
          externalId: 'amzn_cancel_order',
          op: 'remove',
          date: '2026-07-10',
          description: 'Canceled Order',
          amount: 50.0,
        },
        {
          externalId: 'unknown_void_999',
          op: 'remove',
          date: '2026-07-10',
          description: 'Unknown Hold',
          amount: 10.0,
        },
      ],
      options: { skipLlm: true },
    },
    adapter
  );

  assert.equal(rem.summary.removed, 1);
  assert.equal(rem.summary.skippedTombstoned, 0);
  assert.equal(rem.summary.skippedDuplicate, 1);
  assert.equal(rem.records[1].status, 'skipped_not_found');
  assert.equal((await adapter.getTransactions(projectId)).length, 0);
});

test('16. [H4] Cross-card isolation (Bilt vs Synchrony) and strict token/brand isolation (Whole Foods, Uber Eats, Shellfish)', async () => {
  const projectId = 'test-h4-isolation';
  const adapter = createCleanAdapter(projectId);

  const { normalizeMerchantName, merchantsMatch } = await import(
    pathToFileURL(path.join(repoRoot, 'src/services/ingestion/normalizer.ts')).href
  );

  // Verify normalizer fixes
  assert.equal(normalizeMerchantName('COFFEE IN ME'), 'coffee in me');
  assert.equal(normalizeMerchantName('WHOLE FOODS MARKET #102'), 'whole foods market');
  assert.equal(normalizeMerchantName('Amazon: Whole Foods Delivery'), 'amazon');
  assert.equal(merchantsMatch('UBER TRIP', 'UBER EATS'), false);
  assert.equal(merchantsMatch('SHELL OIL', 'SHELLFISH SHACK'), false);
  assert.equal(merchantsMatch('WHOLE FOODS MARKET', 'AMZN Mktp US*123'), false);

  // Verify Bilt card Amazon charge does NOT merge with Synchrony/default Amazon email
  await ingestTransactions(
    {
      projectId,
      sourceId: 'bilt-plaid',
      triggerMode: 'automated',
      transactions: [
        {
          externalId: 'bilt_amzn_1',
          date: '2026-07-12',
          description: 'AMZN Mktp US*BILT1',
          amount: 35.0,
        },
      ],
      options: { skipLlm: true },
    },
    adapter
  );

  const syncEmail = await ingestTransactions(
    {
      projectId,
      sourceId: 'amazon-email',
      triggerMode: 'automated',
      transactions: [
        {
          externalId: 'sync_amzn_email_1',
          date: '2026-07-12',
          description: 'Amazon: USB-C Hub',
          merchant: 'Amazon',
          amount: 35.0,
          account: 'amazon-store-card',
          metadataRichness: 'high',
        },
      ],
      options: { skipLlm: true },
    },
    adapter
  );

  // Must insert as a separate transaction because Bilt != Amazon Store Card
  assert.equal(syncEmail.summary.mergedEnriched, 0);
  assert.equal((await adapter.getTransactions(projectId)).length, 2);
});

test('17. [H5] Omitting syncStartDate does NOT auto-lock cutoff or block historical backfills', async () => {
  const projectId = 'test-h5-backfill';
  const adapter = createCleanAdapter(projectId);

  // Initial sync of July transactions without syncStartDate
  await ingestTransactions(
    {
      projectId,
      sourceId: 'bilt-plaid',
      triggerMode: 'automated',
      transactions: [
        {
          externalId: 'july_tx_1',
          date: '2026-07-20',
          description: 'TRADER JOES',
          amount: 42.0,
        },
      ],
      options: { skipLlm: true },
    },
    adapter
  );

  // Backfill June transaction -> must be inserted, NOT skipped_before_cutoff!
  const backfill = await ingestTransactions(
    {
      projectId,
      sourceId: 'bilt-plaid',
      triggerMode: 'automated',
      transactions: [
        {
          externalId: 'june_tx_1',
          date: '2026-06-05',
          description: 'SAFEWAY STORE 102',
          amount: 118.5,
        },
      ],
      options: { skipLlm: true },
    },
    adapter
  );

  assert.equal(backfill.summary.skippedBeforeCutoff, 0);
  assert.equal(backfill.summary.inserted, 1);
  assert.equal((await adapter.getTransactions(projectId)).length, 2);
});

test('18. [H6] GoogleSheetsAdapter shards >400 tombstones across multiple rows well below the 50k char limit', async () => {
  const { GoogleSheetsAdapter } = await import(
    pathToFileURL(path.join(repoRoot, 'src/services/storage.ts')).href
  );

  globalThis.localStorage.setItem(
    'expense_google_projects',
    JSON.stringify([
      {
        id: 'sheet-123',
        name: 'Sheet 123',
        spreadsheetId: 'sheet-123',
      },
    ])
  );

  let storedNotesRows = [['key', 'note']];

  // Mock fetch to intercept Google Sheets API GET and PUT calls
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (url, init) => {
    const urlStr = String(url);
    if (!init || !init.method || init.method === 'GET') {
      const payload = urlStr.includes('batchGet')
        ? {
            valueRanges: [
              { values: [['id', 'date']] },
              { values: [] },
              { values: [] },
              { values: [] },
              { values: storedNotesRows },
            ],
          }
        : { values: storedNotesRows };
      return {
        ok: true,
        text: async () => JSON.stringify(payload),
        json: async () => payload,
      };
    }
    if (urlStr.includes('valueInputOption=RAW') || urlStr.includes('valueInputOption=USER_ENTERED')) {
      const body = JSON.parse(init.body);
      storedNotesRows = body.values;
      return { ok: true, text: async () => '{}', json: async () => ({}) };
    }
    return { ok: true, text: async () => '{}', json: async () => ({}) };
  };

  try {
    const gsAdapter = new GoogleSheetsAdapter(() => 'mock-token');
    const bigTombstones = Array.from({ length: 950 }, (_, i) => `bilt-plaid:tx_tombstone_${i}`);
    await gsAdapter.saveIngestState('sheet-123', {
      version: 1,
      tombstones: bigTombstones,
      sources: {},
      recentRuns: [],
    });

    // Verify 1 main state row + 2 overflow shard rows (400 + 400 + 150) were written, and every cell is < 15,000 chars
    const metaRows = storedNotesRows.filter((r) => String(r[0]).startsWith('__meta_ingest_'));
    assert.equal(metaRows.length, 3);
    for (const row of metaRows) {
      assert.ok(String(row[1]).length < 15000, `Cell length ${String(row[1]).length} exceeded 15,000 chars`);
    }

    // Invalidate cache to force re-reading and reassembling sharded tombstones from Notes!A:B
    gsAdapter.invalidateCache('sheet-123');
    const roundTrip = await gsAdapter.getIngestState('sheet-123');
    assert.equal(roundTrip.tombstones.length, 950);
    assert.equal(roundTrip.tombstones[0], 'bilt-plaid:tx_tombstone_0');
    assert.equal(roundTrip.tombstones[949], 'bilt-plaid:tx_tombstone_949');
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('19. [M1, M3, M5, Nits] Mutex concurrency, Step 6b split externalId suffixing, multi-reason reviews, and non-Amazon prefix', async () => {
  const projectId = 'test-m1-m3-m5';
  const adapter = createCleanAdapter(projectId);

  // 1. Concurrent ingestTransactions calls on the same projectId must serialize without losing rows
  await Promise.all([
    ingestTransactions(
      {
        projectId,
        sourceId: 'bilt-plaid',
        triggerMode: 'automated',
        transactions: [
          { externalId: 'conc_1', date: '2026-07-01', description: 'NETFLIX.COM', amount: 15.99 },
        ],
        options: { skipLlm: true },
      },
      adapter
    ),
    ingestTransactions(
      {
        projectId,
        sourceId: 'amazon-email',
        triggerMode: 'automated',
        transactions: [
          {
            externalId: 'conc_2',
            date: '2026-07-02',
            description: 'Target Order',
            merchant: 'Target',
            amount: 25.0,
            items: [{ title: 'Dish Soap', price: 25.0, categoryHint: 'groceries' }],
          },
        ],
        options: { skipLlm: true },
      },
      adapter
    ),
  ]);

  const afterConcurrent = await adapter.getTransactions(projectId);
  assert.equal(afterConcurrent.length, 2);
  const targetTx = afterConcurrent.find((t) => t.description.startsWith('Target:'));
  assert.ok(targetTx, 'Multi-item non-Amazon order should use merchant prefix "Target:", not "Amazon:"');

  // 2. Step 6b split children suffix existing externalIds with #split-N and update cleanly when statement date changes
  await ingestTransactions(
    {
      projectId,
      sourceId: 'amazon-synchrony',
      triggerMode: 'automated',
      transactions: [
        {
          externalId: 'sync_split_parent',
          date: '2026-07-10',
          description: 'AMZN Mktp US*SPLIT1',
          amount: 50.0,
          metadataRichness: 'low',
        },
      ],
      options: { skipLlm: true },
    },
    adapter
  );

  const splitEnrich = await ingestTransactions(
    {
      projectId,
      sourceId: 'amazon-email',
      triggerMode: 'automated',
      transactions: [
        {
          externalId: 'email_split_parent',
          orderId: '112-7777777',
          date: '2026-07-10',
          description: 'Amazon Order #112-7777777',
          merchant: 'Amazon',
          amount: 50.0,
          items: [
            { title: 'Whole Foods Tea', price: 20.0, categoryHint: 'grocery' },
            { title: 'Cinema Rental', price: 30.0, categoryHint: 'movie' },
          ],
        },
      ],
      options: { skipLlm: true },
    },
    adapter
  );

  const [child1, child2] = splitEnrich.records[0].transactions;
  assert.equal(child1.meta?.externalIds?.['amazon-synchrony'], 'sync_split_parent#split-1');
  assert.equal(child2.meta?.externalIds?.['amazon-synchrony'], 'sync_split_parent#split-2');

  // Re-ingesting statement with updated posting date updates both split children in place
  const stmtDateUpdate = await ingestTransactions(
    {
      projectId,
      sourceId: 'amazon-synchrony',
      triggerMode: 'automated',
      transactions: [
        {
          externalId: 'sync_split_parent',
          date: '2026-07-11',
          description: 'AMZN Mktp US*SPLIT1',
          amount: 50.0,
          metadataRichness: 'low',
        },
      ],
      options: { skipLlm: true },
    },
    adapter
  );
  assert.equal(stmtDateUpdate.summary.updatedFromSource, 1);
  assert.equal(stmtDateUpdate.records[0].transactions.length, 2);
  assert.equal(stmtDateUpdate.records[0].transactions[0].date, '2026-07-11');
  assert.equal(stmtDateUpdate.records[0].transactions[1].date, '2026-07-11');

  // 3. Multi-reason review: an unrecognized item with >25% gift card mismatch records BOTH 'amount-mismatch' and 'category'
  const multiReasonRes = await ingestTransactions(
    {
      projectId,
      sourceId: 'etsy-email',
      triggerMode: 'automated',
      transactions: [
        {
          externalId: 'multi_reason_1',
          date: '2026-07-18',
          description: 'Etsy Order',
          merchant: 'Etsy',
          amount: 15.0,
          items: [{ title: 'Unclassified Mystery Gadget XYZ', price: 50.0 }],
        },
      ],
      options: { skipLlm: true },
    },
    adapter
  );
  const multiReasonTx = multiReasonRes.records[0].transactions[0];
  assert.deepEqual(multiReasonTx.meta?.review?.reasons, ['amount-mismatch', 'category']);

  // 4. resolveTransactionReview on a duplicate flag must NOT overwrite categorizedBy to 'user'
  const dupFlagged = {
    id: 'dup-1',
    date: '2026-07-15',
    description: 'STARBUCKS',
    amount: 5.0,
    category: 'dining',
    subCategory: 'dining-coffee',
    spendingBucket: 'flexible',
    type: 'expense',
    labels: ['needs-review'],
    notes: '',
    hash: 'h1',
    meta: {
      categorizedBy: 'keyword',
      confidence: 0.9,
      review: { reason: 'duplicate', reasons: ['duplicate'] },
    },
  };
  const resolvedDup = resolveTransactionReview(dupFlagged);
  assert.equal(resolvedDup.meta?.categorizedBy, 'keyword');
  assert.ok(resolvedDup.labels.includes('duplicate-verified'));
});

test('20. [B3] CLI rejects non-dry-run without storage target and filters superseded Plaid removed IDs', async () => {
  const { execFileSync } = await import('node:child_process');
  const cliPath = path.join(repoRoot, '.agents/skills/expense-ingest/scripts/ingest_transactions.py');
  const tmpDir = fs.mkdtempSync('/tmp/expense-cli-test-');
  const inputPath = path.join(tmpDir, 'plaid_sync.json');
  const statePath = path.join(tmpDir, 'state.json');

  // Plaid payload where pending_1 is both superseded by posted_1 AND listed in removed[]
  fs.writeFileSync(
    inputPath,
    JSON.stringify({
      added: [
        {
          transaction_id: 'posted_1',
          pending_transaction_id: 'pending_1',
          date: '2026-07-15',
          name: 'NETFLIX.COM',
          amount: 15.99,
        },
      ],
      modified: [],
      removed: [{ transaction_id: 'pending_1' }],
    })
  );

  // 1. Running without --state-file, --spreadsheet-id, or --dry-run must exit with error
  let failedAsExpected = false;
  try {
    execFileSync('python3', [cliPath, '--input', inputPath, '--source', 'bilt-plaid'], {
      stdio: 'pipe',
    });
  } catch (err) {
    failedAsExpected = true;
    assert.match(String(err.stderr), /requires a persistent storage target/);
  }
  assert.equal(failedAsExpected, true);

  // 2. Running with --state-file succeeds and filters out the redundant removed item
  const out = JSON.parse(
    execFileSync(
      'python3',
      [cliPath, '--input', inputPath, '--source', 'bilt-plaid', '--state-file', statePath, '--skip-llm'],
      { encoding: 'utf8' }
    )
  );
  assert.equal(out.summary.totalInput, 1);
  assert.equal(out.summary.inserted, 1);

  fs.rmSync(tmpDir, { recursive: true, force: true });
});

test('20b. CLI: stdin, summary, dry-run, payload shapes, friendly errors, state-file lock cleanup', async () => {
  const { spawnSync } = await import('node:child_process');
  const cliPath = path.join(repoRoot, '.agents/skills/expense-ingest/scripts/ingest_transactions.py');
  const run = (args, input, env = {}) =>
    spawnSync('python3', [cliPath, ...args], {
      input,
      encoding: 'utf8',
      env: { ...process.env, GOOGLE_SHEETS_SPREADSHEET_ID: '', GOOGLE_ACCESS_TOKEN: '', GOOGLE_APPLICATION_CREDENTIALS: '', ...env },
    });
  const tx = { externalId: 'cli_1', date: '2026-07-15', description: 'Chipotle', amount: 12.5 };

  let r = run(['--dry-run', '--skip-llm', '-f', 'summary'], JSON.stringify([tx]));
  assert.equal(r.status, 0, r.stderr);
  assert.ok(r.stdout.length > 0);

  r = run(['--dry-run', '--skip-llm'], JSON.stringify({ transactions: [tx], sourceId: 'x' }));
  assert.equal(r.status, 0, r.stderr);
  assert.equal(JSON.parse(r.stdout).dryRun, true);

  r = run(['--dry-run'], '{not json');
  assert.equal(r.status, 1);
  assert.match(r.stderr, /not valid JSON/);

  r = run(['--spreadsheet-id', 'abc', '--skip-llm'], JSON.stringify([tx]));
  assert.equal(r.status, 1);
  assert.match(r.stderr, /without credentials/);
  assert.doesNotMatch(r.stderr, /\[eval1\]/);

  r = run(['--json', '-f', 'summary', '--dry-run'], JSON.stringify([tx]));
  assert.notEqual(r.status, 0);

  const tmpDir = fs.mkdtempSync('/tmp/expense-cli-test-');
  const statePath = path.join(tmpDir, 'state.json');
  r = run(['--state-file', statePath, '--skip-llm'], JSON.stringify([tx]));
  assert.equal(r.status, 0, r.stderr);
  assert.deepEqual(fs.readdirSync(tmpDir), ['state.json']);
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

test('21. Stage 3 Gemini LLM classification & GoogleSheetsAdapter Column L (meta) round-trip persistence', async () => {
  const projectId = 'test-stage3-llm';
  const adapter = createCleanAdapter(projectId);
  globalThis.localStorage.setItem('expense_gemini_api_key', 'mock-gemini-key');

  let capturedPrompt = '';
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (url, init) => {
    const urlStr = String(url);
    if (urlStr.includes('generativelanguage.googleapis.com')) {
      const reqBody = JSON.parse(init.body);
      capturedPrompt = reqBody.contents?.[0]?.parts?.[0]?.text || '';
      return {
        ok: true,
        json: async () => ({
          candidates: [
            {
              content: {
                parts: [
                  {
                    text: JSON.stringify({
                      classifications: [
                        {
                          id: 'tx:0',
                          categoryId: 'entertainment',
                          subCategoryId: 'entertainment-movies',
                          spendingBucket: 'flexible',
                          confidence: 0.91,
                        },
                      ],
                    }),
                  },
                ],
              },
            },
          ],
        }),
      };
    }
    return { ok: true, text: async () => '{}', json: async () => ({}) };
  };

  try {
    const llmRes = await ingestTransactions(
      {
        projectId,
        sourceId: 'bilt-plaid',
        triggerMode: 'automated',
        transactions: [
          {
            externalId: 'llm_tx_1',
            date: '2026-07-19',
            description: 'ALAMO DRAFTHOUSE LAKELINE',
            amount: 34.5,
          },
          {
            externalId: 'income_tx_2',
            date: '2026-07-19',
            description: 'ACME CONSULTING PAYOUT',
            amount: 1200.0,
            type: 'income',
          },
        ],
        options: { skipLlm: false },
      },
      adapter
    );

    assert.equal(llmRes.summary.inserted, 2);
    assert.equal(llmRes.records[0].categorizedBy, 'llm');
    assert.equal(llmRes.records[0].transactions[0].category, 'entertainment');
    assert.equal(llmRes.records[0].transactions[0].subCategory, 'entertainment-movies');
    assert.equal(llmRes.records[0].transactions[0].meta?.confidence, 0.91);
    // Non-refund income row must NOT be sent to Gemini
    assert.ok(capturedPrompt.includes('ALAMO DRAFTHOUSE LAKELINE'));
    assert.ok(!capturedPrompt.includes('ACME CONSULTING PAYOUT'));

    // Also verify GoogleSheetsAdapter Column L (meta) round-trip persistence
    const { GoogleSheetsAdapter } = await import(
      pathToFileURL(path.join(repoRoot, 'src/services/storage.ts')).href
    );
    globalThis.localStorage.setItem(
      'expense_google_projects',
      JSON.stringify([{ id: 'sheet-meta', name: 'Sheet Meta', spreadsheetId: 'sheet-meta' }])
    );
    let storedTxRows = [['id', 'date', 'category', 'subCategory', 'amount', 'type', 'description', 'notes', 'labels', 'hash', 'spendingBucket', 'meta']];
    globalThis.fetch = async (url, init) => {
      const urlStr = String(url);
      if (!init || !init.method || init.method === 'GET') {
        const payload = {
          valueRanges: [
            { values: storedTxRows },
            { values: [] },
            { values: [] },
            { values: [] },
            { values: [] },
          ],
        };
        return { ok: true, text: async () => JSON.stringify(payload), json: async () => payload };
      }
      if (urlStr.includes('Transactions!A1:L')) {
        storedTxRows = JSON.parse(init.body).values;
      }
      return { ok: true, text: async () => '{}', json: async () => ({}) };
    };

    const gsAdapter = new GoogleSheetsAdapter(() => 'mock-token');
    await gsAdapter.saveTransactions('sheet-meta', [llmRes.records[0].transactions[0]], {
      ignoreLocks: true,
    });
    assert.equal(storedTxRows.length, 2);
    assert.ok(String(storedTxRows[1][11]).includes('"categorizedBy":"llm"'));

    gsAdapter.invalidateCache('sheet-meta');
    const loadedTxs = await gsAdapter.getTransactions('sheet-meta');
    assert.equal(loadedTxs.length, 1);
    assert.equal(loadedTxs[0].meta?.categorizedBy, 'llm');
    assert.equal(loadedTxs[0].meta?.externalIds?.['bilt-plaid'], 'llm_tx_1');
  } finally {
    globalThis.fetch = originalFetch;
    globalThis.localStorage.removeItem('expense_gemini_api_key');
  }
});

test('22. Intra-batch upsert followed by op=remove drops the transaction, and 4-digit card suffixes match compatibly', async () => {
  const projectId = 'test-intrabatch-and-last4';
  const adapter = createCleanAdapter(projectId);

  // 1. Intra-batch insert followed by op: 'remove' in the same batch must NOT persist the row
  const batchRes = await ingestTransactions(
    {
      projectId,
      sourceId: 'bilt-plaid',
      triggerMode: 'automated',
      transactions: [
        {
          externalId: 'temp_hold_1',
          date: '2026-07-20',
          description: 'CHEVRON PUMP HOLD',
          amount: 100.0,
        },
        {
          externalId: 'temp_hold_1',
          op: 'remove',
          date: '2026-07-20',
          description: 'CHEVRON PUMP HOLD',
          amount: 100.0,
        },
      ],
      options: { skipLlm: true },
    },
    adapter
  );

  assert.equal(batchRes.summary.removed, 1);
  assert.equal((await adapter.getTransactions(projectId)).length, 0);

  // 2. 4-digit card suffix on Amazon email ('1234') merges with Synchrony statement ('amazon-synchrony'),
  //    while conflicting 4-digit suffix ('5678') does NOT merge with ('1234')
  await ingestTransactions(
    {
      projectId,
      sourceId: 'amazon-synchrony',
      triggerMode: 'automated',
      transactions: [
        {
          externalId: 'sync_last4_stmt',
          date: '2026-07-22',
          description: 'AMZN Mktp US*L4',
          amount: 44.0,
          metadataRichness: 'low',
        },
      ],
      options: { skipLlm: true },
    },
    adapter
  );

  const emailLast4 = await ingestTransactions(
    {
      projectId,
      sourceId: 'amazon-email',
      triggerMode: 'automated',
      transactions: [
        {
          externalId: 'email_last4_order',
          date: '2026-07-21',
          description: 'Amazon: Ergonomic Mouse',
          merchant: 'Amazon',
          amount: 44.0,
          account: '1234',
          metadataRichness: 'high',
        },
      ],
      options: { skipLlm: true },
    },
    adapter
  );

  assert.equal(emailLast4.summary.mergedEnriched, 1);
  assert.equal((await adapter.getTransactions(projectId)).length, 1);
});

test('23. Deterministic planIngestion (nowIso + idGenerator) and UI helper determinism (markUserEditedFields & resolveTransactionReview)', async () => {
  const snapshot = {
    existingTransactions: [],
    categories: DEFAULT_CATEGORIES,
    ingestState: { version: 1, sources: {}, tombstones: [], recentRuns: [] },
  };

  let seqA = 0;
  const planA = await planIngestion(snapshot, {
    projectId: 'det-proj',
    sourceId: 'bilt-plaid',
    triggerMode: 'automated',
    transactions: [
      {
        externalId: 'det_1',
        date: '2026-07-25',
        description: 'TRADER JOES #105',
        amount: 64.2,
      },
      {
        externalId: 'det_2',
        date: '2026-07-25',
        description: 'MYSTERY VENDOR XYZ',
        amount: 19.99,
      },
    ],
    options: {
      skipLlm: true,
      nowIso: '2026-07-25T12:00:00.000Z',
      idGenerator: () => `det-id-${++seqA}`,
    },
  });

  let seqB = 0;
  const planB = await planIngestion(snapshot, {
    projectId: 'det-proj',
    sourceId: 'bilt-plaid',
    triggerMode: 'automated',
    transactions: [
      {
        externalId: 'det_1',
        date: '2026-07-25',
        description: 'TRADER JOES #105',
        amount: 64.2,
      },
      {
        externalId: 'det_2',
        date: '2026-07-25',
        description: 'MYSTERY VENDOR XYZ',
        amount: 19.99,
      },
    ],
    options: {
      skipLlm: true,
      nowIso: '2026-07-25T12:00:00.000Z',
      idGenerator: () => `det-id-${++seqB}`,
    },
  });

  assert.deepEqual(planA, planB);
  assert.equal(planA.ops[0].tx.id, 'det-id-1');
  assert.equal(planA.ops[1].tx.id, 'det-id-2');
  assert.equal(planA.nextIngestState.recentRuns[0].runId, 'run-det-id-3');

  // Verify markUserEditedFields manual entry (!oldTx) vs edit
  const manualMeta = markUserEditedFields(
    undefined,
    {
      id: 'm1',
      date: '2026-07-25',
      description: 'Farmer Market',
      amount: 20,
      category: 'groceries',
      subCategory: 'groceries-supermarket',
      spendingBucket: 'flexible',
      type: 'expense',
      labels: [],
      notes: '',
    },
    '2026-07-25T13:00:00.000Z'
  );
  assert.deepEqual(
    manualMeta.userEdited?.slice().sort(),
    ['category', 'spendingBucket', 'subCategory']
  );
  assert.equal(manualMeta.categorizedBy, 'user');

  // Verify resolveTransactionReview on duplicate flag does NOT overwrite categorizedBy: 'keyword'
  const resolvedDup = resolveTransactionReview(
    {
      ...planA.ops[0].tx,
      labels: ['needs-review'],
      meta: {
        ...planA.ops[0].tx.meta,
        categorizedBy: 'keyword',
        confidence: 0.85,
        review: {
          reason: 'duplicate',
          reasons: ['duplicate'],
          flaggedAt: '2026-07-25T12:00:00.000Z',
        },
      },
    },
    '2026-07-25T14:00:00.000Z'
  );
  assert.equal(resolvedDup.meta?.categorizedBy, 'keyword');
  assert.equal(resolvedDup.meta?.confidence, 0.85);
  assert.equal(resolvedDup.meta?.review?.resolvedAt, '2026-07-25T14:00:00.000Z');
  assert.ok(resolvedDup.labels.includes('duplicate-verified'));
});

test('24. llmCategorizer marks confidenceSource as "model" when provided and "default" when omitted or fallen back', async () => {
  const { classifyTransactionsWithLLM } = await import(
    pathToFileURL(path.join(repoRoot, 'src/services/llmCategorizer.ts')).href
  );

  globalThis.localStorage.setItem('expense_gemini_api_key', 'test-mock-gemini-key');
  const originalFetch = globalThis.fetch;

  globalThis.fetch = async () => ({
    ok: true,
    json: async () => ({
      candidates: [
        {
          content: {
            parts: [
              {
                text: JSON.stringify({
                  classifications: [
                    {
                      id: 'c_with_conf',
                      categoryId: 'food',
                      subCategoryId: 'food-dine-in',
                      spendingBucket: 'flexible',
                      confidence: 0.93,
                    },
                    {
                      id: 'c_without_conf',
                      categoryId: 'utilities',
                      spendingBucket: 'fixed',
                    },
                  ],
                }),
              },
            ],
          },
        },
      ],
    }),
  });

  try {
    const res = await classifyTransactionsWithLLM(
      [
        { id: 'c_with_conf', description: 'BISTRO CENTRAL', amount: 48 },
        { id: 'c_without_conf', description: 'CITY POWER CORP', amount: 95 },
        { id: 'c_missing_from_response', description: 'STARBUCKS STORE 99', amount: 6.5 },
      ],
      DEFAULT_CATEGORIES
    );

    assert.equal(res.c_with_conf.confidence, 0.93);
    assert.equal(res.c_with_conf.confidenceSource, 'model');

    assert.equal(res.c_without_conf.confidence, 0.8);
    assert.equal(res.c_without_conf.confidenceSource, 'default');

    assert.equal(res.c_missing_from_response.categoryId, 'food');
    assert.equal(res.c_missing_from_response.confidenceSource, 'default');
  } finally {
    globalThis.fetch = originalFetch;
    globalThis.localStorage.removeItem('expense_gemini_api_key');
  }
});

test('25. CSV-import keyword categorization regressions (word boundaries, Shell vs Shellfish, Amazon shopping order)', async () => {
  const { suggestCategory, suggestSubCategory, suggestSpendingBucket } = await import(
    pathToFileURL(path.join(repoRoot, 'src/utils/categorizer.ts')).href
  );

  // Word-boundary protected keywords must not false-match inside longer words
  assert.equal(suggestCategory('SHELLFISH SHACK', undefined, DEFAULT_CATEGORIES), 'misc');
  assert.equal(suggestCategory('SHELLFISH SHACK DINING', undefined, DEFAULT_CATEGORIES), 'food');
  assert.equal(suggestCategory('SHELL OIL 5744', undefined, DEFAULT_CATEGORIES), 'transport');
  assert.equal(suggestSubCategory('SHELL OIL 5744', 'transport', DEFAULT_CATEGORIES), 'transport-fuel');

  assert.equal(suggestCategory('GASTRONOMY PUB', undefined, DEFAULT_CATEGORIES), 'misc');
  assert.equal(suggestCategory('CHEVRON GAS STATION', undefined, DEFAULT_CATEGORIES), 'transport');

  assert.equal(suggestCategory('WATERCOLOR ART STUDIO', undefined, DEFAULT_CATEGORIES), 'misc');
  assert.equal(suggestCategory('CITY WATER UTILITY', undefined, DEFAULT_CATEGORIES), 'utilities');

  assert.equal(suggestCategory('PARENTING MAGAZINE', undefined, DEFAULT_CATEGORIES), 'misc');
  assert.equal(suggestCategory('BILT RENT PAYMENT', undefined, DEFAULT_CATEGORIES), 'housing');

  // Amazon / AMZN maps to shopping + shopping-amazon + flexible
  assert.equal(suggestCategory('AMZN Mktp US*1A2B3C', undefined, DEFAULT_CATEGORIES), 'shopping');
  assert.equal(
    suggestSubCategory('AMZN Mktp US*1A2B3C', 'shopping', DEFAULT_CATEGORIES),
    'shopping-amazon'
  );
  assert.equal(suggestSpendingBucket('AMZN Mktp US*1A2B3C', 'shopping'), 'flexible');
});

test('26. Atomic commitIngestBatch rollback on mid-flight error and GoogleSheetsAdapter cross-process lease lock', async () => {
  const projectId = 'test-atomic-rollback';
  const adapter = createCleanAdapter(projectId);

  // Seed 1 initial transaction
  await ingestTransactions(
    {
      projectId,
      sourceId: 'bilt-plaid',
      triggerMode: 'automated',
      transactions: [
        {
          externalId: 'seed_tx_1',
          date: '2026-07-01',
          description: 'STARBUCKS #1',
          amount: 5.5,
        },
      ],
      options: { skipLlm: true },
    },
    adapter
  );
  assert.equal((await adapter.getTransactions(projectId)).length, 1);

  // Simulate saveIngestState failure mid-commit -> transactions must roll back cleanly to 1 row
  const origSaveState = adapter.saveIngestState.bind(adapter);
  adapter.saveIngestState = async () => {
    throw new Error('Simulated storage failure during state save');
  };

  await assert.rejects(
    () =>
      ingestTransactions(
        {
          projectId,
          sourceId: 'bilt-plaid',
          triggerMode: 'automated',
          transactions: [
            {
              externalId: 'should_rollback_tx',
              date: '2026-07-02',
              description: 'CHIPOTLE #2',
              amount: 14.25,
            },
          ],
          options: { skipLlm: true },
        },
        adapter
      ),
    /Simulated storage failure/
  );

  adapter.saveIngestState = origSaveState;
  const afterRollback = await adapter.getTransactions(projectId);
  assert.equal(afterRollback.length, 1);
  assert.equal(afterRollback[0].meta?.externalIds?.['bilt-plaid'], 'seed_tx_1');

  // Verify GoogleSheetsAdapter cross-process lease lock rejects a competing process when active
  const { GoogleSheetsAdapter } = await import(
    pathToFileURL(path.join(repoRoot, 'src/services/storage.ts')).href
  );
  globalThis.localStorage.setItem(
    'expense_google_projects',
    JSON.stringify([{ id: 'sheet-lock', name: 'Sheet Lock', spreadsheetId: 'sheet-lock' }])
  );
  const originalFetch = globalThis.fetch;
  let storedNotesRows = [
    ['key', 'note'],
    [
      '__meta_ingest_lock__',
      JSON.stringify({
        text: JSON.stringify({
          holderId: 'other-github-action-job',
          expiresAt: new Date(Date.now() + 60_000).toISOString(),
        }),
        updatedAt: new Date().toISOString(),
      }),
    ],
  ];

  globalThis.fetch = async (url, init) => {
    if (!init || !init.method || init.method === 'GET') {
      const payload = {
        valueRanges: [
          { values: [['id', 'date', 'category', 'subCategory', 'amount', 'type', 'description', 'notes', 'labels', 'hash', 'spendingBucket', 'meta']] },
          { values: [] },
          { values: [] },
          { values: [] },
          { values: storedNotesRows },
        ],
      };
      return { ok: true, text: async () => JSON.stringify(payload), json: async () => payload };
    }
    return { ok: true, text: async () => '{}', json: async () => ({}) };
  };

  try {
    const gsAdapter = new GoogleSheetsAdapter(() => 'mock-token');
    await assert.rejects(
      () =>
        ingestTransactions(
          {
            projectId: 'sheet-lock',
            sourceId: 'amazon-email',
            triggerMode: 'automated',
            transactions: [
              {
                externalId: 'contended_tx',
                date: '2026-07-03',
                description: 'Amazon: Book',
                amount: 15.0,
              },
            ],
            options: { skipLlm: true },
          },
          gsAdapter
        ),
      /Concurrent ingestion lock on project "sheet-lock" is held by "other-github-action-job"/
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('27. November replay regressions: bare Google/Zelle isolation, Zillow ST-id normalization, transfer keywords, misc-salon history, and legacy needs-review resolution', async () => {
  const projectId = 'test-november-regressions';
  const adapter = createCleanAdapter(projectId);

  // Seed historical rows that previously caused cross-type / prefix / rail collisions
  await adapter.saveTransactions(projectId, [
    {
      id: 'hist-google-payroll',
      date: '2026-07-15',
      description: 'Google',
      amount: 5000,
      type: 'income',
      category: 'income',
      subCategory: 'income-salary',
      labels: ['manoj bofa'],
      notes: 'Payroll',
      hash: 'h1',
    },
    {
      id: 'hist-zelle-secdep',
      date: '2026-07-27',
      description: 'Zelle',
      amount: 2700,
      type: 'expense',
      category: 'housing',
      subCategory: 'housing-mortgage',
      spendingBucket: 'fixed',
      labels: ['fixed'],
      notes: 'Returned Security Deposit',
      hash: 'h2',
    },
    {
      id: 'hist-zillow-rental',
      date: '2026-07-05',
      description: 'ZG - Your Rental Rent-#K5-7 ST-A1B2C3D4E5F6',
      amount: 2695,
      type: 'income',
      category: 'income',
      subCategory: 'income-investment',
      labels: ['wells fargo'],
      notes: 'Rental payout',
      hash: 'h3',
    },
    {
      id: 'hist-mels-barber',
      date: '2026-07-10',
      description: "Mel's Barber Studio",
      amount: 65.58,
      type: 'expense',
      category: 'misc',
      subCategory: 'misc-salon',
      spendingBucket: 'flexible',
      labels: ['bilt', 'flexible'],
      notes: '',
      hash: 'h4',
    },
    {
      id: 'hist-google-store',
      date: '2026-07-12',
      description: 'Google Store',
      amount: 199.99,
      type: 'expense',
      category: 'merchandise',
      subCategory: 'merchandise-electronics',
      spendingBucket: 'flexible',
      labels: ['bilt', 'flexible'],
      notes: '',
      hash: 'h5',
    },
  ]);

  const res = await ingestTransactions(
    {
      projectId,
      sourceId: 'gpay-plaid',
      triggerMode: 'automated',
      transactions: [
        {
          externalId: 'nov_1',
          date: '2026-11-02',
          description: 'Google Fi',
          amount: 31.64,
        },
        {
          externalId: 'nov_2',
          date: '2026-11-03',
          description: 'Google Store',
          amount: 355.87,
        },
        {
          externalId: 'nov_3',
          date: '2026-11-06',
          description: 'Google One',
          amount: -16.77,
          isRefund: true,
        },
        {
          externalId: 'nov_4',
          date: '2026-11-02',
          description: 'Zelle payment to DIANA TORRES RIVERA',
          amount: 200,
        },
        {
          externalId: 'nov_5',
          date: '2026-11-05',
          description: 'ZG - Your Rental Rent-#K5-7 ST-T0P3X0N3Q7Q3',
          amount: 2695,
          type: 'income',
        },
        {
          externalId: 'nov_6',
          date: '2026-11-06',
          description: "Mel's Barber Studio",
          amount: 65.58,
        },
        {
          externalId: 'nov_7',
          date: '2026-11-06',
          description: 'AMAZON CORP SYF PAYMNT 604578111959659',
          amount: 233.94,
        },
        {
          externalId: 'nov_8',
          date: '2026-11-04',
          description: 'BILT CARD PMT PPD ID: 1844372402',
          amount: 5831.84,
        },
        {
          externalId: 'nov_9',
          date: '2026-11-04',
          description: 'Payment',
          amount: 5831.84,
        },
        {
          externalId: 'nov_10',
          date: '2026-11-03',
          description: 'Payment - Bilt Housing',
          amount: 2640.66,
        },
      ],
      options: { skipLlm: true },
    },
    adapter
  );

  const byExt = Object.fromEntries(res.records.map(r => [r.externalId, r]));

  // Bare 'Google' payroll must not bleed into Google Fi, Google Store, or Google One
  assert.equal(byExt.nov_1.transactions[0].category, 'utilities');
  assert.equal(byExt.nov_1.transactions[0].subCategory, 'utilities-phone');

  assert.equal(byExt.nov_2.transactions[0].category, 'merchandise');
  assert.equal(byExt.nov_2.transactions[0].subCategory, 'merchandise-electronics');

  assert.equal(byExt.nov_3.transactions[0].type, 'income');
  assert.ok(byExt.nov_3.transactions[0].labels.includes('refund'));
  assert.equal(byExt.nov_3.transactions[0].category, 'entertainment');
  assert.equal(byExt.nov_3.transactions[0].subCategory, 'entertainment-subs');

  // Bare 'Zelle' security deposit must not classify Zelle payment to DIANA as housing
  assert.equal(byExt.nov_4.transactions[0].category, 'misc');
  assert.ok(byExt.nov_4.transactions[0].labels.includes('needs-review'));

  // Zillow ST-id suffix stripped so history matches income / income-investment
  assert.equal(byExt.nov_5.transactions[0].type, 'income');
  assert.equal(byExt.nov_5.transactions[0].category, 'income');
  assert.equal(byExt.nov_5.transactions[0].subCategory, 'income-investment');
  assert.equal(byExt.nov_5.categorizedBy, 'history');

  // Mel's Barber Studio matches misc/misc-salon from history and is NOT flagged for review
  assert.equal(byExt.nov_6.transactions[0].category, 'misc');
  assert.equal(byExt.nov_6.transactions[0].subCategory, 'misc-salon');
  assert.ok(!byExt.nov_6.transactions[0].labels.includes('needs-review'));

  // Card bill payoffs and Bilt housing pass-through classify as transfers
  assert.equal(byExt.nov_7.transactions[0].type, 'transfer');
  assert.equal(byExt.nov_7.transactions[0].category, 'transfers');
  assert.equal(byExt.nov_7.transactions[0].subCategory, 'transfers-cc');

  assert.equal(byExt.nov_8.transactions[0].type, 'transfer');
  assert.equal(byExt.nov_9.transactions[0].type, 'transfer');

  assert.equal(byExt.nov_10.transactions[0].type, 'transfer');
  assert.equal(byExt.nov_10.transactions[0].category, 'housing');
  assert.equal(byExt.nov_10.transactions[0].subCategory, 'housing-mortgage');

  // Legacy row with needs-review label but no meta.review resolves as category review
  const legacyResolved = resolveTransactionReview(
    {
      id: 'legacy-review-row',
      date: '2026-11-05',
      description: 'Garlic Crush',
      amount: 7.67,
      type: 'expense',
      category: 'food',
      subCategory: 'food-dine-in',
      labels: ['bilt', 'flexible', 'needs-review'],
      notes: '',
      hash: 'h-legacy',
    },
    '2026-11-06T20:00:00.000Z'
  );
  assert.ok(!legacyResolved.labels.includes('needs-review'));
  assert.equal(legacyResolved.meta?.categorizedBy, 'user');
  assert.equal(legacyResolved.meta?.confidence, 1.0);
  assert.equal(legacyResolved.meta?.review?.reason, 'category');
  assert.equal(legacyResolved.meta?.review?.resolvedAt, '2026-11-06T20:00:00.000Z');
});

test('28. Pure-Python wallet_reconcile.py CLI: 7-day lookback, pending->settled upgrade, tip drift, tombstones, and batch output', async () => {
  const { execFileSync } = await import('node:child_process');
  const fs = await import('node:fs');
  const os = await import('node:os');

  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'wallet-reconcile-test-'));
  const tsvPath = path.join(tmpDir, 'transactions.tsv');
  const notesPath = path.join(tmpDir, 'notes.json');
  const inputPath = path.join(tmpDir, 'wallet_input.json');
  const batchOutPath = path.join(tmpDir, 'batch_out.json');

  try {
    // Existing sheet rows:
    // 1. Settled row (JD's Market on 2026-11-01) -> should be skipped_exact_duplicate
    // 2. Pending row (Garlic Crush $7.67 on 2026-11-05) -> should be merged_tip_adjusted to $9.67 on 2026-11-06
    // 3. Pending row (Google Store $355.87 on 2026-11-03) -> should be updated_pending_to_settled on 2026-11-04
    const tsvLines = [
      ['id', 'date', 'category', 'subCategory', 'amount', 'type', 'description', 'notes', 'labels', 'hash', 'spendingBucket'].join('\t'),
      [
        'tx-jds',
        '2026-11-01',
        'groceries',
        'groceries-supermarket',
        '76.74',
        'expense',
        "JD's Market",
        'Google Wallet (Plaid) • Bilt Palladium (7702)',
        '["bilt","flexible"]',
        '1997f0ba86dae7aa967fc3201f9b121534d8cd908a36941b7669938059f88ca3',
        'flexible',
      ].join('\t'),
      [
        'tx-garlic-pend',
        '2026-11-05',
        'food',
        'food-dine-in',
        '7.67',
        'expense',
        'Garlic Crush',
        'Google Wallet (Plaid) • Bilt Palladium (7702) • Pending',
        '["bilt","flexible"]',
        '1111222233334444555566667777888899990000aaaabbbbccccddddeeeeffff',
        'flexible',
      ].join('\t'),
      [
        'tx-gstore-pend',
        '2026-11-03',
        'merchandise',
        'merchandise-electronics',
        '355.87',
        'expense',
        'Google Store',
        'Google Wallet (Plaid) • Bilt Palladium (7702) • Pending',
        '["bilt","flexible"]',
        '2222333344445555666677778888999900001111aaaabbbbccccddddeeeeffff',
        'flexible',
      ].join('\t'),
    ];
    fs.writeFileSync(tsvPath, tsvLines.join('\n'), 'utf8');

    // Notes with a tombstone for 'tombstoned-ext-1'
    const notesGrid = [
      ['key', 'note'],
      [
        '__meta_ingest_state__',
        JSON.stringify({
          text: JSON.stringify({
            version: 1,
            tombstones: ['tombstoned-ext-1'],
            sources: {},
            recentRuns: [],
          }),
          updatedAt: '2026-11-05T00:00:00Z',
        }),
      ],
    ];
    fs.writeFileSync(notesPath, JSON.stringify(notesGrid), 'utf8');

    // Incoming Wallet rows
    const walletRows = [
      // Too old (before 7-day lookback from 2026-11-06)
      {
        date: '2026-10-20',
        description: 'Old Coffee',
        amount: 4.5,
        status: 'Purchase',
        account: '7702',
      },
      // Tombstoned externalId
      {
        externalId: 'tombstoned-ext-1',
        date: '2026-11-04',
        description: 'Deleted Charge',
        amount: 19.99,
        status: 'Purchase',
        account: '7702',
      },
      // Exact duplicate of JD's Market
      {
        date: '2026-11-01',
        description: "JD's Market",
        amount: 76.74,
        status: 'Purchase',
        account: '7702',
      },
      // Tip-adjusted settlement of Garlic Crush ($7.67 -> $9.67)
      {
        date: '2026-11-06',
        description: 'Garlic Crush',
        amount: 9.67,
        status: 'Purchase',
        categoryHint: 'Food & Drink',
        account: '7702',
      },
      // Settled upgrade of Google Store with +1d settlement drift
      {
        date: '2026-11-04',
        description: 'Google Store',
        amount: 355.87,
        status: 'Purchase',
        account: '7702',
      },
      // New Bilt Housing pass-through ACH on 9666
      {
        date: '2026-11-03',
        description: 'BILT CARD DES:HOUSING ID: INDN:Sai Manoj Bandi',
        amount: 2640.66,
        status: 'Purchase',
        account: '9666',
      },
    ];
    fs.writeFileSync(inputPath, JSON.stringify(walletRows), 'utf8');

    const scriptPath = path.join(
      repoRoot,
      '.agents/skills/expense-ingest/scripts/wallet_reconcile.py'
    );
    const stdout = execFileSync(
      'python3',
      [
        scriptPath,
        '--input',
        inputPath,
        '--transactions-tsv',
        tsvPath,
        '--notes-json',
        notesPath,
        '--reference-date',
        '2026-11-06',
        '--lookback-days',
        '7',
        '--batch-out',
        batchOutPath,
      ],
      { encoding: 'utf8' }
    );

    const plan = JSON.parse(stdout);
    assert.equal(plan.summary.skippedBeforeLookback, 1);
    assert.equal(plan.summary.skippedTombstoned, 1);
    assert.equal(plan.summary.skippedDuplicate, 1);
    assert.equal(plan.summary.mergedTipAdjusted, 1);
    assert.equal(plan.summary.updatedPendingToSettled, 1);
    assert.equal(plan.summary.inserted, 1);

    // Check Bilt ACH leg normalized to description "Bilt", type "transfer", housing/housing-mortgage
    const insertedBilt = plan.insertedTransactions[0];
    assert.equal(insertedBilt.description, 'Bilt');
    assert.equal(insertedBilt.type, 'transfer');
    assert.equal(insertedBilt.category, 'housing');
    assert.equal(insertedBilt.subCategory, 'housing-mortgage');
    assert.equal(insertedBilt.meta.account, 'manoj bofa');
    assert.deepEqual(insertedBilt.labels, []);
    assert.equal(plan.appendRows[0].length, 12); // A:L 12 columns

    // Check batch requests file was written
    const batchReqs = JSON.parse(fs.readFileSync(batchOutPath, 'utf8'));
    assert.ok(Array.isArray(batchReqs));
    assert.ok(batchReqs.some(op => op.op === 'write' && op.range.startsWith('Transactions!A')));
    assert.ok(batchReqs.some(op => op.op === 'append' && op.range === 'Transactions!A1'));
    assert.ok(batchReqs.some(op => op.op === 'write' && op.range === 'Notes!A2:B2'));
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test('29. TypeScript & Python Parity: Occurrence-aware deduplication, Pending -> Settled upgrade, PENDING PAYMENT settlement, and modal spendingBucket', async () => {
  const { execFileSync } = await import('node:child_process');
  const os = await import('node:os');
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'nebula-parity-29-'));

  try {
    const projectId = 'test-parity-29';
    const adapter = createCleanAdapter(projectId);

    // Seed history with 3 rows for "Bella Yoga Studio": 1 oldest 'flexible', 2 newer 'fixed' -> modal is 'fixed'
    const seedRows = [
      {
        id: 'yoga-1',
        date: '2026-08-01',
        category: 'healthcare',
        subCategory: null,
        amount: 120.0,
        type: 'expense',
        description: 'Bella Yoga Studio',
        notes: '',
        labels: ['flexible'],
        hash: 'h-yoga-1',
        spendingBucket: 'flexible',
        meta: { sources: ['gpay-plaid'], confidence: 0.95, categorizedBy: 'user' },
      },
      {
        id: 'yoga-2',
        date: '2026-09-01',
        category: 'healthcare',
        subCategory: null,
        amount: 120.0,
        type: 'expense',
        description: 'Bella Yoga Studio',
        notes: '',
        labels: ['fixed'],
        hash: 'h-yoga-2',
        spendingBucket: 'fixed',
        meta: { sources: ['gpay-plaid'], confidence: 0.95, categorizedBy: 'user' },
      },
      {
        id: 'yoga-3',
        date: '2026-10-01',
        category: 'healthcare',
        subCategory: null,
        amount: 120.0,
        type: 'expense',
        description: 'Bella Yoga Studio',
        notes: '',
        labels: ['fixed'],
        hash: 'h-yoga-3',
        spendingBucket: 'fixed',
        meta: { sources: ['gpay-plaid'], confidence: 0.95, categorizedBy: 'user' },
      },
      // Existing settled Starbucks $5.00 on 2026-11-04
      {
        id: 'sbux-existing-1',
        date: '2026-11-04',
        category: 'food',
        subCategory: 'food-takeout',
        amount: 5.0,
        type: 'expense',
        description: 'Starbucks',
        notes: 'Google Wallet (Plaid) • Bilt Palladium (7702)',
        labels: ['bilt', 'flexible'],
        hash: (await import('node:crypto'))
          .createHash('sha256')
          .update('2026-11-04|starbucks|5.00|expense')
          .digest('hex'),
        spendingBucket: 'flexible',
        meta: {
          sources: ['gpay-plaid'],
          account: 'bilt',
          confidence: 0.85,
          categorizedBy: 'keyword',
        },
      },
      // Two pending Cafe Vida $12.00 rows (2026-11-02 and 2026-11-04)
      {
        id: 'vida-pend-1',
        date: '2026-11-02',
        category: 'food',
        subCategory: 'food-takeout',
        amount: 12.0,
        type: 'expense',
        description: 'Cafe Vida',
        notes: 'Google Wallet (Plaid) • Bilt Palladium (7702) • Pending',
        labels: ['bilt', 'flexible'],
        hash: 'h-vida-1',
        spendingBucket: 'flexible',
        meta: {
          sources: ['gpay-plaid'],
          account: 'bilt',
          provisional: true,
        },
      },
      {
        id: 'vida-pend-2',
        date: '2026-11-04',
        category: 'food',
        subCategory: 'food-takeout',
        amount: 12.0,
        type: 'expense',
        description: 'Cafe Vida',
        notes: 'Google Wallet (Plaid) • Bilt Palladium (7702) • Pending',
        labels: ['bilt', 'flexible'],
        hash: 'h-vida-2',
        spendingBucket: 'flexible',
        meta: {
          sources: ['gpay-plaid'],
          account: 'bilt',
          provisional: true,
        },
      },
      // Pending CC payoff "PENDING PAYMENT" ($3,115.23 on 4692)
      {
        id: 'atmos-pend-pmt',
        date: '2026-11-04',
        category: 'transfers',
        subCategory: 'transfers-cc',
        amount: 3115.23,
        type: 'transfer',
        description: 'PENDING PAYMENT',
        notes: 'Google Wallet (Plaid) • BofA Atmos Ascent Visa (4692) • Pending',
        labels: ['bofa atmos'],
        hash: '2df3342a69774ff3f957a99ffbc85e0cf9ef449bc24a84145058325410162780',
        spendingBucket: undefined,
        meta: {
          sources: ['gpay-plaid'],
          account: 'bofa atmos',
          provisional: true,
          aliasHashes: ['2df3342a69774ff3'],
        },
      },
    ];

    for (const r of seedRows) {
      await adapter.saveTransaction(projectId, r);
    }

    const incomingBatch = [
      // 1st Starbucks $5.00 -> matches sbux-existing-1 (skipped_exact_duplicate)
      {
        date: '2026-11-04',
        description: 'Starbucks',
        amount: 5.0,
        account: '7702',
      },
      // 2nd Starbucks $5.00 -> sbux-existing-1 already claimed -> inserted_flagged (duplicate)!
      {
        date: '2026-11-04',
        description: 'Starbucks',
        amount: 5.0,
        account: '7702',
      },
      // Settled Cafe Vida $12.00 on 2026-11-05 -> upgrades closest pending row (vida-pend-2 on 2026-11-04)
      {
        date: '2026-11-05',
        description: 'Cafe Vida',
        amount: 12.0,
        account: '7702',
      },
      // Settled "Payment" $3,115.23 on 4692 -> upgrades "PENDING PAYMENT" in place
      {
        date: '2026-11-05',
        description: 'Payment',
        amount: 3115.23,
        type: 'transfer',
        account: '4692',
      },
      // New Bella Yoga Studio charge -> Stage 1 History Memory picks modal 'fixed' bucket
      {
        date: '2026-11-05',
        description: 'Bella Yoga Studio',
        amount: 120.0,
        account: '7702',
      },
    ];

    const tsRes = await ingestTransactions(
      {
        projectId,
        sourceId: 'gpay-plaid',
        triggerMode: 'automated',
        transactions: incomingBatch,
        options: { skipLlm: true },
      },
      adapter
    );

    assert.equal(tsRes.summary.skippedDuplicate, 1);
    assert.equal(tsRes.summary.insertedFlagged, 1);
    assert.equal(tsRes.summary.updatedFromSource, 2);
    assert.equal(tsRes.summary.inserted, 1);

    const yogaRecord = tsRes.records[4].transactions[0];
    assert.equal(yogaRecord.spendingBucket, 'fixed');

    const updatedLedger = await adapter.getTransactions(projectId);
    const settledAtmos = updatedLedger.find(t => t.id === 'atmos-pend-pmt');
    assert.equal(settledAtmos.description, 'Payment');
    assert.equal(settledAtmos.meta?.provisional, false);
    assert.ok(!settledAtmos.notes.toLowerCase().includes('pending'));

    // Now test Python wallet_reconcile.py on the exact same dataset
    const tsvHeader = [
      'id',
      'date',
      'category',
      'subCategory',
      'amount',
      'type',
      'description',
      'notes',
      'labels',
      'hash',
      'spendingBucket',
      'meta',
    ].join('\t');
    const tsvLines = [
      tsvHeader,
      ...seedRows.map(r =>
        [
          r.id,
          r.date,
          r.category,
          r.subCategory || '',
          r.amount,
          r.type,
          r.description,
          r.notes,
          JSON.stringify(r.labels),
          r.hash,
          r.spendingBucket || '',
          JSON.stringify(r.meta),
        ].join('\t')
      ),
    ];
    const tsvPath = path.join(tmpDir, 'Transactions.tsv');
    const notesPath = path.join(tmpDir, 'Notes.json');
    const inputPath = path.join(tmpDir, 'wallet.json');
    fs.writeFileSync(tsvPath, tsvLines.join('\n') + '\n', 'utf8');
    fs.writeFileSync(
      notesPath,
      JSON.stringify([
        ['key', 'value'],
        [
          '__meta_ingest_state__',
          JSON.stringify({
            text: JSON.stringify({ version: 1, tombstones: [], sources: {}, recentRuns: [] }),
          }),
        ],
      ]),
      'utf8'
    );
    fs.writeFileSync(
      inputPath,
      JSON.stringify(
        incomingBatch.map(x => ({
          ...x,
          status: x.type === 'transfer' ? 'Transfer' : 'Purchase',
        }))
      ),
      'utf8'
    );

    const scriptPath = path.join(
      repoRoot,
      '.agents/skills/expense-ingest/scripts/wallet_reconcile.py'
    );
    const pyOut = JSON.parse(
      execFileSync(
        'python3',
        [
          scriptPath,
          '--input',
          inputPath,
          '--transactions-tsv',
          tsvPath,
          '--notes-json',
          notesPath,
          '--reference-date',
          '2026-11-06',
          '--lookback-days',
          '7',
        ],
        { encoding: 'utf8' }
      )
    );

    assert.equal(pyOut.summary.skippedDuplicate, 1);
    assert.equal(pyOut.summary.insertedFlagged, 1);
    assert.equal(pyOut.summary.updatedPendingToSettled, 2);
    assert.equal(pyOut.summary.inserted, 1);

    const pyYoga = pyOut.insertedTransactions.find(t => t.description === 'Bella Yoga Studio');
    assert.equal(pyYoga.spendingBucket, 'fixed');

    const pyAtmosUpdate = pyOut.updateOps.find(u => u.id === 'atmos-pend-pmt');
    assert.equal(pyAtmosUpdate.tx.description, 'Payment');
    assert.equal(pyAtmosUpdate.tx.meta.provisional, false);
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test('30. Month-end Bilt housing normalization, HOA ($352.95) exclusion, blank-line TSV rowNumber, tombstone sharding (>400), and lease lock', async () => {
  const { execFileSync, spawnSync } = await import('node:child_process');
  const os = await import('node:os');
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'nebula-bilt-30-'));

  try {
    const tsvHeader = [
      'id',
      'date',
      'category',
      'subCategory',
      'amount',
      'type',
      'description',
      'notes',
      'labels',
      'hash',
      'spendingBucket',
      'meta',
    ].join('\t');

    // Include a blank line at row 2 so the pending transaction is on physical sheet Row 3!
    const tsvContent = [
      tsvHeader,
      '', // physical row 2 (blank)
      [
        'row3-pending-id',
        '2026-11-03',
        'food',
        'food-takeout',
        '15.00',
        'expense',
        'Blue Bottle Coffee',
        'Google Wallet (Plaid) • Bilt Palladium (7702) • Pending',
        '["bilt","flexible"]',
        'old-hash-row3',
        'flexible',
        '{"sources":["gpay-plaid"],"account":"bilt","provisional":true}',
      ].join('\t'),
    ].join('\n');

    const tsvPath = path.join(tmpDir, 'Transactions.tsv');
    const notesPath = path.join(tmpDir, 'Notes.json');
    const inputPath = path.join(tmpDir, 'wallet.json');
    const batchPath = path.join(tmpDir, 'batch.json');
    fs.writeFileSync(tsvPath, tsvContent + '\n', 'utf8');

    // Create 450 tombstones across inline + overflow chunk 1, plus a duplicate __meta_ingest_state__ row at row 4
    const inlineTombstones = Array.from({ length: 400 }, (_, i) => `tomb-inline-${i}`);
    const overflowTombstones = Array.from({ length: 50 }, (_, i) => `tomb-overflow-${i}`);
    fs.writeFileSync(
      notesPath,
      JSON.stringify([
        ['key', 'value'],
        [
          '__meta_ingest_state__',
          JSON.stringify({
            text: JSON.stringify({
              version: 1,
              tombstones: inlineTombstones,
              sources: {},
              recentRuns: [],
            }),
          }),
        ],
        [
          '__meta_ingest_tombstones_1__',
          JSON.stringify({
            text: JSON.stringify(overflowTombstones),
          }),
        ],
        [
          '__meta_ingest_state__',
          JSON.stringify({
            text: JSON.stringify({ version: 1, tombstones: [], sources: {}, recentRuns: [] }),
          }),
        ],
      ]),
      'utf8'
    );

    const walletIncoming = [
      // 1. Month-end Bilt mortgage expense ($7,356.60 on 2026-10-30 -> normalizes to 2026-11-01, inside 7d lookback from 2026-11-06!)
      {
        date: '2026-10-30',
        description: 'Bilt Housing Payment',
        amount: 7356.6,
        status: 'Purchase',
        account: '7702',
      },
      // 2. Month-end Bilt housing pass-through ($7,356.60 on 2026-10-30 -> normalizes to 2026-11-01)
      {
        date: '2026-10-30',
        description: 'Payment - Bilt Housing',
        amount: 7356.6,
        status: 'Refund',
        account: '7702',
      },
      // 3. HOA payment ($352.95 on 2026-10-31 -> below minAmount=1000, stays on 2026-10-31)
      {
        date: '2026-10-31',
        description: 'Bilt Housing Payment',
        amount: 352.95,
        status: 'Purchase',
        account: '7702',
      },
      // 4. Settled Blue Bottle Coffee on 2026-11-04 -> updates physical sheet row 3
      {
        date: '2026-11-04',
        description: 'Blue Bottle Coffee',
        amount: 15.0,
        status: 'Purchase',
        account: '7702',
      },
    ];
    fs.writeFileSync(inputPath, JSON.stringify(walletIncoming), 'utf8');

    const scriptPath = path.join(
      repoRoot,
      '.agents/skills/expense-ingest/scripts/wallet_reconcile.py'
    );
    const plan = JSON.parse(
      execFileSync(
        'python3',
        [
          scriptPath,
          '--input',
          inputPath,
          '--transactions-tsv',
          tsvPath,
          '--notes-json',
          notesPath,
          '--reference-date',
          '2026-11-06',
          '--lookback-days',
          '7',
          '--batch-out',
          batchPath,
        ],
        { encoding: 'utf8' }
      )
    );

    assert.equal(plan.summary.inserted, 3);
    assert.equal(plan.summary.updatedPendingToSettled, 1);

    // Check mortgage normalized to 2026-11-01 with Posted 2026-10-30 note and 2 aliasHashes
    const biltExp = plan.insertedTransactions[0];
    assert.equal(biltExp.date, '2026-11-01');
    assert.ok(biltExp.notes.includes('Posted 2026-10-30'));
    assert.equal(biltExp.meta.aliasHashes.length, 2);

    // Check HOA ($352.95) stayed on 2026-10-31
    const hoaExp = plan.insertedTransactions[2];
    assert.equal(hoaExp.date, '2026-10-31');
    assert.ok(!hoaExp.notes.includes('Posted'));

    // Check blank line at row 2 did not shift row 3!
    assert.equal(plan.updateOps[0].rowNumber, 3);
    const batchOps = JSON.parse(fs.readFileSync(batchPath, 'utf8'));
    assert.ok(batchOps.some(op => op.op === 'write' && op.range === 'Transactions!A3:L3'));
    // Check duplicate __meta_ingest_state__ at row 4 is cleared and overflow tombstone chunk at row 3 is updated
    assert.ok(batchOps.some(op => op.op === 'clear' && op.range === 'Notes!A4:B4'));
    assert.ok(batchOps.some(op => op.op === 'write' && op.range === 'Notes!A3:B3'));

    // Check active lease lock aborts --batch-out with exit code 3
    const futureIso = new Date(Date.now() + 60_000).toISOString();
    const lockedNotesPath = path.join(tmpDir, 'NotesLocked.json');
    fs.writeFileSync(
      lockedNotesPath,
      JSON.stringify([
        ['key', 'value'],
        [
          '__meta_ingest_lock__',
          JSON.stringify({
            text: JSON.stringify({ holder: 'web-ui', expiresAt: futureIso }),
          }),
        ],
      ]),
      'utf8'
    );
    const lockRun = spawnSync(
      'python3',
      [
        scriptPath,
        '--input',
        inputPath,
        '--transactions-tsv',
        tsvPath,
        '--notes-json',
        lockedNotesPath,
        '--batch-out',
        batchPath,
      ],
      { encoding: 'utf8' }
    );
    assert.equal(lockRun.status, 3);
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test('31. Word-boundary isolation ("spaghetti" vs "spa", "snail" vs "nail"), notes transfer isolation, and refund spendingBucket preservation', async () => {
  const { execFileSync } = await import('node:child_process');
  const os = await import('node:os');
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'nebula-wb-31-'));

  try {
    const projectId = 'test-wb-31';
    const adapter = createCleanAdapter(projectId);

    const batch = [
      {
        date: '2026-11-04',
        description: 'Old Spaghetti Factory',
        amount: 45.0,
        notes: 'Paid via bank transfer split with friend',
      },
      {
        date: '2026-11-04',
        description: 'Snail Mail Stamps',
        amount: 14.0,
      },
      {
        date: '2026-11-04',
        description: 'Olympus Day Spa',
        amount: 85.0,
      },
      {
        date: '2026-11-04',
        description: 'Luxe Nail Studio',
        amount: 55.0,
      },
      {
        date: '2026-11-04',
        description: 'Google One',
        amount: -16.77,
      },
    ];

    const tsRes = await ingestTransactions(
      {
        projectId,
        sourceId: 'gpay-plaid',
        triggerMode: 'automated',
        transactions: batch,
        options: { skipLlm: true },
      },
      adapter
    );

    const txs = tsRes.records.map(r => r.transactions[0]);
    // 1. "Old Spaghetti Factory" with "bank transfer" in notes MUST be expense (NOT transfer and NOT misc-salon!)
    assert.equal(txs[0].type, 'expense');
    assert.notEqual(txs[0].subCategory, 'misc-salon');
    // 2. "Snail Mail Stamps" MUST NOT match 'nail' -> misc-other (flagged), NOT misc-salon
    assert.equal(txs[1].category, 'misc');
    assert.equal(txs[1].subCategory, 'misc-other');
    // 3. "Olympus Day Spa" and "Luxe Nail Studio" DO match misc-salon cleanly
    assert.equal(txs[2].category, 'misc');
    assert.equal(txs[2].subCategory, 'misc-salon');
    assert.ok(!txs[2].labels.includes('needs-review'));
    assert.equal(txs[3].category, 'misc');
    assert.equal(txs[3].subCategory, 'misc-salon');
    assert.ok(!txs[3].labels.includes('needs-review'));
    // 4. Google One refund preserves spendingBucket ('fixed')
    assert.equal(txs[4].type, 'income');
    assert.ok(txs[4].labels.includes('refund'));
    assert.equal(txs[4].category, 'entertainment');
    assert.equal(txs[4].subCategory, 'entertainment-subs');
    assert.equal(txs[4].spendingBucket, 'fixed');

    // Verify Python wallet_reconcile.py parity on the same 5 rows
    const inputPath = path.join(tmpDir, 'wallet.json');
    fs.writeFileSync(
      inputPath,
      JSON.stringify([
        {
          date: '2026-11-04',
          description: 'Old Spaghetti Factory',
          amount: 45.0,
          status: 'Purchase',
          notes: 'Paid via bank transfer split with friend',
        },
        {
          date: '2026-11-04',
          description: 'Snail Mail Stamps',
          amount: 14.0,
          status: 'Purchase',
        },
        {
          date: '2026-11-04',
          description: 'Olympus Day Spa',
          amount: 85.0,
          status: 'Purchase',
        },
        {
          date: '2026-11-04',
          description: 'Luxe Nail Studio',
          amount: 55.0,
          status: 'Purchase',
        },
        {
          date: '2026-11-04',
          description: 'Google One',
          amount: -16.77,
          status: 'Refund',
        },
      ]),
      'utf8'
    );
    const scriptPath = path.join(
      repoRoot,
      '.agents/skills/expense-ingest/scripts/wallet_reconcile.py'
    );
    const pyPlan = JSON.parse(
      execFileSync(
        'python3',
        [
          scriptPath,
          '--input',
          inputPath,
          '--reference-date',
          '2026-11-06',
          '--lookback-days',
          '7',
        ],
        { encoding: 'utf8' }
      )
    );
    const pyTxs = pyPlan.insertedTransactions;
    assert.equal(pyTxs[0].type, 'expense');
    assert.notEqual(pyTxs[0].subCategory, 'misc-salon');
    assert.equal(pyTxs[1].subCategory, 'misc-other');
    assert.equal(pyTxs[2].subCategory, 'misc-salon');
    assert.equal(pyTxs[3].subCategory, 'misc-salon');
    assert.equal(pyTxs[4].type, 'income');
    assert.ok(pyTxs[4].labels.includes('refund'));
    assert.equal(pyTxs[4].spendingBucket, 'fixed');
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test('32. Transaction taxonomy, account userEdited protection, duplicate-verified dismissal, and cleanup_sheet_labels.py', async () => {
  const { execFileSync } = await import('node:child_process');
  const os = await import('node:os');
  const {
    resolveTransactionAccount,
    formatAccountDisplay,
    getCanonicalAccountKey,
    getVisibleUserTags,
    sanitizeUserTagsInput,
    isTransactionPending,
    getUserFacingNote,
    isDuplicateVerified,
    isTransactionNeedsReview,
  } = await import(
    pathToFileURL(path.join(repoRoot, 'src/utils/transactionTaxonomy.ts')).href
  );

  // 1. Account resolution & canonical display mapping
  assert.equal(
    formatAccountDisplay(resolveTransactionAccount({ meta: { account: 'amazon store card' } })),
    'Amazon Card'
  );
  assert.equal(
    getCanonicalAccountKey('amazon store card'),
    getCanonicalAccountKey('amazon-synchrony')
  );
  assert.equal(
    formatAccountDisplay(resolveTransactionAccount({ labels: ['priyanka chase', 'flexible'] })),
    'Priyanka Chase'
  );

  // 2. Visible user tags & sanitization
  assert.deepEqual(
    getVisibleUserTags({
      labels: ['bilt', 'flexible', 'imported', 'needs-review', 'refund', 'japan-trip', 'tax-2026'],
      meta: { account: 'bilt' },
    }),
    ['japan-trip', 'tax-2026']
  );
  assert.deepEqual(
    sanitizeUserTagsInput(['#Japan-Trip', 'fixed', 'bilt', 'imported', 'tax-2026'], 'bilt'),
    ['japan-trip', 'tax-2026']
  );

  // 3. Pending & boilerplate note extraction (settled note with "(was $50.00 Pending)" must NOT be pending)
  assert.equal(
    isTransactionPending({
      notes: 'Google Wallet (Plaid) • Bilt Palladium Card (7702) • Settled with $5.00 tip (was $50.00 Pending)',
      meta: { provisional: false },
    }),
    false
  );
  assert.equal(
    isTransactionPending({
      notes: 'Google Wallet (Plaid) • Bilt Palladium Card (7702) • Pending',
    }),
    true
  );
  assert.equal(
    getUserFacingNote({
      notes: 'Google Wallet (Plaid) • Bilt Palladium Card (7702) • Pending',
      meta: { account: 'bilt' },
    }),
    ''
  );
  assert.equal(
    getUserFacingNote({ notes: 'Imported via CSV' }),
    ''
  );
  assert.equal(
    getUserFacingNote({
      notes: 'Google Wallet (Plaid) • Bilt Palladium Card (7702) • Settled with $5.00 tip (was $50.00 Pending)',
      meta: { account: 'bilt' },
    }),
    'Settled with $5.00 tip (was $50.00 Pending)'
  );

  // 4. Duplicate dismissal records duplicate-verified and clears needs-review
  const dupTx = {
    id: 'dup-1',
    date: '2026-11-05',
    category: 'food',
    subCategory: null,
    amount: 14.5,
    type: 'expense',
    description: 'Starbucks',
    labels: [],
    hash: 'h-dup-1',
  };
  assert.equal(isTransactionNeedsReview(dupTx, new Set(['dup-1'])), true);
  const resolvedDup = resolveTransactionReview(dupTx, '2026-11-06T00:00:00Z', {
    clearDuplicate: true,
  });
  assert.equal(isDuplicateVerified(resolvedDup), true);
  assert.ok(resolvedDup.labels.includes('duplicate-verified'));
  assert.ok(resolvedDup.meta.review.reasons.includes('duplicate'));

  // 5. markUserEditedFields tracks account edits & preserves cleared account cleanly
  const oldTx = {
    ...dupTx,
    meta: { account: 'bilt', userEdited: [] },
  };
  const editedAcctMeta = markUserEditedFields(oldTx, {
    ...oldTx,
    meta: { account: 'priyanka chase' },
  });
  assert.equal(editedAcctMeta.account, 'priyanka chase');
  assert.ok(editedAcctMeta.userEdited.includes('account'));

  const clearedAcctMeta = markUserEditedFields(oldTx, {
    ...oldTx,
    meta: { account: undefined },
  });
  assert.equal('account' in clearedAcctMeta, false);
  assert.ok(clearedAcctMeta.userEdited.includes('account'));

  // 6. cleanup_sheet_labels.py promotes account & bucket before stripping redundant labels
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'nebula-cleanup-32-'));
  try {
    const sampleSheetPath = path.join(tmpDir, 'sheet.json');
    const batchOutPath = path.join(tmpDir, 'cleanup_batch.json');
    fs.writeFileSync(
      sampleSheetPath,
      JSON.stringify([
        [
          'id',
          'date',
          'category',
          'subCategory',
          'amount',
          'type',
          'description',
          'notes',
          'labels',
          'hash',
          'spendingBucket',
          'meta',
        ],
        [
          'r1',
          '2026-10-10',
          'food',
          'food-groceries',
          '42.50',
          'expense',
          'Trader Joes',
          'Imported via CSV',
          '["bilt","flexible","imported","japan-trip"]',
          'h1',
          '',
          '',
        ],
        [
          'r2',
          '2026-10-11',
          'entertainment',
          'entertainment-subs',
          '16.77',
          'income',
          'Google One',
          'Google Wallet (Plaid) • Bilt Palladium Card (7702)',
          '["refund","needs-review","non-monthly"]',
          'h2',
          '',
          '{}',
        ],
        [
          'r3',
          '2026-10-12',
          'food',
          'food-dine-in',
          '28.00',
          'expense',
          'Blue Bottle Coffee',
          'Google Wallet (Plaid) • Bilt Palladium Card (7702)',
          '["amazon card","expense"]',
          'h3',
          'flexible',
          '{"userEdited":["account"]}',
        ],
      ]),
      'utf8'
    );

    const cleanupScript = path.join(
      repoRoot,
      '.agents/skills/expense-ingest/scripts/cleanup_sheet_labels.py'
    );
    const out = JSON.parse(
      execFileSync(
        'python3',
        [cleanupScript, '--transactions-json', sampleSheetPath, '--batch-out', batchOutPath],
        { encoding: 'utf8' }
      )
    );
    assert.equal(out.summary.totalDataRows, 3);
    assert.equal(out.summary.rowsTouched, 3);
    assert.equal(out.summary.promotedBucketCounts.flexible, 1);
    assert.equal(out.summary.promotedBucketCounts['non-monthly'], 1);
    assert.equal(out.summary.promotedAccountCounts.bilt, 2);
    assert.deepEqual(out.sampleChanges[0].newLabels, ['japan-trip']);
    assert.equal(out.sampleChanges[0].newBucket, 'flexible');
    assert.equal(out.sampleChanges[0].newAccount, 'bilt');
    // Refund row promotes "non-monthly" bucket to Col K before stripping it from Col I
    assert.deepEqual(out.sampleChanges[1].newLabels, ['refund', 'needs-review']);
    assert.equal(out.sampleChanges[1].newBucket, 'non-monthly');
    assert.equal(out.sampleChanges[1].newAccount, 'bilt');
    // User-cleared account row ("account" in userEdited) must NOT re-populate meta.account
    assert.deepEqual(out.sampleChanges[2].newLabels, []);
    assert.equal(out.sampleChanges[2].newAccount, null);

    const batchOps = JSON.parse(fs.readFileSync(batchOutPath, 'utf8'));
    // Verify NO columns outside I, K, L are ever written!
    for (const op of batchOps) {
      assert.match(op.range, /^Transactions![IKL]\d+(?::[IKL]\d+)?$/);
    }
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test('34. Legacy needs-review resolution on category edit, cleared legacy account protection, and canonical sample data IDs', async () => {
  const { resolveTransactionAccount } = await import(
    pathToFileURL(path.join(repoRoot, 'src/utils/transactionTaxonomy.ts')).href
  );
  const { generateSampleData } = await import(
    pathToFileURL(path.join(repoRoot, 'src/utils/sampleDataGenerator.ts')).href
  );

  // 1. Legacy needs-review row (labels: ['refund', 'needs-review'], no meta.review) resolves on category edit
  const legacyReviewTx = {
    id: 'legacy-rev-1',
    date: '2026-10-15',
    category: 'misc',
    subCategory: null,
    amount: 24.99,
    type: 'income',
    spendingBucket: 'flexible',
    description: 'Merchant Refund',
    notes: '',
    labels: ['refund', 'needs-review'],
    hash: 'h_legacy_rev_1',
    meta: {},
  };
  const editedMeta = markUserEditedFields(
    legacyReviewTx,
    { ...legacyReviewTx, category: 'shopping', subCategory: 'shopping-amazon' },
    '2026-11-11T12:00:00.000Z'
  );
  assert.ok(editedMeta.review?.resolvedAt, 'legacy needs-review must receive resolvedAt on category edit');
  assert.ok(editedMeta.userEdited?.includes('category'));

  // 2. Clearing an account that lived in legacy labels records 'account' in userEdited and suppresses fallback
  const legacyAcctTx = {
    id: 'legacy-acc-1',
    date: '2026-10-16',
    category: 'food',
    subCategory: 'food-dine-in',
    amount: 32.0,
    type: 'expense',
    spendingBucket: 'flexible',
    description: 'Cafe',
    notes: 'Google Wallet (Plaid) • Card (8885)',
    labels: ['priyanka chase'],
    hash: 'h_legacy_acc_1',
  };
  const clearedAcctMeta = markUserEditedFields(
    legacyAcctTx,
    { ...legacyAcctTx, labels: [], meta: { account: undefined } },
    '2026-11-11T12:00:00.000Z'
  );
  assert.ok(clearedAcctMeta.userEdited?.includes('account'));
  assert.equal(clearedAcctMeta.account, undefined);
  assert.equal(
    resolveTransactionAccount({ ...legacyAcctTx, meta: clearedAcctMeta }),
    null,
    'resolveTransactionAccount must not resurrect legacy label account when userEdited includes account'
  );

  // 3. Sample data generator only emits canonical DEFAULT_CATEGORIES IDs
  const defaultCatIds = new Set(DEFAULT_CATEGORIES.map(c => c.id));
  const sample = await generateSampleData();
  assert.ok(sample.transactions.length > 0);
  for (const tx of sample.transactions) {
    assert.ok(
      defaultCatIds.has(tx.category),
      `Invalid sample category ID: ${tx.category}`
    );
    if (tx.subCategory) {
      assert.ok(
        defaultCatIds.has(tx.subCategory),
        `Invalid sample subCategory ID: ${tx.subCategory}`
      );
    }
  }
  for (const b of sample.budgets) {
    assert.ok(
      defaultCatIds.has(b.category),
      `Invalid sample budget category ID: ${b.category}`
    );
  }
});

