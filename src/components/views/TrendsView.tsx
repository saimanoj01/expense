import { useMemo, Suspense, lazy } from 'react';
import { TrendChart } from '../dashboard/TrendChart';
import { TrendChartDetails } from '../../hooks/useTransactions';
import { Category, Budget, Transaction } from '../../services/storage';
import { formatMonthLabel } from '../../utils/navigation';
import { computeMonthMetrics } from '../../utils/metrics';
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
  // Waterfall Chart Data for cash flow breakdown via computeMonthMetrics
  const monthMetrics = useMemo(
    () => computeMonthMetrics(transactions, month, categories),
    [transactions, month, categories]
  );

  const waterfallData = useMemo<WaterfallItem[]>(() => {
    const totalIncome = monthMetrics.income;
    const fixedExpenses = monthMetrics.fixed;
    const flexibleExpenses = monthMetrics.flexible;
    const nonMonthlyExpenses = monthMetrics.nonMonthly;
    const savingsAmount = monthMetrics.savings;

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
  }, [monthMetrics]);

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

      {/* 50/30/20 Guideline Benchmark Card */}
      <div
        className="p-5 rounded-[14px] bg-card border border-border space-y-4"
        data-testid="guideline-meter-50-30-20"
      >
        <div className="flex items-baseline justify-between">
          <div>
            <h2 className="text-heading text-foreground">
              50 / 30 / 20 Guideline Benchmark
            </h2>
            <p className="text-label text-muted-foreground">
              Needs ≤ 50% · Wants ≤ 30% · Savings ≥ 20% of monthly income
            </p>
          </div>
          <span className="text-label text-muted-foreground">
            {formatMonthLabel(month)}
          </span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          {(() => {
            const inc = monthMetrics.income;
            const needsPct = inc > 0 ? ((monthMetrics.fixed + monthMetrics.nonMonthly) / inc) * 100 : 0;
            const wantsPct = inc > 0 ? (monthMetrics.flexible / inc) * 100 : 0;
            const savingsPct = inc > 0 ? (monthMetrics.savings / inc) * 100 : 0;
            const rows = [
              { label: 'Needs', pct: needsPct, target: '≤ 50%', ok: needsPct <= 50, color: bucketColor('fixed') },
              { label: 'Wants', pct: wantsPct, target: '≤ 30%', ok: wantsPct <= 30, color: bucketColor('flexible') },
              { label: 'Savings', pct: savingsPct, target: '≥ 20%', ok: savingsPct >= 20, color: bucketColor('saved') },
            ];
            return rows.map(r => (
              <div key={r.label} className="p-3.5 rounded-[10px] bg-surface2 border border-border/60 space-y-2">
                <div className="flex items-baseline justify-between">
                  <span className="text-xs font-semibold text-foreground">{r.label}</span>
                  <span className="text-label text-muted-foreground">Target {r.target}</span>
                </div>
                <div className="flex items-baseline justify-between">
                  <span className="text-lg font-bold tabular-nums num text-foreground">
                    {inc > 0 ? `${r.pct.toFixed(1)}%` : '—'}
                  </span>
                  <span className={`text-xs font-medium ${r.ok ? 'text-bucket-saved' : 'text-warning'}`}>
                    {inc > 0 ? (r.ok ? 'On target' : 'Off target') : 'No income'}
                  </span>
                </div>
                <div className="h-1.5 w-full rounded-full bg-border overflow-hidden">
                  <div
                    className="h-full rounded-full transition-all"
                    style={{
                      width: `${Math.max(0, Math.min(100, r.pct))}%`,
                      backgroundColor: r.color,
                    }}
                  />
                </div>
              </div>
            ));
          })()}
        </div>
      </div>
    </div>
  );
}

export default TrendsView;
