import { DEFAULT_CATEGORIES, type Category, type SpendingBucket, type Transaction } from '../services/storage';
import { bucketOf } from './categorizer';
import { normalizeZero } from './formatters';
import {
  computeMonthMetrics,
  deriveCategoryBucket,
  doesBudgetMatchCategory,
  getCategoryAliasOptions,
  isNonBudgetableCategory,
  isRefundTransaction,
} from './metrics';
import { getCurrentLocalMonth } from './navigation';
import {
  formatAccountDisplay,
  getCanonicalAccountKey,
  getVisibleUserTags,
  resolveTransactionAccount,
} from './transactionTaxonomy';

export type TrendsHorizon = '6m' | '12m' | 'ytd' | 'all';

export interface HorizonWindow {
  horizon: TrendsHorizon;
  anchorMonth: string; // YYYY-MM
  monthKeys: string[]; // Continuous chronological YYYY-MM list
  subtitleRange: string; // e.g. "Dec 2025 – Nov 2026"
}

export interface HorizonMonthPoint {
  month: string; // YYYY-MM
  shortLabel: string; // e.g. "Nov" or "Jan '26" when multi-year
  longLabel: string; // e.g. "Nov 2026"
  income: number;
  fixed: number;
  flexible: number;
  nonMonthly: number;
  totalExpense: number;
  saved: number;
  hasActivity: boolean;
  rawSavingsRate: number | null; // Unclamped ((income - totalExpense) / income) * 100 when income > 0; null when income === 0
  plotSavingsRate: number | null; // null when !hasActivity; clamped [-50, 100] when income > 0; -50 when income === 0 && totalExpense > 0; 0 otherwise
}

export interface HorizonKpiSummary {
  totalInflow: number;
  avgInflow: number;
  totalOutflow: number;
  avgOutflow: number;
  netSaved: number;
  avgNetSaved: number;
  periodSavingsRate: number | null; // null when totalInflow <= 0
  activeMonthsCount: number;
  avgDenominator: number; // Math.max(1, activeMonthsCount)
  bestMonth: HorizonMonthPoint | null;
  lowestMonth: HorizonMonthPoint | null;
}

export interface BucketMixItem {
  bucket: SpendingBucket;
  routeSlug: 'fixed' | 'variable' | 'non-monthly';
  label: 'Fixed' | 'Variable' | 'Non-monthly';
  total: number;
  avgPerActiveMonth: number;
  pctOfSpend: number;
  pctOfIncome: number | null;
}

export interface HorizonBucketMix {
  items: BucketMixItem[];
  fixedPctOfIncome: number | null;
  fixedBenchmarkStatus: 'healthy' | 'elevated' | 'no-income';
}

export interface CategoryMomentumDelta {
  label: string; // e.g. "↑ 24% vs avg", "↓ 15% vs avg", "Near avg"
  tone: 'warning' | 'saved' | 'neutral';
  pctDiff: number | null;
}

export interface CategoryMomentumItem {
  id: string; // Canonical parent cat.id (or 'uncategorized')
  name: string;
  emoji: string;
  bucket: SpendingBucket;
  values: number[]; // Length === monthKeys.length, each >= 0 (refund-netted per month)
  horizonTotal: number;
  avgMonthly: number; // horizonTotal / avgDenominator (NEVER hardcoded / 6)
  latestMonthSpend: number;
  priorMonthSpend: number;
  focusSpend: number; // horizonTotal when isAllFocus else latestMonthSpend
  delta: CategoryMomentumDelta;
}

export interface MerchantConcentrationItem {
  key: string;
  name: string;
  searchQuery: string;
  expenseCount: number;
  netTotal: number;
  avgTicket: number;
  pctOfOutflow: number;
  dominantCategory: { id: string; name: string; emoji: string };
}

export interface TagConcentrationItem {
  tag: string;
  count: number;
  netTotal: number;
  pctOfOutflow: number;
}

export interface AccountConcentrationItem {
  accountKey: string; // Canonical account key or 'unassigned'
  label: string; // Display name or 'Unassigned'
  count: number;
  netTotal: number;
  pctOfOutflow: number;
}

export interface HorizonConcentration {
  merchants: MerchantConcentrationItem[];
  tags: TagConcentrationItem[];
  accounts: AccountConcentrationItem[];
}

const VALID_YM_RE = /^\d{4}-(0[1-9]|1[0-2])$/;

function coerceAmount(raw: unknown): number {
  if (typeof raw === 'number') {
    return Number.isFinite(raw) ? raw : 0;
  }
  const parsed = parseFloat(String(raw ?? 0));
  return Number.isFinite(parsed) ? parsed : 0;
}

function parseYmParts(ym: string): { year: number; month: number } {
  const [yStr, mStr] = ym.split('-');
  return {
    year: parseInt(yStr, 10),
    month: parseInt(mStr, 10),
  };
}

function formatYmShort(ym: string): string {
  if (!VALID_YM_RE.test(ym)) return ym;
  const { year, month } = parseYmParts(ym);
  const dt = new Date(Date.UTC(year, month - 1, 1));
  return dt.toLocaleDateString('en-US', { month: 'short', timeZone: 'UTC' });
}

function formatYmShortWithYear(ym: string): string {
  if (!VALID_YM_RE.test(ym)) return ym;
  const { year, month } = parseYmParts(ym);
  const dt = new Date(Date.UTC(year, month - 1, 1));
  const mon = dt.toLocaleDateString('en-US', { month: 'short', timeZone: 'UTC' });
  return `${mon} ${year}`;
}

export function buildTrailingMonths(endYm: string, count: number): string[] {
  const safeCount = Math.max(1, Math.floor(count));
  if (!VALID_YM_RE.test(endYm)) return [endYm];
  const { year, month } = parseYmParts(endYm);
  const result: string[] = [];
  for (let i = safeCount - 1; i >= 0; i--) {
    const dt = new Date(Date.UTC(year, month - 1 - i, 1));
    result.push(`${dt.getUTCFullYear()}-${String(dt.getUTCMonth() + 1).padStart(2, '0')}`);
  }
  return result;
}

export function buildMonthSpan(startYm: string, endYm: string): string[] {
  if (!VALID_YM_RE.test(startYm) || !VALID_YM_RE.test(endYm)) {
    return VALID_YM_RE.test(endYm) ? [endYm] : [];
  }
  const s = startYm <= endYm ? startYm : endYm;
  const e = startYm <= endYm ? endYm : startYm;
  const startParts = parseYmParts(s);
  const endParts = parseYmParts(e);
  const totalMonths =
    (endParts.year - startParts.year) * 12 + (endParts.month - startParts.month) + 1;
  const clampedCount = Math.min(240, Math.max(1, totalMonths));
  const result: string[] = [];
  for (let i = 0; i < clampedCount; i++) {
    const dt = new Date(Date.UTC(startParts.year, startParts.month - 1 + i, 1));
    result.push(`${dt.getUTCFullYear()}-${String(dt.getUTCMonth() + 1).padStart(2, '0')}`);
  }
  return result;
}

function buildSubtitleRange(monthKeys: string[]): string {
  if (monthKeys.length === 0) return '';
  if (monthKeys.length === 1) return formatYmShortWithYear(monthKeys[0]);
  return `${formatYmShortWithYear(monthKeys[0])} – ${formatYmShortWithYear(
    monthKeys[monthKeys.length - 1]
  )}`;
}

export function resolveHorizonMonths(
  horizon: TrendsHorizon,
  selectedMonth: string,
  transactions: Transaction[],
  fallbackMonth: string = getCurrentLocalMonth()
): HorizonWindow {
  const txMonthsSet = new Set<string>();
  for (const t of transactions) {
    if (t.type === 'transfer' || !t.date || t.date.length < 7) continue;
    const prefix = t.date.slice(0, 7);
    if (VALID_YM_RE.test(prefix)) {
      txMonthsSet.add(prefix);
    }
  }
  const txMonths = Array.from(txMonthsSet).sort();
  const safeFallback = VALID_YM_RE.test(fallbackMonth) ? fallbackMonth : getCurrentLocalMonth();
  const anchorMonth = VALID_YM_RE.test(selectedMonth)
    ? selectedMonth
    : txMonths[txMonths.length - 1] || safeFallback;

  let monthKeys: string[];
  switch (horizon) {
    case '6m':
      monthKeys = buildTrailingMonths(anchorMonth, 6);
      break;
    case '12m':
      monthKeys = buildTrailingMonths(anchorMonth, 12);
      break;
    case 'ytd':
      monthKeys = buildMonthSpan(`${anchorMonth.slice(0, 4)}-01`, anchorMonth);
      break;
    case 'all':
      if (txMonths.length === 0) {
        monthKeys = buildTrailingMonths(anchorMonth, 12);
      } else if (txMonths.length === 1) {
        monthKeys = buildTrailingMonths(txMonths[0], 6);
      } else {
        monthKeys = buildMonthSpan(txMonths[0], txMonths[txMonths.length - 1]);
      }
      break;
    default:
      monthKeys = buildTrailingMonths(anchorMonth, 12);
      break;
  }

  return {
    horizon,
    anchorMonth,
    monthKeys,
    subtitleRange: buildSubtitleRange(monthKeys),
  };
}

export function computeHorizonMonthlySeries(
  transactions: Transaction[],
  monthKeys: string[],
  categories: Category[] = []
): { series: HorizonMonthPoint[]; summary: HorizonKpiSummary } {
  const nonTransferCounts = new Map<string, number>();
  for (const t of transactions) {
    if (t.type === 'transfer' || !t.date || t.date.length < 7) continue;
    const mk = t.date.slice(0, 7);
    nonTransferCounts.set(mk, (nonTransferCounts.get(mk) || 0) + 1);
  }

  const distinctYears = new Set(monthKeys.map(mk => mk.slice(0, 4)));
  const spansMultipleYears = distinctYears.size > 1;

  const series: HorizonMonthPoint[] = monthKeys.map((mKey, idx) => {
    const m = computeMonthMetrics(transactions, mKey, categories);
    const income = normalizeZero(m.income);
    const fixed = normalizeZero(m.fixed);
    const flexible = normalizeZero(m.flexible);
    const nonMonthly = normalizeZero(m.nonMonthly);
    const totalExpense = normalizeZero(m.expenses);
    const saved = normalizeZero(m.savings);
    const hasActivity = income > 0 || totalExpense > 0 || (nonTransferCounts.get(mKey) || 0) > 0;

    const rawSavingsRate = income > 0 ? ((income - totalExpense) / income) * 100 : null;
    let plotSavingsRate: number | null = null;
    if (hasActivity) {
      if (income > 0 && rawSavingsRate !== null) {
        plotSavingsRate = Math.max(-50, Math.min(100, rawSavingsRate));
      } else if (totalExpense > 0) {
        plotSavingsRate = -50;
      } else {
        plotSavingsRate = 0;
      }
    }

    const baseShort = formatYmShort(mKey);
    const monthNum = parseInt(mKey.slice(5, 7), 10);
    const shortLabel =
      spansMultipleYears &&
      monthKeys.length > 12 &&
      (monthNum === 1 || idx === 0 || idx === monthKeys.length - 1)
        ? `${baseShort} '${mKey.slice(2, 4)}`
        : baseShort;

    return {
      month: mKey,
      shortLabel,
      longLabel: formatYmShortWithYear(mKey),
      income,
      fixed,
      flexible,
      nonMonthly,
      totalExpense,
      saved,
      hasActivity,
      rawSavingsRate,
      plotSavingsRate,
    };
  });

  const activeMonths = series.filter(pt => pt.hasActivity);
  const activeMonthsCount = activeMonths.length;
  const avgDenominator = Math.max(1, activeMonthsCount);

  const totalInflow = normalizeZero(series.reduce((sum, pt) => sum + pt.income, 0));
  const totalOutflow = normalizeZero(series.reduce((sum, pt) => sum + pt.totalExpense, 0));
  const netSaved = normalizeZero(totalInflow - totalOutflow);

  const avgInflow = normalizeZero(totalInflow / avgDenominator);
  const avgOutflow = normalizeZero(totalOutflow / avgDenominator);
  const avgNetSaved = normalizeZero(netSaved / avgDenominator);
  const periodSavingsRate = totalInflow > 0 ? (netSaved / totalInflow) * 100 : null;

  let bestMonth: HorizonMonthPoint | null = null;
  let lowestMonth: HorizonMonthPoint | null = null;

  if (activeMonths.length > 0) {
    bestMonth = activeMonths.reduce((best, cur) => (cur.saved > best.saved ? cur : best));
  }
  if (activeMonths.length >= 2) {
    lowestMonth = activeMonths.reduce((low, cur) => (cur.saved < low.saved ? cur : low));
  }

  return {
    series,
    summary: {
      totalInflow,
      avgInflow,
      totalOutflow,
      avgOutflow,
      netSaved,
      avgNetSaved,
      periodSavingsRate,
      activeMonthsCount,
      avgDenominator,
      bestMonth,
      lowestMonth,
    },
  };
}

export function buildSavingsRateSvgPath(
  points: Array<{ cx: number; cy: number | null }>
): string {
  const activeYs = points
    .map(p => p.cy)
    .filter((y): y is number => y !== null && Number.isFinite(y));
  if (activeYs.length === 0) return '';

  const minY = Math.min(...activeYs);
  const maxY = Math.max(...activeYs);
  // Chromium SVG getBoundingClientRect().height is 0 for a strictly horizontal stroke-only path,
  // which causes Playwright .toBeVisible() to report hidden. Apply a 1px offset when flat.
  const isFlat = maxY - minY < 1;

  const runs: Array<Array<{ cx: number; cy: number }>> = [];
  let currentRun: Array<{ cx: number; cy: number }> = [];

  for (const pt of points) {
    if (pt.cy !== null && Number.isFinite(pt.cy)) {
      currentRun.push({ cx: pt.cx, cy: pt.cy });
    } else if (currentRun.length > 0) {
      runs.push(currentRun);
      currentRun = [];
    }
  }
  if (currentRun.length > 0) {
    runs.push(currentRun);
  }

  const segments: string[] = [];
  let appliedFlatOffset = false;

  for (const run of runs) {
    if (run.length === 1) {
      const { cx, cy } = run[0];
      const y1 = isFlat && !appliedFlatOffset ? cy - 0.6 : cy;
      const y2 = isFlat && !appliedFlatOffset ? cy + 0.6 : cy;
      appliedFlatOffset = true;
      segments.push(`M ${(cx - 8).toFixed(1)} ${y1.toFixed(1)} L ${(cx + 8).toFixed(1)} ${y2.toFixed(1)}`);
    } else if (run.length >= 2) {
      const first = run[0];
      const yStart = isFlat && !appliedFlatOffset ? first.cy + 1.2 : first.cy;
      if (isFlat && !appliedFlatOffset) {
        appliedFlatOffset = true;
      }
      const rest = run
        .slice(1)
        .map(p => `L ${p.cx.toFixed(1)} ${p.cy.toFixed(1)}`)
        .join(' ');
      segments.push(`M ${first.cx.toFixed(1)} ${yStart.toFixed(1)} ${rest}`);
    }
  }

  return segments.join(' ');
}

export function computeHorizonBucketMix(
  series: HorizonMonthPoint[],
  summary: HorizonKpiSummary
): HorizonBucketMix {
  const fixedTotal = normalizeZero(series.reduce((s, p) => s + p.fixed, 0));
  const variableTotal = normalizeZero(series.reduce((s, p) => s + p.flexible, 0));
  const nonMonthlyTotal = normalizeZero(series.reduce((s, p) => s + p.nonMonthly, 0));

  const makeItem = (
    bucket: SpendingBucket,
    routeSlug: 'fixed' | 'variable' | 'non-monthly',
    label: 'Fixed' | 'Variable' | 'Non-monthly',
    total: number
  ): BucketMixItem => ({
    bucket,
    routeSlug,
    label,
    total,
    avgPerActiveMonth: normalizeZero(total / summary.avgDenominator),
    pctOfSpend: summary.totalOutflow > 0 ? (total / summary.totalOutflow) * 100 : 0,
    pctOfIncome: summary.totalInflow > 0 ? (total / summary.totalInflow) * 100 : null,
  });

  const fixedPctOfIncome =
    summary.totalInflow > 0 ? (fixedTotal / summary.totalInflow) * 100 : null;
  const fixedBenchmarkStatus =
    fixedPctOfIncome === null
      ? 'no-income'
      : fixedPctOfIncome <= 50
      ? 'healthy'
      : 'elevated';

  return {
    items: [
      makeItem('fixed', 'fixed', 'Fixed', fixedTotal),
      makeItem('flexible', 'variable', 'Variable', variableTotal),
      makeItem('non-monthly', 'non-monthly', 'Non-monthly', nonMonthlyTotal),
    ],
    fixedPctOfIncome,
    fixedBenchmarkStatus,
  };
}

function mergeKnownCategories(categories: Category[] = []): Category[] {
  const map = new Map<string, Category>();
  for (const c of DEFAULT_CATEGORIES) {
    map.set(c.id, c);
  }
  for (const c of categories) {
    map.set(c.id, c);
  }
  return Array.from(map.values());
}

function resolveParentCategoryIdentity(
  t: Transaction,
  parentCats: Category[],
  subCats: Category[],
  allCats: Category[],
  aliasOpts: ReturnType<typeof getCategoryAliasOptions>
): { id: string; name: string; emoji: string; bucket: SpendingBucket } {
  const rawCat = (t.category || '').trim();
  if (!rawCat || rawCat.toLowerCase() === 'uncategorized') {
    return {
      id: 'uncategorized',
      name: 'Uncategorized',
      emoji: '🏷️',
      bucket: bucketOf(t, allCats),
    };
  }

  const matchedSub =
    (t.subCategory
      ? subCats.find(s => doesBudgetMatchCategory(t.subCategory, s, aliasOpts))
      : undefined) || subCats.find(s => doesBudgetMatchCategory(rawCat, s, aliasOpts));

  if (matchedSub?.parentId) {
    const parent = parentCats.find(p => p.id === matchedSub.parentId);
    if (parent) {
      return {
        id: parent.id,
        name: parent.name,
        emoji: parent.emoji || '🏷️',
        bucket: deriveCategoryBucket(parent.id, parent),
      };
    }
  }

  const matchedParent = parentCats.find(p => doesBudgetMatchCategory(rawCat, p, aliasOpts));
  if (matchedParent) {
    return {
      id: matchedParent.id,
      name: matchedParent.name,
      emoji: matchedParent.emoji || '🏷️',
      bucket: deriveCategoryBucket(matchedParent.id, matchedParent),
    };
  }

  return {
    id: rawCat,
    name: rawCat,
    emoji: '🏷️',
    bucket: deriveCategoryBucket(rawCat),
  };
}

export function computeHorizonCategoryTrends(
  transactions: Transaction[],
  monthKeys: string[],
  categories: Category[] = [],
  activeMonthsCount: number = 1,
  isAllFocus: boolean = false
): CategoryMomentumItem[] {
  if (monthKeys.length === 0) return [];

  const allCats = mergeKnownCategories(categories);
  const parentCats = allCats.filter(
    c => !c.parentId && !isNonBudgetableCategory(c.id) && !isNonBudgetableCategory(c.name)
  );
  const subCats = allCats.filter(c => Boolean(c.parentId));
  const aliasOpts = getCategoryAliasOptions(allCats);

  const monthIdxMap = new Map<string, number>();
  monthKeys.forEach((mk, idx) => monthIdxMap.set(mk, idx));

  const grouped = new Map<
    string,
    {
      id: string;
      name: string;
      emoji: string;
      bucket: SpendingBucket;
      rawMonthly: number[];
    }
  >();

  for (const t of transactions) {
    if (!t.date || t.date.length < 7) continue;
    const mIdx = monthIdxMap.get(t.date.slice(0, 7));
    if (mIdx === undefined) continue;

    const isRefund = isRefundTransaction(t);
    if (t.type !== 'expense' && !isRefund) continue;
    if (isNonBudgetableCategory(t.category)) continue;

    const resolved = resolveParentCategoryIdentity(t, parentCats, subCats, allCats, aliasOpts);
    if (isNonBudgetableCategory(resolved.id) || isNonBudgetableCategory(resolved.name)) {
      continue;
    }

    let entry = grouped.get(resolved.id);
    if (!entry) {
      entry = {
        ...resolved,
        rawMonthly: new Array(monthKeys.length).fill(0),
      };
      grouped.set(resolved.id, entry);
    }

    const amt = Math.abs(coerceAmount(t.amount));
    entry.rawMonthly[mIdx] += isRefund ? -amt : amt;
  }

  const avgDenominator = Math.max(1, activeMonthsCount);
  const items: CategoryMomentumItem[] = [];

  for (const entry of grouped.values()) {
    const values = entry.rawMonthly.map(v => Math.max(0, normalizeZero(v)));
    const horizonTotal = normalizeZero(values.reduce((sum, v) => sum + v, 0));
    if (horizonTotal <= 0) continue;

    const avgMonthly = normalizeZero(horizonTotal / avgDenominator);
    const latestMonthSpend = values.length > 0 ? values[values.length - 1] : 0;
    const priorMonthSpend = values.length >= 2 ? values[values.length - 2] : 0;
    const focusSpend = isAllFocus ? horizonTotal : latestMonthSpend;

    let delta: CategoryMomentumDelta;
    if (activeMonthsCount < 2 || isAllFocus) {
      delta = {
        label: `${activeMonthsCount} active mo${activeMonthsCount === 1 ? '' : 's'}`,
        tone: 'neutral',
        pctDiff: null,
      };
    } else if (
      avgMonthly > 0 &&
      latestMonthSpend > avgMonthly * 1.1 &&
      latestMonthSpend - avgMonthly >= 20
    ) {
      const pctDiff = Math.round(((latestMonthSpend - avgMonthly) / avgMonthly) * 100);
      delta = {
        label: `↑ ${pctDiff}% vs avg`,
        tone: 'warning',
        pctDiff,
      };
    } else if (
      avgMonthly >= 20 &&
      latestMonthSpend < avgMonthly * 0.9 &&
      avgMonthly - latestMonthSpend >= 20
    ) {
      const pctDiff = -Math.round(((avgMonthly - latestMonthSpend) / avgMonthly) * 100);
      delta = {
        label: `↓ ${Math.abs(pctDiff)}% vs avg`,
        tone: 'saved',
        pctDiff,
      };
    } else {
      delta = {
        label: 'Near avg',
        tone: 'neutral',
        pctDiff: 0,
      };
    }

    items.push({
      id: entry.id,
      name: entry.name,
      emoji: entry.emoji,
      bucket: entry.bucket,
      values,
      horizonTotal,
      avgMonthly,
      latestMonthSpend,
      priorMonthSpend,
      focusSpend,
      delta,
    });
  }

  items.sort((a, b) => b.horizonTotal - a.horizonTotal || a.name.localeCompare(b.name));
  return items;
}

export function normalizeMerchantPayee(rawDescription?: string | null): string {
  let cleaned = (rawDescription || '').trim().replace(/\s{2,}/g, ' ');
  // Repeatedly strip trailing MM/DD(/YYYY) dates and #store numbers in any order
  let prev = '';
  while (cleaned !== prev) {
    prev = cleaned;
    cleaned = cleaned
      .replace(/\s+\d{1,2}\/\d{1,2}(?:\/\d{2,4})?$/, '')
      .replace(/\s+#\d+$/i, '')
      .trim();
  }
  return cleaned || 'Unspecified';
}

export function computeHorizonConcentration(
  transactions: Transaction[],
  monthKeys: string[],
  categories: Category[] = [],
  totalOutflow: number = 0
): HorizonConcentration {
  const monthSet = new Set(monthKeys);
  const allCats = mergeKnownCategories(categories);
  const parentCats = allCats.filter(
    c => !c.parentId && !isNonBudgetableCategory(c.id) && !isNonBudgetableCategory(c.name)
  );
  const subCats = allCats.filter(c => Boolean(c.parentId));
  const aliasOpts = getCategoryAliasOptions(allCats);

  const merchantMap = new Map<
    string,
    {
      name: string;
      hasMixedCase: boolean;
      grossExpenses: number;
      refundTotal: number;
      expenseCount: number;
      catTotals: Map<string, { id: string; name: string; emoji: string; total: number }>;
    }
  >();

  const tagMap = new Map<string, { count: number; netRaw: number }>();
  const accountMap = new Map<string, { label: string; count: number; netRaw: number }>();

  for (const t of transactions) {
    if (!t.date || t.date.length < 7) continue;
    if (!monthSet.has(t.date.slice(0, 7))) continue;

    const isRefund = isRefundTransaction(t);
    if (t.type !== 'expense' && !isRefund) continue;
    if (isNonBudgetableCategory(t.category)) continue;

    const amt = Math.abs(coerceAmount(t.amount));
    const signedAmt = isRefund ? -amt : amt;

    // 1. Merchant aggregation
    const cleanPayee = normalizeMerchantPayee(t.description);
    const payeeKey = cleanPayee.toLowerCase();
    const isMixed =
      cleanPayee !== cleanPayee.toLowerCase() && cleanPayee !== cleanPayee.toUpperCase();

    let mEntry = merchantMap.get(payeeKey);
    if (!mEntry) {
      mEntry = {
        name: cleanPayee,
        hasMixedCase: isMixed,
        grossExpenses: 0,
        refundTotal: 0,
        expenseCount: 0,
        catTotals: new Map(),
      };
      merchantMap.set(payeeKey, mEntry);
    } else if (!mEntry.hasMixedCase && isMixed) {
      mEntry.name = cleanPayee;
      mEntry.hasMixedCase = true;
    }

    if (isRefund) {
      mEntry.refundTotal += amt;
    } else {
      mEntry.grossExpenses += amt;
      mEntry.expenseCount += 1;
    }

    const parentCat = resolveParentCategoryIdentity(t, parentCats, subCats, allCats, aliasOpts);
    const existingCat = mEntry.catTotals.get(parentCat.id);
    if (existingCat) {
      existingCat.total += signedAmt;
    } else {
      mEntry.catTotals.set(parentCat.id, {
        id: parentCat.id,
        name: parentCat.name,
        emoji: parentCat.emoji,
        total: signedAmt,
      });
    }

    // 2. #Tag aggregation
    const visibleTags = getVisibleUserTags(t);
    for (const tag of visibleTags) {
      const existingTag = tagMap.get(tag);
      if (existingTag) {
        existingTag.netRaw += signedAmt;
        if (!isRefund) existingTag.count += 1;
      } else {
        tagMap.set(tag, {
          count: isRefund ? 0 : 1,
          netRaw: signedAmt,
        });
      }
    }

    // 3. Account aggregation
    const rawAcct = resolveTransactionAccount(t);
    const accountKey = rawAcct ? getCanonicalAccountKey(rawAcct) : 'unassigned';
    const accountLabel = rawAcct ? formatAccountDisplay(rawAcct) : 'Unassigned';
    const existingAcct = accountMap.get(accountKey);
    if (existingAcct) {
      existingAcct.netRaw += signedAmt;
      if (!isRefund) existingAcct.count += 1;
    } else {
      accountMap.set(accountKey, {
        label: accountLabel,
        count: isRefund ? 0 : 1,
        netRaw: signedAmt,
      });
    }
  }

  const safeOutflow = Math.max(0, totalOutflow);

  const merchants: MerchantConcentrationItem[] = [];
  for (const [key, entry] of merchantMap.entries()) {
    const netTotal = normalizeZero(Math.max(0, entry.grossExpenses - entry.refundTotal));
    if (netTotal <= 0) continue;

    let domCat = { id: 'misc', name: 'Miscellaneous', emoji: '📦', total: -Infinity };
    for (const c of entry.catTotals.values()) {
      if (c.total > domCat.total) {
        domCat = c;
      }
    }

    const avgTicket =
      entry.expenseCount > 0 ? normalizeZero(netTotal / entry.expenseCount) : netTotal;
    const pctOfOutflow = safeOutflow > 0 ? Math.min(100, (netTotal / safeOutflow) * 100) : 0;

    merchants.push({
      key,
      name: entry.name,
      searchQuery: entry.name === 'Unspecified' ? '' : entry.name,
      expenseCount: entry.expenseCount,
      netTotal,
      avgTicket,
      pctOfOutflow,
      dominantCategory: {
        id: domCat.id,
        name: domCat.name,
        emoji: domCat.emoji,
      },
    });
  }
  merchants.sort((a, b) => b.netTotal - a.netTotal || a.name.localeCompare(b.name));

  const tags: TagConcentrationItem[] = [];
  for (const [tag, entry] of tagMap.entries()) {
    const netTotal = normalizeZero(Math.max(0, entry.netRaw));
    if (netTotal <= 0) continue;
    tags.push({
      tag,
      count: entry.count,
      netTotal,
      pctOfOutflow: safeOutflow > 0 ? Math.min(100, (netTotal / safeOutflow) * 100) : 0,
    });
  }
  tags.sort((a, b) => b.netTotal - a.netTotal || a.tag.localeCompare(b.tag));

  const accounts: AccountConcentrationItem[] = [];
  for (const [accountKey, entry] of accountMap.entries()) {
    const netTotal = normalizeZero(Math.max(0, entry.netRaw));
    if (netTotal <= 0) continue;
    accounts.push({
      accountKey,
      label: entry.label,
      count: entry.count,
      netTotal,
      pctOfOutflow: safeOutflow > 0 ? Math.min(100, (netTotal / safeOutflow) * 100) : 0,
    });
  }
  accounts.sort((a, b) => b.netTotal - a.netTotal || a.label.localeCompare(b.label));

  return { merchants, tags, accounts };
}
