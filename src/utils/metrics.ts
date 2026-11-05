import { Transaction, Category } from '../services/storage';
import { bucketOf } from './categorizer';

export interface MonthMetrics {
  income: number;
  fixed: number;
  flexible: number;
  nonMonthly: number;
  expenses: number;
  savings: number;
  savingsRate: number;
  flexNumber: number;
  transfers: number;
}

/**
 * Returns true when an income transaction is actually a refund or reimbursement
 * that should offset category spending rather than inflate monthly income (§3.11).
 */
export function isRefundTransaction(t: {
  type?: string;
  category?: string;
  labels?: string[];
}): boolean {
  if (t.type !== 'income') return false;
  const catLower = (t.category || '').trim().toLowerCase();
  if (catLower === 'refund' || catLower === 'reimbursement') return true;
  if (Array.isArray(t.labels)) {
    const lowerLabels = t.labels.map(l => String(l).trim().toLowerCase());
    if (lowerLabels.includes('refund') || lowerLabels.includes('reimbursement')) {
      return true;
    }
  }
  return false;
}

/**
 * Pure function to compute monthly cash-basis financial metrics (§3.2, §3.11, §3.12).
 */
export function computeMonthMetrics(
  transactions: Transaction[],
  month: string,
  categories?: Category[] | Record<string, string>
): MonthMetrics {
  let income = 0;
  let fixed = 0;
  let flexible = 0;
  let nonMonthly = 0;
  let transfers = 0;

  for (const t of transactions) {
    const matchMonth = month === 'all' || (t.date && t.date.startsWith(month));
    if (!matchMonth) continue;

    const amt =
      typeof t.amount === 'number'
        ? t.amount
        : parseFloat(String(t.amount || 0)) || 0;

    if (t.type === 'transfer') {
      transfers += amt;
      continue;
    }

    if (t.type === 'income') {
      if (isRefundTransaction(t)) {
        const b = bucketOf(t, categories);
        if (b === 'fixed') fixed -= amt;
        else if (b === 'non-monthly') nonMonthly -= amt;
        else flexible -= amt;
      } else {
        income += amt;
      }
    } else if (t.type === 'expense') {
      const b = bucketOf(t, categories);
      if (b === 'fixed') fixed += amt;
      else if (b === 'non-monthly') nonMonthly += amt;
      else flexible += amt;
    }
  }

  fixed = Math.max(0, fixed);
  flexible = Math.max(0, flexible);
  nonMonthly = Math.max(0, nonMonthly);

  const expenses = fixed + flexible + nonMonthly;
  const savings = income - expenses;
  const savingsRate = income > 0 ? (savings / income) * 100 : 0;
  const flexNumber = income - fixed - nonMonthly;

  return {
    income,
    fixed,
    flexible,
    nonMonthly,
    expenses,
    savings,
    savingsRate,
    flexNumber,
    transfers,
  };
}
