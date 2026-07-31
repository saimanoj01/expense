import React, { useState } from 'react';
import { FolderKanban, X, Trash2, Plus, Users, AlertTriangle } from 'lucide-react';
import { motion } from 'framer-motion';
import { Project } from '../../services/storage';

interface ManageProjectsModalProps {
  showModal: boolean;
  onClose: () => void;
  projects: Project[];
  activeProject: Project | null;
  onSelectProject: (projectId: string) => void;
  onCreateProject: (name: string) => Promise<void>;
  onDeleteProject: (projectId: string) => Promise<void>;
}

export function ManageProjectsModal({
  showModal,
  onClose,
  projects,
  activeProject,
  onSelectProject,
  onCreateProject,
  onDeleteProject,
}: ManageProjectsModalProps) {
  const [newProjectName, setNewProjectName] = useState('');
  const [isCreating, setIsCreating] = useState(false);
  const [deletingProjectId, setDeletingProjectId] = useState<string | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  if (!showModal) return null;

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newProjectName.trim()) return;
    setIsCreating(true);
    setErrorMessage(null);
    try {
      await onCreateProject(newProjectName.trim());
      setNewProjectName('');
    } catch (err: any) {
      setErrorMessage(err.message || 'Failed to create project');
    } finally {
      setIsCreating(false);
    }
  };

  const handleDelete = async (projectId: string) => {
    setDeletingProjectId(projectId);
    setErrorMessage(null);
    try {
      await onDeleteProject(projectId);
      setConfirmDeleteId(null);
    } catch (err: any) {
      setErrorMessage(err.message || 'Failed to delete project');
    } finally {
      setDeletingProjectId(null);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-background/80 backdrop-blur-sm"
      data-testid="manage-projects-modal"
    >
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.95 }}
        className="glass-panel w-full max-w-lg rounded-2xl p-6 shadow-2xl border border-border/50 flex flex-col max-h-[85vh]"
      >
        {/* Header */}
        <div className="flex justify-between items-center pb-4 border-b border-border/40">
          <div className="flex items-center gap-2.5 font-bold text-lg">
            <div className="p-2 rounded-xl bg-primary/10 text-primary">
              <FolderKanban className="w-5 h-5" />
            </div>
            <span>Manage Projects</span>
          </div>
          <button
            onClick={onClose}
            className="p-1 hover:bg-card rounded-lg text-muted-foreground hover:text-foreground transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Error Alert */}
        {errorMessage && (
          <div className="mt-4 p-3 rounded-xl bg-destructive/10 border border-destructive/20 text-destructive text-sm flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 shrink-0" />
            <span>{errorMessage}</span>
          </div>
        )}

        {/* Projects List */}
        <div className="flex-1 overflow-y-auto custom-scrollbar my-4 space-y-3 pr-1">
          {projects.length === 0 ? (
            <p className="text-sm text-muted-foreground italic text-center py-6">
              No projects found. Create one below to get started.
            </p>
          ) : (
            projects.map((project) => {
              const isActive = activeProject?.id === project.id;
              const isConfirming = confirmDeleteId === project.id;
              const isDeleting = deletingProjectId === project.id;

              return (
                <motion.div
                  key={project.id}
                  layout
                  className={`p-4 rounded-xl border transition-all ${
                    isActive
                      ? 'bg-primary/5 border-primary/40 shadow-sm'
                      : 'bg-card/40 border-border/40 hover:bg-card/70'
                  }`}
                >
                  {isConfirming ? (
                    <div className="space-y-3">
                      <div className="flex items-center gap-2 text-destructive font-medium text-sm">
                        <AlertTriangle className="w-4 h-4 shrink-0" />
                        <span>Delete "{project.name}"? This action cannot be undone.</span>
                      </div>
                      <div className="flex justify-end gap-2">
                        <button
                          type="button"
                          onClick={() => setConfirmDeleteId(null)}
                          disabled={isDeleting}
                          className="px-3 py-1.5 rounded-lg border border-border text-xs font-semibold hover:bg-card transition-colors"
                        >
                          Cancel
                        </button>
                        <button
                          type="button"
                          onClick={() => handleDelete(project.id)}
                          disabled={isDeleting}
                          className="px-3 py-1.5 rounded-lg bg-destructive text-destructive-foreground text-xs font-semibold hover:bg-destructive/90 transition-colors flex items-center gap-1"
                        >
                          {isDeleting ? (
                            'Deleting...'
                          ) : (
                            <>
                              <Trash2 className="w-3.5 h-3.5" /> Confirm Delete
                            </>
                          )}
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div className="flex items-center justify-between gap-3">
                      <div
                        className="flex-1 cursor-pointer min-w-0"
                        onClick={() => {
                          onSelectProject(project.id);
                          onClose();
                        }}
                      >
                        <div className="flex items-center gap-2">
                          <span className="font-semibold text-foreground truncate">{project.name}</span>
                          {isActive && (
                            <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-primary/20 text-primary uppercase tracking-wider shrink-0">
                              Active
                            </span>
                          )}
                        </div>
                        {project.collaborators && project.collaborators.length > 0 && (
                          <div className="flex items-center gap-1 text-xs text-muted-foreground mt-1 truncate">
                            <Users className="w-3 h-3 shrink-0" />
                            <span>{project.collaborators.length} collaborator(s)</span>
                          </div>
                        )}
                      </div>

                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => setConfirmDeleteId(project.id)}
                          className="p-2 text-muted-foreground hover:text-destructive hover:bg-destructive/10 rounded-lg transition-colors"
                          title="Delete project"
                          data-testid={`delete-project-${project.id}`}
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  )}
                </motion.div>
              );
            })
          )}
        </div>

        {/* Create Project Form */}
        <form onSubmit={handleCreate} className="pt-4 border-t border-border/40 space-y-3">
          <label className="block text-xs font-bold text-muted-foreground uppercase tracking-wider">
            Create New Project
          </label>
          <div className="flex gap-2">
            <input
              type="text"
              value={newProjectName}
              onChange={(e) => setNewProjectName(e.target.value)}
              placeholder="Project name (e.g. Household Expenses)..."
              className="flex-1 bg-card/50 border border-border rounded-xl px-4 py-2 text-sm font-medium focus:ring-2 focus:ring-primary outline-none"
              data-testid="new-project-name-input"
            />
            <button
              type="submit"
              disabled={!newProjectName.trim() || isCreating}
              className="px-4 py-2 rounded-xl bg-primary text-primary-foreground text-sm font-bold hover:bg-primary/90 disabled:opacity-50 transition-all flex items-center gap-1.5 shrink-0"
              data-testid="create-project-submit-btn"
            >
              <Plus className="w-4 h-4" />
              {isCreating ? 'Creating...' : 'Create'}
            </button>
          </div>
        </form>
      </motion.div>
    </div>
  );
}
