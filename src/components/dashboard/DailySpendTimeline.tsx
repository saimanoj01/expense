import React, { useState, useMemo, useRef, useEffect } from 'react';
import type { Transaction } from '../../services/storage';
import { formatMoney } from '../../utils/formatters';
import { isRefundTransaction } from '../../utils/metrics';
import { getCurrentLocalMonth } from '../../utils/navigation';
import { buildMonthSpan, buildTrailingMonths } from '../../utils/trendsAnalytics';

export interface DailySpendTimelineProps {
  month: string;
  transactions: Transaction[];
  budget?: number;
  color?: string;
  height?: number;
  className?: string;
}

function getShortMonthName(month: string): string {
  if (!month || !/^\d{4}-\d{2}$/.test(month)) return '';
  const [yStr, mStr] = month.split('-');
  const d = new Date(Date.UTC(parseInt(yStr, 10), parseInt(mStr, 10) - 1, 1));
  return d.toLocaleDateString('en-US', { month: 'short', timeZone: 'UTC' });
}

function getShortMonthWithYear(month: string): string {
  if (!month || !/^\d{4}-\d{2}$/.test(month)) return month;
  const [yStr, mStr] = month.split('-');
  const d = new Date(Date.UTC(parseInt(yStr, 10), parseInt(mStr, 10) - 1, 1));
  const mon = d.toLocaleDateString('en-US', { month: 'short', timeZone: 'UTC' });
  return `${mon} ${yStr}`;
}

export const DailySpendTimeline: React.FC<DailySpendTimelineProps> = ({
  month,
  transactions,
  color = 'hsl(var(--c-fixed))',
  height = 120,
  className = '',
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const [measuredWidth, setMeasuredWidth] = useState<number>(640);

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

  const [hoveredSlot, setHoveredSlot] = useState<{
    label: string;
    amount: number;
    detail: string;
    xPct: number;
  } | null>(null);

  useEffect(() => {
    setHoveredSlot(null);
  }, [month]);

  const isAllTime = month === 'all';

  const daysInMonth = useMemo(() => {
    if (!month || isAllTime || !/^\d{4}-\d{2}$/.test(month)) return 30;
    const [yStr, mStr] = month.split('-');
    return new Date(parseInt(yStr, 10), parseInt(mStr, 10), 0).getDate();
  }, [month, isAllTime]);

  const cutoffDay = useMemo(() => {
    if (isAllTime) return daysInMonth;
    const now = new Date();
    const currKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    const maxTxnDay = transactions.reduce((maxD, t) => {
      if ((t.type === 'expense' || isRefundTransaction(t)) && t.date) {
        const d = parseInt(t.date.split('-')[2] || '0', 10);
        return Math.max(maxD, d);
      }
      return maxD;
    }, 0);
    if (month === currKey) {
      return Math.max(now.getDate(), maxTxnDay);
    }
    return daysInMonth;
  }, [month, isAllTime, transactions, daysInMonth]);

  const dailyData = useMemo(() => {
    if (isAllTime) return [];
    const map: Record<number, { amount: number; topMerchant: string; topAmt: number }> = {};
    for (let d = 1; d <= daysInMonth; d++) {
      map[d] = { amount: 0, topMerchant: '', topAmt: 0 };
    }

    transactions.forEach(t => {
      if ((t.type === 'expense' || isRefundTransaction(t)) && t.date) {
        const day = parseInt(t.date.split('-')[2] || '0', 10);
        if (day >= 1 && day <= daysInMonth) {
          const amt = Number(t.amount) || 0;
          map[day].amount += isRefundTransaction(t) ? -amt : amt;
          if (!isRefundTransaction(t) && amt >= map[day].topAmt) {
            map[day].topAmt = amt;
            map[day].topMerchant = t.description || '';
          }
        }
      }
    });

    return Object.entries(map).map(([dStr, val]) => ({
      day: parseInt(dStr, 10),
      amount: Math.max(0, val.amount),
      topMerchant: val.topMerchant,
    }));
  }, [transactions, daysInMonth, isAllTime]);

  const monthlyData = useMemo(() => {
    if (!isAllTime) return [];
    const txMonthsSet = new Set<string>();
    for (const t of transactions) {
      if ((t.type === 'expense' || isRefundTransaction(t)) && t.date && t.date.length >= 7) {
        const mk = t.date.slice(0, 7);
        if (/^\d{4}-\d{2}$/.test(mk)) {
          txMonthsSet.add(mk);
        }
      }
    }
    const sortedTxMonths = Array.from(txMonthsSet).sort();
    let monthKeys: string[];
    if (sortedTxMonths.length === 0) {
      monthKeys = buildTrailingMonths(getCurrentLocalMonth(), 6);
    } else if (sortedTxMonths.length === 1) {
      monthKeys = buildTrailingMonths(sortedTxMonths[0], 6);
    } else {
      monthKeys = buildMonthSpan(
        sortedTxMonths[0],
        sortedTxMonths[sortedTxMonths.length - 1]
      );
    }

    const byMonth = new Map<string, { rawNet: number; count: number }>();
    monthKeys.forEach(mk => byMonth.set(mk, { rawNet: 0, count: 0 }));

    for (const t of transactions) {
      if (!t.date || t.date.length < 7) continue;
      const mk = t.date.slice(0, 7);
      const slot = byMonth.get(mk);
      if (!slot) continue;
      if (t.type === 'expense' || isRefundTransaction(t)) {
        const amt = Number(t.amount) || 0;
        slot.rawNet += isRefundTransaction(t) ? -amt : amt;
        if (!isRefundTransaction(t)) slot.count += 1;
      }
    }

    return monthKeys.map(mk => {
      const slot = byMonth.get(mk)!;
      return {
        month: mk,
        shortLabel: getShortMonthName(mk),
        longLabel: getShortMonthWithYear(mk),
        amount: Math.max(0, slot.rawNet),
        count: slot.count,
      };
    });
  }, [isAllTime, transactions]);

  const svgWidth = Math.max(300, measuredWidth || 640);
  const padTop = 8;
  const padBottom = 22;
  const chartHeight = height - padTop - padBottom;

  if (isAllTime) {
    const slotCount = Math.max(1, monthlyData.length);
    const slotWidth = svgWidth / slotCount;
    const barWidth = Math.max(6, Math.min(36, slotWidth * 0.62));
    const maxMonthly = Math.max(...monthlyData.map(m => m.amount), 10);
    const totalMonthlySpend = monthlyData.reduce((s, m) => s + m.amount, 0);
    const activeCount = Math.max(1, monthlyData.filter(m => m.amount > 0).length);
    const avgMonthly = totalMonthlySpend / activeCount;
    const avgY = padTop + chartHeight - Math.min(1, avgMonthly / maxMonthly) * chartHeight;
    const maxLabels = Math.max(4, Math.floor(svgWidth / 44));
    const stride = Math.max(1, Math.ceil(slotCount / maxLabels));

    return (
      <div
        ref={containerRef}
        data-testid="daily-spend-timeline"
        className={`relative py-2 ${className}`}
      >
        <div className="relative w-full">
          <svg
            viewBox={`0 0 ${svgWidth} ${height}`}
            style={{ height }}
            className="w-full overflow-visible select-none"
            onMouseLeave={() => setHoveredSlot(null)}
          >
            {totalMonthlySpend > 0 && (
              <line
                x1={0}
                y1={avgY}
                x2={svgWidth}
                y2={avgY}
                stroke="hsl(var(--border))"
                strokeWidth="1"
                strokeDasharray="3 3"
              />
            )}

            {monthlyData.map((m, idx) => {
              const cx = (idx + 0.5) * slotWidth;
              const x = cx - barWidth / 2;
              const isZero = m.amount <= 0;
              const barH = isZero
                ? 2
                : Math.max(4, (m.amount / maxMonthly) * chartHeight);
              const y = padTop + chartHeight - barH;
              const showLabel = idx % stride === 0 || idx === slotCount - 1;

              return (
                <g
                  key={m.month}
                  onMouseEnter={() =>
                    setHoveredSlot({
                      label: m.longLabel,
                      amount: m.amount,
                      detail: m.count > 0 ? `${m.count} txn${m.count === 1 ? '' : 's'}` : '',
                      xPct: ((idx + 0.5) / slotCount) * 100,
                    })
                  }
                  className="cursor-pointer"
                >
                  <rect
                    x={idx * slotWidth}
                    y={padTop}
                    width={slotWidth}
                    height={chartHeight}
                    fill="transparent"
                  />
                  <rect
                    x={x}
                    y={y}
                    width={barWidth}
                    height={barH}
                    rx={isZero ? 1 : 3}
                    fill={isZero ? 'hsl(var(--surface-2))' : color}
                    fillOpacity={isZero ? 1 : 0.9}
                  />
                  {showLabel && (
                    <text
                      x={cx}
                      y={height - 4}
                      textAnchor="middle"
                      className="text-label font-medium fill-muted-foreground tabular-nums num"
                    >
                      {m.shortLabel}
                    </text>
                  )}
                </g>
              );
            })}
          </svg>

          {hoveredSlot && (
            <div
              style={{
                left: `${Math.min(88, Math.max(12, hoveredSlot.xPct))}%`,
                top: 0,
              }}
              className="absolute -translate-x-1/2 -translate-y-full pointer-events-none px-2.5 py-1 rounded-[10px] bg-popover border border-border shadow-md text-label text-foreground whitespace-nowrap z-20 tabular-nums num"
            >
              <span>
                {hoveredSlot.label} · {formatMoney(hoveredSlot.amount)}
                {hoveredSlot.detail ? ` · ${hoveredSlot.detail}` : ''}
              </span>
            </div>
          )}
        </div>
      </div>
    );
  }

  const maxDaily = Math.max(...dailyData.map(d => d.amount), 10);
  const totalSpend = dailyData.reduce((s, d) => s + d.amount, 0);
  const avgDaily = cutoffDay > 0 ? totalSpend / cutoffDay : 0;
  const slotWidth = svgWidth / daysInMonth;
  const barWidth = Math.max(3, slotWidth - 3);
  const avgY = padTop + chartHeight - Math.min(1, avgDaily / maxDaily) * chartHeight;
  const shortMonth = getShortMonthName(month);

  return (
    <div
      ref={containerRef}
      data-testid="daily-spend-timeline"
      className={`relative py-2 ${className}`}
    >
      <div className="relative w-full">
        <svg
          viewBox={`0 0 ${svgWidth} ${height}`}
          style={{ height }}
          className="w-full overflow-visible select-none"
          onMouseLeave={() => setHoveredSlot(null)}
        >
          {totalSpend > 0 && (
            <line
              x1={0}
              y1={avgY}
              x2={svgWidth}
              y2={avgY}
              stroke="hsl(var(--border))"
              strokeWidth="1"
              strokeDasharray="3 3"
            />
          )}

          {dailyData.map(d => {
            if (d.day > cutoffDay) return null;
            const x = (d.day - 1) * slotWidth + 1.5;
            const isZero = d.amount <= 0;
            const barH = isZero
              ? 2
              : Math.max(4, (d.amount / maxDaily) * chartHeight);
            const y = padTop + chartHeight - barH;

            return (
              <g
                key={d.day}
                onMouseEnter={() =>
                  setHoveredSlot({
                    label: `${shortMonth} ${d.day}`,
                    amount: d.amount,
                    detail: d.topMerchant,
                    xPct: ((d.day - 0.5) / daysInMonth) * 100,
                  })
                }
                className="cursor-pointer"
              >
                <rect
                  x={(d.day - 1) * slotWidth}
                  y={padTop}
                  width={slotWidth}
                  height={chartHeight}
                  fill="transparent"
                />
                <rect
                  x={x}
                  y={y}
                  width={barWidth}
                  height={barH}
                  rx={isZero ? 1 : 3}
                  fill={isZero ? 'hsl(var(--surface-2))' : color}
                  fillOpacity={isZero ? 1 : 0.9}
                />
              </g>
            );
          })}

          <text
            x={slotWidth / 2}
            y={height - 4}
            textAnchor="start"
            className="text-label font-medium fill-muted-foreground tabular-nums num"
          >
            {shortMonth} 1
          </text>
          <text
            x={14.5 * slotWidth}
            y={height - 4}
            textAnchor="middle"
            className="text-label font-medium fill-muted-foreground tabular-nums num"
          >
            15
          </text>
          <text
            x={svgWidth - 1.5}
            y={height - 4}
            textAnchor="end"
            className="text-label font-medium fill-muted-foreground tabular-nums num"
          >
            {daysInMonth}
          </text>
        </svg>

        {hoveredSlot && (
          <div
            style={{
              left: `${Math.min(88, Math.max(12, hoveredSlot.xPct))}%`,
              top: 0,
            }}
            className="absolute -translate-x-1/2 -translate-y-full pointer-events-none px-2.5 py-1 rounded-[10px] bg-popover border border-border shadow-md text-label text-foreground whitespace-nowrap z-20 tabular-nums num"
          >
            <span>
              {hoveredSlot.label} · {formatMoney(hoveredSlot.amount)}
              {hoveredSlot.detail ? ` · ${hoveredSlot.detail}` : ''}
            </span>
          </div>
        )}
      </div>
    </div>
  );
};
