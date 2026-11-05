import { useState, useMemo } from 'react';
import { Target, Plus, Save, ChevronDown, ChevronRight, FileText, Edit2, Trash2, Check, Sparkles, Calendar, Edit3, X } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { BudgetNote } from '../../services/storage';

export interface SubCategorySummary {
  id: string;
  name: string;
  emoji: string;
  color: string;
  budget: number;
  spent: number;
  percent: number;
  bucket?: 'fixed' | 'flexible' | 'non-monthly';
}

export interface CategorySummary {
  id: string;
  name: string;
  emoji: string;
  color: string;
  budget: number;
  spent: number;
  percent: number;
  bucket?: 'fixed' | 'flexible' | 'non-monthly';
  isNonBudgetable?: boolean;
  subCategories?: SubCategorySummary[];
}

interface BudgetUtilizationProps {
  categorySummary: CategorySummary[];
  piePaths?: { segments: any[]; totalPieExpense: number };
  budgetErrors?: Record<string, string>;
  handleBudgetInputChange?: (catName: string, val: string) => void;
  handleSaveBudgets?: () => void;
  setShowAddCatModal?: (show: boolean) => void;
  selectedMonth?: string;
  budgetNotes?: Record<string, BudgetNote>;
  spendingHistory?: Record<string, { lastMonth: number; avg3mo: number }>;
  handleSaveBudgetNote?: (month: string, keyId: string, text: string, mood?: string) => Promise<void>;
  handleDeleteBudgetNote?: (month: string, keyId: string) => Promise<void>;
  isLockedMonth?: boolean;
}

const MOOD_OPTIONS = [
  { emoji: '👍', label: 'Good' },
  { emoji: '⚠️', label: 'Tough' },
  { emoji: '🎉', label: 'Great' },
  { emoji: '📉', label: 'Cutback' },
];

function formatDateTimestamp(isoString?: string) {
  if (!isoString) return '';
  try {
    const d = new Date(isoString);
    return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  } catch {
    return '';
  }
}

function formatMonthDisplay(monthStr?: string) {
  if (!monthStr || monthStr === 'all') return '';
  const parts = monthStr.split('-');
  if (parts.length !== 2) return monthStr;
  const year = parseInt(parts[0], 10);
  const monthNum = parseInt(parts[1], 10);
  if (isNaN(year) || isNaN(monthNum)) return monthStr;
  const date = new Date(Date.UTC(year, monthNum - 1, 1));
  return date.toLocaleDateString(undefined, { month: 'long', year: 'numeric', timeZone: 'UTC' });
}

export function BudgetUtilization({
  categorySummary,
  piePaths,
  budgetErrors = {},
  handleBudgetInputChange,
  handleSaveBudgets,
  setShowAddCatModal,
  selectedMonth = '',
  budgetNotes = {},
  spendingHistory = {},
  handleSaveBudgetNote,
  handleDeleteBudgetNote,
  isLockedMonth = false,
}: BudgetUtilizationProps) {
  const [expandedParents, setExpandedParents] = useState<Set<string>>(new Set());

  // Edit states for notes
  const [editingKey, setEditingKey] = useState<string | null>(null);
  const [noteText, setNoteText] = useState('');
  const [selectedMood, setSelectedMood] = useState<string | undefined>(undefined);

  const isSpecificMonth = Boolean(selectedMonth && selectedMonth !== 'all');

  const toggleExpand = (id: string) => {
    setExpandedParents(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const startEditNote = (keyId: string, initialText = '', initialMood?: string) => {
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
    if (!handleSaveBudgetNote || !selectedMonth) return;
    await handleSaveBudgetNote(selectedMonth, keyId, noteText, moodToSave ?? selectedMood);
    cancelEditNote();
  };

  const submitDeleteNote = async (keyId: string) => {
    if (!handleDeleteBudgetNote || !selectedMonth) return;
    await handleDeleteBudgetNote(selectedMonth, keyId);
    if (editingKey === keyId) cancelEditNote();
  };

  // Overall month note object
  const overallKey = `${selectedMonth}:__overall__`;
  const overallNote = isSpecificMonth ? budgetNotes[overallKey] : undefined;

  const [activeBucketTab, setActiveBucketTab] = useState<'flexible' | 'fixed' | 'non-monthly' | 'all'>('all');
  const [showEditDrawer, setShowEditDrawer] = useState(false);

  const budgetableSummary = useMemo(() => {
    return categorySummary.filter(c => !c.isNonBudgetable);
  }, [categorySummary]);

  const displayedCategories = useMemo(() => {
    if (activeBucketTab === 'all') return categorySummary;
    return categorySummary.filter(item => {
      if (item.isNonBudgetable) return false;
      return item.bucket === activeBucketTab;
    });
  }, [categorySummary, activeBucketTab]);

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

          <button
            onClick={() => setShowEditDrawer(prev => !prev)}
            data-testid="toggle-budget-drawer-btn"
            className="flex items-center gap-1 text-xs font-bold px-3 py-1.5 rounded-lg bg-card/60 hover:bg-card border border-border transition-colors text-foreground"
          >
            <Edit3 className="w-3.5 h-3.5" />
            <span>{showEditDrawer ? 'Close Targets' : 'Quick Targets'}</span>
          </button>

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

      {/* Bucket Filter Tabs */}
      <div className="flex items-center gap-1.5 mb-4 p-1 bg-card/50 rounded-xl border border-border/50" data-testid="budget-bucket-tabs">
        <button
          onClick={() => setActiveBucketTab('flexible')}
          aria-label="Flexible / Variable"
          className={`flex-1 py-1.5 px-3 rounded-lg text-xs font-bold transition-all ${activeBucketTab === 'flexible' ? 'bg-violet-500 text-white shadow-md' : 'text-muted-foreground hover:text-foreground'}`}
        >
          🟣 Flexible
        </button>
        <button
          onClick={() => setActiveBucketTab('fixed')}
          aria-label="Fixed"
          className={`flex-1 py-1.5 px-3 rounded-lg text-xs font-bold transition-all ${activeBucketTab === 'fixed' ? 'bg-blue-500 text-white shadow-md' : 'text-muted-foreground hover:text-foreground'}`}
        >
          🔵 Fixed
        </button>
        <button
          onClick={() => setActiveBucketTab('non-monthly')}
          aria-label="Non-Monthly"
          className={`flex-1 py-1.5 px-3 rounded-lg text-xs font-bold transition-all ${activeBucketTab === 'non-monthly' ? 'bg-amber-500 text-white shadow-md' : 'text-muted-foreground hover:text-foreground'}`}
        >
          🟠 Non-Monthly
        </button>
        <button
          onClick={() => setActiveBucketTab('all')}
          aria-label="All"
          className={`py-1.5 px-3 rounded-lg text-xs font-bold transition-all ${activeBucketTab === 'all' ? 'bg-primary text-primary-foreground shadow-md' : 'text-muted-foreground hover:text-foreground'}`}
        >
          All
        </button>
      </div>

      {/* Monthly Overview Note Banner (Item 5: Mood tags & Whole Month Note) */}
      {isSpecificMonth && (
        <div className="mb-5 bg-card/40 border border-border/50 rounded-xl p-3.5 transition-all">
          <div className="flex items-center justify-between gap-2 mb-2">
            <div className="flex items-center gap-2 text-xs font-bold text-foreground">
              <Calendar className="w-4 h-4 text-primary" />
              <span>{formatMonthDisplay(selectedMonth)} Overview Note</span>
              {overallNote?.mood && (
                <span className="px-2 py-0.5 rounded-full text-xs bg-primary/15 border border-primary/30">
                  {overallNote.mood}
                </span>
              )}
            </div>

            {/* Mood selector buttons */}
            <div className="flex items-center gap-1">
              {MOOD_OPTIONS.map(opt => {
                const isSelected = overallNote?.mood === opt.emoji || selectedMood === opt.emoji;
                return (
                  <button
                    key={opt.label}
                    onClick={() => {
                      const nextMood = isSelected ? undefined : opt.emoji;
                      setSelectedMood(nextMood);
                      if (overallNote && handleSaveBudgetNote) {
                        handleSaveBudgetNote(selectedMonth, '__overall__', overallNote.text, nextMood);
                      }
                    }}
                    title={opt.label}
                    className={`px-1.5 py-0.5 text-xs rounded-md border transition-all ${
                      isSelected
                        ? 'bg-primary/20 border-primary text-foreground scale-105 font-bold'
                        : 'bg-card/40 border-border/40 text-muted-foreground hover:bg-card hover:text-foreground'
                    }`}
                  >
                    {opt.emoji}
                  </button>
                );
              })}
            </div>
          </div>

          {editingKey === '__overall__' ? (
            <div className="space-y-2 pt-1">
              <textarea
                value={noteText}
                onChange={e => setNoteText(e.target.value)}
                placeholder={`Add summary context for ${formatMonthDisplay(selectedMonth)} (e.g. Vacation month, hosting family)...`}
                rows={2}
                className="w-full text-xs p-2.5 rounded-lg bg-card border border-primary/50 text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary"
              />
              <div className="flex justify-end gap-2">
                <button
                  onClick={cancelEditNote}
                  className="px-2.5 py-1 text-xs font-medium rounded-md bg-card border border-border text-muted-foreground hover:text-foreground"
                >
                  Cancel
                </button>
                <button
                  onClick={() => submitSaveNote('__overall__')}
                  className="px-2.5 py-1 text-xs font-bold rounded-md bg-primary text-primary-foreground hover:bg-primary/90 flex items-center gap-1"
                >
                  <Check className="w-3 h-3" /> Save Note
                </button>
              </div>
            </div>
          ) : overallNote?.text ? (
            <div className="flex items-start justify-between gap-3 text-xs bg-card/60 rounded-lg p-2.5 border border-border/40">
              <div className="space-y-0.5 flex-1 min-w-0">
                <p className="text-foreground whitespace-pre-wrap leading-relaxed">{overallNote.text}</p>
                {overallNote.updatedAt && (
                  <p className="text-[10px] text-muted-foreground/80 font-medium">
                    Updated {formatDateTimestamp(overallNote.updatedAt)}
                  </p>
                )}
              </div>
              <div className="flex items-center gap-1 shrink-0">
                <button
                  onClick={() => startEditNote('__overall__', overallNote.text, overallNote.mood)}
                  className="p-1 rounded hover:bg-card text-muted-foreground hover:text-foreground transition-colors"
                  title="Edit note"
                >
                  <Edit2 className="w-3.5 h-3.5" />
                </button>
                <button
                  onClick={() => submitDeleteNote('__overall__')}
                  className="p-1 rounded hover:bg-card text-muted-foreground hover:text-destructive transition-colors"
                  title="Delete note"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          ) : (
            <button
              onClick={() => startEditNote('__overall__')}
              className="text-xs text-muted-foreground hover:text-primary flex items-center gap-1.5 font-medium transition-colors pt-0.5"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Add Monthly Overview Note for {formatMonthDisplay(selectedMonth)}...</span>
            </button>
          )}
        </div>
      )}

      {/* Visual Charts Container for E2E and User Analytics */}
      <div data-testid="charts-container" className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-4">
        {/* SVG Pie Chart */}
        <div className="glass-card p-4 rounded-xl border border-border/40 flex flex-col items-center">
          <span className="text-xs font-semibold text-muted-foreground mb-2">Category Breakdown (Pie)</span>
          <svg className="w-full h-40" data-testid="chart-svg-pie" viewBox="0 0 300 192">
            <rect width="100%" height="100%" fill="rgba(255,255,255,0.02)" rx="8" />
            {(!piePaths || piePaths.totalPieExpense === 0) ? (
              <text x="50%" y="50%" textAnchor="middle" fill="currentColor" className="no-data-text text-muted-foreground text-xs">
                No data available
              </text>
            ) : (
              piePaths.segments.map(p => (
                <path
                  key={p.category}
                  d={p.pathData}
                  fill={p.color}
                  data-testid={`pie-segment-${p.category}`}
                />
              ))
            )}
          </svg>
          {piePaths?.segments && piePaths.segments.length > 0 && (
            <div className="flex flex-wrap items-center justify-center gap-x-3 gap-y-1 mt-3 pt-2 border-t border-border/30 w-full text-[11px] text-muted-foreground">
              {piePaths.segments.map(seg => {
                const pct = piePaths.totalPieExpense > 0 ? Math.round((seg.expense / piePaths.totalPieExpense) * 100) : 0;
                return (
                  <div key={seg.category} className="flex items-center gap-1.5">
                    <span className="w-2.5 h-2.5 rounded-full shrink-0 shadow-sm" style={{ backgroundColor: seg.color }} />
                    <span className="font-semibold text-foreground truncate max-w-[80px]">{seg.name || seg.category}</span>
                    <span className="tabular-nums font-medium">${Math.round(seg.expense).toLocaleString()} ({pct}%)</span>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* SVG Budget vs Actual Chart */}
        <div className="glass-card p-4 rounded-xl border border-border/40 flex flex-col items-center">
          <span className="text-xs font-semibold text-muted-foreground mb-2">Budget vs Actual</span>
          <svg className="w-full h-40" data-testid="chart-svg-budget" viewBox="0 0 360 180">
            <rect width="100%" height="100%" fill="rgba(255,255,255,0.02)" rx="8" />
            <g className="budget-bar">
              {budgetableSummary.map((eb, idx) => {
                const x = 20 + idx * 45;
                const maxVal = Math.max(eb.budget, eb.spent, 1);
                const budgetHeight = eb.budget === 0 ? 10 : Math.max(Math.min((eb.budget / maxVal) * 90, 95), 10);
                const catKey = eb.id === 'food' ? 'Food' : eb.name;
                return (
                  <rect 
                    key={`b-${eb.id}`}
                    className={`budget-bar-${catKey}`}
                    x={x} 
                    y={130 - budgetHeight} 
                    width="12" 
                    height={budgetHeight} 
                    fill="rgba(255,255,255,0.2)" 
                    rx="2"
                  />
                );
              })}
            </g>
            <g className="actual-bar">
              {budgetableSummary.map((eb, idx) => {
                const x = 20 + idx * 45;
                const maxVal = Math.max(eb.budget, eb.spent, 1);
                const spentHeight = eb.spent === 0 ? 5 : Math.max(Math.min((eb.spent / maxVal) * 90, 95), 5);
                const catKey = eb.id === 'food' ? 'Food' : eb.name;
                return (
                  <rect 
                    key={`a-${eb.id}`}
                    className={`actual-bar-${catKey}`}
                    x={x + 14} 
                    y={130 - spentHeight} 
                    width="12" 
                    height={spentHeight} 
                    fill={eb.color} 
                    rx="2"
                  />
                );
              })}
            </g>
            {budgetableSummary.map((eb, idx) => {
              const x = 20 + idx * 45;
              return (
                <text key={`t-${eb.id}`} x={x + 13} y="150" textAnchor="middle" fontSize="11" fill="currentColor">
                  {eb.emoji}
                </text>
              );
            })}
            <line x1="10" y1="130" x2="350" y2="130" stroke="rgba(255,255,255,0.15)" strokeWidth="1" />
          </svg>
          <div className="flex flex-wrap items-center justify-center gap-4 mt-3 pt-2 border-t border-border/30 w-full text-[11px] text-muted-foreground">
            <div className="flex items-center gap-1.5">
              <span className="w-3 h-3 rounded-sm bg-white/20 inline-block border border-border/50 shadow-sm" />
              <span className="font-medium text-foreground">Budget Limit</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="w-3 h-3 rounded-sm bg-primary inline-block shadow-sm" />
              <span className="font-medium text-foreground">Actual Spent</span>
            </div>
          </div>
        </div>
      </div>

      {/* Target Policy Label & Quick Drawer (C10 & U8) */}
      <div className="flex items-center justify-between text-xs text-muted-foreground px-1 mb-2">
        <span className="font-semibold text-foreground/90">
          Monthly Budget Target <span className="text-[11px] font-normal text-muted-foreground">(applies across months)</span>
        </span>
        <span className="text-[11px]">
          {displayedCategories.length} {displayedCategories.length === 1 ? 'category' : 'categories'}
        </span>
      </div>

      {/* Quick Target Drawer (U8) */}
      <AnimatePresence>
        {showEditDrawer && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className="mb-4 p-3.5 bg-card/60 border border-border/60 rounded-xl space-y-3 overflow-hidden"
          >
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-foreground flex items-center gap-1.5">
                <Edit3 className="w-3.5 h-3.5 text-primary" />
                <span>Quick Target Editor</span>
              </span>
              <button
                onClick={() => setShowEditDrawer(false)}
                className="p-1 rounded hover:bg-card text-muted-foreground"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-h-48 overflow-y-auto pr-1">
              {budgetableSummary.map(item => (
                <div key={`drawer-${item.id}`} className="flex items-center justify-between gap-2 p-2 rounded-lg bg-card/40 border border-border/40 text-xs">
                  <span className="truncate flex items-center gap-1.5 font-medium">
                    <span>{item.emoji}</span>
                    <span className="truncate">{item.name}</span>
                  </span>
                  <div className="flex items-center gap-1 bg-card border border-border/80 rounded px-2 py-0.5 shrink-0">
                    <span className="text-[10px] text-muted-foreground">$</span>
                    <input
                      disabled={isLockedMonth}
                      type="number"
                      min="0"
                      value={item.budget === 0 ? '0' : (item.budget || '')}
                      onChange={e => handleBudgetInputChange?.(item.id, e.target.value)}
                      className="w-14 bg-transparent text-xs font-bold text-right outline-none"
                    />
                  </div>
                </div>
              ))}
            </div>
            {handleSaveBudgets && (
              <div className="flex justify-end pt-1 border-t border-border/30">
                <button
                  onClick={handleSaveBudgets}
                  className="px-3 py-1 text-xs font-bold bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 flex items-center gap-1"
                >
                  <Save className="w-3 h-3" /> Save All Targets
                </button>
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Categories List */}
      <div className="w-full space-y-3 flex-1 overflow-y-auto max-h-[800px]" data-testid="budget-grid-container">
        {displayedCategories.length > 0 ? (
          displayedCategories.map(item => {
            const catKey = item.id === 'food' ? 'Food' : (item.id === 'meals' ? 'Meals' : (item.id === 'housing' ? 'Rent' : item.name));
            if (item.isNonBudgetable) {
              return (
                <div key={item.id} className="glass-card p-4 rounded-xl border border-border/50 space-y-2 bg-card/25">
                  <div className="flex items-center justify-between gap-2">
                    <div className="font-semibold flex items-center gap-2.5 text-base truncate min-w-0">
                      <span 
                      data-testid={`category-badge-${catKey}`}
                      className="text-base leading-none shrink-0"
                      style={{ backgroundColor: item.color }}
                    >
                      {item.emoji}
                    </span>
                      <span className="truncate" data-testid={`budget-label-${item.id === 'food' ? 'Food' : item.name}`}>{item.name}</span>
                    </div>
                    <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider bg-secondary/15 text-secondary border border-secondary/30 shrink-0">
                      {item.name.toLowerCase().includes('income') || item.id.toLowerCase().includes('income') ? 'Inflow (Non-budgetable)' : 'Transfer (Non-budgetable)'}
                    </span>
                  </div>
                  <p className="text-[11px] text-muted-foreground/80 italic">
                    Tracked in cash flow waterfall — excluded from expense budget limits.
                  </p>
                </div>
              );
            }

            const hasSubCats = item.subCategories && item.subCategories.length > 0;
            const isExpanded = expandedParents.has(item.id);
            const isOver = item.spent > item.budget && item.budget > 0;
            const isNearCap = !isOver && item.percent >= 80 && item.budget > 0;
            const remaining = item.budget - item.spent;

            // Note for parent category
            const parentNoteKey = `${selectedMonth}:${item.id}`;
            const parentNote = isSpecificMonth ? budgetNotes[parentNoteKey] : undefined;

            // Spending history (Item 4)
            const catHistory = spendingHistory[item.id];

            // Smart placeholder text (Item 2)
            let placeholderText = `Add context for ${item.name} this month...`;
            if (isOver) {
              const overAmt = Math.abs(remaining).toFixed(0);
              placeholderText = `Why did ${item.name} go $${overAmt} over target this month?`;
            } else if (isNearCap) {
              placeholderText = `${item.name} is at ${item.percent.toFixed(0)}% limit — anything to note?`;
            } else if (item.budget > 0) {
              placeholderText = `Anything notable about ${item.name} spending this month?`;
            }

            return (
              <div key={item.id} className="glass-card p-4 rounded-xl border border-border/50 space-y-3">
                {/* Line 1: Category Header & Status Badge */}
                <div className="flex items-center justify-between gap-2">
                  <div 
                    onClick={() => toggleExpand(item.id)}
                    className="font-semibold flex items-center gap-2.5 text-base cursor-pointer hover:text-primary transition-colors truncate min-w-0"
                  >
                    <span className="text-muted-foreground shrink-0">
                      {isExpanded ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                    </span>
                    <span 
                      data-testid={`category-badge-${catKey}`}
                      className="text-base leading-none shrink-0"
                      style={{ backgroundColor: item.color }}
                    >
                      {item.emoji}
                    </span>
                    <span className="truncate" data-testid={`budget-label-${catKey}`}>{item.name}</span>

                    {/* Note indicator icon (Item 1: Note indicator on collapsed cards) */}
                    {isSpecificMonth && parentNote && (
                      <span className="shrink-0 flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-bold bg-primary/10 text-primary border border-primary/20">
                        <FileText className="w-3 h-3" />
                        <span>Note</span>
                      </span>
                    )}
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
                          disabled={isLockedMonth}
                          type="number"
                          min="0"
                          data-testid={`budget-input-${catKey}`}
                          value={item.budget === 0 ? '0' : (item.budget || '')}
                          placeholder="0"
                          onChange={e => handleBudgetInputChange(item.id, e.target.value)}
                          className="w-16 bg-transparent text-sm font-bold text-foreground tabular-nums outline-none text-right disabled:opacity-50 disabled:cursor-not-allowed"
                        />
                      </div>
                    ) : (
                      <span className="font-bold text-foreground tabular-nums">${item.budget}</span>
                    )}
                  </div>
                </div>

                {budgetErrors[item.id] && (
                  <p className={`text-[10px] text-destructive font-bold budget-error-${catKey}`} data-testid="budget-error">
                    {budgetErrors[item.id]}
                  </p>
                )}

                {/* Line 4: Progress Bar & Status Text */}
                {item.budget > 0 ? (
                  <div className="space-y-1 pt-0.5">
                    <div className="h-2 bg-card/60 rounded-full overflow-hidden border border-border/40">
                      <motion.div
                        data-testid={`budget-indicator-${catKey}`}
                        initial={{ width: 0 }}
                        animate={{ width: `${Math.min(item.percent, 100)}%` }}
                        transition={{ duration: 0.8, delay: 0.1 }}
                        className={`h-full rounded-full ${item.percent > 100 ? 'bg-destructive bg-red-500 budget-overspent' : ''}`}
                        style={{ backgroundColor: item.percent <= 100 ? item.color : undefined }}
                      />
                    </div>
                    <div className="flex justify-between items-center text-[11px] text-muted-foreground px-0.5 font-medium tabular-nums">
                      <span data-testid={`budget-utilization-${catKey}`}>{item.percent.toFixed(0)}% used</span>
                      <span 
                        data-testid={`budget-remaining-${catKey}`}
                        className={isOver ? 'text-destructive font-semibold' : ''}
                      >
                        {isOver
                          ? `$${Math.abs(remaining).toFixed(2)} over target`
                          : `$${remaining.toFixed(2)} remaining`}
                      </span>
                    </div>
                  </div>
                ) : (
                  <div className="text-[11px] text-muted-foreground/70 italic px-0.5 pt-0.5">
                    Enter a budget target above to track utilization
                  </div>
                )}

                {/* Expanded Section (Sub-categories & Category Notes) */}
                <AnimatePresence>
                  {isExpanded && (
                    <motion.div
                      initial={{ opacity: 0, height: 0 }}
                      animate={{ opacity: 1, height: 'auto' }}
                      exit={{ opacity: 0, height: 0 }}
                      className="pt-3 pl-3 sm:pl-4 border-l-2 border-primary/20 space-y-3 mt-2"
                    >
                      {/* Spending Delta Context (Item 4) */}
                      {isSpecificMonth && catHistory && (
                        <div className="text-[11px] text-muted-foreground bg-card/30 rounded-md px-2.5 py-1.5 border border-border/20 flex flex-wrap items-center justify-between gap-2 tabular-nums">
                          <span className="font-semibold text-foreground flex items-center gap-1">
                            <Sparkles className="w-3 h-3 text-primary" /> Context:
                          </span>
                          <div className="flex items-center gap-3">
                            <span>Last month: <strong className="text-foreground">${catHistory.lastMonth}</strong></span>
                            <span>3-mo avg: <strong className="text-foreground">${catHistory.avg3mo}</strong></span>
                          </div>
                        </div>
                      )}

                      {/* Parent Category Note Block */}
                      {isSpecificMonth && (
                        <div className="bg-card/30 rounded-lg p-3 border border-border/30 space-y-2">
                          <div className="flex items-center justify-between text-xs font-semibold text-foreground">
                            <span className="flex items-center gap-1.5">
                              <FileText className="w-3.5 h-3.5 text-primary" />
                              <span>{item.name} Monthly Note</span>
                            </span>
                            {parentNote?.updatedAt && (
                              <span className="text-[10px] text-muted-foreground font-normal">
                                {formatDateTimestamp(parentNote.updatedAt)}
                              </span>
                            )}
                          </div>

                          {editingKey === item.id ? (
                            <div className="space-y-2 pt-1">
                              <textarea
                                value={noteText}
                                onChange={e => setNoteText(e.target.value)}
                                placeholder={placeholderText}
                                rows={2}
                                className="w-full text-xs p-2 rounded-md bg-card border border-primary/50 text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary"
                              />
                              <div className="flex justify-end gap-2">
                                <button
                                  onClick={cancelEditNote}
                                  className="px-2 py-1 text-[11px] font-medium rounded bg-card border border-border text-muted-foreground hover:text-foreground"
                                >
                                  Cancel
                                </button>
                                <button
                                  onClick={() => submitSaveNote(item.id)}
                                  className="px-2 py-1 text-[11px] font-bold rounded bg-primary text-primary-foreground hover:bg-primary/90 flex items-center gap-1"
                                >
                                  <Check className="w-3 h-3" /> Save
                                </button>
                              </div>
                            </div>
                          ) : parentNote?.text ? (
                            <div className="flex items-start justify-between gap-2 text-xs bg-card/60 rounded p-2 border border-border/30">
                              <p className="text-foreground whitespace-pre-wrap leading-relaxed flex-1">{parentNote.text}</p>
                              <div className="flex items-center gap-1 shrink-0">
                                <button
                                  onClick={() => startEditNote(item.id, parentNote.text)}
                                  className="p-1 rounded hover:bg-card text-muted-foreground hover:text-foreground"
                                  title="Edit note"
                                >
                                  <Edit2 className="w-3 h-3" />
                                </button>
                                <button
                                  onClick={() => submitDeleteNote(item.id)}
                                  className="p-1 rounded hover:bg-card text-muted-foreground hover:text-destructive"
                                  title="Delete note"
                                >
                                  <Trash2 className="w-3 h-3" />
                                </button>
                              </div>
                            </div>
                          ) : (
                            <button
                              onClick={() => startEditNote(item.id)}
                              className="text-xs text-muted-foreground hover:text-primary flex items-center gap-1 font-medium transition-colors"
                            >
                              <Plus className="w-3 h-3" /> Add note for {item.name}...
                            </button>
                          )}
                        </div>
                      )}

                      {/* Sub-categories Accordion */}
                      {hasSubCats && (
                        <div className="space-y-2.5 pt-1">
                          {item.subCategories!.map(sub => {
                            const subOver = sub.spent > sub.budget && sub.budget > 0;
                            const subRemaining = sub.budget - sub.spent;

                            const subNoteKey = `${selectedMonth}:${sub.id}`;
                            const subNote = isSpecificMonth ? budgetNotes[subNoteKey] : undefined;

                            return (
                              <div key={sub.id} className="bg-card/20 p-3 rounded-lg border border-border/30 space-y-2">
                                {/* Sub-category Header */}
                                <div className="flex items-center justify-between gap-2 text-xs">
                                  <span className="font-semibold text-foreground flex items-center gap-1.5 truncate">
                                    <span>{sub.emoji}</span>
                                    <span className="truncate">{sub.name}</span>
                                    {isSpecificMonth && subNote && (
                                      <FileText className="w-3 h-3 text-primary shrink-0" />
                                    )}
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
                                          disabled={isLockedMonth}
                                          type="number"
                                          min="0"
                                          data-testid={`budget-input-${sub.id}`}
                                          value={sub.budget === 0 ? '0' : (sub.budget || '')}
                                          placeholder="0"
                                          onChange={e => handleBudgetInputChange(sub.id, e.target.value)}
                                          className="w-14 bg-transparent text-xs text-right font-bold tabular-nums outline-none text-foreground disabled:opacity-50 disabled:cursor-not-allowed"
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
                                      <motion.div
                                        initial={{ width: 0 }}
                                        animate={{ width: `${Math.min(sub.percent, 100)}%` }}
                                        transition={{ duration: 0.6, delay: 0.15 }}
                                        className={`h-full rounded-full ${sub.percent > 100 ? 'bg-destructive' : ''}`}
                                        style={{
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

                                {/* Sub-category Note Block */}
                                {isSpecificMonth && (
                                  <div className="pt-1 border-t border-border/20">
                                    {editingKey === sub.id ? (
                                      <div className="space-y-1.5">
                                        <textarea
                                          value={noteText}
                                          onChange={e => setNoteText(e.target.value)}
                                          placeholder={`Add note for ${sub.name}...`}
                                          rows={2}
                                          className="w-full text-[11px] p-1.5 rounded bg-card border border-primary/50 text-foreground placeholder:text-muted-foreground focus:outline-none"
                                        />
                                        <div className="flex justify-end gap-1.5">
                                          <button
                                            onClick={cancelEditNote}
                                            className="px-2 py-0.5 text-[10px] rounded bg-card border border-border text-muted-foreground"
                                          >
                                            Cancel
                                          </button>
                                          <button
                                            onClick={() => submitSaveNote(sub.id)}
                                            className="px-2 py-0.5 text-[10px] font-bold rounded bg-primary text-primary-foreground"
                                          >
                                            Save
                                          </button>
                                        </div>
                                      </div>
                                    ) : subNote?.text ? (
                                      <div className="flex items-start justify-between gap-2 text-[11px] bg-card/40 rounded p-1.5 border border-border/20">
                                        <div className="flex-1">
                                          <p className="text-foreground leading-relaxed">{subNote.text}</p>
                                          {subNote.updatedAt && (
                                            <span className="text-[9px] text-muted-foreground">
                                              {formatDateTimestamp(subNote.updatedAt)}
                                            </span>
                                          )}
                                        </div>
                                        <div className="flex items-center gap-1 shrink-0">
                                          <button
                                            onClick={() => startEditNote(sub.id, subNote.text)}
                                            className="p-0.5 hover:text-foreground text-muted-foreground"
                                          >
                                            <Edit2 className="w-3 h-3" />
                                          </button>
                                          <button
                                            onClick={() => submitDeleteNote(sub.id)}
                                            className="p-0.5 hover:text-destructive text-muted-foreground"
                                          >
                                            <Trash2 className="w-3 h-3" />
                                          </button>
                                        </div>
                                      </div>
                                    ) : (
                                      <button
                                        onClick={() => startEditNote(sub.id)}
                                        className="text-[10px] text-muted-foreground/80 hover:text-primary flex items-center gap-1 transition-colors"
                                      >
                                        <Plus className="w-2.5 h-2.5" /> Note for {sub.name}
                                      </button>
                                    )}
                                  </div>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      )}
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
