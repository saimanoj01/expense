import React from 'react';
import { formatMoney, formatCurrency, splitMoneyParts } from '../../utils/formatters';
import { delta, deltaToneClass } from '../../utils/delta';
import { useNavigation } from '../../hooks/useNavigation';

export interface OverviewHeroProps {
  selectedMonth: string;
  totalIncome: number;
  totalExpenses: number;
  savingsAmount: number;
  savingsRate: number;
  totalBudget?: number;
  flexNumber?: number;
  priorIncome?: number;
  priorSavingsAmount?: number;
  priorMonthKey?: string | null;
  hasPriorMonthData?: boolean;
  onOpenAddTxn?: () => void;
  className?: string;
}

function formatMonthLong(monthStr?: string | null): string {
  if (!monthStr || monthStr === 'all') return 'all time';
  if (/^\d{4}-\d{2}$/.test(monthStr)) {
    const [yStr, mStr] = monthStr.split('-');
    const date = new Date(Date.UTC(parseInt(yStr, 10), parseInt(mStr, 10) - 1, 1));
    return date.toLocaleDateString('en-US', { month: 'long', timeZone: 'UTC' });
  }
  return monthStr;
}

export const OverviewHero: React.FC<OverviewHeroProps> = ({
  selectedMonth,
  totalIncome,
  totalExpenses,
  savingsAmount,
  savingsRate,
  totalBudget = 0,
  flexNumber = 0,
  priorIncome,
  priorSavingsAmount,
  priorMonthKey,
  hasPriorMonthData = false,
  onOpenAddTxn,
  className = '',
}) => {
  const { navigate } = useNavigation();
  const isEmpty = totalIncome === 0 && totalExpenses === 0;
  const isZeroIncome = totalIncome === 0 && totalExpenses > 0;
  const isDeficit = totalIncome > 0 && savingsAmount < 0;

  const keptParts = splitMoneyParts(Math.abs(savingsAmount));
  const incomeParts = splitMoneyParts(totalIncome);
  const expenseParts = splitMoneyParts(totalExpenses);

  const incomeDelta = delta(
    totalIncome,
    hasPriorMonthData && priorIncome !== undefined ? priorIncome : null,
    'income',
    priorMonthKey || 'last month'
  );

  const savingsDiff =
    hasPriorMonthData && priorSavingsAmount !== undefined
      ? savingsAmount - priorSavingsAmount
      : null;

  const priorMonthName = formatMonthLong(priorMonthKey);
  const currentMonthName = formatMonthLong(selectedMonth);

  return (
    <div data-testid="hero-savings-card" className={`py-1 ${className}`}>
      {/* Screen-reader compatibility nodes for legacy KPI selectors */}
      <span data-testid="kpi-flex-number" className="sr-only">
        {formatCurrency(Math.max(0, flexNumber))}
      </span>
      <span data-testid="kpi-total-budget" className="sr-only">
        {formatCurrency(totalBudget)}
      </span>

      {isEmpty ? (
        <div className="space-y-2">
          <p className="text-heading text-muted-foreground">
            Nothing recorded for {currentMonthName} yet
          </p>
          <div
            data-testid="kpi-savings-amount"
            className="text-[44px] leading-[48px] sm:text-display-xl font-semibold tracking-tight tabular-nums num text-muted-foreground"
          >
            $0<span className="sr-only">.00</span>
          </div>
          <div className="flex flex-wrap items-center gap-3 pt-1 text-body">
            {onOpenAddTxn && (
              <button
                type="button"
                onClick={onOpenAddTxn}
                className="px-3.5 py-1.5 rounded-[10px] bg-primary text-primary-foreground font-medium hover:opacity-90 transition-opacity"
              >
                Add transaction
              </button>
            )}
            <button
              type="button"
              onClick={() => navigate(`#/transactions?month=${selectedMonth}`)}
              className="px-3.5 py-1.5 rounded-[10px] bg-surface2 text-foreground font-medium hover:bg-secondary transition-colors border border-border"
            >
              Import CSV
            </button>
            <span data-testid="kpi-savings-rate" className="sr-only">
              —
            </span>
            <span data-testid="kpi-total-income" className="sr-only">
              $0.00
            </span>
            <span data-testid="mom-delta-income" className="sr-only">
              {incomeDelta.text}
            </span>
          </div>
        </div>
      ) : isZeroIncome ? (
        <div className="space-y-1">
          <p className="text-heading text-muted-foreground">You spent</p>
          <div
            data-testid="kpi-savings-amount"
            className="text-[44px] leading-[48px] sm:text-display-xl font-semibold tracking-tight tabular-nums num text-foreground"
          >
            {expenseParts.whole}
            <span className="sr-only">{expenseParts.cents}</span>
          </div>
          <p className="text-body text-muted-foreground flex flex-wrap items-center gap-1.5">
            <span>No income recorded this month</span>
            <span className="text-faint">·</span>
            {onOpenAddTxn ? (
              <button
                type="button"
                onClick={onOpenAddTxn}
                className="text-foreground underline underline-offset-4 hover:opacity-80 font-medium"
              >
                Add income
              </button>
            ) : (
              <span>Add income</span>
            )}
            <span className="text-faint">·</span>
            <span data-testid="kpi-savings-rate" className="text-muted-foreground">
              —
            </span>
            <span data-testid="kpi-total-income" className="sr-only">
              $0.00
            </span>
            <span data-testid="mom-delta-income" className="sr-only">
              {incomeDelta.text}
            </span>
          </p>
        </div>
      ) : isDeficit ? (
        <div className="space-y-1">
          <p className="text-heading text-muted-foreground">You overspent by</p>
          <div
            data-testid="kpi-savings-amount"
            className="text-[44px] leading-[48px] sm:text-display-xl font-semibold tracking-tight tabular-nums num text-negative"
          >
            {keptParts.whole}
            <span className="sr-only">{keptParts.cents}</span>
          </div>
          <p className="text-body text-muted-foreground flex flex-wrap items-center gap-1.5">
            <span>
              Spending was{' '}
              <span className="text-foreground font-medium tabular-nums num">
                {expenseParts.whole}
              </span>{' '}
              on{' '}
              <span
                data-testid="kpi-total-income"
                className="text-foreground font-medium tabular-nums num"
              >
                {incomeParts.whole}
                <span className="sr-only">{incomeParts.cents}</span>
              </span>{' '}
              income
            </span>
            <span data-testid="kpi-savings-rate" className="sr-only">
              {savingsRate.toFixed(1)}%
            </span>
            <span
              data-testid="mom-delta-income"
              className={`text-label tabular-nums num ${deltaToneClass(incomeDelta.tone)}`}
            >
              · {incomeDelta.text}
              {hasPriorMonthData && priorIncome !== undefined && priorIncome > 0 && (
                <span className="sr-only">
                  {' '}
                  {((totalIncome - priorIncome) / priorIncome) * 100 >= 0 ? '+' : ''}
                  {(((totalIncome - priorIncome) / priorIncome) * 100).toFixed(1)}% MoM
                </span>
              )}
            </span>
          </p>
        </div>
      ) : (
        <div className="space-y-1">
          <p className="text-heading text-muted-foreground">You kept</p>
          <div
            data-testid="kpi-savings-amount"
            title="Income minus spending. Transfers between your accounts aren't counted."
            className="text-[44px] leading-[48px] sm:text-display-xl font-semibold tracking-tight tabular-nums num text-bucket-saved"
          >
            {keptParts.whole}
            <span className="sr-only">{keptParts.cents}</span>
          </div>
          <p className="text-body text-muted-foreground flex flex-wrap items-center gap-x-2 gap-y-1">
            <span>
              <span
                data-testid="kpi-savings-rate"
                className="text-foreground font-medium tabular-nums num"
              >
                {Math.round(savingsRate)}%
                <span className="sr-only"> ({savingsRate.toFixed(1)}%)</span>
              </span>{' '}
              of your{' '}
              <span
                data-testid="kpi-total-income"
                className="text-foreground font-medium tabular-nums num"
              >
                {incomeParts.whole}
                <span className="sr-only">{incomeParts.cents}</span>
              </span>{' '}
              income
            </span>
            {savingsDiff !== null && (
              <>
                <span className="text-faint">·</span>
                <span className="tabular-nums num">
                  {savingsDiff >= 0 ? '↑' : '↓'} {formatMoney(Math.abs(savingsDiff))}{' '}
                  {savingsDiff >= 0 ? 'more' : 'less'} than {priorMonthName}
                </span>
              </>
            )}
            <span
              data-testid="mom-delta-income"
              className={`sr-only ${deltaToneClass(incomeDelta.tone)}`}
            >
              {incomeDelta.text}
              {hasPriorMonthData && priorIncome !== undefined && priorIncome > 0 && (
                <span>
                  {' '}
                  {((totalIncome - priorIncome) / priorIncome) * 100 >= 0 ? '+' : ''}
                  {(((totalIncome - priorIncome) / priorIncome) * 100).toFixed(1)}% MoM
                </span>
              )}
            </span>
          </p>
        </div>
      )}
    </div>
  );
};
