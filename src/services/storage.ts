export interface Transaction {
  id: string;          // Unique UUID (generated on creation)
  date: string;        // ISO 8601 Date String (YYYY-MM-DD)
  category: string;    // ID of the Category
  amount: number;      // Numeric amount (positive float)
  type: 'income' | 'expense' | 'transfer';
  description: string; // Brief description/payee name
  notes: string;       // Extended details/comments
  labels: string[];    // Array of tags/labels
  hash: string;        // SHA-256 hash of transaction properties used for deduplication
}

export interface Category {
  id: string;          // Unique category ID or normalized slug
  name: string;        // Human-readable name
  color: string;       // Hex color code (e.g., '#FF6B6B')
  emoji: string;       // Emoji icon representing category (e.g., '🍔')
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

export interface StorageAdapter {
  getProjects(): Promise<Project[]>;
  createProject(name: string): Promise<Project>;
  saveProject(project: Project): Promise<Project>;

  getCategories(projectId: string): Promise<Category[]>;
  saveCategory(projectId: string, category: Category): Promise<Category>;
  deleteCategory(projectId: string, categoryId: string): Promise<void>;

  getTransactions(projectId: string): Promise<Transaction[]>;
  saveTransaction(projectId: string, transaction: Transaction): Promise<Transaction>;
  saveTransactions(projectId: string, transactions: Transaction[]): Promise<Transaction[]>;
  deleteTransaction(projectId: string, transactionId: string): Promise<void>;
  deleteTransactions(projectId: string, transactionIds: string[]): Promise<void>;

  getBudgets(projectId: string): Promise<Budget[]>;
  saveBudgets(projectId: string, budgets: Budget[]): Promise<void>;

  getLocks(projectId: string): Promise<MonthlyLock[]>;
  saveLock(projectId: string, lock: MonthlyLock): Promise<void>;
}

// Default categories for new projects
export const DEFAULT_CATEGORIES: Category[] = [
  { id: 'salary', name: 'Salary', color: '#51CF66', emoji: '💰' },
  { id: 'rent', name: 'Rent', color: '#4DABF7', emoji: '🏠' },
  { id: 'utilities', name: 'Utilities', color: '#FCC419', emoji: '⚡' },
  { id: 'food', name: 'Food', color: '#FF6B6B', emoji: '🍔' },
  { id: 'transport', name: 'Transport', color: '#845EF7', emoji: '🚗' },
  { id: 'entertainment', name: 'Entertainment', color: '#FF8787', emoji: '🎬' },
  { id: 'travel', name: 'Travel', color: '#38BDF8', emoji: '✈️' },
  { id: 'meals', name: 'Meals', color: '#FF922B', emoji: '🍽️' },
  { id: 'healthcare', name: 'Healthcare', color: '#20C997', emoji: '🏥' },
  { id: 'misc', name: 'Miscellaneous', color: '#ADB5BD', emoji: '📦' }
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

  private clearAllExpenseKeys(): void {
    const keysToRemove: string[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key && key.startsWith('expense_') && key !== 'expense_mock_session' && key !== 'expense_google_token') {
        keysToRemove.push(key);
      }
    }
    keysToRemove.forEach(key => localStorage.removeItem(key));
  }

  private ensureInitialized(): void {
    try {
      const projectsRaw = localStorage.getItem('expense_projects');
      if (!projectsRaw) {
        localStorage.setItem('expense_projects', '[]');
        return;
      }
      try {
        const parsed = JSON.parse(projectsRaw);
        if (!Array.isArray(parsed)) {
          localStorage.setItem('expense_projects', '[]');
        } else {
          parsed.forEach((proj: Project) => {
            if (!proj || !proj.id) return;
            if (localStorage.getItem(`expense_locks_${proj.id}`) === null) {
              localStorage.setItem(`expense_locks_${proj.id}`, JSON.stringify([]));
            }
          });
        }
      } catch (parseError) {
        console.error('Local storage data corrupted, resetting:', parseError);
        this.clearAllExpenseKeys();
        localStorage.setItem('expense_projects', '[]');
        localStorage.setItem('expense_corrupt_recovered', 'true');
      }
    } catch (error) {
      console.error('Failed to initialize local storage:', error);
      try {
        this.clearAllExpenseKeys();
      } catch (e) {}
      this.seedMockDatabase();
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

  async getTransactions(projectId: string): Promise<Transaction[]> {
    const raw = localStorage.getItem(`expense_txs_${projectId}`);
    if (!raw) return [];
    try {
      const parsed: Transaction[] = JSON.parse(raw);
      let needsRepair = false;
      for (const t of parsed) {
        if (!t.hash) {
          t.hash = `${t.date}-${t.description}-${t.amount}-${t.type}`;
          needsRepair = true;
        }
        if (!t.labels) {
          t.labels = [];
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

  async saveTransaction(projectId: string, transaction: Transaction): Promise<Transaction> {
    this.ensureProjectsRestored();
    const transactions = await this.getTransactions(projectId);
    const existingIndex = transactions.findIndex(t => t.id === transaction.id);

    // Enforce lock check on target date's month
    const locks = await this.getLocks(projectId);
    const txMonth = transaction.date.substring(0, 7); // YYYY-MM
    const isLocked = locks.some(lock => lock.month === txMonth && lock.locked);
    if (isLocked) {
      throw new Error(`Cannot write to locked month (${txMonth} is locked)`);
    }

    // Importantly, if it's an existing transaction (updating an edit), retrieve the transaction's PREVIOUS/OLD date from the database, and verify if THAT month is locked as well.
    if (existingIndex > -1) {
      const originalTx = transactions[existingIndex];
      const originalMonth = originalTx.date.substring(0, 7);
      const isOriginalLocked = locks.some(lock => lock.month === originalMonth && lock.locked);
      if (isOriginalLocked) {
        throw new Error(`Cannot modify transaction. The original month ${originalMonth} is locked.`);
      }
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

  async saveTransactions(projectId: string, newTransactions: Transaction[]): Promise<Transaction[]> {
    const transactions = await this.getTransactions(projectId);
    const locks = await this.getLocks(projectId);

    for (const transaction of newTransactions) {
      const txnMonth = transaction.date.substring(0, 7);
      const isTargetLocked = locks.some(lock => lock.month === txnMonth && lock.locked);
      if (isTargetLocked) {
        throw new Error(`Cannot write to locked month ${txnMonth}`);
      }

      if (!transaction.id) {
        transaction.id = crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36).substring(2, 9);
      }

      const existingIndex = transactions.findIndex(t => t.id === transaction.id);
      if (existingIndex > -1) {
        const originalTx = transactions[existingIndex];
        const originalMonth = originalTx.date.substring(0, 7);
        const isOriginalLocked = locks.some(lock => lock.month === originalMonth && lock.locked);
        if (isOriginalLocked) {
          throw new Error(`Cannot modify transaction. The original month ${originalMonth} is locked.`);
        }
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

  async deleteTransaction(projectId: string, transactionId: string): Promise<void> {
    const transactions = await this.getTransactions(projectId);
    const txIndex = transactions.findIndex(t => t.id === transactionId);
    if (txIndex === -1) return;

    // Enforce lock check
    const locks = await this.getLocks(projectId);
    const txMonth = transactions[txIndex].date.substring(0, 7);
    const isLocked = locks.some(lock => lock.month === txMonth && lock.locked);
    if (isLocked) {
      throw new Error(`Cannot delete transaction. The month ${txMonth} is locked.`);
    }

    transactions.splice(txIndex, 1);
    try {
      localStorage.setItem(`expense_txs_${projectId}`, JSON.stringify(transactions));
    } catch (e) {
      throw new Error('Local storage quota exceeded. Unable to delete transaction.');
    }
  }

  async deleteTransactions(projectId: string, transactionIds: string[]): Promise<void> {
    if (transactionIds.length === 0) return;
    const transactions = await this.getTransactions(projectId);
    const idSet = new Set(transactionIds);
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

  async getCategories(projectId: string): Promise<Category[]> {
    const raw = localStorage.getItem(`expense_categories_${projectId}`);
    if (!raw) return [...DEFAULT_CATEGORIES];
    try {
      return JSON.parse(raw);
    } catch (e) {
      console.error(`Failed to parse categories for project ${projectId}:`, e);
      return [];
    }
  }

  async saveCategory(projectId: string, category: Category): Promise<Category> {
    const categories = await this.getCategories(projectId);
    const existingIndex = categories.findIndex(c => c.id === category.id);
    if (existingIndex > -1) {
      categories[existingIndex] = category;
    } else {
      if (!category.id) {
        category.id = category.name.toLowerCase().replace(/[^a-z0-9]/g, '-');
      }
      categories.push(category);
    }
    try {
      localStorage.setItem(`expense_categories_${projectId}`, JSON.stringify(categories));
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
    } catch (e) {
      throw new Error('Local storage quota exceeded. Unable to delete category.');
    }
  }
}

export class GoogleSheetsAdapter implements StorageAdapter {
  private getToken: () => string | null;

  // In-memory cache for fast reads
  private projectsCache: Project[] | null = null;
  private cache: Record<string, {
    transactions: Transaction[];
    categories: Category[];
    budgets: Budget[];
    locks: MonthlyLock[];
  }> = {};

  constructor(getToken: () => string | null) {
    this.getToken = getToken;
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
      const errorText = await response.text();
      throw new Error(`API Error ${response.status}: ${errorText}`);
    }
    return response.json();
  }

  async getProjects(): Promise<Project[]> {
    if (this.projectsCache) return this.projectsCache;
    
    const raw = localStorage.getItem('expense_google_projects');
    let localProjects: Project[] = raw ? JSON.parse(raw) : [];

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
          { properties: { title: 'Locks' } }
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
      locks: []
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

  private async ensureCache(projectId: string) {
    if (this.cache[projectId]) return;
    const project = (await this.getProjects()).find(p => p.id === projectId);
    if (!project || !project.spreadsheetId) throw new Error("Project not found or missing spreadsheet ID");

    const res = await this.fetchApi(`https://sheets.googleapis.com/v4/spreadsheets/${project.spreadsheetId}/values:batchGet?ranges=Transactions!A:I&ranges=Categories!A:D&ranges=Budgets!A:B&ranges=Locks!A:C`);
    
    const parseJSON = (str: string) => { try { return JSON.parse(str); } catch { return str; } };

    const txRows = res.valueRanges?.[0]?.values || [];
    const catRows = res.valueRanges?.[1]?.values || [];
    const bgRows = res.valueRanges?.[2]?.values || [];
    const lockRows = res.valueRanges?.[3]?.values || [];

    const transactions: Transaction[] = txRows.slice(1).map((r: any[]) => ({
      id: r[0], date: r[1], category: r[2], amount: parseFloat(r[3]), type: r[4], description: r[5], notes: r[6] || '', labels: parseJSON(r[7] || '[]'), hash: r[8] || ''
    })).filter((t: any) => t.id);

    let categories: Category[] = catRows.slice(1).map((r: any[]) => ({
      id: r[0], name: r[1], color: r[2], emoji: r[3]
    })).filter((c: any) => c.id);
    
    if (categories.length === 0) categories = [...DEFAULT_CATEGORIES];

    const budgets: Budget[] = bgRows.slice(1).map((r: any[]) => ({
      category: r[0], amount: parseFloat(r[1])
    })).filter((b: any) => b.category);

    const locks: MonthlyLock[] = lockRows.slice(1).map((r: any[]) => ({
      month: r[0], locked: r[1] === 'true' || r[1] === 'TRUE', lockedAt: r[2] || undefined
    })).filter((l: any) => l.month);

    this.cache[projectId] = { transactions, categories, budgets, locks };
  }

  private async writeSheet(projectId: string, range: string, values: any[][]) {
    const project = (await this.getProjects()).find(p => p.id === projectId);
    if (!project || !project.spreadsheetId) throw new Error("Project not found");

    const sheetName = range.split('!')[0];
    
    // Clear existing data
    await this.fetchApi(`https://sheets.googleapis.com/v4/spreadsheets/${project.spreadsheetId}/values/${sheetName}:clear`, { method: 'POST' });
    
    // Write new data
    await this.fetchApi(`https://sheets.googleapis.com/v4/spreadsheets/${project.spreadsheetId}/values/${range}?valueInputOption=USER_ENTERED`, {
      method: 'PUT',
      body: JSON.stringify({ values })
    });
  }

  private async saveTransactionsToSheet(projectId: string, txs: Transaction[]) {
    const header = ['id', 'date', 'category', 'amount', 'type', 'description', 'notes', 'labels', 'hash'];
    const rows = txs.map(t => [t.id, t.date, t.category, t.amount, t.type, t.description, t.notes, JSON.stringify(t.labels), t.hash]);
    await this.writeSheet(projectId, 'Transactions!A:I', [header, ...rows]);
  }

  private async saveCategoriesToSheet(projectId: string, cats: Category[]) {
    const header = ['id', 'name', 'color', 'emoji'];
    const rows = cats.map(c => [c.id, c.name, c.color, c.emoji]);
    await this.writeSheet(projectId, 'Categories!A:D', [header, ...rows]);
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
    return this.cache[projectId].transactions;
  }

  async saveTransaction(projectId: string, transaction: Transaction): Promise<Transaction> {
    await this.ensureCache(projectId);
    const locks = await this.getLocks(projectId);

    // Enforce lock check on target month
    const txnMonth = transaction.date.substring(0, 7);
    const isTargetLocked = locks.some(lock => lock.month === txnMonth && lock.locked);
    if (isTargetLocked) {
      throw new Error(`Cannot write to locked month ${txnMonth}`);
    }

    if (!transaction.id) {
      transaction.id = crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36).substring(2, 9);
    }

    const txs = this.cache[projectId].transactions;
    const idx = txs.findIndex(t => t.id === transaction.id);
    if (idx > -1) {
      const originalTx = txs[idx];
      const originalMonth = originalTx.date.substring(0, 7);
      const isOriginalLocked = locks.some(lock => lock.month === originalMonth && lock.locked);
      if (isOriginalLocked) {
        throw new Error(`Cannot modify transaction. The original month ${originalMonth} is locked.`);
      }
      txs[idx] = transaction;
    } else {
      txs.push(transaction);
    }
    await this.saveTransactionsToSheet(projectId, txs);
    return transaction;
  }

  async saveTransactions(projectId: string, newTransactions: Transaction[]): Promise<Transaction[]> {
    await this.ensureCache(projectId);
    const locks = await this.getLocks(projectId);
    const txs = this.cache[projectId].transactions;

    for (const transaction of newTransactions) {
      const txnMonth = transaction.date.substring(0, 7);
      const isTargetLocked = locks.some(lock => lock.month === txnMonth && lock.locked);
      if (isTargetLocked) {
        throw new Error(`Cannot write to locked month ${txnMonth}`);
      }

      if (!transaction.id) {
        transaction.id = crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36).substring(2, 9);
      }

      const idx = txs.findIndex(t => t.id === transaction.id);
      if (idx > -1) {
        const originalTx = txs[idx];
        const originalMonth = originalTx.date.substring(0, 7);
        const isOriginalLocked = locks.some(lock => lock.month === originalMonth && lock.locked);
        if (isOriginalLocked) {
          throw new Error(`Cannot modify transaction. The original month ${originalMonth} is locked.`);
        }
        txs[idx] = transaction;
      } else {
        txs.push(transaction);
      }
    }

    await this.saveTransactionsToSheet(projectId, txs);
    return newTransactions;
  }

  async deleteTransaction(projectId: string, transactionId: string): Promise<void> {
    await this.ensureCache(projectId);
    const txs = this.cache[projectId].transactions;
    const txIndex = txs.findIndex(t => t.id === transactionId);
    if (txIndex === -1) return;

    // Enforce lock check
    const locks = await this.getLocks(projectId);
    const txMonth = txs[txIndex].date.substring(0, 7);
    const isLocked = locks.some(lock => lock.month === txMonth && lock.locked);
    if (isLocked) {
      throw new Error(`Cannot delete transaction. The month ${txMonth} is locked.`);
    }

    this.cache[projectId].transactions = txs.filter(t => t.id !== transactionId);
    await this.saveTransactionsToSheet(projectId, this.cache[projectId].transactions);
  }

  async deleteTransactions(projectId: string, transactionIds: string[]): Promise<void> {
    if (transactionIds.length === 0) return;
    await this.ensureCache(projectId);
    const txs = this.cache[projectId].transactions;
    const idSet = new Set(transactionIds);
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

    this.cache[projectId].transactions = txs.filter(t => !idSet.has(t.id));
    await this.saveTransactionsToSheet(projectId, this.cache[projectId].transactions);
  }

  async getCategories(projectId: string): Promise<Category[]> {
    await this.ensureCache(projectId);
    return this.cache[projectId].categories;
  }

  async saveCategory(projectId: string, category: Category): Promise<Category> {
    await this.ensureCache(projectId);
    const cats = this.cache[projectId].categories;
    const idx = cats.findIndex(c => c.id === category.id);
    if (idx > -1) cats[idx] = category;
    else cats.push(category);
    await this.saveCategoriesToSheet(projectId, cats);
    return category;
  }

  async deleteCategory(projectId: string, categoryId: string): Promise<void> {
    await this.ensureCache(projectId);
    this.cache[projectId].categories = this.cache[projectId].categories.filter(c => c.id !== categoryId);
    await this.saveCategoriesToSheet(projectId, this.cache[projectId].categories);
  }

  async getBudgets(projectId: string): Promise<Budget[]> {
    await this.ensureCache(projectId);
    return this.cache[projectId].budgets;
  }

  async saveBudgets(projectId: string, budgets: Budget[]): Promise<void> {
    await this.ensureCache(projectId);
    this.cache[projectId].budgets = budgets;
    await this.saveBudgetsToSheet(projectId, budgets);
  }

  async getLocks(projectId: string): Promise<MonthlyLock[]> {
    await this.ensureCache(projectId);
    return this.cache[projectId].locks;
  }

  async saveLock(projectId: string, lock: MonthlyLock): Promise<void> {
    await this.ensureCache(projectId);
    const locks = this.cache[projectId].locks;
    const idx = locks.findIndex(l => l.month === lock.month);
    if (idx > -1) locks[idx] = lock;
    else locks.push(lock);
    await this.saveLocksToSheet(projectId, locks);
  }
}
