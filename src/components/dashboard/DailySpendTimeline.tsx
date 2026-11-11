import React, { useState, useMemo } from 'react';
import { Transaction } from '../../services/storage';
import { formatMoney } from '../../utils/formatters';
import { isRefundTransaction } from '../../utils/metrics';

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

export const DailySpendTimeline: React.FC<DailySpendTimelineProps> = ({
  month,
  transactions,
  color = 'hsl(var(--c-fixed))',
  height = 120,
  className = '',
}) => {
  const [hoveredDay, setHoveredDay] = useState<{
    day: number;
    amount: number;
    topMerchant: string;
    xPct: number;
  } | null>(null);

  const daysInMonth = useMemo(() => {
    if (!month || month === 'all' || !/^\d{4}-\d{2}$/.test(month)) return 30;
    const [yStr, mStr] = month.split('-');
    return new Date(parseInt(yStr, 10), parseInt(mStr, 10), 0).getDate();
  }, [month]);

  // Determine active cutoff day for current month (future days left blank)
  const cutoffDay = useMemo(() => {
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
  }, [month, transactions, daysInMonth]);

  const dailyData = useMemo(() => {
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
  }, [transactions, daysInMonth]);

  const maxDaily = useMemo(() => {
    return Math.max(...dailyData.map(d => d.amount), 10);
  }, [dailyData]);

  const totalSpend = useMemo(
    () => dailyData.reduce((s, d) => s + d.amount, 0),
    [dailyData]
  );
  const avgDaily = cutoffDay > 0 ? totalSpend / cutoffDay : 0;

  const width = 600;
  const padTop = 8;
  const padBottom = 22;
  const chartHeight = height - padTop - padBottom;
  const slotWidth = width / daysInMonth;
  const barWidth = Math.max(4, slotWidth - 3);
  const avgY = padTop + chartHeight - Math.min(1, avgDaily / maxDaily) * chartHeight;
  const shortMonth = getShortMonthName(month);

  return (
    <div
      data-testid="daily-spend-timeline"
      className={`relative py-2 ${className}`}
    >
      <div className="relative w-full">
        <svg
          viewBox={`0 0 ${width} ${height}`}
          className="w-full h-[120px] overflow-visible select-none"
          onMouseLeave={() => setHoveredDay(null)}
        >
          {/* Faint horizontal average daily spend line */}
          {totalSpend > 0 && (
            <line
              x1={0}
              y1={avgY}
              x2={width}
              y2={avgY}
              stroke="hsl(var(--border))"
              strokeWidth="1"
              strokeDasharray="3 3"
            />
          )}

          {/* Daily bars (future days blank, zero days as 2px surface2 stubs) */}
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
                  setHoveredDay({
                    day: d.day,
                    amount: d.amount,
                    topMerchant: d.topMerchant,
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

          {/* Axis labels: 1st, 15th, last day at 12/500 text-muted-foreground */}
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
            x={width - 1.5}
            y={height - 4}
            textAnchor="end"
            className="text-label font-medium fill-muted-foreground tabular-nums num"
          >
            {daysInMonth}
          </text>
        </svg>

        {hoveredDay && (
          <div
            style={{
              left: `${Math.min(88, Math.max(12, hoveredDay.xPct))}%`,
              top: 0,
            }}
            className="absolute -translate-x-1/2 -translate-y-full pointer-events-none px-2.5 py-1 rounded-[10px] bg-popover border border-border shadow-md text-label text-foreground whitespace-nowrap z-20 tabular-nums num"
          >
            <span>
              {shortMonth} {hoveredDay.day} · {formatMoney(hoveredDay.amount)}
              {hoveredDay.topMerchant ? ` · ${hoveredDay.topMerchant}` : ''}
            </span>
          </div>
        )}
      </div>
    </div>
  );
};
