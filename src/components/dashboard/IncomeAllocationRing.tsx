import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useNavigation } from '../../hooks/useNavigation';
import { formatCurrency } from '../../utils/formatters';
import { bucketColor } from '../../theme/buckets';

export interface IncomeAllocationRingProps {
  totalIncome: number;
  fixedExpenses: number;
  flexibleExpenses: number;
  nonMonthlyExpenses: number;
  savingsAmount: number;
  className?: string;
}

export const IncomeAllocationRing: React.FC<IncomeAllocationRingProps> = ({
  totalIncome,
  fixedExpenses,
  flexibleExpenses,
  nonMonthlyExpenses,
  savingsAmount,
  className = ''
}) => {
  const { currentRoute, navigate } = useNavigation();
  const activeMonth = currentRoute.month || new Date().toISOString().substring(0, 7);

  const [hoveredSegment, setHoveredSegment] = useState<string | null>(null);

  const savedPositive = Math.max(0, savingsAmount);
  const totalAllocated = Math.max(
    totalIncome,
    fixedExpenses + flexibleExpenses + nonMonthlyExpenses + savedPositive,
    0.0001
  );

  const segments = [
    {
      id: 'fixed',
      name: 'Fixed',
      amount: fixedExpenses,
      color: bucketColor('fixed'),
      drillBucket: 'fixed'
    },
    {
      id: 'variable',
      name: 'Variable',
      amount: flexibleExpenses,
      color: bucketColor('flexible'),
      drillBucket: 'variable'
    },
    {
      id: 'non-monthly',
      name: 'Non-monthly',
      amount: nonMonthlyExpenses,
      color: bucketColor('non-monthly'),
      drillBucket: 'non-monthly'
    },
    {
      id: 'saved',
      name: 'Saved',
      amount: savedPositive,
      color: bucketColor('saved'),
      drillBucket: 'income'
    }
  ];

  const size = 160;
  const strokeWidth = 18;
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;

  // Calculate cumulative offsets
  let cumulativePercent = 0;
  const renderedSegments = segments.map(seg => {
    const percent = seg.amount / totalAllocated;
    const strokeDasharray = `${percent * circumference} ${circumference}`;
    const strokeDashoffset = -cumulativePercent * circumference;
    cumulativePercent += percent;
    return {
      ...seg,
      percent,
      strokeDasharray,
      strokeDashoffset
    };
  });

  const activeHover = hoveredSegment ? segments.find(s => s.id === hoveredSegment) : null;

  return (
    <div
      data-testid="income-allocation-ring"
      className={`relative flex flex-col items-center justify-center p-4 rounded-2xl bg-card border border-border/60 shadow-md ${className}`}
    >
      <div className="w-full flex items-center justify-between mb-2">
        <h3 className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
          Income Allocation Ring
        </h3>
        <span className="text-[10px] text-muted-foreground/70">Tap slice to drill down</span>
      </div>

      <div className="relative flex items-center justify-center my-2">
        <svg
          width={size}
          height={size}
          viewBox={`0 0 ${size} ${size}`}
          className="transform -rotate-90 select-none overflow-visible"
        >
          {/* Base Background Track */}
          <circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            fill="transparent"
            stroke="currentColor"
            strokeWidth={strokeWidth}
            className="text-secondary/40"
          />

          {/* Animated SVG Segments */}
          {totalAllocated > 0 && renderedSegments.map(seg => {
            if (seg.amount <= 0) return null;
            const isHovered = hoveredSegment === seg.id;

            return (
              <circle
                key={seg.id}
                data-testid={`ring-segment-${seg.id}`}
                cx={size / 2}
                cy={size / 2}
                r={radius}
                fill="transparent"
                stroke={seg.color}
                strokeWidth={isHovered ? strokeWidth + 6 : strokeWidth}
                strokeDasharray={seg.strokeDasharray}
                strokeDashoffset={seg.strokeDashoffset}
                strokeLinecap="round"
                className="transition-all duration-200 cursor-pointer hover:filter hover:drop-shadow-[0_0_8px_rgba(255,255,255,0.4)]"
                onMouseEnter={() => setHoveredSegment(seg.id)}
                onMouseLeave={() => setHoveredSegment(null)}
                onClick={() => navigate(`#/month/${activeMonth}/bucket/${seg.drillBucket}`)}
              />
            );
          })}
        </svg>

        {/* Center Display: Inflow or Hovered Detail */}
        <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none text-center px-4">
          <AnimatePresence mode="wait">
            {activeHover ? (
              <motion.div
                key={activeHover.id}
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.95 }}
                transition={{ duration: 0.12 }}
                className="flex flex-col items-center"
              >
                <span className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground truncate max-w-[120px]">
                  {activeHover.name}
                </span>
                <span className="text-lg font-extrabold font-mono tabular-nums text-foreground">
                  {formatCurrency(activeHover.amount)}
                </span>
                <span className="text-[10px] font-semibold text-primary">
                  {((activeHover.amount / totalAllocated) * 100).toFixed(1)}% of inflow
                </span>
              </motion.div>
            ) : (
              <motion.div
                key="default-center"
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.95 }}
                transition={{ duration: 0.12 }}
                className="flex flex-col items-center"
              >
                <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                  Total Inflow
                </span>
                <span className="text-xl font-extrabold font-mono tabular-nums text-foreground">
                  {formatCurrency(totalIncome)}
                </span>
                <span className="text-[10px] text-muted-foreground/80 mt-0.5">
                  100% Cash Flow
                </span>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>

      {/* Interactive Legend with Drill Buttons */}
      <div className="w-full grid grid-cols-2 gap-2 mt-3 pt-3 border-t border-border/40 text-xs">
        {segments.map(seg => {
          const isHovered = hoveredSegment === seg.id;
          const pct = totalAllocated > 0 ? ((seg.amount / totalAllocated) * 100).toFixed(0) : '0';

          return (
            <button
              key={seg.id}
              type="button"
              onClick={() => navigate(`#/month/${activeMonth}/bucket/${seg.drillBucket}`)}
              onMouseEnter={() => setHoveredSegment(seg.id)}
              onMouseLeave={() => setHoveredSegment(null)}
              className={`flex items-center justify-between p-1.5 rounded-lg text-left transition-all ${
                isHovered ? 'bg-secondary' : 'hover:bg-secondary/50'
              }`}
            >
              <div className="flex items-center gap-1.5 min-w-0">
                <span
                  className="w-2.5 h-2.5 rounded-full shrink-0 shadow-sm"
                  style={{ backgroundColor: seg.color }}
                />
                <span className="text-[11px] font-medium text-foreground truncate">
                  {seg.name}
                </span>
              </div>
              <span className="text-[11px] font-mono font-bold text-muted-foreground tabular-nums shrink-0 ml-1">
                {pct}%
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
};
