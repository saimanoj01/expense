import { useState, useMemo } from 'react';
import { Search, Filter, Trash2, X, Tag } from 'lucide-react';
import { AnimatePresence, motion } from 'framer-motion';
import { Transaction, Category, DEFAULT_CATEGORIES } from '../../services/storage';
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
  setSelectedTagFilter: (tag: string | null) => void;
  toggleSelectTxn: (id: string) => void;
  toggleSelectAllTxns: () => void;
  handleEditTxn: (txn: Transaction) => void;
  handleDeleteTxn: (id: string) => void;
  handleCategoryChange?: (txn: Transaction, newCatId: string, newSubCatId?: string | null) => void;
  handleExecuteBulkCategoryUpdate?: (selectedTxnIds: Set<string>, categoryId: string, subCategoryId?: string | null) => void;
  setShowBulkDeleteConfirmModal: (v: boolean) => void;
  handleAddTag?: (txnId: string, tags: string[]) => void;
  handleRemoveTag?: (txnId: string, tag: string) => void;
  handleExecuteBulkAddTag?: (selectedTxnIds: Set<string>, tags: string[]) => void;
  handleExecuteBulkRemoveTag?: (selectedTxnIds: Set<string>, tag: string) => void;
}

export function TransactionList({
  transactions,
  categories,
  availableTags = [],
  selectedTagFilter,
  duplicateTxnIds,
  isLockedMonth,
  selectedTxnIds,
  setSelectedTagFilter,
  toggleSelectTxn,
  toggleSelectAllTxns,
  handleEditTxn,
  handleDeleteTxn,
  handleCategoryChange,
  handleExecuteBulkCategoryUpdate,
  setShowBulkDeleteConfirmModal,
  handleAddTag,
  handleRemoveTag,
  handleExecuteBulkAddTag,
  handleExecuteBulkRemoveTag
}: TransactionListProps) {
  const [showBulkAddPopover, setShowBulkAddPopover] = useState(false);

  const isAllSelected = transactions.length > 0 && transactions.every(t => selectedTxnIds.has(t.id));

  const allCategories = useMemo(() => {
    const map = new Map<string, Category>();
    DEFAULT_CATEGORIES.forEach(c => map.set(c.id, c));
    categories.forEach(c => map.set(c.id, c));
    return Array.from(map.values());
  }, [categories]);

  const parentCats = useMemo(() => allCategories.filter(c => !c.parentId), [allCategories]);

  // Extract unique tags across currently selected transactions
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

  return (
    <div className="glass-card rounded-2xl flex flex-col min-h-[350px] max-h-[600px] h-[55vh]">
      <div className="p-4 border-b border-border/50 flex flex-wrap items-center justify-between gap-3 bg-card/30 rounded-t-2xl">
        <div className="flex items-center gap-3">
          <h2 className="font-bold text-lg">Transactions</h2>
          <span className="px-2 py-0.5 rounded-full bg-card border border-border text-xs font-bold tabular-nums">
            {transactions.length}
          </span>
          {selectedTagFilter && (
            <div className="flex items-center gap-1.5 px-2 py-1 rounded-lg bg-secondary/10 border border-secondary/20 text-secondary text-xs font-bold">
              <Filter className="w-3 h-3" />
              <span className="uppercase tracking-wider">{selectedTagFilter}</span>
              <button onClick={() => setSelectedTagFilter(null)} className="ml-1 hover:text-foreground transition-colors">
                <X className="w-3 h-3" />
              </button>
            </div>
          )}
        </div>
        
        <div className="flex items-center gap-3 flex-wrap">
          {selectedTxnIds.size > 0 && (
            <div className="flex items-center gap-2 flex-wrap">
              {handleExecuteBulkCategoryUpdate && (
                <div className="relative flex items-center">
                  <select
                    defaultValue=""
                    onChange={(e) => {
                      if (e.target.value) {
                        const [catId, subId] = e.target.value.split('|');
                        handleExecuteBulkCategoryUpdate(selectedTxnIds, catId, subId || null);
                        e.target.value = '';
                      }
                    }}
                    className="px-3 py-1.5 bg-card/80 border border-border text-foreground hover:bg-card rounded-lg text-xs sm:text-sm font-bold transition-colors cursor-pointer outline-none shadow-sm"
                  >
                    <option value="" disabled className="bg-card text-card-foreground">Set Category ({selectedTxnIds.size})...</option>
                    {parentCats.map(p => {
                      const subs = allCategories.filter(c => c.parentId === p.id);
                      return (
                        <optgroup key={p.id} label={`${p.emoji} ${p.name}`} className="bg-card font-bold text-muted-foreground">
                          <option value={`${p.id}|`} className="bg-card text-card-foreground font-semibold">
                            {p.emoji} {p.name} (General)
                          </option>
                          {subs.map(s => (
                            <option key={s.id} value={`${p.id}|${s.id}`} className="bg-card text-card-foreground">
                              {s.emoji} {s.name}
                            </option>
                          ))}
                        </optgroup>
                      );
                    })}
                  </select>
                </div>
              )}

              {/* Bulk Add Tag */}
              {handleExecuteBulkAddTag && (
                <div className="relative inline-block">
                  <button
                    type="button"
                    data-testid="bulk-add-tag-btn"
                    onClick={() => setShowBulkAddPopover(prev => !prev)}
                    className="flex items-center gap-1 px-3 py-1.5 bg-secondary/10 text-secondary border border-secondary/20 hover:bg-secondary/20 rounded-lg text-xs sm:text-sm font-bold transition-colors"
                  >
                    <Tag className="w-3.5 h-3.5" /> + Tag ({selectedTxnIds.size})
                  </button>
                  {showBulkAddPopover && (
                    <TagInputPopover
                      availableTags={availableTags}
                      onAddTag={(tags) => {
                        handleExecuteBulkAddTag(selectedTxnIds, tags);
                        setShowBulkAddPopover(false);
                      }}
                      onClose={() => setShowBulkAddPopover(false)}
                      align="right"
                    />
                  )}
                </div>
              )}

              {/* Bulk Remove Tag */}
              {handleExecuteBulkRemoveTag && selectedTxnTags.length > 0 && (
                <select
                  defaultValue=""
                  data-testid="bulk-remove-tag-select"
                  onChange={(e) => {
                    if (e.target.value) {
                      handleExecuteBulkRemoveTag(selectedTxnIds, e.target.value);
                      e.target.value = '';
                    }
                  }}
                  className="px-3 py-1.5 bg-card/80 border border-border text-foreground hover:bg-card rounded-lg text-xs sm:text-sm font-bold transition-colors cursor-pointer outline-none shadow-sm"
                >
                  <option value="" disabled className="bg-card text-card-foreground">Remove Tag ({selectedTxnIds.size})...</option>
                  {selectedTxnTags.map(tag => (
                    <option key={tag} value={tag} className="bg-card text-card-foreground">#{tag}</option>
                  ))}
                </select>
              )}

              <motion.button
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                onClick={() => setShowBulkDeleteConfirmModal(true)}
                className="flex items-center gap-2 px-3 py-1.5 bg-destructive/10 text-destructive border border-destructive/20 hover:bg-destructive/20 rounded-lg text-sm font-bold transition-colors"
              >
                <Trash2 className="w-4 h-4" /> Delete ({selectedTxnIds.size})
              </motion.button>
            </div>
          )}

          {!isLockedMonth && transactions.length > 0 && (
            <label className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground cursor-pointer transition-colors">
              <input
                type="checkbox"
                checked={isAllSelected}
                onChange={toggleSelectAllTxns}
                className="w-4 h-4 rounded bg-background border-border text-primary focus:ring-primary focus:ring-offset-background"
              />
              Select All
            </label>
          )}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto custom-scrollbar p-2">
        <AnimatePresence mode="popLayout">
          {transactions.length === 0 ? (
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="flex flex-col items-center justify-center h-full text-muted-foreground gap-4 py-12"
            >
              <div className="w-16 h-16 rounded-full bg-card flex items-center justify-center">
                <Search className="w-8 h-8 opacity-20" />
              </div>
              <p>No transactions found.</p>
            </motion.div>
          ) : (
            transactions.map(txn => (
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
                setSelectedTagFilter={setSelectedTagFilter}
                handleAddTag={handleAddTag}
                handleRemoveTag={handleRemoveTag}
              />
            ))
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
