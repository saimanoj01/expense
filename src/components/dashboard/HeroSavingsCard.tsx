import React from 'react';
import { motion } from 'framer-motion';
import { TrendingUp, TrendingDown, PiggyBank } from 'lucide-react';
import { useCountUp } from '../../hooks/useCountUp';
import { formatCurrency } from '../../utils/formatters';

export interface HeroSavingsCardProps {
  savingsAmount: number;
  savingsRate: number;
  totalIncome: number;
  totalExpenses?: number;
  totalBudget?: number;
  flexNumber?: number;
  priorSavingsAmount?: number;
  hasPriorMonthData?: boolean;
  className?: string;
}

export const HeroSavingsCard: React.FC<HeroSavingsCardProps> = ({
  savingsAmount,
  savingsRate,
  totalIncome,
  totalExpenses = 0,
  totalBudget = 0,
  flexNumber,
  priorSavingsAmount,
  hasPriorMonthData = false,
  className = ''
}) => {
  const isPositive = savingsAmount > 0;
  const isDeficit = savingsAmount < 0;

  // Tabular animated counter for Net Savings
  const formattedSavings = useCountUp(
    Math.abs(savingsAmount),
    600,
    (val) => {
      const prefix = isDeficit ? '-$' : isPositive ? '+$' : '$';
      return `${prefix}${val.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
    }
  );

  // Animated savings rate string
  const savingsRateDisplay = totalIncome > 0
    ? `${savingsRate.toFixed(1)}%`
    : '—';

  // MoM comparison for savings amount
  const momDelta = hasPriorMonthData && priorSavingsAmount !== undefined && Number.isFinite(priorSavingsAmount)
    ? savingsAmount - priorSavingsAmount
    : null;

  return (
    <motion.div
      data-testid="hero-savings-card"
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25 }}
      className={`relative overflow-hidden rounded-2xl p-4 border shadow-md flex flex-col justify-between ${
        isDeficit
          ? 'bg-gradient-to-br from-rose-500/10 via-card to-card border-rose-500/30 shadow-rose-500/5'
          : 'bg-gradient-to-br from-emerald-500/10 via-card to-card border-emerald-500/30 shadow-emerald-500/5'
      } ${className}`}
    >
      {/* Background Accent Glow */}
      <div 
        className={`absolute -top-12 -right-12 w-36 h-36 rounded-full blur-3xl pointer-events-none ${
          isDeficit ? 'bg-rose-500/15' : 'bg-emerald-500/15'
        }`} 
      />

      {/* Top Header */}
      <div className="flex items-center justify-between gap-3 relative z-10">
        <div className="flex items-center gap-2">
          <div className={`p-2 rounded-xl shrink-0 ${
            isDeficit ? 'bg-rose-500/15 text-rose-400' : 'bg-emerald-500/15 text-emerald-400'
          }`}>
            <PiggyBank className="w-5 h-5" />
          </div>
          <div>
            <h3 className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
              Net Savings & Surplus
            </h3>
            <span className="text-[10px] text-muted-foreground/80">Monthly Retained Wealth</span>
          </div>
        </div>

        {/* Luminous Savings Rate Badge */}
        <div
          data-testid="kpi-savings-rate"
          className={`flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-extrabold tabular-nums border shadow-sm ${
            isDeficit
              ? 'bg-rose-500/20 text-rose-400 border-rose-500/30'
              : savingsRate >= 20
              ? 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30 shadow-emerald-500/20'
              : 'bg-amber-500/20 text-amber-400 border-amber-500/30'
          }`}
          title="Monthly Savings Rate"
        >
          {isPositive ? <TrendingUp className="w-3.5 h-3.5" /> : isDeficit ? <TrendingDown className="w-3.5 h-3.5" /> : null}
          <span>{savingsRateDisplay} Savings Rate</span>
        </div>
      </div>

      {/* Primary Hero Figure */}
      <div className="my-1.5 relative z-10">
        <div
          data-testid="kpi-savings-amount"
          className={`text-4xl sm:text-5xl font-extrabold tracking-tight tabular-nums font-sans ${
            isDeficit ? 'text-rose-400' : isPositive ? 'text-emerald-400' : 'text-foreground'
          }`}
        >
          {formattedSavings}
        </div>

        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground mt-1.5">
          {totalIncome > 0 ? (
            isDeficit ? (
              <span>
                Exceeded income by <span className="font-semibold text-rose-400 tabular-nums">{formatCurrency(Math.abs(savingsAmount))}</span>
              </span>
            ) : (
              <span>
                Retained <span className="font-semibold text-emerald-400 tabular-nums">{savingsRateDisplay}</span> of <span className="font-medium text-foreground tabular-nums">{formatCurrency(totalIncome)}</span> inflow
              </span>
            )
          ) : (
            <span>No income recorded for this period.</span>
          )}

          <span className="text-muted-foreground/40">•</span>

          <span className="inline-flex items-center gap-1">
            <span>Outflow:</span>
            <span
              data-testid="kpi-total-expenses"
              className="font-semibold text-foreground tabular-nums overflow-hidden truncate max-w-[140px] inline-block align-bottom"
              title={`Total Expenses: ${formatCurrency(totalExpenses)}`}
            >
              {formatCurrency(totalExpenses)}
            </span>
          </span>

          {totalBudget > 0 && (
            <>
              <span className="text-muted-foreground/40">•</span>
              <span className="inline-flex items-center gap-1">
                <span>Budget:</span>
                <span
                  data-testid="kpi-total-budget"
                  className="font-semibold text-foreground tabular-nums"
                  title={`Total Budget: ${formatCurrency(totalBudget)}`}
                >
                  {formatCurrency(totalBudget)}
                </span>
              </span>
            </>
          )}
        </div>
      </div>

      {/* Footer Metrics: MoM Delta & Accessible Flex Number */}
      <div className="pt-2 border-t border-border/40 flex items-center justify-between text-xs relative z-10">
        {momDelta !== null ? (
          <div className="flex items-center gap-1.5 font-medium">
            <span className="text-muted-foreground text-[11px]">vs prior month:</span>
            <span className={`inline-flex items-center gap-0.5 text-xs font-semibold tabular-nums font-sans ${
              momDelta >= 0 ? 'text-emerald-400' : 'text-rose-400'
            }`}>
              {momDelta >= 0 ? '+' : ''}{formatCurrency(momDelta)}
            </span>
          </div>
        ) : (
          <span className="text-muted-foreground text-[11px]">First recorded month</span>
        )}

        {flexNumber !== undefined && (
          <div 
            data-testid="kpi-flex-number"
            className="flex items-center gap-1 text-[11px] text-muted-foreground"
            title="Flex Number: Inflow minus fixed commitments and non-monthly irregulars"
          >
            <span>Flex Pool:</span>
            <span className="font-sans font-semibold text-foreground tabular-nums">
              {formatCurrency(Math.max(0, flexNumber))}
            </span>
          </div>
        )}
      </div>
    </motion.div>
  );
};
