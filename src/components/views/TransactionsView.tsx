import React, { useState, useMemo } from 'react';
import { BreadcrumbTrail } from '../layout/BreadcrumbTrail';
import { TransactionToolbar } from '../transactions/TransactionToolbar';
import { TransactionList } from '../transactions/TransactionList';
import { Transaction, Category, SpendingBucket } from '../../services/storage';
import { formatCurrency } from '../../utils/formatters';
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

  // Filter transactions
  const displayedTransactions = useMemo(() => {
    let list = transactions;

    // Filter by category if scoped
    if (activeCategoryFilter) {
      list = list.filter(t => t.category.toLowerCase() === activeCategoryFilter.toLowerCase());
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

    return list;
  }, [transactions, activeCategoryFilter, searchQuery]);

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

  return (
    <div className="space-y-4" data-testid="level4-transactions-workspace">
      <BreadcrumbTrail className="mb-2" />

      {/* Header Banner */}
      <div className="p-5 rounded-2xl bg-card/60 border border-border backdrop-blur-md flex flex-col md:flex-row items-start md:items-center justify-between gap-4 shadow-sm">
        <div>
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
