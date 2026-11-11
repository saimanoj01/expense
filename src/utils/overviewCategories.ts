import { DEFAULT_CATEGORIES } from '../services/storage';
import type { Category, SpendingBucket } from '../services/storage';
import {
  deriveCategoryBucket,
  isNonBudgetableCategory,
} from './metrics';
import type { MonthPhaseInfo } from './metrics';

export interface CanonicalCategoryInfo {
  id: string;
  name: string;
  emoji: string;
  bucket: SpendingBucket;
  isNonBudgetable: boolean;
}

export interface CategorySummaryItem {
  id: string;
  name: string;
  emoji: string;
  color: string;
  budget: number;
  spent: number;
  percent: number;
  bucket: SpendingBucket;
  isNonBudgetable?: boolean;
}

export interface WatchlistCategoryItem extends CategorySummaryItem {
  urgencyTier: 1 | 2 | 3 | 4;
  overrunAmount: number;
  paceTickPct: number | null;
}

export function humanizeCategorySlug(raw?: string | null): string {
  const cleaned = (raw || '')
    .trim()
    .replace(/[-_]+/g, ' ')
    .replace(/\s+/g, ' ');
  if (!cleaned) return 'Miscellaneous';
  if (cleaned.toLowerCase() === 'misc') return 'Miscellaneous';
  return cleaned
    .split(' ')
    .map(word => (word ? word.charAt(0).toUpperCase() + word.slice(1) : ''))
    .join(' ');
}

/**
 * Resolves raw category IDs, names, or sub-category slugs to a single canonical
 * parent category identity so ID vs Name variants never split spike detection (BUG-07).
 */
export function canonicalizeCategory(
  rawCat: string | undefined | null,
  categories: Category[] = []
): CanonicalCategoryInfo {
  const trimmed = (rawCat || '').trim();
  const lower = trimmed.toLowerCase() || 'misc';

  const findMatch = (pool: Category[], key: string): Category | undefined =>
    pool.find(
      c =>
        c.id.toLowerCase() === key ||
        c.name.toLowerCase() === key ||
        (key === 'food' && c.name.toLowerCase() === 'food & dining') ||
        (key === 'food & dining' && c.id.toLowerCase() === 'food')
    );

  const matched = findMatch(categories, lower) || findMatch(DEFAULT_CATEGORIES, lower);

  if (matched) {
    const resolved = matched.parentId
      ? categories.find(c => c.id === matched.parentId) ||
        DEFAULT_CATEGORIES.find(c => c.id === matched.parentId) ||
        matched
      : matched;

    return {
      id: resolved.id,
      name: resolved.name,
      emoji: resolved.emoji || '🏷️',
      bucket: deriveCategoryBucket(resolved.id || resolved.name, resolved),
      isNonBudgetable:
        isNonBudgetableCategory(resolved.id) || isNonBudgetableCategory(resolved.name),
    };
  }

  return {
    id: lower.replace(/\s+/g, '-'),
    name: humanizeCategorySlug(trimmed || 'misc'),
    emoji: '🏷️',
    bucket: deriveCategoryBucket(lower),
    isNonBudgetable: isNonBudgetableCategory(lower),
  };
}

/**
 * Ranks categories for the Overview CategoryWatchlist using a 3-tier urgency sort:
 * 1. Over budget ($ overrun descending)
 * 2. Ahead of elapsed calendar pace (> elapsed% + 10%, utilization descending)
 * 3. Remaining active categories ($ spent descending), followed by $0 budgeted categories.
 */
export function rankCategoryWatchlist(
  categorySummary: CategorySummaryItem[],
  phaseInfo: MonthPhaseInfo,
  maxRows: number = 4
): WatchlistCategoryItem[] {
  const isAllTime = phaseInfo.phase === 'all';
  const isCurrent = phaseInfo.phase === 'current';
  const elapsedRatio =
    isCurrent && phaseInfo.daysInMonth > 0
      ? phaseInfo.today / phaseInfo.daysInMonth
      : 0;

  const eligible: WatchlistCategoryItem[] = [];

  for (const item of categorySummary) {
    if (item.isNonBudgetable) continue;
    const effectiveBudget = isAllTime ? 0 : item.budget;
    if (item.spent <= 0 && effectiveBudget <= 0) continue;

    const effectivePercent =
      effectiveBudget > 0 ? Math.round((item.spent / effectiveBudget) * 100) : 0;
    const overrunAmount =
      effectiveBudget > 0 && item.spent > effectiveBudget
        ? item.spent - effectiveBudget
        : 0;

    let urgencyTier: 1 | 2 | 3 | 4 = 3;
    if (effectiveBudget > 0 && item.spent > effectiveBudget) {
      urgencyTier = 1;
    } else if (
      isCurrent &&
      effectiveBudget > 0 &&
      item.spent > 0 &&
      item.spent / effectiveBudget > elapsedRatio + 0.1
    ) {
      urgencyTier = 2;
    } else if (item.spent > 0) {
      urgencyTier = 3;
    } else {
      urgencyTier = 4;
    }

    const paceTickPct =
      isCurrent && effectiveBudget > 0
        ? Math.min(98, Math.max(2, elapsedRatio * 100))
        : null;

    eligible.push({
      ...item,
      budget: effectiveBudget,
      percent: effectivePercent,
      urgencyTier,
      overrunAmount,
      paceTickPct,
    });
  }

  eligible.sort((a, b) => {
    if (a.urgencyTier !== b.urgencyTier) {
      return a.urgencyTier - b.urgencyTier;
    }
    if (a.urgencyTier === 1) {
      if (b.overrunAmount !== a.overrunAmount) return b.overrunAmount - a.overrunAmount;
      return b.spent - a.spent;
    }
    if (a.urgencyTier === 2) {
      const utilA = a.budget > 0 ? a.spent / a.budget : 0;
      const utilB = b.budget > 0 ? b.spent / b.budget : 0;
      if (utilB !== utilA) return utilB - utilA;
      return b.spent - a.spent;
    }
    if (a.urgencyTier === 3) {
      if (b.spent !== a.spent) return b.spent - a.spent;
      return b.budget - a.budget;
    }
    return b.budget - a.budget;
  });

  return eligible.slice(0, maxRows);
}
