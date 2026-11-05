import { useMemo, Suspense, lazy } from 'react';
import { TrendChart } from '../dashboard/TrendChart';
import { TrendChartDetails } from '../../hooks/useTransactions';
import { Category, Budget, Transaction } from '../../services/storage';
import { formatMonthLabel } from '../../utils/navigation';
import { bucketOf } from '../../utils/categorizer';
import { bucketColor, negativeColor } from '../../theme/buckets';
import { WaterfallItem } from '../dashboard/WaterfallChart';

const WaterfallChart = lazy(() => import('../dashboard/WaterfallChart'));

export interface TrendsViewProps {
  month: string;
  trendDetails?: TrendChartDetails;
  totalBudget?: number;
  budgets?: Budget[];
  categories?: Category[];
  transactions?: Transaction[];
  availableMonths?: string[];
  onSelectMonth?: (m: string) => void;
  onRequestGeminiKey?: () => void;
}

export function TrendsView({
  month,
  trendDetails,
  totalBudget = 0,
  budgets = [],
  categories = [],
  transactions = [],
  onSelectMonth,
  onRequestGeminiKey,
}: TrendsViewProps) {
  // Waterfall Chart Data for cash flow breakdown
  const waterfallData = useMemo<WaterfallItem[]>(() => {
    const periodTxns =
      month === 'all'
        ? transactions.filter(t => t.type !== 'transfer')
        : transactions.filter(
            t => t.date && t.date.startsWith(month) && t.type !== 'transfer'
          );

    const totalIncome = periodTxns
      .filter(t => t.type === 'income')
      .reduce((s, t) => s + t.amount, 0);
    const fixedExpenses = periodTxns
      .filter(t => t.type === 'expense' && bucketOf(t, categories) === 'fixed')
      .reduce((s, t) => s + t.amount, 0);
    const flexibleExpenses = periodTxns
      .filter(t => t.type === 'expense' && bucketOf(t, categories) === 'flexible')
      .reduce((s, t) => s + t.amount, 0);
    const nonMonthlyExpenses = periodTxns
      .filter(t => t.type === 'expense' && bucketOf(t, categories) === 'non-monthly')
      .reduce((s, t) => s + t.amount, 0);
    const totalExpenses = fixedExpenses + flexibleExpenses + nonMonthlyExpenses;
    const savingsAmount = totalIncome - totalExpenses;

    const items: WaterfallItem[] = [];

    // 1. Inflow
    items.push({
      name: 'Inflow',
      placeholder: 0,
      value: Math.max(0, totalIncome),
      displayValue: totalIncome,
      color: bucketColor('saved'),
      stepType: 'inflow',
    });

    // 2. Fixed
    let running = totalIncome;
    running -= fixedExpenses;
    items.push({
      name: 'Fixed',
      placeholder: Math.max(0, running),
      value: fixedExpenses,
      displayValue: fixedExpenses,
      color: bucketColor('fixed'),
      stepType: 'outflow',
    });

    // 3. Variable
    running -= flexibleExpenses;
    items.push({
      name: 'Variable',
      placeholder: Math.max(0, running),
      value: flexibleExpenses,
      displayValue: flexibleExpenses,
      color: bucketColor('flexible'),
      stepType: 'outflow',
    });

    // 4. Non-Monthly
    running -= nonMonthlyExpenses;
    items.push({
      name: 'Non-Monthly',
      placeholder: Math.max(0, running),
      value: nonMonthlyExpenses,
      displayValue: nonMonthlyExpenses,
      color: bucketColor('non-monthly'),
      stepType: 'outflow',
    });

    // 5. Net Saved
    items.push({
      name: savingsAmount >= 0 ? 'Net Saved' : 'Deficit',
      placeholder: 0,
      value: Math.max(0, Math.abs(savingsAmount)),
      displayValue: savingsAmount,
      color: savingsAmount >= 0 ? bucketColor('saved') : negativeColor(),
      stepType: 'total',
    });

    return items;
  }, [transactions, month, categories]);

  return (
    <div
      className="max-w-[920px] mx-auto space-y-6 pb-8"
      data-testid="trends-workspace"
    >
      <div>
        <h1 className="text-title text-foreground">Trends</h1>
        <p className="text-label text-muted-foreground mt-0.5">
          12-month cash flow, savings trajectory, and category momentum
        </p>
      </div>

      <TrendChart
        trendDetails={trendDetails}
        totalBudget={totalBudget}
        budgets={budgets}
        categories={categories}
        transactions={transactions}
        selectedMonth={month}
        onSelectMonth={onSelectMonth}
        onRequestGeminiKey={onRequestGeminiKey}
      />

      {/* Cash Flow Allocation Breakdown */}
      <div className="p-5 rounded-[14px] bg-card border border-border space-y-3">
        <div className="flex items-baseline justify-between">
          <div>
            <h2 className="text-heading text-foreground">
              Monthly allocation breakdown
            </h2>
            <p className="text-label text-muted-foreground">
              Inflow across fixed commitments, variable spending, and retained savings
            </p>
          </div>
          <span className="text-label text-muted-foreground">
            {formatMonthLabel(month)}
          </span>
        </div>

        <div className="min-h-[180px] flex items-center justify-center pt-2">
          <Suspense
            fallback={
              <div className="w-full h-[180px] flex items-center justify-center text-label text-muted-foreground bg-surface2 rounded-[10px]">
                Loading breakdown...
              </div>
            }
          >
            <WaterfallChart data={waterfallData} />
          </Suspense>
        </div>
      </div>
    </div>
  );
}

export default TrendsView;
