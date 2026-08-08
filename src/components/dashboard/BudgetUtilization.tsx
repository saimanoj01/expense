import { useState } from 'react';
import { Target, Plus, Save, ChevronDown, ChevronRight, FileText, Edit2, Trash2, Check, Sparkles, Calendar } from 'lucide-react';
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
  selectedMonth?: string;
  budgetNotes?: Record<string, BudgetNote>;
  spendingHistory?: Record<string, { lastMonth: number; avg3mo: number }>;
  handleSaveBudgetNote?: (month: string, keyId: string, text: string, mood?: string) => Promise<void>;
  handleDeleteBudgetNote?: (month: string, keyId: string) => Promise<void>;
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
  budgetErrors = {},
  handleBudgetInputChange,
  handleSaveBudgets,
  setShowAddCatModal,
  selectedMonth = '',
  budgetNotes = {},
  spendingHistory = {},
  handleSaveBudgetNote,
  handleDeleteBudgetNote,
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

      {/* Categories List */}
      <div className="w-full space-y-3 flex-1">
        {categorySummary.length > 0 ? (
          categorySummary.map(item => {
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
                    <span className="text-base leading-none shrink-0">{item.emoji}</span>
                    <span className="truncate">{item.name}</span>

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
                          type="number"
                          min="0"
                          data-testid={`budget-input-${item.id === 'food' ? 'Food' : item.id}`}
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
                      <span data-testid={`budget-utilization-${item.id === 'food' ? 'Food' : item.name}`}>{item.percent.toFixed(0)}% used</span>
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
