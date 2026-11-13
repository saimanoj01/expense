import React, { useMemo } from 'react';
import { motion } from 'framer-motion';
import { ArrowRight, ChevronRight } from 'lucide-react';
import {
  DEFAULT_CATEGORIES,
  type Transaction,
  type Category,
  type Budget,
  type SpendingBucket,
} from '../../services/storage';
import { useNavigation } from '../../hooks/useNavigation';
import { formatMoney, splitMoneyParts } from '../../utils/formatters';
import { delta, deltaToneClass } from '../../utils/delta';
import { bucketOf } from '../../utils/categorizer';
import {
  computeMonthMetrics,
  computePriorComparisonWindow,
  deriveCategoryBucket,
  doesBudgetMatchCategory,
  getCategoryAliasOptions,
  isNonBudgetableCategory,
  isRefundTransaction,
  resolveEffectiveCategoryBudget,
} from '../../utils/metrics';
import { BUCKETS, bucketColor, negativeColor } from '../../theme/buckets';
import { spring } from '../../theme/motion';
import { RollingNumber } from '../motion/RollingNumber';

export interface Level2BucketViewProps {
  bucketId: SpendingBucket | 'income';
  month: string;
  totalIncome: number;
  transactions: Transaction[];
  categories: Category[];
  budgets: Budget[];
  activeMonthsCount?: number;
  onOpenAddTxn: () => void;
  className?: string;
}

export const Level2BucketView: React.FC<Level2BucketViewProps> = ({
  bucketId: rawBucketId,
  month,
  totalIncome,
  transactions,
  categories,
  budgets,
  activeMonthsCount = 1,
  onOpenAddTxn,
  className = '',
}) => {
  const { navigate } = useNavigation();
  const bucketId: SpendingBucket | 'income' =
    (rawBucketId as string) === 'variable' ? 'flexible' : rawBucketId;
  const routeSlug = bucketId === 'flexible' ? 'variable' : bucketId;
  const periodMultiplier = month === 'all' ? Math.max(1, activeMonthsCount || 1) : 1;

  const bucketMeta = useMemo(() => {
    switch (bucketId) {
      case 'fixed':
        return {
          title: BUCKETS.fixed.label,
          subtitle: BUCKETS.fixed.long,
          accentColor: bucketColor('fixed'),
        };
      case 'flexible':
        return {
          title: BUCKETS.flexible.label,
          subtitle: BUCKETS.flexible.long,
          accentColor: bucketColor('flexible'),
        };
      case 'non-monthly':
        return {
          title: BUCKETS['non-monthly'].label,
          subtitle: BUCKETS['non-monthly'].long,
          accentColor: bucketColor('non-monthly'),
        };
      case 'income':
      default:
        return {
          title: 'Income & saved',
          subtitle: BUCKETS.saved.long,
          accentColor: bucketColor('saved'),
        };
    }
  }, [bucketId]);

  const allKnownCats = useMemo(() => {
    const map = new Map<string, Category>();
    DEFAULT_CATEGORIES.forEach(c => map.set(c.id, c));
    categories.forEach(c => map.set(c.id, c));
    return Array.from(map.values());
  }, [categories]);

  const bucketTransactions = useMemo(() => {
    return transactions.filter(t => {
      const matchMonth = month === 'all' || (t.date && t.date.startsWith(month));
      if (!matchMonth) return false;
      if (bucketId === 'income') {
        return t.type === 'income' && !isRefundTransaction(t);
      }
      return (
        (t.type === 'expense' || isRefundTransaction(t)) &&
        bucketOf(t, allKnownCats) === bucketId
      );
    });
  }, [transactions, month, bucketId, allKnownCats]);

  const monthTransfersTotal = useMemo(() => {
    return transactions
      .filter(
        t =>
          t.type === 'transfer' &&
          (month === 'all' || (t.date && t.date.startsWith(month)))
      )
      .reduce((s, t) => s + (Number(t.amount) || 0), 0);
  }, [transactions, month]);

  const totalSpent = useMemo(() => {
    return Math.max(
      0,
      bucketTransactions.reduce(
        (sum, t) =>
          sum + (isRefundTransaction(t) ? -(Number(t.amount) || 0) : Number(t.amount) || 0),
        0
      )
    );
  }, [bucketTransactions]);

  // Guardrail G5: Compute monthMetrics directly so direct #/month/all/bucket/* loads never show stale income
  const monthMetrics = useMemo(
    () => computeMonthMetrics(transactions, month, allKnownCats),
    [transactions, month, allKnownCats]
  );
  const effectiveIncome = month === 'all' ? monthMetrics.income : totalIncome;
  const monthExpensesTotal = monthMetrics.expenses;

  const savedAmount = effectiveIncome - monthExpensesTotal;
  const savedPct = effectiveIncome > 0 ? Math.round((savedAmount / effectiveIncome) * 100) : 0;
  const pctOfIncome = effectiveIncome > 0 ? (totalSpent / effectiveIncome) * 100 : 0;

  const priorMonthKey = useMemo(() => {
    if (!month || month === 'all' || !/^\d{4}-\d{2}$/.test(month)) return null;
    const [yStr, mStr] = month.split('-');
    const prev = new Date(Date.UTC(parseInt(yStr, 10), parseInt(mStr, 10) - 2, 1));
    return `${prev.getUTCFullYear()}-${String(prev.getUTCMonth() + 1).padStart(2, '0')}`;
  }, [month]);

  const compWindow = useMemo(
    () => computePriorComparisonWindow(transactions, month, priorMonthKey),
    [transactions, month, priorMonthKey]
  );

  const priorSpent = useMemo(() => {
    if (!priorMonthKey || !compWindow.hasPriorMonthData) return null;
    const pTxns = transactions.filter(t => {
      const matchMonth = t.date && t.date.startsWith(priorMonthKey);
      if (!matchMonth) return false;
      if (compWindow.compMaxDay !== undefined && t.date.length >= 10) {
        const d = parseInt(t.date.slice(8, 10), 10);
        if (!isNaN(d) && d > compWindow.compMaxDay) return false;
      }
      if (bucketId === 'income') return t.type === 'income' && !isRefundTransaction(t);
      return (
        (t.type === 'expense' || isRefundTransaction(t)) &&
        bucketOf(t, allKnownCats) === bucketId
      );
    });
    return Math.max(
      0,
      pTxns.reduce(
        (sum, t) =>
          sum + (isRefundTransaction(t) ? -(Number(t.amount) || 0) : Number(t.amount) || 0),
        0
      )
    );
  }, [transactions, priorMonthKey, compWindow, bucketId, allKnownCats]);

  const momDeltaInfo = useMemo(() => {
    if (!compWindow.hasSelectedActivity) {
      return { text: '—', tone: 'neutral' as const };
    }
    const kind = bucketId === 'income' ? 'income' : 'expense';
    return delta(
      totalSpent,
      priorSpent,
      kind,
      compWindow.label || priorMonthKey || 'last month'
    );
  }, [totalSpent, priorSpent, bucketId, compWindow, priorMonthKey]);

  // Category or Income Source rows (rolled up to parent categories + resolveEffectiveCategoryBudget)
  const categoryBreakdown = useMemo(() => {
    const map: Record<
      string,
      {
        id: string;
        name: string;
        emoji: string;
        spent: number;
        txnCount: number;
        budget: number;
        isIncomeSource?: boolean;
      }
    > = {};

    if (bucketId === 'income') {
      bucketTransactions.forEach(t => {
        const sourceKey = (t.description || t.category || 'Income').trim();
        const id = sourceKey.toLowerCase().replace(/[^a-z0-9]+/g, '-') || 'income';
        if (!map[id]) {
          map[id] = {
            id,
            name: sourceKey,
            emoji: '💰',
            spent: 0,
            txnCount: 0,
            budget: 0,
            isIncomeSource: true,
          };
        }
        map[id].spent += Number(t.amount) || 0;
        map[id].txnCount += 1;
      });
    } else {
      const parentCats = allKnownCats.filter(
        c => !c.parentId && !isNonBudgetableCategory(c.id) && !isNonBudgetableCategory(c.name)
      );
      const subCats = allKnownCats.filter(c => Boolean(c.parentId));
      const aliasOpts = getCategoryAliasOptions(allKnownCats);

      const resolveCanonicalParent = (t: Transaction): Category => {
        const rawCat = (t.category || 'misc').trim();
        const matchedSub =
          (t.subCategory
            ? subCats.find(s => doesBudgetMatchCategory(t.subCategory, s, aliasOpts))
            : undefined) || subCats.find(s => doesBudgetMatchCategory(rawCat, s, aliasOpts));

        if (matchedSub?.parentId) {
          const parent = parentCats.find(p => p.id === matchedSub.parentId);
          if (parent) return parent;
        }
        const matchedParent = parentCats.find(p => doesBudgetMatchCategory(rawCat, p, aliasOpts));
        if (matchedParent) return matchedParent;

        return {
          id: rawCat || 'misc',
          name: rawCat || 'Miscellaneous',
          emoji: '🏷️',
          color: '#38BDF8',
        };
      };

      // Track parent categories that recorded spend in OTHER buckets this period
      const parentIdsWithOtherBucketSpend = new Set<string>();
      for (const t of transactions) {
        const matchMonth = month === 'all' || (t.date && t.date.startsWith(month));
        if (!matchMonth) continue;
        if (t.type !== 'expense' && !isRefundTransaction(t)) continue;
        const tBucket = bucketOf(t, allKnownCats);
        if (tBucket !== bucketId) {
          const p = resolveCanonicalParent(t);
          parentIdsWithOtherBucketSpend.add(p.id);
        }
      }

      bucketTransactions.forEach(t => {
        const parentCat = resolveCanonicalParent(t);
        const key = parentCat.id;
        if (!map[key]) {
          // Guardrail G5: Only attach effectiveBudget when this bucket is the category's home bucket
          const isHomeBucket = deriveCategoryBucket(parentCat.id, parentCat) === bucketId;
          const monthlyTarget = isHomeBucket
            ? resolveEffectiveCategoryBudget(parentCat.id, budgets, allKnownCats).effectiveBudget
            : 0;
          map[key] = {
            id: key,
            name: parentCat.name,
            emoji: parentCat.emoji || '🏷️',
            spent: 0,
            txnCount: 0,
            budget: monthlyTarget * periodMultiplier,
          };
        }
        const amt = Number(t.amount) || 0;
        map[key].spent += isRefundTransaction(t) ? -amt : amt;
        map[key].txnCount += 1;
      });

      // Append $0-spend budgeted categories belonging to this home bucket (unless they only spent in another bucket)
      parentCats.forEach(pCat => {
        if (
          deriveCategoryBucket(pCat.id, pCat) === bucketId &&
          !map[pCat.id] &&
          !parentIdsWithOtherBucketSpend.has(pCat.id)
        ) {
          const monthlyTarget = resolveEffectiveCategoryBudget(
            pCat.id,
            budgets,
            allKnownCats
          ).effectiveBudget;
          if (monthlyTarget > 0) {
            map[pCat.id] = {
              id: pCat.id,
              name: pCat.name,
              emoji: pCat.emoji || '🏷️',
              spent: 0,
              txnCount: 0,
              budget: monthlyTarget * periodMultiplier,
            };
          }
        }
      });
    }

    const items = Object.values(map).map(item => {
      const clampedSpent = item.isIncomeSource ? item.spent : Math.max(0, item.spent);
      const pctOfBucket = totalSpent > 0 ? (clampedSpent / totalSpent) * 100 : 0;
      const budgetUtilization = item.budget > 0 ? (clampedSpent / item.budget) * 100 : 0;
      return {
        ...item,
        spent: clampedSpent,
        pctOfBucket,
        budgetUtilization,
      };
    });

    // Sort by spend descending; $0 spend budgeted categories at the bottom
    items.sort((a, b) => {
      if (a.spent === 0 && b.spent > 0) return 1;
      if (b.spent === 0 && a.spent > 0) return -1;
      return b.spent - a.spent || b.budget - a.budget;
    });

    return items;
  }, [
    bucketTransactions,
    transactions,
    month,
    allKnownCats,
    budgets,
    totalSpent,
    bucketId,
    periodMultiplier,
  ]);

  const totalBucketBudget = useMemo(() => {
    return categoryBreakdown.reduce((sum, c) => sum + c.budget, 0);
  }, [categoryBreakdown]);

  const bucketUtilization =
    totalBucketBudget > 0 ? (totalSpent / totalBucketBudget) * 100 : 0;

  // Pace marker for current month
  const pacePct = useMemo(() => {
    if (!month || !/^\d{4}-\d{2}$/.test(month)) return null;
    const now = new Date();
    const currKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    if (month !== currKey) return null;
    const [yStr, mStr] = month.split('-');
    const daysInMonth = new Date(parseInt(yStr, 10), parseInt(mStr, 10), 0).getDate();
    return Math.min(98, Math.max(2, (now.getDate() / daysInMonth) * 100));
  }, [month]);

  const heroParts = splitMoneyParts(totalSpent);
  const isOverBucketBudget = totalBucketBudget > 0 && totalSpent > totalBucketBudget;
  const allTimeSuffix =
    month === 'all'
      ? ` across ${periodMultiplier} active mo${periodMultiplier === 1 ? '' : 's'}`
      : '';

  return (
    <div
      data-testid="level2-bucket-view"
      className={`max-w-[1120px] mx-auto space-y-6 pb-6 ${className}`}
    >
      {/* Bare Hero Header */}
      <div className="space-y-3 pt-1">
        <div className="flex items-center justify-between gap-2 text-label text-muted-foreground">
          <div className="flex items-center gap-2">
            <span
              className="w-2 h-2 rounded-full shrink-0"
              style={{ backgroundColor: bucketMeta.accentColor }}
            />
            <span className="font-medium text-foreground">{bucketMeta.title}</span>
            <span className="text-faint">·</span>
            <span>{bucketMeta.subtitle}</span>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              data-testid="back-to-overview-btn"
              onClick={() => navigate(`#/month/${month}`)}
              className="px-2.5 py-1 rounded-[8px] bg-surface2 hover:bg-secondary text-foreground border border-border font-medium transition-colors focus-visible:ring-2 ring-ring/40"
            >
              ← Overview
            </button>
            <button
              type="button"
              data-testid="add-bucket-txn-btn"
              onClick={onOpenAddTxn}
              className="px-2.5 py-1 rounded-[8px] bg-primary text-primary-foreground font-medium hover:opacity-90 transition-opacity focus-visible:ring-2 ring-ring/40"
            >
              + Add
            </button>
          </div>
        </div>

        <motion.div
          layoutId={`bucket-amount-${routeSlug}`}
          layout="position"
          transition={spring}
          data-testid="bucket-total-spent"
          className="text-[36px] leading-[40px] sm:text-display-l font-semibold tracking-tight tabular-nums num text-foreground"
        >
          <RollingNumber value={heroParts.whole} srSuffix={heroParts.cents} />
        </motion.div>

        {bucketId === 'income' ? (
          <div className="flex flex-wrap items-center gap-2 text-body text-muted-foreground tabular-nums num">
            <span>Income {formatMoney(effectiveIncome)}</span>
            <span className="text-faint">·</span>
            {effectiveIncome > 0 && savedAmount < 0 ? (
              <span className="text-negative font-medium">
                Overspent {formatMoney(Math.abs(savedAmount))} ({Math.abs(savedPct)}% over)
              </span>
            ) : effectiveIncome === 0 && monthExpensesTotal > 0 ? (
              <span className="text-muted-foreground font-medium">
                Net outflow {formatMoney(monthExpensesTotal)} (no income)
              </span>
            ) : (
              <span className="text-bucket-saved font-medium">
                Saved {formatMoney(Math.max(0, savedAmount))} ({savedPct}%)
              </span>
            )}
          </div>
        ) : (
          <div className="flex flex-wrap items-center gap-2 text-body text-muted-foreground tabular-nums num">
            <span>{pctOfIncome.toFixed(0)}% of income</span>
            <span className="text-faint">·</span>
            <span className={`font-medium ${deltaToneClass(momDeltaInfo.tone)}`}>
              {momDeltaInfo.text}
            </span>
          </div>
        )}

        {/* Shared 6px Budget Bar */}
        <div className="flex items-center gap-4 pt-1">
          <div className="relative flex-1 h-1.5 bg-surface2 rounded-full overflow-hidden">
            <motion.div
              layoutId={`bucket-bar-${routeSlug}`}
              transition={spring}
              style={{
                width: `${totalBucketBudget > 0 ? Math.min(100, bucketUtilization) : 100}%`,
                backgroundColor: isOverBucketBudget
                  ? negativeColor()
                  : bucketMeta.accentColor,
              }}
              className="h-full rounded-full"
            />
            {totalBucketBudget > 0 && pacePct !== null && (
              <div
                style={{ left: `${pacePct}%` }}
                className="absolute top-0 bottom-0 w-[2px] bg-faint pointer-events-none"
                title="Today's pace"
              />
            )}
          </div>

          {totalBucketBudget > 0 && (
            <span
              className={`text-label tabular-nums num shrink-0 ${
                isOverBucketBudget ? 'text-negative font-medium' : 'text-muted-foreground'
              }`}
            >
              {isOverBucketBudget
                ? `${formatMoney(totalSpent - totalBucketBudget)} over ${formatMoney(totalBucketBudget)}${allTimeSuffix}`
                : `${formatMoney(totalBucketBudget - totalSpent)} left of ${formatMoney(totalBucketBudget)}${allTimeSuffix}`}
            </span>
          )}
        </div>
      </div>

      {/* Category / Source Rows (56px rows, hairline dividers) */}
      {categoryBreakdown.length === 0 ? (
        <div className="py-8 border-t border-b border-border text-body text-muted-foreground">
          Nothing recorded in {bucketMeta.title} for this {month === 'all' ? 'period' : 'month'} yet.
        </div>
      ) : (
        <div className="divide-y divide-border border-t border-b border-border">
          {categoryBreakdown.map(cat => {
            const isZeroSpend = cat.spent === 0;
            const isOverCatBudget = cat.budget > 0 && cat.budgetUtilization > 100;
            const pctValue =
              cat.budget > 0
                ? Math.round(cat.budgetUtilization)
                : Math.round(cat.pctOfBucket);

            const targetHref = cat.isIncomeSource
              ? `#/transactions?month=${month}&bucket=income`
              : `#/month/${month}/category/${encodeURIComponent(cat.id)}?fromBucket=${routeSlug}`;

            return (
              <div
                key={cat.id}
                data-testid={`category-row-${cat.id}`}
                onClick={() => navigate(targetHref)}
                role="button"
                tabIndex={0}
                onKeyDown={e => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    navigate(targetHref);
                  }
                }}
                className="min-h-[56px] py-2.5 px-2 -mx-2 rounded-[10px] hover:bg-surface2 transition-colors flex items-center justify-between gap-3 cursor-pointer focus-visible:ring-2 ring-ring/40"
              >
                <div className="flex items-center gap-3 min-w-0 flex-1">
                  <div className="w-8 h-8 rounded-full bg-surface2 flex items-center justify-center shrink-0 text-base">
                    <span>{cat.emoji}</span>
                  </div>
                  <h4
                    className={`text-body font-medium truncate ${
                      isZeroSpend ? 'text-muted-foreground' : 'text-foreground'
                    }`}
                  >
                    {cat.name}
                  </h4>
                </div>

                <div className="flex items-center gap-3 sm:gap-4 shrink-0">
                  {cat.budget > 0 && (
                    <div className="hidden sm:block w-[72px] h-1.5 bg-surface2 rounded-full overflow-hidden">
                      <div
                        style={{
                          width: `${Math.min(100, cat.budgetUtilization)}%`,
                          backgroundColor: isOverCatBudget
                            ? negativeColor()
                            : bucketMeta.accentColor,
                        }}
                        className="h-full rounded-full"
                      />
                    </div>
                  )}

                  <span
                    className={`hidden sm:inline-block w-10 text-right text-label tabular-nums num ${
                      isOverCatBudget ? 'text-negative font-medium' : 'text-muted-foreground'
                    }`}
                  >
                    {pctValue}%
                  </span>

                  <div className="text-right">
                    <div
                      className={`text-heading font-semibold tabular-nums num ${
                        isZeroSpend ? 'text-muted-foreground' : 'text-foreground'
                      }`}
                    >
                      {formatMoney(cat.spent)}
                    </div>
                    <span className="sm:hidden block text-label text-muted-foreground tabular-nums num">
                      {pctValue}%
                    </span>
                  </div>

                  <ChevronRight className="w-4 h-4 text-faint shrink-0" />
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Transfers Footer in Income & Saved Bucket (§3.12) */}
      {bucketId === 'income' && (
        <div
          data-testid="bucket-transfers-footer"
          className="h-12 flex items-center justify-between border-t border-border/60 text-body text-muted-foreground"
        >
          <span>⇄ Transfers between accounts</span>
          <span className="tabular-nums num font-medium text-foreground">
            {formatMoney(monthTransfersTotal)}
          </span>
        </div>
      )}

      {/* Trailing Link */}
      <div>
        <button
          type="button"
          data-testid="view-bucket-txns-btn"
          onClick={() => navigate(`#/transactions?month=${month}&bucket=${bucketId}`)}
          className="inline-flex items-center gap-1.5 text-body font-medium text-muted-foreground hover:text-foreground transition-colors focus-visible:ring-2 ring-ring/40 rounded px-1 -mx-1"
        >
          <span>
            All {bucketTransactions.length}{' '}
            {bucketTransactions.length === 1 ? 'transaction' : 'transactions'}
          </span>
          <ArrowRight className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
};
