import React, { useEffect, useState } from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import { formatMoney, formatCurrency, splitMoneyParts } from '../../utils/formatters';
import { useNavigation } from '../../hooks/useNavigation';
import { RollingNumber } from '../motion/RollingNumber';

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
  priorSavingsAmount,
  priorMonthKey,
  hasPriorMonthData = false,
  onOpenAddTxn,
  className = '',
}) => {
  const { navigate, currentRoute } = useNavigation();
  const isOverview = currentRoute.view === 'overview';
  const reduced = useReducedMotion();
  const isEmpty = totalIncome === 0 && totalExpenses === 0;
  const isZeroIncome = totalIncome === 0 && totalExpenses > 0;
  const isDeficit = totalIncome > 0 && savingsAmount < 0;

  const [shouldGlow, setShouldGlow] = useState(false);

  useEffect(() => {
    if (reduced || isEmpty || isZeroIncome || isDeficit || savingsRate < 20) {
      setShouldGlow(false);
      return;
    }
    const key = `calm_ledger_glow_${selectedMonth}`;
    try {
      if (!sessionStorage.getItem(key)) {
        sessionStorage.setItem(key, '1');
        setShouldGlow(true);
      } else {
        setShouldGlow(false);
      }
    } catch {
      setShouldGlow(false);
    }
  }, [selectedMonth, savingsRate, reduced, isEmpty, isZeroIncome, isDeficit]);

  const keptParts = splitMoneyParts(Math.abs(savingsAmount));
  const incomeParts = splitMoneyParts(totalIncome);
  const expenseParts = splitMoneyParts(totalExpenses);

  const savingsDiff =
    hasPriorMonthData && priorSavingsAmount !== undefined
      ? savingsAmount - priorSavingsAmount
      : null;

  const priorMonthName = formatMonthLong(priorMonthKey);
  const currentMonthName = formatMonthLong(selectedMonth);

  const now = new Date();
  const currentLocalMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  const isCurrentCalendarMonth = selectedMonth === currentLocalMonth;
  const daysInSelectedMonth = /^\d{4}-\d{2}$/.test(selectedMonth)
    ? new Date(parseInt(selectedMonth.split('-')[0], 10), parseInt(selectedMonth.split('-')[1], 10), 0).getDate()
    : 30;
  const mtdBadge =
    isCurrentCalendarMonth && now.getDate() < daysInSelectedMonth
      ? ` · Month to date (Day ${now.getDate()} of ${daysInSelectedMonth})`
      : '';

  return (
    <div data-testid={isOverview ? 'hero-savings-card' : undefined} className={`py-1 ${className}`}>
      {isEmpty ? (
        <div className="space-y-2">
          <p className="text-heading text-muted-foreground">
            Nothing recorded for {currentMonthName} yet{mtdBadge}
          </p>
          <div
            data-testid={isOverview ? 'kpi-savings-amount' : undefined}
            className="text-[44px] leading-[48px] sm:text-display-xl font-semibold tracking-tight tabular-nums num text-muted-foreground"
          >
            $0<span className="text-[0.55em] opacity-70 font-normal">.00</span>
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
            <span className="text-label text-muted-foreground tabular-nums num inline-flex flex-wrap items-center gap-1.5">
              <span>
                Rate{' '}
                <span data-testid={isOverview ? 'kpi-savings-rate' : undefined} className="text-foreground font-medium">
                  —
                </span>
              </span>
              {flexNumber > 0 && (
                <>
                  <span className="text-faint">·</span>
                  <span data-testid={isOverview ? 'kpi-flex-number' : undefined}>
                    Flex {formatCurrency(flexNumber)}
                  </span>
                </>
              )}
              {totalBudget > 0 && (
                <>
                  <span className="text-faint">·</span>
                  <span data-testid={isOverview ? 'kpi-total-budget' : undefined}>
                    Target {formatCurrency(totalBudget)}
                  </span>
                </>
              )}
            </span>
          </div>
        </div>
      ) : isZeroIncome ? (
        <div className="space-y-1">
          <p className="text-heading text-muted-foreground">You spent{mtdBadge}</p>
          <div
            data-testid={isOverview ? 'kpi-savings-amount' : undefined}
            className="text-[44px] leading-[48px] sm:text-display-xl font-semibold tracking-tight tabular-nums num text-foreground"
          >
            <RollingNumber value={expenseParts.whole} srSuffix={expenseParts.cents} />
          </div>
          <p className="text-body text-muted-foreground flex flex-wrap items-center gap-1.5">
            <span>
              No income recorded this month (<span className="tabular-nums num">$0.00</span>)
            </span>
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
            <span data-testid={isOverview ? 'kpi-savings-rate' : undefined} className="text-muted-foreground">
              —
            </span>
            {flexNumber > 0 && (
              <>
                <span className="text-faint">·</span>
                <span data-testid={isOverview ? 'kpi-flex-number' : undefined} className="text-label tabular-nums num">
                  Flex {formatCurrency(flexNumber)}
                </span>
              </>
            )}
            {totalBudget > 0 && (
              <>
                <span className="text-faint">·</span>
                <span data-testid={isOverview ? 'kpi-total-budget' : undefined} className="text-label tabular-nums num">
                  Target {formatCurrency(totalBudget)}
                </span>
              </>
            )}
          </p>
        </div>
      ) : isDeficit ? (
        <div className="space-y-1">
          <p className="text-heading text-muted-foreground">You overspent by{mtdBadge}</p>
          <div
            data-testid={isOverview ? 'kpi-savings-amount' : undefined}
            className="text-[44px] leading-[48px] sm:text-display-xl font-semibold tracking-tight tabular-nums num text-negative"
          >
            <RollingNumber value={keptParts.whole} srSuffix={keptParts.cents} />
          </div>
          <p className="text-body text-muted-foreground flex flex-wrap items-center gap-1.5">
            <span>
              Spending was{' '}
              <span className="text-foreground font-medium tabular-nums num">
                {expenseParts.whole}
                {expenseParts.cents && <span className="text-[0.75em] opacity-75">{expenseParts.cents}</span>}
              </span>{' '}
              on{' '}
              <span className="text-foreground font-medium tabular-nums num">
                {incomeParts.whole}
                {incomeParts.cents && <span className="text-[0.75em] opacity-75">{incomeParts.cents}</span>}
              </span>{' '}
              income (
              <span data-testid={isOverview ? 'kpi-savings-rate' : undefined} className="tabular-nums num">
                {savingsRate.toFixed(1)}%
              </span>
              )
            </span>
            {flexNumber > 0 && (
              <>
                <span className="text-faint">·</span>
                <span data-testid={isOverview ? 'kpi-flex-number' : undefined} className="text-label tabular-nums num">
                  Flex {formatCurrency(flexNumber)}
                </span>
              </>
            )}
            {totalBudget > 0 && (
              <>
                <span className="text-faint">·</span>
                <span data-testid={isOverview ? 'kpi-total-budget' : undefined} className="text-label tabular-nums num">
                  Target {formatCurrency(totalBudget)}
                </span>
              </>
            )}
          </p>
        </div>
      ) : (
        <div className="space-y-1">
          <p className="text-heading text-muted-foreground">You kept{mtdBadge}</p>
          <motion.div
            data-testid={isOverview ? 'kpi-savings-amount' : undefined}
            title="Income minus spending. Refunds reduce spending; transfers between your accounts aren't counted."
            initial={
              shouldGlow
                ? { textShadow: '0 0 24px hsl(var(--c-saved) / 0.45)' }
                : false
            }
            animate={{ textShadow: '0 0 0px hsl(var(--c-saved) / 0)' }}
            transition={{ duration: 1.2, ease: 'easeOut' }}
            className="text-[44px] leading-[48px] sm:text-display-xl font-semibold tracking-tight tabular-nums num text-bucket-saved"
          >
            <RollingNumber value={keptParts.whole} srSuffix={keptParts.cents} />
          </motion.div>
          <p className="text-body text-muted-foreground flex flex-wrap items-center gap-x-2 gap-y-1">
            <span>
              <span
                data-testid={isOverview ? 'kpi-savings-rate' : undefined}
                className="text-foreground font-medium tabular-nums num"
              >
                {savingsRate.toFixed(1)}%
              </span>{' '}
              of your{' '}
              <span className="text-foreground font-medium tabular-nums num">
                {incomeParts.whole}
                {incomeParts.cents && <span className="text-[0.75em] opacity-75">{incomeParts.cents}</span>}
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
            {flexNumber > 0 && (
              <>
                <span className="text-faint">·</span>
                <span data-testid={isOverview ? 'kpi-flex-number' : undefined} className="text-label tabular-nums num">
                  Flex {formatCurrency(flexNumber)}
                </span>
              </>
            )}
            {totalBudget > 0 && (
              <>
                <span className="text-faint">·</span>
                <span data-testid={isOverview ? 'kpi-total-budget' : undefined} className="text-label tabular-nums num">
                  Target {formatCurrency(totalBudget)}
                </span>
              </>
            )}
          </p>
        </div>
      )}
    </div>
  );
};
