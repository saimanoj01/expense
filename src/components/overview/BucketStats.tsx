import React from 'react';
import { motion } from 'framer-motion';
import { ChevronRight } from 'lucide-react';
import { BUCKETS, bucketColor, BucketKey } from '../../theme/buckets';
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
  priorMetrics?: {
    income: number;
    fixed: number;
    flexible: number;
    nonMonthly?: number;
    expenses: number;
    savings: number;
  } | null;
  priorMonthKey?: string | null;
  hasPriorMonthData?: boolean;
  className?: string;
}

interface StatCol {
  key: BucketKey;
  route: string;
  label: string;
  amount: number;
  prior: number | undefined;
  kind: DeltaKind;
  testId: string;
  momTestId: string;
  drillTestId: string;
}

export const BucketStats: React.FC<BucketStatsProps> = ({
  selectedMonth,
  totalIncome,
  totalExpenses,
  fixedExpenses,
  flexibleExpenses,
  nonMonthlyExpenses,
  savingsAmount,
  priorMetrics,
  priorMonthKey,
  hasPriorMonthData = false,
  className = '',
}) => {
  const { navigate, currentRoute } = useNavigation();
  const isOverview = currentRoute.view === 'overview';
  const denom = Math.max(totalIncome, totalExpenses, 1);

  const cols: StatCol[] = [
    {
      key: 'fixed',
      route: BUCKETS.fixed.route,
      label: BUCKETS.fixed.label,
      amount: fixedExpenses,
      prior: priorMetrics?.fixed,
      kind: 'expense',
      testId: 'kpi-fixed-expenses',
      momTestId: 'mom-delta-fixed',
      drillTestId: 'drill-down-fixed',
    },
    {
      key: 'flexible',
      route: BUCKETS.flexible.route,
      label: BUCKETS.flexible.label,
      amount: flexibleExpenses,
      prior: priorMetrics?.flexible,
      kind: 'expense',
      testId: 'kpi-flexible-spent',
      momTestId: 'mom-delta-flexible',
      drillTestId: 'drill-down-variable',
    },
    {
      key: 'non-monthly',
      route: BUCKETS['non-monthly'].route,
      label: BUCKETS['non-monthly'].label,
      amount: nonMonthlyExpenses,
      prior: priorMetrics?.nonMonthly,
      kind: 'expense',
      testId: 'kpi-non-monthly',
      momTestId: 'mom-delta-non-monthly',
      drillTestId: 'drill-down-non-monthly',
    },
    {
      key: 'saved',
      route: BUCKETS.saved.route,
      label: BUCKETS.saved.label,
      amount: Math.max(0, savingsAmount),
      prior: priorMetrics?.savings,
      kind: 'saved',
      testId: 'kpi-saved-stat',
      momTestId: 'mom-delta-savings',
      drillTestId: 'drill-down-income',
    },
  ];

  return (
    <div
      className={`grid grid-cols-1 sm:grid-cols-4 divide-y sm:divide-y-0 divide-border/60 sm:gap-2 ${className}`}
    >
      {cols.map(col => {
        const pct = totalIncome > 0 || totalExpenses > 0 ? Math.round((col.amount / denom) * 100) : 0;
        const parts = splitMoneyParts(col.amount);
        const d = delta(
          col.amount,
          hasPriorMonthData && col.prior !== undefined ? col.prior : null,
          col.kind,
          priorMonthKey || 'last month'
        );

        return (
          <motion.button
            key={col.key}
            type="button"
            data-testid={isOverview ? col.drillTestId : undefined}
            onClick={() => navigate(`#/month/${selectedMonth}/bucket/${col.route}`)}
            className="w-full min-h-[52px] sm:min-h-[44px] py-2.5 sm:p-2.5 rounded-none sm:rounded-[10px] hover:bg-surface2 transition-colors text-left flex sm:flex-col items-center sm:items-start justify-between gap-2 focus-visible:ring-2 ring-ring/40 ring-offset-2 ring-offset-background"
          >
            {/* Dot + Label */}
            <div className="flex items-center gap-2">
              <span
                className="w-2 h-2 rounded-full shrink-0"
                style={{ backgroundColor: bucketColor(col.key) }}
              />
              <span className="text-body sm:text-label text-muted-foreground font-medium">
                {col.label}
              </span>
            </div>

            {/* Amount + % + Mobile Chevron */}
            <div className="flex items-baseline gap-2 sm:mt-1">
              <motion.span
                layoutId={`bucket-amount-${col.route}`}
                layout="position"
                transition={spring}
                data-testid={isOverview ? col.testId : undefined}
                className="text-[18px] sm:text-[20px] leading-[24px] font-semibold tracking-tight tabular-nums num text-foreground inline-block"
              >
                <RollingNumber value={parts.whole} srSuffix={parts.cents} />
              </motion.span>
              <span className="text-label text-muted-foreground tabular-nums num">
                {pct}%
              </span>
              <ChevronRight className="w-4 h-4 text-faint sm:hidden ml-1" />
            </div>

            {/* MoM Delta Row */}
            <span
              data-testid={isOverview ? col.momTestId : undefined}
              className={`sr-only sm:not-sr-only sm:inline-block text-label tabular-nums num mt-0.5 ${deltaToneClass(d.tone)}`}
            >
              {d.text}
              {hasPriorMonthData && col.prior !== undefined && col.prior > 0 && (
                <span className="sr-only">
                  {' '}
                  {((col.amount - col.prior) / col.prior) * 100 >= 0 ? '+' : ''}
                  {(((col.amount - col.prior) / col.prior) * 100).toFixed(1)}% MoM
                </span>
              )}
            </span>
          </motion.button>
        );
      })}
    </div>
  );
};
