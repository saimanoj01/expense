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

const { DEFAULT_CATEGORIES, SEED_CATEGORIES, SEED_BUDGETS } = await import(
  pathToFileURL(path.join(repoRoot, 'src/services/storage.ts')).href
);
const {
  computeBucketBudgets,
  computeMonthMetrics,
  computePriorComparisonWindow,
  computeTrailing12NonMonthlyAvg,
  pickDefaultLandingMonth,
  getMonthPhase,
  computeSafeToSpendRunway,
} = await import(pathToFileURL(path.join(repoRoot, 'src/utils/metrics.ts')).href);
const { delta } = await import(
  pathToFileURL(path.join(repoRoot, 'src/utils/delta.ts')).href
);
const { generateInsights } = await import(
  pathToFileURL(path.join(repoRoot, 'src/utils/insights.ts')).href
);
const { canonicalizeCategory, humanizeCategorySlug, rankCategoryWatchlist } =
  await import(
    pathToFileURL(path.join(repoRoot, 'src/utils/overviewCategories.ts')).href
  );
const { computeSpendTimelineModel } = await import(
  pathToFileURL(path.join(repoRoot, 'src/utils/overviewTimeline.ts')).href
);
const { formatSignedCurrency } = await import(
  pathToFileURL(path.join(repoRoot, 'src/utils/formatters.ts')).href
);

test('BUG-01: computeBucketBudgets excludes Fixed and Non-monthly categories from variableBudget', () => {
  const cats = SEED_CATEGORIES['personal-finances'];
  const budgets = [
    ...SEED_BUDGETS['personal-finances'],
    { category: 'travel', amount: 300 },
    { category: 'income', amount: 9999 },
  ];

  const result = computeBucketBudgets(budgets, cats);
  // rent ($1,200) + utilities ($200) = $1,400 Fixed
  assert.equal(result.fixedBudget, 1400);
  // travel ($300) = $300 Non-monthly
  assert.equal(result.nonMonthlyBudget, 300);
  // food ($500) + transport ($150) + entertainment ($150) + healthcare ($100) + misc ($50) = $950 Variable
  assert.equal(result.variableBudget, 950);
  assert.equal(result.totalBudget, 2650);
});

test('BUG-02: delta() formats signed dollar swings accurately for saved transitions across zero and deficits', () => {
  // Deficit -> Deeper deficit (-$500 -> -$2,126) => ↓ −$1,626 vs Aug (negative)
  const d1 = delta(-2126, -500, 'saved', '2026-08');
  assert.equal(d1.text, '↓ −$1,626 vs Aug');
  assert.equal(d1.tone, 'negative');

  // Deficit -> Surplus (-$2,126 -> +$2,549) => ↑ +$4,675 vs Sep (positive)
  const d2 = delta(2549, -2126, 'saved', '2026-09');
  assert.equal(d2.text, '↑ +$4,675 vs Sep');
  assert.equal(d2.tone, 'positive');

  // Zero -> Deficit ($0 -> -$1,500) => ↓ −$1,500 vs Oct (negative)
  const d3 = delta(-1500, 0, 'saved', '2026-10');
  assert.equal(d3.text, '↓ −$1,500 vs Oct');
  assert.equal(d3.tone, 'negative');

  // Surplus -> Surplus (+$1,000 -> +$1,200) => ↑ 20% vs Jun (positive)
  const d4 = delta(1200, 1000, 'saved', '2026-06');
  assert.equal(d4.text, '↑ 20% vs Jun');
  assert.equal(d4.tone, 'positive');

  // Preserves custom MTD label when passed
  const d5 = delta(2400, 2000, 'expense', 'Oct 1–11');
  assert.equal(d5.text, '↑ 20% vs Oct 1–11');
  assert.equal(d5.tone, 'negative');

  // Near-zero positive prior savings (+$45 -> +$2,900, >200%) formats as signed dollar swing instead of ↑ 6344% (R2-MATH-01)
  const d6 = delta(2900, 45, 'saved', 'Oct 1–11');
  assert.equal(d6.text, '↑ +$2,855 vs Oct 1–11');
  assert.equal(d6.tone, 'positive');
});

test('BUG-08: computeMonthMetrics with { maxDay } slices same-day MTD without UTC shift', () => {
  const txns = [
    { id: '1', date: '2026-10-01', amount: 5000, type: 'income', category: 'income', description: 'Paycheck 1', notes: '', labels: [], hash: 'h1' },
    { id: '2', date: '2026-10-11', amount: 300, type: 'expense', category: 'food', spendingBucket: 'flexible', description: 'Groceries', notes: '', labels: [], hash: 'h2' },
    { id: '3', date: '2026-10-15', amount: 5000, type: 'income', category: 'income', description: 'Paycheck 2', notes: '', labels: [], hash: 'h3' },
    { id: '4', date: '2026-10-25', amount: 900, type: 'expense', category: 'food', spendingBucket: 'flexible', description: 'Dining late month', notes: '', labels: [], hash: 'h4' },
  ];

  const mtd11 = computeMonthMetrics(txns, '2026-10', DEFAULT_CATEGORIES, { maxDay: 11 });
  assert.equal(mtd11.income, 5000);
  assert.equal(mtd11.flexible, 300);
  assert.equal(mtd11.savings, 4700);

  const full = computeMonthMetrics(txns, '2026-10', DEFAULT_CATEGORIES);
  assert.equal(full.income, 10000);
  assert.equal(full.flexible, 1200);
});

test('BUG-04: computeTrailing12NonMonthlyAvg nets refunds and bypasses /12 on all-time mode', () => {
  const txns = [
    { id: '1', date: '2026-11-05', amount: 1500, type: 'expense', category: 'travel', spendingBucket: 'non-monthly', description: 'Flight', notes: '', labels: [], hash: 'h1' },
    { id: '2', date: '2026-11-08', amount: 300, type: 'income', category: 'travel', spendingBucket: 'non-monthly', description: 'Airline refund', notes: '', labels: ['refund'], hash: 'h2' },
  ];

  // Net non-monthly in 12-month window = $1,200 -> / 12 = $100
  const avgNov = computeTrailing12NonMonthlyAvg(txns, '2026-11', DEFAULT_CATEGORIES);
  assert.equal(avgNov, 100);

  // All-time mode bypasses / 12 -> $1,200
  const allTime = computeTrailing12NonMonthlyAvg(txns, 'all', DEFAULT_CATEGORIES);
  assert.equal(allTime, 1200);
});

test('BUG-12: pickDefaultLandingMonth ignores solitary future-dated transaction when current or past months exist', () => {
  assert.equal(
    pickDefaultLandingMonth(['2026-10', '2026-11', '2027-02'], '2026-11'),
    '2026-11'
  );
  assert.equal(
    pickDefaultLandingMonth(['2026-06', '2026-07', '2027-03'], '2026-11'),
    '2026-07'
  );
  // Only falls back to future month if 100% of data is future-dated
  assert.equal(
    pickDefaultLandingMonth(['2027-02', '2027-03'], '2026-11'),
    '2027-03'
  );
});

test('BUG-01, BUG-03, BUG-07, BUG-09: generateInsights nets refunds, canonicalizes categories, and uses pro-rata pace on active month vs final verdict on past month', () => {
  const budgets = [
    { category: 'rent', amount: 2000 }, // Fixed (must NOT inflate variableBudget!)
    { category: 'food', amount: 900 },  // Variable ($900 total variable target)
  ];

  const txns = [
    // Prior month Oct 2026: Food = $300 using mixed casing/name
    { id: 'p1', date: '2026-10-05', amount: 300, type: 'expense', category: 'Food & Dining', spendingBucket: 'flexible', description: 'Oct Food', notes: '', labels: [], hash: 'hp1' },
    // Nov 2026: Rent $2,000 + Shopping $500 + Shopping Refund $480 (net $20 -> MUST NOT spike!) + Food $150
    { id: 'c1', date: '2026-11-01', amount: 2000, type: 'expense', category: 'housing', spendingBucket: 'fixed', description: 'Nov Rent', notes: '', labels: [], hash: 'hc1' },
    { id: 'c2', date: '2026-11-04', amount: 500, type: 'expense', category: 'shopping', spendingBucket: 'flexible', description: 'Winter Coat', notes: '', labels: [], hash: 'hc2' },
    { id: 'c3', date: '2026-11-06', amount: 480, type: 'income', category: 'shopping', spendingBucket: 'flexible', description: 'Coat Return Refund', notes: '', labels: ['refund'], hash: 'hc3' },
    { id: 'c4', date: '2026-11-09', amount: 150, type: 'expense', category: 'food', spendingBucket: 'flexible', description: 'Trader Joes', notes: '', labels: [], hash: 'hc4' },
  ];

  // Active month: Nov 10, 2026 (10/30 of $900 = $300 pro-rata; net variable spent = $20 + $150 = $170 -> $130 under pace!)
  const activeInsights = generateInsights(
    txns,
    '2026-11',
    DEFAULT_CATEGORIES,
    budgets,
    { referenceDate: new Date(2026, 10, 10) }
  );

  // Refunded coat must NOT trigger cat-spike-shopping
  assert.equal(activeInsights.some(i => i.id.includes('shopping')), false);
  // Active month must NOT say "You finished Variable"
  assert.equal(activeInsights.some(i => i.text.includes('You finished')), false);
  const paceItem = activeInsights.find(i => i.id === 'variable-pace');
  assert.ok(paceItem);
  assert.match(paceItem.text, /Variable is tracking \$130 under pace/);

  // Past month view: viewing 2026-11 from Dec 5, 2026 -> closed verdict ($900 - $170 = $730 under budget)
  const pastInsights = generateInsights(
    txns,
    '2026-11',
    DEFAULT_CATEGORIES,
    budgets,
    { referenceDate: new Date(2026, 11, 5) }
  );
  const pastPace = pastInsights.find(i => i.id === 'variable-pace');
  assert.ok(pastPace);
  assert.equal(pastPace.text, 'You finished Variable $730 under budget.');
});

test('overviewCategories: canonicalizeCategory, humanizeCategorySlug, and rankCategoryWatchlist urgency tiers', () => {
  assert.equal(humanizeCategorySlug('unknown-vendor_fee'), 'Unknown Vendor Fee');
  assert.equal(canonicalizeCategory('Food & Dining', DEFAULT_CATEGORIES).id, 'food');
  assert.equal(canonicalizeCategory('groceries-costco', DEFAULT_CATEGORIES).id, 'groceries');

  const phase = getMonthPhase('2026-11', new Date(2026, 10, 10)); // Day 10 of 30 (33.3% elapsed)
  const summary = [
    { id: 'housing', name: 'Housing', emoji: '🏠', color: '#4DABF7', budget: 2400, spent: 2400, percent: 100, bucket: 'fixed' },
    { id: 'food', name: 'Food', emoji: '🍔', color: '#FF6B6B', budget: 400, spent: 480, percent: 120, bucket: 'flexible' }, // Tier 1: Over budget by $80!
    { id: 'shopping', name: 'Shopping', emoji: '🛍️', color: '#E64980', budget: 300, spent: 210, percent: 70, bucket: 'flexible' }, // Tier 2: 70% > 43.3% ahead of pace!
    { id: 'utilities', name: 'Utilities', emoji: '⚡', color: '#FCC419', budget: 0, spent: 180, percent: 0, bucket: 'fixed' }, // Tier 3: Unbudgeted spend
    { id: 'income', name: 'Income', emoji: '💰', color: '#40C057', budget: 0, spent: 5000, percent: 0, bucket: 'flexible', isNonBudgetable: true },
  ];

  const ranked = rankCategoryWatchlist(summary, phase, 4);
  assert.equal(ranked.length, 4);
  assert.equal(ranked[0].id, 'food');       // Tier 1: Over budget first!
  assert.equal(ranked[0].urgencyTier, 1);
  assert.equal(ranked[1].id, 'housing');    // Tier 2: 100% > 43.3%
  assert.equal(ranked[2].id, 'shopping');   // Tier 2: 70% > 43.3%
  assert.equal(ranked[3].id, 'utilities');  // Tier 3: $180 active spend
});

test('BUG-10: computeSpendTimelineModel handles All | Variable toggle, future empty cutoffIndex=0, Day-31 prior retention, and All-Time monthly trajectory', () => {
  const txns = [
    // Oct 2026 (31 days): Day 1 Rent $2,000 + Day 31 Shopping $400
    { id: 'o1', date: '2026-10-01', amount: 2000, type: 'expense', category: 'housing', spendingBucket: 'fixed', description: 'Oct Rent', notes: '', labels: [], hash: 'ho1' },
    { id: 'o2', date: '2026-10-31', amount: 400, type: 'expense', category: 'shopping', spendingBucket: 'flexible', description: 'Oct 31 Spend', notes: '', labels: [], hash: 'ho2' },
    // Nov 2026 (30 days): Day 1 Rent $2,000 + Day 8 Food $150
    { id: 'n1', date: '2026-11-01', amount: 2000, type: 'expense', category: 'housing', spendingBucket: 'fixed', description: 'Nov Rent', notes: '', labels: [], hash: 'hn1' },
    { id: 'n2', date: '2026-11-08', amount: 150, type: 'expense', category: 'food', spendingBucket: 'flexible', description: 'Nov Food', notes: '', labels: [], hash: 'hn2' },
  ];

  // 1. Nov 2026 (30 days) retains Oct Day 31 ($2,400) in priorCum!
  const novAll = computeSpendTimelineModel({
    allTransactions: txns,
    selectedMonth: '2026-11',
    priorMonthKey: '2026-10',
    categories: DEFAULT_CATEGORIES,
    mode: 'all',
    totalBudget: 3000,
    variableBudget: 800,
    referenceDate: new Date(2026, 10, 11),
  });
  assert.equal(novAll.priorDaysInMonth, 31);
  assert.equal(novAll.priorCum[30], 2400);
  assert.equal(novAll.cutoffIndex, 11);

  // 2. Variable mode strips Day-1 $2,000 Fixed rent from both curves
  const novVar = computeSpendTimelineModel({
    allTransactions: txns,
    selectedMonth: '2026-11',
    priorMonthKey: '2026-10',
    categories: DEFAULT_CATEGORIES,
    mode: 'variable',
    totalBudget: 3000,
    variableBudget: 800,
    referenceDate: new Date(2026, 10, 11),
  });
  assert.equal(novVar.displayedTotal, 150);
  assert.equal(novVar.targetCeiling, 800);
  assert.equal(novVar.priorCum[30], 400);

  // 3. Empty future month has cutoffIndex = 0 and hasCurrentActivity = false
  const decEmpty = computeSpendTimelineModel({
    allTransactions: txns,
    selectedMonth: '2026-12',
    priorMonthKey: '2026-11',
    categories: DEFAULT_CATEGORIES,
    referenceDate: new Date(2026, 10, 11),
  });
  assert.equal(decEmpty.cutoffIndex, 0);
  assert.equal(decEmpty.hasCurrentActivity, false);

  // 4. All-time mode builds monthly trajectory points
  const allTime = computeSpendTimelineModel({
    allTransactions: txns,
    availableMonths: ['2026-10', '2026-11'],
    selectedMonth: 'all',
    categories: DEFAULT_CATEGORIES,
    referenceDate: new Date(2026, 10, 11),
  });
  assert.equal(allTime.isAllTime, true);
  assert.equal(allTime.monthPoints.length, 2);
  assert.equal(allTime.monthPoints[0].monthKey, '2026-10');
  assert.equal(allTime.monthPoints[0].monthlySpent, 2400);
  assert.equal(allTime.monthPoints[1].monthKey, '2026-11');
  assert.equal(allTime.monthPoints[1].monthlySpent, 2150);
});

test('computeSafeToSpendRunway and formatSignedCurrency handle active, past, future, and negative states', () => {
  assert.equal(formatSignedCurrency(5000), '$5,000.00');
  assert.equal(formatSignedCurrency(-500), '-$500.00');
  assert.equal(formatSignedCurrency(-0.001), '$0.00');

  const currentPhase = getMonthPhase('2026-11', new Date(2026, 10, 11)); // 20 days remaining inclusive
  const activeRunway = computeSafeToSpendRunway({
    selectedMonth: '2026-11',
    phaseInfo: currentPhase,
    totalIncome: 6000,
    totalExpenses: 2800,
    flexibleExpenses: 400,
    flexNumber: 3600,
    savingsAmount: 3200,
    variableBudget: 1000,
  });
  assert.equal(activeRunway.visible, true);
  assert.equal(activeRunway.headline, '$600 left');
  assert.match(activeRunway.subline, /\$30\/day · 20d left/);

  const futurePhase = getMonthPhase('2026-12', new Date(2026, 10, 11));
  const futureRunway = computeSafeToSpendRunway({
    selectedMonth: '2026-12',
    phaseInfo: futurePhase,
    totalIncome: 0,
    totalExpenses: 0,
    flexibleExpenses: 0,
    flexNumber: 0,
    savingsAmount: 0,
    variableBudget: 1000,
  });
  assert.equal(futureRunway.visible, true);
  assert.equal(futureRunway.headline, '$1,000 planned');

  // Empty past/current month ($0 income, $0 expenses) hides runway even when variableBudget > 0 (QA-BUG-03)
  const pastPhase = getMonthPhase('2026-06', new Date(2026, 10, 11));
  const emptyPastRunway = computeSafeToSpendRunway({
    selectedMonth: '2026-06',
    phaseInfo: pastPhase,
    totalIncome: 0,
    totalExpenses: 0,
    flexibleExpenses: 0,
    flexNumber: 0,
    savingsAmount: 0,
    variableBudget: 900,
  });
  assert.equal(emptyPastRunway.visible, false);
});

test('QA-BUG-02, QA-BUG-03, QA-BUG-06: computePriorComparisonWindow handles short closed labels, maxTxnDay MTD cutoff, Day-30 full comparison, and empty/future suppression', () => {
  const sampleTxns = [
    { id: 'sep-1', date: '2026-09-10', amount: 4000, type: 'income', category: 'income' },
    { id: 'oct-1', date: '2026-10-05', amount: 5000, type: 'income', category: 'income' },
    { id: 'nov-1', date: '2026-11-20', amount: 1800, type: 'expense', category: 'housing' },
  ];

  // 1. Closed past month (Oct vs Sep): label is 'Sep' (never '2026-09'), full month
  const closedOct = computePriorComparisonWindow(
    sampleTxns,
    '2026-10',
    '2026-09',
    new Date(2026, 10, 11)
  );
  assert.equal(closedOct.hasPriorMonthData, true);
  assert.equal(closedOct.useMtdSlice, false);
  assert.equal(closedOct.compMaxDay, undefined);
  assert.equal(closedOct.label, 'Sep');

  // 2. Active month with txn dated after today (Nov 20 when today is Nov 11): cutoffDay = 20 -> 'Oct 1–20'
  const activeNov = computePriorComparisonWindow(
    sampleTxns,
    '2026-11',
    '2026-10',
    new Date(2026, 10, 11)
  );
  assert.equal(activeNov.useMtdSlice, true);
  assert.equal(activeNov.compMaxDay, 20);
  assert.equal(activeNov.label, 'Oct 1–20');

  // 3. Final day of 30-day active month (Nov 30 vs 31-day Oct): useMtdSlice = false so Oct 31 is not dropped
  const finalDayNov = computePriorComparisonWindow(
    sampleTxns,
    '2026-11',
    '2026-10',
    new Date(2026, 10, 30)
  );
  assert.equal(finalDayNov.useMtdSlice, false);
  assert.equal(finalDayNov.compMaxDay, undefined);
  assert.equal(finalDayNov.label, 'Oct');

  // 4. Empty past month (Aug) & future month (Dec): suppress prior comparison
  const emptyAug = computePriorComparisonWindow(
    sampleTxns,
    '2026-08',
    '2026-07',
    new Date(2026, 10, 11)
  );
  assert.equal(emptyAug.hasPriorMonthData, false);
  assert.equal(emptyAug.hasSelectedActivity, false);

  const futureDec = computePriorComparisonWindow(
    sampleTxns,
    '2026-12',
    '2026-11',
    new Date(2026, 10, 11)
  );
  assert.equal(futureDec.hasPriorMonthData, false);
});

