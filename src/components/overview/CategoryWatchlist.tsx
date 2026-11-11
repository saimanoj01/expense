import React, { useMemo } from 'react';
import { ChevronRight } from 'lucide-react';
import { useNavigation } from '../../hooks/useNavigation';
import { formatMoney } from '../../utils/formatters';
import { bucketColor, negativeColor } from '../../theme/buckets';
import { rankCategoryWatchlist } from '../../utils/overviewCategories';
import type { CategorySummaryItem } from '../../utils/overviewCategories';
import type { MonthPhaseInfo } from '../../utils/metrics';

export interface CategoryWatchlistProps {
  selectedMonth: string;
  phaseInfo: MonthPhaseInfo;
  categorySummary: CategorySummaryItem[];
  className?: string;
}

export const CategoryWatchlist: React.FC<CategoryWatchlistProps> = ({
  selectedMonth,
  phaseInfo,
  categorySummary,
  className = '',
}) => {
  const { navigate } = useNavigation();

  const ranked = useMemo(
    () => rankCategoryWatchlist(categorySummary, phaseInfo, 4),
    [categorySummary, phaseInfo]
  );

  return (
    <div data-testid="overview-category-watchlist" className={`space-y-1.5 ${className}`}>
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-heading text-foreground">Top categories</h3>
        <button
          type="button"
          data-testid="overview-view-budgets-btn"
          onClick={() => navigate(`#/budgets?month=${selectedMonth}`)}
          className="text-label font-medium text-muted-foreground hover:text-foreground transition-colors focus-visible:ring-2 ring-ring/40 rounded px-1 -mx-1"
        >
          Budgets →
        </button>
      </div>

      {ranked.length === 0 ? (
        <p className="text-label text-muted-foreground py-2">
          Category breakdown appears once expenses or budgets are added.
        </p>
      ) : (
        <div className="divide-y divide-border/50">
          {ranked.map(cat => {
            const isOver = cat.urgencyTier === 1;
            const fillColor = isOver ? negativeColor() : bucketColor(cat.bucket);
            const barWidth =
              cat.budget > 0
                ? Math.min(100, Math.max(0, (cat.spent / cat.budget) * 100))
                : 0;

            return (
              <button
                key={cat.id}
                type="button"
                data-testid={`overview-cat-row-${cat.id}`}
                onClick={() => navigate(`#/month/${selectedMonth}/category/${cat.id}`)}
                className="w-full min-h-[40px] lg:min-h-[34px] py-1 px-2 -mx-2 rounded-[8px] hover:bg-surface2 transition-colors flex items-center justify-between gap-2.5 text-left group focus-visible:ring-2 ring-ring/40"
              >
                <div className="flex items-center gap-2 min-w-0 flex-1">
                  <span className="w-6 h-6 rounded-full bg-surface2 flex items-center justify-center text-xs shrink-0">
                    {cat.emoji || '🏷️'}
                  </span>
                  <span
                    className={`text-body font-medium truncate ${
                      cat.spent === 0 ? 'text-muted-foreground' : 'text-foreground'
                    }`}
                  >
                    {cat.name}
                  </span>
                  {isOver && (
                    <span className="px-1.5 py-0.2 rounded bg-negative/15 text-negative text-[11px] leading-4 font-medium shrink-0">
                      Over
                    </span>
                  )}
                </div>

                <div className="flex items-center gap-2.5 shrink-0">
                  {cat.budget > 0 && (
                    <div className="hidden sm:block relative w-20 h-1.5 bg-surface2 rounded-full overflow-hidden">
                      <div
                        style={{
                          width: `${barWidth}%`,
                          backgroundColor: fillColor,
                        }}
                        className="h-full rounded-full"
                      />
                      {cat.paceTickPct !== null && (
                        <div
                          style={{ left: `${cat.paceTickPct}%` }}
                          className="absolute top-0 bottom-0 w-[2px] bg-faint pointer-events-none"
                        />
                      )}
                    </div>
                  )}

                  <div className="text-right tabular-nums num text-body">
                    <span
                      className={`font-semibold ${
                        isOver
                          ? 'text-negative'
                          : cat.spent === 0
                          ? 'text-muted-foreground'
                          : 'text-foreground'
                      }`}
                    >
                      {formatMoney(cat.spent)}
                    </span>
                    {cat.budget > 0 && (
                      <span className="text-label text-muted-foreground">
                        {' '}
                        / {formatMoney(cat.budget)}
                      </span>
                    )}
                  </div>

                  <ChevronRight className="w-3.5 h-3.5 text-faint group-hover:text-foreground transition-colors shrink-0" />
                </div>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
};
