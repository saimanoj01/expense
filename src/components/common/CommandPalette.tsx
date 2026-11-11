import React, { useState, useEffect, useMemo, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  Search, 
  LayoutDashboard, 
  Receipt, 
  Target, 
  BarChart3, 
  FileText, 
  Settings, 
  Plus, 
  Upload, 
  SunMoon, 
  Lock, 
  X
} from 'lucide-react';
import { useNavigation } from '../../hooks/useNavigation';
import { getCurrentLocalMonth } from '../../utils/navigation';
import { Category } from '../../services/storage';

export interface CommandPaletteProps {
  isOpen: boolean;
  onClose: () => void;
  categories: Category[];
  onOpenAddTxn: () => void;
  onOpenCsvImport: () => void;
  onToggleTheme: () => void;
  onToggleLockMonth?: () => void;
  isMonthLocked?: boolean;
}

interface CommandItem {
  id: string;
  title: string;
  subtitle?: string;
  icon: React.ComponentType<{ className?: string }>;
  category: 'Views' | 'Drill Down' | 'Categories' | 'Actions';
  action: () => void;
  keywords?: string[];
}

export const CommandPalette: React.FC<CommandPaletteProps> = ({
  isOpen,
  onClose,
  categories,
  onOpenAddTxn,
  onOpenCsvImport,
  onToggleTheme,
  onToggleLockMonth,
  isMonthLocked
}) => {
  const { currentRoute, navigate } = useNavigation();
  const [query, setQuery] = useState('');
  const [selectedIndex, setSelectedIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  const activeMonth = currentRoute.month || getCurrentLocalMonth();

  // Focus input when opened
  useEffect(() => {
    if (isOpen) {
      setQuery('');
      setSelectedIndex(0);
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [isOpen]);

  const items: CommandItem[] = useMemo(() => {
    const list: CommandItem[] = [
      // Views
      {
        id: 'view-overview',
        title: 'Month Overview',
        subtitle: `Jump to ${activeMonth} overview`,
        icon: LayoutDashboard,
        category: 'Views',
        keywords: ['home', 'dashboard', 'summary'],
        action: () => navigate(`#/month/${activeMonth}`)
      },
      {
        id: 'view-transactions',
        title: 'Transactions Ledger',
        subtitle: 'View and filter all transactions',
        icon: Receipt,
        category: 'Views',
        keywords: ['expenses', 'ledger', 'history', 'txns'],
        action: () => navigate(`#/transactions?month=${activeMonth}`)
      },
      {
        id: 'view-budgets',
        title: 'Budgets & Planning',
        subtitle: 'Manage monthly spending caps',
        icon: Target,
        category: 'Views',
        keywords: ['targets', 'caps', 'allocation'],
        action: () => navigate(`#/budgets?month=${activeMonth}`)
      },
      {
        id: 'view-trends',
        title: 'Trends & Analytics',
        subtitle: 'Cumulative pacing and multi-month cash flow',
        icon: BarChart3,
        category: 'Views',
        keywords: ['charts', 'graphs', 'visual', 'pacing'],
        action: () => navigate(`#/trends?month=${activeMonth}`)
      },
      {
        id: 'view-reports',
        title: 'Reports & Monthly Statement',
        subtitle: 'Executive summary and printable statement',
        icon: FileText,
        category: 'Views',
        keywords: ['pdf', 'print', 'statement', 'export'],
        action: () => navigate(`#/reports?month=${activeMonth}`)
      },
      {
        id: 'view-settings',
        title: 'Settings & Workspace',
        subtitle: 'Manage workspace, categories, and imports',
        icon: Settings,
        category: 'Views',
        keywords: ['config', 'preferences', 'workspace'],
        action: () => navigate(`#/settings?month=${activeMonth}`)
      },

      // Drill Down Buckets
      {
        id: 'bucket-fixed',
        title: 'Drill into Fixed Commitments',
        subtitle: 'Inspect housing, utilities, subscriptions',
        icon: Target,
        category: 'Drill Down',
        keywords: ['fixed', 'recurring', 'bills', 'rent'],
        action: () => navigate(`#/month/${activeMonth}/bucket/fixed`)
      },
      {
        id: 'bucket-variable',
        title: 'Drill into Variable Spending',
        subtitle: 'Inspect groceries, dining, day-to-day shopping',
        icon: Target,
        category: 'Drill Down',
        keywords: ['variable', 'flexible', 'food', 'dining'],
        action: () => navigate(`#/month/${activeMonth}/bucket/variable`)
      },
      {
        id: 'bucket-non-monthly',
        title: 'Drill into Non-Monthly Irregular',
        subtitle: 'Inspect maintenance, taxes, seasonal spend',
        icon: Target,
        category: 'Drill Down',
        keywords: ['irregular', 'annual', 'periodic'],
        action: () => navigate(`#/month/${activeMonth}/bucket/non-monthly`)
      },
      {
        id: 'bucket-income',
        title: 'Drill into Inflow & Income',
        subtitle: 'Inspect salaries and incoming streams',
        icon: Target,
        category: 'Drill Down',
        keywords: ['income', 'salary', 'inflow', 'revenue'],
        action: () => navigate(`#/month/${activeMonth}/bucket/income`)
      },

      // Actions
      {
        id: 'action-add-txn',
        title: 'Add New Transaction',
        subtitle: 'Record an expense or income',
        icon: Plus,
        category: 'Actions',
        keywords: ['new', 'create', 'spend'],
        action: onOpenAddTxn
      },
      {
        id: 'action-import-csv',
        title: 'Import CSV File',
        subtitle: 'Upload bank statement with auto-categorization',
        icon: Upload,
        category: 'Actions',
        keywords: ['csv', 'upload', 'bank', 'statement'],
        action: onOpenCsvImport
      },
      {
        id: 'action-toggle-theme',
        title: 'Toggle Dark / Light Theme',
        subtitle: 'Switch application color mode',
        icon: SunMoon,
        category: 'Actions',
        keywords: ['theme', 'mode', 'dark', 'light'],
        action: onToggleTheme
      }
    ];

    if (onToggleLockMonth) {
      list.push({
        id: 'action-toggle-lock',
        title: isMonthLocked ? 'Unlock Current Month' : 'Lock Current Month',
        subtitle: isMonthLocked ? 'Re-enable editing for this month' : 'Freeze transactions for this month',
        icon: Lock,
        category: 'Actions',
        keywords: ['lock', 'freeze', 'unlock', 'close'],
        action: onToggleLockMonth
      });
    }

    // Categories
    categories.forEach(cat => {
      list.push({
        id: `cat-${cat.id}`,
        title: `${cat.emoji ? cat.emoji + ' ' : ''}${cat.name}`,
        subtitle: `Inspect ${cat.name} spending velocity & history`,
        icon: LayoutDashboard,
        category: 'Categories',
        keywords: [cat.name.toLowerCase(), cat.id.toLowerCase(), 'category'],
        action: () => navigate(`#/month/${activeMonth}/category/${cat.id}`)
      });
    });

    return list;
  }, [
    activeMonth, 
    navigate, 
    onOpenAddTxn, 
    onOpenCsvImport, 
    onToggleTheme, 
    onToggleLockMonth, 
    isMonthLocked, 
    categories
  ]);

  // Filter items
  const filteredItems = useMemo(() => {
    if (!query.trim()) return items;
    const q = query.toLowerCase().trim();
    return items.filter(item => {
      if (item.title.toLowerCase().includes(q)) return true;
      if (item.subtitle && item.subtitle.toLowerCase().includes(q)) return true;
      if (item.keywords && item.keywords.some(k => k.includes(q))) return true;
      return false;
    });
  }, [items, query]);

  // Keep selected index in bounds
  useEffect(() => {
    setSelectedIndex(0);
  }, [query]);

  // Keyboard controls
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSelectedIndex(prev => (prev + 1) % Math.max(1, filteredItems.length));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSelectedIndex(prev => (prev - 1 + filteredItems.length) % Math.max(1, filteredItems.length));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      const selected = filteredItems[selectedIndex];
      if (selected) {
        onClose();
        selected.action();
      }
    } else if (e.key === 'Escape') {
      e.preventDefault();
      onClose();
    }
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-50 flex items-start justify-center pt-20 px-4">
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="fixed inset-0 bg-background/70 backdrop-blur-md"
          />

          {/* Palette Dialog */}
          <motion.div
            data-testid="command-palette-modal"
            role="dialog"
            aria-modal="true"
            aria-label="Command Palette"
            initial={{ opacity: 0, scale: 0.96, y: -10 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.96, y: -10 }}
            transition={{ duration: 0.15 }}
            className="relative w-full max-w-xl bg-card border border-border/70 rounded-2xl shadow-2xl overflow-hidden flex flex-col z-10"
          >
            {/* Search Input Bar */}
            <div className="flex items-center gap-3 px-4 py-3.5 border-b border-border/50 bg-secondary/20">
              <Search className="w-5 h-5 text-muted-foreground shrink-0" />
              <input
                ref={inputRef}
                type="text"
                data-testid="command-palette-input"
                value={query}
                onChange={e => setQuery(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="Search views, drill-down buckets, categories, or actions..."
                className="w-full bg-transparent text-foreground placeholder:text-muted-foreground text-sm font-medium outline-none"
              />
              {query && (
                <button
                  type="button"
                  onClick={() => setQuery('')}
                  className="p-1 rounded-md text-muted-foreground hover:text-foreground"
                >
                  <X className="w-4 h-4" />
                </button>
              )}
              <kbd className="hidden sm:inline-block px-1.5 py-0.5 text-label font-mono rounded bg-secondary text-muted-foreground border border-border/40">
                ESC
              </kbd>
            </div>

            {/* List Results */}
            <div 
              ref={listRef}
              className="max-h-80 overflow-y-auto custom-scrollbar p-2 space-y-1"
            >
              {filteredItems.length === 0 ? (
                <div className="py-8 text-center text-muted-foreground text-xs">
                  No matching commands or categories found.
                </div>
              ) : (
                filteredItems.map((item, index) => {
                  const isSelected = index === selectedIndex;
                  const Icon = item.icon;

                  return (
                    <button
                      key={item.id}
                      type="button"
                      data-testid={`command-item-${item.id}`}
                      onClick={() => {
                        onClose();
                        item.action();
                      }}
                      onMouseEnter={() => setSelectedIndex(index)}
                      className={`w-full flex items-center justify-between px-3 py-2.5 rounded-xl text-left text-xs transition-colors ${
                        isSelected 
                          ? 'bg-primary/15 text-primary border border-primary/20' 
                          : 'text-foreground hover:bg-secondary/60 border border-transparent'
                      }`}
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <div className={`p-1.5 rounded-lg shrink-0 ${isSelected ? 'bg-primary text-primary-foreground' : 'bg-secondary text-muted-foreground'}`}>
                          <Icon className="w-4 h-4" />
                        </div>
                        <div className="min-w-0 truncate">
                          <p className="font-semibold truncate">{item.title}</p>
                          {item.subtitle && (
                            <p className="text-label text-muted-foreground truncate">{item.subtitle}</p>
                          )}
                        </div>
                      </div>

                      <span className="text-label font-mono px-1.5 py-0.5 rounded bg-secondary/80 text-muted-foreground shrink-0 border border-border/30">
                        {item.category}
                      </span>
                    </button>
                  );
                })
              )}
            </div>

            {/* Footer Navigation Hints */}
            <div className="px-4 py-2 border-t border-border/40 bg-secondary/30 flex items-center justify-between text-label text-muted-foreground">
              <div className="flex items-center gap-3">
                <span className="flex items-center gap-1">
                  <kbd className="px-1 py-0.5 rounded bg-secondary text-label font-mono border border-border/50">↑</kbd>
                  <kbd className="px-1 py-0.5 rounded bg-secondary text-label font-mono border border-border/50">↓</kbd>
                  <span>Navigate</span>
                </span>
                <span className="flex items-center gap-1">
                  <kbd className="px-1.5 py-0.5 rounded bg-secondary text-label font-mono border border-border/50">↵</kbd>
                  <span>Select</span>
                </span>
              </div>
              <span className="text-label">Command Palette</span>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
};
