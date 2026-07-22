import React, { useState } from 'react';
import { FolderPlus, X } from 'lucide-react';
import { motion } from 'framer-motion';

interface CreateProjectModalProps {
  showModal: boolean;
  onClose: () => void;
  onCreate: (name: string) => Promise<void>;
}

export function CreateProjectModal({ showModal, onClose, onCreate }: CreateProjectModalProps) {
  const [name, setName] = useState('');
  const [loading, setLoading] = useState(false);

  if (!showModal) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    setLoading(true);
    try {
      await onCreate(name.trim());
      setName('');
      onClose();
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
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
        <div className="flex justify-between items-center mb-4">
          <div className="flex items-center gap-2 font-bold text-lg">
            <FolderPlus className="w-5 h-5 text-primary" />
            <span>Create Project</span>
          </div>
          <button onClick={onClose} className="p-1 hover:bg-card rounded-lg text-muted-foreground hover:text-foreground">
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-bold text-muted-foreground mb-1">Project Name</label>
            <input
              type="text"
              required
              data-testid="project-name-input"
              value={name}
              onChange={e => setName(e.target.value)}
              placeholder="e.g. Vacation 2026"
              className="w-full bg-card/50 border border-border rounded-xl px-4 py-2.5 font-medium focus:ring-2 focus:ring-primary outline-none"
            />
          </div>

          <div className="flex justify-end gap-3 pt-2">
            <button type="button" onClick={onClose} className="px-4 py-2 rounded-xl font-bold hover:bg-card border border-border">
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading}
              data-testid="project-submit-btn"
              className="px-4 py-2 rounded-xl bg-primary text-primary-foreground font-bold hover:bg-primary/90 shadow-lg shadow-primary/20"
            >
              {loading ? 'Creating...' : 'Create'}
            </button>
          </div>
        </form>
      </motion.div>
    </div>
  );
}
