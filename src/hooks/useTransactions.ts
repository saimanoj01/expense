import { useState, useMemo, useCallback } from 'react';
import { Transaction, MonthlyLock } from '../services/storage';

export function useTransactions(
  storageAdapter: any,
  activeProject: any,
  locks: MonthlyLock[],
  showToast: (msg: string) => void
) {
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [selectedMonth, setSelectedMonth] = useState<string>('2026-07');
  const [selectedTagFilter, setSelectedTagFilter] = useState<string | null>(null);

  // Filter transactions by selected month and tag
  const filteredTransactions = useMemo(() => {
    return transactions.filter(t => {
      const monthMatches = (t.date || '').startsWith(selectedMonth);
      if (!monthMatches && selectedMonth !== 'all') return false;
      if (selectedTagFilter && !(t.labels || []).includes(selectedTagFilter)) return false;
      return true;
    });
  }, [transactions, selectedMonth, selectedTagFilter]);

  // Duplicate transaction detector (Optimized to O(N))
  const duplicateTxnIds = useMemo(() => {
    const dups = new Set<string>();
    const seenHashes = new Map<string, string>(); // hash -> id
    const seenFields = new Map<string, string>(); // fieldKey -> id

    for (const t of transactions) {
      if (t.hash) {
        if (seenHashes.has(t.hash)) {
          dups.add(t.id);
          dups.add(seenHashes.get(t.hash)!);
        } else {
          seenHashes.set(t.hash, t.id);
        }
      }

      const amtNum = typeof t.amount === 'number' ? t.amount : parseFloat(t.amount || 0);
      const fieldKey = `${t.date}|${(t.description || '').trim().toLowerCase()}|${amtNum.toFixed(2)}|${t.type}`;
      if (seenFields.has(fieldKey)) {
        dups.add(t.id);
        dups.add(seenFields.get(fieldKey)!);
      } else {
        seenFields.set(fieldKey, t.id);
      }
    }
    return dups;
  }, [transactions]);

  // KPIs
  const totalExpenses = useMemo(() => filteredTransactions
    .filter(t => t.type === 'expense')
    .reduce((sum, t) => sum + t.amount, 0), [filteredTransactions]);
    
  const totalIncome = useMemo(() => filteredTransactions
    .filter(t => t.type === 'income')
    .reduce((sum, t) => sum + t.amount, 0), [filteredTransactions]);

  const availableMonths = useMemo(() => {
    const monthsSet = new Set<string>(['2026-05', '2026-06', '2026-07']);
    transactions.forEach(t => {
      if (t.date && t.date.length >= 7) monthsSet.add(t.date.substring(0, 7));
    });
    locks.forEach(l => {
      if (l.month) monthsSet.add(l.month);
    });
    return Array.from(monthsSet).sort();
  }, [transactions, locks]);

  const availableTags = useMemo(() => {
    const tagSet = new Set<string>(['groceries', 'utilities', 'salary', 'dining-out']);
    transactions.forEach(t => {
      (t.labels || []).forEach(l => {
        if (l && l.trim()) tagSet.add(l.trim().toLowerCase());
      });
    });
    return Array.from(tagSet);
  }, [transactions]);

  // Trend Chart Data
  const trendPathData = useMemo(() => {
    const expenses = filteredTransactions.filter(t => t.type === 'expense');
    if (expenses.length === 0) return '';
    const dateMap: { [date: string]: number } = {};
    expenses.forEach(t => {
      dateMap[t.date] = (dateMap[t.date] || 0) + t.amount;
    });
    const sortedDates = Object.keys(dateMap).sort();
    if (sortedDates.length === 0) return '';
    if (sortedDates.length === 1) {
      return 'M 30 105 Q 150 90, 270 105';
    }
    const maxAmt = Math.max(...Object.values(dateMap), 1);
    const width = 300;
    const height = 150;
    const padding = 20;
    const points = sortedDates.map((date, idx) => {
      const x = padding + (idx / (sortedDates.length - 1)) * (width - 2 * padding);
      const y = height - padding - (dateMap[date] / maxAmt) * (height - 2 * padding);
      return `${x.toFixed(1)} ${y.toFixed(1)}`;
    });
    return `M ${points.join(' L ')}`;
  }, [filteredTransactions]);

  const refreshTransactions = useCallback(async () => {
    if (!activeProject || !storageAdapter) return;
    try {
      const txs = await storageAdapter.getTransactions(activeProject.id);
      setTransactions(txs);
    } catch (err) {
      console.error("Failed to load transactions:", err);
    }
  }, [activeProject, storageAdapter]);

  const executeSaveTransaction = async (txnToSave: Transaction, isEdit: boolean) => {
    if (!activeProject || !storageAdapter) return false;
    try {
      await storageAdapter.saveTransaction(activeProject.id, txnToSave);
      await refreshTransactions();
      showToast(isEdit ? 'Transaction updated successfully' : 'Transaction saved successfully');
      return true;
    } catch (err: any) {
      alert(err.message || 'Failed to save transaction');
      return false;
    }
  };

  const handleDeleteTxn = async (id: string, onDeleted?: (id: string) => void) => {
    if (!activeProject || !storageAdapter) return;
    try {
      await storageAdapter.deleteTransaction(activeProject.id, id);
      await refreshTransactions();
      if (onDeleted) onDeleted(id);
      showToast('Transaction deleted');
    } catch (err: any) {
      alert(err.message || 'Failed to delete transaction');
    }
  };

  const handleExecuteBulkDelete = async (selectedTxnIds: Set<string>, onComplete?: () => void) => {
    if (!activeProject || !storageAdapter || selectedTxnIds.size === 0) return;
    const idsToDelete = Array.from(selectedTxnIds);
    let count = 0;
    try {
      for (const id of idsToDelete) {
        await storageAdapter.deleteTransaction(activeProject.id, id);
        count++;
      }
      await refreshTransactions();
      if (onComplete) onComplete();
      showToast(`Successfully deleted ${count} transaction${count > 1 ? 's' : ''}`);
    } catch (err: any) {
      alert(err.message || 'Failed to delete selected transactions');
    }
  };

  return {
    transactions,
    setTransactions,
    selectedMonth,
    setSelectedMonth,
    selectedTagFilter,
    setSelectedTagFilter,
    filteredTransactions,
    duplicateTxnIds,
    totalExpenses,
    totalIncome,
    availableMonths,
    availableTags,
    trendPathData,
    refreshTransactions,
    executeSaveTransaction,
    handleDeleteTxn,
    handleExecuteBulkDelete,
  };
}
