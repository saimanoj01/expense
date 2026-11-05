import React, { useState, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Transaction } from '../../services/storage';
import { formatCurrency } from '../../utils/formatters';

export interface DailySpendTimelineProps {
  month: string; // e.g. '2026-11' or 'all'
  transactions: Transaction[];
  budget?: number;
  color?: string;
  height?: number;
  className?: string;
}

export const DailySpendTimeline: React.FC<DailySpendTimelineProps> = ({
  month,
  transactions,
  budget = 0,
  color = '#6366F1', // Indigo primary
  height = 140,
  className = ''
}) => {
  const [hoveredDay, setHoveredDay] = useState<{
    day: number;
    amount: number;
    cumulative: number;
    x: number;
    y: number;
    txnCount: number;
  } | null>(null);

  // Calculate days in month
  const daysInMonth = useMemo(() => {
    if (!month || month === 'all' || !/^\d{4}-\d{2}$/.test(month)) return 30;
    const [yStr, mStr] = month.split('-');
    const y = parseInt(yStr, 10);
    const m = parseInt(mStr, 10);
    return new Date(y, m, 0).getDate();
  }, [month]);

  // Aggregate daily expenses
  const dailyData = useMemo(() => {
    const dailyMap: Record<number, { amount: number; txnCount: number }> = {};
    for (let d = 1; d <= daysInMonth; d++) {
      dailyMap[d] = { amount: 0, txnCount: 0 };
    }

    transactions.forEach(t => {
      if (t.type === 'expense' && t.date) {
        const day = parseInt(t.date.split('-')[2] || '0', 10);
        if (day >= 1 && day <= daysInMonth) {
          dailyMap[day].amount += Number(t.amount) || 0;
          dailyMap[day].txnCount += 1;
        }
      }
    });

    let running = 0;
    return Object.entries(dailyMap).map(([dStr, data]) => {
      const day = parseInt(dStr, 10);
      running += data.amount;
      return {
        day,
        dailyAmount: data.amount,
        cumulativeAmount: running,
        txnCount: data.txnCount
      };
    });
  }, [transactions, daysInMonth]);

  const maxAmount = useMemo(() => {
    const maxDaily = Math.max(...dailyData.map(d => d.dailyAmount), 0);
    return Math.max(maxDaily, budget > 0 ? budget / daysInMonth * 2 : 10, 1);
  }, [dailyData, budget, daysInMonth]);

  const width = 500;
  const paddingX = 24;
  const paddingY = 20;
  const chartWidth = width - paddingX * 2;
  const chartHeight = height - paddingY * 2;

  // Scale functions
  const getX = (day: number) => paddingX + ((day - 1) / (daysInMonth - 1)) * chartWidth;
  const getY = (amount: number) => paddingY + chartHeight - (amount / maxAmount) * chartHeight;

  // Generate SVG path for daily bar / step points
  const points = dailyData.map(d => ({
    x: getX(d.day),
    y: getY(d.dailyAmount),
    data: d
  }));

  // Build smooth path
  const linePath = useMemo(() => {
    if (points.length === 0) return '';
    return points.reduce((acc, curr, idx) => {
      if (idx === 0) return `M ${curr.x} ${curr.y}`;
      return `${acc} L ${curr.x} ${curr.y}`;
    }, '');
  }, [points]);

  const areaPath = useMemo(() => {
    if (points.length === 0) return '';
    const firstX = points[0].x;
    const lastX = points[points.length - 1].x;
    const bottomY = paddingY + chartHeight;
    return `${linePath} L ${lastX} ${bottomY} L ${firstX} ${bottomY} Z`;
  }, [linePath, points, chartHeight, paddingY]);

  // Average daily spend
  const totalSpend = dailyData.length > 0 ? dailyData[dailyData.length - 1].cumulativeAmount : 0;
  const avgDaily = daysInMonth > 0 ? totalSpend / daysInMonth : 0;

  return (
    <div
      data-testid="daily-spend-timeline"
      className={`relative rounded-2xl p-4 bg-card/70 border border-border/70 backdrop-blur-md shadow-sm ${className}`}
    >
      <div className="flex items-center justify-between gap-2 mb-2">
        <div>
          <h4 className="text-xs font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full" style={{ backgroundColor: color }} />
            Daily Spending Velocity
          </h4>
          <span className="text-[10px] text-muted-foreground">Velocity & pace across day 1 to {daysInMonth}</span>
        </div>

        <div className="flex items-center gap-3 text-xs font-mono">
          <div className="text-right">
            <span className="text-[10px] text-muted-foreground block">Avg / Day</span>
            <span className="font-bold text-foreground tabular-nums">{formatCurrency(avgDaily)}</span>
          </div>
          <div className="text-right">
            <span className="text-[10px] text-muted-foreground block">Total</span>
            <span className="font-bold text-foreground tabular-nums">{formatCurrency(totalSpend)}</span>
          </div>
        </div>
      </div>

      <div className="relative w-full overflow-hidden">
        <svg
          viewBox={`0 0 ${width} ${height}`}
          className="w-full h-auto overflow-visible select-none"
          onMouseLeave={() => setHoveredDay(null)}
        >
          <defs>
            <linearGradient id={`gradient-${color.replace('#', '')}`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={color} stopOpacity="0.35" />
              <stop offset="100%" stopColor={color} stopOpacity="0.0" />
            </linearGradient>
          </defs>

          {/* Grid lines */}
          <line
            x1={paddingX}
            y1={paddingY}
            x2={width - paddingX}
            y2={paddingY}
            stroke="currentColor"
            strokeOpacity="0.08"
            strokeDasharray="4 4"
          />
          <line
            x1={paddingX}
            y1={paddingY + chartHeight / 2}
            x2={width - paddingX}
            y2={paddingY + chartHeight / 2}
            stroke="currentColor"
            strokeOpacity="0.08"
            strokeDasharray="4 4"
          />
          <line
            x1={paddingX}
            y1={paddingY + chartHeight}
            x2={width - paddingX}
            y2={paddingY + chartHeight}
            stroke="currentColor"
            strokeOpacity="0.15"
          />

          {/* Area fill */}
          {areaPath && (
            <path
              d={areaPath}
              fill={`url(#gradient-${color.replace('#', '')})`}
            />
          )}

          {/* Line stroke */}
          {linePath && (
            <path
              d={linePath}
              fill="none"
              stroke={color}
              strokeWidth="2.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          )}

          {/* Data Points */}
          {points.map(pt => {
            const hasSpend = pt.data.dailyAmount > 0;
            const isHighSpike = pt.data.dailyAmount > avgDaily * 1.5 && avgDaily > 0;
            const isHovered = hoveredDay?.day === pt.data.day;

            return (
              <g
                key={pt.data.day}
                onMouseEnter={() =>
                  setHoveredDay({
                    day: pt.data.day,
                    amount: pt.data.dailyAmount,
                    cumulative: pt.data.cumulativeAmount,
                    x: pt.x,
                    y: pt.y,
                    txnCount: pt.data.txnCount
                  })
                }
                className="cursor-pointer group"
              >
                {/* Invisible hover target */}
                <rect
                  x={pt.x - chartWidth / daysInMonth / 2}
                  y={paddingY}
                  width={chartWidth / daysInMonth}
                  height={chartHeight}
                  fill="transparent"
                />

                {hasSpend && (
                  <circle
                    cx={pt.x}
                    cy={pt.y}
                    r={isHovered ? 5.5 : isHighSpike ? 4 : 3}
                    fill={isHighSpike ? '#F59E0B' : color}
                    stroke="#ffffff"
                    strokeWidth="1.5"
                    className="transition-all duration-150"
                  />
                )}
              </g>
            );
          })}

          {/* Hover indicator vertical line */}
          {hoveredDay && (
            <line
              x1={hoveredDay.x}
              y1={paddingY}
              x2={hoveredDay.x}
              y2={paddingY + chartHeight}
              stroke={color}
              strokeWidth="1"
              strokeDasharray="2 2"
              opacity="0.6"
            />
          )}

          {/* Day Axis ticks */}
          <text
            x={paddingX}
            y={height - 4}
            className="text-[9px] fill-muted-foreground/60 font-mono"
          >
            Day 1
          </text>
          <text
            x={paddingX + chartWidth / 2}
            y={height - 4}
            textAnchor="middle"
            className="text-[9px] fill-muted-foreground/60 font-mono"
          >
            Day {Math.round(daysInMonth / 2)}
          </text>
          <text
            x={width - paddingX}
            y={height - 4}
            textAnchor="end"
            className="text-[9px] fill-muted-foreground/60 font-mono"
          >
            Day {daysInMonth}
          </text>
        </svg>

        {/* Hover Floating Tooltip */}
        <AnimatePresence>
          {hoveredDay && (
            <motion.div
              initial={{ opacity: 0, y: 4 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 4 }}
              transition={{ duration: 0.12 }}
              style={{
                left: `${Math.min(Math.max(hoveredDay.x - 60, 8), width - 128)}px`,
                top: '8px'
              }}
              className="absolute pointer-events-none p-2 rounded-xl bg-popover/95 border border-border shadow-xl backdrop-blur-md text-[11px] z-20 min-w-[120px]"
            >
              <div className="font-bold text-foreground flex items-center justify-between">
                <span>Day {hoveredDay.day}</span>
                <span className="text-[10px] text-muted-foreground font-mono">
                  {hoveredDay.txnCount} txn{hoveredDay.txnCount !== 1 ? 's' : ''}
                </span>
              </div>
              <div className="text-xs font-extrabold font-mono text-primary mt-0.5 tabular-nums">
                {formatCurrency(hoveredDay.amount)}
              </div>
              <div className="text-[9px] text-muted-foreground mt-0.5 tabular-nums">
                Cumulative: {formatCurrency(hoveredDay.cumulative)}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
};
