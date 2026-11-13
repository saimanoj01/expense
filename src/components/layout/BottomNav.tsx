import React, { useState, useEffect } from 'react';
import {
  LayoutDashboard,
  Receipt,
  Plus,
  Target,
  MoreHorizontal,
  BarChart3,
  FileText,
  Settings,
  X,
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { useNavigation } from '../../hooks/useNavigation';
import { getCurrentLocalMonth } from '../../utils/navigation';

interface BottomNavProps {
  onOpenAddTxn: () => void;
  className?: string;
}

export const BottomNav: React.FC<BottomNavProps> = ({
  onOpenAddTxn,
  className = '',
}) => {
  const { currentRoute, navigate } = useNavigation();
  const [showMoreMenu, setShowMoreMenu] = useState(false);

  const activeMonth = currentRoute.month || getCurrentLocalMonth();
  const isOverview =
    currentRoute.view === 'overview' ||
    currentRoute.view === 'bucket' ||
    currentRoute.view === 'category';

  // Guardrail G2: Close drawer on Escape with stopPropagation so NavigationContext.goBack() does not fire
  useEffect(() => {
    if (!showMoreMenu) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        setShowMoreMenu(false);
      }
    };
    window.addEventListener('keydown', handleKeyDown, true);
    return () => window.removeEventListener('keydown', handleKeyDown, true);
  }, [showMoreMenu]);

  return (
    <>
      <nav
        data-testid="bottom-nav"
        className={`print:hidden md:hidden fixed bottom-0 left-0 right-0 z-40 bg-background/90 backdrop-blur-2xl border-t border-border/40 px-2 pt-1 pb-[max(env(safe-area-inset-bottom),0.5rem)] shadow-lg ${className}`}
        aria-label="Mobile Navigation"
      >
        <div className="flex items-center justify-around h-14">
          {/* 1. Overview */}
          <button
            type="button"
            data-testid="bottom-nav-overview"
            onClick={() => {
              setShowMoreMenu(false);
              navigate(`#/month/${activeMonth}`);
            }}
            className={`flex flex-col items-center justify-center flex-1 py-1 text-label font-medium transition-colors ${
              isOverview ? 'text-foreground' : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            <LayoutDashboard className={`w-5 h-5 mb-0.5 ${isOverview ? 'text-foreground' : ''}`} />
            <span>Overview</span>
          </button>

          {/* 2. Transactions */}
          <button
            type="button"
            data-testid="bottom-nav-transactions"
            onClick={() => {
              setShowMoreMenu(false);
              navigate(`#/transactions?month=${activeMonth}`);
            }}
            className={`flex flex-col items-center justify-center flex-1 py-1 text-label font-medium transition-colors ${
              currentRoute.view === 'transactions'
                ? 'text-foreground'
                : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            <Receipt
              className={`w-5 h-5 mb-0.5 ${
                currentRoute.view === 'transactions' ? 'text-foreground' : ''
              }`}
            />
            <span>Txns</span>
          </button>

          {/* 3. Center Quick Add Button */}
          <div className="flex-1 flex justify-center -mt-4">
            <button
              type="button"
              data-testid="bottom-nav-add"
              onClick={onOpenAddTxn}
              className="w-11 h-11 rounded-full bg-primary text-primary-foreground border border-border flex items-center justify-center shadow-sm hover:opacity-90 active:scale-95 transition-all"
              aria-label="Add Transaction"
              title="Add Transaction"
            >
              <Plus className="w-5 h-5 stroke-[2.2]" />
            </button>
          </div>

          {/* 4. Budgets */}
          <button
            type="button"
            data-testid="bottom-nav-budgets"
            onClick={() => {
              setShowMoreMenu(false);
              navigate(`#/budgets?month=${activeMonth}`);
            }}
            className={`flex flex-col items-center justify-center flex-1 py-1 text-label font-medium transition-colors ${
              currentRoute.view === 'budgets'
                ? 'text-foreground'
                : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            <Target
              className={`w-5 h-5 mb-0.5 ${
                currentRoute.view === 'budgets' ? 'text-foreground' : ''
              }`}
            />
            <span>Budgets</span>
          </button>

          {/* 5. More */}
          <button
            type="button"
            data-testid="bottom-nav-more"
            aria-expanded={showMoreMenu}
            onClick={() => setShowMoreMenu(prev => !prev)}
            className={`flex flex-col items-center justify-center flex-1 py-1 text-label font-medium transition-colors ${
              showMoreMenu || ['trends', 'reports', 'settings'].includes(currentRoute.view)
                ? 'text-foreground'
                : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            <MoreHorizontal className="w-5 h-5 mb-0.5" />
            <span>More</span>
          </button>
        </div>
      </nav>

      {/* Slide-up "More" Drawer for Mobile */}
      <AnimatePresence>
        {showMoreMenu && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setShowMoreMenu(false)}
              className="print:hidden md:hidden fixed inset-0 z-40 bg-background/60 backdrop-blur-sm"
            />
            <motion.div
              data-testid="mobile-more-drawer"
              data-popover="true"
              initial={{ y: '100%' }}
              animate={{ y: 0 }}
              exit={{ y: '100%' }}
              transition={{ type: 'spring', damping: 25, stiffness: 250 }}
              className="print:hidden md:hidden fixed bottom-16 left-0 right-0 z-50 bg-card border-t border-border rounded-t-[14px] p-4 shadow-2xl space-y-2"
            >
              <div className="flex items-center justify-between pb-2 border-b border-border/60">
                <span className="text-eyebrow uppercase text-muted-foreground">More Views</span>
                <button
                  type="button"
                  aria-label="Close More menu"
                  onClick={() => setShowMoreMenu(false)}
                  className="p-1 rounded-[8px] text-muted-foreground hover:text-foreground"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              <div className="grid grid-cols-3 gap-2 pt-1">
                <button
                  type="button"
                  data-testid="drawer-nav-trends"
                  onClick={() => {
                    setShowMoreMenu(false);
                    navigate(`#/trends?month=${activeMonth}`);
                  }}
                  className={`flex flex-col items-center justify-center p-3 rounded-[10px] text-label font-semibold gap-1.5 transition-colors ${
                    currentRoute.view === 'trends'
                      ? 'bg-surface2 border border-border text-foreground'
                      : 'bg-surface2/50 hover:bg-surface2 border border-transparent text-muted-foreground hover:text-foreground'
                  }`}
                >
                  <BarChart3 className="w-5 h-5 text-foreground" />
                  <span>Trends</span>
                </button>
                <button
                  type="button"
                  data-testid="drawer-nav-reports"
                  onClick={() => {
                    setShowMoreMenu(false);
                    navigate(`#/reports?month=${activeMonth}`);
                  }}
                  className={`flex flex-col items-center justify-center p-3 rounded-[10px] text-label font-semibold gap-1.5 transition-colors ${
                    currentRoute.view === 'reports'
                      ? 'bg-surface2 border border-border text-foreground'
                      : 'bg-surface2/50 hover:bg-surface2 border border-transparent text-muted-foreground hover:text-foreground'
                  }`}
                >
                  <FileText className="w-5 h-5 text-foreground" />
                  <span>Reports</span>
                </button>
                <button
                  type="button"
                  data-testid="drawer-nav-settings"
                  onClick={() => {
                    setShowMoreMenu(false);
                    navigate(`#/settings?month=${activeMonth}`);
                  }}
                  className={`flex flex-col items-center justify-center p-3 rounded-[10px] text-label font-semibold gap-1.5 transition-colors ${
                    currentRoute.view === 'settings'
                      ? 'bg-surface2 border border-border text-foreground'
                      : 'bg-surface2/50 hover:bg-surface2 border border-transparent text-muted-foreground hover:text-foreground'
                  }`}
                >
                  <Settings className="w-5 h-5 text-foreground" />
                  <span>Settings</span>
                </button>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </>
  );
};
