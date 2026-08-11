import { useState, useMemo } from 'react';
import { Edit2, Trash2, Plus, X } from 'lucide-react';
import { Transaction, Category, DEFAULT_CATEGORIES } from '../../services/storage';
import { formatTransactionAmount } from '../../utils/formatters';
import { TagInputPopover } from '../common/TagInputPopover';

interface TransactionItemProps {
  transaction: Transaction;
  categories: Category[];
  availableTags?: string[];
  isLockedMonth: boolean;
  isSelected: boolean;
  isDuplicate: boolean;
  toggleSelectTxn: (id: string) => void;
  handleEditTxn: (txn: Transaction) => void;
  handleDeleteTxn: (id: string) => void;
  handleCategoryChange?: (txn: Transaction, newCatId: string, newSubCatId?: string | null) => void;
  setSelectedTagFilter: (tag: string | null) => void;
  handleAddTag?: (txnId: string, tags: string[]) => void;
  handleRemoveTag?: (txnId: string, tag: string) => void;
}

export function TransactionItem({
  transaction,
  categories,
  availableTags = [],
  isLockedMonth,
  isSelected,
  isDuplicate,
  toggleSelectTxn,
  handleEditTxn,
  handleDeleteTxn,
  handleCategoryChange,
  setSelectedTagFilter,
  handleAddTag,
  handleRemoveTag
}: TransactionItemProps) {
  const [showTagPopover, setShowTagPopover] = useState(false);

  const allCategories = useMemo(() => {
    const map = new Map<string, Category>();
    DEFAULT_CATEGORIES.forEach(c => map.set(c.id, c));
    categories.forEach(c => map.set(c.id, c));
    return Array.from(map.values());
  }, [categories]);

  const parentCats = useMemo(() => allCategories.filter(c => !c.parentId), [allCategories]);

  const parentCat = allCategories.find(c => c.id === transaction.category) || allCategories.find(c => c.name.toLowerCase() === transaction.category.toLowerCase());
  const subCat = transaction.subCategory ? allCategories.find(c => c.id === transaction.subCategory) : null;

  const displayCat = subCat || parentCat;
  const activeValue = `${parentCat?.id || 'misc'}|${subCat?.id || ''}`;
  const currentLabels = Array.isArray(transaction.labels) ? transaction.labels : [];

  return (
    <div 
      className={`group flex items-center justify-between p-4 bg-card/40 hover:bg-card/80 border-b border-border/50 last:border-0 transition-all rounded-xl ${
        isSelected ? 'bg-primary/5' : ''
      } ${isDuplicate ? 'bg-destructive/10' : ''}`}
    >
      <div className="flex items-center gap-4 flex-1 min-w-0">
        {!isLockedMonth && (
          <input
            type="checkbox"
            checked={isSelected}
            onChange={() => toggleSelectTxn(transaction.id)}
            className="w-4 h-4 rounded bg-background border-border text-primary focus:ring-primary focus:ring-offset-background cursor-pointer"
          />
        )}
        
        <div 
          className="w-10 h-10 rounded-xl flex items-center justify-center text-lg flex-shrink-0"
          style={{ backgroundColor: `${displayCat?.color || '#38bdf8'}20`, color: displayCat?.color || '#38bdf8' }}
        >
          {displayCat?.emoji || '🏷️'}
        </div>
        
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <h4 className="font-semibold truncate">{transaction.description}</h4>
            {transaction.type === 'transfer' && (
              <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-blue-500/10 text-blue-400 border border-blue-500/20 uppercase tracking-wider flex items-center gap-1">
                ↔️ Transfer
              </span>
            )}
            {isDuplicate && (
              <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-destructive/20 text-destructive uppercase tracking-wider border border-destructive/20">
                Duplicate
              </span>
            )}
          </div>
          <div className="flex items-center gap-2 text-xs text-muted-foreground mt-1 flex-wrap">
            <span>{transaction.date}</span>
            <span className="w-1 h-1 rounded-full bg-border shrink-0" />
            {isLockedMonth ? (
              <span className="truncate" title={subCat ? `${parentCat?.name} > ${subCat.name}` : parentCat?.name}>
                {subCat ? `${parentCat?.emoji || ''} ${parentCat?.name} > ${subCat.emoji} ${subCat.name}` : (parentCat?.name || transaction.category)}
              </span>
            ) : (
              <select
                data-testid={`transaction-category-select-${transaction.id}`}
                value={activeValue}
                onChange={(e) => {
                  if (handleCategoryChange) {
                    const [catId, subId] = e.target.value.split('|');
                    handleCategoryChange(transaction, catId, subId || null);
                  }
                }}
                className="bg-card/80 hover:bg-card border border-border/70 text-foreground rounded px-2 py-0.5 text-xs font-semibold outline-none cursor-pointer transition-colors shadow-sm"
              >
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
            )}

            {/* Tag Pills */}
            <span className="w-1 h-1 rounded-full bg-border shrink-0" />
            <div className="flex items-center gap-1 flex-wrap">
              {currentLabels.map((lbl, idx) => (
                <div key={idx} className="group/tag inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-secondary/10 text-secondary text-[10px] uppercase font-bold tracking-wider border border-secondary/20 transition-colors">
                  <button 
                    type="button"
                    onClick={(e) => { e.stopPropagation(); setSelectedTagFilter(lbl); }}
                    className="hover:underline"
                  >
                    {lbl}
                  </button>
                  {!isLockedMonth && handleRemoveTag && (
                    <button
                      type="button"
                      aria-label={`Remove tag ${lbl}`}
                      data-testid={`delete-tag-${lbl}-${transaction.id}`}
                      onClick={(e) => {
                        e.stopPropagation();
                        handleRemoveTag(transaction.id, lbl);
                      }}
                      className="text-secondary/70 hover:text-destructive transition-colors p-0.5"
                    >
                      <X className="w-2.5 h-2.5" />
                    </button>
                  )}
                </div>
              ))}

              {!isLockedMonth && handleAddTag && (
                <div className="relative inline-block">
                  <button
                    type="button"
                    data-testid={`add-tag-btn-${transaction.id}`}
                    onClick={(e) => {
                      e.stopPropagation();
                      setShowTagPopover(prev => !prev);
                    }}
                    className="px-1.5 py-0.5 rounded bg-secondary/10 hover:bg-secondary/20 text-secondary text-[10px] font-bold uppercase tracking-wider transition-colors flex items-center gap-0.5 border border-secondary/20"
                  >
                    <Plus className="w-2.5 h-2.5" /> Tag
                  </button>
                  {showTagPopover && (
                    <TagInputPopover
                      availableTags={availableTags}
                      existingTags={currentLabels}
                      onAddTag={(tags) => handleAddTag(transaction.id, tags)}
                      onClose={() => setShowTagPopover(false)}
                    />
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
      
      <div className="flex items-center gap-4 pl-4 flex-shrink-0">
        {(() => {
          const { formattedAmount, colorClass } = formatTransactionAmount(transaction.amount, transaction.type);
          const bucket = transaction.spendingBucket;
          const dotColor = bucket === 'fixed' ? 'bg-blue-500' : bucket === 'non-monthly' ? 'bg-amber-500' : bucket === 'flexible' ? 'bg-emerald-500' : null;
          const bucketLabel = bucket === 'fixed' ? 'Fixed Expense' : bucket === 'non-monthly' ? 'Non-Monthly Expense' : bucket === 'flexible' ? 'Flexible Expense' : null;

          return (
            <div className="flex items-center gap-2">
              {dotColor && transaction.type === 'expense' && (
                <span 
                  className={`w-2.5 h-2.5 rounded-full ${dotColor} shrink-0`} 
                  title={bucketLabel || ''} 
                  data-testid={`bucket-dot-${transaction.id}-${bucket}`}
                />
              )}
              <div className={`font-bold tabular-nums text-right ${colorClass}`}>
                {formattedAmount}
              </div>
            </div>
          );
        })()}
        
        {!isLockedMonth && (
          <div className="flex items-center gap-1 opacity-100 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity">
            <button 
              onClick={() => handleEditTxn(transaction)}
              data-testid={`edit-transaction-btn-${transaction.id}`}
              className="p-2 hover:bg-card rounded-lg text-muted-foreground hover:text-foreground transition-colors"
            >
              <Edit2 className="w-4 h-4" />
            </button>
            <button 
              onClick={() => handleDeleteTxn(transaction.id)}
              data-testid={`delete-transaction-btn-${transaction.id}`}
              className="p-2 hover:bg-destructive/10 rounded-lg text-muted-foreground hover:text-destructive transition-colors"
            >
              <Trash2 className="w-4 h-4" />
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
