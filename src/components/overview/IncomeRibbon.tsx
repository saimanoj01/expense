import React, { useEffect, useRef } from 'react';
import { motion, useReducedMotion } from 'framer-motion';
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
  const reduced = useReducedMotion();
  const hasPlayedIntroRef = useRef(false);
  const shouldAnimateIntro = !hasPlayedIntroRef.current && !reduced;

  useEffect(() => {
    hasPlayedIntroRef.current = true;
  }, []);

  const totalExpenses = fixedExpenses + flexibleExpenses + nonMonthlyExpenses;
  const isEmpty = totalIncome === 0 && totalExpenses === 0;
  const isDeficit = totalIncome > 0 && savingsAmount < 0;
  const savedPositive = Math.max(0, savingsAmount);
  const total = Math.max(totalIncome, totalExpenses, 1);

  const activeExpenseSegments = [
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
  ].filter(seg => seg.amount > 0);

  if (isEmpty) {
    return (
      <div
        data-testid="income-allocation-ring"
        className={`relative w-full ${className}`}
      >
        <div
          aria-label="No income or spending recorded yet"
          className="w-full h-2.5 rounded-[6px] bg-surface2 border border-border/50"
        />
      </div>
    );
  }

  // Non-overlapping deficit geometry (BUG-17b)
  if (isDeficit && totalExpenses > 0) {
    const incomeSharePct = Math.min(96, Math.max(8, (totalIncome / totalExpenses) * 100));
    const markerLabelAlign =
      incomeSharePct > 90
        ? 'right-0 translate-x-0 items-end'
        : incomeSharePct < 10
        ? 'left-0 translate-x-0 items-start'
        : '-translate-x-1/2 items-center';

    return (
      <div
        data-testid="income-allocation-ring"
        className={`relative w-full pt-3 ${className}`}
      >
        <div className="flex items-center w-full h-2.5 gap-[2px]">
          <div
            style={{ width: `${incomeSharePct}%` }}
            className="flex items-center h-full gap-[2px]"
          >
            {activeExpenseSegments.map((seg, idx) => {
              const pct = Math.round((seg.amount / totalExpenses) * 100);
              const isFirst = idx === 0;
              return (
                <motion.button
                  key={seg.key}
                  type="button"
                  layoutId={`bucket-bar-${seg.route}`}
                  initial={shouldAnimateIntro ? { scaleX: 0 } : false}
                  animate={{ scaleX: 1 }}
                  transition={
                    shouldAnimateIntro ? { ...spring, delay: idx * 0.06 } : spring
                  }
                  onClick={() => navigate(`#/month/${selectedMonth}/bucket/${seg.route}`)}
                  aria-label={`${seg.label}, ${formatMoney(seg.amount)}, ${pct}% of spend. Open ${seg.label}`}
                  style={{
                    flexGrow: seg.amount,
                    minWidth: 4,
                    backgroundColor: seg.color,
                    transformOrigin: 'left',
                  }}
                  className={`relative after:content-[''] after:absolute after:-inset-y-2 after:inset-x-0 h-full transition-opacity hover:opacity-85 focus-visible:ring-2 ring-ring/40 ring-offset-2 ring-offset-background ${
                    isFirst ? 'rounded-l-[6px]' : ''
                  }`}
                />
              );
            })}
          </div>

          <motion.button
            key="overspent"
            type="button"
            data-testid="ribbon-overspent-segment"
            initial={shouldAnimateIntro ? { scaleX: 0 } : false}
            animate={{ scaleX: 1 }}
            transition={shouldAnimateIntro ? { ...spring, delay: 0.18 } : spring}
            onClick={() => navigate(`#/month/${selectedMonth}/bucket/income`)}
            aria-label={`Overspent, ${formatMoney(Math.abs(savingsAmount))}. Open Income & saved`}
            style={{
              width: `${100 - incomeSharePct}%`,
              minWidth: 6,
              backgroundImage:
                'repeating-linear-gradient(45deg, hsl(var(--c-negative) / 0.55) 0px, hsl(var(--c-negative) / 0.55) 4px, transparent 4px, transparent 8px)',
              transformOrigin: 'left',
            }}
            className="relative after:content-[''] after:absolute after:-inset-y-2 after:inset-x-0 h-full rounded-r-[6px] border border-negative/80 transition-opacity hover:opacity-90 focus-visible:ring-2 ring-ring/40 ring-offset-2 ring-offset-background"
          />
        </div>

        <div
          style={{ left: `${incomeSharePct}%` }}
          className={`absolute top-0 flex flex-col pointer-events-none z-10 ${markerLabelAlign}`}
        >
          <span className="text-[10px] leading-none text-muted-foreground mb-0.5 whitespace-nowrap">
            Income
          </span>
          <div className="w-[2px] h-3 bg-foreground rounded-full" />
        </div>
      </div>
    );
  }

  // Surplus or Zero-Income Expense Bar (only mount active >0 buttons! BUG-17c)
  const hasSavedSegment = savedPositive > 0;
  const totalMounted = activeExpenseSegments.length + (hasSavedSegment ? 1 : 0);

  return (
    <div
      data-testid="income-allocation-ring"
      className={`relative w-full ${className}`}
    >
      <div className="flex items-center w-full h-2.5 rounded-[6px] gap-[2px] bg-surface2">
        {activeExpenseSegments.map((seg, idx) => {
          const pct = Math.round((seg.amount / total) * 100);
          const pctLabel = totalExpenses > totalIncome ? `${pct}% of spend` : `${pct}% of income`;
          const isFirst = idx === 0;
          const isLast = !hasSavedSegment && idx === activeExpenseSegments.length - 1;
          return (
            <motion.button
              key={seg.key}
              type="button"
              layoutId={`bucket-bar-${seg.route}`}
              initial={shouldAnimateIntro ? { scaleX: 0 } : false}
              animate={{ scaleX: 1 }}
              transition={
                shouldAnimateIntro ? { ...spring, delay: idx * 0.06 } : spring
              }
              onClick={() => navigate(`#/month/${selectedMonth}/bucket/${seg.route}`)}
              aria-label={`${seg.label}, ${formatMoney(seg.amount)}, ${pctLabel}. Open ${seg.label}`}
              style={{
                flexGrow: seg.amount,
                minWidth: 4,
                backgroundColor: seg.color,
                transformOrigin: 'left',
              }}
              className={`relative after:content-[''] after:absolute after:-inset-y-2 after:inset-x-0 h-full transition-opacity hover:opacity-85 focus-visible:ring-2 ring-ring/40 ring-offset-2 ring-offset-background ${
                isFirst ? 'rounded-l-[6px]' : ''
              } ${isLast ? 'rounded-r-[6px]' : ''}`}
            />
          );
        })}

        {hasSavedSegment && (
          <motion.button
            key="saved"
            type="button"
            layoutId="bucket-bar-income"
            initial={shouldAnimateIntro ? { scaleX: 0 } : false}
            animate={{ scaleX: 1 }}
            transition={shouldAnimateIntro ? { ...spring, delay: 0.18 } : spring}
            onClick={() => navigate(`#/month/${selectedMonth}/bucket/income`)}
            aria-label={`Saved, ${formatMoney(savedPositive)}, ${Math.round(
              (savedPositive / total) * 100
            )}% of income. Open Income & saved`}
            style={{
              flexGrow: savedPositive,
              minWidth: 4,
              backgroundColor: bucketColor('saved'),
              transformOrigin: 'left',
            }}
            className={`relative after:content-[''] after:absolute after:-inset-y-2 after:inset-x-0 h-full rounded-r-[6px] transition-opacity hover:opacity-85 focus-visible:ring-2 ring-ring/40 ring-offset-2 ring-offset-background ${
              totalMounted === 1 ? 'rounded-l-[6px]' : ''
            }`}
          />
        )}
      </div>
    </div>
  );
};
