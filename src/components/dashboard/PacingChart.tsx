import { ResponsiveContainer, AreaChart, Area, Line, XAxis, YAxis, Tooltip, CartesianGrid } from 'recharts';
import { CumulativePacingPoint } from '../../hooks/useTransactions';

interface PacingChartProps {
  cumulativePoints: CumulativePacingPoint[];
  daysInMonth: number;
  totalBudget: number;
  prevMonthCumulativePoints?: CumulativePacingPoint[];
}

export function PacingChart({
  cumulativePoints,
  daysInMonth,
  totalBudget,
  prevMonthCumulativePoints = []
}: PacingChartProps) {
  if (!cumulativePoints || cumulativePoints.length === 0) {
    return null;
  }

  // Build combined dataset for Recharts so all 3 curves share exact same Y-axis scale (C8)
  const prevMap = new Map<number, number>();
  prevMonthCumulativePoints.forEach(p => {
    prevMap.set(p.day, p.cumulativeAmount);
  });

  const chartData = cumulativePoints.map(p => {
    const ideal = totalBudget > 0 ? Math.round((totalBudget / daysInMonth) * p.day) : undefined;
    const prev = prevMap.get(p.day);

    return {
      day: p.day,
      dayLabel: `Day ${p.day}`,
      formattedDate: p.formattedDate,
      actual: p.cumulativeAmount,
      daily: p.dailyAmount,
      ideal,
      previous: prev
    };
  });

  const maxActual = cumulativePoints[cumulativePoints.length - 1]?.cumulativeAmount || 0;
  const maxPrev = prevMonthCumulativePoints[prevMonthCumulativePoints.length - 1]?.cumulativeAmount || 0;
  const maxDomain = Math.max(maxActual, maxPrev, totalBudget, 100) * 1.1;

  const CustomTooltip = ({ active, payload }: { active?: boolean; payload?: Array<{ payload: (typeof chartData)[0] }> }) => {
    if (!active || !payload || !payload.length) return null;
    const data = payload[0]?.payload;
    if (!data) return null;

    return (
      <div className="bg-popover/95 border border-border text-popover-foreground px-4 py-3 rounded-xl shadow-xl backdrop-blur-md text-xs space-y-1">
        <p className="text-[11px] text-muted-foreground font-semibold">{data.formattedDate || data.dayLabel}</p>
        <p className="text-sm font-extrabold text-primary">
          Actual: ${Number(data.actual || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
        </p>
        {data.daily > 0 && (
          <p className="text-[11px] text-muted-foreground">Daily Spend: ${data.daily.toLocaleString()}</p>
        )}
        {data.ideal !== undefined && (
          <p className="text-[11px] text-gray-400">Ideal Pace: ${data.ideal.toLocaleString()}</p>
        )}
        {data.previous !== undefined && (
          <p className="text-[11px] text-amber-400">Prev Month: ${data.previous.toLocaleString()}</p>
        )}
      </div>
    );
  };

  return (
    <div className="w-full h-full min-h-[220px] select-none">
      <ResponsiveContainer width="100%" height={220}>
        <AreaChart data={chartData} margin={{ top: 10, right: 15, left: -10, bottom: 0 }}>
          <defs>
            <linearGradient id="rechartsPacingGradient" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#14B8A6" stopOpacity={0.35} />
              <stop offset="100%" stopColor="#14B8A6" stopOpacity={0.0} />
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="rgba(255,255,255,0.08)" />
          <XAxis 
            dataKey="day" 
            tick={{ fontSize: 11, fill: 'currentColor' }} 
            className="text-muted-foreground"
            tickLine={false}
            tickFormatter={(d) => d === 1 ? 'Day 1' : d === Math.round(daysInMonth / 2) ? `Day ${d}` : d === daysInMonth ? `Day ${d}` : ''}
          />
          <YAxis 
            domain={[0, maxDomain]}
            tick={{ fontSize: 11, fill: 'currentColor' }} 
            className="text-muted-foreground"
            tickLine={false}
            tickFormatter={(val) => `$${val >= 1000 ? `${Math.round(val / 1000)}k` : val}`}
          />
          <Tooltip content={<CustomTooltip />} />
          
          {/* Actual Cumulative Area */}
          <Area
            type="monotone"
            dataKey="actual"
            name="Actual Spend"
            stroke="#14B8A6"
            strokeWidth={3}
            fill="url(#rechartsPacingGradient)"
            dot={false}
            activeDot={{ r: 5, fill: '#14B8A6', stroke: '#fff', strokeWidth: 2 }}
          />

          {/* Ideal Budget Line (C8: plotted on exact same scale) */}
          {totalBudget > 0 && (
            <Line
              type="linear"
              dataKey="ideal"
              name="Ideal Budget Pace"
              stroke="rgba(156, 163, 175, 0.7)"
              strokeWidth={2}
              strokeDasharray="4 4"
              dot={false}
            />
          )}

          {/* Previous Month Trajectory (C8: plotted on exact same scale) */}
          {prevMonthCumulativePoints.length > 0 && (
            <Line
              type="monotone"
              dataKey="previous"
              name="Previous Month"
              stroke="#F59E0B"
              strokeWidth={2}
              strokeDasharray="6 4"
              dot={false}
            />
          )}
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}

export default PacingChart;
