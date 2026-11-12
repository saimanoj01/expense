import React, { useState, useMemo } from 'react';
import { motion } from 'framer-motion';
import { ArrowRight, Search, Plus, Edit2, Trash2 } from 'lucide-react';
import { Transaction, Category, Budget, SpendingBucket, MonthlyLock, DEFAULT_CATEGORIES } from '../../services/storage';
import { useNavigation } from '../../hooks/useNavigation';
import { formatMoney, splitMoneyParts } from '../../utils/formatters';
import { deriveCategoryBucket, isRefundTransaction } from '../../utils/metrics';
import { DailySpendTimeline } from './DailySpendTimeline';
import { BUCKETS, bucketColor, negativeColor } from '../../theme/buckets';
import { spring } from '../../theme/motion';
import { RollingNumber } from '../motion/RollingNumber';
import {
  resolveTransactionAccount,
  formatAccountDisplay,
  getVisibleUserTags,
  isTransactionMonthLocked,
} from '../../utils/transactionTaxonomy';

export interface Level3CategoryViewProps {
  categoryId: string;
  month: string;
  transactions: Transaction[];
  categories: Category[];
  budgets: Budget[];
  locks?: MonthlyLock[];
  onOpenAddTxn: () => void;
  onEditTxn?: (txn: Transaction) => void;
  onDeleteTxn?: (id: string) => void;
  className?: string;
}

function formatDayGroupHeader(dateStr: string): string {
  if (!dateStr || !/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) return dateStr || 'Recent';
  const [y, m, d] = dateStr.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  return dt
    .toLocaleDateString('en-US', {
      weekday: 'short',
      month: 'short',
      day: 'numeric',
      timeZone: 'UTC',
    })
    .toUpperCase();
}

export const Level3CategoryView: React.FC<Level3CategoryViewProps> = ({
  categoryId,
  month,
  transactions,
  categories,
  budgets,
  locks = [],
  onOpenAddTxn,
  onEditTxn,
  onDeleteTxn,
  className = '',
}) => {
  const { navigate } = useNavigation();
  const [searchTerm, setSearchTerm] = useState('');
  const isCategoryMonthLocked =
    month !== 'all' && isTransactionMonthLocked(`${month}-01`, locks);

  const isKnownCategory = useMemo(() => {
    const lower = categoryId.toLowerCase();
    return (
      categories.some(c => c.id.toLowerCase() === lower || c.name.toLowerCase() === lower) ||
      DEFAULT_CATEGORIES.some(c => c.id.toLowerCase() === lower || c.name.toLowerCase() === lower)
    );
  }, [categories, categoryId]);

  const category = useMemo(() => {
    const match =
      categories.find(
        c =>
          c.id.toLowerCase() === categoryId.toLowerCase() ||
          c.name.toLowerCase() === categoryId.toLowerCase()
      ) ||
      DEFAULT_CATEGORIES.find(
        c =>
          c.id.toLowerCase() === categoryId.toLowerCase() ||
          c.name.toLowerCase() === categoryId.toLowerCase()
      );
    if (match) return match;

    return {
      id: categoryId,
      name: categoryId.charAt(0).toUpperCase() + categoryId.slice(1),
      emoji: '🏷️',
      color: bucketColor('fixed'),
    };
  }, [categories, categoryId]);

  const bucketId: SpendingBucket = useMemo(
    () => deriveCategoryBucket(category.id || category.name, category),
    [category]
  );

  const bucketRouteSlug = bucketId === 'flexible' ? 'variable' : bucketId;
  const bucketLabel = BUCKETS[bucketId]?.label || 'Variable';
  const accentColor = bucketColor(bucketId);

  const budget = useMemo(() => {
    const bObj = budgets.find(
      b =>
        b.category.toLowerCase() === category.id.toLowerCase() ||
        b.category.toLowerCase() === category.name.toLowerCase()
    );
    return Number(bObj?.amount) || 0;
  }, [budgets, category]);

  const categoryTransactions = useMemo(() => {
    return transactions.filter(t => {
      const matchMonth = month === 'all' || (t.date && t.date.startsWith(month));
      if (!matchMonth) return false;
      const matchCat =
        (t.category || '').toLowerCase() === category.id.toLowerCase() ||
        (t.category || '').toLowerCase() === category.name.toLowerCase() ||
        (t.subCategory || '').toLowerCase() === category.id.toLowerCase();
      return matchCat && (t.type === 'expense' || isRefundTransaction(t));
    });
  }, [transactions, month, category]);

  const totalSpent = useMemo(() => {
    return Math.max(
      0,
      categoryTransactions.reduce(
        (sum, t) =>
          sum + (isRefundTransaction(t) ? -(Number(t.amount) || 0) : Number(t.amount) || 0),
        0
      )
    );
  }, [categoryTransactions]);

  const remainingBudget = Math.max(0, budget - totalSpent);
  const utilization = budget > 0 ? (totalSpent / budget) * 100 : 0;
  const isOverBudget = budget > 0 && totalSpent > budget;

  // Pace marker & days remaining for current month
  const { pacePct, daysToGo } = useMemo(() => {
    if (!month || !/^\d{4}-\d{2}$/.test(month)) return { pacePct: null, daysToGo: null };
    const now = new Date();
    const currKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    if (month !== currKey) return { pacePct: null, daysToGo: null };
    const [yStr, mStr] = month.split('-');
    const daysInMonth = new Date(parseInt(yStr, 10), parseInt(mStr, 10), 0).getDate();
    return {
      pacePct: Math.min(98, Math.max(2, (now.getDate() / daysInMonth) * 100)),
      daysToGo: Math.max(0, daysInMonth - now.getDate()),
    };
  }, [month]);

  // Top 5 merchants (net of refunds)
  const merchantBreakdown = useMemo(() => {
    const map: Record<string, { name: string; amount: number; count: number }> = {};

    categoryTransactions.forEach(t => {
      let payee = (t.description || 'Other').trim();
      payee = payee.replace(/\s+#\d+$/, '').replace(/\s+\d{2}\/\d{2}$/, '');
      if (!payee) payee = 'Unspecified Payee';

      if (!map[payee]) {
        map[payee] = { name: payee, amount: 0, count: 0 };
      }
      const amt = Number(t.amount) || 0;
      map[payee].amount += isRefundTransaction(t) ? -amt : amt;
      if (!isRefundTransaction(t)) {
        map[payee].count += 1;
      }
    });

    const list = Object.values(map).filter(m => m.amount > 0);
    list.sort((a, b) => b.amount - a.amount);
    return list.slice(0, 5);
  }, [categoryTransactions]);

  // Filtered & day-grouped transactions
  const filteredTxns = useMemo(() => {
    const base = [...categoryTransactions].sort((a, b) =>
      (b.date || '').localeCompare(a.date || '')
    );
    if (!searchTerm.trim()) return base;
    const term = searchTerm.toLowerCase();
    return base.filter(
      t =>
        t.description.toLowerCase().includes(term) ||
        (t.notes && t.notes.toLowerCase().includes(term)) ||
        (t.labels && t.labels.some(l => l.toLowerCase().includes(term)))
    );
  }, [categoryTransactions, searchTerm]);

  const groupedTxns = useMemo(() => {
    const groups: { date: string; txns: Transaction[]; dayTotal: number }[] = [];
    filteredTxns.forEach(t => {
      const d = t.date || '';
      const rawAmt = Number(t.amount) || 0;
      const amt = isRefundTransaction(t) ? -rawAmt : rawAmt;
      const last = groups[groups.length - 1];
      if (!last || last.date !== d) {
        groups.push({ date: d, txns: [t], dayTotal: amt });
      } else {
        last.txns.push(t);
        last.dayTotal += amt;
      }
    });
    return groups;
  }, [filteredTxns]);

  const heroParts = splitMoneyParts(totalSpent);

  if (categories.length > 0 && !isKnownCategory && categoryTransactions.length === 0 && budget === 0) {
    return (
      <div
        data-testid="level3-category-view"
        className={`max-w-[1120px] mx-auto py-8 space-y-4 ${className}`}
      >
        <p className="text-heading text-foreground">Category not found</p>
        <p className="text-body text-muted-foreground">
          No category or recorded activity matches "{categoryId}".
        </p>
        <button
          type="button"
          data-testid="back-to-bucket-btn"
          onClick={() => navigate(`#/month/${month}`)}
          className="px-3.5 py-1.5 rounded-[10px] bg-surface2 hover:bg-secondary border border-border text-body font-medium text-foreground transition-colors"
        >
          ← Back to Overview
        </button>
      </div>
    );
  }

  return (
    <div
      data-testid="level3-category-view"
      className={`max-w-[1120px] mx-auto space-y-6 pb-6 ${className}`}
    >
      {/* Bare Category Hero */}
      <div className="space-y-3 pt-1">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-full bg-surface2 flex items-center justify-center text-xl shrink-0">
            <motion.span
              layoutId={`cat-emoji-${category.id}`}
              layout="position"
              transition={spring}
            >
              {category.emoji}
            </motion.span>
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-2 text-label text-muted-foreground">
              <span
                className="w-2 h-2 rounded-full shrink-0"
                style={{ backgroundColor: accentColor }}
              />
              <button
                type="button"
                data-testid="back-to-bucket-btn"
                onClick={() => navigate(`#/month/${month}/bucket/${bucketRouteSlug}`)}
                className="hover:text-foreground transition-colors focus-visible:ring-2 ring-ring/40 rounded"
              >
                {bucketLabel}
              </button>
            </div>
            <h2 className="text-title font-semibold tracking-tight text-foreground truncate">
              {category.name}
            </h2>
          </div>
        </div>

        <motion.div
          layoutId={`cat-amount-${category.id}`}
          layout="position"
          transition={spring}
          data-testid="category-total-spent"
          className="text-[36px] leading-[40px] sm:text-display-l font-semibold tracking-tight tabular-nums num text-foreground"
        >
          <RollingNumber value={heroParts.whole} srSuffix={heroParts.cents} />
        </motion.div>

        {budget > 0 ? (
          <div className="space-y-2">
            <p
              className={`text-body tabular-nums num ${
                isOverBudget ? 'text-negative font-medium' : 'text-muted-foreground'
              }`}
            >
              {isOverBudget
                ? `${formatMoney(totalSpent - budget)} over ${formatMoney(budget)} budget`
                : `${formatMoney(remainingBudget)} left of ${formatMoney(budget)}${
                    daysToGo !== null ? ` · ${daysToGo} day${daysToGo === 1 ? '' : 's'} to go` : ''
                  }`}
            </p>
            <div className="relative h-1.5 w-full bg-surface2 rounded-full overflow-hidden">
              <div
                style={{
                  width: `${Math.min(100, utilization)}%`,
                  backgroundColor: isOverBudget ? negativeColor() : accentColor,
                }}
                className="h-full rounded-full"
              />
              {pacePct !== null && (
                <div
                  style={{ left: `${pacePct}%` }}
                  className="absolute top-0 bottom-0 w-[2px] bg-faint pointer-events-none"
                  title="Today's pace"
                />
              )}
            </div>
          </div>
        ) : (
          <p className="text-body text-muted-foreground">
            {categoryTransactions.length} transaction
            {categoryTransactions.length !== 1 ? 's' : ''} this month
          </p>
        )}
      </div>

      {/* Daily Bars Chart */}
      <div className="pt-4 border-t border-border">
        <DailySpendTimeline
          month={month}
          transactions={categoryTransactions}
          budget={budget}
          color={accentColor}
        />
      </div>

      {/* Top 5 Merchants ("Where") */}
      <div
        data-testid="top-merchants-breakdown"
        className="pt-4 border-t border-border space-y-2"
      >
        <h3 className="text-heading text-foreground">Where</h3>
        {merchantBreakdown.length === 0 ? (
          <p className="text-body text-muted-foreground py-2">
            No merchants recorded this month.
          </p>
        ) : (
          <div className="divide-y divide-border/60">
            {merchantBreakdown.map(m => (
              <div
                key={m.name}
                className="min-h-[44px] py-2 flex items-center justify-between gap-3 text-body"
              >
                <div className="flex items-center gap-2 min-w-0">
                  <span className="font-medium text-foreground truncate">{m.name}</span>
                  <span className="text-label text-muted-foreground tabular-nums num shrink-0">
                    {m.count} {m.count === 1 ? 'time' : 'times'}
                  </span>
                </div>
                <span className="font-semibold text-foreground tabular-nums num shrink-0">
                  {formatMoney(m.amount)}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Inline Transactions */}
      <div className="pt-4 border-t border-border space-y-3">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <h3 className="text-heading text-foreground">Transactions</h3>
          <div className="flex items-center gap-2">
            <div className="relative flex-1 sm:flex-initial">
              <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none" />
              <input
                type="text"
                data-testid="category-txn-search"
                value={searchTerm}
                onChange={e => setSearchTerm(e.target.value)}
                placeholder="Search transactions…"
                className="h-8 pl-8 pr-3 rounded-[10px] bg-surface2 border border-border text-label text-foreground placeholder:text-muted-foreground focus-visible:ring-2 ring-ring/40 w-full sm:w-48 transition-colors"
              />
            </div>
            {!isCategoryMonthLocked && (
              <button
                type="button"
                data-testid="add-category-txn-btn"
                onClick={onOpenAddTxn}
                className="h-8 px-2.5 rounded-[10px] bg-surface2 hover:bg-secondary border border-border text-label font-medium text-foreground inline-flex items-center gap-1 transition-colors"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Add</span>
              </button>
            )}
          </div>
        </div>

        {groupedTxns.length === 0 ? (
          <p className="py-6 text-body text-muted-foreground">
            {searchTerm
              ? `No transactions match "${searchTerm}".`
              : 'No transactions recorded for this category.'}
          </p>
        ) : (
          <div className="divide-y divide-border">
            {groupedTxns.map(group => (
              <div key={group.date} className="py-2 first:pt-0">
                <div className="flex items-center justify-between py-1.5 text-label font-semibold text-muted-foreground tabular-nums num">
                  <span>{formatDayGroupHeader(group.date)}</span>
                  <span>
                    {group.dayTotal >= 0
                      ? formatMoney(-group.dayTotal, { cents: true, sign: 'auto' })
                      : formatMoney(Math.abs(group.dayTotal), { cents: true, sign: 'always' })}
                  </span>
                </div>
                <div className="space-y-0.5">
                  {group.txns.map(t => (
                    <div
                      key={t.id}
                      role="button"
                      tabIndex={0}
                      data-testid={`category-txn-${t.id}`}
                      onClick={() => onEditTxn?.(t)}
                      onKeyDown={e => {
                        if (e.key === 'Enter' || e.key === ' ') {
                          e.preventDefault();
                          onEditTxn?.(t);
                        }
                      }}
                      className="min-h-[56px] px-2 -mx-2 py-2 rounded-[10px] hover:bg-surface2 focus-visible:ring-2 ring-ring/40 outline-none transition-colors flex items-center justify-between gap-3 cursor-pointer group"
                    >
                      <div className="flex items-center gap-3 min-w-0 flex-1">
                        <div className="w-8 h-8 rounded-full bg-surface2 flex items-center justify-center shrink-0 text-sm">
                          {category.emoji}
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="text-body font-medium text-foreground truncate">
                            {t.description || category.name}
                          </div>
                          {(() => {
                            const subObj = t.subCategory
                              ? categories.find(c => c.id === t.subCategory) ||
                                DEFAULT_CATEGORIES.find(c => c.id === t.subCategory)
                              : undefined;
                            const accDisplay = formatAccountDisplay(resolveTransactionAccount(t));
                            const visibleTags = getVisibleUserTags(t);
                            const parts: string[] = [];
                            if (subObj) parts.push(subObj.name);
                            if (accDisplay) parts.push(accDisplay);
                            if (visibleTags.length > 0) {
                              parts.push(visibleTags.map(tag => `#${tag}`).join(' '));
                            }
                            if (parts.length === 0) return null;
                            return (
                              <div className="flex items-center gap-1.5 text-label text-muted-foreground truncate">
                                {parts.join(' · ')}
                              </div>
                            );
                          })()}
                        </div>
                      </div>

                      <div className="flex items-center gap-2 shrink-0">
                        {isRefundTransaction(t) && (
                          <span className="px-1.5 py-0.5 rounded bg-bucket-saved/15 text-bucket-saved text-label font-medium">
                            Refund
                          </span>
                        )}
                        <span
                          className={`text-body font-semibold tabular-nums num ${
                            isRefundTransaction(t) ? 'text-bucket-saved' : 'text-foreground'
                          }`}
                        >
                          {isRefundTransaction(t)
                            ? formatMoney(Number(t.amount) || 0, { cents: true, sign: 'always' })
                            : formatMoney(-(Number(t.amount) || 0), { cents: true, sign: 'auto' })}
                        </span>

                        {onEditTxn && !isTransactionMonthLocked(t.date, locks) && (
                          <button
                            type="button"
                            onClick={e => {
                              e.stopPropagation();
                              onEditTxn(t);
                            }}
                            title="Edit Transaction"
                            className="p-1.5 rounded-[8px] hover:bg-secondary text-muted-foreground hover:text-foreground focus-visible:ring-2 ring-ring/40 transition-all"
                          >
                            <Edit2 className="w-3.5 h-3.5" />
                          </button>
                        )}
                        {onDeleteTxn && !isTransactionMonthLocked(t.date, locks) && (
                          <button
                            type="button"
                            onClick={e => {
                              e.stopPropagation();
                              onDeleteTxn(t.id);
                            }}
                            title="Delete Transaction"
                            className="p-1.5 rounded-[8px] hover:bg-negative/10 text-muted-foreground hover:text-negative focus-visible:ring-2 ring-ring/40 transition-all"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}

        <div className="pt-1">
          <button
            type="button"
            data-testid="view-category-ledger-btn"
            onClick={() => navigate(`#/month/${month}/category/${category.id}/transactions`)}
            className="inline-flex items-center gap-1.5 text-body font-medium text-muted-foreground hover:text-foreground transition-colors focus-visible:ring-2 ring-ring/40 rounded px-1 -mx-1"
          >
            <span>Open in Transactions</span>
            <ArrowRight className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  );
};
