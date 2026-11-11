import React, { useState, useEffect, useMemo } from 'react';
import { X, Save, Sparkles, Shield, ShoppingBag, Calendar, Trash2, RotateCcw } from 'lucide-react';
import { Modal } from '../common/Modal';
import { Category, Transaction, DEFAULT_CATEGORIES, SpendingBucket } from '../../services/storage';
import { computeTxHash } from '../../utils/crypto';
import { suggestCategory, detectTransactionType, suggestSpendingBucket } from '../../utils/categorizer';
import { getLocalTodayDate, isRefundTransaction } from '../../utils/metrics';
import {
  KNOWN_ACCOUNT_DISPLAY_MAP,
  resolveTransactionAccount,
  formatAccountDisplay,
  getVisibleUserTags,
  sanitizeUserTagsInput,
  getUserFacingNote,
} from '../../utils/transactionTaxonomy';

interface TransactionModalProps {
  showTxnModal: boolean;
  setShowTxnModal: (v: boolean) => void;
  categories: Category[];
  editingTxnId: string | null;
  initialData?: Partial<Transaction>;
  transactions: Transaction[];
  executeSaveTransaction: (txnToSave: Transaction, isEdit: boolean) => Promise<boolean>;
  setPendingDuplicateTxn: (txn: Transaction) => void;
  setShowDuplicateWarningModal: (v: boolean) => void;
  setShowCategoryManagerModal?: (v: boolean) => void;
  isTxnLocked?: boolean;
  onDeleteTransaction?: (id: string) => void;
}

export function TransactionModal({
  showTxnModal,
  setShowTxnModal,
  categories,
  editingTxnId,
  initialData,
  transactions,
  executeSaveTransaction,
  setPendingDuplicateTxn,
  setShowDuplicateWarningModal,
  setShowCategoryManagerModal,
  isTxnLocked = false,
  onDeleteTransaction,
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
  const [txnLabels, setTxnLabels] = useState('');
  const [userManuallySelectedCategory, setUserManuallySelectedCategory] = useState(false);

  const [amountError, setAmountError] = useState<string | null>(null);
  const [dateError, setDateError] = useState<string | null>(null);
  const [descError, setDescError] = useState<string | null>(null);

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
      const cat = initialData?.category || categories[0]?.id || 'food';
      setTxnCategory(cat);
      setTxnSubCategory(initialData?.subCategory || null);
      const desc = initialData?.description || '';
      setTxnDescription(desc);
      const bucket = initialData?.spendingBucket || suggestSpendingBucket(desc, cat);
      setTxnBucket(bucket);
      setUserManuallySelectedBucket(!!editingTxnId && !!initialData?.spendingBucket);

      const resolvedAcc = resolveTransactionAccount(initialData);
      setTxnAccount(formatAccountDisplay(resolvedAcc) || resolvedAcc || '');
      setTxnNotes(getUserFacingNote(initialData));
      setTxnLabels(getVisibleUserTags(initialData).join(', '));
      setUserManuallySelectedCategory(!!editingTxnId);
      setAmountError(null);
      setDateError(null);
      setDescError(null);
    }
  }, [showTxnModal, initialData, categories, editingTxnId]);

  if (!showTxnModal) return null;

  const showBucketSelector = txnType === 'expense' || (txnType === 'income' && isRefund);

  const handleSaveTransaction = async (e: React.FormEvent) => {
    e.preventDefault();
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

    if (!txnDescription.trim()) {
      setDescError('Description cannot be empty');
      return;
    }

    const parsedLabels = sanitizeUserTagsInput(txnLabels.split(','));
    const priorLabels = Array.isArray(initialData?.labels)
      ? initialData.labels.map(l => l.trim().toLowerCase())
      : [];

    if (priorLabels.includes('duplicate-verified') && !parsedLabels.includes('duplicate-verified')) {
      parsedLabels.push('duplicate-verified');
    }
    if (priorLabels.includes('needs-review') && !parsedLabels.includes('needs-review')) {
      parsedLabels.push('needs-review');
    }
    if (txnType === 'income' && isRefund) {
      if (priorLabels.includes('reimbursement') && !parsedLabels.includes('reimbursement')) {
        parsedLabels.push('reimbursement');
      }
      if (!parsedLabels.includes('refund') && !parsedLabels.includes('reimbursement')) {
        parsedLabels.push('refund');
      }
    }

    const initialUserNote = getUserFacingNote(initialData);
    const finalNotes =
      editingTxnId && txnNotes === initialUserNote
        ? initialData?.notes || ''
        : txnNotes;

    const resolvedInitialAcc = resolveTransactionAccount(initialData);
    const initialAccDisplay = formatAccountDisplay(resolvedInitialAcc) || resolvedInitialAcc || '';
    const trimmedAccount = txnAccount.trim();
    const finalAccount =
      editingTxnId && trimmedAccount === initialAccDisplay
        ? initialData?.meta?.account || resolvedInitialAcc || undefined
        : trimmedAccount || undefined;

    const hash = await computeTxHash(txnDate, txnDescription, amtNum, txnType);
    const targetId =
      editingTxnId ||
      (crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36).substring(2));

    const newTxn: Transaction = {
      id: targetId,
      date: txnDate,
      category: txnCategory,
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

    const isDup = transactions.some(
      t =>
        t.id !== targetId &&
        ((t.hash && t.hash === hash) ||
          (t.date === txnDate &&
            t.description.trim().toLowerCase() === txnDescription.trim().toLowerCase() &&
            Math.abs(t.amount - amtNum) < 0.001 &&
            t.type === txnType))
    );

    if (isDup && !editingTxnId) {
      setPendingDuplicateTxn(newTxn);
      setShowDuplicateWarningModal(true);
      return;
    }

    const success = await executeSaveTransaction(newTxn, !!editingTxnId);
    if (success) {
      setShowTxnModal(false);
    }
  };

  return (
    <Modal
      isOpen={showTxnModal}
      onClose={() => setShowTxnModal(false)}
      title={editingTxnId ? 'Edit Record' : 'Add Record'}
      dataTestId={editingTxnId ? 'transaction-edit-sheet' : 'transaction-modal'}
      variant={editingTxnId ? 'sheet' : 'dialog'}
      maxWidth="max-w-md"
      className="max-h-[90vh] sm:max-h-screen overflow-y-auto custom-scrollbar p-6"
    >
      <div className="flex justify-between items-center mb-5">
        <h2 className="text-2xl font-bold">{editingTxnId ? 'Edit Record' : 'Add Record'}</h2>
        <button
          type="button"
          onClick={() => setShowTxnModal(false)}
          aria-label="Close dialog"
          title="Close dialog"
          className="p-2 hover:bg-card rounded-lg text-muted-foreground hover:text-foreground transition-colors"
        >
          <X className="w-6 h-6" />
        </button>
      </div>

      <form onSubmit={handleSaveTransaction} noValidate className="space-y-4">
        <div
          className="flex gap-2 p-1 bg-card/50 rounded-xl border border-border/50"
          data-testid="transaction-type-toggle"
          data-active-type={txnType}
        >
          <button
            type="button"
            className={`flex-1 py-2 rounded-lg font-bold text-sm transition-all ${
              txnType === 'expense'
                ? 'bg-destructive text-destructive-foreground shadow-md'
                : 'text-muted-foreground hover:text-foreground'
            }`}
            onClick={() => setTxnType('expense')}
          >
            Expense
          </button>
          <button
            type="button"
            className={`flex-1 py-2 rounded-lg font-bold text-sm transition-all ${
              txnType === 'income'
                ? 'bg-emerald-500 text-white shadow-md'
                : 'text-muted-foreground hover:text-foreground'
            }`}
            onClick={() => setTxnType('income')}
          >
            Income
          </button>
          <button
            type="button"
            className={`flex-1 py-2 rounded-lg font-bold text-sm transition-all ${
              txnType === 'transfer'
                ? 'bg-blue-600 text-white shadow-md'
                : 'text-muted-foreground hover:text-foreground'
            }`}
            onClick={() => setTxnType('transfer')}
          >
            Transfer
          </button>
        </div>

        {txnType === 'income' && (
          <label
            data-testid="transaction-refund-toggle"
            className={`flex items-center justify-between gap-3 px-3.5 py-2.5 rounded-xl border cursor-pointer transition-colors ${
              isRefund
                ? 'bg-emerald-500/10 border-emerald-500/35 text-foreground'
                : 'bg-surface2/60 border-border text-muted-foreground hover:text-foreground'
            }`}
          >
            <div className="flex items-center gap-2.5 min-w-0">
              <RotateCcw className={`w-4 h-4 shrink-0 ${isRefund ? 'text-emerald-500' : 'text-muted-foreground'}`} />
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
              checked={isRefund}
              onChange={e => {
                const next = e.target.checked;
                setIsRefund(next);
                if (next && txnCategory === 'income') {
                  const suggested = suggestCategory(txnDescription, '', categories);
                  setTxnCategory(suggested && suggested !== 'income' ? suggested : 'shopping');
                }
              }}
              className="w-4 h-4 rounded border-border text-emerald-500 focus:ring-emerald-500"
            />
          </label>
        )}

        {showBucketSelector && (
          <div>
            <div className="flex justify-between items-center mb-1">
              <label className="block text-xs font-bold text-muted-foreground uppercase tracking-wider">
                Spending Bucket
              </label>
              {!userManuallySelectedBucket && txnDescription.trim() && (
                <span className="text-[11px] text-primary font-semibold flex items-center gap-1">
                  <Sparkles className="w-3 h-3" /> Auto-suggested
                </span>
              )}
            </div>
            <div
              className="flex gap-1.5 p-1 bg-surface2 rounded-[10px] border border-border"
              data-testid="transaction-bucket-toggle"
            >
              <button
                type="button"
                className={`flex-1 py-1.5 px-2 rounded-[8px] font-semibold text-xs flex items-center justify-center gap-1 transition-all ${
                  txnBucket === 'fixed'
                    ? 'bg-bucket-fixed text-white shadow-sm'
                    : 'text-muted-foreground hover:text-foreground'
                }`}
                onClick={() => {
                  setTxnBucket('fixed');
                  setUserManuallySelectedBucket(true);
                }}
              >
                <Shield className="w-3.5 h-3.5" /> Fixed
              </button>
              <button
                type="button"
                className={`flex-1 py-1.5 px-2 rounded-[8px] font-semibold text-xs flex items-center justify-center gap-1 transition-all ${
                  txnBucket === 'flexible'
                    ? 'bg-bucket-variable text-white shadow-sm'
                    : 'text-muted-foreground hover:text-foreground'
                }`}
                onClick={() => {
                  setTxnBucket('flexible');
                  setUserManuallySelectedBucket(true);
                }}
              >
                <ShoppingBag className="w-3.5 h-3.5" /> Variable
              </button>
              <button
                type="button"
                className={`flex-1 py-1.5 px-2 rounded-[8px] font-semibold text-xs flex items-center justify-center gap-1 transition-all ${
                  txnBucket === 'non-monthly'
                    ? 'bg-bucket-nonmonthly text-white shadow-sm'
                    : 'text-muted-foreground hover:text-foreground'
                }`}
                onClick={() => {
                  setTxnBucket('non-monthly');
                  setUserManuallySelectedBucket(true);
                }}
              >
                <Calendar className="w-3.5 h-3.5" /> Non-Monthly
              </button>
            </div>
          </div>
        )}

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-bold text-muted-foreground mb-1">Amount *</label>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground font-bold">$</span>
              <input
                type="number"
                step="0.01"
                required
                data-testid="transaction-amount-input"
                value={txnAmount}
                onChange={e => setTxnAmount(e.target.value)}
                className={`w-full bg-card/50 border rounded-xl pl-8 pr-4 py-2.5 font-bold tabular-nums focus:ring-2 focus:ring-primary outline-none transition-all ${
                  amountError ? 'border-destructive focus:ring-destructive' : 'border-border'
                }`}
                placeholder="0.00"
              />
            </div>
            {amountError && (
              <p data-testid="amount-error" className="text-destructive text-xs mt-1 font-bold field-error-amount">
                {amountError}
              </p>
            )}
          </div>
          <div>
            <label className="block text-sm font-bold text-muted-foreground mb-1">Date *</label>
            <input
              type="date"
              required
              data-testid="transaction-date-input"
              value={txnDate}
              onChange={e => setTxnDate(e.target.value)}
              className={`w-full bg-card/50 border rounded-xl px-4 py-2.5 font-medium focus:ring-2 focus:ring-primary outline-none transition-all ${
                dateError ? 'border-destructive focus:ring-destructive' : 'border-border'
              }`}
            />
            {dateError && (
              <p data-testid="date-error" className="text-destructive text-xs mt-1 font-bold field-error-date">
                {dateError}
              </p>
            )}
          </div>
        </div>

        <div>
          <label className="block text-sm font-bold text-muted-foreground mb-1">Description *</label>
          <input
            type="text"
            required
            data-testid="transaction-desc-input"
            value={txnDescription}
            onChange={e => {
              const val = e.target.value;
              setTxnDescription(val);
              if (!editingTxnId) {
                const detectedType = detectTransactionType(val);
                if (detectedType === 'transfer') {
                  setTxnType('transfer');
                }
                if (!userManuallySelectedCategory) {
                  const suggested = suggestCategory(val, '', categories);
                  if (suggested) {
                    setTxnCategory(suggested);
                    if (!userManuallySelectedBucket) {
                      setTxnBucket(suggestSpendingBucket(val, suggested));
                    }
                  }
                } else if (!userManuallySelectedBucket) {
                  setTxnBucket(suggestSpendingBucket(val, txnCategory));
                }
              }
            }}
            className={`w-full bg-card/50 border rounded-xl px-4 py-2.5 font-medium focus:ring-2 focus:ring-primary outline-none transition-all ${
              descError ? 'border-destructive focus:ring-destructive' : 'border-border'
            }`}
            placeholder="What was this for? (e.g. Whole Foods, Rent)"
          />
          {descError && (
            <p data-testid="desc-error" className="text-destructive text-xs mt-1 font-bold field-error-desc">
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
              <div className="flex items-center gap-2 shrink-0">
                {!userManuallySelectedCategory && txnDescription.trim() && (
                  <span className="text-[11px] text-primary font-semibold flex items-center gap-1 whitespace-nowrap">
                    <Sparkles className="w-3 h-3" /> Auto
                  </span>
                )}
                {setShowCategoryManagerModal && (
                  <button
                    type="button"
                    onClick={() => setShowCategoryManagerModal(true)}
                    className="text-[11px] text-primary font-bold hover:underline flex items-center gap-1 whitespace-nowrap"
                  >
                    + Manage Categories
                  </button>
                )}
              </div>
            </div>
            {(() => {
              const allCategoriesMap = new Map<string, Category>();
              DEFAULT_CATEGORIES.forEach(c => allCategoriesMap.set(c.id, c));
              categories.forEach(c => allCategoriesMap.set(c.id, c));
              const allCats = Array.from(allCategoriesMap.values());
              const parentCats = allCats.filter(c => !c.parentId);

              const validParent = parentCats.some(c => c.id === txnCategory)
                ? txnCategory
                : parentCats[0]?.id || 'misc';
              const activeValue = txnSubCategory ? `${validParent}|${txnSubCategory}` : validParent;

              return (
                <select
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
                  }}
                  className="w-full bg-card border border-border rounded-xl px-3.5 py-2.5 font-medium text-foreground focus:ring-2 focus:ring-primary outline-none transition-all cursor-pointer"
                >
                  {parentCats.map(p => {
                    const subs = allCats.filter(c => c.parentId === p.id);
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
                        {subs.map(s => (
                          <option
                            key={s.id}
                            value={`${p.id}|${s.id}`}
                            label={s.name}
                            className="bg-card text-card-foreground"
                          >
                            {s.emoji} {s.name}
                          </option>
                        ))}
                      </optgroup>
                    );
                  })}
                </select>
              );
            })()}
          </div>

          <div>
            <label className="block text-sm font-bold text-muted-foreground mb-1">Account / Card</label>
            <input
              type="text"
              list="known-accounts-datalist"
              data-testid="transaction-account-input"
              value={txnAccount}
              onChange={e => setTxnAccount(e.target.value)}
              className="w-full bg-card/50 border border-border rounded-xl px-3.5 py-2.5 font-medium focus:ring-2 focus:ring-primary outline-none transition-all"
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
          <input
            type="text"
            data-testid="transaction-labels-input"
            value={txnLabels}
            onChange={e => setTxnLabels(e.target.value)}
            className="w-full bg-card/50 border border-border rounded-xl px-4 py-2.5 font-medium focus:ring-2 focus:ring-primary outline-none transition-all"
            placeholder="e.g. japan-trip, tax-2026, reimbursable"
          />
        </div>

        <div>
          <label className="block text-sm font-bold text-muted-foreground mb-1">Notes (Optional)</label>
          <textarea
            data-testid="transaction-notes-input"
            value={txnNotes}
            onChange={e => setTxnNotes(e.target.value)}
            className="w-full bg-card/50 border border-border rounded-xl px-4 py-2.5 font-medium focus:ring-2 focus:ring-primary outline-none transition-all min-h-[72px]"
            placeholder="Additional details..."
          />
        </div>

        <div className="pt-3 flex items-center gap-2.5">
          {editingTxnId && !isTxnLocked && onDeleteTransaction && (
            <button
              type="button"
              data-testid="modal-delete-transaction-btn"
              onClick={() => onDeleteTransaction(editingTxnId)}
              aria-label="Delete transaction"
              title="Delete transaction"
              className="px-3.5 py-3 rounded-xl font-semibold text-destructive hover:bg-destructive/10 border border-destructive/25 transition-colors flex items-center justify-center gap-1.5"
            >
              <Trash2 className="w-4 h-4" />
              <span className="text-sm">Delete</span>
            </button>
          )}
          <button
            type="button"
            onClick={() => setShowTxnModal(false)}
            className="flex-1 px-4 py-3 rounded-xl font-bold hover:bg-card border border-border transition-colors"
          >
            Cancel
          </button>
          <button
            type="submit"
            data-testid="save-transaction-btn"
            className="flex-1 px-4 py-3 rounded-xl bg-primary hover:bg-primary/90 text-primary-foreground font-bold shadow-lg shadow-primary/20 transition-all hover:scale-105 active:scale-95 flex items-center justify-center gap-2"
          >
            <Save className="w-5 h-5" /> {editingTxnId ? 'Save Changes' : 'Add Record'}
          </button>
        </div>
      </form>
    </Modal>
  );
}
