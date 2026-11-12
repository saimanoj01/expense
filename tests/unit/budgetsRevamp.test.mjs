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

const { DEFAULT_CATEGORIES, SEED_CATEGORIES, LocalStorageAdapter } = await import(
  pathToFileURL(path.join(repoRoot, 'src/services/storage.ts')).href
);
const {
  computeBucketBudgets,
  doesBudgetMatchCategory,
  getCategoryAliasOptions,
  getMonthPhase,
  resolveEffectiveCategoryBudget,
} = await import(pathToFileURL(path.join(repoRoot, 'src/utils/metrics.ts')).href);
const {
  cleanBudgetsForSave,
  computeBudgetDirtyState,
  computeBudgetReconciliation,
  computeCategoryBudgetStatus,
  computeDonutSegments,
  computeSpendingHistory,
  countActiveTransactionMonths,
  formatBudgetAmountCompact,
  formatBudgetPeriodTitle,
  sanitizeCategoryHexColor,
  sortBudgetCategories,
  toSoftBadgeBg,
} = await import(
  pathToFileURL(path.join(repoRoot, 'src/utils/budgetPlanning.ts')).href
);
const { parseLedgerUrlState } = await import(
  pathToFileURL(path.join(repoRoot, 'src/utils/ledgerUrlSync.ts')).href
);

test('BUG-BUD-01: computeSpendingHistory rolls sub-category spend into parent lastMonth & avg3mo, nets refunds, and ignores income-only months', () => {
  const txns = [
    // Aug 2026: Income only (must NOT dilute 3-mo expense average denominator!)
    {
      id: 'aug-inc',
      date: '2026-08-01',
      amount: 5000,
      type: 'income',
      category: 'income',
      description: 'Salary',
      notes: '',
      labels: [],
      hash: 'h1',
    },
    // Sep 2026: Groceries via sub-categories = $400
    {
      id: 'sep-1',
      date: '2026-09-10',
      amount: 250,
      type: 'expense',
      category: 'groceries',
      subCategory: 'groceries-costco',
      description: 'Costco Wholesale',
      notes: '',
      labels: [],
      hash: 'h2',
    },
    {
      id: 'sep-2',
      date: '2026-09-18',
      amount: 150,
      type: 'expense',
      category: 'groceries',
      subCategory: 'groceries-supermarket',
      description: 'Trader Joes',
      notes: '',
      labels: [],
      hash: 'h3',
    },
    // Oct 2026 (last month relative to 2026-11): Costco $360 - $60 refund = $300 + Direct parent $200 = $500
    {
      id: 'oct-1',
      date: '2026-10-04',
      amount: 360,
      type: 'expense',
      category: 'groceries',
      subCategory: 'groceries-costco',
      description: 'Costco Run',
      notes: '',
      labels: [],
      hash: 'h4',
    },
    {
      id: 'oct-2',
      date: '2026-10-07',
      amount: 60,
      type: 'income',
      category: 'groceries',
      subCategory: 'groceries-costco',
      description: 'Costco Return',
      notes: '',
      labels: ['refund'],
      hash: 'h5',
    },
    {
      id: 'oct-3',
      date: '2026-10-20',
      amount: 200,
      type: 'expense',
      category: 'groceries',
      description: 'Local Farmers Market',
      notes: '',
      labels: [],
      hash: 'h6',
    },
  ];

  const history = computeSpendingHistory(txns, DEFAULT_CATEGORIES, '2026-11');

  // Sub-categories carry their own historical spend
  assert.equal(history['groceries-costco'].lastMonth, 300);
  assert.equal(history['groceries-costco'].avg3mo, Math.round((250 + 300) / 2));

  // Parent 'groceries' rolls up Sep ($400) and Oct ($500) across 2 active expense months -> avg $450
  assert.equal(history.groceries.lastMonth, 500);
  assert.equal(history.groceries.avg3mo, 450);
  assert.equal(history.groceries.hasPriorData, true);
});

test('BUG-BUD-03: computeBudgetReconciliation separates Budgeted Spend from Unbudgeted Spend', () => {
  const summary = [
    { id: 'housing', name: 'Housing', emoji: '🏠', color: '#4DABF7', budget: 2400, spent: 2400, effectiveSpent: 2400, percent: 100, bucket: 'fixed' },
    { id: 'food', name: 'Food & Dining', emoji: '🍔', color: '#FF6B6B', budget: 890, spent: 780, effectiveSpent: 780, percent: 88, bucket: 'flexible' },
    { id: 'groceries', name: 'Groceries', emoji: '🛒', color: '#51CF66', budget: 1000, spent: 700, effectiveSpent: 700, percent: 70, bucket: 'flexible' },
    // Unbudgeted $640 Travel spend
    { id: 'travel', name: 'Travel', emoji: '✈️', color: '#38BDF8', budget: 0, spent: 640, effectiveSpent: 640, percent: 0, bucket: 'non-monthly' },
    // Non-budgetable Income excluded completely
    { id: 'income', name: 'Income', emoji: '💰', color: '#40C057', budget: 0, spent: 6500, effectiveSpent: 6500, percent: 0, isNonBudgetable: true },
  ];

  const rec = computeBudgetReconciliation(summary, 4520, '2026-11', 1);
  assert.equal(rec.totalBudget, 4290);
  assert.equal(rec.budgetedSpent, 3880);
  assert.equal(rec.unbudgetedSpent, 640);
  assert.equal(rec.unbudgetedCategoryCount, 1);
  assert.deepEqual(rec.unbudgetedCategoryIds, ['travel']);
  // Budgeted remaining stays calm +$410 (never falsely -$230!)
  assert.equal(rec.budgetedRemaining, 410);
  assert.equal(Math.round(rec.budgetedUtilizationPct), 90);
});

test('BUG-BUD-04 & G5: countActiveTransactionMonths, formatBudgetPeriodTitle, and All-Time monthly normalization', () => {
  const txns = [
    { id: '1', date: '2026-08-10', amount: 1000, type: 'expense', category: 'food', description: 'A', notes: '', labels: [], hash: '1' },
    { id: '2', date: '2026-09-12', amount: 1000, type: 'expense', category: 'food', description: 'B', notes: '', labels: [], hash: '2' },
    { id: '3', date: '2026-10-15', amount: 1000, type: 'expense', category: 'food', description: 'C', notes: '', labels: [], hash: '3' },
    { id: '4', date: '2026-11-03', amount: 1000, type: 'expense', category: 'food', description: 'D', notes: '', labels: [], hash: '4' },
    // Transfers in Dec must NOT count as active cash-flow month
    { id: '5', date: '2026-12-01', amount: 500, type: 'transfer', category: 'transfers', description: 'Xfer', notes: '', labels: [], hash: '5' },
  ];

  const activeMonths = countActiveTransactionMonths(txns);
  assert.equal(activeMonths, 4);

  const allTimeTitle = formatBudgetPeriodTitle('all', activeMonths);
  assert.equal(allTimeTitle.subtitle.includes('for all'), false);
  assert.match(allTimeTitle.subtitle, /across 4 active months/);

  const currPhase = getMonthPhase('2026-11', new Date(2026, 10, 12));
  const currTitle = formatBudgetPeriodTitle('2026-11', activeMonths, currPhase);
  assert.equal(currTitle.subtitle.includes('2026-11'), false);
  assert.match(currTitle.subtitle, /November 2026 · Day 12 of 30/);

  const pastPhase = getMonthPhase('2026-07', new Date(2026, 10, 12));
  const pastTitle = formatBudgetPeriodTitle('2026-07', activeMonths, pastPhase);
  assert.match(pastTitle.subtitle, /July 2026/);

  // All-Time reconciliation divides cumulative $4,000 by 4 active months = $1,000/mo against $1,200/mo target
  const allTimeSummary = [
    { id: 'food', name: 'Food', emoji: '🍔', color: '#FF6B6B', budget: 1200, spent: 1000, rawSpent: 4000, effectiveSpent: 1000, percent: 83, bucket: 'flexible' },
  ];
  const rec = computeBudgetReconciliation(allTimeSummary, 4000, 'all', activeMonths);
  assert.equal(rec.budgetedSpent, 1000);
  assert.equal(rec.budgetedRemaining, 200);
  assert.equal(Math.round(rec.budgetedUtilizationPct), 83);
});

test('BUG-BUD-05, G3 & G4: computeCategoryBudgetStatus Fixed Paid · On Plan, Variable Ahead of Pace, and $0.01 overrun precision', () => {
  const activeNov10 = getMonthPhase('2026-11', new Date(2026, 10, 10)); // Day 10 of 30 (33.3% elapsed)

  // 1. Fixed category at 100% ($2,400 / $2,400) -> 'Paid · On Plan', never 'Near Limit'
  const fixedPaid = computeCategoryBudgetStatus({
    spent: 2400,
    budget: 2400,
    bucket: 'fixed',
    phaseInfo: activeNov10,
  });
  assert.equal(fixedPaid.kind, 'paid-on-plan');
  assert.equal(fixedPaid.label, 'Paid · On Plan');
  assert.equal(fixedPaid.isOverspent, false);
  assert.equal(fixedPaid.paceTickPct, null);

  // 2. Variable category on Day 10 at 65% ($390 / $600 > 43.3%) -> 'Ahead of Pace' with paceTickPct
  const varAhead = computeCategoryBudgetStatus({
    spent: 390,
    budget: 600,
    bucket: 'flexible',
    phaseInfo: activeNov10,
  });
  assert.equal(varAhead.kind, 'ahead-of-pace');
  assert.equal(varAhead.label, 'Ahead of Pace');
  assert.equal(varAhead.tone, 'warning');
  assert.ok(varAhead.paceTickPct !== null && Math.abs(varAhead.paceTickPct - 33.333) < 0.5);

  // 3. Guardrail G4: Tiny Variable spend ($20 / $40 = 50% on Day 1) does NOT trigger Ahead of Pace noise
  const activeNov1 = getMonthPhase('2026-11', new Date(2026, 10, 1));
  const tinySpend = computeCategoryBudgetStatus({
    spent: 20,
    budget: 40,
    bucket: 'flexible',
    phaseInfo: activeNov1,
  });
  assert.equal(tinySpend.kind, 'on-track');

  // 4. Guardrail G3: $0.01 overrun ($50.01 vs $50) formats as 'Over by $0.01', never 'Over by $0'
  const pennyOver = computeCategoryBudgetStatus({
    spent: 50.01,
    budget: 50,
    bucket: 'flexible',
    phaseInfo: activeNov10,
  });
  assert.equal(pennyOver.isOverspent, true);
  assert.equal(pennyOver.label, 'Over by $0.01');
  assert.equal(formatBudgetAmountCompact(50.01), '$50.01');
  assert.equal(formatBudgetAmountCompact(2400), '$2,400');
});

test('BUG-BUD-06 & BUG-BUD-12: computeDonutSegments emits exact slice count, scopes to bucket tab, and sanitizes purple/invalid hexes', () => {
  const empty = computeDonutSegments([], 'all');
  assert.equal(empty.segments.length, 0);
  assert.equal(empty.totalPieExpense, 0);

  const items = [
    { id: 'housing', name: 'Housing', emoji: '🏠', color: '#4DABF7', budget: 2000, spent: 800, effectiveSpent: 800, percent: 40, bucket: 'fixed' },
    { id: 'food', name: 'Food', emoji: '🍔', color: '#BE4BDB', budget: 500, spent: 200, effectiveSpent: 200, percent: 40, bucket: 'flexible' },
    { id: 'income', name: 'Income', emoji: '💰', color: '#40C057', budget: 0, spent: 5000, effectiveSpent: 5000, percent: 0, isNonBudgetable: true },
  ];

  const allSlices = computeDonutSegments(items, 'all');
  assert.equal(allSlices.segments.length, 2);
  assert.equal(allSlices.totalPieExpense, 1000);
  // Purple #BE4BDB sanitized to teal #14B8A6
  assert.equal(allSlices.segments.find(s => s.category === 'food')?.color, '#14B8A6');

  const fixedSlices = computeDonutSegments(items, 'fixed');
  assert.equal(fixedSlices.segments.length, 1);
  assert.equal(fixedSlices.segments[0].category, 'housing');
});

test('BUG-BUD-07 & G2: resolveEffectiveCategoryBudget & computeBucketBudgets prevent amount:0 tombstone clobbering and support Rent/Housing alias', () => {
  const budgetsWithTombstone = [
    { category: 'food', amount: 0 }, // Legacy tombstone when parent input cleared!
    { category: 'food-dine-in', amount: 200 },
    { category: 'food-takeout', amount: 300 },
    { category: 'Rent', amount: 1800 }, // Alias for 'housing' in DEFAULT_CATEGORIES
  ];

  const foodRes = resolveEffectiveCategoryBudget(
    'food',
    budgetsWithTombstone,
    DEFAULT_CATEGORIES
  );
  assert.equal(foodRes.explicitBudget, 0);
  assert.equal(foodRes.subCategoryBudgetSum, 500);
  assert.equal(foodRes.effectiveBudget, 500);
  assert.equal(foodRes.isRolledUpFromSubs, true);

  const housingRes = resolveEffectiveCategoryBudget(
    'housing',
    budgetsWithTombstone,
    DEFAULT_CATEGORIES
  );
  assert.equal(housingRes.effectiveBudget, 1800);

  const aliasOpts = getCategoryAliasOptions(DEFAULT_CATEGORIES);
  assert.equal(
    doesBudgetMatchCategory('Rent', { id: 'housing', name: 'Housing' }, aliasOpts),
    true
  );

  // When sub-category sum ($500) exceeds an explicit parent target ($350), effectiveBudget elevates to $500
  const elevatedRes = resolveEffectiveCategoryBudget(
    'food',
    [
      { category: 'food', amount: 350 },
      { category: 'food-dine-in', amount: 200 },
      { category: 'food-takeout', amount: 300 },
    ],
    DEFAULT_CATEGORIES
  );
  assert.equal(elevatedRes.effectiveBudget, 500);
  assert.equal(elevatedRes.isRolledUpFromSubs, true);

  const bucketTotals = computeBucketBudgets(budgetsWithTombstone, DEFAULT_CATEGORIES);
  assert.equal(bucketTotals.fixedBudget, 1800);
  assert.equal(bucketTotals.variableBudget, 500);
  assert.equal(bucketTotals.totalBudget, 2300);
});

test('BUG-BUD-08: cleanBudgetsForSave strips tombstones/aliases and computeBudgetDirtyState tracks dirtyCount & errors', () => {
  const raw = [
    { category: 'food', amount: 0 },
    { category: 'Food & Dining', amount: 550 },
    { category: 'Rent', amount: 2200 },
    { category: 'income', amount: 9000 },
  ];
  const cleaned = cleanBudgetsForSave(raw, DEFAULT_CATEGORIES);
  assert.deepEqual(cleaned, [
    { category: 'food', amount: 550 },
    { category: 'housing', amount: 2200 },
  ]);

  const persisted = [{ category: 'food', amount: 500 }];
  const working = [
    { category: 'food', amount: 650 },
    { category: 'groceries', amount: 400 },
  ];
  const dirty = computeBudgetDirtyState(persisted, working, DEFAULT_CATEGORIES, {
    utilities: 'Budget must be positive',
  });
  assert.equal(dirty.isDirty, true);
  assert.equal(dirty.dirtyCount, 3);
  assert.equal(dirty.hasErrors, true);
  assert.equal(dirty.firstErrorCategoryId, 'utilities');
});

test('BUG-BUD-11: sortBudgetCategories ranks urgency tiers deterministically and stays stable against draft edits', () => {
  const phase = getMonthPhase('2026-11', new Date(2026, 10, 10));
  const items = [
    { id: 'misc', name: 'Miscellaneous', emoji: '📦', color: '#ADB5BD', budget: 0, spent: 0, effectiveSpent: 0, percent: 0, bucket: 'flexible' },
    { id: 'housing', name: 'Housing', emoji: '🏠', color: '#4DABF7', budget: 2400, spent: 2400, effectiveSpent: 2400, percent: 100, bucket: 'fixed' },
    { id: 'travel', name: 'Travel', emoji: '✈️', color: '#38BDF8', budget: 0, spent: 350, effectiveSpent: 350, percent: 0, bucket: 'non-monthly' },
    { id: 'shopping', name: 'Shopping', emoji: '🛍️', color: '#E64980', budget: 300, spent: 220, effectiveSpent: 220, percent: 73, bucket: 'flexible' },
    { id: 'food', name: 'Food', emoji: '🍔', color: '#FF6B6B', budget: 400, spent: 520, effectiveSpent: 520, percent: 130, bucket: 'flexible' },
    { id: 'income', name: 'Income', emoji: '💰', color: '#40C057', budget: 0, spent: 0, effectiveSpent: 0, percent: 0, isNonBudgetable: true },
  ];

  // Even if user edits food's working budget to $2,000 mid-typing, committedBudgetMap keeps food at $400 (Tier 1)
  const committedMap = new Map([
    ['misc', 0],
    ['housing', 2400],
    ['travel', 0],
    ['shopping', 300],
    ['food', 400],
  ]);

  const mutatedWorking = items.map(it =>
    it.id === 'food' ? { ...it, budget: 2000, percent: 26 } : it
  );
  const { budgetableItems, nonBudgetableItems } = sortBudgetCategories(
    mutatedWorking,
    committedMap,
    phase
  );

  assert.deepEqual(
    budgetableItems.map(i => i.id),
    ['food', 'shopping', 'travel', 'housing', 'misc']
  );
  assert.deepEqual(nonBudgetableItems.map(i => i.id), ['income']);
});

test('BUG-BUD-09, BUG-BUD-12 & ledgerUrlSync: zero purple hexes, valid badge rgba fallback, storage note lock enforcement, and ?category= alias', async () => {
  const allColors = [
    ...DEFAULT_CATEGORIES.map(c => c.color),
    ...Object.values(SEED_CATEGORIES)
      .flat()
      .map(c => c.color),
  ];
  for (const hex of allColors) {
    assert.notEqual(hex.toUpperCase(), '#BE4BDB');
    assert.notEqual(hex.toUpperCase(), '#845EF7');
  }

  assert.equal(sanitizeCategoryHexColor('not-a-hex'), '#38BDF8');
  assert.equal(toSoftBadgeBg('invalid-hex'), 'rgba(56, 189, 248, 0.16)');

  // Verify ?category= query param alias in ledgerUrlSync
  const parsed = parseLedgerUrlState('#/transactions?month=all&category=groceries');
  assert.equal(parsed.cat, 'groceries');

  // Verify LocalStorageAdapter blocks saveBudgetNote & deleteBudgetNote on locked months
  const store = new Map();
  globalThis.localStorage = {
    getItem: k => (store.has(k) ? store.get(k) : null),
    setItem: (k, v) => store.set(k, String(v)),
    removeItem: k => store.delete(k),
  };

  const adapter = new LocalStorageAdapter();
  await adapter.saveLock('proj-1', { month: '2026-05', locked: true });

  await assert.rejects(
    () =>
      adapter.saveBudgetNote('proj-1', '2026-05:__overall__', {
        text: 'Tamper attempt',
        updatedAt: '2026-06-01T00:00:00Z',
      }),
    /locked/i
  );

  // Unlocked month note succeeds
  await adapter.saveBudgetNote('proj-1', '2026-06:__overall__', {
    text: 'Open month note',
    updatedAt: '2026-06-02T00:00:00Z',
  });
  await adapter.saveLock('proj-1', { month: '2026-06', locked: true });

  await assert.rejects(
    () => adapter.deleteBudgetNote('proj-1', '2026-06:__overall__'),
    /locked/i
  );
});
