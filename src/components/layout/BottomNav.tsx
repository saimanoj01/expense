import React, { useState } from 'react';
import { 
  LayoutDashboard, 
  Receipt, 
  Plus, 
  Target, 
  MoreHorizontal,
  BarChart3,
  FileText,
  Settings,
  X
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
  className = ''
}) => {
  const { currentRoute, navigate } = useNavigation();
  const [showMoreMenu, setShowMoreMenu] = useState(false);

  const activeMonth = currentRoute.month || getCurrentLocalMonth();

  const isOverview = currentRoute.view === 'overview' || currentRoute.view === 'bucket' || currentRoute.view === 'category';

  return (
    <>
      <nav
        data-testid="bottom-nav"
        className={`md:hidden fixed bottom-0 left-0 right-0 z-40 bg-background/90 backdrop-blur-2xl border-t border-border/40 px-2 pt-1 pb-[max(env(safe-area-inset-bottom),0.5rem)] shadow-lg ${className}`}
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
            className={`flex flex-col items-center justify-center flex-1 py-1 text-[10px] font-semibold transition-colors ${
              isOverview ? 'text-primary' : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            <LayoutDashboard className={`w-5 h-5 mb-0.5 ${isOverview ? 'text-primary' : ''}`} />
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
            className={`flex flex-col items-center justify-center flex-1 py-1 text-[10px] font-semibold transition-colors ${
              currentRoute.view === 'transactions' ? 'text-primary' : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            <Receipt className={`w-5 h-5 mb-0.5 ${currentRoute.view === 'transactions' ? 'text-primary' : ''}`} />
            <span>Txns</span>
          </button>

          {/* 3. Center Quick Add Button */}
          <div className="flex-1 flex justify-center -mt-5">
            <button
              type="button"
              data-testid="bottom-nav-add"
              onClick={onOpenAddTxn}
              className="w-12 h-12 rounded-full bg-gradient-to-tr from-primary to-emerald-400 text-primary-foreground flex items-center justify-center shadow-lg shadow-primary/30 hover:scale-105 active:scale-95 transition-all"
              aria-label="Add Transaction"
              title="Add Transaction"
            >
              <Plus className="w-6 h-6 stroke-[2.5]" />
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
            className={`flex flex-col items-center justify-center flex-1 py-1 text-[10px] font-semibold transition-colors ${
              currentRoute.view === 'budgets' ? 'text-primary' : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            <Target className={`w-5 h-5 mb-0.5 ${currentRoute.view === 'budgets' ? 'text-primary' : ''}`} />
            <span>Budgets</span>
          </button>

          {/* 5. More */}
          <button
            type="button"
            data-testid="bottom-nav-more"
            onClick={() => setShowMoreMenu(prev => !prev)}
            className={`flex flex-col items-center justify-center flex-1 py-1 text-[10px] font-semibold transition-colors ${
              showMoreMenu || ['trends', 'reports', 'settings'].includes(currentRoute.view)
                ? 'text-primary'
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
              className="md:hidden fixed inset-0 z-40 bg-background/60 backdrop-blur-sm"
            />
            <motion.div
              data-testid="mobile-more-drawer"
              initial={{ y: '100%' }}
              animate={{ y: 0 }}
              exit={{ y: '100%' }}
              transition={{ type: 'spring', damping: 25, stiffness: 250 }}
              className="md:hidden fixed bottom-16 left-0 right-0 z-50 bg-card border-t border-border/50 rounded-t-2xl p-4 shadow-2xl space-y-2"
            >
              <div className="flex items-center justify-between pb-2 border-b border-border/40">
                <span className="font-bold text-xs uppercase tracking-wider text-muted-foreground">More Views</span>
                <button
                  type="button"
                  onClick={() => setShowMoreMenu(false)}
                  className="p-1 rounded-lg text-muted-foreground hover:text-foreground"
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
                  className="flex flex-col items-center justify-center p-3 rounded-xl bg-secondary/50 hover:bg-secondary text-foreground text-xs font-semibold gap-1.5 transition-colors"
                >
                  <BarChart3 className="w-5 h-5 text-primary" />
                  <span>Trends</span>
                </button>
                <button
                  type="button"
                  data-testid="drawer-nav-reports"
                  onClick={() => {
                    setShowMoreMenu(false);
                    navigate(`#/reports?month=${activeMonth}`);
                  }}
                  className="flex flex-col items-center justify-center p-3 rounded-xl bg-secondary/50 hover:bg-secondary text-foreground text-xs font-semibold gap-1.5 transition-colors"
                >
                  <FileText className="w-5 h-5 text-primary" />
                  <span>Reports</span>
                </button>
                <button
                  type="button"
                  data-testid="drawer-nav-settings"
                  onClick={() => {
                    setShowMoreMenu(false);
                    navigate(`#/settings?month=${activeMonth}`);
                  }}
                  className="flex flex-col items-center justify-center p-3 rounded-xl bg-secondary/50 hover:bg-secondary text-foreground text-xs font-semibold gap-1.5 transition-colors"
                >
                  <Settings className="w-5 h-5 text-primary" />
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
