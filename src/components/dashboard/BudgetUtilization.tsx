import { Target, Plus, Save } from 'lucide-react';
import { motion } from 'framer-motion';

interface CategorySummary {
  id: string;
  name: string;
  emoji: string;
  color: string;
  budget: number;
  spent: number;
  percent: number;
}

interface BudgetUtilizationProps {
  categorySummary: CategorySummary[];
  piePaths: { segments: any[]; totalPieExpense: number };
  budgetErrors?: Record<string, string>;
  handleBudgetInputChange?: (catName: string, val: string) => void;
  handleSaveBudgets?: () => void;
  setShowAddCatModal?: (show: boolean) => void;
}

export function BudgetUtilization({
  categorySummary,
  piePaths,
  budgetErrors = {},
  handleBudgetInputChange,
  handleSaveBudgets,
  setShowAddCatModal
}: BudgetUtilizationProps) {
  return (
    <motion.div 
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ delay: 0.3 }}
      className="glass-card p-6 rounded-2xl flex-1 flex flex-col"
    >
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-xl bg-primary/10 text-primary">
            <Target className="w-5 h-5" />
          </div>
          <h3 className="text-lg font-bold">Budget Utilization</h3>
        </div>

        <div className="flex items-center gap-2">
          {setShowAddCatModal && (
            <button
              onClick={() => setShowAddCatModal(true)}
              data-testid="open-add-category-btn"
              className="flex items-center gap-1 text-xs font-bold px-3 py-1.5 rounded-lg bg-card/60 hover:bg-card border border-border transition-colors"
            >
              <Plus className="w-3.5 h-3.5" /> Category
            </button>
          )}
          {handleSaveBudgets && (
            <button
              onClick={handleSaveBudgets}
              data-testid="save-budgets-btn"
              className="flex items-center gap-1 text-xs font-bold px-3 py-1.5 rounded-lg bg-primary/20 text-primary hover:bg-primary/30 border border-primary/30 transition-colors"
            >
              <Save className="w-3.5 h-3.5" /> Save Budgets
            </button>
          )}
        </div>
      </div>

      <div className="flex flex-col md:flex-row gap-8 items-center flex-1 justify-center">
        {piePaths.totalPieExpense > 0 && (
          <div className="relative w-48 h-48 flex-shrink-0">
            <svg viewBox="0 0 300 200" data-testid="chart-svg-pie" className="w-full h-full drop-shadow-xl filter drop-shadow-[0_4px_12px_rgba(0,0,0,0.5)]">
              {piePaths.segments.length === 1 ? (
                <motion.circle
                  initial={{ opacity: 0, scale: 0.8 }}
                  animate={{ opacity: 1, scale: 1 }}
                  cx="150"
                  cy="96"
                  r="60"
                  fill={piePaths.segments[0].color}
                >
                  <title>{piePaths.segments[0].name}</title>
                </motion.circle>
              ) : (
                piePaths.segments.map((seg, i) => (
                  <motion.path
                    key={i}
                    initial={{ opacity: 0, scale: 0.8 }}
                    animate={{ opacity: 1, scale: 1 }}
                    transition={{ delay: 0.4 + i * 0.1 }}
                    d={seg.pathData}
                    fill={seg.color}
                    className="hover:opacity-80 cursor-pointer transition-opacity"
                  >
                    <title>{seg.name}</title>
                  </motion.path>
                ))
              )}
            </svg>
            <div className="absolute inset-0 flex flex-col items-center justify-center -mt-6 pointer-events-none">
              <span className="text-xs text-muted-foreground font-medium">Spent</span>
              <span className="font-bold tracking-tight">
                ${piePaths.totalPieExpense.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
              </span>
            </div>
          </div>
        )}

        <div className="flex-1 w-full space-y-5">
          {categorySummary.length > 0 ? categorySummary.map(item => (
            <div key={item.id} className="group">
              <div className="flex justify-between items-center text-sm mb-2">
                <span className="font-medium flex items-center gap-2">
                  <span>{item.emoji}</span> {item.name}
                </span>
                <div className="flex items-center gap-2">
                  <span className="text-muted-foreground text-xs">
                    Spent: <span className={item.spent > item.budget && item.budget > 0 ? "text-destructive font-bold" : ""}>
                      ${item.spent.toFixed(0)}
                    </span>
                  </span>
                  {handleBudgetInputChange ? (
                    <div className="flex items-center gap-1">
                      <span className="text-xs text-muted-foreground">$</span>
                      <input
                        type="number"
                        min="0"
                        data-testid={`budget-input-${item.id}`}
                        value={item.budget || ''}
                        placeholder="0"
                        onChange={e => handleBudgetInputChange(item.id, e.target.value)}
                        className="w-16 bg-card/50 border border-border rounded px-1.5 py-0.5 text-xs text-right font-bold tabular-nums outline-none focus:ring-1 focus:ring-primary"
                      />
                    </div>
                  ) : (
                    item.budget > 0 && <span className="text-xs text-muted-foreground">/ ${item.budget}</span>
                  )}
                </div>
              </div>

              {budgetErrors[item.id] && (
                <p className="text-[10px] text-destructive font-bold mb-1">{budgetErrors[item.id]}</p>
              )}

              {item.budget > 0 ? (
                <div className="h-2.5 bg-card/50 rounded-full overflow-hidden border border-border/50">
                  <motion.div
                    initial={{ width: 0 }}
                    animate={{ width: `${Math.min(item.percent, 100)}%` }}
                    transition={{ duration: 1, delay: 0.2 }}
                    className={`h-full rounded-full ${item.percent > 100 ? 'bg-destructive' : ''}`}
                    style={{ backgroundColor: item.percent <= 100 ? item.color : undefined }}
                  />
                </div>
              ) : (
                <div className="text-xs text-muted-foreground/70 italic">No budget set</div>
              )}
            </div>
          )) : (
            <div className="text-muted-foreground text-center py-8">No budget data available</div>
          )}
        </div>
      </div>
    </motion.div>
  );
}
