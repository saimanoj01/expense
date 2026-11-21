import React, { useState, useEffect } from 'react';
import { Lock, Unlock, RefreshCw } from 'lucide-react';
import { BreadcrumbTrail } from './BreadcrumbTrail';
import { MonthSwitcher } from '../dashboard/MonthSwitcher';

export interface PageHeaderProps {
  selectedMonth: string;
  availableMonths: string[];
  onSelectMonth: (month: string) => void;
  isLockedMonth?: boolean;
  onLockMonth?: () => void;
  onUnlockMonth?: () => void;
  onRefresh?: () => void;
  isRefreshing?: boolean;
  lastSyncAt?: string | null;
  isSyncStale?: boolean;
  className?: string;
}

function formatCompactSyncLabel(iso: string | null | undefined): string | null {
  if (!iso) return null;
  const ts = Date.parse(iso);
  if (!Number.isFinite(ts)) return null;
  const d = new Date(ts);
  const now = new Date();
  const sameDay =
    d.getFullYear() === now.getFullYear() &&
    d.getMonth() === now.getMonth() &&
    d.getDate() === now.getDate();
  if (sameDay) {
    return d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
  }
  return d.toLocaleDateString([], { month: 'short', day: 'numeric' });
}

export const PageHeader: React.FC<PageHeaderProps> = ({
  selectedMonth,
  availableMonths,
  onSelectMonth,
  isLockedMonth,
  onLockMonth,
  onUnlockMonth,
  onRefresh,
  isRefreshing = false,
  lastSyncAt,
  isSyncStale = false,
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

  const syncLabel = formatCompactSyncLabel(lastSyncAt);

  return (
    <header
      data-testid="dashboard-header"
      className={`print:hidden sticky top-0 z-20 h-12 flex items-center justify-between gap-2 bg-background/95 backdrop-blur-md transition-colors mb-2 ${
        scrolled ? 'border-b border-border' : 'border-b border-transparent'
      } ${className}`}
    >
      <BreadcrumbTrail />

      <div className="flex items-center gap-1.5 shrink-0">
        {onRefresh && (
          <button
            type="button"
            data-testid="header-refresh-sync-btn"
            disabled={isRefreshing}
            onClick={onRefresh}
            title={
              isSyncStale
                ? `Last automated sync was ${syncLabel || 'over 36h ago'} — click to refresh from Google Sheets`
                : syncLabel
                ? `Last synced ${syncLabel} — click to refresh from Google Sheets`
                : 'Refresh data from Google Sheets'
            }
            aria-label="Refresh workspace data"
            className={`inline-flex items-center gap-1.5 h-8 px-2 rounded-[10px] text-label font-medium transition-colors focus-visible:ring-2 ring-ring/40 ${
              isSyncStale
                ? 'bg-warning/15 border border-warning/30 text-warning hover:bg-warning/20'
                : 'text-muted-foreground hover:text-foreground hover:bg-surface2'
            } ${isRefreshing ? 'opacity-60 cursor-wait' : ''}`}
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isRefreshing ? 'animate-spin' : ''}`} />
            {syncLabel && (
              <span data-testid="header-sync-time" className="hidden lg:inline">
                {isSyncStale ? `Stale · ${syncLabel}` : syncLabel}
              </span>
            )}
          </button>
        )}

        {selectedMonth !== 'all' && (onLockMonth || onUnlockMonth) && (
          <button
            type="button"
            data-testid={isLockedMonth ? 'unlock-month-btn' : 'lock-month-btn'}
            onClick={isLockedMonth ? onUnlockMonth : onLockMonth}
            title={isLockedMonth ? 'Unlock Month' : 'Lock Month'}
            aria-label={isLockedMonth ? 'Unlock Month' : 'Lock Month'}
            className={`inline-flex items-center gap-1.5 h-8 px-2 sm:px-2.5 rounded-[10px] text-label font-medium transition-colors focus-visible:ring-2 ring-ring/40 ${
              isLockedMonth
                ? 'bg-warning/15 border border-warning/30 text-warning hover:bg-warning/20'
                : 'text-muted-foreground hover:text-foreground hover:bg-surface2'
            }`}
          >
            {isLockedMonth ? <Lock className="w-3 h-3" /> : <Unlock className="w-3 h-3" />}
            <span
              data-testid="lock-status-indicator"
              className={isLockedMonth ? '' : 'hidden lg:inline'}
            >
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
