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
  Plus,
  Search,
  Sun,
  Moon,
  LogOut,
} from 'lucide-react';
import { useNavigation } from '../../hooks/useNavigation';
import { getCurrentLocalMonth } from '../../utils/navigation';
import { Project } from '../../services/storage';

interface UserProfile {
  name?: string;
  email?: string;
  picture?: string;
}

export interface SidebarProps {
  user?: UserProfile | null;
  isMockMode?: boolean;
  activeProject: Project | null;
  theme?: 'light' | 'dark';
  toggleTheme?: () => void;
  onOpenCommandPalette?: () => void;
  logout?: () => void;
  onOpenAddTxn: () => void;
  isLockedMonth?: boolean;
  className?: string;
}

export const Sidebar: React.FC<SidebarProps> = ({
  user,
  isMockMode = false,
  activeProject,
  theme = 'dark',
  toggleTheme,
  onOpenCommandPalette,
  logout,
  onOpenAddTxn,
  isLockedMonth = false,
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

  const activeMonth = currentRoute.month || getCurrentLocalMonth();

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
      route: `#/transactions?month=${activeMonth}`,
      isActive: currentRoute.view === 'transactions',
    },
    {
      id: 'budgets',
      label: 'Budgets',
      icon: Target,
      route: `#/budgets?month=${activeMonth}`,
      isActive: currentRoute.view === 'budgets',
    },
    {
      id: 'trends',
      label: 'Trends',
      icon: BarChart3,
      route: `#/trends?month=${activeMonth}`,
      isActive: currentRoute.view === 'trends',
    },
    {
      id: 'reports',
      label: 'Reports',
      icon: FileText,
      route: `#/reports?month=${activeMonth}`,
      isActive: currentRoute.view === 'reports',
    },
  ];

  return (
    <motion.aside
      data-testid="sidebar"
      initial={false}
      animate={{ width: collapsed ? 64 : 244 }}
      transition={{ duration: 0.2, ease: [0.22, 1, 0.36, 1] }}
      className={`hidden md:flex flex-col shrink-0 border-r border-border bg-background z-30 select-none ${className}`}
    >
      {/* Top Workspace Header + Quick Add '+' + Collapse Toggle */}
      <div className="h-14 flex items-center justify-between gap-1.5 px-2.5 border-b border-border">
        <div
          className={`flex items-center gap-1 min-w-0 flex-1 ${
            collapsed ? 'hidden' : ''
          }`}
        >
          <span
            data-testid="project-selector"
            className="text-body font-semibold text-foreground truncate px-1.5"
          >
            {activeProject?.name || 'Workspace'}
          </span>
        </div>

        <div className="flex items-center gap-1 shrink-0">
          {activeProject && (
            <button
              type="button"
              data-testid="sidebar-add-txn-btn"
              disabled={isLockedMonth}
              onClick={() => {
                if (!isLockedMonth) onOpenAddTxn();
              }}
              className={`w-7 h-7 rounded-[8px] flex items-center justify-center bg-surface2 text-foreground border border-border transition-colors focus-visible:ring-2 ring-ring/40 ${
                isLockedMonth
                  ? 'opacity-50 cursor-not-allowed'
                  : 'hover:bg-secondary'
              }`}
              title={isLockedMonth ? 'Month is locked' : 'Add Transaction (N)'}
              aria-label="Add Transaction"
            >
              <Plus className="w-4 h-4" />
            </button>
          )}

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
        {activeProject &&
          navItems.map(item => {
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

      {/* Bottom Cluster: Search ⌘K, Settings, Theme, User & Logout */}
      <div className="px-2.5 py-2.5 border-t border-border space-y-1">
        {activeProject && onOpenCommandPalette && (
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

        {activeProject && (
          <button
            type="button"
            data-testid="nav-item-settings"
            onClick={() => navigate(`#/settings?month=${activeMonth}`)}
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
        )}

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
                {isMockMode ? (
                  <span
                    data-testid="mock-banner"
                    className="mock-mode-banner text-label text-muted-foreground truncate block"
                    title="Demo data (Mock Mode)"
                  >
                    Mock Mode
                  </span>
                ) : (
                  user.email && (
                    <div className="text-label text-muted-foreground truncate">
                      {user.email}
                    </div>
                  )
                )}
              </div>
            </div>
          )}

          <div className="flex items-center gap-0.5 shrink-0">
            {toggleTheme && (
              <button
                type="button"
                onClick={toggleTheme}
                data-testid="theme-toggle-btn"
                className="w-7 h-7 rounded-[8px] flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-surface2 transition-colors focus-visible:ring-2 ring-ring/40"
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

            {user && logout && (
              <button
                type="button"
                onClick={logout}
                data-testid="logout-btn"
                className="w-7 h-7 rounded-[8px] flex items-center justify-center text-muted-foreground hover:text-negative hover:bg-negative/10 transition-colors focus-visible:ring-2 ring-ring/40"
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
