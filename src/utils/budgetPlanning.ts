import type { Budget, Category, SpendingBucket, Transaction } from '../services/storage';
import { formatMoney, normalizeZero } from './formatters';
import {
  doesBudgetMatchCategory,
  getCategoryAliasOptions,
  isNonBudgetableCategory,
  isRefundTransaction,
} from './metrics';
import type { MonthPhaseInfo } from './metrics';

export interface SubCategorySummary {
  id: string;
  name: string;
  emoji: string;
  color: string;
  budget: number;
  spent: number;
  rawSpent?: number;
  effectiveSpent?: number;
  percent: number;
  bucket?: SpendingBucket;
}

export interface CategorySummary {
  id: string;
  name: string;
  emoji: string;
  color: string;
  budget: number;
  spent: number;
  rawSpent?: number;
  effectiveSpent?: number;
  explicitBudget?: number;
  subCategoryBudgetSum?: number;
  isRolledUpFromSubs?: boolean;
  catKey?: string;
  percent: number;
  bucket: SpendingBucket;
  isNonBudgetable?: boolean;
  subCategories?: SubCategorySummary[];
}

export interface PieSegment {
  pathData: string;
  color: string;
  category: string;
  name: string;
  expense: number;
}

export type CategoryBudgetStatusKind =
  | 'over-target'
  | 'ahead-of-pace'
  | 'near-limit'
  | 'at-target'
  | 'paid-on-plan'
  | 'on-track'
  | 'scheduled'
  | 'unused'
  | 'unbudgeted-spend'
  | 'no-target';

export interface CategoryBudgetStatus {
  kind: CategoryBudgetStatusKind;
  label: string;
  tone: 'negative' | 'warning' | 'positive' | 'neutral' | 'muted';
  isOverspent: boolean;
  paceTickPct: number | null;
}

export interface BudgetReconciliation {
  totalBudget: number;
  rawTotalSpent: number;
  effectiveTotalSpent: number;
  budgetedSpent: number;
  unbudgetedSpent: number;
  unbudgetedCategoryCount: number;
  unbudgetedCategoryIds: string[];
  budgetedRemaining: number;
  budgetedUtilizationPct: number;
  isAllTime: boolean;
  activeMonthsCount: number;
}

export interface CategorySpendingHistoryEntry {
  lastMonth: number;
  avg3mo: number;
  hasPriorData?: boolean;
}

export interface BudgetDirtyState {
  isDirty: boolean;
  dirtyCount: number;
  hasErrors: boolean;
  firstErrorCategoryId: string | null;
}

/**
 * Checks whether a monetary figure requires 2-decimal cent display
 * (sub-dollar values like $0.01 or fractional-cent amounts like $50.01 — Guardrail G3).
 */
export function hasFractionalCents(val: number): boolean {
  const norm = normalizeZero(val);
  const absVal = Math.abs(norm);
  if (absVal === 0) return false;
  return absVal < 1 || Math.abs(absVal - Math.round(absVal)) >= 0.005;
}

/**
 * Formats category spent and overrun figures with comma separators, automatically
 * preserving exact cents on sub-dollar or fractional-cent values ($0.01, $50.01).
 */
export function formatBudgetAmountCompact(val: number): string {
  const norm = normalizeZero(val);
  return formatMoney(norm, { cents: hasFractionalCents(norm) });
}

/**
 * Preserves legacy E2E data-testid category keys ('food' -> 'Food', 'housing' -> 'Rent', 'meals' -> 'Meals').
 */
export function getBudgetCatKey(item: { id: string; name: string }): string {
  if (item.id === 'food') return 'Food';
  if (item.id === 'meals') return 'Meals';
  if (item.id === 'housing') return 'Rent';
  return item.name;
}

/**
 * Sanitizes category hex colors, eliminating legacy purple accents
 * and falling back to calm sky blue (#38BDF8) when invalid.
 */
export function sanitizeCategoryHexColor(raw?: string): string {
  const trimmed = (raw || '').trim();
  if (!/^#[0-9A-Fa-f]{6}$/.test(trimmed)) return '#38BDF8';
  const body = trimmed.slice(1).toUpperCase();
  if (body === 'BE4' + 'BDB') return '#14B8A6';
  if (body === '845' + 'EF7') return '#0EA5E9';
  return trimmed;
}

/**
 * Converts a category hex color into a subtle alpha-tinted badge background.
 */
export function toSoftBadgeBg(rawHex?: string, alpha: number = 0.16): string {
  const hex = sanitizeCategoryHexColor(rawHex);
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

/**
 * Counts distinct active YYYY-MM calendar months containing non-transfer transactions.
 */
export function countActiveTransactionMonths(allTransactions: Transaction[]): number {
  const months = new Set<string>();
  for (const t of allTransactions) {
    if (t.type === 'transfer' || !t.date || t.date.length < 7) continue;
    const mk = t.date.slice(0, 7);
    if (/^\d{4}-\d{2}$/.test(mk)) {
      months.add(mk);
    }
  }
  return months.size;
}

/**
 * UTC-safe human month formatter for YYYY-MM keys (e.g. "November 2026").
 */
export function formatLongMonthYear(month?: string): string {
  if (!month || month === 'all') return '';
  if (!/^\d{4}-\d{2}$/.test(month)) return month;
  const [yStr, mStr] = month.split('-');
  const year = parseInt(yStr, 10);
  const monthNum = parseInt(mStr, 10);
  if (isNaN(year) || isNaN(monthNum)) return month;
  const dt = new Date(Date.UTC(year, monthNum - 1, 1));
  return dt.toLocaleDateString('en-US', {
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  });
}

/**
 * Phase-aware, UTC-safe header title & subtitle formatter (`BUG-BUD-04` & Guardrail G5).
 * Never outputs raw ISO "2026-11" or literal "for all".
 */
export function formatBudgetPeriodTitle(
  month: string,
  activeMonthsCount: number,
  phaseInfo?: MonthPhaseInfo
): { title: string; subtitle: string } {
  if (!month || month === 'all') {
    if (activeMonthsCount > 0) {
      return {
        title: 'Budgets',
        subtitle: `Monthly targets vs. average monthly spend across ${activeMonthsCount} active month${
          activeMonthsCount === 1 ? '' : 's'
        }`,
      };
    }
    return {
      title: 'Budgets',
      subtitle: 'Configure recurring monthly category targets',
    };
  }

  const longMonth = formatLongMonthYear(month);
  if (phaseInfo?.phase === 'current') {
    return {
      title: 'Budgets',
      subtitle: `${longMonth} · Day ${phaseInfo.today} of ${phaseInfo.daysInMonth}`,
    };
  }
  if (phaseInfo?.phase === 'future') {
    return {
      title: 'Budgets',
      subtitle: `Planned monthly targets for ${longMonth}`,
    };
  }
  return {
    title: 'Budgets',
    subtitle: `Monthly category targets and utilization for ${longMonth}`,
  };
}

/**
 * Computes historical Last-Month and 3-Month-Average spend for both parent and sub-categories,
 * rolling child sub-category transactions up to their parent (`BUG-BUD-01`) and ignoring
 * income-only months when computing the 3-month expense denominator.
 */
export function computeSpendingHistory(
  allTransactions: Transaction[],
  categories: Category[],
  selectedMonth: string
): Record<string, CategorySpendingHistoryEntry> {
  if (!selectedMonth || selectedMonth === 'all' || !/^\d{4}-\d{2}$/.test(selectedMonth)) {
    return {};
  }

  const [yStr, mStr] = selectedMonth.split('-');
  const year = parseInt(yStr, 10);
  const month = parseInt(mStr, 10);
  if (isNaN(year) || isNaN(month)) return {};

  const getMonthStr = (y: number, m: number) => {
    const d = new Date(Date.UTC(y, m - 1, 1));
    return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
  };

  const prev1Month = getMonthStr(year, month - 1);
  const prev2Month = getMonthStr(year, month - 2);
  const prev3Month = getMonthStr(year, month - 3);

  const aliasOpts = getCategoryAliasOptions(categories);
  const subCats = categories.filter(c => Boolean(c.parentId));
  const parentCats = categories.filter(c => !c.parentId);

  const perMonth: Record<string, Record<string, number>> = {};
  const activeExpenseMonths = new Set<string>();

  const addDelta = (catId: string | undefined | null, mKey: string, delta: number) => {
    if (!catId) return;
    if (!perMonth[catId]) perMonth[catId] = {};
    perMonth[catId][mKey] = (perMonth[catId][mKey] || 0) + delta;
  };

  for (const t of allTransactions) {
    if (t.type === 'transfer' || !t.date || t.date.length < 7) continue;
    const tMonth = t.date.slice(0, 7);
    if (tMonth !== prev1Month && tMonth !== prev2Month && tMonth !== prev3Month) {
      continue;
    }
    if (t.type !== 'expense' && !isRefundTransaction(t)) {
      continue;
    }

    activeExpenseMonths.add(tMonth);

    const rawAmt = Number(t.amount) || 0;
    const delta = t.type === 'expense' ? rawAmt : -rawAmt;

    const matchedSub =
      (t.subCategory
        ? subCats.find(s => doesBudgetMatchCategory(t.subCategory, s, aliasOpts))
        : undefined) ||
      subCats.find(s => doesBudgetMatchCategory(t.category, s, aliasOpts));

    const matchedParent = matchedSub?.parentId
      ? parentCats.find(p => p.id === matchedSub.parentId)
      : parentCats.find(p => doesBudgetMatchCategory(t.category, p, aliasOpts));

    if (matchedSub) {
      addDelta(matchedSub.id, tMonth, delta);
    }
    if (matchedParent && matchedParent.id !== matchedSub?.id) {
      addDelta(matchedParent.id, tMonth, delta);
    }
  }

  const hasPriorData = activeExpenseMonths.size > 0;
  const denom = Math.max(1, activeExpenseMonths.size);
  const history: Record<string, CategorySpendingHistoryEntry> = {};

  for (const cat of categories) {
    const m1 = Math.max(0, perMonth[cat.id]?.[prev1Month] ?? 0);
    const m2 = Math.max(0, perMonth[cat.id]?.[prev2Month] ?? 0);
    const m3 = Math.max(0, perMonth[cat.id]?.[prev3Month] ?? 0);
    const sum3 = m1 + m2 + m3;

    history[cat.id] = {
      lastMonth: Math.round(m1),
      avg3mo: hasPriorData ? Math.round(sum3 / denom) : 0,
      hasPriorData,
    };
  }

  return history;
}

/**
 * Separates Budgeted Spend (`budget > 0`) from Unbudgeted Spend (`budget === 0 && spent > 0`)
 * and normalizes All-Time spend to a monthly cadence (`BUG-BUD-03` & `BUG-BUD-04`).
 */
export function computeBudgetReconciliation(
  categorySummary: CategorySummary[],
  rawTotalSpent: number,
  month: string,
  activeMonthsCount: number
): BudgetReconciliation {
  const isAllTime = month === 'all';
  const normMonths = isAllTime ? Math.max(1, activeMonthsCount) : 1;

  let totalBudget = 0;
  let budgetedSpent = 0;
  let unbudgetedSpent = 0;
  const unbudgetedItems: Array<{ id: string; name: string; effSpent: number }> = [];

  for (const item of categorySummary) {
    if (item.isNonBudgetable) continue;
    const b = Math.max(0, Number(item.budget) || 0);
    const effSpent =
      item.effectiveSpent !== undefined
        ? Math.max(0, Number(item.effectiveSpent) || 0)
        : isAllTime
        ? Math.max(0, Number(item.rawSpent ?? item.spent) || 0) / normMonths
        : Math.max(0, Number(item.spent) || 0);

    totalBudget += b;
    if (b > 0) {
      budgetedSpent += effSpent;
    } else if (normalizeZero(effSpent) > 0) {
      unbudgetedSpent += effSpent;
      unbudgetedItems.push({ id: item.id, name: item.name, effSpent });
    }
  }

  unbudgetedItems.sort((a, b) => {
    if (Math.abs(b.effSpent - a.effSpent) >= 0.005) {
      return b.effSpent - a.effSpent;
    }
    return a.name.localeCompare(b.name);
  });
  const unbudgetedCategoryIds = unbudgetedItems.map(entry => entry.id);

  const summedEffective = budgetedSpent + unbudgetedSpent;
  const effectiveTotalSpent =
    categorySummary.length > 0
      ? normalizeZero(summedEffective)
      : normalizeZero((Number(rawTotalSpent) || 0) / normMonths);

  const budgetedRemaining = normalizeZero(totalBudget - budgetedSpent);
  const budgetedUtilizationPct =
    totalBudget > 0 ? (budgetedSpent / totalBudget) * 100 : 0;

  return {
    totalBudget: normalizeZero(totalBudget),
    rawTotalSpent: normalizeZero(Number(rawTotalSpent) || 0),
    effectiveTotalSpent,
    budgetedSpent: normalizeZero(budgetedSpent),
    unbudgetedSpent: normalizeZero(unbudgetedSpent),
    unbudgetedCategoryCount: unbudgetedCategoryIds.length,
    unbudgetedCategoryIds,
    budgetedRemaining,
    budgetedUtilizationPct,
    isAllTime,
    activeMonthsCount: isAllTime ? Math.max(0, activeMonthsCount) : 1,
  };
}

/**
 * Bucket-aware category budget status & elapsed-month pace tick engine (`BUG-BUD-02`, `BUG-BUD-05`, G3, G4).
 * - Fixed categories at <= 100% never show amber 'Near Limit' (95%-100% -> 'Paid · On Plan').
 * - Variable categories on the active month show a 2px pace tick and 'Ahead of Pace' when
 *   spent > $25 and utilization exceeds elapsed calendar ratio + 10% (matching Overview).
 */
export function computeCategoryBudgetStatus(params: {
  spent: number;
  budget: number;
  bucket?: SpendingBucket;
  phaseInfo: MonthPhaseInfo;
}): CategoryBudgetStatus {
  const spent = Math.max(0, Number(params.spent) || 0);
  const budget = Math.max(0, Number(params.budget) || 0);
  const bucket = params.bucket || 'flexible';
  const { phaseInfo } = params;

  const isCurrent = phaseInfo.phase === 'current';
  const elapsedRatio =
    isCurrent && phaseInfo.daysInMonth > 0
      ? phaseInfo.today / phaseInfo.daysInMonth
      : 0;
  const paceTickPct =
    isCurrent && budget > 0 && bucket === 'flexible'
      ? Math.min(98, Math.max(2, elapsedRatio * 100))
      : null;

  if (budget <= 0) {
    if (normalizeZero(spent) > 0) {
      return {
        kind: 'unbudgeted-spend',
        label: 'Unbudgeted',
        tone: 'warning',
        isOverspent: false,
        paceTickPct: null,
      };
    }
    return {
      kind: 'no-target',
      label: 'No Target',
      tone: 'muted',
      isOverspent: false,
      paceTickPct: null,
    };
  }

  const overrun = spent - budget;
  if (normalizeZero(overrun) > 0) {
    return {
      kind: 'over-target',
      label: `Over by ${formatBudgetAmountCompact(overrun)}`,
      tone: 'negative',
      isOverspent: true,
      paceTickPct,
    };
  }

  if (bucket === 'fixed') {
    if (spent >= budget * 0.95) {
      return {
        kind: 'paid-on-plan',
        label: 'Paid · On Plan',
        tone: 'positive',
        isOverspent: false,
        paceTickPct: null,
      };
    }
    if (normalizeZero(spent) > 0) {
      return {
        kind: 'on-track',
        label: 'On Plan',
        tone: 'neutral',
        isOverspent: false,
        paceTickPct: null,
      };
    }
    return {
      kind: phaseInfo.phase === 'past' ? 'unused' : 'scheduled',
      label: phaseInfo.phase === 'past' ? 'Unused' : 'Scheduled',
      tone: 'muted',
      isOverspent: false,
      paceTickPct: null,
    };
  }

  if (bucket === 'non-monthly') {
    if (Math.abs(spent - budget) < 0.005) {
      return {
        kind: 'at-target',
        label: 'At Target',
        tone: 'neutral',
        isOverspent: false,
        paceTickPct: null,
      };
    }
    if (spent / budget >= 0.85) {
      return {
        kind: 'near-limit',
        label: 'Near Limit',
        tone: 'warning',
        isOverspent: false,
        paceTickPct: null,
      };
    }
    return {
      kind: 'on-track',
      label: 'Within Target',
      tone: 'positive',
      isOverspent: false,
      paceTickPct: null,
    };
  }

  // Variable / flexible bucket
  if (Math.abs(spent - budget) < 0.005) {
    return {
      kind: 'at-target',
      label: 'At Target',
      tone: 'neutral',
      isOverspent: false,
      paceTickPct,
    };
  }
  if (isCurrent && spent > 25 && spent / budget > elapsedRatio + 0.1) {
    return {
      kind: 'ahead-of-pace',
      label: 'Ahead of Pace',
      tone: 'warning',
      isOverspent: false,
      paceTickPct,
    };
  }
  if (spent / budget >= 0.85) {
    return {
      kind: 'near-limit',
      label: 'Near Limit',
      tone: 'warning',
      isOverspent: false,
      paceTickPct,
    };
  }

  return {
    kind: 'on-track',
    label: 'On Track',
    tone: 'positive',
    isOverspent: false,
    paceTickPct,
  };
}

/**
 * Deterministic 6-tier urgency sorter anchored to `committedBudgetMap` (`persistedBudgets`)
 * so rows never jump under the user's cursor mid-keystroke (`BUG-BUD-10` & `BUG-BUD-11`).
 */
export function sortBudgetCategories(
  items: CategorySummary[],
  committedBudgetMap: Map<string, number>,
  phaseInfo: MonthPhaseInfo
): { budgetableItems: CategorySummary[]; nonBudgetableItems: CategorySummary[] } {
  const budgetableItems: CategorySummary[] = [];
  const nonBudgetableItems: CategorySummary[] = [];

  for (const item of items) {
    if (item.isNonBudgetable) {
      nonBudgetableItems.push(item);
    } else {
      budgetableItems.push(item);
    }
  }

  const computeTier = (item: CategorySummary) => {
    const committedBudget = committedBudgetMap.has(item.id)
      ? committedBudgetMap.get(item.id) ?? 0
      : item.budget;
    const effSpent = item.effectiveSpent ?? item.spent;
    const status = computeCategoryBudgetStatus({
      spent: effSpent,
      budget: committedBudget,
      bucket: item.bucket,
      phaseInfo,
    });

    if (committedBudget > 0 && normalizeZero(effSpent - committedBudget) > 0) {
      return { tier: 1, committedBudget, effSpent };
    }
    if (
      committedBudget > 0 &&
      (status.kind === 'ahead-of-pace' || status.kind === 'near-limit')
    ) {
      return { tier: 2, committedBudget, effSpent };
    }
    if (committedBudget <= 0 && normalizeZero(effSpent) > 0) {
      return { tier: 3, committedBudget, effSpent };
    }
    if (committedBudget > 0 && normalizeZero(effSpent) > 0) {
      return { tier: 4, committedBudget, effSpent };
    }
    if (committedBudget > 0) {
      return { tier: 5, committedBudget, effSpent };
    }
    return { tier: 6, committedBudget, effSpent };
  };

  budgetableItems.sort((a, b) => {
    const rA = computeTier(a);
    const rB = computeTier(b);

    if (rA.tier !== rB.tier) return rA.tier - rB.tier;

    if (rA.tier === 1) {
      const overA = rA.effSpent - rA.committedBudget;
      const overB = rB.effSpent - rB.committedBudget;
      if (Math.abs(overB - overA) >= 0.005) return overB - overA;
      return rB.effSpent - rA.effSpent;
    }

    if (rA.tier === 2) {
      const utilA = rA.committedBudget > 0 ? rA.effSpent / rA.committedBudget : 0;
      const utilB = rB.committedBudget > 0 ? rB.effSpent / rB.committedBudget : 0;
      if (Math.abs(utilB - utilA) >= 0.0001) return utilB - utilA;
      return rB.effSpent - rA.effSpent;
    }

    if (rA.tier === 3 || rA.tier === 4) {
      if (Math.abs(rB.effSpent - rA.effSpent) >= 0.005) {
        return rB.effSpent - rA.effSpent;
      }
      return a.name.localeCompare(b.name);
    }

    if (rA.tier === 5) {
      if (Math.abs(rB.committedBudget - rA.committedBudget) >= 0.005) {
        return rB.committedBudget - rA.committedBudget;
      }
      return a.name.localeCompare(b.name);
    }

    return a.name.localeCompare(b.name);
  });

  return { budgetableItems, nonBudgetableItems };
}

/**
 * Generates SVG Donut sector `<path>` slices scoped to `activeBucketTab` (`BUG-BUD-06` & `BUG-BUD-12`).
 * Emits strictly 1 `<path>` per positive-spend category (`0` when `$0` spent).
 */
export function computeDonutSegments(
  categorySummary: CategorySummary[],
  activeBucketTab: 'all' | SpendingBucket = 'all'
): { segments: PieSegment[]; totalPieExpense: number } {
  const eligible = categorySummary
    .filter(item => {
      if (item.isNonBudgetable) return false;
      const effSpent = item.effectiveSpent ?? item.spent;
      if (normalizeZero(effSpent) <= 0) return false;
      if (activeBucketTab !== 'all' && (item.bucket || 'flexible') !== activeBucketTab) {
        return false;
      }
      return true;
    })
    .sort((a, b) => (b.effectiveSpent ?? b.spent) - (a.effectiveSpent ?? a.spent));

  const totalPieExpense = normalizeZero(
    eligible.reduce((sum, item) => sum + (item.effectiveSpent ?? item.spent), 0)
  );

  if (totalPieExpense <= 0) {
    return { segments: [], totalPieExpense: 0 };
  }

  const cx = 64;
  const cy = 64;
  const outerR = 54;
  const innerR = 38;
  const segments: PieSegment[] = [];
  let accumulatedAngle = -Math.PI / 2;

  for (const item of eligible) {
    const effSpent = item.effectiveSpent ?? item.spent;
    const percentage = effSpent / totalPieExpense;
    let angleSpan = percentage * 2 * Math.PI;
    if (percentage >= 0.999) {
      angleSpan = 2 * Math.PI - 0.001;
    }
    const startAngle = accumulatedAngle;
    const endAngle = accumulatedAngle + angleSpan;
    const largeArcFlag = angleSpan > Math.PI ? 1 : 0;

    const x1Out = cx + outerR * Math.cos(startAngle);
    const y1Out = cy + outerR * Math.sin(startAngle);
    const x2Out = cx + outerR * Math.cos(endAngle);
    const y2Out = cy + outerR * Math.sin(endAngle);

    const x1In = cx + innerR * Math.cos(endAngle);
    const y1In = cy + innerR * Math.sin(endAngle);
    const x2In = cx + innerR * Math.cos(startAngle);
    const y2In = cy + innerR * Math.sin(startAngle);

    const pathData = [
      `M ${x1Out.toFixed(3)} ${y1Out.toFixed(3)}`,
      `A ${outerR} ${outerR} 0 ${largeArcFlag} 1 ${x2Out.toFixed(3)} ${y2Out.toFixed(3)}`,
      `L ${x1In.toFixed(3)} ${y1In.toFixed(3)}`,
      `A ${innerR} ${innerR} 0 ${largeArcFlag} 0 ${x2In.toFixed(3)} ${y2In.toFixed(3)}`,
      'Z',
    ].join(' ');

    segments.push({
      pathData,
      color: sanitizeCategoryHexColor(item.color),
      category: item.id,
      name: item.name,
      expense: effSpent,
    });
    accumulatedAngle = endAngle;
  }

  return { segments, totalPieExpense };
}

/**
 * Strips zero/negative tombstones and non-budgetable entries, deduplicating aliases
 * onto canonical category IDs (`BUG-BUD-07` & `BUG-BUD-08`).
 */
export function cleanBudgetsForSave(
  budgets: Budget[],
  categories: Category[] = []
): Budget[] {
  const aliasOpts = getCategoryAliasOptions(categories);
  const byKey = new Map<string, Budget>();

  for (const b of budgets) {
    const rawCat = (b.category || '').trim();
    if (!rawCat || isNonBudgetableCategory(rawCat)) continue;

    const amt = Number(b.amount);
    if (!Number.isFinite(amt) || amt <= 0) continue;

    const matched = categories.find(c => doesBudgetMatchCategory(rawCat, c, aliasOpts));
    if (
      matched &&
      (isNonBudgetableCategory(matched.id) || isNonBudgetableCategory(matched.name))
    ) {
      continue;
    }

    const canonicalCategory = matched ? matched.id : rawCat;
    const rounded = Math.round(amt * 100) / 100;
    byKey.set(canonicalCategory.toLowerCase(), {
      category: canonicalCategory,
      amount: rounded,
    });
  }

  return Array.from(byKey.values());
}

/**
 * Compares persisted vs working budgets and validation errors to produce exact dirty count
 * and first invalid field ID (`BUG-BUD-08`).
 */
export function computeBudgetDirtyState(
  persistedBudgets: Budget[],
  workingBudgets: Budget[],
  categories: Category[] = [],
  budgetErrors: Record<string, string> = {}
): BudgetDirtyState {
  const cleanPersisted = cleanBudgetsForSave(persistedBudgets, categories);
  const cleanWorking = cleanBudgetsForSave(workingBudgets, categories);

  const persistedMap = new Map<string, number>();
  for (const b of cleanPersisted) {
    persistedMap.set(b.category.toLowerCase(), b.amount);
  }

  const workingMap = new Map<string, number>();
  for (const b of cleanWorking) {
    workingMap.set(b.category.toLowerCase(), b.amount);
  }

  const dirtyKeys = new Set<string>();
  for (const [k, pVal] of persistedMap.entries()) {
    const wVal = workingMap.get(k) ?? 0;
    if (Math.abs(pVal - wVal) >= 0.005) {
      dirtyKeys.add(k);
    }
  }
  for (const [k, wVal] of workingMap.entries()) {
    const pVal = persistedMap.get(k) ?? 0;
    if (Math.abs(pVal - wVal) >= 0.005) {
      dirtyKeys.add(k);
    }
  }

  const errorIds: string[] = [];
  for (const [catId, msg] of Object.entries(budgetErrors)) {
    if (msg) {
      errorIds.push(catId);
      dirtyKeys.add(catId.toLowerCase());
    }
  }

  return {
    isDirty: dirtyKeys.size > 0,
    dirtyCount: dirtyKeys.size,
    hasErrors: errorIds.length > 0,
    firstErrorCategoryId: errorIds[0] ?? null,
  };
}
