import { useState, useMemo, useCallback } from 'react';
import {
  Budget,
  Category,
  Transaction,
  BudgetNote,
  Project,
  StorageAdapter,
} from '../services/storage';
import {
  isRefundTransaction,
  deriveCategoryBucket,
  isNonBudgetableCategory,
  doesBudgetMatchCategory,
  getCategoryAliasOptions,
  resolveEffectiveCategoryBudget,
} from '../utils/metrics';
import {
  cleanBudgetsForSave,
  computeBudgetDirtyState,
  computeDonutSegments,
  computeSpendingHistory,
  countActiveTransactionMonths,
  getBudgetCatKey,
} from '../utils/budgetPlanning';
import type { CategorySummary, SubCategorySummary } from '../utils/budgetPlanning';

export { deriveCategoryBucket, isNonBudgetableCategory };

export function useBudgets(
  storageAdapter: StorageAdapter | null,
  activeProject: Project | null,
  monthTransactions: Transaction[],
  allTransactions: Transaction[] = [],
  selectedMonth: string = '',
  showToast: (msg: string, type?: 'success' | 'error' | 'info') => void,
  setAuthErrorToast: (msg: string) => void,
  isLockedMonth: boolean = false
) {
  const [persistedBudgets, setPersistedBudgets] = useState<Budget[]>([]);
  const [workingBudgets, setWorkingBudgets] = useState<Budget[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [budgetErrors, setBudgetErrors] = useState<Record<string, string>>({});
  const [budgetDrafts, setBudgetDrafts] = useState<Record<string, string>>({});
  const [budgetNotes, setBudgetNotes] = useState<Record<string, BudgetNote>>({});

  const [prevProjectId, setPrevProjectId] = useState<string | undefined>(
    activeProject?.id
  );
  if (prevProjectId !== activeProject?.id) {
    setPrevProjectId(activeProject?.id);
    setBudgetDrafts({});
    setBudgetErrors({});
  }

  const refreshBudgetsAndCategories = useCallback(
    async (options?: { preserveWorkingDrafts?: boolean; deletedCategoryId?: string }) => {
      if (!activeProject || !storageAdapter) return;
      try {
        const bgs = await storageAdapter.getBudgets(activeProject.id);
        const cats = await storageAdapter.getCategories(activeProject.id);
        const notes = await storageAdapter.getBudgetNotes(activeProject.id);
        setPersistedBudgets(bgs);
        if (options?.preserveWorkingDrafts) {
          if (options.deletedCategoryId) {
            const delLower = options.deletedCategoryId.toLowerCase();
            setWorkingBudgets(prev =>
              prev.filter(b => (b.category || '').toLowerCase() !== delLower)
            );
            setBudgetDrafts(prev => {
              const next = { ...prev };
              delete next[options.deletedCategoryId!];
              return next;
            });
            setBudgetErrors(prev => {
              const next = { ...prev };
              delete next[options.deletedCategoryId!];
              return next;
            });
          }
        } else {
          setWorkingBudgets(bgs);
          setBudgetDrafts({});
          setBudgetErrors({});
        }
        setCategories(cats);
        setBudgetNotes(notes || {});
      } catch (err) {
        console.error('Failed to load budgets/categories/notes:', err);
      }
    },
    [activeProject, storageAdapter]
  );

  const activeMonthsCount = useMemo(
    () => countActiveTransactionMonths(allTransactions),
    [allTransactions]
  );

  const buildSummaryForBudgets = useCallback(
    (
      targetBudgets: Budget[],
      options: { normalizeAllTime: boolean }
    ): CategorySummary[] => {
      const aliasOpts = getCategoryAliasOptions(categories);
      const parentCats = [...categories.filter(c => !c.parentId)];
      const existingKeys = new Set(
        parentCats.flatMap(c => [c.id.toLowerCase(), c.name.toLowerCase()])
      );
      const subCatKeys = new Set(
        categories
          .filter(c => Boolean(c.parentId))
          .flatMap(c => [c.id.toLowerCase(), c.name.toLowerCase()])
      );

      if (existingKeys.has('food & dining') || existingKeys.has('food')) {
        existingKeys.add('food');
        existingKeys.add('food & dining');
      }
      if (existingKeys.has('housing') && !aliasOpts.hasExplicitRentCategory) {
        existingKeys.add('rent');
      }
      if (existingKeys.has('rent') && !aliasOpts.hasExplicitHousingCategory) {
        existingKeys.add('housing');
      }

      const combinedBudgetPool = [...persistedBudgets, ...targetBudgets];
      combinedBudgetPool.forEach(b => {
        const catKey = (b.category || '').trim().toLowerCase();
        if (b.category && !existingKeys.has(catKey) && !subCatKeys.has(catKey)) {
          parentCats.push({
            id: b.category,
            name: b.category,
            emoji: '🏷️',
            color: '#0B79A8',
          });
          existingKeys.add(catKey);
        }
      });

      monthTransactions.forEach(t => {
        const catKey = (t.category || '').trim().toLowerCase();
        if (t.category && !existingKeys.has(catKey) && !subCatKeys.has(catKey)) {
          parentCats.push({
            id: t.category,
            name: t.category,
            emoji: '🏷️',
            color: '#4DABF7',
          });
          existingKeys.add(catKey);
        }
      });

      const allKnownCats = [
        ...parentCats,
        ...categories.filter(c => Boolean(c.parentId)),
      ];

      const isAllTime = selectedMonth === 'all';
      const allTimeDivisor = isAllTime ? Math.max(1, activeMonthsCount) : 1;
      const items: CategorySummary[] = [];

      parentCats.forEach(pCat => {
        const subCats = categories.filter(c => c.parentId === pCat.id);
        const validSubKeys = new Set(
          subCats.flatMap(s => [s.id.toLowerCase(), s.name.toLowerCase()])
        );

        const subCategorySummaries: SubCategorySummary[] = subCats.map(sCat => {
          const subRes = resolveEffectiveCategoryBudget(
            sCat.id,
            targetBudgets,
            allKnownCats
          );
          const subBudget = subRes.effectiveBudget;

          const rawSubNet = monthTransactions
            .filter(
              t =>
                (t.type === 'expense' || isRefundTransaction(t)) &&
                (doesBudgetMatchCategory(t.subCategory, sCat, aliasOpts) ||
                  (!t.subCategory &&
                    doesBudgetMatchCategory(t.category, sCat, aliasOpts)))
            )
            .reduce((sum, t) => {
              const amt = Number(t.amount) || 0;
              return sum + (t.type === 'expense' ? amt : -amt);
            }, 0);

          const rawSubSpent = Math.max(0, rawSubNet);
          const effectiveSubSpent = rawSubSpent / allTimeDivisor;
          const exposedSubSpent = options.normalizeAllTime
            ? effectiveSubSpent
            : rawSubSpent;
          const subPercent =
            subBudget > 0 ? Math.round((exposedSubSpent / subBudget) * 100) : 0;
          const subBucket = deriveCategoryBucket(sCat.id || sCat.name, sCat);

          return {
            id: sCat.id,
            name: sCat.name,
            emoji: sCat.emoji,
            color: sCat.color,
            budget: subBudget,
            spent: exposedSubSpent,
            rawSpent: rawSubSpent,
            effectiveSpent: effectiveSubSpent,
            percent: subPercent,
            bucket: subBucket,
          };
        });

        const isNonBudgetable =
          isNonBudgetableCategory(pCat.id) || isNonBudgetableCategory(pCat.name);
        const parentBucket = deriveCategoryBucket(pCat.id || pCat.name, pCat);

        const directParentSpent = monthTransactions
          .filter(
            t =>
              (t.type === 'expense' || isRefundTransaction(t)) &&
              t.category &&
              doesBudgetMatchCategory(t.category, pCat, aliasOpts) &&
              (!t.subCategory || !validSubKeys.has(t.subCategory.toLowerCase()))
          )
          .reduce((sum, t) => {
            const amt = Number(t.amount) || 0;
            return sum + (t.type === 'expense' ? amt : -amt);
          }, 0);

        const rawTotalParentSpent = isNonBudgetable
          ? 0
          : Math.max(
              0,
              directParentSpent +
                subCategorySummaries.reduce((sum, s) => sum + (s.rawSpent ?? s.spent), 0)
            );
        const effectiveParentSpent = rawTotalParentSpent / allTimeDivisor;
        const exposedParentSpent = options.normalizeAllTime
          ? effectiveParentSpent
          : rawTotalParentSpent;

        const budgetRes = resolveEffectiveCategoryBudget(
          pCat.id,
          targetBudgets,
          allKnownCats
        );
        const parentBudget = isNonBudgetable ? 0 : budgetRes.effectiveBudget;
        const parentPercent =
          parentBudget > 0 ? Math.round((exposedParentSpent / parentBudget) * 100) : 0;

        items.push({
          id: pCat.id,
          name: pCat.name,
          emoji: pCat.emoji,
          color: pCat.color,
          budget: parentBudget,
          spent: exposedParentSpent,
          rawSpent: rawTotalParentSpent,
          effectiveSpent: effectiveParentSpent,
          explicitBudget: budgetRes.explicitBudget,
          subCategoryBudgetSum: budgetRes.subCategoryBudgetSum,
          isRolledUpFromSubs: budgetRes.isRolledUpFromSubs,
          catKey: getBudgetCatKey(pCat),
          percent: parentPercent,
          bucket: parentBucket,
          isNonBudgetable,
          subCategories: subCategorySummaries,
        });
      });

      return items;
    },
    [categories, persistedBudgets, monthTransactions, selectedMonth, activeMonthsCount]
  );

  // Working summary & totalBudget drive #/budgets live planning preview
  const categorySummary = useMemo(
    () => buildSummaryForBudgets(workingBudgets, { normalizeAllTime: true }),
    [buildSummaryForBudgets, workingBudgets]
  );

  const totalBudget = useMemo(() => {
    return categorySummary.reduce((sum, c) => {
      if (c.isNonBudgetable) return sum;
      return sum + (Number(c.budget) || 0);
    }, 0);
  }, [categorySummary]);

  // Saved summary & savedTotalBudget insulate Overview and Reports from uncommitted edits (Guardrail G1)
  const savedCategorySummary = useMemo(
    () => buildSummaryForBudgets(persistedBudgets, { normalizeAllTime: false }),
    [buildSummaryForBudgets, persistedBudgets]
  );

  const savedTotalBudget = useMemo(() => {
    return savedCategorySummary.reduce((sum, c) => {
      if (c.isNonBudgetable) return sum;
      return sum + (Number(c.budget) || 0);
    }, 0);
  }, [savedCategorySummary]);

  const committedBudgetMap = useMemo(() => {
    const map = new Map<string, number>();
    for (const item of savedCategorySummary) {
      map.set(item.id, item.budget);
    }
    return map;
  }, [savedCategorySummary]);

  const piePaths = useMemo(
    () => computeDonutSegments(categorySummary, 'all'),
    [categorySummary]
  );

  const spendingHistory = useMemo(
    () => computeSpendingHistory(allTransactions, categories, selectedMonth),
    [allTransactions, categories, selectedMonth]
  );

  const dirtyState = useMemo(
    () =>
      computeBudgetDirtyState(
        persistedBudgets,
        workingBudgets,
        categories,
        budgetErrors
      ),
    [persistedBudgets, workingBudgets, categories, budgetErrors]
  );

  const setBudgets = useCallback((updater: React.SetStateAction<Budget[]>) => {
    setPersistedBudgets(updater);
    setWorkingBudgets(updater);
  }, []);

  const handleBudgetInputChange = useCallback(
    (catName: string, val: string) => {
      setBudgetDrafts(prev => ({ ...prev, [catName]: val }));
      const aliasOpts = getCategoryAliasOptions(categories);
      const matchedCat = categories.find(c =>
        doesBudgetMatchCategory(catName, c, aliasOpts)
      );
      const targetIdentity = matchedCat || { id: catName, name: catName };
      const canonicalKey = matchedCat ? matchedCat.id : catName;

      if (val.trim() === '') {
        setBudgetErrors(prev => ({ ...prev, [catName]: '' }));
        setWorkingBudgets(prev =>
          prev.filter(b => !doesBudgetMatchCategory(b.category, targetIdentity, aliasOpts))
        );
        return;
      }

      const num = parseFloat(val);
      if (isNaN(num) || num < 0) {
        setBudgetErrors(prev => ({ ...prev, [catName]: 'Budget must be positive' }));
        return;
      }

      setBudgetErrors(prev => ({ ...prev, [catName]: '' }));
      setWorkingBudgets(prev => {
        const withoutTarget = prev.filter(
          b => !doesBudgetMatchCategory(b.category, targetIdentity, aliasOpts)
        );
        const next =
          num > 0
            ? [...withoutTarget, { category: canonicalKey, amount: num }]
            : withoutTarget;

        // Keep explicit parent target >= sum of child sub-category targets (BUG-BUD-07)
        if (matchedCat?.parentId) {
          const parentCat = categories.find(c => c.id === matchedCat.parentId);
          if (parentCat) {
            const siblings = categories.filter(c => c.parentId === parentCat.id);
            let newSubSum = 0;
            for (const sib of siblings) {
              const sibEntry = next.find(b =>
                doesBudgetMatchCategory(b.category, sib, aliasOpts)
              );
              newSubSum += Math.max(0, Number(sibEntry?.amount) || 0);
            }
            const parentIdx = next.findIndex(b =>
              doesBudgetMatchCategory(b.category, parentCat, aliasOpts)
            );
            if (parentIdx > -1) {
              const existingParentAmt = Number(next[parentIdx].amount) || 0;
              if (existingParentAmt > 0 && newSubSum > existingParentAmt) {
                next[parentIdx] = { category: parentCat.id, amount: newSubSum };
                setBudgetDrafts(drafts => {
                  if (!(parentCat.id in drafts)) return drafts;
                  const copy = { ...drafts };
                  delete copy[parentCat.id];
                  return copy;
                });
              }
            }
          }
        }

        return next;
      });
    },
    [categories]
  );

  const handleSaveBudgets = useCallback(async () => {
    if (!activeProject || !storageAdapter) return;
    if (isLockedMonth && selectedMonth !== 'all') {
      showToast(`Month ${selectedMonth} is locked.`, 'error');
      return;
    }

    if (dirtyState.hasErrors) {
      showToast('Please fix invalid budget amounts before saving.', 'error');
      if (dirtyState.firstErrorCategoryId && typeof document !== 'undefined') {
        const errCat = categories.find(c => c.id === dirtyState.firstErrorCategoryId);
        const keyCandidate =
          errCat && !errCat.parentId
            ? getBudgetCatKey(errCat)
            : dirtyState.firstErrorCategoryId;
        const allInputs = Array.from(
          document.querySelectorAll<HTMLInputElement>('[data-testid^="budget-input-"]')
        );
        const matchInput = allInputs.find(el => {
          const tid = el.getAttribute('data-testid');
          return (
            tid === `budget-input-${keyCandidate}` ||
            tid === `budget-input-${dirtyState.firstErrorCategoryId}`
          );
        });
        matchInput?.scrollIntoView?.({ block: 'center', behavior: 'smooth' });
        matchInput?.focus?.();
      }
      return;
    }

    const cleaned = cleanBudgetsForSave(workingBudgets, categories);
    try {
      await storageAdapter.saveBudgets(activeProject.id, cleaned);
      setPersistedBudgets(cleaned);
      setWorkingBudgets(cleaned);
      setBudgetDrafts({});
      setBudgetErrors({});
      showToast('Budgets saved successfully');
    } catch (err: unknown) {
      const e = err as { name?: string; message?: string };
      if (e.name === 'QuotaExceededError' || /quota/i.test(e.message || '')) {
        setAuthErrorToast('Storage quota exceeded. Session is now read-only.');
      } else {
        showToast(e.message || 'Failed to save budgets', 'error');
      }
    }
  }, [
    activeProject,
    storageAdapter,
    isLockedMonth,
    selectedMonth,
    dirtyState,
    categories,
    workingBudgets,
    showToast,
    setAuthErrorToast,
  ]);

  const handleDiscardBudgetChanges = useCallback(() => {
    setWorkingBudgets(persistedBudgets);
    setBudgetDrafts({});
    setBudgetErrors({});
  }, [persistedBudgets]);

  const handleApplyBudgetPreset = useCallback(
    (catId: string, amount: number) => {
      if (isLockedMonth && selectedMonth !== 'all') return;
      const rounded = Math.max(0, Math.round(amount));
      handleBudgetInputChange(catId, String(rounded));
    },
    [isLockedMonth, selectedMonth, handleBudgetInputChange]
  );

  const handleAutoFillFromHistory = useCallback((): number => {
    if (isLockedMonth && selectedMonth !== 'all') return 0;
    const aliasOpts = getCategoryAliasOptions(categories);
    let filledCount = 0;
    const additions: Budget[] = [];
    const nextDrafts: Record<string, string> = {};

    for (const item of categorySummary) {
      if (item.isNonBudgetable || item.budget > 0) continue;
      const hist = spendingHistory[item.id];
      const candidate =
        selectedMonth === 'all'
          ? Math.round(item.effectiveSpent ?? 0)
          : hist?.avg3mo || hist?.lastMonth || 0;
      if (candidate > 0) {
        additions.push({ category: item.id, amount: candidate });
        nextDrafts[item.id] = String(candidate);
        filledCount += 1;
      }
    }

    if (filledCount === 0) {
      showToast('No historical category spend available to auto-fill.', 'info');
      return 0;
    }

    setWorkingBudgets(prev => {
      const filtered = prev.filter(
        b =>
          !additions.some(add =>
            doesBudgetMatchCategory(
              b.category,
              categories.find(c => c.id === add.category) || {
                id: add.category,
                name: add.category,
              },
              aliasOpts
            )
          )
      );
      return [...filtered, ...additions];
    });
    setBudgetDrafts(prev => ({ ...prev, ...nextDrafts }));
    showToast(
      `Filled ${filledCount} category target${
        filledCount === 1 ? '' : 's'
      } — click Save Budgets to apply`,
      'info'
    );
    return filledCount;
  }, [isLockedMonth, selectedMonth, categories, categorySummary, spendingHistory, showToast]);

  const handleSaveCategory = async (newCat: Category, isEdit: boolean) => {
    if (!activeProject || !storageAdapter) return false;
    try {
      await storageAdapter.saveCategory(activeProject.id, newCat);
      await refreshBudgetsAndCategories({ preserveWorkingDrafts: true });
      showToast(isEdit ? 'Category edited successfully' : 'Category added successfully');
      return true;
    } catch (err: unknown) {
      showToast(err instanceof Error ? err.message : 'Failed to save category', 'error');
      return false;
    }
  };

  const handleDeleteCategory = async (catId: string) => {
    if (!activeProject || !storageAdapter) return;
    try {
      if (typeof storageAdapter.deleteCategory === 'function') {
        await storageAdapter.deleteCategory(activeProject.id, catId);
      }
      await refreshBudgetsAndCategories({
        preserveWorkingDrafts: true,
        deletedCategoryId: catId,
      });
      showToast('Category deleted');
    } catch (err: unknown) {
      showToast(err instanceof Error ? err.message : 'Failed to delete category', 'error');
    }
  };

  const handleSaveBudgetNote = useCallback(
    async (month: string, keyId: string, text: string, mood?: string) => {
      if (!activeProject || !storageAdapter) return;
      const key = `${month}:${keyId}`;
      const noteObj: BudgetNote = {
        text: text.trim(),
        updatedAt: new Date().toISOString(),
        ...(mood ? { mood } : {}),
      };
      try {
        await storageAdapter.saveBudgetNote(activeProject.id, key, noteObj);
        setBudgetNotes(prev => ({ ...prev, [key]: noteObj }));
        showToast('Note saved');
      } catch (err: unknown) {
        showToast(err instanceof Error ? err.message : 'Failed to save note', 'error');
      }
    },
    [activeProject, storageAdapter, showToast]
  );

  const handleDeleteBudgetNote = useCallback(
    async (month: string, keyId: string) => {
      if (!activeProject || !storageAdapter) return;
      const key = `${month}:${keyId}`;
      try {
        await storageAdapter.deleteBudgetNote(activeProject.id, key);
        setBudgetNotes(prev => {
          const next = { ...prev };
          delete next[key];
          return next;
        });
        showToast('Note removed');
      } catch (err: unknown) {
        showToast(err instanceof Error ? err.message : 'Failed to delete note', 'error');
      }
    },
    [activeProject, storageAdapter, showToast]
  );

  return {
    budgets: persistedBudgets,
    workingBudgets,
    setBudgets,
    categories,
    budgetErrors,
    budgetDrafts,
    totalBudget,
    savedTotalBudget,
    categorySummary,
    savedCategorySummary,
    committedBudgetMap,
    activeMonthsCount,
    isDirty: dirtyState.isDirty,
    dirtyCount: dirtyState.dirtyCount,
    piePaths,
    budgetNotes,
    spendingHistory,
    refreshBudgetsAndCategories,
    handleSaveBudgets,
    handleDiscardBudgetChanges,
    handleBudgetInputChange,
    handleApplyBudgetPreset,
    handleAutoFillFromHistory,
    handleSaveCategory,
    handleDeleteCategory,
    handleSaveBudgetNote,
    handleDeleteBudgetNote,
  };
}
