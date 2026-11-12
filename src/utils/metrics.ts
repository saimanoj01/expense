import type { Transaction, Category, Budget, SpendingBucket } from '../services/storage';
import { bucketOf, suggestSpendingBucket } from './categorizer';
import { formatCurrency, formatMoney } from './formatters';

export interface MonthMetrics {
  income: number;
  fixed: number;
  flexible: number;
  nonMonthly: number;
  expenses: number;
  savings: number;
  savingsRate: number;
  flexNumber: number;
  transfers: number;
}

export interface ComputeMonthMetricsOptions {
  /** Inclusive day-of-month ceiling (1..31) for same-day MTD comparisons; ignored when month === 'all'. */
  maxDay?: number;
}

export type MonthPhase = 'current' | 'past' | 'future' | 'all';

export interface MonthPhaseInfo {
  phase: MonthPhase;
  currentLocalMonth: string;
  today: number;
  daysInMonth: number;
  daysElapsed: number;
  daysLeftExclusive: number;
  daysRemainingInclusive: number;
}

export interface BucketBudgets {
  fixedBudget: number;
  variableBudget: number;
  nonMonthlyBudget: number;
  totalBudget: number;
}

export interface SafeToSpendRunway {
  visible: boolean;
  mode: 'variable-budget' | 'flex-pool' | 'planned' | 'all-time' | 'none';
  eyebrow: string;
  headline: string;
  subline: string;
  isNegative: boolean;
  utilizationPct: number;
  paceTickPct: number | null;
  targetHref: string;
}

export interface PriorComparisonWindow {
  hasPriorMonthData: boolean;
  hasSelectedActivity: boolean;
  useMtdSlice: boolean;
  compMaxDay: number | undefined;
  priorDaysCount: number;
  label: string | null;
}

const NON_BUDGETABLE_CATEGORY_KEYS = new Set<string>([
  'income',
  'transfer',
  'transfers',
  'transfers-bank',
  'transfers-cc',
  'salary',
  'income-salary',
  'income-freelance',
  'income-investment',
]);

export function isNonBudgetableCategory(catIdOrName?: string): boolean {
  if (!catIdOrName) return false;
  return NON_BUDGETABLE_CATEGORY_KEYS.has(catIdOrName.trim().toLowerCase());
}

export function deriveCategoryBucket(catIdOrName: string, catObj?: Category): SpendingBucket {
  if (catObj?.defaultBucket) {
    if (catObj.defaultBucket === 'fixed') return 'fixed';
    if (catObj.defaultBucket === 'non-monthly') return 'non-monthly';
    return 'flexible';
  }
  const lower = (catIdOrName || '').trim().toLowerCase();
  if (
    lower === 'housing' ||
    lower === 'rent' ||
    lower === 'utilities' ||
    lower === 'child-care' ||
    lower.startsWith('housing-') ||
    lower.startsWith('utilities-')
  ) {
    return 'fixed';
  }
  if (
    lower === 'travel' ||
    lower === 'insurance' ||
    lower === 'taxes' ||
    lower.startsWith('travel-')
  ) {
    return 'non-monthly';
  }
  return suggestSpendingBucket('', catIdOrName);
}

/**
 * Computes deduplicated bucket budget targets (parent vs sub-category rollup),
 * ensuring Fixed and Non-monthly budgets never leak into Variable (BUG-01).
 */
export function computeBucketBudgets(
  budgets: Budget[],
  categories: Category[] = []
): BucketBudgets {
  let fixedBudget = 0;
  let variableBudget = 0;
  let nonMonthlyBudget = 0;

  const parentCats = [...categories.filter(c => !c.parentId)];
  const existingKeys = new Set(
    parentCats.flatMap(c => [c.id.toLowerCase(), c.name.toLowerCase()])
  );
  const subCatKeys = new Set(
    categories
      .filter(c => Boolean(c.parentId))
      .flatMap(c => [c.id.toLowerCase(), c.name.toLowerCase()])
  );
  if (existingKeys.has('food & dining')) {
    existingKeys.add('food');
  }

  for (const b of budgets) {
    const catKey = (b.category || '').trim().toLowerCase();
    if (b.category && !existingKeys.has(catKey) && !subCatKeys.has(catKey)) {
      parentCats.push({
        id: b.category,
        name: b.category,
        emoji: '🏷️',
        color: '#0B79A8',
      });
      existingKeys.add(catKey);
    }
  }

  const addToBucket = (bucket: SpendingBucket, amt: number) => {
    if (amt <= 0) return;
    if (bucket === 'fixed') fixedBudget += amt;
    else if (bucket === 'non-monthly') nonMonthlyBudget += amt;
    else variableBudget += amt;
  };

  for (const pCat of parentCats) {
    if (isNonBudgetableCategory(pCat.id) || isNonBudgetableCategory(pCat.name)) {
      continue;
    }
    const subCats = categories.filter(c => c.parentId === pCat.id);
    const parentBObj = budgets.find(
      b =>
        b.category &&
        (b.category === pCat.id ||
          b.category.toLowerCase() === pCat.id.toLowerCase() ||
          b.category === pCat.name ||
          b.category.toLowerCase() === pCat.name.toLowerCase() ||
          (pCat.id === 'food' && b.category.toLowerCase() === 'food'))
    );

    if (parentBObj) {
      const amt = Number(parentBObj.amount) || 0;
      addToBucket(deriveCategoryBucket(pCat.id || pCat.name, pCat), amt);
    } else {
      for (const sCat of subCats) {
        if (isNonBudgetableCategory(sCat.id) || isNonBudgetableCategory(sCat.name)) {
          continue;
        }
        const subBObj = budgets.find(
          b =>
            b.category &&
            (b.category === sCat.id ||
              b.category.toLowerCase() === sCat.id.toLowerCase() ||
              b.category === sCat.name ||
              b.category.toLowerCase() === sCat.name.toLowerCase())
        );
        const subAmt = Number(subBObj?.amount) || 0;
        addToBucket(deriveCategoryBucket(sCat.id || sCat.name, sCat), subAmt);
      }
    }
  }

  return {
    fixedBudget,
    variableBudget,
    nonMonthlyBudget,
    totalBudget: fixedBudget + variableBudget + nonMonthlyBudget,
  };
}

/**
 * Returns true when an income transaction is actually a refund or reimbursement
 * that should offset category spending rather than inflate monthly income (§3.11).
 */
export function isRefundTransaction(t: {
  type?: string;
  category?: string;
  labels?: string[];
}): boolean {
  if (t.type !== 'income') return false;
  const catLower = (t.category || '').trim().toLowerCase();
  if (catLower === 'refund' || catLower === 'reimbursement') return true;
  if (Array.isArray(t.labels)) {
    const lowerLabels = t.labels.map(l => String(l).trim().toLowerCase());
    if (lowerLabels.includes('refund') || lowerLabels.includes('reimbursement')) {
      return true;
    }
  }
  return false;
}

/**
 * Pure function to compute monthly cash-basis financial metrics (§3.2, §3.11, §3.12),
 * with optional timezone-safe same-day MTD filtering via `options.maxDay` (BUG-08).
 */
export function computeMonthMetrics(
  transactions: Transaction[],
  month: string,
  categories?: Category[] | Record<string, string>,
  options?: ComputeMonthMetricsOptions
): MonthMetrics {
  let income = 0;
  let fixed = 0;
  let flexible = 0;
  let nonMonthly = 0;
  let transfers = 0;

  const maxDay = options?.maxDay;

  for (const t of transactions) {
    const matchMonth = month === 'all' || (t.date && t.date.startsWith(month));
    if (!matchMonth) continue;

    if (maxDay !== undefined && month !== 'all' && t.date && t.date.length >= 10) {
      const dayNum = parseInt(t.date.slice(8, 10), 10);
      if (!isNaN(dayNum) && dayNum > maxDay) {
        continue;
      }
    }

    const amt =
      typeof t.amount === 'number'
        ? t.amount
        : parseFloat(String(t.amount || 0)) || 0;

    if (t.type === 'transfer') {
      transfers += amt;
      continue;
    }

    if (t.type === 'income') {
      if (isRefundTransaction(t)) {
        const b = bucketOf(t, categories);
        if (b === 'fixed') fixed -= amt;
        else if (b === 'non-monthly') nonMonthly -= amt;
        else flexible -= amt;
      } else {
        income += amt;
      }
    } else if (t.type === 'expense') {
      const b = bucketOf(t, categories);
      if (b === 'fixed') fixed += amt;
      else if (b === 'non-monthly') nonMonthly += amt;
      else flexible += amt;
    }
  }

  fixed = Math.max(0, fixed);
  flexible = Math.max(0, flexible);
  nonMonthly = Math.max(0, nonMonthly);

  const expenses = fixed + flexible + nonMonthly;
  const savings = income - expenses;
  const savingsRate = income > 0 ? (savings / income) * 100 : expenses > 0 ? -100 : 0;
  const flexNumber = income - fixed - nonMonthly;

  return {
    income,
    fixed,
    flexible,
    nonMonthly,
    expenses,
    savings,
    savingsRate,
    flexNumber,
    transfers,
  };
}

export function getLocalTodayDate(referenceDate: Date = new Date()): string {
  const y = referenceDate.getFullYear();
  const m = String(referenceDate.getMonth() + 1).padStart(2, '0');
  const d = String(referenceDate.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export function getMonthPhase(
  selectedMonth: string,
  referenceDate: Date = new Date()
): MonthPhaseInfo {
  const currentLocalMonth = `${referenceDate.getFullYear()}-${String(
    referenceDate.getMonth() + 1
  ).padStart(2, '0')}`;
  const today = referenceDate.getDate();

  if (!selectedMonth || selectedMonth === 'all' || !/^\d{4}-\d{2}$/.test(selectedMonth)) {
    return {
      phase: 'all',
      currentLocalMonth,
      today,
      daysInMonth: 30,
      daysElapsed: 30,
      daysLeftExclusive: 0,
      daysRemainingInclusive: 0,
    };
  }

  const y = parseInt(selectedMonth.slice(0, 4), 10);
  const m = parseInt(selectedMonth.slice(5, 7), 10);
  const daysInMonth = !isNaN(y) && !isNaN(m) ? new Date(y, m, 0).getDate() : 30;

  if (selectedMonth === currentLocalMonth) {
    const clampedToday = Math.min(daysInMonth, Math.max(1, today));
    return {
      phase: 'current',
      currentLocalMonth,
      today: clampedToday,
      daysInMonth,
      daysElapsed: clampedToday,
      daysLeftExclusive: Math.max(0, daysInMonth - clampedToday),
      daysRemainingInclusive: Math.max(1, daysInMonth - clampedToday + 1),
    };
  }

  if (selectedMonth < currentLocalMonth) {
    return {
      phase: 'past',
      currentLocalMonth,
      today,
      daysInMonth,
      daysElapsed: daysInMonth,
      daysLeftExclusive: 0,
      daysRemainingInclusive: 0,
    };
  }

  return {
    phase: 'future',
    currentLocalMonth,
    today,
    daysInMonth,
    daysElapsed: 0,
    daysLeftExclusive: 0,
    daysRemainingInclusive: 0,
  };
}

/**
 * Computes annualized trailing 12-month non-monthly average net of refunds,
 * bypassing division by 12 when `monthKey === 'all'` (BUG-04).
 */
export function computeTrailing12NonMonthlyAvg(
  transactions: Transaction[],
  monthKey: string,
  categories?: Category[] | Record<string, string>
): number {
  if (!monthKey || monthKey === 'all' || !/^\d{4}-\d{2}$/.test(monthKey)) {
    return computeMonthMetrics(transactions, monthKey || 'all', categories).nonMonthly;
  }

  const y = parseInt(monthKey.slice(0, 4), 10);
  const m = parseInt(monthKey.slice(5, 7), 10);
  const byMonth: Record<string, number> = {};

  for (let i = 0; i < 12; i++) {
    const d = new Date(Date.UTC(y, m - 1 - i, 1));
    const key = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
    byMonth[key] = 0;
  }

  for (const t of transactions) {
    if (!t.date || t.date.length < 7 || t.type === 'transfer') continue;
    const mKey = t.date.slice(0, 7);
    if (!Object.prototype.hasOwnProperty.call(byMonth, mKey)) continue;

    const amt =
      typeof t.amount === 'number'
        ? t.amount
        : parseFloat(String(t.amount || 0)) || 0;

    if (t.type === 'expense' && bucketOf(t, categories) === 'non-monthly') {
      byMonth[mKey] += amt;
    } else if (isRefundTransaction(t) && bucketOf(t, categories) === 'non-monthly') {
      byMonth[mKey] -= amt;
    }
  }

  const totalNet = Object.values(byMonth).reduce((sum, net) => sum + Math.max(0, net), 0);
  return totalNet / 12;
}

/**
 * Selects the default landing month without letting a solitary future-dated transaction
 * hijack '/' away from current/historical activity (BUG-12).
 */
export function pickDefaultLandingMonth(
  months: string[],
  currentLocalMonth: string
): string {
  const valid = Array.from(
    new Set(months.filter(m => typeof m === 'string' && /^\d{4}-\d{2}$/.test(m)))
  ).sort();

  if (valid.length === 0) {
    return currentLocalMonth;
  }
  if (valid.includes(currentLocalMonth)) {
    return currentLocalMonth;
  }
  const pastOrCurrent = valid.filter(m => m <= currentLocalMonth);
  if (pastOrCurrent.length > 0) {
    return pastOrCurrent[pastOrCurrent.length - 1];
  }
  return valid[valid.length - 1];
}

function formatShortMonthFromIso(monthKey: string): string {
  if (!/^\d{4}-\d{2}$/.test(monthKey)) return monthKey;
  const [yStr, mStr] = monthKey.split('-');
  const d = new Date(Date.UTC(parseInt(yStr, 10), parseInt(mStr, 10) - 1, 1));
  return d.toLocaleDateString('en-US', { month: 'short', timeZone: 'UTC' });
}

/**
 * Computes a unified Month-over-Month comparison window across OverviewHero,
 * BucketStats, and Level2BucketView:
 * - Suppresses comparison when selectedMonth has 0 recorded activity or is a future month (QA-BUG-03).
 * - Uses cutoffDay = min(daysInMonth, max(today, maxSelectedTxnDay)) on active months (QA-BUG-06 / Reviewer #2).
 * - Formats closed-month labels as short month names ('Sep', never raw '2026-09', QA-BUG-02).
 */
export function computePriorComparisonWindow(
  transactions: Transaction[],
  selectedMonth: string,
  priorMonthKey: string | null | undefined,
  referenceDate: Date = new Date()
): PriorComparisonWindow {
  if (
    !selectedMonth ||
    selectedMonth === 'all' ||
    !/^\d{4}-\d{2}$/.test(selectedMonth)
  ) {
    return {
      hasPriorMonthData: false,
      hasSelectedActivity: transactions.some(t => t.type !== 'transfer'),
      useMtdSlice: false,
      compMaxDay: undefined,
      priorDaysCount: 30,
      label: null,
    };
  }

  const phaseInfo = getMonthPhase(selectedMonth, referenceDate);

  let hasSelectedActivity = false;
  let maxSelectedTxnDay = 0;
  let hasPriorTxns = false;

  for (const t of transactions) {
    if (t.type === 'transfer' || !t.date) continue;
    if (t.date.startsWith(selectedMonth)) {
      hasSelectedActivity = true;
      if (t.date.length >= 10) {
        const d = parseInt(t.date.slice(8, 10), 10);
        if (!isNaN(d)) {
          maxSelectedTxnDay = Math.max(
            maxSelectedTxnDay,
            Math.min(phaseInfo.daysInMonth, Math.max(1, d))
          );
        }
      }
    } else if (priorMonthKey && t.date.startsWith(priorMonthKey)) {
      hasPriorTxns = true;
    }
  }

  const priorDaysCount =
    priorMonthKey && /^\d{4}-\d{2}$/.test(priorMonthKey)
      ? new Date(
          parseInt(priorMonthKey.slice(0, 4), 10),
          parseInt(priorMonthKey.slice(5, 7), 10),
          0
        ).getDate()
      : 30;

  if (!priorMonthKey || !hasPriorTxns || !hasSelectedActivity || phaseInfo.phase === 'future') {
    return {
      hasPriorMonthData: false,
      hasSelectedActivity,
      useMtdSlice: false,
      compMaxDay: undefined,
      priorDaysCount,
      label: null,
    };
  }

  const cutoffDay = Math.min(
    phaseInfo.daysInMonth,
    Math.max(phaseInfo.today, maxSelectedTxnDay)
  );
  const useMtdSlice = phaseInfo.phase === 'current' && cutoffDay < phaseInfo.daysInMonth;
  const compMaxDay = useMtdSlice ? Math.min(cutoffDay, priorDaysCount) : undefined;
  const shortPrior = formatShortMonthFromIso(priorMonthKey);
  const label =
    useMtdSlice && compMaxDay !== undefined
      ? `${shortPrior} 1–${compMaxDay}`
      : shortPrior;

  return {
    hasPriorMonthData: true,
    hasSelectedActivity,
    useMtdSlice,
    compMaxDay,
    priorDaysCount,
    label,
  };
}

export function computeSafeToSpendRunway(params: {
  selectedMonth: string;
  phaseInfo: MonthPhaseInfo;
  totalIncome: number;
  totalExpenses: number;
  flexibleExpenses: number;
  flexNumber: number;
  savingsAmount: number;
  variableBudget: number;
  activeMonthsCount?: number;
}): SafeToSpendRunway {
  const {
    selectedMonth,
    phaseInfo,
    totalIncome,
    totalExpenses,
    flexibleExpenses,
    flexNumber,
    savingsAmount,
    variableBudget,
    activeMonthsCount = 0,
  } = params;

  const hidden: SafeToSpendRunway = {
    visible: false,
    mode: 'none',
    eyebrow: '',
    headline: '',
    subline: '',
    isNegative: false,
    utilizationPct: 0,
    paceTickPct: null,
    targetHref: `#/month/${selectedMonth}/bucket/variable`,
  };

  if (selectedMonth === 'all') {
    if (activeMonthsCount > 0 && (totalIncome > 0 || totalExpenses > 0)) {
      const avgSaved = savingsAmount / activeMonthsCount;
      const isNeg = avgSaved < 0;
      return {
        visible: true,
        mode: 'all-time',
        eyebrow: 'Monthly average',
        headline: `${isNeg ? 'Avg deficit ' : 'Avg saved '}${formatMoney(Math.abs(avgSaved))}/mo`,
        subline: `Across ${activeMonthsCount} active month${activeMonthsCount === 1 ? '' : 's'}`,
        isNegative: isNeg,
        utilizationPct: 0,
        paceTickPct: null,
        targetHref: '#/trends?month=all',
      };
    }
    return hidden;
  }

  if (phaseInfo.phase === 'future') {
    if (variableBudget > 0 && flexibleExpenses === 0) {
      return {
        visible: true,
        mode: 'planned',
        eyebrow: 'Variable target',
        headline: `${formatMoney(variableBudget)} planned`,
        subline: 'Upcoming month Variable target',
        isNegative: false,
        utilizationPct: 0,
        paceTickPct: null,
        targetHref: `#/month/${selectedMonth}/bucket/variable`,
      };
    }
    if (variableBudget > 0 && flexibleExpenses > 0) {
      const remaining = variableBudget - flexibleExpenses;
      const isNeg = remaining < 0;
      return {
        visible: true,
        mode: 'variable-budget',
        eyebrow: 'Scheduled Variable',
        headline: isNeg
          ? `${formatMoney(Math.abs(remaining))} over`
          : `${formatMoney(remaining)} left`,
        subline: `of ${formatMoney(variableBudget)} Variable target`,
        isNegative: isNeg,
        utilizationPct: Math.min(100, Math.max(0, (flexibleExpenses / variableBudget) * 100)),
        paceTickPct: null,
        targetHref: `#/month/${selectedMonth}/bucket/variable`,
      };
    }
    return hidden;
  }

  // Empty past/current months ($0 income & $0 expenses) must hide runway rather than falsely celebrate under-budget (QA-BUG-03)
  if (totalIncome === 0 && totalExpenses === 0) {
    return hidden;
  }

  if (variableBudget > 0) {
    const remaining = variableBudget - flexibleExpenses;
    const isNeg = remaining < 0;
    const utilizationPct = Math.min(100, Math.max(0, (flexibleExpenses / variableBudget) * 100));

    if (phaseInfo.phase === 'current') {
      const paceTickPct = Math.min(
        98,
        Math.max(2, (phaseInfo.today / phaseInfo.daysInMonth) * 100)
      );
      if (!isNeg) {
        const perDay = remaining / phaseInfo.daysRemainingInclusive;
        return {
          visible: true,
          mode: 'variable-budget',
          eyebrow: 'Variable safe-to-spend',
          headline: `${formatMoney(remaining)} left`,
          subline: `of ${formatMoney(variableBudget)} target · ${formatMoney(perDay)}/day · ${phaseInfo.daysRemainingInclusive}d left`,
          isNegative: false,
          utilizationPct,
          paceTickPct,
          targetHref: `#/month/${selectedMonth}/bucket/variable`,
        };
      }
      return {
        visible: true,
        mode: 'variable-budget',
        eyebrow: 'Variable target',
        headline: `${formatMoney(Math.abs(remaining))} over`,
        subline: `${formatMoney(variableBudget)} Variable target · ${phaseInfo.daysRemainingInclusive}d left`,
        isNegative: true,
        utilizationPct: 100,
        paceTickPct,
        targetHref: `#/month/${selectedMonth}/bucket/variable`,
      };
    }

    return {
      visible: true,
      mode: 'variable-budget',
      eyebrow: 'Variable outcome',
      headline: `Finished ${formatMoney(Math.abs(remaining))} ${isNeg ? 'over' : 'under'}`,
      subline: `${formatMoney(variableBudget)} Variable target (${formatMoney(flexibleExpenses)} spent)`,
      isNegative: isNeg,
      utilizationPct,
      paceTickPct: null,
      targetHref: `#/month/${selectedMonth}/bucket/variable`,
    };
  }

  if (totalIncome > 0) {
    const flexRemaining = flexNumber - flexibleExpenses;
    const isNeg = flexRemaining < 0;
    const poolDenom = Math.max(flexNumber, 1);
    const utilizationPct =
      flexNumber > 0
        ? Math.min(100, Math.max(0, (flexibleExpenses / poolDenom) * 100))
        : 100;

    if (phaseInfo.phase === 'current') {
      const paceTickPct =
        flexNumber > 0
          ? Math.min(98, Math.max(2, (phaseInfo.today / phaseInfo.daysInMonth) * 100))
          : null;
      if (!isNeg) {
        const perDay = flexRemaining / phaseInfo.daysRemainingInclusive;
        return {
          visible: true,
          mode: 'flex-pool',
          eyebrow: 'Safe-to-spend pool',
          headline: `${formatMoney(flexRemaining)} Flex left`,
          subline: `after fixed & non-monthly · ${formatMoney(perDay)}/day · ${phaseInfo.daysRemainingInclusive}d left`,
          isNegative: false,
          utilizationPct,
          paceTickPct,
          targetHref: `#/month/${selectedMonth}/bucket/variable`,
        };
      }
      return {
        visible: true,
        mode: 'flex-pool',
        eyebrow: 'Flex pool',
        headline: `${formatMoney(Math.abs(flexRemaining))} over income`,
        subline: 'Committed + variable exceeded income',
        isNegative: true,
        utilizationPct: 100,
        paceTickPct,
        targetHref: `#/month/${selectedMonth}/bucket/income`,
      };
    }

    return {
      visible: true,
      mode: 'flex-pool',
      eyebrow: 'Flex pool outcome',
      headline: isNeg
        ? `${formatMoney(Math.abs(flexRemaining))} overspent`
        : `${formatMoney(flexRemaining)} kept`,
      subline: isNeg ? 'Exceeded monthly income' : 'After fixed, non-monthly & variable',
      isNegative: isNeg,
      utilizationPct,
      paceTickPct: null,
      targetHref: `#/month/${selectedMonth}/bucket/income`,
    };
  }

  return hidden;
}

/**
 * Defensively coerces numeric or string transaction amounts into finite numbers.
 */
export function coerceAmount(raw: unknown): number {
  if (typeof raw === 'number') return Number.isFinite(raw) ? raw : 0;
  const parsed = parseFloat(String(raw ?? 0));
  return Number.isFinite(parsed) ? parsed : 0;
}

export interface LedgerSliceSummaryOptions {
  isFiltered: boolean;
  selectedType?: 'expense' | 'income' | 'refund' | 'transfer' | null;
  selectedBucket?: 'income' | SpendingBucket | null;
  needsReviewOnly?: boolean;
}

export interface LedgerSliceSummary {
  count: number;
  totalMonthCount: number;
  grossExpenses: number;
  refundsTotal: number;
  unclampedNetOutflow: number;
  incomeTotal: number;
  transferTotal: number;
  unclampedNetCashflow: number;
  reviewTotal: number;
  expenseCount: number;
  refundCount: number;
  incomeCount: number;
  transferCount: number;
  formattedText: string;
}

/**
 * Computes unclamped slice totals and human-readable summary copy for `displayedTransactions`.
 * Never clamps net-refund credits (`refundsTotal > grossExpenses`) to `$0.00`!
 */
export function computeLedgerSliceSummary(
  displayedTransactions: Transaction[],
  totalMonthCount: number,
  options: LedgerSliceSummaryOptions
): LedgerSliceSummary {
  let grossExpenses = 0;
  let refundsTotal = 0;
  let incomeTotal = 0;
  let transferTotal = 0;
  let reviewTotal = 0;
  let expenseCount = 0;
  let refundCount = 0;
  let incomeCount = 0;
  let transferCount = 0;

  for (const t of displayedTransactions) {
    const amt = Math.abs(coerceAmount(t.amount));
    reviewTotal += amt;
    if (t.type === 'transfer') {
      transferTotal += amt;
      transferCount += 1;
    } else if (t.type === 'income') {
      if (isRefundTransaction(t)) {
        refundsTotal += amt;
        refundCount += 1;
      } else {
        incomeTotal += amt;
        incomeCount += 1;
      }
    } else if (t.type === 'expense') {
      grossExpenses += amt;
      expenseCount += 1;
    }
  }

  const count = displayedTransactions.length;
  const unclampedNetOutflow = grossExpenses - refundsTotal;
  const unclampedNetCashflow = incomeTotal - unclampedNetOutflow;

  let formattedText = '';

  if (count === 0) {
    formattedText =
      options.isFiltered && totalMonthCount > 0
        ? `0 of ${totalMonthCount} shown`
        : '0 transactions';
  } else if (options.needsReviewOnly) {
    formattedText = `${count} needing review · ${formatCurrency(reviewTotal)} total`;
  } else {
    const prefix = options.isFiltered
      ? `${count} of ${totalMonthCount} shown`
      : `${count} transaction${count === 1 ? '' : 's'}`;

    if (
      options.selectedType === 'transfer' ||
      (transferCount === count && transferTotal > 0)
    ) {
      formattedText = `${prefix} · ⇄ ${formatCurrency(transferTotal)} transferred`;
    } else if (options.selectedType === 'refund') {
      formattedText = `${prefix} · +${formatCurrency(refundsTotal)} refunded`;
    } else if (
      options.selectedType === 'income' ||
      options.selectedBucket === 'income' ||
      (incomeCount > 0 && expenseCount === 0 && refundCount === 0)
    ) {
      formattedText = `${prefix} · +${formatCurrency(incomeTotal)} income`;
    } else if (incomeCount === 0 && (expenseCount > 0 || refundCount > 0)) {
      if (unclampedNetOutflow < -0.005) {
        formattedText = `${prefix} · +${formatCurrency(Math.abs(unclampedNetOutflow))} net credit`;
      } else if (Math.abs(unclampedNetOutflow) <= 0.005) {
        formattedText = `${prefix} · $0.00 net`;
      } else {
        formattedText = `${prefix} · −${formatCurrency(unclampedNetOutflow)} ${
          options.isFiltered ? 'net' : 'net spent'
        }`;
      }
    } else {
      if (unclampedNetCashflow > 0.005) {
        formattedText = `${prefix} · +${formatCurrency(unclampedNetCashflow)} net`;
      } else if (unclampedNetCashflow < -0.005) {
        formattedText = `${prefix} · −${formatCurrency(Math.abs(unclampedNetCashflow))} net`;
      } else {
        formattedText = `${prefix} · $0.00 net`;
      }
    }
  }

  return {
    count,
    totalMonthCount,
    grossExpenses,
    refundsTotal,
    unclampedNetOutflow,
    incomeTotal,
    transferTotal,
    unclampedNetCashflow,
    reviewTotal,
    expenseCount,
    refundCount,
    incomeCount,
    transferCount,
    formattedText,
  };
}

