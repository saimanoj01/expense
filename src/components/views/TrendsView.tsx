import { useState, useMemo, Suspense, lazy } from 'react';
import { TrendChart } from '../dashboard/TrendChart';
import { TrendChartDetails } from '../../hooks/useTransactions';
import { Category, Budget, Transaction } from '../../services/storage';
import { BarChart3, TrendingUp } from 'lucide-react';
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
  availableMonths: _availableMonths = [],
  onSelectMonth,
  onRequestGeminiKey
}: TrendsViewProps) {
  const [selectedTimeframe, setSelectedTimeframe] = useState<'month' | 'all'>('month');

  const activeMonth = selectedTimeframe === 'all' ? 'all' : month;

  // Waterfall Chart Data for cash flow breakdown
  const waterfallData = useMemo<WaterfallItem[]>(() => {
    const periodTxns = activeMonth === 'all'
      ? transactions.filter(t => t.type !== 'transfer')
      : transactions.filter(t => t.date && t.date.startsWith(activeMonth) && t.type !== 'transfer');

    const totalIncome = periodTxns.filter(t => t.type === 'income').reduce((s, t) => s + t.amount, 0);
    const fixedExpenses = periodTxns.filter(t => t.type === 'expense' && bucketOf(t, categories) === 'fixed').reduce((s, t) => s + t.amount, 0);
    const flexibleExpenses = periodTxns.filter(t => t.type === 'expense' && bucketOf(t, categories) === 'flexible').reduce((s, t) => s + t.amount, 0);
    const nonMonthlyExpenses = periodTxns.filter(t => t.type === 'expense' && bucketOf(t, categories) === 'non-monthly').reduce((s, t) => s + t.amount, 0);
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
      stepType: 'inflow'
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
      stepType: 'outflow'
    });

    // 3. Variable
    running -= flexibleExpenses;
    items.push({
      name: 'Variable',
      placeholder: Math.max(0, running),
      value: flexibleExpenses,
      displayValue: flexibleExpenses,
      color: bucketColor('flexible'),
      stepType: 'outflow'
    });

    // 4. Non-Monthly
    running -= nonMonthlyExpenses;
    items.push({
      name: 'Non-Monthly',
      placeholder: Math.max(0, running),
      value: nonMonthlyExpenses,
      displayValue: nonMonthlyExpenses,
      color: bucketColor('non-monthly'),
      stepType: 'outflow'
    });

    // 5. Net Saved
    items.push({
      name: savingsAmount >= 0 ? 'Net Saved' : 'Deficit',
      placeholder: 0,
      value: Math.max(0, Math.abs(savingsAmount)),
      displayValue: savingsAmount,
      color: savingsAmount >= 0 ? bucketColor('saved') : negativeColor(),
      stepType: 'total'
    });

    return items;
  }, [transactions, activeMonth, categories]);

  return (
    <div className="space-y-4" data-testid="trends-workspace">
      {/* Hero Header */}
      <div className="p-6 rounded-2xl bg-gradient-to-br from-card/80 to-card/40 border border-border backdrop-blur-md shadow-sm flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <div className="p-2 rounded-xl bg-primary/10 text-primary">
              <BarChart3 className="w-5 h-5" />
            </div>
            <h1 className="text-xl font-bold tracking-tight text-foreground">
              Trends & Visual Analytics
            </h1>
          </div>
          <p className="text-xs text-muted-foreground mt-1">
            Evaluate intra-month pacing velocity, multi-month cash flow trajectory, and AI intelligence
          </p>
        </div>

        {/* Timeframe Selector Pill */}
        <div className="flex items-center bg-card/60 p-1 rounded-xl border border-border">
          <button
            onClick={() => setSelectedTimeframe('month')}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
              selectedTimeframe === 'month'
                ? 'bg-primary text-primary-foreground shadow-sm'
                : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            {formatMonthLabel(month)}
          </button>
          <button
            onClick={() => setSelectedTimeframe('all')}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
              selectedTimeframe === 'all'
                ? 'bg-primary text-primary-foreground shadow-sm'
                : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            All Time
          </button>
        </div>
      </div>

      {/* Main Analytics Engine */}
      <TrendChart
        trendDetails={trendDetails}
        totalBudget={totalBudget}
        budgets={budgets}
        categories={categories}
        transactions={transactions}
        selectedMonth={activeMonth}
        onSelectMonth={onSelectMonth}
        onRequestGeminiKey={onRequestGeminiKey}
      />

      {/* Cash Flow Waterfall Breakdown Card */}
      <div className="p-6 rounded-2xl bg-card border border-border shadow-md space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="p-2 rounded-xl bg-primary/10 text-primary">
              <TrendingUp className="w-4 h-4" />
            </div>
            <div>
              <h2 className="text-sm font-bold text-foreground">
                Cash Flow Allocation Breakdown
              </h2>
              <p className="text-xs text-muted-foreground">
                Inflow allocation across fixed commitments, variable spending, and retained net savings
              </p>
            </div>
          </div>
          <span className="text-xs font-mono text-muted-foreground">{formatMonthLabel(activeMonth)}</span>
        </div>

        <div className="min-h-[180px] flex items-center justify-center pt-2">
          <Suspense
            fallback={
              <div className="w-full h-[180px] flex items-center justify-center text-xs text-muted-foreground bg-secondary/30 rounded-xl border border-border/40 animate-pulse">
                Loading Waterfall Breakdown...
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
