export type TransactionType = 'income' | 'expense' | 'transfer';

export interface FormattedAmount {
  formattedAmount: string;
  colorClass: string;
}

/**
 * Normalizes values close to zero to prevent negative zero (-$0.00) display defects (U3).
 */
export function normalizeZero(val: number): number {
  return Math.abs(val) < 0.005 ? 0 : val;
}

/**
 * Formats a currency number safely, preventing -$0.00.
 */
export function formatCurrency(val: number): string {
  const normalized = normalizeZero(val);
  return normalized.toLocaleString('en-US', { style: 'currency', currency: 'USD' });
}

/**
 * Formats an expense figure with a negative prefix, e.g. -$50.00, but clean $0.00 for zero.
 */
export function formatExpenseCurrency(val: number): string {
  const normalized = normalizeZero(val);
  if (normalized === 0) {
    return '$0.00';
  }
  return `-${formatCurrency(Math.abs(normalized))}`;
}

/**
 * Formats a transaction amount as a clean positive currency figure with color coding based on type.
 * - Income: Emerald Green (text-emerald-500)
 * - Expense: Soft Rose/Coral (text-rose-500)
 * - Transfer: Sapphire Blue (text-blue-400)
 */
export function formatTransactionAmount(amount: number, type: TransactionType): FormattedAmount {
  const absAmount = Math.abs(normalizeZero(amount));
  const formattedAmount = `$${absAmount.toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  })}`;

  let colorClass = 'text-rose-500';
  if (type === 'income') {
    colorClass = 'text-emerald-500';
  } else if (type === 'transfer') {
    colorClass = 'text-blue-400';
  }

  return { formattedAmount, colorClass };
}
