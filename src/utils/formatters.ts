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

export interface FormatMoneyOptions {
  cents?: boolean;
  sign?: 'never' | 'auto' | 'always';
}

/**
 * Formats a monetary value according to Calm Ledger progressive precision:
 * - Overview, Bucket, Category: whole dollars (`cents: false, sign: 'never'`)
 * - Ledger & Edit Sheet: exact cents (`cents: true`)
 */
export function formatMoney(val: number, options?: FormatMoneyOptions): string {
  const cents = options?.cents ?? false;
  const sign = options?.sign ?? 'never';
  const normalized = normalizeZero(val);
  const absVal = Math.abs(normalized);
  const formatted = absVal.toLocaleString('en-US', {
    minimumFractionDigits: cents ? 2 : 0,
    maximumFractionDigits: cents ? 2 : 0,
  });

  if (sign === 'never' || normalized === 0) {
    return `$${formatted}`;
  }
  if (sign === 'always') {
    return `${normalized > 0 ? '+' : '−'}$${formatted}`;
  }
  // sign === 'auto'
  return `${normalized < 0 ? '−' : ''}$${formatted}`;
}

export function splitMoneyParts(val: number, sign: 'never' | 'auto' | 'always' = 'never'): { whole: string; cents: string } {
  const normalized = normalizeZero(val);
  const absVal = Math.abs(normalized);
  const totalCents = Math.round(absVal * 100);
  const wholeInt = Math.floor(totalCents / 100);
  const remCents = totalCents % 100;
  const wholeFormatted = wholeInt.toLocaleString('en-US', { maximumFractionDigits: 0 });
  const centsFormatted = `.${String(remCents).padStart(2, '0')}`;
  let prefix = '$';
  if (sign === 'always' && normalized !== 0) {
    prefix = `${normalized > 0 ? '+' : '−'}$`;
  } else if (sign === 'auto' && normalized < 0) {
    prefix = '−$';
  }
  return { whole: `${prefix}${wholeFormatted}`, cents: centsFormatted };
}

/**
 * Formats a transaction amount for the Calm Ledger:
 * - Expense: −$480.00 in text-1 (text-foreground)
 * - Income: +$6,500.00 in bucket-saved (text-bucket-saved)
 * - Transfer: ⇄ $500.00 in text-2 (text-muted-foreground)
 */
export function formatTransactionAmount(amount: number, type: TransactionType): FormattedAmount {
  const absAmount = Math.abs(normalizeZero(amount));
  const numStr = absAmount.toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });

  if (type === 'income') {
    return {
      formattedAmount: `+$${numStr}`,
      colorClass: 'text-bucket-saved',
    };
  }
  if (type === 'transfer') {
    return {
      formattedAmount: `⇄ $${numStr}`,
      colorClass: 'text-muted-foreground',
    };
  }

  return {
    formattedAmount: absAmount === 0 ? `$${numStr}` : `−$${numStr}`,
    colorClass: 'text-foreground',
  };
}
