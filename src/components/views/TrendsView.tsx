import { useState } from 'react';
import { BreadcrumbTrail } from '../layout/BreadcrumbTrail';
import { TrendChart } from '../dashboard/TrendChart';
import { TrendChartDetails } from '../../hooks/useTransactions';
import { Category, Budget, Transaction } from '../../services/storage';
import { BarChart3 } from 'lucide-react';
import { formatMonthLabel } from '../../utils/navigation';

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

  return (
    <div className="space-y-4" data-testid="trends-workspace">
      <BreadcrumbTrail className="mb-2" />

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
    </div>
  );
}

export default TrendsView;
