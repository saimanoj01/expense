import React from 'react';
import { Calendar, Plus, Edit2, Trash2, Check } from 'lucide-react';
import { BudgetNote, SpendingBucket } from '../../services/storage';
import { bucketColor } from '../../theme/buckets';
import { formatMoney } from '../../utils/formatters';
import {
  formatBudgetAmountCompact,
  formatLongMonthYear,
} from '../../utils/budgetPlanning';
import type { CategorySummary, PieSegment } from '../../utils/budgetPlanning';

const MOOD_OPTIONS = [
  { emoji: '👍', label: 'Good' },
  { emoji: '⚠️', label: 'Tough' },
  { emoji: '🎉', label: 'Great' },
  { emoji: '📉', label: 'Cutback' },
];

function formatDateTimestamp(isoString?: string): string {
  if (!isoString) return '';
  try {
    const d = new Date(isoString);
    return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  } catch {
    return '';
  }
}

export interface BudgetAllocationStripProps {
  activeBucketTab: 'all' | SpendingBucket;
  onSelectBucketTab: (tab: 'all' | SpendingBucket) => void;
  categorySummary: CategorySummary[];
  scopedPie: { segments: PieSegment[]; totalPieExpense: number };
  isAllTime: boolean;
  isSpecificMonth: boolean;
  selectedMonth: string;
  isLockedMonth: boolean;
  overallNote?: BudgetNote;
  editingKey: string | null;
  noteText: string;
  selectedMood?: string;
  onNoteTextChange: (val: string) => void;
  onSelectMood: (emoji?: string) => void;
  onStartEditNote: (keyId: string, initialText?: string, initialMood?: string) => void;
  onCancelEditNote: () => void;
  onSaveNote: (keyId: string, moodToSave?: string) => Promise<void>;
  onDeleteNote: (keyId: string) => Promise<void>;
}

export const BudgetAllocationStrip: React.FC<BudgetAllocationStripProps> = ({
  activeBucketTab,
  onSelectBucketTab,
  categorySummary,
  scopedPie,
  isAllTime,
  isSpecificMonth,
  selectedMonth,
  isLockedMonth,
  overallNote,
  editingKey,
  noteText,
  selectedMood,
  onNoteTextChange,
  onSelectMood,
  onStartEditNote,
  onCancelEditNote,
  onSaveNote,
  onDeleteNote,
}) => {
  const bucketTotals = React.useMemo(() => {
    const map: Record<SpendingBucket, { spent: number; budget: number }> = {
      flexible: { spent: 0, budget: 0 },
      fixed: { spent: 0, budget: 0 },
      'non-monthly': { spent: 0, budget: 0 },
    };
    for (const item of categorySummary) {
      if (item.isNonBudgetable) continue;
      const bKey: SpendingBucket = item.bucket || 'flexible';
      map[bKey].spent += item.effectiveSpent ?? item.spent;
      map[bKey].budget += item.budget;
    }
    return map;
  }, [categorySummary]);

  const topSegments = scopedPie.segments.slice(0, 5);
  const hiddenCount = Math.max(0, scopedPie.segments.length - topSegments.length);
  const mobileHiddenCount = Math.max(0, scopedPie.segments.length - 2);

  return (
    <div className="space-y-1.5 sm:space-y-2">
      {/* Synchronized Bucket Segmented Control */}
      <div
        data-testid="budget-bucket-tabs"
        className="grid grid-cols-4 gap-1 p-1 bg-card rounded-[10px] border border-border min-w-0"
      >
        <button
          type="button"
          onClick={() => onSelectBucketTab('all')}
          aria-label="All"
          className={`min-h-[32px] py-1 px-1.5 sm:px-2.5 rounded-[8px] text-[11px] sm:text-label font-medium transition-colors flex items-center justify-center gap-1.5 focus-visible:ring-2 ring-ring/40 min-w-0 ${
            activeBucketTab === 'all'
              ? 'bg-surface2 text-foreground'
              : 'text-muted-foreground hover:text-foreground'
          }`}
        >
          <span className="truncate">All</span>
        </button>

        <button
          type="button"
          onClick={() => onSelectBucketTab('flexible')}
          aria-label="Flexible / Variable"
          className={`min-h-[32px] py-1 px-1.5 sm:px-2.5 rounded-[8px] text-[11px] sm:text-label font-medium transition-colors flex items-center justify-center gap-1.5 focus-visible:ring-2 ring-ring/40 min-w-0 ${
            activeBucketTab === 'flexible'
              ? 'bg-surface2 text-foreground'
              : 'text-muted-foreground hover:text-foreground'
          }`}
        >
          <span
            className="w-2 h-2 rounded-full shrink-0"
            style={{ backgroundColor: bucketColor('flexible') }}
          />
          <span className="truncate">Variable</span>
          <span className="hidden lg:inline text-[11px] text-muted-foreground tabular-nums num shrink-0">
            {formatMoney(bucketTotals.flexible.spent)}/{formatMoney(bucketTotals.flexible.budget)}
          </span>
        </button>

        <button
          type="button"
          onClick={() => onSelectBucketTab('fixed')}
          aria-label="Fixed"
          className={`min-h-[32px] py-1 px-1.5 sm:px-2.5 rounded-[8px] text-[11px] sm:text-label font-medium transition-colors flex items-center justify-center gap-1.5 focus-visible:ring-2 ring-ring/40 min-w-0 ${
            activeBucketTab === 'fixed'
              ? 'bg-surface2 text-foreground'
              : 'text-muted-foreground hover:text-foreground'
          }`}
        >
          <span
            className="w-2 h-2 rounded-full shrink-0"
            style={{ backgroundColor: bucketColor('fixed') }}
          />
          <span className="truncate">Fixed</span>
          <span className="hidden lg:inline text-[11px] text-muted-foreground tabular-nums num shrink-0">
            {formatMoney(bucketTotals.fixed.spent)}/{formatMoney(bucketTotals.fixed.budget)}
          </span>
        </button>

        <button
          type="button"
          onClick={() => onSelectBucketTab('non-monthly')}
          aria-label="Non-Monthly"
          className={`min-h-[32px] py-1 px-1.5 sm:px-2.5 rounded-[8px] text-[11px] sm:text-label font-medium transition-colors flex items-center justify-center gap-1.5 focus-visible:ring-2 ring-ring/40 min-w-0 ${
            activeBucketTab === 'non-monthly'
              ? 'bg-surface2 text-foreground'
              : 'text-muted-foreground hover:text-foreground'
          }`}
        >
          <span
            className="w-2 h-2 rounded-full shrink-0"
            style={{ backgroundColor: bucketColor('non-monthly') }}
          />
          <span className="truncate sm:hidden">Non-Mo.</span>
          <span className="hidden sm:inline truncate">Non-Monthly</span>
          <span className="hidden lg:inline text-[11px] text-muted-foreground tabular-nums num shrink-0">
            {formatMoney(bucketTotals['non-monthly'].spent)}/
            {formatMoney(bucketTotals['non-monthly'].budget)}
          </span>
        </button>
      </div>

      {/* Compact Side-by-Side Donut Allocation Strip (Guardrail G2 & G6) */}
      <div
        data-testid="charts-container"
        className="py-1.5 px-2.5 sm:py-2 sm:px-3 rounded-[12px] bg-card border border-border flex items-center gap-2.5 sm:gap-3 min-w-0 w-full overflow-hidden"
      >
        {scopedPie.totalPieExpense <= 0 ? (
          <svg
            data-testid="chart-svg-pie"
            viewBox="0 0 180 36"
            className="w-36 sm:w-44 h-8 sm:h-9 shrink-0"
          >
            <circle
              cx="18"
              cy="18"
              r="12"
              fill="none"
              stroke="hsl(var(--surface-2))"
              strokeWidth="4"
            />
            <text
              x="104"
              y="18"
              textAnchor="middle"
              dominantBaseline="central"
              fill="currentColor"
              className="no-data-text text-muted-foreground text-[11px] font-medium"
            >
              No data available
            </text>
          </svg>
        ) : (
          <svg
            data-testid="chart-svg-pie"
            viewBox="0 0 128 128"
            className="w-10 h-10 sm:w-14 sm:h-14 shrink-0"
          >
            {/* Background track uses <circle>, NEVER <path>, preserving exact slice <path> counts */}
            <circle
              cx="64"
              cy="64"
              r="46"
              fill="none"
              stroke="hsl(var(--surface-2))"
              strokeWidth="16"
            />
            {scopedPie.segments.map(p => (
              <path
                key={p.category}
                d={p.pathData}
                fill={p.color}
                data-testid={`pie-segment-${p.category}`}
              />
            ))}
          </svg>
        )}

        <div className="flex-1 min-w-0 space-y-0.5">
          {activeBucketTab !== 'all' && (
            <div
              data-testid="scoped-bucket-summary"
              className="text-[11px] leading-4 text-muted-foreground tabular-nums num truncate"
            >
              <span className="font-semibold text-foreground">
                {activeBucketTab === 'flexible'
                  ? 'Variable'
                  : activeBucketTab === 'fixed'
                  ? 'Fixed'
                  : 'Non-Monthly'}
                :
              </span>{' '}
              <span>
                {formatBudgetAmountCompact(bucketTotals[activeBucketTab].spent)}
                {isAllTime ? '/mo' : ''}
              </span>{' '}
              {bucketTotals[activeBucketTab].budget > 0 ? (
                <span>
                  of{' '}
                  <strong className="font-medium text-foreground">
                    {formatMoney(bucketTotals[activeBucketTab].budget)}
                  </strong>{' '}
                  target ·{' '}
                  {Math.round(
                    (bucketTotals[activeBucketTab].spent /
                      bucketTotals[activeBucketTab].budget) *
                      100
                  )}
                  %
                </span>
              ) : (
                <span>· No target set</span>
              )}
            </div>
          )}

          {scopedPie.segments.length > 0 ? (
            <div className="flex flex-wrap items-center gap-x-2.5 gap-y-0.5 text-[11px] leading-4 text-muted-foreground min-w-0">
              {topSegments.map((seg, idx) => {
                const pct =
                  scopedPie.totalPieExpense > 0
                    ? Math.round((seg.expense / scopedPie.totalPieExpense) * 100)
                    : 0;
                return (
                  <div
                    key={seg.category}
                    className={`${
                      idx >= 2 ? 'hidden sm:inline-flex' : 'inline-flex'
                    } items-center gap-1 min-w-0 max-w-full`}
                  >
                    <span
                      className="w-2 h-2 rounded-full shrink-0"
                      style={{ backgroundColor: seg.color }}
                    />
                    <span className="font-medium text-foreground truncate max-w-[96px] sm:max-w-[140px]">
                      {seg.name || seg.category}
                    </span>
                    <span className="tabular-nums num shrink-0">
                      {formatMoney(seg.expense)}
                      {isAllTime ? '/mo' : ''} ({pct}%)
                    </span>
                  </div>
                );
              })}
              {mobileHiddenCount > 0 && (
                <span className="sm:hidden text-[11px] text-muted-foreground tabular-nums num">
                  +{mobileHiddenCount} more
                </span>
              )}
              {hiddenCount > 0 && (
                <span className="hidden sm:inline text-[11px] text-muted-foreground tabular-nums num">
                  +{hiddenCount} more
                </span>
              )}
            </div>
          ) : (
            <span className="text-[11px] leading-4 text-muted-foreground truncate block">
              {activeBucketTab === 'all'
                ? 'Category spend shares appear once expenses are recorded.'
                : 'No recorded spend in this bucket for the selected period.'}
            </span>
          )}
        </div>
      </div>

      {/* Single-Line Month Reflection Strip (Specific Months Only; Deduplicated Mood Selector) */}
      {isSpecificMonth && (
        <div
          data-testid="month-reflection-strip"
          className="rounded-[12px] bg-card border border-border px-2.5 py-1 sm:px-3 sm:py-1.5"
        >
          {editingKey === '__overall__' ? (
            <div className="space-y-2 py-1">
              <div className="flex items-center justify-between gap-2 text-xs font-medium text-foreground">
                <span className="flex items-center gap-1.5">
                  <Calendar className="w-3.5 h-3.5 text-muted-foreground" />
                  <span>{formatLongMonthYear(selectedMonth)} Note</span>
                </span>
              </div>
              <textarea
                value={noteText}
                disabled={isLockedMonth}
                onChange={e => onNoteTextChange(e.target.value)}
                placeholder={`Add summary context for ${formatLongMonthYear(
                  selectedMonth
                )} (e.g. Vacation month, hosting family)...`}
                rows={2}
                className="w-full text-xs p-2 rounded-[8px] bg-background border border-border text-foreground placeholder:text-muted-foreground focus:border-foreground outline-none"
              />
              <div className="flex justify-end gap-2">
                <button
                  type="button"
                  onClick={onCancelEditNote}
                  className="min-h-[32px] px-2.5 text-xs font-medium rounded-[8px] bg-surface2 border border-border text-muted-foreground hover:text-foreground transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  disabled={isLockedMonth}
                  onClick={() => void onSaveNote('__overall__')}
                  className="min-h-[32px] px-3 text-xs font-semibold rounded-[8px] bg-primary text-primary-foreground hover:bg-primary/90 inline-flex items-center gap-1 disabled:opacity-50"
                >
                  <Check className="w-3.5 h-3.5" />
                  <span>Save Note</span>
                </button>
              </div>
            </div>
          ) : (
            <div className="flex items-center justify-between gap-2 min-w-0">
              <div className="flex items-center gap-2 min-w-0 flex-1 text-xs">
                <Calendar className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                {overallNote?.text ? (
                  <div className="flex items-center gap-2 min-w-0 flex-1">
                    <span className="text-foreground truncate" title={overallNote.text}>
                      {overallNote.text}
                    </span>
                    {overallNote.updatedAt && (
                      <span className="hidden sm:inline text-[11px] text-muted-foreground shrink-0">
                        · {formatDateTimestamp(overallNote.updatedAt)}
                      </span>
                    )}
                    {!isLockedMonth && (
                      <div className="flex items-center gap-0.5 shrink-0">
                        <button
                          type="button"
                          disabled={isLockedMonth}
                          aria-label="Edit monthly note"
                          onClick={() =>
                            onStartEditNote('__overall__', overallNote.text, overallNote.mood)
                          }
                          className="min-h-[32px] min-w-[32px] rounded-[6px] hover:bg-surface2 text-muted-foreground hover:text-foreground inline-flex items-center justify-center transition-colors"
                        >
                          <Edit2 className="w-3.5 h-3.5" />
                        </button>
                        <button
                          type="button"
                          disabled={isLockedMonth}
                          aria-label="Delete monthly note"
                          onClick={() => void onDeleteNote('__overall__')}
                          className="min-h-[32px] min-w-[32px] rounded-[6px] hover:bg-negative/10 text-muted-foreground hover:text-negative inline-flex items-center justify-center transition-colors"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    )}
                  </div>
                ) : (
                  <button
                    type="button"
                    disabled={isLockedMonth}
                    onClick={() => onStartEditNote('__overall__')}
                    className="min-h-[32px] text-xs text-muted-foreground hover:text-foreground inline-flex items-center gap-1 font-medium transition-colors truncate disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    <Plus className="w-3.5 h-3.5 shrink-0" />
                    <span className="truncate">
                      {isLockedMonth
                        ? `No monthly note for ${formatLongMonthYear(selectedMonth)}`
                        : `Add note for ${formatLongMonthYear(selectedMonth)}...`}
                    </span>
                  </button>
                )}
              </div>

              {/* Deduplicated Mood Selector (min-h-[32px] min-w-[32px] touch targets) */}
              <div className="flex items-center gap-1 shrink-0">
                {MOOD_OPTIONS.map(opt => {
                  const currentActiveMood =
                    editingKey === '__overall__' ? selectedMood : overallNote?.mood;
                  const isSelected = currentActiveMood === opt.emoji;
                  return (
                    <button
                      key={opt.label}
                      type="button"
                      disabled={isLockedMonth}
                      aria-label={`Month mood: ${opt.label}`}
                      aria-pressed={isSelected}
                      title={opt.label}
                      onClick={() => {
                        if (isLockedMonth) return;
                        const nextMood = isSelected ? undefined : opt.emoji;
                        onSelectMood(nextMood);
                        void onSaveNote('__overall__', nextMood ?? '');
                      }}
                      className={`min-h-[32px] min-w-[32px] text-xs rounded-[8px] border inline-flex items-center justify-center transition-colors focus-visible:ring-2 ring-ring/40 disabled:opacity-50 disabled:cursor-not-allowed ${
                        isSelected
                          ? 'bg-surface2 border-foreground/60 text-foreground font-semibold'
                          : 'bg-background/60 border-border text-muted-foreground hover:bg-surface2 hover:text-foreground'
                      }`}
                    >
                      {opt.emoji}
                    </button>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
};
