import {
  useState,
  useMemo,
  useEffect,
  useLayoutEffect,
  useCallback,
  useRef,
  forwardRef,
  memo,
} from 'react';
import { Edit2, Trash2, Plus, X, Check, ChevronDown, FileText, Lock } from 'lucide-react';
import {
  Transaction,
  Category,
  DEFAULT_CATEGORIES,
  SpendingBucket,
  MonthlyLock,
} from '../../services/storage';
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
  getLockedMonthForDate,
  formatReviewBadgeLabel,
  getReviewDetailText,
} from '../../utils/transactionTaxonomy';
import { TagInputPopover } from '../common/TagInputPopover';

interface TransactionItemProps {
  transaction: Transaction;
  categories: Category[];
  locks?: MonthlyLock[];
  availableTags?: string[];
  isLockedMonth: boolean;
  isSelected: boolean;
  isDuplicate: boolean;
  includeYear?: boolean;
  showInlineDate?: boolean;
  showReviewDetailInline?: boolean;
  showMobileCheckbox?: boolean;
  toggleSelectTxn: (id: string) => void;
  onShiftSelectTxn?: (id: string) => void;
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

function formatCompactRowDate(dateStr: string, includeYear: boolean = false): string {
  if (!dateStr || !/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) return dateStr || '';
  const [y, m, d] = dateStr.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  return dt.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    ...(includeYear ? { year: 'numeric' } : {}),
    timeZone: 'UTC',
  });
}

export const TransactionItem = memo(
  forwardRef<HTMLDivElement, TransactionItemProps>(function TransactionItem(
    {
      transaction,
      categories,
      locks = [],
      availableTags = [],
      isLockedMonth,
      isSelected,
      isDuplicate,
      includeYear = false,
      showInlineDate = false,
      showReviewDetailInline = false,
      showMobileCheckbox = false,
      toggleSelectTxn,
      onShiftSelectTxn,
      handleEditTxn,
      handleDeleteTxn,
      handleCategoryChange,
      handleBucketChange,
      setSelectedTagFilter,
      onSelectAccountFilter,
      handleAddTag,
      handleRemoveTag,
      handleDismissReview,
    },
    ref
  ) {
    const [showTagPopover, setShowTagPopover] = useState(false);
    const [showBucketPopover, setShowBucketPopover] = useState(false);
    const [bucketFlipUp, setBucketFlipUp] = useState(false);
    const [showNotePopover, setShowNotePopover] = useState(false);
    const [noteFlipUp, setNoteFlipUp] = useState(false);
    const [noteLeftOffset, setNoteLeftOffset] = useState(0);
    const [categoryMenuOpen, setCategoryMenuOpen] = useState(false);

    const lastShiftKeyRef = useRef(false);
    const bucketBtnRef = useRef<HTMLButtonElement>(null);
    const noteBtnRef = useRef<HTMLButtonElement>(null);
    const metaRowRef = useRef<HTMLDivElement>(null);
    const lastMetaWidthRef = useRef<number>(-1);

    const rowLockedMonth = getLockedMonthForDate(transaction.date, locks);
    const isRowDateLocked = Boolean(rowLockedMonth);
    const effectiveInlineLocked = isLockedMonth || isRowDateLocked;

    const syncMetaLineStarts = useCallback(() => {
      const container = metaRowRef.current;
      if (!container) return;
      const children = (Array.from(container.children) as HTMLElement[]).filter(
        el => el.offsetParent !== null
      );
      if (children.length === 0) return;

      for (let i = 0; i < children.length; i++) {
        children[i].style.marginRight = '';
        if (i === 0) {
          children[i].setAttribute('data-line-start', 'true');
        } else {
          children[i].removeAttribute('data-line-start');
        }
      }

      if (children.length === 1) return;

      const containerRight = container.getBoundingClientRect().right;
      for (let i = 1; i < children.length; i++) {
        const prevRect = children[i - 1].getBoundingClientRect();
        const currRect = children[i].getBoundingClientRect();
        if (currRect.top - prevRect.top > 6) {
          children[i].setAttribute('data-line-start', 'true');
          const afterRect = children[i].getBoundingClientRect();
          if (afterRect.top - prevRect.top <= 6) {
            const safeSlack = Math.max(0, Math.floor(containerRight - prevRect.right) - 1);
            if (safeSlack > 0) {
              children[i - 1].style.marginRight = `${safeSlack}px`;
            }
          }
        }
      }
    }, []);

    useLayoutEffect(() => {
      if (!showBucketPopover) return;
      const rect = bucketBtnRef.current?.getBoundingClientRect();
      setBucketFlipUp(Boolean(rect && window.innerHeight - rect.bottom < 160));
    }, [showBucketPopover]);

    useLayoutEffect(() => {
      if (!showNotePopover) return;
      const rect = noteBtnRef.current?.getBoundingClientRect();
      if (rect) {
        setNoteFlipUp(window.innerHeight - rect.bottom < 160);
        const popoverWidth = 224;
        const overflowRight = rect.left + popoverWidth - (window.innerWidth - 12);
        setNoteLeftOffset(
          overflowRight > 0 ? -Math.min(overflowRight, Math.max(0, rect.left - 12)) : 0
        );
      }
    }, [showNotePopover]);

    useEffect(() => {
      if (!showBucketPopover && !showNotePopover) return;
      const onKeyDown = (e: KeyboardEvent) => {
        if (e.key === 'Escape') {
          e.preventDefault();
          e.stopPropagation();
          setShowBucketPopover(false);
          setShowNotePopover(false);
        }
      };
      window.addEventListener('keydown', onKeyDown, true);
      return () => window.removeEventListener('keydown', onKeyDown, true);
    }, [showBucketPopover, showNotePopover]);

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
    const subCat = transaction.subCategory
      ? allCategories.find(c => c.id === transaction.subCategory)
      : null;

    const displayCat = subCat || parentCat;
    const activeValue = `${parentCat?.id || 'misc'}|${subCat?.id || ''}`;
    const currentLabels = Array.isArray(transaction.labels) ? transaction.labels : [];

    const isRefund = isRefundTransaction(transaction);
    const isPending = isTransactionPending(transaction);
    const isSplitOrder = Boolean(transaction.meta?.orderId);
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

    const reviewBadgeLabel = formatReviewBadgeLabel(transaction, isDuplicate);
    const reviewDetailTitle = getReviewDetailText(transaction, isDuplicate);

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

    const { formattedAmount, colorClass } = formatTransactionAmount(
      transaction.amount,
      transaction.type
    );

    useLayoutEffect(() => {
      if (metaRowRef.current) {
        lastMetaWidthRef.current = Math.round(metaRowRef.current.clientWidth);
      }
      syncMetaLineStarts();
    }, [
      syncMetaLineStarts,
      showInlineDate,
      includeYear,
      transaction.date,
      closedSelectLabel,
      categoryText,
      effectiveInlineLocked,
      bucketLabel,
      accountDisplay,
      visibleUserTags,
      userNote,
      showMobileCheckbox,
      isSelected,
    ]);

    useEffect(() => {
      const container = metaRowRef.current;
      if (!container || typeof ResizeObserver === 'undefined') return;
      const ro = new ResizeObserver(() => {
        const w = Math.round(container.clientWidth);
        if (w !== lastMetaWidthRef.current) {
          lastMetaWidthRef.current = w;
          syncMetaLineStarts();
        }
      });
      ro.observe(container);
      return () => ro.disconnect();
    }, [syncMetaLineStarts]);

    const isElevated = showTagPopover || showBucketPopover || showNotePopover;

    return (
      <div
        ref={ref}
        data-testid="transaction-row"
        tabIndex={0}
        onClick={() => {
          handleEditTxn(transaction);
        }}
        onKeyDown={e => {
          if (
            e.target === e.currentTarget &&
            (e.key === 'Enter' || e.key === ' ')
          ) {
            e.preventDefault();
            handleEditTxn(transaction);
          }
        }}
        className={`group relative min-h-[54px] px-2 -mx-2 py-2 rounded-[10px] hover:bg-surface2 focus-visible:ring-2 focus-visible:ring-primary/40 outline-none transition-colors flex items-center justify-between gap-2.5 cursor-pointer ${
          isSelected ? 'bg-surface2' : ''
        } ${isElevated ? 'z-[46] bg-surface2' : ''}`}
      >
        <div className="flex items-center gap-2.5 flex-1 min-w-0">
          {!effectiveInlineLocked ? (
            <input
              type="checkbox"
              checked={isSelected}
              onClick={e => {
                lastShiftKeyRef.current = e.shiftKey;
                e.stopPropagation();
              }}
              onChange={() => {
                const isShift = lastShiftKeyRef.current;
                lastShiftKeyRef.current = false;
                if (isShift && onShiftSelectTxn) {
                  onShiftSelectTxn(transaction.id);
                } else {
                  toggleSelectTxn(transaction.id);
                }
              }}
              aria-label={`Select ${transaction.description}`}
              className={`w-4 h-4 rounded bg-background border-border accent-primary opacity-45 group-hover:opacity-100 checked:opacity-100 transition-opacity cursor-pointer shrink-0 ${
                showMobileCheckbox || isSelected ? 'block' : 'hidden sm:block'
              }`}
            />
          ) : !isLockedMonth && isRowDateLocked ? (
            <Lock
              data-testid={`locked-row-icon-${transaction.id}`}
              aria-label="Locked month"
              className="w-3.5 h-3.5 text-muted-foreground/70 shrink-0"
            />
          ) : null}

          <div className="w-8 h-8 rounded-full bg-surface2 flex items-center justify-center text-base shrink-0">
            {displayCat?.emoji || '🏷️'}
          </div>

          <div className={`min-w-0 flex-1 ${!isElevated ? 'overflow-hidden' : ''}`}>
            {/* Primary Title & Actionable Status/Review Badges */}
            <div className="flex items-center gap-1.5 sm:gap-2 flex-wrap min-w-0">
              <h4 className="text-body font-medium text-foreground truncate max-w-full">
                {transaction.description}
              </h4>

              {!isLockedMonth && rowLockedMonth && (
                <span
                  title={`Month ${rowLockedMonth} is locked`}
                  aria-label={`Month ${rowLockedMonth} is locked`}
                  className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[11px] font-medium bg-surface2 text-muted-foreground border border-border shrink-0"
                >
                  <Lock className="w-2.5 h-2.5" />
                  <span>Locked</span>
                </span>
              )}

              {isPending && (
                <span className="px-1.5 py-0.5 rounded text-[11px] font-medium bg-surface2 text-muted-foreground border border-border shrink-0">
                  Pending
                </span>
              )}

              {isSplitOrder && (
                <span
                  data-testid={`split-badge-${transaction.id}`}
                  title={`Split item from order ${transaction.meta?.orderId}`}
                  className="px-1.5 py-0.5 rounded text-[11px] font-medium bg-surface2 text-muted-foreground border border-border shrink-0"
                >
                  Split
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
                  title={reviewDetailTitle}
                  className="inline-flex items-center gap-1.5 px-1.5 py-0.5 rounded text-label font-medium bg-warning/15 text-warning border border-warning/30 max-w-full flex-wrap"
                >
                  <span className="min-w-0 truncate">{reviewBadgeLabel}</span>
                  {!effectiveInlineLocked && handleDismissReview && (
                    <button
                      type="button"
                      data-testid={`dismiss-review-btn-${transaction.id}`}
                      title="Confirm transaction looks good and clear review flag"
                      onClick={e => {
                        e.stopPropagation();
                        handleDismissReview(transaction.id);
                      }}
                      className="inline-flex items-center gap-0.5 px-1 py-0.5 rounded bg-background/80 hover:bg-background text-foreground border border-border/60 text-[10px] font-semibold whitespace-nowrap shrink-0 transition-colors"
                    >
                      <Check className="w-2.5 h-2.5 text-positive shrink-0" />
                      <span>Looks Good</span>
                    </button>
                  )}
                </span>
              )}
            </div>

            {needsReview && showReviewDetailInline && (
              <p
                data-testid={`review-detail-${transaction.id}`}
                className="text-[11px] text-warning/90 mt-0.5 truncate"
              >
                {reviewDetailTitle}
              </p>
            )}

            {/* Calm Single-Source Metadata Line (orphan-free CSS pseudo separators) */}
            <div
              ref={metaRowRef}
              className="relative flex items-center gap-1.5 text-label text-muted-foreground mt-0.5 flex-wrap"
            >
              {showInlineDate && (
                <span
                  data-testid="transaction-date-row"
                  data-line-start="true"
                  title={transaction.date}
                  className="ledger-meta-item tabular-nums num shrink-0"
                >
                  {formatCompactRowDate(transaction.date, includeYear)}
                </span>
              )}

              {/* Cross-Browser Content-Sized Category Hover-Pill */}
              <span
                data-line-start={!showInlineDate ? 'true' : undefined}
                className="ledger-meta-item inline-flex items-center min-w-0"
              >
                {!effectiveInlineLocked && handleCategoryChange ? (
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
                          <optgroup
                            key={p.id}
                            label={`${p.emoji} ${p.name}`}
                            className="bg-popover text-foreground"
                          >
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
              </span>

              {/* Bucket Interactive Pill + Floating Segmented Popover */}
              <span className="ledger-meta-item inline-flex items-center">
                {!effectiveInlineLocked && handleBucketChange && isExpenseOrRefund ? (
                  <span
                    className="relative inline-flex items-center"
                    onClick={e => e.stopPropagation()}
                  >
                    <button
                      ref={bucketBtnRef}
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
                          className="fixed inset-0 z-[44]"
                          onClick={() => setShowBucketPopover(false)}
                        />
                        <div
                          data-testid={`bucket-switcher-${transaction.id}`}
                          data-popover="bucket-switcher"
                          data-placement={bucketFlipUp ? 'top' : 'bottom'}
                          role="group"
                          aria-label="Spending bucket"
                          className={`absolute left-0 ${
                            bucketFlipUp ? 'bottom-full mb-1' : 'top-full mt-1'
                          } z-[46] inline-flex items-center rounded-[8px] bg-popover border border-border p-0.5 gap-0.5 shadow-lg whitespace-nowrap`}
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
                              className={`px-2 py-0.5 rounded-[6px] text-[11px] font-medium whitespace-nowrap transition-colors ${
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
              </span>

              {/* Quiet Account Provenance */}
              {accountDisplay && (
                <span className="ledger-meta-item inline-flex items-center min-w-0">
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
                </span>
              )}

              {/* Clean User-Only #tags */}
              {visibleUserTags.map((lbl, tagIdx) => (
                <span
                  key={lbl}
                  className={`${tagIdx === 0 ? 'ledger-meta-item ' : ''}inline-flex items-center`}
                >
                  <span className="ledger-tag-pill inline-flex items-center px-1.5 py-0.5 rounded-full bg-surface2/70 text-muted-foreground hover:text-foreground transition-colors">
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
                    {!effectiveInlineLocked && handleRemoveTag && (
                      <button
                        type="button"
                        aria-label={`Remove tag ${lbl}`}
                        data-testid={`delete-tag-${lbl}-${transaction.id}`}
                        onClick={e => {
                          e.stopPropagation();
                          handleRemoveTag(transaction.id, lbl);
                        }}
                        className="ledger-tag-remove text-muted-foreground hover:text-negative"
                      >
                        <X className="w-2.5 h-2.5" />
                      </button>
                    )}
                  </span>
                </span>
              ))}

              {/* Privacy-Safe Interactive Touch Note Popover (never mounts userNote text at rest!) */}
              {userNote && (
                <span
                  className="ledger-meta-item relative inline-flex items-center"
                  onClick={e => e.stopPropagation()}
                >
                  <button
                    ref={noteBtnRef}
                    type="button"
                    data-testid={`note-preview-btn-${transaction.id}`}
                    aria-label="View transaction note"
                    aria-expanded={showNotePopover}
                    title="View note"
                    onClick={() => setShowNotePopover(prev => !prev)}
                    className="inline-flex items-center p-0.5 rounded text-muted-foreground/80 hover:text-foreground focus-visible:ring-2 focus-visible:ring-primary/40 transition-colors"
                  >
                    <FileText className="w-3 h-3" />
                  </button>
                  {showNotePopover && (
                    <>
                      <div
                        className="fixed inset-0 z-[44]"
                        onClick={() => setShowNotePopover(false)}
                      />
                      <div
                        data-popover="note-preview"
                        data-placement={noteFlipUp ? 'top' : 'bottom'}
                        role="region"
                        aria-label="Transaction note"
                        style={noteLeftOffset !== 0 ? { left: `${noteLeftOffset}px` } : undefined}
                        className={`absolute left-0 ${
                          noteFlipUp ? 'bottom-full mb-1' : 'top-full mt-1'
                        } z-[46] w-56 max-w-[calc(100vw-1.5rem)] rounded-[10px] bg-popover border border-border p-2.5 shadow-xl text-label text-foreground whitespace-pre-wrap break-words`}
                      >
                        {userNote}
                      </div>
                    </>
                  )}
                </span>
              )}
            </div>
          </div>
        </div>

        {/* Right Column: Left-of-Amount Desktop Hover Actions + Strictly Flush-Right Amount */}
        <div className="flex items-center gap-2 pl-2 shrink-0">
          {!isLockedMonth && (
            <div
              data-open={showTagPopover ? 'true' : undefined}
              data-force-visible={showTagPopover ? 'true' : undefined}
              onClick={e => e.stopPropagation()}
              className="ledger-row-actions hidden sm:inline-flex items-center gap-0.5"
            >
              {!isRowDateLocked && handleAddTag && (
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
                title={isRowDateLocked ? 'View transaction details' : 'Edit transaction'}
                aria-label={isRowDateLocked ? 'View transaction details' : 'Edit transaction'}
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

          <div
            className={`min-w-[84px] font-semibold text-body tabular-nums num text-right ${colorClass}`}
          >
            {formattedAmount}
          </div>
        </div>
      </div>
    );
  })
);
