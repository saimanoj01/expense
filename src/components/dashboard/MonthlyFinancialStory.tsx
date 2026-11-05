import React, { useMemo, useEffect, Suspense } from 'react';
import {
  TrendingUp,
  Shield,
  Calendar,
  ShoppingBag,
  PiggyBank,
  ArrowRight,
  AlertTriangle,
  CheckCircle2,
  BarChart3,
  Printer
} from 'lucide-react';
import { motion } from 'framer-motion';
import { Project, Transaction, Category } from '../../services/storage';
import { formatCurrency, formatExpenseCurrency } from '../../utils/formatters';
import { bucketOf } from '../../utils/categorizer';
import { WaterfallItem } from './WaterfallChart';

const WaterfallChart = React.lazy(() => import('./WaterfallChart'));

export interface MonthlyFinancialStoryProps {
  selectedMonth: string;
  activeProject?: Project | null;
  totalBudget?: number;
  totalExpenses: number;
  totalIncome: number;
  totalTransfers?: number;
  fixedExpenses?: number;
  flexibleExpenses?: number;
  nonMonthlyExpenses?: number;
  unclassifiedExpenses?: number;
  unclassifiedCount?: number;
  flexNumber?: number;
  savingsAmount?: number;
  savingsRate?: number;
  allTransactions?: Transaction[];
  categories?: Category[];
  selectedBucket?: 'income' | 'fixed' | 'flexible' | 'non-monthly' | null;
  onSelectBucket?: (b: 'income' | 'fixed' | 'flexible' | 'non-monthly' | null) => void;
  onOpenBackfill?: () => void;
  onOpenReport?: () => void;
}

function getPriorMonthKey(monthStr: string): string | null {
  if (!monthStr || monthStr === 'all' || !/^\d{4}-\d{2}$/.test(monthStr)) return null;
  const [yStr, mStr] = monthStr.split('-');
  const y = parseInt(yStr, 10);
  const m = parseInt(mStr, 10);
  const prevDate = new Date(Date.UTC(y, m - 2, 1));
  const prevYear = prevDate.getUTCFullYear();
  const prevMonth = String(prevDate.getUTCMonth() + 1).padStart(2, '0');
  return `${prevYear}-${prevMonth}`;
}

function formatMonthTitle(monthStr: string): string {
  if (!monthStr || monthStr === 'all') return 'All-Time Financial Summary';
  if (/^\d{4}-\d{2}$/.test(monthStr)) {
    const [yStr, mStr] = monthStr.split('-');
    const date = new Date(Date.UTC(parseInt(yStr, 10), parseInt(mStr, 10) - 1, 1));
    return date.toLocaleDateString('en-US', { month: 'long', year: 'numeric', timeZone: 'UTC' });
  }
  return monthStr;
}

export function MonthlyFinancialStory({
  selectedMonth,
  activeProject,
  totalBudget = 0,
  totalExpenses,
  totalIncome,
  totalTransfers: _totalTransfers = 0,
  fixedExpenses = 0,
  flexibleExpenses = 0,
  nonMonthlyExpenses = 0,
  unclassifiedExpenses = 0,
  unclassifiedCount = 0,
  flexNumber = totalIncome - fixedExpenses - nonMonthlyExpenses,
  savingsAmount = totalIncome - totalExpenses,
  savingsRate = totalIncome > 0 ? (savingsAmount / totalIncome) * 100 : 0,
  allTransactions = [],
  categories = [],
  selectedBucket,
  onSelectBucket,
  onOpenBackfill,
  onOpenReport
}: MonthlyFinancialStoryProps) {
  // Exclude transfers from calculations per specification
  const monthTitle = formatMonthTitle(selectedMonth);

  // Prior Month Metrics & MoM Deltas
  const priorMonthKey = getPriorMonthKey(selectedMonth);
  const priorTxns = useMemo(() => {
    if (!priorMonthKey) return [];
    return allTransactions.filter(t => t.date && t.date.startsWith(priorMonthKey) && t.type !== 'transfer');
  }, [allTransactions, priorMonthKey]);

  const hasPriorMonthData = priorTxns.length > 0;

  const priorMetrics = useMemo(() => {
    if (!hasPriorMonthData) return null;
    const pIncome = priorTxns.filter(t => t.type === 'income').reduce((s, t) => s + t.amount, 0);
    const pFixed = priorTxns.filter(t => t.type === 'expense' && bucketOf(t, categories) === 'fixed').reduce((s, t) => s + t.amount, 0);
    const pFlexible = priorTxns.filter(t => t.type === 'expense' && bucketOf(t, categories) === 'flexible').reduce((s, t) => s + t.amount, 0);
    const pExpenses = priorTxns.filter(t => t.type === 'expense').reduce((s, t) => s + t.amount, 0);
    const pSavings = pIncome - pExpenses;
    const pSavingsRate = pIncome > 0 ? (pSavings / pIncome) * 100 : 0;

    return {
      income: pIncome,
      fixed: pFixed,
      flexible: pFlexible,
      expenses: pExpenses,
      savings: pSavings,
      savingsRate: pSavingsRate
    };
  }, [priorTxns, hasPriorMonthData, categories]);

  // Denominator for progress bars
  const denom = Math.max(totalIncome, totalExpenses, 1);
  const fixedPct = Math.min(100, Math.max(0, (fixedExpenses / denom) * 100));
  const nonMonthlyPct = Math.min(100, Math.max(0, (nonMonthlyExpenses / denom) * 100));
  const flexSpentPct = Math.min(100, Math.max(0, (flexibleExpenses / denom) * 100));
  const savedPct = Math.min(100, Math.max(0, (savingsAmount / denom) * 100));

  // 50/30/20 Guideline Metrics
  const needsPct = totalIncome > 0 ? ((fixedExpenses + nonMonthlyExpenses) / totalIncome) * 100 : 0;
  const wantsPct = totalIncome > 0 ? (flexibleExpenses / totalIncome) * 100 : 0;
  const benchmarkSavingsPct = totalIncome > 0 ? (savingsAmount / totalIncome) * 100 : 0;

  // Plain-Language Story Narrative
  const storyNarrative = useMemo(() => {
    if (selectedMonth === 'all') {
      return `Across all recorded activity, you earned ${formatCurrency(totalIncome)}. Fixed commitments absorbed ${formatCurrency(fixedExpenses)} (${fixedPct.toFixed(1)}%), leaving a flexible pool of ${formatCurrency(flexNumber)}. Day-to-day variable spend was ${formatCurrency(flexibleExpenses)} (${flexSpentPct.toFixed(1)}%) and non-monthly expenses were ${formatCurrency(nonMonthlyExpenses)}, resulting in ${formatCurrency(savingsAmount)} in Net Savings (${savingsRate.toFixed(1)}% rate).`;
    }

    if (totalIncome === 0) {
      if (totalExpenses > 0) {
        return `You spent ${formatCurrency(totalExpenses)} with no recorded income this month.`;
      }
      return `In ${monthTitle}, no income or expenses have been recorded yet.`;
    }

    if (savingsAmount < 0) {
      return `In ${monthTitle}, you earned ${formatCurrency(totalIncome)}. Fixed commitments absorbed ${formatCurrency(fixedExpenses)} (${fixedPct.toFixed(1)}%) and variable spend was ${formatCurrency(flexibleExpenses)} (${flexSpentPct.toFixed(1)}%), resulting in a net cash deficit of ${formatCurrency(Math.abs(savingsAmount))}.`;
    }

    const rateTone = savingsRate >= 50
      ? `an extraordinary ${savingsRate.toFixed(1)}% rate!`
      : savingsRate >= 20
      ? `a healthy ${savingsRate.toFixed(1)}% rate.`
      : `a modest ${savingsRate.toFixed(1)}% rate.`;

    let base = `In ${monthTitle}, you earned ${formatCurrency(totalIncome)}. Fixed commitments absorbed ${formatCurrency(fixedExpenses)} (${fixedPct.toFixed(1)}%), leaving a flexible pool of ${formatCurrency(flexNumber)}. Day-to-day variable spend was ${formatCurrency(flexibleExpenses)} (${flexSpentPct.toFixed(1)}%) and non-monthly expenses were ${formatCurrency(nonMonthlyExpenses)}, resulting in ${formatCurrency(savingsAmount)} in Net Savings — ${rateTone}`;

    if (unclassifiedExpenses > 0) {
      base += ` Note: You have ${formatCurrency(unclassifiedExpenses)} in unclassified expenses.`;
    }

    return base;
  }, [
    selectedMonth,
    monthTitle,
    totalIncome,
    totalExpenses,
    fixedExpenses,
    flexibleExpenses,
    nonMonthlyExpenses,
    unclassifiedExpenses,
    flexNumber,
    savingsAmount,
    savingsRate,
    fixedPct,
    flexSpentPct
  ]);

  // Waterfall Chart Data
  const waterfallData = useMemo<WaterfallItem[]>(() => {
    const items: WaterfallItem[] = [];

    // 1. Inflow
    items.push({
      name: 'Inflow',
      placeholder: 0,
      value: Math.max(0, totalIncome),
      displayValue: totalIncome,
      color: '#10B981', // Emerald
      stepType: 'inflow'
    });

    // 2. Fixed
    let running = totalIncome;
    running -= fixedExpenses;
    items.push({
      name: 'Fixed',
      placeholder: Math.max(0, running),
      value: fixedExpenses,
      displayValue: fixedExpenses,
      color: '#3B82F6', // Blue
      stepType: 'outflow'
    });

    // 3. Variable
    running -= flexibleExpenses;
    items.push({
      name: 'Variable',
      placeholder: Math.max(0, running),
      value: flexibleExpenses,
      displayValue: flexibleExpenses,
      color: '#8B5CF6', // Violet
      stepType: 'outflow'
    });

    // 4. Non-Monthly
    running -= nonMonthlyExpenses;
    items.push({
      name: 'Non-Monthly',
      placeholder: Math.max(0, running),
      value: nonMonthlyExpenses,
      displayValue: nonMonthlyExpenses,
      color: '#F59E0B', // Amber
      stepType: 'outflow'
    });

    // 5. Unclassified (if any)
    if (unclassifiedExpenses > 0) {
      running -= unclassifiedExpenses;
      items.push({
        name: 'Unclassified',
        placeholder: Math.max(0, running),
        value: unclassifiedExpenses,
        displayValue: unclassifiedExpenses,
        color: '#6B7280', // Gray
        stepType: 'outflow'
      });
    }

    // 6. Net Saved or Deficit
    items.push({
      name: savingsAmount >= 0 ? 'Net Saved' : 'Deficit',
      placeholder: 0,
      value: Math.max(0, Math.abs(savingsAmount)),
      displayValue: savingsAmount,
      color: savingsAmount >= 0 ? '#A855F7' : '#F43F5E', // Royal Purple or Crimson Rose
      stepType: 'total'
    });

    return items;
  }, [totalIncome, fixedExpenses, flexibleExpenses, nonMonthlyExpenses, unclassifiedExpenses, savingsAmount]);

  // Confetti Celebration
  useEffect(() => {
    if (selectedMonth === 'all') return;
    if (savingsRate <= 20 || savingsAmount <= 0) return;

    const prefersReducedMotion =
      typeof window !== 'undefined' &&
      window.matchMedia &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (prefersReducedMotion) return;

    const storageKey = `expense_confetti_${activeProject?.id || 'default'}_${selectedMonth}`;
    if (typeof window !== 'undefined' && window.localStorage.getItem(storageKey)) return;

    if (typeof window !== 'undefined') {
      window.localStorage.setItem(storageKey, 'fired');
    }

    import('canvas-confetti')
      .then(confettiModule => {
        const confetti = confettiModule.default || confettiModule;
        confetti({
          particleCount: 70,
          spread: 60,
          origin: { y: 0.6 }
        });
      })
      .catch(() => {});
  }, [selectedMonth, savingsRate, savingsAmount, activeProject?.id]);

  const container = {
    hidden: { opacity: 0, y: 15 },
    show: {
      opacity: 1,
      y: 0,
      transition: {
        duration: 0.4,
        staggerChildren: 0.08
      }
    }
  };

  const item = {
    hidden: { opacity: 0, y: 12 },
    show: { opacity: 1, y: 0, transition: { type: 'spring' as const, stiffness: 300, damping: 24 } }
  };

  return (
    <motion.div
      data-testid="dashboard-header"
      variants={container}
      initial="hidden"
      animate="show"
      className="glass-card p-6 rounded-2xl mb-8 border border-border/80 shadow-xl relative overflow-hidden bg-gradient-to-br from-card/95 via-card/85 to-card/95 backdrop-blur-xl"
    >
      {/* Header & Badges */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4 pb-4 border-b border-border/50">
        <div>
          <div className="flex items-center gap-2">
            <span data-testid="monthly-financial-story" className="px-2.5 py-0.5 rounded-full text-[10px] font-extrabold uppercase tracking-wider bg-primary/15 text-primary border border-primary/20">
              Monthly Financial Story
            </span>
            <span className="text-xs font-semibold text-muted-foreground">{monthTitle}</span>
          </div>
          <h2 className="text-xl font-extrabold tracking-tight text-foreground mt-1 flex items-center gap-2">
            Executive Cash Flow Overview
          </h2>
        </div>

        {/* Global Pill Stats */}
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-card/80 border border-border/60 shadow-sm text-xs font-semibold">
            <span className="text-muted-foreground">Flex:</span>
            <span className="font-bold text-foreground" data-testid="kpi-flex-number">
              {formatCurrency(flexNumber)}
            </span>
          </div>
          <div className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-card/80 border border-border/60 shadow-sm text-xs font-semibold">
            <span className="text-muted-foreground">Budget:</span>
            <span className="font-bold text-foreground" data-testid="kpi-total-budget">
              {formatCurrency(totalBudget || 0)}
            </span>
          </div>
          <div className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-card/80 border border-border/60 shadow-sm text-xs font-semibold">
            <span className="text-muted-foreground">Expenses:</span>
            <span className="font-bold text-foreground" data-testid="kpi-total-expenses">
              {formatCurrency(totalExpenses)}
            </span>
          </div>
          <div className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-card/80 border border-border/60 shadow-sm text-xs font-semibold">
            <span className="text-muted-foreground">Net Saved:</span>
            <span
              className={`font-bold ${savingsAmount >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}
              data-testid="kpi-savings-rate"
            >
              {totalIncome > 0 ? `${savingsRate.toFixed(1)}%` : '—'}
            </span>
          </div>

          {onOpenReport && (
            <button
              onClick={onOpenReport}
              data-testid="story-print-report-btn"
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-card/80 hover:bg-card border border-border/60 shadow-sm text-xs font-semibold transition-all text-muted-foreground hover:text-foreground"
              title="Print or export monthly financial report"
            >
              <Printer className="w-3.5 h-3.5 text-primary" />
              <span>Report</span>
            </button>
          )}
        </div>
      </div>

      {/* Executive Plain-Language Narrative */}
      <div className="mb-6 p-4 rounded-xl bg-primary/5 border border-primary/15 shadow-sm">
        <p className="text-sm text-foreground/90 leading-relaxed font-medium" data-testid="story-narrative">
          "{storyNarrative}"
        </p>
      </div>

      {/* Unclassified Warning Banner */}
      {unclassifiedCount > 0 && (
        <div className="mb-6 p-3 rounded-xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-between gap-3 text-xs">
          <div className="flex items-center gap-2 text-amber-500 font-semibold">
            <AlertTriangle className="w-4 h-4 shrink-0" />
            <span>⚠️ {unclassifiedCount} transaction{unclassifiedCount > 1 ? 's' : ''} ({formatCurrency(unclassifiedExpenses)}) unclassified</span>
          </div>
          {onOpenBackfill && (
            <button
              onClick={onOpenBackfill}
              className="px-2.5 py-1 rounded-lg bg-amber-500 text-white font-bold hover:bg-amber-600 transition-colors shadow-sm"
            >
              Classify Now
            </button>
          )}
        </div>
      )}

      {/* 5-Step Pipeline Grid / Hero Summary Cards */}
      <div className="flex flex-col sm:grid sm:grid-cols-2 lg:flex lg:flex-row lg:items-stretch gap-3 lg:gap-0 mb-6">
        {/* Step 1: Inflow */}
        <motion.button
          variants={item}
          type="button"
          onClick={() => onSelectBucket && onSelectBucket(selectedBucket === 'income' ? null : 'income')}
          className={`flex-1 p-4 rounded-xl text-left transition-all relative group flex flex-col justify-between ${
            selectedBucket === 'income'
              ? 'bg-emerald-500/20 border-2 border-emerald-500 shadow-md shadow-emerald-500/10'
              : 'bg-emerald-500/5 border border-emerald-500/20 hover:border-emerald-500/40'
          }`}
        >
          <div className="flex items-center justify-between mb-2 w-full">
            <span className="text-xs font-bold text-emerald-500 uppercase tracking-wider">1. Total Inflow</span>
            <div className="p-1.5 rounded-lg bg-emerald-500/10 text-emerald-500">
              <TrendingUp className="w-4 h-4" />
            </div>
          </div>
          <div>
            <div className="text-2xl font-bold tracking-tight text-emerald-500" data-testid="kpi-total-income">
              {formatCurrency(totalIncome)}
            </div>
            <div className="mt-1 flex items-center justify-between gap-1 text-[11px]">
              <span className="text-muted-foreground font-medium">Starting cash</span>
              {priorMetrics && (
                <span
                  data-testid="mom-delta-income"
                  className={`font-semibold tabular-nums ${
                    totalIncome >= priorMetrics.income ? 'text-emerald-500' : 'text-rose-400'
                  }`}
                >
                  {totalIncome >= priorMetrics.income ? '+' : ''}
                  {priorMetrics.income > 0
                    ? `${(((totalIncome - priorMetrics.income) / priorMetrics.income) * 100).toFixed(1)}%`
                    : '—'}{' '}
                  MoM
                </span>
              )}
              {!priorMetrics && hasPriorMonthData === false && (
                <span data-testid="mom-delta-income" className="text-muted-foreground text-[10px]">
                  No prior month data
                </span>
              )}
            </div>
          </div>
        </motion.button>

        {/* Connector 1 */}
        <div className="hidden lg:flex items-center justify-center px-1 text-muted-foreground/40 pointer-events-none shrink-0">
          <ArrowRight className="w-4 h-4" />
        </div>

        {/* Step 2: Fixed Commitments */}
        <motion.button
          variants={item}
          type="button"
          onClick={() => onSelectBucket && onSelectBucket(selectedBucket === 'fixed' ? null : 'fixed')}
          className={`flex-1 p-4 rounded-xl text-left transition-all relative group flex flex-col justify-between ${
            selectedBucket === 'fixed'
              ? 'bg-blue-500/20 border-2 border-blue-500 shadow-md shadow-blue-500/10'
              : 'bg-blue-500/5 border border-blue-500/20 hover:border-blue-500/40'
          }`}
        >
          <div className="flex items-center justify-between mb-2 w-full">
            <span className="text-xs font-bold text-blue-400 uppercase tracking-wider">2. Fixed Commitments</span>
            <div className="p-1.5 rounded-lg bg-blue-500/10 text-blue-400">
              <Shield className="w-4 h-4" />
            </div>
          </div>
          <div>
            <div className="text-2xl font-bold tracking-tight text-blue-400" data-testid="kpi-fixed-expenses">
              {formatExpenseCurrency(fixedExpenses)}
            </div>
            <div className="mt-1 flex items-center justify-between gap-1 text-[11px]">
              <span className="text-muted-foreground font-medium">Bills ({fixedPct.toFixed(0)}%)</span>
              {priorMetrics && (
                <span
                  data-testid="mom-delta-fixed"
                  className={`font-semibold tabular-nums ${
                    fixedExpenses <= priorMetrics.fixed ? 'text-emerald-500' : 'text-rose-400'
                  }`}
                >
                  {fixedExpenses >= priorMetrics.fixed ? '+' : ''}
                  {priorMetrics.fixed > 0
                    ? `${(((fixedExpenses - priorMetrics.fixed) / priorMetrics.fixed) * 100).toFixed(1)}%`
                    : '—'}{' '}
                  MoM
                </span>
              )}
              {!priorMetrics && hasPriorMonthData === false && (
                <span data-testid="mom-delta-fixed" className="text-muted-foreground text-[10px]">
                  No prior month data
                </span>
              )}
            </div>
          </div>
        </motion.button>

        {/* Connector 2 */}
        <div className="hidden lg:flex items-center justify-center px-1 text-muted-foreground/40 pointer-events-none shrink-0">
          <ArrowRight className="w-4 h-4" />
        </div>

        {/* Step 3: Variable / Flexible Spend */}
        <motion.button
          variants={item}
          type="button"
          onClick={() => onSelectBucket && onSelectBucket(selectedBucket === 'flexible' ? null : 'flexible')}
          className={`flex-1 p-4 rounded-xl text-left transition-all relative group flex flex-col justify-between ${
            selectedBucket === 'flexible'
              ? 'bg-violet-500/20 border-2 border-violet-500 shadow-md shadow-violet-500/10'
              : 'bg-violet-500/5 border border-violet-500/20 hover:border-violet-500/40'
          }`}
        >
          <div className="flex items-center justify-between mb-2 w-full">
            <span className="text-xs font-bold text-violet-400 uppercase tracking-wider">3. Variable Spend</span>
            <div className="p-1.5 rounded-lg bg-violet-500/10 text-violet-400">
              <ShoppingBag className="w-4 h-4" />
            </div>
          </div>
          <div>
            <div className="text-2xl font-bold tracking-tight text-violet-400" data-testid="kpi-flexible-spent">
              {formatExpenseCurrency(flexibleExpenses)}
            </div>
            <div className="mt-1 flex items-center justify-between gap-1 text-[11px]">
              <span className="text-muted-foreground font-medium">Daily ({flexSpentPct.toFixed(0)}%)</span>
              {priorMetrics && (
                <span
                  data-testid="mom-delta-flexible"
                  className={`font-semibold tabular-nums ${
                    flexibleExpenses <= priorMetrics.flexible ? 'text-emerald-500' : 'text-rose-400'
                  }`}
                >
                  {flexibleExpenses >= priorMetrics.flexible ? '+' : ''}
                  {priorMetrics.flexible > 0
                    ? `${(((flexibleExpenses - priorMetrics.flexible) / priorMetrics.flexible) * 100).toFixed(1)}%`
                    : '—'}{' '}
                  MoM
                </span>
              )}
              {!priorMetrics && hasPriorMonthData === false && (
                <span data-testid="mom-delta-flexible" className="text-muted-foreground text-[10px]">
                  No prior month data
                </span>
              )}
            </div>
          </div>
        </motion.button>

        {/* Connector 3 */}
        <div className="hidden lg:flex items-center justify-center px-1 text-muted-foreground/40 pointer-events-none shrink-0">
          <ArrowRight className="w-4 h-4" />
        </div>

        {/* Step 4: Non-Monthly */}
        <motion.button
          variants={item}
          type="button"
          onClick={() => onSelectBucket && onSelectBucket(selectedBucket === 'non-monthly' ? null : 'non-monthly')}
          className={`flex-1 p-4 rounded-xl text-left transition-all relative group flex flex-col justify-between ${
            selectedBucket === 'non-monthly'
              ? 'bg-amber-500/20 border-2 border-amber-500 shadow-md shadow-amber-500/10'
              : 'bg-amber-500/5 border border-amber-500/20 hover:border-amber-500/40'
          }`}
        >
          <div className="flex items-center justify-between mb-2 w-full">
            <span className="text-xs font-bold text-amber-400 uppercase tracking-wider">4. Non-Monthly</span>
            <div className="p-1.5 rounded-lg bg-amber-500/10 text-amber-400">
              <Calendar className="w-4 h-4" />
            </div>
          </div>
          <div>
            <div className="text-2xl font-bold tracking-tight text-amber-400" data-testid="kpi-non-monthly">
              {formatExpenseCurrency(nonMonthlyExpenses)}
            </div>
            <p className="text-[11px] text-muted-foreground mt-1 font-medium">
              Irregular ({nonMonthlyPct.toFixed(0)}%)
            </p>
          </div>
        </motion.button>

        {/* Connector 4 */}
        <div className="hidden lg:flex items-center justify-center px-1 text-muted-foreground/40 pointer-events-none shrink-0">
          <ArrowRight className="w-4 h-4" />
        </div>

        {/* Step 5: Net Savings */}
        <motion.div
          variants={item}
          className={`flex-1 p-4 rounded-xl border transition-all flex flex-col justify-between shadow-sm ${
            savingsAmount >= 0
              ? 'bg-purple-500/10 border-purple-500/30 hover:border-purple-500/50'
              : 'bg-rose-500/10 border-rose-500/30 hover:border-rose-500/50'
          }`}
        >
          <div className="flex items-center justify-between mb-2">
            <span
              className={`text-xs font-bold uppercase tracking-wider ${
                savingsAmount >= 0 ? 'text-purple-400' : 'text-rose-400'
              }`}
            >
              5. Net Saved
            </span>
            <div
              className={`p-1.5 rounded-lg ${
                savingsAmount >= 0 ? 'bg-purple-500/15 text-purple-400' : 'bg-rose-500/15 text-rose-400'
              }`}
            >
              <PiggyBank className="w-4 h-4" />
            </div>
          </div>
          <div>
            <div
              className={`text-2xl font-extrabold tracking-tight ${
                savingsAmount >= 0 ? 'text-purple-400' : 'text-rose-400'
              }`}
              data-testid="kpi-savings-amount"
            >
              {formatCurrency(savingsAmount)}
            </div>
            <div className="mt-1 flex items-center justify-between gap-1 text-[11px]">
              <span className="text-muted-foreground font-medium">
                Rate: {totalIncome > 0 ? `${savingsRate.toFixed(1)}%` : '—'}
              </span>
              {priorMetrics && totalIncome > 0 && (
                <span
                  data-testid="mom-delta-savings-rate"
                  className={`font-semibold tabular-nums ${
                    savingsRate >= priorMetrics.savingsRate ? 'text-emerald-500' : 'text-rose-400'
                  }`}
                >
                  {savingsRate >= priorMetrics.savingsRate ? '+' : ''}
                  {(savingsRate - priorMetrics.savingsRate).toFixed(1)} pts MoM
                </span>
              )}
            </div>
          </div>
        </motion.div>
      </div>

      {/* Cash Flow Waterfall & 50/30/20 Benchmark Section */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 pt-2 border-t border-border/40">
        {/* Waterfall Chart */}
        <div className="lg:col-span-2">
          <div className="flex items-center justify-between mb-3">
            <h4 className="text-sm font-bold text-foreground flex items-center gap-2">
              <BarChart3 className="w-4 h-4 text-primary" />
              Cash Flow Waterfall
            </h4>
            <span className="text-xs text-muted-foreground">Inflow to Outflow Allocation</span>
          </div>

          <Suspense
            fallback={
              <div className="w-full h-[240px] flex items-center justify-center text-xs text-muted-foreground bg-card/40 rounded-xl border border-border/40 animate-pulse">
                Loading Waterfall Chart...
              </div>
            }
          >
            <WaterfallChart data={waterfallData} />
          </Suspense>
        </div>

        {/* 50/30/20 Rule Benchmark Meter */}
        <div
          className="p-4 rounded-xl bg-card/60 border border-border/60 flex flex-col justify-between"
          data-testid="guideline-meter-50-30-20"
        >
          <div>
            <div className="flex items-center justify-between mb-3">
              <h4 className="text-sm font-bold text-foreground flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                50/30/20 Guideline
              </h4>
              <span className="text-[10px] text-muted-foreground font-semibold">Standard Benchmark</span>
            </div>

            <div className="space-y-3">
              {/* Needs (<= 50%) */}
              <div>
                <div className="flex items-center justify-between text-xs font-semibold mb-1">
                  <span className="text-blue-400">Needs (Fixed + Essentials)</span>
                  <span className="tabular-nums">
                    {totalIncome > 0 ? `${needsPct.toFixed(1)}%` : '—'} / 50%
                  </span>
                </div>
                <div className="h-2 w-full bg-card rounded-full overflow-hidden border border-border/50">
                  <div
                    style={{ width: `${Math.min(100, needsPct)}%` }}
                    className={`h-full transition-all duration-500 rounded-full ${
                      needsPct <= 50 ? 'bg-blue-500' : 'bg-rose-500'
                    }`}
                  />
                </div>
                <p className="text-[10px] text-muted-foreground mt-0.5">
                  {needsPct <= 50 ? '✅ On Track (<= 50%)' : '⚠️ Exceeds 50% limit'}
                </p>
              </div>

              {/* Wants (<= 30%) */}
              <div>
                <div className="flex items-center justify-between text-xs font-semibold mb-1">
                  <span className="text-violet-400">Wants (Variable Spend)</span>
                  <span className="tabular-nums">
                    {totalIncome > 0 ? `${wantsPct.toFixed(1)}%` : '—'} / 30%
                  </span>
                </div>
                <div className="h-2 w-full bg-card rounded-full overflow-hidden border border-border/50">
                  <div
                    style={{ width: `${Math.min(100, wantsPct)}%` }}
                    className={`h-full transition-all duration-500 rounded-full ${
                      wantsPct <= 30 ? 'bg-violet-500' : 'bg-rose-500'
                    }`}
                  />
                </div>
                <p className="text-[10px] text-muted-foreground mt-0.5">
                  {wantsPct <= 30 ? '✅ On Track (<= 30%)' : '⚠️ Exceeds 30% limit'}
                </p>
              </div>

              {/* Savings (>= 20%) */}
              <div>
                <div className="flex items-center justify-between text-xs font-semibold mb-1">
                  <span className="text-emerald-400">Savings (Net Surplus)</span>
                  <span className="tabular-nums">
                    {totalIncome > 0 ? `${benchmarkSavingsPct.toFixed(1)}%` : '—'} / 20%
                  </span>
                </div>
                <div className="h-2 w-full bg-card rounded-full overflow-hidden border border-border/50">
                  <div
                    style={{ width: `${Math.max(0, Math.min(100, benchmarkSavingsPct))}%` }}
                    className={`h-full transition-all duration-500 rounded-full ${
                      benchmarkSavingsPct >= 20 ? 'bg-emerald-500' : 'bg-amber-500'
                    }`}
                  />
                </div>
                <p className="text-[10px] text-muted-foreground mt-0.5">
                  {benchmarkSavingsPct >= 20 ? '🎉 Target Met (>= 20%)' : '💡 Aim for 20% savings'}
                </p>
              </div>
            </div>
          </div>

          <div className="pt-3 border-t border-border/40 text-[10px] text-muted-foreground italic">
            Calculated against total inflow of {formatCurrency(totalIncome)}.
          </div>
        </div>
      </div>

      {/* Segmented Pipeline Progress Bar & Legend */}
      <div className="mt-6 pt-4 border-t border-border/40 space-y-2">
        <div className="h-2.5 w-full bg-card/60 rounded-full overflow-hidden flex border border-border/50 p-0.5">
          {fixedPct > 0 && (
            <div
              style={{ width: `${fixedPct}%` }}
              className="h-full bg-blue-500 transition-all duration-500 rounded-l-full"
              title={`Fixed: ${fixedPct.toFixed(1)}%`}
            />
          )}
          {nonMonthlyPct > 0 && (
            <div
              style={{ width: `${nonMonthlyPct}%` }}
              className="h-full bg-amber-500 transition-all duration-500"
              title={`Non-Monthly: ${nonMonthlyPct.toFixed(1)}%`}
            />
          )}
          {flexSpentPct > 0 && (
            <div
              style={{ width: `${flexSpentPct}%` }}
              className="h-full bg-violet-500 transition-all duration-500"
              title={`Variable: ${flexSpentPct.toFixed(1)}%`}
            />
          )}
          {savedPct > 0 && (
            <div
              style={{ width: `${savedPct}%` }}
              className="h-full bg-emerald-500 transition-all duration-500 rounded-r-full"
              title={`Net Saved: ${savedPct.toFixed(1)}%`}
            />
          )}
        </div>

        <div className="flex flex-wrap items-center justify-between text-[11px] text-muted-foreground pt-1 px-1">
          <div className="flex flex-wrap items-center gap-4">
            <span className="flex items-center gap-1">
              <span className="w-2 h-2 rounded-full bg-blue-500"></span> Fixed ({fixedPct.toFixed(0)}%)
            </span>
            <span className="flex items-center gap-1">
              <span className="w-2 h-2 rounded-full bg-amber-500"></span> Non-Monthly ({nonMonthlyPct.toFixed(0)}%)
            </span>
            <span className="flex items-center gap-1">
              <span className="w-2 h-2 rounded-full bg-violet-500"></span> Variable ({flexSpentPct.toFixed(0)}%)
            </span>
            <span className="flex items-center gap-1">
              <span className="w-2 h-2 rounded-full bg-emerald-500"></span> Saved ({savedPct.toFixed(0)}%)
            </span>
          </div>
          <span className="italic text-[10px] hidden sm:inline">💡 Click any category card above to filter transactions</span>
        </div>
      </div>
    </motion.div>
  );
}

export default MonthlyFinancialStory;
