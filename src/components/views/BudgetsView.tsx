import { useState, useMemo, useEffect } from 'react';
import {
  BudgetUtilization,
  CategorySummary,
  PieSegment,
} from '../dashboard/BudgetUtilization';
import {
  Budget,
  BudgetNote,
  Category,
  SpendingBucket,
  Transaction,
} from '../../services/storage';
import {
  computeBucketBudgets,
  computeSafeToSpendRunway,
  getMonthPhase,
} from '../../utils/metrics';
import {
  computeBudgetReconciliation,
  countActiveTransactionMonths,
} from '../../utils/budgetPlanning';
import type { CategorySpendingHistoryEntry } from '../../utils/budgetPlanning';
import { BudgetsHeaderBar } from '../budgets/BudgetsHeaderBar';

export interface BudgetsViewProps {
  month: string;
  categorySummary: CategorySummary[];
  piePaths?: { segments: PieSegment[]; totalPieExpense: number };
  budgetErrors?: Record<string, string>;
  budgetDrafts?: Record<string, string>;
  onBudgetInputChange?: (catName: string, val: string) => void;
  onSaveBudgets?: () => void;
  onDiscardBudgetChanges?: () => void;
  onApplyBudgetPreset?: (catId: string, amount: number) => void;
  onAutoFillFromHistory?: () => number;
  onOpenCategoryManager?: () => void;
  budgetNotes?: Record<string, BudgetNote>;
  spendingHistory?: Record<string, CategorySpendingHistoryEntry>;
  onSaveBudgetNote?: (
    month: string,
    keyId: string,
    text: string,
    mood?: string
  ) => Promise<void>;
  onDeleteBudgetNote?: (month: string, keyId: string) => Promise<void>;
  isLockedMonth?: boolean;
  totalBudget?: number;
  totalSpent?: number;
  totalIncome?: number;
  flexibleExpenses?: number;
  flexNumber?: number;
  savingsAmount?: number;
  allTransactions?: Transaction[];
  categories?: Category[];
  workingBudgets?: Budget[];
  committedBudgetMap?: Map<string, number>;
  activeMonthsCount?: number;
  isDirty?: boolean;
  dirtyCount?: number;
  availableMonths?: string[];
  onSelectMonth?: (m: string) => void;
}

export function BudgetsView({
  month,
  categorySummary,
  piePaths,
  budgetErrors = {},
  budgetDrafts = {},
  onBudgetInputChange,
  onSaveBudgets,
  onDiscardBudgetChanges,
  onApplyBudgetPreset,
  onAutoFillFromHistory,
  onOpenCategoryManager,
  budgetNotes = {},
  spendingHistory = {},
  onSaveBudgetNote,
  onDeleteBudgetNote,
  isLockedMonth = false,
  totalBudget = 0,
  totalSpent = 0,
  totalIncome = 0,
  flexibleExpenses = 0,
  flexNumber = 0,
  savingsAmount = 0,
  allTransactions = [],
  categories = [],
  workingBudgets = [],
  committedBudgetMap,
  activeMonthsCount,
  isDirty = false,
  dirtyCount = 0,
}: BudgetsViewProps) {
  const [activeBucketTab, setActiveBucketTab] = useState<'all' | SpendingBucket>('all');

  const phaseInfo = useMemo(() => getMonthPhase(month), [month]);

  const effectiveActiveMonths = useMemo(() => {
    if (activeMonthsCount !== undefined) return activeMonthsCount;
    return countActiveTransactionMonths(allTransactions);
  }, [activeMonthsCount, allTransactions]);

  const reconciliation = useMemo(
    () =>
      computeBudgetReconciliation(
        categorySummary,
        totalSpent,
        month,
        effectiveActiveMonths
      ),
    [categorySummary, totalSpent, month, effectiveActiveMonths]
  );

  const bucketBudgets = useMemo(() => {
    if (workingBudgets.length > 0 || categories.length > 0) {
      return computeBucketBudgets(workingBudgets, categories);
    }
    let fixedBudget = 0;
    let variableBudget = 0;
    let nonMonthlyBudget = 0;
    for (const c of categorySummary) {
      if (c.isNonBudgetable || c.budget <= 0) continue;
      if (c.bucket === 'fixed') fixedBudget += c.budget;
      else if (c.bucket === 'non-monthly') nonMonthlyBudget += c.budget;
      else variableBudget += c.budget;
    }
    return {
      fixedBudget,
      variableBudget,
      nonMonthlyBudget,
      totalBudget: fixedBudget + variableBudget + nonMonthlyBudget,
    };
  }, [workingBudgets, categories, categorySummary]);

  const runway = useMemo(
    () =>
      computeSafeToSpendRunway({
        selectedMonth: month,
        phaseInfo,
        totalIncome,
        totalExpenses: totalSpent,
        flexibleExpenses,
        flexNumber,
        savingsAmount,
        variableBudget: bucketBudgets.variableBudget,
        activeMonthsCount: effectiveActiveMonths,
      }),
    [
      month,
      phaseInfo,
      totalIncome,
      totalSpent,
      flexibleExpenses,
      flexNumber,
      savingsAmount,
      bucketBudgets.variableBudget,
      effectiveActiveMonths,
    ]
  );

  // Scoped ⌘S / Ctrl+S keyboard shortcut while mounted on #/budgets
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 's') {
        e.preventDefault();
        if (!isLockedMonth || month === 'all') {
          onSaveBudgets?.();
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isLockedMonth, month, onSaveBudgets]);

  const handleUnbudgetedCalloutClick = () => {
    setActiveBucketTab('all');
    const firstId = reconciliation.unbudgetedCategoryIds[0];
    if (!firstId) return;
    const focusUnbudgetedRow = (): boolean => {
      const rowEl = document.getElementById(`budget-row-${firstId}`);
      if (!rowEl) return false;
      rowEl.scrollIntoView?.({ block: 'center', behavior: 'smooth' });
      if (!isLockedMonth || month === 'all') {
        const inputEl = rowEl.querySelector<HTMLInputElement>(
          'input[data-testid^="budget-input-"]'
        );
        if (inputEl && !inputEl.disabled) {
          inputEl.focus({ preventScroll: true });
          try {
            inputEl.select();
          } catch {
            // Safe fallback on input[type="number"]
          }
        }
      }
      return true;
    };
    requestAnimationFrame(() => {
      if (!focusUnbudgetedRow()) {
        window.setTimeout(focusUnbudgetedRow, 30);
      }
    });
  };

  return (
    <div
      className="max-w-[1040px] mx-auto space-y-2 sm:space-y-3 pb-8"
      data-testid="budgets-workspace"
    >
      <BudgetsHeaderBar
        month={month}
        phaseInfo={phaseInfo}
        totalBudget={totalBudget}
        totalIncome={totalIncome}
        reconciliation={reconciliation}
        runway={runway}
        isLockedMonth={isLockedMonth}
        isDirty={isDirty}
        dirtyCount={dirtyCount}
        onOpenCategoryManager={onOpenCategoryManager}
        onSaveBudgets={onSaveBudgets}
        onDiscardBudgets={onDiscardBudgetChanges}
        onUnbudgetedCalloutClick={handleUnbudgetedCalloutClick}
      />

      <BudgetUtilization
        categorySummary={categorySummary}
        piePaths={piePaths}
        budgetErrors={budgetErrors}
        budgetDrafts={budgetDrafts}
        handleBudgetInputChange={onBudgetInputChange}
        handleSaveBudgets={onSaveBudgets}
        onOpenCategoryManager={onOpenCategoryManager}
        selectedMonth={month}
        phaseInfo={phaseInfo}
        activeMonthsCount={effectiveActiveMonths}
        committedBudgetMap={committedBudgetMap}
        budgetNotes={budgetNotes}
        spendingHistory={spendingHistory}
        handleSaveBudgetNote={onSaveBudgetNote}
        handleDeleteBudgetNote={onDeleteBudgetNote}
        onApplyBudgetPreset={onApplyBudgetPreset}
        onAutoFillFromHistory={onAutoFillFromHistory}
        isLockedMonth={isLockedMonth}
        hideTopActionBar={true}
        activeBucketTab={activeBucketTab}
        onActiveBucketTabChange={setActiveBucketTab}
      />
    </div>
  );
}

export default BudgetsView;
