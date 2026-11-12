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

const { DEFAULT_CATEGORIES } = await import(
  pathToFileURL(path.join(repoRoot, 'src/services/storage.ts')).href
);
const { coerceAmount, computeLedgerSliceSummary } = await import(
  pathToFileURL(path.join(repoRoot, 'src/utils/metrics.ts')).href
);
const {
  getLockedMonthForDate,
  isTransactionMonthLocked,
  formatReviewBadgeLabel,
  getReviewDetailText,
} = await import(
  pathToFileURL(path.join(repoRoot, 'src/utils/transactionTaxonomy.ts')).href
);
const { deriveCategoryBucket } = await import(
  pathToFileURL(path.join(repoRoot, 'src/utils/categorizer.ts')).href
);
const {
  recordDeletionTombstones,
  removeDeletionTombstones,
  markUserEditedFields,
  resolveTransactionReview,
  lookupHistoryClassification,
} = await import(
  pathToFileURL(
    path.join(repoRoot, 'src/services/ingestion/transactionIngestService.ts')
  ).href
);
const { findSimilarTransactionsForSweep } = await import(
  pathToFileURL(path.join(repoRoot, 'src/utils/merchantSweep.ts')).href
);
const {
  parseLedgerUrlState,
  buildLedgerUrlHash,
  preserveLedgerParamsOnMonthSwitch,
} = await import(
  pathToFileURL(path.join(repoRoot, 'src/utils/ledgerUrlSync.ts')).href
);
const { buildTransactionsCsvExport } = await import(
  pathToFileURL(path.join(repoRoot, 'src/utils/csv.ts')).href
);

test('computeLedgerSliceSummary never clamps net-refund credit slices to $0.00', () => {
  const slice = [
    {
      id: 'exp-1',
      date: '2026-11-02',
      category: 'shopping',
      amount: 80,
      type: 'expense',
      description: 'Nordstrom Jacket',
      notes: '',
      labels: [],
      hash: 'h1',
    },
    {
      id: 'ref-1',
      date: '2026-11-05',
      category: 'shopping',
      amount: 200,
      type: 'income',
      description: 'Nordstrom Return',
      notes: '',
      labels: ['refund'],
      hash: 'h2',
    },
  ];

  const summary = computeLedgerSliceSummary(slice, 10, {
    isFiltered: true,
    selectedType: 'expense',
  });

  assert.equal(summary.grossExpenses, 80);
  assert.equal(summary.refundsTotal, 200);
  assert.equal(summary.unclampedNetOutflow, -120);
  assert.equal(summary.formattedText, '2 of 10 shown · +$120.00 net credit');
});

test('computeLedgerSliceSummary handles transfer-only, review, empty, and mixed cashflow slices', () => {
  const transfersOnly = [
    {
      id: 'tr-1',
      date: '2026-11-10',
      category: 'transfers',
      amount: '500.00',
      type: 'transfer',
      description: 'Chase Credit Card Payment',
      notes: '',
      labels: [],
      hash: 'ht1',
    },
  ];
  assert.equal(coerceAmount('500.00'), 500);
  assert.equal(
    computeLedgerSliceSummary(transfersOnly, 5, { isFiltered: true }).formattedText,
    '1 of 5 shown · ⇄ $500.00 transferred'
  );

  const reviewSummary = computeLedgerSliceSummary(transfersOnly, 5, {
    isFiltered: true,
    needsReviewOnly: true,
  });
  assert.equal(reviewSummary.formattedText, '1 needing review · $500.00 total');

  const emptyFiltered = computeLedgerSliceSummary([], 12, { isFiltered: true });
  assert.equal(emptyFiltered.formattedText, '0 of 12 shown');

  const emptyMonth = computeLedgerSliceSummary([], 0, { isFiltered: false });
  assert.equal(emptyMonth.formattedText, '0 transactions');
});

test('ledgerUrlSync parses, resets absent ghost filters, preserves category drilldown paths, and carries params on month switch', () => {
  const fullState = parseLedgerUrlState(
    '#/transactions?month=2026-11&bucket=variable&type=expense&cat=food&account=Priyanka%20Chase&tag=%23japan-trip&review=1&day=14&auto=1&pending=1&q=sushi&sort=amount-desc'
  );
  assert.equal(fullState.bucket, 'flexible');
  assert.equal(fullState.type, 'expense');
  assert.equal(fullState.cat, 'food');
  assert.equal(fullState.account, 'priyanka chase');
  assert.equal(fullState.tag, 'japan-trip');
  assert.equal(fullState.review, true);
  assert.equal(fullState.day, 14);
  assert.equal(fullState.auto, true);
  assert.equal(fullState.pending, true);
  assert.equal(fullState.q, 'sushi');
  assert.equal(fullState.sort, 'amount-desc');

  // Drilling into a clean category route resets all prior ghost filters to null/false
  const cleanCategoryState = parseLedgerUrlState(
    '#/month/2026-11/category/housing/transactions',
    { isCategoryTransactions: true, initialCategoryId: 'housing' }
  );
  assert.equal(cleanCategoryState.cat, 'housing');
  assert.equal(cleanCategoryState.bucket, null);
  assert.equal(cleanCategoryState.type, null);
  assert.equal(cleanCategoryState.account, null);
  assert.equal(cleanCategoryState.tag, null);
  assert.equal(cleanCategoryState.review, false);
  assert.equal(cleanCategoryState.q, '');

  // Searching inside Level 4 category drilldown keeps #/month/:m/category/:cat/transactions path
  assert.equal(
    buildLedgerUrlHash({
      month: '2026-11',
      isCategoryTransactions: true,
      initialCategoryId: 'housing',
      cat: 'housing',
      q: 'Lease',
      sort: 'date-desc',
    }),
    '#/month/2026-11/category/housing/transactions?q=Lease'
  );

  // Clearing category chip from Level 4 category drilldown yields exact #/transactions?month=2026-11
  assert.equal(
    buildLedgerUrlHash({
      month: '2026-11',
      isCategoryTransactions: true,
      initialCategoryId: 'housing',
      cat: null,
      sort: 'date-desc',
    }),
    '#/transactions?month=2026-11'
  );

  // MonthSwitcher preserves active ledger filters while dropping day-of-month
  assert.equal(
    preserveLedgerParamsOnMonthSwitch(
      '#/transactions?month=2026-11&bucket=fixed&account=bilt&day=15&q=rent',
      '2026-10'
    ),
    '#/transactions?month=2026-10&bucket=fixed&account=bilt&q=rent'
  );
});

test('findSimilarTransactionsForSweep matches same-merchant unlocked rows and blocks opaque marketplaces, locked months, and userEdited overrides', () => {
  const locks = [{ month: '2026-05', locked: true }];
  const editedChipotle = {
    id: 'c1',
    date: '2026-11-05',
    category: 'groceries',
    subCategory: null,
    amount: 16.5,
    type: 'expense',
    description: 'Chipotle Mexican Grill #104',
    notes: '',
    labels: [],
    hash: 'hc1',
  };
  const allTxs = [
    editedChipotle,
    {
      id: 'c2',
      date: '2026-11-09',
      category: 'food',
      subCategory: 'food-takeout',
      amount: 18.25,
      type: 'expense',
      description: 'TST* Chipotle Mexican Grill',
      notes: '',
      labels: [],
      hash: 'hc2',
    },
    {
      id: 'c_locked',
      date: '2026-05-10',
      category: 'food',
      subCategory: null,
      amount: 14.0,
      type: 'expense',
      description: 'Chipotle Mexican Grill',
      notes: '',
      labels: [],
      hash: 'hc3',
    },
    {
      id: 'c_user_override',
      date: '2026-11-11',
      category: 'entertainment',
      subCategory: null,
      amount: 120.0,
      type: 'expense',
      description: 'Chipotle Mexican Grill',
      notes: '',
      labels: [],
      hash: 'hc4',
      meta: { userEdited: ['category'] },
    },
  ];

  const sweep = findSimilarTransactionsForSweep(
    editedChipotle,
    'groceries',
    'groceries-supermarket',
    allTxs,
    locks
  );
  assert.ok(sweep);
  assert.deepEqual(sweep.matchingIds, ['c2']);

  // Opaque Amazon descriptor must NEVER trigger sweep
  const opaqueAmzn = {
    id: 'a1',
    date: '2026-11-09',
    category: 'shopping',
    subCategory: 'shopping-amazon',
    amount: 39.99,
    type: 'expense',
    description: 'AMZN Mktp US*11A',
    notes: '',
    labels: [],
    hash: 'ha1',
  };
  const otherAmzn = {
    ...opaqueAmzn,
    id: 'a2',
    category: 'misc',
    description: 'AMZN Mktp US*99Z',
  };
  assert.equal(
    findSimilarTransactionsForSweep(
      opaqueAmzn,
      'shopping',
      'shopping-amazon',
      [opaqueAmzn, otherAmzn],
      locks
    ),
    null
  );
});

test('recordDeletionTombstones + removeDeletionTombstones cleanly reverse tombstones on Undo', () => {
  const deletedTx = {
    id: 'tx_plaid_1',
    date: '2026-11-03',
    category: 'food',
    amount: 18.0,
    type: 'expense',
    description: 'Chipotle',
    notes: '',
    labels: [],
    hash: 'abcdef1234567890fedcba',
    meta: {
      externalIds: { 'bilt-plaid': 'plaid_ext_123#split-0' },
      aliasHashes: ['1111222233334444'],
    },
  };

  const initialState = {
    version: 1,
    tombstones: ['existing_tombstone_keep'],
    sources: {},
    recentRuns: [],
  };

  const afterDelete = recordDeletionTombstones([deletedTx], initialState);
  assert.ok(afterDelete.tombstones.includes('plaid_ext_123#split-0'));
  assert.ok(afterDelete.tombstones.includes('plaid_ext_123'));
  assert.ok(afterDelete.tombstones.includes('abcdef1234567890'));
  assert.ok(afterDelete.tombstones.includes('1111222233334444'));

  const addedTombstones = afterDelete.tombstones.filter(
    t => t !== 'existing_tombstone_keep'
  );
  const afterUndo = removeDeletionTombstones(addedTombstones, afterDelete);
  assert.deepEqual(afterUndo.tombstones, ['existing_tombstone_keep']);
});

test('markUserEditedFields preserves resolvedAt on tip-drift modal saves and omits autoDerivedBucket from userEdited', () => {
  const flaggedTipTx = {
    id: 'tx_tip',
    date: '2026-11-08',
    category: 'food',
    subCategory: 'food-dine-in',
    spendingBucket: 'flexible',
    amount: 58.0,
    type: 'expense',
    description: 'Osteria Mozza',
    notes: '',
    labels: ['needs-review'],
    hash: 'htip',
    meta: {
      categorizedBy: 'keyword',
      confidence: 0.85,
      review: {
        reason: 'tip-drift',
        reasons: ['tip-drift'],
        detail: 'Settled with $8.00 tip',
        flaggedAt: '2026-11-08T10:00:00.000Z',
      },
    },
  };

  const resolvedTx = resolveTransactionReview(
    flaggedTipTx,
    '2026-11-09T00:00:00.000Z'
  );
  const savedMeta = markUserEditedFields(
    flaggedTipTx,
    resolvedTx,
    '2026-11-09T00:00:00.000Z'
  );
  assert.equal(savedMeta.review?.resolvedAt, '2026-11-09T00:00:00.000Z');
  assert.equal(savedMeta.categorizedBy, 'user');

  // Auto-derived bucket propagation on category change must NOT lock spendingBucket as userEdited
  const reclassedCandidate = {
    ...flaggedTipTx,
    category: 'housing',
    subCategory: 'housing-mortgage',
    spendingBucket: 'fixed',
  };
  const autoBucketMeta = markUserEditedFields(
    flaggedTipTx,
    reclassedCandidate,
    '2026-11-09T00:00:00.000Z',
    { autoDerivedBucket: true }
  );
  assert.ok(autoBucketMeta.userEdited.includes('category'));
  assert.ok(!autoBucketMeta.userEdited.includes('spendingBucket'));
});

test('taxonomy helpers, deriveCategoryBucket, lookupHistoryClassification, and CSV export behave accurately', () => {
  const locks = [{ month: '2026-05', locked: true }];
  assert.equal(getLockedMonthForDate('2026-05-14', locks), '2026-05');
  assert.equal(isTransactionMonthLocked('2026-05-14', locks), true);
  assert.equal(isTransactionMonthLocked('2026-06-01', locks), false);

  assert.equal(formatReviewBadgeLabel({ labels: [] }, true), 'Duplicate?');
  assert.equal(
    formatReviewBadgeLabel(
      { meta: { review: { reason: 'tip-drift' } } },
      false
    ),
    'Needs Review · Tip adjusted'
  );
  assert.match(
    getReviewDetailText({ meta: { review: { reason: 'category' } } }, false),
    /Low-confidence/
  );

  assert.equal(
    deriveCategoryBucket('Delta Flight', 'travel', 'travel-flights', DEFAULT_CATEGORIES),
    'non-monthly'
  );
  assert.equal(
    deriveCategoryBucket('PG&E Bill', 'utilities', 'utilities-electric', DEFAULT_CATEGORIES),
    'fixed'
  );
  assert.equal(
    deriveCategoryBucket('Trader Joes', 'groceries', 'groceries-supermarket', DEFAULT_CATEGORIES),
    'flexible'
  );

  const hit = lookupHistoryClassification(
    'Blue Bottle Coffee',
    undefined,
    [
      {
        id: 'h1',
        date: '2026-10-10',
        category: 'food',
        subCategory: 'food-takeout',
        spendingBucket: 'flexible',
        amount: 6.5,
        type: 'expense',
        description: 'Blue Bottle Coffee',
        notes: '',
        labels: [],
        hash: 'hh1',
        meta: { categorizedBy: 'user', userEdited: ['category'] },
      },
    ],
    'expense'
  );
  assert.equal(hit?.category, 'food');
  assert.equal(hit?.subCategory, 'food-takeout');

  const csv = buildTransactionsCsvExport(
    [
      {
        id: 'csv1',
        date: '2026-11-05',
        category: 'food',
        subCategory: 'food-dine-in',
        spendingBucket: 'flexible',
        amount: 42.5,
        type: 'expense',
        description: '=SUM(A1:A2), Bistro',
        notes: 'Google Wallet (Plaid) • Team lunch',
        labels: ['work', 'flexible', 'bilt'],
        hash: 'hcsv',
        meta: { account: 'bilt' },
      },
    ],
    DEFAULT_CATEGORIES
  );
  assert.match(csv, /Date,Description,Category,Subcategory,Bucket,Type,Account,Tags,Notes,Amount/);
  assert.match(csv, /"'=SUM\(A1:A2\), Bistro"/);
  assert.match(csv, /"Bilt","work","Team lunch",-42\.50/);
});
