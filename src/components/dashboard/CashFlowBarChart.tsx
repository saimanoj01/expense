import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid } from 'recharts';
import { MonthlyCashFlow } from '../../hooks/useTransactions';

interface CashFlowBarChartProps {
  monthlyCashFlows: MonthlyCashFlow[];
  onSelectMonth?: (month: string) => void;
  selectedMonth?: string;
}

export function CashFlowBarChart({
  monthlyCashFlows,
  onSelectMonth,
}: CashFlowBarChartProps) {
  if (!monthlyCashFlows || monthlyCashFlows.length === 0) {
    return (
      <div className="flex items-center justify-center h-48 text-muted-foreground text-xs">
        No multi-month cash flow data available.
      </div>
    );
  }

  const chartData = monthlyCashFlows.map(cf => ({
    month: cf.month,
    formattedMonth: cf.formattedMonth,
    income: cf.income,
    fixedExpense: cf.fixedExpense || 0,
    flexibleExpense: cf.flexibleExpense || 0,
    nonMonthlyExpense: cf.nonMonthlyExpense || 0,
    net: cf.net,
    savingsRate: cf.savingsRate
  }));

  const CustomTooltip = ({ active, payload }: any) => {
    if (!active || !payload || !payload.length) return null;
    const data = payload[0]?.payload;
    if (!data) return null;

    return (
      <div className="bg-popover/95 border border-border text-popover-foreground px-4 py-3 rounded-xl shadow-xl backdrop-blur-md text-xs space-y-1">
        <p className="font-bold text-foreground mb-1">{data.formattedMonth}</p>
        <p className="text-emerald-400 font-medium">Inflow: ${data.income.toLocaleString()}</p>
        <div className="pl-2 border-l border-border text-[11px] space-y-0.5 py-0.5">
          <p className="text-blue-400">🔵 Fixed: ${data.fixedExpense.toLocaleString()}</p>
          <p className="text-violet-400">🟣 Variable: ${data.flexibleExpense.toLocaleString()}</p>
          <p className="text-amber-400">🟠 Non-Monthly: ${data.nonMonthlyExpense.toLocaleString()}</p>
        </div>
        <p className={`font-extrabold pt-1 border-t border-border/50 ${data.net >= 0 ? 'text-teal-400' : 'text-rose-500'}`}>
          Net Savings: ${data.net.toLocaleString()} ({data.savingsRate}%)
        </p>
        {onSelectMonth && (
          <p className="text-[10px] text-muted-foreground pt-0.5 text-center font-medium">Click bar to select month</p>
        )}
      </div>
    );
  };

  return (
    <div className="w-full h-full min-h-[220px] select-none">
      <ResponsiveContainer width="100%" height={220}>
        <BarChart
          data={chartData}
          margin={{ top: 10, right: 10, left: -10, bottom: 0 }}
          onClick={(state) => {
            if (state && state.activePayload && state.activePayload.length > 0) {
              const clickedMonth = state.activePayload[0].payload.month;
              if (onSelectMonth && clickedMonth) {
                onSelectMonth(clickedMonth);
              }
            }
          }}
        >
          <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="rgba(255,255,255,0.08)" />
          <XAxis 
            dataKey="formattedMonth" 
            tick={{ fontSize: 11, fill: 'currentColor' }} 
            className="text-muted-foreground"
            tickLine={false}
          />
          <YAxis 
            tick={{ fontSize: 11, fill: 'currentColor' }} 
            className="text-muted-foreground"
            tickLine={false}
            tickFormatter={(val) => `$${val >= 1000 ? `${Math.round(val / 1000)}k` : val}`}
          />
          <Tooltip content={<CustomTooltip />} />
          {/* Group 1: Inflow */}
          <Bar dataKey="income" name="Inflow" fill="#10B981" radius={[4, 4, 0, 0]} maxBarSize={28} />
          {/* Group 2: Stacked Outflows */}
          <Bar dataKey="fixedExpense" stackId="outflow" name="Fixed" fill="#3B82F6" radius={[0, 0, 0, 0]} maxBarSize={28} />
          <Bar dataKey="flexibleExpense" stackId="outflow" name="Variable" fill="#8B5CF6" radius={[0, 0, 0, 0]} maxBarSize={28} />
          <Bar dataKey="nonMonthlyExpense" stackId="outflow" name="Non-Monthly" fill="#F59E0B" radius={[4, 4, 0, 0]} maxBarSize={28} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

export default CashFlowBarChart;
