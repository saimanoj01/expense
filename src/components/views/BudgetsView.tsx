import { BreadcrumbTrail } from '../layout/BreadcrumbTrail';
import { BudgetUtilization, CategorySummary } from '../dashboard/BudgetUtilization';
import { BudgetNote } from '../../services/storage';
import { Target } from 'lucide-react';
import { formatCurrency } from '../../utils/formatters';

export interface BudgetsViewProps {
  month: string;
  categorySummary: CategorySummary[];
  piePaths?: { segments: Array<{ label?: string; value?: number; color?: string; percent?: number; pathData?: string }>; totalPieExpense: number };
  budgetErrors?: Record<string, string>;
  onBudgetInputChange?: (catName: string, val: string) => void;
  onSaveBudgets?: () => void;
  onOpenAddCategoryModal?: () => void;
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
  onBudgetInputChange,
  onSaveBudgets,
  onOpenAddCategoryModal,
  budgetNotes = {},
  spendingHistory = {},
  onSaveBudgetNote,
  onDeleteBudgetNote,
  isLockedMonth = false,
  totalBudget = 0,
  totalSpent = 0,
  availableMonths: _availableMonths = [],
  onSelectMonth: _onSelectMonth
}: BudgetsViewProps) {
  const percentUsed = totalBudget > 0 ? (totalSpent / totalBudget) * 100 : 0;
  const remaining = totalBudget - totalSpent;

  return (
    <div className="space-y-4" data-testid="budgets-workspace">
      <BreadcrumbTrail className="mb-2" />

      {/* Hero Header */}
      <div className="p-6 rounded-2xl bg-gradient-to-br from-card/80 to-card/40 border border-border backdrop-blur-md shadow-sm">
        <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <div className="p-2 rounded-xl bg-primary/10 text-primary">
                <Target className="w-5 h-5" />
              </div>
              <h1 className="text-xl font-bold tracking-tight text-foreground">
                Budgets & Target Planning
              </h1>
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              Set monthly spending targets, track utilization, and add reflection notes for {month}
            </p>
          </div>

          {/* Quick Summary KPIs */}
          <div className="flex items-center gap-4">
            <div className="text-right">
              <span className="text-[10px] text-muted-foreground uppercase font-semibold">Total Target</span>
              <p className="text-base font-extrabold font-mono tabular-nums text-foreground">
                {formatCurrency(totalBudget)}
              </p>
            </div>
            <div className="h-8 w-px bg-border" />
            <div className="text-right">
              <span className="text-[10px] text-muted-foreground uppercase font-semibold">Actual Spent</span>
              <p className="text-base font-extrabold font-mono tabular-nums text-foreground">
                {formatCurrency(totalSpent)}
              </p>
            </div>
            <div className="h-8 w-px bg-border" />
            <div className="text-right">
              <span className="text-[10px] text-muted-foreground uppercase font-semibold">Remaining</span>
              <p className={`text-base font-extrabold font-mono tabular-nums ${remaining >= 0 ? 'text-emerald-500' : 'text-rose-500'}`}>
                {formatCurrency(remaining)}
              </p>
            </div>
          </div>
        </div>

        {/* Progress Bar */}
        {totalBudget > 0 && (
          <div className="mt-4 pt-3 border-t border-border/60">
            <div className="flex items-center justify-between text-xs mb-1.5 font-medium">
              <span className="text-muted-foreground">Overall Target Utilization</span>
              <span className="font-bold font-mono tabular-nums text-foreground">{percentUsed.toFixed(0)}%</span>
            </div>
            <div className="h-2 w-full bg-muted/40 rounded-full overflow-hidden">
              <div
                className={`h-full rounded-full transition-all duration-500 ${
                  percentUsed > 100 ? 'bg-destructive' : percentUsed > 85 ? 'bg-amber-500' : 'bg-primary'
                }`}
                style={{ width: `${Math.min(percentUsed, 100)}%` }}
              />
            </div>
          </div>
        )}
      </div>

      {/* Budget Grid & Utilization */}
      <BudgetUtilization
        categorySummary={categorySummary}
        piePaths={piePaths}
        budgetErrors={budgetErrors}
        handleBudgetInputChange={onBudgetInputChange}
        handleSaveBudgets={onSaveBudgets}
        setShowAddCatModal={onOpenAddCategoryModal}
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
