import { useState, useMemo } from 'react';
import { TrendChartDetails } from '../../hooks/useTransactions';
import { Category, Transaction } from '../../services/storage';
import { bucketOf } from '../../utils/categorizer';
import { computeMonthMetrics } from '../../utils/metrics';
import { bucketColor } from '../../theme/buckets';
import { formatMoney } from '../../utils/formatters';
import { useNavigation } from '../../hooks/useNavigation';

interface TrendChartProps {
  trendDetails?: TrendChartDetails;
  categories?: Category[];
  transactions?: Transaction[];
  selectedMonth?: string;
  onSelectMonth?: (month: string) => void;
}

interface MonthBucketSummary {
  month: string;
  shortLabel: string;
  longLabel: string;
  income: number;
  fixed: number;
  flexible: number;
  nonMonthly: number;
  totalExpense: number;
  saved: number;
  savingsRate: number;
}

function getTrailing12Months(anchorMonth: string): string[] {
  let year = 2026;
  let monthNum = 11;
  if (/^\d{4}-\d{2}$/.test(anchorMonth)) {
    const [yStr, mStr] = anchorMonth.split('-');
    year = parseInt(yStr, 10);
    monthNum = parseInt(mStr, 10);
  }
  const result: string[] = [];
  for (let i = 11; i >= 0; i--) {
    const d = new Date(Date.UTC(year, monthNum - 1 - i, 1));
    const y = d.getUTCFullYear();
    const m = String(d.getUTCMonth() + 1).padStart(2, '0');
    result.push(`${y}-${m}`);
  }
  return result;
}

function formatShortMonth(monthStr: string): string {
  const [yStr, mStr] = monthStr.split('-');
  const d = new Date(Date.UTC(parseInt(yStr, 10), parseInt(mStr, 10) - 1, 1));
  return d.toLocaleDateString('en-US', { month: 'short', timeZone: 'UTC' });
}

function formatLongMonth(monthStr: string): string {
  const [yStr, mStr] = monthStr.split('-');
  const d = new Date(Date.UTC(parseInt(yStr, 10), parseInt(mStr, 10) - 1, 1));
  return d.toLocaleDateString('en-US', { month: 'short', year: 'numeric', timeZone: 'UTC' });
}

export function TrendChart({
  categories = [],
  transactions = [],
  selectedMonth = '2026-11',
  onSelectMonth,
}: TrendChartProps) {
  const { navigate } = useNavigation();
  const [hoveredIdx, setHoveredIdx] = useState<number | null>(null);

  const nonTransferTxns = useMemo(
    () => transactions.filter(t => t.type !== 'transfer'),
    [transactions]
  );

  const hasData = nonTransferTxns.length > 0;

  // Determine anchor month for trailing 12 months
  const anchorMonth = useMemo(() => {
    if (selectedMonth && /^\d{4}-\d{2}$/.test(selectedMonth)) {
      return selectedMonth;
    }
    const txMonths = Array.from(
      new Set(
        nonTransferTxns
          .map(t => (t.date || '').substring(0, 7))
          .filter(m => /^\d{4}-\d{2}$/.test(m))
      )
    ).sort();
    return txMonths[txMonths.length - 1] || '2026-11';
  }, [selectedMonth, nonTransferTxns]);

  const monthKeys = useMemo(() => getTrailing12Months(anchorMonth), [anchorMonth]);

  const monthlyData = useMemo<MonthBucketSummary[]>(() => {
    return monthKeys.map(mKey => {
      const m = computeMonthMetrics(transactions, mKey, categories);
      const savingsRate =
        m.income > 0
          ? Math.max(-100, Math.min(100, m.savingsRate))
          : m.expenses > 0
          ? -100
          : 0;

      return {
        month: mKey,
        shortLabel: formatShortMonth(mKey),
        longLabel: formatLongMonth(mKey),
        income: m.income,
        fixed: m.fixed,
        flexible: m.flexible,
        nonMonthly: m.nonMonthly,
        totalExpense: m.expenses,
        saved: m.savings,
        savingsRate,
      };
    });
  }, [monthKeys, transactions, categories]);

  // Last 6 months for category trends table
  const last6MonthKeys = useMemo(() => monthKeys.slice(6), [monthKeys]);

  const categoryTrends = useMemo(() => {
    const map = new Map<string, number[]>();
    for (const t of nonTransferTxns) {
      if (t.type !== 'expense') continue;
      const mKey = (t.date || '').substring(0, 7);
      const mIdx = last6MonthKeys.indexOf(mKey);
      if (mIdx === -1) continue;
      const cat = t.category || 'Uncategorized';
      const arr = map.get(cat) || [0, 0, 0, 0, 0, 0];
      arr[mIdx] += Number(t.amount) || 0;
      map.set(cat, arr);
    }

    return Array.from(map.entries())
      .map(([name, values]) => {
        const total = values.reduce((s, v) => s + v, 0);
        const avg = total / 6;
        const latest = values[5] || 0;
        const catObj = categories.find(
          c => c.id === name || c.name.toLowerCase() === name.toLowerCase()
        );
        const b = bucketOf({ category: name }, categories);
        return {
          name: catObj?.name || name,
          icon: catObj?.emoji || '🏷️',
          bucket: b,
          values,
          total,
          avg,
          latest,
        };
      })
      .filter(c => c.total > 0)
      .sort((a, b) => b.total - a.total)
      .slice(0, 8);
  }, [nonTransferTxns, last6MonthKeys, categories]);

  // Chart geometry
  const width = 720;
  const height = 220;
  const padLeft = 52;
  const padRight = 44;
  const padTop = 20;
  const padBottom = 30;
  const plotW = width - padLeft - padRight;
  const plotH = height - padTop - padBottom;

  const maxDollar = useMemo(() => {
    const peak = Math.max(
      ...monthlyData.map(m => Math.max(m.income, m.totalExpense)),
      100
    );
    return peak * 1.1;
  }, [monthlyData]);

  const yForDollar = (val: number) => {
    const clamped = Math.max(0, Math.min(maxDollar, val));
    return padTop + plotH - (clamped / maxDollar) * plotH;
  };

  // Savings rate right axis: -50% to +100%
  const yForRate = (rate: number) => {
    const clamped = Math.max(-50, Math.min(100, rate));
    const norm = (clamped + 50) / 150;
    return padTop + plotH - norm * plotH;
  };

  const colWidth = plotW / 12;
  const barWidth = Math.max(14, Math.min(28, colWidth - 18));

  const savingsRatePath = useMemo(() => {
    const rateY = (rate: number) => {
      const clamped = Math.max(-50, Math.min(100, rate));
      const norm = (clamped + 50) / 150;
      return padTop + plotH - norm * plotH;
    };
    const ys = monthlyData.map(m => rateY(m.savingsRate));
    const minY = Math.min(...ys);
    const maxY = Math.max(...ys);
    const flatAdjust = maxY - minY < 1 ? 1.5 : 0;
    const pts = monthlyData.map((m, idx) => {
      const cx = padLeft + idx * colWidth + colWidth / 2;
      const cy = rateY(m.savingsRate) + (idx === 0 ? flatAdjust : 0);
      return `${cx.toFixed(1)} ${cy.toFixed(1)}`;
    });
    return `M ${pts.join(' L ')}`;
  }, [monthlyData, colWidth, padLeft, padTop, plotH]);

  const hoveredMonth = hoveredIdx !== null ? monthlyData[hoveredIdx] : null;

  const handleBarClick = (monthKey: string) => {
    if (onSelectMonth) {
      onSelectMonth(monthKey);
    }
    navigate(`#/month/${monthKey}`);
  };

  return (
    <div className="space-y-6">
      {/* 12-Month Stacked Bar & Savings Rate Chart */}
      <div className="p-5 rounded-[14px] bg-card border border-border space-y-4">
        <div className="flex flex-wrap items-baseline justify-between gap-2 min-h-[28px]">
          <div>
            <h2 className="text-heading text-foreground">12-month cash flow</h2>
            <p className="text-label text-muted-foreground">
              Click any month bar to open its overview
            </p>
          </div>

          {hoveredMonth ? (
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-label tabular-nums num">
              <span className="font-semibold text-foreground">{hoveredMonth.longLabel}</span>
              <span className="text-muted-foreground">
                Income <strong className="text-foreground">{formatMoney(hoveredMonth.income)}</strong>
              </span>
              <span className="text-muted-foreground">
                Fixed <strong className="text-foreground">{formatMoney(hoveredMonth.fixed)}</strong>
              </span>
              <span className="text-muted-foreground">
                Variable <strong className="text-foreground">{formatMoney(hoveredMonth.flexible)}</strong>
              </span>
              <span className="text-muted-foreground">
                Non-monthly <strong className="text-foreground">{formatMoney(hoveredMonth.nonMonthly)}</strong>
              </span>
              <span className={hoveredMonth.saved >= 0 ? 'text-bucket-saved font-medium' : 'text-negative font-medium'}>
                {hoveredMonth.saved >= 0
                  ? `Kept ${formatMoney(hoveredMonth.saved)} (${Math.round(hoveredMonth.savingsRate)}%)`
                  : hoveredMonth.income <= 0 && hoveredMonth.totalExpense > 0
                  ? `Deficit ${formatMoney(Math.abs(hoveredMonth.saved))} (no income)`
                  : `Overspent ${formatMoney(Math.abs(hoveredMonth.saved))} (${Math.round(hoveredMonth.savingsRate)}%)`}
              </span>
            </div>
          ) : (
            <div className="flex flex-wrap items-center gap-4 text-label text-muted-foreground">
              <span className="inline-flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded-[3px]" style={{ backgroundColor: bucketColor('fixed') }} />
                Fixed
              </span>
              <span className="inline-flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded-[3px]" style={{ backgroundColor: bucketColor('flexible') }} />
                Variable
              </span>
              <span className="inline-flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded-[3px]" style={{ backgroundColor: bucketColor('non-monthly') }} />
                Non-monthly
              </span>
              <span className="inline-flex items-center gap-1.5">
                <span className="w-3 h-[2px]" style={{ backgroundColor: bucketColor('saved') }} />
                Income
              </span>
              <span className="inline-flex items-center gap-1.5">
                <span className="w-3 h-[1.5px] bg-foreground" />
                Savings rate
              </span>
            </div>
          )}
        </div>

        <div className="relative w-full select-none">
          <svg
            viewBox={`0 0 ${width} ${height}`}
            data-testid="chart-svg-trend"
            className="w-full h-[220px] overflow-visible"
            onMouseLeave={() => setHoveredIdx(null)}
          >
            {!hasData ? (
              <text
                x="50%"
                y="50%"
                textAnchor="middle"
                fill="currentColor"
                className="no-data-text text-muted-foreground text-label"
              >
                No data available
              </text>
            ) : (
              <>
                {/* Horizontal grid lines */}
                {[0, 0.5, 1].map((frac, idx) => {
                  const val = maxDollar * frac;
                  const y = yForDollar(val);
                  const rateLabel = frac === 1 ? '100%' : frac === 0.5 ? '25%' : '-50%';
                  return (
                    <g key={idx}>
                      <line
                        x1={padLeft}
                        y1={y}
                        x2={width - padRight}
                        y2={y}
                        stroke="hsl(var(--border))"
                        strokeWidth="1"
                        strokeDasharray={frac === 0 ? undefined : '3 3'}
                      />
                      <text
                        x={padLeft - 8}
                        y={y + 4}
                        textAnchor="end"
                        className="text-label fill-muted-foreground tabular-nums num"
                      >
                        {val >= 1000
                          ? `$${(val / 1000).toFixed(val % 1000 === 0 ? 0 : 1)}k`
                          : formatMoney(val)}
                      </text>
                      <text
                        x={width - padRight + 8}
                        y={y + 4}
                        textAnchor="start"
                        className="text-label fill-muted-foreground tabular-nums num"
                      >
                        {rateLabel}
                      </text>
                    </g>
                  );
                })}

                {/* 12 Stacked Monthly Bars */}
                {monthlyData.map((m, idx) => {
                  const cx = padLeft + idx * colWidth + colWidth / 2;
                  const bx = cx - barWidth / 2;
                  const isHovered = hoveredIdx === idx;
                  const isCurrent = m.month === anchorMonth;
                  const barOpacity = isHovered || isCurrent ? 0.92 : 0.7;

                  const fixedH = (m.fixed / maxDollar) * plotH;
                  const flexH = (m.flexible / maxDollar) * plotH;
                  const nonMonthlyH = (m.nonMonthly / maxDollar) * plotH;

                  const fixedY = padTop + plotH - fixedH;
                  const flexY = fixedY - flexH;
                  const nonMonthlyY = flexY - nonMonthlyH;
                  const incomeY = yForDollar(m.income);

                  return (
                    <g key={m.month}>
                      {/* Empty stub if 0 spend */}
                      {m.totalExpense === 0 && (
                        <rect
                          x={bx}
                          y={padTop + plotH - 2}
                          width={barWidth}
                          height={2}
                          rx={1}
                          fill="hsl(var(--surface-2))"
                        />
                      )}

                      {fixedH > 0 && (
                        <rect
                          x={bx}
                          y={fixedY}
                          width={barWidth}
                          height={Math.max(2, fixedH)}
                          rx={2}
                          fill={bucketColor('fixed')}
                          fillOpacity={barOpacity}
                        />
                      )}

                      {flexH > 0 && (
                        <rect
                          x={bx}
                          y={flexY}
                          width={barWidth}
                          height={Math.max(2, flexH)}
                          rx={2}
                          fill={bucketColor('flexible')}
                          fillOpacity={barOpacity}
                        />
                      )}

                      {nonMonthlyH > 0 && (
                        <rect
                          x={bx}
                          y={nonMonthlyY}
                          width={barWidth}
                          height={Math.max(2, nonMonthlyH)}
                          rx={2}
                          fill={bucketColor('non-monthly')}
                          fillOpacity={barOpacity}
                        />
                      )}

                      {/* Income tick mark */}
                      {m.income > 0 && (
                        <line
                          x1={bx - 3}
                          y1={incomeY}
                          x2={bx + barWidth + 3}
                          y2={incomeY}
                          stroke={bucketColor('saved')}
                          strokeWidth="2"
                          strokeLinecap="round"
                        />
                      )}

                      {/* Month label */}
                      <text
                        x={cx}
                        y={height - 8}
                        textAnchor="middle"
                        className={`text-label ${
                          isCurrent || isHovered
                            ? 'fill-foreground font-semibold'
                            : 'fill-muted-foreground'
                        }`}
                      >
                        {m.shortLabel}
                      </text>

                      {/* Interactive hit column */}
                      <rect
                        x={padLeft + idx * colWidth}
                        y={padTop}
                        width={colWidth}
                        height={plotH + 22}
                        fill="transparent"
                        className="cursor-pointer"
                        data-testid={`trend-month-bar-${m.month}`}
                        onMouseEnter={() => setHoveredIdx(idx)}
                        onClick={() => handleBarClick(m.month)}
                      />
                    </g>
                  );
                })}

                {/* Savings rate line (single <path> element inside chart-svg-trend) */}
                <path
                  d={savingsRatePath}
                  fill="none"
                  stroke="hsl(var(--foreground))"
                  strokeWidth="1.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  className="pointer-events-none"
                />

                {/* Hover dot on savings rate line */}
                {hoveredIdx !== null && monthlyData[hoveredIdx] && (
                  <circle
                    cx={padLeft + hoveredIdx * colWidth + colWidth / 2}
                    cy={yForRate(monthlyData[hoveredIdx].savingsRate)}
                    r={3.5}
                    fill="hsl(var(--foreground))"
                    stroke="hsl(var(--background))"
                    strokeWidth="1.5"
                    className="pointer-events-none"
                  />
                )}
              </>
            )}
          </svg>
        </div>
      </div>

      {/* Category Trends Table (Top 8 categories x last 6 months) */}
      {categoryTrends.length > 0 && (
        <div className="p-5 rounded-[14px] bg-card border border-border space-y-3">
          <div className="flex items-baseline justify-between">
            <h3 className="text-heading text-foreground">Category trends</h3>
            <span className="text-label text-muted-foreground">Last 6 months</span>
          </div>

          <div className="divide-y divide-border/50">
            {categoryTrends.map(cat => {
              const maxCat = Math.max(...cat.values, 1);
              const sparkPts = cat.values
                .map((v, idx) => {
                  const sx = (idx / 5) * 68 + 2;
                  const sy = 20 - (v / maxCat) * 16;
                  return `${sx.toFixed(1)},${sy.toFixed(1)}`;
                })
                .join(' ');

              return (
                <button
                  key={cat.name}
                  type="button"
                  onClick={() =>
                    navigate(`#/month/${anchorMonth}/category/${encodeURIComponent(cat.name)}`)
                  }
                  className="w-full h-12 flex items-center justify-between gap-4 px-2 -mx-2 rounded-[10px] hover:bg-surface2 transition-colors text-left focus-visible:ring-2 ring-ring/40"
                >
                  <div className="flex items-center gap-2.5 min-w-0 flex-1">
                    <span className="w-7 h-7 rounded-full bg-surface2 flex items-center justify-center text-sm shrink-0">
                      {cat.icon}
                    </span>
                    <span className="text-body font-medium text-foreground truncate">
                      {cat.name}
                    </span>
                  </div>

                  {/* 6-month sparkline */}
                  <svg
                    viewBox="0 0 72 24"
                    className="w-[72px] h-6 shrink-0 overflow-visible"
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

                  <div className="w-24 text-right shrink-0">
                    <div className="text-body font-medium text-foreground tabular-nums num">
                      {formatMoney(cat.latest)}
                    </div>
                    <div className="text-label text-muted-foreground tabular-nums num">
                      avg {formatMoney(cat.avg)}/mo
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
