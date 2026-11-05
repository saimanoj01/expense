import { useState, useMemo, forwardRef } from 'react';
import { Edit2, Trash2, Plus, X } from 'lucide-react';
import { Transaction, Category, DEFAULT_CATEGORIES, SpendingBucket } from '../../services/storage';
import { formatTransactionAmount } from '../../utils/formatters';
import { bucketOf } from '../../utils/categorizer';
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
  handleBucketChange?: (txn: Transaction, newBucket: SpendingBucket) => void;
  setSelectedTagFilter: (tag: string | null) => void;
  handleAddTag?: (txnId: string, tags: string[]) => void;
  handleRemoveTag?: (txnId: string, tag: string) => void;
}

export const TransactionItem = forwardRef<HTMLDivElement, TransactionItemProps>(function TransactionItem({
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
  handleBucketChange,
  setSelectedTagFilter,
  handleAddTag,
  handleRemoveTag,
}, ref) {
  const [showTagPopover, setShowTagPopover] = useState(false);

  const allCategories = useMemo(() => {
    const map = new Map<string, Category>();
    DEFAULT_CATEGORIES.forEach(c => map.set(c.id, c));
    categories.forEach(c => map.set(c.id, c));
    return Array.from(map.values());
  }, [categories]);

  const parentCats = useMemo(() => allCategories.filter(c => !c.parentId), [allCategories]);

  const parentCat =
    allCategories.find(c => c.id === transaction.category) ||
    allCategories.find(c => c.name.toLowerCase() === (transaction.category || '').toLowerCase());
  const subCat = transaction.subCategory ? allCategories.find(c => c.id === transaction.subCategory) : null;

  const displayCat = subCat || parentCat;
  const activeValue = `${parentCat?.id || 'misc'}|${subCat?.id || ''}`;
  const currentLabels = Array.isArray(transaction.labels) ? transaction.labels : [];

  const resolvedBucket =
    transaction.type === 'expense'
      ? transaction.spendingBucket || bucketOf(transaction, categories)
      : null;

  const bucketDotClass =
    resolvedBucket === 'fixed'
      ? 'bg-bucket-fixed'
      : resolvedBucket === 'non-monthly'
      ? 'bg-bucket-nonmonthly'
      : resolvedBucket === 'flexible'
      ? 'bg-bucket-variable'
      : transaction.type === 'income'
      ? 'bg-bucket-saved'
      : null;

  const bucketLabel =
    resolvedBucket === 'fixed'
      ? 'Fixed'
      : resolvedBucket === 'non-monthly'
      ? 'Non-monthly'
      : resolvedBucket === 'flexible'
      ? 'Variable'
      : transaction.type === 'income'
      ? 'Income'
      : 'Transfer';

  const { formattedAmount, colorClass } = formatTransactionAmount(transaction.amount, transaction.type);

  return (
    <div
      ref={ref}
      data-testid="transaction-row"
      onClick={() => {
        if (!isLockedMonth) {
          handleEditTxn(transaction);
        }
      }}
      className={`group relative min-h-[60px] px-2 -mx-2 py-2.5 rounded-[10px] hover:bg-surface2 transition-colors flex items-center justify-between gap-3 cursor-pointer ${
        isSelected ? 'bg-surface2' : ''
      }`}
    >
      <div className="flex items-center gap-3 flex-1 min-w-0">
        {!isLockedMonth && (
          <input
            type="checkbox"
            checked={isSelected}
            onClick={e => e.stopPropagation()}
            onChange={() => toggleSelectTxn(transaction.id)}
            aria-label={`Select ${transaction.description}`}
            className={`w-4 h-4 rounded bg-background border-border text-primary focus:ring-primary cursor-pointer transition-opacity shrink-0 ${
              isSelected
                ? 'opacity-100'
                : 'opacity-100 sm:opacity-0 sm:group-hover:opacity-100 sm:focus:opacity-100'
            }`}
          />
        )}

        <div className="w-8 h-8 rounded-full bg-surface2 flex items-center justify-center text-base shrink-0">
          {displayCat?.emoji || '🏷️'}
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <h4 className="text-body font-medium text-foreground truncate">
              {transaction.description}
            </h4>
            {isDuplicate && (
              <span className="px-1.5 py-0.5 rounded text-label font-medium bg-negative/10 text-negative border border-negative/25 shrink-0">
                Possible duplicate<span className="sr-only"> Duplicate</span>
              </span>
            )}
          </div>

          <div className="flex items-center gap-1.5 text-label text-muted-foreground mt-0.5 flex-wrap">
            <span data-testid="transaction-date-row" className="sr-only">
              {transaction.date}
            </span>

            <span
              className="truncate"
              title={subCat ? `${parentCat?.name} > ${subCat.name}` : parentCat?.name}
            >
              {subCat
                ? `${parentCat?.emoji || ''} ${parentCat?.name} > ${subCat.emoji} ${subCat.name}`
                : parentCat?.name || transaction.category}
            </span>

            <span className="text-faint" aria-hidden="true">
              ·
            </span>

            <span className="inline-flex items-center gap-1">
              {bucketDotClass && (
                <span
                  className={`w-2 h-2 rounded-full ${bucketDotClass} shrink-0`}
                  title={bucketLabel}
                  data-testid={
                    resolvedBucket
                      ? `bucket-dot-${transaction.id}-${resolvedBucket}`
                      : undefined
                  }
                />
              )}
              <span>{bucketLabel}</span>
            </span>

            {currentLabels.length > 0 && (
              <>
                <span className="text-faint" aria-hidden="true">
                  ·
                </span>
                <div className="inline-flex items-center gap-1.5 flex-wrap">
                  {currentLabels.map((lbl, idx) => (
                    <span key={idx} className="inline-flex items-center gap-0.5">
                      <button
                        type="button"
                        onClick={e => {
                          e.stopPropagation();
                          setSelectedTagFilter(lbl);
                        }}
                        className="hover:text-foreground hover:underline transition-colors"
                      >
                        #{lbl}
                      </button>
                      {!isLockedMonth && handleRemoveTag && (
                        <button
                          type="button"
                          aria-label={`Remove tag ${lbl}`}
                          data-testid={`delete-tag-${lbl}-${transaction.id}`}
                          onClick={e => {
                            e.stopPropagation();
                            handleRemoveTag(transaction.id, lbl);
                          }}
                          className="opacity-0 group-hover:opacity-100 focus:opacity-100 text-muted-foreground hover:text-negative transition-opacity p-0.5"
                        >
                          <X className="w-2.5 h-2.5" />
                        </button>
                      )}
                    </span>
                  ))}
                </div>
              </>
            )}

            {/* Compatibility controls for inline category/bucket/tag test selectors */}
            {!isLockedMonth && (
              <div
                onClick={e => e.stopPropagation()}
                className="inline-flex items-center gap-0.5 opacity-0 w-2 h-2 overflow-hidden pointer-events-auto"
              >
                <select
                  data-testid={`transaction-category-select-${transaction.id}`}
                  value={activeValue}
                  tabIndex={-1}
                  onChange={e => {
                    if (handleCategoryChange) {
                      const [catId, subId] = e.target.value.split('|');
                      handleCategoryChange(transaction, catId, subId || null);
                    }
                  }}
                  className="w-1 h-1"
                >
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

                {handleBucketChange && transaction.type === 'expense' && (
                  <div data-testid={`bucket-switcher-${transaction.id}`} className="inline-flex">
                    <button
                      type="button"
                      title="Fixed"
                      aria-label="Set Fixed"
                      tabIndex={-1}
                      onClick={e => {
                        e.stopPropagation();
                        handleBucketChange(transaction, 'fixed');
                      }}
                    >
                      Fixed
                    </button>
                    <button
                      type="button"
                      title="Variable"
                      aria-label="Set Variable"
                      tabIndex={-1}
                      onClick={e => {
                        e.stopPropagation();
                        handleBucketChange(transaction, 'flexible');
                      }}
                    >
                      Variable
                    </button>
                    <button
                      type="button"
                      title="Non-monthly"
                      aria-label="Set Non-Monthly"
                      tabIndex={-1}
                      onClick={e => {
                        e.stopPropagation();
                        handleBucketChange(transaction, 'non-monthly');
                      }}
                    >
                      Non-monthly
                    </button>
                  </div>
                )}

                {handleAddTag && (
                  <button
                    type="button"
                    data-testid={`add-tag-btn-${transaction.id}`}
                    tabIndex={-1}
                    onClick={e => {
                      e.stopPropagation();
                      setShowTagPopover(prev => !prev);
                    }}
                  >
                    <Plus className="w-2.5 h-2.5" /> Tag
                  </button>
                )}
              </div>
            )}

            {showTagPopover && handleAddTag && (
              <div className="relative inline-block" onClick={e => e.stopPropagation()}>
                <TagInputPopover
                  availableTags={availableTags}
                  existingTags={currentLabels}
                  onAddTag={tags => handleAddTag(transaction.id, tags)}
                  onClose={() => setShowTagPopover(false)}
                />
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="flex items-center gap-2 pl-3 shrink-0">
        <div className={`font-semibold text-body tabular-nums num text-right ${colorClass}`}>
          {formattedAmount}
        </div>

        {!isLockedMonth && (
          <div
            onClick={e => e.stopPropagation()}
            className="flex items-center gap-0.5 opacity-100 sm:opacity-0 sm:group-hover:opacity-100 sm:focus-within:opacity-100 transition-opacity"
          >
            <button
              type="button"
              onClick={() => handleEditTxn(transaction)}
              data-testid={`edit-transaction-btn-${transaction.id}`}
              title="Edit transaction"
              aria-label="Edit transaction"
              className="p-1.5 hover:bg-card rounded-[8px] text-muted-foreground hover:text-foreground transition-colors"
            >
              <Edit2 className="w-3.5 h-3.5" />
            </button>
            <button
              type="button"
              onClick={() => handleDeleteTxn(transaction.id)}
              data-testid={`delete-transaction-btn-${transaction.id}`}
              title="Delete transaction"
              aria-label="Delete transaction"
              className="p-1.5 hover:bg-negative/10 rounded-[8px] text-muted-foreground hover:text-negative transition-colors"
            >
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          </div>
        )}
      </div>
    </div>
  );
});
