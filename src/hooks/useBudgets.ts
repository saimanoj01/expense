import { useState, useMemo, useCallback } from 'react';
import { Budget, Category, Transaction } from '../services/storage';

export function useBudgets(
  storageAdapter: any,
  activeProject: any,
  filteredTransactions: Transaction[],
  showToast: (msg: string) => void,
  setAuthErrorToast: (msg: string) => void
) {
  const [budgets, setBudgets] = useState<Budget[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [budgetErrors, setBudgetErrors] = useState<Record<string, string>>({});

  const refreshBudgetsAndCategories = useCallback(async () => {
    if (!activeProject || !storageAdapter) return;
    try {
      const bgs = await storageAdapter.getBudgets(activeProject.id);
      const cats = await storageAdapter.getCategories(activeProject.id);
      setBudgets(bgs);
      setCategories(cats);
    } catch (err) {
      console.error("Failed to load budgets/categories:", err);
    }
  }, [activeProject, storageAdapter]);

  const totalBudget = useMemo(() => budgets.reduce((sum, b) => sum + b.amount, 0), [budgets]);

  const categorySummary = useMemo(() => {
    // Identify top-level parent categories
    const parentCats = categories.filter(c => !c.parentId);

    const items: Array<{
      id: string;
      name: string;
      emoji: string;
      color: string;
      budget: number;
      spent: number;
      percent: number;
      subCategories: Array<{
        id: string;
        name: string;
        emoji: string;
        color: string;
        budget: number;
        spent: number;
        percent: number;
      }>;
    }> = [];

    parentCats.forEach(pCat => {
      // Find sub-categories for this parent
      const subCats = categories.filter(c => c.parentId === pCat.id);

      const subCategorySummaries = subCats.map(sCat => {
        const bObj = budgets.find(b => b.category === sCat.id || b.category === sCat.name);
        const subBudget = bObj?.amount || 0;
        const subSpent = filteredTransactions
          .filter(t => t.type === 'expense' && (t.subCategory === sCat.id || (t.category === sCat.id && !t.subCategory)))
          .reduce((sum, t) => sum + t.amount, 0);
        const subPercent = subBudget > 0 ? Math.min(Math.round((subSpent / subBudget) * 100), 100) : 0;
        return {
          id: sCat.id,
          name: sCat.name,
          emoji: sCat.emoji,
          color: sCat.color,
          budget: subBudget,
          spent: subSpent,
          percent: subPercent
        };
      });

      // Calculate direct parent spent (transactions assigned to parent without subCategory)
      const directParentSpent = filteredTransactions
        .filter(t => t.type === 'expense' && (t.category === pCat.id || t.category.toLowerCase() === pCat.name.toLowerCase()) && !t.subCategory)
        .reduce((sum, t) => sum + t.amount, 0);

      // Roll up total parent spent
      const totalParentSpent = directParentSpent + subCategorySummaries.reduce((sum, s) => sum + s.spent, 0);

      // Calculate total parent budget (explicit parent budget or sum of sub-category budgets)
      const parentBObj = budgets.find(b => b.category === pCat.id || b.category === pCat.name);
      const subCategoryBudgetSum = subCategorySummaries.reduce((sum, s) => sum + s.budget, 0);
      const parentBudget = parentBObj ? parentBObj.amount : subCategoryBudgetSum;

      const parentPercent = parentBudget > 0 ? Math.min(Math.round((totalParentSpent / parentBudget) * 100), 100) : 0;

      items.push({
        id: pCat.id,
        name: pCat.name,
        emoji: pCat.emoji,
        color: pCat.color,
        budget: parentBudget,
        spent: totalParentSpent,
        percent: parentPercent,
        subCategories: subCategorySummaries
      });
    });

    return items;
  }, [categories, budgets, filteredTransactions]);

  const piePaths = useMemo(() => {
    const expenseTxns = filteredTransactions.filter(t => t.type === 'expense');
    const grouped = categories.map(cat => {
      const total = expenseTxns
        .filter(t => t.category === cat.id || t.category.toLowerCase() === cat.name.toLowerCase())
        .reduce((sum, t) => sum + t.amount, 0);
      return {
        category: cat.id,
        name: cat.name,
        color: cat.color,
        total
      };
    }).filter(item => item.total > 0);

    const totalPieExpense = grouped.reduce((sum, item) => sum + item.total, 0);
    const cx = 150;
    const cy = 96;
    const r = 60;
    const result: Array<{ pathData: string; color: string; category: string; name: string }> = [];

    if (totalPieExpense > 0) {
      let accumulatedAngle = -Math.PI / 2;
      grouped.forEach(item => {
        const percentage = item.total / totalPieExpense;
        let angleSpan = percentage * 2 * Math.PI;
        if (percentage >= 0.999) {
          angleSpan = 2 * Math.PI - 0.001;
        }
        const startAngle = accumulatedAngle;
        const endAngle = accumulatedAngle + angleSpan;
        const x1 = cx + r * Math.cos(startAngle);
        const y1 = cy + r * Math.sin(startAngle);
        const x2 = cx + r * Math.cos(endAngle);
        const y2 = cy + r * Math.sin(endAngle);
        const largeArcFlag = angleSpan > Math.PI ? 1 : 0;
        const pathData = `M ${cx} ${cy} L ${x1} ${y1} A ${r} ${r} 0 ${largeArcFlag} 1 ${x2} ${y2} Z`;
        result.push({ pathData, color: item.color, category: item.category, name: item.name });
        accumulatedAngle = endAngle;
      });
    }
    return { segments: result, totalPieExpense };
  }, [filteredTransactions, categories]);

  const handleSaveBudgets = async () => {
    if (!activeProject || !storageAdapter) return;
    try {
      await storageAdapter.saveBudgets(activeProject.id, budgets);
      showToast('Budgets saved successfully');
    } catch (err: any) {
      if (err.name === 'QuotaExceededError' || /quota/i.test(err.message || '')) {
        setAuthErrorToast('Storage quota exceeded. Session is now read-only.');
      } else {
        alert(err.message || 'Failed to save budgets');
      }
    }
  };

  const handleBudgetInputChange = (catName: string, val: string) => {
    const num = parseFloat(val);
    if (isNaN(num) || num < 0) {
      setBudgetErrors(prev => ({ ...prev, [catName]: 'Budget must be positive' }));
      return;
    }
    setBudgetErrors(prev => ({ ...prev, [catName]: '' }));
    setBudgets(prev => {
      const existing = prev.findIndex(b => b.category === catName || b.category.toLowerCase() === catName.toLowerCase());
      if (existing > -1) {
        const next = [...prev];
        next[existing] = { category: catName, amount: num };
        return next;
      }
      return [...prev, { category: catName, amount: num }];
    });
  };

  const handleSaveCategory = async (newCat: Category, isEdit: boolean) => {
    if (!activeProject || !storageAdapter) return false;
    try {
      await storageAdapter.saveCategory(activeProject.id, newCat);
      await refreshBudgetsAndCategories();
      showToast(isEdit ? 'Category edited successfully' : 'Category added successfully');
      return true;
    } catch (err: any) {
      alert(err.message || 'Failed to save category');
      return false;
    }
  };

  return {
    budgets,
    setBudgets,
    categories,
    budgetErrors,
    totalBudget,
    categorySummary,
    piePaths,
    refreshBudgetsAndCategories,
    handleSaveBudgets,
    handleBudgetInputChange,
    handleSaveCategory
  };
}
