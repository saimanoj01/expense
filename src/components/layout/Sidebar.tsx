import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import {
  LayoutDashboard,
  Receipt,
  Target,
  BarChart3,
  FileText,
  Settings,
  ChevronLeft,
  ChevronRight,
  ChevronDown,
  Plus,
  Search,
  Sun,
  Moon,
  Sparkles,
  LogOut,
  FolderKanban,
} from 'lucide-react';
import { useNavigation } from '../../hooks/useNavigation';
import { Project } from '../../services/storage';

interface UserProfile {
  name?: string;
  email?: string;
  picture?: string;
}

export interface SidebarProps {
  user?: UserProfile | null;
  isMockMode?: boolean;
  projects?: Project[];
  activeProject: Project | null;
  theme?: 'light' | 'dark';
  isLoading?: boolean;
  toggleTheme?: () => void;
  selectProject?: (id: string) => void;
  setShowCreateModal?: (show: boolean) => void;
  onManageProjects?: () => void;
  onOpenGeminiKeyModal?: () => void;
  onLoadSampleData?: () => void;
  onOpenCommandPalette?: () => void;
  logout?: () => void;
  onOpenAddTxn: () => void;
  className?: string;
}

export const Sidebar: React.FC<SidebarProps> = ({
  user,
  isMockMode = false,
  projects = [],
  activeProject,
  theme = 'dark',
  isLoading = false,
  toggleTheme,
  selectProject,
  setShowCreateModal,
  onManageProjects,
  onOpenGeminiKeyModal,
  onOpenCommandPalette,
  logout,
  onOpenAddTxn,
  className = '',
}) => {
  const { currentRoute, navigate } = useNavigation();

  const [collapsed, setCollapsed] = useState<boolean>(() => {
    try {
      return localStorage.getItem('expense_sidebar_collapsed') === 'true';
    } catch {
      return false;
    }
  });

  useEffect(() => {
    try {
      localStorage.setItem('expense_sidebar_collapsed', String(collapsed));
    } catch {
      // Ignore localStorage failure
    }
  }, [collapsed]);

  const activeMonth = currentRoute.month || new Date().toISOString().substring(0, 7);

  const navItems = [
    {
      id: 'overview',
      label: 'Overview',
      icon: LayoutDashboard,
      route: `#/month/${activeMonth}`,
      isActive:
        currentRoute.view === 'overview' ||
        currentRoute.view === 'bucket' ||
        currentRoute.view === 'category',
    },
    {
      id: 'transactions',
      label: 'Transactions',
      icon: Receipt,
      route: '#/transactions',
      isActive: currentRoute.view === 'transactions',
    },
    {
      id: 'budgets',
      label: 'Budgets',
      icon: Target,
      route: '#/budgets',
      isActive: currentRoute.view === 'budgets',
    },
    {
      id: 'trends',
      label: 'Trends',
      icon: BarChart3,
      route: '#/trends',
      isActive: currentRoute.view === 'trends',
    },
    {
      id: 'reports',
      label: 'Reports',
      icon: FileText,
      route: '#/reports',
      isActive: currentRoute.view === 'reports',
    },
  ];

  return (
    <motion.aside
      data-testid="sidebar"
      initial={false}
      animate={{ width: collapsed ? 64 : 240 }}
      transition={{ duration: 0.2, ease: [0.22, 1, 0.36, 1] }}
      className={`hidden md:flex flex-col shrink-0 border-r border-border bg-background z-30 select-none ${className}`}
    >
      {/* Top Workspace Switcher + Quick Add '+' + Collapse Toggle */}
      <div className="h-14 flex items-center justify-between gap-1.5 px-3 border-b border-border">
        <div
          className={`flex items-center gap-1.5 min-w-0 flex-1 ${
            collapsed ? 'sr-only' : ''
          }`}
        >
          {projects.length > 0 ? (
            <div className="relative flex items-center min-w-0 flex-1">
              <select
                disabled={isLoading}
                data-testid="project-selector"
                value={activeProject?.id || ''}
                onChange={e => {
                  const val = e.target.value;
                  if (val === 'new') {
                    setShowCreateModal?.(true);
                    e.target.value = activeProject?.id || '';
                  } else if (val === 'manage') {
                    onManageProjects?.();
                    e.target.value = activeProject?.id || '';
                  } else {
                    selectProject?.(val);
                  }
                }}
                aria-label="Select Workspace"
                className="w-full appearance-none bg-transparent hover:bg-surface2 rounded-[10px] pl-2 pr-6 py-1.5 text-body font-semibold text-foreground truncate cursor-pointer focus-visible:ring-2 ring-ring/40 transition-colors"
              >
                {projects.map(p => (
                  <option
                    key={p.id}
                    value={p.id}
                    data-testid={`project-item-${p.id}`}
                    className="bg-popover text-popover-foreground"
                  >
                    {p.name}
                  </option>
                ))}
                <option
                  value="new"
                  data-testid="create-project-option"
                  className="bg-popover text-popover-foreground"
                >
                  + New Project
                </option>
                <option
                  value="manage"
                  data-testid="manage-projects-btn"
                  className="bg-popover text-popover-foreground"
                >
                  Manage Projects...
                </option>
              </select>
              <ChevronDown className="w-3.5 h-3.5 text-muted-foreground pointer-events-none absolute right-1.5" />
            </div>
          ) : (
            <span className="text-body font-semibold text-foreground truncate px-2">
              {activeProject?.name || 'Workspace'}
            </span>
          )}

          {isMockMode && (
            <span
              data-testid="mock-banner"
              className="mock-mode-banner px-1.5 py-0.5 rounded text-label text-muted-foreground bg-surface2 border border-border shrink-0"
              title="Demo data active"
            >
              Demo data
            </span>
          )}
        </div>

        <div className="flex items-center gap-1 shrink-0">
          {onManageProjects && !collapsed && (
            <button
              type="button"
              onClick={onManageProjects}
              data-testid="manage-projects-icon-btn"
              className="w-7 h-7 rounded-[8px] flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-surface2 transition-colors focus-visible:ring-2 ring-ring/40"
              title="Manage Projects"
              aria-label="Manage & Delete Projects"
            >
              <FolderKanban className="w-3.5 h-3.5" />
            </button>
          )}

          <button
            type="button"
            data-testid="sidebar-add-txn-btn"
            onClick={onOpenAddTxn}
            className="w-8 h-8 rounded-[10px] flex items-center justify-center bg-surface2 hover:bg-secondary text-foreground border border-border transition-colors focus-visible:ring-2 ring-ring/40"
            title="Add Transaction (N)"
            aria-label="Add Transaction"
          >
            <Plus className="w-4 h-4" />
          </button>

          <button
            type="button"
            data-testid="sidebar-toggle-btn"
            onClick={() => setCollapsed(prev => !prev)}
            className={`w-7 h-7 rounded-[8px] items-center justify-center text-muted-foreground hover:text-foreground hover:bg-surface2 transition-colors focus-visible:ring-2 ring-ring/40 ${
              collapsed ? 'hidden' : 'inline-flex'
            }`}
            title="Collapse Sidebar"
            aria-label="Collapse Sidebar"
          >
            <ChevronLeft className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Primary Navigation Items (36px rows) */}
      <nav className="flex-1 px-2.5 py-3 space-y-1 overflow-y-auto custom-scrollbar">
        {navItems.map(item => {
          const Icon = item.icon;
          return (
            <button
              key={item.id}
              type="button"
              data-testid={`nav-item-${item.id}`}
              onClick={() => navigate(item.route)}
              className={`w-full h-9 flex items-center gap-3 px-2.5 rounded-[10px] text-body font-medium transition-colors focus-visible:ring-2 ring-ring/40 ${
                item.isActive
                  ? 'bg-surface2 text-foreground'
                  : 'text-muted-foreground hover:text-foreground hover:bg-surface2/60'
              } ${collapsed ? 'justify-center px-0' : ''}`}
              title={collapsed ? item.label : undefined}
            >
              <Icon className="w-4 h-4 shrink-0" />
              {!collapsed && <span className="truncate">{item.label}</span>}
            </button>
          );
        })}
      </nav>

      {/* Bottom Cluster: Search ⌘K, Settings, Theme, AI Key, User & Logout */}
      <div className="px-2.5 py-2.5 border-t border-border space-y-1">
        {onOpenCommandPalette && (
          <button
            type="button"
            data-testid="command-palette-trigger"
            onClick={onOpenCommandPalette}
            className={`w-full h-9 flex items-center justify-between px-2.5 rounded-[10px] text-body text-muted-foreground hover:text-foreground hover:bg-surface2/60 transition-colors focus-visible:ring-2 ring-ring/40 ${
              collapsed ? 'justify-center px-0' : ''
            }`}
            title="Search or jump to (⌘K)"
          >
            <span className="flex items-center gap-3 truncate">
              <Search className="w-4 h-4 shrink-0" />
              {!collapsed && <span className="truncate">Search</span>}
            </span>
            {!collapsed && (
              <kbd className="px-1.5 py-0.5 text-label rounded bg-surface2 text-muted-foreground border border-border">
                ⌘K
              </kbd>
            )}
          </button>
        )}

        <button
          type="button"
          data-testid="nav-item-settings"
          onClick={() => navigate('#/settings')}
          className={`w-full h-9 flex items-center gap-3 px-2.5 rounded-[10px] text-body font-medium transition-colors focus-visible:ring-2 ring-ring/40 ${
            currentRoute.view === 'settings'
              ? 'bg-surface2 text-foreground'
              : 'text-muted-foreground hover:text-foreground hover:bg-surface2/60'
          } ${collapsed ? 'justify-center px-0' : ''}`}
          title={collapsed ? 'Settings' : undefined}
        >
          <Settings className="w-4 h-4 shrink-0" />
          {!collapsed && <span className="truncate">Settings</span>}
        </button>

        <div
          className={`pt-2 mt-1 border-t border-border/60 flex items-center ${
            collapsed ? 'flex-col gap-1.5' : 'justify-between gap-1.5 px-1'
          }`}
        >
          {!collapsed && user && (
            <div className="flex items-center gap-2 min-w-0 flex-1">
              <div className="w-7 h-7 rounded-full bg-surface2 border border-border text-foreground flex items-center justify-center font-semibold text-label shrink-0">
                {user.name?.charAt(0) || 'U'}
              </div>
              <div className="min-w-0 flex-1">
                <div className="text-label font-medium text-foreground truncate">
                  {user.name || 'User'}
                </div>
                {user.email && (
                  <div className="text-label text-muted-foreground truncate">
                    {user.email}
                  </div>
                )}
              </div>
            </div>
          )}

          <div className="flex items-center gap-1 shrink-0">
            {toggleTheme && (
              <button
                type="button"
                onClick={toggleTheme}
                data-testid="theme-toggle-btn"
                className="w-8 h-8 rounded-[10px] flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-surface2 transition-colors focus-visible:ring-2 ring-ring/40"
                title="Toggle Light/Dark Theme"
                aria-label="Toggle Light/Dark Theme"
              >
                {theme === 'dark' ? (
                  <Sun className="w-4 h-4" />
                ) : (
                  <Moon className="w-4 h-4" />
                )}
              </button>
            )}

            {onOpenGeminiKeyModal && (
              <button
                type="button"
                onClick={onOpenGeminiKeyModal}
                data-testid="ai-settings-btn"
                className="w-8 h-8 rounded-[10px] flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-surface2 transition-colors focus-visible:ring-2 ring-ring/40"
                title="Gemini AI Settings"
                aria-label="Gemini AI Settings"
              >
                <Sparkles className="w-4 h-4" />
              </button>
            )}

            {user && logout && (
              <button
                type="button"
                onClick={logout}
                data-testid="logout-btn"
                className="w-8 h-8 rounded-[10px] flex items-center justify-center text-muted-foreground hover:text-negative hover:bg-negative/10 transition-colors focus-visible:ring-2 ring-ring/40"
                title="Logout"
                aria-label="Logout"
              >
                <LogOut className="w-4 h-4" />
              </button>
            )}
          </div>

          {collapsed && (
            <button
              type="button"
              data-testid="sidebar-expand-btn"
              onClick={() => setCollapsed(false)}
              className="w-8 h-8 rounded-[10px] flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-surface2 transition-colors focus-visible:ring-2 ring-ring/40"
              title="Expand Sidebar"
              aria-label="Expand Sidebar"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>
    </motion.aside>
  );
};
