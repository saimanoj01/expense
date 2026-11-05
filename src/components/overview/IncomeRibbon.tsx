import React from 'react';
import { motion } from 'framer-motion';
import { BUCKETS, bucketColor } from '../../theme/buckets';
import { spring } from '../../theme/motion';
import { formatMoney } from '../../utils/formatters';
import { useNavigation } from '../../hooks/useNavigation';

export interface IncomeRibbonProps {
  selectedMonth: string;
  totalIncome: number;
  fixedExpenses: number;
  flexibleExpenses: number;
  nonMonthlyExpenses: number;
  savingsAmount: number;
  className?: string;
}

export const IncomeRibbon: React.FC<IncomeRibbonProps> = ({
  selectedMonth,
  totalIncome,
  fixedExpenses,
  flexibleExpenses,
  nonMonthlyExpenses,
  savingsAmount,
  className = '',
}) => {
  const { navigate } = useNavigation();
  const totalExpenses = fixedExpenses + flexibleExpenses + nonMonthlyExpenses;
  const isDeficit = totalIncome > 0 && savingsAmount < 0;
  const savedPositive = Math.max(0, savingsAmount);
  const total = Math.max(totalIncome, totalExpenses, 1);

  const segments = [
    {
      key: 'fixed' as const,
      route: BUCKETS.fixed.route,
      label: BUCKETS.fixed.label,
      amount: fixedExpenses,
      color: bucketColor('fixed'),
    },
    {
      key: 'flexible' as const,
      route: BUCKETS.flexible.route,
      label: BUCKETS.flexible.label,
      amount: flexibleExpenses,
      color: bucketColor('flexible'),
    },
    {
      key: 'non-monthly' as const,
      route: BUCKETS['non-monthly'].route,
      label: BUCKETS['non-monthly'].label,
      amount: nonMonthlyExpenses,
      color: bucketColor('non-monthly'),
    },
  ];

  const incomeMarkerPct =
    isDeficit && totalExpenses > 0
      ? Math.min(98, Math.max(2, (totalIncome / totalExpenses) * 100))
      : null;

  return (
    <div
      data-testid="income-allocation-ring"
      className={`relative w-full ${className}`}
    >
      <div className="flex items-center w-full h-3 rounded-[6px] overflow-hidden gap-[2px] bg-surface2">
        {segments.map(seg => {
          if (seg.amount <= 0 && totalIncome === 0 && totalExpenses === 0) return null;
          const pct = Math.round((seg.amount / total) * 100);
          return (
            <motion.button
              key={seg.key}
              type="button"
              layoutId={`bucket-bar-${seg.route}`}
              transition={spring}
              onClick={() => navigate(`#/month/${selectedMonth}/bucket/${seg.route}`)}
              aria-label={`${seg.label}, ${formatMoney(seg.amount)}, ${pct}% of income. Open ${seg.label}`}
              style={{
                flexGrow: Math.max(seg.amount, 0),
                minWidth: seg.amount > 0 ? 4 : 0,
                backgroundColor: seg.color,
              }}
              className="h-full transition-opacity hover:opacity-85 focus-visible:ring-2 ring-ring/40"
            />
          );
        })}

        {isDeficit ? (
          <motion.button
            key="overspent"
            type="button"
            data-testid="ribbon-overspent-segment"
            onClick={() => navigate(`#/month/${selectedMonth}/bucket/income`)}
            aria-label={`Overspent, ${formatMoney(Math.abs(savingsAmount))}. Open Income & saved`}
            style={{
              flexGrow: Math.abs(savingsAmount),
              minWidth: 8,
              backgroundImage:
                'repeating-linear-gradient(45deg, hsl(var(--c-negative)), hsl(var(--c-negative)) 4px, hsl(var(--c-negative) / 0.25) 4px, hsl(var(--c-negative) / 0.25) 8px)',
            }}
            className="h-full transition-opacity hover:opacity-85 focus-visible:ring-2 ring-ring/40"
          />
        ) : (
          <motion.button
            key="saved"
            type="button"
            layoutId="bucket-bar-income"
            transition={spring}
            onClick={() => navigate(`#/month/${selectedMonth}/bucket/income`)}
            aria-label={`Saved, ${formatMoney(savedPositive)}, ${Math.round((savedPositive / total) * 100)}% of income. Open Income & saved`}
            style={{
              flexGrow: Math.max(savedPositive, totalIncome === 0 && totalExpenses === 0 ? 1 : 0),
              minWidth: savedPositive > 0 ? 4 : 0,
              backgroundColor: bucketColor('saved'),
            }}
            className="h-full transition-opacity hover:opacity-85 focus-visible:ring-2 ring-ring/40"
          />
        )}
      </div>

      {incomeMarkerPct !== null && (
        <div
          style={{ left: `${incomeMarkerPct}%` }}
          className="absolute -top-1 bottom-0 flex flex-col items-center pointer-events-none -translate-x-1/2"
        >
          <div className="w-[2px] h-5 bg-foreground rounded-full" />
          <span className="text-label text-muted-foreground mt-0.5 whitespace-nowrap">
            Income
          </span>
        </div>
      )}
    </div>
  );
};
