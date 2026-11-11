import React, { useState, useEffect } from 'react';
import { Lock, Unlock } from 'lucide-react';
import { BreadcrumbTrail } from './BreadcrumbTrail';
import { MonthSwitcher } from '../dashboard/MonthSwitcher';

export interface PageHeaderProps {
  selectedMonth: string;
  availableMonths: string[];
  onSelectMonth: (month: string) => void;
  isLockedMonth?: boolean;
  onLockMonth?: () => void;
  onUnlockMonth?: () => void;
  className?: string;
}

export const PageHeader: React.FC<PageHeaderProps> = ({
  selectedMonth,
  availableMonths,
  onSelectMonth,
  isLockedMonth,
  onLockMonth,
  onUnlockMonth,
  className = '',
}) => {
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const mainEl = document.querySelector('main');
    const handleScroll = () => {
      setScrolled((mainEl?.scrollTop ?? 0) > 8 || window.scrollY > 8);
    };
    mainEl?.addEventListener('scroll', handleScroll, { passive: true });
    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => {
      mainEl?.removeEventListener('scroll', handleScroll);
      window.removeEventListener('scroll', handleScroll);
    };
  }, []);

  return (
    <header
      data-testid="dashboard-header"
      className={`sticky top-0 z-20 h-12 flex items-center justify-between gap-2 bg-background/95 backdrop-blur-md transition-colors mb-2 ${
        scrolled ? 'border-b border-border' : 'border-b border-transparent'
      } ${className}`}
    >
      <BreadcrumbTrail />

      <div className="flex items-center gap-1.5 shrink-0">
        {selectedMonth !== 'all' && (onLockMonth || onUnlockMonth) && (
          <button
            type="button"
            data-testid={isLockedMonth ? 'unlock-month-btn' : 'lock-month-btn'}
            onClick={isLockedMonth ? onUnlockMonth : onLockMonth}
            title={isLockedMonth ? 'Unlock Month' : 'Lock Month'}
            className={`inline-flex items-center gap-1.5 h-8 px-2 sm:px-2.5 rounded-[10px] text-label font-medium transition-colors focus-visible:ring-2 ring-ring/40 ${
              isLockedMonth
                ? 'bg-warning/15 border border-warning/30 text-warning hover:bg-warning/20'
                : 'text-muted-foreground hover:text-foreground hover:bg-surface2'
            }`}
          >
            {isLockedMonth ? <Lock className="w-3 h-3" /> : <Unlock className="w-3 h-3" />}
            <span data-testid="lock-status-indicator">
              {isLockedMonth ? 'Locked' : 'Unlocked'}
            </span>
          </button>
        )}

        <MonthSwitcher
          selectedMonth={selectedMonth}
          availableMonths={availableMonths}
          onSelectMonth={onSelectMonth}
        />
      </div>
    </header>
  );
};
