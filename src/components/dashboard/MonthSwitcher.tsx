import React, { useEffect, useCallback } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
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

  const monthDisplay = formatMonthLabel(selectedMonth);

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

      <div className="relative flex items-center justify-center min-w-[112px] sm:min-w-[128px] h-8 px-2.5 rounded-[8px] hover:bg-card transition-colors overflow-hidden">
        <AnimatePresence mode="wait" initial={false}>
          <motion.span
            key={selectedMonth}
            initial={{ opacity: 0, y: 3 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -3 }}
            transition={{ duration: 0.12 }}
            className="font-medium text-label sm:text-body text-foreground select-none pointer-events-none truncate tabular-nums num"
          >
            {monthDisplay}
          </motion.span>
        </AnimatePresence>

        <select
          data-testid="month-selector"
          className="absolute inset-0 opacity-0 cursor-pointer w-full h-full"
          value={selectedMonth}
          onChange={e => onSelectMonth(e.target.value)}
          aria-label="Select Financial Period"
        >
          <option value="all">All Time</option>
          {availableMonths.map(m => (
            <option key={m} value={m}>
              {m}
            </option>
          ))}
          {selectedMonth && !availableMonths.includes(selectedMonth) && selectedMonth !== 'all' && (
            <option value={selectedMonth}>{selectedMonth}</option>
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
