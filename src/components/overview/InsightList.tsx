import React, { useMemo } from 'react';
import { ArrowRight } from 'lucide-react';
import type { Transaction, Category, Budget } from '../../services/storage';
import { generateInsights } from '../../utils/insights';
import { bucketColor, negativeColor } from '../../theme/buckets';
import { formatCurrency, formatSignedCurrency } from '../../utils/formatters';
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
    return date.toLocaleDateString('en-US', {
      month: 'long',
      year: 'numeric',
      timeZone: 'UTC',
    });
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
  savingsAmount,
  savingsRate,
  className = '',
}) => {
  const { navigate } = useNavigation();

  const insights = useMemo(
    () => generateInsights(allTransactions, selectedMonth, categories, budgets),
    [allTransactions, selectedMonth, categories, budgets]
  );

  // Concise, visible cash-flow digest preserving exact E2E assertions with zero .sr-only/.opacity-0
  const digestText = useMemo(() => {
    const monthTitle = formatMonthTitle(selectedMonth);
    const denom = Math.max(totalIncome, totalExpenses, 1);
    const fixedPct = Math.min(100, Math.max(0, (fixedExpenses / denom) * 100));
    const flexSpentPct = Math.min(100, Math.max(0, (flexibleExpenses / denom) * 100));

    if (selectedMonth === 'all') {
      if (totalIncome === 0 && totalExpenses === 0) {
        return 'Across all recorded activity: no income or expenses recorded yet.';
      }
      if (totalIncome === 0) {
        return `Across all recorded activity: ${formatCurrency(totalExpenses)} spent · ${formatCurrency(fixedExpenses)} fixed · ${formatCurrency(flexibleExpenses)} variable · ${formatCurrency(nonMonthlyExpenses)} non-monthly · $0.00 recorded income.`;
      }
      return `Across all recorded activity: ${formatCurrency(totalIncome)} income · ${formatCurrency(fixedExpenses)} fixed · ${formatCurrency(flexibleExpenses)} variable · ${formatCurrency(nonMonthlyExpenses)} non-monthly · ${formatSignedCurrency(savingsAmount)} net saved (${savingsRate.toFixed(1)}%).`;
    }

    if (totalIncome === 0) {
      if (totalExpenses > 0) {
        return `Cash flow: ${formatCurrency(totalExpenses)} spent · ${formatCurrency(fixedExpenses)} fixed · ${formatCurrency(flexibleExpenses)} variable · ${formatCurrency(nonMonthlyExpenses)} non-monthly · $0.00 recorded income.`;
      }
      return `In ${monthTitle}, no income or expenses recorded yet.`;
    }

    if (savingsAmount < 0) {
      return `Cash flow: ${formatCurrency(totalIncome)} income vs ${formatCurrency(totalExpenses)} spent · ${formatCurrency(fixedExpenses)} fixed (${fixedPct.toFixed(1)}% of spend) · ${formatCurrency(flexibleExpenses)} variable (${flexSpentPct.toFixed(1)}% of spend) · ${formatCurrency(nonMonthlyExpenses)} non-monthly · -${formatCurrency(Math.abs(savingsAmount))} deficit.`;
    }

    return `Cash flow: ${formatCurrency(totalIncome)} income · ${formatCurrency(fixedExpenses)} fixed · ${formatCurrency(flexibleExpenses)} variable · ${formatCurrency(nonMonthlyExpenses)} non-monthly · ${formatCurrency(savingsAmount)} net saved (${savingsRate.toFixed(1)}%).`;
  }, [
    selectedMonth,
    totalIncome,
    totalExpenses,
    fixedExpenses,
    flexibleExpenses,
    nonMonthlyExpenses,
    savingsAmount,
    savingsRate,
  ]);

  return (
    <div
      data-testid="story-narrative"
      className={`pt-2 border-t border-border/60 space-y-1.5 ${className}`}
    >
      <p className="text-label text-muted-foreground leading-snug tabular-nums num">
        {digestText}
      </p>

      {insights.length > 0 && (
        <div className="divide-y divide-border/50">
          {insights.map(item => (
            <button
              key={item.id}
              type="button"
              onClick={() => navigate(item.href)}
              className="w-full min-h-[38px] lg:min-h-[34px] py-1 px-2 -mx-2 rounded-[8px] hover:bg-surface2 transition-colors flex items-center justify-between gap-2.5 text-left group focus-visible:ring-2 ring-ring/40"
            >
              <div className="flex items-center gap-2 min-w-0">
                <span
                  className="w-1.5 h-1.5 rounded-full shrink-0"
                  style={{
                    backgroundColor:
                      item.tone === 'negative' ? negativeColor() : bucketColor(item.bucket),
                  }}
                />
                <span className="text-label text-foreground line-clamp-2">
                  {item.text}
                </span>
              </div>
              <ArrowRight className="w-3.5 h-3.5 text-faint group-hover:text-foreground transition-colors shrink-0" />
            </button>
          ))}
        </div>
      )}
    </div>
  );
};
