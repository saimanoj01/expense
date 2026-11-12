import React, { useState, useMemo, useRef, useCallback, useEffect } from 'react';
import { Search, Trash2, X, Tag, Check, Plus, Upload, RotateCcw } from 'lucide-react';
import { AnimatePresence, motion } from 'framer-motion';
import {
  Transaction,
  Category,
  DEFAULT_CATEGORIES,
  SpendingBucket,
  MonthlyLock,
} from '../../services/storage';
import { formatCurrency, formatMoney } from '../../utils/formatters';
import { coerceAmount } from '../../utils/metrics';
import {
  getVisibleUserTags,
  isTransactionMonthLocked,
  isTransactionNeedsReview,
} from '../../utils/transactionTaxonomy';
import { TransactionItem } from './TransactionItem';
import { TagInputPopover } from '../common/TagInputPopover';

const PAGE_CHUNK = 150;

interface TransactionListProps {
  transactions: Transaction[];
  categories: Category[];
  locks?: MonthlyLock[];
  availableTags?: string[];
  selectedTagFilter: string | null;
  duplicateTxnIds: Set<string>;
  isLockedMonth: boolean;
  selectedTxnIds: Set<string>;
  sortBy?: string;
  includeYear?: boolean;
  showReviewDetailInline?: boolean;
  windowResetKey?: string;
  sliceSummaryText?: string;
  subheaderRightContent?: React.ReactNode;
  hasActiveFilters?: boolean;
  hasUnfilteredMonthTxns?: boolean;
  monthLabel?: string;
  onResetFilters?: () => void;
  onOpenAddTxn?: () => void;
  onOpenCsvWizard?: () => void;
  setSelectedTagFilter: (tag: string | null) => void;
  onSelectAccountFilter?: (accountKey: string) => void;
  toggleSelectTxn: (id: string) => void;
  onRangeSelectTxns?: (ids: string[], select: boolean) => void;
  toggleSelectAllTxns: (visibleIds: string[]) => void;
  clearSelectedTxns: () => void;
  handleEditTxn: (txn: Transaction) => void;
  handleDeleteTxn: (id: string) => void;
  handleCategoryChange?: (txn: Transaction, newCatId: string, newSubCatId?: string | null) => void;
  handleBucketChange?: (txn: Transaction, newBucket: SpendingBucket) => void;
  handleExecuteBulkCategoryUpdate?: (
    selectedTxnIds: Set<string>,
    categoryId: string,
    subCategoryId?: string | null
  ) => void;
  handleExecuteBulkBucketUpdate?: (
    selectedTxnIds: Set<string>,
    bucket: SpendingBucket
  ) => void;
  setShowBulkDeleteConfirmModal: (v: boolean) => void;
  handleAddTag?: (txnId: string, tags: string[]) => void;
  handleRemoveTag?: (txnId: string, tag: string) => void;
  handleExecuteBulkAddTag?: (selectedTxnIds: Set<string>, tags: string[]) => void;
  handleExecuteBulkRemoveTag?: (selectedTxnIds: Set<string>, tag: string) => void;
  handleDismissReview?: (txnId: string) => void;
  onBulkDismissReview?: (selectedTxnIds: Set<string>) => void;
}

function formatDayHeader(dateStr: string, includeYear: boolean = false): string {
  if (!dateStr || !/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) return dateStr || 'RECENT';
  const [y, m, d] = dateStr.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  return dt
    .toLocaleDateString('en-US', {
      weekday: 'short',
      month: 'short',
      day: 'numeric',
      ...(includeYear ? { year: 'numeric' } : {}),
      timeZone: 'UTC',
    })
    .toUpperCase();
}

export function TransactionList({
  transactions,
  categories,
  locks = [],
  availableTags = [],
  duplicateTxnIds,
  isLockedMonth,
  selectedTxnIds,
  sortBy = 'date-desc',
  includeYear = false,
  showReviewDetailInline = false,
  windowResetKey = '',
  sliceSummaryText,
  subheaderRightContent,
  hasActiveFilters = false,
  hasUnfilteredMonthTxns = false,
  monthLabel,
  onResetFilters,
  onOpenAddTxn,
  onOpenCsvWizard,
  setSelectedTagFilter,
  onSelectAccountFilter,
  toggleSelectTxn,
  onRangeSelectTxns,
  toggleSelectAllTxns,
  clearSelectedTxns,
  handleEditTxn,
  handleDeleteTxn,
  handleCategoryChange,
  handleBucketChange,
  handleExecuteBulkCategoryUpdate,
  handleExecuteBulkBucketUpdate,
  setShowBulkDeleteConfirmModal,
  handleAddTag,
  handleRemoveTag,
  handleExecuteBulkAddTag,
  handleExecuteBulkRemoveTag,
  handleDismissReview,
  onBulkDismissReview,
}: TransactionListProps) {
  const [showBulkAddPopover, setShowBulkAddPopover] = useState(false);
  const [mobileSelectMode, setMobileSelectMode] = useState(false);
  const [visibleLimit, setVisibleLimit] = useState(PAGE_CHUNK);
  const lastSelectedIdRef = useRef<string | null>(null);
  const sentinelRef = useRef<HTMLDivElement>(null);
  const showMoreBtnRef = useRef<HTMLButtonElement>(null);
  const userScrolledRef = useRef(false);

  useEffect(() => {
    setVisibleLimit(PAGE_CHUNK);
    userScrolledRef.current = false;
  }, [windowResetKey]);

  const hasMoreRows = transactions.length > visibleLimit;
  const remainingRows = Math.max(0, transactions.length - visibleLimit);

  useEffect(() => {
    if (!hasMoreRows || typeof IntersectionObserver === 'undefined') return;
    const sentinel = sentinelRef.current;
    if (!sentinel) return;
    const scrollRoot = sentinel.closest('main');
    const scrollTarget: EventTarget = scrollRoot || window;
    const markUserScrolled = () => {
      userScrolledRef.current = true;
    };
    scrollTarget.addEventListener('wheel', markUserScrolled, { passive: true });
    scrollTarget.addEventListener('touchmove', markUserScrolled, { passive: true });

    const observer = new IntersectionObserver(
      entries => {
        if (
          entries.some(e => e.isIntersecting) &&
          userScrolledRef.current &&
          document.activeElement !== showMoreBtnRef.current &&
          !showMoreBtnRef.current?.matches(':hover')
        ) {
          userScrolledRef.current = false;
          setVisibleLimit(prev => Math.min(transactions.length, prev + PAGE_CHUNK));
        }
      },
      {
        root: scrollRoot || null,
        rootMargin: '240px',
      }
    );
    observer.observe(sentinel);
    return () => {
      observer.disconnect();
      scrollTarget.removeEventListener('wheel', markUserScrolled);
      scrollTarget.removeEventListener('touchmove', markUserScrolled);
    };
  }, [hasMoreRows, transactions.length, visibleLimit]);

  const selectableIds = useMemo(
    () =>
      transactions
        .filter(t => !isLockedMonth && !isTransactionMonthLocked(t.date, locks))
        .map(t => t.id),
    [transactions, isLockedMonth, locks]
  );

  const isAllSelected =
    selectableIds.length > 0 && selectableIds.every(id => selectedTxnIds.has(id));

  const handleToggleSingle = useCallback(
    (id: string) => {
      lastSelectedIdRef.current = id;
      toggleSelectTxn(id);
    },
    [toggleSelectTxn]
  );

  const handleShiftSelect = useCallback(
    (targetId: string) => {
      const anchorId = lastSelectedIdRef.current;
      const anchorIdx = anchorId ? selectableIds.indexOf(anchorId) : -1;
      const targetIdx = selectableIds.indexOf(targetId);

      if (anchorIdx !== -1 && targetIdx !== -1 && onRangeSelectTxns) {
        const [start, end] =
          anchorIdx <= targetIdx ? [anchorIdx, targetIdx] : [targetIdx, anchorIdx];
        const rangeIds = selectableIds.slice(start, end + 1);
        const shouldSelect = !selectedTxnIds.has(targetId);
        onRangeSelectTxns(rangeIds, shouldSelect);
        lastSelectedIdRef.current = targetId;
      } else {
        lastSelectedIdRef.current = targetId;
        toggleSelectTxn(targetId);
      }
    },
    [selectableIds, selectedTxnIds, onRangeSelectTxns, toggleSelectTxn]
  );

  const allCategories = useMemo(() => {
    const map = new Map<string, Category>();
    DEFAULT_CATEGORIES.forEach(c => map.set(c.id, c));
    categories.forEach(c => map.set(c.id, c));
    return Array.from(map.values());
  }, [categories]);

  const parentCats = useMemo(() => allCategories.filter(c => !c.parentId), [allCategories]);

  const selectedTxnTags = useMemo(() => {
    const tagsSet = new Set<string>();
    transactions.forEach(t => {
      if (selectedTxnIds.has(t.id)) {
        getVisibleUserTags(t).forEach(lbl => tagsSet.add(lbl));
      }
    });
    return Array.from(tagsSet).sort();
  }, [transactions, selectedTxnIds]);

  const selectedFlaggedCount = useMemo(
    () =>
      transactions.filter(
        t =>
          selectedTxnIds.has(t.id) &&
          !isTransactionMonthLocked(t.date, locks) &&
          isTransactionNeedsReview(t, duplicateTxnIds)
      ).length,
    [transactions, selectedTxnIds, locks, duplicateTxnIds]
  );

  const isDateSorted = !sortBy || sortBy === 'date-desc' || sortBy === 'date-asc';

  const dayTotalsMap = useMemo(() => {
    if (!isDateSorted) return null;
    const map = new Map<
      string,
      { netTotal: number; transferTotal: number; allTransfers: boolean }
    >();
    transactions.forEach(t => {
      const d = t.date || '';
      const absAmt = Math.abs(coerceAmount(t.amount));
      const deltaAmt =
        t.type === 'income' ? absAmt : t.type === 'expense' ? -absAmt : 0;
      const transferAmt = t.type === 'transfer' ? absAmt : 0;
      const existing = map.get(d);
      if (!existing) {
        map.set(d, {
          netTotal: deltaAmt,
          transferTotal: transferAmt,
          allTransfers: t.type === 'transfer',
        });
      } else {
        existing.netTotal += deltaAmt;
        existing.transferTotal += transferAmt;
        if (t.type !== 'transfer') {
          existing.allTransfers = false;
        }
      }
    });
    return map;
  }, [transactions, isDateSorted]);

  const windowedTransactions = useMemo(
    () => transactions.slice(0, visibleLimit),
    [transactions, visibleLimit]
  );

  const dayGroups = useMemo(() => {
    if (!isDateSorted || !dayTotalsMap) return null;
    const groups: {
      date: string;
      txns: Transaction[];
      netTotal: number;
      transferTotal: number;
      allTransfers: boolean;
    }[] = [];
    windowedTransactions.forEach(t => {
      const d = t.date || '';
      const last = groups[groups.length - 1];
      if (!last || last.date !== d) {
        const totals = dayTotalsMap.get(d) || {
          netTotal: 0,
          transferTotal: 0,
          allTransfers: false,
        };
        groups.push({
          date: d,
          txns: [t],
          netTotal: totals.netTotal,
          transferTotal: totals.transferTotal,
          allTransfers: totals.allTransfers,
        });
      } else {
        last.txns.push(t);
      }
    });
    return groups;
  }, [windowedTransactions, isDateSorted, dayTotalsMap]);

  const showMobileCheckbox = mobileSelectMode || selectedTxnIds.size > 0;
  const hasSelectableRows = !isLockedMonth && selectableIds.length > 0;
  const showFilteredEmptyState = hasActiveFilters || hasUnfilteredMonthTxns;

  return (
    <div className="relative flex flex-col">
      {/* Zone 3 Persistent 32px Subheader Bar (0px vertical layout shift when toggling filters!) */}
      <div className="h-8 min-h-[32px] flex items-center justify-between gap-2 pb-1">
        <div className="flex items-center gap-2.5 min-w-0 shrink sm:shrink-0">
          {hasSelectableRows && (
            <label
              className={`items-center gap-2 text-label text-muted-foreground hover:text-foreground cursor-pointer transition-colors shrink-0 ${
                showMobileCheckbox ? 'inline-flex' : 'hidden sm:inline-flex'
              }`}
            >
              <input
                type="checkbox"
                data-testid="select-all-txns-checkbox"
                checked={isAllSelected}
                onChange={() => toggleSelectAllTxns(selectableIds)}
                className="w-4 h-4 rounded bg-background border-border accent-primary opacity-60 hover:opacity-100 checked:opacity-100 transition-opacity cursor-pointer"
              />
              <span className="whitespace-nowrap">
                {selectedTxnIds.size > 0
                  ? `${selectedTxnIds.size} selected`
                  : `Select all (${selectableIds.length})`}
              </span>
            </label>
          )}

          <span
            data-testid="ledger-slice-summary"
            className="text-label text-muted-foreground tabular-nums num min-w-0 truncate"
          >
            {sliceSummaryText || '0 transactions'}
          </span>
        </div>

        <div
          className={`flex items-center justify-end gap-1.5 min-w-0 ${
            hasActiveFilters ? 'flex-1' : 'shrink-0'
          }`}
        >
          {subheaderRightContent}

          {hasSelectableRows && (
            <button
              type="button"
              data-testid="mobile-select-toggle-btn"
              onClick={() => {
                if (showMobileCheckbox) {
                  setMobileSelectMode(false);
                  clearSelectedTxns();
                } else {
                  setMobileSelectMode(true);
                }
              }}
              className="sm:hidden text-label font-medium text-muted-foreground hover:text-foreground shrink-0 whitespace-nowrap transition-colors"
            >
              {showMobileCheckbox ? 'Done' : 'Select'}
            </button>
          )}
        </div>
      </div>

      {transactions.length === 0 ? (
        showFilteredEmptyState ? (
          <div
            data-testid="empty-filtered-ledger-state"
            className="flex flex-col items-center justify-center text-muted-foreground gap-3 py-12 border-t border-border text-center"
          >
            <div className="w-12 h-12 rounded-full bg-surface2 flex items-center justify-center">
              <Search className="w-5 h-5 text-muted-foreground" />
            </div>
            <p className="text-body">No transactions match the current filters.</p>
            {onResetFilters && (
              <button
                type="button"
                data-testid="empty-reset-filters-btn"
                onClick={onResetFilters}
                className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-[10px] bg-surface2 hover:bg-secondary border border-border text-label font-medium text-foreground transition-colors"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                <span>Reset search &amp; filters</span>
              </button>
            )}
          </div>
        ) : (
          <div
            data-testid="empty-month-ledger-state"
            className="flex flex-col items-center justify-center text-muted-foreground gap-3 py-12 border-t border-border text-center"
          >
            <div className="w-12 h-12 rounded-full bg-surface2 flex items-center justify-center">
              <Search className="w-5 h-5 text-muted-foreground" />
            </div>
            <div className="space-y-1">
              <p className="text-body font-medium text-foreground">
                {monthLabel && monthLabel !== 'All Time'
                  ? `No transactions recorded in ${monthLabel} yet`
                  : 'No transactions recorded for this period yet.'}
              </p>
              <p className="text-label text-muted-foreground">
                Add a transaction manually or import a CSV statement to get started.
              </p>
            </div>
            {!isLockedMonth && (onOpenAddTxn || onOpenCsvWizard) && (
              <div className="flex flex-wrap items-center justify-center gap-2 pt-1">
                {onOpenAddTxn && (
                  <button
                    type="button"
                    data-testid="empty-state-add-txn-btn"
                    onClick={onOpenAddTxn}
                    className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-[10px] bg-primary hover:opacity-90 text-primary-foreground text-label font-semibold transition-opacity"
                  >
                    <Plus className="w-4 h-4" />
                    <span>Add Transaction</span>
                  </button>
                )}
                {onOpenCsvWizard && (
                  <button
                    type="button"
                    data-testid="empty-state-import-csv-btn"
                    onClick={onOpenCsvWizard}
                    className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-[10px] bg-surface2 hover:bg-secondary border border-border text-label font-medium text-foreground transition-colors"
                  >
                    <Upload className="w-3.5 h-3.5" />
                    <span>Import CSV</span>
                  </button>
                )}
              </div>
            )}
          </div>
        )
      ) : dayGroups ? (
        <div className="divide-y divide-border border-t border-border">
          {dayGroups.map(group => (
            <div key={group.date} className="py-2">
              <div
                data-testid="transaction-day-header"
                data-date={group.date}
                className="sticky top-12 z-10 bg-background/95 backdrop-blur-sm flex items-center justify-between py-1.5 text-label font-semibold text-muted-foreground tabular-nums num"
              >
                <span>{formatDayHeader(group.date, includeYear)}</span>
                <span>
                  {group.allTransfers && group.transferTotal > 0
                    ? `⇄ ${formatCurrency(group.transferTotal)}`
                    : formatMoney(group.netTotal, {
                        cents: true,
                        sign: group.netTotal > 0 ? 'always' : 'auto',
                      })}
                </span>
              </div>
              <div className="space-y-0.5">
                {group.txns.map(txn => (
                  <TransactionItem
                    key={txn.id}
                    transaction={txn}
                    categories={categories}
                    locks={locks}
                    availableTags={availableTags}
                    isLockedMonth={isLockedMonth}
                    isSelected={selectedTxnIds.has(txn.id)}
                    isDuplicate={duplicateTxnIds.has(txn.id)}
                    includeYear={includeYear}
                    showInlineDate={false}
                    showReviewDetailInline={showReviewDetailInline}
                    showMobileCheckbox={showMobileCheckbox}
                    toggleSelectTxn={handleToggleSingle}
                    onShiftSelectTxn={handleShiftSelect}
                    handleEditTxn={handleEditTxn}
                    handleDeleteTxn={handleDeleteTxn}
                    handleCategoryChange={handleCategoryChange}
                    handleBucketChange={handleBucketChange}
                    setSelectedTagFilter={setSelectedTagFilter}
                    onSelectAccountFilter={onSelectAccountFilter}
                    handleAddTag={handleAddTag}
                    handleRemoveTag={handleRemoveTag}
                    handleDismissReview={handleDismissReview}
                  />
                ))}
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="divide-y divide-border/50 border-t border-border py-1">
          {windowedTransactions.map(txn => (
            <TransactionItem
              key={txn.id}
              transaction={txn}
              categories={categories}
              locks={locks}
              availableTags={availableTags}
              isLockedMonth={isLockedMonth}
              isSelected={selectedTxnIds.has(txn.id)}
              isDuplicate={duplicateTxnIds.has(txn.id)}
              includeYear={includeYear}
              showInlineDate={true}
              showReviewDetailInline={showReviewDetailInline}
              showMobileCheckbox={showMobileCheckbox}
              toggleSelectTxn={handleToggleSingle}
              onShiftSelectTxn={handleShiftSelect}
              handleEditTxn={handleEditTxn}
              handleDeleteTxn={handleDeleteTxn}
              handleCategoryChange={handleCategoryChange}
              handleBucketChange={handleBucketChange}
              setSelectedTagFilter={setSelectedTagFilter}
              onSelectAccountFilter={onSelectAccountFilter}
              handleAddTag={handleAddTag}
              handleRemoveTag={handleRemoveTag}
              handleDismissReview={handleDismissReview}
            />
          ))}
        </div>
      )}

      {hasMoreRows && (
        <div className="pt-3 pb-2 flex flex-col items-center border-t border-border/60">
          <div ref={sentinelRef} aria-hidden="true" className="h-px w-px" />
          <button
            ref={showMoreBtnRef}
            type="button"
            data-testid="ledger-show-more-btn"
            onClick={() => {
              userScrolledRef.current = false;
              setVisibleLimit(prev => Math.min(transactions.length, prev + PAGE_CHUNK));
            }}
            className="px-4 py-2 rounded-[10px] bg-surface2 hover:bg-secondary border border-border text-label font-medium text-foreground tabular-nums num transition-colors"
          >
            Show more ({remainingRows} remaining)
          </button>
        </div>
      )}

      {/* Centered Non-Transform Wrapper + Keyed Motion Bulk Action Bar (0px off-screen clipping!) */}
      <div className="fixed inset-x-0 bottom-[calc(4.5rem+env(safe-area-inset-bottom))] md:bottom-6 z-[45] pointer-events-none flex justify-center px-3">
        <AnimatePresence>
          {!isLockedMonth && selectedTxnIds.size > 0 && (
            <motion.div
              key="floating-bulk-action-bar"
              data-testid="floating-bulk-action-bar"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 20 }}
              transition={{ type: 'spring', stiffness: 360, damping: 32 }}
              className="relative pointer-events-auto max-w-[calc(100vw-1.5rem)] rounded-[14px] bg-popover border border-border shadow-xl px-3.5 py-2 flex flex-wrap items-center justify-center gap-2"
            >
              <span className="text-body font-medium text-foreground tabular-nums num whitespace-nowrap">
                {selectedTxnIds.size} selected
              </span>

              <span className="text-faint" aria-hidden="true">
                ·
              </span>

              {handleExecuteBulkCategoryUpdate && (
                <select
                  data-testid="bulk-category-select"
                  defaultValue=""
                  onChange={e => {
                    if (e.target.value) {
                      const [catId, subId] = e.target.value.split('|');
                      handleExecuteBulkCategoryUpdate(selectedTxnIds, catId, subId || null);
                      e.target.value = '';
                    }
                  }}
                  className="px-2.5 py-1 bg-surface2 border border-border text-foreground hover:bg-secondary rounded-[8px] text-label font-medium transition-colors cursor-pointer outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
                >
                  <option value="" disabled>
                    Set Category ({selectedTxnIds.size})…
                  </option>
                  {parentCats.map(p => {
                    const subs = allCategories.filter(c => c.parentId === p.id);
                    return (
                      <optgroup key={p.id} label={`${p.emoji} ${p.name}`}>
                        <option value={`${p.id}|`}>
                          {p.emoji} {p.name} (General)
                        </option>
                        {subs.map(s => (
                          <option key={s.id} value={`${p.id}|${s.id}`}>
                            {s.emoji} {s.name === 'Electricity' ? 'Electric Power' : s.name}
                          </option>
                        ))}
                      </optgroup>
                    );
                  })}
                </select>
              )}

              {handleExecuteBulkBucketUpdate && (
                <select
                  data-testid="bulk-bucket-select"
                  defaultValue=""
                  onChange={e => {
                    if (e.target.value) {
                      handleExecuteBulkBucketUpdate(
                        selectedTxnIds,
                        e.target.value as SpendingBucket
                      );
                      e.target.value = '';
                    }
                  }}
                  className="px-2.5 py-1 bg-surface2 border border-border text-foreground hover:bg-secondary rounded-[8px] text-label font-medium transition-colors cursor-pointer outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
                >
                  <option value="" disabled>
                    Set Bucket ({selectedTxnIds.size})…
                  </option>
                  <option value="fixed">Fixed Commitment</option>
                  <option value="flexible">Variable (Flexible)</option>
                  <option value="non-monthly">Non-Monthly</option>
                </select>
              )}

              {handleExecuteBulkAddTag && (
                <div className="inline-block">
                  <button
                    type="button"
                    data-testid="bulk-add-tag-btn"
                    onClick={() => setShowBulkAddPopover(prev => !prev)}
                    className="inline-flex items-center gap-1 px-2.5 py-1 bg-surface2 hover:bg-secondary text-foreground border border-border rounded-[8px] text-label font-medium whitespace-nowrap transition-colors"
                  >
                    <Tag className="w-3.5 h-3.5" /> + Tag ({selectedTxnIds.size})
                  </button>
                  {showBulkAddPopover && (
                    <TagInputPopover
                      availableTags={availableTags}
                      onAddTag={tags => {
                        handleExecuteBulkAddTag(selectedTxnIds, tags);
                        setShowBulkAddPopover(false);
                      }}
                      onClose={() => setShowBulkAddPopover(false)}
                      align="right"
                      placement="top"
                    />
                  )}
                </div>
              )}

              {handleExecuteBulkRemoveTag && selectedTxnTags.length > 0 && (
                <select
                  defaultValue=""
                  data-testid="bulk-remove-tag-select"
                  onChange={e => {
                    if (e.target.value) {
                      handleExecuteBulkRemoveTag(selectedTxnIds, e.target.value);
                      e.target.value = '';
                    }
                  }}
                  className="px-2.5 py-1 bg-surface2 border border-border text-foreground hover:bg-secondary rounded-[8px] text-label font-medium transition-colors cursor-pointer outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
                >
                  <option value="" disabled>
                    Remove Tag ({selectedTxnIds.size})…
                  </option>
                  {selectedTxnTags.map(tag => (
                    <option key={tag} value={tag}>
                      #{tag}
                    </option>
                  ))}
                </select>
              )}

              {selectedFlaggedCount > 0 && onBulkDismissReview && (
                <button
                  type="button"
                  data-testid="bulk-dismiss-review-btn"
                  onClick={() => onBulkDismissReview(selectedTxnIds)}
                  className="inline-flex items-center gap-1 px-2.5 py-1 bg-positive/10 text-positive border border-positive/25 hover:bg-positive/20 rounded-[8px] text-label font-medium whitespace-nowrap transition-colors"
                >
                  <Check className="w-3.5 h-3.5 shrink-0" /> Mark Reviewed ({selectedFlaggedCount})
                </button>
              )}

              <button
                type="button"
                onClick={() => setShowBulkDeleteConfirmModal(true)}
                className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-negative/10 text-negative border border-negative/25 hover:bg-negative/20 rounded-[8px] text-label font-medium whitespace-nowrap transition-colors"
              >
                <Trash2 className="w-3.5 h-3.5 shrink-0" /> Delete ({selectedTxnIds.size})
              </button>

              <button
                type="button"
                onClick={() => {
                  setMobileSelectMode(false);
                  clearSelectedTxns();
                }}
                title="Clear selection"
                aria-label="Clear selection"
                className="p-1 text-muted-foreground hover:text-foreground rounded-[8px] transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
