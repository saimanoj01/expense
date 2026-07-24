import { useState, useMemo, useCallback } from 'react';
import { Transaction, MonthlyLock } from '../services/storage';

export interface TrendPoint {
  date: string;
  formattedDate: string;
  amount: number;
  x: number;
  y: number;
}

export interface CumulativePacingPoint {
  day: number;
  date: string;
  formattedDate: string;
  dailyAmount: number;
  cumulativeAmount: number;
  x: number;
  y: number;
}

export interface MonthlyCashFlow {
  month: string;
  formattedMonth: string;
  income: number;
  expense: number;
  net: number;
  savingsRate: number;
}

export interface TrendChartDetails {
  // Legacy points for compatibility
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

  // Cumulative Pacing
  cumulativePoints: CumulativePacingPoint[];
  cumulativePathData: string;
  cumulativeAreaPathData: string;
  prevMonthCumulativePoints: CumulativePacingPoint[];
  prevMonthPathData: string;
  idealPacingPoints: CumulativePacingPoint[];
  idealPacingPathData: string;
  eomProjection: number;
  pacingStatus: 'under_budget' | 'on_track' | 'over_budget';
  daysInMonth: number;
  daysElapsed: number;

  // Multi-Month Cash Flow
  monthlyCashFlows: MonthlyCashFlow[];
  avgMonthlySavings: number;
  overallSavingsRate: number;
  bestCashFlowMonth: MonthlyCashFlow | null;
  worstCashFlowMonth: MonthlyCashFlow | null;
  maxCashFlowValue: number;
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

function formatMonthLabel(monthStr: string): string {
  if (!monthStr || monthStr.length < 7) return monthStr;
  const parts = monthStr.split('-');
  const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const mIdx = parseInt(parts[1], 10) - 1;
  const year = parts[0];
  if (mIdx >= 0 && mIdx < 12) {
    return `${monthNames[mIdx]} ${year}`;
  }
  return monthStr;
}

const ensureLabelsArray = (labels: any): string[] => {
  if (Array.isArray(labels)) return labels;
  if (typeof labels === 'string' && labels.trim()) {
    try {
      const parsed = JSON.parse(labels);
      if (Array.isArray(parsed)) return parsed;
    } catch {
      return [labels.trim()];
    }
  }
  return [];
};

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
      if (selectedTagFilter && !ensureLabelsArray(t.labels).includes(selectedTagFilter)) return false;
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
      ensureLabelsArray(t.labels).forEach(l => {
        if (l && l.trim()) tagSet.add(l.trim().toLowerCase());
      });
    });
    return Array.from(tagSet);
  }, [transactions]);

  // Enhanced Trend Chart Details
  const trendDetails = useMemo<TrendChartDetails>(() => {
    const currentMonthStr = selectedMonth === 'all' ? '2026-07' : selectedMonth;
    const [yearNum, monthNum] = currentMonthStr.split('-').map(n => parseInt(n, 10));
    const validYear = isNaN(yearNum) ? 2026 : yearNum;
    const validMonth = isNaN(monthNum) ? 7 : monthNum;

    // Days in current month
    const daysInMonth = new Date(validYear, validMonth, 0).getDate();

    // Determine previous month string
    const prevDateObj = new Date(validYear, validMonth - 2, 1);
    const prevMonthStr = `${prevDateObj.getFullYear()}-${String(prevDateObj.getMonth() + 1).padStart(2, '0')}`;
    const prevDaysInMonth = new Date(prevDateObj.getFullYear(), prevDateObj.getMonth() + 1, 0).getDate();

    // Dimensions
    const width = 500;
    const height = 200;
    const paddingLeft = 55;
    const paddingRight = 25;
    const paddingTop = 25;
    const paddingBottom = 35;
    const chartWidth = width - paddingLeft - paddingRight;
    const chartHeight = height - paddingTop - paddingBottom;

    // 1. Monthly Expenses for Current Selected Month
    const expenses = filteredTransactions.filter(t => t.type === 'expense');
    
    // Group current month by date
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

    // Discrete points (legacy fallback)
    let highestPoint: { date: string; formattedDate: string; amount: number } | null = null;
    const legacyPoints: TrendPoint[] = sortedDates.map((date, idx) => {
      const amt = dateMap[date];
      const formattedDate = formatShortDate(date);
      if (!highestPoint || amt > highestPoint.amount) {
        highestPoint = { date, formattedDate, amount: amt };
      }
      const x = sortedDates.length === 1
        ? paddingLeft + chartWidth / 2
        : paddingLeft + (idx / (sortedDates.length - 1)) * chartWidth;
      const y = height - paddingBottom - (amt / Math.max(totalSpent, 1)) * chartHeight;
      return { date, formattedDate, amount: amt, x, y };
    });

    // 2. Cumulative Pacing calculation for Current Month (Days 1..daysInMonth)
    const currentMonthDailyExpenses: number[] = new Array(daysInMonth).fill(0);
    transactions.forEach(t => {
      if (t.type === 'expense' && t.date && t.date.startsWith(currentMonthStr)) {
        if (selectedTagFilter && !ensureLabelsArray(t.labels).includes(selectedTagFilter)) return;
        const day = parseInt(t.date.split('-')[2], 10);
        if (day >= 1 && day <= daysInMonth) {
          const amt = typeof t.amount === 'number' ? t.amount : parseFloat(String(t.amount || 0));
          currentMonthDailyExpenses[day - 1] += isNaN(amt) ? 0 : amt;
        }
      }
    });

    // Determine how many days have elapsed or have data
    const now = new Date();
    const nowYear = now.getFullYear();
    const nowMonth = now.getMonth() + 1; // 1-indexed
    const isCurrentCalendarMonth = (validYear === nowYear && validMonth === nowMonth);
    let lastActiveDay = 1;
    if (isCurrentCalendarMonth) {
      // For the current real-world month, use today's date as the baseline
      lastActiveDay = now.getDate();
    } else {
      // For past/future months, use the last day with actual data, or the full month
      for (let d = daysInMonth; d >= 1; d--) {
        if (currentMonthDailyExpenses[d - 1] > 0) {
          lastActiveDay = d;
          break;
        }
      }
      // If it's a past month with data, treat the full month as elapsed
      if (validYear < nowYear || (validYear === nowYear && validMonth < nowMonth)) {
        lastActiveDay = daysInMonth;
      }
    }
    const daysElapsed = Math.max(lastActiveDay, 1);

    // Calculate Cumulative amounts
    const currentCumulative: number[] = [];
    let runningSum = 0;
    for (let d = 0; d < daysInMonth; d++) {
      runningSum += currentMonthDailyExpenses[d];
      currentCumulative.push(runningSum);
    }

    // 3. Previous Month Cumulative Pacing calculation
    const prevMonthDailyExpenses: number[] = new Array(prevDaysInMonth).fill(0);
    transactions.forEach(t => {
      if (t.type === 'expense' && t.date && t.date.startsWith(prevMonthStr)) {
        if (selectedTagFilter && !ensureLabelsArray(t.labels).includes(selectedTagFilter)) return;
        const day = parseInt(t.date.split('-')[2], 10);
        if (day >= 1 && day <= prevDaysInMonth) {
          const amt = typeof t.amount === 'number' ? t.amount : parseFloat(String(t.amount || 0));
          prevMonthDailyExpenses[day - 1] += isNaN(amt) ? 0 : amt;
        }
      }
    });

    const prevCumulative: number[] = [];
    let prevRunningSum = 0;
    for (let d = 0; d < prevDaysInMonth; d++) {
      prevRunningSum += prevMonthDailyExpenses[d];
      prevCumulative.push(prevRunningSum);
    }

    // Maximum value for scale across current cumulative, prev month cumulative
    const currentMaxCumulative = currentCumulative[daysInMonth - 1] || 0;
    const prevMaxCumulative = prevCumulative[prevDaysInMonth - 1] || 0;
    const scaleMax = Math.max(currentMaxCumulative, prevMaxCumulative, 100);
    const range = scaleMax * 1.1;

    // Build SVG points for Current Month Cumulative
    const cumulativePoints: CumulativePacingPoint[] = [];
    for (let d = 1; d <= daysInMonth; d++) {
      const dailyAmt = currentMonthDailyExpenses[d - 1];
      const cumAmt = currentCumulative[d - 1];
      const dateStr = `${currentMonthStr}-${String(d).padStart(2, '0')}`;
      const x = paddingLeft + ((d - 1) / Math.max(daysInMonth - 1, 1)) * chartWidth;
      const norm = cumAmt / range;
      const y = height - paddingBottom - Math.max(0, Math.min(1, norm)) * chartHeight;
      cumulativePoints.push({
        day: d,
        date: dateStr,
        formattedDate: formatShortDate(dateStr),
        dailyAmount: dailyAmt,
        cumulativeAmount: cumAmt,
        x,
        y
      });
    }

    // Build SVG points for Previous Month Cumulative
    const prevMonthCumulativePoints: CumulativePacingPoint[] = [];
    for (let d = 1; d <= Math.min(daysInMonth, prevDaysInMonth); d++) {
      const dailyAmt = prevMonthDailyExpenses[d - 1];
      const cumAmt = prevCumulative[d - 1];
      const dateStr = `${prevMonthStr}-${String(d).padStart(2, '0')}`;
      const x = paddingLeft + ((d - 1) / Math.max(daysInMonth - 1, 1)) * chartWidth;
      const norm = cumAmt / range;
      const y = height - paddingBottom - Math.max(0, Math.min(1, norm)) * chartHeight;
      prevMonthCumulativePoints.push({
        day: d,
        date: dateStr,
        formattedDate: formatShortDate(dateStr),
        dailyAmount: dailyAmt,
        cumulativeAmount: cumAmt,
        x,
        y
      });
    }

    // Note: Ideal Budget Pacing Line points are computed later in TrendChart
    // using totalBudget from props. We leave placeholders here.
    const idealPacingPoints: CumulativePacingPoint[] = [];

    // Path strings for Cumulative View
    const cumCoords = cumulativePoints.map(p => `${p.x.toFixed(1)} ${p.y.toFixed(1)}`);
    const cumulativePathData = `M ${cumCoords.join(' L ')}`;
    const firstX = cumulativePoints[0]?.x.toFixed(1) || paddingLeft.toString();
    const lastX = cumulativePoints[cumulativePoints.length - 1]?.x.toFixed(1) || (width - paddingRight).toString();
    const bottomY = (height - paddingBottom).toFixed(1);
    const cumulativeAreaPathData = `M ${firstX} ${bottomY} L ${cumCoords.join(' L ')} L ${lastX} ${bottomY} Z`;

    const prevCoords = prevMonthCumulativePoints.map(p => `${p.x.toFixed(1)} ${p.y.toFixed(1)}`);
    const prevMonthPathData = `M ${prevCoords.join(' L ')}`;

    const idealPacingPathData = '';

    // EOM Projection (pacing status is computed in TrendChart with totalBudget)
    const currentSpent = currentCumulative[daysElapsed - 1] || 0;
    const eomProjection = daysElapsed > 0 ? Math.round((currentSpent / daysElapsed) * daysInMonth) : 0;
    const pacingStatus: 'under_budget' | 'on_track' | 'over_budget' = 'on_track';

    // 4. Multi-Month Cash Flow Summaries
    const monthGroupMap: Record<string, { income: number; expense: number }> = {};
    availableMonths.forEach(m => {
      monthGroupMap[m] = { income: 0, expense: 0 };
    });

    transactions.forEach(t => {
      if (t.date && t.date.length >= 7) {
        const mKey = t.date.substring(0, 7);
        if (!monthGroupMap[mKey]) {
          monthGroupMap[mKey] = { income: 0, expense: 0 };
        }
        const amt = typeof t.amount === 'number' ? t.amount : parseFloat(String(t.amount || 0));
        const validAmt = isNaN(amt) ? 0 : amt;
        if (t.type === 'expense') {
          monthGroupMap[mKey].expense += validAmt;
        } else if (t.type === 'income') {
          monthGroupMap[mKey].income += validAmt;
        }
      }
    });

    const monthlyCashFlows: MonthlyCashFlow[] = Object.keys(monthGroupMap)
      .sort()
      .map(mKey => {
        const data = monthGroupMap[mKey];
        const net = data.income - data.expense;
        const savingsRate = data.income > 0 ? Math.round((net / data.income) * 100) : 0;
        return {
          month: mKey,
          formattedMonth: formatMonthLabel(mKey),
          income: Math.round(data.income),
          expense: Math.round(data.expense),
          net: Math.round(net),
          savingsRate
        };
      });

    let totalNetSavings = 0;
    let totalAllIncome = 0;
    let bestCashFlowMonth: MonthlyCashFlow | null = null;
    let worstCashFlowMonth: MonthlyCashFlow | null = null;
    let maxCashFlowValue = 100;

    monthlyCashFlows.forEach(cf => {
      totalNetSavings += cf.net;
      totalAllIncome += cf.income;
      maxCashFlowValue = Math.max(maxCashFlowValue, cf.income, cf.expense);
      if (!bestCashFlowMonth || cf.net > bestCashFlowMonth.net) bestCashFlowMonth = cf;
      if (!worstCashFlowMonth || cf.net < worstCashFlowMonth.net) worstCashFlowMonth = cf;
    });

    const avgMonthlySavings = monthlyCashFlows.length > 0 ? Math.round(totalNetSavings / monthlyCashFlows.length) : 0;
    const overallSavingsRate = totalAllIncome > 0 ? Math.round((totalNetSavings / totalAllIncome) * 100) : 0;

    // Y & X Ticks
    const yTicks = [
      { label: '$0', y: height - paddingBottom, val: 0 },
      { label: `$${Math.round(range / 2).toLocaleString()}`, y: height - paddingBottom - 0.5 * chartHeight, val: range / 2 },
      { label: `$${Math.round(range).toLocaleString()}`, y: paddingTop, val: range }
    ];

    const xTicks = [
      { label: 'Day 1', x: paddingLeft, formattedDate: 'Day 1' },
      { label: `Day ${Math.round(daysInMonth / 2)}`, x: paddingLeft + 0.5 * chartWidth, formattedDate: `Day ${Math.round(daysInMonth / 2)}` },
      { label: `Day ${daysInMonth}`, x: width - paddingRight, formattedDate: `Day ${daysInMonth}` }
    ];

    return {
      points: legacyPoints,
      pathData: cumulativePathData,
      areaPathData: cumulativeAreaPathData,
      maxAmt: range,
      minAmt: 0,
      highestSpendDay: highestPoint,
      dailyAvg: daysElapsed > 0 ? Math.round(currentSpent / daysElapsed) : 0,
      totalSpent: currentSpent,
      yTicks,
      xTicks,
      cumulativePoints,
      cumulativePathData,
      cumulativeAreaPathData,
      prevMonthCumulativePoints,
      prevMonthPathData,
      idealPacingPoints,
      idealPacingPathData,
      eomProjection,
      pacingStatus,
      daysInMonth,
      daysElapsed,
      monthlyCashFlows,
      avgMonthlySavings,
      overallSavingsRate,
      bestCashFlowMonth,
      worstCashFlowMonth,
      maxCashFlowValue
    };
  }, [filteredTransactions, transactions, selectedMonth, selectedTagFilter, availableMonths]);

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
