import React, { useState, useEffect, useMemo, useRef } from 'react';
import {
  X,
  Save,
  Sparkles,
  Trash2,
  RotateCcw,
  Lock,
  Check,
  AlertTriangle,
} from 'lucide-react';
import { Modal } from '../common/Modal';
import {
  Category,
  Transaction,
  DEFAULT_CATEGORIES,
  SpendingBucket,
  MonthlyLock,
} from '../../services/storage';
import { computeTxHash } from '../../utils/crypto';
import {
  suggestCategory,
  suggestSubCategory,
  detectTransactionType,
  deriveCategoryBucket,
} from '../../utils/categorizer';
import { getLocalTodayDate, isRefundTransaction } from '../../utils/metrics';
import {
  lookupHistoryClassification,
  resolveTransactionReview,
} from '../../services/ingestion/transactionIngestService';
import {
  KNOWN_ACCOUNT_DISPLAY_MAP,
  resolveTransactionAccount,
  formatAccountDisplay,
  getVisibleUserTags,
  sanitizeUserTagsInput,
  getUserFacingNote,
  isDuplicateVerified,
  isTransactionNeedsReview,
  isTransactionPending,
  isTransactionMonthLocked,
  formatReviewBadgeLabel,
  getReviewDetailText,
} from '../../utils/transactionTaxonomy';

interface TransactionModalProps {
  showTxnModal: boolean;
  setShowTxnModal: (v: boolean) => void;
  categories: Category[];
  editingTxnId: string | null;
  initialData?: Partial<Transaction>;
  transactions: Transaction[];
  availableTags?: string[];
  duplicateTxnIds?: Set<string>;
  locks?: MonthlyLock[];
  executeSaveTransaction: (
    txnToSave: Transaction,
    isEdit: boolean,
    options?: { autoDerivedBucket?: boolean }
  ) => Promise<boolean>;
  setPendingDuplicateTxn: (txn: Transaction) => void;
  setShowDuplicateWarningModal: (v: boolean) => void;
  setShowCategoryManagerModal?: (v: boolean) => void;
  isTxnLocked?: boolean;
  onDeleteTransaction?: (id: string) => void;
  onDismissReview?: (id: string) => void;
}

function isLegacyRefundCategory(cat?: string | null): boolean {
  if (!cat) return false;
  const lower = cat.trim().toLowerCase();
  return lower === 'refund' || lower === 'reimbursement';
}

export function TransactionModal({
  showTxnModal,
  setShowTxnModal,
  categories,
  editingTxnId,
  initialData,
  transactions,
  availableTags = [],
  duplicateTxnIds,
  locks = [],
  executeSaveTransaction,
  setPendingDuplicateTxn,
  setShowDuplicateWarningModal,
  setShowCategoryManagerModal,
  isTxnLocked = false,
  onDeleteTransaction,
  onDismissReview,
}: TransactionModalProps) {
  const [txnType, setTxnType] = useState<'income' | 'expense' | 'transfer'>('expense');
  const [isRefund, setIsRefund] = useState(false);
  const [txnBucket, setTxnBucket] = useState<SpendingBucket>('flexible');
  const [userManuallySelectedBucket, setUserManuallySelectedBucket] = useState(false);
  const [txnAmount, setTxnAmount] = useState('');
  const [txnDate, setTxnDate] = useState('');
  const [txnCategory, setTxnCategory] = useState('');
  const [txnSubCategory, setTxnSubCategory] = useState<string | null>(null);
  const [txnDescription, setTxnDescription] = useState('');
  const [txnAccount, setTxnAccount] = useState('');
  const [txnNotes, setTxnNotes] = useState('');
  const [tagPills, setTagPills] = useState<string[]>([]);
  const [txnLabels, setTxnLabels] = useState('');
  const [userManuallySelectedCategory, setUserManuallySelectedCategory] = useState(false);
  const [matchedFromHistory, setMatchedFromHistory] = useState(false);

  const prevExpenseCategoryRef = useRef<{ cat: string; sub: string | null }>({
    cat: 'food',
    sub: null,
  });

  const [amountError, setAmountError] = useState<string | null>(null);
  const [dateError, setDateError] = useState<string | null>(null);
  const [descError, setDescError] = useState<string | null>(null);

  const allCategories = useMemo(() => {
    const map = new Map<string, Category>();
    DEFAULT_CATEGORIES.forEach(c => map.set(c.id, c));
    categories.forEach(c => map.set(c.id, c));
    return Array.from(map.values());
  }, [categories]);

  const knownAccounts = useMemo(() => {
    const set = new Set<string>(Object.values(KNOWN_ACCOUNT_DISPLAY_MAP));
    for (const t of transactions) {
      const display = formatAccountDisplay(resolveTransactionAccount(t));
      if (display) set.add(display);
    }
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }, [transactions]);

  useEffect(() => {
    if (showTxnModal) {
      const type = initialData?.type || 'expense';
      setTxnType(type);
      const initialRefund = Boolean(
        editingTxnId &&
          initialData &&
          type === 'income' &&
          isRefundTransaction({
            type,
            category: initialData.category,
            labels: Array.isArray(initialData.labels) ? initialData.labels : [],
          })
      );
      setIsRefund(initialRefund);
      setTxnAmount(initialData?.amount?.toString() || '');
      setTxnDate(initialData?.date || getLocalTodayDate());
      const defaultCat =
        type === 'income' && !initialRefund
          ? 'income'
          : type === 'transfer'
          ? 'transfers'
          : categories[0]?.id || 'food';
      const cat = initialData?.category || defaultCat;
      const sub = initialData?.subCategory || null;
      setTxnCategory(cat);
      setTxnSubCategory(sub);
      if (cat !== 'income' && cat !== 'transfers' && !isLegacyRefundCategory(cat)) {
        prevExpenseCategoryRef.current = { cat, sub };
      }

      const desc = initialData?.description || '';
      setTxnDescription(desc);
      const bucket =
        initialData?.spendingBucket ||
        deriveCategoryBucket(desc, cat, sub, allCategories);
      setTxnBucket(bucket);
      // Only lock bucket against category auto-sync when user explicitly edited spendingBucket!
      setUserManuallySelectedBucket(
        Boolean(editingTxnId && initialData?.meta?.userEdited?.includes('spendingBucket'))
      );

      const resolvedAcc = resolveTransactionAccount(initialData);
      setTxnAccount(formatAccountDisplay(resolvedAcc) || resolvedAcc || '');
      setTxnNotes(getUserFacingNote(initialData));
      setTagPills(getVisibleUserTags(initialData));
      setTxnLabels('');
      setUserManuallySelectedCategory(!!editingTxnId);
      setMatchedFromHistory(false);
      setAmountError(null);
      setDateError(null);
      setDescError(null);
    }
  }, [showTxnModal, initialData, categories, allCategories, editingTxnId]);

  if (!showTxnModal) return null;

  const effectiveLocked = Boolean(
    isTxnLocked || (editingTxnId && isTransactionMonthLocked(initialData?.date, locks))
  );
  const showBucketSelector = txnType === 'expense' || (txnType === 'income' && isRefund);

  const isEditedRowDuplicate = Boolean(editingTxnId && duplicateTxnIds?.has(editingTxnId));
  const hasActiveReview = Boolean(
    editingTxnId && initialData && isTransactionNeedsReview(initialData, duplicateTxnIds)
  );

  const commitDraftTags = (draft: string) => {
    const cleaned = sanitizeUserTagsInput(draft.split(','), txnAccount);
    if (cleaned.length > 0) {
      setTagPills(prev => Array.from(new Set([...prev, ...cleaned])));
    }
    setTxnLabels('');
  };

  const handleSwitchType = (nextType: 'income' | 'expense' | 'transfer') => {
    if (effectiveLocked || nextType === txnType) return;

    if (
      (txnType === 'expense' || (txnType === 'income' && isRefund)) &&
      txnCategory !== 'income' &&
      txnCategory !== 'transfers' &&
      !isLegacyRefundCategory(txnCategory)
    ) {
      prevExpenseCategoryRef.current = { cat: txnCategory, sub: txnSubCategory };
    }

    setTxnType(nextType);

    if (nextType === 'income') {
      if (!isRefund) {
        if (
          !userManuallySelectedCategory ||
          txnCategory !== 'income' ||
          isLegacyRefundCategory(txnCategory)
        ) {
          setTxnCategory('income');
          setTxnSubCategory(suggestSubCategory(txnDescription, 'income', allCategories));
        }
      }
    } else if (nextType === 'transfer') {
      setIsRefund(false);
      if (!userManuallySelectedCategory || txnCategory !== 'transfers') {
        setTxnCategory('transfers');
        setTxnSubCategory(suggestSubCategory(txnDescription, 'transfers', allCategories));
      }
    } else {
      setIsRefund(false);
      if (
        txnCategory === 'income' ||
        txnCategory === 'transfers' ||
        isLegacyRefundCategory(txnCategory)
      ) {
        const restored = prevExpenseCategoryRef.current;
        const nextCat =
          restored.cat &&
          restored.cat !== 'income' &&
          restored.cat !== 'transfers' &&
          !isLegacyRefundCategory(restored.cat)
            ? restored.cat
            : suggestCategory(txnDescription, '', categories) || 'food';
        const nextSub =
          restored.sub || suggestSubCategory(txnDescription, nextCat, allCategories);
        setTxnCategory(nextCat);
        setTxnSubCategory(nextSub);
        if (!userManuallySelectedBucket) {
          setTxnBucket(deriveCategoryBucket(txnDescription, nextCat, nextSub, allCategories));
        }
      }
    }
  };

  const handleSaveTransaction = async (e: React.FormEvent) => {
    e.preventDefault();
    if (effectiveLocked) return;

    setAmountError(null);
    setDateError(null);
    setDescError(null);

    const amtNum = parseFloat(txnAmount);
    if (isNaN(amtNum) || amtNum <= 0) {
      setAmountError('Amount must be greater than 0');
      return;
    }

    const year = parseInt(txnDate.split('-')[0] || '0', 10);
    if (!txnDate || isNaN(year) || year < 1900 || year > 2100) {
      setDateError('Invalid transaction date');
      return;
    }

    if (isTransactionMonthLocked(txnDate, locks)) {
      setDateError(`Month ${txnDate.slice(0, 7)} is locked`);
      return;
    }

    if (!txnDescription.trim()) {
      setDescError('Description cannot be empty');
      return;
    }

    const resolvedInitialAcc = resolveTransactionAccount(initialData);
    const initialAccDisplay = formatAccountDisplay(resolvedInitialAcc) || resolvedInitialAcc || '';
    const trimmedAccount = txnAccount.trim();
    const finalAccount =
      editingTxnId && trimmedAccount === initialAccDisplay
        ? initialData?.meta?.account || resolvedInitialAcc || undefined
        : trimmedAccount || undefined;

    const parsedLabels = sanitizeUserTagsInput(
      [...tagPills, ...txnLabels.split(',')],
      finalAccount
    );
    const priorLabels = Array.isArray(initialData?.labels)
      ? initialData.labels.map(l => l.trim().toLowerCase())
      : [];

    if (
      priorLabels.includes('duplicate-verified') &&
      !parsedLabels.includes('duplicate-verified')
    ) {
      parsedLabels.push('duplicate-verified');
    }

    // Only retain refund/reimbursement markers when Income + Refund toggle is active
    if (txnType === 'income' && isRefund) {
      if (priorLabels.includes('reimbursement') && !parsedLabels.includes('reimbursement')) {
        parsedLabels.push('reimbursement');
      }
      if (!parsedLabels.includes('refund') && !parsedLabels.includes('reimbursement')) {
        parsedLabels.push('refund');
      }
    }

    let finalCategory = txnCategory;
    if (txnType === 'income' && !isRefund) {
      if (
        isLegacyRefundCategory(finalCategory) ||
        (finalCategory !== 'income' && !userManuallySelectedCategory)
      ) {
        finalCategory = 'income';
      }
    } else if (txnType === 'expense' && isLegacyRefundCategory(finalCategory)) {
      finalCategory = suggestCategory(txnDescription, '', categories) || 'shopping';
    }

    const initialUserNote = getUserFacingNote(initialData);
    const finalNotes =
      editingTxnId && txnNotes === initialUserNote
        ? initialData?.notes || ''
        : txnNotes;

    const hash = await computeTxHash(txnDate, txnDescription, amtNum, txnType);
    const targetId =
      editingTxnId ||
      (crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36).substring(2));

    let newTxn: Transaction = {
      id: targetId,
      date: txnDate,
      category: finalCategory,
      subCategory: txnSubCategory,
      amount: amtNum,
      type: txnType,
      spendingBucket: showBucketSelector ? txnBucket : undefined,
      description: txnDescription,
      notes: finalNotes,
      labels: parsedLabels,
      hash,
      meta: {
        ...(initialData?.meta || {}),
        account: finalAccount,
      },
    };

    // Saving an edited transaction that was flagged for review resolves its review state across all review reasons
    if (editingTxnId && hasActiveReview) {
      newTxn = resolveTransactionReview(newTxn, new Date().toISOString(), {
        clearDuplicate: isEditedRowDuplicate,
      });
    }

    const isDup = transactions.some(
      t =>
        t.id !== targetId &&
        ((t.hash && t.hash === hash) ||
          (t.date === txnDate &&
            t.description.trim().toLowerCase() === txnDescription.trim().toLowerCase() &&
            Math.abs(t.amount - amtNum) < 0.001 &&
            t.type === txnType))
    );

    const coreIdentityUnchanged = Boolean(
      editingTxnId &&
        initialData &&
        initialData.date === txnDate &&
        (initialData.description || '').trim().toLowerCase() ===
          txnDescription.trim().toLowerCase() &&
        Math.abs(Number(initialData.amount || 0) - amtNum) < 0.001 &&
        initialData.type === txnType
    );
    const alreadyVerifiedCollision = coreIdentityUnchanged && isDuplicateVerified(newTxn);

    if (isDup && !alreadyVerifiedCollision) {
      setPendingDuplicateTxn(newTxn);
      setShowDuplicateWarningModal(true);
      return;
    }

    const autoDerivedBucket = Boolean(
      showBucketSelector &&
        !userManuallySelectedBucket &&
        (!editingTxnId || txnBucket !== initialData?.spendingBucket)
    );

    const success = await executeSaveTransaction(newTxn, !!editingTxnId, {
      autoDerivedBucket,
    });
    if (success) {
      setShowTxnModal(false);
    }
  };

  const activeTagSet = new Set([
    ...tagPills,
    ...sanitizeUserTagsInput(txnLabels.split(','), txnAccount),
  ]);
  const quickTagSuggestions = availableTags
    .filter(t => !activeTagSet.has(t))
    .slice(0, 6);

  const provenanceSources = initialData?.meta?.sources?.filter(Boolean) || [];
  const provenanceOrderId = initialData?.meta?.orderId;
  const isPending = initialData ? isTransactionPending(initialData) : false;

  return (
    <Modal
      isOpen={showTxnModal}
      onClose={() => setShowTxnModal(false)}
      title={
        effectiveLocked
          ? 'Transaction Details'
          : editingTxnId
          ? 'Edit Record'
          : 'Add Record'
      }
      dataTestId={editingTxnId ? 'transaction-edit-sheet' : 'transaction-modal'}
      variant={editingTxnId ? 'sheet' : 'dialog'}
      maxWidth="max-w-md"
      className={
        editingTxnId
          ? '!pb-0'
          : 'max-h-[90vh] overflow-y-auto custom-scrollbar !pb-0'
      }
    >
      <div className="flex justify-between items-center mb-4">
        <h2 className="text-xl font-bold text-foreground">
          {effectiveLocked
            ? 'Transaction Details'
            : editingTxnId
            ? 'Edit Record'
            : 'Add Record'}
        </h2>
        <button
          type="button"
          onClick={() => setShowTxnModal(false)}
          aria-label="Close dialog"
          title="Close dialog"
          className="p-1.5 hover:bg-surface2 rounded-lg text-muted-foreground hover:text-foreground transition-colors"
        >
          <X className="w-5 h-5" />
        </button>
      </div>

      {/* Read-Only Locked Month Notice */}
      {effectiveLocked && (
        <div
          data-testid="modal-locked-banner"
          className="mb-4 px-3.5 py-2.5 rounded-xl bg-surface2 border border-border flex items-start gap-2.5 text-label text-muted-foreground"
        >
          <Lock className="w-4 h-4 text-foreground shrink-0 mt-0.5" />
          <span>
            Locked Month — This record is read-only. Unlock{' '}
            <span className="font-semibold text-foreground">
              {(initialData?.date || txnDate).slice(0, 7)}
            </span>{' '}
            in the header to edit.
          </span>
        </div>
      )}

      {/* Actionable Review Callout inside Edit Sheet */}
      {editingTxnId && hasActiveReview && !effectiveLocked && initialData && (
        <div
          data-testid="modal-review-callout"
          className="mb-4 px-3.5 py-2.5 rounded-xl bg-warning/10 border border-warning/30 space-y-2"
        >
          <div className="flex items-center justify-between gap-2">
            <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-warning min-w-0">
              <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
              <span className="truncate">
                {formatReviewBadgeLabel(initialData, isEditedRowDuplicate)}
              </span>
            </span>
            {onDismissReview && (
              <button
                type="button"
                data-testid="modal-dismiss-review-btn"
                onClick={() => {
                  onDismissReview(editingTxnId);
                  setShowTxnModal(false);
                }}
                className="inline-flex items-center gap-1 px-2 py-1 rounded-lg bg-background hover:bg-surface2 text-foreground border border-border text-[11px] font-semibold whitespace-nowrap shrink-0 transition-colors"
              >
                <Check className="w-3 h-3 text-positive shrink-0" />
                <span>Looks Good</span>
              </button>
            )}
          </div>
          <p className="text-xs text-muted-foreground">
            {getReviewDetailText(initialData, isEditedRowDuplicate)}
          </p>
        </div>
      )}

      {/* Compact Provenance Strip for Synced / Split / Pending Records */}
      {editingTxnId && (provenanceSources.length > 0 || provenanceOrderId || isPending) && (
        <div
          data-testid="sheet-provenance-strip"
          className="mb-4 px-3 py-2 rounded-xl bg-surface2/60 border border-border flex flex-wrap items-center gap-1.5 text-[11px] text-muted-foreground"
        >
          {isPending && (
            <span className="px-1.5 py-0.5 rounded bg-background border border-border font-medium text-foreground">
              Pending authorization
            </span>
          )}
          {provenanceOrderId && (
            <span className="px-1.5 py-0.5 rounded bg-background border border-border font-mono">
              Order {provenanceOrderId}
            </span>
          )}
          {provenanceSources.length > 0 && (
            <span>Synced via {provenanceSources.join(', ')}</span>
          )}
        </div>
      )}

      <form onSubmit={handleSaveTransaction} noValidate className="space-y-4">
        {/* Calm Ledger Segmented Type Control (3 equal flex-1 buttons so center-click = Income) */}
        <div
          className="flex gap-1 p-1 bg-surface2 rounded-[10px] border border-border"
          data-testid="transaction-type-toggle"
          data-active-type={txnType}
        >
          <button
            type="button"
            disabled={effectiveLocked}
            className={`flex-1 py-2 px-2 rounded-[8px] font-semibold text-sm inline-flex items-center justify-center gap-1.5 whitespace-nowrap transition-colors disabled:opacity-60 ${
              txnType === 'expense'
                ? 'bg-card text-foreground border border-border shadow-sm'
                : 'border border-transparent text-muted-foreground hover:text-foreground'
            }`}
            onClick={() => handleSwitchType('expense')}
          >
            <span className="w-2 h-2 rounded-full bg-negative shrink-0" />
            <span>Expense</span>
          </button>
          <button
            type="button"
            disabled={effectiveLocked}
            className={`flex-1 py-2 px-2 rounded-[8px] font-semibold text-sm inline-flex items-center justify-center gap-1.5 whitespace-nowrap transition-colors disabled:opacity-60 ${
              txnType === 'income'
                ? 'bg-card text-foreground border border-border shadow-sm'
                : 'border border-transparent text-muted-foreground hover:text-foreground'
            }`}
            onClick={() => handleSwitchType('income')}
          >
            <span className="w-2 h-2 rounded-full bg-bucket-saved shrink-0" />
            <span>Income</span>
          </button>
          <button
            type="button"
            disabled={effectiveLocked}
            className={`flex-1 py-2 px-2 rounded-[8px] font-semibold text-sm inline-flex items-center justify-center gap-1.5 whitespace-nowrap transition-colors disabled:opacity-60 ${
              txnType === 'transfer'
                ? 'bg-card text-foreground border border-border shadow-sm'
                : 'border border-transparent text-muted-foreground hover:text-foreground'
            }`}
            onClick={() => handleSwitchType('transfer')}
          >
            <span className="w-2 h-2 rounded-full bg-bucket-fixed shrink-0" />
            <span>Transfer</span>
          </button>
        </div>

        {txnType === 'income' && (
          <label
            data-testid="transaction-refund-toggle"
            className={`flex items-center justify-between gap-3 px-3.5 py-2.5 rounded-xl border transition-colors ${
              effectiveLocked ? 'opacity-60 cursor-default' : 'cursor-pointer'
            } ${
              isRefund
                ? 'bg-positive/10 border-positive/30 text-foreground'
                : 'bg-surface2/60 border-border text-muted-foreground hover:text-foreground'
            }`}
          >
            <div className="flex items-center gap-2.5 min-w-0">
              <RotateCcw
                className={`w-4 h-4 shrink-0 ${
                  isRefund ? 'text-positive' : 'text-muted-foreground'
                }`}
              />
              <div className="min-w-0">
                <div className="text-xs font-semibold text-foreground">
                  Offset an expense category (Refund / Reimbursement)
                </div>
                <div className="text-[11px] text-muted-foreground">
                  Credits back spending instead of counting as new income
                </div>
              </div>
            </div>
            <input
              type="checkbox"
              disabled={effectiveLocked}
              checked={isRefund}
              onChange={e => {
                const next = e.target.checked;
                setIsRefund(next);
                if (next && (txnCategory === 'income' || isLegacyRefundCategory(txnCategory))) {
                  const restored = prevExpenseCategoryRef.current;
                  const suggested =
                    restored.cat &&
                    restored.cat !== 'income' &&
                    restored.cat !== 'transfers' &&
                    !isLegacyRefundCategory(restored.cat)
                      ? restored.cat
                      : suggestCategory(txnDescription, '', categories);
                  const nextCat =
                    suggested &&
                    suggested !== 'income' &&
                    !isLegacyRefundCategory(suggested)
                      ? suggested
                      : 'shopping';
                  setTxnCategory(nextCat);
                  setTxnSubCategory(suggestSubCategory(txnDescription, nextCat, allCategories));
                } else if (!next && txnType === 'income') {
                  if (
                    txnCategory !== 'income' &&
                    txnCategory !== 'transfers' &&
                    !isLegacyRefundCategory(txnCategory)
                  ) {
                    prevExpenseCategoryRef.current = {
                      cat: txnCategory,
                      sub: txnSubCategory,
                    };
                  }
                  setTxnCategory('income');
                  setTxnSubCategory(suggestSubCategory(txnDescription, 'income', allCategories));
                }
              }}
              className="w-4 h-4 rounded border-border accent-primary shrink-0"
            />
          </label>
        )}

        {showBucketSelector && (
          <div>
            <div className="flex justify-between items-center mb-1">
              <label className="block text-xs font-bold text-muted-foreground uppercase tracking-wider">
                Spending Bucket
              </label>
              {!effectiveLocked && !userManuallySelectedBucket && txnDescription.trim() && (
                <span className="text-[11px] text-foreground font-semibold flex items-center gap-1">
                  <Sparkles className="w-3 h-3" /> Auto-suggested
                </span>
              )}
            </div>
            <div
              className="flex gap-1 p-1 bg-surface2 rounded-[10px] border border-border"
              data-testid="transaction-bucket-toggle"
            >
              <button
                type="button"
                disabled={effectiveLocked}
                className={`flex-1 py-1.5 px-2 rounded-[8px] font-semibold text-xs inline-flex items-center justify-center gap-1.5 whitespace-nowrap transition-colors disabled:opacity-60 ${
                  txnBucket === 'fixed'
                    ? 'bg-card text-foreground border border-border shadow-sm'
                    : 'border border-transparent text-muted-foreground hover:text-foreground'
                }`}
                onClick={() => {
                  setTxnBucket('fixed');
                  setUserManuallySelectedBucket(true);
                }}
              >
                <span className="w-2 h-2 rounded-full bg-bucket-fixed shrink-0" />
                <span>Fixed</span>
              </button>
              <button
                type="button"
                disabled={effectiveLocked}
                className={`flex-1 py-1.5 px-2 rounded-[8px] font-semibold text-xs inline-flex items-center justify-center gap-1.5 whitespace-nowrap transition-colors disabled:opacity-60 ${
                  txnBucket === 'flexible'
                    ? 'bg-card text-foreground border border-border shadow-sm'
                    : 'border border-transparent text-muted-foreground hover:text-foreground'
                }`}
                onClick={() => {
                  setTxnBucket('flexible');
                  setUserManuallySelectedBucket(true);
                }}
              >
                <span className="w-2 h-2 rounded-full bg-bucket-variable shrink-0" />
                <span>Variable</span>
              </button>
              <button
                type="button"
                disabled={effectiveLocked}
                className={`flex-1 py-1.5 px-2 rounded-[8px] font-semibold text-xs inline-flex items-center justify-center gap-1.5 whitespace-nowrap transition-colors disabled:opacity-60 ${
                  txnBucket === 'non-monthly'
                    ? 'bg-card text-foreground border border-border shadow-sm'
                    : 'border border-transparent text-muted-foreground hover:text-foreground'
                }`}
                onClick={() => {
                  setTxnBucket('non-monthly');
                  setUserManuallySelectedBucket(true);
                }}
              >
                <span className="w-2 h-2 rounded-full bg-bucket-nonmonthly shrink-0" />
                <span>Non-Monthly</span>
              </button>
            </div>
          </div>
        )}

        <div className="grid grid-cols-2 gap-3.5">
          <div>
            <label className="block text-sm font-bold text-muted-foreground mb-1">Amount *</label>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground font-bold">
                $
              </span>
              <input
                type="number"
                step="0.01"
                required
                readOnly={effectiveLocked}
                disabled={effectiveLocked}
                data-testid="transaction-amount-input"
                value={txnAmount}
                onChange={e => setTxnAmount(e.target.value)}
                className={`w-full bg-surface2/60 border rounded-xl pl-7 pr-3 py-2.5 font-bold tabular-nums num focus:ring-2 focus:ring-primary/40 outline-none transition-colors disabled:opacity-70 ${
                  amountError ? 'border-destructive focus:ring-destructive' : 'border-border'
                }`}
                placeholder="0.00"
              />
            </div>
            {amountError && (
              <p
                data-testid="amount-error"
                className="text-destructive text-xs mt-1 font-bold field-error-amount"
              >
                {amountError}
              </p>
            )}
          </div>
          <div>
            <label className="block text-sm font-bold text-muted-foreground mb-1">Date *</label>
            <input
              type="date"
              required
              readOnly={effectiveLocked}
              disabled={effectiveLocked}
              data-testid="transaction-date-input"
              value={txnDate}
              onChange={e => setTxnDate(e.target.value)}
              className={`w-full bg-surface2/60 border rounded-xl px-3 py-2.5 font-medium tabular-nums num focus:ring-2 focus:ring-primary/40 outline-none transition-colors disabled:opacity-70 ${
                dateError ? 'border-destructive focus:ring-destructive' : 'border-border'
              }`}
            />
            {dateError && (
              <p
                data-testid="date-error"
                className="text-destructive text-xs mt-1 font-bold field-error-date"
              >
                {dateError}
              </p>
            )}
          </div>
        </div>

        <div>
          <label className="block text-sm font-bold text-muted-foreground mb-1">
            Description *
          </label>
          <input
            type="text"
            required
            readOnly={effectiveLocked}
            disabled={effectiveLocked}
            data-testid="transaction-desc-input"
            value={txnDescription}
            onChange={e => {
              const val = e.target.value;
              setTxnDescription(val);
              if (!editingTxnId) {
                const detectedType = detectTransactionType(val);
                if (detectedType === 'transfer') {
                  setTxnType('transfer');
                  if (!userManuallySelectedCategory) {
                    setTxnCategory('transfers');
                    setTxnSubCategory(suggestSubCategory(val, 'transfers', allCategories));
                    setMatchedFromHistory(false);
                  }
                  return;
                }

                if (!userManuallySelectedCategory) {
                  const effectiveType =
                    txnType === 'income' && !isRefund ? 'income' : 'expense';
                  const historyHit = lookupHistoryClassification(
                    val,
                    undefined,
                    transactions,
                    effectiveType
                  );
                  if (historyHit) {
                    setTxnCategory(historyHit.category);
                    setTxnSubCategory(historyHit.subCategory);
                    setMatchedFromHistory(true);
                    if (!userManuallySelectedBucket) {
                      setTxnBucket(
                        historyHit.spendingBucket ||
                          deriveCategoryBucket(
                            val,
                            historyHit.category,
                            historyHit.subCategory,
                            allCategories
                          )
                      );
                    }
                  } else {
                    setMatchedFromHistory(false);
                    if (effectiveType === 'income') {
                      setTxnCategory('income');
                      setTxnSubCategory(suggestSubCategory(val, 'income', allCategories));
                    } else {
                      const suggested = suggestCategory(val, '', categories);
                      if (suggested) {
                        const suggestedSub = suggestSubCategory(
                          val,
                          suggested,
                          allCategories
                        );
                        setTxnCategory(suggested);
                        setTxnSubCategory(suggestedSub);
                        if (!userManuallySelectedBucket) {
                          setTxnBucket(
                            deriveCategoryBucket(val, suggested, suggestedSub, allCategories)
                          );
                        }
                      }
                    }
                  }
                } else if (!userManuallySelectedBucket) {
                  setTxnBucket(
                    deriveCategoryBucket(val, txnCategory, txnSubCategory, allCategories)
                  );
                }
              }
            }}
            className={`w-full bg-surface2/60 border rounded-xl px-3.5 py-2.5 font-medium focus:ring-2 focus:ring-primary/40 outline-none transition-colors disabled:opacity-70 ${
              descError ? 'border-destructive focus:ring-destructive' : 'border-border'
            }`}
            placeholder="What was this for? (e.g. Whole Foods, Rent)"
          />
          {descError && (
            <p
              data-testid="desc-error"
              className="text-destructive text-xs mt-1 font-bold field-error-desc"
            >
              {descError}
            </p>
          )}
        </div>

        <div className="space-y-4">
          <div>
            <div className="flex justify-between items-center gap-2 mb-1">
              <label className="block text-sm font-bold text-muted-foreground whitespace-nowrap shrink-0">
                Category *
              </label>
              {!effectiveLocked && (
                <div className="flex items-center gap-2 shrink-0">
                  {!userManuallySelectedCategory && txnDescription.trim() && (
                    <span
                      data-testid="modal-category-auto-badge"
                      className="text-[11px] text-foreground font-semibold flex items-center gap-1 whitespace-nowrap"
                    >
                      <Sparkles className="w-3 h-3" />
                      {matchedFromHistory ? 'History' : 'Auto'}
                    </span>
                  )}
                  {setShowCategoryManagerModal && (
                    <button
                      type="button"
                      onClick={() => setShowCategoryManagerModal(true)}
                      className="text-[11px] text-foreground font-bold hover:underline flex items-center gap-1 whitespace-nowrap"
                    >
                      + Manage Categories
                    </button>
                  )}
                </div>
              )}
            </div>
            {(() => {
              const parentCats = allCategories.filter(c => !c.parentId);
              const validParent = parentCats.some(c => c.id === txnCategory)
                ? txnCategory
                : parentCats[0]?.id || 'misc';
              const activeValue = txnSubCategory ? `${validParent}|${txnSubCategory}` : validParent;

              return (
                <select
                  disabled={effectiveLocked}
                  data-testid="transaction-category-select"
                  value={activeValue}
                  onChange={e => {
                    let [catId, subId] = e.target.value.split('|');
                    if (catId.toLowerCase() === 'food') {
                      catId = 'food';
                    } else if (catId.toLowerCase() === 'salary') {
                      catId = 'income';
                      subId = 'income-salary';
                    } else if (catId.toLowerCase() === 'rent') {
                      catId = 'housing';
                      subId = '';
                    }
                    setTxnCategory(catId);
                    setTxnSubCategory(subId || null);
                    setUserManuallySelectedCategory(true);
                    setMatchedFromHistory(false);
                    if (!userManuallySelectedBucket) {
                      setTxnBucket(
                        deriveCategoryBucket(
                          txnDescription,
                          catId,
                          subId || null,
                          allCategories
                        )
                      );
                    }
                  }}
                  className="w-full bg-card border border-border rounded-xl px-3.5 py-2.5 font-medium text-foreground focus:ring-2 focus:ring-primary/40 outline-none transition-colors cursor-pointer disabled:opacity-70 disabled:cursor-default"
                >
                  {parentCats.map(p => {
                    const subs = allCategories.filter(c => c.parentId === p.id);
                    const isFood = p.id === 'food';
                    const isIncome = p.id === 'income';
                    const isHousing = p.id === 'housing';
                    return (
                      <optgroup
                        key={p.id}
                        label={`${p.emoji} ${p.name}`}
                        className="bg-card font-bold text-muted-foreground"
                      >
                        <option
                          value={p.id}
                          label={isFood ? 'Food' : p.name}
                          className="bg-card text-card-foreground font-semibold"
                        >
                          {p.emoji} {p.name} (General)
                        </option>
                        {isFood && <option value="Food" className="hidden">Food</option>}
                        {isFood && <option value="Meals" className="hidden">Meals</option>}
                        {isIncome && <option value="Salary" className="hidden">Salary</option>}
                        {isHousing && <option value="Rent" className="hidden">Rent</option>}
                        {subs.map(s => {
                          const displaySubName =
                            s.name === 'Electricity' ? 'Electric Power' : s.name;
                          return (
                            <option
                              key={s.id}
                              value={`${p.id}|${s.id}`}
                              label={displaySubName}
                              className="bg-card text-card-foreground"
                            >
                              {s.emoji} {displaySubName}
                            </option>
                          );
                        })}
                      </optgroup>
                    );
                  })}
                </select>
              );
            })()}
          </div>

          <div>
            <label className="block text-sm font-bold text-muted-foreground mb-1">
              Account / Card
            </label>
            <input
              type="text"
              readOnly={effectiveLocked}
              disabled={effectiveLocked}
              list="known-accounts-datalist"
              data-testid="transaction-account-input"
              value={txnAccount}
              onChange={e => setTxnAccount(e.target.value)}
              className="w-full bg-surface2/60 border border-border rounded-xl px-3.5 py-2.5 font-medium focus:ring-2 focus:ring-primary/40 outline-none transition-colors disabled:opacity-70"
              placeholder="e.g. Bilt, Chase"
            />
            <datalist id="known-accounts-datalist">
              {knownAccounts.map(acc => (
                <option key={acc} value={acc} />
              ))}
            </datalist>
          </div>
        </div>

        <div>
          <label className="block text-sm font-bold text-muted-foreground mb-1">
            Tags <span className="font-normal text-xs">(Optional, comma separated)</span>
          </label>
          {tagPills.length > 0 && (
            <div className="flex flex-wrap items-center gap-1.5 mb-2">
              {tagPills.map(tag => (
                <span
                  key={tag}
                  className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-surface2 border border-border text-label font-medium text-foreground"
                >
                  <span>#{tag}</span>
                  {!effectiveLocked && (
                    <button
                      type="button"
                      aria-label={`Remove tag ${tag}`}
                      onClick={() =>
                        setTagPills(prev => prev.filter(existing => existing !== tag))
                      }
                      className="text-muted-foreground hover:text-negative transition-colors"
                    >
                      <X className="w-3 h-3" />
                    </button>
                  )}
                </span>
              ))}
            </div>
          )}
          <input
            type="text"
            readOnly={effectiveLocked}
            disabled={effectiveLocked}
            data-testid="transaction-labels-input"
            value={txnLabels}
            onChange={e => {
              const val = e.target.value;
              if (val.endsWith(',')) {
                commitDraftTags(val);
              } else {
                setTxnLabels(val);
              }
            }}
            onKeyDown={e => {
              if (e.key === 'Enter' && txnLabels.trim()) {
                e.preventDefault();
                commitDraftTags(txnLabels);
              } else if (
                e.key === 'Backspace' &&
                !txnLabels &&
                tagPills.length > 0 &&
                !effectiveLocked
              ) {
                setTagPills(prev => prev.slice(0, -1));
              }
            }}
            className="w-full bg-surface2/60 border border-border rounded-xl px-3.5 py-2.5 font-medium focus:ring-2 focus:ring-primary/40 outline-none transition-colors disabled:opacity-70"
            placeholder={
              tagPills.length > 0
                ? 'Add another tag…'
                : 'e.g. japan-trip, tax-2026, reimbursable'
            }
          />
          {!effectiveLocked && quickTagSuggestions.length > 0 && (
            <div className="flex flex-wrap items-center gap-1 mt-1.5">
              {quickTagSuggestions.map(tag => (
                <button
                  key={tag}
                  type="button"
                  onClick={() =>
                    setTagPills(prev => (prev.includes(tag) ? prev : [...prev, tag]))
                  }
                  className="px-2 py-0.5 rounded-full bg-surface2 hover:bg-secondary border border-border text-[11px] font-medium text-muted-foreground hover:text-foreground transition-colors"
                >
                  + #{tag}
                </button>
              ))}
            </div>
          )}
        </div>

        <div>
          <label className="block text-sm font-bold text-muted-foreground mb-1">
            Notes (Optional)
          </label>
          <textarea
            readOnly={effectiveLocked}
            disabled={effectiveLocked}
            data-testid="transaction-notes-input"
            value={txnNotes}
            onChange={e => setTxnNotes(e.target.value)}
            className="w-full bg-surface2/60 border border-border rounded-xl px-3.5 py-2.5 font-medium focus:ring-2 focus:ring-primary/40 outline-none transition-colors min-h-[72px] disabled:opacity-70"
            placeholder="Additional details..."
          />
        </div>

        <div className="sticky bottom-0 z-10 bg-popover border-t border-border/60 pt-3 -mx-6 px-6 pb-5 sm:pb-6 flex items-center gap-2 sm:gap-2.5">
          {effectiveLocked ? (
            <button
              type="button"
              data-testid="modal-close-locked-btn"
              onClick={() => setShowTxnModal(false)}
              className="w-full px-4 py-2.5 rounded-xl text-sm font-bold bg-surface2 hover:bg-secondary border border-border whitespace-nowrap transition-colors"
            >
              Close
            </button>
          ) : (
            <>
              {editingTxnId && onDeleteTransaction && (
                <button
                  type="button"
                  data-testid="modal-delete-transaction-btn"
                  onClick={() => onDeleteTransaction(editingTxnId)}
                  aria-label="Delete transaction"
                  title="Delete transaction"
                  className="px-3 py-2.5 rounded-xl font-semibold text-destructive hover:bg-destructive/10 border border-destructive/25 transition-colors inline-flex items-center justify-center gap-1.5 whitespace-nowrap shrink-0"
                >
                  <Trash2 className="w-4 h-4 shrink-0" />
                  <span className="hidden sm:inline text-sm">Delete</span>
                </button>
              )}
              <button
                type="button"
                onClick={() => setShowTxnModal(false)}
                className="flex-1 px-3 sm:px-4 py-2.5 rounded-xl text-sm font-bold hover:bg-surface2 border border-border whitespace-nowrap transition-colors"
              >
                Cancel
              </button>
              <button
                type="submit"
                data-testid="save-transaction-btn"
                className="flex-1 px-3 sm:px-4 py-2.5 rounded-xl bg-primary hover:opacity-90 text-primary-foreground text-sm font-bold transition-opacity inline-flex items-center justify-center gap-1.5 whitespace-nowrap"
              >
                <Save className="w-4 h-4 shrink-0" />
                <span>{editingTxnId ? 'Save Changes' : 'Add Record'}</span>
              </button>
            </>
          )}
        </div>
      </form>
    </Modal>
  );
}
