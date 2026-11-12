import React from 'react';
import {
  ChevronDown,
  ChevronRight,
  FileText,
  Edit2,
  Trash2,
  Check,
  Plus,
  Sparkles,
  ArrowUpRight,
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { BudgetNote } from '../../services/storage';
import { bucketColor } from '../../theme/buckets';
import { formatMoney, normalizeZero } from '../../utils/formatters';
import {
  computeCategoryBudgetStatus,
  formatBudgetAmountCompact,
  getBudgetCatKey,
  toSoftBadgeBg,
} from '../../utils/budgetPlanning';
import type {
  CategorySpendingHistoryEntry,
  CategorySummary,
} from '../../utils/budgetPlanning';
import type { MonthPhaseInfo } from '../../utils/metrics';

function formatDateTimestamp(isoString?: string): string {
  if (!isoString) return '';
  try {
    const d = new Date(isoString);
    return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  } catch {
    return '';
  }
}

export interface BudgetCategoryRowProps {
  item: CategorySummary;
  phaseInfo: MonthPhaseInfo;
  isExpanded: boolean;
  onToggleExpand: (id: string) => void;
  isSpecificMonth: boolean;
  isAllTime: boolean;
  activeMonthsCount: number;
  selectedMonth: string;
  isLockedMonth: boolean;
  budgetErrors: Record<string, string>;
  budgetDrafts: Record<string, string>;
  budgetNotes: Record<string, BudgetNote>;
  spendingHistory: Record<string, CategorySpendingHistoryEntry>;
  editingKey: string | null;
  noteText: string;
  onNoteTextChange: (val: string) => void;
  onStartEditNote: (keyId: string, initialText?: string) => void;
  onCancelEditNote: () => void;
  onSaveNote: (keyId: string) => Promise<void>;
  onDeleteNote: (keyId: string) => Promise<void>;
  onBudgetInputChange?: (catId: string, val: string) => void;
  onApplyBudgetPreset?: (catId: string, amount: number) => void;
  onDrilldownCategory?: (catId: string) => void;
}

export const BudgetCategoryRow: React.FC<BudgetCategoryRowProps> = ({
  item,
  phaseInfo,
  isExpanded,
  onToggleExpand,
  isSpecificMonth,
  isAllTime,
  activeMonthsCount,
  selectedMonth,
  isLockedMonth,
  budgetErrors,
  budgetDrafts,
  budgetNotes,
  spendingHistory,
  editingKey,
  noteText,
  onNoteTextChange,
  onStartEditNote,
  onCancelEditNote,
  onSaveNote,
  onDeleteNote,
  onBudgetInputChange,
  onApplyBudgetPreset,
  onDrilldownCategory,
}) => {
  const catKey = item.catKey || getBudgetCatKey(item);
  const effSpent = item.effectiveSpent ?? item.spent;
  const rawSpent = item.rawSpent ?? item.spent;
  const hasSubCats = Boolean(item.subCategories && item.subCategories.length > 0);
  const isSpecificLocked = isLockedMonth && selectedMonth !== 'all';

  const status = computeCategoryBudgetStatus({
    spent: effSpent,
    budget: item.budget,
    bucket: item.bucket,
    phaseInfo,
  });

  const remaining = normalizeZero(item.budget - effSpent);
  const parentNoteKey = `${selectedMonth}:${item.id}`;
  const parentNote = isSpecificMonth ? budgetNotes[parentNoteKey] : undefined;
  const catHistory = spendingHistory[item.id];

  const barFillColor =
    status.tone === 'warning'
      ? 'hsl(var(--c-nonmonthly))'
      : bucketColor(item.bucket || 'flexible');

  const statusTextClass =
    status.tone === 'negative'
      ? 'text-negative font-semibold'
      : status.tone === 'warning'
      ? 'text-warning font-medium'
      : status.tone === 'positive'
      ? 'text-bucket-saved font-medium'
      : 'text-muted-foreground';

  let placeholderText = `Add context for ${item.name} this month...`;
  if (status.isOverspent) {
    placeholderText = `Why did ${item.name} go ${formatBudgetAmountCompact(
      Math.abs(remaining)
    )} over target this month?`;
  } else if (status.tone === 'warning') {
    placeholderText = `${item.name} is at ${item.percent.toFixed(
      0
    )}% — anything to note?`;
  }

  return (
    <div
      id={`budget-row-${item.id}`}
      data-testid={`budget-row-${item.id}`}
      className="bg-card hover:bg-surface2/25 transition-colors"
    >
      {/* Single-DOM Responsive Row (1 line on >=1024px Desktop, 2 compact lines on <1024px Tablet & Mobile) */}
      <div className="px-3 sm:px-3.5 py-1.5 sm:py-2.5 grid grid-cols-[minmax(0,1fr)_auto] lg:grid-cols-[minmax(175px,1.35fr)_minmax(185px,1.4fr)_auto] items-center gap-x-2.5 gap-y-1 lg:gap-x-4">
        {/* Column 1: Accessible Expand Toggle + Soft Badge + Name + Indicators */}
        <div className="min-w-0 flex items-center gap-1.5">
          <button
            type="button"
            aria-expanded={isExpanded}
            aria-label={`${isExpanded ? 'Collapse' : 'Expand'} ${item.name}`}
            data-testid={`budget-expand-${item.id}`}
            onClick={() => onToggleExpand(item.id)}
            className="min-h-[32px] sm:min-h-[34px] flex items-center gap-2 text-left min-w-0 flex-1 rounded-[8px] hover:text-foreground transition-colors focus-visible:ring-2 ring-ring/40 outline-none"
          >
            <span className="text-muted-foreground shrink-0">
              {isExpanded ? (
                <ChevronDown className="w-4 h-4" />
              ) : (
                <ChevronRight className="w-4 h-4" />
              )}
            </span>
            <span
              data-testid={`category-badge-${catKey}`}
              className="w-7 h-7 rounded-[8px] flex items-center justify-center text-sm leading-none shrink-0 border border-border/50"
              style={{ backgroundColor: toSoftBadgeBg(item.color) }}
            >
              {item.emoji}
            </span>
            <span
              data-testid={`budget-label-${catKey}`}
              className="font-medium text-body text-foreground truncate"
            >
              {item.name}
            </span>
            {item.isRolledUpFromSubs && (
              <span
                title="Target rolled up from sub-categories"
                className="px-1.5 py-0.5 rounded-[5px] text-[10px] leading-3 font-semibold bg-surface2 text-muted-foreground border border-border shrink-0"
              >
                Σ
              </span>
            )}
            {isSpecificMonth && parentNote?.text && (
              <span
                title="Monthly note attached"
                className="shrink-0 inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-[5px] text-[10px] leading-3 font-medium bg-surface2 text-foreground border border-border"
              >
                <FileText className="w-2.5 h-2.5" />
              </span>
            )}
          </button>
        </div>

        {/* Column 2 on Tablet/Mobile / Column 3 on Desktop: Spent + Target Input + Drilldown */}
        <div className="lg:order-3 flex items-center justify-end gap-1.5 sm:gap-2.5 shrink-0">
          <div className="text-right tabular-nums num">
            <span
              className={`text-body font-semibold ${
                status.isOverspent ? 'text-negative' : 'text-foreground'
              }`}
            >
              {formatBudgetAmountCompact(effSpent)}
              {isAllTime ? '/mo' : ''}
            </span>
            {isAllTime && activeMonthsCount > 1 && rawSpent > 0 && (
              <span className="hidden lg:block text-[10px] leading-3 text-muted-foreground">
                {formatMoney(rawSpent)} total
              </span>
            )}
          </div>

          {onBudgetInputChange ? (
            <div className="flex items-center gap-0.5 h-8 bg-background border border-border hover:border-foreground/40 focus-within:border-foreground focus-within:ring-2 focus-within:ring-ring/40 rounded-[8px] px-2 transition-colors">
              <span className="text-label text-muted-foreground font-medium select-none">
                $
              </span>
              <input
                disabled={isSpecificLocked}
                type="number"
                min="0"
                step="any"
                aria-label={`Monthly budget target for ${item.name}`}
                data-testid={`budget-input-${catKey}`}
                value={
                  budgetDrafts[item.id] !== undefined
                    ? budgetDrafts[item.id]
                    : item.budget === 0
                    ? '0'
                    : item.budget || ''
                }
                placeholder="0"
                onChange={e => onBudgetInputChange(item.id, e.target.value)}
                className="w-14 sm:w-16 bg-transparent text-xs sm:text-body font-semibold text-foreground tabular-nums num outline-none text-right disabled:opacity-50 disabled:cursor-not-allowed [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
              />
            </div>
          ) : (
            <span className="font-semibold text-foreground tabular-nums num text-body">
              {formatMoney(item.budget)}
            </span>
          )}

          {onDrilldownCategory && (
            <button
              type="button"
              data-testid={`budget-drilldown-${item.id}`}
              aria-label={`View ${item.name} transactions`}
              title={`View ${item.name} transactions`}
              onClick={() => onDrilldownCategory(item.id)}
              className="min-h-[32px] min-w-[32px] rounded-[8px] hover:bg-surface2 text-muted-foreground hover:text-foreground inline-flex items-center justify-center transition-colors focus-visible:ring-2 ring-ring/40 shrink-0"
            >
              <ArrowUpRight className="w-4 h-4" />
            </button>
          )}
        </div>

        {/* Line 2 on Tablet/Mobile (col-span-2) / Column 2 on Desktop: Semantic Progress + Pace Tick + Utilization/Remaining */}
        <div className="col-span-2 lg:col-span-1 lg:order-2 min-w-0">
          {budgetErrors[item.id] ? (
            <p
              className={`text-label text-negative font-semibold budget-error-${catKey}`}
              data-testid="budget-error"
            >
              {budgetErrors[item.id]}
            </p>
          ) : item.budget > 0 ? (
            <div className="space-y-1">
              <div className="relative h-1.5 bg-surface2 rounded-full overflow-hidden">
                <div
                  data-testid={`budget-indicator-${catKey}`}
                  className={
                    status.isOverspent
                      ? 'h-full rounded-full bg-negative bg-red-500 budget-overspent transition-all duration-200'
                      : 'h-full rounded-full transition-all duration-200'
                  }
                  style={{
                    width: `${Math.min(100, Math.max(0, item.percent))}%`,
                    backgroundColor: status.isOverspent ? undefined : barFillColor,
                  }}
                />
                {status.paceTickPct !== null && (
                  <div
                    data-testid={`budget-pace-tick-${item.id}`}
                    style={{ left: `${status.paceTickPct}%` }}
                    className="absolute top-0 bottom-0 w-[2px] bg-foreground/70 pointer-events-none"
                    title="Elapsed month pace"
                  />
                )}
              </div>
              <div className="flex items-center justify-between gap-2 text-[11px] leading-4 tabular-nums num">
                <span
                  data-testid={`budget-utilization-${catKey}`}
                  className={`truncate ${statusTextClass}`}
                >
                  {item.percent.toFixed(0)}% · {status.label}
                </span>
                <span
                  data-testid={`budget-remaining-${catKey}`}
                  className={`shrink-0 ${
                    status.isOverspent
                      ? 'text-negative font-semibold'
                      : 'text-muted-foreground'
                  }`}
                >
                  {status.isOverspent
                    ? `$${Math.abs(remaining).toFixed(2)} over target`
                    : `$${Math.max(0, remaining).toFixed(2)} remaining`}
                </span>
              </div>
            </div>
          ) : (
            <div className="flex items-center justify-between gap-2 text-[11px] leading-4">
              <span
                className={
                  normalizeZero(effSpent) > 0
                    ? 'px-1.5 py-0.5 rounded-[5px] bg-warning/15 text-warning border border-warning/30 font-medium'
                    : 'text-muted-foreground'
                }
              >
                {status.label}
              </span>
              {!isSpecificLocked &&
                onApplyBudgetPreset &&
                isSpecificMonth &&
                (catHistory?.avg3mo ?? 0) > 0 && (
                  <button
                    type="button"
                    data-testid={`inline-quickfill-${item.id}`}
                    onClick={() => onApplyBudgetPreset(item.id, catHistory!.avg3mo)}
                    className="min-h-[32px] px-2 rounded-[6px] bg-surface2 hover:bg-secondary border border-border text-[11px] text-foreground font-medium tabular-nums num transition-colors"
                  >
                    Use 3-mo avg ({formatMoney(catHistory!.avg3mo)})
                  </button>
                )}
            </div>
          )}
        </div>
      </div>

      {/* Expanded Drawer: Historical Quick-Fill + Monthly Note + Sub-Categories */}
      <AnimatePresence initial={false}>
        {isExpanded && (
          <motion.div
            key={`expanded-${item.id}`}
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.16 }}
            className="px-3.5 pb-3 pt-1 border-t border-border/50 bg-surface2/20 space-y-2.5 overflow-hidden"
          >
            {/* Historical Spend Context + 1-Click Quick-Fill Strip */}
            {isSpecificMonth && catHistory && (
              <div
                data-testid={`budget-history-${item.id}`}
                className="text-xs text-muted-foreground bg-card rounded-[8px] px-3 py-2 border border-border flex flex-wrap items-center justify-between gap-2 tabular-nums num"
              >
                <div className="flex flex-wrap items-center gap-3">
                  <span className="font-semibold text-foreground inline-flex items-center gap-1">
                    <Sparkles className="w-3.5 h-3.5 text-muted-foreground" />
                    <span>History</span>
                  </span>
                  <span>
                    Last month:{' '}
                    <strong className="text-foreground">
                      {formatMoney(catHistory.lastMonth)}
                    </strong>
                  </span>
                  <span>
                    3-mo avg:{' '}
                    <strong className="text-foreground">
                      {formatMoney(catHistory.avg3mo)}
                    </strong>
                  </span>
                </div>

                {!isSpecificLocked && onApplyBudgetPreset && (
                  <div className="flex items-center gap-1.5">
                    {catHistory.lastMonth > 0 && (
                      <button
                        type="button"
                        disabled={isSpecificLocked}
                        data-testid={`quickfill-lastmo-${item.id}`}
                        onClick={() =>
                          onApplyBudgetPreset(item.id, catHistory.lastMonth)
                        }
                        className="min-h-[32px] px-2.5 rounded-[8px] bg-surface2 hover:bg-secondary border border-border text-[11px] font-medium text-foreground transition-colors"
                      >
                        Use last mo ({formatMoney(catHistory.lastMonth)})
                      </button>
                    )}
                    {catHistory.avg3mo > 0 && (
                      <button
                        type="button"
                        disabled={isSpecificLocked}
                        data-testid={`quickfill-avg3mo-${item.id}`}
                        onClick={() => onApplyBudgetPreset(item.id, catHistory.avg3mo)}
                        className="min-h-[32px] px-2.5 rounded-[8px] bg-surface2 hover:bg-secondary border border-border text-[11px] font-medium text-foreground transition-colors"
                      >
                        Use 3-mo avg ({formatMoney(catHistory.avg3mo)})
                      </button>
                    )}
                  </div>
                )}
              </div>
            )}

            {/* Parent Category Monthly Note Block */}
            {isSpecificMonth && (
              <div className="bg-card rounded-[8px] px-3 py-2 border border-border space-y-2">
                <div className="flex items-center justify-between text-xs font-medium text-foreground">
                  <span className="inline-flex items-center gap-1.5">
                    <FileText className="w-3.5 h-3.5 text-muted-foreground" />
                    <span>{item.name} Monthly Note</span>
                  </span>
                  {parentNote?.updatedAt && (
                    <span className="text-[11px] text-muted-foreground font-normal">
                      {formatDateTimestamp(parentNote.updatedAt)}
                    </span>
                  )}
                </div>

                {editingKey === item.id ? (
                  <div className="space-y-2">
                    <textarea
                      value={noteText}
                      disabled={isSpecificLocked}
                      onChange={e => onNoteTextChange(e.target.value)}
                      placeholder={placeholderText}
                      rows={2}
                      className="w-full text-xs p-2 rounded-[8px] bg-background border border-border text-foreground placeholder:text-muted-foreground focus:border-foreground outline-none"
                    />
                    <div className="flex justify-end gap-2">
                      <button
                        type="button"
                        onClick={onCancelEditNote}
                        className="min-h-[32px] px-2.5 text-xs font-medium rounded-[8px] bg-surface2 border border-border text-muted-foreground hover:text-foreground"
                      >
                        Cancel
                      </button>
                      <button
                        type="button"
                        disabled={isSpecificLocked}
                        onClick={() => void onSaveNote(item.id)}
                        className="min-h-[32px] px-3 text-xs font-semibold rounded-[8px] bg-primary text-primary-foreground hover:bg-primary/90 inline-flex items-center gap-1 disabled:opacity-50"
                      >
                        <Check className="w-3.5 h-3.5" />
                        <span>Save</span>
                      </button>
                    </div>
                  </div>
                ) : parentNote?.text ? (
                  <div className="flex items-start justify-between gap-2 text-xs">
                    <p className="text-foreground whitespace-pre-wrap leading-relaxed flex-1">
                      {parentNote.text}
                    </p>
                    {!isSpecificLocked && (
                      <div className="flex items-center gap-1 shrink-0">
                        <button
                          type="button"
                          disabled={isSpecificLocked}
                          aria-label={`Edit note for ${item.name}`}
                          onClick={() => onStartEditNote(item.id, parentNote.text)}
                          className="min-h-[32px] min-w-[32px] rounded-[6px] hover:bg-surface2 text-muted-foreground hover:text-foreground inline-flex items-center justify-center"
                        >
                          <Edit2 className="w-3.5 h-3.5" />
                        </button>
                        <button
                          type="button"
                          disabled={isSpecificLocked}
                          aria-label={`Delete note for ${item.name}`}
                          onClick={() => void onDeleteNote(item.id)}
                          className="min-h-[32px] min-w-[32px] rounded-[6px] hover:bg-negative/10 text-muted-foreground hover:text-negative inline-flex items-center justify-center"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    )}
                  </div>
                ) : (
                  <button
                    type="button"
                    disabled={isSpecificLocked}
                    onClick={() => onStartEditNote(item.id)}
                    className="min-h-[32px] text-xs text-muted-foreground hover:text-foreground inline-flex items-center gap-1 font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>
                      {isSpecificLocked
                        ? `No note recorded for ${item.name}`
                        : `Add note for ${item.name}...`}
                    </span>
                  </button>
                )}
              </div>
            )}

            {/* Sub-Categories Compact Ledger */}
            {hasSubCats && (
              <div className="rounded-[8px] border border-border bg-card divide-y divide-border/60">
                {item.subCategories!.map(sub => {
                  const subEffSpent = sub.effectiveSpent ?? sub.spent;
                  const subOver =
                    sub.budget > 0 && normalizeZero(subEffSpent - sub.budget) > 0;
                  const subRemaining = normalizeZero(sub.budget - subEffSpent);
                  const subNoteKey = `${selectedMonth}:${sub.id}`;
                  const subNote = isSpecificMonth ? budgetNotes[subNoteKey] : undefined;
                  const subHist = spendingHistory[sub.id];
                  const subFillColor = bucketColor(
                    sub.bucket || item.bucket || 'flexible'
                  );

                  return (
                    <div key={sub.id} className="px-3 py-2 space-y-1.5 text-xs">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div className="flex items-center gap-2 min-w-0 flex-1">
                          <span className="shrink-0">{sub.emoji}</span>
                          <span className="font-medium text-foreground truncate">
                            {sub.name}
                          </span>
                          {isSpecificMonth && subHist && subHist.avg3mo > 0 && (
                            <span className="hidden sm:inline text-[11px] text-muted-foreground tabular-nums num shrink-0">
                              avg {formatMoney(subHist.avg3mo)}
                            </span>
                          )}
                        </div>

                        <div className="flex items-center gap-2 shrink-0">
                          {!isSpecificLocked &&
                            onApplyBudgetPreset &&
                            isSpecificMonth &&
                            sub.budget === 0 &&
                            (subHist?.avg3mo ?? 0) > 0 && (
                              <button
                                type="button"
                                data-testid={`quickfill-avg3mo-${sub.id}`}
                                onClick={() =>
                                  onApplyBudgetPreset(sub.id, subHist!.avg3mo)
                                }
                                className="min-h-[32px] px-2 rounded-[6px] bg-surface2 hover:bg-secondary border border-border text-[11px] text-foreground tabular-nums num"
                              >
                                Use {formatMoney(subHist!.avg3mo)}
                              </button>
                            )}

                          <span
                            className={`font-semibold tabular-nums num ${
                              subOver ? 'text-negative' : 'text-foreground'
                            }`}
                          >
                            {formatBudgetAmountCompact(subEffSpent)}
                            {isAllTime ? '/mo' : ''}
                          </span>

                          {onBudgetInputChange ? (
                            <div className="flex items-center gap-0.5 h-7 bg-background border border-border focus-within:border-foreground rounded-[6px] px-2">
                              <span className="text-[11px] text-muted-foreground">$</span>
                              <input
                                disabled={isSpecificLocked}
                                type="number"
                                min="0"
                                step="any"
                                aria-label={`Monthly budget target for ${sub.name}`}
                                data-testid={`budget-input-${sub.id}`}
                                value={
                                  budgetDrafts[sub.id] !== undefined
                                    ? budgetDrafts[sub.id]
                                    : sub.budget === 0
                                    ? '0'
                                    : sub.budget || ''
                                }
                                placeholder="0"
                                onChange={e =>
                                  onBudgetInputChange(sub.id, e.target.value)
                                }
                                className="w-14 bg-transparent text-xs text-right font-semibold tabular-nums num outline-none text-foreground disabled:opacity-50 disabled:cursor-not-allowed [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                              />
                            </div>
                          ) : (
                            <span className="font-semibold tabular-nums num">
                              {formatMoney(sub.budget)}
                            </span>
                          )}
                        </div>
                      </div>

                      {budgetErrors[sub.id] && (
                        <p
                          className={`text-[11px] text-negative font-semibold budget-error-${sub.id}`}
                          data-testid="budget-error"
                        >
                          {budgetErrors[sub.id]}
                        </p>
                      )}

                      {sub.budget > 0 && (
                        <div className="space-y-0.5">
                          <div className="h-1 bg-surface2 rounded-full overflow-hidden">
                            <div
                              className={`h-full rounded-full ${
                                subOver ? 'bg-negative' : ''
                              }`}
                              style={{
                                width: `${Math.min(100, Math.max(0, sub.percent))}%`,
                                backgroundColor: subOver ? undefined : subFillColor,
                              }}
                            />
                          </div>
                          <div className="flex justify-between text-[11px] text-muted-foreground tabular-nums num">
                            <span>{sub.percent.toFixed(0)}%</span>
                            <span className={subOver ? 'text-negative font-medium' : ''}>
                              {subOver
                                ? `${formatBudgetAmountCompact(
                                    Math.abs(subRemaining)
                                  )} over`
                                : `${formatBudgetAmountCompact(
                                    Math.max(0, subRemaining)
                                  )} left`}
                            </span>
                          </div>
                        </div>
                      )}

                      {/* Sub-Category Monthly Note */}
                      {isSpecificMonth && (
                        <div>
                          {editingKey === sub.id ? (
                            <div className="space-y-1.5 pt-1">
                              <textarea
                                value={noteText}
                                disabled={isSpecificLocked}
                                onChange={e => onNoteTextChange(e.target.value)}
                                placeholder={`Add note for ${sub.name}...`}
                                rows={2}
                                className="w-full text-xs p-2 rounded-[6px] bg-background border border-border text-foreground placeholder:text-muted-foreground outline-none"
                              />
                              <div className="flex justify-end gap-1.5">
                                <button
                                  type="button"
                                  onClick={onCancelEditNote}
                                  className="min-h-[32px] px-2.5 text-[11px] rounded-[6px] bg-surface2 border border-border text-muted-foreground"
                                >
                                  Cancel
                                </button>
                                <button
                                  type="button"
                                  disabled={isSpecificLocked}
                                  onClick={() => void onSaveNote(sub.id)}
                                  className="min-h-[32px] px-2.5 text-[11px] font-semibold rounded-[6px] bg-primary text-primary-foreground disabled:opacity-50"
                                >
                                  Save
                                </button>
                              </div>
                            </div>
                          ) : subNote?.text ? (
                            <div className="flex items-start justify-between gap-2 text-[11px] pt-1">
                              <p className="text-muted-foreground flex-1">
                                {subNote.text}
                              </p>
                              {!isSpecificLocked && (
                                <div className="flex items-center gap-0.5 shrink-0">
                                  <button
                                    type="button"
                                    disabled={isSpecificLocked}
                                    aria-label={`Edit note for ${sub.name}`}
                                    onClick={() =>
                                      onStartEditNote(sub.id, subNote.text)
                                    }
                                    className="min-h-[32px] min-w-[32px] rounded-[6px] hover:bg-surface2 text-muted-foreground hover:text-foreground inline-flex items-center justify-center"
                                  >
                                    <Edit2 className="w-3 h-3" />
                                  </button>
                                  <button
                                    type="button"
                                    disabled={isSpecificLocked}
                                    aria-label={`Delete note for ${sub.name}`}
                                    onClick={() => void onDeleteNote(sub.id)}
                                    className="min-h-[32px] min-w-[32px] rounded-[6px] hover:bg-negative/10 text-muted-foreground hover:text-negative inline-flex items-center justify-center"
                                  >
                                    <Trash2 className="w-3 h-3" />
                                  </button>
                                </div>
                              )}
                            </div>
                          ) : (
                            !isSpecificLocked && (
                              <button
                                type="button"
                                disabled={isSpecificLocked}
                                onClick={() => onStartEditNote(sub.id)}
                                className="min-h-[32px] text-[11px] text-muted-foreground hover:text-foreground inline-flex items-center gap-1 transition-colors"
                              >
                                <Plus className="w-3 h-3" />
                                <span>Note for {sub.name}</span>
                              </button>
                            )
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
};
