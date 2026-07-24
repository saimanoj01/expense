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
  setShowAddCatModal
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

      <div className="w-full space-y-3 flex-1">
        {categorySummary.length > 0 ? categorySummary.map(item => {
          const hasSubCats = item.subCategories && item.subCategories.length > 0;
          const isExpanded = expandedParents.has(item.id);

          return (
            <div key={item.id} className="glass-card p-3 rounded-xl border border-border/40 space-y-2">
              <div className="flex justify-between items-center text-sm">
                <div 
                  onClick={() => hasSubCats && toggleExpand(item.id)}
                  className={`font-semibold flex items-center gap-2 ${hasSubCats ? 'cursor-pointer hover:text-primary' : ''} transition-colors`}
                >
                  {hasSubCats && (
                    <span className="text-muted-foreground">
                      {isExpanded ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                    </span>
                  )}
                  <span>{item.emoji}</span>
                  <span>{item.name}</span>
                </div>

                  <div className="flex items-center gap-2">
                    <span className="text-muted-foreground text-xs">
                      Spent: <span className={item.spent > item.budget && item.budget > 0 ? "text-destructive font-bold" : "font-semibold"}>
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
                          className="w-16 bg-card border border-border rounded px-1.5 py-0.5 text-xs text-right font-bold tabular-nums outline-none focus:ring-1 focus:ring-primary"
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
                  <div className="h-2 bg-card/60 rounded-full overflow-hidden border border-border/40">
                    <motion.div
                      initial={{ width: 0 }}
                      animate={{ width: `${Math.min(item.percent, 100)}%` }}
                      transition={{ duration: 0.8, delay: 0.1 }}
                      className={`h-full rounded-full ${item.percent > 100 ? 'bg-destructive' : ''}`}
                      style={{ backgroundColor: item.percent <= 100 ? item.color : undefined }}
                    />
                  </div>
                ) : (
                  <div className="text-[11px] text-muted-foreground/70 italic">No budget set</div>
                )}

                {/* Sub-categories Accordion */}
                <AnimatePresence>
                  {isExpanded && hasSubCats && (
                    <motion.div
                      initial={{ opacity: 0, height: 0 }}
                      animate={{ opacity: 1, height: 'auto' }}
                      exit={{ opacity: 0, height: 0 }}
                      className="pt-2 pl-4 border-l-2 border-primary/20 space-y-2 mt-2"
                    >
                      {item.subCategories!.map(sub => (
                        <div key={sub.id} className="space-y-1">
                          <div className="flex justify-between items-center text-xs">
                            <span className="font-medium text-muted-foreground flex items-center gap-1.5">
                              <span>{sub.emoji}</span>
                              <span>{sub.name}</span>
                            </span>
                            <div className="flex items-center gap-2">
                              <span className="text-muted-foreground text-[11px]">
                                Spent: ${sub.spent.toFixed(0)}
                              </span>
                              {handleBudgetInputChange ? (
                                <div className="flex items-center gap-1">
                                  <span className="text-[10px] text-muted-foreground">$</span>
                                  <input
                                    type="number"
                                    min="0"
                                    data-testid={`budget-input-${sub.id}`}
                                    value={sub.budget || ''}
                                    placeholder="0"
                                    onChange={e => handleBudgetInputChange(sub.id, e.target.value)}
                                    className="w-14 bg-card border border-border/70 rounded px-1 py-0.5 text-[11px] text-right font-bold tabular-nums outline-none focus:ring-1 focus:ring-primary"
                                  />
                                </div>
                              ) : (
                                sub.budget > 0 && <span className="text-[11px] text-muted-foreground">/ ${sub.budget}</span>
                              )}
                            </div>
                          </div>
                          {sub.budget > 0 && (
                            <div className="h-1.5 bg-card/60 rounded-full overflow-hidden border border-border/30">
                              <div
                                className={`h-full rounded-full ${sub.percent > 100 ? 'bg-destructive' : ''}`}
                                style={{
                                  width: `${Math.min(sub.percent, 100)}%`,
                                  backgroundColor: sub.percent <= 100 ? sub.color : undefined
                                }}
                              />
                            </div>
                          )}
                        </div>
                      ))}
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            );
          }) : (
            <div className="text-muted-foreground text-center py-8">No budget data available</div>
          )}
      </div>
    </motion.div>
  );
}
