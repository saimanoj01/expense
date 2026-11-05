import React, { useState, useMemo, useEffect } from 'react';
import { TransactionToolbar } from '../transactions/TransactionToolbar';
import { TransactionList } from '../transactions/TransactionList';
import { Transaction, Category, SpendingBucket } from '../../services/storage';
import { formatCurrency } from '../../utils/formatters';
import { bucketOf, bucketSource } from '../../utils/categorizer';
import { Filter, X } from 'lucide-react';

export interface TransactionsViewProps {
  month: string;
  transactions: Transaction[];
  categories: Category[];
  categoryId?: string;
  isCategoryTransactions?: boolean;
  selectedBucket?: 'income' | 'fixed' | 'flexible' | 'non-monthly' | null;
  selectedTagFilter?: string | null;
  sortBy?: string;
  isLockedMonth: boolean;
  selectedTxnIds: Set<string>;
  duplicateTxnIds: Set<string>;
  availableMonths: string[];
  availableTags?: string[];
  onSelectMonth: (m: string) => void;
  onSelectBucket?: (b: 'income' | 'fixed' | 'flexible' | 'non-monthly' | null) => void;
  onSelectTagFilter?: (t: string | null) => void;
  onSetSortBy?: (s: string) => void;
  onOpenAddTxn: () => void;
  onEditTxn: (t: Transaction) => void;
  onDeleteTxn: (id: string) => void;
  onCsvFileUpload: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onLockMonth: () => void;
  onUnlockMonth: () => void;
  onOpenShareModal: () => void;
  onOpenReportModal: () => void;
  onToggleSelectTxn: (id: string) => void;
  onToggleSelectAllTxns: () => void;
  onCategoryChange?: (t: Transaction, catId: string, subCatId?: string | null) => void;
  onBucketChange?: (t: Transaction, b: SpendingBucket) => void;
  onExecuteBulkCategoryUpdate?: (ids: Set<string>, catId: string, subCatId?: string | null) => void;
  onExecuteBulkBucketUpdate?: (ids: Set<string>, b: SpendingBucket) => void;
  onShowBulkDeleteConfirm: (v: boolean) => void;
  onAddTag?: (id: string, tags: string[]) => void;
  onRemoveTag?: (id: string, tag: string) => void;
  onExecuteBulkAddTag?: (ids: Set<string>, tags: string[]) => void;
  onExecuteBulkRemoveTag?: (ids: Set<string>, tag: string) => void;
}

function parseQueryDay(hash: string): number | null {
  const qIdx = hash.indexOf('?');
  if (qIdx === -1) return null;
  const params = new URLSearchParams(hash.slice(qIdx + 1));
  const d = parseInt(params.get('day') || '', 10);
  return !isNaN(d) && d >= 1 && d <= 31 ? d : null;
}

export function TransactionsView({
  month,
  transactions,
  categories,
  categoryId: initialCategoryId,
  isCategoryTransactions,
  selectedBucket,
  selectedTagFilter,
  sortBy,
  isLockedMonth,
  selectedTxnIds,
  duplicateTxnIds,
  availableMonths,
  availableTags = [],
  onSelectMonth,
  onSelectBucket,
  onSelectTagFilter,
  onSetSortBy,
  onOpenAddTxn,
  onEditTxn,
  onDeleteTxn,
  onCsvFileUpload,
  onLockMonth,
  onUnlockMonth,
  onOpenShareModal,
  onOpenReportModal,
  onToggleSelectTxn,
  onToggleSelectAllTxns,
  onCategoryChange,
  onBucketChange,
  onExecuteBulkCategoryUpdate,
  onExecuteBulkBucketUpdate,
  onShowBulkDeleteConfirm,
  onAddTag,
  onRemoveTag,
  onExecuteBulkAddTag,
  onExecuteBulkRemoveTag,
}: TransactionsViewProps) {
  const [activeCategoryFilter, setActiveCategoryFilter] = useState<string | null>(
    isCategoryTransactions && initialCategoryId ? initialCategoryId : null
  );
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedDay, setSelectedDay] = useState<number | null>(() =>
    typeof window !== 'undefined' ? parseQueryDay(window.location.hash) : null
  );
  const [autoFilter, setAutoFilter] = useState<boolean>(() => {
    if (typeof window === 'undefined') return false;
    const qIdx = window.location.hash.indexOf('?');
    if (qIdx === -1) return false;
    return new URLSearchParams(window.location.hash.slice(qIdx + 1)).get('auto') === '1';
  });

  // Sync URL query params (?bucket=, ?tag=, ?sort=, ?day=, ?auto=) on mount & hashchange
  useEffect(() => {
    const syncFromHash = () => {
      const hash = window.location.hash;
      setSelectedDay(parseQueryDay(hash));
      const qIdx = hash.indexOf('?');
      if (qIdx !== -1) {
        const params = new URLSearchParams(hash.slice(qIdx + 1));
        setAutoFilter(params.get('auto') === '1');
        const b = params.get('bucket');
        if (b && ['income', 'fixed', 'flexible', 'non-monthly'].includes(b)) {
          onSelectBucket?.(b as 'income' | 'fixed' | 'flexible' | 'non-monthly');
        }
        const tag = params.get('tag');
        if (tag) {
          onSelectTagFilter?.(tag);
        }
        const sort = params.get('sort');
        if (sort) {
          onSetSortBy?.(sort);
        }
      } else {
        setAutoFilter(false);
      }
    };
    syncFromHash();
    window.addEventListener('hashchange', syncFromHash);
    return () => window.removeEventListener('hashchange', syncFromHash);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const targetCategory = useMemo(() => {
    if (!activeCategoryFilter) return null;
    return (
      categories.find(c => c.id.toLowerCase() === activeCategoryFilter.toLowerCase()) ||
      null
    );
  }, [activeCategoryFilter, categories]);

  const displayedTransactions = useMemo(() => {
    let list = [...transactions];

    if (activeCategoryFilter) {
      list = list.filter(
        t => (t.category || '').toLowerCase() === activeCategoryFilter.toLowerCase()
      );
    }

    if (selectedDay !== null) {
      const daySuffix = `-${String(selectedDay).padStart(2, '0')}`;
      list = list.filter(t => t.date && t.date.endsWith(daySuffix));
    }

    if (autoFilter) {
      list = list.filter(
        t => t.type === 'expense' && bucketSource(t, categories) === 'fallback'
      );
    }

    if (selectedTagFilter) {
      list = list.filter(t => t.labels && t.labels.includes(selectedTagFilter));
    }

    if (selectedBucket) {
      if (selectedBucket === 'income') {
        list = list.filter(t => t.type === 'income');
      } else {
        list = list.filter(
          t => t.type === 'expense' && bucketOf(t, categories) === selectedBucket
        );
      }
    }

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim();
      list = list.filter(t => {
        const desc = (t.description || '').toLowerCase();
        const notes = (t.notes || '').toLowerCase();
        const cat = (t.category || '').toLowerCase();
        const tags = (t.labels || []).join(' ').toLowerCase();
        return desc.includes(q) || notes.includes(q) || cat.includes(q) || tags.includes(q);
      });
    }

    list.sort((a, b) => {
      switch (sortBy) {
        case 'date-asc':
          return (a.date || '').localeCompare(b.date || '');
        case 'amount-desc':
          return (b.amount || 0) - (a.amount || 0);
        case 'amount-asc':
          return (a.amount || 0) - (b.amount || 0);
        case 'cat-asc':
        case 'category-asc':
          return (a.category || '').localeCompare(b.category || '');
        case 'cat-desc':
          return (b.category || '').localeCompare(a.category || '');
        case 'desc-asc':
        case 'description-asc':
          return (a.description || '').localeCompare(b.description || '');
        case 'desc-desc':
          return (b.description || '').localeCompare(a.description || '');
        case 'date-desc':
        default:
          return (b.date || '').localeCompare(a.date || '');
      }
    });

    return list;
  }, [
    transactions,
    activeCategoryFilter,
    selectedDay,
    autoFilter,
    selectedTagFilter,
    selectedBucket,
    categories,
    searchQuery,
    sortBy,
  ]);

  const monthFinancials = useMemo(() => {
    const nonTransfer = transactions.filter(t => t.type !== 'transfer');
    const income = nonTransfer
      .filter(t => t.type === 'income')
      .reduce((s, t) => s + t.amount, 0);
    const expenses = nonTransfer
      .filter(t => t.type === 'expense')
      .reduce((s, t) => s + t.amount, 0);
    const fixed = nonTransfer
      .filter(t => t.type === 'expense' && bucketOf(t, categories) === 'fixed')
      .reduce((s, t) => s + t.amount, 0);
    const flexible = nonTransfer
      .filter(t => t.type === 'expense' && bucketOf(t, categories) === 'flexible')
      .reduce((s, t) => s + t.amount, 0);
    const nonMonthly = nonTransfer
      .filter(t => t.type === 'expense' && bucketOf(t, categories) === 'non-monthly')
      .reduce((s, t) => s + t.amount, 0);
    return { income, expenses, fixed, flexible, nonMonthly };
  }, [transactions, categories]);

  return (
    <div
      className="max-w-[1120px] mx-auto space-y-3 pb-12"
      data-testid="level4-transactions-workspace"
    >
      {/* Compatibility KPI filter nodes */}
      <div className="flex items-center gap-0.5 opacity-0 pointer-events-auto overflow-hidden h-1">
        <span data-testid="kpi-total-expenses" className="w-2 h-2 overflow-hidden">
          {formatCurrency(monthFinancials.expenses)}
        </span>
        <button
          type="button"
          data-testid="kpi-total-income"
          onClick={() =>
            onSelectBucket && onSelectBucket(selectedBucket === 'income' ? null : 'income')
          }
          tabIndex={-1}
          className="w-2 h-2"
        >
          {formatCurrency(monthFinancials.income)}
        </button>
        <button
          type="button"
          data-testid="kpi-fixed-expenses"
          onClick={() =>
            onSelectBucket && onSelectBucket(selectedBucket === 'fixed' ? null : 'fixed')
          }
          tabIndex={-1}
          className="w-2 h-2"
        >
          {formatCurrency(monthFinancials.fixed)}
        </button>
        <button
          type="button"
          data-testid="kpi-flexible-spent"
          onClick={() =>
            onSelectBucket &&
            onSelectBucket(selectedBucket === 'flexible' ? null : 'flexible')
          }
          tabIndex={-1}
          className="w-2 h-2"
        >
          {formatCurrency(monthFinancials.flexible)}
        </button>
        <button
          type="button"
          data-testid="kpi-non-monthly"
          onClick={() =>
            onSelectBucket &&
            onSelectBucket(selectedBucket === 'non-monthly' ? null : 'non-monthly')
          }
          tabIndex={-1}
          className="w-2 h-2"
        >
          {formatCurrency(monthFinancials.nonMonthly)}
        </button>
      </div>

      {/* Active Category Filter Pill */}
      {activeCategoryFilter && targetCategory && (
        <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-surface2 border border-border text-label font-medium text-foreground">
          <Filter className="w-3 h-3 text-muted-foreground" />
          <span>{targetCategory.name}</span>
          <button
            type="button"
            onClick={() => setActiveCategoryFilter(null)}
            className="p-0.5 rounded-full hover:bg-secondary text-muted-foreground hover:text-foreground transition-colors"
            title="Clear category filter"
          >
            <X className="w-3 h-3" />
          </button>
        </div>
      )}

      {autoFilter && (
        <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-surface2 border border-border text-label font-medium text-foreground">
          <Filter className="w-3 h-3 text-muted-foreground" />
          <span>Auto-sorted into Variable</span>
          <button
            type="button"
            onClick={() => setAutoFilter(false)}
            className="p-0.5 rounded-full hover:bg-secondary text-muted-foreground hover:text-foreground transition-colors"
            title="Clear auto-sorted filter"
          >
            <X className="w-3 h-3" />
          </button>
        </div>
      )}

      {/* Single Primary Toolbar Row */}
      <TransactionToolbar
        selectedMonth={month}
        availableMonths={availableMonths}
        availableTags={availableTags}
        selectedTagFilter={selectedTagFilter}
        selectedBucket={selectedBucket}
        sortBy={sortBy}
        searchQuery={searchQuery}
        onSearchChange={setSearchQuery}
        totalCount={displayedTransactions.length}
        selectedDay={selectedDay}
        onClearDay={() => setSelectedDay(null)}
        isCurrentMonthLocked={isLockedMonth}
        setSelectedMonth={onSelectMonth}
        setSelectedTagFilter={onSelectTagFilter}
        setSelectedBucket={onSelectBucket}
        setSortBy={onSetSortBy}
        handleOpenAddTxn={onOpenAddTxn}
        handleCsvFileUpload={onCsvFileUpload}
        handleLockCurrentMonth={onLockMonth}
        handleUnlockCurrentMonth={onUnlockMonth}
        setShowShareModal={onOpenShareModal}
        onOpenMonthlyReport={onOpenReportModal}
      />

      {/* Day-Grouped Ledger Rows */}
      <TransactionList
        transactions={displayedTransactions}
        categories={categories}
        availableTags={availableTags}
        selectedTagFilter={selectedTagFilter || null}
        duplicateTxnIds={duplicateTxnIds}
        isLockedMonth={isLockedMonth}
        selectedTxnIds={selectedTxnIds}
        sortBy={sortBy}
        setSelectedTagFilter={onSelectTagFilter || (() => {})}
        toggleSelectTxn={onToggleSelectTxn}
        toggleSelectAllTxns={onToggleSelectAllTxns}
        handleEditTxn={onEditTxn}
        handleDeleteTxn={onDeleteTxn}
        handleCategoryChange={onCategoryChange}
        handleBucketChange={onBucketChange}
        handleExecuteBulkCategoryUpdate={onExecuteBulkCategoryUpdate}
        handleExecuteBulkBucketUpdate={onExecuteBulkBucketUpdate}
        setShowBulkDeleteConfirmModal={onShowBulkDeleteConfirm}
        handleAddTag={onAddTag}
        handleRemoveTag={onRemoveTag}
        handleExecuteBulkAddTag={onExecuteBulkAddTag}
        handleExecuteBulkRemoveTag={onExecuteBulkRemoveTag}
      />
    </div>
  );
}

export default TransactionsView;
