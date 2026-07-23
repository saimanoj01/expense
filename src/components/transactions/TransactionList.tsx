import { Search, Filter, Trash2, X } from 'lucide-react';
import { AnimatePresence, motion } from 'framer-motion';
import { useMemo } from 'react';
import { Transaction, Category, DEFAULT_CATEGORIES } from '../../services/storage';
import { TransactionItem } from './TransactionItem';

interface TransactionListProps {
  transactions: Transaction[];
  categories: Category[];
  selectedTagFilter: string | null;
  duplicateTxnIds: Set<string>;
  isLockedMonth: boolean;
  selectedTxnIds: Set<string>;
  setSelectedTagFilter: (tag: string | null) => void;
  toggleSelectTxn: (id: string) => void;
  toggleSelectAllTxns: () => void;
  handleEditTxn: (txn: Transaction) => void;
  handleDeleteTxn: (id: string) => void;
  handleCategoryChange?: (txn: Transaction, newCatId: string) => void;
  handleExecuteBulkCategoryUpdate?: (selectedTxnIds: Set<string>, categoryId: string) => void;
  setShowBulkDeleteConfirmModal: (v: boolean) => void;
}

export function TransactionList({
  transactions,
  categories,
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
  setShowBulkDeleteConfirmModal
}: TransactionListProps) {
  const isAllSelected = transactions.length > 0 && transactions.every(t => selectedTxnIds.has(t.id));

  const allCategories = useMemo(() => {
    const map = new Map<string, Category>();
    DEFAULT_CATEGORIES.forEach(c => map.set(c.id, c));
    categories.forEach(c => map.set(c.id, c));
    return Array.from(map.values());
  }, [categories]);

  return (
    <div className="glass-card rounded-2xl flex flex-col min-h-[350px] max-h-[600px] h-[55vh]">
      <div className="p-4 border-b border-border/50 flex items-center justify-between bg-card/30 rounded-t-2xl">
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
        
        <div className="flex items-center gap-3">
          {selectedTxnIds.size > 0 && (
            <div className="flex items-center gap-2">
              {handleExecuteBulkCategoryUpdate && (
                <div className="relative flex items-center">
                  <select
                    defaultValue=""
                    onChange={(e) => {
                      if (e.target.value) {
                        handleExecuteBulkCategoryUpdate(selectedTxnIds, e.target.value);
                        e.target.value = '';
                      }
                    }}
                    className="px-3 py-1.5 bg-card/80 border border-border text-foreground hover:bg-card rounded-lg text-xs sm:text-sm font-bold transition-colors cursor-pointer outline-none shadow-sm"
                  >
                    <option value="" disabled className="bg-card text-card-foreground">Set Category ({selectedTxnIds.size})...</option>
                    {allCategories.map(c => (
                      <option key={c.id} value={c.id} className="bg-card text-card-foreground">
                        {c.emoji} {c.name}
                      </option>
                    ))}
                  </select>
                </div>
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
                isLockedMonth={isLockedMonth}
                isSelected={selectedTxnIds.has(txn.id)}
                isDuplicate={duplicateTxnIds.has(txn.id)}
                toggleSelectTxn={toggleSelectTxn}
                handleEditTxn={handleEditTxn}
                handleDeleteTxn={handleDeleteTxn}
                handleCategoryChange={handleCategoryChange}
                setSelectedTagFilter={setSelectedTagFilter}
              />
            ))
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
