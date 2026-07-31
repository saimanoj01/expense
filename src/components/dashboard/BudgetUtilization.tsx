import { useState } from 'react';
import { Target, Plus, Save, ChevronDown, ChevronRight, Sparkles, Edit3 } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { AiBudgetAdvisorModal } from '../modals/AiBudgetAdvisorModal';
import { Budget, Category, Transaction } from '../../services/storage';
import { hasGeminiApiKey } from '../../services/ai/geminiClient';
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
  transactions?: Transaction[];
  categories?: Category[];
  budgets?: Budget[];
  onRequestGeminiKey?: () => void;
}

export function BudgetUtilization({
  categorySummary,
  budgetErrors = {},
  handleBudgetInputChange,
  handleSaveBudgets,
  setShowAddCatModal,
  transactions = [],
  categories = [],
  budgets = [],
  onRequestGeminiKey,
}: BudgetUtilizationProps) {
  const [expandedParents, setExpandedParents] = useState<Set<string>>(new Set());
  const [showAiAdvisorModal, setShowAiAdvisorModal] = useState(false);

  const toggleExpand = (id: string) => {
    setExpandedParents(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleApplySuggestions = (updatedPairs: Array<{ categoryId: string; amount: number }>) => {
    if (!handleBudgetInputChange) return;
    updatedPairs.forEach(pair => {
      handleBudgetInputChange(pair.categoryId, pair.amount.toString());
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

        <div className="flex items-center gap-2 flex-wrap">
          <button
            type="button"
            onClick={() => {
              if (!hasGeminiApiKey() && onRequestGeminiKey) {
                onRequestGeminiKey();
              } else {
                setShowAiAdvisorModal(true);
              }
            }}
            data-testid="open-ai-budget-advisor-btn"
            className="flex items-center gap-1.5 text-xs font-bold px-3 py-1.5 rounded-lg bg-primary/15 text-primary hover:bg-primary/25 border border-primary/30 transition-all shadow-sm"
            title="Get AI budget recommendations based on last 2 months spending"
          >
            <Sparkles className="w-3.5 h-3.5" /> AI Budget Assistant
          </button>

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
              <div key={item.id} className="glass-card p-3.5 rounded-xl border border-border/50 space-y-2.5">
                {/* Row 1: Category Name & Status Badge + Labeled Spending & Budget Target Input */}
                <div className="flex flex-wrap items-center justify-between gap-3 text-sm">
                  {/* Left: Category Title + Status Badge */}
                  <div className="flex items-center gap-2 min-w-0">
                    <div 
                      onClick={() => hasSubCats && toggleExpand(item.id)}
                      className={`font-semibold flex items-center gap-2 ${
                        hasSubCats ? 'cursor-pointer hover:text-primary' : ''
                      } transition-colors truncate`}
                    >
                      {hasSubCats && (
                        <span className="text-muted-foreground shrink-0">
                          {isExpanded ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                        </span>
                      )}
                      <span className="text-base leading-none">{item.emoji}</span>
                      <span className="truncate">{item.name}</span>
                    </div>

                    {/* Status Badge */}
                    {item.budget > 0 ? (
                      <span
                        className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider shrink-0 ${
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
                      <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-card text-muted-foreground border border-border/60 shrink-0">
                        No Target
                      </span>
                    )}
                  </div>

                  {/* Right: Explicitly Labeled "Spent" / "Budget" Row */}
                  <div className="flex items-center gap-2.5 shrink-0">
                    <div className="flex items-center gap-1.5 text-xs sm:text-sm">
                      <span className="text-muted-foreground font-normal">Spent:</span>
                      <span className={`font-bold ${isOver ? 'text-destructive' : 'text-foreground'}`}>
                        ${item.spent.toFixed(0)}
                      </span>
                    </div>

                    <span className="text-muted-foreground/50 text-xs font-light">/</span>

                    {handleBudgetInputChange ? (
                      <div className="flex items-center gap-1 bg-card/80 border border-border/80 hover:border-primary/50 focus-within:border-primary focus-within:ring-1 focus-within:ring-primary/40 rounded-lg px-2.5 py-1 transition-all">
                        <span className="text-xs text-muted-foreground font-medium">Budget: $</span>
                        <input
                          type="number"
                          min="0"
                          data-testid={`budget-input-${item.id}`}
                          value={item.budget === 0 ? '0' : (item.budget || '')}
                          placeholder="0"
                          onChange={e => handleBudgetInputChange(item.id, e.target.value)}
                          className="w-14 bg-transparent text-xs font-bold text-foreground tabular-nums outline-none text-right"
                        />
                        <Edit3 className="w-3 h-3 text-muted-foreground/50" />
                      </div>
                    ) : (
                      <div className="text-xs text-muted-foreground font-medium">
                        Budget: ${item.budget}
                      </div>
                    )}
                  </div>
                </div>

                {budgetErrors[item.id] && (
                  <p className="text-[10px] text-destructive font-bold">{budgetErrors[item.id]}</p>
                )}

                {/* Row 2: Progress Bar & Percentage Info */}
                {item.budget > 0 ? (
                  <div className="space-y-1">
                    <div className="h-2.5 bg-card/60 rounded-full overflow-hidden border border-border/40">
                      <motion.div
                        initial={{ width: 0 }}
                        animate={{ width: `${Math.min(item.percent, 100)}%` }}
                        transition={{ duration: 0.8, delay: 0.1 }}
                        className={`h-full rounded-full ${item.percent > 100 ? 'bg-destructive' : ''}`}
                        style={{ backgroundColor: item.percent <= 100 ? item.color : undefined }}
                      />
                    </div>
                    <div className="flex justify-between items-center text-[11px] text-muted-foreground px-0.5">
                      <span>{item.percent.toFixed(0)}% used</span>
                      <span>
                        {isOver
                          ? `$${Math.abs(remaining).toFixed(0)} over target`
                          : `$${remaining.toFixed(0)} remaining`}
                      </span>
                    </div>
                  </div>
                ) : (
                  <div className="text-[11px] text-muted-foreground/70 italic px-0.5">
                    Set a monthly budget target above to track spending progress
                  </div>
                )}

                {/* Sub-categories Accordion */}
                <AnimatePresence>
                  {isExpanded && hasSubCats && (
                    <motion.div
                      initial={{ opacity: 0, height: 0 }}
                      animate={{ opacity: 1, height: 'auto' }}
                      exit={{ opacity: 0, height: 0 }}
                      className="pt-2 pl-4 sm:pl-6 border-l-2 border-primary/20 space-y-2.5 mt-2"
                    >
                      {item.subCategories!.map(sub => {
                        const subOver = sub.spent > sub.budget && sub.budget > 0;
                        const subRemaining = sub.budget - sub.spent;

                        return (
                          <div key={sub.id} className="space-y-1.5 bg-card/30 p-2.5 rounded-lg border border-border/30">
                            <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                              <span className="font-medium text-foreground flex items-center gap-1.5 truncate">
                                <span>{sub.emoji}</span>
                                <span className="truncate">{sub.name}</span>
                              </span>

                              <div className="flex items-center gap-2">
                                <span className="text-muted-foreground">
                                  Spent: <span className={subOver ? 'text-destructive font-bold' : 'font-semibold text-foreground'}>
                                    ${sub.spent.toFixed(0)}
                                  </span>
                                </span>

                                <span className="text-muted-foreground/40 font-light">/</span>

                                {handleBudgetInputChange ? (
                                  <div className="flex items-center gap-1 bg-card border border-border/70 rounded px-2 py-0.5">
                                    <span className="text-[11px] text-muted-foreground">Budget: $</span>
                                    <input
                                      type="number"
                                      min="0"
                                      data-testid={`budget-input-${sub.id}`}
                                      value={sub.budget === 0 ? '0' : (sub.budget || '')}
                                      placeholder="0"
                                      onChange={e => handleBudgetInputChange(sub.id, e.target.value)}
                                      className="w-12 bg-transparent text-[11px] text-right font-bold tabular-nums outline-none text-foreground"
                                    />
                                  </div>
                                ) : (
                                  sub.budget > 0 && <span className="text-[11px] text-muted-foreground">Budget: ${sub.budget}</span>
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
                                <div className="flex justify-between text-[10px] text-muted-foreground px-0.5">
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

      {/* AI Budget Advisor Modal */}
      <AnimatePresence>
        {showAiAdvisorModal && (
          <AiBudgetAdvisorModal
            showModal={showAiAdvisorModal}
            onClose={() => setShowAiAdvisorModal(false)}
            transactions={transactions}
            categories={categories}
            budgets={budgets}
            onApplySuggestions={handleApplySuggestions}
          />
        )}
      </AnimatePresence>
    </motion.div>
  );
}
