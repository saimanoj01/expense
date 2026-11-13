import React from 'react';
import { ChevronRight } from 'lucide-react';
import { useNavigation } from '../../hooks/useNavigation';
import { bucketColor } from '../../theme/buckets';
import { formatMoney } from '../../utils/formatters';
import type { HorizonBucketMix } from '../../utils/trendsAnalytics';

export interface TrendsBucketMixCardProps {
  bucketMix: HorizonBucketMix;
  targetMonth: string;
}

export const TrendsBucketMixCard: React.FC<TrendsBucketMixCardProps> = ({
  bucketMix,
  targetMonth,
}) => {
  const { navigate } = useNavigation();

  return (
    <div
      data-testid="trends-bucket-mix"
      className="p-5 rounded-[14px] bg-card border border-border space-y-4"
    >
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <div>
          <h2 className="text-heading text-foreground">Spending structure</h2>
          <p className="text-label text-muted-foreground">
            Fixed vs. Variable vs. Non-monthly allocation across active months
          </p>
        </div>

        {bucketMix.fixedPctOfIncome !== null && (
          <span
            className={`text-label font-medium tabular-nums num ${
              bucketMix.fixedBenchmarkStatus === 'healthy'
                ? 'text-bucket-saved'
                : 'text-warning'
            }`}
          >
            Fixed commitments: {Math.round(bucketMix.fixedPctOfIncome)}% of income (
            {bucketMix.fixedBenchmarkStatus === 'healthy' ? '≤50% target' : '>50% target'})
          </span>
        )}
      </div>

      {/* 12px Stacked Proportional Bar */}
      <div className="h-3 w-full rounded-full bg-surface2 overflow-hidden flex gap-0.5">
        {bucketMix.items.map(item => {
          if (item.pctOfSpend <= 0) return null;
          return (
            <div
              key={item.bucket}
              style={{
                width: `${Math.max(2, item.pctOfSpend)}%`,
                backgroundColor: bucketColor(item.bucket),
              }}
              className="h-full first:rounded-l-full last:rounded-r-full transition-all"
              title={`${item.label}: ${formatMoney(item.total)} (${Math.round(
                item.pctOfSpend
              )}% of spend)`}
            />
          );
        })}
      </div>

      {/* 3 Interactive Bucket Rows */}
      <div className="divide-y divide-border/60">
        {bucketMix.items.map(item => (
          <button
            key={item.bucket}
            type="button"
            data-testid={`trends-bucket-row-${item.routeSlug}`}
            onClick={() => navigate(`#/month/${targetMonth}/bucket/${item.routeSlug}`)}
            className="w-full min-h-[48px] py-2.5 px-2 -mx-2 rounded-[10px] hover:bg-surface2 transition-colors flex items-center justify-between gap-3 text-left focus-visible:ring-2 ring-ring/40"
          >
            <div className="flex items-center gap-2.5 min-w-0">
              <span
                className="w-2.5 h-2.5 rounded-[3px] shrink-0"
                style={{ backgroundColor: bucketColor(item.bucket) }}
              />
              <span className="text-body font-medium text-foreground">{item.label}</span>
              <span className="text-label text-muted-foreground tabular-nums num">
                avg {formatMoney(item.avgPerActiveMonth)}/mo
              </span>
            </div>

            <div className="flex items-center gap-3 sm:gap-5 shrink-0 tabular-nums num">
              <span className="hidden sm:inline-block text-label text-muted-foreground">
                {Math.round(item.pctOfSpend)}% of spend
                {item.pctOfIncome !== null ? ` · ${Math.round(item.pctOfIncome)}% of income` : ''}
              </span>
              <span className="text-body font-semibold text-foreground">
                {formatMoney(item.total)}
              </span>
              <ChevronRight className="w-4 h-4 text-faint" />
            </div>
          </button>
        ))}
      </div>
    </div>
  );
};
