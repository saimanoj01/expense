# Project: Expense Tracker and Budget Planning

## Architecture
This is a serverless, decentralized web application built as a React SPA with Vite, TypeScript, and Tailwind CSS.
- **Frontend**: SPA running entirely in the browser, deployable on GitHub Pages.
- **Storage/DB**: Dual-mode storage adapter.
  - **Google Workspace Mode**: Uses Google Drive API (for file listing, sharing, permissions) and Google Sheets API (for spreadsheet CRUD operations) as a serverless database.
  - **Mock/Demo Mode**: Falls back to browser `localStorage` with pre-seeded data when no Google API configurations are available.
- **Authentication**: Google OAuth 2.0 (Implicit flow or Authorization Code flow for frontend).
- **Email Reports**: Sent via Google Gmail API using HTML templates.
- **Visualizations**: Native SVG/CSS charting elements (pie/donut, area/line trends, budget vs actual bars). No external charting libraries allowed.

## Milestones
| # | Name | Scope | Dependencies | Status | Conversation ID |
|---|------|-------|--------------|--------|-----------------|
| 1 | E2E Testing Track | Create the E2E test harness, Tier 1-4 test cases, and publish `TEST_READY.md`. | None | DONE | 824a5e95-0d38-43c5-9527-d5eae73a2c6f |
| 2 | Milestone 1: Project Init & Mock framework | Scaffold Vite + React + TS + Tailwind. Build mock storage adapter and state context. | None | DONE | ac2e06f6-cfee-4048-b2e7-34addfb2f3cd |
| 3 | Milestone 2: Dashboard UI & CRUD (Mock Mode) | Implement glassmorphism dashboard, native SVG/CSS charts, transactions list (fuzzy search, filters, CRUD), and budget configuration grid. | M1 | DONE | ac2e06f6-cfee-4048-b2e7-34addfb2f3cd |
| 4 | Milestone 3: CSV Import & Deduplication | Build CSV import wizard with column mapping and SHA-256 deduplication. | M2 | DONE | ac2e06f6-cfee-4048-b2e7-34addfb2f3cd |
| 5 | Milestone 4: Google Auth & Drive/Sheets Sync | Integrate Google Auth 2.0, Drive folder/sheet search & creation, Sheets read/write CRUD, and schema auto-repair validation. | M3 | DONE | ac2e06f6-cfee-4048-b2e7-34addfb2f3cd |
| 6 | Milestone 5: Month Locking & Gmail Reports | Month locking/unlocking, fetch project collaborators, and Gmail API HTML report dispatch. | M4 | DONE | ac2e06f6-cfee-4048-b2e7-34addfb2f3cd |
| 7 | Milestone 6: Final E2E Test Pass & Hardening | Run all E2E tests (Tiers 1-4), resolve any defects, and perform white-box adversarial testing for Tier 5. | M5, M1 | DONE | 94df9fbf-f918-40a5-91d0-9dd879985770 |

## Interface Contracts
### Storage Service (`src/services/storage.ts`)
```typescript
export interface Transaction {
  id: string;
  date: string;
  category: string;
  amount: number;
  type: 'income' | 'expense';
  description: string;
  notes: string;
  labels: string[];
  hash: string; // SHA-256 of details for deduplication
}

export interface Budget {
  category: string;
  amount: number;
}

export interface Project {
  id: string;
  name: string;
  spreadsheetId?: string;
  collaborators?: string[];
}

export interface MonthlyLock {
  month: string; // YYYY-MM
  locked: boolean;
  lockedAt?: string;
}

export interface StorageAdapter {
  getProjects(): Promise<Project[]>;
  createProject(name: string): Promise<Project>;
  getTransactions(projectId: string): Promise<Transaction[]>;
  saveTransaction(projectId: string, transaction: Transaction): Promise<Transaction>;
  deleteTransaction(projectId: string, transactionId: string): Promise<void>;
  getBudgets(projectId: string): Promise<Budget[]>;
  saveBudgets(projectId: string, budgets: Budget[]): Promise<void>;
  getLocks(projectId: string): Promise<MonthlyLock[]>;
  saveLock(projectId: string, lock: MonthlyLock): Promise<void>;
}
```

### LLM Stubs (`src/services/llm.ts`)
```typescript
export interface LLMResponse {
  content: string;
}

export interface LLMAdapter {
  generateReportSummary(transactions: Transaction[], budgets: Budget[]): Promise<LLMResponse>;
}
```

## Code Layout
- `src/`: Main source folder
  - `components/`: UI components (Dashboard, Charts, Forms, CSVWizard, ProjectSelector, Common)
  - `services/`: API services (storage, googleApi, llm)
  - `context/`: App state providers (AppContext, AuthContext)
  - `hooks/`: Custom hooks
  - `utils/`: Helper functions (csvParser, crypto, date)
  - `styles/`: CSS styles (animations, glassmorphism)
- `tests/`: E2E test suite and mock datasets
- `public/`: Static assets
