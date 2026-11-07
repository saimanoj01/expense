// Safe in-memory localStorage fallback for Node/CLI execution
try {
  if (typeof globalThis !== 'undefined' && typeof globalThis.localStorage === 'undefined') {
    const mem = new Map<string, string>();
    Object.defineProperty(globalThis, 'localStorage', {
      value: {
        get length() { return mem.size; },
        clear() { mem.clear(); },
        getItem(key: string) { return mem.has(key) ? mem.get(key)! : null; },
        key(index: number) { return Array.from(mem.keys())[index] ?? null; },
        removeItem(key: string) { mem.delete(key); },
        setItem(key: string, value: string) { mem.set(key, String(value)); },
      },
      configurable: true,
      writable: true,
    });
  }
} catch {
  // Ignore if environment restricts globalThis property definition
}

export type SpendingBucket = 'fixed' | 'flexible' | 'non-monthly';

export type ReviewReason =
  | 'duplicate'
  | 'category'
  | 'amount-mismatch'
  | 'voided'
  | 'tip-drift';

export type EditableTxField =
  | 'category'
  | 'subCategory'
  | 'spendingBucket'
  | 'description'
  | 'amount'
  | 'date'
  | 'type'
  | 'notes';

export interface TxReviewInfo {
  reason: ReviewReason;
  reasons?: ReviewReason[];
  detail?: string;
  flaggedAt?: string;
  resolvedAt?: string;
}

export interface TxMeta {
  sources?: string[];                    // e.g. ['bilt-plaid', 'amazon-email']
  externalIds?: Record<string, string>;  // sourceId -> externalId
  account?: string;                      // Card/account identifier (e.g. 'bilt', 'amazon-synchrony')
  aliasHashes?: string[];                // 16-hex prefixes of pre-enrichment/pre-split hashes
  orderId?: string;                      // Shared order ID for Amazon multi-item splits
  review?: TxReviewInfo;
  confidence?: number;                   // 0.0 - 1.0 classification confidence
  categorizedBy?: 'user' | 'history' | 'keyword' | 'llm' | 'fallback';
  userEdited?: EditableTxField[];        // Fields manually edited by user (never overwritten by feed updates)
  provisional?: boolean;                 // Optional flag for instant tap sources (e.g. Google Wallet)
  backfilled?: boolean;                  // True when metadata was reconstructed/backfilled from existing sheet rows
  ingestedAt?: string;
  updatedAt?: string;
}

export interface IngestSourceState {
  sourceId: string;
  syncStartDate?: string;                // Ignore inputs earlier than YYYY-MM-DD (only when explicitly set)
  lastSyncAt?: string;                   // ISO 8601 timestamp
  totalIngested?: number;                // Cumulative ingested count for this source
  cursor?: string;                       // Optional feed pagination/sync cursor
}

export interface IngestRunSummary {
  runId: string;
  sourceId: string;
  timestamp: string;
  inserted: number;
  flagged: number;
  merged: number;
  updated: number;
  removed: number;
  skipped: number;
}

export interface IngestState {
  version: number;
  tombstones: string[];                  // externalIds and 16-char hash prefixes
  sources: Record<string, IngestSourceState>;
  recentRuns: IngestRunSummary[];
}

export interface StorageWriteOptions {
  ignoreLocks?: boolean;
}

export interface Transaction {
  id: string;          // Unique UUID (generated on creation)
  date: string;        // ISO 8601 Date String (YYYY-MM-DD)
  category: string;    // ID of the Parent Category
  subCategory?: string | null; // ID of the Sub-Category (optional)
  amount: number;      // Numeric amount (positive float)
  type: 'income' | 'expense' | 'transfer';
  description: string; // Brief description/payee name
  notes: string;       // Extended details/comments
  labels: string[];    // Array of tags/labels
  hash: string;        // SHA-256 hash of transaction properties used for deduplication
  spendingBucket?: SpendingBucket; // Spending classification bucket
  meta?: TxMeta;       // Provenance, deduplication aliases, and review state (Column L)
}

export interface Category {
  id: string;          // Unique category ID or normalized slug
  name: string;        // Human-readable name
  color: string;       // Hex color code (e.g., '#FF6B6B')
  emoji: string;       // Emoji icon representing category (e.g., '🍔')
  parentId?: string | null; // Optional Parent Category ID (null or undefined if top-level category)
  defaultBucket?: SpendingBucket; // Default spending classification bucket
}

export interface Budget {
  category: string;    // Category ID that this budget applies to
  amount: number;      // Monthly budget cap
}

export interface Project {
  id: string;            // Unique UUID or slug
  name: string;          // Project name
  spreadsheetId?: string; // Optional Google Spreadsheet ID (null in Mock Mode)
  collaborators?: string[]; // Optional collaborator emails
}

export interface MonthlyLock {
  month: string;       // Lock month in YYYY-MM format
  locked: boolean;     // Lock status flag
  lockedAt?: string;   // ISO 8601 timestamp when locked
}

export interface BudgetNote {
  text: string;        // The note content
  updatedAt: string;   // ISO 8601 timestamp of last edit
  mood?: string;       // Emoji mood tag (only for __overall__ notes)
}

export interface StorageAdapter {
  getProjects(): Promise<Project[]>;
  createProject(name: string): Promise<Project>;
  saveProject(project: Project): Promise<Project>;
  shareProject(projectId: string, email: string): Promise<Project>;
  deleteProject(projectId: string): Promise<void>;

  getCategories(projectId: string): Promise<Category[]>;
  saveCategory(projectId: string, category: Category): Promise<Category>;
  deleteCategory(projectId: string, categoryId: string): Promise<void>;

  getTransactions(projectId: string): Promise<Transaction[]>;
  saveTransaction(projectId: string, transaction: Transaction, options?: StorageWriteOptions): Promise<Transaction>;
  saveTransactions(projectId: string, transactions: Transaction[], options?: StorageWriteOptions): Promise<Transaction[]>;
  deleteTransaction(projectId: string, transactionId: string, options?: StorageWriteOptions): Promise<void>;
  deleteTransactions(projectId: string, transactionIds: string[], options?: StorageWriteOptions): Promise<void>;

  getBudgets(projectId: string): Promise<Budget[]>;
  saveBudgets(projectId: string, budgets: Budget[]): Promise<void>;

  getLocks(projectId: string): Promise<MonthlyLock[]>;
  saveLock(projectId: string, lock: MonthlyLock): Promise<void>;

  getBudgetNotes(projectId: string): Promise<Record<string, BudgetNote>>;
  saveBudgetNote(projectId: string, key: string, note: BudgetNote): Promise<void>;
  deleteBudgetNote(projectId: string, key: string): Promise<void>;

  getIngestState?(projectId: string): Promise<IngestState>;
  saveIngestState?(projectId: string, state: IngestState): Promise<void>;
  acquireIngestLock?(projectId: string, holderId: string, ttlMs?: number): Promise<void>;
  releaseIngestLock?(projectId: string, holderId: string): Promise<void>;
  commitIngestBatch?(
    projectId: string,
    payload: {
      upserts: Transaction[];
      deleteIds: string[];
      ingestState: IngestState;
    },
    options?: StorageWriteOptions
  ): Promise<void>;
  invalidateCache?(projectId?: string): void;
}

// Default categories for new projects
export const DEFAULT_CATEGORIES: Category[] = [
  // 13 Parent Categories
  { id: 'groceries', name: 'Groceries', color: '#51CF66', emoji: '🛒' },
  { id: 'shopping', name: 'Shopping', color: '#E64980', emoji: '🛍️' },
  { id: 'merchandise', name: 'Merchandise', color: '#BE4BDB', emoji: '📦' },
  { id: 'utilities', name: 'Utilities', color: '#FCC419', emoji: '⚡' },
  { id: 'food', name: 'Food & Dining', color: '#FF6B6B', emoji: '🍔' },
  { id: 'entertainment', name: 'Entertainment', color: '#FF8787', emoji: '🎬' },
  { id: 'misc', name: 'Miscellaneous', color: '#ADB5BD', emoji: '📦' },
  { id: 'income', name: 'Income', color: '#40C057', emoji: '💰' },
  { id: 'transfers', name: 'Transfers', color: '#339AF0', emoji: '↔️' },
  { id: 'travel', name: 'Travel', color: '#38BDF8', emoji: '✈️' },
  { id: 'housing', name: 'Housing', color: '#4DABF7', emoji: '🏠' },
  { id: 'transport', name: 'Transport', color: '#845EF7', emoji: '🚗' },
  { id: 'healthcare', name: 'Health & Medical', color: '#20C997', emoji: '🏥' },

  // Sub-Categories
  // Groceries
  { id: 'groceries-costco', name: 'Costco', color: '#51CF66', emoji: '🏬', parentId: 'groceries' },
  { id: 'groceries-instacart', name: 'Instacart', color: '#51CF66', emoji: '🚚', parentId: 'groceries' },
  { id: 'groceries-supermarket', name: 'Supermarket', color: '#51CF66', emoji: '🛒', parentId: 'groceries' },

  // Shopping
  { id: 'shopping-amazon', name: 'Amazon', color: '#E64980', emoji: '📦', parentId: 'shopping' },
  { id: 'shopping-apparel', name: 'Apparel & Clothing', color: '#E64980', emoji: '👕', parentId: 'shopping' },
  { id: 'shopping-general', name: 'General Shopping', color: '#E64980', emoji: '🛍️', parentId: 'shopping' },

  // Merchandise
  { id: 'merchandise-retail', name: 'Retail Goods', color: '#BE4BDB', emoji: '🏷️', parentId: 'merchandise' },
  { id: 'merchandise-electronics', name: 'Electronics & Supplies', color: '#BE4BDB', emoji: '💻', parentId: 'merchandise' },

  // Utilities
  { id: 'utilities-phone', name: 'Phone & Mobile', color: '#FCC419', emoji: '📱', parentId: 'utilities' },
  { id: 'utilities-electric', name: 'Electricity', color: '#FCC419', emoji: '💡', parentId: 'utilities' },
  { id: 'utilities-water', name: 'Water & Sewer', color: '#FCC419', emoji: '🚰', parentId: 'utilities' },
  { id: 'utilities-gas', name: 'Gas & Heating', color: '#FCC419', emoji: '🔥', parentId: 'utilities' },
  { id: 'utilities-internet', name: 'Internet & TV', color: '#FCC419', emoji: '📶', parentId: 'utilities' },

  // Food
  { id: 'food-dine-in', name: 'Dine in', color: '#FF6B6B', emoji: '🍽️', parentId: 'food' },
  { id: 'food-takeout', name: 'Takeout & Delivery', color: '#FF6B6B', emoji: '🥡', parentId: 'food' },

  // Entertainment
  { id: 'entertainment-subs', name: 'Subscriptions & Streaming', color: '#FF8787', emoji: '📺', parentId: 'entertainment' },
  { id: 'entertainment-movies', name: 'Movies & Events', color: '#FF8787', emoji: '🎟️', parentId: 'entertainment' },

  // Misc
  { id: 'misc-salon', name: 'Salon & Personal Care', color: '#ADB5BD', emoji: '💇', parentId: 'misc' },
  { id: 'misc-other', name: 'Other Miscellaneous', color: '#ADB5BD', emoji: '🏷️', parentId: 'misc' },

  // Income
  { id: 'income-salary', name: 'Salary & Wages', color: '#40C057', emoji: '💼', parentId: 'income' },
  { id: 'income-freelance', name: 'Freelance & Side Hustles', color: '#40C057', emoji: '💸', parentId: 'income' },
  { id: 'income-investment', name: 'Investments & Dividends', color: '#40C057', emoji: '📈', parentId: 'income' },

  // Transfers
  { id: 'transfers-cc', name: 'Credit Card Payment', color: '#339AF0', emoji: '💳', parentId: 'transfers' },
  { id: 'transfers-bank', name: 'Bank Transfer', color: '#339AF0', emoji: '🏦', parentId: 'transfers' },

  // Travel
  { id: 'travel-flights', name: 'Flights & Airfare', color: '#38BDF8', emoji: '🛫', parentId: 'travel' },
  { id: 'travel-hotels', name: 'Hotels & Lodging', color: '#38BDF8', emoji: '🏨', parentId: 'travel' },
  { id: 'travel-car', name: 'Car Rental', color: '#38BDF8', emoji: '🚘', parentId: 'travel' },

  // Housing
  { id: 'housing-mortgage', name: 'Mortgage & Rent', color: '#4DABF7', emoji: '🏠', parentId: 'housing' },
  { id: 'housing-hoa', name: 'HOA Fees & Dues', color: '#4DABF7', emoji: '🏢', parentId: 'housing' },

  // Transport
  { id: 'transport-fuel', name: 'Gas & Fuel', color: '#845EF7', emoji: '⛽', parentId: 'transport' },
  { id: 'transport-transit', name: 'Rideshare & Transit', color: '#845EF7', emoji: '🚕', parentId: 'transport' },
  { id: 'transport-maint', name: 'Vehicle Maintenance', color: '#845EF7', emoji: '🔧', parentId: 'transport' },

  // Health & Medical
  { id: 'healthcare-doctor', name: 'Doctor & Copay', color: '#20C997', emoji: '🩺', parentId: 'healthcare' },
  { id: 'healthcare-pharmacy', name: 'Pharmacy & Meds', color: '#20C997', emoji: '💊', parentId: 'healthcare' },
  { id: 'healthcare-dental', name: 'Dental & Vision', color: '#20C997', emoji: '👓', parentId: 'healthcare' }
];

// Seed Datasets
export const SEED_PROJECTS: Project[] = [
  { id: 'personal-finances', name: 'Personal Finances' },
  { id: 'saas-hackathon', name: 'SaaS Hackathon Project' }
];

export const SEED_CATEGORIES: Record<string, Category[]> = {
  'personal-finances': [
    { id: "salary", name: "Salary", color: "#51CF66", emoji: "💰" },
    { id: "rent", name: "Rent", color: "#4DABF7", emoji: "🏠" },
    { id: "utilities", name: "Utilities", color: "#FCC419", emoji: "⚡" },
    { id: "food", name: "Food", color: "#FF6B6B", emoji: "🍔" },
    { id: "transport", name: "Transport", color: "#845EF7", emoji: "🚗" },
    { id: "entertainment", name: "Entertainment", color: "#FF8787", emoji: "🎬" },
    { id: "healthcare", name: "Healthcare", color: "#20C997", emoji: "🏥" },
    { id: "misc", name: "Miscellaneous", color: "#ADB5BD", emoji: "📦" }
  ],
  'saas-hackathon': [
    { id: "funding", name: "Grants & Funding", color: "#37B24D", emoji: "🏆" },
    { id: "cloud", name: "Cloud Infrastructure", color: "#339AF0", emoji: "☁️" },
    { id: "tools", name: "Domain & SaaS Tools", color: "#E64980", emoji: "🔧" },
    { id: "meals", name: "Team Meals", color: "#FCC419", emoji: "🍕" },
    { id: "marketing", name: "Marketing & Ads", color: "#FF922B", emoji: "📣" }
  ]
};

export const SEED_BUDGETS: Record<string, Budget[]> = {
  'personal-finances': [
    { category: "food", amount: 500 },
    { category: "rent", amount: 1200 },
    { category: "utilities", amount: 200 },
    { category: "transport", amount: 150 },
    { category: "entertainment", amount: 150 },
    { category: "healthcare", amount: 100 },
    { category: "misc", amount: 50 }
  ],
  'saas-hackathon': [
    { category: "cloud", amount: 300 },
    { category: "marketing", amount: 500 },
    { category: "tools", amount: 100 },
    { category: "meals", amount: 200 }
  ]
};

export const SEED_LOCKS: Record<string, MonthlyLock[]> = {
  'personal-finances': [
    { month: "2026-05", locked: true, lockedAt: "2026-06-01T08:00:00.000Z" }
  ],
  'saas-hackathon': []
};

export const SEED_TRANSACTIONS: Record<string, Transaction[]> = {
  'personal-finances': [
    // May 2026 (Locked)
    { id: "pf-tx-may-1", date: "2026-05-01", category: "salary", amount: 4000, type: "income", description: "Monthly Salary", notes: "", labels: ["recurring", "income"], hash: "4819d9b4db70ec2323a6381673801cf9067b84db96c700e408d6d84177d5402a" },
    { id: "pf-tx-may-2", date: "2026-05-01", category: "rent", amount: 1200, type: "expense", description: "Apartment Rental", notes: "", labels: ["recurring", "fixed"], hash: "80cf7503f8a02c525164bcbc9efdb1463e26f8dcf6bf5bcfcd58cfdf12b489d2" },
    { id: "pf-tx-may-3", date: "2026-05-03", category: "utilities", amount: 180, type: "expense", description: "City Electric & Water", notes: "", labels: ["utility"], hash: "78c89ad5dcf023cf85289cbcae67cf7c087cf8bc27cf9cda1098cfd107b1d9c2" },
    { id: "pf-tx-may-4", date: "2026-05-05", category: "food", amount: 75, type: "expense", description: "Whole Foods Groceries", notes: "", labels: ["grocery"], hash: "a873fcd024bcde58cf3a78cfdaef679237cfbc98124efda1097cf09aef82efd9" },
    { id: "pf-tx-may-5", date: "2026-05-08", category: "transport", amount: 25, type: "expense", description: "Uber to Office", notes: "", labels: ["ride-share"], hash: "b7384fc0a927cbcd097cbdf8e8a719c8f0923fde1bda98cef072df91ad09ef8c" },
    { id: "pf-tx-may-6", date: "2026-05-12", category: "food", amount: 45, type: "expense", description: "Sushi Dinner Out", notes: "", labels: ["dining-out"], hash: "c9284fa9cf012bc09dfbc728a7b328109bfcf908deab6bcf01aef9128f9d0c89" },
    { id: "pf-tx-may-7", date: "2026-05-15", category: "entertainment", amount: 15, type: "expense", description: "Netflix Subscription", notes: "", labels: ["subscription"], hash: "d0928f0cb18a09cfbd782cd98fc1a89c09bf87236ab7cde9018e789bcde81c9a" },
    { id: "pf-tx-may-8", date: "2026-05-19", category: "food", amount: 80, type: "expense", description: "Whole Foods Groceries", notes: "", labels: ["grocery"], hash: "e0921ac90bc892a09bcd234190cde098fa874cf02bfca8c909aef092d8cb8cd9" },
    { id: "pf-tx-may-9", date: "2026-05-22", category: "entertainment", amount: 30, type: "expense", description: "Local Movie Night", notes: "", labels: ["leisure"], hash: "f9284ca90bc89de0a9cd2873ab012cde89bf784cf012abcf0927df890bcfc7de" },
    { id: "pf-tx-may-10", date: "2026-05-26", category: "food", amount: 60, type: "expense", description: "Trader Joe's", notes: "", labels: ["grocery"], hash: "012a9bc90ef831d09bcd78a9c0ea18cf09bc87df2bfca87bc907df8cb23dce9a" },
    // June 2026
    { id: "pf-tx-june-1", date: "2026-06-01", category: "salary", amount: 4000, type: "income", description: "Monthly Salary", notes: "", labels: ["recurring", "income"], hash: "12349db4db70ec2323a6381673801cf9067b84db96c700e408d6d84177d5402a" },
    { id: "pf-tx-june-2", date: "2026-06-01", category: "rent", amount: 1200, type: "expense", description: "Apartment Rental", notes: "", labels: ["recurring", "fixed"], hash: "56787503f8a02c525164bcbc9efdb1463e26f8dcf6bf5bcfcd58cfdf12b489d2" },
    { id: "pf-tx-june-3", date: "2026-06-03", category: "utilities", amount: 195, type: "expense", description: "City Electric & Water", notes: "", labels: ["utility"], hash: "34569ad5dcf023cf85289cbcae67cf7c087cf8bc27cf9cda1098cfd107b1d9c2" },
    { id: "pf-tx-june-4", date: "2026-06-05", category: "food", amount: 85, type: "expense", description: "Whole Foods Groceries", notes: "", labels: ["grocery"], hash: "7890fcd024bcde58cf3a78cfdaef679237cfbc98124efda1097cf09aef82efd9" },
    { id: "pf-tx-june-5", date: "2026-06-07", category: "transport", amount: 45, type: "expense", description: "Gas Station Refill", notes: "", labels: ["automotive"], hash: "09124fc0a927cbcd097cbdf8e8a719c8f0923fde1bda98cef072df91ad09ef8c" },
    { id: "pf-tx-june-6", date: "2026-06-10", category: "food", amount: 55, type: "expense", description: "Italian Restaurant Lunch", notes: "", labels: ["dining-out"], hash: "34564fa9cf012bc09dfbc728a7b328109bfcf908deab6bcf01aef9128f9d0c89" },
    { id: "pf-tx-june-7", date: "2026-06-15", category: "entertainment", amount: 15, type: "expense", description: "Netflix Subscription", notes: "", labels: ["subscription"], hash: "78908f0cb18a09cfbd782cd98fc1a89c09bf87236ab7cde9018e789bcde81c9a" },
    { id: "pf-tx-june-8", date: "2026-06-15", category: "healthcare", amount: 120, type: "expense", description: "Dentist Visit Copay", notes: "", labels: ["medical"], hash: "12341ac90bc89a09bcd234190cde098fa874cf02bfca8c909aef092d8cb8cd9" },
    { id: "pf-tx-june-9", date: "2026-06-20", category: "food", amount: 70, type: "expense", description: "Trader Joe's", notes: "", labels: ["grocery"], hash: "56784ca90bc89de0a9cd2873ab012cde89bf784cf012abcf0927df890bcfc7de" },
    { id: "pf-tx-june-10", date: "2026-06-24", category: "entertainment", amount: 90, type: "expense", description: "Summer Fest Music Ticket", notes: "", labels: ["concert"], hash: "90129bc90ef831d09bcd78a9c0ea18cf09bc87df2bfca87bc907df8cb23dce9a" },
    { id: "pf-tx-june-11", date: "2026-06-28", category: "food", amount: 65, type: "expense", description: "Safeway Groceries", notes: "", labels: ["grocery"], hash: "34563ac90bc892a09bcd234190cde098fa874cf02bfca8c909aef092d8cb8cd9" },
    { id: "pf-tx-june-12", date: "2026-06-30", category: "transport", amount: 20, type: "expense", description: "Uber to Airport", notes: "", labels: ["ride-share"], hash: "78902fc0a927cbcd097cbdf8e8a719c8f0923fde1bda98cef072df91ad09ef8c" },
    // July 2026
    { id: "pf-tx-july-1", date: "2026-07-01", category: "salary", amount: 4000, type: "income", description: "Monthly Salary", notes: "", labels: ["recurring", "income"], hash: "90129db4db70ec2323a6381673801cf9067b84db96c700e408d6d84177d5402a" },
    { id: "pf-tx-july-2", date: "2026-07-01", category: "rent", amount: 1200, type: "expense", description: "Apartment Rental", notes: "", labels: ["recurring", "fixed"], hash: "34567503f8a02c525164bcbc9efdb1463e26f8dcf6bf5bcfcd58cfdf12b489d2" },
    { id: "pf-tx-july-3", date: "2026-07-03", category: "utilities", amount: 210, type: "expense", description: "City Electric & Water", notes: "High A/C usage in summer heat", labels: ["utility"], hash: "78909ad5dcf023cf85289cbcae67cf7c087cf8bc27cf9cda1098cfd107b1d9c2" },
    { id: "pf-tx-july-4", date: "2026-07-05", category: "food", amount: 90, type: "expense", description: "Whole Foods Groceries", notes: "", labels: ["grocery"], hash: "1234fcd024bcde58cf3a78cfdaef679237cfbc98124efda1097cf09aef82efd9" },
    { id: "pf-tx-july-5", date: "2026-07-08", category: "transport", amount: 45, type: "expense", description: "Gas Station Refill", notes: "", labels: ["automotive"], hash: "56784fc0a927cbcd097cbdf8e8a719c8f0923fde1bda98cef072df91ad09ef8c" },
    { id: "pf-tx-july-6", date: "2026-07-12", category: "food", amount: 60, type: "expense", description: "Diner Lunch with Family", notes: "", labels: ["dining-out"], hash: "90124fa9cf012bc09dfbc728a7b328109bfcf908deab6bcf01aef9128f9d0c89" },
    { id: "pf-tx-july-7", date: "2026-07-15", category: "entertainment", amount: 15, type: "expense", description: "Netflix Subscription", notes: "", labels: ["subscription"], hash: "34568f0cb18a09cfbd782cd98fc1a89c09bf87236ab7cde9018e789bcde81c9a" },
    { id: "pf-tx-july-8", date: "2026-07-18", category: "food", amount: 75, type: "expense", description: "Trader Joe's", notes: "", labels: ["grocery"], hash: "78901ac90bc892a09bcd234190cde098fa874cf02bfca8c909aef092d8cb8cd9" }
  ],
  'saas-hackathon': [
    // June 2026
    { id: "sh-tx-june-1", date: "2026-06-05", category: "funding", amount: 2000, type: "income", description: "Sponsor Hackathon Grant", notes: "", labels: ["sponsor", "income"], hash: "a1b2c3d4ec70ec2323a6381673801cf9067b84db96c700e408d6d84177d5402a" },
    { id: "sh-tx-june-2", date: "2026-06-06", category: "tools", amount: 15, type: "expense", description: "Domain registration", notes: "Purchased domain on Namecheap", labels: ["domain", "setup"], hash: "b2c3d4e5f8a02c525164bcbc9efdb1463e26f8dcf6bf5bcfcd58cfdf12b489d2" },
    { id: "sh-tx-june-3", date: "2026-06-10", category: "meals", amount: 65, type: "expense", description: "Team Kickoff Lunch", notes: "Pizza & Soda for kickoff brainstorming", labels: ["catering"], hash: "c3d4e5f6dcf023cf85289cbcae67cf7c087cf8bc27cf9cda1098cfd107b1d9c2" },
    { id: "sh-tx-june-4", date: "2026-06-15", category: "marketing", amount: 250, type: "expense", description: "Facebook Ad Campaign", notes: "User acquisition launch test", labels: ["ads"], hash: "d4e5f6g724bcde58cf3a78cfdaef679237cfbc98124efda1097cf09aef82efd9" },
    { id: "sh-tx-june-5", date: "2026-06-18", category: "tools", amount: 20, type: "expense", description: "Vercel Pro Subscription", notes: "Team deployment workspace plan", labels: ["hosting", "subscription"], hash: "e5f6g7h8a927cbcd097cbdf8e8a719c8f0923fde1bda98cef072df91ad09ef8c" },
    { id: "sh-tx-june-6", date: "2026-06-25", category: "meals", amount: 80, type: "expense", description: "Coding Session Dinner", notes: "Thai takeout for late night session", labels: ["catering"], hash: "f6g7h8i9cf012bc09dfbc728a7b328109bfcf908deab6bcf01aef9128f9d0c89" },
    { id: "sh-tx-june-7", date: "2026-06-30", category: "cloud", amount: 85, type: "expense", description: "AWS Infrastructure Costs", notes: "EC2 & RDS instances for dev staging", labels: ["hosting"], hash: "g7h8i9j0b18a09cfbd782cd98fc1a89c09bf87236ab7cde9018e789bcde81c9a" },
    // July 2026
    { id: "sh-tx-july-1", date: "2026-07-02", category: "marketing", amount: 150, type: "expense", description: "Google Retargeting Ads", notes: "AdWords campaign for active users", labels: ["ads"], hash: "h8i9j0k10bc892a09bcd234190cde098fa874cf02bfca8c909aef092d8cb8cd9" },
    { id: "sh-tx-july-2", date: "2026-07-05", category: "meals", amount: 75, type: "expense", description: "Team Status Lunch", notes: "Weekly sync up meals", labels: ["catering"], hash: "i9j0k1l20bc89de0a9cd2873ab012cde89bf784cf012abcf0927df890bcfc7de" },
    { id: "sh-tx-july-3", date: "2026-07-10", category: "cloud", amount: 120, type: "expense", description: "AWS Infrastructure Costs", notes: "Increased RDS capacity due to user signups", labels: ["hosting"], hash: "j0k1l2m30ef831d09bcd78a9c0ea18cf09bc87df2bfca87bc907df8cb23dce9a" },
    { id: "sh-tx-july-4", date: "2026-07-18", category: "tools", amount: 20, type: "expense", description: "Vercel Pro Subscription", notes: "Team workspace monthly fee", labels: ["hosting", "subscription"], hash: "k1l2m3n40bc892a09bcd234190cde098fa874cf02bfca8c909aef092d8cb8cd9" }
  ]
};

export class LocalStorageAdapter implements StorageAdapter {
  constructor() {
    this.ensureInitialized();
  }

  private ensureInitialized(): void {
    try {
      const projectsRaw = localStorage.getItem('expense_projects');
      if (projectsRaw === null) {
        this.seedMockDatabase();
        return;
      }
      try {
        const parsed = JSON.parse(projectsRaw);
        if (!Array.isArray(parsed)) {
          localStorage.setItem(`expense_corrupt_backup_${Date.now()}`, projectsRaw);
          localStorage.setItem('expense_projects', '[]');
          localStorage.setItem('expense_corrupt_recovered', 'true');
        } else {
          parsed.forEach((proj: Project) => {
            if (!proj || !proj.id) return;
            if (localStorage.getItem(`expense_locks_${proj.id}`) === null) {
              localStorage.setItem(`expense_locks_${proj.id}`, JSON.stringify([]));
            }
          });
        }
      } catch (parseError) {
        console.error('Local storage data corrupted, backing up without wiping data keys:', parseError);
        localStorage.setItem(`expense_corrupt_backup_${Date.now()}`, projectsRaw);
        localStorage.setItem('expense_projects', '[]');
        localStorage.setItem('expense_corrupt_recovered', 'true');
      }
    } catch (error) {
      console.error('Failed to initialize local storage:', error);
    }
  }

  private seedMockDatabase(): void {
    try {
      localStorage.setItem('expense_projects', JSON.stringify(SEED_PROJECTS));

      SEED_PROJECTS.forEach(project => {
        localStorage.setItem(`expense_categories_${project.id}`, JSON.stringify(SEED_CATEGORIES[project.id]));
        localStorage.setItem(`expense_budgets_${project.id}`, JSON.stringify(SEED_BUDGETS[project.id]));
        localStorage.setItem(`expense_txs_${project.id}`, JSON.stringify(SEED_TRANSACTIONS[project.id]));
        localStorage.setItem(`expense_locks_${project.id}`, JSON.stringify(SEED_LOCKS[project.id]));
      });
    } catch (e) {
      console.error('Failed to seed local storage database:', e);
    }
  }

  async getProjects(): Promise<Project[]> {
    const raw = localStorage.getItem('expense_projects');
    if (!raw) return [];
    try {
      return JSON.parse(raw);
    } catch (e) {
      console.error('Failed to parse projects:', e);
      localStorage.removeItem('expense_projects');
      return [];
    }
  }

  async createProject(name: string): Promise<Project> {
    const projects = await this.getProjects();
    const baseId = name.toLowerCase().replace(/[^a-z0-9]/g, '-') || Math.random().toString(36).substring(2, 9);
    let newId = baseId;
    let suffix = 1;
    while (projects.some(p => p.id === newId)) {
      newId = `${baseId}-${suffix}`;
      suffix++;
    }
    const newProject: Project = {
      id: newId,
      name,
    };
    projects.push(newProject);
    try {
      localStorage.setItem('expense_projects', JSON.stringify(projects));
      
      // Seed default categories and empty tables for new project
      localStorage.setItem(`expense_categories_${newProject.id}`, JSON.stringify(DEFAULT_CATEGORIES));
      localStorage.setItem(`expense_budgets_${newProject.id}`, JSON.stringify([]));
      localStorage.setItem(`expense_txs_${newProject.id}`, JSON.stringify([]));
      localStorage.setItem(`expense_locks_${newProject.id}`, JSON.stringify([]));
    } catch (e) {
      throw new Error('Local storage quota exceeded. Unable to create project.');
    }

    return newProject;
  }

  async saveProject(project: Project): Promise<Project> {
    const projects = await this.getProjects();
    const idx = projects.findIndex(p => p.id === project.id);
    if (idx >= 0) {
      projects[idx] = project;
    } else {
      projects.push(project);
    }
    try {
      localStorage.setItem('expense_projects', JSON.stringify(projects));
    } catch (e) {
      throw new Error('Local storage quota exceeded. Unable to save project.');
    }
    return project;
  }

  async shareProject(projectId: string, email: string): Promise<Project> {
    const projects = await this.getProjects();
    const targetProject = projects.find(p => p.id === projectId);
    if (!targetProject) throw new Error("Project not found");

    const updatedCollaborators = Array.from(new Set([...(targetProject.collaborators || []), email]));
    const updatedProject = { ...targetProject, collaborators: updatedCollaborators };
    return this.saveProject(updatedProject);
  }

  async deleteProject(projectId: string): Promise<void> {
    const projects = await this.getProjects();
    const filtered = projects.filter(p => p.id !== projectId);
    localStorage.setItem('expense_projects', JSON.stringify(filtered));
    localStorage.removeItem(`expense_txs_${projectId}`);
    localStorage.removeItem(`expense_categories_${projectId}`);
    localStorage.removeItem(`expense_budgets_${projectId}`);
    localStorage.removeItem(`expense_locks_${projectId}`);
    localStorage.removeItem(`expense_budget_notes_${projectId}`);
    localStorage.removeItem(`expense_deleted_categories_${projectId}`);
    localStorage.removeItem(`expense_category_defaults_${projectId}`);
  }

  async getTransactions(projectId: string): Promise<Transaction[]> {
    const raw = localStorage.getItem(`expense_txs_${projectId}`);
    if (!raw) return [];
    try {
      const parsed: Transaction[] = JSON.parse(raw);
      let needsRepair = false;
      for (const t of parsed) {
        if (!t.hash) {
          t.hash = `${t.date}|${(t.description || '').trim().toLowerCase()}|${Number(t.amount).toFixed(2)}|${(t.type || '').trim().toLowerCase()}`;
          needsRepair = true;
        }
        if (!Array.isArray(t.labels)) {
          const rawL: unknown = t.labels;
          if (typeof rawL === 'string' && rawL.trim()) {
            try {
              const parsedL = JSON.parse(rawL);
              t.labels = Array.isArray(parsedL) ? parsedL : [rawL.trim()];
            } catch {
              t.labels = [rawL.trim()];
            }
          } else {
            t.labels = [];
          }
          needsRepair = true;
        }
        if (t.notes === undefined) {
          t.notes = '';
          needsRepair = true;
        }
      }
      if (needsRepair) {
        localStorage.setItem(`expense_txs_${projectId}`, JSON.stringify(parsed));
      }
      return parsed;
    } catch (e) {
      console.error(`Failed to parse transactions for project ${projectId}:`, e);
      return [];
    }
  }

  private ensureProjectsRestored(): void {
    if (!localStorage.getItem('expense_projects')) {
      localStorage.setItem('expense_projects', '[]');
    }
  }

  async saveTransaction(projectId: string, transaction: Transaction, options?: StorageWriteOptions): Promise<Transaction> {
    this.ensureProjectsRestored();
    const transactions = await this.getTransactions(projectId);
    const existingIndex = transactions.findIndex(t => t.id === transaction.id);

    if (!options?.ignoreLocks) {
      // Enforce lock check on target date's month
      const locks = await this.getLocks(projectId);
      const txMonth = transaction.date.substring(0, 7); // YYYY-MM
      const isLocked = locks.some(lock => lock.month === txMonth && lock.locked);
      if (isLocked) {
        throw new Error(`Cannot write to locked month (${txMonth} is locked)`);
      }

      if (existingIndex > -1) {
        const originalTx = transactions[existingIndex];
        const originalMonth = originalTx.date.substring(0, 7);
        const isOriginalLocked = locks.some(lock => lock.month === originalMonth && lock.locked);
        if (isOriginalLocked) {
          throw new Error(`Cannot modify transaction. The original month ${originalMonth} is locked.`);
        }
      }
    }

    if (existingIndex > -1) {
      transactions[existingIndex] = transaction;
    } else {
      if (!transaction.id) {
        transaction.id = crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36).substring(2, 9);
      }
      transactions.push(transaction);
    }
    try {
      localStorage.setItem(`expense_txs_${projectId}`, JSON.stringify(transactions));
    } catch (e) {
      throw new Error('Local storage quota exceeded. Unable to save transaction.');
    }
    return transaction;
  }

  async saveTransactions(projectId: string, newTransactions: Transaction[], options?: StorageWriteOptions): Promise<Transaction[]> {
    const transactions = await this.getTransactions(projectId);

    if (!options?.ignoreLocks) {
      const locks = await this.getLocks(projectId);
      // Pre-validate all locks before mutating transactions array
      for (const transaction of newTransactions) {
        const txnMonth = transaction.date.substring(0, 7);
        const isTargetLocked = locks.some(lock => lock.month === txnMonth && lock.locked);
        if (isTargetLocked) {
          throw new Error(`Cannot write to locked month ${txnMonth}`);
        }

        const existingIndex = transactions.findIndex(t => t.id === transaction.id);
        if (existingIndex > -1) {
          const originalTx = transactions[existingIndex];
          const originalMonth = originalTx.date.substring(0, 7);
          const isOriginalLocked = locks.some(lock => lock.month === originalMonth && lock.locked);
          if (isOriginalLocked) {
            throw new Error(`Cannot modify transaction. The original month ${originalMonth} is locked.`);
          }
        }
      }
    }

    // Apply mutations after lock validation passes for all items
    for (const transaction of newTransactions) {
      if (!transaction.id) {
        transaction.id = crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36).substring(2, 9);
      }

      const existingIndex = transactions.findIndex(t => t.id === transaction.id);
      if (existingIndex > -1) {
        transactions[existingIndex] = transaction;
      } else {
        transactions.push(transaction);
      }
    }

    try {
      localStorage.setItem(`expense_txs_${projectId}`, JSON.stringify(transactions));
    } catch (e) {
      throw new Error('Local storage quota exceeded. Unable to save transactions.');
    }
    return newTransactions;
  }

  async deleteTransaction(projectId: string, transactionId: string, options?: StorageWriteOptions): Promise<void> {
    const transactions = await this.getTransactions(projectId);
    const txIndex = transactions.findIndex(t => t.id === transactionId);
    if (txIndex === -1) return;

    if (!options?.ignoreLocks) {
      const locks = await this.getLocks(projectId);
      const txMonth = transactions[txIndex].date.substring(0, 7);
      const isLocked = locks.some(lock => lock.month === txMonth && lock.locked);
      if (isLocked) {
        throw new Error(`Cannot delete transaction. The month ${txMonth} is locked.`);
      }
    }

    transactions.splice(txIndex, 1);
    try {
      localStorage.setItem(`expense_txs_${projectId}`, JSON.stringify(transactions));
    } catch (e) {
      throw new Error('Local storage quota exceeded. Unable to delete transaction.');
    }
  }

  async deleteTransactions(projectId: string, transactionIds: string[], options?: StorageWriteOptions): Promise<void> {
    if (transactionIds.length === 0) return;
    const transactions = await this.getTransactions(projectId);
    const idSet = new Set(transactionIds);

    if (!options?.ignoreLocks) {
      const locks = await this.getLocks(projectId);
      for (const t of transactions) {
        if (idSet.has(t.id)) {
          const txMonth = t.date.substring(0, 7);
          const isLocked = locks.some(lock => lock.month === txMonth && lock.locked);
          if (isLocked) {
            throw new Error(`Cannot delete transaction. The month ${txMonth} is locked.`);
          }
        }
      }
    }

    const filtered = transactions.filter(t => !idSet.has(t.id));
    try {
      localStorage.setItem(`expense_txs_${projectId}`, JSON.stringify(filtered));
    } catch (e) {
      throw new Error('Local storage quota exceeded. Unable to delete transactions.');
    }
  }

  async getBudgets(projectId: string): Promise<Budget[]> {
    const raw = localStorage.getItem(`expense_budgets_${projectId}`);
    if (!raw) return [];
    try {
      return JSON.parse(raw);
    } catch (e) {
      console.error(`Failed to parse budgets for project ${projectId}:`, e);
      return [];
    }
  }

  async saveBudgets(projectId: string, budgets: Budget[]): Promise<void> {
    try {
      localStorage.setItem(`expense_budgets_${projectId}`, JSON.stringify(budgets));
    } catch (e) {
      throw new Error('Local storage quota exceeded. Unable to save budgets.');
    }
  }

  async getLocks(projectId: string): Promise<MonthlyLock[]> {
    const raw = localStorage.getItem(`expense_locks_${projectId}`);
    if (!raw) return [];
    try {
      return JSON.parse(raw);
    } catch (e) {
      console.error(`Failed to parse locks for project ${projectId}:`, e);
      return [];
    }
  }

  async saveLock(projectId: string, lock: MonthlyLock): Promise<void> {
    const locks = await this.getLocks(projectId);
    const existingIndex = locks.findIndex(l => l.month === lock.month);
    if (existingIndex > -1) {
      locks[existingIndex] = lock;
    } else {
      locks.push(lock);
    }
    try {
      localStorage.setItem(`expense_locks_${projectId}`, JSON.stringify(locks));
    } catch (e) {
      throw new Error('Local storage quota exceeded. Unable to save lock.');
    }
  }

  async getBudgetNotes(projectId: string): Promise<Record<string, BudgetNote>> {
    const raw = localStorage.getItem(`expense_budget_notes_${projectId}`);
    if (!raw) return {};
    try {
      const parsed: Record<string, BudgetNote> = JSON.parse(raw);
      return Object.fromEntries(Object.entries(parsed).filter(([k]) => !k.startsWith('__meta_')));
    } catch (e) {
      console.error(`Failed to parse budget notes for project ${projectId}:`, e);
      return {};
    }
  }

  async saveBudgetNote(projectId: string, key: string, note: BudgetNote): Promise<void> {
    const notes = await this.getBudgetNotes(projectId);
    notes[key] = note;
    try {
      localStorage.setItem(`expense_budget_notes_${projectId}`, JSON.stringify(notes));
    } catch (e) {
      throw new Error('Local storage quota exceeded. Unable to save budget note.');
    }
  }

  async deleteBudgetNote(projectId: string, key: string): Promise<void> {
    const notes = await this.getBudgetNotes(projectId);
    delete notes[key];
    try {
      localStorage.setItem(`expense_budget_notes_${projectId}`, JSON.stringify(notes));
    } catch (e) {
      throw new Error('Local storage quota exceeded. Unable to delete budget note.');
    }
  }

  async getIngestState(projectId: string): Promise<IngestState> {
    const raw = localStorage.getItem(`expense_ingest_state_${projectId}`);
    if (!raw) return { version: 1, tombstones: [], sources: {}, recentRuns: [] };
    try {
      const parsed = JSON.parse(raw);
      const tombstones = Array.isArray(parsed?.tombstones)
        ? parsed.tombstones
        : parsed?.tombstones && typeof parsed.tombstones === 'object'
        ? Object.keys(parsed.tombstones)
        : [];
      return {
        version: parsed?.version || 1,
        tombstones,
        sources: parsed?.sources && typeof parsed.sources === 'object' ? parsed.sources : {},
        recentRuns: Array.isArray(parsed?.recentRuns)
          ? parsed.recentRuns
          : Array.isArray(parsed?.runs)
          ? parsed.runs
          : [],
      };
    } catch {
      return { version: 1, tombstones: [], sources: {}, recentRuns: [] };
    }
  }

  async saveIngestState(projectId: string, state: IngestState): Promise<void> {
    const tombstones = Array.isArray(state.tombstones)
      ? state.tombstones.slice(-2000)
      : state.tombstones && typeof state.tombstones === 'object'
      ? Object.keys(state.tombstones).slice(-2000)
      : [];
    const trimmed: IngestState = {
      version: state.version || 1,
      tombstones,
      sources: state.sources || {},
      recentRuns: Array.isArray(state.recentRuns) ? state.recentRuns.slice(-50) : [],
    };
    localStorage.setItem(`expense_ingest_state_${projectId}`, JSON.stringify(trimmed));
  }

  async commitIngestBatch(
    projectId: string,
    payload: {
      upserts: Transaction[];
      deleteIds: string[];
      ingestState: IngestState;
    },
    options?: StorageWriteOptions
  ): Promise<void> {
    const prevTxsRaw = localStorage.getItem(`expense_txs_${projectId}`);
    const transactions = await this.getTransactions(projectId);
    const deleteSet = new Set(payload.deleteIds);

    if (!options?.ignoreLocks) {
      const locks = await this.getLocks(projectId);
      for (const transaction of payload.upserts) {
        const txnMonth = transaction.date.substring(0, 7);
        if (locks.some(lock => lock.month === txnMonth && lock.locked)) {
          throw new Error(`Cannot write to locked month ${txnMonth}`);
        }
      }
      for (const t of transactions) {
        if (deleteSet.has(t.id)) {
          const txMonth = t.date.substring(0, 7);
          if (locks.some(lock => lock.month === txMonth && lock.locked)) {
            throw new Error(`Cannot delete transaction. The month ${txMonth} is locked.`);
          }
        }
      }
    }

    const nextTxs = [...transactions];
    for (const tx of payload.upserts) {
      const copy = { ...tx };
      if (!copy.id) {
        copy.id = crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36).substring(2, 9);
      }
      const idx = nextTxs.findIndex(t => t.id === copy.id);
      if (idx > -1) {
        nextTxs[idx] = copy;
      } else {
        nextTxs.push(copy);
      }
    }
    const finalTxs = deleteSet.size > 0 ? nextTxs.filter(t => !deleteSet.has(t.id)) : nextTxs;

    try {
      if (payload.upserts.length > 0 || payload.deleteIds.length > 0) {
        localStorage.setItem(`expense_txs_${projectId}`, JSON.stringify(finalTxs));
      }
      await this.saveIngestState(projectId, payload.ingestState);
    } catch (err) {
      // Roll back transactions if ingest state write failed
      if (prevTxsRaw === null) {
        localStorage.removeItem(`expense_txs_${projectId}`);
      } else {
        localStorage.setItem(`expense_txs_${projectId}`, prevTxsRaw);
      }
      throw err;
    }
  }

  invalidateCache(_projectId?: string): void {
    // LocalStorageAdapter reads directly from storage on each call
  }

  async getCategories(projectId: string): Promise<Category[]> {
    const raw = localStorage.getItem(`expense_categories_${projectId}`);
    const deletedRaw = localStorage.getItem(`expense_deleted_categories_${projectId}`);
    const deletedIds = new Set<string>(deletedRaw ? JSON.parse(deletedRaw) : []);

    if (!raw) {
      return DEFAULT_CATEGORIES.filter(c => !deletedIds.has(c.id));
    }
    try {
      const stored: Category[] = JSON.parse(raw);
      const map = new Map<string, Category>();
      DEFAULT_CATEGORIES.forEach(c => {
        if (!deletedIds.has(c.id)) {
          map.set(c.id, c);
        }
      });
      stored.forEach(c => {
        if (!deletedIds.has(c.id)) {
          map.set(c.id, c);
        }
      });
      return Array.from(map.values());
    } catch (e) {
      console.error(`Failed to parse categories for project ${projectId}:`, e);
      return DEFAULT_CATEGORIES.filter(c => !deletedIds.has(c.id));
    }
  }

  async saveCategory(projectId: string, category: Category): Promise<Category> {
    const categories = await this.getCategories(projectId);
    if (!category.id) {
      category.id = category.name.toLowerCase().replace(/[^a-z0-9]/g, '-');
    }
    const existingIndex = categories.findIndex(c => c.id === category.id);
    if (existingIndex > -1) {
      categories[existingIndex] = category;
    } else {
      categories.push(category);
    }
    try {
      localStorage.setItem(`expense_categories_${projectId}`, JSON.stringify(categories));
      const deletedRaw = localStorage.getItem(`expense_deleted_categories_${projectId}`);
      if (deletedRaw) {
        try {
          const parsedDeleted = JSON.parse(deletedRaw);
          if (Array.isArray(parsedDeleted) && parsedDeleted.includes(category.id)) {
            const nextDeleted = parsedDeleted.filter((id: string) => id !== category.id);
            localStorage.setItem(`expense_deleted_categories_${projectId}`, JSON.stringify(nextDeleted));
          }
        } catch {
          // Ignore malformed deleted categories list
        }
      }
    } catch (e) {
      throw new Error('Local storage quota exceeded. Unable to save category.');
    }
    return category;
  }

  async deleteCategory(projectId: string, categoryId: string): Promise<void> {
    const categories = await this.getCategories(projectId);
    const filtered = categories.filter(c => c.id !== categoryId);
    try {
      localStorage.setItem(`expense_categories_${projectId}`, JSON.stringify(filtered));
      const deletedRaw = localStorage.getItem(`expense_deleted_categories_${projectId}`);
      const deletedIds = new Set<string>(deletedRaw ? JSON.parse(deletedRaw) : []);
      deletedIds.add(categoryId);
      localStorage.setItem(`expense_deleted_categories_${projectId}`, JSON.stringify(Array.from(deletedIds)));
    } catch (e) {
      throw new Error('Local storage quota exceeded. Unable to delete category.');
    }
  }
}

export class GoogleSheetsAdapter implements StorageAdapter {
  private getToken: () => string | null;
  private onAuthError?: (status: number) => void;

  // In-memory cache for fast reads
  private projectsCache: Project[] | null = null;
  private cache: Record<string, {
    transactions: Transaction[];
    categories: Category[];
    budgets: Budget[];
    locks: MonthlyLock[];
    notes: Record<string, BudgetNote>;
  }> = {};
  private writeQueues: Record<string, Promise<unknown>> = {};
  private sheetRowCounts: Record<string, number> = {};

  constructor(getToken: () => string | null, onAuthError?: (status: number) => void) {
    this.getToken = getToken;
    this.onAuthError = onAuthError;
  }

  private enqueueWrite<T>(projectId: string, task: () => Promise<T>): Promise<T> {
    const prev = this.writeQueues[projectId] ?? Promise.resolve();
    const next = prev.catch(() => {}).then(task);
    this.writeQueues[projectId] = next;
    return next;
  }

  private async fetchApi(url: string, options: RequestInit = {}) {
    const token = this.getToken();
    if (!token) throw new Error('Not authenticated');
    const headers = new Headers(options.headers || {});
    headers.set('Authorization', `Bearer ${token}`);
    if (!headers.has('Content-Type') && options.method !== 'GET') {
      headers.set('Content-Type', 'application/json');
    }
    const response = await fetch(url, { ...options, headers });
    if (!response.ok) {
      if (response.status === 401) {
        this.onAuthError?.(401);
      }
      const errorText = await response.text();
      throw new Error(`API Error ${response.status}: ${errorText}`);
    }
    const text = await response.text();
    return text ? JSON.parse(text) : {};
  }

  async getProjects(): Promise<Project[]> {
    if (this.projectsCache) return this.projectsCache;
    
    const raw = localStorage.getItem('expense_google_projects');
    const localProjects: Project[] = raw ? JSON.parse(raw) : [];

    // Optionally check Drive API to discover lost spreadsheets
    try {
      const driveRes = await this.fetchApi("https://www.googleapis.com/drive/v3/files?q=name+contains+'Nebula+Expense'+and+mimeType='application/vnd.google-apps.spreadsheet'&fields=files(id,name)");
      const driveFiles = driveRes.files || [];
      
      let changed = false;
      for (const file of driveFiles) {
        const projName = file.name.replace('Nebula Expense - ', '').trim();
        if (!localProjects.find(p => p.spreadsheetId === file.id)) {
          localProjects.push({
            id: file.id,
            name: projName,
            spreadsheetId: file.id
          });
          changed = true;
        }
      }
      if (changed) {
        localStorage.setItem('expense_google_projects', JSON.stringify(localProjects));
      }
    } catch (e) {
      console.warn("Drive discovery failed:", e);
    }
    
    this.projectsCache = localProjects;
    return localProjects;
  }

  async createProject(name: string): Promise<Project> {
    const spreadsheet = await this.fetchApi('https://sheets.googleapis.com/v4/spreadsheets', {
      method: 'POST',
      body: JSON.stringify({
        properties: { title: `Nebula Expense - ${name}` },
        sheets: [
          { properties: { title: 'Transactions' } },
          { properties: { title: 'Categories' } },
          { properties: { title: 'Budgets' } },
          { properties: { title: 'Locks' } },
          { properties: { title: 'Notes' } }
        ]
      })
    });

    const newProject: Project = {
      id: spreadsheet.spreadsheetId,
      name,
      spreadsheetId: spreadsheet.spreadsheetId
    };

    const projects = await this.getProjects();
    projects.push(newProject);
    this.projectsCache = projects;
    localStorage.setItem('expense_google_projects', JSON.stringify(projects));

    this.cache[newProject.id] = {
      transactions: [],
      categories: [...DEFAULT_CATEGORIES],
      budgets: [],
      locks: [],
      notes: {}
    };
    
    await this.saveCategoriesToSheet(newProject.id, this.cache[newProject.id].categories);
    return newProject;
  }

  async saveProject(project: Project): Promise<Project> {
    const projects = await this.getProjects();
    const idx = projects.findIndex(p => p.id === project.id);
    if (idx >= 0) projects[idx] = project;
    else projects.push(project);
    this.projectsCache = projects;
    localStorage.setItem('expense_google_projects', JSON.stringify(projects));
    return project;
  }

  async shareProject(projectId: string, email: string): Promise<Project> {
    const projects = await this.getProjects();
    const targetProject = projects.find(p => p.id === projectId);
    if (!targetProject) throw new Error("Project not found");

    const spreadsheetId = targetProject.spreadsheetId || projectId;
    try {
      await this.fetchApi(`https://www.googleapis.com/drive/v3/files/${spreadsheetId}/permissions`, {
        method: 'POST',
        body: JSON.stringify({
          role: 'writer',
          type: 'user',
          emailAddress: email
        })
      });
    } catch (e: unknown) {
      console.error("Failed to grant Google Drive file permission:", e);
      throw new Error(`Google Drive permission error: ${e instanceof Error ? e.message : 'Unable to share Google Sheet with ' + email}`);
    }

    const updatedCollaborators = Array.from(new Set([...(targetProject.collaborators || []), email]));
    const updatedProject = { ...targetProject, collaborators: updatedCollaborators };
    return this.saveProject(updatedProject);
  }

  async deleteProject(projectId: string): Promise<void> {
    const projects = await this.getProjects();
    const targetProject = projects.find(p => p.id === projectId);
    const updatedProjects = projects.filter(p => p.id !== projectId);

    this.projectsCache = updatedProjects;
    localStorage.setItem('expense_google_projects', JSON.stringify(updatedProjects));
    delete this.cache[projectId];

    if (targetProject?.spreadsheetId) {
      try {
        await this.fetchApi(`https://www.googleapis.com/drive/v3/files/${targetProject.spreadsheetId}`, {
          method: 'DELETE'
        });
      } catch (e: unknown) {
        console.warn("Failed to delete Google Drive file:", e);
      }
    }
  }

  invalidateCache(projectId?: string): void {
    if (projectId) {
      delete this.cache[projectId];
    } else {
      this.cache = {};
      this.projectsCache = null;
    }
  }

  private async ensureCache(projectId: string) {
    if (this.cache[projectId]) return;
    const project = (await this.getProjects()).find(p => p.id === projectId);
    if (!project || !project.spreadsheetId) throw new Error("Project not found or missing spreadsheet ID");

    const parseJSON = (str: string) => { try { return JSON.parse(str); } catch { return str; } };

    let valueRanges: Array<{ values?: (string | number | boolean)[][] }> = [];
    try {
      const res = await this.fetchApi(`https://sheets.googleapis.com/v4/spreadsheets/${project.spreadsheetId}/values:batchGet?ranges=Transactions!A:L&ranges=Categories!A:E&ranges=Budgets!A:B&ranges=Locks!A:C&ranges=Notes!A:B`);
      valueRanges = res.valueRanges || [];
    } catch {
      // Fallback if Notes tab doesn't exist yet
      const res = await this.fetchApi(`https://sheets.googleapis.com/v4/spreadsheets/${project.spreadsheetId}/values:batchGet?ranges=Transactions!A:L&ranges=Categories!A:E&ranges=Budgets!A:B&ranges=Locks!A:C`);
      valueRanges = res.valueRanges || [];
    }

    const txRows = valueRanges[0]?.values || [];
    const catRows = valueRanges[1]?.values || [];
    const bgRows = valueRanges[2]?.values || [];
    const lockRows = valueRanges[3]?.values || [];
    const noteRows = valueRanges[4]?.values || [];

    this.sheetRowCounts[`${projectId}:Transactions!A:L`] = txRows.length;
    this.sheetRowCounts[`${projectId}:Categories!A:E`] = catRows.length;
    this.sheetRowCounts[`${projectId}:Budgets!A:B`] = bgRows.length;
    this.sheetRowCounts[`${projectId}:Locks!A:C`] = lockRows.length;
    this.sheetRowCounts[`${projectId}:Notes!A:B`] = noteRows.length;

    const transactions: Transaction[] = txRows.slice(1).map((r: (string | number | boolean)[]) => {
      const rawL = parseJSON(String(r[8] || '[]'));
      let labels: string[] = [];
      if (Array.isArray(rawL)) {
        labels = rawL.map(s => String(s).trim()).filter(Boolean);
      } else if (typeof rawL === 'string' && rawL.trim()) {
        labels = [rawL.trim()];
      }
      const rawBucket = String(r[10] || '');
      const validBucket: SpendingBucket | undefined = (rawBucket === 'fixed' || rawBucket === 'flexible' || rawBucket === 'non-monthly') ? rawBucket : undefined;
      let meta: TxMeta | undefined;
      if (r[11]) {
        const parsedMeta = parseJSON(String(r[11]));
        if (parsedMeta && typeof parsedMeta === 'object' && !Array.isArray(parsedMeta)) {
          meta = parsedMeta as TxMeta;
        }
      }
      return {
        id: String(r[0]),
        date: String(r[1]),
        category: String(r[2]),
        subCategory: r[3] ? String(r[3]) : null,
        amount: parseFloat(String(r[4])),
        type: String(r[5]) as 'income' | 'expense' | 'transfer',
        description: String(r[6]),
        notes: String(r[7] || ''),
        labels,
        hash: String(r[9] || ''),
        spendingBucket: validBucket,
        ...(meta ? { meta } : {})
      };
    }).filter((t: Transaction) => t.id);

    const notes: Record<string, BudgetNote> = {};
    noteRows.slice(1).forEach((r: (string | number | boolean)[]) => {
      if (r[0]) {
        try {
          notes[String(r[0])] = JSON.parse(String(r[1]));
        } catch {
          notes[String(r[0])] = { text: String(r[1] || ''), updatedAt: new Date().toISOString() };
        }
      }
    });

    let deletedDefaultIds = new Set<string>();
    if (notes['__meta_deleted_categories__']?.text) {
      try {
        const parsed = JSON.parse(notes['__meta_deleted_categories__'].text);
        if (Array.isArray(parsed)) {
          deletedDefaultIds = new Set(parsed);
        }
      } catch {
        // Fallback if metadata notes cannot be parsed
      }
    }

    const parsedCats: Category[] = catRows.slice(1).map((r: (string | number | boolean)[]) => ({
      id: String(r[0]), name: String(r[1]), color: String(r[2]), emoji: String(r[3]), parentId: r[4] ? String(r[4]) : null
    })).filter((c: Category) => c.id);
    
    const catMap = new Map<string, Category>();
    DEFAULT_CATEGORIES.forEach(c => {
      if (!deletedDefaultIds.has(c.id)) {
        catMap.set(c.id, c);
      }
    });
    parsedCats.forEach(c => {
      if (!deletedDefaultIds.has(c.id)) {
        catMap.set(c.id, c);
      }
    });
    const categories: Category[] = Array.from(catMap.values());

    const budgets: Budget[] = bgRows.slice(1).map((r: (string | number | boolean)[]) => ({
      category: String(r[0]), amount: parseFloat(String(r[1]))
    })).filter((b: Budget) => b.category);

    const locks: MonthlyLock[] = lockRows.slice(1).map((r: (string | number | boolean)[]) => ({
      month: String(r[0]), locked: r[1] === 'true' || r[1] === 'TRUE', lockedAt: r[2] ? String(r[2]) : undefined
    })).filter((l: MonthlyLock) => l.month);

    this.cache[projectId] = { transactions, categories, budgets, locks, notes };
  }

  private async writeSheet(projectId: string, range: string, values: (string | number | boolean)[][]) {
    const project = (await this.getProjects()).find(p => p.id === projectId);
    if (!project || !project.spreadsheetId) throw new Error("Project not found");

    const sheetName = range.split('!')[0];
    const colPart = range.split('!')[1] || 'A:Z';
    const [startCol, endCol] = colPart.split(':');
    const rangeKey = `${projectId}:${sheetName}!${startCol}:${endCol || startCol}`;
    const prevCount = this.sheetRowCounts[rangeKey] ?? 0;

    // 1. Write data using PUT with valueInputOption=RAW
    if (values.length > 0) {
      const putRange = `${sheetName}!${startCol}1:${endCol || startCol}${values.length}`;
      await this.fetchApi(`https://sheets.googleapis.com/v4/spreadsheets/${project.spreadsheetId}/values/${putRange}?valueInputOption=RAW`, {
        method: 'PUT',
        body: JSON.stringify({ values })
      });
    }

    // 2. Clear any trailing rows when row count decreased, surfacing any HTTP failure
    if (prevCount > values.length) {
      const clearRange = `${sheetName}!${startCol}${values.length + 1}:${endCol || startCol}${prevCount}`;
      await this.fetchApi(`https://sheets.googleapis.com/v4/spreadsheets/${project.spreadsheetId}/values/${encodeURIComponent(clearRange)}:clear`, {
        method: 'POST'
      });
    }

    this.sheetRowCounts[rangeKey] = values.length;
  }

  private async saveTransactionsToSheet(projectId: string, txs: Transaction[]) {
    const header = ['id', 'date', 'category', 'subCategory', 'amount', 'type', 'description', 'notes', 'labels', 'hash', 'spendingBucket', 'meta'];
    const rows = txs.map(t => [
      t.id,
      t.date,
      t.category,
      t.subCategory || '',
      t.amount,
      t.type,
      t.description,
      t.notes,
      JSON.stringify(t.labels),
      t.hash,
      t.spendingBucket || '',
      t.meta ? JSON.stringify(t.meta) : ''
    ]);
    await this.writeSheet(projectId, 'Transactions!A:L', [header, ...rows]);
  }

  private async saveCategoriesToSheet(projectId: string, cats: Category[]) {
    const header = ['id', 'name', 'color', 'emoji', 'parentId'];
    const rows = cats.map(c => [c.id, c.name, c.color, c.emoji, c.parentId || '']);
    await this.writeSheet(projectId, 'Categories!A:E', [header, ...rows]);
  }

  private async saveBudgetsToSheet(projectId: string, budgets: Budget[]) {
    const header = ['category', 'amount'];
    const rows = budgets.map(b => [b.category, b.amount]);
    await this.writeSheet(projectId, 'Budgets!A:B', [header, ...rows]);
  }

  private async saveLocksToSheet(projectId: string, locks: MonthlyLock[]) {
    const header = ['month', 'locked', 'lockedAt'];
    const rows = locks.map(l => [l.month, String(l.locked), l.lockedAt || '']);
    await this.writeSheet(projectId, 'Locks!A:C', [header, ...rows]);
  }

  async getTransactions(projectId: string): Promise<Transaction[]> {
    await this.ensureCache(projectId);
    return [...this.cache[projectId].transactions];
  }

  async saveTransaction(projectId: string, transaction: Transaction, options?: StorageWriteOptions): Promise<Transaction> {
    return this.enqueueWrite(projectId, async () => {
      await this.ensureCache(projectId);
      const nextTxs = [...this.cache[projectId].transactions];
      const idx = nextTxs.findIndex(t => t.id === transaction.id);

      if (!options?.ignoreLocks) {
        const locks = await this.getLocks(projectId);
        const txnMonth = transaction.date.substring(0, 7);
        const isTargetLocked = locks.some(lock => lock.month === txnMonth && lock.locked);
        if (isTargetLocked) {
          throw new Error(`Cannot write to locked month ${txnMonth}`);
        }

        if (idx > -1) {
          const originalTx = nextTxs[idx];
          const originalMonth = originalTx.date.substring(0, 7);
          const isOriginalLocked = locks.some(lock => lock.month === originalMonth && lock.locked);
          if (isOriginalLocked) {
            throw new Error(`Cannot modify transaction. The original month ${originalMonth} is locked.`);
          }
        }
      }

      if (!transaction.id) {
        transaction.id = crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36).substring(2, 9);
      }

      if (idx > -1) {
        nextTxs[idx] = transaction;
      } else {
        nextTxs.push(transaction);
      }
      await this.saveTransactionsToSheet(projectId, nextTxs);
      this.cache[projectId].transactions = nextTxs;
      return transaction;
    });
  }

  async saveTransactions(projectId: string, newTransactions: Transaction[], options?: StorageWriteOptions): Promise<Transaction[]> {
    return this.enqueueWrite(projectId, async () => {
      await this.ensureCache(projectId);
      const txs = [...this.cache[projectId].transactions];

      if (!options?.ignoreLocks) {
        const locks = await this.getLocks(projectId);
        // Validate ALL transactions against locks before mutating cache (C12)
        for (const transaction of newTransactions) {
          const txnMonth = transaction.date.substring(0, 7);
          const isTargetLocked = locks.some(lock => lock.month === txnMonth && lock.locked);
          if (isTargetLocked) {
            throw new Error(`Cannot write to locked month ${txnMonth}`);
          }

          if (transaction.id) {
            const originalTx = txs.find(t => t.id === transaction.id);
            if (originalTx) {
              const originalMonth = originalTx.date.substring(0, 7);
              const isOriginalLocked = locks.some(lock => lock.month === originalMonth && lock.locked);
              if (isOriginalLocked) {
                throw new Error(`Cannot modify transaction. The original month ${originalMonth} is locked.`);
              }
            }
          }
        }
      }

      // Now safely apply mutations
      const updatedTxs = [...txs];
      for (const transaction of newTransactions) {
        if (!transaction.id) {
          transaction.id = crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36).substring(2, 9);
        }

        const idx = updatedTxs.findIndex(t => t.id === transaction.id);
        if (idx > -1) {
          updatedTxs[idx] = transaction;
        } else {
          updatedTxs.push(transaction);
        }
      }

      await this.saveTransactionsToSheet(projectId, updatedTxs);
      this.cache[projectId].transactions = updatedTxs;
      return newTransactions;
    });
  }

  async deleteTransaction(projectId: string, transactionId: string, options?: StorageWriteOptions): Promise<void> {
    return this.enqueueWrite(projectId, async () => {
      await this.ensureCache(projectId);
      const txs = this.cache[projectId].transactions;
      const txIndex = txs.findIndex(t => t.id === transactionId);
      if (txIndex === -1) return;

      if (!options?.ignoreLocks) {
        const locks = await this.getLocks(projectId);
        const txMonth = txs[txIndex].date.substring(0, 7);
        const isLocked = locks.some(lock => lock.month === txMonth && lock.locked);
        if (isLocked) {
          throw new Error(`Cannot delete transaction. The month ${txMonth} is locked.`);
        }
      }

      const nextTxs = txs.filter(t => t.id !== transactionId);
      await this.saveTransactionsToSheet(projectId, nextTxs);
      this.cache[projectId].transactions = nextTxs;
    });
  }

  async deleteTransactions(projectId: string, transactionIds: string[], options?: StorageWriteOptions): Promise<void> {
    if (transactionIds.length === 0) return;
    return this.enqueueWrite(projectId, async () => {
      await this.ensureCache(projectId);
      const txs = this.cache[projectId].transactions;
      const idSet = new Set(transactionIds);

      if (!options?.ignoreLocks) {
        const locks = await this.getLocks(projectId);
        for (const t of txs) {
          if (idSet.has(t.id)) {
            const txMonth = t.date.substring(0, 7);
            const isLocked = locks.some(lock => lock.month === txMonth && lock.locked);
            if (isLocked) {
              throw new Error(`Cannot delete transaction. The month ${txMonth} is locked.`);
            }
          }
        }
      }

      const nextTxs = txs.filter(t => !idSet.has(t.id));
      await this.saveTransactionsToSheet(projectId, nextTxs);
      this.cache[projectId].transactions = nextTxs;
    });
  }

  async getCategories(projectId: string): Promise<Category[]> {
    await this.ensureCache(projectId);
    return [...this.cache[projectId].categories];
  }

  async saveCategory(projectId: string, category: Category): Promise<Category> {
    return this.enqueueWrite(projectId, async () => {
      await this.ensureCache(projectId);
      if (!category.id) {
        category.id = category.name.toLowerCase().replace(/[^a-z0-9]/g, '-');
      }
      const nextCats = [...this.cache[projectId].categories];
      const idx = nextCats.findIndex(c => c.id === category.id);
      if (idx > -1) nextCats[idx] = category;
      else nextCats.push(category);

      let nextNotes: Record<string, BudgetNote> | null = null;
      const deletedNote = this.cache[projectId].notes?.['__meta_deleted_categories__'];
      if (deletedNote?.text) {
        try {
          const parsed = JSON.parse(deletedNote.text);
          if (Array.isArray(parsed) && parsed.includes(category.id)) {
            const filtered = parsed.filter((id: string) => id !== category.id);
            nextNotes = {
              ...this.cache[projectId].notes,
              __meta_deleted_categories__: {
                text: JSON.stringify(filtered),
                updatedAt: new Date().toISOString()
              }
            };
          }
        } catch {
          // Ignore malformed deleted categories metadata
        }
      }

      await this.saveCategoriesToSheet(projectId, nextCats);
      if (nextNotes) {
        await this.saveNotesToSheet(projectId, nextNotes);
        this.cache[projectId].notes = nextNotes;
      }
      this.cache[projectId].categories = nextCats;
      return category;
    });
  }

  async deleteCategory(projectId: string, categoryId: string): Promise<void> {
    return this.enqueueWrite(projectId, async () => {
      await this.ensureCache(projectId);
      const nextCats = this.cache[projectId].categories.filter(c => c.id !== categoryId);
      await this.saveCategoriesToSheet(projectId, nextCats);

      // If deleting a default category, persist exclusion to Notes!A:B (__meta_deleted_categories__)
      const isDefault = DEFAULT_CATEGORIES.some(c => c.id === categoryId);
      let nextNotes: Record<string, BudgetNote> | null = null;
      if (isDefault) {
        let deletedSet = new Set<string>();
        if (this.cache[projectId].notes['__meta_deleted_categories__']?.text) {
          try {
            const parsed = JSON.parse(this.cache[projectId].notes['__meta_deleted_categories__'].text);
            if (Array.isArray(parsed)) deletedSet = new Set(parsed);
          } catch {
            // Fallback if metadata notes cannot be parsed
          }
        }
        deletedSet.add(categoryId);
        nextNotes = {
          ...this.cache[projectId].notes,
          __meta_deleted_categories__: {
            text: JSON.stringify(Array.from(deletedSet)),
            updatedAt: new Date().toISOString()
          }
        };
        await this.saveNotesToSheet(projectId, nextNotes);
      }

      this.cache[projectId].categories = nextCats;
      if (nextNotes) {
        this.cache[projectId].notes = nextNotes;
      }
    });
  }

  async getBudgets(projectId: string): Promise<Budget[]> {
    await this.ensureCache(projectId);
    return this.cache[projectId].budgets;
  }

  async saveBudgets(projectId: string, budgets: Budget[]): Promise<void> {
    return this.enqueueWrite(projectId, async () => {
      await this.ensureCache(projectId);
      const nextBudgets = [...budgets];
      await this.saveBudgetsToSheet(projectId, nextBudgets);
      this.cache[projectId].budgets = nextBudgets;
    });
  }

  async getLocks(projectId: string): Promise<MonthlyLock[]> {
    await this.ensureCache(projectId);
    return this.cache[projectId].locks;
  }

  async saveLock(projectId: string, lock: MonthlyLock): Promise<void> {
    return this.enqueueWrite(projectId, async () => {
      await this.ensureCache(projectId);
      const nextLocks = [...this.cache[projectId].locks];
      const idx = nextLocks.findIndex(l => l.month === lock.month);
      if (idx > -1) nextLocks[idx] = lock;
      else nextLocks.push(lock);
      await this.saveLocksToSheet(projectId, nextLocks);
      this.cache[projectId].locks = nextLocks;
    });
  }

  private async saveNotesToSheet(projectId: string, notes: Record<string, BudgetNote>) {
    const header = ['key', 'note'];
    const rows = Object.entries(notes).map(([k, v]) => [k, JSON.stringify(v)]);
    try {
      await this.writeSheet(projectId, 'Notes!A:B', [header, ...rows]);
    } catch (_e: unknown) {
      // If Notes sheet doesn't exist, create it via batchUpdate
      const project = (await this.getProjects()).find(p => p.id === projectId);
      if (project?.spreadsheetId) {
        try {
          await this.fetchApi(`https://sheets.googleapis.com/v4/spreadsheets/${project.spreadsheetId}:batchUpdate`, {
            method: 'POST',
            body: JSON.stringify({
              requests: [{ addSheet: { properties: { title: 'Notes' } } }]
            })
          });
          await this.writeSheet(projectId, 'Notes!A:B', [header, ...rows]);
        } catch (createErr) {
          console.error("Failed to create Notes sheet tab:", createErr);
        }
      }
    }
  }

  async getBudgetNotes(projectId: string): Promise<Record<string, BudgetNote>> {
    await this.ensureCache(projectId);
    const notes = this.cache[projectId].notes || {};
    return Object.fromEntries(Object.entries(notes).filter(([k]) => !k.startsWith('__meta_')));
  }

  async saveBudgetNote(projectId: string, key: string, note: BudgetNote): Promise<void> {
    return this.enqueueWrite(projectId, async () => {
      await this.ensureCache(projectId);
      const nextNotes = { ...(this.cache[projectId].notes || {}), [key]: note };
      await this.saveNotesToSheet(projectId, nextNotes);
      this.cache[projectId].notes = nextNotes;
    });
  }

  async deleteBudgetNote(projectId: string, key: string): Promise<void> {
    return this.enqueueWrite(projectId, async () => {
      await this.ensureCache(projectId);
      if (this.cache[projectId].notes && key in this.cache[projectId].notes) {
        const nextNotes = { ...this.cache[projectId].notes };
        delete nextNotes[key];
        await this.saveNotesToSheet(projectId, nextNotes);
        this.cache[projectId].notes = nextNotes;
      }
    });
  }

  async getIngestState(projectId: string): Promise<IngestState> {
    await this.ensureCache(projectId);
    const notesMap = this.cache[projectId].notes || {};
    const rawNote = notesMap['__meta_ingest_state__']?.text;
    if (!rawNote) return { version: 1, tombstones: [], sources: {}, recentRuns: [] };
    try {
      const parsed = JSON.parse(rawNote);
      const baseTombstones: string[] = Array.isArray(parsed?.tombstones)
        ? parsed.tombstones
        : parsed?.tombstones && typeof parsed.tombstones === 'object'
        ? Object.keys(parsed.tombstones)
        : [];
      const chunkCount = typeof parsed?.tombstoneChunks === 'number' ? parsed.tombstoneChunks : 0;
      const extraTombstones: string[] = [];
      for (let idx = 1; idx <= chunkCount; idx++) {
        const chunkRaw = notesMap[`__meta_ingest_tombstones_${idx}__`]?.text;
        if (chunkRaw) {
          try {
            const arr = JSON.parse(chunkRaw);
            if (Array.isArray(arr)) extraTombstones.push(...arr);
          } catch {
            // Ignore malformed chunk
          }
        }
      }
      return {
        version: parsed?.version || 1,
        tombstones: [...baseTombstones, ...extraTombstones],
        sources: parsed?.sources && typeof parsed.sources === 'object' ? parsed.sources : {},
        recentRuns: Array.isArray(parsed?.recentRuns)
          ? parsed.recentRuns
          : Array.isArray(parsed?.runs)
          ? parsed.runs
          : [],
      };
    } catch {
      return { version: 1, tombstones: [], sources: {}, recentRuns: [] };
    }
  }

  private buildIngestStateNotes(
    existingNotes: Record<string, BudgetNote>,
    state: IngestState,
    nowIso: string
  ): Record<string, BudgetNote> {
    const TOMBSTONE_CHUNK_SIZE = 400;
    const allTombstones = Array.isArray(state.tombstones)
      ? state.tombstones.slice(-2000)
      : state.tombstones && typeof state.tombstones === 'object'
      ? Object.keys(state.tombstones).slice(-2000)
      : [];
    const firstChunk = allTombstones.slice(0, TOMBSTONE_CHUNK_SIZE);
    const overflowChunks: string[][] = [];
    for (let i = TOMBSTONE_CHUNK_SIZE; i < allTombstones.length; i += TOMBSTONE_CHUNK_SIZE) {
      overflowChunks.push(allTombstones.slice(i, i + TOMBSTONE_CHUNK_SIZE));
    }

    const headPayload = {
      version: state.version || 1,
      tombstones: firstChunk,
      tombstoneChunks: overflowChunks.length,
      sources: state.sources || {},
      recentRuns: Array.isArray(state.recentRuns) ? state.recentRuns.slice(-30) : [],
    };

    const nextNotes: Record<string, BudgetNote> = {};
    for (const [k, v] of Object.entries(existingNotes || {})) {
      if (!k.startsWith('__meta_ingest_tombstones_') && k !== '__meta_ingest_lock__') {
        nextNotes[k] = v;
      }
    }
    nextNotes.__meta_ingest_state__ = {
      text: JSON.stringify(headPayload),
      updatedAt: nowIso,
    };
    for (let idx = 0; idx < overflowChunks.length; idx++) {
      nextNotes[`__meta_ingest_tombstones_${idx + 1}__`] = {
        text: JSON.stringify(overflowChunks[idx]),
        updatedAt: nowIso,
      };
    }
    return nextNotes;
  }

  async saveIngestState(projectId: string, state: IngestState): Promise<void> {
    const nowIso = new Date().toISOString();
    return this.enqueueWrite(projectId, async () => {
      await this.ensureCache(projectId);
      const nextNotes = this.buildIngestStateNotes(this.cache[projectId].notes || {}, state, nowIso);
      await this.saveNotesToSheet(projectId, nextNotes);
      this.cache[projectId].notes = nextNotes;
    });
  }

  async acquireIngestLock(projectId: string, holderId: string, ttlMs = 60_000): Promise<void> {
    return this.enqueueWrite(projectId, async () => {
      this.invalidateCache(projectId);
      await this.ensureCache(projectId);
      const notes = this.cache[projectId].notes || {};
      const lockNote = notes.__meta_ingest_lock__;
      if (lockNote?.text) {
        try {
          const parsed = JSON.parse(lockNote.text) as { holderId?: string; expiresAt?: string };
          const expiresMs = parsed?.expiresAt ? Date.parse(parsed.expiresAt) : 0;
          if (parsed?.holderId && parsed.holderId !== holderId && expiresMs > Date.now()) {
            throw new Error(
              `Concurrent ingestion lock on project "${projectId}" is held by "${parsed.holderId}" until ${parsed.expiresAt}.`
            );
          }
        } catch (err) {
          if (err instanceof Error && err.message.startsWith('Concurrent ingestion lock')) {
            throw err;
          }
        }
      }
      const nowIso = new Date().toISOString();
      const expiresAt = new Date(Date.now() + ttlMs).toISOString();
      const nextNotes: Record<string, BudgetNote> = {
        ...notes,
        __meta_ingest_lock__: {
          text: JSON.stringify({ holderId, acquiredAt: nowIso, expiresAt }),
          updatedAt: nowIso,
        },
      };
      await this.saveNotesToSheet(projectId, nextNotes);
      this.cache[projectId].notes = nextNotes;
    });
  }

  async releaseIngestLock(projectId: string, holderId: string): Promise<void> {
    return this.enqueueWrite(projectId, async () => {
      if (!this.cache[projectId]) return;
      const notes = this.cache[projectId].notes || {};
      const lockNote = notes.__meta_ingest_lock__;
      if (!lockNote?.text) return;
      try {
        const parsed = JSON.parse(lockNote.text) as { holderId?: string };
        if (parsed?.holderId && parsed.holderId !== holderId) return;
      } catch {
        // Proceed to clear malformed lock
      }
      const nextNotes = { ...notes };
      delete nextNotes.__meta_ingest_lock__;
      await this.saveNotesToSheet(projectId, nextNotes);
      this.cache[projectId].notes = nextNotes;
    });
  }

  async commitIngestBatch(
    projectId: string,
    payload: {
      upserts: Transaction[];
      deleteIds: string[];
      ingestState: IngestState;
    },
    options?: StorageWriteOptions
  ): Promise<void> {
    return this.enqueueWrite(projectId, async () => {
      await this.ensureCache(projectId);
      const previousTxs = [...this.cache[projectId].transactions];
      const deleteSet = new Set(payload.deleteIds);

      if (!options?.ignoreLocks) {
        const locks = await this.getLocks(projectId);
        for (const transaction of payload.upserts) {
          const txnMonth = transaction.date.substring(0, 7);
          if (locks.some(lock => lock.month === txnMonth && lock.locked)) {
            throw new Error(`Cannot write to locked month ${txnMonth}`);
          }
        }
        for (const t of previousTxs) {
          if (deleteSet.has(t.id)) {
            const txMonth = t.date.substring(0, 7);
            if (locks.some(lock => lock.month === txMonth && lock.locked)) {
              throw new Error(`Cannot delete transaction. The month ${txMonth} is locked.`);
            }
          }
        }
      }

      const nextTxs = [...previousTxs];
      for (const tx of payload.upserts) {
        const copy = { ...tx };
        if (!copy.id) {
          copy.id = crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36).substring(2, 9);
        }
        const idx = nextTxs.findIndex(t => t.id === copy.id);
        if (idx > -1) {
          nextTxs[idx] = copy;
        } else {
          nextTxs.push(copy);
        }
      }
      const finalTxs = deleteSet.size > 0 ? nextTxs.filter(t => !deleteSet.has(t.id)) : nextTxs;
      const hasTxChanges = payload.upserts.length > 0 || payload.deleteIds.length > 0;

      if (hasTxChanges) {
        await this.saveTransactionsToSheet(projectId, finalTxs);
      }

      const nowIso = new Date().toISOString();
      const nextNotes = this.buildIngestStateNotes(
        this.cache[projectId].notes || {},
        payload.ingestState,
        nowIso
      );

      try {
        await this.saveNotesToSheet(projectId, nextNotes);
        this.cache[projectId].transactions = finalTxs;
        this.cache[projectId].notes = nextNotes;
      } catch (err) {
        if (hasTxChanges) {
          try {
            await this.saveTransactionsToSheet(projectId, previousTxs);
            this.cache[projectId].transactions = previousTxs;
          } catch {
            // Preserve original error
          }
        }
        throw err;
      }
    });
  }
}
