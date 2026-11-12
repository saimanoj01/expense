import React from 'react';
import { Plus, Save, RotateCcw, Lock, AlertTriangle } from 'lucide-react';
import { formatCurrency, formatMoney } from '../../utils/formatters';
import {
  formatBudgetAmountCompact,
  formatBudgetPeriodTitle,
  formatLongMonthYear,
} from '../../utils/budgetPlanning';
import type { BudgetReconciliation } from '../../utils/budgetPlanning';
import type { MonthPhaseInfo, SafeToSpendRunway } from '../../utils/metrics';

export interface BudgetsHeaderBarProps {
  month: string;
  phaseInfo: MonthPhaseInfo;
  totalBudget: number;
  totalIncome: number;
  reconciliation: BudgetReconciliation;
  runway: SafeToSpendRunway;
  isLockedMonth: boolean;
  isDirty: boolean;
  dirtyCount: number;
  onOpenCategoryManager?: () => void;
  onSaveBudgets?: () => void;
  onDiscardBudgets?: () => void;
  onUnbudgetedCalloutClick?: () => void;
}

export const BudgetsHeaderBar: React.FC<BudgetsHeaderBarProps> = ({
  month,
  phaseInfo,
  totalBudget,
  totalIncome,
  reconciliation,
  runway,
  isLockedMonth,
  isDirty,
  dirtyCount,
  onOpenCategoryManager,
  onSaveBudgets,
  onDiscardBudgets,
  onUnbudgetedCalloutClick,
}) => {
  const { title, subtitle } = formatBudgetPeriodTitle(
    month,
    reconciliation.activeMonthsCount,
    phaseInfo
  );

  const isSpecificLocked = isLockedMonth && month !== 'all';
  const isAllTime = reconciliation.isAllTime;

  const displayedSpent =
    totalBudget > 0 ? reconciliation.budgetedSpent : reconciliation.effectiveTotalSpent;
  const spentLabel = isAllTime
    ? totalBudget > 0
      ? 'Avg Budgeted / mo'
      : 'Avg Spend / mo'
    : totalBudget > 0
    ? 'Budgeted Spend'
    : 'Total Spend';

  const displayedRemaining = totalBudget > 0 ? reconciliation.budgetedRemaining : 0;
  const isZeroActivityEmpty =
    totalBudget === 0 ||
    (!isAllTime && reconciliation.effectiveTotalSpent === 0 && totalIncome === 0);

  const remainingToneClass =
    totalBudget === 0
      ? 'text-muted-foreground'
      : displayedRemaining < 0
      ? 'text-negative'
      : isZeroActivityEmpty
      ? 'text-foreground'
      : 'text-bucket-saved';

  const overallPaceTickPct =
    phaseInfo.phase === 'current' && totalBudget > 0
      ? Math.min(98, Math.max(2, (phaseInfo.today / phaseInfo.daysInMonth) * 100))
      : null;

  const showIncomeAnchor = month !== 'all' && totalIncome > 0;
  const plannedSavings = totalIncome - totalBudget;
  const plannedSavingsPct =
    totalIncome > 0 ? Math.round((plannedSavings / totalIncome) * 100) : 0;

  return (
    <>
      {/* Row 1: Unified Title & Action Cluster (Direct child of budgets-workspace so sticky stays pinned across full scroll) */}
      <div
        data-testid="budgets-sticky-header"
        className={
          isDirty && !isSpecificLocked
            ? 'sticky top-12 z-[15] -mx-2 px-2 py-1.5 rounded-b-[10px] bg-background border-b border-border shadow-sm'
            : ''
        }
      >
        <div className="flex flex-wrap items-center justify-between gap-x-2 gap-y-1.5">
          <div className="flex items-center gap-2 shrink-0">
            <h1 className="text-[18px] leading-6 sm:text-title font-semibold text-foreground shrink-0">
              {title}
            </h1>
            {isDirty && !isSpecificLocked && (
              <span
                data-testid="budgets-unsaved-badge"
                className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] leading-4 font-semibold bg-warning/15 text-warning border border-warning/30 tabular-nums num shrink-0"
              >
                Unsaved ({dirtyCount})
              </span>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-1.5 ml-auto">
            {isDirty && !isSpecificLocked && onDiscardBudgets && (
              <button
                type="button"
                onClick={onDiscardBudgets}
                data-testid="discard-budgets-btn"
                className="min-h-[34px] sm:min-h-[36px] inline-flex items-center gap-1 text-[11px] sm:text-label font-medium px-2 sm:px-2.5 rounded-[10px] bg-card hover:bg-surface2 text-muted-foreground hover:text-foreground border border-border transition-colors focus-visible:ring-2 ring-ring/40"
              >
                <RotateCcw className="w-3.5 h-3.5 shrink-0" />
                <span>Discard</span>
              </button>
            )}

            {onOpenCategoryManager && (
              <button
                type="button"
                onClick={onOpenCategoryManager}
                data-testid="open-add-category-btn"
                className="min-h-[34px] sm:min-h-[36px] inline-flex items-center gap-1 text-[11px] sm:text-label font-medium px-2 sm:px-3 rounded-[10px] bg-card hover:bg-surface2 text-foreground border border-border transition-colors focus-visible:ring-2 ring-ring/40"
              >
                <Plus className="w-3.5 h-3.5 shrink-0" />
                <span>Category</span>
              </button>
            )}

            {onSaveBudgets && (
              <button
                type="button"
                onClick={onSaveBudgets}
                disabled={isSpecificLocked}
                data-testid="save-budgets-btn"
                className={`min-h-[34px] sm:min-h-[36px] inline-flex items-center gap-1 text-[11px] sm:text-label font-semibold px-2 sm:px-3 rounded-[10px] transition-colors focus-visible:ring-2 ring-ring/40 disabled:opacity-50 disabled:cursor-not-allowed ${
                  isDirty && !isSpecificLocked
                    ? 'bg-primary text-primary-foreground hover:bg-primary/90'
                    : 'bg-surface2 hover:bg-secondary text-foreground border border-border'
                }`}
              >
                <Save className="w-3.5 h-3.5 shrink-0" />
                <span>Save Budgets</span>
              </button>
            )}
          </div>
        </div>

        <p
          data-testid="budgets-period-subtitle"
          className="text-[11px] sm:text-label text-muted-foreground leading-4 mt-0.5 truncate"
        >
          {subtitle}
        </p>
      </div>

      {/* Locked Month Read-Only Governance Banner */}
      {isSpecificLocked && (
        <div
          data-testid="budgets-locked-banner"
          className="flex items-center gap-2 px-3 py-1.5 rounded-[10px] bg-warning/10 border border-warning/30 text-xs text-foreground"
        >
          <Lock className="w-3.5 h-3.5 text-warning shrink-0" />
          <span className="truncate">
            <strong className="font-semibold">{formatLongMonthYear(month)}</strong> is
            locked — targets, mood tags, and monthly notes are read-only.
          </span>
        </div>
      )}

      {/* Row 2: 3-Column KPI Strip + Reconciliation + Income/Runway Anchor */}
      <div className="rounded-[12px] border border-border bg-card px-2.5 py-1.5 sm:px-4 sm:py-2.5 space-y-1">
        <div className="grid grid-cols-3 gap-1.5 sm:gap-6 items-start">
          <div className="min-w-0">
            <span className="text-[10px] sm:text-label text-muted-foreground block truncate">
              {isAllTime ? 'Monthly Target' : 'Target'}
            </span>
            <p
              data-testid="kpi-total-budget"
              className="text-[13px] sm:text-heading font-semibold tabular-nums num text-foreground truncate"
            >
              {formatCurrency(totalBudget)}
            </p>
          </div>

          <div className="min-w-0">
            <span className="text-[10px] sm:text-label text-muted-foreground block truncate">
              {spentLabel}
            </span>
            <p
              data-testid="kpi-budgeted-spent"
              className="text-[13px] sm:text-heading font-semibold tabular-nums num text-foreground truncate"
            >
              {formatCurrency(displayedSpent)}
            </p>
          </div>

          <div className="min-w-0 text-right sm:text-left">
            <span className="text-[10px] sm:text-label text-muted-foreground block truncate">
              {totalBudget > 0 ? 'Budgeted Left' : 'Remaining'}
            </span>
            <p
              data-testid="kpi-budget-remaining"
              className={`text-[13px] sm:text-heading font-semibold tabular-nums num truncate ${remainingToneClass}`}
            >
              {formatCurrency(displayedRemaining)}
            </p>
          </div>
        </div>

        {/* 6px Overall Budgeted Progress Bar */}
        {totalBudget > 0 && (
          <div className="space-y-1">
            <div className="relative h-1.5 w-full bg-surface2 rounded-full overflow-hidden">
              <div
                className={`h-full rounded-full transition-all duration-200 ${
                  reconciliation.budgetedSpent > totalBudget
                    ? 'bg-negative'
                    : 'bg-foreground'
                }`}
                style={{
                  width: `${Math.min(100, Math.max(0, reconciliation.budgetedUtilizationPct))}%`,
                }}
              />
              {overallPaceTickPct !== null && (
                <div
                  style={{ left: `${overallPaceTickPct}%` }}
                  className="absolute top-0 bottom-0 w-[2px] bg-faint pointer-events-none"
                  title="Elapsed month pace"
                />
              )}
            </div>
            <div className="flex items-center justify-between gap-2 text-[11px] leading-4 text-muted-foreground tabular-nums num">
              <div className="flex items-center gap-2 min-w-0 truncate">
                <span className="truncate">
                  Budgeted utilization
                  {isAllTime && reconciliation.activeMonthsCount > 1 ? ' (avg)' : ''}
                </span>
                {reconciliation.unbudgetedSpent > 0 && (
                  <button
                    type="button"
                    data-testid="unbudgeted-spend-callout"
                    onClick={onUnbudgetedCalloutClick}
                    className="inline-flex items-center gap-1 px-1.5 py-0 rounded-[5px] bg-warning/15 hover:bg-warning/25 border border-warning/30 text-[10px] sm:text-[11px] leading-4 font-medium text-warning tabular-nums num shrink-0 transition-colors focus-visible:ring-2 ring-ring/40"
                  >
                    <span>
                      +{formatBudgetAmountCompact(reconciliation.unbudgetedSpent)}{' '}
                      unbudgeted ({reconciliation.unbudgetedCategoryCount})
                    </span>
                  </button>
                )}
              </div>
              <span className="font-medium text-foreground shrink-0">
                {reconciliation.budgetedUtilizationPct.toFixed(0)}%
              </span>
            </div>
          </div>
        )}

        {/* Income / Planned Savings Anchor & Variable Safe-to-Spend Runway */}
        {(showIncomeAnchor || runway.visible) && (
          <div className="pt-1 border-t border-border/60 flex items-center justify-between gap-2 text-[11px] leading-4 tabular-nums num min-w-0">
            {showIncomeAnchor && (
              <div data-testid="income-plan-anchor" className="min-w-0 truncate">
                {plannedSavings >= 0 ? (
                  <span className="text-muted-foreground">
                    <span className="hidden sm:inline">Planned savings: </span>
                    <span className="sm:hidden">Save plan: </span>
                    <strong className="font-semibold text-foreground">
                      {formatMoney(plannedSavings)}/mo
                    </strong>
                    <span className="hidden sm:inline">
                      {' '}
                      ({plannedSavingsPct}% of {formatMoney(totalIncome)} income)
                    </span>
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1 text-warning font-medium truncate">
                    <AlertTriangle className="w-3 h-3 shrink-0" />
                    <span className="truncate">
                      Over income by{' '}
                      <strong>{formatMoney(Math.abs(plannedSavings))}</strong>
                    </span>
                  </span>
                )}
              </div>
            )}

            {runway.visible && (
              <div
                data-testid="budgets-variable-runway"
                className={`min-w-0 truncate shrink-0 ${
                  runway.isNegative ? 'text-negative font-medium' : 'text-muted-foreground'
                }`}
              >
                <span className="hidden sm:inline">{runway.eyebrow}: </span>
                <span className="sm:hidden">Var: </span>
                <strong
                  className={
                    runway.isNegative
                      ? 'text-negative font-semibold'
                      : 'text-foreground font-semibold'
                  }
                >
                  {runway.headline}
                </strong>
                {runway.subline && (
                  <span className="hidden lg:inline"> · {runway.subline}</span>
                )}
              </div>
            )}
          </div>
        )}
      </div>
    </>
  );
};
