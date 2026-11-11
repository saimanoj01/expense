import React, { useMemo, useRef, useEffect, useState } from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import type { Project, Transaction, Category, Budget } from '../../services/storage';
import { useNavigation } from '../../hooks/useNavigation';
import {
  computeBucketBudgets,
  computeMonthMetrics,
  computePriorComparisonWindow,
  getMonthPhase,
  pickDefaultLandingMonth,
} from '../../utils/metrics';
import type { CategorySummaryItem } from '../../utils/overviewCategories';
import { isTransactionNeedsReview } from '../../utils/transactionTaxonomy';
import { dur, ease } from '../../theme/motion';
import { OverviewTriageStrip } from '../overview/OverviewTriageStrip';
import { OverviewHero } from '../overview/OverviewHero';
import { IncomeRibbon } from '../overview/IncomeRibbon';
import { BucketStats } from '../overview/BucketStats';
import { SpendTimeline } from '../overview/SpendTimeline';
import { CategoryWatchlist } from '../overview/CategoryWatchlist';
import { InsightList } from '../overview/InsightList';
import { RecentActivityCard } from '../overview/RecentActivityCard';

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
  categorySummary?: CategorySummaryItem[];
  duplicateTxnIds?: Set<string>;
  isLockedMonth?: boolean;
  isMockMode?: boolean;
  selectedBucket?: 'income' | 'fixed' | 'flexible' | 'non-monthly' | null;
  onSelectBucket?: (b: 'income' | 'fixed' | 'flexible' | 'non-monthly' | null) => void;
  onOpenBackfill?: () => void;
  onClassifyBuckets?: () => void;
  onOpenAddTxn?: () => void;
  onEditTxn?: (txn: Transaction) => void;
  onOpenCsvWizard?: () => void;
  onLoadSampleData?: () => void;
  onLockMonth?: () => void;
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
  totalBudget: propTotalBudget = 0,
  totalExpenses,
  totalIncome,
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
  budgets = [],
  categorySummary = [],
  duplicateTxnIds,
  isLockedMonth = false,
  isMockMode = false,
  onClassifyBuckets,
  onOpenAddTxn,
  onEditTxn,
  onOpenCsvWizard,
  onLoadSampleData,
  onLockMonth,
  className = '',
}) => {
  const { currentRoute } = useNavigation();
  const isOverview = currentRoute.view === 'overview';
  const reducedMotion = useReducedMotion();
  const prevMonthRef = useRef(selectedMonth);
  const [slideOffset, setSlideOffset] = useState(0);

  const phaseInfo = useMemo(() => getMonthPhase(selectedMonth), [selectedMonth]);

  const bucketBudgets = useMemo(
    () => computeBucketBudgets(budgets, categories),
    [budgets, categories]
  );

  const effectiveTotalBudget =
    propTotalBudget > 0 ? propTotalBudget : bucketBudgets.totalBudget;

  useEffect(() => {
    if (prevMonthRef.current !== selectedMonth) {
      const d = selectedMonth > prevMonthRef.current ? 1 : -1;
      prevMonthRef.current = selectedMonth;
      if (reducedMotion) {
        setSlideOffset(0);
        return;
      }
      setSlideOffset(d * 18);
      const id = requestAnimationFrame(() => setSlideOffset(0));
      return () => cancelAnimationFrame(id);
    }
  }, [selectedMonth, reducedMotion]);

  const priorMonthKey = getPriorMonthKey(selectedMonth);

  const compWindow = useMemo(
    () =>
      computePriorComparisonWindow(allTransactions, selectedMonth, priorMonthKey),
    [allTransactions, selectedMonth, priorMonthKey]
  );

  // Same-day MTD comparison on active month vs full prior month on closed month (BUG-08, QA-BUG-02, QA-BUG-06)
  const { priorComparisonMetrics, priorComparisonLabel } = useMemo(() => {
    if (!compWindow.hasPriorMonthData || !priorMonthKey) {
      return { priorComparisonMetrics: null, priorComparisonLabel: null };
    }

    const base = computeMonthMetrics(
      allTransactions,
      priorMonthKey,
      categories,
      compWindow.compMaxDay !== undefined ? { maxDay: compWindow.compMaxDay } : undefined
    );

    return {
      priorComparisonMetrics: base,
      priorComparisonLabel: compWindow.label,
    };
  }, [compWindow, priorMonthKey, allTransactions, categories]);

  const { activeMonthsCount, latestMonthWithData, reviewCount, hasRecordedActivity } =
    useMemo(() => {
      const txMonths = new Set<string>();
      let revCount = 0;
      let monthTxCount = 0;

      for (const t of allTransactions) {
        if (t.type === 'transfer') continue;
        if (t.date && t.date.length >= 7) {
          const mk = t.date.slice(0, 7);
          if (/^\d{4}-\d{2}$/.test(mk)) txMonths.add(mk);
        }
        const inSelected =
          selectedMonth === 'all' || (t.date && t.date.startsWith(selectedMonth));
        if (inSelected) {
          monthTxCount += 1;
          if (isTransactionNeedsReview(t, duplicateTxnIds)) {
            revCount += 1;
          }
        }
      }

      const txMonthArr = Array.from(txMonths);
      const latest =
        txMonthArr.length > 0
          ? pickDefaultLandingMonth(txMonthArr, phaseInfo.currentLocalMonth)
          : null;

      return {
        activeMonthsCount: txMonthArr.length,
        latestMonthWithData: latest,
        reviewCount: revCount,
        hasRecordedActivity: monthTxCount > 0,
      };
    }, [allTransactions, selectedMonth, duplicateTxnIds, phaseInfo.currentLocalMonth]);

  return (
    <motion.div
      data-testid={isOverview ? 'level1-month-overview' : undefined}
      animate={{ x: reducedMotion ? 0 : slideOffset }}
      transition={reducedMotion ? { duration: 0 } : { duration: dur.page, ease }}
      className={`max-w-[1120px] mx-auto space-y-3.5 pb-2 ${className}`}
    >
      {/* Zone 1: Conditional Triage Strip (0px when Inbox-Zero) */}
      {isOverview && (
        <OverviewTriageStrip
          selectedMonth={selectedMonth}
          phase={phaseInfo.phase}
          reviewCount={reviewCount}
          unclassifiedCount={unclassifiedCount}
          isLockedMonth={isLockedMonth}
          hasRecordedActivity={hasRecordedActivity}
          onClassifyBuckets={onClassifyBuckets}
          onLockMonth={onLockMonth}
        />
      )}

      {/* Zone 2: Statement Hero + Safe-to-Spend Runway */}
      <OverviewHero
        selectedMonth={selectedMonth}
        phaseInfo={phaseInfo}
        totalIncome={totalIncome}
        totalExpenses={totalExpenses}
        flexibleExpenses={flexibleExpenses}
        savingsAmount={savingsAmount}
        savingsRate={savingsRate}
        totalBudget={effectiveTotalBudget}
        variableBudget={bucketBudgets.variableBudget}
        flexNumber={flexNumber}
        activeMonthsCount={activeMonthsCount}
        latestMonthWithData={latestMonthWithData}
        priorSavingsAmount={priorComparisonMetrics?.savings}
        priorComparisonLabel={priorComparisonLabel}
        hasPriorMonthData={compWindow.hasPriorMonthData}
        isLockedMonth={isLockedMonth}
        isMockMode={isMockMode}
        onOpenAddTxn={onOpenAddTxn}
        onOpenCsvWizard={onOpenCsvWizard}
        onLoadSampleData={onLoadSampleData}
        onSelectMonth={onSelectMonth}
      />

      {/* Zone 3: Income Allocation Ribbon + 5 Bucket Stat Columns */}
      <div className="space-y-2">
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
          fixedBudget={bucketBudgets.fixedBudget}
          variableBudget={bucketBudgets.variableBudget}
          suppressMomDelta={!hasRecordedActivity || phaseInfo.phase === 'future'}
          priorMetrics={priorComparisonMetrics}
          priorMonthKey={priorMonthKey}
          priorComparisonLabel={priorComparisonLabel}
          hasPriorMonthData={compWindow.hasPriorMonthData}
        />
      </div>

      {/* Zone 4: Spending Pace Timeline */}
      <div className="pt-3 border-t border-border">
        <SpendTimeline
          selectedMonth={selectedMonth}
          availableMonths={availableMonths}
          priorMonthKey={priorMonthKey}
          allTransactions={allTransactions}
          categories={categories}
          totalExpenses={totalExpenses}
          totalBudget={effectiveTotalBudget}
          variableBudget={bucketBudgets.variableBudget}
          isOverview={isOverview}
        />
      </div>

      {/* Zone 5: 2-Column Decision & Activity Grid */}
      {isOverview && (
        <div className="pt-3 border-t border-border grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">
          <div className="lg:col-span-6 space-y-2.5 min-w-0">
            <CategoryWatchlist
              selectedMonth={selectedMonth}
              phaseInfo={phaseInfo}
              categorySummary={categorySummary}
            />
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

          <div className="lg:col-span-6 min-w-0">
            <RecentActivityCard
              selectedMonth={selectedMonth}
              allTransactions={allTransactions}
              categories={categories}
              duplicateTxnIds={duplicateTxnIds}
              isLockedMonth={isLockedMonth}
              onEditTxn={onEditTxn}
              onOpenAddTxn={onOpenAddTxn}
            />
          </div>
        </div>
      )}
    </motion.div>
  );
};
