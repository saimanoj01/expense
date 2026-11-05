import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  Cell
} from 'recharts';
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

function CustomWaterfallTooltip({ active, payload }: any) {
  if (active && payload && payload.length) {
    const item: WaterfallItem = payload[0]?.payload;
    if (!item) return null;
    return (
      <div className="bg-popover/95 backdrop-blur-md border border-border p-2.5 rounded-xl shadow-xl text-xs">
        <p className="font-bold text-foreground mb-1">{item.name}</p>
        <p className="font-extrabold text-sm" style={{ color: item.color }}>
          {formatCurrency(item.displayValue)}
        </p>
        <p className="text-[10px] text-muted-foreground mt-0.5 capitalize">
          {item.stepType === 'inflow' ? 'Starting Inflow' : item.stepType === 'outflow' ? 'Cash Outflow' : 'Net Flow'}
        </p>
      </div>
    );
  }
  return null;
}

export function WaterfallChart({ data }: WaterfallChartProps) {
  return (
    <div className="w-full relative" data-testid="cash-flow-waterfall">
      {/* Screen-reader accessible data table */}
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

      {/* Chart visualization */}
      <div className="w-full h-[240px]">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} margin={{ top: 12, right: 12, left: -10, bottom: 4 }}>
            <XAxis
              dataKey="name"
              stroke="currentColor"
              className="text-[11px] text-muted-foreground font-semibold"
              tickLine={false}
              axisLine={false}
            />
            <YAxis
              stroke="currentColor"
              className="text-[10px] text-muted-foreground font-medium"
              tickLine={false}
              axisLine={false}
              tickFormatter={(v) => `$${Math.abs(v) >= 1000 ? `${(v / 1000).toFixed(0)}k` : v}`}
            />
            <Tooltip content={<CustomWaterfallTooltip />} cursor={{ fill: 'rgba(255, 255, 255, 0.05)' }} />
            {/* Transparent placeholder/offset bar for floating waterfall effect */}
            <Bar dataKey="placeholder" stackId="waterfall" fill="transparent" isAnimationActive={false} />
            {/* The visible bar */}
            <Bar dataKey="value" stackId="waterfall" radius={[6, 6, 2, 2]}>
              {data.map((entry, index) => (
                <Cell key={`waterfall-cell-${index}`} fill={entry.color} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

export default WaterfallChart;
