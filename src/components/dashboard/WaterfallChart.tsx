import { useState } from 'react';
import { formatCurrency } from '../../utils/formatters';

export interface WaterfallItem {
  name: string;
  placeholder: number;
  value: number;
  displayValue: number;
  color: string;
  stepType: 'inflow' | 'outflow' | 'total';
}

interface WaterfallChartProps {
  data: WaterfallItem[];
}

export function WaterfallChart({ data }: WaterfallChartProps) {
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null);

  // Find max value to calibrate Y-axis scale
  const maxWaterfallValue = Math.max(
    ...data.map(d => d.placeholder + d.value),
    1
  );

  const chartWidth = 500;
  const chartHeight = 220;
  const paddingTop = 20;
  const paddingBottom = 35;
  const paddingLeft = 50;
  const paddingRight = 20;

  const innerWidth = chartWidth - paddingLeft - paddingRight;
  const innerHeight = chartHeight - paddingTop - paddingBottom;

  const barCount = data.length;
  const barSlotWidth = barCount > 0 ? innerWidth / barCount : 0;
  const barWidth = Math.min(barSlotWidth * 0.65, 48);

  const yScale = (val: number) => {
    const clamped = Math.max(0, Math.min(val, maxWaterfallValue));
    return paddingTop + innerHeight - (clamped / maxWaterfallValue) * innerHeight;
  };

  const yTicks = [
    0,
    maxWaterfallValue * 0.33,
    maxWaterfallValue * 0.66,
    maxWaterfallValue
  ];

  return (
    <div className="w-full relative select-none" data-testid="cash-flow-waterfall">
      {/* Screen-reader accessible data table for compliance */}
      <table className="sr-only" aria-label="Cash Flow Waterfall Table">
        <thead>
          <tr>
            <th scope="col">Step</th>
            <th scope="col">Amount</th>
          </tr>
        </thead>
        <tbody>
          {data.map(item => (
            <tr key={item.name}>
              <td>{item.name}</td>
              <td>{formatCurrency(item.displayValue)}</td>
            </tr>
          ))}
        </tbody>
      </table>

      {/* SVG Visualization (Zero-recharts, pure SVG for high-perf and instant paint) */}
      <div className="w-full h-[220px]">
        <svg
          viewBox={`0 0 ${chartWidth} ${chartHeight}`}
          className="w-full h-full overflow-visible"
          role="img"
          aria-label="Waterfall Chart"
        >
          {/* Subtle grid lines & Y-axis labels */}
          {yTicks.map((tick, i) => {
            const y = yScale(tick);
            return (
              <g key={`y-grid-${i}`} className="text-muted-foreground/40">
                <line
                  x1={paddingLeft}
                  x2={chartWidth - paddingRight}
                  y1={y}
                  y2={y}
                  stroke="currentColor"
                  strokeDasharray="3 3"
                  strokeWidth={1}
                  className="text-border/60"
                />
                <text
                  x={paddingLeft - 8}
                  y={y + 3}
                  textAnchor="end"
                  className="text-xs fill-muted-foreground tabular-nums num"
                >
                  ${tick >= 1000 ? `${(tick / 1000).toFixed(0)}k` : tick.toFixed(0)}
                </text>
              </g>
            );
          })}

          {/* Waterfall Bars */}
          {data.map((item, index) => {
            const slotX = paddingLeft + index * barSlotWidth;
            const barX = slotX + (barSlotWidth - barWidth) / 2;

            const topY = yScale(item.placeholder + item.value);
            const bottomY = yScale(item.placeholder);
            const rawBarHeight = bottomY - topY;
            const barHeight = Math.max(rawBarHeight, 4);

            const isHovered = hoveredIndex === index;

            return (
              <g
                key={`waterfall-bar-${item.name}-${index}`}
                onMouseEnter={() => setHoveredIndex(index)}
                onMouseLeave={() => setHoveredIndex(null)}
                className="cursor-pointer transition-opacity"
              >
                {/* Invisible hover hotspot */}
                <rect
                  x={slotX}
                  y={paddingTop}
                  width={barSlotWidth}
                  height={innerHeight}
                  fill="transparent"
                />

                {/* Connecting dashed line to next bar (waterfall step flow) */}
                {index < data.length - 1 && (
                  <line
                    x1={barX + barWidth}
                    y1={item.stepType === 'inflow' ? topY : bottomY}
                    x2={slotX + barSlotWidth + (barSlotWidth - barWidth) / 2}
                    y2={item.stepType === 'inflow' ? topY : bottomY}
                    stroke="currentColor"
                    strokeWidth={1}
                    strokeDasharray="2 2"
                    className="text-border/80"
                  />
                )}

                {/* Visible bar rect */}
                <rect
                  x={barX}
                  y={topY}
                  width={barWidth}
                  height={barHeight}
                  rx={5}
                  fill={item.color}
                  opacity={hoveredIndex === null ? 0.9 : isHovered ? 1 : 0.6}
                  className="transition-all duration-200"
                  style={{
                    filter: isHovered ? `drop-shadow(0 0 8px ${item.color}80)` : 'none'
                  }}
                />

                {/* Bar Value on Top (compact font) */}
                <text
                  x={barX + barWidth / 2}
                  y={topY - 6}
                  textAnchor="middle"
                  className="text-xs font-semibold tabular-nums num fill-foreground"
                >
                  ${item.displayValue >= 1000 ? `${(item.displayValue / 1000).toFixed(1)}k` : item.displayValue.toFixed(0)}
                </text>

                {/* X-axis category label */}
                <text
                  x={barX + barWidth / 2}
                  y={chartHeight - 12}
                  textAnchor="middle"
                  className={`text-[11px] font-semibold transition-colors ${
                    isHovered ? 'fill-foreground font-bold' : 'fill-muted-foreground'
                  }`}
                >
                  {item.name}
                </text>
              </g>
            );
          })}
        </svg>
      </div>

      {/* Floating Hover Tooltip */}
      {hoveredIndex !== null && data[hoveredIndex] && (
        <div
          className="absolute z-20 pointer-events-none bg-popover/95 backdrop-blur-md border border-border p-2.5 rounded-xl shadow-xl text-xs -translate-x-1/2 -translate-y-full transition-all"
          style={{
            left: `${((paddingLeft + hoveredIndex * barSlotWidth + barSlotWidth / 2) / chartWidth) * 100}%`,
            top: '30px'
          }}
        >
          <p className="font-bold text-foreground mb-0.5">{data[hoveredIndex].name}</p>
          <p className="font-extrabold text-sm" style={{ color: data[hoveredIndex].color }}>
            {formatCurrency(data[hoveredIndex].displayValue)}
          </p>
          <p className="text-[10px] text-muted-foreground mt-0.5 capitalize">
            {data[hoveredIndex].stepType === 'inflow'
              ? 'Starting Inflow'
              : data[hoveredIndex].stepType === 'outflow'
              ? 'Cash Outflow'
              : 'Net Retained'}
          </p>
        </div>
      )}
    </div>
  );
}

export default WaterfallChart;
