import React, { useState, useMemo, useCallback, useEffect } from 'react';
import { motion, useMotionValue, useSpring } from 'framer-motion';
import { Transaction } from '../../services/storage';
import { formatMoney, splitMoneyParts } from '../../utils/formatters';
import { dur, ease } from '../../theme/motion';
import { useNavigation } from '../../hooks/useNavigation';

export interface SpendTimelineProps {
  selectedMonth: string;
  priorMonthKey?: string | null;
  allTransactions: Transaction[];
  totalExpenses: number;
  totalBudget?: number;
  isOverview?: boolean;
  className?: string;
}

function getShortMonth(monthStr?: string | null): string {
  if (!monthStr || !/^\d{4}-\d{2}$/.test(monthStr)) return 'Month';
  const [yStr, mStr] = monthStr.split('-');
  const d = new Date(Date.UTC(parseInt(yStr, 10), parseInt(mStr, 10) - 1, 1));
  return d.toLocaleDateString('en-US', { month: 'short', timeZone: 'UTC' });
}

function getDaysInMonth(monthStr?: string | null): number {
  if (!monthStr || !/^\d{4}-\d{2}$/.test(monthStr)) return 30;
  const [yStr, mStr] = monthStr.split('-');
  return new Date(parseInt(yStr, 10), parseInt(mStr, 10), 0).getDate();
}

export const SpendTimeline: React.FC<SpendTimelineProps> = ({
  selectedMonth,
  priorMonthKey,
  allTransactions,
  totalExpenses,
  totalBudget = 0,
  isOverview = true,
  className = '',
}) => {
  const { navigate } = useNavigation();

  const daysInMonth = useMemo(() => getDaysInMonth(selectedMonth), [selectedMonth]);
  const priorDaysInMonth = useMemo(
    () => getDaysInMonth(priorMonthKey || selectedMonth),
    [priorMonthKey, selectedMonth]
  );

  // Current month cumulative spend by day (1-indexed: index 0 = day 1)
  const { currentCum, cutoffDay } = useMemo(() => {
    const monthPrefix = selectedMonth === 'all' ? '' : selectedMonth;
    const expTxns = allTransactions.filter(
      t =>
        t.type === 'expense' &&
        (selectedMonth === 'all' || (t.date && t.date.startsWith(monthPrefix)))
    );

    const byDay = new Array(daysInMonth).fill(0);
    let maxTxnDay = 1;
    expTxns.forEach(t => {
      const d = parseInt((t.date || '').split('-')[2] || '1', 10);
      const clamped = Math.min(daysInMonth, Math.max(1, d));
      maxTxnDay = Math.max(maxTxnDay, clamped);
      byDay[clamped - 1] += t.amount;
    });

    const now = new Date();
    const currKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    const cutoff =
      selectedMonth === currKey
        ? Math.min(daysInMonth, Math.max(now.getDate(), maxTxnDay))
        : selectedMonth > currKey && selectedMonth !== 'all'
        ? Math.min(daysInMonth, Math.max(maxTxnDay, 15))
        : daysInMonth;

    const cum: number[] = [];
    let running = 0;
    for (let i = 0; i < daysInMonth; i++) {
      running += byDay[i];
      cum.push(running);
    }

    return { currentCum: cum, cutoffDay: cutoff };
  }, [allTransactions, selectedMonth, daysInMonth]);

  // Prior month cumulative spend by day
  const { priorCum, hasPrior } = useMemo(() => {
    if (!priorMonthKey) return { priorCum: [] as number[], hasPrior: false };
    const expTxns = allTransactions.filter(
      t => t.type === 'expense' && t.date && t.date.startsWith(priorMonthKey)
    );
    if (expTxns.length === 0) return { priorCum: [] as number[], hasPrior: false };

    const byDay = new Array(daysInMonth).fill(0);
    expTxns.forEach(t => {
      const d = parseInt((t.date || '').split('-')[2] || '1', 10);
      const idx = Math.min(daysInMonth - 1, Math.max(0, d - 1));
      byDay[idx] += t.amount;
    });

    const cum: number[] = [];
    let running = 0;
    for (let i = 0; i < daysInMonth; i++) {
      running += byDay[i];
      cum.push(running);
    }
    return { priorCum: cum, hasPrior: true };
  }, [allTransactions, priorMonthKey, daysInMonth]);

  const width = 600;
  const height = 80;
  const padTop = 8;
  const padBottom = 18;
  const chartH = height - padTop - padBottom;

  const maxVal = useMemo(() => {
    return Math.max(
      ...currentCum,
      ...(hasPrior ? priorCum : [0]),
      totalBudget,
      1
    );
  }, [currentCum, priorCum, hasPrior, totalBudget]);

  const getX = useCallback(
    (dayIndex0: number) => {
      if (daysInMonth <= 1) return 0;
      return (dayIndex0 / (daysInMonth - 1)) * width;
    },
    [daysInMonth]
  );

  const getY = useCallback(
    (val: number) => {
      return padTop + chartH - (val / maxVal) * chartH;
    },
    [chartH, maxVal]
  );

  // Build SVG paths (current month stops at cutoffDay)
  const currentPath = useMemo(() => {
    return currentCum
      .slice(0, cutoffDay)
      .map((val, idx) => `${idx === 0 ? 'M' : 'L'} ${getX(idx).toFixed(1)} ${getY(val).toFixed(1)}`)
      .join(' ');
  }, [currentCum, cutoffDay, getX, getY]);

  const priorPath = useMemo(() => {
    if (!hasPrior) return '';
    return priorCum
      .map((val, idx) => `${idx === 0 ? 'M' : 'L'} ${getX(idx).toFixed(1)} ${getY(val).toFixed(1)}`)
      .join(' ');
  }, [priorCum, hasPrior, getX, getY]);

  const budgetY = totalBudget > 0 ? getY(totalBudget) : null;

  // Interactive scrub state
  const [scrubDay, setScrubDay] = useState<number | null>(null);
  const activeDay = scrubDay ?? cutoffDay;

  const rawX = useMotionValue(getX(activeDay - 1));
  const rawY = useMotionValue(getY(currentCum[activeDay - 1] || 0));
  const springX = useSpring(rawX, { stiffness: 500, damping: 40 });
  const springY = useSpring(rawY, { stiffness: 500, damping: 40 });

  useEffect(() => {
    const idx = Math.min(cutoffDay - 1, Math.max(0, activeDay - 1));
    rawX.set(getX(idx));
    rawY.set(getY(currentCum[idx] || 0));
  }, [activeDay, cutoffDay, currentCum, getX, getY, rawX, rawY]);

  const handlePointerScrub = (e: React.PointerEvent<SVGRectElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    if (rect.width <= 0) return;
    const relX = Math.max(0, Math.min(rect.width, e.clientX - rect.left));
    const day = Math.round((relX / rect.width) * (daysInMonth - 1)) + 1;
    const clampedDay = Math.min(cutoffDay, Math.max(1, day));
    setScrubDay(clampedDay);
  };

  const handleDayClick = (day: number) => {
    navigate(`#/transactions?month=${selectedMonth}&day=${day}`);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (e.key === 'ArrowLeft') {
      e.preventDefault();
      e.stopPropagation();
      setScrubDay(prev => Math.max(1, (prev ?? cutoffDay) - 1));
    } else if (e.key === 'ArrowRight') {
      e.preventDefault();
      e.stopPropagation();
      setScrubDay(prev => Math.min(cutoffDay, (prev ?? cutoffDay) + 1));
    } else if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      handleDayClick(activeDay);
    }
  };

  const currMonthShort = getShortMonth(selectedMonth);
  const prevMonthShort = getShortMonth(priorMonthKey);
  const activeIdx = Math.min(cutoffDay - 1, Math.max(0, activeDay - 1));
  const activeSpent = currentCum[activeIdx] || 0;
  const priorAtDay = hasPrior
    ? priorCum[Math.min(priorDaysInMonth - 1, activeIdx)] ?? null
    : null;
  const diffVsPrior = priorAtDay !== null ? activeSpent - priorAtDay : null;

  const tooltipText = useMemo(() => {
    const base = `${currMonthShort} ${activeDay} · ${formatMoney(activeSpent)} spent`;
    if (diffVsPrior === null) return base;
    if (Math.abs(diffVsPrior) < 1) return `${base} · same as ${prevMonthShort} ${activeDay}`;
    return `${base} · ${formatMoney(Math.abs(diffVsPrior))} ${
      diffVsPrior > 0 ? 'more' : 'less'
    } than ${prevMonthShort} ${activeDay}`;
  }, [currMonthShort, activeDay, activeSpent, diffVsPrior, prevMonthShort]);

  const expenseParts = splitMoneyParts(totalExpenses);

  return (
    <div className={`space-y-1.5 ${className}`}>
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-3">
          <h3 className="text-heading text-foreground">Spending this month</h3>
          {scrubDay !== null && (
            <span
              data-testid="timeline-scrub-tooltip"
              className="text-label text-muted-foreground tabular-nums num"
            >
              {tooltipText}
            </span>
          )}
        </div>
        <span className="text-label text-muted-foreground tabular-nums num shrink-0">
          <span
            data-testid={isOverview ? 'kpi-total-expenses' : undefined}
            className="text-foreground font-medium"
          >
            {expenseParts.whole}
            <span className="sr-only">{expenseParts.cents}</span>
          </span>{' '}
          so far
        </span>
      </div>

      <div
        tabIndex={0}
        role="slider"
        data-own-arrows="true"
        data-testid="spend-timeline-slider"
        aria-label="Spend timeline"
        aria-valuemin={1}
        aria-valuemax={cutoffDay}
        aria-valuenow={activeDay}
        aria-valuetext={tooltipText}
        onKeyDown={handleKeyDown}
        onFocus={() => {
          if (scrubDay === null) setScrubDay(cutoffDay);
        }}
        onBlur={() => setScrubDay(null)}
        className="relative w-full h-[76px] sm:h-[80px] rounded-[10px] focus-visible:ring-2 ring-ring/40 outline-none select-none"
      >
        <svg
          viewBox={`0 0 ${width} ${height}`}
          className="w-full h-full overflow-visible"
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

          {/* Prior month ghost line (1.5px --faint dashed 3 3) */}
          {hasPrior && priorPath && (
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

          {/* Current month cumulative line (2px foreground, stops at today/cutoff) */}
          {currentPath && (
            <motion.path
              d={currentPath}
              fill="none"
              stroke="hsl(var(--foreground))"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              initial={{ pathLength: 0 }}
              animate={{ pathLength: 1 }}
              transition={{ duration: dur.draw, ease }}
            />
          )}

          {/* Scrub vertical hairline & 6px dot */}
          {scrubDay !== null && (
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

          {/* Axis labels: 1st, 15th, last day */}
          <text
            x={0}
            y={height - 2}
            textAnchor="start"
            className="text-label fill-muted-foreground tabular-nums num"
          >
            {currMonthShort} 1
          </text>
          <text
            x={getX(14)}
            y={height - 2}
            textAnchor="middle"
            className="text-label fill-muted-foreground tabular-nums num"
          >
            15
          </text>
          <text
            x={width}
            y={height - 2}
            textAnchor="end"
            className="text-label fill-muted-foreground tabular-nums num"
          >
            {daysInMonth}
          </text>

          {/* Interactive Scrub & Click Overlay */}
          <rect
            x={0}
            y={0}
            width={width}
            height={height}
            fill="transparent"
            className="cursor-crosshair"
            onPointerDown={handlePointerScrub}
            onPointerMove={handlePointerScrub}
            onPointerLeave={() => setScrubDay(null)}
            onClick={e => {
              const rect = e.currentTarget.getBoundingClientRect();
              const relX = Math.max(0, Math.min(rect.width, e.clientX - rect.left));
              const day = Math.round((relX / rect.width) * (daysInMonth - 1)) + 1;
              const clampedDay = Math.min(cutoffDay, Math.max(1, day));
              handleDayClick(clampedDay);
            }}
          />
        </svg>
      </div>
    </div>
  );
};
