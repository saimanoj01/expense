# E2E Test Suite Specification and Analysis Report

## 1. Observation

Directly mapping out the requirements from the core project documentation:
- **`ORIGINAL_REQUEST.md` (R1 - R6)**:
  - **R1**: Google Auth & Namespaced Storage. Map each project to a unique Google Spreadsheet. Schema auto-repair on load.
  - **R2**: Transactions with Income/Expense toggle, Date, Category, Amount, Description, Notes, Labels. Custom categories with color & emoji. Dedicated budget grid.
  - **R3**: CSV statements upload, column mapping, duplicate transaction filtering with SHA-256.
  - **R4**: Month locking, Gmail API HTML reports sent to collaborators.
  - **R5**: Dark-first glassmorphic theme. Native SVG elements for pie/donut, line trend, budget vs actual bars. Fuzzy search and multi-filtering panel.
  - **R6**: Developer Mock/Demo Mode fallback to browser `localStorage` if no valid Google Client ID is configured.
- **`PROJECT.md` Architecture**:
  - React SPA with Vite, TypeScript, and Tailwind CSS.
  - Dual-mode storage adapter: Google Workspace Mode vs. Mock/Demo Mode (persists to `localStorage`).
  - Pluggable AI stubs: `LLMAdapter` defined for reports.
- **`SCOPE.md` Interface Contracts**:
  - UI standardizes on specific `data-testid` values for critical inputs (e.g., `mock-login-btn`, `google-login-btn`, `create-project-btn`, `transaction-amount-input`, etc.).
  - Playwright is the selected E2E runner.

---

## 2. Logic Chain

1. **Deterministic Testing via Mock/Demo Mode**: Since we are in CODE_ONLY mode, and real Google OAuth tokens require user authentication or secret key generation in a live browser, automated testing must run in **Mock/Demo Mode** as its target. It allows us to verify all functional features (CRUD, budgeting, CSV import, calculations, charts, lock screens) in a fully isolated, fast, and repeatable environment.
2. **State Pre-seeding**: Rather than executing a long series of UI interactions (e.g., login -> create project -> select project -> add category -> set budget -> add 10 transactions) for every single test, we can use Playwright's `page.addInitScript()` to directly pre-seed the `localStorage` key-value pairs before the React application mounts. This:
   - Eliminates cascading failures (a bug in "Add Transaction" won't break the "Lock Month" test).
   - Accelerates test execution.
   - Permits target boundary configurations (e.g. preloading over-budget states, duplicate transactions, or corrupted JSON data).
3. **Decoupled Page Object Models (POMs)**: Implementing POMs under `tests/pages/` separates selectors from test scripts. When the UI layout or Tailwind styling changes, the spec files do not need modification; only the POM files are updated.
4. **Multi-tiered Test Structure**:
   - *Tier 1* validates that the happy-paths for all 8 features work perfectly.
   - *Tier 2* ensures bounds checking, format validation, and network/storage error-handling do not crash the app.
   - *Tier 3* checks pairwise combinations where features interact (e.g., CSV imports under locked months or mock mode data boundary namespaces).
   - *Tier 4* verifies comprehensive user journeys representing a real session from initial onboarding to end-of-month locking and multi-project reporting.

---

## 3. Caveats

- **External Integrations**: We cannot verify actual Google OAuth redirects or Gmail dispatches to Google's production servers within automated tests because they require secret tokens and multi-factor authentication. Tests will check that the API layer is called with the correct parameters (e.g. by intercepting requests or verifying console outputs in Mock Mode).
- **Console Log Interception**: The verification of month-locking HTML email generation relies on inspecting printed console output in Mock Mode. Tests must use Playwright's console log listener (`page.on('console', ...)`).
- **Time Zones**: Transaction dates and monthly locking keys are format-sensitive (YYYY-MM). Running tests in environments with mismatched timezones (e.g. UTC CI/CD runner vs local PST) may cause date offset issues. Tests must use absolute date boundaries or UTC normalization.

---

## 4. Conclusion & Plan

### A. Page Object Models (`tests/pages/`)

#### 1. `AppPage.ts` (Base & Auth)
Manages the landing page, global theme toggles, and login procedures (Mock vs. Google Auth).
```typescript
import { Page, Locator } from '@playwright/test';

export class AppPage {
  readonly page: Page;
  readonly mockLoginBtn: Locator;
  readonly googleLoginBtn: Locator;
  readonly themeToggleBtn: Locator;
  readonly mockBanner: Locator;

  constructor(page: Page) {
    this.page = page;
    this.mockLoginBtn = page.getByTestId('mock-login-btn');
    this.googleLoginBtn = page.getByTestId('google-login-btn');
    this.themeToggleBtn = page.getByTestId('theme-toggle-btn');
    this.mockBanner = page.locator('.mock-mode-banner'); // or specific class/id
  }

  async goto() {
    await this.page.goto('/');
  }

  async loginAsMock() {
    await this.mockLoginBtn.click();
  }

  async toggleTheme() {
    await this.themeToggleBtn.click();
  }
}
```

#### 2. `ProjectPage.ts` (Project Selector & Collaborators)
Manages project loading, listing, creating, and sharing.
```typescript
import { Page, Locator } from '@playwright/test';

export class ProjectPage {
  readonly page: Page;
  readonly createProjectBtn: Locator;
  readonly projectNameInput: Locator;
  readonly projectSubmitBtn: Locator;
  readonly shareProjectBtn: Locator;
  readonly collaboratorEmailInput: Locator;
  readonly collaboratorSubmitBtn: Locator;

  constructor(page: Page) {
    this.page = page;
    this.createProjectBtn = page.getByTestId('create-project-btn');
    this.projectNameInput = page.getByTestId('project-name-input');
    this.projectSubmitBtn = page.getByTestId('project-submit-btn');
    this.shareProjectBtn = page.getByTestId('share-project-btn');
    this.collaboratorEmailInput = page.getByTestId('collaborator-email-input');
    this.collaboratorSubmitBtn = page.getByTestId('collaborator-submit-btn');
  }

  async createProject(name: string) {
    await this.createProjectBtn.click();
    await this.projectNameInput.fill(name);
    await this.projectSubmitBtn.click();
  }

  async selectProject(id: string) {
    await this.page.getByTestId(`project-item-${id}`).click();
  }

  async shareProject(email: string) {
    await this.shareProjectBtn.click();
    await this.collaboratorEmailInput.fill(email);
    await this.collaboratorSubmitBtn.click();
  }
}
```

#### 3. `DashboardPage.ts` (Transactions, Budgets, & Charts)
Manages manual transaction CRUD, monthly budgeting inputs, month locking, and SVG charts assertions.
```typescript
import { Page, Locator } from '@playwright/test';

export class DashboardPage {
  readonly page: Page;
  // Transactions form
  readonly typeToggle: Locator;
  readonly amountInput: Locator;
  readonly categorySelect: Locator;
  readonly dateInput: Locator;
  readonly descInput: Locator;
  readonly notesInput: Locator;
  readonly labelsInput: Locator;
  readonly saveTxnBtn: Locator;
  // Budgets
  readonly saveBudgetsBtn: Locator;
  // Locking
  readonly lockMonthBtn: Locator;
  readonly unlockMonthBtn: Locator;
  // SVG Charts
  readonly pieChart: Locator;
  readonly trendChart: Locator;
  readonly budgetChart: Locator;

  constructor(page: Page) {
    this.page = page;
    this.typeToggle = page.getByTestId('transaction-type-toggle');
    this.amountInput = page.getByTestId('transaction-amount-input');
    this.categorySelect = page.getByTestId('transaction-category-select');
    this.dateInput = page.getByTestId('transaction-date-input');
    this.descInput = page.getByTestId('transaction-desc-input');
    this.notesInput = page.getByTestId('transaction-notes-input');
    this.labelsInput = page.getByTestId('transaction-labels-input');
    this.saveTxnBtn = page.getByTestId('save-transaction-btn');
    this.saveBudgetsBtn = page.getByTestId('save-budgets-btn');
    this.lockMonthBtn = page.getByTestId('lock-month-btn');
    this.unlockMonthBtn = page.getByTestId('unlock-month-btn');
    this.pieChart = page.getByTestId('chart-svg-pie');
    this.trendChart = page.getByTestId('chart-svg-trend');
    this.budgetChart = page.getByTestId('chart-svg-budget');
  }

  async addTransaction(data: {
    type: 'income' | 'expense';
    amount: string;
    category: string;
    date: string;
    description: string;
    notes?: string;
    labels?: string;
  }) {
    // Expect state is open or click add button
    const currentType = await this.typeToggle.getAttribute('data-active-type');
    if (currentType !== data.type) {
      await this.typeToggle.click();
    }
    await this.amountInput.fill(data.amount);
    await this.categorySelect.selectOption(data.category);
    await this.dateInput.fill(data.date);
    await this.descInput.fill(data.description);
    if (data.notes) await this.notesInput.fill(data.notes);
    if (data.labels) await this.labelsInput.fill(data.labels);
    await this.saveTxnBtn.click();
  }

  async setBudget(category: string, amount: string) {
    const input = this.page.getByTestId(`budget-input-${category}`);
    await input.fill(amount);
  }

  async saveBudgets() {
    await this.saveBudgetsBtn.click();
  }

  async lockCurrentMonth() {
    await this.lockMonthBtn.click();
  }

  async unlockCurrentMonth() {
    await this.unlockMonthBtn.click();
  }
}
```

#### 4. `CSVWizardPage.ts` (CSV File Import Wizard)
Manages file selection, mapping column fields, checking duplicate previews, and finalizing imports.
```typescript
import { Page, Locator } from '@playwright/test';

export class CSVWizardPage {
  readonly page: Page;
  readonly csvFileInput: Locator;
  readonly importBtn: Locator;
  readonly previewTable: Locator;

  constructor(page: Page) {
    this.page = page;
    this.csvFileInput = page.getByTestId('csv-file-input');
    this.importBtn = page.getByTestId('csv-import-btn');
    this.previewTable = page.getByTestId('csv-preview-table');
  }

  async uploadFile(filePath: string) {
    await this.csvFileInput.setInputFiles(filePath);
  }

  async mapColumn(sourceHeader: string, appField: string) {
    await this.page.getByTestId(`csv-map-col-${appField}`).selectOption(sourceHeader);
  }

  async clickImport() {
    await this.importBtn.click();
  }
}
```

---

### B. State Pre-seeding Blueprint

To populate the mock state before the application renders, use Playwright's `page.addInitScript()`:

```typescript
import { test, expect } from '@playwright/test';

test.describe('Dashboard Features with Pre-seeded State', () => {
  test.beforeEach(async ({ page }) => {
    // 1. Hook into browser window load to set local storage data namespace
    await page.addInitScript(() => {
      const mockProjects = [
        { id: 'proj-abc-123', name: 'Test Onboarding Project', collaborators: ['friend@gmail.com'] }
      ];
      
      const mockTransactions = [
        {
          id: 'tx-100',
          date: '2026-07-10',
          category: 'Rent',
          amount: 1500,
          type: 'expense',
          description: 'Monthly Apartment Rent',
          notes: 'Paid via bank transfer',
          labels: ['housing', 'fixed'],
          hash: '5d956a93b48227b686311de170bf0e29b1399434863ad1b0a8bb36f01a3556bf'
        },
        {
          id: 'tx-101',
          date: '2026-07-12',
          category: 'Salary',
          amount: 5000,
          type: 'income',
          description: 'Bi-weekly Direct Deposit',
          notes: 'Company LLC',
          labels: ['income'],
          hash: '6a8947f6d4ea28b488344e26217c0dfcf12a7732a39226bcf12aa219b12cfdfb'
        }
      ];

      const mockBudgets = [
        { category: 'Rent', amount: 1600 },
        { category: 'Food', amount: 400 }
      ];

      const mockLocks = [
        { month: '2026-06', locked: true, lockedAt: '2026-06-30T23:59:59Z' },
        { month: '2026-07', locked: false }
      ];

      // Save arrays as JSON strings matching implementation keys
      window.localStorage.setItem('expense_projects', JSON.stringify(mockProjects));
      window.localStorage.setItem('expense_active_project_id', 'proj-abc-123');
      window.localStorage.setItem('expense_txs_proj-abc-123', JSON.stringify(mockTransactions));
      window.localStorage.setItem('expense_budgets_proj-abc-123', JSON.stringify(mockBudgets));
      window.localStorage.setItem('expense_locks_proj-abc-123', JSON.stringify(mockLocks));
      window.localStorage.setItem('expense_theme', 'dark');
      // Set indicator that auth is bypassed
      window.localStorage.setItem('expense_mock_session', 'true');
    });
  });

  test('should load pre-seeded transaction table and charts', async ({ page }) => {
    await page.goto('/');
    // Verification actions go here...
  });
});
```

---

### C. Tier 1: Feature Coverage (>= 5 Happy-Path per feature, total 40)

#### Feature 1: Google Auth
1. **Login Toggle Navigation**: Opening the landing page displays both a Google OAuth Login button (`google-login-btn`) and a Mock Login button (`mock-login-btn`). Clicking either initializes credentials.
2. **Mock Authentication Flow**: Click `mock-login-btn`. User transitions to the main dashboard immediately, bypassing actual Google redirects.
3. **Session Verification**: Once logged in via Mock, refreshing the page keeps the user logged in, loading the same mock session state instead of returning to the login form.
4. **Log Out Action**: Click the log out button. Verifies local session indicators (tokens/flags) are cleared and page redirects back to `/` displaying the login prompt.
5. **Route Guarding**: Accessing `/dashboard` directly without login redirects the browser to the home/login screen.

#### Feature 2: Project Storage (Drive/Sheets)
6. **Onboarding Project Creation**: Logs in for the first time (with empty `localStorage`). App displays a modal forcing the creation of a "Default Project".
7. **Multiple Projects Listing**: Under the project selector dropdown/grid, verify multiple projects display with correct naming labels.
8. **Switching Projects**: Switching from Project A to Project B changes the active project context, displaying transaction records specific to Project B.
9. **Project Sharing Submission**: Select project, open Sharing settings, fill collaborator email, submit. Confirm the email displays in the list of project collaborators.
10. **Schema Checker Pass**: On loading a project, schema validation matches sheets structure. No error dialog appears, and data loads directly into the grids.

#### Feature 3: Manual Transactions
11. **Expense Submission**: Open the Transaction modal, select Date, "Expense" type, Category "Food", Amount "25.50", and Description. Click submit. Transaction appears in list, subtracting from savings KPIs.
12. **Income Submission**: Open modal, switch toggle to "Income", select Category "Salary", Amount "1000.00", Description. Click submit. Transaction appears with positive styling, adding to saving KPIs.
13. **Transaction Details Update**: Click "Edit" on a transaction, alter Amount from $25.50 to $30.00, and save. Check that list updates and math adjusts.
14. **Transaction Deletion**: Click "Delete" on a transaction. Verify that the row is removed from DOM and KPIs re-calculate.
15. **Filter by Label/Tag**: Click on a tag `#fixed` in the transactions grid or filter panel. Verify only rows containing that tag are visible.

#### Feature 4: Monthly Budgeting
16. **Budget Grid Input & Persistence**: Navigate to Budgets panel. Fill "Food" with $300 and "Rent" with $1200. Click "Save Budgets". Reload page, verify values remain.
17. **New Category Creation**: Click "Add Category", enter Name: "Entertainment", Color: "#FF00FF", Emoji: "🎬". Click Save. Verify it displays in transaction categories list and budget grids.
18. **Budget Utilization Percentage**: Pre-seed a budget of $100 for "Food" and a transaction of $60 in "Food". Verify the UI progress bar displays "60%" or "60/100".
19. **Budget Calculations Propagation**: Modify the budget of an active category. Verify that total budget allocations KPI updates instantly.
20. **Custom Category Editing**: Select an existing category, change its color, and confirm all labels matching that category change to the new color.

#### Feature 5: CSV Statement Import & Deduplication
21. **Column Mapping Alignment**: Open Import Wizard. Upload a mock CSV containing columns `Date, Description, Debit, Credit`. Assign columns to standard fields. Click next.
22. **Transaction Preview Rendering**: Verify the CSV import preview table displays the structured list of parsed transaction rows correctly.
23. **Importing Debit (Expense) & Credit (Income)**: Confirm that lines with Debit values compile as "Expense" transactions, and lines with Credit values compile as "Income" transactions.
24. **Duplicate Highlighting**: Upload a CSV where one row matches an existing transaction's SHA-256 hash. Verify that row is greyed out/highlighted and has its import checkbox unchecked by default.
25. **Finalizing Import**: Commit imports. Verify that the table updates with only the selected rows and new hashes populate storage.

#### Feature 6: Month Locking & Email Reports
26. **Locking Lockout States**: Navigate to month "2026-07" and click "Lock Month". Add Transaction, Edit, and Delete buttons become hidden or disabled for July 2026.
27. **Lock Confirmation Console Event**: When locking a month, inspect console messages. Confirm a full HTML payload containing email details (Subject: "Monthly Report", HTML content) is printed.
28. **Collaborator Inclusion**: Check that the generated email report lists correct project collaborator emails in the CC/Recipient array parameters.
29. **Email Content KPIs**: Inspect locked report payload. Verify that the math calculates correct sums (Total Income, Total Expense, Net Savings) matching UI dashboard values.
30. **Month Unlocking Restore**: Click "Unlock Month". Verify lock record is removed and transaction action buttons become active.

#### Feature 7: UI/UX & SVG/CSS Charts
31. **Pie Chart Portions**: Add $80 expense in "Rent" and $20 in "Food". Verify the pie chart SVG has at least two path segments, and that the path geometries reflect an 80/20 ratio.
32. **Trend Chart Path**: Pre-seed transaction data across 3 consecutive months. Confirm the Monthly Trend SVG path element contains multiple coordinate segments mapping the spending slope.
33. **Budget vs Actual Rects**: Pre-seed a $100 budget and $50 expense. Confirm the Budget vs. Actual SVG contains dual bars for the category, and the actual bar height is 50% of the budget bar height.
34. **Theme Switch Stylesheet**: Toggle between Light/Dark modes. Verify `html` tag updates its classes (`dark` vs `light`), and background CSS color variables update (e.g. text shifts to white).
35. **Chart Responsive Scaling**: Resize window to 320px width. Verify charts scale inside container widths and do not overflow page boundaries.

#### Feature 8: Mock/Demo Mode
36. **Auto-fallback Detection**: Run app without setting `VITE_GOOGLE_CLIENT_ID` environment variables. Confirm mock mode banner appears at the top.
37. **Mock Database Seed Verification**: Confirm that mock database preloads at least one default project with multiple transactions and budgets.
38. **LocalStorage Mutation Storage**: Add a transaction under mock mode. Retrieve `localStorage` item through browser execution and verify the item lists the new entry.
39. **Mock Google Signin Button**: The "Sign in with Google" button works similarly to Mock Login button in mock mode, immediately redirecting to dashboard with dummy email profile.
40. **Offline API Simulation**: Execute a budget save command. Observe zero network failures, confirming data routing relies wholly on synchronous mock adapters.

---

### D. Tier 2: Boundary & Corner Cases (>= 5 per feature, total 40)

#### Feature 1: Google Auth
1. **OAuth Token Expiry**: Pre-seed an expired oauth token state. Load app, trigger an API request. Verify the app captures the 401 error, clears auth local storage, and shows a "Session Expired" re-login modal.
2. **Access Cancelled Callback**: Simulate Google OAuth returning with error code `error=access_denied`. Confirm the app remains on the login page and renders an error notification banner.
3. **Mangled Token Recovery**: Set a corrupt JWT/token string in authentication storage. Load app. Verify page does not crash but clears the token and prompts user to authenticate.
4. **Network Offline during Sign-in**: Intercept login calls using Playwright API intercepts, setting network state to offline. Confirm user is presented with a retry option and detailed connection warning.
5. **Multiple Quick Authentication Submissions**: Click the login button multiple times rapidly. Verify only one OAuth flow initiates, blocking duplicate session creations.

#### Feature 2: Project Storage (Drive/Sheets)
6. **Spreadsheet Deletion Recover**: Load the app with a pre-seeded project ID whose mock spreadsheet is marked "deleted". The app must display a warning: "Spreadsheet not found in Drive. Create a new one or link an existing file?"
7. **Broken Schema Repairs**: Pre-seed spreadsheet data headers that miss critical columns (e.g. missing `SHA-256 Hash` column header). Load project. Verify the schema repair routine runs, adds the header, and syncs back.
8. **Drive API 429 Quota Rate Limits**: Simulate a 429 rate-limiting response from Google API. Confirm that the storage service retries using exponential backoff and informs the user: "Google API busy, retrying..."
9. **Project Name Edge Cases**: Create a project named `!@#$ %^&*()_+={}[]|\\:;"'<>,.?/~` and emojis `💸📈`. Verify that paths, routes, and dropdown labels display the symbols safely.
10. **Write Conflict Collision**: Mock the Sheets API response to show the spreadsheet has a newer version token than local storage. App must prompt user: "Changes detected on Sheets. Merge or Overwrite?"

#### Feature 3: Manual Transactions
11. **Negative and Zero Amounts**: Enter `-50` and `0` in transaction amount field. Confirm form validation displays an error: "Amount must be greater than 0" and prevents submit.
12. **Future and Past Dates Limits**: Enter dates like `1900-01-01` or `2100-12-31`. Validate if app warns about extreme dates.
13. **Extremely Large Amounts**: Enter `9999999999.99` in amount. Confirm dashboard totals round properly without floating-point errors (use decimal scaling) and numeric layouts do not overlap other UI blocks.
14. **Special Character Tags**: Add labels like `<script>` and `&nbsp;`. Verify text compiles as plain text tags and does not execute script injections (XSS check).
15. **Description Empty Bounds**: Submit transaction with a whitespace-only description. Form validation prevents submit or forces default "Manual Transaction" placeholder description.

#### Feature 4: Monthly Budgeting
16. **Negative Budget Values**: Attempt to input `-100` into category budgets. Verify input is either blocked by keyboard filters or triggers form validation error.
17. **Duplicate Category Names**: Attempt to create custom category "Food" when it already exists. Displays: "Category already exists".
18. **Over-budget Visual State**: Pre-seed $50 budget and $50.01 expense. Verify category progress indicator shows over-spent indicators (e.g. red status badge, width capped at 100%).
19. **Mass Category Load**: Create 30 custom categories. Verify the budget layout wraps or creates scroll selectors rather than blowing past footer grid bounds.
20. **Invalid Hex Color Fallbacks**: Provide a corrupted category color code like `#FFFFFZZ` or empty string. Check that the UI defaults to a fallback color styling without error.

#### Feature 5: CSV Statement Import & Deduplication
21. **Malformed CSV Parse**: Upload an image file renamed to `statement.csv`. Verify parser shows: "Unable to parse CSV. Please verify file format" and blocks import wizard.
22. **Partial Mapping Submissions**: Leave "Date" unmapped in column mapper, but map others. Try to import. Confirm wizard alerts: "Date column is required" and holds step.
23. **Mismatched Date Formats**: Upload CSV containing multiple date formats (`07/12/26`, `2026.07.12`, `12-Jul-2026`). Verify parser parses all dates to standardized `YYYY-MM-DD`.
24. **100% Duplicate File**: Upload a CSV where all transactions match stored SHA-256 hashes. Verify "Select All" checkmark defaults to disabled, and import button remains disabled.
25. **Empty CSV Upload**: Upload an empty CSV file. Verify warning appears: "No rows found in this file".

#### Feature 6: Month Locking & Email Reports
26. **Locking Empty Months**: Lock a month with zero transactions and zero budgets. Verify locking completes safely, email compiles showing 0 values, and no NaN results display.
27. **Locked Write Rejection**: Programmatically attempt to trigger a transaction save API call targeted at a locked month. Verify backend/adapter rejects with "Cannot write to locked month".
28. **Gmail API Network Timeout**: Intercept the lock API email send and delay it to simulate timeout. Confirm the app unlocks the month (rolls back local state) and displays: "Report email failed to send. Lock aborted."
29. **Locked KPI Recalculation Protection**: Add a transaction to an unlocked month (e.g. June). Verify it does not alter values in a locked month (e.g. May).
30. **Spam Clicking Locks**: Click "Lock Month" twice in rapid succession. Verify only one request processes, and no duplicate locks or reports publish.

#### Feature 7: UI/UX & SVG/CSS Charts
31. **No Data Chart State**: View monthly dashboard for an empty month. Charts display a centered text node: "No data available for this month" instead of breaking SVG grids.
32. **Line/Area Chart Single Point**: Enter exactly one transaction for a month. Verify trend chart plots a single coordinate point/horizontal line without SVG path syntax errors.
33. **Zero Budget Height Render**: Set category budget to $0 and add $50 actual. Verify Budget vs Actual chart handles divide-by-zero, drawing actual bar properly relative to other categories.
34. **Extreme Category Names Truncate**: Create a category named `HousingRentAndUtilitiesInsuranceMaintenanceAndGeneralRepairs`. Verify chart legends display truncated labels (`HousingRentAnd...`) rather than bleeding over charts.
35. **Negative Line Plot Coordinates**: Pre-seed negative savings (Expense > Income). Verify monthly trend chart translates negative amounts into proper coordinates above/below zero axis.

#### Feature 8: Mock/Demo Mode
36. **LocalStorage Write Limit**: Simulate `QuotaExceededError` in local storage write mock. Verify the app logs error, warns user "Storage full, session is read-only", and continues to work in-memory.
37. **Corrupted Local Storage Cleanup**: Insert corrupted string `{"active_project": null, ...` in local storage. Reload app. App detects corrupt layout, cleans storage keys, and prompts onboarding setup.
38. **State Eviction during Usage**: Clear `localStorage` programmatically mid-session. Execute a transaction add. The app re-initializes mock workspace structures cleanly.
39. **Mock Data Isolation**: Toggle off mock mode. Verify that mock data from `localStorage` is isolated and does not sync to the newly authenticated Google Sheets account.
40. **Mock SHA-256 Hash Matching**: Confirm that SHA-256 generation in mock mode runs identically, catching identical duplicates as those calculated in real Google Mode.

---

### E. Tier 3: Cross-Feature Combinations (>= 8 Pairwise Interactions)

1. **Google Auth + Project Storage**: Logging in via Mock login prompts project schema validation. If the schema validator detects outdated mock spreadsheet tables, it triggers auto-repair on the localStorage database object, and successfully loads the new structures.
2. **Project Storage + Manual Transactions + SVG Charts**: Switch project from Project A (total expenses $2000) to Project B (total expenses $150). Confirm that the active database state switches, updating the transaction grid DOM AND updating the SVG Pie Chart segments to render paths corresponding to Project B's categories and math.
3. **Manual Transactions + Monthly Budgeting + SVG Charts**: Create transaction of $120 in category "Utilities" for July 2026. Modify the July 2026 "Utilities" budget to $100. Confirm the SVG Budget vs. Actual chart draws the actual bar higher than the budget bar (over-spent visual styling).
4. **CSV Import + Manual Transactions + Deduplication**: Add a manual transaction for $15.99 on 2026-07-15 at "Supermarket". Import a CSV sheet containing a row with the identical $15.99 amount, date, and description. Verify that the SHA-256 deduplicator marks the imported CSV row as a duplicate, checking for overlaps against manual transaction records.
5. **Month Locking + Manual Transactions + Monthly Budgeting**: Set category budgets and transactions for July 2026. Lock July 2026. Verify that adding a manual transaction is blocked AND the budget input elements for July 2026 are set to `disabled="true"` in the budget grid.
6. **CSV Import + Month Locking**: Import a CSV statement containing transactions spanning two months: June 2026 (unlocked) and May 2026 (locked). Verify the CSV wizard excludes or warns about rows belonging to the locked month (May 2026), permitting import only for June 2026.
7. **Mock Mode + CSV Import + Project Storage**: Activate mock mode. Create a new project. Import a bank CSV. Confirm that the imported rows are correctly namespaced in `localStorage` under the key corresponding specifically to the newly created project ID.
8. **Month Locking + Email Report + Collaborators (Project Storage)**: Share active project with emails `team1@company.com` and `team2@company.com`. Lock current month. Capture the console-logged email payload. Verify the recipient list contains both `team1@company.com` and `team2@company.com`.

---

### F. Tier 4: Real-world Application Scenarios (>= 5 User Flows)

#### Flow 1: New User Onboarding & Initial Budgeting
1. User loads landing page without environment configurations.
2. App detects missing client credentials, displays a banner, and forces "Mock Login".
3. User clicks "Mock Login".
4. Onboarding modal appears: "Welcome! Create your first Expense Project."
5. User enters project name: "House Expenses". Clicks submit.
6. User goes to Budgets section, enters $500 for "Food" and $1200 for "Rent". Clicks Save.
7. User adds a manual transaction: Type = Expense, Category = Rent, Amount = 1200, Date = 2026-07-01.
8. User adds a manual transaction: Type = Expense, Category = Food, Amount = 150, Date = 2026-07-03.
9. **Assertion**: Verify Total Expense KPI shows $1350, Remaining Budget shows $350 ($500 - $150), and SVG charts display Rent (88.8%) and Food (11.1%) segments.

#### Flow 2: Bank Statement Upload & Reconciliation
1. User logs in, selects project "House Expenses".
2. User clicks "Import CSV" to launch wizard.
3. User uploads a standard CSV file with headers: `TxDate, PayeeName, Outflow, Inflow`.
4. User maps `TxDate` -> Date, `PayeeName` -> Description, `Outflow` -> Debit, `Inflow` -> Credit. Click Next.
5. In the preview step, user reviews 4 rows. Row 2 (payment of $1200 to Rent on 2026-07-01) is flagged as a duplicate of the manual transaction from Flow 1. It is disabled and unchecked.
6. User leaves other 3 rows checked and clicks "Execute Import".
7. **Assertion**: Verify transaction list contains exactly 5 entries (2 initial + 3 imported), the Rent transaction is not duplicated, and the new total expense KPI updates correctly.

#### Flow 3: End of Month Locking and Report Dispatch
1. User opens the active project "House Expenses".
2. User clicks "Share Project", adds email `partner@gmail.com`.
3. User reviews July 2026 transactions, checking descriptions and adding labels (`#essential`).
4. User clicks "Lock Month" button.
5. Modal alerts: "Locking month will send report to partner@gmail.com. Proceed?" User clicks Confirm.
6. **Assertion**: Lock status updates to "Locked" in UI. Add/Edit/Delete transaction controls disappear. Console logs verify the HTML report payload compiled with "partner@gmail.com" recipient and monthly KPI values.

#### Flow 4: Mode Shift (Transition to Google Authentication)
1. User starts on landing page. They toggle the OAuth flow by adding mock client variables (or toggling the Auth Mode selector in Dev tools).
2. User clicks "Sign in with Google" (Google OAuth).
3. Google Auth flow completes. User is navigated to dashboard.
4. User creates a new project: "Drive Sync Project".
5. App creates a Google Spreadsheet and queries details from Drive.
6. User enters a transaction of $75.
7. **Assertion**: Verify that transaction does NOT write to local storage's mock namespaces, and instead invokes Sheets API mock mock-handlers representing real sheets sync (asserting correct sheets API calls).

#### Flow 5: Multi-Project Allocation & Tracking
1. User logs in, creates Project 1 ("Vacation") and Project 2 ("Business").
2. User switches to Project 1. Adds expense: Flight, $800. Sets budget: Travel, $1000.
3. User switches to Project 2. Adds expense: Client Dinner, $150. Sets budget: Meals, $300.
4. User toggles back to Project 1.
5. **Assertion**: Verify Flight transaction ($800) displays, total spent shows $800, and Business transaction ($150) is hidden.
6. User toggles back to Project 2.
7. **Assertion**: Verify Dinner transaction ($150) displays, total spent shows $150, and Vacation transaction is hidden.

---

## 5. Verification Method

To verify these specifications independently:

### A. Execution Commands
1. Install testing dependencies:
   ```bash
   npm install -D @playwright/test
   ```
2. Run the full suite:
   ```bash
   npx playwright test
   ```
3. Run a specific specification tier:
   ```bash
   npx playwright test tests/specs/tier1_features.spec.ts
   ```
4. Run tests in UI mode to visual-debug charts:
   ```bash
   npx playwright test --ui
   ```

### B. Invalidation Conditions
The test suite or specifications will be considered invalid if:
- Real Google client credentials are hardcoded or required to execute the test suite (it must run completely out-of-the-box using the Mock/Demo mode adapters).
- Selector mechanisms bypass `data-testid` where defined by the `SCOPE.md` contracts.
- Any test directly mutates files inside the `.agents/` folder, violating layout policies.
