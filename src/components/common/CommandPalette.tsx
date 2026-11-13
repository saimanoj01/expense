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
  Download,
  FolderPlus,
  Tags,
  AlertCircle,
  SunMoon,
  Lock,
  X,
} from 'lucide-react';
import { useNavigation } from '../../hooks/useNavigation';
import { formatMonthLabel, getCurrentLocalMonth } from '../../utils/navigation';
import { isNonBudgetableCategory } from '../../utils/metrics';
import type { Category } from '../../services/storage';

export interface CommandPaletteProps {
  isOpen: boolean;
  onClose: () => void;
  categories: Category[];
  onOpenAddTxn: () => void;
  onOpenCsvImport: () => void;
  onToggleTheme: () => void;
  onToggleLockMonth?: () => void;
  isMonthLocked?: boolean;
  onOpenCategoryManager?: () => void;
  onOpenCreateProject?: () => void;
  onExportWorkspaceJson?: () => void;
  onExportFullCsv?: () => void;
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
  isMonthLocked,
  onOpenCategoryManager,
  onOpenCreateProject,
  onExportWorkspaceJson,
  onExportFullCsv,
}) => {
  const { currentRoute, navigate } = useNavigation();
  const [query, setQuery] = useState('');
  const [selectedIndex, setSelectedIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  const activeMonth = currentRoute.month || getCurrentLocalMonth();
  const formattedMonth = formatMonthLabel(activeMonth);

  useEffect(() => {
    if (!isOpen) return;
    setQuery('');
    setSelectedIndex(0);
    const raf = requestAnimationFrame(() => inputRef.current?.focus());
    const handleWindowEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        onClose();
      }
    };
    window.addEventListener('keydown', handleWindowEscape, true);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('keydown', handleWindowEscape, true);
    };
  }, [isOpen, onClose]);

  const items: CommandItem[] = useMemo(() => {
    const list: CommandItem[] = [
      // Views
      {
        id: 'view-overview',
        title: 'Month Overview',
        subtitle: `Jump to ${formattedMonth} overview`,
        icon: LayoutDashboard,
        category: 'Views',
        keywords: ['home', 'dashboard', 'summary'],
        action: () => navigate(`#/month/${activeMonth}`),
      },
      {
        id: 'view-transactions',
        title: 'Transactions Ledger',
        subtitle: `View and filter ${formattedMonth} transactions`,
        icon: Receipt,
        category: 'Views',
        keywords: ['expenses', 'ledger', 'history', 'txns'],
        action: () => navigate(`#/transactions?month=${activeMonth}`),
      },
      {
        id: 'view-budgets',
        title: 'Budgets & Planning',
        subtitle: 'Manage monthly spending caps',
        icon: Target,
        category: 'Views',
        keywords: ['targets', 'caps', 'allocation'],
        action: () => navigate(`#/budgets?month=${activeMonth}`),
      },
      {
        id: 'view-trends',
        title: 'Trends & Analytics',
        subtitle: 'Multi-horizon cash flow, category momentum, and top merchants',
        icon: BarChart3,
        category: 'Views',
        keywords: ['charts', 'graphs', 'visual', 'pacing', 'horizon'],
        action: () => navigate(`#/trends?month=${activeMonth}`),
      },
      {
        id: 'view-trends-all',
        title: 'All-Time Cash Flow Trends',
        subtitle: 'Inspect complete workspace history across all months',
        icon: BarChart3,
        category: 'Views',
        keywords: ['all time', 'history', 'cash flow', 'lifetime'],
        action: () => navigate('#/trends?month=all'),
      },
      {
        id: 'view-reports',
        title: 'Reports & Monthly Statement',
        subtitle: 'Executive summary and printable statement',
        icon: FileText,
        category: 'Views',
        keywords: ['pdf', 'print', 'statement', 'export'],
        action: () => navigate(`#/reports?month=${activeMonth}`),
      },
      {
        id: 'view-settings',
        title: 'Settings & Workspace',
        subtitle: 'Manage workspace, data store backups, and categories',
        icon: Settings,
        category: 'Views',
        keywords: ['config', 'preferences', 'workspace', 'backup', 'json'],
        action: () => navigate(`#/settings?month=${activeMonth}`),
      },

      // Drill Down Buckets
      {
        id: 'bucket-fixed',
        title: 'Drill into Fixed Commitments',
        subtitle: 'Inspect housing, utilities, subscriptions',
        icon: Target,
        category: 'Drill Down',
        keywords: ['fixed', 'recurring', 'bills', 'rent'],
        action: () => navigate(`#/month/${activeMonth}/bucket/fixed`),
      },
      {
        id: 'bucket-variable',
        title: 'Drill into Variable Spending',
        subtitle: 'Inspect groceries, dining, day-to-day shopping',
        icon: Target,
        category: 'Drill Down',
        keywords: ['variable', 'flexible', 'food', 'dining'],
        action: () => navigate(`#/month/${activeMonth}/bucket/variable`),
      },
      {
        id: 'bucket-non-monthly',
        title: 'Drill into Non-Monthly Irregular',
        subtitle: 'Inspect maintenance, taxes, seasonal spend',
        icon: Target,
        category: 'Drill Down',
        keywords: ['irregular', 'annual', 'periodic'],
        action: () => navigate(`#/month/${activeMonth}/bucket/non-monthly`),
      },
      {
        id: 'bucket-income',
        title: 'Drill into Inflow & Income',
        subtitle: 'Inspect salaries and incoming streams',
        icon: Target,
        category: 'Drill Down',
        keywords: ['income', 'salary', 'inflow', 'revenue'],
        action: () => navigate(`#/month/${activeMonth}/bucket/income`),
      },

      // Actions
      {
        id: 'action-add-txn',
        title: 'Add New Transaction',
        subtitle: 'Record an expense, income, or transfer',
        icon: Plus,
        category: 'Actions',
        keywords: ['new', 'create', 'spend'],
        action: onOpenAddTxn,
      },
      {
        id: 'action-review-queue',
        title: 'Review Flagged Transactions',
        subtitle: 'Open triage queue for needs-review and duplicate items',
        icon: AlertCircle,
        category: 'Actions',
        keywords: ['review', 'triage', 'flagged', 'duplicates'],
        action: () => navigate('#/transactions?month=all&review=1'),
      },
      {
        id: 'action-import-csv',
        title: 'Import CSV File',
        subtitle: 'Upload bank statement with auto-categorization',
        icon: Upload,
        category: 'Actions',
        keywords: ['csv', 'upload', 'bank', 'statement'],
        action: onOpenCsvImport,
      },
    ];

    if (onExportWorkspaceJson) {
      list.push({
        id: 'action-export-json',
        title: 'Export Workspace Backup JSON',
        subtitle: 'Download lossless v1 workspace snapshot (--state-file compatible)',
        icon: Download,
        category: 'Actions',
        keywords: ['export', 'backup', 'json', 'snapshot', 'state-file'],
        action: onExportWorkspaceJson,
      });
    }

    if (onExportFullCsv) {
      list.push({
        id: 'action-export-csv',
        title: 'Export Full Ledger CSV',
        subtitle: 'Download normalized 10-column CSV of all transactions',
        icon: Download,
        category: 'Actions',
        keywords: ['export', 'csv', 'ledger', 'spreadsheet'],
        action: onExportFullCsv,
      });
    }

    if (onOpenCategoryManager) {
      list.push({
        id: 'action-manage-categories',
        title: 'Manage Categories',
        subtitle: 'Add, edit, or organize categories and sub-categories',
        icon: Tags,
        category: 'Actions',
        keywords: ['categories', 'taxonomy', 'buckets'],
        action: onOpenCategoryManager,
      });
    }

    if (onOpenCreateProject) {
      list.push({
        id: 'action-create-workspace',
        title: 'Create New Workspace',
        subtitle: 'Start an isolated financial workspace',
        icon: FolderPlus,
        category: 'Actions',
        keywords: ['workspace', 'project', 'new'],
        action: onOpenCreateProject,
      });
    }

    list.push({
      id: 'action-toggle-theme',
      title: 'Toggle Dark / Light Theme',
      subtitle: 'Switch application color mode',
      icon: SunMoon,
      category: 'Actions',
      keywords: ['theme', 'mode', 'dark', 'light'],
      action: onToggleTheme,
    });

    if (onToggleLockMonth && activeMonth !== 'all') {
      list.push({
        id: 'action-toggle-lock',
        title: isMonthLocked ? `Unlock ${formattedMonth}` : `Lock ${formattedMonth}`,
        subtitle: isMonthLocked
          ? 'Re-enable editing for this month'
          : 'Freeze transactions for this month',
        icon: Lock,
        category: 'Actions',
        keywords: ['lock', 'freeze', 'unlock', 'close'],
        action: onToggleLockMonth,
      });
    }

    // Expense Categories (exclude non-budgetable income & transfers)
    const parentMap = new Map<string, Category>();
    categories.forEach(c => {
      if (!c.parentId) parentMap.set(c.id, c);
    });

    categories.forEach(cat => {
      if (isNonBudgetableCategory(cat.id) || isNonBudgetableCategory(cat.name)) {
        return;
      }
      const parent = cat.parentId ? parentMap.get(cat.parentId) : undefined;
      if (parent && (isNonBudgetableCategory(parent.id) || isNonBudgetableCategory(parent.name))) {
        return;
      }
      const displayName = parent ? `${parent.name} › ${cat.name}` : cat.name;
      const targetCatId = parent ? parent.id : cat.id;

      list.push({
        id: `cat-${cat.id}`,
        title: `${cat.emoji ? cat.emoji + ' ' : ''}${displayName}`,
        subtitle: `Inspect ${displayName} spending velocity & history`,
        icon: LayoutDashboard,
        category: 'Categories',
        keywords: [
          cat.name.toLowerCase(),
          cat.id.toLowerCase(),
          parent?.name.toLowerCase() || '',
          'category',
        ].filter(Boolean),
        action: () =>
          navigate(`#/month/${activeMonth}/category/${encodeURIComponent(targetCatId)}`),
      });
    });

    return list;
  }, [
    activeMonth,
    formattedMonth,
    navigate,
    onOpenAddTxn,
    onOpenCsvImport,
    onExportWorkspaceJson,
    onExportFullCsv,
    onOpenCategoryManager,
    onOpenCreateProject,
    onToggleTheme,
    onToggleLockMonth,
    isMonthLocked,
    categories,
  ]);

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

  useEffect(() => {
    setSelectedIndex(0);
  }, [query]);

  // Keep active command item scrolled into view during ArrowUp / ArrowDown navigation
  useEffect(() => {
    if (!isOpen || !listRef.current) return;
    const activeEl = listRef.current.querySelector<HTMLElement>(
      `[data-cmd-idx="${selectedIndex}"]`
    );
    activeEl?.scrollIntoView({ block: 'nearest' });
  }, [selectedIndex, isOpen]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSelectedIndex(prev => (prev + 1) % Math.max(1, filteredItems.length));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSelectedIndex(
        prev => (prev - 1 + filteredItems.length) % Math.max(1, filteredItems.length)
      );
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
        <div className="print:hidden fixed inset-0 z-50 flex items-start justify-center pt-16 sm:pt-20 px-4">
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="fixed inset-0 bg-background/70 backdrop-blur-sm"
          />

          {/* Palette Dialog */}
          <motion.div
            data-testid="command-palette-modal"
            role="dialog"
            aria-modal="true"
            aria-label="Command Palette"
            initial={{ opacity: 0, scale: 0.97, y: -8 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.97, y: -8 }}
            transition={{ duration: 0.14 }}
            className="relative w-full max-w-xl bg-card border border-border rounded-[14px] shadow-2xl overflow-hidden flex flex-col z-10"
          >
            {/* Search Input Bar */}
            <div className="flex items-center gap-3 px-4 py-3 border-b border-border bg-surface2/50">
              <Search className="w-4 h-4 text-muted-foreground shrink-0" />
              <input
                ref={inputRef}
                type="text"
                data-testid="command-palette-input"
                value={query}
                onChange={e => setQuery(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="Search views, buckets, categories, or actions…"
                className="w-full bg-transparent text-foreground placeholder:text-muted-foreground text-body font-medium outline-none"
              />
              {query && (
                <button
                  type="button"
                  aria-label="Clear search"
                  onClick={() => setQuery('')}
                  className="p-1 rounded-[8px] text-muted-foreground hover:text-foreground"
                >
                  <X className="w-4 h-4" />
                </button>
              )}
              <kbd className="hidden sm:inline-block px-1.5 py-0.5 text-label rounded bg-surface2 text-muted-foreground border border-border">
                ESC
              </kbd>
            </div>

            {/* List Results */}
            <div
              ref={listRef}
              className="max-h-80 overflow-y-auto custom-scrollbar p-2 space-y-1"
            >
              {filteredItems.length === 0 ? (
                <div className="py-8 text-center text-muted-foreground text-label">
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
                      data-cmd-idx={index}
                      data-testid={`command-item-${item.id}`}
                      onClick={() => {
                        onClose();
                        item.action();
                      }}
                      onMouseEnter={() => setSelectedIndex(index)}
                      className={`w-full flex items-center justify-between gap-3 px-3 py-2.5 rounded-[10px] text-left transition-colors ${
                        isSelected
                          ? 'bg-surface2 text-foreground border border-border'
                          : 'text-foreground hover:bg-surface2/60 border border-transparent'
                      }`}
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <div
                          className={`p-1.5 rounded-[8px] shrink-0 ${
                            isSelected
                              ? 'bg-primary text-primary-foreground'
                              : 'bg-surface2 text-muted-foreground'
                          }`}
                        >
                          <Icon className="w-4 h-4" />
                        </div>
                        <div className="min-w-0 truncate">
                          <p className="text-body font-medium truncate">{item.title}</p>
                          {item.subtitle && (
                            <p className="text-label text-muted-foreground truncate">
                              {item.subtitle}
                            </p>
                          )}
                        </div>
                      </div>

                      <span className="text-label px-1.5 py-0.5 rounded bg-surface2 text-muted-foreground shrink-0 border border-border/60">
                        {item.category}
                      </span>
                    </button>
                  );
                })
              )}
            </div>

            {/* Footer Navigation Hints */}
            <div className="px-4 py-2 border-t border-border bg-surface2/40 flex items-center justify-between text-label text-muted-foreground">
              <div className="flex items-center gap-3">
                <span className="flex items-center gap-1">
                  <kbd className="px-1 py-0.5 rounded bg-surface2 text-label border border-border">
                    ↑
                  </kbd>
                  <kbd className="px-1 py-0.5 rounded bg-surface2 text-label border border-border">
                    ↓
                  </kbd>
                  <span>Navigate</span>
                </span>
                <span className="flex items-center gap-1">
                  <kbd className="px-1.5 py-0.5 rounded bg-surface2 text-label border border-border">
                    ↵
                  </kbd>
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
