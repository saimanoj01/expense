import React, { useMemo } from 'react';
import { ArrowRight } from 'lucide-react';
import { Transaction, Category, Budget } from '../../services/storage';
import { generateInsights } from '../../utils/insights';
import { bucketColor } from '../../theme/buckets';
import { formatCurrency } from '../../utils/formatters';
import { useNavigation } from '../../hooks/useNavigation';

export interface InsightListProps {
  selectedMonth: string;
  allTransactions: Transaction[];
  categories: Category[];
  budgets?: Budget[];
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

export const InsightList: React.FC<InsightListProps> = ({
  selectedMonth,
  allTransactions,
  categories,
  budgets = [],
  totalIncome,
  totalExpenses,
  fixedExpenses,
  flexibleExpenses,
  nonMonthlyExpenses,
  unclassifiedExpenses = 0,
  flexNumber,
  savingsAmount,
  savingsRate,
  className = '',
}) => {
  const { navigate } = useNavigation();

  const insights = useMemo(
    () => generateInsights(allTransactions, selectedMonth, categories, budgets),
    [allTransactions, selectedMonth, categories, budgets]
  );

  // Screen-reader accessible full monthly narrative
  const srNarrative = useMemo(() => {
    const monthTitle = formatMonthTitle(selectedMonth);
    const denom = Math.max(totalIncome, totalExpenses, 1);
    const fixedPct = Math.min(100, Math.max(0, (fixedExpenses / denom) * 100));
    const flexSpentPct = Math.min(100, Math.max(0, (flexibleExpenses / denom) * 100));

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
    let base = `In ${monthTitle}, you earned ${formatCurrency(totalIncome)}. Fixed commitments absorbed ${formatCurrency(fixedExpenses)} (${fixedPct.toFixed(1)}%), leaving a flexible pool of ${formatCurrency(flexNumber)}. Day-to-day variable spend was ${formatCurrency(flexibleExpenses)} (${flexSpentPct.toFixed(1)}%) and non-monthly expenses were ${formatCurrency(nonMonthlyExpenses)}, resulting in ${formatCurrency(savingsAmount)} in Net Savings (${savingsRate.toFixed(1)}% rate).`;
    if (unclassifiedExpenses > 0) {
      base += ` Note: You have ${formatCurrency(unclassifiedExpenses)} in unclassified expenses.`;
    }
    return base;
  }, [
    selectedMonth,
    totalIncome,
    totalExpenses,
    fixedExpenses,
    flexibleExpenses,
    nonMonthlyExpenses,
    unclassifiedExpenses,
    flexNumber,
    savingsAmount,
    savingsRate,
  ]);

  return (
    <div data-testid="story-narrative" className={`space-y-1.5 ${className}`}>
      <div className="flex items-baseline justify-between gap-3">
        <h3 className="text-heading text-foreground shrink-0">What changed</h3>
        <p className="text-label text-muted-foreground truncate" title={srNarrative}>
          {srNarrative}
        </p>
      </div>

      {insights.length === 0 ? (
        <p className="text-body text-muted-foreground py-2">
          No notable changes recorded for this period yet.
        </p>
      ) : (
        <div className="divide-y divide-border/50">
          {insights.map((item, idx) => (
            <button
              key={item.id}
              type="button"
              onClick={() => navigate(item.href)}
              className={`w-full min-h-[44px] py-2 px-2 -mx-2 rounded-[10px] hover:bg-surface2 transition-colors items-center justify-between gap-3 text-left group focus-visible:ring-2 ring-ring/40 ${
                idx === 2 ? 'hidden sm:flex' : 'flex'
              }`}
            >
              <div className="flex items-center gap-2.5 min-w-0">
                <span
                  className="w-1.5 h-1.5 rounded-full shrink-0"
                  style={{ backgroundColor: bucketColor(item.bucket) }}
                />
                <span className="text-body text-foreground truncate">
                  {item.text}
                </span>
              </div>
              <ArrowRight className="w-4 h-4 text-faint group-hover:text-foreground transition-colors shrink-0" />
            </button>
          ))}
        </div>
      )}
    </div>
  );
};
