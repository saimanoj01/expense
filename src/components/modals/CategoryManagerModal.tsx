import React, { useState, useMemo } from 'react';
import {
  X,
  Plus,
  Edit2,
  Trash2,
  Save,
  ChevronDown,
  ChevronRight,
  FolderTree,
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { Modal } from '../common/Modal';
import {
  Category,
  Transaction,
  SpendingBucket,
  MonthlyLock,
} from '../../services/storage';
import { doesBudgetMatchCategory, getCategoryAliasOptions } from '../../utils/metrics';
import { sanitizeCategoryHexColor, toSoftBadgeBg } from '../../utils/budgetPlanning';
import { isTransactionMonthLocked } from '../../utils/transactionTaxonomy';

export interface CategoryManagerModalProps {
  showModal: boolean;
  setShowModal: (v: boolean) => void;
  categories: Category[];
  transactions: Transaction[];
  locks?: MonthlyLock[];
  handleSaveCategory: (cat: Category, isEdit: boolean) => Promise<boolean>;
  handleDeleteCategory?: (catId: string) => Promise<void>;
  handleExecuteBulkCategoryUpdate?: (
    selectedTxnIds: Set<string>,
    categoryId: string,
    subCategoryId?: string | null
  ) => Promise<void> | void;
}

export function CategoryManagerModal({
  showModal,
  setShowModal,
  categories,
  transactions,
  locks = [],
  handleSaveCategory,
  handleDeleteCategory,
  handleExecuteBulkCategoryUpdate,
}: CategoryManagerModalProps) {
  const [expandedParents, setExpandedParents] = useState<Set<string>>(new Set());
  const [isAddingParent, setIsAddingParent] = useState(true);
  const [addingSubParentId, setAddingSubParentId] = useState<string | null>(null);
  const [editingCategory, setEditingCategory] = useState<Category | null>(null);
  const [confirmingDeleteId, setConfirmingDeleteId] = useState<string | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  // Form states
  const [catName, setCatName] = useState('');
  const [catEmoji, setCatEmoji] = useState('📦');
  const [catColor, setCatColor] = useState('#38bdf8');
  const [catDefaultBucket, setCatDefaultBucket] = useState<SpendingBucket | ''>('');
  const [error, setError] = useState<string | null>(null);

  const aliasOpts = useMemo(() => getCategoryAliasOptions(categories), [categories]);

  if (!showModal) return null;

  const parentCategories = categories.filter(c => !c.parentId);

  const toggleExpand = (id: string) => {
    setExpandedParents(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const resetForm = () => {
    setCatName('');
    setCatEmoji('📦');
    setCatColor('#38bdf8');
    setCatDefaultBucket('');
    setError(null);
    setIsAddingParent(false);
    setAddingSubParentId(null);
    setEditingCategory(null);
  };

  const handleStartAddParent = () => {
    resetForm();
    setConfirmingDeleteId(null);
    setIsAddingParent(true);
  };

  const handleStartAddSub = (parentId: string) => {
    resetForm();
    setConfirmingDeleteId(null);
    setAddingSubParentId(parentId);
    const parent = categories.find(c => c.id === parentId);
    if (parent) {
      setCatColor(sanitizeCategoryHexColor(parent.color));
      if (parent.defaultBucket) setCatDefaultBucket(parent.defaultBucket);
    }
  };

  const handleStartEdit = (cat: Category) => {
    resetForm();
    setConfirmingDeleteId(null);
    setEditingCategory(cat);
    setCatName(cat.name);
    setCatEmoji(cat.emoji);
    setCatColor(sanitizeCategoryHexColor(cat.color));
    setCatDefaultBucket(cat.defaultBucket || '');
  };

  const handleSubmitForm = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!catName.trim()) {
      setError('Category name is required');
      return;
    }

    const slug = catName
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]/g, '-');
    const parentId = addingSubParentId || editingCategory?.parentId || null;
    const catId = editingCategory
      ? editingCategory.id
      : parentId
      ? `${parentId}-${slug}`
      : slug;

    if (!editingCategory) {
      const isDup = categories.some(
        c => c.id === catId || c.name.toLowerCase() === catName.trim().toLowerCase()
      );
      if (isDup) {
        setError('Category already exists');
        return;
      }
    }

    const categoryToSave: Category = {
      id: catId,
      name: catName.trim(),
      emoji: catEmoji || '📦',
      color: sanitizeCategoryHexColor(catColor),
      parentId,
      defaultBucket: catDefaultBucket ? (catDefaultBucket as SpendingBucket) : undefined,
    };

    const success = await handleSaveCategory(categoryToSave, Boolean(editingCategory));
    if (success) {
      if (parentId) setExpandedParents(prev => new Set(prev).add(parentId));
      resetForm();
    }
  };

  const computeDeleteImpact = (cat: Category) => {
    const affected = transactions.filter(t => {
      if (cat.parentId) {
        return (
          (t.subCategory || '').toLowerCase() === cat.id.toLowerCase() ||
          (t.subCategory || '').toLowerCase() === cat.name.toLowerCase()
        );
      }
      return doesBudgetMatchCategory(t.category, cat, aliasOpts);
    });
    const unlocked = affected.filter(t => !isTransactionMonthLocked(t.date, locks));
    const locked = affected.filter(t => isTransactionMonthLocked(t.date, locks));
    return { affected, unlocked, locked };
  };

  const handleConfirmDelete = async (cat: Category) => {
    if (isDeleting) return;
    setIsDeleting(true);
    try {
      const { unlocked } = computeDeleteImpact(cat);
      if (unlocked.length > 0 && handleExecuteBulkCategoryUpdate) {
        const targetTxnIds = new Set(unlocked.map(t => t.id));
        const targetCategoryId = cat.parentId ? cat.parentId : 'misc';
        await handleExecuteBulkCategoryUpdate(targetTxnIds, targetCategoryId, null);
      }
      if (handleDeleteCategory) {
        await handleDeleteCategory(cat.id);
      }
      setConfirmingDeleteId(null);
    } finally {
      setIsDeleting(false);
    }
  };

  const renderDeleteConfirmBanner = (cat: Category) => {
    const { affected, unlocked, locked } = computeDeleteImpact(cat);
    const fallbackName = cat.parentId
      ? categories.find(p => p.id === cat.parentId)?.name || 'parent category'
      : 'Miscellaneous';

    return (
      <div
        data-testid={`confirm-delete-category-${cat.id}`}
        className="mt-2 p-2.5 rounded-[10px] bg-negative/10 border border-negative/30 flex flex-wrap items-center justify-between gap-2 text-xs"
      >
        <span className="text-foreground font-medium">
          {affected.length === 0
            ? `Delete "${cat.name}"?`
            : `Delete "${cat.name}"? Reassigns ${unlocked.length} unlocked txn${
                unlocked.length === 1 ? '' : 's'
              } to ${fallbackName}${
                locked.length > 0
                  ? ` (${locked.length} locked-month txn${
                      locked.length === 1 ? '' : 's'
                    } preserved)`
                  : ''
              }.`}
        </span>
        <div className="flex items-center gap-1.5 ml-auto">
          <button
            type="button"
            data-testid={`cancel-delete-category-btn-${cat.id}`}
            onClick={() => setConfirmingDeleteId(null)}
            disabled={isDeleting}
            className="min-h-[32px] px-2.5 rounded-[8px] bg-card border border-border text-muted-foreground hover:text-foreground font-medium transition-colors"
          >
            Cancel
          </button>
          <button
            type="button"
            data-testid={`confirm-delete-category-btn-${cat.id}`}
            onClick={() => void handleConfirmDelete(cat)}
            disabled={isDeleting}
            className="min-h-[32px] px-3 rounded-[8px] bg-negative text-white hover:opacity-90 font-semibold transition-opacity"
          >
            Confirm Delete
          </button>
        </div>
      </div>
    );
  };

  const visibleSubmitLabel = editingCategory
    ? 'Save Category'
    : addingSubParentId
    ? 'Add Sub-Category'
    : 'Add Category';

  return (
    <Modal
      isOpen={showModal}
      onClose={() => setShowModal(false)}
      dataTestId="category-manager-modal"
      title="Category & Sub-Category Manager"
      maxWidth="max-w-2xl"
      className="max-h-[85vh] flex flex-col !p-4 sm:!p-5"
    >
      {/* Compact Header */}
      <div className="flex items-center justify-between gap-3 pb-2.5 border-b border-border shrink-0">
        <div className="flex items-center gap-2.5 min-w-0">
          <div className="w-8 h-8 rounded-[10px] bg-surface2 border border-border flex items-center justify-center text-foreground shrink-0">
            <FolderTree className="w-4 h-4" />
          </div>
          <div className="min-w-0">
            <h2 className="text-heading font-semibold text-foreground truncate">
              Categories & Sub-Categories
            </h2>
            <p className="text-[11px] leading-4 text-muted-foreground truncate">
              Shared taxonomy across budgets, transactions, and CSV imports
            </p>
          </div>
        </div>
        <button
          type="button"
          aria-label="Close Category Manager"
          onClick={() => setShowModal(false)}
          className="min-h-[32px] min-w-[32px] rounded-[8px] hover:bg-surface2 text-muted-foreground hover:text-foreground flex items-center justify-center transition-colors focus-visible:ring-2 ring-ring/40 shrink-0"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* Compact 2-Row Form (Open by default for immediate typing; condensed height exposes 6-8 rows on mobile) */}
      <AnimatePresence initial={false}>
        {(isAddingParent || addingSubParentId || editingCategory) && (
          <motion.form
            key="category-editor-form"
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.16 }}
            onSubmit={handleSubmitForm}
            className="mt-2.5 p-2.5 rounded-[12px] bg-surface2/70 border border-border space-y-2 shrink-0"
          >
            <div className="flex items-center justify-between gap-2">
              <span className="text-label font-semibold text-foreground truncate">
                {editingCategory
                  ? `Edit "${editingCategory.name}"`
                  : addingSubParentId
                  ? `New Sub-Category under "${
                      categories.find(c => c.id === addingSubParentId)?.name || 'Parent'
                    }"`
                  : 'New Category'}
              </span>
              <button
                type="button"
                onClick={resetForm}
                className="min-h-[32px] px-2.5 rounded-[6px] text-label text-muted-foreground hover:text-foreground hover:bg-card transition-colors"
              >
                Cancel
              </button>
            </div>

            {error && (
              <p
                data-testid="category-modal-error"
                className="text-label text-negative font-semibold"
              >
                {error}
              </p>
            )}

            {/* Row 1: Name + Emoji + Color */}
            <div className="grid grid-cols-12 gap-2">
              <div className="col-span-7">
                <input
                  type="text"
                  required
                  aria-label="Category Name"
                  data-testid={
                    editingCategory
                      ? 'edit-category-name-input'
                      : 'new-category-name-input'
                  }
                  value={catName}
                  onChange={e => setCatName(e.target.value)}
                  className="w-full h-8 bg-background border border-border rounded-[8px] px-2.5 text-xs font-medium text-foreground placeholder:text-muted-foreground focus:border-foreground outline-none"
                  placeholder="e.g. Subscriptions"
                />
              </div>
              <div className="col-span-2">
                <input
                  type="text"
                  maxLength={2}
                  aria-label="Category Emoji"
                  data-testid={
                    editingCategory
                      ? 'edit-category-emoji-input'
                      : 'new-category-emoji-input'
                  }
                  value={catEmoji}
                  onChange={e => setCatEmoji(e.target.value)}
                  className="w-full h-8 bg-background border border-border rounded-[8px] px-1 text-center text-sm focus:border-foreground outline-none"
                />
              </div>
              <div className="col-span-3">
                <input
                  type="color"
                  aria-label="Category Color"
                  data-testid={
                    editingCategory
                      ? 'edit-category-color-input'
                      : 'new-category-color-input'
                  }
                  value={catColor}
                  onChange={e => setCatColor(e.target.value)}
                  className="w-full h-8 bg-background border border-border rounded-[8px] p-0.5 cursor-pointer outline-none"
                />
              </div>
            </div>

            {/* Row 2: Parent Select + Default Bucket Select + Submit */}
            <div className="grid grid-cols-1 sm:grid-cols-12 gap-2 items-center">
              <div className="grid grid-cols-2 gap-2 sm:col-span-8">
                <select
                  aria-label="Parent Category"
                  data-testid="new-category-parent-select"
                  value={addingSubParentId || ''}
                  onChange={e => setAddingSubParentId(e.target.value || null)}
                  className="w-full h-8 bg-background border border-border rounded-[8px] px-2 text-xs font-medium text-foreground outline-none cursor-pointer"
                >
                  <option value="">Top-Level Parent</option>
                  {parentCategories.map(p => (
                    <option key={p.id} value={p.id}>
                      {p.emoji} {p.name}
                    </option>
                  ))}
                </select>

                <select
                  aria-label="Default Spending Bucket"
                  data-testid="category-default-bucket-select"
                  value={catDefaultBucket}
                  onChange={e => setCatDefaultBucket(e.target.value as SpendingBucket | '')}
                  className="w-full h-8 bg-background border border-border rounded-[8px] px-2 text-xs font-medium text-foreground outline-none cursor-pointer"
                >
                  <option value="">Auto bucket</option>
                  <option value="fixed">Fixed Commitment</option>
                  <option value="flexible">Variable (Flexible)</option>
                  <option value="non-monthly">Non-Monthly</option>
                </select>
              </div>

              <div className="sm:col-span-4 flex justify-end">
                <button
                  type="submit"
                  aria-label="Add Category / Save Category"
                  data-testid={
                    editingCategory ? 'save-edited-category-btn' : 'save-category-btn'
                  }
                  className="w-full sm:w-auto min-h-[32px] px-3.5 rounded-[8px] bg-primary hover:bg-primary/90 text-primary-foreground font-semibold text-xs flex items-center justify-center gap-1.5 transition-colors focus-visible:ring-2 ring-ring/40"
                >
                  <Save className="w-3.5 h-3.5" />
                  <span>{visibleSubmitLabel}</span>
                </button>
              </div>
            </div>
          </motion.form>
        )}
      </AnimatePresence>

      {/* Toolbar */}
      <div className="flex items-center justify-between gap-2 py-2 shrink-0">
        <span className="text-label text-muted-foreground tabular-nums num">
          {parentCategories.length} parents · {categories.length - parentCategories.length}{' '}
          sub-categories
        </span>
        <button
          type="button"
          onClick={handleStartAddParent}
          className="min-h-[32px] inline-flex items-center gap-1 text-xs font-semibold px-2.5 rounded-[8px] bg-surface2 hover:bg-secondary text-foreground border border-border transition-colors focus-visible:ring-2 ring-ring/40"
        >
          <Plus className="w-3.5 h-3.5" />
          <span>Parent Category</span>
        </button>
      </div>

      {/* Category Tree List */}
      <div className="flex-1 overflow-y-auto custom-scrollbar space-y-1.5 pr-0.5 min-h-0">
        {parentCategories.map(parent => {
          const subs = categories.filter(c => c.parentId === parent.id);
          const isExpanded = expandedParents.has(parent.id);
          const editBtnKey = parent.id === 'food' ? 'Food' : parent.name || parent.id;

          return (
            <div
              key={parent.id}
              className="bg-card hover:bg-surface2/30 px-2.5 py-1.5 rounded-[10px] border border-border transition-colors"
            >
              <div className="flex items-center justify-between gap-2">
                <button
                  type="button"
                  aria-expanded={isExpanded}
                  aria-label={`${isExpanded ? 'Collapse' : 'Expand'} ${parent.name}`}
                  onClick={() => toggleExpand(parent.id)}
                  className="min-h-[32px] flex items-center gap-2 text-left min-w-0 flex-1 rounded-[6px] focus-visible:ring-2 ring-ring/40 outline-none"
                >
                  <span className="text-muted-foreground shrink-0">
                    {isExpanded ? (
                      <ChevronDown className="w-4 h-4" />
                    ) : (
                      <ChevronRight className="w-4 h-4" />
                    )}
                  </span>
                  <span
                    className="w-7 h-7 rounded-[8px] flex items-center justify-center text-sm shrink-0 border border-border/50"
                    style={{ backgroundColor: toSoftBadgeBg(parent.color) }}
                  >
                    {parent.emoji}
                  </span>
                  <span className="font-medium text-body text-foreground truncate">
                    {parent.name}
                  </span>
                  <span className="text-[11px] leading-4 px-1.5 py-0.5 rounded-full bg-surface2 border border-border text-muted-foreground font-medium whitespace-nowrap shrink-0 tabular-nums num">
                    {subs.length} sub
                  </span>
                </button>

                <div className="flex items-center gap-1 shrink-0">
                  <button
                    type="button"
                    onClick={() => handleStartAddSub(parent.id)}
                    title={`Add Sub-Category to ${parent.name}`}
                    className="min-h-[32px] px-2 rounded-[8px] bg-surface2 hover:bg-secondary text-muted-foreground hover:text-foreground text-xs font-medium border border-border inline-flex items-center gap-1 transition-colors focus-visible:ring-2 ring-ring/40"
                  >
                    <Plus className="w-3 h-3" />
                    <span>Sub</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => handleStartEdit(parent)}
                    data-testid={`edit-category-${editBtnKey}-btn`}
                    aria-label={`Edit ${parent.name}`}
                    title="Edit Category"
                    className="min-h-[32px] min-w-[32px] rounded-[8px] hover:bg-surface2 text-muted-foreground hover:text-foreground inline-flex items-center justify-center transition-colors focus-visible:ring-2 ring-ring/40"
                  >
                    <Edit2 className="w-3.5 h-3.5" />
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      setConfirmingDeleteId(prev =>
                        prev === parent.id ? null : parent.id
                      )
                    }
                    data-testid={`delete-category-${parent.id}-btn`}
                    aria-label={`Delete ${parent.name}`}
                    title="Delete Category"
                    className="min-h-[32px] min-w-[32px] rounded-[8px] hover:bg-negative/10 text-muted-foreground hover:text-negative inline-flex items-center justify-center transition-colors focus-visible:ring-2 ring-ring/40"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>

              {confirmingDeleteId === parent.id && renderDeleteConfirmBanner(parent)}

              {/* Sub-categories */}
              <AnimatePresence initial={false}>
                {isExpanded && (
                  <motion.div
                    key={`subs-${parent.id}`}
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: 'auto' }}
                    exit={{ opacity: 0, height: 0 }}
                    transition={{ duration: 0.16 }}
                    className="mt-1.5 pt-1.5 pl-6 border-l border-border space-y-1"
                  >
                    {subs.length > 0 ? (
                      subs.map(sub => (
                        <div key={sub.id} className="space-y-1">
                          <div className="flex items-center justify-between gap-2 px-2 py-1 rounded-[8px] bg-surface2/50 border border-border/50 text-xs">
                            <span className="font-medium text-foreground flex items-center gap-2 min-w-0 truncate">
                              <span className="shrink-0">{sub.emoji}</span>
                              <span className="truncate">{sub.name}</span>
                            </span>
                            <div className="flex items-center gap-1 shrink-0">
                              <button
                                type="button"
                                onClick={() => handleStartEdit(sub)}
                                data-testid={`edit-category-${sub.id}-btn`}
                                aria-label={`Edit ${sub.name}`}
                                className="min-h-[32px] min-w-[32px] rounded-[6px] hover:bg-card text-muted-foreground hover:text-foreground inline-flex items-center justify-center transition-colors"
                              >
                                <Edit2 className="w-3 h-3" />
                              </button>
                              <button
                                type="button"
                                onClick={() =>
                                  setConfirmingDeleteId(prev =>
                                    prev === sub.id ? null : sub.id
                                  )
                                }
                                data-testid={`delete-category-${sub.id}-btn`}
                                aria-label={`Delete ${sub.name}`}
                                className="min-h-[32px] min-w-[32px] rounded-[6px] hover:bg-negative/10 text-muted-foreground hover:text-negative inline-flex items-center justify-center transition-colors"
                              >
                                <Trash2 className="w-3 h-3" />
                              </button>
                            </div>
                          </div>
                          {confirmingDeleteId === sub.id && renderDeleteConfirmBanner(sub)}
                        </div>
                      ))
                    ) : (
                      <div className="text-[11px] text-muted-foreground py-1">
                        No sub-categories yet
                      </div>
                    )}
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          );
        })}
      </div>
    </Modal>
  );
}
