import type { Category, SpendingBucket } from '../services/storage';

// Dictionary of keyword patterns mapped to category IDs
const CATEGORY_KEYWORDS: Record<string, string[]> = {
  salary: ['salary', 'payroll', 'direct deposit', 'stipend', 'bonus', 'dividend', 'income', 'paycheck'],
  income: ['payroll', 'direct deposit', 'your rental', 'rental income'],
  rent: ['rent', 'lease', 'apartment', 'landlord', 'mortgage', 'housing', 'bilt rent', 'bilt rewards rent'],
  housing: ['rent', 'lease', 'apartment', 'landlord', 'mortgage', 'housing', 'hoa', 'bilt rent'],
  utilities: ['electric', 'water', 'power', 'utility', 'internet', 'comcast', 'verizon', 'at&t', 't-mobile', 'pge', 'pg&e', 'trash', 'sewer', 'wifi', 'broadband', 'puget sound energy', 'snohomish county pud', 'ziply', 'waste management', 'google fi'],
  groceries: ['whole foods', 'trader joe', 'safeway', 'kroger', 'aldi', 'costco', 'instacart', 'sprouts', 'grocery', 'groceries', 'supermarket'],
  food: ['whole foods', 'trader joe', 'safeway', 'grocery', 'groceries', 'supermarket', 'food', 'diner', 'restaurant', 'dining', 'pizza', 'cafe', 'coffee', 'starbucks', 'blue bottle', 'sweetgreen', 'chipotle', 'mcdonald', 'burger', 'sushi', 'taco', 'bakery', 'bistro', 'eats', 'doordash', 'ubereats', 'grubhub'],
  transport: ['uber', 'lyft', 'gas', 'fuel', 'chevron', 'shell', '7-eleven', '711', 'parking', 'transit', 'subway', 'train', 'mta', 'nyct', 'paygo', 'omny', 'clipper', 'bart', 'caltrain', 'airline', 'flight', 'delta', 'united', 'american air', 'auto', 'car wash', 'waymo', 'geico', 'progressive'],
  entertainment: ['netflix', 'spotify', 'hulu', 'hbo', 'youtube premium', 'apple tv', 'movie', 'cinema', 'theater', 'concert', 'ticket', 'disney', 'steam', 'playstation', 'xbox', 'nintendo', 'amusement', 'google one'],
  travel: ['hotel', 'airbnb', 'expedia', 'booking', 'resort', 'flight', 'hostel', 'vacation', 'cruise', 'marriott', 'hilton', 'hyatt'],
  meals: ['lunch', 'dinner', 'catering', 'snack', 'cafeteria'],
  healthcare: ['doctor', 'dentist', 'pharmacy', 'cvs', 'walgreens', 'medical', 'copay', 'clinic', 'hospital', 'health', 'optometry', 'vision'],
  'child-care': ['child care', 'childcare', 'daycare', 'preschool', 'woodinville 8609257058'],
  shopping: ['apparel', 'clothing', 'nike', 'uniqlo', 'nordstrom', 'macys', 'zara', 'ikea', 'best buy', 'apple store', 'amazon', 'amzn'],
  misc: ['target', 'walmart', 'store', 'shop', 'salon', 'barber', 'haircut']
};

const WORD_BOUNDARY_KEYWORDS = new Set([
  'gas',
  'auto',
  'water',
  'car',
  'shop',
  'store',
  'rent',
  'food',
  'uber',
  'shell',
  'spa',
  'nail',
]);

function normalizeForKeywordMatch(raw?: string): string {
  return (raw || '').toLowerCase().replace(/[_]+/g, ' ').replace(/\s+/g, ' ').trim();
}

function matchesKeyword(text: string, kw: string): boolean {
  if (WORD_BOUNDARY_KEYWORDS.has(kw)) {
    const escaped = kw.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    return new RegExp(`\\b${escaped}\\b`, 'i').test(text);
  }
  return text.includes(kw);
}

const TRANSFER_KEYWORDS = [
  'credit card payment',
  'loan payments credit card payment',
  'payment thank you',
  'payment - thank you',
  'online payment thank you',
  'automatic payment - thank',
  'autopay thank you',
  'chase credit crd',
  'amex epayment',
  'citi autopay',
  'synchrony bank payment',
  'synchrony autopay',
  'wells fargo payment',
  'bilt payment',
  'bilt card payment',
  'bank transfer',
  'account transfer',
  'transfer to',
  'transfer from',
  'transfer in',
  'transfer out',
  'zelle transfer',
  'venmo cashout',
  // Real-world bank abbreviations for card bill payoffs & Bilt housing pass-through legs
  'syf paymnt',
  'syf payment',
  'card pmt',
  'payment to crd',
  'pending payment',
  'payment - bilt housing',
  'bilt card des:housing',
];

/** Descriptions that are a bare, contextless payment (credit card payment received). */
const BARE_TRANSFER_DESCRIPTIONS = new Set(['payment']);

const REFUND_KEYWORDS = [
  'refund',
  'return credit',
  'reversal',
  'reimbursement',
  'chargeback credit',
  'amzn mktp us refund',
  'amazon.com refund'
];

/**
 * Detects if a transaction description or raw type string matches a refund pattern.
 */
export function detectRefund(description: string, rawType?: string): boolean {
  const combined = `${normalizeForKeywordMatch(description)} ${normalizeForKeywordMatch(rawType)}`;
  return REFUND_KEYWORDS.some(kw => combined.includes(kw));
}

/**
 * Returns true if the description or rawType represents an internal or credit card transfer.
 */
export function isTransfer(description: string, rawType?: string): boolean {
  const cleanDesc = normalizeForKeywordMatch(description);
  const cleanRawType = normalizeForKeywordMatch(rawType);
  if (cleanRawType.includes('transfer')) return true;
  if (BARE_TRANSFER_DESCRIPTIONS.has(cleanDesc)) return true;
  return TRANSFER_KEYWORDS.some(kw => cleanDesc.includes(kw));
}

/**
 * Detects if a transaction description or raw type string matches a transfer/credit card payment pattern.
 */
export function detectTransactionType(
  description: string,
  rawType?: string
): 'income' | 'expense' | 'transfer' {
  if (isTransfer(description, rawType)) {
    return 'transfer';
  }

  const cleanRawType = normalizeForKeywordMatch(rawType);

  if (detectRefund(description, rawType)) {
    return 'income';
  }

  if (cleanRawType.includes('income') || cleanRawType.includes('deposit') || cleanRawType.includes('credit')) {
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
  const cleanDesc = normalizeForKeywordMatch(description);
  const cleanRawCat = normalizeForKeywordMatch(rawCategory);

  // 1. First check if rawCategory directly matches any existing category ID or name
  if (cleanRawCat) {
    const rawTrimmed = (rawCategory || '').toLowerCase().trim();
    const directMatch = availableCategories.find(c => 
      c.id.toLowerCase() === rawTrimmed || 
      c.name.toLowerCase() === rawTrimmed ||
      c.id.toLowerCase() === cleanRawCat ||
      c.name.toLowerCase() === cleanRawCat
    );
    if (directMatch) return directMatch.id;
  }

  // 2. Check keyword patterns against description & rawCategory
  const combinedText = `${cleanDesc} ${cleanRawCat}`;
  
  for (const [catId, keywords] of Object.entries(CATEGORY_KEYWORDS)) {
    for (const kw of keywords) {
      if (matchesKeyword(combinedText, kw)) {
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

const SUBCATEGORY_KEYWORDS: Record<string, Record<string, string[]>> = {
  groceries: {
    'groceries-costco': ['costco'],
    'groceries-instacart': ['instacart'],
    'groceries-supermarket': ['whole foods', 'trader joe', 'safeway', 'kroger', 'aldi', 'sprouts', 'grocery', 'supermarket'],
  },
  shopping: {
    'shopping-amazon': ['amazon', 'amzn', 'amz*'],
    'shopping-apparel': ['apparel', 'clothing', 'nike', 'uniqlo', 'nordstrom', 'macys', 'zara'],
    'shopping-general': ['target', 'walmart', 'ikea', 'best buy', 'apple store'],
  },
  food: {
    'food-takeout': ['doordash', 'ubereats', 'uber eats', 'grubhub', 'delivery', 'takeout', 'chipotle', 'sweetgreen', 'starbucks', 'coffee', 'cafe', 'bakery'],
    'food-dine-in': ['restaurant', 'diner', 'bistro', 'sushi', 'osteria', 'dining', 'food & drink', 'food and drink'],
  },
  entertainment: {
    'entertainment-subs': ['netflix', 'spotify', 'hulu', 'hbo', 'youtube', 'apple tv', 'disney', 'subscription', 'google one'],
    'entertainment-movies': ['movie', 'cinema', 'theater', 'concert', 'ticket', 'event'],
  },
  misc: {
    'misc-salon': ['salon', 'barber', 'haircut', 'spa', 'nail'],
  },
  income: {
    'income-salary': ['payroll', 'salary', 'direct deposit', 'paycheck'],
    'income-investment': ['your rental', 'rental income', 'dividend', 'interest'],
  },
  utilities: {
    'utilities-electric': ['electric', 'power', 'pge', 'pg&e', 'snohomish county pud'],
    'utilities-water': ['water', 'sewer', 'trash', 'waste management'],
    'utilities-gas': ['gas', 'heating'],
    'utilities-internet': ['internet', 'wifi', 'comcast', 'broadband', 'ziply'],
    'utilities-phone': ['verizon', 'at&t', 't-mobile', 'phone', 'mobile', 'google fi'],
  },
  housing: {
    'housing-mortgage': ['rent', 'lease', 'apartment', 'landlord', 'mortgage', 'bilt'],
    'housing-hoa': ['hoa'],
  },
  transport: {
    'transport-fuel': ['gas', 'fuel', 'chevron', 'shell', '7-eleven'],
    'transport-transit': ['uber', 'lyft', 'transit', 'subway', 'train', 'mta', 'nyct', 'paygo', 'omny', 'clipper', 'bart', 'caltrain', 'parking', 'waymo'],
    'transport-maint': ['repair', 'car wash', 'auto', 'geico', 'progressive'],
  },
  travel: {
    'travel-flights': ['flight', 'airline', 'delta', 'united', 'american air'],
    'travel-hotels': ['hotel', 'airbnb', 'marriott', 'hilton', 'hyatt', 'resort', 'lodging'],
    'travel-car': ['rental', 'hertz', 'avis', 'enterprise'],
  },
  healthcare: {
    'healthcare-pharmacy': ['pharmacy', 'cvs', 'walgreens', 'meds', 'medicine'],
    'healthcare-dental': ['dentist', 'dental', 'vision', 'optometry'],
    'healthcare-doctor': ['doctor', 'medical', 'copay', 'clinic', 'hospital'],
  },
  transfers: {
    'transfers-bank': ['bank transfer', 'account transfer', 'transfer to', 'transfer from', 'transfer in', 'transfer out', 'zelle transfer', 'venmo cashout'],
    'transfers-cc': ['credit card', 'autopay', 'payment', 'synchrony', 'bilt', 'chase', 'amex', 'citi'],
  },
};

/**
 * Suggests the best sub-category ID for a given parent category ID and description.
 */
export function suggestSubCategory(
  description: string,
  parentCategoryId: string,
  availableCategories: Category[] = []
): string | null {
  if (!parentCategoryId) return null;
  const cleanDesc = normalizeForKeywordMatch(description);
  const mapForParent = SUBCATEGORY_KEYWORDS[parentCategoryId.toLowerCase()];
  if (!mapForParent) return null;

  for (const [subId, keywords] of Object.entries(mapForParent)) {
    if (keywords.some(kw => matchesKeyword(cleanDesc, kw))) {
      const exists =
        availableCategories.length === 0 ||
        availableCategories.some(c => c.id === subId);
      if (exists) return subId;
    }
  }
  return null;
}

const FIXED_KEYWORDS = [
  'mortgage', 'rent', 'lease', 'landlord', 'insurance', 'loan', 'car payment', 'auto loan',
  'utility', 'electric', 'water', 'power', 'internet', 'wifi', 'comcast', 'verizon', 'at&t',
  'pge', 'pg&e', 'trash', 'sewer', 'hoa', 'tuition', 'daycare', 'subscription', 'monthly fee',
  'netflix', 'spotify', 'hulu', 'hbo', 'apple tv', 'disney', 'google one', 'ziply', 'google fi'
];

const NON_MONTHLY_KEYWORDS = [
  'annual', 'yearly', 'quarterly', 'semi-annual', 'registration', 'dmv', 'renewal',
  'property tax', 'tax return', 'gift', 'holiday', 'christmas', 'birthday', 'vacation',
  'car repair', 'home repair'
];

/**
 * Suggests spending bucket ('fixed', 'flexible', or 'non-monthly') based on description and category.
 */
export function suggestSpendingBucket(
  description: string,
  category: string = ''
): 'fixed' | 'flexible' | 'non-monthly' {
  const cleanDesc = (description || '').toLowerCase().trim();
  const cleanCat = (category || '').toLowerCase().trim();
  const combined = `${cleanDesc} ${cleanCat}`;

  // Category heuristics
  if (cleanCat === 'housing' || cleanCat === 'utilities' || cleanCat === 'child-care') {
    // Unless it has non-monthly keyword like repair
    for (const kw of NON_MONTHLY_KEYWORDS) {
      if (cleanDesc.includes(kw)) return 'non-monthly';
    }
    return 'fixed';
  }

  // Non-monthly keywords check
  for (const kw of NON_MONTHLY_KEYWORDS) {
    if (combined.includes(kw)) return 'non-monthly';
  }

  // Fixed keywords check
  for (const kw of FIXED_KEYWORDS) {
    if (combined.includes(kw)) return 'fixed';
  }

  return 'flexible';
}

/**
 * Pure function to resolve the spending bucket of a transaction without read-time heuristics (C4).
 * 1. Checks explicit transaction.spendingBucket
 * 2. Checks labels array for 'fixed' | 'flexible' | 'non-monthly'
 * 3. Checks sub-category default then parent category default in categoryDefaults
 * 4. Defaults to 'flexible'
 */
export function bucketOf(
  transaction: { spendingBucket?: SpendingBucket | null; labels?: string[]; category?: string; subCategory?: string | null },
  categoryDefaults?: Category[] | Record<string, string>
): SpendingBucket {
  if (transaction.spendingBucket === 'fixed' || transaction.spendingBucket === 'flexible' || transaction.spendingBucket === 'non-monthly') {
    return transaction.spendingBucket;
  }
  // Check transaction labels for bucket tag
  if (Array.isArray(transaction.labels)) {
    if (transaction.labels.includes('fixed')) return 'fixed';
    if (transaction.labels.includes('non-monthly')) return 'non-monthly';
    if (transaction.labels.includes('flexible')) return 'flexible';
  }

  // Check categoryDefaults
  if (categoryDefaults) {
    if (Array.isArray(categoryDefaults)) {
      if (transaction.subCategory) {
        const subCat = categoryDefaults.find(c => c.id.toLowerCase() === transaction.subCategory?.toLowerCase());
        if (subCat?.defaultBucket) return subCat.defaultBucket;
      }
      if (transaction.category) {
        const parentCat = categoryDefaults.find(c => c.id.toLowerCase() === transaction.category?.toLowerCase() || c.name.toLowerCase() === transaction.category?.toLowerCase());
        if (parentCat?.defaultBucket) return parentCat.defaultBucket;
      }
    } else {
      if (transaction.subCategory && categoryDefaults[transaction.subCategory]) {
        const val = categoryDefaults[transaction.subCategory];
        if (val === 'fixed' || val === 'flexible' || val === 'non-monthly') return val;
      }
      if (transaction.category && categoryDefaults[transaction.category]) {
        const val = categoryDefaults[transaction.category];
        if (val === 'fixed' || val === 'flexible' || val === 'non-monthly') return val;
      }
    }
  }

  const catLower = (transaction.category || '').toLowerCase();
  if (catLower === 'housing' || catLower === 'rent' || catLower === 'utilities') {
    return 'fixed';
  }

  return 'flexible';
}

export type BucketSource = 'explicit' | 'label' | 'category' | 'fallback';

export function bucketSource(
  transaction: { spendingBucket?: SpendingBucket | null; labels?: string[]; category?: string; subCategory?: string | null },
  categoryDefaults?: Category[] | Record<string, string>
): BucketSource {
  if (
    transaction.spendingBucket === 'fixed' ||
    transaction.spendingBucket === 'flexible' ||
    transaction.spendingBucket === 'non-monthly'
  ) {
    return 'explicit';
  }
  if (Array.isArray(transaction.labels)) {
    if (
      transaction.labels.includes('fixed') ||
      transaction.labels.includes('non-monthly') ||
      transaction.labels.includes('flexible')
    ) {
      return 'label';
    }
  }
  if (categoryDefaults) {
    if (Array.isArray(categoryDefaults)) {
      if (transaction.subCategory) {
        const subCat = categoryDefaults.find(
          c => c.id.toLowerCase() === transaction.subCategory?.toLowerCase()
        );
        if (subCat?.defaultBucket) return 'category';
      }
      if (transaction.category) {
        const parentCat = categoryDefaults.find(
          c =>
            c.id.toLowerCase() === transaction.category?.toLowerCase() ||
            c.name.toLowerCase() === transaction.category?.toLowerCase()
        );
        if (parentCat?.defaultBucket) return 'category';
      }
    } else {
      if (transaction.subCategory && categoryDefaults[transaction.subCategory]) {
        return 'category';
      }
      if (transaction.category && categoryDefaults[transaction.category]) {
        return 'category';
      }
    }
  }

  const catLower = (transaction.category || '').toLowerCase();
  if (
    catLower === 'housing' ||
    catLower === 'rent' ||
    catLower === 'utilities' ||
    catLower === 'food' ||
    catLower === 'groceries' ||
    catLower === 'shopping' ||
    catLower === 'dining' ||
    catLower === 'entertainment' ||
    catLower === 'transport' ||
    catLower === 'transportation' ||
    catLower === 'health' ||
    catLower === 'travel'
  ) {
    return 'category';
  }

  return 'fallback';
}


