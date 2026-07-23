import React, { useState, useEffect } from 'react';
import { X, Save, Sparkles } from 'lucide-react';
import { motion } from 'framer-motion';
import { Category, Transaction } from '../../services/storage';
import { computeTxHash } from '../../utils/crypto';
import { suggestCategory } from '../../utils/categorizer';

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
  setShowDuplicateWarningModal
}: TransactionModalProps) {
  const [txnType, setTxnType] = useState<'income' | 'expense'>('expense');
  const [txnAmount, setTxnAmount] = useState('');
  const [txnDate, setTxnDate] = useState('');
  const [txnCategory, setTxnCategory] = useState('');
  const [txnDescription, setTxnDescription] = useState('');
  const [txnNotes, setTxnNotes] = useState('');
  const [txnLabels, setTxnLabels] = useState('');
  const [userManuallySelectedCategory, setUserManuallySelectedCategory] = useState(false);
  
  const [amountError, setAmountError] = useState<string | null>(null);
  const [dateError, setDateError] = useState<string | null>(null);
  const [descError, setDescError] = useState<string | null>(null);

  useEffect(() => {
    if (showTxnModal) {
      setTxnType(initialData?.type || 'expense');
      setTxnAmount(initialData?.amount?.toString() || '');
      setTxnDate(initialData?.date || '');
      setTxnCategory(initialData?.category || categories[0]?.id || 'food');
      setTxnDescription(initialData?.description || '');
      setTxnNotes(initialData?.notes || '');
      setTxnLabels((initialData?.labels || []).join(', '));
      setUserManuallySelectedCategory(!!editingTxnId);
      setAmountError(null);
      setDateError(null);
      setDescError(null);
    }
  }, [showTxnModal, initialData, categories, editingTxnId]);

  if (!showTxnModal) return null;

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

    const parsedLabels = txnLabels
      .split(',')
      .map(s => s.trim().toLowerCase())
      .filter(Boolean);

    const hash = await computeTxHash(txnDate, txnDescription, amtNum, txnType);
    const targetId = editingTxnId || (crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36).substring(2));
    
    const newTxn: Transaction = {
      id: targetId,
      date: txnDate,
      category: txnCategory,
      amount: amtNum,
      type: txnType,
      description: txnDescription,
      notes: txnNotes,
      labels: parsedLabels,
      hash
    };

    const isDup = transactions.some(t => 
      t.id !== targetId && (
        (t.hash && t.hash === hash) || 
        (t.date === txnDate && 
         t.description.trim().toLowerCase() === txnDescription.trim().toLowerCase() && 
         Math.abs(t.amount - amtNum) < 0.001 && 
         t.type === txnType)
      )
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
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-background/80 backdrop-blur-sm">
      <motion.div 
        initial={{ opacity: 0, scale: 0.95, y: 20 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95, y: 20 }}
        className="glass-panel w-full max-w-md max-h-[90vh] overflow-y-auto custom-scrollbar rounded-2xl p-6 shadow-2xl border border-border/50"
      >
        <div className="flex justify-between items-center mb-6">
          <h2 className="text-2xl font-bold">{editingTxnId ? 'Edit Record' : 'Add Record'}</h2>
          <button onClick={() => setShowTxnModal(false)} className="p-2 hover:bg-card rounded-lg text-muted-foreground hover:text-foreground transition-colors">
            <X className="w-6 h-6" />
          </button>
        </div>
        
        <form onSubmit={handleSaveTransaction} className="space-y-4">
          <div className="flex gap-4 p-1 bg-card/50 rounded-xl border border-border/50" data-testid="transaction-type-toggle" data-active-type={txnType}>
            <button
              type="button"
              className={`flex-1 py-2 rounded-lg font-bold text-sm transition-all ${txnType === 'expense' ? 'bg-destructive text-destructive-foreground shadow-md' : 'text-muted-foreground hover:text-foreground'}`}
              onClick={() => setTxnType('expense')}
            >
              Expense
            </button>
            <button
              type="button"
              className={`flex-1 py-2 rounded-lg font-bold text-sm transition-all ${txnType === 'income' ? 'bg-emerald-500 text-white shadow-md' : 'text-muted-foreground hover:text-foreground'}`}
              onClick={() => setTxnType('income')}
            >
              Income
            </button>
          </div>
          
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-bold text-muted-foreground mb-1">Amount *</label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground font-bold">$</span>
                <input 
                  type="number" step="0.01" required
                  data-testid="transaction-amount-input"
                  value={txnAmount} onChange={e => setTxnAmount(e.target.value)}
                  className={`w-full bg-card/50 border rounded-xl pl-8 pr-4 py-2.5 font-bold tabular-nums focus:ring-2 focus:ring-primary outline-none transition-all ${amountError ? 'border-destructive focus:ring-destructive' : 'border-border'}`}
                  placeholder="0.00"
                />
              </div>
              {amountError && <p className="text-destructive text-xs mt-1 font-bold">{amountError}</p>}
            </div>
            <div>
              <label className="block text-sm font-bold text-muted-foreground mb-1">Date *</label>
              <input 
                type="date" required
                data-testid="transaction-date-input"
                value={txnDate} onChange={e => setTxnDate(e.target.value)}
                className={`w-full bg-card/50 border rounded-xl px-4 py-2.5 font-medium focus:ring-2 focus:ring-primary outline-none transition-all ${dateError ? 'border-destructive focus:ring-destructive' : 'border-border'}`}
              />
              {dateError && <p className="text-destructive text-xs mt-1 font-bold">{dateError}</p>}
            </div>
          </div>
          
          <div>
            <label className="block text-sm font-bold text-muted-foreground mb-1">Description *</label>
            <input 
              type="text" required
              data-testid="transaction-desc-input"
              value={txnDescription} 
              onChange={e => {
                const val = e.target.value;
                setTxnDescription(val);
                if (!userManuallySelectedCategory && !editingTxnId) {
                  const suggested = suggestCategory(val, '', categories);
                  if (suggested) setTxnCategory(suggested);
                }
              }}
              className={`w-full bg-card/50 border rounded-xl px-4 py-2.5 font-medium focus:ring-2 focus:ring-primary outline-none transition-all ${descError ? 'border-destructive focus:ring-destructive' : 'border-border'}`}
              placeholder="What was this for? (e.g. Whole Foods, Netflix)"
            />
            {descError && <p className="text-destructive text-xs mt-1 font-bold">{descError}</p>}
          </div>

          <div>
            <div className="flex justify-between items-center mb-1">
              <label className="block text-sm font-bold text-muted-foreground">Category *</label>
              {!userManuallySelectedCategory && txnDescription.trim() && (
                <span className="text-[11px] text-primary font-semibold flex items-center gap-1">
                  <Sparkles className="w-3 h-3" /> Auto-suggested
                </span>
              )}
            </div>
            <select
              data-testid="transaction-category-select"
              value={txnCategory} 
              onChange={e => {
                setTxnCategory(e.target.value);
                setUserManuallySelectedCategory(true);
              }}
              className="w-full bg-card/50 border border-border rounded-xl px-4 py-2.5 font-medium focus:ring-2 focus:ring-primary outline-none transition-all"
            >
              {categories.map(c => (
                <option key={c.id} value={c.id} className="bg-card text-card-foreground">{c.emoji} {c.name}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-sm font-bold text-muted-foreground mb-1">Notes (Optional)</label>
            <textarea 
              data-testid="transaction-notes-input"
              value={txnNotes} onChange={e => setTxnNotes(e.target.value)}
              className="w-full bg-card/50 border border-border rounded-xl px-4 py-2.5 font-medium focus:ring-2 focus:ring-primary outline-none transition-all min-h-[80px]"
              placeholder="Additional details..."
            />
          </div>

          <div>
            <label className="block text-sm font-bold text-muted-foreground mb-1">Tags (Comma separated)</label>
            <input 
              type="text"
              data-testid="transaction-labels-input"
              value={txnLabels} onChange={e => setTxnLabels(e.target.value)}
              className="w-full bg-card/50 border border-border rounded-xl px-4 py-2.5 font-medium focus:ring-2 focus:ring-primary outline-none transition-all"
              placeholder="groceries, trip, personal"
            />
          </div>
          
          <div className="pt-4 flex gap-3">
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
      </motion.div>
    </div>
  );
}
