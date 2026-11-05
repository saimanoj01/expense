import React, { useMemo } from 'react';
import { BookOpen, CheckCircle2, AlertTriangle } from 'lucide-react';
import { formatCurrency } from '../../utils/formatters';

export interface StoryNarrativeCardProps {
  selectedMonth: string;
  totalIncome: number;
  totalExpenses: number;
  fixedExpenses: number;
  flexibleExpenses: number;
  nonMonthlyExpenses: number;
  unclassifiedExpenses?: number;
  flexNumber: number;
  savingsAmount: number;
  savingsRate: number;
  className?: string;
}

function formatMonthTitle(monthStr: string): string {
  if (!monthStr || monthStr === 'all') return 'All-Time';
  if (/^\d{4}-\d{2}$/.test(monthStr)) {
    const [yStr, mStr] = monthStr.split('-');
    const date = new Date(Date.UTC(parseInt(yStr, 10), parseInt(mStr, 10) - 1, 1));
    return date.toLocaleDateString('en-US', { month: 'long', year: 'numeric', timeZone: 'UTC' });
  }
  return monthStr;
}

export const StoryNarrativeCard: React.FC<StoryNarrativeCardProps> = ({
  selectedMonth,
  totalIncome,
  totalExpenses,
  fixedExpenses,
  flexibleExpenses,
  nonMonthlyExpenses,
  unclassifiedExpenses = 0,
  flexNumber,
  savingsAmount,
  savingsRate,
  className = ''
}) => {
  const monthTitle = formatMonthTitle(selectedMonth);

  const denom = Math.max(totalIncome, totalExpenses, 1);
  const fixedPct = Math.min(100, Math.max(0, (fixedExpenses / denom) * 100));
  const flexSpentPct = Math.min(100, Math.max(0, (flexibleExpenses / denom) * 100));

  // 50/30/20 Guideline Metrics
  const needsPct = totalIncome > 0 ? ((fixedExpenses + nonMonthlyExpenses) / totalIncome) * 100 : 0;
  const wantsPct = totalIncome > 0 ? (flexibleExpenses / totalIncome) * 100 : 0;
  const benchmarkSavingsPct = totalIncome > 0
    ? (savingsAmount / totalIncome) * 100
    : totalExpenses > 0
    ? -100
    : 0;

  // Plain-Language Story Narrative
  const storyNarrative = useMemo(() => {
    if (selectedMonth === 'all') {
      return `Across all recorded activity, you earned ${formatCurrency(totalIncome)}. Fixed commitments absorbed ${formatCurrency(fixedExpenses)} (${fixedPct.toFixed(1)}%), leaving a flexible pool of ${formatCurrency(flexNumber)}. Day-to-day variable spend was ${formatCurrency(flexibleExpenses)} (${flexSpentPct.toFixed(1)}%) and non-monthly expenses were ${formatCurrency(nonMonthlyExpenses)}, resulting in ${formatCurrency(savingsAmount)} in Net Savings (${savingsRate.toFixed(1)}% rate).`;
    }

    if (totalIncome === 0) {
      if (totalExpenses > 0) {
        return `You spent ${formatCurrency(totalExpenses)} with no recorded income this month.`;
      }
      return `In ${monthTitle}, no income or expenses have been recorded yet.`;
    }

    if (savingsAmount < 0) {
      return `In ${monthTitle}, you earned ${formatCurrency(totalIncome)}. Fixed commitments absorbed ${formatCurrency(fixedExpenses)} (${fixedPct.toFixed(1)}%) and variable spend was ${formatCurrency(flexibleExpenses)} (${flexSpentPct.toFixed(1)}%), resulting in a net cash deficit of ${formatCurrency(Math.abs(savingsAmount))}.`;
    }

    const rateTone = savingsRate >= 50
      ? `an extraordinary ${savingsRate.toFixed(1)}% rate!`
      : savingsRate >= 20
      ? `a healthy ${savingsRate.toFixed(1)}% rate.`
      : `a modest ${savingsRate.toFixed(1)}% rate.`;

    let base = `In ${monthTitle}, you earned ${formatCurrency(totalIncome)}. Fixed commitments absorbed ${formatCurrency(fixedExpenses)} (${fixedPct.toFixed(1)}%), leaving a flexible pool of ${formatCurrency(flexNumber)}. Day-to-day variable spend was ${formatCurrency(flexibleExpenses)} (${flexSpentPct.toFixed(1)}%) and non-monthly expenses were ${formatCurrency(nonMonthlyExpenses)}, resulting in ${formatCurrency(savingsAmount)} in Net Savings — ${rateTone}`;

    if (unclassifiedExpenses > 0) {
      base += ` Note: You have ${formatCurrency(unclassifiedExpenses)} in unclassified expenses.`;
    }

    return base;
  }, [
    selectedMonth,
    monthTitle,
    totalIncome,
    totalExpenses,
    fixedExpenses,
    flexibleExpenses,
    nonMonthlyExpenses,
    unclassifiedExpenses,
    flexNumber,
    savingsAmount,
    savingsRate,
    fixedPct,
    flexSpentPct
  ]);

  return (
    <div
      className={`p-4 rounded-2xl bg-card border border-border/70 shadow-md flex flex-col justify-between ${className}`}
    >
      <div>
        <div className="flex items-center justify-between gap-2 mb-1.5">
          <div className="flex items-center gap-2">
            <div className="p-1 rounded-lg bg-primary/10 text-primary">
              <BookOpen className="w-4 h-4" />
            </div>
            <h3 className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
              Financial Story & Benchmarks
            </h3>
          </div>
          <span className="text-[10px] text-muted-foreground font-mono">{monthTitle}</span>
        </div>

        {/* Narrative Paragraph */}
        <p
          data-testid="story-narrative"
          className="text-xs sm:text-sm text-foreground/90 leading-relaxed font-normal"
        >
          {storyNarrative}
        </p>
      </div>

      {/* 50/30/20 Guideline Meter */}
      <div 
        data-testid="guideline-meter-50-30-20"
        className="mt-2 pt-2 border-t border-border/40"
      >
        <div className="flex items-center justify-between text-[11px] mb-1">
          <span className="font-bold text-muted-foreground uppercase tracking-wider flex items-center gap-1">
            50/30/20 Rule:
          </span>
          <span className="text-[10px] text-muted-foreground">Target: 50% Needs • 30% Wants • 20% Savings</span>
        </div>

        <div className="grid grid-cols-3 gap-2 text-xs">
          {/* Needs */}
          <div className="p-1.5 rounded-xl bg-secondary/40 border border-border/40 flex items-center justify-between">
            <div>
              <div className="text-[11px] font-semibold text-muted-foreground">Needs</div>
              <div className="text-sm font-extrabold font-sans tabular-nums text-foreground">
                {needsPct.toFixed(1)}%
              </div>
            </div>
            {needsPct <= 50 ? (
              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
            ) : (
              <AlertTriangle className="w-3.5 h-3.5 text-amber-400 shrink-0" />
            )}
          </div>

          {/* Wants */}
          <div className="p-1.5 rounded-xl bg-secondary/40 border border-border/40 flex items-center justify-between">
            <div>
              <div className="text-[11px] font-semibold text-muted-foreground">Wants</div>
              <div className="text-sm font-extrabold font-sans tabular-nums text-foreground">
                {wantsPct.toFixed(1)}%
              </div>
            </div>
            {wantsPct <= 30 ? (
              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
            ) : (
              <AlertTriangle className="w-3.5 h-3.5 text-amber-400 shrink-0" />
            )}
          </div>

          {/* Savings */}
          <div className="p-1.5 rounded-xl bg-secondary/40 border border-border/40 flex items-center justify-between">
            <div>
              <div className="text-[11px] font-semibold text-muted-foreground flex items-center gap-1">
                <span>Savings</span>
                {benchmarkSavingsPct < 0 && (
                  <span className="px-1 py-0.2 rounded text-[9px] font-bold uppercase bg-rose-500/20 text-rose-400">
                    Deficit
                  </span>
                )}
              </div>
              <div className={`text-sm font-extrabold font-sans tabular-nums ${benchmarkSavingsPct < 0 ? 'text-rose-400' : 'text-foreground'}`}>
                {benchmarkSavingsPct.toFixed(1)}%
              </div>
            </div>
            {benchmarkSavingsPct >= 20 ? (
              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
            ) : (
              <AlertTriangle className="w-3.5 h-3.5 text-amber-400 shrink-0" />
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
