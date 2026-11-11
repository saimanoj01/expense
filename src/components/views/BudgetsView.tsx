import { BudgetUtilization, CategorySummary, PieSegment } from '../dashboard/BudgetUtilization';
import { BudgetNote } from '../../services/storage';
import { formatCurrency } from '../../utils/formatters';

export interface BudgetsViewProps {
  month: string;
  categorySummary: CategorySummary[];
  piePaths?: { segments: PieSegment[]; totalPieExpense: number };
  budgetErrors?: Record<string, string>;
  budgetDrafts?: Record<string, string>;
  onBudgetInputChange?: (catName: string, val: string) => void;
  onSaveBudgets?: () => void;
  onOpenCategoryManager?: () => void;
  budgetNotes?: Record<string, BudgetNote>;
  spendingHistory?: Record<string, { lastMonth: number; avg3mo: number }>;
  onSaveBudgetNote?: (month: string, keyId: string, text: string, mood?: string) => Promise<void>;
  onDeleteBudgetNote?: (month: string, keyId: string) => Promise<void>;
  isLockedMonth?: boolean;
  totalBudget?: number;
  totalSpent?: number;
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
  onOpenCategoryManager,
  budgetNotes = {},
  spendingHistory = {},
  onSaveBudgetNote,
  onDeleteBudgetNote,
  isLockedMonth = false,
  totalBudget = 0,
  totalSpent = 0,
}: BudgetsViewProps) {
  const percentUsed = totalBudget > 0 ? (totalSpent / totalBudget) * 100 : 0;
  const remaining = totalBudget - totalSpent;

  return (
    <div className="max-w-[920px] mx-auto space-y-6 pb-8" data-testid="budgets-workspace">
      {/* Clean Statement Header */}
      <div className="space-y-3">
        <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
          <div>
            <h1 className="text-title text-foreground">Budgets</h1>
            <p className="text-label text-muted-foreground mt-0.5">
              Monthly category targets and utilization for {month}
            </p>
          </div>

          {/* Summary Tnum Columns */}
          <div className="flex items-center gap-6">
            <div>
              <span className="text-label text-muted-foreground block">Target</span>
              <p
                data-testid="kpi-total-budget"
                className="text-heading font-semibold tabular-nums num text-foreground"
              >
                {formatCurrency(totalBudget)}
              </p>
            </div>
            <div>
              <span className="text-label text-muted-foreground block">Spent</span>
              <p className="text-heading font-semibold tabular-nums num text-foreground">
                {formatCurrency(totalSpent)}
              </p>
            </div>
            <div>
              <span className="text-label text-muted-foreground block">Remaining</span>
              <p
                className={`text-heading font-semibold tabular-nums num ${
                  remaining >= 0 ? 'text-bucket-saved' : 'text-negative'
                }`}
              >
                {formatCurrency(remaining)}
              </p>
            </div>
          </div>
        </div>

        {/* 6px Progress Bar */}
        {totalBudget > 0 && (
          <div className="space-y-1">
            <div className="h-1.5 w-full bg-surface2 rounded-full overflow-hidden">
              <div
                className={`h-full rounded-full transition-all duration-300 ${
                  percentUsed > 100 ? 'bg-negative' : 'bg-foreground'
                }`}
                style={{ width: `${Math.min(percentUsed, 100)}%` }}
              />
            </div>
            <div className="flex items-center justify-between text-label text-muted-foreground tabular-nums num">
              <span>Overall target utilization</span>
              <span className="font-medium text-foreground">{percentUsed.toFixed(0)}%</span>
            </div>
          </div>
        )}
      </div>

      {/* Budget List & Utilization */}
      <BudgetUtilization
        categorySummary={categorySummary}
        piePaths={piePaths}
        budgetErrors={budgetErrors}
        budgetDrafts={budgetDrafts}
        handleBudgetInputChange={onBudgetInputChange}
        handleSaveBudgets={onSaveBudgets}
        onOpenCategoryManager={onOpenCategoryManager}
        selectedMonth={month}
        budgetNotes={budgetNotes}
        spendingHistory={spendingHistory}
        handleSaveBudgetNote={onSaveBudgetNote}
        handleDeleteBudgetNote={onDeleteBudgetNote}
        isLockedMonth={isLockedMonth}
      />
    </div>
  );
}

export default BudgetsView;
