import React, { useState, useMemo, useEffect, useCallback } from 'react';
import {
  TransactionToolbar,
  LedgerTypeFilter,
  AccountFilterOption,
} from '../transactions/TransactionToolbar';
import { TransactionList } from '../transactions/TransactionList';
import {
  Transaction,
  Category,
  DEFAULT_CATEGORIES,
  SpendingBucket,
} from '../../services/storage';
import { formatCurrency } from '../../utils/formatters';
import { bucketOf, bucketSource } from '../../utils/categorizer';
import { computeMonthMetrics, isRefundTransaction } from '../../utils/metrics';
import {
  resolveTransactionAccount,
  getCanonicalAccountKey,
  formatAccountDisplay,
  getVisibleUserTags,
  getUserFacingNote,
  isTransactionNeedsReview,
} from '../../utils/transactionTaxonomy';
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
  availableTags?: string[];
  onSelectBucket?: (b: 'income' | 'fixed' | 'flexible' | 'non-monthly' | null) => void;
  onSelectTagFilter?: (t: string | null) => void;
  onSetSortBy?: (s: string) => void;
  onOpenAddTxn: () => void;
  onEditTxn: (t: Transaction) => void;
  onDeleteTxn: (id: string) => void;
  onCsvFileUpload: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onToggleSelectTxn: (id: string) => void;
  onToggleSelectAllTxns: (visibleIds: string[]) => void;
  onClearSelectedTxns: () => void;
  onRetainOnlyVisibleSelection?: (visibleIds: Set<string>) => void;
  onCategoryChange?: (t: Transaction, catId: string, subCatId?: string | null) => void;
  onBucketChange?: (t: Transaction, b: SpendingBucket) => void;
  onExecuteBulkCategoryUpdate?: (ids: Set<string>, catId: string, subCatId?: string | null) => void;
  onExecuteBulkBucketUpdate?: (ids: Set<string>, b: SpendingBucket) => void;
  onShowBulkDeleteConfirm: (v: boolean) => void;
  onAddTag?: (id: string, tags: string[]) => void;
  onRemoveTag?: (id: string, tag: string) => void;
  onExecuteBulkAddTag?: (ids: Set<string>, tags: string[]) => void;
  onExecuteBulkRemoveTag?: (ids: Set<string>, tag: string) => void;
  onDismissReview?: (id: string) => void;
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
  availableTags = [],
  onSelectBucket,
  onSelectTagFilter,
  onSetSortBy,
  onOpenAddTxn,
  onEditTxn,
  onDeleteTxn,
  onCsvFileUpload,
  onToggleSelectTxn,
  onToggleSelectAllTxns,
  onClearSelectedTxns,
  onRetainOnlyVisibleSelection,
  onCategoryChange,
  onBucketChange,
  onExecuteBulkCategoryUpdate,
  onExecuteBulkBucketUpdate,
  onShowBulkDeleteConfirm,
  onAddTag,
  onRemoveTag,
  onExecuteBulkAddTag,
  onExecuteBulkRemoveTag,
  onDismissReview,
}: TransactionsViewProps) {
  const { navigate } = useNavigation();
  const [activeCategoryFilter, setActiveCategoryFilter] = useState<string | null>(
    isCategoryTransactions && initialCategoryId ? initialCategoryId : null
  );
  const [selectedType, setSelectedType] = useState<LedgerTypeFilter>(null);
  const [selectedAccount, setSelectedAccount] = useState<string | null>(null);
  const [needsReviewOnly, setNeedsReviewOnly] = useState<boolean>(false);
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

  // Sync category drilldown props when route updates while component stays mounted
  useEffect(() => {
    setActiveCategoryFilter(
      isCategoryTransactions && initialCategoryId ? initialCategoryId : null
    );
  }, [isCategoryTransactions, initialCategoryId]);

  // Migrate legacy selectedTagFilter === 'needs-review' into dedicated needsReviewOnly state
  useEffect(() => {
    if (selectedTagFilter === 'needs-review') {
      setNeedsReviewOnly(true);
      onSelectTagFilter?.(null);
    }
  }, [selectedTagFilter, onSelectTagFilter]);

  // Sync URL query params (?bucket=, ?tag=, ?sort=, ?day=, ?auto=, ?review=) on mount & hashchange
  useEffect(() => {
    const syncFromHash = () => {
      const hash = window.location.hash;
      setSelectedDay(parseQueryDay(hash));
      const qIdx = hash.indexOf('?');
      if (qIdx !== -1) {
        const params = new URLSearchParams(hash.slice(qIdx + 1));
        setAutoFilter(params.get('auto') === '1');
        if (params.get('review') === '1') {
          setNeedsReviewOnly(true);
        }
        const b = params.get('bucket');
        if (b && ['income', 'fixed', 'flexible', 'non-monthly'].includes(b)) {
          onSelectBucket?.(b as 'income' | 'fixed' | 'flexible' | 'non-monthly');
        }
        const tag = params.get('tag');
        if (tag) {
          if (tag === 'needs-review') {
            setNeedsReviewOnly(true);
            onSelectTagFilter?.(null);
          } else {
            onSelectTagFilter?.(tag);
          }
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

  const allCategories = useMemo(() => {
    const map = new Map<string, Category>();
    DEFAULT_CATEGORIES.forEach(c => map.set(c.id, c));
    categories.forEach(c => map.set(c.id, c));
    return Array.from(map.values());
  }, [categories]);

  const targetCategory = useMemo(() => {
    if (!activeCategoryFilter) return null;
    const f = activeCategoryFilter.toLowerCase();
    return (
      allCategories.find(
        c => c.id.toLowerCase() === f || c.name.toLowerCase() === f
      ) || null
    );
  }, [activeCategoryFilter, allCategories]);

  const availableAccounts = useMemo<AccountFilterOption[]>(() => {
    const map = new Map<string, string>();
    for (const t of transactions) {
      const rawAcct = resolveTransactionAccount(t);
      if (!rawAcct) continue;
      const key = getCanonicalAccountKey(rawAcct);
      if (key && !map.has(key)) {
        map.set(key, formatAccountDisplay(rawAcct));
      }
    }
    return Array.from(map.entries())
      .map(([key, label]) => ({ key, label }))
      .sort((a, b) => a.label.localeCompare(b.label));
  }, [transactions]);

  const handleSelectType = useCallback(
    (nextType: LedgerTypeFilter) => {
      setSelectedType(nextType);
      if (nextType === 'expense' && selectedBucket === 'income') {
        onSelectBucket?.(null);
      } else if ((nextType === 'income' || nextType === 'transfer') && selectedBucket) {
        onSelectBucket?.(null);
      }
    },
    [selectedBucket, onSelectBucket]
  );

  const handleSelectBucket = useCallback(
    (nextBucket: 'income' | 'fixed' | 'flexible' | 'non-monthly' | null) => {
      onSelectBucket?.(nextBucket);
      if (nextBucket === 'income' && selectedType && selectedType !== 'income') {
        setSelectedType(null);
      } else if (
        nextBucket &&
        nextBucket !== 'income' &&
        (selectedType === 'income' || selectedType === 'transfer')
      ) {
        setSelectedType(null);
      }
    },
    [selectedType, onSelectBucket]
  );

  /**
   * Context-scoped slice (month + category/subcategory + day + autoFilter + account + user-tag + search)
   * evaluated BEFORE bucket / type / review pill toggles so the top KPI strip dynamically summarizes
   * any searched/tagged/account slice while keeping sibling bucket pills interactive.
   */
  const contextScopedTransactions = useMemo(() => {
    let list = [...transactions];

    if (activeCategoryFilter) {
      const f = activeCategoryFilter.toLowerCase();
      const fId = targetCategory?.id.toLowerCase();
      const fName = targetCategory?.name.toLowerCase();
      list = list.filter(t => {
        const c = (t.category || '').toLowerCase();
        const s = (t.subCategory || '').toLowerCase();
        return (
          c === f ||
          s === f ||
          (Boolean(fId) && (c === fId || s === fId)) ||
          (Boolean(fName) && (c === fName || s === fName))
        );
      });
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

    if (selectedAccount) {
      list = list.filter(
        t => getCanonicalAccountKey(resolveTransactionAccount(t)) === selectedAccount
      );
    }

    if (selectedTagFilter) {
      list = list.filter(t => getVisibleUserTags(t).includes(selectedTagFilter));
    }

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim();
      list = list.filter(t => {
        const desc = (t.description || '').toLowerCase();
        const note = getUserFacingNote(t).toLowerCase();
        const catObj = allCategories.find(c => c.id === t.category);
        const subObj = t.subCategory ? allCategories.find(c => c.id === t.subCategory) : null;
        const catText = `${t.category || ''} ${catObj?.name || ''} ${subObj?.name || ''}`.toLowerCase();
        const acctText = formatAccountDisplay(resolveTransactionAccount(t)).toLowerCase();
        const userTags = getVisibleUserTags(t);
        const tags = userTags.map(tag => `#${tag} ${tag}`).join(' ').toLowerCase();
        const amtText = `${t.amount ?? ''} ${typeof t.amount === 'number' ? t.amount.toFixed(2) : ''}`;
        return (
          desc.includes(q) ||
          note.includes(q) ||
          catText.includes(q) ||
          acctText.includes(q) ||
          tags.includes(q) ||
          amtText.includes(q)
        );
      });
    }

    return list;
  }, [
    transactions,
    activeCategoryFilter,
    targetCategory,
    selectedDay,
    autoFilter,
    selectedAccount,
    selectedTagFilter,
    searchQuery,
    categories,
    allCategories,
  ]);

  const categorySortLabelMap = useMemo(() => {
    const map = new Map<string, string>();
    for (const c of allCategories) {
      map.set(c.id, c.name);
      map.set(c.id.toLowerCase(), c.name);
    }
    return map;
  }, [allCategories]);

  const displayedTransactions = useMemo(() => {
    let list = [...contextScopedTransactions];

    if (needsReviewOnly) {
      list = list.filter(t => isTransactionNeedsReview(t, duplicateTxnIds));
    }

    if (selectedType) {
      if (selectedType === 'expense') {
        list = list.filter(t => t.type === 'expense' || isRefundTransaction(t));
      } else if (selectedType === 'income') {
        list = list.filter(t => t.type === 'income' && !isRefundTransaction(t));
      } else if (selectedType === 'refund') {
        list = list.filter(t => isRefundTransaction(t));
      } else if (selectedType === 'transfer') {
        list = list.filter(t => t.type === 'transfer');
      }
    }

    if (selectedBucket) {
      if (selectedBucket === 'income') {
        list = list.filter(t => t.type === 'income' && !isRefundTransaction(t));
      } else {
        list = list.filter(
          t =>
            (t.type === 'expense' || isRefundTransaction(t)) &&
            bucketOf(t, categories) === selectedBucket
        );
      }
    }

    const resolveSortCat = (t: Transaction) => {
      const pName =
        categorySortLabelMap.get(t.category) ||
        categorySortLabelMap.get((t.category || '').toLowerCase()) ||
        t.category ||
        '';
      const sName = t.subCategory
        ? categorySortLabelMap.get(t.subCategory) ||
          categorySortLabelMap.get(t.subCategory.toLowerCase()) ||
          t.subCategory
        : '';
      return sName ? `${pName} › ${sName}` : pName;
    };

    const tieBreak = (a: Transaction, b: Transaction) =>
      (b.date || '').localeCompare(a.date || '') || (a.id || '').localeCompare(b.id || '');

    list.sort((a, b) => {
      switch (sortBy) {
        case 'date-asc':
          return (
            (a.date || '').localeCompare(b.date || '') ||
            (a.id || '').localeCompare(b.id || '')
          );
        case 'amount-desc':
          return (b.amount || 0) - (a.amount || 0) || tieBreak(a, b);
        case 'amount-asc':
          return (a.amount || 0) - (b.amount || 0) || tieBreak(a, b);
        case 'cat-asc':
        case 'category-asc':
          return (
            resolveSortCat(a).localeCompare(resolveSortCat(b), undefined, {
              sensitivity: 'base',
            }) || tieBreak(a, b)
          );
        case 'cat-desc':
          return (
            resolveSortCat(b).localeCompare(resolveSortCat(a), undefined, {
              sensitivity: 'base',
            }) || tieBreak(a, b)
          );
        case 'desc-asc':
        case 'description-asc':
          return (
            (a.description || '').localeCompare(b.description || '', undefined, {
              sensitivity: 'base',
            }) || tieBreak(a, b)
          );
        case 'desc-desc':
          return (
            (b.description || '').localeCompare(a.description || '', undefined, {
              sensitivity: 'base',
            }) || tieBreak(a, b)
          );
        case 'date-desc':
        default:
          return tieBreak(a, b);
      }
    });

    return list;
  }, [
    contextScopedTransactions,
    needsReviewOnly,
    duplicateTxnIds,
    selectedType,
    selectedBucket,
    categories,
    categorySortLabelMap,
    sortBy,
  ]);

  // Prune any selected transaction IDs that are no longer visible in displayedTransactions
  useEffect(() => {
    if (selectedTxnIds.size === 0) return;
    const visibleIds = new Set(displayedTransactions.map(t => t.id));
    let hasHiddenSelection = false;
    for (const id of selectedTxnIds) {
      if (!visibleIds.has(id)) {
        hasHiddenSelection = true;
        break;
      }
    }
    if (!hasHiddenSelection) return;
    if (onRetainOnlyVisibleSelection) {
      onRetainOnlyVisibleSelection(visibleIds);
    } else if (visibleIds.size === 0) {
      onClearSelectedTxns();
    }
  }, [displayedTransactions, selectedTxnIds, onRetainOnlyVisibleSelection, onClearSelectedTxns]);

  const monthFinancials = useMemo(() => {
    const m = computeMonthMetrics(contextScopedTransactions, 'all', categories);
    return {
      income: m.income,
      expenses: m.expenses,
      fixed: m.fixed,
      flexible: m.flexible,
      nonMonthly: m.nonMonthly,
    };
  }, [contextScopedTransactions, categories]);

  const needsReviewCount = useMemo(
    () =>
      contextScopedTransactions.filter(t =>
        isTransactionNeedsReview(t, duplicateTxnIds)
      ).length,
    [contextScopedTransactions, duplicateTxnIds]
  );

  useEffect(() => {
    if (needsReviewCount === 0 && needsReviewOnly) {
      setNeedsReviewOnly(false);
    }
  }, [needsReviewCount, needsReviewOnly]);

  const activeCategoryChipLabel = targetCategory
    ? `${targetCategory.emoji ? `${targetCategory.emoji} ` : ''}${targetCategory.name}`
    : activeCategoryFilter;

  return (
    <div
      className="max-w-[1120px] mx-auto space-y-2.5 pb-12"
      data-testid="level4-transactions-workspace"
    >
      {/* Unified KPI Summary & 1-Click Quick-Filter Strip */}
      <div className="flex flex-wrap items-center gap-1.5">
        <button
          type="button"
          onClick={() =>
            handleSelectType(selectedType === 'expense' ? null : 'expense')
          }
          className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-[10px] border text-label font-medium max-w-full transition-colors focus-visible:ring-2 focus-visible:ring-primary/40 ${
            selectedType === 'expense'
              ? 'bg-primary text-primary-foreground border-primary'
              : 'bg-card border-border text-muted-foreground hover:text-foreground hover:bg-surface2'
          }`}
        >
          <span>Expenses</span>
          <span
            data-testid="kpi-total-expenses"
            className={`font-semibold tabular-nums num truncate max-w-[180px] ${
              selectedType === 'expense' ? 'text-primary-foreground' : 'text-foreground'
            }`}
          >
            {formatCurrency(monthFinancials.expenses)}
          </span>
        </button>

        <button
          type="button"
          data-testid="kpi-fixed-expenses"
          onClick={() =>
            handleSelectBucket(selectedBucket === 'fixed' ? null : 'fixed')
          }
          className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-[10px] border text-label font-medium max-w-full transition-colors focus-visible:ring-2 focus-visible:ring-primary/40 ${
            selectedBucket === 'fixed'
              ? 'bg-primary text-primary-foreground border-primary'
              : 'bg-card border-border text-muted-foreground hover:text-foreground hover:bg-surface2'
          }`}
        >
          <span className="w-2 h-2 rounded-full bg-bucket-fixed shrink-0" />
          <span>Fixed</span>
          <span
            className={`font-semibold tabular-nums num truncate max-w-[180px] ${
              selectedBucket === 'fixed' ? 'text-primary-foreground' : 'text-foreground'
            }`}
          >
            {formatCurrency(monthFinancials.fixed)}
          </span>
        </button>

        <button
          type="button"
          data-testid="kpi-flexible-spent"
          onClick={() =>
            handleSelectBucket(selectedBucket === 'flexible' ? null : 'flexible')
          }
          className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-[10px] border text-label font-medium max-w-full transition-colors focus-visible:ring-2 focus-visible:ring-primary/40 ${
            selectedBucket === 'flexible'
              ? 'bg-primary text-primary-foreground border-primary'
              : 'bg-card border-border text-muted-foreground hover:text-foreground hover:bg-surface2'
          }`}
        >
          <span className="w-2 h-2 rounded-full bg-bucket-variable shrink-0" />
          <span>Variable</span>
          <span
            className={`font-semibold tabular-nums num truncate max-w-[180px] ${
              selectedBucket === 'flexible' ? 'text-primary-foreground' : 'text-foreground'
            }`}
          >
            {formatCurrency(monthFinancials.flexible)}
          </span>
        </button>

        <button
          type="button"
          data-testid="kpi-non-monthly"
          onClick={() =>
            handleSelectBucket(
              selectedBucket === 'non-monthly' ? null : 'non-monthly'
            )
          }
          className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-[10px] border text-label font-medium max-w-full transition-colors focus-visible:ring-2 focus-visible:ring-primary/40 ${
            selectedBucket === 'non-monthly'
              ? 'bg-primary text-primary-foreground border-primary'
              : 'bg-card border-border text-muted-foreground hover:text-foreground hover:bg-surface2'
          }`}
        >
          <span className="w-2 h-2 rounded-full bg-bucket-nonmonthly shrink-0" />
          <span>Non-monthly</span>
          <span
            className={`font-semibold tabular-nums num truncate max-w-[180px] ${
              selectedBucket === 'non-monthly'
                ? 'text-primary-foreground'
                : 'text-foreground'
            }`}
          >
            {formatCurrency(monthFinancials.nonMonthly)}
          </span>
        </button>

        <button
          type="button"
          data-testid="kpi-total-income"
          onClick={() =>
            handleSelectBucket(selectedBucket === 'income' ? null : 'income')
          }
          className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-[10px] border text-label font-medium max-w-full transition-colors focus-visible:ring-2 focus-visible:ring-primary/40 ${
            selectedBucket === 'income'
              ? 'bg-primary text-primary-foreground border-primary'
              : 'bg-card border-border text-muted-foreground hover:text-foreground hover:bg-surface2'
          }`}
        >
          <span className="w-2 h-2 rounded-full bg-bucket-saved shrink-0" />
          <span>Income</span>
          <span
            className={`font-semibold tabular-nums num truncate max-w-[180px] ${
              selectedBucket === 'income' ? 'text-primary-foreground' : 'text-foreground'
            }`}
          >
            {formatCurrency(monthFinancials.income)}
          </span>
        </button>

        {needsReviewCount > 0 && (
          <button
            type="button"
            data-testid="kpi-needs-review"
            onClick={() => setNeedsReviewOnly(prev => !prev)}
            className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-[10px] border text-label font-medium transition-colors focus-visible:ring-2 focus-visible:ring-primary/40 ${
              needsReviewOnly
                ? 'bg-warning text-background border-warning'
                : 'bg-warning/10 border-warning/30 text-warning hover:bg-warning/20'
            }`}
          >
            <span>Needs Review</span>
            <span className="font-semibold tabular-nums num">{needsReviewCount}</span>
          </button>
        )}
      </div>

      {/* Single Primary Toolbar Row + Conditional Active Filter Chips */}
      <TransactionToolbar
        availableTags={availableTags}
        availableAccounts={availableAccounts}
        selectedTagFilter={selectedTagFilter}
        selectedBucket={selectedBucket}
        selectedType={selectedType}
        selectedAccount={selectedAccount}
        needsReviewOnly={needsReviewOnly}
        activeCategoryLabel={activeCategoryChipLabel}
        autoFilter={autoFilter}
        sortBy={sortBy}
        searchQuery={searchQuery}
        onSearchChange={setSearchQuery}
        selectedDay={selectedDay}
        onClearDay={() => setSelectedDay(null)}
        onClearCategory={() => {
          setActiveCategoryFilter(null);
          if (isCategoryTransactions) {
            navigate(`#/transactions?month=${month}`);
          }
        }}
        onClearAutoFilter={() => setAutoFilter(false)}
        onClearNeedsReview={() => setNeedsReviewOnly(false)}
        isCurrentMonthLocked={isLockedMonth}
        setSelectedTagFilter={onSelectTagFilter}
        setSelectedBucket={handleSelectBucket}
        setSelectedType={handleSelectType}
        setSelectedAccount={setSelectedAccount}
        setSortBy={onSetSortBy}
        handleOpenAddTxn={onOpenAddTxn}
        handleCsvFileUpload={onCsvFileUpload}
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
        onSelectAccountFilter={acctKey =>
          setSelectedAccount(prev => (prev === acctKey ? null : acctKey))
        }
        toggleSelectTxn={onToggleSelectTxn}
        toggleSelectAllTxns={onToggleSelectAllTxns}
        clearSelectedTxns={onClearSelectedTxns}
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
        handleDismissReview={onDismissReview}
      />
    </div>
  );
}

export default TransactionsView;
