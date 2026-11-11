import { TrendChart } from '../dashboard/TrendChart';
import { TrendChartDetails } from '../../hooks/useTransactions';
import { Category, Transaction } from '../../services/storage';

export interface TrendsViewProps {
  month: string;
  trendDetails?: TrendChartDetails;
  categories?: Category[];
  transactions?: Transaction[];
  availableMonths?: string[];
  onSelectMonth?: (m: string) => void;
}

export function TrendsView({
  month,
  trendDetails,
  categories = [],
  transactions = [],
  onSelectMonth,
}: TrendsViewProps) {
  return (
    <div
      className="max-w-[920px] mx-auto space-y-6 pb-8"
      data-testid="trends-workspace"
    >
      <div>
        <h1 className="text-title text-foreground">Trends</h1>
        <p className="text-label text-muted-foreground mt-0.5">
          12-month cash flow, savings trajectory, and category momentum
        </p>
      </div>

      <TrendChart
        trendDetails={trendDetails}
        categories={categories}
        transactions={transactions}
        selectedMonth={month}
        onSelectMonth={onSelectMonth}
      />
    </div>
  );
}

export default TrendsView;

