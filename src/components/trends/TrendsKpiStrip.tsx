import React from 'react';
import { formatMoney } from '../../utils/formatters';
import type { HorizonKpiSummary } from '../../utils/trendsAnalytics';

export interface TrendsKpiStripProps {
  summary: HorizonKpiSummary;
}

export const TrendsKpiStrip: React.FC<TrendsKpiStripProps> = ({ summary }) => {
  const activeLabel = `${summary.activeMonthsCount} active mo${
    summary.activeMonthsCount === 1 ? '' : 's'
  }`;

  const isPositiveSaved = summary.netSaved >= 0;

  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
      {/* 1. Total Inflow */}
      <div
        data-testid="trends-kpi-inflow"
        className="p-4 rounded-[14px] bg-card border border-border space-y-1"
      >
        <div className="text-eyebrow uppercase text-muted-foreground">Total Inflow</div>
        <div className="text-title font-semibold text-foreground tabular-nums num">
          {formatMoney(summary.totalInflow)}
        </div>
        <div className="text-label text-muted-foreground tabular-nums num">
          avg {formatMoney(summary.avgInflow)}/mo · {activeLabel}
        </div>
      </div>

      {/* 2. Total Outflow */}
      <div
        data-testid="trends-kpi-outflow"
        className="p-4 rounded-[14px] bg-card border border-border space-y-1"
      >
        <div className="text-eyebrow uppercase text-muted-foreground">Total Outflow</div>
        <div className="text-title font-semibold text-foreground tabular-nums num">
          {formatMoney(summary.totalOutflow)}
        </div>
        <div className="text-label text-muted-foreground tabular-nums num">
          avg {formatMoney(summary.avgOutflow)}/mo · net of refunds
        </div>
      </div>

      {/* 3. Net Saved */}
      <div
        data-testid="trends-kpi-saved"
        className="p-4 rounded-[14px] bg-card border border-border space-y-1"
      >
        <div className="text-eyebrow uppercase text-muted-foreground">Net Saved</div>
        <div
          className={`text-title font-semibold tabular-nums num ${
            isPositiveSaved ? 'text-bucket-saved' : 'text-negative'
          }`}
        >
          {formatMoney(summary.netSaved, { sign: 'always' })}
        </div>
        <div className="text-label text-muted-foreground tabular-nums num">
          {summary.periodSavingsRate !== null
            ? `${summary.periodSavingsRate.toFixed(1)}% rate`
            : 'No income'}{' '}
          · avg {formatMoney(summary.avgNetSaved, { sign: 'always' })}/mo
        </div>
      </div>

      {/* 4. Best & Lowest Month */}
      <div
        data-testid="trends-kpi-best"
        className="p-4 rounded-[14px] bg-card border border-border space-y-1"
      >
        <div className="text-eyebrow uppercase text-muted-foreground">Best Month</div>
        <div className="text-heading sm:text-title font-semibold text-foreground tabular-nums num break-words">
          {summary.bestMonth
            ? `${summary.bestMonth.shortLabel} · ${formatMoney(summary.bestMonth.saved, {
                sign: 'always',
              })}`
            : '—'}
        </div>
        <div className="text-label text-muted-foreground tabular-nums num break-words">
          {summary.lowestMonth
            ? `Lowest: ${summary.lowestMonth.shortLabel} (${formatMoney(
                summary.lowestMonth.saved,
                { sign: 'always' }
              )})`
            : summary.bestMonth
            ? summary.bestMonth.longLabel
            : 'No active months'}
        </div>
      </div>
    </div>
  );
};
