import React, { useState, useMemo, useEffect, useCallback, useRef } from 'react';
import { Check, Sparkles, X } from 'lucide-react';
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
  MonthlyLock,
} from '../../services/storage';
import { formatCurrency } from '../../utils/formatters';
import { bucketOf, bucketSource, suggestSpendingBucket } from '../../utils/categorizer';
import {
  coerceAmount,
  computeLedgerSliceSummary,
  computeMonthMetrics,
  isRefundTransaction,
} from '../../utils/metrics';
import {
  resolveTransactionAccount,
  getCanonicalAccountKey,
  formatAccountDisplay,
  getVisibleUserTags,
  getUserFacingNote,
  isTransactionNeedsReview,
  isTransactionPending,
  isTransactionMonthLocked,
  formatReviewBadgeLabel,
  getReviewDetailText,
} from '../../utils/transactionTaxonomy';
import { parseHash, formatMonthLabel } from '../../utils/navigation';
import {
  parseLedgerUrlState,
  buildLedgerUrlHash,
  LedgerUrlState,
} from '../../utils/ledgerUrlSync';
import { findSimilarTransactionsForSweep } from '../../utils/merchantSweep';
import { buildTransactionsCsvExport } from '../../utils/csv';
import { showToast } from '../../utils/toast';
import { useNavigation } from '../../hooks/useNavigation';

const TYPE_CHIP_LABELS: Record<Exclude<LedgerTypeFilter, null>, string> = {
  expense: 'Expenses',
  income: 'Income',
  refund: 'Refunds',
  transfer: 'Transfers',
};

export interface TransactionsViewProps {
  month: string;
  transactions: Transaction[];
  allTransactions?: Transaction[];
  locks?: MonthlyLock[];
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
  onOpenCsvWizard?: () => void;
  onEditTxn: (t: Transaction) => void;
  onDeleteTxn: (id: string) => void;
  onCsvFileUpload: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onToggleSelectTxn: (id: string) => void;
  onRangeSelectTxns?: (ids: string[], select: boolean) => void;
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
  onBulkDismissReview?: (ids: Set<string>, onComplete?: () => void) => void;
  onApplyMerchantSweep?: (
    matchingIds: string[],
    categoryId: string,
    subCategoryId?: string | null
  ) => Promise<boolean>;
  onBackfillBuckets?: (map: Record<string, SpendingBucket>) => Promise<boolean>;
}

interface MerchantSweepPrompt {
  merchantDisplay: string;
  matchingIds: string[];
  categoryId: string;
  subCategoryId: string | null;
  categoryLabel: string;
}

export function TransactionsView({
  month,
  transactions,
  allTransactions,
  locks = [],
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
  onOpenCsvWizard,
  onEditTxn,
  onDeleteTxn,
  onCsvFileUpload,
  onToggleSelectTxn,
  onRangeSelectTxns,
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
  onBulkDismissReview,
  onApplyMerchantSweep,
  onBackfillBuckets,
}: TransactionsViewProps) {
  const { navigate } = useNavigation();
  const searchInputRef = useRef<HTMLInputElement>(null);

  const initialUrlState = useMemo(
    () =>
      typeof window !== 'undefined'
        ? parseLedgerUrlState(window.location.hash, {
            isCategoryTransactions,
            initialCategoryId,
          })
        : parseLedgerUrlState('', { isCategoryTransactions, initialCategoryId }),
    // Evaluated once on mount to seed deterministic initial local states
    // eslint-disable-next-line react-hooks/exhaustive-deps
    []
  );

  const [activeCategoryFilter, setActiveCategoryFilter] = useState<string | null>(
    initialUrlState.cat
  );
  const [selectedType, setSelectedType] = useState<LedgerTypeFilter>(initialUrlState.type);
  const [selectedAccount, setSelectedAccount] = useState<string | null>(
    initialUrlState.account
  );
  const [needsReviewOnly, setNeedsReviewOnly] = useState<boolean>(initialUrlState.review);
  const [autoFilter, setAutoFilter] = useState<boolean>(initialUrlState.auto);
  const [pendingOnly, setPendingOnly] = useState<boolean>(initialUrlState.pending);
  const [selectedDay, setSelectedDay] = useState<number | null>(initialUrlState.day);
  const [searchQuery, setSearchQuery] = useState<string>(initialUrlState.q);
  const [sweepPrompt, setSweepPrompt] = useState<MerchantSweepPrompt | null>(null);

  // Guardrail 1: prevent parent-prop & external hashchange hydration race from writing stale React state into URL
  const pendingExternalSyncRef = useRef<{
    bucket: typeof selectedBucket;
    tag: string | null;
  } | null>(
    (initialUrlState.bucket ?? null) !== (selectedBucket ?? null) ||
      (initialUrlState.tag ?? null) !== (selectedTagFilter ?? null)
      ? { bucket: initialUrlState.bucket, tag: initialUrlState.tag }
      : null
  );
  const applyingExternalHashRef = useRef<LedgerUrlState | null>(null);
  const lastSyncedHashRef = useRef<string>(
    typeof window !== 'undefined' ? window.location.hash : ''
  );

  const selectedBucketRef = useRef(selectedBucket);
  selectedBucketRef.current = selectedBucket;
  const selectedTagFilterRef = useRef(selectedTagFilter);
  selectedTagFilterRef.current = selectedTagFilter;

  const clearPendingSyncGuards = useCallback(() => {
    pendingExternalSyncRef.current = null;
    applyingExternalHashRef.current = null;
    if (typeof window !== 'undefined') {
      lastSyncedHashRef.current = window.location.hash;
    }
  }, []);

  // Use incoming URL state during render 1 if parent state hasn't committed yet
  const effectiveSelectedBucket = pendingExternalSyncRef.current
    ? pendingExternalSyncRef.current.bucket ?? null
    : selectedBucket ?? null;
  const effectiveSelectedTagFilter = pendingExternalSyncRef.current
    ? pendingExternalSyncRef.current.tag
    : selectedTagFilter ?? null;

  const syncFromHash = useCallback(() => {
    if (typeof window === 'undefined') return;
    const hash = window.location.hash;
    if (parseHash(hash, month).view !== 'transactions') return;

    const parsed = parseLedgerUrlState(hash, {
      isCategoryTransactions,
      initialCategoryId,
    });

    applyingExternalHashRef.current = parsed;

    setActiveCategoryFilter(parsed.cat);
    setSelectedType(parsed.type);
    setSelectedAccount(parsed.account);
    setNeedsReviewOnly(parsed.review);
    setAutoFilter(parsed.auto);
    setPendingOnly(parsed.pending);
    setSelectedDay(parsed.day);
    setSearchQuery(parsed.q);

    const bucketDiffers =
      (parsed.bucket ?? null) !== (selectedBucketRef.current ?? null);
    const tagDiffers =
      (parsed.tag ?? null) !== (selectedTagFilterRef.current ?? null);

    if (bucketDiffers || tagDiffers) {
      pendingExternalSyncRef.current = {
        bucket: parsed.bucket,
        tag: parsed.tag,
      };
    }
    if (bucketDiffers) {
      onSelectBucket?.(parsed.bucket);
    }
    if (tagDiffers) {
      onSelectTagFilter?.(parsed.tag);
    }
    if (parsed.sort) {
      onSetSortBy?.(parsed.sort);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isCategoryTransactions, initialCategoryId]);

  // 1. Hydrate & synchronize all filters from URL hash on mount, hashchange, or category route drilldown change
  useEffect(() => {
    syncFromHash();
    window.addEventListener('hashchange', syncFromHash);
    return () => window.removeEventListener('hashchange', syncFromHash);
  }, [syncFromHash]);

  // Migrate legacy selectedTagFilter === 'needs-review' into dedicated needsReviewOnly state
  useEffect(() => {
    if (selectedTagFilter === 'needs-review') {
      setNeedsReviewOnly(true);
      onSelectTagFilter?.(null);
    }
  }, [selectedTagFilter, onSelectTagFilter]);

  // Global '/' keyboard shortcut to focus search input on /transactions
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey || e.key !== '/') return;
      const target = e.target as HTMLElement | null;
      if (
        target &&
        (target.tagName === 'INPUT' ||
          target.tagName === 'TEXTAREA' ||
          target.tagName === 'SELECT' ||
          target.isContentEditable)
      ) {
        return;
      }
      const hasOpenOverlay = Boolean(
        document.querySelector('[role="dialog"], [role="listbox"], [data-popover]')
      );
      if (hasOpenOverlay) return;

      e.preventDefault();
      searchInputRef.current?.focus();
      searchInputRef.current?.select();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  // Capture-phase 'Escape' clears multi-row selection before NavigationContext.goBack fires!
  useEffect(() => {
    if (selectedTxnIds.size === 0) return;
    const onEscapeCapture = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      const target = e.target as HTMLElement | null;
      const isTextEntryInput = Boolean(
        target &&
          ((target.tagName === 'INPUT' &&
            (target as HTMLInputElement).type !== 'checkbox' &&
            (target as HTMLInputElement).type !== 'radio') ||
            target.tagName === 'TEXTAREA' ||
            target.tagName === 'SELECT' ||
            target.isContentEditable)
      );
      if (isTextEntryInput) {
        return;
      }
      const hasOpenOverlay = Boolean(
        document.querySelector(
          '[data-radix-popper-content-wrapper], [role="dialog"], [role="listbox"], [data-popover], .fixed.inset-0.z-50'
        )
      );
      if (hasOpenOverlay) return;

      e.preventDefault();
      e.stopPropagation();
      e.stopImmediatePropagation();
      onClearSelectedTxns();
    };
    window.addEventListener('keydown', onEscapeCapture, true);
    return () => window.removeEventListener('keydown', onEscapeCapture, true);
  }, [selectedTxnIds.size, onClearSelectedTxns]);

  // Dismiss sweep prompt if month changes
  useEffect(() => {
    setSweepPrompt(null);
  }, [month]);

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

  // Month-scoped filter tags for Filter popover (never leaks out-of-month dead-end tags!)
  const filterTags = useMemo(() => {
    const set = new Set<string>();
    for (const t of transactions) {
      for (const tag of getVisibleUserTags(t)) {
        set.add(tag);
      }
    }
    if (effectiveSelectedTagFilter) {
      set.add(effectiveSelectedTagFilter);
    }
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }, [transactions, effectiveSelectedTagFilter]);

  const handleSelectType = useCallback(
    (nextType: LedgerTypeFilter) => {
      clearPendingSyncGuards();
      setSelectedType(nextType);
      if (nextType === 'expense' && effectiveSelectedBucket === 'income') {
        onSelectBucket?.(null);
      } else if (
        (nextType === 'income' || nextType === 'transfer') &&
        effectiveSelectedBucket
      ) {
        onSelectBucket?.(null);
      }
    },
    [clearPendingSyncGuards, effectiveSelectedBucket, onSelectBucket]
  );

  const handleSelectBucket = useCallback(
    (nextBucket: 'income' | 'fixed' | 'flexible' | 'non-monthly' | null) => {
      clearPendingSyncGuards();
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
    [clearPendingSyncGuards, selectedType, onSelectBucket]
  );

  const handleClearCategory = useCallback(() => {
    clearPendingSyncGuards();
    setActiveCategoryFilter(null);
    if (isCategoryTransactions) {
      const targetHash = buildLedgerUrlHash({
        month,
        isCategoryTransactions: false,
        bucket: effectiveSelectedBucket,
        type: selectedType,
        cat: null,
        account: selectedAccount,
        tag: effectiveSelectedTagFilter,
        review: needsReviewOnly,
        day: selectedDay,
        auto: autoFilter,
        pending: pendingOnly,
        q: searchQuery,
        sort: sortBy || 'date-desc',
      });
      navigate(targetHash);
    }
  }, [
    clearPendingSyncGuards,
    isCategoryTransactions,
    month,
    effectiveSelectedBucket,
    selectedType,
    selectedAccount,
    effectiveSelectedTagFilter,
    needsReviewOnly,
    selectedDay,
    autoFilter,
    pendingOnly,
    searchQuery,
    sortBy,
    navigate,
  ]);

  const handleResetAllFilters = useCallback(() => {
    clearPendingSyncGuards();
    setSelectedType(null);
    onSelectBucket?.(null);
    setSelectedAccount(null);
    onSelectTagFilter?.(null);
    setSelectedDay(null);
    setAutoFilter(false);
    setNeedsReviewOnly(false);
    setPendingOnly(false);
    setSearchQuery('');
    setActiveCategoryFilter(null);

    const cleanHash = `#/transactions?month=${month}`;
    if (isCategoryTransactions) {
      lastSyncedHashRef.current = cleanHash;
      navigate(cleanHash);
    } else if (typeof window !== 'undefined' && window.location.hash !== cleanHash) {
      lastSyncedHashRef.current = cleanHash;
      window.history.replaceState(null, '', cleanHash);
    }
  }, [
    clearPendingSyncGuards,
    isCategoryTransactions,
    month,
    navigate,
    onSelectBucket,
    onSelectTagFilter,
  ]);

  /**
   * Context-scoped slice (month + category/subcategory + day + autoFilter + pendingOnly + account + user-tag + search)
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

    if (pendingOnly) {
      list = list.filter(t => isTransactionPending(t));
    }

    if (selectedAccount) {
      list = list.filter(
        t => getCanonicalAccountKey(resolveTransactionAccount(t)) === selectedAccount
      );
    }

    if (effectiveSelectedTagFilter) {
      list = list.filter(t =>
        getVisibleUserTags(t).includes(effectiveSelectedTagFilter)
      );
    }

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim();
      const qNoCommas = q.replace(/,/g, '');
      list = list.filter(t => {
        const desc = (t.description || '').toLowerCase();
        const note = getUserFacingNote(t).toLowerCase();
        const catObj = allCategories.find(c => c.id === t.category);
        const subObj = t.subCategory ? allCategories.find(c => c.id === t.subCategory) : null;
        const subAlias = subObj?.name === 'Electricity' ? 'electric power' : '';
        const catText = `${t.category || ''} ${catObj?.name || ''} ${subObj?.name || ''} ${subAlias}`.toLowerCase();
        const acctText = formatAccountDisplay(resolveTransactionAccount(t)).toLowerCase();
        const userTags = getVisibleUserTags(t);
        const tags = userTags.map(tag => `#${tag} ${tag}`).join(' ').toLowerCase();
        const dateText = (t.date || '').toLowerCase();
        const orderText = (t.meta?.orderId || '').toLowerCase();
        const isFlagged = isTransactionNeedsReview(t, duplicateTxnIds);
        const isDup = duplicateTxnIds.has(t.id);
        const reviewText = isFlagged
          ? `${formatReviewBadgeLabel(t, isDup)} ${getReviewDetailText(t, isDup)}`.toLowerCase()
          : '';
        const amtNum = Math.abs(coerceAmount(t.amount));
        const formattedAmt = formatCurrency(amtNum).toLowerCase();
        const amtText = `${t.amount ?? ''} ${amtNum.toFixed(2)} ${formattedAmt} ${formattedAmt.replace(
          /,/g,
          ''
        )}`;
        return (
          desc.includes(q) ||
          note.includes(q) ||
          catText.includes(q) ||
          acctText.includes(q) ||
          tags.includes(q) ||
          dateText.includes(q) ||
          orderText.includes(q) ||
          (reviewText !== '' && reviewText.includes(q)) ||
          amtText.includes(q) ||
          (qNoCommas.length > 0 && amtText.includes(qNoCommas))
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
    pendingOnly,
    selectedAccount,
    effectiveSelectedTagFilter,
    searchQuery,
    categories,
    allCategories,
    duplicateTxnIds,
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

    if (effectiveSelectedBucket) {
      if (effectiveSelectedBucket === 'income') {
        list = list.filter(t => t.type === 'income' && !isRefundTransaction(t));
      } else {
        list = list.filter(
          t =>
            (t.type === 'expense' || isRefundTransaction(t)) &&
            bucketOf(t, categories) === effectiveSelectedBucket
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
          return (
            Math.abs(coerceAmount(b.amount)) - Math.abs(coerceAmount(a.amount)) ||
            tieBreak(a, b)
          );
        case 'amount-asc':
          return (
            Math.abs(coerceAmount(a.amount)) - Math.abs(coerceAmount(b.amount)) ||
            tieBreak(a, b)
          );
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
    effectiveSelectedBucket,
    categories,
    categorySortLabelMap,
    sortBy,
  ]);

  // Prune any selected transaction IDs that are no longer visible or are inside a locked month
  useEffect(() => {
    if (selectedTxnIds.size === 0) return;
    const selectableVisibleIds = new Set(
      displayedTransactions
        .filter(t => !isLockedMonth && !isTransactionMonthLocked(t.date, locks))
        .map(t => t.id)
    );
    let hasInvalidSelection = false;
    for (const id of selectedTxnIds) {
      if (!selectableVisibleIds.has(id)) {
        hasInvalidSelection = true;
        break;
      }
    }
    if (!hasInvalidSelection) return;
    if (onRetainOnlyVisibleSelection) {
      onRetainOnlyVisibleSelection(selectableVisibleIds);
    } else if (selectableVisibleIds.size === 0) {
      onClearSelectedTxns();
    }
  }, [
    displayedTransactions,
    selectedTxnIds,
    isLockedMonth,
    locks,
    onRetainOnlyVisibleSelection,
    onClearSelectedTxns,
  ]);

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

  // Auto-exit review triage when the last flagged item in a populated month is resolved
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const rawUrlMonth = parseHash(window.location.hash, '').month;
      if (rawUrlMonth && rawUrlMonth !== month) return;
    }
    if (transactions.length > 0 && needsReviewCount === 0 && needsReviewOnly) {
      setNeedsReviewOnly(false);
    }
  }, [transactions.length, needsReviewCount, needsReviewOnly, month]);

  // 2. Two-way URL synchronization via replaceState (guarded against in-flight month & external hashchange races!)
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const currentHash = window.location.hash;
    const currentParsed = parseHash(currentHash, month);
    if (currentParsed.view !== 'transactions') return;

    // If window.location.hash changed externally (e.g. page.goto / hashchange / MonthSwitcher)
    // and we haven't finished hydrating from it yet, sync from it first and NEVER overwrite it!
    if (currentHash !== lastSyncedHashRef.current && !applyingExternalHashRef.current) {
      syncFromHash();
      return;
    }

    const rawUrlMonth = parseHash(currentHash, '').month;
    if (rawUrlMonth && rawUrlMonth !== month) {
      return;
    }

    if (pendingExternalSyncRef.current) {
      const targetBucket = pendingExternalSyncRef.current.bucket ?? null;
      const targetTag = pendingExternalSyncRef.current.tag ?? null;
      if (
        (selectedBucket ?? null) === targetBucket &&
        (selectedTagFilter ?? null) === targetTag
      ) {
        pendingExternalSyncRef.current = null;
      } else {
        return;
      }
    }

    if (applyingExternalHashRef.current) {
      const t = applyingExternalHashRef.current;
      const caughtUp =
        (selectedBucket ?? null) === (t.bucket ?? null) &&
        (selectedTagFilter ?? null) === (t.tag ?? null) &&
        selectedType === t.type &&
        activeCategoryFilter === t.cat &&
        selectedAccount === t.account &&
        (needsReviewOnly === t.review ||
          (t.review && transactions.length > 0 && needsReviewCount === 0)) &&
        selectedDay === t.day &&
        autoFilter === t.auto &&
        pendingOnly === t.pending &&
        searchQuery === t.q &&
        (!t.sort || sortBy === t.sort);

      if (!caughtUp) {
        return;
      }
      applyingExternalHashRef.current = null;
      lastSyncedHashRef.current = currentHash;
    }

    const nextHash = buildLedgerUrlHash({
      month,
      isCategoryTransactions,
      initialCategoryId,
      bucket: selectedBucket ?? null,
      type: selectedType,
      cat: activeCategoryFilter,
      account: selectedAccount,
      tag: selectedTagFilter ?? null,
      review: needsReviewOnly,
      day: selectedDay,
      auto: autoFilter,
      pending: pendingOnly,
      q: searchQuery,
      sort: sortBy || 'date-desc',
    });

    lastSyncedHashRef.current = nextHash;
    if (window.location.hash !== nextHash) {
      window.history.replaceState(null, '', nextHash);
    }
  }, [
    month,
    isCategoryTransactions,
    initialCategoryId,
    selectedBucket,
    selectedType,
    activeCategoryFilter,
    selectedAccount,
    selectedTagFilter,
    needsReviewOnly,
    selectedDay,
    autoFilter,
    pendingOnly,
    searchQuery,
    sortBy,
    transactions.length,
    needsReviewCount,
    syncFromHash,
  ]);

  const hasAnyActiveFilter = Boolean(
    activeCategoryFilter ||
      selectedType ||
      effectiveSelectedBucket ||
      selectedAccount ||
      effectiveSelectedTagFilter ||
      needsReviewOnly ||
      autoFilter ||
      pendingOnly ||
      selectedDay !== null ||
      searchQuery.trim()
  );

  const sliceSummary = useMemo(
    () =>
      computeLedgerSliceSummary(displayedTransactions, transactions.length, {
        isFiltered: hasAnyActiveFilter,
        selectedType,
        selectedBucket: effectiveSelectedBucket,
        needsReviewOnly,
      }),
    [
      displayedTransactions,
      transactions.length,
      hasAnyActiveFilter,
      selectedType,
      effectiveSelectedBucket,
      needsReviewOnly,
    ]
  );

  const activeCategoryChipLabel = targetCategory
    ? `${targetCategory.emoji ? `${targetCategory.emoji} ` : ''}${
        targetCategory.name === 'Electricity' ? 'Electric Power' : targetCategory.name
      }`
    : activeCategoryFilter;

  const selectedAccountLabel =
    availableAccounts.find(a => a.key === selectedAccount)?.label || selectedAccount;

  const handleInlineCategoryChange = useCallback(
    (txn: Transaction, newCatId: string, newSubCatId?: string | null) => {
      onCategoryChange?.(txn, newCatId, newSubCatId);

      if (!onApplyMerchantSweep) return;
      const pool = allTransactions && allTransactions.length > 0 ? allTransactions : transactions;
      const candidate = findSimilarTransactionsForSweep(
        { ...txn, category: newCatId, subCategory: newSubCatId || null },
        newCatId,
        newSubCatId,
        pool,
        locks
      );

      if (candidate && candidate.matchingIds.length > 0) {
        const parentObj = allCategories.find(c => c.id === newCatId);
        const subObj = newSubCatId ? allCategories.find(c => c.id === newSubCatId) : null;
        const subLabel =
          subObj?.name === 'Electricity' ? 'Electric Power' : subObj?.name;
        const categoryLabel = subLabel
          ? `${parentObj?.name || newCatId} › ${subLabel}`
          : parentObj?.name || newCatId;

        setSweepPrompt({
          merchantDisplay: candidate.merchantDisplay,
          matchingIds: candidate.matchingIds,
          categoryId: newCatId,
          subCategoryId: newSubCatId || null,
          categoryLabel,
        });
      } else {
        setSweepPrompt(null);
      }
    },
    [onCategoryChange, onApplyMerchantSweep, allTransactions, transactions, locks, allCategories]
  );

  const handleExportCsv = useCallback(() => {
    if (displayedTransactions.length === 0) return;
    const csvContent = buildTransactionsCsvExport(displayedTransactions, categories);
    const blob = new Blob(['\uFEFF' + csvContent], {
      type: 'text/csv;charset=utf-8;',
    });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `nebula-transactions-${month || 'all'}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    showToast(
      `Exported ${displayedTransactions.length} transaction${
        displayedTransactions.length === 1 ? '' : 's'
      } to CSV`
    );
  }, [displayedTransactions, categories, month]);

  const unlockedDisplayedReviewIds = useMemo(
    () =>
      displayedTransactions
        .filter(
          t =>
            !isLockedMonth &&
            !isTransactionMonthLocked(t.date, locks) &&
            isTransactionNeedsReview(t, duplicateTxnIds)
        )
        .map(t => t.id),
    [displayedTransactions, isLockedMonth, locks, duplicateTxnIds]
  );

  const windowResetKey = `${month}|${selectedType || ''}|${effectiveSelectedBucket || ''}|${
    activeCategoryFilter || ''
  }|${selectedAccount || ''}|${effectiveSelectedTagFilter || ''}|${
    needsReviewOnly ? '1' : '0'
  }|${autoFilter ? '1' : '0'}|${pendingOnly ? '1' : '0'}|${
    selectedDay ?? ''
  }|${searchQuery}|${sortBy || 'date-desc'}`;

  const subheaderRightContent = (
    <>
      {needsReviewOnly &&
        !isLockedMonth &&
        unlockedDisplayedReviewIds.length > 1 &&
        onBulkDismissReview && (
          <button
            type="button"
            data-testid="dismiss-all-reviews-btn"
            onClick={() => onBulkDismissReview(new Set(unlockedDisplayedReviewIds))}
            className="shrink-0 inline-flex items-center gap-1 h-6 px-2 rounded-full bg-warning/15 hover:bg-warning/25 border border-warning/30 text-[11px] font-semibold text-warning whitespace-nowrap transition-colors"
          >
            <Check className="w-3 h-3 shrink-0" />
            <span>Mark all {unlockedDisplayedReviewIds.length} reviewed</span>
          </button>
        )}

      <div className="flex items-center gap-1 overflow-x-auto no-scrollbar min-w-0">
        {activeCategoryChipLabel && (
          <button
            type="button"
            data-testid="clear-category-filter-chip"
            aria-label="Clear category filter"
            onClick={handleClearCategory}
            className="shrink-0 inline-flex items-center gap-1 h-6 px-2 rounded-full bg-surface2 border border-border text-[11px] font-medium text-foreground hover:bg-secondary whitespace-nowrap transition-colors"
          >
            <span>{activeCategoryChipLabel}</span>
            <X className="w-3 h-3 text-muted-foreground shrink-0" />
          </button>
        )}
        {autoFilter && (
          <button
            type="button"
            aria-label="Clear auto-sorted Variable filter"
            onClick={() => {
              clearPendingSyncGuards();
              setAutoFilter(false);
            }}
            className="shrink-0 inline-flex items-center gap-1 h-6 px-2 rounded-full bg-surface2 border border-border text-[11px] font-medium text-foreground hover:bg-secondary whitespace-nowrap transition-colors"
          >
            <span>Auto-sorted into Variable</span>
            <X className="w-3 h-3 text-muted-foreground shrink-0" />
          </button>
        )}
        {needsReviewOnly && (
          <button
            type="button"
            aria-label="Clear Needs Review filter"
            onClick={() => {
              clearPendingSyncGuards();
              setNeedsReviewOnly(false);
            }}
            className="shrink-0 inline-flex items-center gap-1 h-6 px-2 rounded-full bg-warning/15 border border-warning/30 text-[11px] font-medium text-warning hover:bg-warning/20 whitespace-nowrap transition-colors"
          >
            <span>Needs Review</span>
            <X className="w-3 h-3 shrink-0" />
          </button>
        )}
        {pendingOnly && (
          <button
            type="button"
            aria-label="Clear Pending filter"
            onClick={() => {
              clearPendingSyncGuards();
              setPendingOnly(false);
            }}
            className="shrink-0 inline-flex items-center gap-1 h-6 px-2 rounded-full bg-surface2 border border-border text-[11px] font-medium text-foreground hover:bg-secondary whitespace-nowrap transition-colors"
          >
            <span>Pending only</span>
            <X className="w-3 h-3 text-muted-foreground shrink-0" />
          </button>
        )}
        {selectedType && (
          <button
            type="button"
            aria-label={`Clear ${TYPE_CHIP_LABELS[selectedType]} type filter`}
            onClick={() => handleSelectType(null)}
            className="shrink-0 inline-flex items-center gap-1 h-6 px-2 rounded-full bg-surface2 border border-border text-[11px] font-medium text-foreground hover:bg-secondary whitespace-nowrap transition-colors"
          >
            <span>{TYPE_CHIP_LABELS[selectedType]}</span>
            <X className="w-3 h-3 text-muted-foreground shrink-0" />
          </button>
        )}
        {effectiveSelectedBucket && (
          <button
            type="button"
            aria-label="Clear bucket filter"
            onClick={() => handleSelectBucket(null)}
            className="shrink-0 inline-flex items-center gap-1 h-6 px-2 rounded-full bg-surface2 border border-border text-[11px] font-medium text-foreground hover:bg-secondary whitespace-nowrap transition-colors"
          >
            <span>
              {effectiveSelectedBucket === 'flexible'
                ? 'Variable'
                : effectiveSelectedBucket === 'non-monthly'
                ? 'Non-monthly'
                : effectiveSelectedBucket.charAt(0).toUpperCase() +
                  effectiveSelectedBucket.slice(1)}
            </span>
            <X className="w-3 h-3 text-muted-foreground shrink-0" />
          </button>
        )}
        {selectedAccount && (
          <button
            type="button"
            aria-label={`Clear ${selectedAccountLabel} account filter`}
            onClick={() => {
              clearPendingSyncGuards();
              setSelectedAccount(null);
            }}
            className="shrink-0 inline-flex items-center gap-1 h-6 px-2 rounded-full bg-surface2 border border-border text-[11px] font-medium text-foreground hover:bg-secondary whitespace-nowrap transition-colors"
          >
            <span>Account: {selectedAccountLabel}</span>
            <X className="w-3 h-3 text-muted-foreground shrink-0" />
          </button>
        )}
        {effectiveSelectedTagFilter && (
          <button
            type="button"
            aria-label={`Clear #${effectiveSelectedTagFilter} tag filter`}
            onClick={() => {
              clearPendingSyncGuards();
              onSelectTagFilter?.(null);
            }}
            className="shrink-0 inline-flex items-center gap-1 h-6 px-2 rounded-full bg-surface2 border border-border text-[11px] font-medium text-foreground hover:bg-secondary whitespace-nowrap transition-colors"
          >
            <span>#{effectiveSelectedTagFilter}</span>
            <X className="w-3 h-3 text-muted-foreground shrink-0" />
          </button>
        )}
        {selectedDay !== null && (
          <button
            type="button"
            aria-label={`Clear Day ${selectedDay} filter`}
            onClick={() => {
              clearPendingSyncGuards();
              setSelectedDay(null);
            }}
            className="shrink-0 inline-flex items-center gap-1 h-6 px-2 rounded-full bg-surface2 border border-border text-[11px] font-medium text-foreground hover:bg-secondary whitespace-nowrap transition-colors"
          >
            <span>Day {selectedDay}</span>
            <X className="w-3 h-3 text-muted-foreground shrink-0" />
          </button>
        )}
      </div>

      {hasAnyActiveFilter && (
        <button
          type="button"
          data-testid="clear-all-filters-btn"
          onClick={handleResetAllFilters}
          className="shrink-0 h-6 px-1.5 text-[11px] font-medium text-muted-foreground hover:text-foreground whitespace-nowrap transition-colors"
        >
          Clear all
        </button>
      )}
    </>
  );

  return (
    <div
      className="max-w-[1120px] mx-auto space-y-2 pb-12"
      data-testid="level4-transactions-workspace"
    >
      {/* Zone 1: Unified KPI Summary & 1-Click Quick-Filter Strip (single swipeable row on mobile, wraps cleanly on sm+) */}
      <div className="flex flex-nowrap overflow-x-auto sm:flex-wrap items-center gap-1.5 pb-0.5 -mx-1 px-1 no-scrollbar">
        <button
          type="button"
          aria-pressed={selectedType === 'expense'}
          onClick={() =>
            handleSelectType(selectedType === 'expense' ? null : 'expense')
          }
          className={`shrink-0 sm:shrink inline-flex items-center gap-1.5 px-3 py-1.5 rounded-[10px] border text-label font-medium max-w-full transition-colors focus-visible:ring-2 focus-visible:ring-primary/40 ${
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
          aria-pressed={effectiveSelectedBucket === 'fixed'}
          onClick={() =>
            handleSelectBucket(effectiveSelectedBucket === 'fixed' ? null : 'fixed')
          }
          className={`shrink-0 sm:shrink inline-flex items-center gap-1.5 px-3 py-1.5 rounded-[10px] border text-label font-medium max-w-full transition-colors focus-visible:ring-2 focus-visible:ring-primary/40 ${
            effectiveSelectedBucket === 'fixed'
              ? 'bg-primary text-primary-foreground border-primary'
              : 'bg-card border-border text-muted-foreground hover:text-foreground hover:bg-surface2'
          }`}
        >
          <span className="w-2 h-2 rounded-full bg-bucket-fixed shrink-0" />
          <span>Fixed</span>
          <span
            className={`font-semibold tabular-nums num truncate max-w-[180px] ${
              effectiveSelectedBucket === 'fixed'
                ? 'text-primary-foreground'
                : 'text-foreground'
            }`}
          >
            {formatCurrency(monthFinancials.fixed)}
          </span>
        </button>

        <button
          type="button"
          data-testid="kpi-flexible-spent"
          aria-pressed={effectiveSelectedBucket === 'flexible'}
          onClick={() =>
            handleSelectBucket(
              effectiveSelectedBucket === 'flexible' ? null : 'flexible'
            )
          }
          className={`shrink-0 sm:shrink inline-flex items-center gap-1.5 px-3 py-1.5 rounded-[10px] border text-label font-medium max-w-full transition-colors focus-visible:ring-2 focus-visible:ring-primary/40 ${
            effectiveSelectedBucket === 'flexible'
              ? 'bg-primary text-primary-foreground border-primary'
              : 'bg-card border-border text-muted-foreground hover:text-foreground hover:bg-surface2'
          }`}
        >
          <span className="w-2 h-2 rounded-full bg-bucket-variable shrink-0" />
          <span>Variable</span>
          <span
            className={`font-semibold tabular-nums num truncate max-w-[180px] ${
              effectiveSelectedBucket === 'flexible'
                ? 'text-primary-foreground'
                : 'text-foreground'
            }`}
          >
            {formatCurrency(monthFinancials.flexible)}
          </span>
        </button>

        <button
          type="button"
          data-testid="kpi-non-monthly"
          aria-pressed={effectiveSelectedBucket === 'non-monthly'}
          onClick={() =>
            handleSelectBucket(
              effectiveSelectedBucket === 'non-monthly' ? null : 'non-monthly'
            )
          }
          className={`shrink-0 sm:shrink inline-flex items-center gap-1.5 px-3 py-1.5 rounded-[10px] border text-label font-medium max-w-full transition-colors focus-visible:ring-2 focus-visible:ring-primary/40 ${
            effectiveSelectedBucket === 'non-monthly'
              ? 'bg-primary text-primary-foreground border-primary'
              : 'bg-card border-border text-muted-foreground hover:text-foreground hover:bg-surface2'
          }`}
        >
          <span className="w-2 h-2 rounded-full bg-bucket-nonmonthly shrink-0" />
          <span className="whitespace-nowrap">Non-monthly</span>
          <span
            className={`font-semibold tabular-nums num truncate max-w-[180px] ${
              effectiveSelectedBucket === 'non-monthly'
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
          aria-pressed={effectiveSelectedBucket === 'income'}
          onClick={() =>
            handleSelectBucket(effectiveSelectedBucket === 'income' ? null : 'income')
          }
          className={`shrink-0 sm:shrink inline-flex items-center gap-1.5 px-3 py-1.5 rounded-[10px] border text-label font-medium max-w-full transition-colors focus-visible:ring-2 focus-visible:ring-primary/40 ${
            effectiveSelectedBucket === 'income'
              ? 'bg-primary text-primary-foreground border-primary'
              : 'bg-card border-border text-muted-foreground hover:text-foreground hover:bg-surface2'
          }`}
        >
          <span className="w-2 h-2 rounded-full bg-bucket-saved shrink-0" />
          <span>Income</span>
          <span
            className={`font-semibold tabular-nums num truncate max-w-[180px] ${
              effectiveSelectedBucket === 'income'
                ? 'text-primary-foreground'
                : 'text-foreground'
            }`}
          >
            {formatCurrency(monthFinancials.income)}
          </span>
        </button>

        {needsReviewCount > 0 && (
          <button
            type="button"
            data-testid="kpi-needs-review"
            aria-pressed={needsReviewOnly}
            onClick={() => {
              clearPendingSyncGuards();
              setNeedsReviewOnly(prev => !prev);
            }}
            className={`shrink-0 sm:shrink inline-flex items-center gap-1.5 px-3 py-1.5 rounded-[10px] border text-label font-medium whitespace-nowrap transition-colors focus-visible:ring-2 focus-visible:ring-primary/40 ${
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

      {/* Zone 2: Compact Control Bar */}
      <TransactionToolbar
        searchInputRef={searchInputRef}
        filterTags={filterTags}
        availableAccounts={availableAccounts}
        allCategories={allCategories}
        selectedTagFilter={effectiveSelectedTagFilter}
        selectedBucket={effectiveSelectedBucket}
        selectedType={selectedType}
        selectedAccount={selectedAccount}
        selectedCategoryFilter={activeCategoryFilter}
        pendingOnly={pendingOnly}
        needsReviewOnly={needsReviewOnly}
        autoFilter={autoFilter}
        sortBy={sortBy}
        searchQuery={searchQuery}
        onSearchChange={q => {
          clearPendingSyncGuards();
          setSearchQuery(q);
        }}
        onClearCategory={handleClearCategory}
        isCurrentMonthLocked={isLockedMonth}
        setSelectedTagFilter={tag => {
          clearPendingSyncGuards();
          onSelectTagFilter?.(tag);
        }}
        setSelectedBucket={handleSelectBucket}
        setSelectedType={handleSelectType}
        setSelectedAccount={acct => {
          clearPendingSyncGuards();
          setSelectedAccount(acct);
        }}
        setSelectedCategoryFilter={nextCat => {
          clearPendingSyncGuards();
          if (!nextCat && isCategoryTransactions) {
            handleClearCategory();
          } else {
            setActiveCategoryFilter(nextCat);
          }
        }}
        setPendingOnly={v => {
          clearPendingSyncGuards();
          setPendingOnly(v);
        }}
        setNeedsReviewOnly={v => {
          clearPendingSyncGuards();
          setNeedsReviewOnly(v);
        }}
        setAutoFilter={v => {
          clearPendingSyncGuards();
          setAutoFilter(v);
        }}
        setSortBy={s => {
          clearPendingSyncGuards();
          onSetSortBy?.(s);
        }}
        handleOpenAddTxn={onOpenAddTxn}
        handleCsvFileUpload={onCsvFileUpload}
        onExportCsv={handleExportCsv}
        canExportCsv={displayedTransactions.length > 0}
      />

      {/* Contextual Merchant Sweep Banner (never a competing toast) */}
      {sweepPrompt && (
        <div
          data-testid="merchant-sweep-banner"
          className="flex flex-wrap items-center justify-between gap-2 px-3.5 py-2.5 rounded-[12px] bg-surface2 border border-border text-label"
        >
          <div className="flex items-center gap-2 min-w-0">
            <Sparkles className="w-3.5 h-3.5 text-foreground shrink-0" />
            <span className="text-foreground">
              Apply <span className="font-semibold">{sweepPrompt.categoryLabel}</span> to{' '}
              <span className="font-semibold tabular-nums num">
                {sweepPrompt.matchingIds.length}
              </span>{' '}
              other{' '}
              <span className="font-semibold">“{sweepPrompt.merchantDisplay}”</span>{' '}
              transaction{sweepPrompt.matchingIds.length === 1 ? '' : 's'}?
            </span>
          </div>
          <div className="flex items-center gap-1.5 shrink-0">
            <button
              type="button"
              data-testid="apply-merchant-sweep-btn"
              onClick={() => {
                const current = sweepPrompt;
                setSweepPrompt(null);
                void onApplyMerchantSweep?.(
                  current.matchingIds,
                  current.categoryId,
                  current.subCategoryId
                );
              }}
              className="px-2.5 py-1 rounded-[8px] bg-primary text-primary-foreground font-semibold hover:opacity-90 whitespace-nowrap transition-opacity"
            >
              Apply to all ({sweepPrompt.matchingIds.length})
            </button>
            <button
              type="button"
              data-testid="dismiss-merchant-sweep-btn"
              aria-label="Dismiss merchant sweep"
              onClick={() => setSweepPrompt(null)}
              className="p-1 rounded-[8px] text-muted-foreground hover:text-foreground hover:bg-card transition-colors"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      )}

      {/* Auto-Sorted Variable Confirmation Banner (?auto=1 from Overview) */}
      {autoFilter &&
        displayedTransactions.length > 0 &&
        !isLockedMonth &&
        onBackfillBuckets && (
          <div
            data-testid="auto-sorted-resolution-banner"
            className="flex flex-wrap items-center justify-between gap-2 px-3.5 py-2 rounded-[12px] bg-surface2 border border-border text-label"
          >
            <span className="text-muted-foreground">
              <span className="font-semibold text-foreground tabular-nums num">
                {displayedTransactions.length}
              </span>{' '}
              expense{displayedTransactions.length === 1 ? '' : 's'} automatically placed in
              Variable — adjust individual buckets inline or confirm all.
            </span>
            <button
              type="button"
              data-testid="confirm-auto-buckets-btn"
              onClick={() => {
                const map: Record<string, SpendingBucket> = {};
                displayedTransactions.forEach(t => {
                  if (t.type === 'expense' && !isTransactionMonthLocked(t.date, locks)) {
                    map[t.id] = suggestSpendingBucket(t.description, t.category);
                  }
                });
                void onBackfillBuckets(map).then(ok => {
                  if (ok) setAutoFilter(false);
                });
              }}
              className="inline-flex items-center gap-1 px-2.5 py-1 rounded-[8px] bg-primary text-primary-foreground font-semibold hover:opacity-90 whitespace-nowrap transition-opacity"
            >
              <Check className="w-3.5 h-3.5" />
              <span>Confirm All</span>
            </button>
          </div>
        )}

      {/* Zone 3 Persistent Subheader + Day-Grouped Ledger Rows */}
      <TransactionList
        transactions={displayedTransactions}
        categories={categories}
        locks={locks}
        availableTags={availableTags}
        selectedTagFilter={effectiveSelectedTagFilter}
        duplicateTxnIds={duplicateTxnIds}
        isLockedMonth={isLockedMonth}
        selectedTxnIds={selectedTxnIds}
        sortBy={sortBy}
        includeYear={month === 'all'}
        showReviewDetailInline={needsReviewOnly}
        windowResetKey={windowResetKey}
        sliceSummaryText={sliceSummary.formattedText}
        subheaderRightContent={subheaderRightContent}
        hasActiveFilters={hasAnyActiveFilter}
        hasUnfilteredMonthTxns={transactions.length > 0}
        monthLabel={month === 'all' ? 'All Time' : formatMonthLabel(month)}
        onResetFilters={handleResetAllFilters}
        onOpenAddTxn={onOpenAddTxn}
        onOpenCsvWizard={onOpenCsvWizard}
        setSelectedTagFilter={tag => {
          clearPendingSyncGuards();
          onSelectTagFilter?.(tag);
        }}
        onSelectAccountFilter={acctKey => {
          clearPendingSyncGuards();
          setSelectedAccount(prev => (prev === acctKey ? null : acctKey));
        }}
        toggleSelectTxn={onToggleSelectTxn}
        onRangeSelectTxns={onRangeSelectTxns}
        toggleSelectAllTxns={onToggleSelectAllTxns}
        clearSelectedTxns={onClearSelectedTxns}
        handleEditTxn={onEditTxn}
        handleDeleteTxn={onDeleteTxn}
        handleCategoryChange={handleInlineCategoryChange}
        handleBucketChange={onBucketChange}
        handleExecuteBulkCategoryUpdate={onExecuteBulkCategoryUpdate}
        handleExecuteBulkBucketUpdate={onExecuteBulkBucketUpdate}
        setShowBulkDeleteConfirmModal={onShowBulkDeleteConfirm}
        handleAddTag={onAddTag}
        handleRemoveTag={onRemoveTag}
        handleExecuteBulkAddTag={onExecuteBulkAddTag}
        handleExecuteBulkRemoveTag={onExecuteBulkRemoveTag}
        handleDismissReview={onDismissReview}
        onBulkDismissReview={
          onBulkDismissReview
            ? ids => onBulkDismissReview(ids, onClearSelectedTxns)
            : undefined
        }
      />
    </div>
  );
}

export default TransactionsView;
