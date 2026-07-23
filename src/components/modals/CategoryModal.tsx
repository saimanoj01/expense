import React, { useState, useMemo } from 'react';
import { X, Save } from 'lucide-react';
import { motion } from 'framer-motion';
import { Category, DEFAULT_CATEGORIES } from '../../services/storage';

interface CategoryModalProps {
  showModal: boolean;
  setShowModal: (v: boolean) => void;
  handleSaveCategory: (cat: Category, isEdit: boolean) => Promise<boolean>;
  categories: Category[];
}

export function CategoryModal({ showModal, setShowModal, handleSaveCategory, categories }: CategoryModalProps) {
  const [newCatName, setNewCatName] = useState('');
  const [selectedParentId, setSelectedParentId] = useState('');
  const [newCatColor, setNewCatColor] = useState('#38bdf8');
  const [newCatEmoji, setNewCatEmoji] = useState('📦');
  const [error, setError] = useState<string | null>(null);

  const parentCategories = useMemo(() => {
    const map = new Map<string, Category>();
    DEFAULT_CATEGORIES.filter(c => !c.parentId).forEach(c => map.set(c.id, c));
    categories.filter(c => !c.parentId).forEach(c => map.set(c.id, c));
    return Array.from(map.values());
  }, [categories]);

  if (!showModal) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!newCatName.trim()) return;

    const slug = newCatName.trim().toLowerCase().replace(/[^a-z0-9]/g, '-');
    const catId = selectedParentId ? `${selectedParentId}-${slug}` : slug;

    const allCategories = [...DEFAULT_CATEGORIES, ...categories];
    const dup = allCategories.some(c => c.id === catId || c.name.toLowerCase() === newCatName.trim().toLowerCase());
    if (dup) {
      setError('Category with this name already exists');
      return;
    }

    const validHexColor = /^#[0-9A-Fa-f]{6}$/i.test(newCatColor) ? newCatColor : '#38bdf8';
    
    const newCat: Category = {
      id: catId,
      name: newCatName.trim(),
      color: validHexColor,
      emoji: newCatEmoji || '📦',
      parentId: selectedParentId || null
    };

    const success = await handleSaveCategory(newCat, false);
    if (success) {
      setShowModal(false);
      setNewCatName('');
      setSelectedParentId('');
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-background/80 backdrop-blur-sm" data-testid="onboarding-modal">
      <motion.div 
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.95 }}
        className="glass-panel w-full max-w-sm rounded-2xl p-6 shadow-2xl border border-border/50"
      >
        <div className="flex justify-between items-center mb-6">
          <h2 className="text-xl font-bold">Add Category</h2>
          <button onClick={() => setShowModal(false)} className="p-2 hover:bg-card rounded-lg text-muted-foreground hover:text-foreground transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>
        
        {error && <div className="mb-4 text-destructive text-sm font-bold" data-testid="category-modal-error">{error}</div>}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-bold text-muted-foreground mb-1">Name *</label>
            <input 
              type="text" required
              data-testid="new-category-name-input"
              value={newCatName} onChange={e => setNewCatName(e.target.value)}
              className="w-full bg-card/50 border border-border rounded-xl px-4 py-2.5 font-medium focus:ring-2 focus:ring-primary outline-none"
              placeholder="e.g. Organic Groceries"
            />
          </div>

          <div>
            <label className="block text-sm font-bold text-muted-foreground mb-1">Parent Category (Optional)</label>
            <select
              data-testid="new-category-parent-select"
              value={selectedParentId}
              onChange={e => setSelectedParentId(e.target.value)}
              className="w-full bg-card/50 border border-border rounded-xl px-4 py-2.5 font-medium focus:ring-2 focus:ring-primary outline-none cursor-pointer text-foreground"
            >
              <option value="" className="bg-card text-card-foreground">-- None -- (Top-Level Category)</option>
              {parentCategories.map(p => (
                <option key={p.id} value={p.id} className="bg-card text-card-foreground">
                  {p.emoji} {p.name}
                </option>
              ))}
            </select>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-bold text-muted-foreground mb-1">Emoji</label>
              <input 
                type="text" 
                data-testid="new-category-emoji-input"
                value={newCatEmoji} onChange={e => setNewCatEmoji(e.target.value)}
                className="w-full bg-card/50 border border-border rounded-xl px-4 py-2.5 font-medium text-center text-xl focus:ring-2 focus:ring-primary outline-none"
                maxLength={2}
              />
            </div>
            <div>
              <label className="block text-sm font-bold text-muted-foreground mb-1">Color</label>
              <input 
                type="color" 
                data-testid="new-category-color-input"
                value={newCatColor} onChange={e => setNewCatColor(e.target.value)}
                className="w-full h-[52px] bg-card/50 border border-border rounded-xl p-1 cursor-pointer focus:ring-2 focus:ring-primary outline-none"
              />
            </div>
          </div>
          <button
            type="submit"
            className="w-full px-4 py-3 mt-2 rounded-xl bg-primary hover:bg-primary/90 text-primary-foreground font-bold shadow-lg shadow-primary/20 transition-all hover:scale-105 active:scale-95 flex items-center justify-center gap-2"
          >
            <Save className="w-5 h-5" /> Add Category
          </button>
        </form>
      </motion.div>
    </div>
  );
}
