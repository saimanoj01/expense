import { useState, useMemo, useEffect, forwardRef } from 'react';
import { Edit2, Trash2, Plus, X, Check, ChevronDown, FileText } from 'lucide-react';
import { Transaction, Category, DEFAULT_CATEGORIES, SpendingBucket } from '../../services/storage';
import { formatTransactionAmount } from '../../utils/formatters';
import { bucketOf } from '../../utils/categorizer';
import { isRefundTransaction } from '../../utils/metrics';
import {
  resolveTransactionAccount,
  getCanonicalAccountKey,
  formatAccountDisplay,
  getVisibleUserTags,
  isTransactionPending,
  getUserFacingNote,
} from '../../utils/transactionTaxonomy';
import { TagInputPopover } from '../common/TagInputPopover';

interface TransactionItemProps {
  transaction: Transaction;
  categories: Category[];
  availableTags?: string[];
  isLockedMonth: boolean;
  isSelected: boolean;
  isDuplicate: boolean;
  showInlineDate?: boolean;
  showMobileCheckbox?: boolean;
  toggleSelectTxn: (id: string) => void;
  handleEditTxn: (txn: Transaction) => void;
  handleDeleteTxn: (id: string) => void;
  handleCategoryChange?: (txn: Transaction, newCatId: string, newSubCatId?: string | null) => void;
  handleBucketChange?: (txn: Transaction, newBucket: SpendingBucket) => void;
  setSelectedTagFilter: (tag: string | null) => void;
  onSelectAccountFilter?: (accountKey: string) => void;
  handleAddTag?: (txnId: string, tags: string[]) => void;
  handleRemoveTag?: (txnId: string, tag: string) => void;
  handleDismissReview?: (txnId: string) => void;
}

function formatCompactRowDate(dateStr: string): string {
  if (!dateStr || !/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) return dateStr || '';
  const [y, m, d] = dateStr.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  return dt.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    timeZone: 'UTC',
  });
}

export const TransactionItem = forwardRef<HTMLDivElement, TransactionItemProps>(function TransactionItem({
  transaction,
  categories,
  availableTags = [],
  isLockedMonth,
  isSelected,
  isDuplicate,
  showInlineDate = false,
  showMobileCheckbox = false,
  toggleSelectTxn,
  handleEditTxn,
  handleDeleteTxn,
  handleCategoryChange,
  handleBucketChange,
  setSelectedTagFilter,
  onSelectAccountFilter,
  handleAddTag,
  handleRemoveTag,
  handleDismissReview,
}, ref) {
  const [showTagPopover, setShowTagPopover] = useState(false);
  const [showBucketPopover, setShowBucketPopover] = useState(false);
  const [categoryMenuOpen, setCategoryMenuOpen] = useState(false);

  useEffect(() => {
    if (!showBucketPopover) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        setShowBucketPopover(false);
      }
    };
    window.addEventListener('keydown', onKeyDown, true);
    return () => window.removeEventListener('keydown', onKeyDown, true);
  }, [showBucketPopover]);

  const allCategories = useMemo(() => {
    const map = new Map<string, Category>();
    DEFAULT_CATEGORIES.forEach(c => map.set(c.id, c));
    categories.forEach(c => map.set(c.id, c));
    return Array.from(map.values());
  }, [categories]);

  const parentCats = useMemo(() => allCategories.filter(c => !c.parentId), [allCategories]);

  const parentCat =
    allCategories.find(c => c.id === transaction.category) ||
    allCategories.find(c => c.name.toLowerCase() === (transaction.category || '').toLowerCase());
  const subCat = transaction.subCategory ? allCategories.find(c => c.id === transaction.subCategory) : null;

  const displayCat = subCat || parentCat;
  const activeValue = `${parentCat?.id || 'misc'}|${subCat?.id || ''}`;
  const currentLabels = Array.isArray(transaction.labels) ? transaction.labels : [];

  const isRefund = isRefundTransaction(transaction);
  const isPending = isTransactionPending(transaction);
  const isExpenseOrRefund = transaction.type === 'expense' || isRefund;

  const resolvedBucket = isExpenseOrRefund
    ? transaction.spendingBucket || bucketOf(transaction, categories)
    : null;

  const bucketDotClass =
    resolvedBucket === 'fixed'
      ? 'bg-bucket-fixed'
      : resolvedBucket === 'non-monthly'
      ? 'bg-bucket-nonmonthly'
      : resolvedBucket === 'flexible'
      ? 'bg-bucket-variable'
      : transaction.type === 'income'
      ? 'bg-bucket-saved'
      : null;

  const bucketLabel =
    resolvedBucket === 'fixed'
      ? 'Fixed'
      : resolvedBucket === 'non-monthly'
      ? 'Non-monthly'
      : resolvedBucket === 'flexible'
      ? 'Variable'
      : transaction.type === 'income'
      ? 'Income'
      : '↔️ Transfer';

  const rawAccount = resolveTransactionAccount(transaction);
  const accountDisplay = formatAccountDisplay(rawAccount);
  const accountKey = getCanonicalAccountKey(rawAccount);

  const visibleUserTags = useMemo(() => getVisibleUserTags(transaction), [transaction]);
  const userNote = useMemo(() => getUserFacingNote(transaction), [transaction]);

  const hasExplicitReview =
    currentLabels.includes('needs-review') ||
    Boolean(transaction.meta?.review && !transaction.meta.review.resolvedAt);
  const needsReview = hasExplicitReview || isDuplicate;

  const subDisplayLabel = subCat
    ? subCat.name === 'Electricity'
      ? 'Electric Power'
      : subCat.name
    : '';
  const categoryText = subCat
    ? `${parentCat?.name || ''} › ${subDisplayLabel}`
    : parentCat?.name || transaction.category;
  const closedSelectLabel = subCat
    ? `${parentCat?.name || 'Miscellaneous'} › ${subDisplayLabel}`
    : parentCat?.name || 'Miscellaneous';

  const { formattedAmount, colorClass } = formatTransactionAmount(transaction.amount, transaction.type);

  const isElevated = showTagPopover || showBucketPopover;

  return (
    <div
      ref={ref}
      data-testid="transaction-row"
      tabIndex={isLockedMonth ? undefined : 0}
      onClick={() => {
        if (!isLockedMonth) {
          handleEditTxn(transaction);
        }
      }}
      onKeyDown={e => {
        if (
          !isLockedMonth &&
          e.target === e.currentTarget &&
          (e.key === 'Enter' || e.key === ' ')
        ) {
          e.preventDefault();
          handleEditTxn(transaction);
        }
      }}
      className={`group relative min-h-[54px] px-2 -mx-2 py-2 rounded-[10px] hover:bg-surface2 focus-visible:ring-2 focus-visible:ring-primary/40 outline-none transition-colors flex items-center justify-between gap-2.5 cursor-pointer ${
        isSelected ? 'bg-surface2' : ''
      } ${isElevated ? 'z-30 bg-surface2' : ''}`}
    >
      <div className="flex items-center gap-2.5 flex-1 min-w-0">
        {!isLockedMonth && (
          <input
            type="checkbox"
            checked={isSelected}
            onClick={e => e.stopPropagation()}
            onChange={() => toggleSelectTxn(transaction.id)}
            aria-label={`Select ${transaction.description}`}
            className={`w-4 h-4 rounded bg-background border-border accent-primary opacity-45 group-hover:opacity-100 checked:opacity-100 transition-opacity cursor-pointer shrink-0 ${
              showMobileCheckbox || isSelected ? 'block' : 'hidden sm:block'
            }`}
          />
        )}

        <div className="w-8 h-8 rounded-full bg-surface2 flex items-center justify-center text-base shrink-0">
          {displayCat?.emoji || '🏷️'}
        </div>

        <div className="min-w-0 flex-1">
          {/* Primary Title & Actionable Review Badge */}
          <div className="flex items-center gap-2 flex-wrap">
            <h4 className="text-body font-medium text-foreground truncate max-w-full">
              {transaction.description}
            </h4>

            {isPending && (
              <span className="px-1.5 py-0.5 rounded text-[11px] font-medium bg-surface2 text-muted-foreground border border-border shrink-0">
                Pending
              </span>
            )}

            {isRefund && (
              <span className="px-1.5 py-0.5 rounded text-[11px] font-medium bg-positive/10 text-positive border border-positive/25 shrink-0">
                Refund
              </span>
            )}

            {needsReview && (
              <span
                data-testid={`needs-review-badge-${transaction.id}`}
                title={
                  transaction.meta?.review?.detail ||
                  (isDuplicate
                    ? 'Potential duplicate transaction — confirm or delete'
                    : 'Flagged by automated ingestion for review')
                }
                className="inline-flex items-center gap-1.5 px-1.5 py-0.5 rounded text-label font-medium bg-warning/15 text-warning border border-warning/30 shrink-0"
              >
                <span>
                  {!hasExplicitReview && isDuplicate
                    ? 'Duplicate?'
                    : `Needs Review${
                        transaction.meta?.review?.reason
                          ? ` (${transaction.meta.review.reason})`
                          : ''
                      }`}
                </span>
                {!isLockedMonth && handleDismissReview && (
                  <button
                    type="button"
                    data-testid={`dismiss-review-btn-${transaction.id}`}
                    title="Confirm transaction looks good and clear review flag"
                    onClick={e => {
                      e.stopPropagation();
                      handleDismissReview(transaction.id);
                    }}
                    className="inline-flex items-center gap-0.5 px-1 py-0.5 rounded bg-background/80 hover:bg-background text-foreground border border-border/60 text-[10px] font-semibold transition-colors"
                  >
                    <Check className="w-2.5 h-2.5 text-positive" />
                    Looks Good
                  </button>
                )}
              </span>
            )}
          </div>

          {/* Calm Single-Source Metadata Line */}
          <div className="flex items-center gap-1.5 text-label text-muted-foreground mt-0.5 flex-wrap">
            {showInlineDate && (
              <>
                <span
                  data-testid="transaction-date-row"
                  title={transaction.date}
                  className="tabular-nums num shrink-0"
                >
                  {formatCompactRowDate(transaction.date)}
                </span>
                <span className="text-faint" aria-hidden="true">
                  ·
                </span>
              </>
            )}

            {/* Cross-Browser Content-Sized Category Hover-Pill */}
            {!isLockedMonth && handleCategoryChange ? (
              <span
                onClick={e => e.stopPropagation()}
                title={subCat ? `${parentCat?.name} › ${subCat.name}` : parentCat?.name}
                className="relative inline-flex items-center gap-0.5 px-1.5 py-0.5 -mx-1.5 rounded-[6px] hover:bg-background/80 hover:text-foreground focus-within:ring-2 focus-within:ring-primary/40 transition-colors max-w-[190px] sm:max-w-[240px]"
              >
                <span
                  aria-hidden="true"
                  className="invisible pointer-events-none select-none truncate text-label whitespace-pre"
                >
                  {closedSelectLabel}
                </span>
                <select
                  data-testid={`transaction-category-select-${transaction.id}`}
                  value={activeValue}
                  aria-label={`Category for ${transaction.description}`}
                  onMouseDown={() => setCategoryMenuOpen(true)}
                  onKeyDown={e => {
                    if ([' ', 'Enter', 'ArrowDown', 'ArrowUp'].includes(e.key)) {
                      setCategoryMenuOpen(true);
                    } else if (e.key === 'Escape') {
                      setCategoryMenuOpen(false);
                    }
                  }}
                  onBlur={() => setCategoryMenuOpen(false)}
                  onChange={e => {
                    setCategoryMenuOpen(false);
                    const [catId, subId] = e.target.value.split('|');
                    handleCategoryChange(transaction, catId, subId || null);
                  }}
                  className="absolute inset-0 w-full h-full px-1.5 py-0.5 sm:group-hover:pr-5 appearance-none bg-transparent text-label text-muted-foreground group-hover:text-muted-foreground hover:!text-foreground cursor-pointer truncate outline-none"
                >
                  {parentCats.map(p => {
                    const subs = allCategories.filter(c => c.parentId === p.id);
                    const parentVal = `${p.id}|`;
                    return (
                      <optgroup key={p.id} label={`${p.emoji} ${p.name}`} className="bg-popover text-foreground">
                        <option
                          value={parentVal}
                          label={
                            !categoryMenuOpen && activeValue === parentVal
                              ? closedSelectLabel
                              : undefined
                          }
                          className="bg-popover text-foreground"
                        >
                          {p.emoji} {p.name} (General)
                        </option>
                        {subs.map(s => {
                          const subLabel = s.name === 'Electricity' ? 'Electric Power' : s.name;
                          const subVal = `${p.id}|${s.id}`;
                          return (
                            <option
                              key={s.id}
                              value={subVal}
                              label={
                                !categoryMenuOpen && activeValue === subVal
                                  ? closedSelectLabel
                                  : undefined
                              }
                              className="bg-popover text-foreground"
                            >
                              {s.emoji} {subLabel}
                            </option>
                          );
                        })}
                      </optgroup>
                    );
                  })}
                </select>
                <ChevronDown className="w-3 h-3 hidden sm:group-hover:inline-block opacity-65 shrink-0 pointer-events-none relative z-10" />
              </span>
            ) : (
              <span
                className="truncate max-w-[240px]"
                title={subCat ? `${parentCat?.name} › ${subCat.name}` : parentCat?.name}
              >
                {categoryText}
              </span>
            )}

            <span className="text-faint" aria-hidden="true">
              ·
            </span>

            {/* Bucket Interactive Pill + Floating Segmented Popover */}
            {!isLockedMonth && handleBucketChange && isExpenseOrRefund ? (
              <span className="relative inline-flex items-center" onClick={e => e.stopPropagation()}>
                <button
                  type="button"
                  data-testid={`bucket-pill-${transaction.id}`}
                  aria-haspopup="true"
                  aria-expanded={showBucketPopover}
                  onClick={() => setShowBucketPopover(prev => !prev)}
                  className="inline-flex items-center gap-1 px-1.5 py-0.5 -mx-1 rounded-[6px] hover:bg-background/80 hover:text-foreground focus-visible:ring-2 focus-visible:ring-primary/40 outline-none transition-colors"
                >
                  {bucketDotClass && (
                    <span
                      className={`w-2 h-2 rounded-full ${bucketDotClass} shrink-0`}
                      title={bucketLabel}
                      data-testid={
                        resolvedBucket
                          ? `bucket-dot-${transaction.id}-${resolvedBucket}`
                          : undefined
                      }
                    />
                  )}
                  <span>{bucketLabel}</span>
                </button>

                {showBucketPopover && (
                  <>
                    <div
                      className="fixed inset-0 z-20"
                      onClick={() => setShowBucketPopover(false)}
                    />
                    <div
                      data-testid={`bucket-switcher-${transaction.id}`}
                      data-popover="bucket-switcher"
                      role="group"
                      aria-label="Spending bucket"
                      className="absolute left-0 top-full mt-1 z-30 inline-flex items-center rounded-[8px] bg-popover border border-border p-0.5 gap-0.5 shadow-lg whitespace-nowrap"
                    >
                      {(
                        [
                          { key: 'fixed', label: 'Fixed' },
                          { key: 'flexible', label: 'Variable' },
                          { key: 'non-monthly', label: 'Non-monthly' },
                        ] as const
                      ).map(opt => (
                        <button
                          key={opt.key}
                          type="button"
                          title={opt.label}
                          aria-label={`Set ${opt.label}`}
                          onClick={() => {
                            handleBucketChange(transaction, opt.key);
                            setShowBucketPopover(false);
                          }}
                          className={`px-2 py-0.5 rounded-[6px] text-[11px] font-medium transition-colors ${
                            resolvedBucket === opt.key
                              ? 'bg-primary text-primary-foreground'
                              : 'text-muted-foreground hover:text-foreground hover:bg-surface2'
                          }`}
                        >
                          {opt.label}
                        </button>
                      ))}
                    </div>
                  </>
                )}
              </span>
            ) : (
              <span className="inline-flex items-center gap-1">
                {bucketDotClass && (
                  <span
                    className={`w-2 h-2 rounded-full ${bucketDotClass} shrink-0`}
                    title={bucketLabel}
                    data-testid={
                      resolvedBucket
                        ? `bucket-dot-${transaction.id}-${resolvedBucket}`
                        : undefined
                    }
                  />
                )}
                <span>{bucketLabel}</span>
              </span>
            )}

            {/* Quiet Account Provenance */}
            {accountDisplay && (
              <>
                <span className="text-faint" aria-hidden="true">
                  ·
                </span>
                {onSelectAccountFilter && accountKey ? (
                  <button
                    type="button"
                    onClick={e => {
                      e.stopPropagation();
                      onSelectAccountFilter(accountKey);
                    }}
                    className="hover:text-foreground transition-colors truncate max-w-[140px]"
                    title={`Filter by ${accountDisplay}`}
                  >
                    {accountDisplay}
                  </button>
                ) : (
                  <span className="truncate max-w-[140px]">{accountDisplay}</span>
                )}
              </>
            )}

            {/* Clean User-Only #tags */}
            {visibleUserTags.length > 0 && (
              <>
                <span className="text-faint" aria-hidden="true">
                  ·
                </span>
                <div className="inline-flex items-center gap-1 flex-wrap">
                  {visibleUserTags.map(lbl => (
                    <span
                      key={lbl}
                      className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-full bg-surface2/70 text-muted-foreground hover:text-foreground transition-colors"
                    >
                      <button
                        type="button"
                        onClick={e => {
                          e.stopPropagation();
                          setSelectedTagFilter(lbl);
                        }}
                        className="hover:underline"
                      >
                        #{lbl}
                      </button>
                      {!isLockedMonth && handleRemoveTag && (
                        <button
                          type="button"
                          aria-label={`Remove tag ${lbl}`}
                          data-testid={`delete-tag-${lbl}-${transaction.id}`}
                          onClick={e => {
                            e.stopPropagation();
                            handleRemoveTag(transaction.id, lbl);
                          }}
                          className="text-muted-foreground hover:text-negative opacity-70 sm:opacity-0 sm:group-hover:opacity-100 sm:group-focus-within:opacity-100 transition-opacity p-0.5"
                        >
                          <X className="w-2.5 h-2.5" />
                        </button>
                      )}
                    </span>
                  ))}
                </div>
              </>
            )}

            {/* Subtle User Note Indicator (only when non-boilerplate note exists) */}
            {userNote && (
              <span
                title={userNote}
                aria-label={`Note: ${userNote}`}
                className="inline-flex items-center text-muted-foreground/80 hover:text-foreground pl-0.5"
              >
                <FileText className="w-3 h-3" />
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Right Column: Left-of-Amount Desktop Hover Actions + Strictly Flush-Right Amount */}
      <div className="flex items-center gap-2 pl-2 shrink-0">
        {!isLockedMonth && (
          <div
            onClick={e => e.stopPropagation()}
            className={`hidden sm:inline-flex items-center gap-0.5 transition-opacity ${
              showTagPopover
                ? 'opacity-100'
                : 'sm:opacity-0 sm:group-hover:opacity-100 sm:group-focus-within:opacity-100'
            }`}
          >
            {handleAddTag && (
              <div className="relative inline-flex">
                <button
                  type="button"
                  data-testid={`add-tag-btn-${transaction.id}`}
                  title="Add tag"
                  aria-label="Add tag"
                  onClick={() => setShowTagPopover(prev => !prev)}
                  className="inline-flex items-center gap-0.5 px-1.5 py-1 rounded-[8px] hover:bg-card text-[11px] font-medium text-muted-foreground hover:text-foreground transition-colors"
                >
                  <Plus className="w-3 h-3" />
                  <span>Tag</span>
                </button>
                {showTagPopover && (
                  <TagInputPopover
                    availableTags={availableTags}
                    existingTags={visibleUserTags}
                    onAddTag={tags => handleAddTag(transaction.id, tags)}
                    onClose={() => setShowTagPopover(false)}
                    align="right"
                  />
                )}
              </div>
            )}
            <button
              type="button"
              onClick={() => handleEditTxn(transaction)}
              data-testid={`edit-transaction-btn-${transaction.id}`}
              title="Edit transaction"
              aria-label="Edit transaction"
              className="p-1.5 hover:bg-card rounded-[8px] text-muted-foreground hover:text-foreground transition-colors"
            >
              <Edit2 className="w-3.5 h-3.5" />
            </button>
            <button
              type="button"
              onClick={() => handleDeleteTxn(transaction.id)}
              data-testid={`delete-transaction-btn-${transaction.id}`}
              title="Delete transaction"
              aria-label="Delete transaction"
              className="p-1.5 hover:bg-negative/10 rounded-[8px] text-muted-foreground hover:text-negative transition-colors"
            >
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          </div>
        )}

        <div className={`min-w-[84px] font-semibold text-body tabular-nums num text-right ${colorClass}`}>
          {formattedAmount}
        </div>
      </div>
    </div>
  );
});
