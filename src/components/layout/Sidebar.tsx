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
  Sparkles
} from 'lucide-react';
import { useNavigation } from '../../hooks/useNavigation';
import { getCurrentLocalMonth } from '../../utils/navigation';
import { Project } from '../../services/storage';

interface SidebarProps {
  activeProject: Project | null;
  onOpenAddTxn: () => void;
  className?: string;
}

export const Sidebar: React.FC<SidebarProps> = ({
  activeProject,
  onOpenAddTxn,
  className = ''
}) => {
  const { currentRoute, navigate } = useNavigation();

  // Persist sidebar collapsed state
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
      label: 'Month Overview',
      icon: LayoutDashboard,
      route: `#/month/${activeMonth}`,
      isActive: currentRoute.view === 'overview' || currentRoute.view === 'bucket' || currentRoute.view === 'category'
    },
    {
      id: 'transactions',
      label: 'Transactions',
      icon: Receipt,
      route: `#/transactions?month=${activeMonth}`,
      isActive: currentRoute.view === 'transactions'
    },
    {
      id: 'budgets',
      label: 'Budgets & Planning',
      icon: Target,
      route: `#/budgets?month=${activeMonth}`,
      isActive: currentRoute.view === 'budgets'
    },
    {
      id: 'trends',
      label: 'Trends & Analytics',
      icon: BarChart3,
      route: `#/trends?month=${activeMonth}`,
      isActive: currentRoute.view === 'trends'
    },
    {
      id: 'reports',
      label: 'Reports & Statement',
      icon: FileText,
      route: `#/reports?month=${activeMonth}`,
      isActive: currentRoute.view === 'reports'
    },
    {
      id: 'settings',
      label: 'Settings & Projects',
      icon: Settings,
      route: `#/settings?month=${activeMonth}`,
      isActive: currentRoute.view === 'settings'
    }
  ];

  return (
    <motion.aside
      data-testid="sidebar"
      initial={false}
      animate={{ width: collapsed ? 72 : 240 }}
      transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
      className={`hidden md:flex flex-col shrink-0 border-r border-border/40 bg-card/60 backdrop-blur-xl z-30 select-none ${className}`}
    >
      {/* Top Header / Branding */}
      <div className="h-16 flex items-center justify-between px-4 border-b border-border/40">
        {!collapsed && (
          <div className="flex items-center gap-2.5 overflow-hidden">
            <div className="w-8 h-8 rounded-xl bg-gradient-to-tr from-primary to-emerald-400 flex items-center justify-center text-primary-foreground font-bold shadow-md shadow-primary/20 shrink-0">
              <Sparkles className="w-4 h-4" />
            </div>
            <div className="flex flex-col truncate">
              <span className="font-extrabold text-sm tracking-tight text-foreground truncate">Nebula Finance</span>
              <span className="text-[10px] text-muted-foreground truncate">{activeProject?.name || 'Personal'}</span>
            </div>
          </div>
        )}

        {collapsed && (
          <div className="mx-auto w-8 h-8 rounded-xl bg-gradient-to-tr from-primary to-emerald-400 flex items-center justify-center text-primary-foreground font-bold shadow-md shadow-primary/20 shrink-0">
            <Sparkles className="w-4 h-4" />
          </div>
        )}

        <button
          type="button"
          data-testid="sidebar-toggle-btn"
          onClick={() => setCollapsed(prev => !prev)}
          className={`p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-secondary/80 transition-colors ${collapsed ? 'hidden' : 'block'}`}
          title={collapsed ? 'Expand Sidebar' : 'Collapse Sidebar'}
          aria-label={collapsed ? 'Expand Sidebar' : 'Collapse Sidebar'}
        >
          <ChevronLeft className="w-4 h-4" />
        </button>
      </div>

      {/* Quick Action Button */}
      <div className="p-3">
        <button
          type="button"
          data-testid="sidebar-add-txn-btn"
          onClick={onOpenAddTxn}
          className={`w-full flex items-center justify-center gap-2 py-2.5 px-3 rounded-xl font-bold text-xs bg-primary hover:bg-primary/90 text-primary-foreground shadow-md shadow-primary/25 transition-all active:scale-95 ${
            collapsed ? 'px-0' : ''
          }`}
          title="Add Transaction"
        >
          <Plus className="w-4 h-4 shrink-0" />
          {!collapsed && <span>Add Transaction</span>}
        </button>
      </div>

      {/* Nav List */}
      <nav className="flex-1 px-2.5 py-2 space-y-1 overflow-y-auto custom-scrollbar">
        {navItems.map((item) => {
          const Icon = item.icon;
          return (
            <button
              key={item.id}
              type="button"
              data-testid={`nav-item-${item.id}`}
              onClick={() => navigate(item.route)}
              className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-xs font-semibold transition-all group ${
                item.isActive
                  ? 'bg-primary/15 text-primary border border-primary/20 shadow-sm'
                  : 'text-muted-foreground hover:text-foreground hover:bg-secondary/60 border border-transparent'
              } ${collapsed ? 'justify-center px-0' : ''}`}
              title={collapsed ? item.label : undefined}
            >
              <Icon className={`w-4 h-4 shrink-0 transition-transform group-hover:scale-110 ${item.isActive ? 'text-primary' : 'text-muted-foreground group-hover:text-foreground'}`} />
              {!collapsed && <span className="truncate">{item.label}</span>}
            </button>
          );
        })}
      </nav>

      {/* Bottom Rail Toggle (when collapsed) */}
      {collapsed && (
        <div className="p-2 border-t border-border/40 flex justify-center">
          <button
            type="button"
            data-testid="sidebar-expand-btn"
            onClick={() => setCollapsed(false)}
            className="p-2 rounded-xl text-muted-foreground hover:text-foreground hover:bg-secondary/80 transition-colors"
            title="Expand Sidebar"
            aria-label="Expand Sidebar"
          >
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>
      )}
    </motion.aside>
  );
};
