import { Category } from '../services/storage';

// Dictionary of keyword patterns mapped to category IDs
const CATEGORY_KEYWORDS: Record<string, string[]> = {
  salary: ['salary', 'payroll', 'direct deposit', 'stipend', 'bonus', 'dividend', 'income', 'paycheck'],
  rent: ['rent', 'lease', 'apartment', 'landlord', 'mortgage', 'housing'],
  utilities: ['electric', 'water', 'power', 'utility', 'internet', 'comcast', 'verizon', 'at&t', 'pge', 'pg&e', 'trash', 'sewer', 'wifi', 'broadband'],
  food: ['whole foods', 'trader joe', 'safeway', 'grocery', 'groceries', 'supermarket', 'food', 'diner', 'restaurant', 'dining', 'pizza', 'cafe', 'coffee', 'starbucks', 'mcdonald', 'burger', 'sushi', 'taco', 'bakery', 'bistro', 'eats', 'doordash', 'ubereats', 'grubhub'],
  transport: ['uber', 'lyft', 'gas', 'fuel', 'chevron', 'shell', '7-eleven', '711', 'parking', 'transit', 'subway', 'train', 'airline', 'flight', 'delta', 'united', 'american air', 'auto', 'car wash'],
  entertainment: ['netflix', 'spotify', 'hulu', 'hbo', 'movie', 'cinema', 'theater', 'concert', 'ticket', 'disney', 'steam', 'playstation', 'xbox', 'nintendo', 'amusement'],
  travel: ['hotel', 'airbnb', 'expedia', 'booking', 'resort', 'flight', 'hostel', 'vacation', 'cruise'],
  meals: ['lunch', 'dinner', 'catering', 'snack', 'cafeteria'],
  healthcare: ['doctor', 'dentist', 'pharmacy', 'cvs', 'walgreens', 'medical', 'copay', 'clinic', 'hospital', 'health', 'optometry', 'vision'],
  misc: ['amazon', 'target', 'walmart', 'store', 'shop']
};

const TRANSFER_KEYWORDS = [
  'credit card payment',
  'payment thank you',
  'payment - thank you',
  'chase credit crd',
  'amex epayment',
  'citi autopay',
  'autopay payment',
  'card payment',
  'online payment',
  'bank transfer',
  'account transfer',
  'transfer to',
  'transfer from',
  'cc payment',
  'auto pay'
];

/**
 * Detects if a transaction description or raw type string matches a transfer/credit card payment pattern.
 */
export function detectTransactionType(
  description: string,
  rawType?: string
): 'income' | 'expense' | 'transfer' {
  const cleanDesc = (description || '').toLowerCase().trim();
  const cleanRawType = (rawType || '').toLowerCase().trim();

  if (cleanRawType.includes('transfer')) {
    return 'transfer';
  }

  for (const kw of TRANSFER_KEYWORDS) {
    if (cleanDesc.includes(kw)) {
      return 'transfer';
    }
  }

  if (cleanRawType.includes('income') || cleanRawType.includes('deposit')) {
    return 'income';
  }

  return 'expense';
}

/**
 * Suggests the best category ID based on transaction description and optional raw CSV category string.
 */
export function suggestCategory(
  description: string,
  rawCategory?: string,
  availableCategories: Category[] = []
): string {
  const cleanDesc = (description || '').toLowerCase().trim();
  const cleanRawCat = (rawCategory || '').toLowerCase().trim();

  // 1. First check if rawCategory directly matches any existing category ID or name
  if (cleanRawCat) {
    const directMatch = availableCategories.find(c => 
      c.id.toLowerCase() === cleanRawCat || 
      c.name.toLowerCase() === cleanRawCat
    );
    if (directMatch) return directMatch.id;
  }

  // 2. Check keyword patterns against description & rawCategory
  const combinedText = `${cleanDesc} ${cleanRawCat}`;
  
  for (const [catId, keywords] of Object.entries(CATEGORY_KEYWORDS)) {
    for (const kw of keywords) {
      if (combinedText.includes(kw)) {
        // Ensure category exists in availableCategories, or fallback to catId
        const exists = availableCategories.length === 0 || availableCategories.some(c => c.id === catId);
        if (exists) return catId;
      }
    }
  }

  // 3. Fallback: return 'misc' or first available category
  if (availableCategories.some(c => c.id === 'misc')) return 'misc';
  return availableCategories[0]?.id || 'misc';
}
