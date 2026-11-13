import { useState, useMemo, useRef, useEffect } from 'react';
import type { TrendChartDetails } from '../../hooks/useTransactions';
import type { Category, Transaction } from '../../services/storage';
import { bucketColor } from '../../theme/buckets';
import { formatMoney } from '../../utils/formatters';
import { useNavigation } from '../../hooks/useNavigation';
import {
  buildSavingsRateSvgPath,
  computeHorizonMonthlySeries,
  resolveHorizonMonths,
  type HorizonMonthPoint,
  type TrendsHorizon,
} from '../../utils/trendsAnalytics';

export interface TrendChartProps {
  trendDetails?: TrendChartDetails;
  categories?: Category[];
  transactions?: Transaction[];
  selectedMonth?: string;
  horizon?: TrendsHorizon;
  series?: HorizonMonthPoint[];
  anchorMonth?: string;
  onSelectMonth?: (month: string) => void;
  onViewAllTime?: () => void;
}

export function TrendChart({
  categories = [],
  transactions = [],
  selectedMonth = '2026-11',
  horizon = '12m',
  series: externalSeries,
  anchorMonth: externalAnchorMonth,
  onSelectMonth,
  onViewAllTime,
}: TrendChartProps) {
  const { navigate } = useNavigation();
  const containerRef = useRef<HTMLDivElement>(null);
  const lastPointerTypeRef = useRef<string>('mouse');

  const [measuredWidth, setMeasuredWidth] = useState<number>(720);
  const [hoveredIdx, setHoveredIdx] = useState<number | null>(null);
  const [pinnedIdx, setPinnedIdx] = useState<number | null>(null);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const updateWidth = () => {
      const w = el.getBoundingClientRect().width;
      if (w > 0) {
        setMeasuredWidth(Math.round(w));
      }
    };
    updateWidth();
    if (typeof ResizeObserver !== 'undefined') {
      const ro = new ResizeObserver(() => updateWidth());
      ro.observe(el);
      return () => ro.disconnect();
    }
  }, []);

  const fallbackComputed = useMemo(() => {
    if (externalSeries && externalAnchorMonth) return null;
    const win = resolveHorizonMonths(horizon, selectedMonth, transactions, '2026-11');
    const res = computeHorizonMonthlySeries(transactions, win.monthKeys, categories);
    return {
      anchorMonth: win.anchorMonth,
      series: res.series,
    };
  }, [externalSeries, externalAnchorMonth, horizon, selectedMonth, transactions, categories]);

  const monthlyData = useMemo(
    () => externalSeries ?? fallbackComputed?.series ?? [],
    [externalSeries, fallbackComputed]
  );
  const effectiveAnchorMonth =
    externalAnchorMonth ?? fallbackComputed?.anchorMonth ?? '2026-11';

  const hasAnyNonTransferTransactions = useMemo(
    () => transactions.some(t => t.type !== 'transfer'),
    [transactions]
  );
  const hasHorizonActivity = useMemo(
    () => monthlyData.some(m => m.hasActivity),
    [monthlyData]
  );

  // Reset hover/pin state when horizon, selectedMonth, or slot count changes
  useEffect(() => {
    setHoveredIdx(null);
    setPinnedIdx(null);
  }, [horizon, selectedMonth, monthlyData.length]);

  // Responsive 1:1 coordinate space (eliminates 0.45x label shrinkage & dead aspect-ratio whitespace on mobile)
  const svgWidth = Math.max(320, measuredWidth || 720);
  const isCompact = svgWidth < 480;
  const svgHeight = isCompact ? 228 : 256;
  const padLeft = isCompact ? 42 : 52;
  const padRight = isCompact ? 36 : 44;
  const padTop = 18;
  const padBottom = 30;
  const plotW = Math.max(180, svgWidth - padLeft - padRight);
  const plotH = svgHeight - padTop - padBottom;

  const slotCount = Math.max(1, monthlyData.length);
  const colWidth = plotW / slotCount;
  const barWidth = Math.max(8, Math.min(32, colWidth * 0.56));

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

  const zeroRateY = yForRate(0);

  // Active-only savings rate SVG path (strictly 1 <path> element inside chart-svg-trend)
  const savingsRatePath = useMemo(() => {
    const pts = monthlyData.map((m, idx) => {
      const cx = padLeft + idx * colWidth + colWidth / 2;
      const cy =
        m.plotSavingsRate !== null
          ? padTop +
            plotH -
            ((Math.max(-50, Math.min(100, m.plotSavingsRate)) + 50) / 150) * plotH
          : null;
      return { cx, cy };
    });
    return buildSavingsRateSvgPath(pts);
  }, [monthlyData, colWidth, padLeft, padTop, plotH]);

  const maxLabels = Math.max(4, Math.floor(plotW / 44));
  const labelStride = Math.max(1, Math.ceil(slotCount / maxLabels));

  const activeIdx = pinnedIdx !== null ? pinnedIdx : hoveredIdx;
  const inspectedMonth = activeIdx !== null ? monthlyData[activeIdx] ?? null : null;

  const handleOpenMonth = (monthKey: string) => {
    setPinnedIdx(null);
    setHoveredIdx(null);
    onSelectMonth?.(monthKey);
    navigate(`#/month/${monthKey}`);
  };

  const handleBarSelect = (idx: number, monthKey: string) => {
    const pType = lastPointerTypeRef.current;
    if (pType === 'touch' || pType === 'pen') {
      if (pinnedIdx === idx) {
        handleOpenMonth(monthKey);
      } else {
        setPinnedIdx(idx);
        setHoveredIdx(idx);
      }
      return;
    }
    handleOpenMonth(monthKey);
  };

  const chartTitle =
    horizon === '6m'
      ? '6-month cash flow'
      : horizon === 'ytd'
      ? 'Year-to-date cash flow'
      : horizon === 'all'
      ? 'All-time monthly cash flow'
      : '12-month cash flow';

  const formatSavingsVerdict = (m: HorizonMonthPoint): { text: string; toneClass: string } => {
    if (!m.hasActivity) {
      return { text: 'No activity recorded', toneClass: 'text-muted-foreground' };
    }
    if (m.income <= 0 && m.totalExpense > 0) {
      return {
        text: `Deficit ${formatMoney(m.totalExpense)} (no income)`,
        toneClass: 'text-negative font-medium',
      };
    }
    if (m.saved >= 0) {
      const ratePart =
        m.rawSavingsRate !== null ? ` (${Math.round(m.rawSavingsRate)}%)` : '';
      return {
        text: `Kept ${formatMoney(m.saved)}${ratePart}`,
        toneClass: 'text-bucket-saved font-medium',
      };
    }
    const ratePart =
      m.rawSavingsRate !== null ? ` (${Math.round(m.rawSavingsRate)}%)` : '';
    return {
      text: `Overspent ${formatMoney(Math.abs(m.saved))}${ratePart}`,
      toneClass: 'text-negative font-medium',
    };
  };

  return (
    <div
      ref={containerRef}
      className="p-4 sm:p-5 rounded-[14px] bg-card border border-border space-y-4"
    >
      <div className="flex flex-wrap items-center justify-between gap-2 min-h-[28px]">
        <div className="flex items-center gap-2">
          <div>
            <h2 className="text-heading text-foreground">{chartTitle}</h2>
            <p className="text-label text-muted-foreground">
              {isCompact
                ? 'Tap a month bar to inspect, or tap Open to view its overview'
                : 'Hover to inspect · Click any month bar to open its overview'}
            </p>
          </div>
          {hasAnyNonTransferTransactions && !hasHorizonActivity && onViewAllTime && (
            <button
              type="button"
              data-testid="trend-view-all-time-btn"
              onClick={onViewAllTime}
              className="px-2.5 py-1 rounded-[8px] bg-surface2 hover:bg-secondary border border-border text-label font-medium text-foreground transition-colors"
            >
              View All Time
            </button>
          )}
        </div>

        {inspectedMonth ? (
          <div
            data-testid="trend-inspected-readout"
            className="flex flex-wrap items-center gap-x-3 gap-y-1.5 text-label tabular-nums num"
          >
            <span className="font-semibold text-foreground">{inspectedMonth.longLabel}</span>
            {inspectedMonth.hasActivity && (
              <>
                <span className="text-muted-foreground">
                  Income{' '}
                  <strong className="text-foreground">
                    {formatMoney(inspectedMonth.income)}
                  </strong>
                </span>
                <span className="text-muted-foreground">
                  Fixed{' '}
                  <strong className="text-foreground">
                    {formatMoney(inspectedMonth.fixed)}
                  </strong>
                </span>
                <span className="text-muted-foreground">
                  Variable{' '}
                  <strong className="text-foreground">
                    {formatMoney(inspectedMonth.flexible)}
                  </strong>
                </span>
                <span className="text-muted-foreground">
                  Non-monthly{' '}
                  <strong className="text-foreground">
                    {formatMoney(inspectedMonth.nonMonthly)}
                  </strong>
                </span>
              </>
            )}
            {(() => {
              const verdict = formatSavingsVerdict(inspectedMonth);
              return <span className={verdict.toneClass}>{verdict.text}</span>;
            })()}
            {pinnedIdx !== null && (
              <button
                type="button"
                data-testid="trend-open-month-btn"
                onClick={() => handleOpenMonth(inspectedMonth.month)}
                className="px-2 py-0.5 rounded-[8px] bg-surface2 hover:bg-secondary border border-border text-foreground font-medium transition-colors"
              >
                Open {inspectedMonth.shortLabel} →
              </button>
            )}
          </div>
        ) : (
          <div className="flex flex-wrap items-center gap-x-3.5 gap-y-1 text-label text-muted-foreground">
            <span className="inline-flex items-center gap-1.5">
              <span
                className="w-2.5 h-2.5 rounded-[3px]"
                style={{ backgroundColor: bucketColor('fixed') }}
              />
              Fixed
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span
                className="w-2.5 h-2.5 rounded-[3px]"
                style={{ backgroundColor: bucketColor('flexible') }}
              />
              Variable
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span
                className="w-2.5 h-2.5 rounded-[3px]"
                style={{ backgroundColor: bucketColor('non-monthly') }}
              />
              Non-monthly
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span
                className="w-3 h-[2px]"
                style={{ backgroundColor: bucketColor('saved') }}
              />
              Income
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span className="w-3 h-[1.5px] bg-foreground" />
              Savings rate
            </span>
          </div>
        )}
      </div>

      <div className="relative w-full select-none" data-own-arrows="true">
        <svg
          viewBox={`0 0 ${svgWidth} ${svgHeight}`}
          style={{ height: svgHeight }}
          data-testid="chart-svg-trend"
          className="w-full overflow-visible"
          onMouseLeave={() => {
            if (pinnedIdx === null) {
              setHoveredIdx(null);
            }
          }}
        >
          {!hasAnyNonTransferTransactions ? (
            <text
              x="50%"
              y="50%"
              textAnchor="middle"
              fill="currentColor"
              className="no-data-text text-muted-foreground text-label"
            >
              No data available
            </text>
          ) : !hasHorizonActivity ? (
            <text
              x="50%"
              y="50%"
              textAnchor="middle"
              fill="currentColor"
              className="no-data-text text-muted-foreground text-label"
            >
              No activity in selected horizon
            </text>
          ) : (
            <>
              {/* Left Dollar Grid Lines (0%, 50%, 100%) + Right Rate Extremes (-50%, +100%) */}
              {[0, 0.5, 1].map((frac, idx) => {
                const val = maxDollar * frac;
                const y = yForDollar(val);
                const rateLabel = frac === 1 ? '100%' : frac === 0 ? '-50%' : null;
                return (
                  <g key={idx}>
                    <line
                      x1={padLeft}
                      y1={y}
                      x2={svgWidth - padRight}
                      y2={y}
                      stroke="hsl(var(--border))"
                      strokeWidth="1"
                      strokeDasharray={frac === 0 ? undefined : '3 3'}
                    />
                    <text
                      x={padLeft - 6}
                      y={y + 4}
                      textAnchor="end"
                      className="text-label fill-muted-foreground tabular-nums num"
                    >
                      {val >= 1000
                        ? `$${(val / 1000).toFixed(val % 1000 === 0 ? 0 : 1)}k`
                        : formatMoney(val)}
                    </text>
                    {rateLabel && (
                      <text
                        x={svgWidth - padRight + 6}
                        y={y + 4}
                        textAnchor="start"
                        className="text-label fill-muted-foreground tabular-nums num"
                      >
                        {rateLabel}
                      </text>
                    )}
                  </g>
                );
              })}

              {/* 0% Breakeven Savings Rate Reference Line */}
              <g data-testid="trend-zero-rate-line">
                <line
                  x1={padLeft}
                  y1={zeroRateY}
                  x2={svgWidth - padRight}
                  y2={zeroRateY}
                  stroke="hsl(var(--faint))"
                  strokeOpacity="0.65"
                  strokeWidth="1"
                  strokeDasharray="4 3"
                />
                <text
                  x={svgWidth - padRight + 6}
                  y={zeroRateY + 4}
                  textAnchor="start"
                  className="text-label fill-muted-foreground font-medium tabular-nums num"
                >
                  0%
                </text>
              </g>

              {/* Stacked Monthly Bars */}
              {monthlyData.map((m, idx) => {
                const cx = padLeft + idx * colWidth + colWidth / 2;
                const bx = cx - barWidth / 2;
                const isInspected = activeIdx === idx;
                const isCurrent =
                  selectedMonth !== 'all' && m.month === effectiveAnchorMonth;
                const barOpacity = isInspected || isCurrent ? 0.94 : 0.72;

                const fixedH = (m.fixed / maxDollar) * plotH;
                const flexH = (m.flexible / maxDollar) * plotH;
                const nonMonthlyH = (m.nonMonthly / maxDollar) * plotH;

                const fixedY = padTop + plotH - fixedH;
                const flexY = fixedY - flexH;
                const nonMonthlyY = flexY - nonMonthlyH;
                const incomeY = yForDollar(m.income);

                const showMonthLabel =
                  idx % labelStride === 0 ||
                  idx === slotCount - 1 ||
                  m.month === effectiveAnchorMonth;

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
                    {showMonthLabel && (
                      <text
                        x={cx}
                        y={svgHeight - 8}
                        textAnchor="middle"
                        className={`text-label ${
                          isCurrent || isInspected
                            ? 'fill-foreground font-semibold'
                            : 'fill-muted-foreground'
                        }`}
                      >
                        {m.shortLabel}
                      </text>
                    )}

                    {/* Interactive hit column (pointer + keyboard accessible) */}
                    <rect
                      x={padLeft + idx * colWidth}
                      y={padTop}
                      width={colWidth}
                      height={plotH + 22}
                      fill="transparent"
                      role="button"
                      tabIndex={0}
                      aria-label={`${m.longLabel}: Income ${formatMoney(
                        m.income
                      )}, Outflow ${formatMoney(m.totalExpense)}`}
                      className="cursor-pointer outline-none focus-visible:stroke-ring"
                      data-testid={`trend-month-bar-${m.month}`}
                      onPointerDown={e => {
                        lastPointerTypeRef.current = e.pointerType || 'mouse';
                      }}
                      onMouseEnter={() => {
                        if (lastPointerTypeRef.current === 'mouse' && pinnedIdx === null) {
                          setHoveredIdx(idx);
                        }
                      }}
                      onFocus={() => setHoveredIdx(idx)}
                      onBlur={() => {
                        if (pinnedIdx === null) setHoveredIdx(null);
                      }}
                      onKeyDown={e => {
                        if (e.key === 'Enter' || e.key === ' ') {
                          e.preventDefault();
                          handleOpenMonth(m.month);
                        } else if (e.key === 'ArrowLeft') {
                          e.preventDefault();
                          const prevIdx = idx > 0 ? idx - 1 : monthlyData.length - 1;
                          const prevMonth = monthlyData[prevIdx]?.month;
                          if (prevMonth) {
                            const prevEl = containerRef.current?.querySelector(
                              `[data-testid="trend-month-bar-${prevMonth}"]`
                            ) as HTMLElement | null;
                            prevEl?.focus();
                          }
                        } else if (e.key === 'ArrowRight') {
                          e.preventDefault();
                          const nextIdx = idx < monthlyData.length - 1 ? idx + 1 : 0;
                          const nextMonth = monthlyData[nextIdx]?.month;
                          if (nextMonth) {
                            const nextEl = containerRef.current?.querySelector(
                              `[data-testid="trend-month-bar-${nextMonth}"]`
                            ) as HTMLElement | null;
                            nextEl?.focus();
                          }
                        }
                      }}
                      onClick={() => handleBarSelect(idx, m.month)}
                    />
                  </g>
                );
              })}

              {/* Savings rate line — STRICTLY 1 <path> element inside chart-svg-trend (tier1:580 & tier2:636) */}
              {savingsRatePath && (
                <path
                  d={savingsRatePath}
                  fill="none"
                  stroke="hsl(var(--foreground))"
                  strokeWidth="1.75"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  className="pointer-events-none"
                />
              )}

              {/* Active month dot on savings rate line (only when month has activity) */}
              {inspectedMonth &&
                activeIdx !== null &&
                inspectedMonth.plotSavingsRate !== null && (
                  <circle
                    cx={padLeft + activeIdx * colWidth + colWidth / 2}
                    cy={yForRate(inspectedMonth.plotSavingsRate)}
                    r={4}
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
  );
}
