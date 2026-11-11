import React from 'react';
import { motion } from 'framer-motion';
import { ChevronRight } from 'lucide-react';
import { BUCKETS, bucketColor, negativeColor } from '../../theme/buckets';
import { spring } from '../../theme/motion';
import { splitMoneyParts } from '../../utils/formatters';
import { delta, deltaToneClass, DeltaKind } from '../../utils/delta';
import { useNavigation } from '../../hooks/useNavigation';
import { RollingNumber } from '../motion/RollingNumber';

export interface BucketStatsProps {
  selectedMonth: string;
  totalIncome: number;
  totalExpenses: number;
  fixedExpenses: number;
  flexibleExpenses: number;
  nonMonthlyExpenses: number;
  savingsAmount: number;
  fixedBudget?: number;
  variableBudget?: number;
  suppressMomDelta?: boolean;
  priorMetrics?: {
    income: number;
    fixed: number;
    flexible: number;
    nonMonthly?: number;
    expenses: number;
    savings: number;
  } | null;
  priorMonthKey?: string | null;
  priorComparisonLabel?: string | null;
  hasPriorMonthData?: boolean;
  className?: string;
}

interface StatCol {
  key: string;
  route: string;
  label: string;
  badgeTag?: string;
  dotColor: string;
  isInflow?: boolean;
  showMinusSign?: boolean;
  isNegativeTone?: boolean;
  amount: number;
  bucketBudget?: number;
  deltaCurrent: number;
  prior: number | undefined;
  kind: DeltaKind;
  subBadge: string;
  testId: string;
  momTestId: string;
  drillTestId: string;
  layoutId?: string;
}

export const BucketStats: React.FC<BucketStatsProps> = ({
  selectedMonth,
  totalIncome,
  totalExpenses,
  fixedExpenses,
  flexibleExpenses,
  nonMonthlyExpenses,
  savingsAmount,
  fixedBudget = 0,
  variableBudget = 0,
  suppressMomDelta = false,
  priorMetrics,
  priorMonthKey,
  priorComparisonLabel,
  hasPriorMonthData = false,
  className = '',
}) => {
  const { navigate, currentRoute } = useNavigation();
  const isOverview = currentRoute.view === 'overview';
  const denom = Math.max(totalIncome, totalExpenses, 1);
  const isSpendDenom = totalExpenses > totalIncome;
  const isZeroIncomeSpend = totalIncome === 0 && totalExpenses > 0;
  const isDeficit = totalIncome > 0 && savingsAmount < 0;
  const showNegativeSign = savingsAmount < 0;

  const formatBucketShare = (amt: number): string => {
    const pct = totalIncome > 0 || totalExpenses > 0 ? Math.round((amt / denom) * 100) : 0;
    return isSpendDenom ? `${pct}% of spend` : `${pct}%`;
  };

  const savedLabel = isZeroIncomeSpend
    ? 'Net Outflow'
    : isDeficit
    ? 'Overspent'
    : BUCKETS.saved.label;

  const savedSubBadge = isZeroIncomeSpend
    ? 'No income'
    : isDeficit
    ? `${Math.round((Math.abs(savingsAmount) / Math.max(totalIncome, 1)) * 100)}% over`
    : totalIncome > 0
    ? `${Math.round((savingsAmount / totalIncome) * 100)}%`
    : '0%';

  const cols: StatCol[] = [
    {
      key: 'income',
      route: 'income',
      label: 'Income',
      dotColor: bucketColor('saved'),
      isInflow: true,
      amount: totalIncome,
      deltaCurrent: totalIncome,
      prior: priorMetrics?.income,
      kind: 'income',
      subBadge: 'Inflow',
      testId: 'kpi-total-income',
      momTestId: 'mom-delta-income',
      drillTestId: 'drill-down-income',
      layoutId: 'bucket-amount-income',
    },
    {
      key: 'fixed',
      route: BUCKETS.fixed.route,
      label: BUCKETS.fixed.label,
      dotColor: bucketColor('fixed'),
      amount: fixedExpenses,
      bucketBudget: selectedMonth !== 'all' ? fixedBudget : 0,
      deltaCurrent: fixedExpenses,
      prior: priorMetrics?.fixed,
      kind: 'expense',
      subBadge: formatBucketShare(fixedExpenses),
      testId: 'kpi-fixed-expenses',
      momTestId: 'mom-delta-fixed',
      drillTestId: 'drill-down-fixed',
      layoutId: `bucket-amount-${BUCKETS.fixed.route}`,
    },
    {
      key: 'flexible',
      route: BUCKETS.flexible.route,
      label: BUCKETS.flexible.label,
      dotColor: bucketColor('flexible'),
      amount: flexibleExpenses,
      bucketBudget: selectedMonth !== 'all' ? variableBudget : 0,
      deltaCurrent: flexibleExpenses,
      prior: priorMetrics?.flexible,
      kind: 'expense',
      subBadge: formatBucketShare(flexibleExpenses),
      testId: 'kpi-flexible-spent',
      momTestId: 'mom-delta-flexible',
      drillTestId: 'drill-down-variable',
      layoutId: `bucket-amount-${BUCKETS.flexible.route}`,
    },
    {
      key: 'non-monthly',
      route: BUCKETS['non-monthly'].route,
      label: BUCKETS['non-monthly'].label,
      dotColor: bucketColor('non-monthly'),
      amount: nonMonthlyExpenses,
      deltaCurrent: nonMonthlyExpenses,
      prior: priorMetrics?.nonMonthly,
      kind: 'expense',
      subBadge: formatBucketShare(nonMonthlyExpenses),
      testId: 'kpi-non-monthly',
      momTestId: 'mom-delta-non-monthly',
      drillTestId: 'drill-down-non-monthly',
      layoutId: `bucket-amount-${BUCKETS['non-monthly'].route}`,
    },
    {
      key: 'saved',
      route: BUCKETS.saved.route,
      label: savedLabel,
      dotColor: isDeficit
        ? negativeColor()
        : isZeroIncomeSpend
        ? 'hsl(var(--muted-foreground))'
        : bucketColor('saved'),
      showMinusSign: showNegativeSign,
      isNegativeTone: isDeficit,
      amount: Math.abs(savingsAmount),
      deltaCurrent: savingsAmount,
      prior: priorMetrics?.savings,
      kind: 'saved',
      subBadge: savedSubBadge,
      testId: 'kpi-saved-stat',
      momTestId: 'mom-delta-savings',
      drillTestId: 'drill-down-saved',
    },
  ];

  const comparisonLabel = priorComparisonLabel || priorMonthKey || 'last month';

  return (
    <div className={`grid grid-cols-2 lg:grid-cols-5 gap-2 ${className}`}>
      {cols.map(col => {
        const parts = splitMoneyParts(col.amount);
        const displayWhole = col.showMinusSign ? `-${parts.whole}` : parts.whole;
        const d = suppressMomDelta
          ? { text: '—', tone: 'neutral' as const }
          : delta(
              col.deltaCurrent,
              hasPriorMonthData && col.prior !== undefined ? col.prior : null,
              col.kind,
              comparisonLabel
            );

        const showBudgetBar = Boolean(col.bucketBudget && col.bucketBudget > 0);
        const overBucketBudget = showBudgetBar && col.amount > (col.bucketBudget || 0);
        const budgetPct = showBudgetBar
          ? Math.min(100, Math.max(0, (col.amount / (col.bucketBudget || 1)) * 100))
          : 0;

        return (
          <motion.button
            key={col.key}
            type="button"
            data-testid={isOverview ? col.drillTestId : undefined}
            onClick={() => navigate(`#/month/${selectedMonth}/bucket/${col.route}`)}
            className={`w-full min-h-[44px] p-2 rounded-[10px] bg-surface2/35 lg:bg-transparent hover:bg-surface2 transition-colors text-left flex flex-col items-start justify-between gap-1 focus-visible:ring-2 ring-ring/40 ring-offset-2 ring-offset-background ${
              col.isInflow
                ? 'col-span-2 lg:col-span-1 lg:border-r lg:border-border/60 lg:rounded-r-none lg:pr-3'
                : ''
            }`}
          >
            {/* Dot + Label */}
            <div className="flex items-center justify-between w-full gap-1.5">
              <div className="flex items-center gap-1.5 min-w-0">
                <span
                  className={`w-2 h-2 rounded-full shrink-0 ${
                    col.isInflow ? 'ring-2 ring-bucket-saved/30' : ''
                  }`}
                  style={{ backgroundColor: col.dotColor }}
                />
                <span className="text-label text-muted-foreground font-medium truncate">
                  {col.label}
                </span>
                {col.badgeTag && (
                  <span className="px-1 py-0.2 rounded bg-surface2 text-[10px] leading-3.5 text-muted-foreground font-medium shrink-0">
                    {col.badgeTag}
                  </span>
                )}
              </div>
              <ChevronRight className="w-3.5 h-3.5 text-faint lg:hidden shrink-0" />
            </div>

            {/* Amount + Sub-badge */}
            <div className="flex items-baseline flex-wrap gap-x-2 gap-y-0.5">
              <motion.span
                layoutId={col.layoutId}
                layout={col.layoutId ? 'position' : false}
                transition={spring}
                data-testid={isOverview ? col.testId : undefined}
                className={`text-[18px] sm:text-[19px] leading-[22px] font-semibold tracking-tight tabular-nums num inline-block ${
                  col.isNegativeTone ? 'text-negative' : 'text-foreground'
                }`}
              >
                <RollingNumber value={displayWhole} srSuffix={parts.cents} />
              </motion.span>
              <span className="text-label text-muted-foreground tabular-nums num whitespace-nowrap">
                {col.subBadge}
              </span>
            </div>

            {/* Optional 3px Bucket Budget Health Bar */}
            {showBudgetBar && (
              <div className="w-full h-[3px] bg-surface2 rounded-full overflow-hidden">
                <div
                  style={{
                    width: `${budgetPct}%`,
                    backgroundColor: overBucketBudget ? negativeColor() : col.dotColor,
                  }}
                  className="h-full rounded-full"
                />
              </div>
            )}

            {/* MoM Delta Row */}
            <span
              data-testid={isOverview ? col.momTestId : undefined}
              className={`inline-block text-label tabular-nums num truncate max-w-full ${deltaToneClass(
                d.tone
              )}`}
            >
              {d.text}
            </span>
          </motion.button>
        );
      })}
    </div>
  );
};
