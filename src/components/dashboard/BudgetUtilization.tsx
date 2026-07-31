import { useState } from 'react';
import { Target, Plus, Save, ChevronDown, ChevronRight } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

export interface SubCategorySummary {
  id: string;
  name: string;
  emoji: string;
  color: string;
  budget: number;
  spent: number;
  percent: number;
}

export interface CategorySummary {
  id: string;
  name: string;
  emoji: string;
  color: string;
  budget: number;
  spent: number;
  percent: number;
  subCategories?: SubCategorySummary[];
}

interface BudgetUtilizationProps {
  categorySummary: CategorySummary[];
  piePaths?: { segments: any[]; totalPieExpense: number };
  budgetErrors?: Record<string, string>;
  handleBudgetInputChange?: (catName: string, val: string) => void;
  handleSaveBudgets?: () => void;
  setShowAddCatModal?: (show: boolean) => void;
}

export function BudgetUtilization({
  categorySummary,
  budgetErrors = {},
  handleBudgetInputChange,
  handleSaveBudgets,
  setShowAddCatModal,
}: BudgetUtilizationProps) {
  const [expandedParents, setExpandedParents] = useState<Set<string>>(new Set());

  const toggleExpand = (id: string) => {
    setExpandedParents(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  return (
    <motion.div 
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ delay: 0.3 }}
      className="glass-card p-6 rounded-2xl flex-1 flex flex-col"
    >
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3 mb-6">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-xl bg-primary/10 text-primary">
            <Target className="w-5 h-5" />
          </div>
          <div>
            <h3 className="text-lg font-bold">Budget Utilization</h3>
            <p className="text-xs text-muted-foreground">Monitor spending vs limits</p>
          </div>
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
              className="flex items-center gap-1 text-xs font-bold px-3 py-1.5 rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 transition-colors shadow-sm"
            >
              <Save className="w-3.5 h-3.5" /> Save Budgets
            </button>
          )}
        </div>
      </div>

      {/* Categories List */}
      <div className="w-full space-y-3 flex-1">
        {categorySummary.length > 0 ? (
          categorySummary.map(item => {
            const hasSubCats = item.subCategories && item.subCategories.length > 0;
            const isExpanded = expandedParents.has(item.id);
            const isOver = item.spent > item.budget && item.budget > 0;
            const isNearCap = !isOver && item.percent >= 80 && item.budget > 0;
            const remaining = item.budget - item.spent;

            return (
              <div key={item.id} className="glass-card p-4 rounded-xl border border-border/50 space-y-3">
                {/* Line 1: Category Header & Status Badge */}
                <div className="flex items-center justify-between gap-2">
                  <div 
                    onClick={() => hasSubCats && toggleExpand(item.id)}
                    className={`font-semibold flex items-center gap-2.5 text-base ${
                      hasSubCats ? 'cursor-pointer hover:text-primary' : ''
                    } transition-colors truncate min-w-0`}
                  >
                    {hasSubCats && (
                      <span className="text-muted-foreground shrink-0">
                        {isExpanded ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                      </span>
                    )}
                    <span className="text-base leading-none shrink-0">{item.emoji}</span>
                    <span className="truncate">{item.name}</span>
                  </div>

                  {/* Status Badge */}
                  {item.budget > 0 ? (
                    <span
                      className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider shrink-0 ${
                        isOver
                          ? 'bg-destructive/20 text-destructive border border-destructive/30'
                          : isNearCap
                          ? 'bg-amber-500/20 text-amber-500 border border-amber-500/30'
                          : 'bg-emerald-500/15 text-emerald-500 border border-emerald-500/30'
                      }`}
                    >
                      {isOver ? `Over by $${Math.abs(remaining).toFixed(0)}` : isNearCap ? 'Near Limit' : 'On Track'}
                    </span>
                  ) : (
                    <span className="px-2.5 py-0.5 rounded-full text-[10px] font-semibold bg-card text-muted-foreground border border-border/60 shrink-0">
                      No Target
                    </span>
                  )}
                </div>

                {/* Line 2 & 3: Stacked Metrics (Spent on top, Budget below it) */}
                <div className="bg-card/40 rounded-lg p-3 border border-border/30 space-y-2">
                  {/* Spent Line */}
                  <div className="flex justify-between items-center text-sm">
                    <span className="text-muted-foreground font-medium">Spent</span>
                    <span className={`font-bold text-base tabular-nums ${isOver ? 'text-destructive' : 'text-foreground'}`}>
                      ${item.spent.toFixed(0)}
                    </span>
                  </div>

                  {/* Budget Line */}
                  <div className="flex justify-between items-center text-sm pt-1 border-t border-border/20">
                    <span className="text-muted-foreground font-medium">Budget</span>
                    {handleBudgetInputChange ? (
                      <div className="flex items-center gap-1 bg-card border border-border/80 hover:border-primary/50 focus-within:border-primary focus-within:ring-1 focus-within:ring-primary/40 rounded-lg px-2.5 py-1 transition-all">
                        <span className="text-xs text-muted-foreground font-semibold">$</span>
                        <input
                          type="number"
                          min="0"
                          data-testid={`budget-input-${item.id}`}
                          value={item.budget === 0 ? '0' : (item.budget || '')}
                          placeholder="0"
                          onChange={e => handleBudgetInputChange(item.id, e.target.value)}
                          className="w-16 bg-transparent text-sm font-bold text-foreground tabular-nums outline-none text-right"
                        />
                      </div>
                    ) : (
                      <span className="font-bold text-foreground tabular-nums">${item.budget}</span>
                    )}
                  </div>
                </div>

                {budgetErrors[item.id] && (
                  <p className="text-[10px] text-destructive font-bold">{budgetErrors[item.id]}</p>
                )}

                {/* Line 4: Progress Bar & Status Text */}
                {item.budget > 0 ? (
                  <div className="space-y-1 pt-0.5">
                    <div className="h-2 bg-card/60 rounded-full overflow-hidden border border-border/40">
                      <motion.div
                        initial={{ width: 0 }}
                        animate={{ width: `${Math.min(item.percent, 100)}%` }}
                        transition={{ duration: 0.8, delay: 0.1 }}
                        className={`h-full rounded-full ${item.percent > 100 ? 'bg-destructive' : ''}`}
                        style={{ backgroundColor: item.percent <= 100 ? item.color : undefined }}
                      />
                    </div>
                    <div className="flex justify-between items-center text-[11px] text-muted-foreground px-0.5 font-medium tabular-nums">
                      <span>{item.percent.toFixed(0)}% used</span>
                      <span className={isOver ? 'text-destructive font-semibold' : ''}>
                        {isOver
                          ? `$${Math.abs(remaining).toFixed(0)} over target`
                          : `$${remaining.toFixed(0)} remaining`}
                      </span>
                    </div>
                  </div>
                ) : (
                  <div className="text-[11px] text-muted-foreground/70 italic px-0.5 pt-0.5">
                    Enter a budget target above to track utilization
                  </div>
                )}

                {/* Sub-categories Accordion */}
                <AnimatePresence>
                  {isExpanded && hasSubCats && (
                    <motion.div
                      initial={{ opacity: 0, height: 0 }}
                      animate={{ opacity: 1, height: 'auto' }}
                      exit={{ opacity: 0, height: 0 }}
                      className="pt-2 pl-3 sm:pl-4 border-l-2 border-primary/20 space-y-2.5 mt-2"
                    >
                      {item.subCategories!.map(sub => {
                        const subOver = sub.spent > sub.budget && sub.budget > 0;
                        const subRemaining = sub.budget - sub.spent;

                        return (
                          <div key={sub.id} className="bg-card/20 p-3 rounded-lg border border-border/30 space-y-2">
                            {/* Sub-category Header */}
                            <div className="flex items-center justify-between gap-2 text-xs">
                              <span className="font-semibold text-foreground flex items-center gap-1.5 truncate">
                                <span>{sub.emoji}</span>
                                <span className="truncate">{sub.name}</span>
                              </span>
                              {sub.budget > 0 && (
                                <span className="text-[10px] font-medium text-muted-foreground tabular-nums">
                                  {sub.percent.toFixed(0)}% used
                                </span>
                              )}
                            </div>

                            {/* Sub-category Stacked Metrics */}
                            <div className="bg-card/40 rounded p-2 border border-border/20 space-y-1 text-xs">
                              <div className="flex justify-between items-center">
                                <span className="text-muted-foreground">Spent</span>
                                <span className={`font-bold tabular-nums ${subOver ? 'text-destructive' : 'text-foreground'}`}>
                                  ${sub.spent.toFixed(0)}
                                </span>
                              </div>
                              <div className="flex justify-between items-center pt-1 border-t border-border/20">
                                <span className="text-muted-foreground">Budget</span>
                                {handleBudgetInputChange ? (
                                  <div className="flex items-center gap-1 bg-card border border-border/70 rounded px-2 py-0.5">
                                    <span className="text-[10px] text-muted-foreground">$</span>
                                    <input
                                      type="number"
                                      min="0"
                                      data-testid={`budget-input-${sub.id}`}
                                      value={sub.budget === 0 ? '0' : (sub.budget || '')}
                                      placeholder="0"
                                      onChange={e => handleBudgetInputChange(sub.id, e.target.value)}
                                      className="w-14 bg-transparent text-xs text-right font-bold tabular-nums outline-none text-foreground"
                                    />
                                  </div>
                                ) : (
                                  <span className="font-bold tabular-nums">${sub.budget}</span>
                                )}
                              </div>
                            </div>

                            {sub.budget > 0 && (
                              <div className="space-y-0.5">
                                <div className="h-1.5 bg-card/60 rounded-full overflow-hidden border border-border/30">
                                  <div
                                    className={`h-full rounded-full ${sub.percent > 100 ? 'bg-destructive' : ''}`}
                                    style={{
                                      width: `${Math.min(sub.percent, 100)}%`,
                                      backgroundColor: sub.percent <= 100 ? sub.color : undefined
                                    }}
                                  />
                                </div>
                                <div className="flex justify-between text-[10px] text-muted-foreground px-0.5 tabular-nums">
                                  <span>{sub.percent.toFixed(0)}%</span>
                                  <span>{subOver ? `$${Math.abs(subRemaining).toFixed(0)} over` : `$${subRemaining.toFixed(0)} left`}</span>
                                </div>
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            );
          })
        ) : (
          <div className="text-muted-foreground text-center py-8">No budget data available</div>
        )}
      </div>
    </motion.div>
  );
}
