import { useState } from 'react';
import { TrendingDown, Calendar, DollarSign, Info } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { TrendChartDetails, TrendPoint } from '../../hooks/useTransactions';

interface TrendChartProps {
  trendDetails?: TrendChartDetails;
}

export function TrendChart({ trendDetails }: TrendChartProps) {
  const [hoveredPoint, setHoveredPoint] = useState<TrendPoint | null>(null);

  if (!trendDetails || trendDetails.points.length === 0) {
    return (
      <motion.div 
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        className="glass-card p-6 rounded-2xl flex-1 flex flex-col justify-between min-h-[300px]"
      >
        <div className="flex items-center gap-3 mb-4">
          <div className="p-2 rounded-xl bg-secondary/10 text-secondary">
            <TrendingDown className="w-5 h-5" />
          </div>
          <div>
            <h3 className="text-lg font-bold">Expense Trend</h3>
            <p className="text-xs text-muted-foreground">Daily spending over time</p>
          </div>
        </div>
        <div className="flex-1 flex flex-col items-center justify-center text-center p-8 border border-dashed border-border/50 rounded-xl">
          <Info className="w-8 h-8 text-muted-foreground mb-2 opacity-50" />
          <p className="text-sm font-medium text-muted-foreground">No expense data available for this view.</p>
          <p className="text-xs text-muted-foreground/70 mt-1">Add transactions or change filters to view spending trends.</p>
        </div>
      </motion.div>
    );
  }

  const { points, pathData, areaPathData, highestSpendDay, dailyAvg, yTicks, xTicks } = trendDetails;

  return (
    <motion.div 
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ delay: 0.2 }}
      className="glass-card p-6 rounded-2xl flex-1 flex flex-col relative"
    >
      {/* Header & Stat Summaries */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
        <div className="flex items-center gap-3">
          <div className="p-2.5 rounded-xl bg-secondary/10 text-secondary shadow-sm">
            <TrendingDown className="w-5 h-5" />
          </div>
          <div>
            <h3 className="text-lg font-bold tracking-tight">Expense Trend</h3>
            <p className="text-xs text-muted-foreground">Daily spending breakdown</p>
          </div>
        </div>

        {/* Quick Stat Badges */}
        <div className="flex items-center gap-2">
          {highestSpendDay && (
            <div className="px-3 py-1.5 rounded-lg bg-card/60 border border-border/60 flex items-center gap-2 text-xs">
              <Calendar className="w-3.5 h-3.5 text-primary" />
              <span className="text-muted-foreground">Peak:</span>
              <span className="font-semibold text-foreground">{highestSpendDay.formattedDate} (${highestSpendDay.amount.toLocaleString()})</span>
            </div>
          )}
          <div className="px-3 py-1.5 rounded-lg bg-card/60 border border-border/60 flex items-center gap-2 text-xs">
            <DollarSign className="w-3.5 h-3.5 text-emerald-400" />
            <span className="text-muted-foreground">Avg:</span>
            <span className="font-semibold text-foreground">${dailyAvg.toLocaleString()}/day</span>
          </div>
        </div>
      </div>

      {/* SVG Chart Frame */}
      <div className="flex-1 min-h-[220px] relative w-full flex items-center justify-center select-none">
        <svg 
          viewBox="0 0 500 200" 
          data-testid="chart-svg-trend" 
          className="w-full h-full overflow-visible"
        >
          <defs>
            <linearGradient id="trendGradient" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="rgb(20, 184, 166)" stopOpacity="0.35" />
              <stop offset="100%" stopColor="rgb(20, 184, 166)" stopOpacity="0.0" />
            </linearGradient>
          </defs>

          {/* Horizontal Grid Lines & Y-Axis Dollar Labels */}
          {yTicks.map((tick: { label: string; y: number }, idx: number) => (
            <g key={`y-tick-${idx}`}>
              <line 
                x1="55" 
                y1={tick.y} 
                x2="475" 
                y2={tick.y} 
                stroke="currentColor" 
                className="text-border/30" 
                strokeWidth="1" 
                strokeDasharray="4 4" 
              />
              <text 
                x="45" 
                y={tick.y + 4} 
                textAnchor="end" 
                className="text-[11px] fill-muted-foreground font-medium"
              >
                {tick.label}
              </text>
            </g>
          ))}

          {/* X-Axis Date Labels */}
          {xTicks.map((tick: { label: string; x: number }, idx: number) => (
            <text 
              key={`x-tick-${idx}`} 
              x={tick.x} 
              y="188" 
              textAnchor="middle" 
              className="text-[11px] fill-muted-foreground font-medium"
            >
              {tick.label}
            </text>
          ))}

          {/* Gradient Fill under Path */}
          {areaPathData && (
            <motion.path
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ duration: 1 }}
              d={areaPathData}
              fill="url(#trendGradient)"
            />
          )}

          {/* Main Trend Line Path */}
          {pathData && (
            <motion.path
              key={pathData}
              initial={{ pathLength: 0 }}
              animate={{ pathLength: 1 }}
              transition={{ duration: 1.2, ease: "easeInOut" }}
              d={pathData}
              fill="none"
              stroke="currentColor"
              className="text-primary drop-shadow-[0_0_10px_rgba(20,184,166,0.6)]"
              strokeWidth="3.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          )}

          {/* Interactive Data Nodes */}
          {points.map((pt: TrendPoint, idx: number) => {
            const isHovered = hoveredPoint?.date === pt.date;
            return (
              <g key={`point-${idx}`}>
                <circle
                  cx={pt.x}
                  cy={pt.y}
                  r={isHovered ? "6.5" : "4.5"}
                  className="fill-background stroke-primary transition-all cursor-pointer"
                  strokeWidth={isHovered ? "3" : "2"}
                  onMouseEnter={() => setHoveredPoint(pt)}
                  onMouseLeave={() => setHoveredPoint(null)}
                />
              </g>
            );
          })}
        </svg>

        {/* Floating Tooltip Card on Hover */}
        <AnimatePresence>
          {hoveredPoint && (
            <motion.div
              initial={{ opacity: 0, y: 5, scale: 0.95 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              style={{
                left: `${(hoveredPoint.x / 500) * 100}%`,
                top: `${(hoveredPoint.y / 200) * 100}%`,
                transform: 'translate(-50%, -120%)'
              }}
              className="absolute z-30 pointer-events-none bg-popover/95 border border-border text-popover-foreground px-3 py-2 rounded-xl shadow-xl backdrop-blur-md whitespace-nowrap"
            >
              <p className="text-[11px] text-muted-foreground font-semibold">{hoveredPoint.formattedDate}</p>
              <p className="text-sm font-extrabold text-primary">${hoveredPoint.amount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</p>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </motion.div>
  );
}
