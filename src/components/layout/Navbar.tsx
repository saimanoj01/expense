import { Shield, Sun, Moon, LogOut } from 'lucide-react';
import { motion } from 'framer-motion';
import { Project } from '../../services/storage';

interface NavbarProps {
  user: any;
  isMockMode: boolean;
  projects: Project[];
  activeProject: Project | null;
  theme: 'light' | 'dark';
  isLoading: boolean;
  toggleTheme: () => void;
  selectProject: (id: string) => void;
  setShowCreateModal: (show: boolean) => void;
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
  logout
}: NavbarProps) {
  return (
    <motion.header 
      initial={{ y: -20, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      className="sticky top-0 z-40 border-b border-border/40 backdrop-blur-md bg-background/60"
    >
      <div className="max-w-6xl mx-auto px-4 h-16 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-xl bg-primary/10 text-primary ring-1 ring-primary/30">
            <Shield className="w-5 h-5" />
          </div>
          <h1 className="font-bold text-lg tracking-tight hidden sm:block">ExpenseTracker</h1>
          {isMockMode && (
            <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-secondary/20 text-secondary uppercase tracking-wider border border-secondary/20">
              Mock
            </span>
          )}
        </div>

        <div className="flex items-center gap-3">
          {projects.length > 0 && (
            <select
              disabled={isLoading}
              data-testid="project-selector"
              className="bg-card/50 border border-border rounded-lg px-3 py-1.5 text-sm max-w-[130px] sm:max-w-[200px] truncate focus:ring-2 focus:ring-primary outline-none transition-all"
              value={activeProject?.id || ''}
              onChange={(e) => {
                if (e.target.value === 'new') {
                  setShowCreateModal(true);
                } else {
                  selectProject(e.target.value);
                }
              }}
            >
              {projects.map(p => (
                <option key={p.id} value={p.id} className="bg-card text-card-foreground">{p.name}</option>
              ))}
              <option value="new" data-testid="create-project-btn" className="bg-card text-card-foreground">+ New Project</option>
            </select>
          )}

          <button
            onClick={toggleTheme}
            data-testid="theme-toggle-btn"
            className="p-2 hover:bg-card/50 rounded-lg transition-colors border border-transparent hover:border-border"
          >
            {theme === 'dark' ? <Sun className="w-5 h-5" /> : <Moon className="w-5 h-5" />}
          </button>

          <div className="h-8 w-px bg-border mx-1" />

          {user && (
            <div className="flex items-center gap-3 pl-1">
              <div className="hidden md:flex flex-col items-end">
                <span className="text-sm font-medium leading-none">{user.name}</span>
                <span className="text-xs text-muted-foreground mt-1">{user.email}</span>
              </div>
              {user.picture ? (
                <img src={user.picture} alt="Avatar" className="w-8 h-8 rounded-full ring-2 ring-primary/20" />
              ) : (
                <div className="w-8 h-8 rounded-full bg-primary/20 text-primary flex items-center justify-center font-bold">
                  {user.name?.charAt(0) || 'U'}
                </div>
              )}
              <button
                onClick={logout}
                data-testid="logout-btn"
                className="p-2 hover:bg-destructive/10 text-destructive rounded-lg transition-colors"
                title="Logout"
              >
                <LogOut className="w-5 h-5" />
              </button>
            </div>
          )}
        </div>
      </div>
    </motion.header>
  );
}
