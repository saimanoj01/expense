import React, { useMemo, useEffect } from 'react';
import { Printer, AlertTriangle } from 'lucide-react';
import { Project, Transaction, Category } from '../../services/storage';
import { formatCurrency } from '../../utils/formatters';
import { computeMonthMetrics } from '../../utils/metrics';
import { MonthSwitcher } from './MonthSwitcher';
import { HeroSavingsCard } from './HeroSavingsCard';
import { IncomeAllocationRing } from './IncomeAllocationRing';
import { BucketSummaryCards } from './BucketSummaryCards';
import { StoryNarrativeCard } from './StoryNarrativeCard';

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
  selectedBucket?: 'income' | 'fixed' | 'flexible' | 'non-monthly' | null;
  onSelectBucket?: (b: 'income' | 'fixed' | 'flexible' | 'non-monthly' | null) => void;
  onOpenReport?: () => void;
  onOpenShare?: () => void;
  onCsvFileUpload?: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onOpenCategoryManager?: () => void;
  onOpenAddTxn?: () => void;
  isLockedMonth?: boolean;
  onLockMonth?: () => void;
  onUnlockMonth?: () => void;
  onOpenBackfill?: () => void;
  isCanonicalOverview?: boolean;
  className?: string;
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

// Module-level set to prevent duplicate confetti bursts within the same app session
const firedConfettiKeys = new Set<string>();

export const Level1MonthOverview: React.FC<Level1MonthOverviewProps> = ({
  selectedMonth,
  availableMonths,
  onSelectMonth,
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
  onOpenReport,
  onOpenShare,
  onCsvFileUpload,
  onOpenCategoryManager,
  onOpenAddTxn,
  isLockedMonth = false,
  onLockMonth,
  onUnlockMonth,
  onOpenBackfill,
  isCanonicalOverview: _isCanonicalOverview = true,
  className = ''
}) => {
  // Prior Month Metrics & MoM Deltas
  const priorMonthKey = getPriorMonthKey(selectedMonth);
  const priorTxns = useMemo(() => {
    if (!priorMonthKey) return [];
    return allTransactions.filter(t => t.date && t.date.startsWith(priorMonthKey) && t.type !== 'transfer');
  }, [allTransactions, priorMonthKey]);

  const hasPriorMonthData = priorTxns.length > 0;

  const priorMetrics = useMemo(() => {
    if (!hasPriorMonthData || !priorMonthKey) return null;
    return computeMonthMetrics(allTransactions, priorMonthKey, categories);
  }, [allTransactions, priorMonthKey, hasPriorMonthData, categories]);

  // Confetti celebration on high savings rate
  useEffect(() => {
    if (selectedMonth === 'all') return;
    if (savingsRate <= 20 || savingsAmount <= 0) return;

    const prefersReducedMotion =
      typeof window !== 'undefined' &&
      window.matchMedia &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (prefersReducedMotion) return;

    // NEVER trigger during drill-down navigation
    if (typeof window !== 'undefined' && window.location.hash) {
      const hash = window.location.hash.toLowerCase();
      if (hash.includes('/bucket/') || hash.includes('/category/') || hash.includes('/transactions')) {
        return;
      }
    }

    const projectId = activeProject?.id || 'default';
    const storageKey = `expense_confetti_${projectId}_${selectedMonth}`;
    if (typeof window !== 'undefined' && window.localStorage.getItem(storageKey)) return;
    if (firedConfettiKeys.has(storageKey)) return;

    firedConfettiKeys.add(storageKey);
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

  return (
    <div
      data-testid="dashboard-header"
      className={`space-y-2.5 mb-4 ${className}`}
    >
      {/* Top Controls Bar: Clean Month Switcher & Quick Actions */}
      <div className="flex flex-wrap items-center justify-between gap-2.5 p-1 rounded-2xl">
        <div className="flex items-center gap-2">
          <MonthSwitcher
            selectedMonth={selectedMonth}
            availableMonths={availableMonths}
            onSelectMonth={onSelectMonth}
            className="border-0 shadow-none bg-transparent p-0"
          />
          <span
            data-testid="monthly-financial-story"
            className="hidden xl:inline-block px-2.5 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider bg-primary/10 text-primary border border-primary/20"
          >
            Monthly Financial Story
          </span>
        </div>

        <div className="flex flex-wrap items-center gap-1.5">
          {onOpenCategoryManager && (
            <button
              type="button"
              data-testid="open-add-category-btn"
              onClick={onOpenCategoryManager}
              className="px-2.5 py-1.5 rounded-xl bg-card hover:bg-secondary border border-border/60 text-xs font-semibold text-muted-foreground hover:text-foreground transition-all"
            >
              Categories
            </button>
          )}
          {onOpenShare && (
            <button
              type="button"
              data-testid="share-project-btn"
              onClick={onOpenShare}
              className="px-2.5 py-1.5 rounded-xl bg-card hover:bg-secondary border border-border/60 text-xs font-semibold text-muted-foreground hover:text-foreground transition-all"
            >
              Share
            </button>
          )}
          {!isLockedMonth && onCsvFileUpload && (
            <label
              data-testid="import-csv-trigger-btn"
              className="px-2.5 py-1.5 rounded-xl bg-card hover:bg-secondary border border-border/60 text-xs font-semibold text-muted-foreground hover:text-foreground transition-all cursor-pointer inline-block"
            >
              Import CSV
              <input
                type="file"
                accept=".csv"
                data-testid="csv-file-input"
                className="hidden"
                onChange={onCsvFileUpload}
                onClick={(e: React.MouseEvent<HTMLInputElement>) => {
                  (e.target as HTMLInputElement).value = '';
                }}
              />
            </label>
          )}
          {!isLockedMonth && onOpenAddTxn && (
            <button
              type="button"
              data-testid="open-add-transaction-btn"
              onClick={onOpenAddTxn}
              className="px-2.5 py-1.5 rounded-xl bg-primary hover:bg-primary/90 text-primary-foreground text-xs font-semibold transition-all"
            >
              Add Record
            </button>
          )}
          {selectedMonth !== 'all' &&
            (isLockedMonth ? (
              <div className="inline-flex items-center gap-1">
                <span
                  data-testid="lock-status-indicator"
                  className="px-2 py-1 rounded-lg bg-amber-500/10 text-amber-500 text-xs font-semibold"
                >
                  Locked
                </span>
                {onUnlockMonth && (
                  <button
                    type="button"
                    data-testid="unlock-month-btn"
                    onClick={onUnlockMonth}
                    className="px-2.5 py-1.5 rounded-xl bg-card hover:bg-secondary border border-border/60 text-xs font-semibold text-muted-foreground hover:text-foreground transition-all"
                  >
                    Unlock
                  </button>
                )}
              </div>
            ) : (
              onLockMonth && (
                <button
                  type="button"
                  data-testid="lock-month-btn"
                  onClick={onLockMonth}
                  className="px-2.5 py-1.5 rounded-xl bg-card hover:bg-secondary border border-border/60 text-xs font-semibold text-muted-foreground hover:text-foreground transition-all"
                >
                  Lock
                </button>
              )
            ))}

          {onOpenReport && (
            <button
              type="button"
              onClick={onOpenReport}
              data-testid="story-print-report-btn"
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-card hover:bg-secondary border border-border/60 text-xs font-semibold transition-all text-muted-foreground hover:text-foreground active:scale-95 shadow-sm"
              title="Print or export monthly financial report"
            >
              <Printer className="w-3.5 h-3.5 text-primary" />
              <span>Report</span>
            </button>
          )}
        </div>
      </div>

      {/* Unclassified Warning Banner */}
      {unclassifiedCount > 0 && (
        <div className="p-2.5 rounded-2xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-between gap-3 text-xs">
          <div className="flex items-center gap-2 text-amber-500 font-semibold">
            <AlertTriangle className="w-4 h-4 shrink-0" />
            <span>⚠️ {unclassifiedCount} transaction{unclassifiedCount > 1 ? 's' : ''} ({formatCurrency(unclassifiedExpenses)}) unclassified</span>
          </div>
          {onOpenBackfill && (
            <button
              type="button"
              onClick={onOpenBackfill}
              className="px-2.5 py-1 rounded-xl bg-amber-500 text-white font-bold hover:bg-amber-600 transition-colors shadow-sm"
            >
              Classify Now
            </button>
          )}
        </div>
      )}

      {/* Row 1: The Hero Row (Hero Savings Card + Income Allocation Ring) */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-2.5">
        <HeroSavingsCard
          savingsAmount={savingsAmount}
          savingsRate={savingsRate}
          totalIncome={totalIncome}
          totalExpenses={totalExpenses}
          totalBudget={totalBudget}
          flexNumber={flexNumber}
          priorSavingsAmount={priorMetrics?.savings}
          hasPriorMonthData={hasPriorMonthData}
        />

        <IncomeAllocationRing
          totalIncome={totalIncome}
          fixedExpenses={fixedExpenses}
          flexibleExpenses={flexibleExpenses}
          nonMonthlyExpenses={nonMonthlyExpenses}
          savingsAmount={savingsAmount}
        />
      </div>

      {/* Row 2: Morphing 4 Bucket Cards */}
      <BucketSummaryCards
        totalIncome={totalIncome}
        totalExpenses={totalExpenses}
        fixedExpenses={fixedExpenses}
        flexibleExpenses={flexibleExpenses}
        nonMonthlyExpenses={nonMonthlyExpenses}
        selectedBucket={selectedBucket}
        onSelectBucket={onSelectBucket}
        priorMetrics={priorMetrics}
        hasPriorMonthData={hasPriorMonthData}
      />

      {/* Row 3: Narrative & 50/30/20 Benchmarks */}
      <div className="w-full">
        <StoryNarrativeCard
          selectedMonth={selectedMonth}
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
    </div>
  );
};
