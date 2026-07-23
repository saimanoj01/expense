import React, { useState } from 'react';
import { X, Plus, Edit2, Trash2, Save, ChevronDown, ChevronRight, Sparkles } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { Category, Transaction } from '../../services/storage';

interface CategoryManagerModalProps {
  showModal: boolean;
  setShowModal: (v: boolean) => void;
  categories: Category[];
  transactions: Transaction[];
  handleSaveCategory: (cat: Category, isEdit: boolean) => Promise<boolean>;
  handleDeleteCategory?: (catId: string) => Promise<void>;
  handleExecuteBulkCategoryUpdate?: (selectedTxnIds: Set<string>, categoryId: string, subCategoryId?: string | null) => void;
}

export function CategoryManagerModal({
  showModal,
  setShowModal,
  categories,
  transactions,
  handleSaveCategory,
  handleDeleteCategory,
  handleExecuteBulkCategoryUpdate
}: CategoryManagerModalProps) {
  const [expandedParents, setExpandedParents] = useState<Set<string>>(new Set());
  const [isAddingParent, setIsAddingParent] = useState(false);
  const [addingSubParentId, setAddingSubParentId] = useState<string | null>(null);
  const [editingCategory, setEditingCategory] = useState<Category | null>(null);

  // Form states
  const [catName, setCatName] = useState('');
  const [catEmoji, setCatEmoji] = useState('📦');
  const [catColor, setCatColor] = useState('#38bdf8');
  const [error, setError] = useState<string | null>(null);

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
    setError(null);
    setIsAddingParent(false);
    setAddingSubParentId(null);
    setEditingCategory(null);
  };

  const handleStartAddParent = () => {
    resetForm();
    setIsAddingParent(true);
  };

  const handleStartAddSub = (parentId: string) => {
    resetForm();
    setAddingSubParentId(parentId);
    // Inherit parent color default
    const parent = categories.find(c => c.id === parentId);
    if (parent) setCatColor(parent.color);
  };

  const handleStartEdit = (cat: Category) => {
    resetForm();
    setEditingCategory(cat);
    setCatName(cat.name);
    setCatEmoji(cat.emoji);
    setCatColor(cat.color);
  };

  const handleSubmitForm = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!catName.trim()) {
      setError('Category name is required');
      return;
    }

    const slug = catName.trim().toLowerCase().replace(/[^a-z0-9]/g, '-');
    const parentId = addingSubParentId || editingCategory?.parentId || null;
    const catId = editingCategory ? editingCategory.id : (parentId ? `${parentId}-${slug}` : slug);

    // Duplicate check on creation
    if (!editingCategory) {
      const isDup = categories.some(c => c.id === catId || c.name.toLowerCase() === catName.trim().toLowerCase());
      if (isDup) {
        setError('A category with this name already exists');
        return;
      }
    }

    const categoryToSave: Category = {
      id: catId,
      name: catName.trim(),
      emoji: catEmoji || '📦',
      color: /^#[0-9A-Fa-f]{6}$/i.test(catColor) ? catColor : '#38bdf8',
      parentId
    };

    const success = await handleSaveCategory(categoryToSave, !!editingCategory);
    if (success) {
      if (parentId) setExpandedParents(prev => new Set(prev).add(parentId));
      resetForm();
    }
  };

  const handleDelete = async (cat: Category) => {
    if (!confirm(`Are you sure you want to delete "${cat.emoji} ${cat.name}"?`)) return;

    // Re-assign transactions
    const affectedTxns = transactions.filter(t => 
      cat.parentId ? t.subCategory === cat.id : t.category === cat.id
    );

    if (affectedTxns.length > 0 && handleExecuteBulkCategoryUpdate) {
      const targetTxnIds = new Set(affectedTxns.map(t => t.id));
      if (cat.parentId) {
        // Sub-category deleted -> re-assign to parent category
        handleExecuteBulkCategoryUpdate(targetTxnIds, cat.parentId, null);
      } else {
        // Parent category deleted -> re-assign to misc
        handleExecuteBulkCategoryUpdate(targetTxnIds, 'misc', null);
      }
    }

    if (handleDeleteCategory) {
      await handleDeleteCategory(cat.id);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-background/80 backdrop-blur-sm" data-testid="category-manager-modal">
      <motion.div 
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.95 }}
        className="glass-card w-full max-w-2xl max-h-[85vh] flex flex-col p-6 rounded-2xl shadow-2xl border border-border"
      >
        {/* Header */}
        <div className="flex items-center justify-between pb-4 border-b border-border/50">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-xl bg-primary/10 text-primary">
              <Sparkles className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-xl font-bold">Category & Sub-Category Manager</h2>
              <p className="text-xs text-muted-foreground">Manage unified categories used across budgets, transactions, and CSV imports</p>
            </div>
          </div>
          <button 
            onClick={() => setShowModal(false)}
            className="p-2 rounded-xl hover:bg-card/80 text-muted-foreground hover:text-foreground transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Form area if adding or editing */}
        <AnimatePresence>
          {(isAddingParent || addingSubParentId || editingCategory) && (
            <motion.form 
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              onSubmit={handleSubmitForm}
              className="mt-4 p-4 rounded-xl bg-card border border-border/60 space-y-3"
            >
              <div className="flex justify-between items-center">
                <span className="text-sm font-bold text-primary">
                  {editingCategory ? `Edit "${editingCategory.name}"` : isAddingParent ? 'Add New Parent Category' : `Add Sub-Category under "${categories.find(c => c.id === addingSubParentId)?.name}"`}
                </span>
                <button type="button" onClick={resetForm} className="text-xs text-muted-foreground hover:text-foreground">Cancel</button>
              </div>

              {error && <p className="text-xs text-destructive font-bold">{error}</p>}

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div className="sm:col-span-2">
                  <label className="block text-xs font-bold text-muted-foreground mb-1">Name *</label>
                  <input
                    type="text" required
                    value={catName} onChange={e => setCatName(e.target.value)}
                    className="w-full bg-background border border-border rounded-lg px-3 py-1.5 text-sm font-medium focus:ring-1 focus:ring-primary outline-none"
                    placeholder="e.g. Subscriptions"
                  />
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="block text-xs font-bold text-muted-foreground mb-1">Emoji</label>
                    <input
                      type="text" maxLength={2}
                      value={catEmoji} onChange={e => setCatEmoji(e.target.value)}
                      className="w-full bg-background border border-border rounded-lg px-2 py-1.5 text-center text-sm font-bold focus:ring-1 focus:ring-primary outline-none"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-muted-foreground mb-1">Color</label>
                    <input
                      type="color"
                      value={catColor} onChange={e => setCatColor(e.target.value)}
                      className="w-full h-[34px] bg-background border border-border rounded-lg p-0.5 cursor-pointer outline-none"
                    />
                  </div>
                </div>
              </div>

              <div className="flex justify-end gap-2 pt-1">
                <button
                  type="submit"
                  className="px-4 py-1.5 rounded-lg bg-primary hover:bg-primary/90 text-primary-foreground font-bold text-xs shadow flex items-center gap-1.5"
                >
                  <Save className="w-3.5 h-3.5" /> Save Category
                </button>
              </div>
            </motion.form>
          )}
        </AnimatePresence>

        {/* Toolbar */}
        <div className="flex items-center justify-between py-3">
          <span className="text-xs text-muted-foreground font-medium">
            {parentCategories.length} Parent Categories ({categories.length - parentCategories.length} Sub-Categories)
          </span>
          <button
            type="button"
            onClick={handleStartAddParent}
            className="flex items-center gap-1 text-xs font-bold px-3 py-1.5 rounded-lg bg-primary/10 text-primary hover:bg-primary/20 border border-primary/20 transition-colors"
          >
            <Plus className="w-3.5 h-3.5" /> Parent Category
          </button>
        </div>

        {/* Category Tree List */}
        <div className="flex-1 overflow-y-auto custom-scrollbar space-y-2 pr-1">
          {parentCategories.map(parent => {
            const subs = categories.filter(c => c.parentId === parent.id);
            const isExpanded = expandedParents.has(parent.id);

            return (
              <div key={parent.id} className="glass-card p-3 rounded-xl border border-border/40 space-y-2">
                <div className="flex justify-between items-center">
                  <div 
                    onClick={() => toggleExpand(parent.id)}
                    className="flex items-center gap-2 cursor-pointer hover:text-primary transition-colors font-bold text-sm"
                  >
                    <span className="text-muted-foreground">
                      {isExpanded ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                    </span>
                    <span className="w-7 h-7 rounded-lg flex items-center justify-center text-sm" style={{ backgroundColor: `${parent.color}20`, color: parent.color }}>
                      {parent.emoji}
                    </span>
                    <span>{parent.name}</span>
                    <span className="text-[10px] px-2 py-0.5 rounded-full bg-card border border-border text-muted-foreground font-bold">
                      {subs.length} sub
                    </span>
                  </div>

                  <div className="flex items-center gap-1.5">
                    <button
                      onClick={() => handleStartAddSub(parent.id)}
                      title="Add Sub-Category"
                      className="flex items-center gap-1 px-2 py-1 rounded bg-card hover:bg-card/80 text-muted-foreground hover:text-foreground text-xs font-bold border border-border/60 transition-colors"
                    >
                      <Plus className="w-3 h-3" /> Sub
                    </button>
                    <button
                      onClick={() => handleStartEdit(parent)}
                      title="Edit Category"
                      className="p-1 rounded hover:bg-card text-muted-foreground hover:text-foreground transition-colors"
                    >
                      <Edit2 className="w-3.5 h-3.5" />
                    </button>
                    <button
                      onClick={() => handleDelete(parent)}
                      title="Delete Category"
                      className="p-1 rounded hover:bg-destructive/10 text-destructive/80 hover:text-destructive transition-colors"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>

                {/* Sub-categories */}
                <AnimatePresence>
                  {isExpanded && (
                    <motion.div
                      initial={{ opacity: 0, height: 0 }}
                      animate={{ opacity: 1, height: 'auto' }}
                      exit={{ opacity: 0, height: 0 }}
                      className="pt-2 pl-6 border-l-2 border-primary/20 space-y-1.5"
                    >
                      {subs.length > 0 ? subs.map(sub => (
                        <div key={sub.id} className="flex justify-between items-center p-1.5 rounded-lg bg-card/40 hover:bg-card/70 border border-border/20 text-xs">
                          <span className="font-semibold text-muted-foreground flex items-center gap-2">
                            <span>{sub.emoji}</span>
                            <span>{sub.name}</span>
                          </span>
                          <div className="flex items-center gap-1">
                            <button
                              onClick={() => handleStartEdit(sub)}
                              className="p-1 rounded hover:bg-card text-muted-foreground hover:text-foreground transition-colors"
                            >
                              <Edit2 className="w-3 h-3" />
                            </button>
                            <button
                              onClick={() => handleDelete(sub)}
                              className="p-1 rounded hover:bg-destructive/10 text-destructive/80 hover:text-destructive transition-colors"
                            >
                              <Trash2 className="w-3 h-3" />
                            </button>
                          </div>
                        </div>
                      )) : (
                        <div className="text-[11px] text-muted-foreground/60 italic py-1">No sub-categories yet</div>
                      )}
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            );
          })}
        </div>
      </motion.div>
    </div>
  );
}
