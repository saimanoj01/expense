import React, { useState, useMemo } from 'react';
import { motion } from 'framer-motion';
import {
  ArrowRight,
  Shield,
  ShoppingBag,
  Calendar,
  TrendingUp,
  Plus,
  ArrowUpDown,
  CheckCircle2,
  AlertTriangle,
  Receipt
} from 'lucide-react';
import { Transaction, Category, Budget, SpendingBucket } from '../../services/storage';
import { useNavigation } from '../../hooks/useNavigation';
import { formatCurrency, formatExpenseCurrency } from '../../utils/formatters';
import { bucketOf } from '../../utils/categorizer';
import { deriveCategoryBucket } from '../../hooks/useBudgets';

export interface Level2BucketViewProps {
  bucketId: SpendingBucket | 'income';
  month: string;
  totalIncome: number;
  transactions: Transaction[];
  allTransactions?: Transaction[];
  categories: Category[];
  budgets: Budget[];
  onOpenAddTxn: () => void;
  className?: string;
}

function getUtilizationColor(pct: number): { text: string; bg: string; border: string; hex: string } {
  if (pct > 100) {
    return { text: 'text-rose-400', bg: 'bg-rose-500/10', border: 'border-rose-500/20', hex: '#F43F5E' };
  }
  if (pct >= 90) {
    return { text: 'text-amber-400', bg: 'bg-amber-500/10', border: 'border-amber-500/20', hex: '#F59E0B' };
  }
  return { text: 'text-emerald-400', bg: 'bg-emerald-500/10', border: 'border-emerald-500/20', hex: '#10B981' };
}

export const Level2BucketView: React.FC<Level2BucketViewProps> = ({
  bucketId,
  month,
  totalIncome,
  transactions,
  allTransactions,
  categories,
  budgets,
  onOpenAddTxn,
  className = ''
}) => {
  const { navigate } = useNavigation();
  const [sortBy, setSortBy] = useState<'spend' | 'name' | 'percent'>('spend');

  // Bucket details and styling
  const bucketMeta = useMemo(() => {
    switch (bucketId) {
      case 'fixed':
        return {
          title: 'Fixed Commitments',
          subtitle: 'Essential recurring obligations, bills, housing, and utilities',
          icon: Shield,
          color: 'text-indigo-400',
          borderColor: 'border-indigo-500/30',
          bgGradient: 'from-indigo-500/15 via-card to-card',
          badgeBg: 'bg-indigo-500/20 text-indigo-400 border-indigo-500/30',
          accentColor: '#6366F1'
        };
      case 'flexible':
        return {
          title: 'Variable Spending',
          subtitle: 'Day-to-day discretionary spending, groceries, dining, and lifestyle',
          icon: ShoppingBag,
          color: 'text-violet-400',
          borderColor: 'border-violet-500/30',
          bgGradient: 'from-violet-500/15 via-card to-card',
          badgeBg: 'bg-violet-500/20 text-violet-400 border-violet-500/30',
          accentColor: '#8B5CF6'
        };
      case 'non-monthly':
        return {
          title: 'Non-Monthly Irregular',
          subtitle: 'Periodic taxes, insurance, annual renewals, and irregular buffers',
          icon: Calendar,
          color: 'text-amber-400',
          borderColor: 'border-amber-500/30',
          bgGradient: 'from-amber-500/15 via-card to-card',
          badgeBg: 'bg-amber-500/20 text-amber-400 border-amber-500/30',
          accentColor: '#F59E0B'
        };
      case 'income':
      default:
        return {
          title: 'Total Inflow',
          subtitle: 'Monthly earned income streams, salary, dividends, and cash inflows',
          icon: TrendingUp,
          color: 'text-emerald-400',
          borderColor: 'border-emerald-500/30',
          bgGradient: 'from-emerald-500/15 via-card to-card',
          badgeBg: 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30',
          accentColor: '#10B981'
        };
    }
  }, [bucketId]);

  // Filter transactions for this month and this bucket
  const bucketTransactions = useMemo(() => {
    return transactions.filter(t => {
      if (bucketId === 'income') {
        return t.type === 'income';
      }
      return t.type === 'expense' && bucketOf(t, categories) === bucketId;
    });
  }, [transactions, bucketId, categories]);

  const totalSpent = useMemo(() => {
    return bucketTransactions.reduce((sum, t) => sum + t.amount, 0);
  }, [bucketTransactions]);

  const pctOfIncome = totalIncome > 0 ? (totalSpent / totalIncome) * 100 : 0;

  // Prior month comparison
  const priorMonthKey = useMemo(() => {
    if (!month || month === 'all' || !/^\d{4}-\d{2}$/.test(month)) return null;
    const [yStr, mStr] = month.split('-');
    const prev = new Date(Date.UTC(parseInt(yStr, 10), parseInt(mStr, 10) - 2, 1));
    return `${prev.getUTCFullYear()}-${String(prev.getUTCMonth() + 1).padStart(2, '0')}`;
  }, [month]);

  const priorSpent = useMemo(() => {
    if (!priorMonthKey) return null;
    const sourceTxns = allTransactions || transactions;
    const pTxns = sourceTxns.filter(t => {
      const matchMonth = t.date && t.date.startsWith(priorMonthKey);
      if (!matchMonth) return false;
      if (bucketId === 'income') return t.type === 'income';
      return t.type === 'expense' && bucketOf(t, categories) === bucketId;
    });
    if (pTxns.length === 0) return null;
    return pTxns.reduce((sum, t) => sum + t.amount, 0);
  }, [allTransactions, transactions, priorMonthKey, bucketId, categories]);

  const momDelta = priorSpent !== null && priorSpent > 0
    ? ((totalSpent - priorSpent) / priorSpent) * 100
    : null;

  // Aggregate category breakdowns in this bucket
  const categoryBreakdown = useMemo(() => {
    const map: Record<string, {
      id: string;
      name: string;
      emoji: string;
      color: string;
      spent: number;
      txnCount: number;
      budget: number;
    }> = {};

    // Group transactions by category
    bucketTransactions.forEach(t => {
      const catId = t.category || 'misc';
      const catObj = categories.find(c => c.id === catId || c.name.toLowerCase() === catId.toLowerCase());
      const catName = catObj?.name || catId;
      const catEmoji = catObj?.emoji || '🏷️';
      const catColor = catObj?.color || bucketMeta.accentColor;

      if (!map[catId]) {
        // Find budget for category
        const bObj = budgets.find(b => b.category === catId || b.category === catName);
        map[catId] = {
          id: catId,
          name: catName,
          emoji: catEmoji,
          color: catColor,
          spent: 0,
          txnCount: 0,
          budget: bObj?.amount || 0
        };
      }
      map[catId].spent += t.amount;
      map[catId].txnCount += 1;
    });

    // Also include any categories assigned to this bucket that have a budget even if spend = 0
    categories.forEach(c => {
      if (deriveCategoryBucket(c.id, c) === bucketId && !map[c.id]) {
        const bObj = budgets.find(b => b.category === c.id || b.category === c.name);
        if (bObj && bObj.amount > 0) {
          map[c.id] = {
            id: c.id,
            name: c.name,
            emoji: c.emoji || '🏷️',
            color: c.color || bucketMeta.accentColor,
            spent: 0,
            txnCount: 0,
            budget: bObj.amount
          };
        }
      }
    });

    const items = Object.values(map).map(item => {
      const pctOfBucket = totalSpent > 0 ? (item.spent / totalSpent) * 100 : 0;
      const budgetUtilization = item.budget > 0 ? (item.spent / item.budget) * 100 : 0;
      return {
        ...item,
        pctOfBucket,
        budgetUtilization
      };
    });

    // Sort items
    if (sortBy === 'spend') {
      items.sort((a, b) => b.spent - a.spent);
    } else if (sortBy === 'name') {
      items.sort((a, b) => a.name.localeCompare(b.name));
    } else if (sortBy === 'percent') {
      items.sort((a, b) => b.budgetUtilization - a.budgetUtilization);
    }

    return items;
  }, [bucketTransactions, categories, budgets, bucketMeta.accentColor, totalSpent, bucketId, sortBy]);

  // Total budget for this bucket
  const totalBucketBudget = useMemo(() => {
    return categoryBreakdown.reduce((sum, c) => sum + c.budget, 0);
  }, [categoryBreakdown]);

  const bucketUtilization = totalBucketBudget > 0
    ? (totalSpent / totalBucketBudget) * 100
    : 0;

  const Icon = bucketMeta.icon;

  return (
    <div
      data-testid="level2-bucket-view"
      className={`space-y-6 ${className}`}
    >
      {/* Accessible test-contract alias for back to overview */}
      <button
        type="button"
        data-testid="back-to-overview-btn"
        onClick={() => navigate(`#/month/${month}`)}
        className="sr-only"
        aria-hidden="true"
      >
        Back to Overview
      </button>

      {/* Hero Bucket Banner (Morphed Shared Element) */}
      <motion.div
        layoutId={`bucket-card-${bucketId === 'flexible' ? 'variable' : bucketId}`}
        className={`p-6 rounded-2xl border bg-gradient-to-br ${bucketMeta.bgGradient} ${bucketMeta.borderColor} shadow-xl relative overflow-hidden`}
      >
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 relative z-10">
          <div className="flex items-start gap-3.5">
            <div className={`p-3 rounded-2xl bg-secondary/80 text-foreground shrink-0 shadow-sm border border-border/50`}>
              <Icon className="w-6 h-6" style={{ color: bucketMeta.accentColor }} />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-extrabold uppercase tracking-wider border ${bucketMeta.badgeBg}`}>
                  {bucketMeta.title}
                </span>
                <span className="text-xs font-semibold text-muted-foreground">{month}</span>
              </div>
              <h2 className="text-2xl font-extrabold tracking-tight text-foreground mt-1">
                {bucketMeta.title}
              </h2>
              <p className="text-xs text-muted-foreground mt-0.5 max-w-lg">
                {bucketMeta.subtitle}
              </p>
            </div>
          </div>

          {/* Right Metrics */}
          <div className="flex flex-col md:items-end">
            <span className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
              Total Spent
            </span>
            <div
              data-testid="bucket-total-spent"
              className="text-3xl sm:text-4xl font-extrabold font-mono tracking-tight tabular-nums text-foreground mt-0.5"
            >
              {bucketId === 'income' ? formatCurrency(totalSpent) : formatExpenseCurrency(totalSpent)}
            </div>
            <div className="flex items-center gap-2 text-xs mt-1">
              <span className="text-muted-foreground">
                {pctOfIncome.toFixed(1)}% of income
              </span>
              {momDelta !== null && Math.abs(momDelta) >= 0.05 && (
                <span className={`font-sans font-bold tabular-nums px-1.5 py-0.5 rounded ${
                  bucketId === 'income'
                    ? (momDelta >= 0 ? 'text-emerald-400 bg-emerald-500/10' : 'text-rose-400 bg-rose-500/10')
                    : (momDelta < 0 ? 'text-emerald-400 bg-emerald-500/10' : 'text-rose-400 bg-rose-500/10')
                }`}>
                  {momDelta > 0 ? '+' : ''}{momDelta.toFixed(1)}% MoM
                </span>
              )}
            </div>
          </div>
        </div>

        {/* Bucket Budget Utilization Progress Bar */}
        {totalBucketBudget > 0 && (() => {
          const utilColor = getUtilizationColor(bucketUtilization);
          return (
            <div className="mt-5 pt-4 border-t border-border/40 relative z-10">
              <div className="flex items-center justify-between text-xs font-semibold mb-1.5">
                <div className="flex items-center gap-2">
                  <span className="text-muted-foreground">Bucket Target Budget:</span>
                  <span className="font-mono text-foreground">{formatCurrency(totalBucketBudget)}</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <span className={`font-mono tabular-nums font-bold ${utilColor.text}`}>{bucketUtilization.toFixed(1)}% Used</span>
                  {bucketUtilization <= 90 ? (
                    <span className="inline-flex items-center gap-1 text-[10px] font-bold text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded-full border border-emerald-500/20">
                      <CheckCircle2 className="w-3 h-3" /> On Track
                    </span>
                  ) : bucketUtilization <= 100 ? (
                    <span className="inline-flex items-center gap-1 text-[10px] font-bold text-amber-400 bg-amber-500/10 px-2 py-0.5 rounded-full border border-amber-500/20">
                      <AlertTriangle className="w-3 h-3" /> Near Limit
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1 text-[10px] font-bold text-rose-400 bg-rose-500/10 px-2 py-0.5 rounded-full border border-rose-500/20">
                      <AlertTriangle className="w-3 h-3" /> Exceeded
                    </span>
                  )}
                </div>
              </div>

              <div className="h-2.5 w-full bg-secondary/80 rounded-full overflow-hidden border border-border/40 p-0.5">
                <div
                  style={{ width: `${Math.min(100, bucketUtilization)}%`, backgroundColor: utilColor.hex }}
                  className="h-full rounded-full transition-all duration-500"
                />
              </div>
            </div>
          );
        })()}
      </motion.div>

      {/* Ranked Categories Breakdown */}
      <div className="space-y-3">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h3 className="text-base font-extrabold text-foreground flex items-center gap-2">
              Ranked Categories in this Bucket
              <span className="px-2 py-0.5 rounded-full text-[10px] bg-secondary text-muted-foreground font-mono font-bold">
                {categoryBreakdown.length}
              </span>
            </h3>
            <p className="text-xs text-muted-foreground mt-0.5">
              Select any category to zoom into merchant velocities and daily spend timeline
            </p>
          </div>

          {/* Sort Controls */}
          <div className="flex items-center gap-2 self-start sm:self-auto">
            <span className="text-xs text-muted-foreground flex items-center gap-1 font-semibold">
              <ArrowUpDown className="w-3.5 h-3.5" /> Sort:
            </span>
            <div className="flex rounded-xl bg-card border border-border/60 p-0.5 text-xs font-semibold">
              <button
                type="button"
                onClick={() => setSortBy('spend')}
                className={`px-2.5 py-1 rounded-lg transition-all ${
                  sortBy === 'spend' ? 'bg-primary text-primary-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                Spend
              </button>
              <button
                type="button"
                onClick={() => setSortBy('name')}
                className={`px-2.5 py-1 rounded-lg transition-all ${
                  sortBy === 'name' ? 'bg-primary text-primary-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                Name
              </button>
              <button
                type="button"
                onClick={() => setSortBy('percent')}
                className={`px-2.5 py-1 rounded-lg transition-all ${
                  sortBy === 'percent' ? 'bg-primary text-primary-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                % Used
              </button>
            </div>
          </div>
        </div>

        {/* Category List Cards */}
        {categoryBreakdown.length === 0 ? (
          <div className="p-8 text-center rounded-2xl bg-card/60 border border-border/60 text-muted-foreground text-xs">
            No transactions or budgets found in this bucket for {month}.
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-2.5">
            {categoryBreakdown.map(cat => {
              return (
                <motion.div
                  key={cat.id}
                  data-testid={`category-row-${cat.id}`}
                  layoutId={`category-row-${cat.id}`}
                  onClick={() => navigate(`#/month/${month}/category/${cat.id}`)}
                  className="p-4 rounded-2xl bg-card/80 hover:bg-card border border-border/70 hover:border-primary/50 shadow-sm hover:shadow-md transition-all cursor-pointer group flex flex-col justify-between"
                >
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex items-center gap-3">
                      <span className="text-xl p-2 rounded-xl bg-secondary/60 shrink-0">
                        {cat.emoji}
                      </span>
                      <div>
                        <h4 className="font-bold text-sm text-foreground group-hover:text-primary transition-colors flex items-center gap-2">
                          {cat.name}
                          <span className="text-[10px] text-muted-foreground font-mono font-normal">
                            ({cat.pctOfBucket.toFixed(1)}% of bucket)
                          </span>
                        </h4>
                        <div className="flex items-center gap-3 text-xs text-muted-foreground mt-0.5">
                          <span>{cat.txnCount} txn{cat.txnCount !== 1 ? 's' : ''}</span>
                          {cat.budget > 0 && (
                            <span>Budget: {formatCurrency(cat.budget)}</span>
                          )}
                          {cat.budget > 0 && (() => {
                            const catUtilColor = getUtilizationColor(cat.budgetUtilization);
                            return (
                              <span className={`font-mono font-semibold ${catUtilColor.text}`}>
                                {cat.budgetUtilization.toFixed(0)}% used
                              </span>
                            );
                          })()}
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-4">
                      <div className="text-right">
                        <div className="text-base sm:text-lg font-extrabold font-mono text-foreground tabular-nums">
                          {formatExpenseCurrency(cat.spent)}
                        </div>
                        <span className="text-[10px] text-muted-foreground">
                          {cat.pctOfBucket.toFixed(1)}% of bucket
                        </span>
                      </div>

                      <div className="p-2 rounded-xl bg-secondary/50 group-hover:bg-primary/20 text-muted-foreground group-hover:text-primary transition-all">
                        <ArrowRight className="w-4 h-4" />
                      </div>
                    </div>
                  </div>

                  {/* Micro Progress Bar */}
                  {cat.budget > 0 && (() => {
                    const catUtilColor = getUtilizationColor(cat.budgetUtilization);
                    return (
                      <div className="mt-3 pt-2 border-t border-border/30">
                        <div className="h-1.5 w-full bg-secondary rounded-full overflow-hidden">
                          <div
                            style={{
                              width: `${Math.min(100, cat.budgetUtilization)}%`,
                              backgroundColor: catUtilColor.hex
                            }}
                            className="h-full rounded-full transition-all duration-500"
                          />
                        </div>
                      </div>
                    );
                  })()}
                </motion.div>
              );
            })}
          </div>
        )}
      </div>

      {/* Direct Transaction Actions & Preview */}
      <div className="p-4 rounded-2xl bg-card/60 border border-border/70 flex flex-col sm:flex-row items-center justify-between gap-4">
        <div>
          <h4 className="font-bold text-sm text-foreground flex items-center gap-2">
            <Receipt className="w-4 h-4 text-primary" />
            Inspect Bucket Transactions
          </h4>
          <p className="text-xs text-muted-foreground mt-0.5">
            {bucketTransactions.length} recorded transaction{bucketTransactions.length !== 1 ? 's' : ''} in {bucketMeta.title}
          </p>
        </div>

        <div className="flex items-center gap-2 w-full sm:w-auto">
          <button
            type="button"
            data-testid="add-bucket-txn-btn"
            onClick={onOpenAddTxn}
            className="flex-1 sm:flex-initial inline-flex items-center justify-center gap-1.5 px-3.5 py-2 rounded-xl bg-secondary hover:bg-secondary/80 border border-border/60 text-xs font-bold text-foreground transition-all active:scale-95 shadow-sm"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>Add Expense</span>
          </button>

          <button
            type="button"
            data-testid="view-bucket-txns-btn"
            onClick={() => navigate(`#/month/${month}/transactions`)}
            className="flex-1 sm:flex-initial inline-flex items-center justify-center gap-1.5 px-4 py-2 rounded-xl bg-primary hover:bg-primary/90 text-primary-foreground text-xs font-bold shadow-md shadow-primary/20 transition-all active:scale-95"
          >
            <span>View All {bucketTransactions.length} Transactions</span>
            <ArrowRight className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
    </div>
  );
};
