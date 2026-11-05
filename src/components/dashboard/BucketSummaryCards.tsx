import React from 'react';
import { motion } from 'framer-motion';
import { TrendingUp, Shield, ShoppingBag, Calendar, ArrowRight } from 'lucide-react';
import { useNavigation } from '../../hooks/useNavigation';
import { formatCurrency, formatExpenseCurrency } from '../../utils/formatters';

export interface BucketSummaryCardsProps {
  totalIncome: number;
  totalExpenses: number;
  fixedExpenses: number;
  flexibleExpenses: number;
  nonMonthlyExpenses: number;
  selectedBucket?: 'income' | 'fixed' | 'flexible' | 'non-monthly' | null;
  onSelectBucket?: (b: 'income' | 'fixed' | 'flexible' | 'non-monthly' | null) => void;
  priorMetrics?: {
    income: number;
    fixed: number;
    flexible: number;
    nonMonthly?: number;
    expenses: number;
  } | null;
  hasPriorMonthData?: boolean;
  className?: string;
}

export type BucketCardId = 'income' | 'fixed' | 'flexible' | 'non-monthly';

interface BucketCardItem {
  id: BucketCardId;
  title: string;
  amount: number;
  testId: string;
  momTestId: string;
  icon: React.ComponentType<{ className?: string }>;
  color: string;
  borderColor: string;
  activeBorder: string;
  bgGlow: string;
  sublabel: string;
  drillBucket: string;
  momDelta: React.ReactNode;
}

function renderMomDeltaBadge(
  current: number,
  prior: number | undefined,
  isExpense: boolean,
  hasPriorMonthData: boolean,
  fallbackText: string = 'No prior month data'
): React.ReactNode {
  if (!hasPriorMonthData || prior === undefined) {
    return <span className="text-muted-foreground text-[10px]">{fallbackText}</span>;
  }
  if (prior <= 0) {
    return <span className="text-muted-foreground text-[10px]">{fallbackText}</span>;
  }
  const deltaPct = ((current - prior) / prior) * 100;
  if (Math.abs(deltaPct) < 0.05) {
    return <span className="text-muted-foreground text-[10px]">{fallbackText}</span>;
  }
  const isPositiveTone = isExpense ? deltaPct < 0 : deltaPct > 0;
  const toneClasses = isPositiveTone
    ? 'text-emerald-400 bg-emerald-500/10'
    : 'text-rose-400 bg-rose-500/10';
  const sign = deltaPct > 0 ? '+' : '';
  return (
    <span className={`${toneClasses} px-1.5 py-0.5 rounded font-semibold tabular-nums font-sans`}>
      {sign}{deltaPct.toFixed(1)}% MoM
    </span>
  );
}

export const BucketSummaryCards: React.FC<BucketSummaryCardsProps> = ({
  totalIncome,
  totalExpenses,
  fixedExpenses,
  flexibleExpenses,
  nonMonthlyExpenses,
  selectedBucket,
  onSelectBucket,
  priorMetrics,
  hasPriorMonthData = false,
  className = ''
}) => {
  const { currentRoute, navigate } = useNavigation();
  const activeMonth = currentRoute.month || new Date().toISOString().substring(0, 7);

  const denom = Math.max(totalIncome, totalExpenses, 1);
  const fixedPct = Math.min(100, Math.max(0, (fixedExpenses / denom) * 100));
  const flexSpentPct = Math.min(100, Math.max(0, (flexibleExpenses / denom) * 100));
  const nonMonthlyPct = Math.min(100, Math.max(0, (nonMonthlyExpenses / denom) * 100));

  const cards: BucketCardItem[] = [
    {
      id: 'income',
      title: '1. Total Inflow',
      amount: totalIncome,
      testId: 'kpi-total-income',
      momTestId: 'mom-delta-income',
      icon: TrendingUp,
      color: 'text-emerald-400',
      borderColor: 'border-emerald-500/30',
      activeBorder: 'border-emerald-500',
      bgGlow: 'from-emerald-500/10',
      sublabel: 'Starting cash',
      drillBucket: 'income',
      momDelta: renderMomDeltaBadge(totalIncome, priorMetrics?.income, false, hasPriorMonthData)
    },
    {
      id: 'fixed',
      title: '2. Fixed Commitments',
      amount: fixedExpenses,
      testId: 'kpi-fixed-expenses',
      momTestId: 'mom-delta-fixed',
      icon: Shield,
      color: 'text-indigo-400',
      borderColor: 'border-indigo-500/30',
      activeBorder: 'border-indigo-500',
      bgGlow: 'from-indigo-500/10',
      sublabel: `Bills (${fixedPct.toFixed(0)}%)`,
      drillBucket: 'fixed',
      momDelta: renderMomDeltaBadge(fixedExpenses, priorMetrics?.fixed, true, hasPriorMonthData)
    },
    {
      id: 'flexible',
      title: '3. Variable Spend',
      amount: flexibleExpenses,
      testId: 'kpi-flexible-spent',
      momTestId: 'mom-delta-flexible',
      icon: ShoppingBag,
      color: 'text-violet-400',
      borderColor: 'border-violet-500/30',
      activeBorder: 'border-violet-500',
      bgGlow: 'from-violet-500/10',
      sublabel: `Daily (${flexSpentPct.toFixed(0)}%)`,
      drillBucket: 'variable',
      momDelta: renderMomDeltaBadge(flexibleExpenses, priorMetrics?.flexible, true, hasPriorMonthData)
    },
    {
      id: 'non-monthly',
      title: '4. Non-Monthly',
      amount: nonMonthlyExpenses,
      testId: 'kpi-non-monthly',
      momTestId: 'mom-delta-non-monthly',
      icon: Calendar,
      color: 'text-amber-400',
      borderColor: 'border-amber-500/30',
      activeBorder: 'border-amber-500',
      bgGlow: 'from-amber-500/10',
      sublabel: `Irregular (${nonMonthlyPct.toFixed(0)}%)`,
      drillBucket: 'non-monthly',
      momDelta: renderMomDeltaBadge(
        nonMonthlyExpenses,
        priorMetrics?.nonMonthly,
        true,
        hasPriorMonthData,
        'Periodic buffer'
      )
    }
  ];

  const handleDrillToBucket = (drillBucket: string) => {
    if (onSelectBucket) {
      onSelectBucket(null);
    }
    navigate(`#/month/${activeMonth}/bucket/${drillBucket}`);
  };

  return (
    <div className={`grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2.5 ${className}`}>
      {cards.map(c => {
        const Icon = c.icon;
        const isSelected = selectedBucket === c.id;

        return (
          <motion.div
            key={c.id}
            layoutId={`bucket-card-${c.drillBucket}`}
            className={`p-3 rounded-2xl border transition-all relative flex flex-col justify-between bg-card/80 backdrop-blur-md shadow-sm hover:shadow-md ${
              isSelected
                ? `${c.activeBorder} ring-2 ring-primary/40 bg-gradient-to-br ${c.bgGlow} to-card`
                : `${c.borderColor} hover:border-border/80`
            }`}
          >
            {/* Top row: Title and Icon */}
            <div className="flex items-center justify-between gap-2 mb-1">
              <span className={`text-[11px] font-extrabold uppercase tracking-wider ${c.color}`}>
                {c.title}
              </span>
              <div className="p-1 rounded-lg bg-secondary/60 text-foreground shrink-0">
                <Icon className="w-3.5 h-3.5" />
              </div>
            </div>

            {/* Middle: Amount (Clickable to drill into bucket) */}
            <button
              type="button"
              data-testid={c.testId}
              onClick={() => handleDrillToBucket(c.drillBucket)}
              className="text-left py-0.5 group/btn focus:outline-none"
              title={`Drill into ${c.title}`}
            >
              <div className="text-xl sm:text-2xl font-extrabold font-sans tracking-tight tabular-nums text-foreground group-hover/btn:text-primary transition-colors">
                {c.id === 'income' ? formatCurrency(c.amount) : formatExpenseCurrency(c.amount)}
              </div>
              <div className="flex items-center justify-between text-[11px] text-muted-foreground mt-0.5">
                <span>{c.sublabel}</span>
                {c.momDelta && (
                  <span data-testid={c.momTestId}>{c.momDelta}</span>
                )}
              </div>
            </button>

            {/* Bottom: Direct Level 2 Drill-Down CTA */}
            <div className="mt-1.5 pt-1.5 border-t border-border/40 flex items-center justify-between">
              <button
                type="button"
                data-testid={`drill-down-${c.drillBucket}`}
                onClick={() => handleDrillToBucket(c.drillBucket)}
                className="inline-flex items-center gap-1 text-[11px] font-bold text-primary hover:text-primary/80 transition-colors focus:outline-none"
                title={`Drill into ${c.title}`}
              >
                <span>Drill down</span>
                <ArrowRight className="w-3 h-3" />
              </button>

              {isSelected && (
                <span className="px-1.5 py-0.5 rounded text-[9px] font-mono bg-primary/20 text-primary uppercase font-bold">
                  Filtered
                </span>
              )}
            </div>
          </motion.div>
        );
      })}
    </div>
  );
};
