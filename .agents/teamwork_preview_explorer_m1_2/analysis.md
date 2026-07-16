# Storage Adapter Architecture & Mock Data Design Analysis

This report presents findings and architectural recommendations for the Storage Adapter interface and the preloaded mock database in local storage, supporting both the Local Storage Mock Mode and the eventual Google Drive/Sheets synchronization.

---

## 1. TypeScript Schema Definitions

To ensure consistency and pluggability between the Local Storage Mock Adapter and the Google Sheets Adapter, the core entities must have well-defined TypeScript interfaces. We recommend adding custom category storage endpoints, since categories must be editable and customizable (name, color, and emoji) per user request.

### Core Entity Definitions

```typescript
/**
 * Represents a single financial transaction.
 */
export interface Transaction {
  id: string;          // Unique UUID (generated on creation)
  date: string;        // ISO 8601 Date String (YYYY-MM-DD)
  category: string;    // ID of the Category (e.g., 'food', 'rent', or custom IDs)
  amount: number;      // Numeric amount (positive float)
  type: 'income' | 'expense';
  description: string; // Brief description/payee name
  notes: string;       // Extended details/comments
  labels: string[];    // Array of tags/labels
  hash: string;        // SHA-256 hash of transaction properties used for deduplication on CSV import
}

/**
 * Represents a customizable expense or income category.
 */
export interface Category {
  id: string;          // Unique category ID or normalized string slug
  name: string;        // Human-readable name
  color: string;       // Hex color code (e.g., '#FF6B6B') or Tailwind HSL class
  emoji: string;       // Emoji icon representing the category (e.g., '🍔')
}

/**
 * Represents a monthly budget set for a specific category.
 */
export interface Budget {
  category: string;    // Category ID that this budget applies to
  amount: number;      // Monthly budget cap
}

/**
 * Represents an expense tracking project.
 */
export interface Project {
  id: string;            // Unique UUID or slug
  name: string;          // Project name
  spreadsheetId?: string; // Optional Google Spreadsheet ID (null in Mock Mode)
  collaborators?: string[]; // Optional collaborator emails (fetched via Drive API in Google Mode)
}

/**
 * Represents a monthly lock that freezes transactions for a given month.
 */
export interface MonthlyLock {
  month: string;       // Lock month in YYYY-MM format
  locked: boolean;     // Lock status flag
  lockedAt?: string;   // ISO 8601 timestamp when locked
}
```

### StorageAdapter Interface Definition

The `StorageAdapter` acts as the abstract contract. Both `LocalStorageAdapter` and the future `GoogleSheetsAdapter` must implement this contract.

```typescript
export interface StorageAdapter {
  // Project Management
  getProjects(): Promise<Project[]>;
  createProject(name: string): Promise<Project>;

  // Category Management
  getCategories(projectId: string): Promise<Category[]>;
  saveCategory(projectId: string, category: Category): Promise<Category>;
  deleteCategory(projectId: string, categoryId: string): Promise<void>;

  // Transaction Management
  getTransactions(projectId: string): Promise<Transaction[]>;
  saveTransaction(projectId: string, transaction: Transaction): Promise<Transaction>;
  deleteTransaction(projectId: string, transactionId: string): Promise<void>;

  // Budget Management
  getBudgets(projectId: string): Promise<Budget[]>;
  saveBudgets(projectId: string, budgets: Budget[]): Promise<void>;

  // Month Locking Management
  getLocks(projectId: string): Promise<MonthlyLock[]>;
  saveLock(projectId: string, lock: MonthlyLock): Promise<void>;
}
```

---

## 2. Design of `LocalStorageAdapter`

The `LocalStorageAdapter` is responsible for handling all reads and writes in browser memory when the application is running in **Mock/Demo Mode**.

### Storage Keys & Namespace Strategy
To avoid conflicts with other applications running on the same domain (e.g., GitHub Pages hosting other projects), keys must be prefixed with a clear namespace. We recommend the following namespace design:

* `expense_tracker_projects`: Stores the master list of projects.
* `expense_tracker_categories_<projectId>`: Stores category options for a specific project.
* `expense_tracker_transactions_<projectId>`: Stores the transactions for a specific project.
* `expense_tracker_budgets_<projectId>`: Stores the monthly category budgets for a specific project.
* `expense_tracker_locks_<projectId>`: Stores locked months for a specific project.

### Initialization & Pre-Seeding Logic
When the adapter is instantiated, it should verify whether any database exists in `localStorage`. If `expense_tracker_projects` is missing or empty, it triggers the pre-seed routine to write the initial mock datasets immediately.

```typescript
export class LocalStorageAdapter implements StorageAdapter {
  constructor() {
    this.ensureInitialized();
  }

  private ensureInitialized(): void {
    try {
      const projectsRaw = localStorage.getItem('expense_tracker_projects');
      if (!projectsRaw || JSON.parse(projectsRaw).length === 0) {
        this.seedMockDatabase();
      }
    } catch (error) {
      console.error('Failed to initialize local storage:', error);
      // Fallback: seed database to memory or clear corrupted keys
      this.seedMockDatabase();
    }
  }

  private seedMockDatabase(): void {
    // Write project headers
    localStorage.setItem('expense_tracker_projects', JSON.stringify(SEED_PROJECTS));

    // Write project-specific lists
    SEED_PROJECTS.forEach(project => {
      localStorage.setItem(`expense_tracker_categories_${project.id}`, JSON.stringify(SEED_CATEGORIES[project.id]));
      localStorage.setItem(`expense_tracker_budgets_${project.id}`, JSON.stringify(SEED_BUDGETS[project.id]));
      localStorage.setItem(`expense_tracker_transactions_${project.id}`, JSON.stringify(SEED_TRANSACTIONS[project.id]));
      localStorage.setItem(`expense_tracker_locks_${project.id}`, JSON.stringify(SEED_LOCKS[project.id]));
    });
  }

  // Implementation skeleton for StorageAdapter methods...
  async getProjects(): Promise<Project[]> {
    const raw = localStorage.getItem('expense_tracker_projects');
    return raw ? JSON.parse(raw) : [];
  }

  async createProject(name: string): Promise<Project> {
    const projects = await this.getProjects();
    const newProject: Project = {
      id: crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36).substring(2, 9),
      name,
    };
    projects.push(newProject);
    localStorage.setItem('expense_tracker_projects', JSON.stringify(projects));
    
    // Seed default categories for a new project
    localStorage.setItem(`expense_tracker_categories_${newProject.id}`, JSON.stringify(DEFAULT_CATEGORIES));
    localStorage.setItem(`expense_tracker_budgets_${newProject.id}`, JSON.stringify([]));
    localStorage.setItem(`expense_tracker_transactions_${newProject.id}`, JSON.stringify([]));
    localStorage.setItem(`expense_tracker_locks_${newProject.id}`, JSON.stringify([]));

    return newProject;
  }

  async getTransactions(projectId: string): Promise<Transaction[]> {
    const raw = localStorage.getItem(`expense_tracker_transactions_${projectId}`);
    return raw ? JSON.parse(raw) : [];
  }

  async saveTransaction(projectId: string, transaction: Transaction): Promise<Transaction> {
    const transactions = await this.getTransactions(projectId);
    const existingIndex = transactions.findIndex(t => t.id === transaction.id);

    // Enforce lock check
    const locks = await this.getLocks(projectId);
    const txMonth = transaction.date.substring(0, 7); // YYYY-MM
    const isLocked = locks.some(lock => lock.month === txMonth && lock.locked);
    if (isLocked) {
      throw new Error(`Cannot add or modify transaction. The month ${txMonth} is locked.`);
    }

    if (existingIndex > -1) {
      // Update
      transactions[existingIndex] = transaction;
    } else {
      // Create new (ensure UUID and Hash exist)
      if (!transaction.id) {
        transaction.id = crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36).substring(2, 9);
      }
      transactions.push(transaction);
    }
    localStorage.setItem(`expense_tracker_transactions_${projectId}`, JSON.stringify(transactions));
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
    localStorage.setItem(`expense_tracker_transactions_${projectId}`, JSON.stringify(transactions));
  }

  async getBudgets(projectId: string): Promise<Budget[]> {
    const raw = localStorage.getItem(`expense_tracker_budgets_${projectId}`);
    return raw ? JSON.parse(raw) : [];
  }

  async saveBudgets(projectId: string, budgets: Budget[]): Promise<void> {
    localStorage.setItem(`expense_tracker_budgets_${projectId}`, JSON.stringify(budgets));
  }

  async getLocks(projectId: string): Promise<MonthlyLock[]> {
    const raw = localStorage.getItem(`expense_tracker_locks_${projectId}`);
    return raw ? JSON.parse(raw) : [];
  }

  async saveLock(projectId: string, lock: MonthlyLock): Promise<void> {
    const locks = await this.getLocks(projectId);
    const existingIndex = locks.findIndex(l => l.month === lock.month);
    if (existingIndex > -1) {
      locks[existingIndex] = lock;
    } else {
      locks.push(lock);
    }
    localStorage.setItem(`expense_tracker_locks_${projectId}`, JSON.stringify(locks));
  }

  async getCategories(projectId: string): Promise<Category[]> {
    const raw = localStorage.getItem(`expense_tracker_categories_${projectId}`);
    return raw ? JSON.parse(raw) : [];
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
    localStorage.setItem(`expense_tracker_categories_${projectId}`, JSON.stringify(categories));
    return category;
  }

  async deleteCategory(projectId: string, categoryId: string): Promise<void> {
    const categories = await this.getCategories(projectId);
    const filtered = categories.filter(c => c.id !== categoryId);
    localStorage.setItem(`expense_tracker_categories_${projectId}`, JSON.stringify(filtered));
  }
}
```

---

## 3. Recommended Seed Datasets

To construct a realistic interface in mock mode, the preloaded database includes two active projects with varying budgets, locked months, and transactions spanning the last 3 months (May, June, July 2026).

### 3.1 Project 1: Personal Finances (`personal-finances`)
This project illustrates typical personal cash flow, including regular income, recurring utility costs, food spending, and lock status.

#### Custom Categories
```json
[
  { "id": "salary", "name": "Salary", "color": "#51CF66", "emoji": "💰" },
  { "id": "rent", "name": "Rent", "color": "#4DABF7", "emoji": "🏠" },
  { "id": "utilities", "name": "Utilities", "color": "#FCC419", "emoji": "⚡" },
  { "id": "food", "name": "Food", "color": "#FF6B6B", "emoji": "🍔" },
  { "id": "transport", "name": "Transport", "color": "#845EF7", "emoji": "🚗" },
  { "id": "entertainment", "name": "Entertainment", "color": "#FF8787", "emoji": "🎬" },
  { "id": "healthcare", "name": "Healthcare", "color": "#20C997", "emoji": "🏥" },
  { "id": "misc", "name": "Miscellaneous", "color": "#ADB5BD", "emoji": "📦" }
]
```

#### Budgets
```json
[
  { "category": "food", "amount": 500 },
  { "category": "rent", "amount": 1200 },
  { "category": "utilities", "amount": 200 },
  { "category": "transport", "amount": 150 },
  { "category": "entertainment", "amount": 150 },
  { "category": "healthcare", "amount": 100 },
  { "category": "misc", "amount": 50 }
]
```

#### Monthly Locks
* **May 2026**: Locked (for testing editing blocks on past transactions).
* **June 2026**: Unlocked.
* **July 2026**: Unlocked.
```json
[
  { "month": "2026-05", "locked": true, "lockedAt": "2026-06-01T08:00:00.000Z" }
]
```

#### Transactions
* **May 2026** (10 transactions)
  1. May 01: `Salary` (Income), **+$4000**, desc: "Monthly Salary", labels: `["recurring", "income"]`, hash: `"4819d9b4db70ec2323a6381673801cf9067b84db96c700e408d6d84177d5402a"`
  2. May 01: `Rent` (Expense), **-$1200**, desc: "Apartment Rental", labels: `["recurring", "fixed"]`, hash: `"80cf7503f8a02c525164bcbc9efdb1463e26f8dcf6bf5bcfcd58cfdf12b489d2"`
  3. May 03: `Utilities` (Expense), **-$180**, desc: "City Electric & Water", labels: `["utility"]`, hash: `"78c89ad5dcf023cf85289cbcae67cf7c087cf8bc27cf9cda1098cfd107b1d9c2"`
  4. May 05: `Food` (Expense), **-$75**, desc: "Whole Foods Groceries", labels: `["grocery"]`, hash: `"a873fcd024bcde58cf3a78cfdaef679237cfbc98124efda1097cf09aef82efd9"`
  5. May 08: `Transport` (Expense), **-$25**, desc: "Uber to Office", labels: `["ride-share"]`, hash: `"b7384fc0a927cbcd097cbdf8e8a719c8f0923fde1bda98cef072df91ad09ef8c"`
  6. May 12: `Food` (Expense), **-$45**, desc: "Sushi Dinner Out", labels: `["dining-out"]`, hash: `"c9284fa9cf012bc09dfbc728a7b328109bfcf908deab6bcf01aef9128f9d0c89"`
  7. May 15: `Entertainment` (Expense), **-$15**, desc: "Netflix Subscription", labels: `["subscription"]`, hash: `"d0928f0cb18a09cfbd782cd98fc1a89c09bf87236ab7cde9018e789bcde81c9a"`
  8. May 19: `Food` (Expense), **-$80**, desc: "Whole Foods Groceries", labels: `["grocery"]`, hash: `"e0921ac90bc892a09bcd234190cde098fa874cf02bfca8c909aef092d8cb8cd9"`
  9. May 22: `Entertainment` (Expense), **-$30**, desc: "Local Movie Night", labels: `["leisure"]`, hash: `"f9284ca90bc89de0a9cd2873ab012cde89bf784cf012abcf0927df890bcfc7de"`
  10. May 26: `Food` (Expense), **-$60**, desc: "Trader Joe's", labels: `["grocery"]`, hash: `"012a9bc90ef831d09bcd78a9c0ea18cf09bc87df2bfca87bc907df8cb23dce9a"`

* **June 2026** (12 transactions)
  1. June 01: `Salary` (Income), **+$4000**, desc: "Monthly Salary", labels: `["recurring", "income"]`, hash: `"12349db4db70ec2323a6381673801cf9067b84db96c700e408d6d84177d5402a"`
  2. June 01: `Rent` (Expense), **-$1200**, desc: "Apartment Rental", labels: `["recurring", "fixed"]`, hash: `"56787503f8a02c525164bcbc9efdb1463e26f8dcf6bf5bcfcd58cfdf12b489d2"`
  3. June 03: `Utilities` (Expense), **-$195**, desc: "City Electric & Water", labels: `["utility"]`, hash: `"34569ad5dcf023cf85289cbcae67cf7c087cf8bc27cf9cda1098cfd107b1d9c2"`
  4. June 05: `Food` (Expense), **-$85**, desc: "Whole Foods Groceries", labels: `["grocery"]`, hash: `"7890fcd024bcde58cf3a78cfdaef679237cfbc98124efda1097cf09aef82efd9"`
  5. June 07: `Transport` (Expense), **-$45**, desc: "Gas Station Refill", labels: `["automotive"]`, hash: `"09124fc0a927cbcd097cbdf8e8a719c8f0923fde1bda98cef072df91ad09ef8c"`
  6. June 10: `Food` (Expense), **-$55**, desc: "Italian Restaurant Lunch", labels: `["dining-out"]`, hash: `"34564fa9cf012bc09dfbc728a7b328109bfcf908deab6bcf01aef9128f9d0c89"`
  7. June 15: `Entertainment` (Expense), **-$15**, desc: "Netflix Subscription", labels: `["subscription"]`, hash: `"78908f0cb18a09cfbd782cd98fc1a89c09bf87236ab7cde9018e789bcde81c9a"`
  8. June 15: `Healthcare` (Expense), **-$120**, desc: "Dentist Visit Copay", labels: `["medical"]`, hash: `"12341ac90bc89a09bcd234190cde098fa874cf02bfca8c909aef092d8cb8cd9"`
  9. June 20: `Food` (Expense), **-$70**, desc: "Trader Joe's", labels: `["grocery"]`, hash: `"56784ca90bc89de0a9cd2873ab012cde89bf784cf012abcf0927df890bcfc7de"`
  10. June 24: `Entertainment` (Expense), **-$90**, desc: "Summer Fest Music Ticket", labels: `["concert"]`, hash: `"90129bc90ef831d09bcd78a9c0ea18cf09bc87df2bfca87bc907df8cb23dce9a"`
  11. June 28: `Food` (Expense), **-$65**, desc: "Safeway Groceries", labels: `["grocery"]`, hash: `"34563ac90bc892a09bcd234190cde098fa874cf02bfca8c909aef092d8cb8cd9"`
  12. June 30: `Transport` (Expense), **-$20**, desc: "Uber to Airport", labels: `["ride-share"]`, hash: `"78902fc0a927cbcd097cbdf8e8a719c8f0923fde1bda98cef072df91ad09ef8c"`

* **July 2026** (8 transactions - Current Month)
  1. July 01: `Salary` (Income), **+$4000**, desc: "Monthly Salary", labels: `["recurring", "income"]`, hash: `"90129db4db70ec2323a6381673801cf9067b84db96c700e408d6d84177d5402a"`
  2. July 01: `Rent` (Expense), **-$1200**, desc: "Apartment Rental", labels: `["recurring", "fixed"]`, hash: `"34567503f8a02c525164bcbc9efdb1463e26f8dcf6bf5bcfcd58cfdf12b489d2"`
  3. July 03: `Utilities` (Expense), **-$210**, desc: "City Electric & Water", notes: "High A/C usage in summer heat", labels: `["utility"]`, hash: `"78909ad5dcf023cf85289cbcae67cf7c087cf8bc27cf9cda1098cfd107b1d9c2"`
  4. July 05: `Food` (Expense), **-$90**, desc: "Whole Foods Groceries", labels: `["grocery"]`, hash: `"1234fcd024bcde58cf3a78cfdaef679237cfbc98124efda1097cf09aef82efd9"`
  5. July 08: `Transport` (Expense), **-$45**, desc: "Gas Station Refill", labels: `["automotive"]`, hash: `"56784fc0a927cbcd097cbdf8e8a719c8f0923fde1bda98cef072df91ad09ef8c"`
  6. July 12: `Food` (Expense), **-$60**, desc: "Diner Lunch with Family", labels: `["dining-out"]`, hash: `"90124fa9cf012bc09dfbc728a7b328109bfcf908deab6bcf01aef9128f9d0c89"`
  7. July 15: `Entertainment` (Expense), **-$15**, desc: "Netflix Subscription", labels: `["subscription"]`, hash: `"34568f0cb18a09cfbd782cd98fc1a89c09bf87236ab7cde9018e789bcde81c9a"`
  8. July 18: `Food` (Expense), **-$75**, desc: "Trader Joe's", labels: `["grocery"]`, hash: `"78901ac90bc892a09bcd234190cde098fa874cf02bfca8c909aef092d8cb8cd9"`

### 3.2 Project 2: SaaS Hackathon Project (`saas-hackathon`)
This project illustrates a temporary collaborative development team tracking domain, hosting, and marketing expenses, along with sponsor funding.

#### Custom Categories
```json
[
  { "id": "funding", "name": "Grants & Funding", "color": "#37B24D", "emoji": "🏆" },
  { "id": "cloud", "name": "Cloud Infrastructure", "color": "#339AF0", "emoji": "☁️" },
  { "id": "tools", "name": "Domain & SaaS Tools", "color": "#E64980", "emoji": "🔧" },
  { "id": "meals", "name": "Team Meals", "color": "#FCC419", "emoji": "🍕" },
  { "id": "marketing", "name": "Marketing & Ads", "color": "#FF922B", "emoji": "📣" }
]
```

#### Budgets
```json
[
  { "category": "cloud", "amount": 300 },
  { "category": "marketing", "amount": 500 },
  { "category": "tools", "amount": 100 },
  { "category": "meals", "amount": 200 }
]
```

#### Monthly Locks
* **June & July 2026**: All unlocked (active ongoing project).
```json
[]
```

#### Transactions
* **June 2026** (7 transactions)
  1. June 05: `funding` (Income), **+$2000**, desc: "Sponsor Hackathon Grant", labels: `["sponsor", "income"]`, hash: `"a1b2c3d4ec70ec2323a6381673801cf9067b84db96c700e408d6d84177d5402a"`
  2. June 06: `tools` (Expense), **-$15**, desc: "Domain registration", notes: "Purchased domain on Namecheap", labels: `["domain", "setup"]`, hash: `"b2c3d4e5f8a02c525164bcbc9efdb1463e26f8dcf6bf5bcfcd58cfdf12b489d2"`
  3. June 10: `meals` (Expense), **-$65**, desc: "Team Kickoff Lunch", notes: "Pizza & Soda for kickoff brainstorming", labels: `["catering"]`, hash: `"c3d4e5f6dcf023cf85289cbcae67cf7c087cf8bc27cf9cda1098cfd107b1d9c2"`
  4. June 15: `marketing` (Expense), **-$250**, desc: "Facebook Ad Campaign", notes: "User acquisition launch test", labels: `["ads"]`, hash: `"d4e5f6g724bcde58cf3a78cfdaef679237cfbc98124efda1097cf09aef82efd9"`
  5. June 18: `tools` (Expense), **-$20**, desc: "Vercel Pro Subscription", notes: "Team deployment workspace plan", labels: `["hosting", "subscription"]`, hash: `"e5f6g7h8a927cbcd097cbdf8e8a719c8f0923fde1bda98cef072df91ad09ef8c"`
  6. June 25: `meals` (Expense), **-$80**, desc: "Coding Session Dinner", notes: "Thai takeout for late night session", labels: `["catering"]`, hash: `"f6g7h8i9cf012bc09dfbc728a7b328109bfcf908deab6bcf01aef9128f9d0c89"`
  7. June 30: `cloud` (Expense), **-$85**, desc: "AWS Infrastructure Costs", notes: "EC2 & RDS instances for dev staging", labels: `["hosting"]`, hash: `"g7h8i9j0b18a09cfbd782cd98fc1a89c09bf87236ab7cde9018e789bcde81c9a"`

* **July 2026** (4 transactions - Current Month)
  1. July 02: `marketing` (Expense), **-$150**, desc: "Google Retargeting Ads", notes: "AdWords campaign for active users", labels: `["ads"]`, hash: `"h8i9j0k10bc892a09bcd234190cde098fa874cf02bfca8c909aef092d8cb8cd9"`
  2. July 05: `meals` (Expense), **-$75**, desc: "Team Status Lunch", notes: "Weekly sync up meals", labels: `["catering"]`, hash: `"i9j0k1l20bc89de0a9cd2873ab012cde89bf784cf012abcf0927df890bcfc7de"`
  3. July 10: `cloud` (Expense), **-$120**, desc: "AWS Infrastructure Costs", notes: "Increased RDS capacity due to user signups", labels: `["hosting"]`, hash: `"j0k1l2m30ef831d09bcd78a9c0ea18cf09bc87df2bfca87bc907df8cb23dce9a"`
  4. July 18: `tools` (Expense), **-$20**, desc: "Vercel Pro Subscription", notes: "Team workspace monthly fee", labels: `["hosting", "subscription"]`, hash: `"k1l2m3n40bc892a09bcd234190cde098fa874cf02bfca8c909aef092d8cb8cd9"`

---

## 4. Google Sheets Tab Schema & Alignment

To ensure that the `StorageAdapter` is fully pluggable, the fields defined in the TypeScript interfaces must align with the design of the spreadsheet structure. This ensures that switching the active implementation to the `GoogleSheetsAdapter` only replaces the persistence backend without modifying any component-level rendering logic.

### Recommended Spreadsheet Layout (Tab-by-Tab)

1. **Tab: `projects`**
   * Columns: `id`, `name`, `spreadsheetId`, `collaborators` (comma-separated list of emails).
   * Note: The master projects list could either be in a single metadata file on Drive, or each workspace is a separate spreadsheet. If each project has its own spreadsheet, the sheet itself represents the project, and other tabs live inside that spreadsheet. Having a single sheet per project is highly recommended for scalability and clean collaborator access controls.

2. **Tab: `categories`**
   * Columns: `id`, `name`, `color`, `emoji`.
   * Standard header verification checks must verify these exact column names.

3. **Tab: `transactions`**
   * Columns: `id`, `date`, `category`, `amount`, `type`, `description`, `notes`, `labels` (comma-separated list), `hash`.
   * Note: Numeric values must be written as numbers to allow sheets to compute sums natively.

4. **Tab: `budgets`**
   * Columns: `category`, `amount`.
   * Maps 1-to-1 to the configuration grid.

5. **Tab: `locks`**
   * Columns: `month` (YYYY-MM format), `locked` (TRUE/FALSE), `lockedAt` (ISO timestamp).

---

## 5. Summary & Key Recommendations

* **Extend interfaces for Categories:** The original contract in `PROJECT.md` lacks Category retrieval and saving. Incorporating `getCategories`, `saveCategory`, and `deleteCategory` in the `StorageAdapter` is essential to enable the custom category creation, editing, and customization features requested in **R2**.
* **Immutability of Locked Months:** The `LocalStorageAdapter` (and future `GoogleSheetsAdapter`) must explicitly check locks in `saveTransaction` and `deleteTransaction`. If the month matches a locked record, it must throw an Error to block mutation.
* **Pre-Seeding Triggers:** The instantiation of the storage context should detect if any projects are present in `localStorage`. If not, it executes the pre-seeding routine. This provides zero-config testing directly on startup.
* **Deduplication Hashing:** Hashing must utilize Web Crypto API in a deterministic order. We recommend computing the hash of a transaction using:
  `hash = SHA-256(date + '|' + category + '|' + amount + '|' + type + '|' + description)`
  This formula makes it simple to duplicate validation during CSV imports.
