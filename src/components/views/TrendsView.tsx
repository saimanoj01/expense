import { useState, useMemo, useEffect, useRef } from 'react';
import { TrendChart } from '../dashboard/TrendChart';
import { TrendsKpiStrip } from '../trends/TrendsKpiStrip';
import { TrendsBucketMixCard } from '../trends/TrendsBucketMixCard';
import { TrendsDriversGrid } from '../trends/TrendsDriversGrid';
import type { TrendChartDetails } from '../../hooks/useTransactions';
import type { Category, Transaction } from '../../services/storage';
import { getCurrentLocalMonth } from '../../utils/navigation';
import {
  computeHorizonBucketMix,
  computeHorizonCategoryTrends,
  computeHorizonConcentration,
  computeHorizonMonthlySeries,
  resolveHorizonMonths,
  type TrendsHorizon,
} from '../../utils/trendsAnalytics';

export interface TrendsViewProps {
  month: string;
  trendDetails?: TrendChartDetails;
  categories?: Category[];
  transactions?: Transaction[];
  availableMonths?: string[];
  onSelectMonth?: (m: string) => void;
}

const HORIZON_OPTIONS: Array<{ id: TrendsHorizon; label: string }> = [
  { id: '6m', label: '6M' },
  { id: '12m', label: '12M' },
  { id: 'ytd', label: 'YTD' },
  { id: 'all', label: 'All' },
];

export function TrendsView({
  month,
  trendDetails,
  categories = [],
  transactions = [],
  onSelectMonth,
}: TrendsViewProps) {
  const [horizon, setHorizon] = useState<TrendsHorizon>(() =>
    month === 'all' ? 'all' : '12m'
  );
  const manualHorizonSelectRef = useRef(false);

  // Bidirectional sync with PageHeader MonthSwitcher ('all' <-> horizon) per Guardrail G4
  useEffect(() => {
    if (manualHorizonSelectRef.current) {
      manualHorizonSelectRef.current = false;
      return;
    }
    if (month === 'all') {
      setHorizon('all');
    } else if (horizon === 'all') {
      setHorizon('12m');
    }
  }, [month, horizon]);

  const horizonWindow = useMemo(
    () => resolveHorizonMonths(horizon, month, transactions, getCurrentLocalMonth()),
    [horizon, month, transactions]
  );

  const { series, summary } = useMemo(
    () => computeHorizonMonthlySeries(transactions, horizonWindow.monthKeys, categories),
    [transactions, horizonWindow.monthKeys, categories]
  );

  const hasData = useMemo(
    () => transactions.some(t => t.type !== 'transfer'),
    [transactions]
  );

  const bucketMix = useMemo(
    () => computeHorizonBucketMix(series, summary),
    [series, summary]
  );

  const categoryMomentum = useMemo(
    () =>
      computeHorizonCategoryTrends(
        transactions,
        horizonWindow.monthKeys,
        categories,
        summary.activeMonthsCount,
        horizon === 'all'
      ),
    [transactions, horizonWindow.monthKeys, categories, summary.activeMonthsCount, horizon]
  );

  const concentration = useMemo(
    () =>
      computeHorizonConcentration(
        transactions,
        horizonWindow.monthKeys,
        categories,
        summary.totalOutflow
      ),
    [transactions, horizonWindow.monthKeys, categories, summary.totalOutflow]
  );

  const handleSelectHorizon = (nextHorizon: TrendsHorizon) => {
    manualHorizonSelectRef.current = true;
    setHorizon(nextHorizon);
    if (nextHorizon === 'all') {
      if (month !== 'all') {
        onSelectMonth?.('all');
      }
    } else if (month === 'all') {
      onSelectMonth?.(horizonWindow.anchorMonth);
    }
  };

  const drilldownTargetMonth = horizon === 'all' ? 'all' : horizonWindow.anchorMonth;

  return (
    <div
      className="max-w-6xl mx-auto space-y-6 pb-8"
      data-testid="trends-workspace"
    >
      {/* Header + Multi-Horizon Segmented Control */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-title text-foreground">Trends</h1>
          <p className="text-label text-muted-foreground mt-0.5 tabular-nums num">
            {horizonWindow.subtitleRange
              ? `${horizonWindow.subtitleRange} · ${summary.activeMonthsCount} active month${
                  summary.activeMonthsCount === 1 ? '' : 's'
                }`
              : 'Multi-horizon cash flow, savings trajectory, and spending drivers'}
          </p>
        </div>

        <div
          role="group"
          aria-label="Trends time horizon"
          className="inline-flex items-center self-start sm:self-auto p-1 rounded-[12px] bg-surface2 border border-border"
        >
          {HORIZON_OPTIONS.map(opt => {
            const isActive = horizon === opt.id;
            return (
              <button
                key={opt.id}
                type="button"
                data-testid={`trends-horizon-${opt.id}`}
                aria-pressed={isActive}
                onClick={() => handleSelectHorizon(opt.id)}
                className={`px-3 py-1.5 rounded-[8px] text-label font-semibold transition-colors ${
                  isActive
                    ? 'bg-card text-foreground shadow-sm border border-border/60'
                    : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                {opt.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* 1. Horizon KPI Summary Strip */}
      {hasData && <TrendsKpiStrip summary={summary} />}

      {/* 2. Primary Cash-Flow & Savings Trajectory Chart */}
      <TrendChart
        trendDetails={trendDetails}
        categories={categories}
        transactions={transactions}
        selectedMonth={month}
        horizon={horizon}
        series={series}
        anchorMonth={horizonWindow.anchorMonth}
        onSelectMonth={onSelectMonth}
        onViewAllTime={() => handleSelectHorizon('all')}
      />

      {/* 3. Bucket Mix & Spending Structure */}
      {hasData && summary.totalOutflow > 0 && (
        <TrendsBucketMixCard
          bucketMix={bucketMix}
          targetMonth={drilldownTargetMonth}
        />
      )}

      {/* 4. Category Momentum + Top Merchants / #Tags / Accounts */}
      {hasData && (
        <TrendsDriversGrid
          categories={categoryMomentum}
          concentration={concentration}
          targetMonth={drilldownTargetMonth}
          horizon={horizon}
          onSelectMonth={onSelectMonth}
        />
      )}
    </div>
  );
}

export default TrendsView;
