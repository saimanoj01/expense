import React, { useState, useEffect, useMemo } from 'react';
import {
  Upload,
  Download,
  Plus,
  ArrowUpDown,
  Filter,
  Search,
  X,
} from 'lucide-react';
import type { Category } from '../../services/storage';

export type LedgerTypeFilter = 'expense' | 'income' | 'refund' | 'transfer' | null;

export interface AccountFilterOption {
  key: string;
  label: string;
}

interface TransactionToolbarProps {
  searchInputRef?: React.RefObject<HTMLInputElement>;
  filterTags?: string[];
  availableAccounts?: AccountFilterOption[];
  allCategories?: Category[];
  selectedTagFilter?: string | null;
  selectedBucket?: 'income' | 'fixed' | 'flexible' | 'non-monthly' | null;
  selectedType?: LedgerTypeFilter;
  selectedAccount?: string | null;
  selectedCategoryFilter?: string | null;
  pendingOnly?: boolean;
  needsReviewOnly?: boolean;
  autoFilter?: boolean;
  sortBy?: string;
  searchQuery?: string;
  onSearchChange?: (q: string) => void;
  onClearCategory?: () => void;
  isCurrentMonthLocked: boolean;
  setSelectedTagFilter?: (t: string | null) => void;
  setSelectedBucket?: (b: 'income' | 'fixed' | 'flexible' | 'non-monthly' | null) => void;
  setSelectedType?: (t: LedgerTypeFilter) => void;
  setSelectedAccount?: (a: string | null) => void;
  setSelectedCategoryFilter?: (catId: string | null) => void;
  setPendingOnly?: (v: boolean) => void;
  setNeedsReviewOnly?: (v: boolean) => void;
  setAutoFilter?: (v: boolean) => void;
  setSortBy?: (s: string) => void;
  handleOpenAddTxn: () => void;
  handleCsvFileUpload: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onExportCsv?: () => void;
  canExportCsv?: boolean;
}

export function TransactionToolbar({
  searchInputRef,
  filterTags = [],
  availableAccounts = [],
  allCategories = [],
  selectedTagFilter,
  selectedBucket,
  selectedType = null,
  selectedAccount = null,
  selectedCategoryFilter = null,
  pendingOnly = false,
  needsReviewOnly = false,
  autoFilter = false,
  sortBy,
  searchQuery = '',
  onSearchChange,
  onClearCategory,
  isCurrentMonthLocked,
  setSelectedTagFilter,
  setSelectedBucket,
  setSelectedType,
  setSelectedAccount,
  setSelectedCategoryFilter,
  setPendingOnly,
  setNeedsReviewOnly,
  setAutoFilter,
  setSortBy,
  handleOpenAddTxn,
  handleCsvFileUpload,
  onExportCsv,
  canExportCsv = false,
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

  const parentCategories = useMemo(
    () => allCategories.filter(c => !c.parentId),
    [allCategories]
  );

  const popoverFilterCount =
    (selectedType ? 1 : 0) +
    (selectedBucket ? 1 : 0) +
    (selectedCategoryFilter ? 1 : 0) +
    (selectedAccount ? 1 : 0) +
    (selectedTagFilter ? 1 : 0) +
    (pendingOnly ? 1 : 0) +
    (needsReviewOnly ? 1 : 0) +
    (autoFilter ? 1 : 0);

  return (
    <div className="relative flex flex-wrap items-center gap-1.5 lg:gap-2">
      {/* Search Input: full width row 1 on <640px, flexible single-row on >=640px */}
      <div className="relative w-full sm:w-auto sm:flex-1 sm:min-w-[110px] lg:min-w-[180px]">
        <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none" />
        <input
          ref={searchInputRef}
          type="text"
          data-testid="transaction-search-input"
          value={searchQuery}
          onChange={e => onSearchChange?.(e.target.value)}
          onKeyDown={e => {
            if (e.key === 'Escape') {
              e.preventDefault();
              e.stopPropagation();
              if (searchQuery) {
                onSearchChange?.('');
              } else {
                e.currentTarget.blur();
              }
            }
          }}
          placeholder="Search merchants, accounts, #tags…"
          className="w-full h-9 bg-surface2 border border-border rounded-[10px] pl-8 pr-8 text-body text-foreground placeholder:text-muted-foreground focus-visible:ring-2 ring-ring/40 outline-none transition-colors"
        />
        {searchQuery ? (
          <button
            type="button"
            onClick={() => onSearchChange?.('')}
            className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
            aria-label="Clear search"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        ) : (
          <kbd
            aria-hidden="true"
            className="hidden lg:inline-flex items-center justify-center absolute right-2.5 top-1/2 -translate-y-1/2 px-1.5 h-5 rounded bg-background/70 border border-border text-[11px] font-mono text-muted-foreground pointer-events-none"
          >
            /
          </kbd>
        )}
      </div>

      {/* Filter Popover Button */}
      <div className={filterOpen ? 'sm:relative z-[46]' : 'sm:relative'}>
        <button
          type="button"
          data-testid="ledger-filter-btn"
          aria-haspopup="dialog"
          aria-expanded={filterOpen}
          onClick={() => setFilterOpen(prev => !prev)}
          className={`h-9 px-2.5 lg:px-3 rounded-[10px] border text-label font-medium inline-flex items-center gap-1.5 transition-colors focus-visible:ring-2 ring-ring/40 ${
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
              className="fixed inset-0 z-[44]"
              onClick={() => setFilterOpen(false)}
            />
            <div
              data-popover="ledger-filter"
              role="dialog"
              aria-label="Filter transactions"
              className="absolute left-0 top-full sm:left-auto sm:right-0 mt-1.5 w-72 max-w-[calc(100vw-2rem)] max-h-[min(60vh,420px)] sm:max-h-[min(68vh,460px)] overflow-y-auto custom-scrollbar rounded-[14px] bg-popover border border-border p-3.5 shadow-xl z-[46] space-y-3"
            >
              {/* Status Filter */}
              {(setNeedsReviewOnly || setPendingOnly || setAutoFilter) && (
                <div className="space-y-1.5">
                  <span className="text-label font-medium text-muted-foreground">
                    Status
                  </span>
                  <div className="flex flex-wrap gap-1">
                    {setNeedsReviewOnly && (
                      <button
                        type="button"
                        data-testid="filter-status-review"
                        onClick={() => setNeedsReviewOnly(!needsReviewOnly)}
                        className={`px-2.5 py-1 rounded-[8px] text-label font-medium border transition-colors ${
                          needsReviewOnly
                            ? 'bg-surface2 border-foreground text-foreground'
                            : 'border-border text-muted-foreground hover:text-foreground'
                        }`}
                      >
                        Needs Review
                      </button>
                    )}
                    {setPendingOnly && (
                      <button
                        type="button"
                        data-testid="filter-status-pending"
                        onClick={() => setPendingOnly(!pendingOnly)}
                        className={`px-2.5 py-1 rounded-[8px] text-label font-medium border transition-colors ${
                          pendingOnly
                            ? 'bg-surface2 border-foreground text-foreground'
                            : 'border-border text-muted-foreground hover:text-foreground'
                        }`}
                      >
                        Pending
                      </button>
                    )}
                    {setAutoFilter && (
                      <button
                        type="button"
                        data-testid="filter-status-auto"
                        onClick={() => setAutoFilter(!autoFilter)}
                        className={`px-2.5 py-1 rounded-[8px] text-label font-medium border transition-colors ${
                          autoFilter
                            ? 'bg-surface2 border-foreground text-foreground'
                            : 'border-border text-muted-foreground hover:text-foreground'
                        }`}
                      >
                        Auto-sorted
                      </button>
                    )}
                  </div>
                </div>
              )}

              {/* Type Filter */}
              {setSelectedType && (
                <div className="space-y-1.5 pt-2.5 border-t border-border">
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
                        <span className="whitespace-nowrap">{b.label}</span>
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Category Filter */}
              {parentCategories.length > 0 && setSelectedCategoryFilter && (
                <div className="space-y-1.5 pt-2.5 border-t border-border">
                  <span className="text-label font-medium text-muted-foreground">
                    Category
                  </span>
                  <select
                    data-testid="filter-category-select"
                    aria-label="Filter by category"
                    value={selectedCategoryFilter || ''}
                    onChange={e =>
                      setSelectedCategoryFilter(e.target.value || null)
                    }
                    className="w-full h-8 bg-surface2 border border-border rounded-[8px] px-2.5 text-label font-medium text-foreground focus-visible:ring-2 ring-ring/40 outline-none cursor-pointer"
                  >
                    <option value="">All Categories</option>
                    {parentCategories.map(p => {
                      const subs = allCategories.filter(c => c.parentId === p.id);
                      return (
                        <optgroup key={p.id} label={`${p.emoji} ${p.name}`}>
                          <option value={p.id}>
                            {p.emoji} {p.name} (All)
                          </option>
                          {subs.map(s => (
                            <option key={s.id} value={s.id}>
                              {s.emoji} {s.name === 'Electricity' ? 'Electric Power' : s.name}
                            </option>
                          ))}
                        </optgroup>
                      );
                    })}
                  </select>
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

              {/* Month-Scoped User Tags Filter */}
              {filterTags.length > 0 && setSelectedTagFilter && (
                <div className="space-y-1.5 pt-2.5 border-t border-border">
                  <span className="text-label font-medium text-muted-foreground">
                    Tags
                  </span>
                  <div className="flex flex-wrap gap-1 max-h-28 overflow-y-auto custom-scrollbar">
                    {filterTags.map(tag => (
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
                      setSelectedCategoryFilter?.(null);
                      onClearCategory?.();
                      setSelectedAccount?.(null);
                      setSelectedTagFilter?.(null);
                      setPendingOnly?.(false);
                      setNeedsReviewOnly?.(false);
                      setAutoFilter?.(false);
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
          <ArrowUpDown className="w-3.5 h-3.5 absolute left-2 sm:left-2.5 pointer-events-none text-muted-foreground" />
          <select
            data-testid="transaction-sort-select"
            value={sortBy || 'date-desc'}
            onChange={e => setSortBy(e.target.value)}
            aria-label="Sort transactions"
            className="h-9 bg-surface2 hover:bg-secondary border border-border rounded-[10px] pl-7 pr-2 sm:pl-8 sm:pr-2.5 text-label font-medium text-foreground focus-visible:ring-2 ring-ring/40 outline-none transition-colors cursor-pointer max-w-[100px] lg:max-w-none truncate"
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

      {/* Export CSV Trigger */}
      {onExportCsv && (
        <button
          type="button"
          data-testid="export-csv-btn"
          onClick={onExportCsv}
          disabled={!canExportCsv}
          title="Export visible transactions to CSV"
          aria-label="Export CSV"
          className="h-9 px-2.5 lg:px-3 rounded-[10px] bg-surface2 hover:bg-secondary border border-border text-label font-medium text-muted-foreground hover:text-foreground disabled:opacity-40 disabled:pointer-events-none inline-flex items-center gap-1.5 transition-colors shrink-0 focus-visible:ring-2 ring-ring/40"
        >
          <Download className="w-3.5 h-3.5" />
          <span className="hidden lg:inline">Export</span>
        </button>
      )}

      {/* Compact CSV Import Trigger */}
      {!isCurrentMonthLocked && (
        <label
          data-testid="import-csv-trigger-btn"
          title="Import CSV"
          className="h-9 px-2.5 lg:px-3 rounded-[10px] bg-surface2 hover:bg-secondary border border-border text-label font-medium text-muted-foreground hover:text-foreground inline-flex items-center gap-1.5 transition-colors cursor-pointer shrink-0"
        >
          <Upload className="w-3.5 h-3.5" />
          <span className="hidden lg:inline">CSV</span>
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
          className="h-9 px-2.5 lg:px-3.5 bg-primary hover:opacity-90 text-primary-foreground rounded-[10px] text-label font-semibold inline-flex items-center gap-1.5 transition-opacity shrink-0 focus-visible:ring-2 ring-ring/40"
        >
          <Plus className="w-4 h-4" />
          <span>Add</span>
        </button>
      )}
    </div>
  );
}
