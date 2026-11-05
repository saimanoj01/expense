import { ChevronLeft, ChevronRight, Calendar } from 'lucide-react';

export interface PeriodControllerProps {
  selectedMonth: string;
  availableMonths: string[];
  onSelectMonth: (month: string) => void;
  className?: string;
}

export function PeriodController({
  selectedMonth,
  availableMonths,
  onSelectMonth,
  className = '',
}: PeriodControllerProps) {
  const handlePrev = () => {
    if (selectedMonth === 'all') {
      if (availableMonths.length > 0) {
        onSelectMonth(availableMonths[availableMonths.length - 1]);
      }
      return;
    }
    const [y, m] = selectedMonth.split('-').map(Number);
    if (!isNaN(y) && !isNaN(m)) {
      const prevDate = new Date(y, m - 2, 1);
      const prevStr = `${prevDate.getFullYear()}-${String(prevDate.getMonth() + 1).padStart(2, '0')}`;
      onSelectMonth(prevStr);
    }
  };

  const handleNext = () => {
    if (selectedMonth === 'all') {
      if (availableMonths.length > 0) {
        onSelectMonth(availableMonths[0]);
      }
      return;
    }
    const [y, m] = selectedMonth.split('-').map(Number);
    if (!isNaN(y) && !isNaN(m)) {
      const nextDate = new Date(y, m, 1);
      const nextStr = `${nextDate.getFullYear()}-${String(nextDate.getMonth() + 1).padStart(2, '0')}`;
      onSelectMonth(nextStr);
    }
  };

  return (
    <div
      className={`sticky top-16 sm:static z-20 flex items-center justify-between sm:justify-start gap-2 p-1.5 rounded-2xl glass-card border border-border/60 bg-card/70 backdrop-blur-md shadow-sm mb-6 ${className}`}
    >
      <div className="flex items-center gap-2">
        <div className="hidden sm:flex items-center justify-center p-2 rounded-xl bg-primary/10 text-primary">
          <Calendar className="w-4 h-4" />
        </div>
        <span className="hidden sm:inline text-xs font-bold text-muted-foreground uppercase tracking-wider pl-1">
          Period:
        </span>
      </div>

      <div className="flex items-center gap-1.5 w-full sm:w-auto justify-between sm:justify-start">
        <button
          type="button"
          onClick={handlePrev}
          title="Previous Month"
          aria-label="Previous Month"
          className="flex items-center gap-1 px-2.5 py-1.5 rounded-xl hover:bg-card border border-border/50 text-xs font-semibold text-muted-foreground hover:text-foreground transition-all active:scale-95"
        >
          <ChevronLeft className="w-4 h-4" />
          <span className="hidden xs:inline">Prev</span>
        </button>

        <div className="relative flex-1 sm:flex-initial">
          <select
            data-testid="month-selector"
            className="w-full sm:w-auto bg-card/90 border border-border rounded-xl pl-3 pr-8 py-1.5 font-bold text-xs sm:text-sm text-foreground focus:ring-2 focus:ring-primary outline-none transition-all cursor-pointer appearance-none text-center"
            value={selectedMonth}
            onChange={(e) => onSelectMonth(e.target.value)}
          >
            <option value="all" className="bg-card text-card-foreground">All Time</option>
            {availableMonths.map(m => (
              <option key={m} value={m} className="bg-card text-card-foreground">{m}</option>
            ))}
          </select>
          <div className="absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none text-muted-foreground/60 text-[10px]">
            ▼
          </div>
        </div>

        <button
          type="button"
          onClick={handleNext}
          title="Next Month"
          aria-label="Next Month"
          className="flex items-center gap-1 px-2.5 py-1.5 rounded-xl hover:bg-card border border-border/50 text-xs font-semibold text-muted-foreground hover:text-foreground transition-all active:scale-95"
        >
          <span className="hidden xs:inline">Next</span>
          <ChevronRight className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}
