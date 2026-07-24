export type TransactionType = 'income' | 'expense' | 'transfer';

export interface FormattedAmount {
  formattedAmount: string;
  colorClass: string;
}

/**
 * Formats a transaction amount as a clean positive currency figure with color coding based on type.
 * - Income: Emerald Green (text-emerald-500)
 * - Expense: Soft Rose/Coral (text-rose-500)
 * - Transfer: Sapphire Blue (text-blue-400)
 */
export function formatTransactionAmount(amount: number, type: TransactionType): FormattedAmount {
  const absAmount = Math.abs(amount);
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
