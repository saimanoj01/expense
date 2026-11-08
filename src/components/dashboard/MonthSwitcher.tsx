import React, { useEffect, useCallback } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { formatMonthLabel } from '../../utils/navigation';

export interface MonthSwitcherProps {
  selectedMonth: string;
  availableMonths: string[];
  onSelectMonth: (month: string) => void;
  className?: string;
}

export const MonthSwitcher: React.FC<MonthSwitcherProps> = ({
  selectedMonth,
  availableMonths,
  onSelectMonth,
  className = '',
}) => {
  const handlePrev = useCallback(() => {
    if (selectedMonth === 'all') {
      if (availableMonths.length > 0) {
        onSelectMonth(availableMonths[availableMonths.length - 1]);
      }
      return;
    }
    const [y, m] = selectedMonth.split('-').map(Number);
    if (!isNaN(y) && !isNaN(m)) {
      const prevDate = new Date(Date.UTC(y, m - 2, 1));
      const prevStr = `${prevDate.getUTCFullYear()}-${String(prevDate.getUTCMonth() + 1).padStart(2, '0')}`;
      onSelectMonth(prevStr);
    }
  }, [selectedMonth, availableMonths, onSelectMonth]);

  const handleNext = useCallback(() => {
    if (selectedMonth === 'all') {
      if (availableMonths.length > 0) {
        onSelectMonth(availableMonths[0]);
      }
      return;
    }
    const [y, m] = selectedMonth.split('-').map(Number);
    if (!isNaN(y) && !isNaN(m)) {
      const nextDate = new Date(Date.UTC(y, m, 1));
      const nextStr = `${nextDate.getUTCFullYear()}-${String(nextDate.getUTCMonth() + 1).padStart(2, '0')}`;
      onSelectMonth(nextStr);
    }
  }, [selectedMonth, availableMonths, onSelectMonth]);

  // Keyboard Arrow Left / Right navigation
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      const isInput =
        target &&
        (target.tagName === 'INPUT' ||
          target.tagName === 'TEXTAREA' ||
          target.tagName === 'SELECT' ||
          target.isContentEditable ||
          !!target.closest('[data-own-arrows]'));
      const hasModal = !!document.querySelector('[role="dialog"], .fixed.inset-0.z-50');

      if (!isInput && !hasModal) {
        if (e.key === 'ArrowLeft' && !e.altKey && !e.metaKey && !e.ctrlKey) {
          handlePrev();
        } else if (e.key === 'ArrowRight' && !e.altKey && !e.metaKey && !e.ctrlKey) {
          handleNext();
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handlePrev, handleNext]);

  return (
    <div
      data-testid="month-switcher"
      className={`inline-flex items-center gap-0.5 rounded-[10px] bg-surface2/80 border border-border p-0.5 ${className}`}
    >
      <button
        type="button"
        data-testid="btn-prev-month"
        onClick={handlePrev}
        title="Previous Month (ArrowLeft)"
        aria-label="Previous Month"
        className="w-8 h-8 rounded-[8px] flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-card transition-colors focus-visible:ring-2 ring-ring/40"
      >
        <ChevronLeft className="w-4 h-4" />
      </button>

      <div className="relative flex items-center justify-center min-w-0 sm:min-w-[128px] h-8 rounded-[8px] hover:bg-card transition-colors overflow-hidden">
        <select
          data-testid="month-selector"
          className="appearance-none bg-transparent cursor-pointer w-full h-full px-2 sm:px-2.5 font-medium text-label sm:text-body text-foreground text-center tabular-nums num outline-none focus-visible:ring-2 ring-ring/40 rounded-[8px]"
          value={selectedMonth}
          onChange={e => onSelectMonth(e.target.value)}
          aria-label="Select Financial Period"
        >
          <option value="all" className="bg-popover text-popover-foreground">
            All Time
          </option>
          {availableMonths.map(m => (
            <option key={m} value={m} className="bg-popover text-popover-foreground">
              {formatMonthLabel(m)}
            </option>
          ))}
          {selectedMonth && !availableMonths.includes(selectedMonth) && selectedMonth !== 'all' && (
            <option value={selectedMonth} className="bg-popover text-popover-foreground">
              {formatMonthLabel(selectedMonth)}
            </option>
          )}
        </select>
      </div>

      <button
        type="button"
        data-testid="btn-next-month"
        onClick={handleNext}
        title="Next Month (ArrowRight)"
        aria-label="Next Month"
        className="w-8 h-8 rounded-[8px] flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-card transition-colors focus-visible:ring-2 ring-ring/40"
      >
        <ChevronRight className="w-4 h-4" />
      </button>
    </div>
  );
};
