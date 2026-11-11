import React, { useMemo } from 'react';
import { ChevronRight } from 'lucide-react';
import {
  formatMoney,
  formatCurrency,
  formatSignedCurrency,
  splitMoneyParts,
} from '../../utils/formatters';
import { formatMonthLabel } from '../../utils/navigation';
import { useNavigation } from '../../hooks/useNavigation';
import { RollingNumber } from '../motion/RollingNumber';
import { bucketColor, negativeColor } from '../../theme/buckets';
import { computeSafeToSpendRunway } from '../../utils/metrics';
import type { MonthPhaseInfo } from '../../utils/metrics';

export interface OverviewHeroProps {
  selectedMonth: string;
  phaseInfo: MonthPhaseInfo;
  totalIncome: number;
  totalExpenses: number;
  flexibleExpenses?: number;
  savingsAmount: number;
  savingsRate: number;
  totalBudget?: number;
  variableBudget?: number;
  flexNumber?: number;
  activeMonthsCount?: number;
  latestMonthWithData?: string | null;
  priorSavingsAmount?: number;
  priorComparisonLabel?: string | null;
  hasPriorMonthData?: boolean;
  isLockedMonth?: boolean;
  isMockMode?: boolean;
  onOpenAddTxn?: () => void;
  onOpenCsvWizard?: () => void;
  onLoadSampleData?: () => void;
  onSelectMonth?: (month: string) => void;
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
  phaseInfo,
  totalIncome,
  totalExpenses,
  flexibleExpenses = 0,
  savingsAmount,
  savingsRate,
  totalBudget = 0,
  variableBudget = 0,
  flexNumber = 0,
  activeMonthsCount = 0,
  latestMonthWithData = null,
  priorSavingsAmount,
  priorComparisonLabel,
  hasPriorMonthData = false,
  isLockedMonth = false,
  isMockMode = false,
  onOpenAddTxn,
  onOpenCsvWizard,
  onLoadSampleData,
  onSelectMonth,
  className = '',
}) => {
  const { navigate, currentRoute } = useNavigation();
  const isOverview = currentRoute.view === 'overview';
  const isEmpty = totalIncome === 0 && totalExpenses === 0;
  const isZeroIncome = totalIncome === 0 && totalExpenses > 0;
  const isDeficit = totalIncome > 0 && savingsAmount < 0;

  const keptParts = splitMoneyParts(Math.abs(savingsAmount));
  const expenseParts = splitMoneyParts(totalExpenses);

  const savingsDiff =
    hasPriorMonthData && priorSavingsAmount !== undefined
      ? savingsAmount - priorSavingsAmount
      : null;

  const currentMonthName = formatMonthLong(selectedMonth);
  const mtdBadge =
    phaseInfo.phase === 'current'
      ? ` · Day ${phaseInfo.today} of ${phaseInfo.daysInMonth}`
      : '';

  const runway = useMemo(
    () =>
      computeSafeToSpendRunway({
        selectedMonth,
        phaseInfo,
        totalIncome,
        totalExpenses,
        flexibleExpenses,
        flexNumber,
        savingsAmount,
        variableBudget,
        activeMonthsCount,
      }),
    [
      selectedMonth,
      phaseInfo,
      totalIncome,
      totalExpenses,
      flexibleExpenses,
      flexNumber,
      savingsAmount,
      variableBudget,
      activeMonthsCount,
    ]
  );

  const heroTitleTooltip =
    "Income minus spending. Refunds reduce spending; transfers between your accounts aren't counted.";

  return (
    <div
      data-testid={isOverview ? 'hero-savings-card' : undefined}
      className={`flex flex-col md:flex-row md:items-end justify-between gap-3 py-0.5 ${className}`}
    >
      {/* Left: Cash-Flow Verdict + Trio */}
      <div className="min-w-0 flex-1 space-y-1">
        {isEmpty ? (
          <>
            <div className="flex flex-wrap items-center gap-2">
              <p className="text-body font-medium text-muted-foreground">
                {phaseInfo.phase === 'future'
                  ? `Planned for ${formatMonthLabel(selectedMonth)}`
                  : selectedMonth === 'all'
                  ? 'No recorded activity yet'
                  : `Nothing recorded for ${currentMonthName} yet${mtdBadge}`}
              </p>
            </div>
            <div
              data-testid={isOverview ? 'kpi-savings-amount' : undefined}
              title={heroTitleTooltip}
              className="text-[38px] leading-[42px] sm:text-[42px] sm:leading-[46px] font-semibold tracking-tight tabular-nums num text-muted-foreground"
            >
              $0<span className="text-[0.55em] opacity-70 font-normal">.00</span>
            </div>
            <div className="flex flex-wrap items-center gap-2 pt-0.5 text-label">
              {isLockedMonth ? (
                <span
                  data-testid="hero-empty-locked-pill"
                  className="px-2.5 py-1 rounded-[8px] bg-surface2 text-muted-foreground border border-border font-medium"
                >
                  Month is locked
                </span>
              ) : (
                <>
                  {onOpenAddTxn && (
                    <button
                      type="button"
                      onClick={onOpenAddTxn}
                      className="px-3 py-1 rounded-[8px] bg-primary text-primary-foreground font-medium hover:opacity-90 transition-opacity focus-visible:ring-2 ring-ring/40"
                    >
                      Add transaction
                    </button>
                  )}
                  {onOpenCsvWizard && (
                    <button
                      type="button"
                      data-testid="hero-import-csv-btn"
                      onClick={onOpenCsvWizard}
                      className="px-3 py-1 rounded-[8px] bg-surface2 text-foreground font-medium hover:bg-secondary transition-colors border border-border focus-visible:ring-2 ring-ring/40"
                    >
                      Import CSV
                    </button>
                  )}
                </>
              )}
              {latestMonthWithData &&
              latestMonthWithData !== selectedMonth &&
              onSelectMonth ? (
                <button
                  type="button"
                  data-testid="jump-latest-month-btn"
                  onClick={() => onSelectMonth(latestMonthWithData)}
                  className="px-2.5 py-1 rounded-[8px] text-foreground hover:bg-surface2 font-medium transition-colors focus-visible:ring-2 ring-ring/40"
                >
                  Jump to {formatMonthLabel(latestMonthWithData)} →
                </button>
              ) : (
                isMockMode &&
                !isLockedMonth &&
                !latestMonthWithData &&
                onLoadSampleData && (
                  <button
                    type="button"
                    data-testid="hero-load-sample-btn"
                    onClick={onLoadSampleData}
                    className="px-2.5 py-1 rounded-[8px] text-muted-foreground hover:text-foreground hover:bg-surface2 font-medium transition-colors focus-visible:ring-2 ring-ring/40"
                  >
                    Load sample data
                  </button>
                )
              )}

              <span className="text-label text-muted-foreground tabular-nums num inline-flex flex-wrap items-center gap-1.5">
                <span>
                  Spent{' '}
                  <span
                    data-testid={isOverview ? 'kpi-total-expenses' : undefined}
                    className="inline-block overflow-hidden text-ellipsis whitespace-nowrap max-w-[200px] sm:max-w-full align-bottom font-medium text-foreground tabular-nums num"
                  >
                    {formatCurrency(totalExpenses)}
                  </span>
                </span>
                <span className="text-faint">·</span>
                <span>
                  Rate{' '}
                  <span
                    data-testid={isOverview ? 'kpi-savings-rate' : undefined}
                    className="text-foreground font-medium"
                  >
                    —
                  </span>
                </span>
                {totalBudget > 0 && selectedMonth !== 'all' && (
                  <>
                    <span className="text-faint">·</span>
                    <span data-testid={isOverview ? 'kpi-total-budget' : undefined}>
                      Target {formatCurrency(totalBudget)}
                    </span>
                  </>
                )}
              </span>
            </div>
          </>
        ) : isZeroIncome ? (
          <>
            <div className="flex flex-wrap items-center gap-2">
              <p className="text-body font-medium text-muted-foreground">
                {selectedMonth === 'all'
                  ? 'Total spending across all time'
                  : phaseInfo.phase === 'current'
                  ? `Spent so far${mtdBadge}`
                  : `Total spent in ${currentMonthName}`}
              </p>
            </div>
            <div
              data-testid={isOverview ? 'kpi-savings-amount' : undefined}
              title={heroTitleTooltip}
              className="text-[38px] leading-[42px] sm:text-[42px] sm:leading-[46px] font-semibold tracking-tight tabular-nums num text-foreground"
            >
              <RollingNumber value={expenseParts.whole} srSuffix={expenseParts.cents} />
            </div>
            <p className="text-label text-muted-foreground flex flex-wrap items-center gap-1.5 tabular-nums num">
              <span>
                Spent{' '}
                <span
                  data-testid={isOverview ? 'kpi-total-expenses' : undefined}
                  className="inline-block overflow-hidden text-ellipsis whitespace-nowrap max-w-[200px] sm:max-w-full align-bottom font-medium text-foreground tabular-nums num"
                >
                  {formatCurrency(totalExpenses)}
                </span>
              </span>
              <span className="text-faint">·</span>
              <span>Income $0.00</span>
              {!isLockedMonth && onOpenAddTxn && (
                <>
                  <span className="text-faint">·</span>
                  <button
                    type="button"
                    onClick={onOpenAddTxn}
                    className="text-foreground underline underline-offset-4 hover:opacity-80 font-medium"
                  >
                    Add income
                  </button>
                </>
              )}
              <span className="text-faint">·</span>
              <span>
                Rate{' '}
                <span
                  data-testid={isOverview ? 'kpi-savings-rate' : undefined}
                  className="text-muted-foreground"
                >
                  —
                </span>
              </span>
              {totalBudget > 0 && selectedMonth !== 'all' && (
                <>
                  <span className="text-faint">·</span>
                  <span data-testid={isOverview ? 'kpi-total-budget' : undefined}>
                    Target {formatCurrency(totalBudget)}
                  </span>
                </>
              )}
            </p>
          </>
        ) : isDeficit ? (
          <>
            <div className="flex flex-wrap items-center gap-2">
              <p className="text-body font-medium text-muted-foreground">
                You overspent by{mtdBadge}
              </p>
            </div>
            <div
              data-testid={isOverview ? 'kpi-savings-amount' : undefined}
              title={heroTitleTooltip}
              className="text-[38px] leading-[42px] sm:text-[42px] sm:leading-[46px] font-semibold tracking-tight tabular-nums num text-negative"
            >
              <RollingNumber value={keptParts.whole} srSuffix={keptParts.cents} />
            </div>
            <p className="text-label text-muted-foreground flex flex-wrap items-center gap-x-1.5 gap-y-1 tabular-nums num">
              <span>
                Income <span className="text-foreground font-medium">{formatCurrency(totalIncome)}</span>
              </span>
              <span className="text-faint">·</span>
              <span>
                Spent{' '}
                <span
                  data-testid={isOverview ? 'kpi-total-expenses' : undefined}
                  className="inline-block overflow-hidden text-ellipsis whitespace-nowrap max-w-[200px] sm:max-w-full align-bottom font-medium text-foreground tabular-nums num"
                >
                  {formatCurrency(totalExpenses)}
                </span>
              </span>
              <span className="text-faint">·</span>
              <span>
                Rate{' '}
                <span
                  data-testid={isOverview ? 'kpi-savings-rate' : undefined}
                  className="text-negative font-medium"
                >
                  {savingsRate.toFixed(1)}%
                </span>
              </span>
              {totalIncome > 0 && (
                <>
                  <span className="text-faint">·</span>
                  <span
                    data-testid={isOverview ? 'kpi-flex-number' : undefined}
                    className={flexNumber < 0 ? 'text-negative' : ''}
                  >
                    Flex {formatSignedCurrency(flexNumber)}
                  </span>
                </>
              )}
              {totalBudget > 0 && selectedMonth !== 'all' && (
                <>
                  <span className="text-faint">·</span>
                  <span data-testid={isOverview ? 'kpi-total-budget' : undefined}>
                    Target {formatCurrency(totalBudget)}
                  </span>
                </>
              )}
            </p>
          </>
        ) : (
          <>
            <div className="flex flex-wrap items-center gap-2">
              <p className="text-body font-medium text-muted-foreground">
                {selectedMonth === 'all'
                  ? 'Net saved across all time'
                  : phaseInfo.phase === 'current'
                  ? `Net cash flow so far${mtdBadge}`
                  : `You kept in ${currentMonthName}`}
              </p>
            </div>
            <div
              data-testid={isOverview ? 'kpi-savings-amount' : undefined}
              title={heroTitleTooltip}
              className="text-[38px] leading-[42px] sm:text-[42px] sm:leading-[46px] font-semibold tracking-tight tabular-nums num text-bucket-saved"
            >
              <RollingNumber value={keptParts.whole} srSuffix={keptParts.cents} />
            </div>
            <p className="text-label text-muted-foreground flex flex-wrap items-center gap-x-1.5 gap-y-1 tabular-nums num">
              <span>
                Income <span className="text-foreground font-medium">{formatCurrency(totalIncome)}</span>
              </span>
              <span className="text-faint">·</span>
              <span>
                Spent{' '}
                <span
                  data-testid={isOverview ? 'kpi-total-expenses' : undefined}
                  className="inline-block overflow-hidden text-ellipsis whitespace-nowrap max-w-[200px] sm:max-w-full align-bottom font-medium text-foreground tabular-nums num"
                >
                  {formatCurrency(totalExpenses)}
                </span>
              </span>
              <span className="text-faint">·</span>
              <span>
                Saved{' '}
                <span
                  data-testid={isOverview ? 'kpi-savings-rate' : undefined}
                  className="text-foreground font-medium"
                >
                  {savingsRate.toFixed(1)}%
                </span>
              </span>
              {savingsDiff !== null && priorComparisonLabel && (
                <>
                  <span className="text-faint">·</span>
                  <span>
                    {savingsDiff >= 0 ? '↑' : '↓'} {formatMoney(Math.abs(savingsDiff))} vs{' '}
                    {priorComparisonLabel}
                  </span>
                </>
              )}
              <span className="text-faint">·</span>
              <span
                data-testid={isOverview ? 'kpi-flex-number' : undefined}
                className={flexNumber < 0 ? 'text-negative' : ''}
              >
                Flex {formatSignedCurrency(flexNumber)}
              </span>
              {totalBudget > 0 && selectedMonth !== 'all' && (
                <>
                  <span className="text-faint">·</span>
                  <span data-testid={isOverview ? 'kpi-total-budget' : undefined}>
                    Target {formatCurrency(totalBudget)}
                  </span>
                </>
              )}
            </p>
          </>
        )}
      </div>

      {/* Right: Forward-Looking Safe-to-Spend Runway */}
      {runway.visible && (
        <button
          type="button"
          data-testid={isOverview ? 'hero-safe-to-spend' : undefined}
          onClick={() => navigate(runway.targetHref)}
          className="w-full md:w-[296px] lg:w-[320px] shrink-0 pt-2.5 md:pt-1 md:pb-1 md:pl-5 md:pr-2 border-t md:border-t-0 md:border-l border-border text-left group hover:bg-surface2/50 md:rounded-r-[10px] transition-colors focus-visible:ring-2 ring-ring/40"
        >
          <div className="flex items-center justify-between gap-2 text-label text-muted-foreground">
            <span className="font-medium">{runway.eyebrow}</span>
            <ChevronRight className="w-3.5 h-3.5 text-faint group-hover:text-foreground transition-colors shrink-0" />
          </div>
          <div
            className={`text-[18px] leading-[22px] font-semibold tracking-tight tabular-nums num mt-0.5 ${
              runway.isNegative ? 'text-negative' : 'text-foreground'
            }`}
          >
            {runway.headline}
          </div>
          <div className="text-label text-muted-foreground tabular-nums num truncate mt-0.5">
            {runway.subline}
          </div>

          {(runway.mode === 'variable-budget' || runway.mode === 'flex-pool') && (
            <div className="relative w-full h-1.5 bg-surface2 rounded-full overflow-hidden mt-1.5">
              <div
                style={{
                  width: `${runway.utilizationPct}%`,
                  backgroundColor: runway.isNegative
                    ? negativeColor()
                    : bucketColor('flexible'),
                }}
                className="h-full rounded-full"
              />
              {runway.paceTickPct !== null && (
                <div
                  style={{ left: `${runway.paceTickPct}%` }}
                  className="absolute top-0 bottom-0 w-[2px] bg-faint pointer-events-none"
                />
              )}
            </div>
          )}
        </button>
      )}
    </div>
  );
};
