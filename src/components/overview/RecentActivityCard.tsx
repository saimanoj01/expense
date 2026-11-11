import React, { useMemo } from 'react';
import { DEFAULT_CATEGORIES } from '../../services/storage';
import type { Transaction, Category } from '../../services/storage';
import { useNavigation } from '../../hooks/useNavigation';
import { formatTransactionAmount } from '../../utils/formatters';
import { isRefundTransaction } from '../../utils/metrics';
import {
  resolveTransactionAccount,
  formatAccountDisplay,
  isTransactionPending,
  isTransactionNeedsReview,
} from '../../utils/transactionTaxonomy';

export interface RecentActivityCardProps {
  selectedMonth: string;
  allTransactions: Transaction[];
  categories: Category[];
  duplicateTxnIds?: Set<string>;
  isLockedMonth?: boolean;
  onEditTxn?: (txn: Transaction) => void;
  onOpenAddTxn?: () => void;
  className?: string;
}

const SHORT_MONTHS = [
  'Jan',
  'Feb',
  'Mar',
  'Apr',
  'May',
  'Jun',
  'Jul',
  'Aug',
  'Sep',
  'Oct',
  'Nov',
  'Dec',
];

function formatShortTxnDate(dateStr?: string, includeYear = false): string {
  if (!dateStr || dateStr.length < 10) return dateStr || '';
  const y = dateStr.slice(0, 4);
  const mIdx = parseInt(dateStr.slice(5, 7), 10) - 1;
  const d = parseInt(dateStr.slice(8, 10), 10);
  if (mIdx >= 0 && mIdx < 12 && !isNaN(d)) {
    return includeYear ? `${SHORT_MONTHS[mIdx]} ${d}, ${y}` : `${SHORT_MONTHS[mIdx]} ${d}`;
  }
  return dateStr;
}

export const RecentActivityCard: React.FC<RecentActivityCardProps> = ({
  selectedMonth,
  allTransactions,
  categories,
  duplicateTxnIds,
  isLockedMonth = false,
  onEditTxn,
  onOpenAddTxn,
  className = '',
}) => {
  const { navigate } = useNavigation();

  const catLookup = useMemo(() => {
    const map = new Map<string, { name: string; emoji: string }>();
    for (const c of DEFAULT_CATEGORIES) {
      map.set(c.id.toLowerCase(), { name: c.name, emoji: c.emoji });
      map.set(c.name.toLowerCase(), { name: c.name, emoji: c.emoji });
    }
    for (const c of categories) {
      map.set(c.id.toLowerCase(), { name: c.name, emoji: c.emoji });
      map.set(c.name.toLowerCase(), { name: c.name, emoji: c.emoji });
    }
    return map;
  }, [categories]);

  const { recentFive, nonTransferCount } = useMemo(() => {
    const scoped = allTransactions.filter(
      t =>
        t.type !== 'transfer' &&
        (selectedMonth === 'all' || (t.date && t.date.startsWith(selectedMonth)))
    );
    const sorted = [...scoped].sort(
      (a, b) =>
        (b.date || '').localeCompare(a.date || '') ||
        (b.id || '').localeCompare(a.id || '')
    );
    return {
      recentFive: sorted.slice(0, 5),
      nonTransferCount: scoped.length,
    };
  }, [allTransactions, selectedMonth]);

  return (
    <div
      data-testid="overview-recent-activity"
      className={`space-y-1.5 lg:border-l lg:border-border lg:pl-6 ${className}`}
    >
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-heading text-foreground">Recent activity</h3>
        <button
          type="button"
          data-testid="overview-view-all-txns-btn"
          onClick={() => navigate(`#/transactions?month=${selectedMonth}`)}
          className="text-label font-medium text-muted-foreground hover:text-foreground tabular-nums num transition-colors focus-visible:ring-2 ring-ring/40 rounded px-1 -mx-1"
        >
          All {nonTransferCount} →
        </button>
      </div>

      {recentFive.length === 0 ? (
        <div className="py-2 text-label text-muted-foreground flex flex-wrap items-center gap-2">
          <span>No transactions recorded for this period yet.</span>
          {!isLockedMonth && onOpenAddTxn && (
            <button
              type="button"
              onClick={onOpenAddTxn}
              className="text-foreground font-medium underline underline-offset-4 hover:opacity-80"
            >
              + Add transaction
            </button>
          )}
        </div>
      ) : (
        <div className="divide-y divide-border/50">
          {recentFive.map(t => {
            const catMeta =
              catLookup.get((t.subCategory || '').toLowerCase()) ||
              catLookup.get((t.category || '').toLowerCase());
            const emoji = catMeta?.emoji || (t.type === 'income' ? '💰' : '🏷️');
            const fallbackName = catMeta?.name || t.category || 'Transaction';
            const acctDisplay = formatAccountDisplay(resolveTransactionAccount(t));
            const pending = isTransactionPending(t);
            const needsReview = isTransactionNeedsReview(t, duplicateTxnIds);
            const refund = isRefundTransaction(t);
            const { formattedAmount, colorClass } = formatTransactionAmount(
              Number(t.amount) || 0,
              t.type
            );

            return (
              <button
                key={t.id}
                type="button"
                data-testid={`overview-recent-txn-${t.id}`}
                onClick={() => {
                  if (!isLockedMonth && onEditTxn) {
                    onEditTxn(t);
                  } else {
                    navigate(`#/transactions?month=${selectedMonth}`);
                  }
                }}
                className="w-full min-h-[42px] lg:min-h-[36px] py-1 px-2 -mx-2 rounded-[8px] hover:bg-surface2 transition-colors flex items-center justify-between gap-2.5 text-left focus-visible:ring-2 ring-ring/40"
              >
                <div className="flex items-center gap-2.5 min-w-0 flex-1">
                  <span className="w-6 h-6 rounded-full bg-surface2 flex items-center justify-center text-xs shrink-0">
                    {emoji}
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="text-body font-medium text-foreground truncate">
                      {t.description || fallbackName}
                    </div>
                    <div className="text-label text-muted-foreground flex items-center gap-1.5 truncate tabular-nums num">
                      <span>{formatShortTxnDate(t.date, selectedMonth === 'all')}</span>
                      {acctDisplay && (
                        <>
                          <span className="text-faint">·</span>
                          <span className="truncate">{acctDisplay}</span>
                        </>
                      )}
                      {pending && (
                        <span className="px-1 py-0.2 rounded bg-surface2 border border-border text-[10px] leading-3.5 font-medium shrink-0">
                          Pending
                        </span>
                      )}
                      {needsReview && (
                        <span className="px-1 py-0.2 rounded bg-warning/15 text-warning text-[10px] leading-3.5 font-medium shrink-0">
                          Review
                        </span>
                      )}
                      {refund && (
                        <span className="px-1 py-0.2 rounded bg-bucket-saved/15 text-bucket-saved text-[10px] leading-3.5 font-medium shrink-0">
                          Refund
                        </span>
                      )}
                    </div>
                  </div>
                </div>

                <span
                  className={`text-body font-medium tabular-nums num shrink-0 ${colorClass}`}
                >
                  {formattedAmount}
                </span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
};
