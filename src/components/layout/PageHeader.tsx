import React, { useState, useEffect } from 'react';
import { Printer, MoreHorizontal, Share2, Lock, Unlock, Upload, Check } from 'lucide-react';
import { BreadcrumbTrail } from './BreadcrumbTrail';
import { MonthSwitcher } from '../dashboard/MonthSwitcher';
import { useNavigation } from '../../hooks/useNavigation';

export interface PageHeaderProps {
  selectedMonth: string;
  availableMonths: string[];
  onSelectMonth: (month: string) => void;
  onOpenReport?: () => void;
  onOpenShare?: () => void;
  onOpenCsvWizard?: () => void;
  onCsvFileUpload?: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onOpenCategoryManager?: () => void;
  onOpenAddTxn?: () => void;
  isLockedMonth?: boolean;
  onLockMonth?: () => void;
  onUnlockMonth?: () => void;
  className?: string;
}

export const PageHeader: React.FC<PageHeaderProps> = ({
  selectedMonth,
  availableMonths,
  onSelectMonth,
  onOpenReport,
  onOpenShare,
  onOpenCsvWizard,
  onCsvFileUpload,
  onOpenCategoryManager,
  onOpenAddTxn,
  isLockedMonth,
  onLockMonth,
  onUnlockMonth,
  className = '',
}) => {
  const { currentRoute, smoothNonMonthly, setSmoothNonMonthly } = useNavigation();
  const [scrolled, setScrolled] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);

  useEffect(() => {
    const mainEl = document.querySelector('main');
    if (!mainEl) return;
    const handleScroll = () => {
      setScrolled(mainEl.scrollTop > 8);
    };
    mainEl.addEventListener('scroll', handleScroll, { passive: true });
    return () => mainEl.removeEventListener('scroll', handleScroll);
  }, []);

  const isOverview = currentRoute.view === 'overview';

  return (
    <header
      data-testid="dashboard-header"
      className={`sticky top-0 z-20 h-14 flex items-center justify-between gap-3 bg-background/85 backdrop-blur-md transition-colors mb-3 ${
        scrolled ? 'border-b border-border' : 'border-b border-transparent'
      } ${className}`}
    >
      <BreadcrumbTrail />

      <div className="flex items-center gap-1.5 shrink-0">
        {isOverview && (
          <div className="flex items-center gap-1 mr-1">
            {onOpenCategoryManager && (
              <button
                type="button"
                data-testid="open-add-category-btn"
                onClick={onOpenCategoryManager}
                title="Manage Categories"
                className="px-2 py-1 rounded-[8px] text-label text-muted-foreground hover:text-foreground hover:bg-surface2 transition-colors focus-visible:ring-2 ring-ring/40"
              >
                Categories
              </button>
            )}
            {onOpenShare && (
              <button
                type="button"
                data-testid="share-project-btn"
                onClick={onOpenShare}
                title="Share Project"
                className="px-2 py-1 rounded-[8px] text-label text-muted-foreground hover:text-foreground hover:bg-surface2 transition-colors focus-visible:ring-2 ring-ring/40"
              >
                Share
              </button>
            )}
            {!isLockedMonth && onCsvFileUpload && (
              <label
                data-testid="import-csv-trigger-btn"
                title="Import CSV"
                className="px-2 py-1 rounded-[8px] text-label text-muted-foreground hover:text-foreground hover:bg-surface2 transition-colors cursor-pointer inline-flex items-center"
              >
                CSV
                <input
                  type="file"
                  accept=".csv"
                  data-testid="csv-file-input"
                  className="hidden"
                  onChange={onCsvFileUpload}
                  onClick={(e: React.MouseEvent<HTMLInputElement>) => {
                    (e.target as HTMLInputElement).value = '';
                  }}
                />
              </label>
            )}
            {!isLockedMonth && onOpenAddTxn && (
              <button
                type="button"
                data-testid="open-add-transaction-btn"
                onClick={onOpenAddTxn}
                title="Add Transaction"
                className="px-2 py-1 rounded-[8px] text-label text-muted-foreground hover:text-foreground hover:bg-surface2 transition-colors focus-visible:ring-2 ring-ring/40"
              >
                + Add
              </button>
            )}
            {onOpenReport && (
              <button
                type="button"
                data-testid="story-print-report-btn"
                onClick={onOpenReport}
                title="Monthly Report"
                className="px-2 py-1 rounded-[8px] text-label text-muted-foreground hover:text-foreground hover:bg-surface2 transition-colors focus-visible:ring-2 ring-ring/40"
              >
                Report
              </button>
            )}
            {selectedMonth !== 'all' &&
              (isLockedMonth ? (
                <>
                  <span
                    data-testid="lock-status-indicator"
                    className="px-1.5 py-0.5 rounded bg-warning/15 text-warning text-label font-medium"
                  >
                    Locked
                  </span>
                  {onUnlockMonth && (
                    <button
                      type="button"
                      data-testid="unlock-month-btn"
                      onClick={onUnlockMonth}
                      title="Unlock Month"
                      className="px-2 py-1 rounded-[8px] text-label text-muted-foreground hover:text-foreground hover:bg-surface2 transition-colors focus-visible:ring-2 ring-ring/40"
                    >
                      Unlock
                    </button>
                  )}
                </>
              ) : (
                onLockMonth && (
                  <button
                    type="button"
                    data-testid="lock-month-btn"
                    onClick={onLockMonth}
                    title="Lock Month"
                    className="px-2 py-1 rounded-[8px] text-label text-muted-foreground hover:text-foreground hover:bg-surface2 transition-colors focus-visible:ring-2 ring-ring/40"
                  >
                    Lock
                  </button>
                )
              ))}
          </div>
        )}

        <MonthSwitcher
          selectedMonth={selectedMonth}
          availableMonths={availableMonths}
          onSelectMonth={onSelectMonth}
        />

        <div className="relative">
          <button
            type="button"
            onClick={() => setMenuOpen(prev => !prev)}
            aria-label="More actions"
            className="w-8 h-8 rounded-[10px] hover:bg-surface2 flex items-center justify-center text-muted-foreground hover:text-foreground transition-colors focus-visible:ring-2 ring-ring/40"
          >
            <MoreHorizontal className="w-4 h-4" />
          </button>

          {menuOpen && (
            <>
              <div
                className="fixed inset-0 z-20"
                onClick={() => setMenuOpen(false)}
              />
              <div
                data-popover="page-header-overflow"
                className="absolute right-0 mt-1.5 w-52 rounded-[14px] bg-popover border border-border p-1.5 shadow-lg z-30 space-y-0.5"
              >
                <button
                  type="button"
                  role="menuitemcheckbox"
                  aria-checked={smoothNonMonthly}
                  data-testid="toggle-smooth-non-monthly-btn"
                  onClick={() => {
                    setSmoothNonMonthly(prev => !prev);
                    setMenuOpen(false);
                  }}
                  className="w-full px-3 py-2 text-left text-body text-foreground hover:bg-surface2 rounded-[10px] flex items-center justify-between gap-2 transition-colors"
                >
                  <span>Smooth non-monthly</span>
                  {smoothNonMonthly && <Check className="w-4 h-4 text-bucket-saved shrink-0" />}
                </button>
                {onOpenReport && (
                  <button
                    type="button"
                    onClick={() => {
                      setMenuOpen(false);
                      onOpenReport();
                    }}
                    className="w-full px-3 py-2 text-left text-body text-foreground hover:bg-surface2 rounded-[10px] flex items-center gap-2.5 transition-colors"
                  >
                    <Printer className="w-4 h-4 text-muted-foreground" />
                    <span>Monthly Report</span>
                  </button>
                )}
                {onOpenShare && (
                  <button
                    type="button"
                    onClick={() => {
                      setMenuOpen(false);
                      onOpenShare();
                    }}
                    className="w-full px-3 py-2 text-left text-body text-foreground hover:bg-surface2 rounded-[10px] flex items-center gap-2.5 transition-colors"
                  >
                    <Share2 className="w-4 h-4 text-muted-foreground" />
                    <span>Share Project</span>
                  </button>
                )}
                {onOpenCsvWizard && !isLockedMonth && (
                  <button
                    type="button"
                    onClick={() => {
                      setMenuOpen(false);
                      onOpenCsvWizard();
                    }}
                    className="w-full px-3 py-2 text-left text-body text-foreground hover:bg-surface2 rounded-[10px] flex items-center gap-2.5 transition-colors"
                  >
                    <Upload className="w-4 h-4 text-muted-foreground" />
                    <span>Import CSV</span>
                  </button>
                )}
                {selectedMonth !== 'all' && (onLockMonth || onUnlockMonth) && (
                  <button
                    type="button"
                    onClick={() => {
                      setMenuOpen(false);
                      if (isLockedMonth) {
                        onUnlockMonth?.();
                      } else {
                        onLockMonth?.();
                      }
                    }}
                    className="w-full px-3 py-2 text-left text-body text-foreground hover:bg-surface2 rounded-[10px] flex items-center gap-2.5 transition-colors"
                  >
                    {isLockedMonth ? (
                      <>
                        <Unlock className="w-4 h-4 text-muted-foreground" />
                        <span>Unlock Month</span>
                      </>
                    ) : (
                      <>
                        <Lock className="w-4 h-4 text-muted-foreground" />
                        <span>Lock Month</span>
                      </>
                    )}
                  </button>
                )}
              </div>
            </>
          )}
        </div>
      </div>
    </header>
  );
};
