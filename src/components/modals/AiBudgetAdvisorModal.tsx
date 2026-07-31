import { useState, useEffect } from 'react';
import { Sparkles, X, Check, TrendingUp, TrendingDown, Info, ArrowRight, Copy } from 'lucide-react';
import { motion } from 'framer-motion';
import { BudgetSuggestion, generateBudgetSuggestions } from '../../services/ai/budgetAdvisor';
import { Budget, Category, Transaction } from '../../services/storage';

interface AiBudgetAdvisorModalProps {
  showModal: boolean;
  onClose: () => void;
  transactions: Transaction[];
  categories: Category[];
  budgets: Budget[];
  onApplySuggestions: (updatedPairs: Array<{ categoryId: string; amount: number }>) => void;
}

export function AiBudgetAdvisorModal({
  showModal,
  onClose,
  transactions,
  categories,
  budgets,
  onApplySuggestions,
}: AiBudgetAdvisorModalProps) {
  const [suggestions, setSuggestions] = useState<BudgetSuggestion[]>([]);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!showModal) return;
    let isMounted = true;
    const fetchSuggestions = async () => {
      setIsLoading(true);
      setError(null);
      try {
        const results = await generateBudgetSuggestions(transactions, categories, budgets);
        if (isMounted) {
          setSuggestions(results);
          setSelectedIds(new Set(results.map(r => r.categoryId)));
        }
      } catch (err: any) {
        if (isMounted) {
          setError(err.message || 'Failed to generate AI budget suggestions');
        }
      } finally {
        if (isMounted) {
          setIsLoading(false);
        }
      }
    };
    fetchSuggestions();
    return () => {
      isMounted = false;
    };
  }, [showModal, transactions, categories, budgets]);

  if (!showModal) return null;

  const toggleSelect = (id: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const selectAll = () => {
    setSelectedIds(new Set(suggestions.map(s => s.categoryId)));
  };

  const deselectAll = () => {
    setSelectedIds(new Set());
  };

  const handleApply = () => {
    const toApply = suggestions
      .filter(s => selectedIds.has(s.categoryId))
      .map(s => ({ categoryId: s.categoryId, amount: s.suggestedBudget }));
    onApplySuggestions(toApply);
    onClose();
  };

  const handleUseLastMonthActuals = () => {
    const toApply = suggestions.map(s => ({
      categoryId: s.categoryId,
      amount: s.avgSpent2Months,
    }));
    onApplySuggestions(toApply);
    onClose();
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-background/80 backdrop-blur-sm"
      data-testid="ai-budget-advisor-modal"
    >
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.95 }}
        className="glass-panel w-full max-w-2xl rounded-2xl p-6 shadow-2xl border border-border/50 flex flex-col max-h-[85vh]"
      >
        {/* Header */}
        <div className="flex justify-between items-center pb-4 border-b border-border/40">
          <div className="flex items-center gap-2.5 font-bold text-lg">
            <div className="p-2 rounded-xl bg-primary/10 text-primary">
              <Sparkles className="w-5 h-5" />
            </div>
            <div>
              <span>AI Budget Advisor</span>
              <p className="text-xs text-muted-foreground font-normal">
                Smart budget recommendations analyzed from your last 2 months of spending
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1 hover:bg-card rounded-lg text-muted-foreground hover:text-foreground transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto custom-scrollbar my-4 pr-1">
          {isLoading ? (
            <div className="flex flex-col items-center justify-center py-12 space-y-3">
              <div className="w-8 h-8 rounded-full border-2 border-primary border-t-transparent animate-spin" />
              <p className="text-sm font-medium text-muted-foreground">
                Analyzing 2-month spending patterns with Gemini AI...
              </p>
            </div>
          ) : error ? (
            <div className="p-4 rounded-xl bg-destructive/10 border border-destructive/20 text-destructive text-sm text-center">
              {error}
            </div>
          ) : suggestions.length === 0 ? (
            <div className="text-center py-12 space-y-2">
              <Info className="w-8 h-8 text-muted-foreground mx-auto" />
              <p className="text-sm text-muted-foreground font-medium">
                Not enough spending history in the last 2 months to suggest budgets yet.
              </p>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="flex items-center justify-between text-xs text-muted-foreground px-1">
                <span>Select categories to apply recommendations:</span>
                <div className="flex gap-2">
                  <button onClick={selectAll} className="hover:text-foreground underline">
                    Select All
                  </button>
                  <span>•</span>
                  <button onClick={deselectAll} className="hover:text-foreground underline">
                    Deselect All
                  </button>
                </div>
              </div>

              <div className="space-y-2.5">
                {suggestions.map(item => {
                  const isChecked = selectedIds.has(item.categoryId);
                  const isIncrease = item.suggestedBudget > item.currentBudget;
                  const isDecrease = item.suggestedBudget < item.currentBudget;

                  return (
                    <div
                      key={item.categoryId}
                      onClick={() => toggleSelect(item.categoryId)}
                      className={`p-3.5 rounded-xl border transition-all cursor-pointer select-none ${
                        isChecked
                          ? 'bg-primary/10 border-primary/50 shadow-sm ring-1 ring-primary/20'
                          : 'bg-card/40 border-border/40 hover:bg-card/70 hover:border-border'
                      }`}
                    >
                      <div className="flex flex-wrap items-center justify-between gap-3">
                        <div className="flex items-center gap-2.5 min-w-0 flex-1">
                          <div className="w-5 h-5 rounded-md flex items-center justify-center border border-border bg-card text-xs shrink-0">
                            {isChecked ? (
                              <Check className="w-3.5 h-3.5 text-primary font-bold" />
                            ) : null}
                          </div>
                          <span className="text-base leading-none shrink-0">{item.emoji}</span>
                          <span className="font-semibold text-sm truncate">{item.categoryName}</span>
                        </div>

                        <div className="flex items-center gap-3 text-xs shrink-0 ml-auto">
                          <div className="text-right">
                            <div className="text-muted-foreground tabular-nums">
                              Current: <span className="font-semibold text-foreground">${item.currentBudget}</span>
                            </div>
                            <div className="text-[11px] text-muted-foreground/80 tabular-nums">
                              2-Mo Avg: ${item.avgSpent2Months}/mo
                            </div>
                          </div>

                          <ArrowRight className="w-3.5 h-3.5 text-muted-foreground/60 shrink-0" />

                          <div className="flex items-center gap-1.5 font-bold text-sm bg-card/60 px-2.5 py-1 rounded-lg border border-border/50">
                            <span className={`tabular-nums ${isChecked ? 'text-primary' : 'text-foreground'}`}>
                              ${item.suggestedBudget}
                            </span>
                            {isIncrease ? (
                              <span title="Higher than current budget">
                                <TrendingUp className="w-4 h-4 text-amber-500 shrink-0" />
                              </span>
                            ) : isDecrease ? (
                              <span title="Lower than current budget">
                                <TrendingDown className="w-4 h-4 text-emerald-500 shrink-0" />
                              </span>
                            ) : null}
                          </div>
                        </div>
                      </div>

                      <div className="mt-2 text-xs text-muted-foreground pl-7 italic">
                        "{item.rationale}"
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex flex-wrap items-center justify-between pt-4 border-t border-border/40 gap-3">
          <button
            type="button"
            onClick={handleUseLastMonthActuals}
            disabled={isLoading || suggestions.length === 0}
            className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl border border-border hover:bg-card text-xs font-semibold text-muted-foreground hover:text-foreground transition-colors"
            title="Set all budgets to match your 2-month average actuals"
          >
            <Copy className="w-3.5 h-3.5" />
            Copy 2-Mo Actuals
          </button>

          <div className="flex gap-2 ml-auto">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-xl border border-border hover:bg-card text-xs font-bold"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleApply}
              disabled={isLoading || selectedIds.size === 0}
              className="px-5 py-2 rounded-xl bg-primary text-primary-foreground text-xs font-bold hover:bg-primary/90 disabled:opacity-50 transition-all flex items-center gap-1.5 shadow-lg shadow-primary/20"
            >
              <Check className="w-4 h-4" />
              Apply ({selectedIds.size}) Selected
            </button>
          </div>
        </div>
      </motion.div>
    </div>
  );
}
