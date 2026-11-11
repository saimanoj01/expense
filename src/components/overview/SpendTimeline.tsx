import React, { useState, useMemo, useCallback, useEffect, useRef } from 'react';
import { motion, useMotionValue, useSpring } from 'framer-motion';
import type { Transaction, Category } from '../../services/storage';
import { formatMoney, splitMoneyParts } from '../../utils/formatters';
import { dur, ease } from '../../theme/motion';
import { useNavigation } from '../../hooks/useNavigation';
import { computeSpendTimelineModel } from '../../utils/overviewTimeline';
import type { TimelineMode } from '../../utils/overviewTimeline';

export interface SpendTimelineProps {
  selectedMonth: string;
  availableMonths?: string[];
  priorMonthKey?: string | null;
  allTransactions: Transaction[];
  categories?: Category[];
  totalExpenses: number;
  totalBudget?: number;
  variableBudget?: number;
  isOverview?: boolean;
  className?: string;
}

export const SpendTimeline: React.FC<SpendTimelineProps> = ({
  selectedMonth,
  availableMonths = [],
  priorMonthKey,
  allTransactions,
  categories = [],
  totalExpenses,
  totalBudget = 0,
  variableBudget = 0,
  isOverview = true,
  className = '',
}) => {
  const { navigate } = useNavigation();
  const containerRef = useRef<HTMLDivElement>(null);
  const pointerDownXRef = useRef<number | null>(null);
  const didDragRef = useRef<boolean>(false);

  const [svgWidth, setSvgWidth] = useState(1080);
  const [mode, setMode] = useState<TimelineMode>('all');
  const [scrubIdx, setScrubIdx] = useState<number | null>(null);

  useEffect(() => {
    setScrubIdx(null);
  }, [selectedMonth, mode]);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const updateWidth = () => {
      const w = Math.round(el.getBoundingClientRect().width);
      if (w > 100) setSvgWidth(w);
    };
    updateWidth();
    if (typeof ResizeObserver !== 'undefined') {
      const ro = new ResizeObserver(() => updateWidth());
      ro.observe(el);
      return () => ro.disconnect();
    }
  }, []);

  const model = useMemo(
    () =>
      computeSpendTimelineModel({
        allTransactions,
        availableMonths,
        selectedMonth,
        priorMonthKey,
        categories,
        mode,
        totalExpenses,
        totalBudget,
        variableBudget,
      }),
    [
      allTransactions,
      availableMonths,
      selectedMonth,
      priorMonthKey,
      categories,
      mode,
      totalExpenses,
      totalBudget,
      variableBudget,
    ]
  );

  const width = svgWidth;
  const height = 78;
  const padTop = 18;
  const padBottom = 16;
  const chartH = height - padTop - padBottom;

  const maxVal = useMemo(() => {
    return Math.max(
      ...model.currentCum,
      ...(model.hasPrior ? model.priorCum : [0]),
      model.targetCeiling,
      1
    );
  }, [model.currentCum, model.priorCum, model.hasPrior, model.targetCeiling]);

  const pointCount = model.daysInMonth;

  const getX = useCallback(
    (index0: number, totalPoints: number = pointCount) => {
      if (totalPoints <= 1) return width / 2;
      return (index0 / (totalPoints - 1)) * width;
    },
    [pointCount, width]
  );

  const getY = useCallback(
    (val: number) => {
      return padTop + chartH - (val / maxVal) * chartH;
    },
    [chartH, maxVal]
  );

  const currentPath = useMemo(() => {
    if (!model.hasCurrentActivity || model.cutoffIndex <= 0) return '';
    const slice = model.currentCum.slice(0, model.cutoffIndex);
    if (slice.length === 1) {
      const x = getX(0);
      const y = getY(slice[0]);
      return `M ${(x - 3).toFixed(1)} ${y.toFixed(1)} L ${(x + 3).toFixed(1)} ${y.toFixed(1)}`;
    }
    return slice
      .map(
        (val, idx) =>
          `${idx === 0 ? 'M' : 'L'} ${getX(idx).toFixed(1)} ${getY(val).toFixed(1)}`
      )
      .join(' ');
  }, [model.hasCurrentActivity, model.cutoffIndex, model.currentCum, getX, getY]);

  const priorPath = useMemo(() => {
    if (!model.hasPrior || model.priorCum.length === 0) return '';
    const pTotal = model.priorCum.length;
    return model.priorCum
      .map(
        (val, idx) =>
          `${idx === 0 ? 'M' : 'L'} ${getX(idx, pTotal).toFixed(1)} ${getY(val).toFixed(1)}`
      )
      .join(' ');
  }, [model.hasPrior, model.priorCum, getX, getY]);

  const budgetY = model.targetCeiling > 0 ? getY(model.targetCeiling) : null;

  const maxScrubIdx = Math.max(0, model.cutoffIndex - 1);
  const activeIdx = Math.min(
    maxScrubIdx,
    Math.max(0, scrubIdx ?? maxScrubIdx)
  );

  const rawX = useMotionValue(getX(activeIdx));
  const rawY = useMotionValue(getY(model.currentCum[activeIdx] || 0));
  const springX = useSpring(rawX, { stiffness: 500, damping: 40 });
  const springY = useSpring(rawY, { stiffness: 500, damping: 40 });

  useEffect(() => {
    rawX.set(getX(activeIdx));
    rawY.set(getY(model.currentCum[activeIdx] || 0));
  }, [activeIdx, model.currentCum, getX, getY, rawX, rawY]);

  const resolveIdxFromClientX = (clientX: number, rect: DOMRect): number => {
    if (rect.width <= 0 || pointCount <= 1) return 0;
    const relX = Math.max(0, Math.min(rect.width, clientX - rect.left));
    const idx = Math.round((relX / rect.width) * (pointCount - 1));
    return Math.min(maxScrubIdx, Math.max(0, idx));
  };

  const handlePointActivate = (idx0: number) => {
    if (model.isAllTime) {
      const targetMonth = model.monthPoints[idx0]?.monthKey;
      if (targetMonth) {
        navigate(`#/month/${targetMonth}`);
      }
      return;
    }
    const day = idx0 + 1;
    navigate(`#/transactions?month=${selectedMonth}&day=${day}`);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (model.cutoffIndex <= 0) return;
    if (e.key === 'ArrowLeft') {
      e.preventDefault();
      e.stopPropagation();
      setScrubIdx(prev => Math.max(0, (prev ?? maxScrubIdx) - 1));
    } else if (e.key === 'ArrowRight') {
      e.preventDefault();
      e.stopPropagation();
      setScrubIdx(prev => Math.min(maxScrubIdx, (prev ?? maxScrubIdx) + 1));
    } else if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      handlePointActivate(activeIdx);
    }
  };

  const tooltipText = useMemo(() => {
    if (model.isAllTime) {
      const pt = model.monthPoints[activeIdx];
      if (!pt) return 'No spending recorded';
      return `${pt.label} · ${formatMoney(pt.monthlySpent)} spent`;
    }
    if (!model.hasCurrentActivity) {
      return `${model.currMonthShort} · $0 spent`;
    }
    const activeDay = activeIdx + 1;
    const activeSpent = model.currentCum[activeIdx] || 0;
    const base = `${model.currMonthShort} ${activeDay} · ${formatMoney(activeSpent)} spent`;
    if (!model.hasPrior || model.priorCum.length === 0) return base;

    const priorIdx = Math.min(model.priorDaysInMonth - 1, activeIdx);
    const priorAtDay = model.priorCum[priorIdx] ?? 0;
    const diff = activeSpent - priorAtDay;
    const compDay = priorIdx + 1;
    if (Math.abs(diff) < 1) {
      return `${base} · same as ${model.prevMonthShort} ${compDay}`;
    }
    return `${base} · ${formatMoney(Math.abs(diff))} ${
      diff > 0 ? 'more' : 'less'
    } than ${model.prevMonthShort} ${compDay}`;
  }, [model, activeIdx]);

  const expenseParts = splitMoneyParts(model.displayedTotal);

  const verdictToneClass =
    model.paceVerdict?.tone === 'positive'
      ? 'text-bucket-saved bg-bucket-saved/10'
      : model.paceVerdict?.tone === 'negative'
      ? 'text-negative bg-negative/10'
      : model.paceVerdict?.tone === 'warning'
      ? 'text-warning bg-warning/10'
      : 'text-muted-foreground bg-surface2';

  const firstAxisLabel = model.isAllTime
    ? model.monthPoints[0]?.label || 'Start'
    : `${model.currMonthShort} 1`;
  const midAxisLabel = model.isAllTime
    ? model.monthPoints.length >= 3
      ? model.monthPoints[Math.floor(model.monthPoints.length / 2)]?.label || ''
      : ''
    : '15';
  const endAxisLabel = model.isAllTime
    ? model.monthPoints.length >= 2
      ? model.monthPoints[model.monthPoints.length - 1]?.label || ''
      : ''
    : String(model.daysInMonth);

  return (
    <div className={`space-y-1.5 ${className}`}>
      <div className="min-h-[24px] flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-2 min-w-0">
          <h3 className="text-heading text-foreground shrink-0">{model.title}</h3>
          {scrubIdx !== null ? (
            <span
              data-testid="timeline-scrub-tooltip"
              className="text-label text-muted-foreground tabular-nums num truncate"
            >
              {tooltipText}
            </span>
          ) : (
            model.paceVerdict && (
              <span
                data-testid="timeline-pace-verdict"
                className={`px-2 py-0.5 rounded-full text-label font-medium tabular-nums num ${verdictToneClass}`}
              >
                {model.paceVerdict.text}
              </span>
            )
          )}
        </div>

        <div className="text-label text-muted-foreground tabular-nums num shrink-0 inline-flex flex-wrap items-center gap-2.5">
          <div
            data-testid="timeline-mode-toggle"
            role="group"
            aria-label="Timeline scope"
            className="inline-flex items-center p-0.5 rounded-[8px] bg-surface2 border border-border/60"
          >
            <button
              type="button"
              data-testid="timeline-mode-all"
              aria-pressed={mode === 'all'}
              onClick={() => setMode('all')}
              className={`px-2 py-0.5 rounded-[6px] text-[11px] font-medium transition-colors focus-visible:ring-2 ring-ring/40 ${
                mode === 'all'
                  ? 'bg-background text-foreground shadow-sm'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              All
            </button>
            <button
              type="button"
              data-testid="timeline-mode-variable"
              aria-pressed={mode === 'variable'}
              onClick={() => setMode('variable')}
              className={`px-2 py-0.5 rounded-[6px] text-[11px] font-medium transition-colors focus-visible:ring-2 ring-ring/40 ${
                mode === 'variable'
                  ? 'bg-background text-foreground shadow-sm'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              Variable
            </button>
          </div>

          <span>
            <span
              data-testid={isOverview ? 'timeline-total-expenses' : undefined}
              className="text-foreground font-medium inline-block overflow-hidden max-w-full align-bottom"
            >
              {expenseParts.whole}
              {expenseParts.cents && (
                <span className="text-[0.75em] opacity-75">{expenseParts.cents}</span>
              )}
            </span>{' '}
            {model.totalSuffix}
          </span>

          {isOverview && (
            <button
              type="button"
              data-testid="view-trends-breakdown-link"
              onClick={() => navigate(`#/trends?month=${selectedMonth}`)}
              className="text-xs font-medium text-muted-foreground hover:text-foreground underline underline-offset-4 transition-colors focus-visible:ring-2 ring-ring/40 rounded"
            >
              Full breakdown →
            </button>
          )}
        </div>
      </div>

      <div
        ref={containerRef}
        tabIndex={0}
        role="slider"
        data-own-arrows="true"
        data-testid="spend-timeline-slider"
        aria-label="Spend timeline"
        aria-valuemin={1}
        aria-valuemax={Math.max(1, model.cutoffIndex)}
        aria-valuenow={activeIdx + 1}
        aria-valuetext={tooltipText}
        onKeyDown={handleKeyDown}
        onFocus={() => {
          if (scrubIdx === null && model.cutoffIndex > 0) {
            setScrubIdx(maxScrubIdx);
          }
        }}
        onBlur={() => setScrubIdx(null)}
        className="relative w-full h-[76px] sm:h-[82px] rounded-[10px] focus-visible:ring-2 ring-ring/40 outline-none select-none"
      >
        {(model.hasPrior || model.targetCeiling > 0) && !model.isAllTime && (
          <div
            aria-hidden="true"
            className="pointer-events-none absolute right-1 top-0 z-10 px-1 rounded bg-background/85 text-[10px] leading-[12px] text-faint tabular-nums num"
          >
            Solid: {model.currMonthShort}
            {model.hasPrior ? ` · Dashed: ${model.prevMonthShort}` : ''}
            {model.targetCeiling > 0 ? ' · Dotted: Target' : ''}
          </div>
        )}

        <svg
          viewBox={`0 0 ${width} ${height}`}
          className="block w-full h-full overflow-visible"
          role="img"
          aria-label="Cumulative spending timeline"
        >
          {/* Baseline */}
          <line
            x1={0}
            y1={padTop + chartH}
            x2={width}
            y2={padTop + chartH}
            stroke="hsl(var(--border))"
            strokeWidth="1"
          />

          {/* Optional Budget ceiling line */}
          {budgetY !== null && (
            <line
              x1={0}
              y1={budgetY}
              x2={width}
              y2={budgetY}
              stroke="hsl(var(--border))"
              strokeWidth="1"
              strokeDasharray="2 2"
            />
          )}

          {/* Prior month ghost line */}
          {model.hasPrior && priorPath && (
            <path
              d={priorPath}
              fill="none"
              stroke="hsl(var(--faint))"
              strokeWidth="1.5"
              strokeDasharray="3 3"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          )}

          {/* Current period curve */}
          {currentPath && (
            <motion.path
              d={currentPath}
              fill="none"
              stroke={
                mode === 'variable'
                  ? 'hsl(var(--c-variable))'
                  : 'hsl(var(--foreground))'
              }
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              initial={{ pathLength: 0 }}
              animate={{ pathLength: 1 }}
              transition={{ duration: dur.draw, ease }}
            />
          )}

          {/* Scrub vertical hairline & dot */}
          {scrubIdx !== null && model.cutoffIndex > 0 && (
            <>
              <motion.line
                x1={springX}
                x2={springX}
                y1={padTop}
                y2={padTop + chartH}
                stroke="hsl(var(--faint))"
                strokeWidth="1"
              />
              <motion.circle
                cx={springX}
                cy={springY}
                r="3.5"
                fill="hsl(var(--foreground))"
                stroke="hsl(var(--background))"
                strokeWidth="1.5"
              />
            </>
          )}

          {/* Axis labels */}
          <text
            x={0}
            y={height - 2}
            textAnchor="start"
            className="text-label fill-muted-foreground tabular-nums num"
          >
            {firstAxisLabel}
          </text>
          {midAxisLabel && (
            <text
              x={model.isAllTime ? width / 2 : getX(14)}
              y={height - 2}
              textAnchor="middle"
              className="text-label fill-muted-foreground tabular-nums num"
            >
              {midAxisLabel}
            </text>
          )}
          {endAxisLabel && (
            <text
              x={width}
              y={height - 2}
              textAnchor="end"
              className="text-label fill-muted-foreground tabular-nums num"
            >
              {endAxisLabel}
            </text>
          )}

          {/* Interactive Scrub & Click Overlay (isolated from parent drag gestures) */}
          <rect
            x={0}
            y={0}
            width={width}
            height={height}
            fill="transparent"
            className={model.cutoffIndex > 0 ? 'cursor-crosshair' : 'cursor-default'}
            onPointerDown={e => {
              e.stopPropagation();
              pointerDownXRef.current = e.clientX;
              didDragRef.current = false;
              if (model.cutoffIndex > 0) {
                setScrubIdx(resolveIdxFromClientX(e.clientX, e.currentTarget.getBoundingClientRect()));
              }
            }}
            onPointerMove={e => {
              e.stopPropagation();
              if (pointerDownXRef.current !== null && Math.abs(e.clientX - pointerDownXRef.current) > 6) {
                didDragRef.current = true;
              }
              if (model.cutoffIndex > 0) {
                setScrubIdx(resolveIdxFromClientX(e.clientX, e.currentTarget.getBoundingClientRect()));
              }
            }}
            onPointerUp={e => {
              e.stopPropagation();
              pointerDownXRef.current = null;
            }}
            onPointerLeave={() => {
              pointerDownXRef.current = null;
              setScrubIdx(null);
            }}
            onClick={e => {
              e.stopPropagation();
              if (didDragRef.current) {
                didDragRef.current = false;
                return;
              }
              if (model.cutoffIndex <= 0) return;
              const idx0 = resolveIdxFromClientX(
                e.clientX,
                e.currentTarget.getBoundingClientRect()
              );
              handlePointActivate(idx0);
            }}
          />
        </svg>
      </div>
    </div>
  );
};
