import React, { useState, useEffect } from 'react';
import { AlertCircle, Lock, Sparkles, ArrowRight, X } from 'lucide-react';
import { useNavigation } from '../../hooks/useNavigation';
import { formatMonthLabel } from '../../utils/navigation';
import type { MonthPhase } from '../../utils/metrics';

export interface OverviewTriageStripProps {
  selectedMonth: string;
  phase: MonthPhase;
  reviewCount: number;
  unclassifiedCount: number;
  isLockedMonth?: boolean;
  hasRecordedActivity: boolean;
  onClassifyBuckets?: () => void;
  onLockMonth?: () => void;
  className?: string;
}

function isLockPromptDismissed(monthKey: string): boolean {
  if (!monthKey || typeof window === 'undefined') return false;
  try {
    return window.sessionStorage.getItem(`expense_dismiss_lock_prompt_${monthKey}`) === '1';
  } catch {
    return false;
  }
}

export const OverviewTriageStrip: React.FC<OverviewTriageStripProps> = ({
  selectedMonth,
  phase,
  reviewCount,
  unclassifiedCount,
  isLockedMonth = false,
  hasRecordedActivity,
  onClassifyBuckets,
  onLockMonth,
  className = '',
}) => {
  const { navigate } = useNavigation();
  const [lockPromptDismissed, setLockPromptDismissed] = useState<boolean>(() =>
    isLockPromptDismissed(selectedMonth)
  );

  useEffect(() => {
    setLockPromptDismissed(isLockPromptDismissed(selectedMonth));
  }, [selectedMonth]);

  const handleDismissLockPrompt = () => {
    setLockPromptDismissed(true);
    try {
      window.sessionStorage.setItem(`expense_dismiss_lock_prompt_${selectedMonth}`, '1');
    } catch {
      // Ignore storage failures
    }
  };

  const showReview = reviewCount > 0;
  const showUnclassified = unclassifiedCount > 0 && !isLockedMonth && Boolean(onClassifyBuckets);
  const showLockPrompt =
    phase === 'past' &&
    selectedMonth !== 'all' &&
    !isLockedMonth &&
    !lockPromptDismissed &&
    hasRecordedActivity &&
    reviewCount === 0 &&
    unclassifiedCount === 0 &&
    Boolean(onLockMonth);

  if (!showReview && !showUnclassified && !showLockPrompt) {
    return null;
  }

  return (
    <section
      aria-label="Action items"
      data-testid="overview-triage-strip"
      className={`min-h-[36px] py-1.5 px-3 rounded-[10px] bg-surface2/75 border border-border flex flex-wrap items-center justify-between gap-x-4 gap-y-1.5 text-label ${className}`}
    >
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 min-w-0 w-full">
        {showReview && (
          <div className="inline-flex items-center gap-2 min-w-0">
            <AlertCircle className="w-3.5 h-3.5 text-warning shrink-0" />
            <span className="text-foreground font-medium tabular-nums num">
              {reviewCount} {reviewCount === 1 ? 'transaction needs' : 'transactions need'} review
            </span>
            <button
              type="button"
              data-testid="overview-review-btn"
              onClick={() => navigate(`#/transactions?month=${selectedMonth}&review=1`)}
              className="inline-flex items-center gap-1 px-2 py-0.5 rounded-[6px] bg-warning/15 hover:bg-warning/25 text-warning font-medium transition-colors focus-visible:ring-2 ring-ring/40"
            >
              <span>Review</span>
              <ArrowRight className="w-3 h-3" />
            </button>
          </div>
        )}

        {showUnclassified && (
          <div
            data-testid="backfill-banner"
            className="inline-flex items-center gap-2 min-w-0"
          >
            <Sparkles className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
            <span className="text-muted-foreground tabular-nums num">
              {unclassifiedCount}{' '}
              {unclassifiedCount === 1
                ? 'expense auto-sorted into Variable'
                : 'expenses auto-sorted into Variable'}
            </span>
            <button
              type="button"
              data-testid="backfill-btn"
              onClick={onClassifyBuckets}
              className="px-2 py-0.5 rounded-[6px] bg-primary text-primary-foreground font-medium hover:opacity-90 transition-opacity focus-visible:ring-2 ring-ring/40"
            >
              Classify
            </button>
          </div>
        )}

        {showLockPrompt && (
          <div className="inline-flex items-center justify-between gap-2 min-w-0 flex-1">
            <div className="inline-flex items-center gap-2 min-w-0">
              <Lock className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
              <span className="text-muted-foreground">
                {formatMonthLabel(selectedMonth)} is complete and ready to close
              </span>
              <button
                type="button"
                data-testid="overview-lock-prompt-btn"
                onClick={onLockMonth}
                className="px-2 py-0.5 rounded-[6px] bg-background hover:bg-secondary border border-border text-foreground font-medium transition-colors focus-visible:ring-2 ring-ring/40"
              >
                Lock month
              </button>
            </div>
            <button
              type="button"
              data-testid="dismiss-lock-prompt-btn"
              aria-label="Dismiss lock prompt"
              title="Dismiss for this session"
              onClick={handleDismissLockPrompt}
              className="w-6 h-6 rounded-[6px] inline-flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-background/80 transition-colors focus-visible:ring-2 ring-ring/40 shrink-0"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        )}
      </div>
    </section>
  );
};
