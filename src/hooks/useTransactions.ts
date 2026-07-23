import { useState, useMemo, useCallback } from 'react';
import { Transaction, MonthlyLock } from '../services/storage';

export interface TrendPoint {
  date: string;
  formattedDate: string;
  amount: number;
  x: number;
  y: number;
}

export interface TrendChartDetails {
  points: TrendPoint[];
  pathData: string;
  areaPathData: string;
  maxAmt: number;
  minAmt: number;
  highestSpendDay: { date: string; formattedDate: string; amount: number } | null;
  dailyAvg: number;
  totalSpent: number;
  yTicks: { label: string; y: number; val: number }[];
  xTicks: { label: string; x: number; formattedDate: string }[];
}

function formatShortDate(dateStr: string): string {
  if (!dateStr || dateStr.length < 10) return dateStr;
  const parts = dateStr.split('-');
  if (parts.length < 3) return dateStr;
  const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const mIdx = parseInt(parts[1], 10) - 1;
  const day = parseInt(parts[2], 10);
  if (mIdx >= 0 && mIdx < 12 && !isNaN(day)) {
    return `${monthNames[mIdx]} ${day}`;
  }
  return dateStr;
}

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

  const totalTransfers = useMemo(() => filteredTransactions
    .filter(t => t.type === 'transfer')
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
  const trendDetails = useMemo<TrendChartDetails>(() => {
    const expenses = filteredTransactions.filter(t => t.type === 'expense');
    if (expenses.length === 0) {
      return {
        points: [],
        pathData: '',
        areaPathData: '',
        maxAmt: 0,
        minAmt: 0,
        highestSpendDay: null,
        dailyAvg: 0,
        totalSpent: 0,
        yTicks: [],
        xTicks: []
      };
    }

    const dateMap: { [date: string]: number } = {};
    let totalSpent = 0;
    expenses.forEach(t => {
      if (t.date) {
        const amt = typeof t.amount === 'number' ? t.amount : parseFloat(String(t.amount || 0));
        const validAmt = isNaN(amt) ? 0 : amt;
        dateMap[t.date] = (dateMap[t.date] || 0) + validAmt;
        totalSpent += validAmt;
      }
    });

    const sortedDates = Object.keys(dateMap).sort();
    if (sortedDates.length === 0) {
      return {
        points: [],
        pathData: '',
        areaPathData: '',
        maxAmt: 0,
        minAmt: 0,
        highestSpendDay: null,
        dailyAvg: 0,
        totalSpent: 0,
        yTicks: [],
        xTicks: []
      };
    }

    const amounts = Object.values(dateMap);
    const maxVal = Math.max(...amounts, 1);
    const minVal = 0;
    const maxAmt = Math.ceil(maxVal * 1.1);
    const range = maxAmt || 1;

    const width = 500;
    const height = 200;
    const paddingLeft = 55;
    const paddingRight = 25;
    const paddingTop = 25;
    const paddingBottom = 35;

    const chartWidth = width - paddingLeft - paddingRight;
    const chartHeight = height - paddingTop - paddingBottom;

    let highestPoint: { date: string; formattedDate: string; amount: number } | null = null;

    const points: TrendPoint[] = sortedDates.map((date, idx) => {
      const amt = dateMap[date];
      const formattedDate = formatShortDate(date);
      if (!highestPoint || amt > highestPoint.amount) {
        highestPoint = { date, formattedDate, amount: amt };
      }

      const x = sortedDates.length === 1
        ? paddingLeft + chartWidth / 2
        : paddingLeft + (idx / (sortedDates.length - 1)) * chartWidth;

      const norm = (amt - minVal) / range;
      const clampedNorm = Math.max(0, Math.min(1, isNaN(norm) ? 0 : norm));
      const y = height - paddingBottom - clampedNorm * chartHeight;

      return { date, formattedDate, amount: amt, x, y };
    });

    let pathData = '';
    let areaPathData = '';
    if (points.length === 1) {
      const p = points[0];
      pathData = `M ${paddingLeft} ${p.y} L ${width - paddingRight} ${p.y}`;
      areaPathData = `M ${paddingLeft} ${height - paddingBottom} L ${paddingLeft} ${p.y} L ${width - paddingRight} ${p.y} L ${width - paddingRight} ${height - paddingBottom} Z`;
    } else {
      const pathCoords = points.map(p => `${p.x.toFixed(1)} ${p.y.toFixed(1)}`);
      pathData = `M ${pathCoords.join(' L ')}`;
      const firstX = points[0].x.toFixed(1);
      const lastX = points[points.length - 1].x.toFixed(1);
      const bottomY = (height - paddingBottom).toFixed(1);
      areaPathData = `M ${firstX} ${bottomY} L ${pathCoords.join(' L ')} L ${lastX} ${bottomY} Z`;
    }

    const yTicks = [
      { label: '$0', y: height - paddingBottom, val: 0 },
      { label: `$${Math.round(maxAmt / 2).toLocaleString()}`, y: height - paddingBottom - 0.5 * chartHeight, val: maxAmt / 2 },
      { label: `$${Math.round(maxAmt).toLocaleString()}`, y: paddingTop, val: maxAmt }
    ];

    const xTicks: { label: string; x: number; formattedDate: string }[] = [];
    const step = Math.max(1, Math.floor(points.length / 4));
    for (let i = 0; i < points.length; i += step) {
      xTicks.push({
        label: points[i].formattedDate,
        formattedDate: points[i].formattedDate,
        x: points[i].x
      });
    }
    if (points.length > 1 && xTicks[xTicks.length - 1].x !== points[points.length - 1].x) {
      xTicks.push({
        label: points[points.length - 1].formattedDate,
        formattedDate: points[points.length - 1].formattedDate,
        x: points[points.length - 1].x
      });
    }

    return {
      points,
      pathData,
      areaPathData,
      maxAmt,
      minAmt: 0,
      highestSpendDay: highestPoint,
      dailyAvg: Math.round(totalSpent / points.length),
      totalSpent,
      yTicks,
      xTicks
    };
  }, [filteredTransactions]);

  const trendPathData = trendDetails.pathData;

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

  const executeSaveTransactions = async (txnsToSave: Transaction[]) => {
    if (!activeProject || !storageAdapter || txnsToSave.length === 0) return false;
    try {
      await storageAdapter.saveTransactions(activeProject.id, txnsToSave);
      await refreshTransactions();
      showToast(`Saved ${txnsToSave.length} transactions successfully`);
      return true;
    } catch (err: any) {
      alert(err.message || 'Failed to save transactions');
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
    try {
      if (typeof storageAdapter.deleteTransactions === 'function') {
        await storageAdapter.deleteTransactions(activeProject.id, idsToDelete);
      } else {
        for (const id of idsToDelete) {
          await storageAdapter.deleteTransaction(activeProject.id, id);
        }
      }
      await refreshTransactions();
      if (onComplete) onComplete();
      showToast(`Successfully deleted ${idsToDelete.length} transaction${idsToDelete.length > 1 ? 's' : ''}`);
    } catch (err: any) {
      alert(err.message || 'Failed to delete selected transactions');
    }
  };

  const handleExecuteBulkCategoryUpdate = async (selectedTxnIds: Set<string>, categoryId: string, subCategoryId?: string | null, onComplete?: () => void) => {
    if (!activeProject || !storageAdapter || selectedTxnIds.size === 0 || !categoryId) return;
    const updatedTxns: Transaction[] = [];
    for (const t of transactions) {
      if (selectedTxnIds.has(t.id)) {
        updatedTxns.push({ ...t, category: categoryId, subCategory: subCategoryId || null });
      }
    }
    if (updatedTxns.length === 0) return;
    try {
      await storageAdapter.saveTransactions(activeProject.id, updatedTxns);
      await refreshTransactions();
      if (onComplete) onComplete();
      showToast(`Updated category for ${updatedTxns.length} transaction${updatedTxns.length > 1 ? 's' : ''}`);
    } catch (err: any) {
      alert(err.message || 'Failed to update categories');
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
    totalTransfers,
    availableMonths,
    availableTags,
    trendPathData,
    trendDetails,
    refreshTransactions,
    executeSaveTransaction,
    executeSaveTransactions,
    handleDeleteTxn,
    handleExecuteBulkDelete,
    handleExecuteBulkCategoryUpdate,
  };
}
