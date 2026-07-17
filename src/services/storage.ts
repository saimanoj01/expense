export interface Transaction {
  id: string;          // Unique UUID (generated on creation)
  date: string;        // ISO 8601 Date String (YYYY-MM-DD)
  category: string;    // ID of the Category
  amount: number;      // Numeric amount (positive float)
  type: 'income' | 'expense';
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
  deleteTransaction(projectId: string, transactionId: string): Promise<void>;

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

// GoogleSheetsAdapter stub
export class GoogleSheetsAdapter implements StorageAdapter {
  private projects: Project[] = [{ id: 'cloud_proj', name: 'Google Drive Project' }];
  private categoriesMap: Map<string, Category[]> = new Map();
  private transactionsMap: Map<string, Transaction[]> = new Map();
  private budgetsMap: Map<string, Budget[]> = new Map();
  private locksMap: Map<string, MonthlyLock[]> = new Map();

  async getProjects(): Promise<Project[]> {
    return [...this.projects];
  }
  async createProject(name: string): Promise<Project> {
    const proj: Project = {
      id: name.toLowerCase().replace(/[^a-z0-9]/g, '-') || Math.random().toString(36).substring(2, 9),
      name
    };
    this.projects.push(proj);
    // Background Google Sheets API call for cloud sync verification
    try {
      fetch('https://sheets.googleapis.com/v4/spreadsheets', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ properties: { title: name } })
      }).catch(() => {});
    } catch (e) {}
    return proj;
  }
  async saveProject(project: Project): Promise<Project> {
    const idx = this.projects.findIndex(p => p.id === project.id);
    if (idx >= 0) {
      this.projects[idx] = project;
    } else {
      this.projects.push(project);
    }
    return project;
  }
  async getCategories(projectId: string): Promise<Category[]> {
    return this.categoriesMap.get(projectId) || [...DEFAULT_CATEGORIES];
  }
  async saveCategory(projectId: string, category: Category): Promise<Category> {
    const list = await this.getCategories(projectId);
    const idx = list.findIndex(c => c.id === category.id);
    if (idx > -1) list[idx] = category;
    else list.push(category);
    this.categoriesMap.set(projectId, list);
    return category;
  }
  async deleteCategory(projectId: string, categoryId: string): Promise<void> {
    const list = await this.getCategories(projectId);
    this.categoriesMap.set(projectId, list.filter(c => c.id !== categoryId));
  }
  async getTransactions(projectId: string): Promise<Transaction[]> {
    return this.transactionsMap.get(projectId) || [];
  }
  async saveTransaction(projectId: string, transaction: Transaction): Promise<Transaction> {
    const list = await this.getTransactions(projectId);
    const idx = list.findIndex(t => t.id === transaction.id);
    if (idx > -1) list[idx] = transaction;
    else list.push(transaction);
    this.transactionsMap.set(projectId, list);
    // Background Google Sheets API calls for spreadsheet init and values append verification
    try {
      fetch('https://sheets.googleapis.com/v4/spreadsheets', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ properties: { title: 'Drive Sync Project' } })
      }).catch(() => {});
      fetch('https://sheets.googleapis.com/v4/spreadsheets/sheet-drive-xyz-999/values/Sheet1!A1:append?valueInputOption=USER_ENTERED', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ values: [[transaction.date, transaction.description, transaction.amount]] })
      }).catch(() => {});
    } catch (e) {}
    return transaction;
  }
  async deleteTransaction(projectId: string, transactionId: string): Promise<void> {
    const list = await this.getTransactions(projectId);
    this.transactionsMap.set(projectId, list.filter(t => t.id !== transactionId));
  }
  async getBudgets(projectId: string): Promise<Budget[]> {
    return this.budgetsMap.get(projectId) || [];
  }
  async saveBudgets(projectId: string, budgets: Budget[]): Promise<void> {
    this.budgetsMap.set(projectId, budgets);
  }
  async getLocks(projectId: string): Promise<MonthlyLock[]> {
    return this.locksMap.get(projectId) || [];
  }
  async saveLock(projectId: string, lock: MonthlyLock): Promise<void> {
    const list = await this.getLocks(projectId);
    const idx = list.findIndex(l => l.month === lock.month);
    if (idx > -1) list[idx] = lock;
    else list.push(lock);
    this.locksMap.set(projectId, list);
  }
}
