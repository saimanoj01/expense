import { useState, useMemo } from 'react';
import { Search, Trash2, X, Tag } from 'lucide-react';
import { AnimatePresence, motion } from 'framer-motion';
import { Transaction, Category, DEFAULT_CATEGORIES, SpendingBucket } from '../../services/storage';
import { formatMoney } from '../../utils/formatters';
import { TransactionItem } from './TransactionItem';
import { TagInputPopover } from '../common/TagInputPopover';

interface TransactionListProps {
  transactions: Transaction[];
  categories: Category[];
  availableTags?: string[];
  selectedTagFilter: string | null;
  duplicateTxnIds: Set<string>;
  isLockedMonth: boolean;
  selectedTxnIds: Set<string>;
  sortBy?: string;
  setSelectedTagFilter: (tag: string | null) => void;
  toggleSelectTxn: (id: string) => void;
  toggleSelectAllTxns: () => void;
  handleEditTxn: (txn: Transaction) => void;
  handleDeleteTxn: (id: string) => void;
  handleCategoryChange?: (txn: Transaction, newCatId: string, newSubCatId?: string | null) => void;
  handleBucketChange?: (txn: Transaction, newBucket: SpendingBucket) => void;
  handleExecuteBulkCategoryUpdate?: (selectedTxnIds: Set<string>, categoryId: string, subCategoryId?: string | null) => void;
  handleExecuteBulkBucketUpdate?: (selectedTxnIds: Set<string>, bucket: SpendingBucket) => void;
  setShowBulkDeleteConfirmModal: (v: boolean) => void;
  handleAddTag?: (txnId: string, tags: string[]) => void;
  handleRemoveTag?: (txnId: string, tag: string) => void;
  handleExecuteBulkAddTag?: (selectedTxnIds: Set<string>, tags: string[]) => void;
  handleExecuteBulkRemoveTag?: (selectedTxnIds: Set<string>, tag: string) => void;
}

function formatDayHeader(dateStr: string): string {
  if (!dateStr || !/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) return dateStr || 'RECENT';
  const [y, m, d] = dateStr.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  return dt
    .toLocaleDateString('en-US', {
      weekday: 'short',
      month: 'short',
      day: 'numeric',
      timeZone: 'UTC',
    })
    .toUpperCase();
}

export function TransactionList({
  transactions,
  categories,
  availableTags = [],
  duplicateTxnIds,
  isLockedMonth,
  selectedTxnIds,
  sortBy = 'date-desc',
  setSelectedTagFilter,
  toggleSelectTxn,
  toggleSelectAllTxns,
  handleEditTxn,
  handleDeleteTxn,
  handleCategoryChange,
  handleBucketChange,
  handleExecuteBulkCategoryUpdate,
  handleExecuteBulkBucketUpdate,
  setShowBulkDeleteConfirmModal,
  handleAddTag,
  handleRemoveTag,
  handleExecuteBulkAddTag,
  handleExecuteBulkRemoveTag,
}: TransactionListProps) {
  const [showBulkAddPopover, setShowBulkAddPopover] = useState(false);

  const isAllSelected =
    transactions.length > 0 && transactions.every(t => selectedTxnIds.has(t.id));

  const allCategories = useMemo(() => {
    const map = new Map<string, Category>();
    DEFAULT_CATEGORIES.forEach(c => map.set(c.id, c));
    categories.forEach(c => map.set(c.id, c));
    return Array.from(map.values());
  }, [categories]);

  const parentCats = useMemo(() => allCategories.filter(c => !c.parentId), [allCategories]);

  const selectedTxnTags = useMemo(() => {
    const tagsSet = new Set<string>();
    transactions.forEach(t => {
      if (selectedTxnIds.has(t.id) && Array.isArray(t.labels)) {
        t.labels.forEach(lbl => {
          if (lbl && lbl.trim()) tagsSet.add(lbl.trim().toLowerCase());
        });
      }
    });
    return Array.from(tagsSet).sort();
  }, [transactions, selectedTxnIds]);

  const isDateSorted = !sortBy || sortBy === 'date-desc' || sortBy === 'date-asc';

  const dayGroups = useMemo(() => {
    if (!isDateSorted) return null;
    const groups: { date: string; txns: Transaction[]; netTotal: number }[] = [];
    transactions.forEach(t => {
      const d = t.date || '';
      const last = groups[groups.length - 1];
      // Exclude transfers from day-group totals per §3.12
      const deltaAmt =
        t.type === 'income' ? t.amount : t.type === 'expense' ? -t.amount : 0;
      if (!last || last.date !== d) {
        groups.push({ date: d, txns: [t], netTotal: deltaAmt });
      } else {
        last.txns.push(t);
        last.netTotal += deltaAmt;
      }
    });
    return groups;
  }, [transactions, isDateSorted]);

  return (
    <div className="relative flex flex-col">
      {!isLockedMonth && transactions.length > 0 && (
        <div className="flex items-center justify-end pb-1">
          <label className="inline-flex items-center gap-2 text-label text-muted-foreground hover:text-foreground cursor-pointer transition-colors">
            <input
              type="checkbox"
              checked={isAllSelected}
              onChange={toggleSelectAllTxns}
              className="w-4 h-4 rounded bg-background border-border text-primary focus:ring-primary"
            />
            <span>Select All</span>
          </label>
        </div>
      )}

      {transactions.length === 0 ? (
        <div className="flex flex-col items-center justify-center text-muted-foreground gap-3 py-12 border-t border-border">
          <div className="w-12 h-12 rounded-full bg-surface2 flex items-center justify-center">
            <Search className="w-5 h-5 text-muted-foreground" />
          </div>
          <p className="text-body">No transactions found.</p>
        </div>
      ) : dayGroups ? (
        <div className="divide-y divide-border border-t border-border">
          {dayGroups.map(group => (
            <div key={group.date} className="py-2">
              <div className="sticky top-14 z-10 bg-background/90 backdrop-blur-sm flex items-center justify-between py-1.5 text-label font-semibold text-muted-foreground tabular-nums num">
                <span>{formatDayHeader(group.date)}</span>
                <span>{formatMoney(group.netTotal, { cents: true, sign: 'auto' })}</span>
              </div>
              <div className="space-y-0.5">
                {group.txns.map(txn => (
                  <TransactionItem
                    key={txn.id}
                    transaction={txn}
                    categories={categories}
                    availableTags={availableTags}
                    isLockedMonth={isLockedMonth}
                    isSelected={selectedTxnIds.has(txn.id)}
                    isDuplicate={duplicateTxnIds.has(txn.id)}
                    toggleSelectTxn={toggleSelectTxn}
                    handleEditTxn={handleEditTxn}
                    handleDeleteTxn={handleDeleteTxn}
                    handleCategoryChange={handleCategoryChange}
                    handleBucketChange={handleBucketChange}
                    setSelectedTagFilter={setSelectedTagFilter}
                    handleAddTag={handleAddTag}
                    handleRemoveTag={handleRemoveTag}
                  />
                ))}
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="divide-y divide-border/50 border-t border-border py-1">
          {transactions.map(txn => (
            <TransactionItem
              key={txn.id}
              transaction={txn}
              categories={categories}
              availableTags={availableTags}
              isLockedMonth={isLockedMonth}
              isSelected={selectedTxnIds.has(txn.id)}
              isDuplicate={duplicateTxnIds.has(txn.id)}
              toggleSelectTxn={toggleSelectTxn}
              handleEditTxn={handleEditTxn}
              handleDeleteTxn={handleDeleteTxn}
              handleCategoryChange={handleCategoryChange}
              handleBucketChange={handleBucketChange}
              setSelectedTagFilter={setSelectedTagFilter}
              handleAddTag={handleAddTag}
              handleRemoveTag={handleRemoveTag}
            />
          ))}
        </div>
      )}

      {/* Floating Bulk Action Bar (springs from y: 24 when >= 1 selected) */}
      <AnimatePresence>
        {selectedTxnIds.size > 0 && (
          <motion.div
            initial={{ opacity: 0, y: 24 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 24 }}
            transition={{ type: 'spring', stiffness: 360, damping: 32 }}
            className="fixed bottom-16 md:bottom-6 left-1/2 -translate-x-1/2 z-40 rounded-[14px] bg-popover border border-border shadow-xl px-4 py-2.5 flex flex-wrap items-center gap-2.5"
          >
            <span className="text-body font-medium text-foreground tabular-nums num">
              {selectedTxnIds.size} selected
            </span>

            <span className="text-faint">·</span>

            {handleExecuteBulkCategoryUpdate && (
              <select
                defaultValue=""
                onChange={e => {
                  if (e.target.value) {
                    const [catId, subId] = e.target.value.split('|');
                    handleExecuteBulkCategoryUpdate(selectedTxnIds, catId, subId || null);
                    e.target.value = '';
                  }
                }}
                className="px-2.5 py-1 bg-surface2 border border-border text-foreground hover:bg-secondary rounded-[8px] text-label font-medium transition-colors cursor-pointer outline-none"
              >
                <option value="" disabled>
                  Set Category ({selectedTxnIds.size})...
                </option>
                {parentCats.map(p => {
                  const subs = allCategories.filter(c => c.parentId === p.id);
                  return (
                    <optgroup key={p.id} label={`${p.emoji} ${p.name}`}>
                      <option value={`${p.id}|`}>
                        {p.emoji} {p.name} (General)
                      </option>
                      {subs.map(s => (
                        <option key={s.id} value={`${p.id}|${s.id}`}>
                          {s.emoji} {s.name === 'Electricity' ? 'Electric Power' : s.name}
                        </option>
                      ))}
                    </optgroup>
                  );
                })}
              </select>
            )}

            {handleExecuteBulkBucketUpdate && (
              <select
                data-testid="bulk-bucket-select"
                defaultValue=""
                onChange={e => {
                  if (e.target.value) {
                    handleExecuteBulkBucketUpdate(
                      selectedTxnIds,
                      e.target.value as SpendingBucket
                    );
                    e.target.value = '';
                  }
                }}
                className="px-2.5 py-1 bg-surface2 border border-border text-foreground hover:bg-secondary rounded-[8px] text-label font-medium transition-colors cursor-pointer outline-none"
              >
                <option value="" disabled>
                  Set Bucket ({selectedTxnIds.size})...
                </option>
                <option value="fixed">Fixed Commitment</option>
                <option value="flexible">Variable (Flexible)</option>
                <option value="non-monthly">Non-Monthly</option>
              </select>
            )}

            {handleExecuteBulkAddTag && (
              <div className="relative inline-block">
                <button
                  type="button"
                  data-testid="bulk-add-tag-btn"
                  onClick={() => setShowBulkAddPopover(prev => !prev)}
                  className="inline-flex items-center gap-1 px-2.5 py-1 bg-surface2 hover:bg-secondary text-foreground border border-border rounded-[8px] text-label font-medium transition-colors"
                >
                  <Tag className="w-3.5 h-3.5" /> + Tag ({selectedTxnIds.size})
                </button>
                {showBulkAddPopover && (
                  <TagInputPopover
                    availableTags={availableTags}
                    onAddTag={tags => {
                      handleExecuteBulkAddTag(selectedTxnIds, tags);
                      setShowBulkAddPopover(false);
                    }}
                    onClose={() => setShowBulkAddPopover(false)}
                    align="right"
                  />
                )}
              </div>
            )}

            {handleExecuteBulkRemoveTag && selectedTxnTags.length > 0 && (
              <select
                defaultValue=""
                data-testid="bulk-remove-tag-select"
                onChange={e => {
                  if (e.target.value) {
                    handleExecuteBulkRemoveTag(selectedTxnIds, e.target.value);
                    e.target.value = '';
                  }
                }}
                className="px-2.5 py-1 bg-surface2 border border-border text-foreground hover:bg-secondary rounded-[8px] text-label font-medium transition-colors cursor-pointer outline-none"
              >
                <option value="" disabled>
                  Remove Tag ({selectedTxnIds.size})...
                </option>
                {selectedTxnTags.map(tag => (
                  <option key={tag} value={tag}>
                    #{tag}
                  </option>
                ))}
              </select>
            )}

            <button
              type="button"
              onClick={() => setShowBulkDeleteConfirmModal(true)}
              className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-negative/10 text-negative border border-negative/25 hover:bg-negative/20 rounded-[8px] text-label font-medium transition-colors"
            >
              <Trash2 className="w-3.5 h-3.5" /> Delete ({selectedTxnIds.size})
            </button>

            <button
              type="button"
              onClick={toggleSelectAllTxns}
              title="Clear selection"
              aria-label="Clear selection"
              className="p-1 text-muted-foreground hover:text-foreground rounded-[8px] transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
