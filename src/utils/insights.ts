import type { Transaction, Category, Budget } from '../services/storage';
import { bucketOf } from './categorizer';
import { formatMoney } from './formatters';
import type { BucketKey } from '../theme/buckets';
import {
  computeBucketBudgets,
  getMonthPhase,
  isRefundTransaction,
} from './metrics';
import { canonicalizeCategory } from './overviewCategories';

export interface InsightItem {
  id: string;
  bucket: BucketKey;
  tone?: 'positive' | 'negative';
  text: string;
  href: string;
  impact: number;
}

export interface GenerateInsightsOptions {
  referenceDate?: Date;
}

function getPreviousMonths(month: string, count: number): string[] {
  if (!month || !/^\d{4}-\d{2}$/.test(month)) return [];
  const [yStr, mStr] = month.split('-');
  const y = parseInt(yStr, 10);
  const m = parseInt(mStr, 10);
  const result: string[] = [];
  for (let i = 1; i <= count; i++) {
    const d = new Date(Date.UTC(y, m - 1 - i, 1));
    result.push(`${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`);
  }
  return result;
}

export function generateInsights(
  allTransactions: Transaction[],
  selectedMonth: string,
  categories: Category[],
  budgets: Budget[] = [],
  options?: GenerateInsightsOptions
): InsightItem[] {
  const candidates: InsightItem[] = [];
  const monthPrefix = selectedMonth === 'all' ? '' : selectedMonth;

  const currentTxns = allTransactions.filter(
    t =>
      t.type !== 'transfer' &&
      (selectedMonth === 'all' || (t.date && t.date.startsWith(monthPrefix)))
  );

  if (currentTxns.length === 0) {
    return [];
  }

  const phaseInfo = getMonthPhase(selectedMonth, options?.referenceDate);
  const prevMonths = getPreviousMonths(selectedMonth, 3);
  const prevMonthsWithData = prevMonths.filter(pm =>
    allTransactions.some(t => t.type !== 'transfer' && t.date && t.date.startsWith(pm))
  );

  // 1. Largest refund-netted category spike vs trailing active-month average (>= $50 and >= 20%)
  if (selectedMonth !== 'all' && prevMonthsWithData.length > 0) {
    const currentByCat = new Map<
      string,
      { id: string; name: string; bucket: BucketKey; netAmt: number }
    >();

    for (const t of currentTxns) {
      if (t.type !== 'expense' && !isRefundTransaction(t)) continue;
      const b = bucketOf(t, categories);
      if (b === 'non-monthly') continue;

      const canon = canonicalizeCategory(t.category, categories);
      if (canon.isNonBudgetable) continue;

      const amt = Number(t.amount) || 0;
      const signed = isRefundTransaction(t) ? -amt : amt;
      const bucketKey: BucketKey = b === 'fixed' ? 'fixed' : 'flexible';

      const existing = currentByCat.get(canon.id);
      if (existing) {
        existing.netAmt += signed;
      } else {
        currentByCat.set(canon.id, {
          id: canon.id,
          name: canon.name,
          bucket: bucketKey,
          netAmt: signed,
        });
      }
    }

    let bestCat: { id: string; name: string; diff: number; bucket: BucketKey } | null = null;

    for (const entry of currentByCat.values()) {
      const currAmt = Math.max(0, entry.netAmt);
      if (currAmt <= 0) continue;

      const prevTotal = prevMonthsWithData.reduce((sum, pm) => {
        const pmNet = allTransactions
          .filter(
            t =>
              (t.type === 'expense' || isRefundTransaction(t)) &&
              t.date &&
              t.date.startsWith(pm) &&
              bucketOf(t, categories) !== 'non-monthly' &&
              canonicalizeCategory(t.category, categories).id === entry.id
          )
          .reduce((s, t) => {
            const amt = Number(t.amount) || 0;
            return s + (isRefundTransaction(t) ? -amt : amt);
          }, 0);
        return sum + Math.max(0, pmNet);
      }, 0);

      const avgAmt = prevTotal / prevMonthsWithData.length;
      const diff = currAmt - avgAmt;
      const pct = avgAmt > 0 ? (diff / avgAmt) * 100 : currAmt >= 50 ? 100 : 0;

      if (diff >= 50 && pct >= 20) {
        if (!bestCat || diff > bestCat.diff) {
          bestCat = {
            id: entry.id,
            name: entry.name,
            diff,
            bucket: entry.bucket,
          };
        }
      }
    }

    if (bestCat) {
      candidates.push({
        id: `cat-spike-${bestCat.id}`,
        bucket: bestCat.bucket,
        tone: 'negative',
        text: `${bestCat.name} ran ${formatMoney(bestCat.diff)} above its usual month.`,
        href: `#/month/${selectedMonth}/category/${bestCat.id}`,
        impact: bestCat.diff,
      });
    }
  }

  // 2. Variable budget pace: pro-rata progressive copy on active month, final verdict on closed past month (BUG-01, BUG-03, BUG-09)
  const { variableBudget } = computeBucketBudgets(budgets, categories);
  const variableSpent = Math.max(
    0,
    currentTxns
      .filter(
        t =>
          (t.type === 'expense' || isRefundTransaction(t)) &&
          bucketOf(t, categories) === 'flexible'
      )
      .reduce((s, t) => {
        const amt = Number(t.amount) || 0;
        return s + (isRefundTransaction(t) ? -amt : amt);
      }, 0)
  );

  if (variableBudget > 0 && phaseInfo.phase === 'current') {
    if (variableSpent > variableBudget) {
      const over = variableSpent - variableBudget;
      candidates.push({
        id: 'variable-pace',
        bucket: 'flexible',
        tone: 'negative',
        text: `Variable is already ${formatMoney(over)} over its ${formatMoney(variableBudget)} target.`,
        href: `#/month/${selectedMonth}/bucket/variable`,
        impact: over + 50,
      });
    } else if (phaseInfo.today > 7) {
      const proRataTarget = variableBudget * (phaseInfo.today / phaseInfo.daysInMonth);
      const paceDiff = proRataTarget - variableSpent;
      if (Math.abs(paceDiff) >= 25) {
        candidates.push({
          id: 'variable-pace',
          bucket: 'flexible',
          tone: paceDiff >= 0 ? 'positive' : 'negative',
          text:
            paceDiff >= 0
              ? `Variable is tracking ${formatMoney(paceDiff)} under pace.`
              : `Variable is tracking ${formatMoney(Math.abs(paceDiff))} over pace.`,
          href: `#/month/${selectedMonth}/bucket/variable`,
          impact: Math.abs(paceDiff),
        });
      }
    }
  } else if (variableBudget > 0 && phaseInfo.phase === 'past') {
    const diff = variableBudget - variableSpent;
    if (Math.abs(diff) >= 20) {
      candidates.push({
        id: 'variable-pace',
        bucket: 'flexible',
        tone: diff < 0 ? 'negative' : 'positive',
        text:
          diff >= 0
            ? `You finished Variable ${formatMoney(diff)} under budget.`
            : `You finished Variable ${formatMoney(Math.abs(diff))} over budget.`,
        href: `#/month/${selectedMonth}/bucket/variable`,
        impact: Math.abs(diff),
      });
    }
  }

  // 3. Notable net non-monthly irregular item
  const netNonMonthly = Math.max(
    0,
    currentTxns
      .filter(
        t =>
          (t.type === 'expense' || isRefundTransaction(t)) &&
          bucketOf(t, categories) === 'non-monthly'
      )
      .reduce((s, t) => {
        const amt = Number(t.amount) || 0;
        return s + (isRefundTransaction(t) ? -amt : amt);
      }, 0)
  );

  if (netNonMonthly > 0) {
    const nonMonthlyExpenses = currentTxns
      .filter(t => t.type === 'expense' && bucketOf(t, categories) === 'non-monthly')
      .sort((a, b) => (Number(b.amount) || 0) - (Number(a.amount) || 0));

    if (nonMonthlyExpenses.length > 0) {
      const topNm = nonMonthlyExpenses[0];
      const shownAmt = Math.min(Number(topNm.amount) || 0, netNonMonthly);
      if (shownAmt > 0) {
        candidates.push({
          id: `non-monthly-${topNm.id}`,
          bucket: 'non-monthly',
          text: `${topNm.description || 'Non-monthly expense'} ${formatMoney(shownAmt)} — occasional & annual.`,
          href: `#/month/${selectedMonth}/bucket/non-monthly`,
          impact: shownAmt,
        });
      }
    }
  }

  return candidates.sort((a, b) => b.impact - a.impact).slice(0, 2);
}
