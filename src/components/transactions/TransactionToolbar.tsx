import React, { useState } from 'react';
import {
  Upload,
  Plus,
  Lock,
  Unlock,
  Share2,
  Tag,
  ArrowUpDown,
  FileText,
  Filter,
  MoreHorizontal,
  Search,
  X,
} from 'lucide-react';

interface TransactionToolbarProps {
  selectedMonth: string;
  availableMonths: string[];
  availableTags?: string[];
  selectedTagFilter?: string | null;
  selectedBucket?: 'income' | 'fixed' | 'flexible' | 'non-monthly' | null;
  sortBy?: string;
  searchQuery?: string;
  onSearchChange?: (q: string) => void;
  totalCount?: number;
  selectedDay?: number | null;
  onClearDay?: () => void;
  isCurrentMonthLocked: boolean;
  setSelectedMonth: (m: string) => void;
  setSelectedTagFilter?: (t: string | null) => void;
  setSelectedBucket?: (b: 'income' | 'fixed' | 'flexible' | 'non-monthly' | null) => void;
  setSortBy?: (s: string) => void;
  handleOpenAddTxn: () => void;
  handleCsvFileUpload: (e: React.ChangeEvent<HTMLInputElement>) => void;
  handleLockCurrentMonth: () => void;
  handleUnlockCurrentMonth: () => void;
  setShowShareModal: (v: boolean) => void;
  onOpenMonthlyReport?: () => void;
}

export function TransactionToolbar({
  selectedMonth,
  availableTags = [],
  selectedTagFilter,
  selectedBucket,
  sortBy,
  searchQuery = '',
  onSearchChange,
  totalCount = 0,
  selectedDay = null,
  onClearDay,
  isCurrentMonthLocked,
  setSelectedTagFilter,
  setSelectedBucket,
  setSortBy,
  handleOpenAddTxn,
  handleCsvFileUpload,
  handleLockCurrentMonth,
  handleUnlockCurrentMonth,
  setShowShareModal,
  onOpenMonthlyReport,
}: TransactionToolbarProps) {
  const [filterOpen, setFilterOpen] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);

  const hasActiveFilters = Boolean(selectedBucket || selectedTagFilter || selectedDay);

  return (
    <div className="space-y-2.5">
      {/* Single Calm Ledger Toolbar Row */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        {/* Left: Title · Count */}
        <div className="flex items-center gap-2">
          <h1 className="text-title font-semibold tracking-tight text-foreground">
            Transactions
          </h1>
          <span className="text-faint">·</span>
          <span className="text-body text-muted-foreground tabular-nums num">
            {totalCount}
          </span>
        </div>

        {/* Right: Search, Sort, Filter, + Add, ⋯ */}
        <div className="flex flex-wrap items-center gap-2">
          {/* Search Input */}
          <div className="relative w-44 sm:w-56">
            <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none" />
            <input
              type="text"
              data-testid="transaction-search-input"
              value={searchQuery}
              onChange={e => onSearchChange?.(e.target.value)}
              placeholder="Search…"
              className="w-full h-9 bg-surface2 border border-border rounded-[10px] pl-8 pr-7 text-body text-foreground placeholder:text-muted-foreground focus-visible:ring-2 ring-ring/40 outline-none transition-colors"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => onSearchChange?.('')}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                aria-label="Clear search"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          {/* Sort Selector */}
          {setSortBy && (
            <div className="relative flex items-center">
              <ArrowUpDown className="w-3.5 h-3.5 absolute left-2.5 pointer-events-none text-muted-foreground" />
              <select
                data-testid="transaction-sort-select"
                value={sortBy || 'date-desc'}
                onChange={e => setSortBy(e.target.value)}
                aria-label="Sort transactions"
                className="h-9 bg-surface2 hover:bg-secondary border border-border rounded-[10px] pl-8 pr-3 text-label font-medium text-foreground focus-visible:ring-2 ring-ring/40 outline-none transition-colors cursor-pointer"
              >
                <option value="date-desc">Date: Newest First</option>
                <option value="date-asc">Date: Oldest First</option>
                <option value="amount-desc">Amount: High to Low</option>
                <option value="amount-asc">Amount: Low to High</option>
                <option value="desc-asc">Description: A to Z</option>
                <option value="desc-desc">Description: Z to A</option>
                <option value="cat-asc">Category: A to Z</option>
                <option value="cat-desc">Category: Z to A</option>
              </select>
            </div>
          )}

          {/* Filter Popover Button */}
          <div className="relative">
            <button
              type="button"
              onClick={() => setFilterOpen(prev => !prev)}
              className={`h-9 px-3 rounded-[10px] border text-label font-medium inline-flex items-center gap-1.5 transition-colors focus-visible:ring-2 ring-ring/40 ${
                hasActiveFilters
                  ? 'bg-foreground text-background border-foreground'
                  : 'bg-surface2 hover:bg-secondary text-foreground border-border'
              }`}
            >
              <Filter className="w-3.5 h-3.5" />
              <span>Filter</span>
            </button>

            {filterOpen && (
              <>
                <div
                  className="fixed inset-0 z-20"
                  onClick={() => setFilterOpen(false)}
                />
                <div
                  data-popover="ledger-filter"
                  className="absolute right-0 mt-1.5 w-64 rounded-[14px] bg-popover border border-border p-3 shadow-xl z-30 space-y-3"
                >
                  <div className="space-y-1.5">
                    <span className="text-label font-medium text-muted-foreground">
                      Bucket
                    </span>
                    <div className="grid grid-cols-2 gap-1.5">
                      {(
                        [
                          { key: 'fixed', label: 'Fixed', dot: 'bg-bucket-fixed' },
                          { key: 'flexible', label: 'Variable', dot: 'bg-bucket-variable' },
                          {
                            key: 'non-monthly',
                            label: 'Non-monthly',
                            dot: 'bg-bucket-nonmonthly',
                          },
                          { key: 'income', label: 'Income', dot: 'bg-bucket-saved' },
                        ] as const
                      ).map(b => (
                        <button
                          key={b.key}
                          type="button"
                          onClick={() =>
                            setSelectedBucket?.(selectedBucket === b.key ? null : b.key)
                          }
                          className={`px-2.5 py-1.5 rounded-[8px] text-label font-medium flex items-center gap-1.5 border transition-colors ${
                            selectedBucket === b.key
                              ? 'bg-surface2 border-foreground text-foreground'
                              : 'border-border text-muted-foreground hover:text-foreground'
                          }`}
                        >
                          <span className={`w-2 h-2 rounded-full ${b.dot}`} />
                          <span>{b.label}</span>
                        </button>
                      ))}
                    </div>
                  </div>

                  {availableTags.length > 0 && setSelectedTagFilter && (
                    <div className="space-y-1.5 pt-2 border-t border-border">
                      <span className="text-label font-medium text-muted-foreground">
                        Tags
                      </span>
                      <div className="flex flex-wrap gap-1 max-h-32 overflow-y-auto custom-scrollbar">
                        {availableTags.map(tag => (
                          <button
                            key={tag}
                            type="button"
                            onClick={() =>
                              setSelectedTagFilter(selectedTagFilter === tag ? null : tag)
                            }
                            className={`px-2 py-0.5 rounded-[6px] text-label font-medium transition-colors ${
                              selectedTagFilter === tag
                                ? 'bg-foreground text-background'
                                : 'bg-surface2 text-muted-foreground hover:text-foreground'
                            }`}
                          >
                            #{tag}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </>
            )}
          </div>

          {/* + Add Button */}
          {!isCurrentMonthLocked && (
            <button
              type="button"
              onClick={handleOpenAddTxn}
              data-testid="open-add-transaction-btn"
              className="h-9 px-3.5 bg-primary hover:opacity-90 text-primary-foreground rounded-[10px] text-label font-semibold inline-flex items-center gap-1.5 transition-opacity shrink-0"
            >
              <Plus className="w-4 h-4" />
              <span>Add Record</span>
            </button>
          )}

          {/* ⋯ Overflow Menu */}
          <div className="relative">
            <button
              type="button"
              onClick={() => setMoreOpen(prev => !prev)}
              aria-label="More ledger actions"
              className="w-9 h-9 rounded-[10px] bg-surface2 hover:bg-secondary border border-border flex items-center justify-center text-muted-foreground hover:text-foreground transition-colors"
            >
              <MoreHorizontal className="w-4 h-4" />
            </button>

            {moreOpen && (
              <>
                <div
                  className="fixed inset-0 z-20"
                  onClick={() => setMoreOpen(false)}
                />
                <div
                  data-popover="ledger-more"
                  className="absolute right-0 mt-1.5 w-48 rounded-[14px] bg-popover border border-border p-1.5 shadow-xl z-30 space-y-0.5"
                >
                  <button
                    type="button"
                    onClick={() => {
                      setMoreOpen(false);
                      setShowShareModal(true);
                    }}
                    className="w-full px-3 py-2 text-left text-body text-foreground hover:bg-surface2 rounded-[10px] flex items-center gap-2.5 transition-colors"
                  >
                    <Share2 className="w-4 h-4 text-muted-foreground" />
                    <span>Share</span>
                  </button>
                  {onOpenMonthlyReport && (
                    <button
                      type="button"
                      onClick={() => {
                        setMoreOpen(false);
                        onOpenMonthlyReport();
                      }}
                      className="w-full px-3 py-2 text-left text-body text-foreground hover:bg-surface2 rounded-[10px] flex items-center gap-2.5 transition-colors"
                    >
                      <FileText className="w-4 h-4 text-muted-foreground" />
                      <span>Monthly Report</span>
                    </button>
                  )}
                  {selectedMonth !== 'all' && (
                    <button
                      type="button"
                      onClick={() => {
                        setMoreOpen(false);
                        if (isCurrentMonthLocked) {
                          handleUnlockCurrentMonth();
                        } else {
                          handleLockCurrentMonth();
                        }
                      }}
                      className="w-full px-3 py-2 text-left text-body text-foreground hover:bg-surface2 rounded-[10px] flex items-center gap-2.5 transition-colors"
                    >
                      {isCurrentMonthLocked ? (
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
      </div>

      {/* Active Filter Chips (only rendered when active) */}
      {hasActiveFilters && (
        <div className="flex flex-wrap items-center gap-1.5 pt-0.5">
          {selectedBucket && (
            <button
              type="button"
              onClick={() => setSelectedBucket?.(null)}
              className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-surface2 border border-border text-label font-medium text-foreground hover:bg-secondary transition-colors"
            >
              <span>
                {selectedBucket === 'flexible'
                  ? 'Variable'
                  : selectedBucket === 'non-monthly'
                  ? 'Non-monthly'
                  : selectedBucket.charAt(0).toUpperCase() + selectedBucket.slice(1)}
              </span>
              <X className="w-3 h-3 text-muted-foreground" />
            </button>
          )}
          {selectedTagFilter && (
            <button
              type="button"
              onClick={() => setSelectedTagFilter?.(null)}
              className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-surface2 border border-border text-label font-medium text-foreground hover:bg-secondary transition-colors"
            >
              <span>#{selectedTagFilter}</span>
              <X className="w-3 h-3 text-muted-foreground" />
            </button>
          )}
          {selectedDay !== null && (
            <button
              type="button"
              onClick={onClearDay}
              className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-surface2 border border-border text-label font-medium text-foreground hover:bg-secondary transition-colors"
            >
              <span>Day {selectedDay}</span>
              <X className="w-3 h-3 text-muted-foreground" />
            </button>
          )}
          <button
            type="button"
            onClick={() => {
              setSelectedBucket?.(null);
              setSelectedTagFilter?.(null);
              onClearDay?.();
            }}
            className="text-label text-muted-foreground hover:text-foreground px-1.5 transition-colors"
          >
            Clear
          </button>
        </div>
      )}

      {/* Visible Bucket & Tag Filter Strip + Quick Actions */}
      <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
        <div className="flex flex-wrap items-center gap-1.5">
          {setSelectedBucket && (
            <div data-testid="toolbar-bucket-filters" className="inline-flex flex-wrap items-center gap-1">
              <button
                type="button"
                data-testid="filter-bucket-income"
                onClick={() =>
                  setSelectedBucket(selectedBucket === 'income' ? null : 'income')
                }
                className={`px-2.5 py-1 rounded-full text-label font-medium border transition-colors ${
                  selectedBucket === 'income'
                    ? 'bg-primary text-primary-foreground border-primary'
                    : 'bg-surface2 text-muted-foreground border-border hover:text-foreground'
                }`}
              >
                Income
              </button>
              <button
                type="button"
                data-testid="filter-bucket-fixed"
                onClick={() =>
                  setSelectedBucket(selectedBucket === 'fixed' ? null : 'fixed')
                }
                className={`px-2.5 py-1 rounded-full text-label font-medium border transition-colors ${
                  selectedBucket === 'fixed'
                    ? 'bg-primary text-primary-foreground border-primary'
                    : 'bg-surface2 text-muted-foreground border-border hover:text-foreground'
                }`}
              >
                Fixed
              </button>
              <button
                type="button"
                data-testid="filter-bucket-flexible"
                onClick={() =>
                  setSelectedBucket(selectedBucket === 'flexible' ? null : 'flexible')
                }
                className={`px-2.5 py-1 rounded-full text-label font-medium border transition-colors ${
                  selectedBucket === 'flexible'
                    ? 'bg-primary text-primary-foreground border-primary'
                    : 'bg-surface2 text-muted-foreground border-border hover:text-foreground'
                }`}
              >
                Variable
              </button>
              <button
                type="button"
                data-testid="filter-bucket-non-monthly"
                onClick={() =>
                  setSelectedBucket(selectedBucket === 'non-monthly' ? null : 'non-monthly')
                }
                className={`px-2.5 py-1 rounded-full text-label font-medium border transition-colors ${
                  selectedBucket === 'non-monthly'
                    ? 'bg-primary text-primary-foreground border-primary'
                    : 'bg-surface2 text-muted-foreground border-border hover:text-foreground'
                }`}
              >
                Non-monthly
              </button>
            </div>
          )}

          {availableTags.length > 0 && setSelectedTagFilter && (
            <div className="inline-flex flex-wrap items-center gap-1 pl-1">
              <Tag className="w-3 h-3 text-muted-foreground" />
              {availableTags.map(tag => (
                <button
                  key={tag}
                  type="button"
                  data-testid={`filter-tag-${tag}`}
                  onClick={() =>
                    setSelectedTagFilter(selectedTagFilter === tag ? null : tag)
                  }
                  className={`px-2 py-0.5 rounded-full text-label font-medium border transition-colors ${
                    selectedTagFilter === tag
                      ? 'bg-primary text-primary-foreground border-primary'
                      : 'bg-surface2 text-muted-foreground border-border hover:text-foreground'
                  }`}
                >
                  #{tag}
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-1.5">
          {selectedMonth !== 'all' && (
            <>
              <button
                type="button"
                onClick={
                  isCurrentMonthLocked ? handleUnlockCurrentMonth : handleLockCurrentMonth
                }
                data-testid={isCurrentMonthLocked ? 'unlock-month-btn' : 'lock-month-btn'}
                className="inline-flex items-center gap-1 px-2.5 py-1 rounded-[8px] bg-surface2 hover:bg-secondary border border-border text-label font-medium text-muted-foreground hover:text-foreground transition-colors"
              >
                {isCurrentMonthLocked ? (
                  <Lock className="w-3 h-3 text-amber-500" />
                ) : (
                  <Unlock className="w-3 h-3" />
                )}
                <span data-testid="lock-status-indicator">
                  {isCurrentMonthLocked ? 'Locked' : 'Unlocked'}
                </span>
              </button>
              {onOpenMonthlyReport && (
                <button
                  type="button"
                  onClick={onOpenMonthlyReport}
                  data-testid="view-monthly-report-btn"
                  className="inline-flex items-center gap-1 px-2.5 py-1 rounded-[8px] bg-surface2 hover:bg-secondary border border-border text-label font-medium text-muted-foreground hover:text-foreground transition-colors"
                >
                  <FileText className="w-3 h-3" />
                  <span>Report</span>
                </button>
              )}
            </>
          )}

          <button
            type="button"
            onClick={() => setShowShareModal(true)}
            data-testid="share-project-btn"
            className="inline-flex items-center gap-1 px-2.5 py-1 rounded-[8px] bg-surface2 hover:bg-secondary border border-border text-label font-medium text-muted-foreground hover:text-foreground transition-colors"
          >
            <Share2 className="w-3 h-3" />
            <span>Share</span>
          </button>

          {!isCurrentMonthLocked && (
            <label
              data-testid="import-csv-trigger-btn"
              className="inline-flex items-center gap-1 px-2.5 py-1 rounded-[8px] bg-surface2 hover:bg-secondary border border-border text-label font-medium text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
            >
              <Upload className="w-3 h-3" />
              <span>Import CSV</span>
              <input
                type="file"
                accept=".csv"
                data-testid="csv-file-input"
                className="hidden"
                onChange={handleCsvFileUpload}
                onClick={(e: React.MouseEvent<HTMLInputElement>) => {
                  (e.target as HTMLInputElement).value = '';
                }}
              />
            </label>
          )}
        </div>
      </div>
    </div>
  );
}
