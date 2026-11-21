import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { registerHooks } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';

registerHooks({
  resolve(specifier, context, nextResolve) {
    if (
      (specifier.startsWith('./') || specifier.startsWith('../')) &&
      !/\.[a-z]+$/i.test(specifier) &&
      context.parentURL
    ) {
      const parentDir = path.dirname(fileURLToPath(context.parentURL));
      const tsCandidate = path.resolve(parentDir, `${specifier}.ts`);
      if (fs.existsSync(tsCandidate)) {
        return { url: pathToFileURL(tsCandidate).href, shortCircuit: true };
      }
      const idxCandidate = path.resolve(parentDir, specifier, 'index.ts');
      if (fs.existsSync(idxCandidate)) {
        return { url: pathToFileURL(idxCandidate).href, shortCircuit: true };
      }
    }
    return nextResolve(specifier, context);
  },
});

if (typeof globalThis.localStorage === 'undefined') {
  const store = new Map();
  globalThis.localStorage = {
    getItem: k => (store.has(k) ? store.get(k) : null),
    setItem: (k, v) => store.set(k, String(v)),
    removeItem: k => store.delete(k),
    clear: () => store.clear(),
  };
}

const { LocalStorageAdapter, GoogleSheetsAdapter } = await import(
  '../../src/services/storage.ts'
);
const { resolveEffectiveBudgetsForMonth } = await import(
  '../../src/utils/budgetPlanning.ts'
);
const {
  getEffectiveReviewReason,
  isLowRiskReviewItem,
  findMatchingDuplicateTransaction,
  isRecentlyIngested24h,
  isOrphanPendingTransaction,
} = await import('../../src/utils/transactionTaxonomy.ts');
const { resolveTransactionReview } = await import(
  '../../src/services/ingestion/transactionIngestService.ts'
);
const {
  buildWorkspaceSnapshot,
  parseAndValidateWorkspaceSnapshot,
  restoreWorkspaceSnapshot,
  clearWorkspaceData,
} = await import('../../src/utils/workspacePortability.ts');
const { classifyCsvRowTypeAndRefund } = await import('../../src/utils/csv.ts');

test('P2-1: LocalStorageAdapter persists lock-time budget snapshots without leaking into user notes', async () => {
  globalThis.localStorage.clear();
  const adapter = new LocalStorageAdapter();
  const proj = await adapter.createProject('Snapshot Test');

  await adapter.saveBudgetNote(proj.id, '2026-06:__overall__', {
    text: 'June review note',
    updatedAt: '2026-06-30T10:00:00.000Z',
  });
  await adapter.saveBudgetSnapshot(proj.id, '2026-06', [
    { category: 'groceries', amount: 650 },
    { category: 'food', amount: 300 },
  ]);

  // Snapshot is hidden from user-facing getBudgetNotes
  const notes = await adapter.getBudgetNotes(proj.id);
  assert.deepEqual(Object.keys(notes), ['2026-06:__overall__']);

  // Snapshot survives subsequent saveBudgetNotes replacement
  await adapter.saveBudgetNotes(proj.id, {
    '2026-07:__overall__': {
      text: 'July note',
      updatedAt: '2026-07-05T10:00:00.000Z',
    },
  });
  const snapshots = await adapter.getBudgetSnapshots(proj.id);
  assert.deepEqual(snapshots['2026-06'], [
    { category: 'groceries', amount: 650 },
    { category: 'food', amount: 300 },
  ]);

  await assert.rejects(
    () => adapter.saveBudgetSnapshot(proj.id, 'all', []),
    /Invalid snapshot month/
  );
});

test('P2-2: GoogleSheetsAdapter saves and loads lock-time budget snapshots via Notes!A:B', async () => {
  const originalFetch = globalThis.fetch;
  let storedNoteRows = [
    ['key', 'note'],
    [
      '2026-07:__overall__',
      JSON.stringify({ text: 'Keep me', updatedAt: '2026-07-01T00:00:00.000Z' }),
    ],
  ];

  globalThis.fetch = async (url, options = {}) => {
    const u = String(url);
    const method = (options.method || 'GET').toUpperCase();
    if (u.includes('drive/v3/files') && u.includes('fields=modifiedTime')) {
      return new Response(JSON.stringify({ modifiedTime: '2026-07-31T12:00:00.000Z' }), {
        status: 200,
      });
    }
    if (u.includes('drive/v3/files') && method === 'GET') {
      return new Response(
        JSON.stringify({
          files: [{ id: 'sheet-snap-1', name: 'ExpenseTracker_Snap' }],
        }),
        { status: 200 }
      );
    }
    if (u.includes('values:batchGet')) {
      return new Response(
        JSON.stringify({
          valueRanges: [
            { range: 'Transactions!A:L', values: [['id']] },
            { range: 'Categories!A:F', values: [['id', 'name', 'color', 'emoji', 'parentId', 'defaultBucket']] },
            { range: 'Budgets!A:B', values: [['category', 'amount'], ['groceries', '700']] },
            { range: 'Locks!A:C', values: [['month', 'locked', 'lockedAt']] },
            { range: 'Notes!A:B', values: storedNoteRows },
          ],
        }),
        { status: 200 }
      );
    }
    if (u.includes('values/Notes!A:B:clear') && method === 'POST') {
      return new Response(JSON.stringify({}), { status: 200 });
    }
    if (u.includes('values/Notes!') && method === 'PUT') {
      const parsed = JSON.parse(options.body);
      storedNoteRows = parsed.values;
      return new Response(JSON.stringify({ updatedRows: storedNoteRows.length }), {
        status: 200,
      });
    }
    return new Response(JSON.stringify({}), { status: 200 });
  };

  try {
    const adapter = new GoogleSheetsAdapter(() => 'fake-token');
    const projects = await adapter.getProjects();
    const pid = projects[0].id;

    await adapter.saveBudgetSnapshot(pid, '2026-07', [
      { category: 'groceries', amount: 700 },
      { category: 'housing', amount: 2400 },
    ]);

    // Verify snapshot is written under __meta_budget_snapshot_2026-07__ while preserving user notes
    const keys = storedNoteRows.slice(1).map(r => r[0]);
    assert.ok(keys.includes('2026-07:__overall__'));
    assert.ok(keys.includes('__meta_budget_snapshot_2026-07__'));

    // Re-read after invalidating cache
    adapter.invalidateCache(pid);
    const snapshots = await adapter.getBudgetSnapshots(pid);
    assert.deepEqual(snapshots['2026-07'], [
      { category: 'groceries', amount: 700 },
      { category: 'housing', amount: 2400 },
    ]);
    const userNotes = await adapter.getBudgetNotes(pid);
    assert.deepEqual(Object.keys(userNotes), ['2026-07:__overall__']);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('P2-3: resolveEffectiveBudgetsForMonth freezes locked months and leaves unlocked/all live', () => {
  const liveBudgets = [
    { category: 'groceries', amount: 900 },
    { category: 'food', amount: 450 },
  ];
  const snapshots = {
    '2026-06': [
      { category: 'groceries', amount: 600 },
      { category: 'food', amount: 250 },
    ],
  };

  // Locked month with snapshot uses frozen snapshot even after live budgets change
  assert.deepEqual(
    resolveEffectiveBudgetsForMonth(liveBudgets, snapshots, '2026-06', true),
    snapshots['2026-06']
  );

  // Unlocked month uses live persisted budgets even if an older snapshot exists
  assert.deepEqual(
    resolveEffectiveBudgetsForMonth(liveBudgets, snapshots, '2026-06', false),
    liveBudgets
  );

  // Locked month without a snapshot falls back gracefully to live budgets
  assert.deepEqual(
    resolveEffectiveBudgetsForMonth(liveBudgets, snapshots, '2026-05', true),
    liveBudgets
  );

  // All Time always uses live budgets
  assert.deepEqual(
    resolveEffectiveBudgetsForMonth(liveBudgets, snapshots, 'all', true),
    liveBudgets
  );
});

test('P2-4: Morning triage helpers distinguish low-risk vs high-risk (duplicate/voided) review items', () => {
  const dupIds = new Set(['tx-dup-collision']);

  const catReview = {
    id: 'tx-cat',
    labels: ['needs-review'],
    meta: { review: { reason: 'category' } },
  };
  const tipReview = {
    id: 'tx-tip',
    labels: ['needs-review'],
    meta: { review: { reason: 'tip-drift' } },
  };
  const amtReview = {
    id: 'tx-amt',
    labels: ['needs-review'],
    meta: { review: { reason: 'amount-mismatch' } },
  };
  const legacyReview = {
    id: 'tx-legacy',
    labels: ['Needs-Review'],
  };
  const voidedReview = {
    id: 'tx-void',
    labels: ['needs-review'],
    meta: { review: { reason: 'voided' } },
  };
  const dupMetaReview = {
    id: 'tx-dup-meta',
    labels: ['needs-review'],
    meta: { review: { reason: 'category', reasons: ['category', 'duplicate'] } },
  };
  const dupCollision = {
    id: 'tx-dup-collision',
    labels: [],
  };
  const cleanRow = {
    id: 'tx-clean',
    labels: [],
  };

  assert.equal(getEffectiveReviewReason(dupMetaReview, false), 'duplicate');
  assert.equal(getEffectiveReviewReason(voidedReview, false), 'voided');
  assert.equal(getEffectiveReviewReason(catReview, false), 'category');

  assert.equal(isLowRiskReviewItem(catReview, dupIds), true);
  assert.equal(isLowRiskReviewItem(tipReview, dupIds), true);
  assert.equal(isLowRiskReviewItem(amtReview, dupIds), true);
  assert.equal(isLowRiskReviewItem(legacyReview, dupIds), true);

  assert.equal(isLowRiskReviewItem(voidedReview, dupIds), false);
  assert.equal(isLowRiskReviewItem(dupMetaReview, dupIds), false);
  assert.equal(isLowRiskReviewItem(dupCollision, dupIds), false);
  assert.equal(isLowRiskReviewItem(cleanRow, dupIds), false);
});

test('P2-5: findMatchingDuplicateTransaction locates exact-hash and fuzzy sibling records without self-matching', () => {
  const original = {
    id: 'tx-1',
    date: '2026-07-10',
    description: 'Whole Foods Market',
    amount: 84.5,
    type: 'expense',
    category: 'groceries',
    notes: '',
    labels: [],
    hash: 'abcdef1234567890aaaa',
  };
  const exactHashDup = {
    ...original,
    id: 'tx-2',
  };
  const fuzzyNearDup = {
    id: 'tx-3',
    date: '2026-07-11',
    description: 'Whole Foods Market #102',
    amount: 84.5,
    type: 'expense',
    category: 'groceries',
    notes: '',
    labels: [],
    hash: '9999999999999999bbbb',
  };
  const unrelated = {
    id: 'tx-4',
    date: '2026-07-10',
    description: 'Whole Foods Market',
    amount: 84.5,
    type: 'income',
    category: 'income',
    notes: '',
    labels: [],
    hash: '1111111111111111cccc',
  };

  assert.equal(
    findMatchingDuplicateTransaction(exactHashDup, [original, exactHashDup, unrelated])?.id,
    'tx-1'
  );
  assert.equal(
    findMatchingDuplicateTransaction(fuzzyNearDup, [original, fuzzyNearDup, unrelated])?.id,
    'tx-1'
  );
  assert.equal(
    findMatchingDuplicateTransaction(original, [original, unrelated]),
    null
  );
});

test('P2-6: isRecentlyIngested24h checks meta.ingestedAt within rolling 24h window', () => {
  const nowMs = Date.parse('2026-07-20T15:00:00.000Z');
  assert.equal(
    isRecentlyIngested24h({ meta: { ingestedAt: '2026-07-20T07:00:00.000Z' } }, nowMs),
    true
  );
  assert.equal(
    isRecentlyIngested24h({ meta: { ingestedAt: '2026-07-19T14:59:00.000Z' } }, nowMs),
    false
  );
  assert.equal(isRecentlyIngested24h({ meta: {} }, nowMs), false);
});

test('P2-7: CSV sign convention (card vs checking) and refund classification work accurately', () => {
  // Card CSV (default): positive = expense, negative = transfer (or refund if refund keyword)
  assert.deepEqual(
    classifyCsvRowTypeAndRefund({
      description: 'Trader Joes',
      amountCell: '62.40',
      hasTypeCol: false,
      signConvention: 'card',
    }),
    { amount: 62.4, type: 'expense', isRefund: false }
  );
  assert.deepEqual(
    classifyCsvRowTypeAndRefund({
      description: 'Online Payment Thank You',
      amountCell: '-500.00',
      hasTypeCol: false,
      signConvention: 'card',
    }),
    { amount: 500, type: 'transfer', isRefund: false }
  );
  assert.deepEqual(
    classifyCsvRowTypeAndRefund({
      description: 'AMZN Mktp US Refund',
      amountCell: '-29.99',
      hasTypeCol: false,
      signConvention: 'card',
    }),
    { amount: 29.99, type: 'income', isRefund: true }
  );

  // Checking CSV: negative = expense (unless transfer), positive = income (or refund)
  assert.deepEqual(
    classifyCsvRowTypeAndRefund({
      description: 'Whole Foods Market',
      amountCell: '-95.10',
      hasTypeCol: false,
      signConvention: 'checking',
    }),
    { amount: 95.1, type: 'expense', isRefund: false }
  );
  assert.deepEqual(
    classifyCsvRowTypeAndRefund({
      description: 'Employer Direct Deposit',
      amountCell: '3200.00',
      hasTypeCol: false,
      signConvention: 'checking',
    }),
    { amount: 3200, type: 'income', isRefund: false }
  );
  assert.deepEqual(
    classifyCsvRowTypeAndRefund({
      description: 'Credit Card Payment',
      amountCell: '-1200.00',
      hasTypeCol: false,
      signConvention: 'checking',
    }),
    { amount: 1200, type: 'transfer', isRefund: false }
  );
  assert.deepEqual(
    classifyCsvRowTypeAndRefund({
      description: 'Target Return Credit',
      amountCell: '42.00',
      hasTypeCol: false,
      signConvention: 'checking',
    }),
    { amount: 42, type: 'income', isRefund: true }
  );
  // Explicit Type: "Return" marks row as refund even when description lacks refund keywords
  assert.deepEqual(
    classifyCsvRowTypeAndRefund({
      description: 'Target Store #1234',
      amountCell: '-18.50',
      typeCell: 'Return',
      hasTypeCol: true,
      signConvention: 'card',
    }),
    { amount: 18.5, type: 'income', isRefund: true }
  );
});

test('P2-8: resolveTransactionReview strips mixed-case Needs-Review without falsely adding duplicate-verified', () => {
  const legacyMixed = {
    id: 'tx-mixed',
    date: '2026-07-10',
    category: 'food',
    amount: 22,
    type: 'expense',
    description: 'Local Cafe',
    notes: '',
    labels: ['Needs-Review', 'coffee'],
    hash: 'h1',
  };
  const resolved = resolveTransactionReview(legacyMixed, '2026-07-12T00:00:00.000Z');
  assert.deepEqual(resolved.labels, ['coffee']);
  assert.equal(resolved.meta?.review?.reason, 'category');
  assert.equal(resolved.meta?.review?.resolvedAt, '2026-07-12T00:00:00.000Z');
});

test('P2-9: workspacePortability round-trips lock-time budgetSnapshots and clears them on clearWorkspaceData', async () => {
  globalThis.localStorage.clear();
  const adapter = new LocalStorageAdapter();
  const proj = await adapter.createProject('Portability Snap');

  await adapter.saveBudgets(proj.id, [{ category: 'groceries', amount: 800 }]);
  await adapter.saveBudgetSnapshot(proj.id, '2026-06', [{ category: 'groceries', amount: 550 }]);
  await adapter.saveLock(proj.id, { month: '2026-06', locked: true });

  const exported = await buildWorkspaceSnapshot({ project: proj, storageAdapter: adapter });
  assert.deepEqual(exported.budgetSnapshots, {
    '2026-06': [{ category: 'groceries', amount: 550 }],
  });

  // Clearing workspace removes stale snapshots too
  await clearWorkspaceData(adapter, proj.id);
  assert.deepEqual(await adapter.getBudgetSnapshots(proj.id), {});

  // Restoring exported JSON recovers lock-time budget snapshots
  const parsed = parseAndValidateWorkspaceSnapshot(JSON.stringify(exported), proj);
  assert.equal(parsed.ok, true);
  if (parsed.ok) {
    await restoreWorkspaceSnapshot(adapter, proj.id, parsed);
    assert.deepEqual(await adapter.getBudgetSnapshots(proj.id), {
      '2026-06': [{ category: 'groceries', amount: 550 }],
    });
  }
});

test('P2-10: isOrphanPendingTransaction enforces exact >7 calendar days and getEffectiveReviewReason combines reason + reasons', () => {
  const today = '2026-07-20';
  const pending7d = { id: 'p7', date: '2026-07-13', meta: { provisional: true } };
  const pending8d = { id: 'p8', date: '2026-07-12', meta: { provisional: true } };
  const settled10d = { id: 's10', date: '2026-07-10', meta: { provisional: false } };

  assert.equal(isOrphanPendingTransaction(pending7d, today), false);
  assert.equal(isOrphanPendingTransaction(pending8d, today), true);
  assert.equal(isOrphanPendingTransaction(settled10d, today), false);

  const mixedReason = {
    id: 'm1',
    meta: { review: { reason: 'duplicate', reasons: ['category'] } },
  };
  assert.equal(getEffectiveReviewReason(mixedReason, false), 'duplicate');
});

