import { Sun, Moon, Search } from 'lucide-react';
import { Project } from '../../services/storage';
import { useNavigation } from '../../hooks/useNavigation';

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
  activeProject,
  theme,
  toggleTheme,
  onOpenCommandPalette,
}: NavbarProps) {
  const { navigate } = useNavigation();
  const isAuthenticated = !!user;

  // On desktop (>=768px), Sidebar is the sole chrome when authenticated.
  // On mobile (<768px), render a clean 52px top bar with zero overflow.
  return (
    <header
      className={`sticky top-0 z-30 h-[52px] border-b border-border bg-background/85 backdrop-blur-md px-4 flex items-center justify-between gap-2 ${
        isAuthenticated ? 'md:hidden' : ''
      }`}
    >
      {/* Left: Workspace initial + name */}
      <button
        type="button"
        onClick={() => isAuthenticated && navigate('#/settings')}
        className="flex items-center gap-2 min-w-0 text-left focus-visible:ring-2 ring-ring/40 rounded-[10px]"
      >
        <div className="w-7 h-7 rounded-[8px] bg-surface2 border border-border text-foreground flex items-center justify-center font-semibold text-label shrink-0">
          {(activeProject?.name || 'N').charAt(0).toUpperCase()}
        </div>
        <span className="font-semibold text-body text-foreground truncate max-w-[180px]">
          {isAuthenticated ? activeProject?.name || 'Workspace' : 'Nebula'}
        </span>
      </button>

      {/* Right: Search & Theme (only expose theme-toggle-btn testId when unauthenticated so Sidebar owns it when authenticated) */}
      <div className="flex items-center gap-1 shrink-0">
        {isAuthenticated && onOpenCommandPalette && (
          <button
            type="button"
            onClick={onOpenCommandPalette}
            className="w-9 h-9 rounded-[10px] flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-surface2 transition-colors focus-visible:ring-2 ring-ring/40"
            aria-label="Search"
          >
            <Search className="w-4 h-4" />
          </button>
        )}

        <button
          type="button"
          onClick={toggleTheme}
          data-testid={!isAuthenticated ? 'theme-toggle-btn' : undefined}
          className="w-9 h-9 rounded-[10px] flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-surface2 transition-colors focus-visible:ring-2 ring-ring/40"
          aria-label="Toggle Light/Dark Theme"
        >
          {theme === 'dark' ? (
            <Sun className="w-4 h-4" />
          ) : (
            <Moon className="w-4 h-4" />
          )}
        </button>
      </div>
    </header>
  );
}
