import { Transaction, Budget, SpendingBucket } from '../services/storage';
import { computeTxHash } from './crypto';

function formatMonth(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  return `${y}-${m}`;
}

export async function generateSampleData(): Promise<{
  transactions: Transaction[];
  budgets: Budget[];
}> {
  const now = new Date();
  const months: string[] = [];
  for (let i = 3; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    months.push(formatMonth(d));
  }

  const rawTxList: Array<{
    monthIdx: number;
    day: number;
    category: string;
    subCategory?: string;
    amount: number;
    type: 'income' | 'expense' | 'transfer';
    spendingBucket?: SpendingBucket;
    description: string;
    labels: string[];
  }> = [];

  const currentDay = now.getDate();
  const pushTx = (tx: (typeof rawTxList)[0]) => {
    // For the current month (idx === 3), do NOT generate transactions on future days (day > now.getDate())
    if (tx.monthIdx === 3 && tx.day > currentDay) return;
    rawTxList.push(tx);
  };

  // Populate data across 4 months
  months.forEach((_, idx) => {
    // Income
    pushTx({
      monthIdx: idx,
      day: 1,
      category: 'salary',
      amount: 4500,
      type: 'income',
      description: 'Monthly Salary',
      labels: ['salary', 'income']
    });

    // Fixed: Rent
    pushTx({
      monthIdx: idx,
      day: 1,
      category: 'housing',
      amount: 1400,
      type: 'expense',
      spendingBucket: 'fixed',
      description: 'Apartment Rent',
      labels: ['rent', 'fixed']
    });

    // Fixed: Utilities
    pushTx({
      monthIdx: idx,
      day: 4,
      category: 'utilities',
      amount: 145,
      type: 'expense',
      spendingBucket: 'fixed',
      description: 'Electric & Gas Utility',
      labels: ['utilities', 'fixed']
    });

    // Fixed: Internet
    pushTx({
      monthIdx: idx,
      day: 5,
      category: 'utilities',
      amount: 70,
      type: 'expense',
      spendingBucket: 'fixed',
      description: 'High-Speed Fiber Internet',
      labels: ['wifi', 'fixed']
    });

    // Flexible: Groceries 1
    pushTx({
      monthIdx: idx,
      day: 7,
      category: 'food',
      amount: 110 + (idx * 5),
      type: 'expense',
      spendingBucket: 'flexible',
      description: 'Weekly Supermarket Groceries',
      labels: ['groceries', 'flexible']
    });

    // Flexible: Dining out
    pushTx({
      monthIdx: idx,
      day: 10,
      category: 'food',
      amount: 38,
      type: 'expense',
      spendingBucket: 'flexible',
      description: 'Sushi Dinner with Friends',
      labels: ['dining', 'flexible']
    });

    // Flexible: Gas
    pushTx({
      monthIdx: idx,
      day: 12,
      category: 'transport',
      amount: 48,
      type: 'expense',
      spendingBucket: 'flexible',
      description: 'Shell Fuel Station',
      labels: ['transport', 'flexible']
    });

    // Flexible: Groceries 2
    pushTx({
      monthIdx: idx,
      day: 18,
      category: 'food',
      amount: 95,
      type: 'expense',
      spendingBucket: 'flexible',
      description: 'Trader Joe\'s Groceries',
      labels: ['groceries', 'flexible']
    });

    // Flexible: Entertainment
    pushTx({
      monthIdx: idx,
      day: 22,
      category: 'entertainment',
      amount: 35,
      type: 'expense',
      spendingBucket: 'flexible',
      description: 'Movie & Snacks',
      labels: ['entertainment', 'flexible']
    });

    // Non-monthly expenses distributed across history
    if (idx === 1) {
      pushTx({
        monthIdx: idx,
        day: 20,
        category: 'transport',
        amount: 280,
        type: 'expense',
        spendingBucket: 'non-monthly',
        description: 'Auto Maintenance & Oil Change',
        labels: ['car', 'non-monthly']
      });
    }

    if (idx === 3) {
      pushTx({
        monthIdx: idx,
        day: 15,
        category: 'misc',
        amount: 350,
        type: 'expense',
        spendingBucket: 'non-monthly',
        description: 'Annual Renter\'s Insurance',
        labels: ['insurance', 'non-monthly']
      });
    }
  });

  const transactions: Transaction[] = [];
  for (let i = 0; i < rawTxList.length; i++) {
    const item = rawTxList[i];
    const monthStr = months[item.monthIdx];
    const dateStr = `${monthStr}-${String(item.day).padStart(2, '0')}`;
    const hash = await computeTxHash(dateStr, item.description, item.amount, item.type);

    transactions.push({
      id: `sample-${item.monthIdx}-${i}`,
      date: dateStr,
      category: item.category,
      subCategory: item.subCategory || null,
      amount: item.amount,
      type: item.type,
      spendingBucket: item.spendingBucket,
      description: item.description,
      notes: '',
      labels: item.labels,
      hash
    });
  }

  const budgets: Budget[] = [
    { category: 'housing', amount: 1500 },
    { category: 'utilities', amount: 250 },
    { category: 'food', amount: 500 },
    { category: 'transport', amount: 250 },
    { category: 'entertainment', amount: 150 }
  ];

  return { transactions, budgets };
}
