import { Transaction, Category, Budget } from '../services/storage';
import { bucketOf, bucketSource } from './categorizer';
import { formatMoney } from './formatters';
import { BucketKey } from '../theme/buckets';

export interface InsightItem {
  id: string;
  bucket: BucketKey;
  tone?: 'positive' | 'negative';
  text: string;
  href: string;
  impact: number;
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
  budgets: Budget[] = []
): InsightItem[] {
  const candidates: InsightItem[] = [];
  const monthPrefix = selectedMonth === 'all' ? '' : selectedMonth;

  const currentTxns = allTransactions.filter(
    t => t.type !== 'transfer' && (selectedMonth === 'all' || (t.date && t.date.startsWith(monthPrefix)))
  );

  if (currentTxns.length === 0) {
    return [];
  }

  const prevMonths = getPreviousMonths(selectedMonth, 3);
  const prevMonthsWithData = prevMonths.filter(pm =>
    allTransactions.some(t => t.type !== 'transfer' && t.date && t.date.startsWith(pm))
  );

  // 1. Largest category increase vs trailing 3-month average (>= $50 and >= 20%)
  if (prevMonthsWithData.length > 0) {
    const currentByCat: Record<string, number> = {};
    currentTxns
      .filter(t => t.type === 'expense' && bucketOf(t, categories) !== 'non-monthly')
      .forEach(t => {
        const cid = (t.category || 'misc').toLowerCase();
        currentByCat[cid] = (currentByCat[cid] || 0) + t.amount;
      });

    let bestCat: { id: string; name: string; diff: number; bucket: BucketKey } | null = null;

    Object.entries(currentByCat).forEach(([cid, currAmt]) => {
      const prevTotal = prevMonthsWithData.reduce((sum, pm) => {
        const pmCatSpend = allTransactions
          .filter(
            t =>
              t.type === 'expense' &&
              t.date &&
              t.date.startsWith(pm) &&
              (t.category || 'misc').toLowerCase() === cid
          )
          .reduce((s, t) => s + t.amount, 0);
        return sum + pmCatSpend;
      }, 0);
      const avgAmt = prevTotal / prevMonthsWithData.length;
      const diff = currAmt - avgAmt;
      const pct = avgAmt > 0 ? (diff / avgAmt) * 100 : currAmt >= 50 ? 100 : 0;

      if (diff >= 50 && pct >= 20) {
        if (!bestCat || diff > bestCat.diff) {
          const catObj = categories.find(
            c => c.id.toLowerCase() === cid || c.name.toLowerCase() === cid
          );
          const sampleTxn = currentTxns.find(
            t => t.type === 'expense' && (t.category || 'misc').toLowerCase() === cid
          );
          const b = sampleTxn ? bucketOf(sampleTxn, categories) : 'flexible';
          const bucketKey: BucketKey =
            b === 'fixed' ? 'fixed' : b === 'non-monthly' ? 'non-monthly' : 'flexible';
          bestCat = {
            id: catObj?.id || cid,
            name: catObj?.name || cid.charAt(0).toUpperCase() + cid.slice(1),
            diff,
            bucket: bucketKey,
          };
        }
      }
    });

    if (bestCat) {
      const found = bestCat as { id: string; name: string; diff: number; bucket: BucketKey };
      candidates.push({
        id: `cat-spike-${found.id}`,
        bucket: found.bucket,
        text: `${found.name} ran ${formatMoney(found.diff)} above its usual month.`,
        href: `#/month/${selectedMonth}/category/${found.id}`,
        impact: found.diff,
      });
    }
  }

  // 2. Budget pace for Variable: projected vs budget, only after day 7 or for past months
  const now = new Date();
  const currentLocalMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  const isCurrentMonth = selectedMonth === currentLocalMonth;
  const isPastMonth = selectedMonth !== 'all' && selectedMonth < currentLocalMonth;
  const dayOfMonth = now.getDate();

  const variableBudget = budgets
    .filter(b => {
      const catObj = categories.find(
        c => c.id.toLowerCase() === b.category.toLowerCase() || c.name.toLowerCase() === b.category.toLowerCase()
      );
      return !catObj?.defaultBucket || catObj.defaultBucket === 'flexible';
    })
    .reduce((s, b) => s + b.amount, 0);

  const variableSpent = currentTxns
    .filter(t => t.type === 'expense' && bucketOf(t, categories) === 'flexible')
    .reduce((s, t) => s + t.amount, 0);

  if (variableBudget > 0 && (isPastMonth || (isCurrentMonth && dayOfMonth > 7))) {
    const diff = variableBudget - variableSpent;
    if (Math.abs(diff) >= 20) {
      candidates.push({
        id: 'variable-pace',
        bucket: 'flexible',
        tone: diff < 0 ? 'negative' : 'positive',
        text:
          diff >= 0
            ? `You finished Variable ${formatMoney(diff)} under budget.`
            : `Variable spending ran ${formatMoney(Math.abs(diff))} over budget.`,
        href: `#/month/${selectedMonth}/bucket/variable`,
        impact: Math.abs(diff),
      });
    }
  }

  // 3. A notable non-monthly transaction this month
  const nonMonthlyTxns = currentTxns
    .filter(t => t.type === 'expense' && bucketOf(t, categories) === 'non-monthly')
    .sort((a, b) => b.amount - a.amount);

  if (nonMonthlyTxns.length > 0) {
    const topNm = nonMonthlyTxns[0];
    candidates.push({
      id: `non-monthly-${topNm.id}`,
      bucket: 'non-monthly',
      text: `${topNm.description || 'Non-monthly expense'} ${formatMoney(topNm.amount)} — occasional & annual.`,
      href: `#/month/${selectedMonth}/bucket/non-monthly`,
      impact: topNm.amount,
    });
  }

  // 4. Auto-sorted fallback transactions into Variable (§3.6)
  const autoSortedTxns = currentTxns.filter(
    t => t.type === 'expense' && bucketSource(t, categories) === 'fallback'
  );
  if (autoSortedTxns.length > 0) {
    const autoTotal = autoSortedTxns.reduce((s, t) => s + t.amount, 0);
    candidates.push({
      id: 'auto-sorted',
      bucket: 'flexible',
      text: `${autoSortedTxns.length} transaction${
        autoSortedTxns.length === 1 ? ' was' : 's were'
      } auto-sorted into Variable. Review`,
      href: `#/transactions?month=${selectedMonth}&auto=1`,
      impact: Math.max(autoTotal, 100),
    });
  }

  // 5. Fallback: largest fixed bill or savings rate
  const fixedTxns = currentTxns
    .filter(t => t.type === 'expense' && bucketOf(t, categories) === 'fixed')
    .sort((a, b) => b.amount - a.amount);

  if (fixedTxns.length > 0 && candidates.length < 3) {
    const topFixed = fixedTxns[0];
    candidates.push({
      id: `fixed-bill-${topFixed.id}`,
      bucket: 'fixed',
      text: `${topFixed.description || 'Fixed bill'} posted at ${formatMoney(topFixed.amount)}.`,
      href: `#/month/${selectedMonth}/bucket/fixed`,
      impact: topFixed.amount * 0.5,
    });
  }

  const totalIncome = currentTxns.filter(t => t.type === 'income').reduce((s, t) => s + (Number(t.amount) || 0), 0);
  const totalExpenses = currentTxns.filter(t => t.type === 'expense').reduce((s, t) => s + (Number(t.amount) || 0), 0);
  const saved = totalIncome - totalExpenses;

  if (totalIncome > 0 && candidates.length < 3) {
    const rate = Math.round((saved / totalIncome) * 100);
    candidates.push({
      id: 'savings-summary',
      bucket: 'saved',
      tone: saved < 0 ? 'negative' : 'positive',
      text:
        saved >= 0
          ? `You kept ${rate}% of income (${formatMoney(saved)}) this month.`
          : `Spending exceeded income by ${formatMoney(Math.abs(saved))} this month.`,
      href: `#/month/${selectedMonth}/bucket/income`,
      impact: Math.abs(saved) * 0.25,
    });
  }

  // 6. Fallback: recent notable transactions so every recorded activity month surfaces real items
  if (candidates.length < 3) {
    const remainingTxns = [...currentTxns].sort(
      (a, b) => (Number(b.amount) || 0) - (Number(a.amount) || 0)
    );
    for (const tx of remainingTxns) {
      if (candidates.length >= 3) break;
      if (tx.description && !candidates.some(c => c.text.includes(tx.description))) {
        const b = tx.type === 'income' ? 'saved' : bucketOf(tx, categories);
        const bucketKey: BucketKey =
          b === 'fixed'
            ? 'fixed'
            : b === 'non-monthly'
            ? 'non-monthly'
            : b === 'saved'
            ? 'saved'
            : 'flexible';
        candidates.push({
          id: `recent-tx-${tx.id}`,
          bucket: bucketKey,
          text: `${tx.description} posted at ${formatMoney(Number(tx.amount) || 0)}.`,
          href: `#/transactions?month=${selectedMonth}`,
          impact: (Number(tx.amount) || 0) * 0.1,
        });
      }
    }
  }

  return candidates.sort((a, b) => b.impact - a.impact).slice(0, 3);
}
