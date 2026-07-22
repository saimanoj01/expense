import React, { useState } from 'react';
import { Share2, X, UserPlus } from 'lucide-react';
import { motion } from 'framer-motion';

interface ShareProjectModalProps {
  showModal: boolean;
  onClose: () => void;
  collaborators: string[];
  onAddCollaborator: (email: string) => Promise<void>;
}

export function ShareProjectModal({ showModal, onClose, collaborators, onAddCollaborator }: ShareProjectModalProps) {
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);

  if (!showModal) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim()) return;
    setLoading(true);
    try {
      await onAddCollaborator(email.trim());
      setEmail('');
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-background/80 backdrop-blur-sm" data-testid="share-project-modal">
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.95 }}
        className="glass-panel w-full max-w-md rounded-2xl p-6 shadow-2xl border border-border/50"
      >
        <div className="flex justify-between items-center mb-4">
          <div className="flex items-center gap-2 font-bold text-lg">
            <Share2 className="w-5 h-5 text-primary" />
            <span>Share Project</span>
          </div>
          <button onClick={onClose} className="p-1 hover:bg-card rounded-lg text-muted-foreground hover:text-foreground">
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4 mb-6">
          <div>
            <label className="block text-sm font-bold text-muted-foreground mb-1">Add Collaborator Email</label>
            <div className="flex gap-2">
              <input
                type="email"
                required
                data-testid="collaborator-email-input"
                value={email}
                onChange={e => setEmail(e.target.value)}
                placeholder="colleague@example.com"
                className="flex-1 bg-card/50 border border-border rounded-xl px-4 py-2.5 font-medium focus:ring-2 focus:ring-primary outline-none"
              />
              <button
                type="submit"
                disabled={loading}
                data-testid="collaborator-submit-btn"
                className="px-4 py-2.5 rounded-xl bg-primary text-primary-foreground font-bold hover:bg-primary/90 flex items-center gap-1"
              >
                <UserPlus className="w-4 h-4" /> Add
              </button>
            </div>
          </div>
        </form>

        <h4 className="text-sm font-bold text-muted-foreground mb-2">Collaborators ({collaborators.length})</h4>
        <div className="max-h-40 overflow-y-auto custom-scrollbar space-y-2">
          {collaborators.length > 0 ? (
            collaborators.map((c, i) => (
              <div key={i} className="flex items-center justify-between p-2.5 bg-card/40 rounded-xl border border-border/40 text-sm">
                <span className="truncate">{c}</span>
              </div>
            ))
          ) : (
            <p className="text-sm text-muted-foreground italic">No collaborators added yet.</p>
          )}
        </div>
      </motion.div>
    </div>
  );
}
