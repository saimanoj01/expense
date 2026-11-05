import React from 'react';
import { motion } from 'framer-motion';
import { TrendingUp, Shield, ShoppingBag, Calendar, ArrowRight } from 'lucide-react';
import { useNavigation } from '../../hooks/useNavigation';
import { formatMoney, splitMoneyParts } from '../../utils/formatters';
import { delta, deltaToneClass } from '../../utils/delta';

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
  priorMonthKey?: string | null;
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

export const BucketSummaryCards: React.FC<BucketSummaryCardsProps> = ({
  totalIncome,
  totalExpenses,
  fixedExpenses,
  flexibleExpenses,
  nonMonthlyExpenses,
  selectedBucket,
  onSelectBucket,
  priorMetrics,
  priorMonthKey,
  hasPriorMonthData = false,
  className = ''
}) => {
  const { currentRoute, navigate } = useNavigation();
  const activeMonth = currentRoute.month || new Date().toISOString().substring(0, 7);

  const denom = Math.max(totalIncome, totalExpenses, 1);
  const fixedPct = Math.min(100, Math.max(0, (fixedExpenses / denom) * 100));
  const flexSpentPct = Math.min(100, Math.max(0, (flexibleExpenses / denom) * 100));
  const nonMonthlyPct = Math.min(100, Math.max(0, (nonMonthlyExpenses / denom) * 100));

  const renderDeltaNode = (curr: number, prev: number | undefined | null, kind: 'income' | 'expense') => {
    const res = delta(curr, hasPriorMonthData && prev !== undefined ? prev : null, kind, priorMonthKey || 'last month');
    return (
      <span className={`${deltaToneClass(res.tone)} font-semibold tabular-nums font-sans text-xs`}>
        {res.text}
      </span>
    );
  };

  const cards: BucketCardItem[] = [
    {
      id: 'income',
      title: 'Income',
      amount: totalIncome,
      testId: 'kpi-total-income',
      momTestId: 'mom-delta-income',
      icon: TrendingUp,
      color: 'text-bucket-saved',
      borderColor: 'border-border',
      activeBorder: 'border-bucket-saved',
      bgGlow: 'from-surface2',
      sublabel: 'Total income',
      drillBucket: 'income',
      momDelta: renderDeltaNode(totalIncome, priorMetrics?.income, 'income')
    },
    {
      id: 'fixed',
      title: 'Fixed',
      amount: fixedExpenses,
      testId: 'kpi-fixed-expenses',
      momTestId: 'mom-delta-fixed',
      icon: Shield,
      color: 'text-bucket-fixed',
      borderColor: 'border-border',
      activeBorder: 'border-bucket-fixed',
      bgGlow: 'from-surface2',
      sublabel: `${fixedPct.toFixed(0)}% of income`,
      drillBucket: 'fixed',
      momDelta: renderDeltaNode(fixedExpenses, priorMetrics?.fixed, 'expense')
    },
    {
      id: 'flexible',
      title: 'Variable',
      amount: flexibleExpenses,
      testId: 'kpi-flexible-spent',
      momTestId: 'mom-delta-flexible',
      icon: ShoppingBag,
      color: 'text-bucket-variable',
      borderColor: 'border-border',
      activeBorder: 'border-bucket-variable',
      bgGlow: 'from-surface2',
      sublabel: `${flexSpentPct.toFixed(0)}% of income`,
      drillBucket: 'variable',
      momDelta: renderDeltaNode(flexibleExpenses, priorMetrics?.flexible, 'expense')
    },
    {
      id: 'non-monthly',
      title: 'Non-monthly',
      amount: nonMonthlyExpenses,
      testId: 'kpi-non-monthly',
      momTestId: 'mom-delta-non-monthly',
      icon: Calendar,
      color: 'text-bucket-nonmonthly',
      borderColor: 'border-border',
      activeBorder: 'border-bucket-nonmonthly',
      bgGlow: 'from-surface2',
      sublabel: `${nonMonthlyPct.toFixed(0)}% of income`,
      drillBucket: 'non-monthly',
      momDelta: renderDeltaNode(nonMonthlyExpenses, priorMetrics?.nonMonthly, 'expense')
    }
  ];

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

            {/* Middle: Amount (Clickable for filter toggle) */}
            <button
              type="button"
              data-testid={c.testId}
              onClick={() => onSelectBucket && onSelectBucket(isSelected ? null : c.id)}
              className="text-left py-0.5 group/btn focus:outline-none"
              title={formatMoney(c.amount)}
            >
              <div className="text-xl sm:text-2xl font-semibold font-sans tracking-tight tabular-nums num text-foreground group-hover/btn:text-primary transition-colors">
                {(() => {
                  const parts = splitMoneyParts(c.amount);
                  return (
                    <>
                      {parts.whole}
                      <span className="sr-only">{parts.cents}</span>
                    </>
                  );
                })()}
              </div>
              <div className="flex items-center justify-between text-xs text-muted-foreground mt-0.5">
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
                onClick={() => navigate(`#/month/${activeMonth}/bucket/${c.drillBucket}`)}
                className="inline-flex items-center gap-1 text-xs font-semibold text-primary hover:text-primary/80 transition-colors focus:outline-none"
                title={`Drill into ${c.title}`}
              >
                <span>Drill down</span>
                <ArrowRight className="w-3 h-3" />
              </button>

              {isSelected && (
                <span className="px-1.5 py-0.5 rounded text-xs bg-primary/20 text-primary uppercase font-semibold">
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
