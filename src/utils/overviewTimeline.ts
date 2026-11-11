import type { Transaction, Category } from '../services/storage';
import { bucketOf } from './categorizer';
import { formatMoney } from './formatters';
import { getMonthPhase, isRefundTransaction } from './metrics';
import type { MonthPhase } from './metrics';

export type TimelineMode = 'all' | 'variable';

export interface TimelineMonthPoint {
  monthKey: string;
  label: string;
  monthlySpent: number;
  cumulativeSpent: number;
}

export interface TimelinePaceVerdict {
  text: string;
  tone: 'positive' | 'negative' | 'warning' | 'neutral';
}

export interface SpendTimelineModel {
  isAllTime: boolean;
  phase: MonthPhase;
  title: string;
  totalSuffix: string;
  displayedTotal: number;
  daysInMonth: number;
  priorDaysInMonth: number;
  currentCum: number[];
  cutoffIndex: number;
  hasCurrentActivity: boolean;
  priorCum: number[];
  hasPrior: boolean;
  targetCeiling: number;
  diffVsPriorAtCutoff: number | null;
  paceVerdict: TimelinePaceVerdict | null;
  monthPoints: TimelineMonthPoint[];
  currMonthShort: string;
  prevMonthShort: string;
}

export function getShortMonthLabel(monthStr?: string | null): string {
  if (!monthStr || !/^\d{4}-\d{2}$/.test(monthStr)) return 'Month';
  const [yStr, mStr] = monthStr.split('-');
  const d = new Date(Date.UTC(parseInt(yStr, 10), parseInt(mStr, 10) - 1, 1));
  return d.toLocaleDateString('en-US', { month: 'short', timeZone: 'UTC' });
}

export function getMonthDaysCount(monthStr?: string | null): number {
  if (!monthStr || !/^\d{4}-\d{2}$/.test(monthStr)) return 30;
  const [yStr, mStr] = monthStr.split('-');
  return new Date(parseInt(yStr, 10), parseInt(mStr, 10), 0).getDate();
}

export function computeSpendTimelineModel(params: {
  allTransactions: Transaction[];
  availableMonths?: string[];
  selectedMonth: string;
  priorMonthKey?: string | null;
  categories?: Category[];
  mode?: TimelineMode;
  totalExpenses?: number;
  totalBudget?: number;
  variableBudget?: number;
  referenceDate?: Date;
}): SpendTimelineModel {
  const {
    allTransactions,
    availableMonths = [],
    selectedMonth,
    priorMonthKey = null,
    categories = [],
    mode = 'all',
    totalExpenses,
    totalBudget = 0,
    variableBudget = 0,
    referenceDate = new Date(),
  } = params;

  const phaseInfo = getMonthPhase(selectedMonth, referenceDate);
  const matchesMode = (t: Transaction): boolean => {
    if (t.type !== 'expense' && !isRefundTransaction(t)) return false;
    if (mode === 'variable') {
      return bucketOf(t, categories) === 'flexible';
    }
    return true;
  };

  // All-Time multi-month trajectory (BUG-10b & BUG-24b)
  if (selectedMonth === 'all') {
    const monthSet = new Set<string>();
    for (const m of availableMonths) {
      if (/^\d{4}-\d{2}$/.test(m)) monthSet.add(m);
    }
    for (const t of allTransactions) {
      if (t.date && t.date.length >= 7 && t.type !== 'transfer') {
        const m = t.date.slice(0, 7);
        if (/^\d{4}-\d{2}$/.test(m)) monthSet.add(m);
      }
    }

    const sortedMonths = Array.from(monthSet).sort();
    const rawMonthlyTotals = sortedMonths.map(mKey => {
      const net = allTransactions
        .filter(t => t.date && t.date.startsWith(mKey) && matchesMode(t))
        .reduce((sum, t) => {
          const amt = Number(t.amount) || 0;
          return sum + (isRefundTransaction(t) ? -amt : amt);
        }, 0);
      return { monthKey: mKey, monthlySpent: Math.max(0, net) };
    });

    const activeOnly = rawMonthlyTotals.filter(m => m.monthlySpent > 0);
    const series = activeOnly.length > 0 ? activeOnly : rawMonthlyTotals;

    let runningCum = 0;
    const monthPoints: TimelineMonthPoint[] = series.map(item => {
      runningCum += item.monthlySpent;
      return {
        monthKey: item.monthKey,
        label: getShortMonthLabel(item.monthKey),
        monthlySpent: item.monthlySpent,
        cumulativeSpent: runningCum,
      };
    });

    const hasCurrentActivity = activeOnly.length > 0;
    const currentCum = monthPoints.map(p => p.monthlySpent);
    const displayedTotal =
      mode === 'all' && totalExpenses !== undefined ? totalExpenses : runningCum;

    return {
      isAllTime: true,
      phase: 'all',
      title: 'Monthly spending trend',
      totalSuffix: 'total',
      displayedTotal,
      daysInMonth: Math.max(1, monthPoints.length),
      priorDaysInMonth: 0,
      currentCum,
      cutoffIndex: hasCurrentActivity ? monthPoints.length : 0,
      hasCurrentActivity,
      priorCum: [],
      hasPrior: false,
      targetCeiling: 0,
      diffVsPriorAtCutoff: null,
      paceVerdict: null,
      monthPoints,
      currMonthShort: 'All',
      prevMonthShort: '',
    };
  }

  // Single YYYY-MM month view
  const daysInMonth = phaseInfo.daysInMonth;
  const priorDaysInMonth = getMonthDaysCount(priorMonthKey || selectedMonth);
  const currMonthShort = getShortMonthLabel(selectedMonth);
  const prevMonthShort = getShortMonthLabel(priorMonthKey);

  const expTxns = allTransactions.filter(
    t => t.date && t.date.startsWith(selectedMonth) && matchesMode(t)
  );

  const byDay = new Array<number>(daysInMonth).fill(0);
  let maxTxnDay = 0;

  for (const t of expTxns) {
    const rawDay = parseInt((t.date || '').slice(8, 10), 10);
    if (!isNaN(rawDay)) {
      const clamped = Math.min(daysInMonth, Math.max(1, rawDay));
      maxTxnDay = Math.max(maxTxnDay, clamped);
      const amt = Number(t.amount) || 0;
      byDay[clamped - 1] += isRefundTransaction(t) ? -amt : amt;
    }
  }

  const currentCum: number[] = [];
  let running = 0;
  for (let i = 0; i < daysInMonth; i++) {
    running += byDay[i];
    currentCum.push(Math.max(0, running));
  }

  const hasCurrentActivity = expTxns.length > 0;
  let cutoffIndex = 0;
  if (hasCurrentActivity) {
    if (phaseInfo.phase === 'current') {
      cutoffIndex = Math.min(daysInMonth, Math.max(phaseInfo.today, maxTxnDay));
    } else if (phaseInfo.phase === 'future') {
      cutoffIndex = Math.min(daysInMonth, Math.max(1, maxTxnDay));
    } else {
      cutoffIndex = daysInMonth;
    }
  }

  // Prior month cumulative across full priorDaysInMonth (preserving days 29-31 on Feb/30d months! BUG-10d)
  let priorCum: number[] = [];
  let hasPrior = false;
  if (priorMonthKey) {
    const priorExpTxns = allTransactions.filter(
      t => t.date && t.date.startsWith(priorMonthKey) && matchesMode(t)
    );
    const anyPriorNonTransfer = allTransactions.some(
      t => t.date && t.date.startsWith(priorMonthKey) && t.type !== 'transfer'
    );
    if (priorExpTxns.length > 0 || (anyPriorNonTransfer && mode === 'variable')) {
      const pByDay = new Array<number>(priorDaysInMonth).fill(0);
      for (const t of priorExpTxns) {
        const rawDay = parseInt((t.date || '').slice(8, 10), 10);
        if (!isNaN(rawDay) && rawDay >= 1 && rawDay <= priorDaysInMonth) {
          const amt = Number(t.amount) || 0;
          pByDay[rawDay - 1] += isRefundTransaction(t) ? -amt : amt;
        }
      }
      let pRunning = 0;
      priorCum = pByDay.map(v => {
        pRunning += v;
        return Math.max(0, pRunning);
      });
      hasPrior = priorCum.some(v => v > 0) || priorExpTxns.length > 0;
    }
  }

  const targetCeiling = mode === 'variable' ? variableBudget : totalBudget;
  const cashCurveTotal = currentCum[daysInMonth - 1] || 0;
  const displayedTotal =
    mode === 'variable'
      ? cashCurveTotal
      : totalExpenses !== undefined
      ? totalExpenses
      : cashCurveTotal;

  let diffVsPriorAtCutoff: number | null = null;
  let paceVerdict: TimelinePaceVerdict | null = null;

  if (hasPrior && cutoffIndex > 0 && hasCurrentActivity) {
    if (phaseInfo.phase === 'current') {
      const currAtCutoff = currentCum[cutoffIndex - 1] || 0;
      const priorIdx = Math.min(priorDaysInMonth - 1, cutoffIndex - 1);
      const priorAtCutoff = priorCum[priorIdx] || 0;
      const diff = currAtCutoff - priorAtCutoff;
      const compDay = priorIdx + 1;
      diffVsPriorAtCutoff = diff;

      if (Math.abs(diff) < 10) {
        paceVerdict = {
          text: `On pace with ${prevMonthShort} ${compDay}`,
          tone: 'neutral',
        };
      } else if (diff < 0) {
        paceVerdict = {
          text: `↓ ${formatMoney(Math.abs(diff))} below ${prevMonthShort} ${compDay} pace`,
          tone: 'positive',
        };
      } else {
        const pctOver = priorAtCutoff > 0 ? (diff / priorAtCutoff) * 100 : 100;
        paceVerdict = {
          text: `↑ ${formatMoney(diff)} above ${prevMonthShort} ${compDay} pace`,
          tone: pctOver > 15 ? 'negative' : 'warning',
        };
      }
    } else if (phaseInfo.phase === 'past') {
      const currTotal = currentCum[daysInMonth - 1] || 0;
      const priorTotal = priorCum[priorDaysInMonth - 1] || 0;
      const diff = currTotal - priorTotal;
      diffVsPriorAtCutoff = diff;

      if (Math.abs(diff) < 10) {
        paceVerdict = {
          text: `≈ same as ${prevMonthShort}`,
          tone: 'neutral',
        };
      } else if (diff < 0) {
        paceVerdict = {
          text: `↓ ${formatMoney(Math.abs(diff))} less than ${prevMonthShort}`,
          tone: 'positive',
        };
      } else {
        const pctOver = priorTotal > 0 ? (diff / priorTotal) * 100 : 100;
        paceVerdict = {
          text: `↑ ${formatMoney(diff)} more than ${prevMonthShort}`,
          tone: pctOver > 15 ? 'negative' : 'warning',
        };
      }
    }
  }

  const title = phaseInfo.phase === 'current' ? 'Spending pace' : 'Monthly spending';
  const totalSuffix = phaseInfo.phase === 'current' ? 'MTD' : 'total';

  return {
    isAllTime: false,
    phase: phaseInfo.phase,
    title,
    totalSuffix,
    displayedTotal,
    daysInMonth,
    priorDaysInMonth,
    currentCum,
    cutoffIndex,
    hasCurrentActivity,
    priorCum,
    hasPrior,
    targetCeiling,
    diffVsPriorAtCutoff,
    paceVerdict,
    monthPoints: [],
    currMonthShort,
    prevMonthShort,
  };
}
