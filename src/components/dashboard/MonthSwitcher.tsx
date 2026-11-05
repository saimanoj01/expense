import React, { useEffect, useCallback } from 'react';
import { ChevronLeft, ChevronRight, Calendar } from 'lucide-react';
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
  className = ''
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
      const isInput = target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.tagName === 'SELECT' || target.isContentEditable);
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
      className={`inline-flex items-center gap-1.5 p-1 rounded-2xl glass-card border border-border/60 bg-card/60 backdrop-blur-md shadow-sm ${className}`}
    >
      <nav aria-label="Breadcrumb" data-testid="breadcrumb-trail" className="flex items-center gap-1.5">
        {/* Calendar visual icon */}
        <div className="hidden sm:flex items-center justify-center p-1.5 rounded-xl bg-primary/10 text-primary shrink-0">
          <Calendar className="w-3.5 h-3.5" />
        </div>

        {/* Prev Month Button */}
        <button
          type="button"
          data-testid="btn-prev-month"
          onClick={handlePrev}
          title="Previous Month (ArrowLeft)"
          aria-label="Previous Month"
          className="flex items-center gap-1 px-2.5 py-1.5 rounded-xl hover:bg-card border border-border/40 text-xs font-semibold text-muted-foreground hover:text-foreground transition-all active:scale-95"
        >
          <ChevronLeft className="w-4 h-4" />
          <span className="hidden xs:inline text-[11px]">Prev</span>
        </button>

        {/* Central Switcher with animated label & visible accessible select */}
        <div className="relative flex items-center justify-center gap-1 min-w-[130px] sm:min-w-[150px] px-3 py-1.5 rounded-xl bg-card border border-border/70 shadow-sm">
          <AnimatePresence mode="wait" initial={false}>
            <motion.span
              key={selectedMonth}
              data-testid="breadcrumb-item-month-overview"
              initial={{ opacity: 0, y: 4 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -4 }}
              transition={{ duration: 0.15 }}
              className="font-bold text-xs sm:text-sm text-foreground select-none pointer-events-none truncate tracking-tight"
            >
              {monthDisplay}
            </motion.span>
          </AnimatePresence>

          <select
            data-testid="month-selector"
            className="bg-transparent text-xs font-semibold text-muted-foreground hover:text-foreground cursor-pointer focus-visible:ring-2 focus-visible:ring-primary/40 rounded outline-none"
            value={selectedMonth}
            onChange={(e) => onSelectMonth(e.target.value)}
            aria-label="Select Financial Period"
          >
            <option value="all">All Time</option>
            {availableMonths.map(m => (
              <option key={m} value={m}>{m}</option>
            ))}
            {selectedMonth && !availableMonths.includes(selectedMonth) && selectedMonth !== 'all' && (
              <option value={selectedMonth}>{selectedMonth}</option>
            )}
          </select>
        </div>

        {/* Next Month Button */}
        <button
          type="button"
          data-testid="btn-next-month"
          onClick={handleNext}
          title="Next Month (ArrowRight)"
          aria-label="Next Month"
          className="flex items-center gap-1 px-2.5 py-1.5 rounded-xl hover:bg-card border border-border/40 text-xs font-semibold text-muted-foreground hover:text-foreground transition-all active:scale-95"
        >
          <span className="hidden xs:inline text-[11px]">Next</span>
          <ChevronRight className="w-4 h-4" />
        </button>
      </nav>
    </div>
  );
};
