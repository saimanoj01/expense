import React, { useState, useMemo } from 'react';
import { motion } from 'framer-motion';
import {
  ArrowLeft,
  ArrowRight,
  Search,
  Plus,
  Receipt,
  Store,
  Calendar,
  CheckCircle2,
  AlertTriangle,
  Edit2,
  Trash2,
  Tag
} from 'lucide-react';
import { Transaction, Category, Budget, SpendingBucket, DEFAULT_CATEGORIES } from '../../services/storage';
import { useNavigation } from '../../hooks/useNavigation';
import { formatCurrency, formatExpenseCurrency } from '../../utils/formatters';
import { suggestSpendingBucket } from '../../utils/categorizer';
import { DailySpendTimeline } from './DailySpendTimeline';

export interface Level3CategoryViewProps {
  categoryId: string;
  month: string;
  transactions: Transaction[];
  categories: Category[];
  budgets: Budget[];
  onOpenAddTxn: () => void;
  onEditTxn?: (txn: Transaction) => void;
  onDeleteTxn?: (id: string) => void;
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

export const Level3CategoryView: React.FC<Level3CategoryViewProps> = ({
  categoryId,
  month,
  transactions,
  categories,
  budgets,
  onOpenAddTxn,
  onEditTxn,
  onDeleteTxn,
  className = ''
}) => {
  const { navigate } = useNavigation();
  const [searchTerm, setSearchTerm] = useState('');

  // Find category metadata
  const isKnownCategory = useMemo(() => {
    const lower = categoryId.toLowerCase();
    return (
      categories.some(c => c.id.toLowerCase() === lower || c.name.toLowerCase() === lower) ||
      DEFAULT_CATEGORIES.some(c => c.id.toLowerCase() === lower || c.name.toLowerCase() === lower)
    );
  }, [categories, categoryId]);

  const category = useMemo(() => {
    const match = categories.find(c => 
      c.id.toLowerCase() === categoryId.toLowerCase() ||
      c.name.toLowerCase() === categoryId.toLowerCase()
    ) || DEFAULT_CATEGORIES.find(c =>
      c.id.toLowerCase() === categoryId.toLowerCase() ||
      c.name.toLowerCase() === categoryId.toLowerCase()
    );
    if (match) return match;

    return {
      id: categoryId,
      name: categoryId.charAt(0).toUpperCase() + categoryId.slice(1),
      emoji: '🏷️',
      color: '#6366F1'
    };
  }, [categories, categoryId]);

  // Determine bucket
  const bucketId: SpendingBucket = useMemo(() => {
    if (category.defaultBucket) return category.defaultBucket as SpendingBucket;
    return suggestSpendingBucket('', category.id);
  }, [category]);

  // Find budget for this category
  const budget = useMemo(() => {
    const bObj = budgets.find(b => 
      b.category.toLowerCase() === category.id.toLowerCase() ||
      b.category.toLowerCase() === category.name.toLowerCase()
    );
    return bObj?.amount || 0;
  }, [budgets, category]);

  // Filter category transactions for this month
  const categoryTransactions = useMemo(() => {
    return transactions.filter(t => {
      const matchCat = (t.category || '').toLowerCase() === category.id.toLowerCase() ||
                       (t.category || '').toLowerCase() === category.name.toLowerCase() ||
                       (t.subCategory || '').toLowerCase() === category.id.toLowerCase();
      return matchCat && t.type === 'expense';
    });
  }, [transactions, category]);

  const totalSpent = useMemo(() => {
    return categoryTransactions.reduce((sum, t) => sum + (Number(t.amount) || 0), 0);
  }, [categoryTransactions]);

  const remainingBudget = Math.max(0, budget - totalSpent);
  const utilization = budget > 0 ? (totalSpent / budget) * 100 : 0;
  const isOverBudget = budget > 0 && totalSpent > budget;

  // Merchant / Payee breakdown
  const merchantBreakdown = useMemo(() => {
    const map: Record<string, { name: string; amount: number; count: number }> = {};

    categoryTransactions.forEach(t => {
      // Clean description to payee name
      let payee = (t.description || 'Other').trim();
      // Remove trailing dates or numbers if common
      payee = payee.replace(/\s+#\d+$/, '').replace(/\s+\d{2}\/\d{2}$/, '');
      if (!payee) payee = 'Unspecified Payee';

      if (!map[payee]) {
        map[payee] = { name: payee, amount: 0, count: 0 };
      }
      map[payee].amount += Number(t.amount) || 0;
      map[payee].count += 1;
    });

    const list = Object.values(map).map(m => ({
      ...m,
      pctOfTotal: totalSpent > 0 ? (m.amount / totalSpent) * 100 : 0
    }));

    list.sort((a, b) => b.amount - a.amount);
    return list;
  }, [categoryTransactions, totalSpent]);

  // Filtered transactions for search
  const filteredTxns = useMemo(() => {
    if (!searchTerm.trim()) return categoryTransactions;
    const term = searchTerm.toLowerCase();
    return categoryTransactions.filter(t =>
      t.description.toLowerCase().includes(term) ||
      (t.notes && t.notes.toLowerCase().includes(term)) ||
      (t.labels && t.labels.some(l => l.toLowerCase().includes(term)))
    );
  }, [categoryTransactions, searchTerm]);

  if (!isKnownCategory && categoryTransactions.length === 0 && budget === 0) {
    return (
      <div
        data-testid="level3-category-view"
        className={`space-y-6 ${className}`}
      >
        <div className="p-6 rounded-2xl bg-card border border-border space-y-3">
          <h2 className="text-xl font-bold text-foreground">Category not found</h2>
          <p className="text-xs text-muted-foreground">
            The category &ldquo;{categoryId}&rdquo; does not exist in this project.
          </p>
          <button
            type="button"
            data-testid="back-to-bucket-btn"
            onClick={() => navigate(`#/month/${month}`)}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-secondary hover:bg-secondary/80 border border-border text-xs font-semibold text-foreground transition-colors"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            <span>Back to Overview</span>
          </button>
        </div>
      </div>
    );
  }

  return (
    <div
      data-testid="level3-category-view"
      className={`space-y-6 ${className}`}
    >
      {/* Top Navigation & Return */}
      <div className="flex items-center justify-between gap-3">
        <button
          type="button"
          data-testid="back-to-bucket-btn"
          onClick={() => navigate(`#/month/${month}/bucket/${bucketId === 'flexible' ? 'variable' : bucketId}`)}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-card hover:bg-secondary border border-border/60 text-xs font-semibold text-muted-foreground hover:text-foreground transition-all active:scale-95 shadow-sm"
        >
          <ArrowLeft className="w-3.5 h-3.5" />
          <span>Back to {bucketId === 'flexible' ? 'Variable Spending' : bucketId.charAt(0).toUpperCase() + bucketId.slice(1)}</span>
        </button>
      </div>

      {/* Hero Category Header Card */}
      <motion.div
        layoutId={`category-row-${category.id}`}
        className="p-6 rounded-2xl border border-border/70 bg-gradient-to-br from-card/95 via-card/85 to-card/95 backdrop-blur-xl shadow-xl relative overflow-hidden"
      >
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 relative z-10">
          <div className="flex items-start gap-4">
            <span className="text-3xl p-3.5 rounded-2xl bg-secondary/80 border border-border/60 shrink-0 shadow-sm">
              {category.emoji}
            </span>
            <div>
              <div className="flex items-center gap-2">
                <span className="px-2.5 py-0.5 rounded-full text-[10px] font-extrabold uppercase tracking-wider bg-primary/15 text-primary border border-primary/20">
                  {bucketId === 'flexible' ? 'Variable Spending' : bucketId.charAt(0).toUpperCase() + bucketId.slice(1)}
                </span>
                <span className="text-xs font-semibold text-muted-foreground">{month}</span>
              </div>
              <h2 className="text-2xl font-extrabold tracking-tight text-foreground mt-1">
                {category.name}
              </h2>
              <p className="text-xs text-muted-foreground mt-0.5">
                {categoryTransactions.length} recorded transaction{categoryTransactions.length !== 1 ? 's' : ''} this month
              </p>
            </div>
          </div>

          {/* Right Figures: Spent & Pacing */}
          <div className="flex flex-col md:items-end">
            <span className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
              Total Spent
            </span>
            <div
              data-testid="category-total-spent"
              className="text-3xl sm:text-4xl font-extrabold font-mono tracking-tight tabular-nums text-foreground mt-0.5"
            >
              {formatExpenseCurrency(totalSpent)}
            </div>

            {budget > 0 && (() => {
              const utilColor = getUtilizationColor(utilization);
              return (
                <div className="flex items-center gap-2 text-xs mt-1">
                  <span className="text-muted-foreground font-mono">
                    of {formatCurrency(budget)} budget
                  </span>
                  <span className={`inline-flex items-center gap-1 font-bold px-2 py-0.5 rounded-full text-[10px] border ${utilColor.bg} ${utilColor.text} ${utilColor.border}`}>
                    {isOverBudget ? <AlertTriangle className="w-3 h-3" /> : <CheckCircle2 className="w-3 h-3" />}
                    <span>{utilization.toFixed(0)}% used</span>
                  </span>
                </div>
              );
            })()}
          </div>
        </div>

        {/* Budget Pacing Progress Bar */}
        {budget > 0 && (() => {
          const utilColor = getUtilizationColor(utilization);
          return (
            <div className="mt-5 pt-4 border-t border-border/40 relative z-10">
              <div className="flex items-center justify-between text-xs font-semibold mb-1.5">
                <span className="text-muted-foreground">Budget Pacing:</span>
                <span className="font-mono text-foreground">
                  {isOverBudget
                    ? `Over budget by ${formatCurrency(totalSpent - budget)}`
                    : `${formatCurrency(remainingBudget)} remaining`}
                </span>
              </div>
              <div className="h-2.5 w-full bg-secondary/80 rounded-full overflow-hidden border border-border/40 p-0.5">
                <div
                  style={{
                    width: `${Math.min(100, utilization)}%`,
                    backgroundColor: utilColor.hex
                  }}
                  className="h-full rounded-full transition-all duration-500"
                />
              </div>
            </div>
          );
        })()}
      </motion.div>

      {/* Row 2: Daily Spending Velocity Timeline */}
      <DailySpendTimeline
        month={month}
        transactions={categoryTransactions}
        budget={budget}
        color={category.color || '#6366F1'}
      />

      {/* Row 3: Top Payees / Merchants Breakdown */}
      <div
        data-testid="top-merchants-breakdown"
        className="p-5 rounded-2xl bg-card border border-border/70 shadow-sm space-y-3"
      >
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="p-1.5 rounded-lg bg-primary/10 text-primary">
              <Store className="w-4 h-4" />
            </div>
            <h3 className="text-sm font-extrabold text-foreground">
              Top Payees & Merchants
            </h3>
          </div>
          <span className="text-[10px] text-muted-foreground font-mono">
            {merchantBreakdown.length} unique payee{merchantBreakdown.length !== 1 ? 's' : ''}
          </span>
        </div>

        {merchantBreakdown.length === 0 ? (
          <div className="p-4 text-center text-xs text-muted-foreground">
            No merchant transactions recorded.
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5">
            {merchantBreakdown.slice(0, 6).map((m, idx) => (
              <div
                key={m.name}
                className="p-3 rounded-xl bg-secondary/40 border border-border/50 flex flex-col justify-between"
              >
                <div className="flex items-center justify-between gap-2 mb-1">
                  <span className="text-xs font-bold text-foreground truncate max-w-[160px]" title={m.name}>
                    {idx + 1}. {m.name}
                  </span>
                  <span className="text-[10px] text-muted-foreground font-mono">
                    {m.count} txn{m.count !== 1 ? 's' : ''}
                  </span>
                </div>
                <div className="flex items-baseline justify-between mt-1">
                  <span className="text-sm font-extrabold font-mono tabular-nums text-foreground">
                    {formatExpenseCurrency(m.amount)}
                  </span>
                  <span className="text-[10px] text-muted-foreground font-mono font-semibold">
                    {m.pctOfTotal.toFixed(1)}%
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Row 4: Category Transactions Ledger Preview */}
      <div className="p-5 rounded-2xl bg-card border border-border/70 shadow-sm space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h3 className="text-sm font-extrabold text-foreground flex items-center gap-2">
              <Receipt className="w-4 h-4 text-primary" />
              Category Transactions
            </h3>
            <p className="text-xs text-muted-foreground mt-0.5">
              Filtered transactions for {category.name} in {month}
            </p>
          </div>

          <div className="flex items-center gap-2">
            {/* Search filter input */}
            <div className="relative">
              <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none" />
              <input
                type="text"
                data-testid="category-txn-search"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder="Search description, tag..."
                className="pl-8 pr-3 py-1.5 rounded-xl bg-secondary/60 border border-border/60 text-xs text-foreground placeholder:text-muted-foreground/60 outline-none focus:ring-2 focus:ring-primary w-48 transition-all"
              />
            </div>

            <button
              type="button"
              data-testid="add-category-txn-btn"
              onClick={onOpenAddTxn}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-primary hover:bg-primary/90 text-primary-foreground text-xs font-bold shadow-sm transition-all active:scale-95"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Add</span>
            </button>
          </div>
        </div>

        {/* Transactions Table/Cards */}
        {filteredTxns.length === 0 ? (
          <div className="p-6 text-center text-xs text-muted-foreground">
            {searchTerm ? `No transactions match "${searchTerm}".` : 'No transactions recorded for this category.'}
          </div>
        ) : (
          <div className="divide-y divide-border/40 border border-border/40 rounded-xl overflow-hidden bg-card/60">
            {filteredTxns.map(t => (
              <div
                key={t.id}
                data-testid={`category-txn-${t.id}`}
                role={onEditTxn ? 'button' : undefined}
                tabIndex={onEditTxn ? 0 : undefined}
                onClick={() => onEditTxn && onEditTxn(t)}
                onKeyDown={e => {
                  if (onEditTxn && (e.key === 'Enter' || e.key === ' ')) {
                    e.preventDefault();
                    onEditTxn(t);
                  }
                }}
                className="p-3 flex items-center justify-between gap-3 hover:bg-secondary/40 transition-colors focus-visible:ring-2 focus-visible:ring-primary/40 outline-none"
              >
                <div className="flex items-center gap-3">
                  <div className="p-2 rounded-xl bg-secondary/60 text-muted-foreground shrink-0">
                    <Calendar className="w-3.5 h-3.5" />
                  </div>
                  <div>
                    <h5 className="text-xs font-bold text-foreground">
                      {t.description || category.name}
                    </h5>
                    <div className="flex items-center gap-2 text-[10px] text-muted-foreground mt-0.5">
                      <span>{t.date}</span>
                      {t.labels && t.labels.length > 0 && (
                        <div className="flex items-center gap-1">
                          <Tag className="w-2.5 h-2.5" />
                          <span>{t.labels.join(', ')}</span>
                        </div>
                      )}
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-3">
                  <span className="font-mono font-extrabold text-xs sm:text-sm text-foreground tabular-nums">
                    {formatExpenseCurrency(t.amount)}
                  </span>

                  <div className="flex items-center gap-1">
                    {onEditTxn && (
                      <button
                        type="button"
                        onClick={() => onEditTxn(t)}
                        title="Edit Transaction"
                        className="p-1 rounded-lg hover:bg-secondary text-muted-foreground hover:text-foreground transition-all"
                      >
                        <Edit2 className="w-3.5 h-3.5" />
                      </button>
                    )}
                    {onDeleteTxn && (
                      <button
                        type="button"
                        onClick={() => onDeleteTxn(t.id)}
                        title="Delete Transaction"
                        className="p-1 rounded-lg hover:bg-rose-500/10 text-muted-foreground hover:text-rose-400 transition-all"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* CTA to Full Ledger */}
        <div className="pt-2 flex justify-end">
          <button
            type="button"
            data-testid="view-category-ledger-btn"
            onClick={() => navigate(`#/month/${month}/transactions`)}
            className="inline-flex items-center gap-1.5 text-xs font-bold text-primary hover:text-primary/80 transition-colors"
          >
            <span>View Full Transaction Ledger (Level 4)</span>
            <ArrowRight className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
    </div>
  );
};
