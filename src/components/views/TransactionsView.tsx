import React, { useState, useMemo } from 'react';
import { BreadcrumbTrail } from '../layout/BreadcrumbTrail';
import { MonthSwitcher } from '../dashboard/MonthSwitcher';
import { TransactionToolbar } from '../transactions/TransactionToolbar';
import { TransactionList } from '../transactions/TransactionList';
import { Transaction, Category, DEFAULT_CATEGORIES, SpendingBucket } from '../../services/storage';
import { formatCurrency } from '../../utils/formatters';
import { bucketOf } from '../../utils/categorizer';
import { computeMonthMetrics } from '../../utils/metrics';
import { ArrowLeft, Filter, Search, X } from 'lucide-react';
import { useNavigation } from '../../hooks/useNavigation';

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
  onExecuteBulkRemoveTag
}: TransactionsViewProps) {
  const { navigate } = useNavigation();
  const [activeCategoryFilter, setActiveCategoryFilter] = useState<string | null>(
    isCategoryTransactions && initialCategoryId ? initialCategoryId : null
  );
  const [searchQuery, setSearchQuery] = useState('');

  const targetCategory = useMemo(() => {
    if (!activeCategoryFilter) return null;
    return categories.find(c => c.id.toLowerCase() === activeCategoryFilter.toLowerCase()) || null;
  }, [activeCategoryFilter, categories]);

  const categoryNameMap = useMemo(() => {
    const map = new Map<string, string>();
    DEFAULT_CATEGORIES.forEach(c => {
      map.set(c.id, c.name);
      map.set(c.id.toLowerCase(), c.name);
      map.set(c.name.toLowerCase(), c.name);
    });
    categories.forEach(c => {
      map.set(c.id, c.name);
      map.set(c.id.toLowerCase(), c.name);
      map.set(c.name.toLowerCase(), c.name);
    });
    return map;
  }, [categories]);

  // Filter and sort transactions
  const displayedTransactions = useMemo(() => {
    let list = [...transactions];

    // Filter by category if scoped
    if (activeCategoryFilter) {
      list = list.filter(t => t.category.toLowerCase() === activeCategoryFilter.toLowerCase());
    }

    // Filter by tag if active
    if (selectedTagFilter) {
      list = list.filter(t => Array.isArray(t.labels) && t.labels.includes(selectedTagFilter));
    }

    // Filter by spending bucket if active
    if (selectedBucket) {
      if (selectedBucket === 'income') {
        list = list.filter(t => t.type === 'income');
      } else {
        list = list.filter(t => t.type === 'expense' && bucketOf(t, categories) === selectedBucket);
      }
    }

    // Filter by search query (instant client-side search)
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

    // Sort transactions
    list.sort((a, b) => {
      switch (sortBy) {
        case 'date-asc': {
          const dateDiff = (a.date || '').localeCompare(b.date || '');
          if (dateDiff !== 0) return dateDiff;
          return (a.id || '').localeCompare(b.id || '');
        }
        case 'amount-asc': {
          const amtA = typeof a.amount === 'number' ? a.amount : parseFloat(String(a.amount || 0));
          const amtB = typeof b.amount === 'number' ? b.amount : parseFloat(String(b.amount || 0));
          if (amtA !== amtB) return amtA - amtB;
          const dateDiff = (b.date || '').localeCompare(a.date || '');
          if (dateDiff !== 0) return dateDiff;
          return (b.id || '').localeCompare(a.id || '');
        }
        case 'amount-desc': {
          const amtA = typeof a.amount === 'number' ? a.amount : parseFloat(String(a.amount || 0));
          const amtB = typeof b.amount === 'number' ? b.amount : parseFloat(String(b.amount || 0));
          if (amtA !== amtB) return amtB - amtA;
          const dateDiff = (b.date || '').localeCompare(a.date || '');
          if (dateDiff !== 0) return dateDiff;
          return (b.id || '').localeCompare(a.id || '');
        }
        case 'desc-asc':
        case 'description-asc': {
          const descDiff = (a.description || '').localeCompare(b.description || '', undefined, { sensitivity: 'base' });
          if (descDiff !== 0) return descDiff;
          return (b.date || '').localeCompare(a.date || '');
        }
        case 'desc-desc': {
          const descDiff = (b.description || '').localeCompare(a.description || '', undefined, { sensitivity: 'base' });
          if (descDiff !== 0) return descDiff;
          return (b.date || '').localeCompare(a.date || '');
        }
        case 'cat-asc':
        case 'category-asc': {
          const catA = categoryNameMap.get(a.subCategory || a.category) || categoryNameMap.get(a.category) || a.category || '';
          const catB = categoryNameMap.get(b.subCategory || b.category) || categoryNameMap.get(b.category) || b.category || '';
          const catDiff = catA.localeCompare(catB, undefined, { sensitivity: 'base' });
          if (catDiff !== 0) return catDiff;
          return (b.date || '').localeCompare(a.date || '');
        }
        case 'cat-desc': {
          const catA = categoryNameMap.get(a.subCategory || a.category) || categoryNameMap.get(a.category) || a.category || '';
          const catB = categoryNameMap.get(b.subCategory || b.category) || categoryNameMap.get(b.category) || b.category || '';
          const catDiff = catB.localeCompare(catA, undefined, { sensitivity: 'base' });
          if (catDiff !== 0) return catDiff;
          return (b.date || '').localeCompare(a.date || '');
        }
        case 'date-desc':
        default: {
          const dateDiff = (b.date || '').localeCompare(a.date || '');
          if (dateDiff !== 0) return dateDiff;
          return (b.id || '').localeCompare(a.id || '');
        }
      }
    });

    return list;
  }, [transactions, activeCategoryFilter, selectedTagFilter, selectedBucket, categories, categoryNameMap, searchQuery, sortBy]);

  // Compute totals
  const totalSpend = useMemo(() => {
    return displayedTransactions
      .filter(t => t.type === 'expense')
      .reduce((sum, t) => sum + (t.amount || 0), 0);
  }, [displayedTransactions]);

  const totalInflow = useMemo(() => {
    return displayedTransactions
      .filter(t => t.type === 'income')
      .reduce((sum, t) => sum + (t.amount || 0), 0);
  }, [displayedTransactions]);

  const monthFinancials = useMemo(() => {
    const m = computeMonthMetrics(transactions, 'all', categories);
    return {
      income: m.income,
      expenses: m.expenses,
      fixed: m.fixed,
      flexible: m.flexible,
      nonMonthly: m.nonMonthly,
    };
  }, [transactions, categories]);

  return (
    <div className="space-y-4" data-testid="level4-transactions-workspace">
      <div className="flex items-center justify-between gap-3 mb-2">
        <BreadcrumbTrail />
        <MonthSwitcher
          selectedMonth={month}
          availableMonths={availableMonths}
          onSelectMonth={onSelectMonth}
          className="border-0 shadow-none bg-transparent p-0"
        />
      </div>

      {/* Header Banner */}
      <div data-testid="dashboard-header" className="p-5 rounded-2xl bg-card/60 border border-border backdrop-blur-md flex flex-col md:flex-row items-start md:items-center justify-between gap-4 shadow-sm">
        <div className="space-y-2">
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-card border border-border text-xs font-semibold text-muted-foreground overflow-hidden">
              <span>Expenses:</span>
              <span data-testid="kpi-total-expenses" className="text-foreground font-bold tabular-nums inline-block overflow-hidden max-w-full align-bottom">
                {formatCurrency(monthFinancials.expenses)}
              </span>
            </span>
            <button
              type="button"
              data-testid="kpi-total-income"
              onClick={() => onSelectBucket && onSelectBucket(selectedBucket === 'income' ? null : 'income')}
              className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-lg border text-xs font-semibold transition-colors ${
                selectedBucket === 'income'
                  ? 'bg-primary text-primary-foreground border-primary'
                  : 'bg-card border-border text-muted-foreground hover:text-foreground'
              }`}
            >
              <span>Income:</span>
              <span className="font-bold tabular-nums">{formatCurrency(monthFinancials.income)}</span>
            </button>
            <button
              type="button"
              data-testid="kpi-fixed-expenses"
              onClick={() => onSelectBucket && onSelectBucket(selectedBucket === 'fixed' ? null : 'fixed')}
              className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-lg border text-xs font-semibold transition-colors ${
                selectedBucket === 'fixed'
                  ? 'bg-primary text-primary-foreground border-primary'
                  : 'bg-card border-border text-muted-foreground hover:text-foreground'
              }`}
            >
              <span>Fixed:</span>
              <span className="font-bold tabular-nums">{formatCurrency(monthFinancials.fixed)}</span>
            </button>
            <button
              type="button"
              data-testid="kpi-flexible-spent"
              onClick={() => onSelectBucket && onSelectBucket(selectedBucket === 'flexible' ? null : 'flexible')}
              className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-lg border text-xs font-semibold transition-colors ${
                selectedBucket === 'flexible'
                  ? 'bg-primary text-primary-foreground border-primary'
                  : 'bg-card border-border text-muted-foreground hover:text-foreground'
              }`}
            >
              <span>Variable:</span>
              <span className="font-bold tabular-nums">{formatCurrency(monthFinancials.flexible)}</span>
            </button>
            <button
              type="button"
              data-testid="kpi-non-monthly"
              onClick={() => onSelectBucket && onSelectBucket(selectedBucket === 'non-monthly' ? null : 'non-monthly')}
              className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-lg border text-xs font-semibold transition-colors ${
                selectedBucket === 'non-monthly'
                  ? 'bg-primary text-primary-foreground border-primary'
                  : 'bg-card border-border text-muted-foreground hover:text-foreground'
              }`}
            >
              <span>Non-monthly:</span>
              <span className="font-bold tabular-nums">{formatCurrency(monthFinancials.nonMonthly)}</span>
            </button>
          </div>
          <div className="flex items-center gap-2">
            {activeCategoryFilter && (
              <button
                onClick={() => {
                  if (initialCategoryId) {
                    navigate({ view: 'category', level: 3, month, categoryId: initialCategoryId });
                  } else {
                    setActiveCategoryFilter(null);
                  }
                }}
                className="p-1 rounded-lg hover:bg-muted text-muted-foreground hover:text-foreground transition-all"
                title="Back to category"
              >
                <ArrowLeft className="w-4 h-4" />
              </button>
            )}
            <h1 className="text-xl font-bold tracking-tight text-foreground flex items-center gap-2">
              {targetCategory ? (
                <>
                  <span>{targetCategory.emoji || '🏷️'}</span>
                  <span>{targetCategory.name} Transactions</span>
                </>
              ) : (
                'Transactions Ledger'
              )}
            </h1>
          </div>
          <p className="text-xs text-muted-foreground mt-0.5">
            {displayedTransactions.length} transaction{displayedTransactions.length !== 1 ? 's' : ''} in {month}
            {totalSpend > 0 && ` • Spent ${formatCurrency(totalSpend)}`}
            {totalInflow > 0 && ` • Inflow ${formatCurrency(totalInflow)}`}
          </p>
        </div>

        {/* Search Bar with Debounce */}
        <div className="relative w-full md:w-72">
          <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <input
            type="text"
            data-testid="transaction-search-input"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search description, notes, tags..."
            className="w-full bg-background/80 border border-border rounded-xl pl-9 pr-8 py-2 text-xs focus:ring-2 focus:ring-primary outline-none transition-all"
          />
          {searchQuery && (
            <button
              onClick={() => setSearchQuery('')}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      </div>

      {/* Active Category Filter Pill */}
      {activeCategoryFilter && targetCategory && (
        <div className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-primary/10 border border-primary/20 text-xs w-fit">
          <Filter className="w-3.5 h-3.5 text-primary" />
          <span className="text-muted-foreground">Filtered by:</span>
          <span className="font-bold text-foreground">{targetCategory.name}</span>
          <button
            onClick={() => setActiveCategoryFilter(null)}
            className="p-0.5 rounded-full hover:bg-primary/20 text-primary transition-all ml-1"
            title="Clear category filter"
          >
            <X className="w-3 h-3" />
          </button>
        </div>
      )}

      {/* Primary Toolbar */}
      <TransactionToolbar
        selectedMonth={month}
        availableMonths={availableMonths}
        availableTags={availableTags}
        selectedTagFilter={selectedTagFilter}
        selectedBucket={selectedBucket}
        sortBy={sortBy}
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

      {/* Ledger Table / Rows */}
      <TransactionList
        transactions={displayedTransactions}
        categories={categories}
        availableTags={availableTags}
        selectedTagFilter={selectedTagFilter || null}
        duplicateTxnIds={duplicateTxnIds}
        isLockedMonth={isLockedMonth}
        selectedTxnIds={selectedTxnIds}
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
