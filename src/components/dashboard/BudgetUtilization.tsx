import { useState, useMemo } from 'react';
import { Target, Plus, Save, Sparkles } from 'lucide-react';
import { BudgetNote, SpendingBucket } from '../../services/storage';
import { useNavigation } from '../../hooks/useNavigation';
import { getMonthPhase } from '../../utils/metrics';
import type { MonthPhaseInfo } from '../../utils/metrics';
import {
  computeDonutSegments,
  getBudgetCatKey,
  sortBudgetCategories,
  toSoftBadgeBg,
} from '../../utils/budgetPlanning';
import type {
  CategorySpendingHistoryEntry,
  CategorySummary,
  PieSegment,
  SubCategorySummary,
} from '../../utils/budgetPlanning';
import { BudgetAllocationStrip } from '../budgets/BudgetAllocationStrip';
import { BudgetCategoryRow } from '../budgets/BudgetCategoryRow';

export type { CategorySummary, SubCategorySummary, PieSegment };

export interface BudgetUtilizationProps {
  categorySummary: CategorySummary[];
  piePaths?: { segments: PieSegment[]; totalPieExpense: number };
  budgetErrors?: Record<string, string>;
  budgetDrafts?: Record<string, string>;
  handleBudgetInputChange?: (catName: string, val: string) => void;
  handleSaveBudgets?: () => void;
  onOpenCategoryManager?: () => void;
  selectedMonth?: string;
  phaseInfo?: MonthPhaseInfo;
  activeMonthsCount?: number;
  committedBudgetMap?: Map<string, number>;
  budgetNotes?: Record<string, BudgetNote>;
  spendingHistory?: Record<string, CategorySpendingHistoryEntry>;
  handleSaveBudgetNote?: (
    month: string,
    keyId: string,
    text: string,
    mood?: string
  ) => Promise<void>;
  handleDeleteBudgetNote?: (month: string, keyId: string) => Promise<void>;
  onApplyBudgetPreset?: (catId: string, amount: number) => void;
  onAutoFillFromHistory?: () => number;
  isLockedMonth?: boolean;
  hideTopActionBar?: boolean;
  activeBucketTab?: 'all' | SpendingBucket;
  onActiveBucketTabChange?: (tab: 'all' | SpendingBucket) => void;
}

export function BudgetUtilization({
  categorySummary,
  piePaths,
  budgetErrors = {},
  budgetDrafts = {},
  handleBudgetInputChange,
  handleSaveBudgets,
  onOpenCategoryManager,
  selectedMonth = '',
  phaseInfo: phaseInfoProp,
  activeMonthsCount = 1,
  committedBudgetMap,
  budgetNotes = {},
  spendingHistory = {},
  handleSaveBudgetNote,
  handleDeleteBudgetNote,
  onApplyBudgetPreset,
  onAutoFillFromHistory,
  isLockedMonth = false,
  hideTopActionBar = false,
  activeBucketTab: controlledBucketTab,
  onActiveBucketTabChange,
}: BudgetUtilizationProps) {
  const { navigate } = useNavigation();
  const [expandedParents, setExpandedParents] = useState<Set<string>>(new Set());
  const [internalBucketTab, setInternalBucketTab] = useState<'all' | SpendingBucket>('all');

  const activeBucketTab = controlledBucketTab ?? internalBucketTab;
  const setActiveBucketTab = (tab: 'all' | SpendingBucket) => {
    setInternalBucketTab(tab);
    onActiveBucketTabChange?.(tab);
  };

  // Edit states for monthly & category notes
  const [editingKey, setEditingKey] = useState<string | null>(null);
  const [noteText, setNoteText] = useState('');
  const [selectedMood, setSelectedMood] = useState<string | undefined>(undefined);

  const isSpecificMonth = Boolean(selectedMonth && selectedMonth !== 'all');
  const isAllTime = selectedMonth === 'all';
  const isSpecificLocked = isLockedMonth && isSpecificMonth;

  const phaseInfo = useMemo(
    () => phaseInfoProp ?? getMonthPhase(selectedMonth),
    [phaseInfoProp, selectedMonth]
  );

  const fallbackCommittedMap = useMemo(() => {
    if (committedBudgetMap) return committedBudgetMap;
    const map = new Map<string, number>();
    for (const c of categorySummary) {
      map.set(c.id, c.budget);
    }
    return map;
  }, [committedBudgetMap, categorySummary]);

  const { budgetableItems, nonBudgetableItems } = useMemo(() => {
    const sorted = sortBudgetCategories(categorySummary, fallbackCommittedMap, phaseInfo);
    if (activeBucketTab === 'all') {
      return sorted;
    }
    return {
      budgetableItems: sorted.budgetableItems.filter(
        item => (item.bucket || 'flexible') === activeBucketTab
      ),
      nonBudgetableItems: [],
    };
  }, [categorySummary, fallbackCommittedMap, phaseInfo, activeBucketTab]);

  const scopedPie = useMemo(() => {
    if (activeBucketTab === 'all' && piePaths && categorySummary.length === 0) {
      return piePaths;
    }
    return computeDonutSegments(categorySummary, activeBucketTab);
  }, [categorySummary, activeBucketTab, piePaths]);

  const hasAnyBudgetSet = useMemo(
    () => categorySummary.some(c => !c.isNonBudgetable && c.budget > 0),
    [categorySummary]
  );

  const hasAutoFillCandidates = useMemo(() => {
    if (hasAnyBudgetSet || isSpecificLocked || !onAutoFillFromHistory) return false;
    return categorySummary.some(c => {
      if (c.isNonBudgetable) return false;
      if (isAllTime) return Math.round(c.effectiveSpent ?? c.spent) > 0;
      const hist = spendingHistory[c.id];
      return Boolean((hist?.avg3mo ?? 0) > 0 || (hist?.lastMonth ?? 0) > 0);
    });
  }, [
    hasAnyBudgetSet,
    isSpecificLocked,
    onAutoFillFromHistory,
    categorySummary,
    isAllTime,
    spendingHistory,
  ]);

  const toggleExpand = (id: string) => {
    setExpandedParents(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const startEditNote = (keyId: string, initialText = '', initialMood?: string) => {
    if (isSpecificLocked) return;
    setEditingKey(keyId);
    setNoteText(initialText);
    setSelectedMood(initialMood);
  };

  const cancelEditNote = () => {
    setEditingKey(null);
    setNoteText('');
    setSelectedMood(undefined);
  };

  const submitSaveNote = async (keyId: string, moodToSave?: string) => {
    if (!handleSaveBudgetNote || !selectedMonth || isSpecificLocked) return;
    const targetNote = budgetNotes[`${selectedMonth}:${keyId}`];
    const resolvedText = editingKey === keyId ? noteText : targetNote?.text ?? '';
    const resolvedMood =
      moodToSave !== undefined
        ? moodToSave || undefined
        : editingKey === keyId
        ? selectedMood
        : targetNote?.mood;
    await handleSaveBudgetNote(selectedMonth, keyId, resolvedText, resolvedMood);
    if (editingKey === keyId) {
      cancelEditNote();
    }
  };

  const submitDeleteNote = async (keyId: string) => {
    if (!handleDeleteBudgetNote || !selectedMonth || isSpecificLocked) return;
    await handleDeleteBudgetNote(selectedMonth, keyId);
    if (editingKey === keyId) cancelEditNote();
  };

  const handleDrilldownCategory = (catId: string) => {
    if (selectedMonth && selectedMonth !== 'all') {
      navigate(`#/month/${selectedMonth}/category/${encodeURIComponent(catId)}`);
    } else {
      navigate(`#/transactions?month=all&cat=${encodeURIComponent(catId)}`);
    }
  };

  const overallKey = `${selectedMonth}:__overall__`;
  const overallNote = isSpecificMonth ? budgetNotes[overallKey] : undefined;

  return (
    <div className="space-y-2.5 flex-1 flex flex-col min-w-0">
      {/* Standalone Fallback Action Header (Hidden when hosted inside BudgetsView) */}
      {!hideTopActionBar && (
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-[10px] bg-surface2 text-muted-foreground">
              <Target className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-heading font-semibold text-foreground">
                Budget Utilization
              </h3>
              <p className="text-label text-muted-foreground">
                Monitor spending vs limits
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {onOpenCategoryManager && (
              <button
                type="button"
                onClick={onOpenCategoryManager}
                data-testid="open-add-category-btn"
                className="min-h-[34px] inline-flex items-center gap-1 text-label font-medium px-3 rounded-[10px] bg-card hover:bg-surface2 border border-border transition-colors focus-visible:ring-2 ring-ring/40"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Category</span>
              </button>
            )}
            {handleSaveBudgets && (
              <button
                type="button"
                disabled={isSpecificLocked}
                onClick={handleSaveBudgets}
                data-testid="save-budgets-btn"
                className="min-h-[34px] inline-flex items-center gap-1 text-label font-medium px-3 rounded-[10px] bg-primary text-primary-foreground hover:bg-primary/90 transition-colors focus-visible:ring-2 ring-ring/40 disabled:opacity-50"
              >
                <Save className="w-3.5 h-3.5" />
                <span>Save Budgets</span>
              </button>
            )}
          </div>
        </div>
      )}

      {/* Bucket Tabs + Compact Donut Strip + Single-Line Month Note */}
      <BudgetAllocationStrip
        activeBucketTab={activeBucketTab}
        onSelectBucketTab={setActiveBucketTab}
        categorySummary={categorySummary}
        scopedPie={scopedPie}
        isAllTime={isAllTime}
        isSpecificMonth={isSpecificMonth}
        selectedMonth={selectedMonth}
        isLockedMonth={isSpecificLocked}
        overallNote={overallNote}
        editingKey={editingKey}
        noteText={noteText}
        selectedMood={selectedMood}
        onNoteTextChange={setNoteText}
        onSelectMood={setSelectedMood}
        onStartEditNote={startEditNote}
        onCancelEditNote={cancelEditNote}
        onSaveNote={submitSaveNote}
        onDeleteNote={submitDeleteNote}
      />

      {/* 1-Click Auto-Fill Onboarding Helper when $0 budgeted */}
      {hasAutoFillCandidates && (
        <div
          data-testid="budgets-autofill-banner"
          className="flex flex-wrap items-center justify-between gap-2 px-3 py-2 rounded-[10px] bg-surface2/70 border border-border text-xs"
        >
          <span className="text-muted-foreground">
            No monthly targets set yet — jump-start your plan from historical category
            spending.
          </span>
          <button
            type="button"
            data-testid="autofill-budgets-btn"
            onClick={() => onAutoFillFromHistory?.()}
            className="min-h-[32px] px-3 rounded-[8px] bg-card hover:bg-surface2 border border-border text-foreground font-semibold inline-flex items-center gap-1.5 transition-colors focus-visible:ring-2 ring-ring/40"
          >
            <Sparkles className="w-3.5 h-3.5" />
            <span>
              {isAllTime ? 'Auto-fill from monthly avg' : 'Auto-fill from 3-mo avg'}
            </span>
          </button>
        </div>
      )}

      {/* Single-Surface Calm Ledger (overflow-y-auto WITHOUT max-h-[800px] eliminates double scrollbars) */}
      <div
        data-testid="budget-grid-container"
        className="w-full overflow-y-auto rounded-[12px] border border-border bg-card divide-y divide-border"
      >
        {/* Desktop Ledger Column Header */}
        <div className="hidden lg:grid lg:grid-cols-[minmax(175px,1.35fr)_minmax(185px,1.4fr)_auto] items-center gap-x-4 px-3.5 py-2 bg-surface2/40 text-[11px] leading-4 font-semibold uppercase tracking-wider text-muted-foreground">
          <span>
            Category{' '}
            <span className="normal-case font-normal text-muted-foreground/80">
              ({budgetableItems.length})
            </span>
          </span>
          <span>Progress & Pace</span>
          <span className="text-right pr-9">
            {isAllTime ? 'Avg / mo · Target' : 'Spent · Monthly Target'}
          </span>
        </div>

        {/* Budgetable Category Rows */}
        {budgetableItems.length > 0 ? (
          budgetableItems.map(item => (
            <BudgetCategoryRow
              key={item.id}
              item={item}
              phaseInfo={phaseInfo}
              isExpanded={expandedParents.has(item.id)}
              onToggleExpand={toggleExpand}
              isSpecificMonth={isSpecificMonth}
              isAllTime={isAllTime}
              activeMonthsCount={activeMonthsCount}
              selectedMonth={selectedMonth}
              isLockedMonth={isSpecificLocked}
              budgetErrors={budgetErrors}
              budgetDrafts={budgetDrafts}
              budgetNotes={budgetNotes}
              spendingHistory={spendingHistory}
              editingKey={editingKey}
              noteText={noteText}
              onNoteTextChange={setNoteText}
              onStartEditNote={startEditNote}
              onCancelEditNote={cancelEditNote}
              onSaveNote={submitSaveNote}
              onDeleteNote={submitDeleteNote}
              onBudgetInputChange={handleBudgetInputChange}
              onApplyBudgetPreset={onApplyBudgetPreset}
              onDrilldownCategory={handleDrilldownCategory}
            />
          ))
        ) : (
          <div className="px-4 py-8 text-center text-body text-muted-foreground">
            No categories in this spending bucket.
          </div>
        )}

        {/* Compact Cash-Flow Exclusions Footer (All Tab Only; Preserves 13 Default Categories Contract) */}
        {activeBucketTab === 'all' && nonBudgetableItems.length > 0 && (
          <div
            data-testid="budget-exclusions-footer"
            className="bg-surface2/25 divide-y divide-border/50"
          >
            <div className="px-3.5 py-1.5 text-[10px] leading-4 font-semibold uppercase tracking-wider text-muted-foreground">
              Cash-Flow Exclusions (Tracked outside expense targets)
            </div>
            {nonBudgetableItems.map(item => {
              const catKey = item.catKey || getBudgetCatKey(item);
              const isIncome =
                item.name.toLowerCase().includes('income') ||
                item.id.toLowerCase().includes('income') ||
                item.id.toLowerCase() === 'salary';
              return (
                <div
                  key={item.id}
                  className="px-3.5 py-2 flex items-center justify-between gap-2 text-xs"
                >
                  <div className="flex items-center gap-2 min-w-0">
                    <span
                      data-testid={`category-badge-${catKey}`}
                      className="w-6 h-6 rounded-[6px] flex items-center justify-center text-xs leading-none shrink-0 border border-border/50"
                      style={{ backgroundColor: toSoftBadgeBg(item.color) }}
                    >
                      {item.emoji}
                    </span>
                    <span
                      data-testid={`budget-label-${catKey}`}
                      className="font-medium text-muted-foreground truncate"
                    >
                      {item.name}
                    </span>
                  </div>
                  <span className="px-2 py-0.5 rounded-full text-[10px] leading-4 font-medium bg-surface2 text-muted-foreground border border-border shrink-0">
                    {isIncome ? 'Inflow (Excluded)' : 'Transfer (Excluded)'}
                  </span>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
