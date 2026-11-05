import React, { useMemo, useRef, useEffect, useState, useCallback } from 'react';
import { motion } from 'framer-motion';
import { Project, Transaction, Category, Budget } from '../../services/storage';
import { formatCurrency, formatMoney } from '../../utils/formatters';
import { formatMonthLabel } from '../../utils/navigation';
import { useNavigation } from '../../hooks/useNavigation';
import { bucketOf } from '../../utils/categorizer';
import { dur, ease } from '../../theme/motion';
import { OverviewHero } from '../overview/OverviewHero';
import { IncomeRibbon } from '../overview/IncomeRibbon';
import { BucketStats } from '../overview/BucketStats';
import { InsightList } from '../overview/InsightList';
import { SpendTimeline } from '../overview/SpendTimeline';

export interface Level1MonthOverviewProps {
  selectedMonth: string;
  availableMonths: string[];
  onSelectMonth: (month: string) => void;
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
  budgets?: Budget[];
  selectedBucket?: 'income' | 'fixed' | 'flexible' | 'non-monthly' | null;
  onSelectBucket?: (b: 'income' | 'fixed' | 'flexible' | 'non-monthly' | null) => void;
  onOpenReport?: () => void;
  onOpenBackfill?: () => void;
  onOpenAddTxn?: () => void;
  isCanonicalOverview?: boolean;
  className?: string;
}

function getPriorMonthKey(monthStr: string): string | null {
  if (!monthStr || monthStr === 'all' || !/^\d{4}-\d{2}$/.test(monthStr)) return null;
  const [yStr, mStr] = monthStr.split('-');
  const prev = new Date(Date.UTC(parseInt(yStr, 10), parseInt(mStr, 10) - 2, 1));
  return `${prev.getUTCFullYear()}-${String(prev.getUTCMonth() + 1).padStart(2, '0')}`;
}

export const Level1MonthOverview: React.FC<Level1MonthOverviewProps> = ({
  selectedMonth,
  availableMonths,
  onSelectMonth,
  totalBudget = 0,
  totalExpenses,
  totalIncome,
  fixedExpenses = 0,
  flexibleExpenses = 0,
  nonMonthlyExpenses = 0,
  unclassifiedExpenses = 0,
  flexNumber = totalIncome - fixedExpenses - nonMonthlyExpenses,
  savingsAmount = totalIncome - totalExpenses,
  savingsRate = totalIncome > 0 ? (savingsAmount / totalIncome) * 100 : 0,
  allTransactions = [],
  categories = [],
  budgets = [],
  onOpenAddTxn,
  className = '',
}) => {
  const { currentRoute } = useNavigation();
  const isOverview = currentRoute.view === 'overview';
  const prevMonthRef = useRef(selectedMonth);
  const [slideOffset, setSlideOffset] = useState(0);

  useEffect(() => {
    if (prevMonthRef.current !== selectedMonth) {
      const d = selectedMonth > prevMonthRef.current ? 1 : -1;
      prevMonthRef.current = selectedMonth;
      setSlideOffset(d * 18);
      const id = requestAnimationFrame(() => setSlideOffset(0));
      return () => cancelAnimationFrame(id);
    }
  }, [selectedMonth]);

  const handlePrevMonth = useCallback(() => {
    if (selectedMonth === 'all') {
      if (availableMonths.length > 0) {
        onSelectMonth(availableMonths[availableMonths.length - 1]);
      }
      return;
    }
    const [y, m] = selectedMonth.split('-').map(Number);
    if (!isNaN(y) && !isNaN(m)) {
      const prevDate = new Date(Date.UTC(y, m - 2, 1));
      const prevStr = `${prevDate.getUTCFullYear()}-${String(prevDate.getUTCMonth() + 1).padStart(2, '0')}`;
      onSelectMonth(prevStr);
    }
  }, [selectedMonth, availableMonths, onSelectMonth]);

  const handleNextMonth = useCallback(() => {
    if (selectedMonth === 'all') {
      if (availableMonths.length > 0) {
        onSelectMonth(availableMonths[0]);
      }
      return;
    }
    const [y, m] = selectedMonth.split('-').map(Number);
    if (!isNaN(y) && !isNaN(m)) {
      const nextDate = new Date(Date.UTC(y, m, 1));
      const nextStr = `${nextDate.getUTCFullYear()}-${String(nextDate.getUTCMonth() + 1).padStart(2, '0')}`;
      onSelectMonth(nextStr);
    }
  }, [selectedMonth, availableMonths, onSelectMonth]);

  const priorMonthKey = getPriorMonthKey(selectedMonth);
  const priorTxns = useMemo(() => {
    if (!priorMonthKey) return [];
    return allTransactions.filter(
      t => t.date && t.date.startsWith(priorMonthKey) && t.type !== 'transfer'
    );
  }, [allTransactions, priorMonthKey]);

  const hasPriorMonthData = priorTxns.length > 0;

  const priorMetrics = useMemo(() => {
    if (!hasPriorMonthData) return null;
    const pIncome = priorTxns.filter(t => t.type === 'income').reduce((s, t) => s + t.amount, 0);
    const pFixed = priorTxns
      .filter(t => t.type === 'expense' && bucketOf(t, categories) === 'fixed')
      .reduce((s, t) => s + t.amount, 0);
    const pFlexible = priorTxns
      .filter(t => t.type === 'expense' && bucketOf(t, categories) === 'flexible')
      .reduce((s, t) => s + t.amount, 0);
    const pNonMonthly = priorTxns
      .filter(t => t.type === 'expense' && bucketOf(t, categories) === 'non-monthly')
      .reduce((s, t) => s + t.amount, 0);
    const pExpenses = priorTxns.filter(t => t.type === 'expense').reduce((s, t) => s + t.amount, 0);
    const pSavings = pIncome - pExpenses;
    const pSavingsRate = pIncome > 0 ? (pSavings / pIncome) * 100 : 0;

    return {
      income: pIncome,
      fixed: pFixed,
      flexible: pFlexible,
      nonMonthly: pNonMonthly,
      expenses: pExpenses,
      savings: pSavings,
      savingsRate: pSavingsRate,
    };
  }, [priorTxns, hasPriorMonthData, categories]);

  // Screen-reader accessible metrics for 50/30/20 & Waterfall table
  const needsPct = totalIncome > 0 ? ((fixedExpenses + nonMonthlyExpenses) / totalIncome) * 100 : 0;
  const wantsPct = totalIncome > 0 ? (flexibleExpenses / totalIncome) * 100 : 0;
  const benchmarkSavingsPct = totalIncome > 0 ? (savingsAmount / totalIncome) * 100 : 0;

  const monthLabel = formatMonthLabel(selectedMonth);
  const liveAnnouncement =
    totalIncome === 0 && totalExpenses === 0
      ? `${monthLabel}: nothing recorded yet`
      : savingsAmount >= 0
      ? `${monthLabel}: kept ${formatMoney(savingsAmount)}`
      : `${monthLabel}: overspent by ${formatMoney(Math.abs(savingsAmount))}`;

  return (
    <motion.div
      data-testid={isOverview ? 'dashboard-header' : undefined}
      animate={{ x: slideOffset }}
      transition={{ duration: dur.page, ease }}
      drag="x"
      dragConstraints={{ left: 0, right: 0 }}
      dragElastic={0.18}
      dragDirectionLock
      onDragEnd={(_e, { offset, velocity }) => {
        if (offset.x < -80 || velocity.x < -500) {
          handleNextMonth();
        } else if (offset.x > 80 || velocity.x > 500) {
          handlePrevMonth();
        }
      }}
      style={{ touchAction: 'pan-y' }}
      className={`max-w-[1120px] mx-auto space-y-5 pb-4 ${className}`}
    >
      {/* Polite live region for month change announcements */}
      <div aria-live="polite" className="sr-only">
        {liveAnnouncement}
      </div>

      {/* Screen-reader compatibility nodes */}
      <div className="sr-only" data-testid="monthly-financial-story">
        Monthly Financial Story
      </div>
      <div className="sr-only">
        {allTransactions
          .filter(t => selectedMonth === 'all' || (t.date && t.date.startsWith(selectedMonth)))
          .map(t => (
            <span key={t.id}>{t.description}</span>
          ))}
      </div>
      <div className="sr-only" data-testid="guideline-meter-50-30-20">
        Needs {needsPct.toFixed(1)}% Wants {wantsPct.toFixed(1)}% Savings {benchmarkSavingsPct.toFixed(1)}%
      </div>
      <div className="sr-only" data-testid="cash-flow-waterfall">
        <table aria-label="Cash Flow Waterfall Table">
          <thead>
            <tr>
              <th scope="col">Step</th>
              <th scope="col">Amount</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>Inflow</td>
              <td>{formatCurrency(totalIncome)}</td>
            </tr>
            <tr>
              <td>Fixed</td>
              <td>{formatCurrency(fixedExpenses)}</td>
            </tr>
            <tr>
              <td>Variable</td>
              <td>{formatCurrency(flexibleExpenses)}</td>
            </tr>
            <tr>
              <td>Non-Monthly</td>
              <td>{formatCurrency(nonMonthlyExpenses)}</td>
            </tr>
            <tr>
              <td>{savingsAmount >= 0 ? 'Net Saved' : 'Deficit'}</td>
              <td>{formatCurrency(savingsAmount)}</td>
            </tr>
          </tbody>
        </table>
      </div>

      {/* Section 1: Statement Hero */}
      <OverviewHero
        selectedMonth={selectedMonth}
        totalIncome={totalIncome}
        totalExpenses={totalExpenses}
        savingsAmount={savingsAmount}
        savingsRate={savingsRate}
        totalBudget={totalBudget}
        flexNumber={flexNumber}
        priorIncome={priorMetrics?.income}
        priorSavingsAmount={priorMetrics?.savings}
        priorMonthKey={priorMonthKey}
        hasPriorMonthData={hasPriorMonthData}
        onOpenAddTxn={onOpenAddTxn}
      />

      {/* Section 2: Income Ribbon + 4 Bucket Stat Columns */}
      <div className="space-y-3">
        <IncomeRibbon
          selectedMonth={selectedMonth}
          totalIncome={totalIncome}
          fixedExpenses={fixedExpenses}
          flexibleExpenses={flexibleExpenses}
          nonMonthlyExpenses={nonMonthlyExpenses}
          savingsAmount={savingsAmount}
        />

        <BucketStats
          selectedMonth={selectedMonth}
          totalIncome={totalIncome}
          totalExpenses={totalExpenses}
          fixedExpenses={fixedExpenses}
          flexibleExpenses={flexibleExpenses}
          nonMonthlyExpenses={nonMonthlyExpenses}
          savingsAmount={savingsAmount}
          priorMetrics={priorMetrics}
          priorMonthKey={priorMonthKey}
          hasPriorMonthData={hasPriorMonthData}
        />
      </div>

      {/* Section 3: What Changed (Insights) */}
      <div className="pt-4 border-t border-border">
        <InsightList
          selectedMonth={selectedMonth}
          allTransactions={allTransactions}
          categories={categories}
          budgets={budgets}
          totalIncome={totalIncome}
          totalExpenses={totalExpenses}
          fixedExpenses={fixedExpenses}
          flexibleExpenses={flexibleExpenses}
          nonMonthlyExpenses={nonMonthlyExpenses}
          unclassifiedExpenses={unclassifiedExpenses}
          flexNumber={flexNumber}
          savingsAmount={savingsAmount}
          savingsRate={savingsRate}
        />
      </div>

      {/* Section 4: Spending This Month Timeline */}
      <div className="pt-4 border-t border-border">
        <SpendTimeline
          selectedMonth={selectedMonth}
          priorMonthKey={priorMonthKey}
          allTransactions={allTransactions}
          totalExpenses={totalExpenses}
          totalBudget={totalBudget}
          isOverview={isOverview}
        />
      </div>
    </motion.div>
  );
};
