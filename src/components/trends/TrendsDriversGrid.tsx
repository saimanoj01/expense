import React, { useState } from 'react';
import { ChevronRight } from 'lucide-react';
import { useNavigation } from '../../hooks/useNavigation';
import { bucketColor } from '../../theme/buckets';
import { formatMoney } from '../../utils/formatters';
import type {
  CategoryMomentumItem,
  HorizonConcentration,
  TrendsHorizon,
} from '../../utils/trendsAnalytics';

export interface TrendsDriversGridProps {
  categories: CategoryMomentumItem[];
  concentration: HorizonConcentration;
  targetMonth: string; // anchorMonth or 'all'
  horizon: TrendsHorizon;
  onSelectMonth?: (m: string) => void;
}

type DriverTab = 'merchants' | 'tags' | 'accounts';
type CategoryBucketFilter = 'all' | 'fixed' | 'variable' | 'non-monthly';

export const TrendsDriversGrid: React.FC<TrendsDriversGridProps> = ({
  categories,
  concentration,
  targetMonth,
  horizon,
  onSelectMonth,
}) => {
  const { navigate } = useNavigation();
  const [showAllCats, setShowAllCats] = useState(false);
  const [activeTab, setActiveTab] = useState<DriverTab>('merchants');
  const [bucketFilter, setBucketFilter] = useState<CategoryBucketFilter>('all');

  const filteredCategories = categories.filter(cat => {
    if (bucketFilter === 'all') return true;
    if (bucketFilter === 'fixed') return cat.bucket === 'fixed';
    if (bucketFilter === 'variable') return cat.bucket === 'flexible';
    if (bucketFilter === 'non-monthly') return cat.bucket === 'non-monthly';
    return true;
  });

  const visibleCategories = showAllCats ? filteredCategories : filteredCategories.slice(0, 8);
  const isAllHorizon = horizon === 'all';

  const handleCategoryClick = (catId: string) => {
    if (catId === 'uncategorized') {
      onSelectMonth?.('all');
      navigate('#/transactions?month=all&cat=Uncategorized');
      return;
    }
    navigate(`#/month/${targetMonth}/category/${encodeURIComponent(catId)}`);
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 items-start">
      {/* Left Card: Category Momentum */}
      <div
        data-testid="trends-category-momentum"
        className="p-5 rounded-[14px] bg-card border border-border space-y-3"
      >
        <div className="flex flex-col sm:flex-row sm:items-baseline justify-between gap-2">
          <div>
            <h3 className="text-heading text-foreground">Category momentum</h3>
            <p className="text-label text-muted-foreground">
              {isAllHorizon
                ? 'Horizon total & active-month average'
                : 'Latest month vs. active-month average'}
            </p>
          </div>
          <span className="text-label text-muted-foreground tabular-nums num">
            {filteredCategories.length}{' '}
            {filteredCategories.length === 1 ? 'category' : 'categories'}
          </span>
        </div>

        {/* TRD-07: Bucket Filter Pills */}
        <div
          role="group"
          aria-label="Category bucket filter"
          className="flex flex-wrap items-center gap-1.5 pt-1"
        >
          {(
            [
              { id: 'all', label: 'All' },
              { id: 'fixed', label: 'Fixed' },
              { id: 'variable', label: 'Variable' },
              { id: 'non-monthly', label: 'Non-monthly' },
            ] as const
          ).map(pill => {
            const isSelected = bucketFilter === pill.id;
            return (
              <button
                key={pill.id}
                type="button"
                data-testid={`trends-cat-filter-${pill.id}`}
                aria-pressed={isSelected}
                onClick={() => setBucketFilter(pill.id)}
                className={`px-2.5 py-1 rounded-[8px] text-label font-medium transition-colors focus-visible:ring-2 ring-ring/40 ${
                  isSelected
                    ? 'bg-foreground text-background font-semibold'
                    : 'bg-surface2 hover:bg-secondary text-muted-foreground hover:text-foreground'
                }`}
              >
                {pill.label}
              </button>
            );
          })}
        </div>

        {visibleCategories.length === 0 ? (
          <p className="py-6 text-label text-muted-foreground">
            No net category expenses recorded in this horizon.
          </p>
        ) : (
          <div className="divide-y divide-border/50">
            {visibleCategories.map(cat => {
              const maxCat = Math.max(...cat.values, 1);
              const denom = Math.max(1, cat.values.length - 1);
              const sparkPts =
                cat.values.length === 1
                  ? `4.0,12.0 68.0,12.0`
                  : cat.values
                      .map((v, idx) => {
                        const sx = (idx / denom) * 68 + 2;
                        const sy = 20 - (v / maxCat) * 16;
                        return `${sx.toFixed(1)},${sy.toFixed(1)}`;
                      })
                      .join(' ');

              const deltaToneCls =
                cat.delta.tone === 'warning'
                  ? 'text-warning'
                  : cat.delta.tone === 'saved'
                  ? 'text-bucket-saved'
                  : 'text-muted-foreground';

              return (
                <button
                  key={cat.id}
                  type="button"
                  data-testid={`trends-category-row-${cat.id}`}
                  onClick={() => handleCategoryClick(cat.id)}
                  className="w-full min-h-[52px] py-2 flex items-center justify-between gap-3 px-2 -mx-2 rounded-[10px] hover:bg-surface2 transition-colors text-left focus-visible:ring-2 ring-ring/40"
                >
                  <div className="flex items-center gap-2.5 min-w-0 flex-1">
                    <span className="w-7 h-7 rounded-full bg-surface2 flex items-center justify-center text-sm shrink-0">
                      {cat.emoji}
                    </span>
                    <div className="min-w-0">
                      <div className="text-body font-medium text-foreground truncate">
                        {cat.name}
                      </div>
                      <div className={`text-label tabular-nums num ${deltaToneCls}`}>
                        {cat.delta.label}
                      </div>
                    </div>
                  </div>

                  {/* Horizon sparkline: visible down to 360px phones per Guardrail G3 */}
                  <svg
                    viewBox="0 0 72 24"
                    className="hidden min-[360px]:block w-[72px] h-6 shrink-0 overflow-visible"
                    aria-hidden="true"
                  >
                    <polyline
                      points={sparkPts}
                      fill="none"
                      stroke={bucketColor(cat.bucket)}
                      strokeWidth="1.5"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </svg>

                  <div className="text-right shrink-0 tabular-nums num">
                    <div className="text-body font-semibold text-foreground">
                      {formatMoney(cat.focusSpend)}
                    </div>
                    <div className="text-label text-muted-foreground">
                      avg {formatMoney(cat.avgMonthly)}/mo
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        )}

        {filteredCategories.length > 8 && (
          <button
            type="button"
            data-testid="trends-toggle-all-categories"
            onClick={() => setShowAllCats(prev => !prev)}
            className="text-label font-medium text-muted-foreground hover:text-foreground transition-colors pt-1"
          >
            {showAllCats ? 'Show top 8' : `Show all ${filteredCategories.length} categories`}
          </button>
        )}
      </div>

      {/* Right Card: Top Merchants / #Tags / Accounts Concentration */}
      <div
        data-testid="trends-concentration-card"
        className="p-5 rounded-[14px] bg-card border border-border space-y-3"
      >
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h3 className="text-heading text-foreground">Where money went</h3>
            <p className="text-label text-muted-foreground">
              Click any item to inspect matching ledger rows
            </p>
          </div>

          <div className="inline-flex items-center p-0.5 rounded-[10px] bg-surface2 border border-border">
            {(
              [
                { id: 'merchants', label: 'Merchants' },
                { id: 'tags', label: '#Tags' },
                { id: 'accounts', label: 'Accounts' },
              ] as const
            ).map(tab => {
              const isActive = activeTab === tab.id;
              return (
                <button
                  key={tab.id}
                  type="button"
                  data-testid={`trends-driver-tab-${tab.id}`}
                  onClick={() => setActiveTab(tab.id)}
                  className={`px-2.5 py-1 rounded-[8px] text-label font-medium transition-colors ${
                    isActive
                      ? 'bg-card text-foreground shadow-sm border border-border/60'
                      : 'text-muted-foreground hover:text-foreground'
                  }`}
                >
                  {tab.label}
                </button>
              );
            })}
          </div>
        </div>

        {activeTab === 'merchants' && (
          <div className="divide-y divide-border/50">
            {concentration.merchants.length === 0 ? (
              <p className="py-6 text-label text-muted-foreground">
                No merchant spend recorded in this horizon.
              </p>
            ) : (
              concentration.merchants.slice(0, 8).map((m, idx) => {
                const qParam = m.searchQuery
                  ? `&q=${encodeURIComponent(m.searchQuery)}`
                  : '';
                return (
                  <button
                    key={m.key}
                    type="button"
                    data-testid={`trends-merchant-row-${idx}`}
                    onClick={() => {
                      onSelectMonth?.('all');
                      navigate(`#/transactions?month=all${qParam}`);
                    }}
                    className="w-full min-h-[52px] py-2 flex items-center justify-between gap-3 px-2 -mx-2 rounded-[10px] hover:bg-surface2 transition-colors text-left focus-visible:ring-2 ring-ring/40"
                  >
                    <div className="flex items-center gap-2.5 min-w-0 flex-1">
                      <span className="w-7 h-7 rounded-full bg-surface2 flex items-center justify-center text-sm shrink-0">
                        {m.dominantCategory.emoji}
                      </span>
                      <div className="min-w-0">
                        <div className="text-body font-medium text-foreground truncate">
                          {m.name}
                        </div>
                        <div className="text-label text-muted-foreground tabular-nums num truncate">
                          {m.expenseCount} {m.expenseCount === 1 ? 'charge' : 'charges'} · avg{' '}
                          {formatMoney(m.avgTicket)}
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-2 shrink-0 tabular-nums num">
                      <div className="text-right">
                        <div className="text-body font-semibold text-foreground">
                          {formatMoney(m.netTotal)}
                        </div>
                        <div className="text-label text-muted-foreground">
                          {Math.round(m.pctOfOutflow)}% of spend
                        </div>
                      </div>
                      <ChevronRight className="w-4 h-4 text-faint" />
                    </div>
                  </button>
                );
              })
            )}
          </div>
        )}

        {activeTab === 'tags' && (
          <div className="divide-y divide-border/50">
            {concentration.tags.length === 0 ? (
              <p className="py-6 text-label text-muted-foreground">
                No user <span className="text-foreground font-medium">#tags</span> recorded in this
                horizon yet. Add tags like <span className="text-foreground">#vacation</span> or{' '}
                <span className="text-foreground">#work-trip</span> in Transactions to track cross-category projects.
              </p>
            ) : (
              concentration.tags.slice(0, 8).map(t => (
                <button
                  key={t.tag}
                  type="button"
                  data-testid={`trends-tag-row-${t.tag}`}
                  onClick={() => {
                    onSelectMonth?.('all');
                    navigate(`#/transactions?month=all&tag=${encodeURIComponent(t.tag)}`);
                  }}
                  className="w-full min-h-[52px] py-2 flex items-center justify-between gap-3 px-2 -mx-2 rounded-[10px] hover:bg-surface2 transition-colors text-left focus-visible:ring-2 ring-ring/40"
                >
                  <div className="min-w-0">
                    <div className="text-body font-medium text-foreground truncate">#{t.tag}</div>
                    <div className="text-label text-muted-foreground tabular-nums num">
                      {t.count} {t.count === 1 ? 'transaction' : 'transactions'}
                    </div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0 tabular-nums num">
                    <div className="text-right">
                      <div className="text-body font-semibold text-foreground">
                        {formatMoney(t.netTotal)}
                      </div>
                      <div className="text-label text-muted-foreground">
                        {Math.round(t.pctOfOutflow)}% of spend
                      </div>
                    </div>
                    <ChevronRight className="w-4 h-4 text-faint" />
                  </div>
                </button>
              ))
            )}
          </div>
        )}

        {activeTab === 'accounts' && (
          <div className="divide-y divide-border/50">
            {concentration.accounts.length === 0 ? (
              <p className="py-6 text-label text-muted-foreground">
                No account activity recorded in this horizon.
              </p>
            ) : (
              concentration.accounts.slice(0, 8).map(acct => (
                <button
                  key={acct.accountKey}
                  type="button"
                  data-testid={`trends-account-row-${acct.accountKey}`}
                  onClick={() => {
                    onSelectMonth?.('all');
                    navigate(
                      `#/transactions?month=all&account=${encodeURIComponent(acct.accountKey)}`
                    );
                  }}
                  className="w-full min-h-[52px] py-2 flex items-center justify-between gap-3 px-2 -mx-2 rounded-[10px] hover:bg-surface2 transition-colors text-left focus-visible:ring-2 ring-ring/40"
                >
                  <div className="min-w-0">
                    <div className="text-body font-medium text-foreground truncate">
                      {acct.label}
                    </div>
                    <div className="text-label text-muted-foreground tabular-nums num">
                      {acct.count} {acct.count === 1 ? 'transaction' : 'transactions'}
                    </div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0 tabular-nums num">
                    <div className="text-right">
                      <div className="text-body font-semibold text-foreground">
                        {formatMoney(acct.netTotal)}
                      </div>
                      <div className="text-label text-muted-foreground">
                        {Math.round(acct.pctOfOutflow)}% of spend
                      </div>
                    </div>
                    <ChevronRight className="w-4 h-4 text-faint" />
                  </div>
                </button>
              ))
            )}
          </div>
        )}
      </div>
    </div>
  );
};
