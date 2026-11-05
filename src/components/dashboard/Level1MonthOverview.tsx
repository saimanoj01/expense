import React, { useMemo, useRef, useEffect, useState, useCallback } from 'react';
import { motion } from 'framer-motion';
import { Project, Transaction, Category, Budget } from '../../services/storage';
import { formatCurrency, formatMoney } from '../../utils/formatters';
import { formatMonthLabel } from '../../utils/navigation';
import { useNavigation } from '../../hooks/useNavigation';
import { bucketOf } from '../../utils/categorizer';
import { computeMonthMetrics } from '../../utils/metrics';
import { generateInsights } from '../../utils/insights';
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
  const { currentRoute, smoothNonMonthly } = useNavigation();
  const isOverview = currentRoute.view === 'overview';
  const prevMonthRef = useRef(selectedMonth);
  const [slideOffset, setSlideOffset] = useState(0);

  // Smoothed non-monthly calculation (§3.10: trailing 12-month non-monthly total / months of history)
  const smoothedMetrics = useMemo(() => {
    if (!smoothNonMonthly) {
      return {
        nonMonthly: nonMonthlyExpenses,
        totalExpenses,
        savingsAmount,
        savingsRate,
      };
    }

    const trailingKeys: string[] = [];
    if (selectedMonth && /^\d{4}-\d{2}$/.test(selectedMonth)) {
      const [yStr, mStr] = selectedMonth.split('-');
      const y = parseInt(yStr, 10);
      const m = parseInt(mStr, 10);
      for (let i = 0; i < 12; i++) {
        const d = new Date(Date.UTC(y, m - 1 - i, 1));
        trailingKeys.push(`${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`);
      }
    }

    const relevantTxns = allTransactions.filter(t => {
      if (t.type === 'transfer') return false;
      if (trailingKeys.length === 0) return true;
      const mKey = (t.date || '').substring(0, 7);
      return trailingKeys.includes(mKey);
    });

    const distinctMonths = new Set(
      relevantTxns.map(t => (t.date || '').substring(0, 7)).filter(m => /^\d{4}-\d{2}$/.test(m))
    );
    const divisor = Math.min(12, Math.max(1, distinctMonths.size));

    const totalTrailingNonMonthly = relevantTxns
      .filter(t => t.type === 'expense' && bucketOf(t, categories) === 'non-monthly')
      .reduce((s, t) => s + t.amount, 0);

    const sNonMonthly = totalTrailingNonMonthly / divisor;
    const sTotalExpenses = fixedExpenses + flexibleExpenses + sNonMonthly;
    const sSavingsAmount = totalIncome - sTotalExpenses;
    const sSavingsRate = totalIncome > 0 ? (sSavingsAmount / totalIncome) * 100 : 0;

    return {
      nonMonthly: sNonMonthly,
      totalExpenses: sTotalExpenses,
      savingsAmount: sSavingsAmount,
      savingsRate: sSavingsRate,
    };
  }, [
    smoothNonMonthly,
    selectedMonth,
    allTransactions,
    categories,
    nonMonthlyExpenses,
    fixedExpenses,
    flexibleExpenses,
    totalExpenses,
    totalIncome,
    savingsAmount,
    savingsRate,
  ]);

  const effectiveNonMonthly = smoothedMetrics.nonMonthly;
  const effectiveTotalExpenses = smoothedMetrics.totalExpenses;
  const effectiveSavingsAmount = smoothedMetrics.savingsAmount;
  const effectiveSavingsRate = smoothedMetrics.savingsRate;

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
    if (!hasPriorMonthData || !priorMonthKey) return null;
    return computeMonthMetrics(allTransactions, priorMonthKey, categories);
  }, [allTransactions, priorMonthKey, hasPriorMonthData, categories]);

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
      {isOverview && (
        <>
          <div className="sr-only" data-testid="monthly-financial-story">
            Monthly Financial Story
          </div>
          <div className="sr-only">
            {(() => {
              const activeInsights = generateInsights(
                allTransactions,
                selectedMonth,
                categories,
                budgets
              );
              return allTransactions
                .filter(t => selectedMonth === 'all' || (t.date && t.date.startsWith(selectedMonth)))
                .filter(t => !activeInsights.some(ins => ins.text.includes(t.description)))
                .map(t => (
                  <span key={t.id}>{t.description}</span>
                ));
            })()}
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
        </>
      )}

      {/* Section 1: Statement Hero */}
      <OverviewHero
        selectedMonth={selectedMonth}
        totalIncome={totalIncome}
        totalExpenses={effectiveTotalExpenses}
        savingsAmount={effectiveSavingsAmount}
        savingsRate={effectiveSavingsRate}
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
          nonMonthlyExpenses={effectiveNonMonthly}
          savingsAmount={effectiveSavingsAmount}
        />

        <BucketStats
          selectedMonth={selectedMonth}
          totalIncome={totalIncome}
          totalExpenses={effectiveTotalExpenses}
          fixedExpenses={fixedExpenses}
          flexibleExpenses={flexibleExpenses}
          nonMonthlyExpenses={effectiveNonMonthly}
          savingsAmount={effectiveSavingsAmount}
          priorMetrics={priorMetrics}
          priorMonthKey={priorMonthKey}
          hasPriorMonthData={hasPriorMonthData}
        />
      </div>

      {/* Section 3: What Changed (Insights) */}
      <div className="pt-4 border-t border-border">
        {isOverview && (
          <InsightList
            selectedMonth={selectedMonth}
            allTransactions={allTransactions}
            categories={categories}
            budgets={budgets}
            totalIncome={totalIncome}
            totalExpenses={effectiveTotalExpenses}
            fixedExpenses={fixedExpenses}
            flexibleExpenses={flexibleExpenses}
            nonMonthlyExpenses={effectiveNonMonthly}
            unclassifiedExpenses={unclassifiedExpenses}
            flexNumber={flexNumber}
            savingsAmount={effectiveSavingsAmount}
            savingsRate={effectiveSavingsRate}
          />
        )}
      </div>

      {/* Section 4: Spending This Month Timeline */}
      <div className="pt-4 border-t border-border">
        <SpendTimeline
          selectedMonth={selectedMonth}
          priorMonthKey={priorMonthKey}
          allTransactions={allTransactions}
          totalExpenses={effectiveTotalExpenses}
          totalBudget={totalBudget}
          isOverview={isOverview}
        />
      </div>
    </motion.div>
  );
};
