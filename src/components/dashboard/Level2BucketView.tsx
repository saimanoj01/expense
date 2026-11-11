import React, { useMemo } from 'react';
import { motion } from 'framer-motion';
import { ArrowRight, ChevronRight } from 'lucide-react';
import { Transaction, Category, Budget, SpendingBucket } from '../../services/storage';
import { useNavigation } from '../../hooks/useNavigation';
import { formatMoney, splitMoneyParts } from '../../utils/formatters';
import { delta, deltaToneClass } from '../../utils/delta';
import { bucketOf } from '../../utils/categorizer';
import {
  computeMonthMetrics,
  computePriorComparisonWindow,
  isRefundTransaction,
} from '../../utils/metrics';
import { deriveCategoryBucket } from '../../hooks/useBudgets';
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
  onOpenAddTxn,
  className = '',
}) => {
  const { navigate } = useNavigation();
  const bucketId: SpendingBucket | 'income' =
    (rawBucketId as string) === 'variable' ? 'flexible' : rawBucketId;
  const routeSlug = bucketId === 'flexible' ? 'variable' : bucketId;

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

  const bucketTransactions = useMemo(() => {
    return transactions.filter(t => {
      const matchMonth = month === 'all' || (t.date && t.date.startsWith(month));
      if (!matchMonth) return false;
      if (bucketId === 'income') {
        return t.type === 'income' && !isRefundTransaction(t);
      }
      return (
        (t.type === 'expense' || isRefundTransaction(t)) &&
        bucketOf(t, categories) === bucketId
      );
    });
  }, [transactions, month, bucketId, categories]);

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
        (sum, t) => sum + (isRefundTransaction(t) ? -(Number(t.amount) || 0) : (Number(t.amount) || 0)),
        0
      )
    );
  }, [bucketTransactions]);

  const monthExpensesTotal = useMemo(() => {
    return computeMonthMetrics(transactions, month, categories).expenses;
  }, [transactions, month, categories]);

  const savedAmount = totalIncome - monthExpensesTotal;
  const savedPct = totalIncome > 0 ? Math.round((savedAmount / totalIncome) * 100) : 0;
  const pctOfIncome = totalIncome > 0 ? (totalSpent / totalIncome) * 100 : 0;

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
        bucketOf(t, categories) === bucketId
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
  }, [transactions, priorMonthKey, compWindow, bucketId, categories]);

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

  // Category or Income Source rows
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
      bucketTransactions.forEach(t => {
        const rawCat = t.category || 'misc';
        const catObj = categories.find(
          c =>
            c.id.toLowerCase() === rawCat.toLowerCase() ||
            c.name.toLowerCase() === rawCat.toLowerCase()
        );
        const key = catObj?.id || rawCat;
        const catName = catObj?.name || rawCat;
        const catEmoji = catObj?.emoji || '🏷️';

        if (!map[key]) {
          const bObj = budgets.find(
            b =>
              b.category.toLowerCase() === key.toLowerCase() ||
              b.category.toLowerCase() === catName.toLowerCase()
          );
          map[key] = {
            id: key,
            name: catName,
            emoji: catEmoji,
            spent: 0,
            txnCount: 0,
            budget: Number(bObj?.amount) || 0,
          };
        }
        const amt = Number(t.amount) || 0;
        map[key].spent += isRefundTransaction(t) ? -amt : amt;
        map[key].txnCount += 1;
      });

      categories.forEach(c => {
        if (deriveCategoryBucket(c.id, c) === bucketId && !map[c.id]) {
          const bObj = budgets.find(
            b =>
              b.category.toLowerCase() === c.id.toLowerCase() ||
              b.category.toLowerCase() === c.name.toLowerCase()
          );
          if (bObj && bObj.amount > 0) {
            map[c.id] = {
              id: c.id,
              name: c.name,
              emoji: c.emoji || '🏷️',
              spent: 0,
              txnCount: 0,
              budget: bObj.amount,
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
      return b.spent - a.spent;
    });

    return items;
  }, [bucketTransactions, categories, budgets, totalSpent, bucketId]);

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
            <span>Income {formatMoney(totalIncome)}</span>
            <span className="text-faint">·</span>
            {totalIncome > 0 && savedAmount < 0 ? (
              <span className="text-negative font-medium">
                Overspent {formatMoney(Math.abs(savedAmount))} ({Math.abs(savedPct)}% over)
              </span>
            ) : totalIncome === 0 && monthExpensesTotal > 0 ? (
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
                ? `${formatMoney(totalSpent - totalBucketBudget)} over ${formatMoney(totalBucketBudget)}`
                : `${formatMoney(totalBucketBudget - totalSpent)} left of ${formatMoney(totalBucketBudget)}`}
            </span>
          )}
        </div>
      </div>

      {/* Category / Source Rows (56px rows, hairline dividers) */}
      {categoryBreakdown.length === 0 ? (
        <div className="py-8 border-t border-b border-border text-body text-muted-foreground">
          Nothing recorded in {bucketMeta.title} for this month yet.
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

            return (
              <motion.div
                key={cat.id}
                data-testid={`category-row-${cat.id}`}
                onClick={() =>
                  cat.isIncomeSource
                    ? navigate(`#/month/${month}/transactions`)
                    : navigate(`#/month/${month}/category/${cat.id}`)
                }
                role="button"
                tabIndex={0}
                onKeyDown={e => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    if (cat.isIncomeSource) {
                      navigate(`#/month/${month}/transactions`);
                    } else {
                      navigate(`#/month/${month}/category/${cat.id}`);
                    }
                  }
                }}
                className="min-h-[56px] py-2.5 px-2 -mx-2 rounded-[10px] hover:bg-surface2 transition-colors flex items-center justify-between gap-3 cursor-pointer focus-visible:ring-2 ring-ring/40"
              >
                <div className="flex items-center gap-3 min-w-0 flex-1">
                  <div className="w-8 h-8 rounded-full bg-surface2 flex items-center justify-center shrink-0 text-base">
                    <motion.span
                      layoutId={`cat-emoji-${cat.id}`}
                      layout="position"
                      transition={spring}
                    >
                      {cat.emoji}
                    </motion.span>
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
                    <motion.div
                      layoutId={`cat-amount-${cat.id}`}
                      layout="position"
                      transition={spring}
                      className={`text-heading font-semibold tabular-nums num ${
                        isZeroSpend ? 'text-muted-foreground' : 'text-foreground'
                      }`}
                    >
                      {formatMoney(cat.spent)}
                    </motion.div>
                    <span className="sm:hidden block text-label text-muted-foreground tabular-nums num">
                      {pctValue}%
                    </span>
                  </div>

                  <ChevronRight className="w-4 h-4 text-faint shrink-0" />
                </div>
              </motion.div>
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
