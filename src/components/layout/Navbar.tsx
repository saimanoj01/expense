import { Shield, Sun, Moon, LogOut, Sparkles, FolderKanban, Search } from 'lucide-react';
import { motion } from 'framer-motion';
import { Project } from '../../services/storage';

interface UserProfile {
  name?: string;
  email?: string;
  picture?: string;
}

interface NavbarProps {
  user: UserProfile | null;
  isMockMode: boolean;
  projects: Project[];
  activeProject: Project | null;
  theme: 'light' | 'dark';
  isLoading: boolean;
  toggleTheme: () => void;
  selectProject: (id: string) => void;
  setShowCreateModal: (show: boolean) => void;
  onManageProjects?: () => void;
  onOpenGeminiKeyModal?: () => void;
  onLoadSampleData?: () => void;
  onOpenCommandPalette?: () => void;
  logout: () => void;
}

export function Navbar({
  user,
  isMockMode,
  projects,
  activeProject,
  theme,
  isLoading,
  toggleTheme,
  selectProject,
  setShowCreateModal,
  onManageProjects,
  onOpenGeminiKeyModal,
  onLoadSampleData,
  onOpenCommandPalette,
  logout
}: NavbarProps) {
  return (
    <motion.header 
      initial={{ y: -20, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      className="sticky top-0 z-40 border-b border-border/40 backdrop-blur-md bg-background/70"
    >
      <div className="max-w-7xl mx-auto px-4 h-16 flex items-center justify-between gap-2 sm:gap-4">
        {/* Left: Brand & Mock Mode */}
        <div className="flex items-center gap-2 sm:gap-3 shrink-0">
          <div className="p-2 rounded-xl bg-primary/10 text-primary ring-1 ring-primary/30 shrink-0">
            <Shield className="w-5 h-5" />
          </div>
          <h1 className="font-bold text-lg tracking-tight hidden lg:block">Nebula</h1>
          {isMockMode && (
            <div className="flex items-center gap-1.5 sm:gap-2">
              <span 
                data-testid="mock-banner" 
                className="mock-mode-banner px-2 py-0.5 rounded-full text-[10px] font-bold bg-secondary/20 text-secondary uppercase tracking-wider border border-secondary/20"
              >
                Mock Mode
              </span>
              {onLoadSampleData && (
                <button
                  type="button"
                  onClick={onLoadSampleData}
                  data-testid="load-sample-data-btn"
                  className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-primary/15 text-primary hover:bg-primary/25 border border-primary/30 transition-all flex items-center gap-1"
                  title="Populate project with 4 months of sample transactions and budgets"
                >
                  <Sparkles className="w-3 h-3" />
                  <span className="hidden sm:inline">Load Sample Data</span>
                </button>
              )}
            </div>
          )}
        </div>

        {/* Center: Command Palette Trigger Button */}
        {onOpenCommandPalette && (
          <div className="flex-1 max-w-md mx-2 sm:mx-4">
            <button
              type="button"
              data-testid="command-palette-trigger"
              onClick={onOpenCommandPalette}
              className="w-full flex items-center justify-between px-3 py-1.5 rounded-xl bg-card/60 hover:bg-card border border-border/60 hover:border-primary/40 text-xs text-muted-foreground transition-all shadow-sm group"
              title="Search views, buckets, categories, or actions (⌘K)"
            >
              <div className="flex items-center gap-2 truncate">
                <Search className="w-3.5 h-3.5 text-muted-foreground group-hover:text-primary transition-colors shrink-0" />
                <span className="truncate">Search or jump to...</span>
              </div>
              <div className="flex items-center gap-1 shrink-0">
                <kbd className="hidden sm:inline-flex items-center px-1.5 py-0.5 text-[10px] font-mono rounded bg-secondary text-muted-foreground border border-border/40">
                  ⌘K
                </kbd>
              </div>
            </button>
          </div>
        )}

        {/* Right: Project selector, Theme, Gemini, Auth */}
        <div className="flex items-center gap-1.5 sm:gap-3 shrink-0">
          {projects.length > 0 && (
            <div className="flex items-center gap-1">
              <select
                disabled={isLoading}
                data-testid="project-selector"
                className="bg-card/50 border border-border rounded-lg px-2 sm:px-3 py-1.5 text-xs sm:text-sm max-w-[110px] sm:max-w-[180px] truncate focus:ring-2 focus:ring-primary outline-none transition-all cursor-pointer"
                value={activeProject?.id || ''}
                onChange={(e) => {
                  const val = e.target.value;
                  if (val === 'new') {
                    setShowCreateModal(true);
                    e.target.value = activeProject?.id || '';
                  } else if (val === 'manage') {
                    onManageProjects?.();
                    e.target.value = activeProject?.id || '';
                  } else {
                    selectProject(val);
                  }
                }}
              >
                {projects.map(p => (
                  <option key={p.id} value={p.id} data-testid={`project-item-${p.id}`} className="bg-card text-card-foreground">{p.name}</option>
                ))}
                <option value="new" data-testid="create-project-option" className="bg-card text-card-foreground">+ New Project</option>
                <option value="manage" data-testid="manage-projects-btn" className="bg-card text-card-foreground">⚙️ Manage Projects...</option>
              </select>

              {onManageProjects && (
                <button
                  type="button"
                  onClick={onManageProjects}
                  data-testid="manage-projects-icon-btn"
                  className="hidden sm:inline-flex p-1.5 hover:bg-card/50 rounded-lg transition-colors border border-transparent hover:border-border text-muted-foreground hover:text-foreground"
                  title="Manage & Delete Projects"
                  aria-label="Manage & Delete Projects"
                >
                  <FolderKanban className="w-4 h-4" />
                </button>
              )}
            </div>
          )}

          <button
            type="button"
            onClick={toggleTheme}
            data-testid="theme-toggle-btn"
            className="p-1.5 sm:p-2 hover:bg-card/50 rounded-lg transition-colors border border-transparent hover:border-border"
            title="Toggle Light/Dark Theme"
            aria-label="Toggle Light/Dark Theme"
          >
            {theme === 'dark' ? <Sun className="w-4 h-4 sm:w-5 sm:h-5" /> : <Moon className="w-4 h-4 sm:w-5 sm:h-5" />}
          </button>

          {onOpenGeminiKeyModal && (
            <button
              type="button"
              onClick={onOpenGeminiKeyModal}
              data-testid="ai-settings-btn"
              className="p-1.5 sm:p-2 hover:bg-card/50 rounded-lg transition-colors border border-transparent hover:border-border text-primary"
              title="Gemini AI Settings"
              aria-label="Gemini AI Settings"
            >
              <Sparkles className="w-4 h-4 sm:w-5 sm:h-5" />
            </button>
          )}

          <div className="h-6 sm:h-8 w-px bg-border mx-0.5 sm:mx-1" />

          {user && (
            <div className="flex items-center gap-1.5 sm:gap-2.5 pl-0.5 sm:pl-1">
              <div className="hidden lg:flex flex-col items-end">
                <span className="text-xs font-semibold leading-none">{user.name}</span>
                <span className="text-[10px] text-muted-foreground mt-0.5">{user.email}</span>
              </div>
              {user.picture ? (
                <img src={user.picture} alt="Avatar" className="w-7 h-7 sm:w-8 sm:h-8 rounded-full ring-2 ring-primary/20" />
              ) : (
                <div className="w-7 h-7 sm:w-8 sm:h-8 rounded-full bg-primary/20 text-primary flex items-center justify-center font-bold text-xs">
                  {user.name?.charAt(0) || 'U'}
                </div>
              )}
              <button
                type="button"
                onClick={logout}
                data-testid="logout-btn"
                className="p-1.5 sm:p-2 hover:bg-destructive/10 text-destructive rounded-lg transition-colors"
                title="Logout"
              >
                <LogOut className="w-4 h-4 sm:w-5 sm:h-5" />
              </button>
            </div>
          )}
        </div>
      </div>
    </motion.header>
  );
}
