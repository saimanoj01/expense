import React, { useState, useEffect } from 'react';
import {
  Upload,
  Plus,
  ArrowUpDown,
  Filter,
  Search,
  X,
} from 'lucide-react';

export type LedgerTypeFilter = 'expense' | 'income' | 'refund' | 'transfer' | null;

export interface AccountFilterOption {
  key: string;
  label: string;
}

interface TransactionToolbarProps {
  availableTags?: string[];
  availableAccounts?: AccountFilterOption[];
  selectedTagFilter?: string | null;
  selectedBucket?: 'income' | 'fixed' | 'flexible' | 'non-monthly' | null;
  selectedType?: LedgerTypeFilter;
  selectedAccount?: string | null;
  needsReviewOnly?: boolean;
  activeCategoryLabel?: string | null;
  autoFilter?: boolean;
  sortBy?: string;
  searchQuery?: string;
  onSearchChange?: (q: string) => void;
  selectedDay?: number | null;
  onClearDay?: () => void;
  onClearCategory?: () => void;
  onClearAutoFilter?: () => void;
  onClearNeedsReview?: () => void;
  isCurrentMonthLocked: boolean;
  setSelectedTagFilter?: (t: string | null) => void;
  setSelectedBucket?: (b: 'income' | 'fixed' | 'flexible' | 'non-monthly' | null) => void;
  setSelectedType?: (t: LedgerTypeFilter) => void;
  setSelectedAccount?: (a: string | null) => void;
  setSortBy?: (s: string) => void;
  handleOpenAddTxn: () => void;
  handleCsvFileUpload: (e: React.ChangeEvent<HTMLInputElement>) => void;
}

const TYPE_LABELS: Record<Exclude<LedgerTypeFilter, null>, string> = {
  expense: 'Expenses',
  income: 'Income',
  refund: 'Refunds',
  transfer: 'Transfers',
};

export function TransactionToolbar({
  availableTags = [],
  availableAccounts = [],
  selectedTagFilter,
  selectedBucket,
  selectedType = null,
  selectedAccount = null,
  needsReviewOnly = false,
  activeCategoryLabel = null,
  autoFilter = false,
  sortBy,
  searchQuery = '',
  onSearchChange,
  selectedDay = null,
  onClearDay,
  onClearCategory,
  onClearAutoFilter,
  onClearNeedsReview,
  isCurrentMonthLocked,
  setSelectedTagFilter,
  setSelectedBucket,
  setSelectedType,
  setSelectedAccount,
  setSortBy,
  handleOpenAddTxn,
  handleCsvFileUpload,
}: TransactionToolbarProps) {
  const [filterOpen, setFilterOpen] = useState(false);

  useEffect(() => {
    if (!filterOpen) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        setFilterOpen(false);
      }
    };
    window.addEventListener('keydown', onKeyDown, true);
    return () => window.removeEventListener('keydown', onKeyDown, true);
  }, [filterOpen]);

  const popoverFilterCount =
    (selectedType ? 1 : 0) +
    (selectedBucket ? 1 : 0) +
    (selectedAccount ? 1 : 0) +
    (selectedTagFilter ? 1 : 0);

  const activeChipCount =
    popoverFilterCount +
    (activeCategoryLabel ? 1 : 0) +
    (autoFilter ? 1 : 0) +
    (needsReviewOnly ? 1 : 0) +
    (selectedDay !== null ? 1 : 0);

  const selectedAccountLabel =
    availableAccounts.find(a => a.key === selectedAccount)?.label || selectedAccount;

  const handleClearAllFilters = () => {
    setSelectedType?.(null);
    setSelectedBucket?.(null);
    setSelectedAccount?.(null);
    setSelectedTagFilter?.(null);
    onClearDay?.();
    onClearCategory?.();
    onClearAutoFilter?.();
    onClearNeedsReview?.();
  };

  return (
    <div className="space-y-2">
      {/* Unified Single-Row Control Bar */}
      <div className="flex flex-wrap items-center gap-2">
        {/* Search Input */}
        <div className="relative w-full sm:w-auto sm:flex-1 sm:min-w-[200px]">
          <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none" />
          <input
            type="text"
            data-testid="transaction-search-input"
            value={searchQuery}
            onChange={e => onSearchChange?.(e.target.value)}
            placeholder="Search transactions, merchants, accounts, tags…"
            className="w-full h-9 bg-surface2 border border-border rounded-[10px] pl-8 pr-7 text-body text-foreground placeholder:text-muted-foreground focus-visible:ring-2 ring-ring/40 outline-none transition-colors"
          />
          {searchQuery && (
            <button
              type="button"
              onClick={() => onSearchChange?.('')}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
              aria-label="Clear search"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>

        {/* Filter Popover Button */}
        <div className={filterOpen ? 'relative z-30' : 'relative'}>
          <button
            type="button"
            data-testid="ledger-filter-btn"
            aria-haspopup="dialog"
            aria-expanded={filterOpen}
            onClick={() => setFilterOpen(prev => !prev)}
            className={`h-9 px-3 rounded-[10px] border text-label font-medium inline-flex items-center gap-1.5 transition-colors focus-visible:ring-2 ring-ring/40 ${
              popoverFilterCount > 0
                ? 'bg-foreground text-background border-foreground'
                : 'bg-surface2 hover:bg-secondary text-foreground border-border'
            }`}
          >
            <Filter className="w-3.5 h-3.5" />
            <span>Filter</span>
            {popoverFilterCount > 0 && (
              <span className="ml-0.5 px-1.5 py-0.5 rounded-full bg-background/20 text-[11px] font-semibold tabular-nums num">
                {popoverFilterCount}
              </span>
            )}
          </button>

          {filterOpen && (
            <>
              <div
                className="fixed inset-0 z-20"
                onClick={() => setFilterOpen(false)}
              />
              <div
                data-popover="ledger-filter"
                role="dialog"
                aria-label="Filter transactions"
                className="absolute left-0 sm:left-auto sm:right-0 mt-1.5 w-72 max-w-[calc(100vw-2rem)] rounded-[14px] bg-popover border border-border p-3.5 shadow-xl z-30 space-y-3"
              >
                {/* Type Filter */}
                {setSelectedType && (
                  <div className="space-y-1.5">
                    <span className="text-label font-medium text-muted-foreground">
                      Type
                    </span>
                    <div className="flex flex-wrap gap-1">
                      <button
                        type="button"
                        data-testid="filter-type-all"
                        onClick={() => setSelectedType(null)}
                        className={`px-2.5 py-1 rounded-[8px] text-label font-medium border transition-colors ${
                          selectedType === null
                            ? 'bg-surface2 border-foreground text-foreground'
                            : 'border-border text-muted-foreground hover:text-foreground'
                        }`}
                      >
                        All
                      </button>
                      {(
                        [
                          { key: 'expense', label: 'Expenses' },
                          { key: 'income', label: 'Income' },
                          { key: 'refund', label: 'Refunds' },
                          { key: 'transfer', label: 'Transfers' },
                        ] as const
                      ).map(opt => (
                        <button
                          key={opt.key}
                          type="button"
                          data-testid={`filter-type-${opt.key}`}
                          onClick={() =>
                            setSelectedType(selectedType === opt.key ? null : opt.key)
                          }
                          className={`px-2.5 py-1 rounded-[8px] text-label font-medium border transition-colors ${
                            selectedType === opt.key
                              ? 'bg-surface2 border-foreground text-foreground'
                              : 'border-border text-muted-foreground hover:text-foreground'
                          }`}
                        >
                          {opt.label}
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {/* Bucket Filter */}
                {setSelectedBucket && (
                  <div className="space-y-1.5 pt-2.5 border-t border-border">
                    <span className="text-label font-medium text-muted-foreground">
                      Spending Bucket
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
                          data-testid={`filter-bucket-${b.key}`}
                          onClick={() =>
                            setSelectedBucket(selectedBucket === b.key ? null : b.key)
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
                )}

                {/* Account Filter */}
                {availableAccounts.length > 0 && setSelectedAccount && (
                  <div className="space-y-1.5 pt-2.5 border-t border-border">
                    <span className="text-label font-medium text-muted-foreground">
                      Account / Card
                    </span>
                    <div className="flex flex-wrap gap-1 max-h-28 overflow-y-auto custom-scrollbar">
                      {availableAccounts.map(acc => (
                        <button
                          key={acc.key}
                          type="button"
                          data-testid={`filter-account-${acc.key}`}
                          onClick={() =>
                            setSelectedAccount(selectedAccount === acc.key ? null : acc.key)
                          }
                          className={`px-2 py-0.5 rounded-[6px] text-label font-medium border transition-colors ${
                            selectedAccount === acc.key
                              ? 'bg-foreground text-background border-foreground'
                              : 'bg-surface2 border-border text-muted-foreground hover:text-foreground'
                          }`}
                        >
                          {acc.label}
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {/* User Tags Filter */}
                {availableTags.length > 0 && setSelectedTagFilter && (
                  <div className="space-y-1.5 pt-2.5 border-t border-border">
                    <span className="text-label font-medium text-muted-foreground">
                      Tags
                    </span>
                    <div className="flex flex-wrap gap-1 max-h-32 overflow-y-auto custom-scrollbar">
                      {availableTags.map(tag => (
                        <button
                          key={tag}
                          type="button"
                          data-testid={`filter-tag-${tag}`}
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

                {popoverFilterCount > 0 && (
                  <div className="pt-2 border-t border-border flex justify-end">
                    <button
                      type="button"
                      onClick={() => {
                        setSelectedType?.(null);
                        setSelectedBucket?.(null);
                        setSelectedAccount?.(null);
                        setSelectedTagFilter?.(null);
                      }}
                      className="text-label font-medium text-muted-foreground hover:text-foreground transition-colors"
                    >
                      Reset filters
                    </button>
                  </div>
                )}
              </div>
            </>
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
              <option value="date-desc">Newest</option>
              <option value="date-asc">Oldest</option>
              <option value="amount-desc">Amount: High–Low</option>
              <option value="amount-asc">Amount: Low–High</option>
              <option value="desc-asc">Merchant: A–Z</option>
              <option value="desc-desc">Merchant: Z–A</option>
              <option value="cat-asc">Category: A–Z</option>
              <option value="cat-desc">Category: Z–A</option>
            </select>
          </div>
        )}

        {/* Compact CSV Import Trigger */}
        {!isCurrentMonthLocked && (
          <label
            data-testid="import-csv-trigger-btn"
            title="Import CSV"
            className="h-9 px-3 rounded-[10px] bg-surface2 hover:bg-secondary border border-border text-label font-medium text-muted-foreground hover:text-foreground inline-flex items-center gap-1.5 transition-colors cursor-pointer shrink-0"
          >
            <Upload className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">CSV</span>
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

        {/* + Add Button */}
        {!isCurrentMonthLocked && (
          <button
            type="button"
            onClick={handleOpenAddTxn}
            data-testid="open-add-transaction-btn"
            className="h-9 px-3.5 bg-primary hover:opacity-90 text-primary-foreground rounded-[10px] text-label font-semibold inline-flex items-center gap-1.5 transition-opacity shrink-0"
          >
            <Plus className="w-4 h-4" />
            <span>Add</span>
          </button>
        )}
      </div>

      {/* Unified Active Filter Chips (only rendered when >= 1 filter is active) */}
      {activeChipCount > 0 && (
        <div className="flex flex-wrap items-center gap-1.5">
          {activeCategoryLabel && onClearCategory && (
            <button
              type="button"
              data-testid="clear-category-filter-chip"
              aria-label="Clear category filter"
              onClick={onClearCategory}
              className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-surface2 border border-border text-label font-medium text-foreground hover:bg-secondary transition-colors"
            >
              <span>{activeCategoryLabel}</span>
              <X className="w-3 h-3 text-muted-foreground" />
            </button>
          )}
          {autoFilter && onClearAutoFilter && (
            <button
              type="button"
              aria-label="Clear auto-sorted Variable filter"
              onClick={onClearAutoFilter}
              className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-surface2 border border-border text-label font-medium text-foreground hover:bg-secondary transition-colors"
            >
              <span>Auto-sorted into Variable</span>
              <X className="w-3 h-3 text-muted-foreground" />
            </button>
          )}
          {needsReviewOnly && onClearNeedsReview && (
            <button
              type="button"
              aria-label="Clear Needs Review filter"
              onClick={onClearNeedsReview}
              className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-warning/15 border border-warning/30 text-label font-medium text-warning hover:bg-warning/20 transition-colors"
            >
              <span>Needs Review</span>
              <X className="w-3 h-3" />
            </button>
          )}
          {selectedType && setSelectedType && (
            <button
              type="button"
              aria-label={`Clear ${TYPE_LABELS[selectedType]} type filter`}
              onClick={() => setSelectedType(null)}
              className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-surface2 border border-border text-label font-medium text-foreground hover:bg-secondary transition-colors"
            >
              <span>{TYPE_LABELS[selectedType]}</span>
              <X className="w-3 h-3 text-muted-foreground" />
            </button>
          )}
          {selectedBucket && setSelectedBucket && (
            <button
              type="button"
              aria-label="Clear bucket filter"
              onClick={() => setSelectedBucket(null)}
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
          {selectedAccount && setSelectedAccount && (
            <button
              type="button"
              aria-label={`Clear ${selectedAccountLabel} account filter`}
              onClick={() => setSelectedAccount(null)}
              className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-surface2 border border-border text-label font-medium text-foreground hover:bg-secondary transition-colors"
            >
              <span>Account: {selectedAccountLabel}</span>
              <X className="w-3 h-3 text-muted-foreground" />
            </button>
          )}
          {selectedTagFilter && setSelectedTagFilter && (
            <button
              type="button"
              aria-label={`Clear #${selectedTagFilter} tag filter`}
              onClick={() => setSelectedTagFilter(null)}
              className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-surface2 border border-border text-label font-medium text-foreground hover:bg-secondary transition-colors"
            >
              <span>#{selectedTagFilter}</span>
              <X className="w-3 h-3 text-muted-foreground" />
            </button>
          )}
          {selectedDay !== null && onClearDay && (
            <button
              type="button"
              aria-label={`Clear Day ${selectedDay} filter`}
              onClick={onClearDay}
              className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-surface2 border border-border text-label font-medium text-foreground hover:bg-secondary transition-colors"
            >
              <span>Day {selectedDay}</span>
              <X className="w-3 h-3 text-muted-foreground" />
            </button>
          )}
          <button
            type="button"
            data-testid="clear-all-filters-btn"
            onClick={handleClearAllFilters}
            className="text-label text-muted-foreground hover:text-foreground px-1.5 transition-colors"
          >
            Clear all
          </button>
        </div>
      )}
    </div>
  );
}
