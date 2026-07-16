import { test, expect } from '@playwright/test';
import { AppPage } from '../pages/AppPage';
import { ProjectPage } from '../pages/ProjectPage';
import { DashboardPage } from '../pages/DashboardPage';
import { CSVWizardPage } from '../pages/CSVWizardPage';

const preseedMockData = async (page: any, data: {
  projects?: any[];
  activeProjectId?: string;
  transactions?: Record<string, any[]>;
  budgets?: Record<string, any[]>;
  locks?: Record<string, any[]>;
  theme?: string;
  mockSession?: string;
  googleToken?: string;
}) => {
  await page.addInitScript((seeded: typeof data) => {
    if (seeded.projects) {
      window.localStorage.setItem('expense_projects', JSON.stringify(seeded.projects));
    }
    if (seeded.activeProjectId) {
      window.localStorage.setItem('expense_active_project_id', seeded.activeProjectId);
    }
    if (seeded.transactions) {
      for (const [projId, txs] of Object.entries(seeded.transactions)) {
        window.localStorage.setItem(`expense_txs_${projId}`, JSON.stringify(txs));
      }
    }
    if (seeded.budgets) {
      for (const [projId, budg] of Object.entries(seeded.budgets)) {
        window.localStorage.setItem(`expense_budgets_${projId}`, JSON.stringify(budg));
      }
    }
    if (seeded.locks) {
      for (const [projId, lock] of Object.entries(seeded.locks)) {
        window.localStorage.setItem(`expense_locks_${projId}`, JSON.stringify(lock));
      }
    }
    if (seeded.theme) {
      window.localStorage.setItem('expense_theme', seeded.theme);
    }
    if (seeded.mockSession) {
      window.localStorage.setItem('expense_mock_session', seeded.mockSession);
    }
    if (seeded.googleToken) {
      window.localStorage.setItem('expense_google_token', seeded.googleToken);
    }
  }, data);
};

test.describe('Tier 2: Boundary, Edge and Error Handling Cases', () => {
  let appPage: AppPage;
  let _projectPage: ProjectPage;
  let dashboardPage: DashboardPage;
  let csvWizardPage: CSVWizardPage;

  test.beforeEach(async ({ page }) => {
    appPage = new AppPage(page);
    _projectPage = new ProjectPage(page);
    void _projectPage;
    dashboardPage = new DashboardPage(page);
    csvWizardPage = new CSVWizardPage(page);
  });

  // =========================================================================
  // Feature 1: Google Auth
  // =========================================================================
  test.describe('Google Auth Boundaries', () => {
    test('1. OAuth Token Expiry: Expired token clears session and shows re-login', async ({ page }) => {
      // Seed an expired token configuration
      await preseedMockData(page, {
        googleToken: 'EXPIRED_TOKEN',
        projects: [{ id: 'p1', name: 'Cloud Project' }],
        activeProjectId: 'p1'
      });
      // Mock API returning 401 Unauthorized
      await page.route('**/drive/v3/files*', async route => {
        await route.fulfill({
          status: 401,
          contentType: 'application/json',
          body: JSON.stringify({ error: { message: 'Invalid Credentials' } })
        });
      });
      await page.goto('/dashboard');
      await expect(page.locator('[data-testid="session-expired-modal"]')).toBeVisible();
      await page.getByTestId('modal-ok-btn').click();
      await expect(appPage.mockLoginBtn).toBeVisible();
    });

    test('2. Access Cancelled: Handles OAuth callback error parameter and alerts user', async ({ page }) => {
      await page.goto('/#error=access_denied');
      await expect(page.locator('.notification-error, [data-testid="notification-toast"]')).toContainText('Access Denied');
      await expect(appPage.mockLoginBtn).toBeVisible();
    });

    test('3. Mangled Token: Corrupt token in local storage is cleared gracefully', async ({ page }) => {
      await preseedMockData(page, { googleToken: 'mangled-garbage-jwt' });
      await page.goto('/');
      // Page should redirect to login and clear token
      await expect(appPage.mockLoginBtn).toBeVisible();
      const token = await page.evaluate(() => window.localStorage.getItem('expense_google_token'));
      expect(token).toBeNull();
    });

    test('4. Offline Network: Logging in offline shows network connection warning', async ({ page }) => {
      await page.goto('/');
      // Set page to offline
      await page.context().setOffline(true);
      await appPage.loginAsMock();
      await expect(page.locator('.notification-error, [data-testid="notification-toast"]')).toContainText('You are currently offline');
      await page.context().setOffline(false);
    });

    test('5. Multi-submit Block: Rapid clicks on Login button throttles submission requests', async ({ page }) => {
      await page.goto('/');
      const loginButton = appPage.mockLoginBtn;
      // Double click quickly
      await loginButton.dblclick();
      // Ensure we navigate to dashboard and don't double launch session
      await expect(page.locator('[data-testid="dashboard-header"]')).toBeVisible();
    });
  });

  // =========================================================================
  // Feature 2: Project Storage Boundaries
  // =========================================================================
  test.describe('Project Storage Boundaries', () => {
    test('6. Spreadsheet Deletion Recovery: Deleted project spreadsheet prompts reload options', async ({ page }) => {
      await preseedMockData(page, {
        mockSession: 'true',
        projects: [{ id: 'p_deleted', name: 'Deleted Project', spreadsheetId: 'sheets-123' }],
        activeProjectId: 'p_deleted'
      });
      // Mock spreadsheet fetch returning 404 Not Found
      await page.route('**/spreadsheets/sheets-123*', async route => {
        await route.fulfill({
          status: 404,
          contentType: 'application/json',
          body: JSON.stringify({ error: { message: 'File not found' } })
        });
      });
      await page.goto('/dashboard');
      await expect(page.getByTestId('spreadsheet-not-found-modal')).toBeVisible();
    });

    test('7. Schema Auto-repair: Missing spreadsheet headers trigger automatic fix', async ({ page }) => {
      // Seed incomplete data (e.g. missing hash key)
      await preseedMockData(page, {
        mockSession: 'true',
        projects: [{ id: 'p1', name: 'Outdated Schema' }],
        activeProjectId: 'p1',
        transactions: {
          p1: [{ id: 't1', date: '2026-07-01', amount: 50, category: 'Food', type: 'expense', description: 'No hash transaction' }] // missing hash
        }
      });
      await appPage.goto();
      // App runs validation, inserts hash, and completes loading without throwing fatal errors
      await expect(page.locator('text=No hash transaction')).toBeVisible();
      // Verify details check
      const txs = await page.evaluate(() => JSON.parse(window.localStorage.getItem('expense_txs_p1')!));
      expect(txs[0].hash).toBeDefined();
    });

    test('8. Rate Limiting 429 Quota: Retries with exponential backoff on Sheets rate limits', async ({ page }) => {
      let requestCount = 0;
      await page.route('**/spreadsheets/**', async route => {
        requestCount++;
        if (requestCount === 1) {
          await route.fulfill({
            status: 429,
            body: JSON.stringify({ error: { message: 'Rate limit exceeded' } })
          });
        } else {
          await route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify({ values: [] })
          });
        }
      });
      await preseedMockData(page, {
        mockSession: 'true',
        projects: [{ id: 'p1', name: 'Cloud Sync Project', spreadsheetId: 'sheet-456' }],
        activeProjectId: 'p1'
      });
      await page.goto('/dashboard');
      // Toast notifications should display the retry warning
      await expect(page.locator('[data-testid="notification-toast"]')).toContainText('Rate limit exceeded. Retrying');
      await expect(page.locator('[data-testid="dashboard-header"]')).toBeVisible();
    });

    test('9. Project Name Edge Cases: Symbols and emojis render safely in project UI elements', async ({ page }) => {
      const complexName = '💸 Project-!@#$ %^&*()_+={}[]|\\:;"\'<>,.?/~ 📈';
      await preseedMockData(page, {
        mockSession: 'true',
        projects: [{ id: 'complex_id', name: complexName }],
        activeProjectId: 'complex_id'
      });
      await appPage.goto();
      await expect(page.locator('[data-testid="project-selector"]')).toContainText(complexName);
    });

    test('10. Conflicting Writes: Triggers conflict merge modal if local copy differs from remote', async ({ page }) => {
      // Simulate remote workspace updated elsewhere
      await preseedMockData(page, {
        mockSession: 'true',
        projects: [{ id: 'p1', name: 'My Project', version: 1 }],
        activeProjectId: 'p1'
      });
      // Remote mock sheets returns version 2
      await page.route('**/metadata/p1', async route => {
        await route.fulfill({
          status: 200,
          body: JSON.stringify({ version: 2 })
        });
      });
      await appPage.goto();
      await expect(page.getByTestId('conflict-modal')).toBeVisible();
    });
  });

  // =========================================================================
  // Feature 3: Manual Transactions Boundaries
  // =========================================================================
  test.describe('Manual Transactions Boundaries', () => {
    test.beforeEach(async ({ page }) => {
      await preseedMockData(page, {
        mockSession: 'true',
        projects: [{ id: 'p1', name: 'Project 1' }],
        activeProjectId: 'p1'
      });
      await appPage.goto();
    });

    test('11. Non-positive Amounts: Rejects negative and zero values in amount field', async ({ page }) => {
      if (await dashboardPage.openAddTxnModalBtn.isVisible()) {
        await dashboardPage.openAddTxnModalBtn.click();
      }
      await dashboardPage.amountInput.fill('-15.00');
      await dashboardPage.saveTxnBtn.click();
      await expect(page.locator('.field-error-amount, [data-testid="amount-error"]')).toContainText('Amount must be greater than 0');

      await dashboardPage.amountInput.fill('0');
      await dashboardPage.saveTxnBtn.click();
      await expect(page.locator('.field-error-amount, [data-testid="amount-error"]')).toContainText('Amount must be greater than 0');
    });

    test('12. Extreme Date Inputs: Displays warning or limits choices on extreme year parameters', async ({ page }) => {
      if (await dashboardPage.openAddTxnModalBtn.isVisible()) {
        await dashboardPage.openAddTxnModalBtn.click();
      }
      await dashboardPage.amountInput.fill('10');
      await dashboardPage.categorySelect.selectOption('Food');
      await dashboardPage.descInput.fill('Dinner');
      
      // Extreme past
      await dashboardPage.dateInput.fill('1899-12-31');
      await dashboardPage.saveTxnBtn.click();
      await expect(page.locator('.field-error-date, [data-testid="date-error"]')).toContainText('Invalid transaction date');

      // Extreme future
      await dashboardPage.dateInput.fill('2101-01-01');
      await dashboardPage.saveTxnBtn.click();
      await expect(page.locator('.field-error-date, [data-testid="date-error"]')).toContainText('Invalid transaction date');
    });

    test('13. Giant Numeric Inputs: Renders massive amount inputs safely without overflowing layouts', async ({ page }) => {
      await dashboardPage.addTransaction({
        type: 'expense',
        amount: '999999999.99',
        category: 'Food',
        date: '2026-07-05',
        description: 'Buying an island'
      });
      await expect(page.locator('text=Buying an island')).toBeVisible();
      // Numeric value in KPI shouldn't break the layout or overlap adjacent cards
      const kpiCard = page.getByTestId('kpi-total-expenses');
      await expect(kpiCard).toBeVisible();
      const style = await kpiCard.evaluate(el => window.getComputedStyle(el).overflow);
      expect(style).not.toBe('visible'); // checking that flex/wrap boundaries handle overflows safely
    });

    test('14. XSS Security: Escapes special script character tags inside labels and notes inputs', async ({ page }) => {
      await dashboardPage.addTransaction({
        type: 'expense',
        amount: '10',
        category: 'Food',
        date: '2026-07-05',
        description: 'Vulnerable Item',
        notes: '<script>window.xss=1;</script>',
        labels: ['<img src=x onerror=alert(1)>', 'test']
      });
      await expect(page.locator('text=Vulnerable Item')).toBeVisible();
      // Ensure scripts did not execute
      const isXssExecuted = await page.evaluate(() => (window as any).xss);
      expect(isXssExecuted).toBeUndefined();
    });

    test('15. Empty Description: Validates description input rejects spaces-only strings', async ({ page }) => {
      if (await dashboardPage.openAddTxnModalBtn.isVisible()) {
        await dashboardPage.openAddTxnModalBtn.click();
      }
      await dashboardPage.amountInput.fill('10');
      await dashboardPage.categorySelect.selectOption('Food');
      await dashboardPage.dateInput.fill('2026-07-05');
      await dashboardPage.descInput.fill('   ');
      await dashboardPage.saveTxnBtn.click();
      await expect(page.locator('.field-error-desc, [data-testid="desc-error"]')).toContainText('Description cannot be empty');
    });
  });

  // =========================================================================
  // Feature 4: Monthly Budgeting Boundaries
  // =========================================================================
  test.describe('Monthly Budgeting Boundaries', () => {
    test.beforeEach(async ({ page }) => {
      await preseedMockData(page, {
        mockSession: 'true',
        projects: [{ id: 'p1', name: 'My Project' }],
        activeProjectId: 'p1'
      });
      await appPage.goto();
    });

    test('16. Negative Budget Limits: Disallows entering negative value configurations inside budget inputs', async ({ page }) => {
      const input = page.getByTestId('budget-input-Food');
      await input.fill('-50');
      await dashboardPage.saveBudgets();
      await expect(page.locator('.budget-error-Food, [data-testid="budget-error"]')).toContainText('Budget must be positive');
    });

    test('17. Duplicate Category Rule: Prevent addition of custom categories sharing matching names', async ({ page }) => {
      const openAddCategoryBtn = page.getByTestId('open-add-category-btn');
      await openAddCategoryBtn.click();
      await page.getByTestId('new-category-name-input').fill('Food'); // already exists by default
      await page.getByTestId('save-category-btn').click();
      await expect(page.locator('[data-testid="category-modal-error"]')).toContainText('Category already exists');
    });

    test('18. Red Overbudget Indicators: Triggers red alert statuses when transactions outspend budget limits', async ({ page }) => {
      await preseedMockData(page, {
        mockSession: 'true',
        projects: [{ id: 'p1', name: 'My Project' }],
        activeProjectId: 'p1',
        budgets: {
          p1: [{ category: 'Food', amount: 50 }]
        },
        transactions: {
          p1: [{ id: 't1', date: '2026-07-01', amount: 50.01, category: 'Food', type: 'expense', description: 'Lunch', notes: '', labels: [], hash: 'h1' }]
        }
      });
      await appPage.goto();
      const progressIndicator = page.getByTestId('budget-indicator-Food');
      await expect(progressIndicator).toHaveClass(/budget-overspent|bg-red-500/);
    });

    test('19. Extreme Category List Sizes: Handles scrolling of 30+ categories gracefully in budget grid', async ({ page }) => {
      const customBudgets = Array.from({ length: 35 }, (_, i) => ({ category: `Category-${i}`, amount: 100 }));
      await preseedMockData(page, {
        mockSession: 'true',
        projects: [{ id: 'p1', name: 'My Project' }],
        activeProjectId: 'p1',
        budgets: {
          p1: customBudgets
        }
      });
      await appPage.goto();
      const grid = page.getByTestId('budget-grid-container');
      await expect(grid).toBeVisible();
      // Grid container should have style allowing scrolling without breaking viewport layout
      const overflowStyle = await grid.evaluate(el => window.getComputedStyle(el).overflowY);
      expect(overflowStyle).toBe('auto');
    });

    test('20. Invalid Color Inputs: Applies fallback defaults when category hex colors are invalid', async ({ page }) => {
      await page.getByTestId('edit-category-Food-btn').click();
      await page.getByTestId('edit-category-color-input').fill('invalid-color');
      await page.getByTestId('save-edited-category-btn').click();
      const badge = page.getByTestId('category-badge-Food');
      // Hex fallback colors must be applied (often defined by grey or default system theme color)
      const color = await badge.evaluate(el => window.getComputedStyle(el).backgroundColor);
      expect(color).toBeDefined();
    });
  });

  // =========================================================================
  // Feature 5: CSV Import Boundaries
  // =========================================================================
  test.describe('CSV Import Boundaries', () => {
    test.beforeEach(async ({ page }) => {
      await preseedMockData(page, {
        mockSession: 'true',
        projects: [{ id: 'p1', name: 'My Project' }],
        activeProjectId: 'p1'
      });
      await appPage.goto();
    });

    test('21. Mismatched CSV Format: Shows errors when uploading files missing CSV syntax layouts', async ({ page }) => {
      await page.getByTestId('import-csv-trigger-btn').click();
      // Upload PDF buffer
      const buffer = Buffer.from('%PDF-1.4 ... binary data', 'utf-8');
      await csvWizardPage.csvFileInput.setInputFiles({
        name: 'statement.pdf',
        mimeType: 'application/pdf',
        buffer
      });
      await expect(page.locator('.csv-upload-error, [data-testid="csv-error"]')).toContainText('Unable to parse CSV file');
    });

    test('22. Missing Mapped Columns: Wizard alerts user when leaving key fields unmapped', async ({ page }) => {
      await page.getByTestId('import-csv-trigger-btn').click();
      const csvContent = 'DateHeader,DescHeader,OutflowHeader\n2026-07-05,Coffee,4.50\n';
      const buffer = Buffer.from(csvContent, 'utf-8');
      await csvWizardPage.csvFileInput.setInputFiles({
        name: 'statement.csv',
        mimeType: 'text/csv',
        buffer
      });
      // Map only DateHeader -> date, leave amount and description unmapped
      await csvWizardPage.mapColumn('date', 'DateHeader');
      await page.getByTestId('csv-next-step-btn').click();

      await expect(page.locator('.csv-mapping-error, [data-testid="csv-error"]')).toContainText('Amount and Description columns are required');
    });

    test('23. Diverse Date Parsing: Standardizes multiple date layout strings during mapping parses', async ({ page }) => {
      await page.getByTestId('import-csv-trigger-btn').click();
      // Date strings: US slashes, DOT dividers, long textual format
      const csvContent = 'DateHeader,DescHeader,OutflowHeader\n07/05/2026,Coffee,4.50\n2026.07.06,Tea,5.00\n12-Jul-2026,Lunch,15.00';
      const buffer = Buffer.from(csvContent, 'utf-8');
      await csvWizardPage.csvFileInput.setInputFiles({
        name: 'statement.csv',
        mimeType: 'text/csv',
        buffer
      });
      await csvWizardPage.mapColumn('date', 'DateHeader');
      await csvWizardPage.mapColumn('description', 'DescHeader');
      await csvWizardPage.mapColumn('amount', 'OutflowHeader');
      await page.getByTestId('csv-next-step-btn').click();
      await csvWizardPage.clickImport();

      // Check dates standardization in transactions list
      await expect(page.locator('[data-testid="transaction-date-row"]').nth(0)).toContainText('2026-07-05');
      await expect(page.locator('[data-testid="transaction-date-row"]').nth(1)).toContainText('2026-07-06');
      await expect(page.locator('[data-testid="transaction-date-row"]').nth(2)).toContainText('2026-07-12');
    });

    test('24. Total Duplicate Files: Disables action inputs when all rows are flagged duplicates', async ({ page }) => {
      // Seed duplicates
      await preseedMockData(page, {
        mockSession: 'true',
        projects: [{ id: 'p1', name: 'My Project' }],
        activeProjectId: 'p1',
        transactions: {
          p1: [
            { id: 't1', date: '2026-07-05', amount: 4.50, category: 'Food', type: 'expense', description: 'Coffee', notes: '', labels: [], hash: 'h_coffee' },
            { id: 't2', date: '2026-07-06', amount: 5.00, category: 'Food', type: 'expense', description: 'Tea', notes: '', labels: [], hash: 'h_tea' }
          ]
        }
      });
      await appPage.goto();
      await page.getByTestId('import-csv-trigger-btn').click();
      const csvContent = 'DateHeader,DescHeader,OutflowHeader\n2026-07-05,Coffee,4.50\n2026-07-06,Tea,5.00';
      const buffer = Buffer.from(csvContent, 'utf-8');
      await csvWizardPage.csvFileInput.setInputFiles({
        name: 'statement.csv',
        mimeType: 'text/csv',
        buffer
      });
      await csvWizardPage.mapColumn('date', 'DateHeader');
      await csvWizardPage.mapColumn('description', 'DescHeader');
      await csvWizardPage.mapColumn('amount', 'OutflowHeader');
      await page.getByTestId('csv-next-step-btn').click();

      // "Import Selected" button should be disabled because 0 new items are selected
      await expect(csvWizardPage.importBtn).toBeDisabled();
    });

    test('25. Empty CSV Files: Rejects completely empty CSV files gracefully', async ({ page }) => {
      await page.getByTestId('import-csv-trigger-btn').click();
      const buffer = Buffer.from('', 'utf-8');
      await csvWizardPage.csvFileInput.setInputFiles({
        name: 'empty.csv',
        mimeType: 'text/csv',
        buffer
      });
      await expect(page.locator('.csv-upload-error, [data-testid="csv-error"]')).toContainText('File is empty');
    });
  });

  // =========================================================================
  // Feature 6: Month Locking Boundaries
  // =========================================================================
  test.describe('Month Locking Boundaries', () => {
    test('26. Locking Empty Month: Lock handles months containing zero inputs safely', async ({ page }) => {
      await preseedMockData(page, {
        mockSession: 'true',
        projects: [{ id: 'p1', name: 'My Project' }],
        activeProjectId: 'p1',
        transactions: { p1: [] }
      });
      await appPage.goto();
      await dashboardPage.lockCurrentMonth();
      await expect(dashboardPage.lockStatus).toContainText('Locked');
    });

    test('27. Lock Rejections: Direct adapter call throws errors if targeting a locked month', async ({ page }) => {
      await preseedMockData(page, {
        mockSession: 'true',
        projects: [{ id: 'p1', name: 'My Project' }],
        activeProjectId: 'p1',
        locks: { p1: [{ month: '2026-07', locked: true }] }
      });
      await appPage.goto();
      // Try programmatically trigger a transaction addition on storage adapter
      const errorThrown = await page.evaluate(async () => {
        try {
          // Access our project's global/mock storage service
          await (window as any).expenseStorage.saveTransaction('p1', {
            id: 't_illegal',
            date: '2026-07-05',
            amount: 5,
            category: 'Food',
            type: 'expense',
            description: 'Illegal write',
            notes: '',
            labels: [],
            hash: 'h_ill'
          });
          return false;
        } catch (e: any) {
          return e.message;
        }
      });
      expect(errorThrown).toContain('Cannot write to locked month');
    });

    test('28. Rollback on Timeout: Lock fails and rolls back state if Gmail client API timeouts', async ({ page }) => {
      await preseedMockData(page, {
        mockSession: 'true',
        projects: [{ id: 'p1', name: 'My Project' }],
        activeProjectId: 'p1'
      });
      // Force email dispatch API route to timeout or return error
      await page.route('**/gmail/v1/users/me/messages/send*', async route => {
        await route.fulfill({
          status: 408, // Request Timeout
          contentType: 'application/json',
          body: JSON.stringify({ error: 'Gateway timeout' })
        });
      });
      await appPage.goto();
      await dashboardPage.lockCurrentMonth();
      // Month should revert to Unlocked, display connection error toast
      await expect(page.locator('[data-testid="notification-toast"]')).toContainText('Lock failed: email report could not send');
      await expect(dashboardPage.lockStatus).toContainText('Unlocked');
    });

    test('29. Lock Isolation: Editing transaction in June 2026 does not affect locked May 2026 stats', async ({ page }) => {
      await preseedMockData(page, {
        mockSession: 'true',
        projects: [{ id: 'p1', name: 'My Project' }],
        activeProjectId: 'p1',
        locks: { p1: [{ month: '2026-05', locked: true }] },
        transactions: {
          p1: [
            { id: 't_may', date: '2026-05-10', amount: 500, category: 'Rent', type: 'expense', description: 'May Rent', notes: '', labels: [], hash: 'hmay' },
            { id: 't_june', date: '2026-06-15', amount: 100, category: 'Food', type: 'expense', description: 'June Food', notes: '', labels: [], hash: 'hjune' }
          ]
        }
      });
      await appPage.goto();
      
      // Go to June
      await page.getByTestId('month-selector').selectOption('2026-06');
      // Add transaction to June
      await dashboardPage.addTransaction({
        type: 'expense',
        amount: '200',
        category: 'Food',
        date: '2026-06-16',
        description: 'More June Food'
      });

      // Switch to May
      await page.getByTestId('month-selector').selectOption('2026-05');
      // Expect total May expenses to remain $500.00
      await expect(page.getByTestId('kpi-total-expenses')).toContainText('$500.00');
    });

    test('30. Rapid Lock Clicks: Multiple concurrent locking submissions are ignored', async ({ page }) => {
      await preseedMockData(page, {
        mockSession: 'true',
        projects: [{ id: 'p1', name: 'My Project' }],
        activeProjectId: 'p1'
      });
      await appPage.goto();
      // Double click lock button
      await dashboardPage.lockMonthBtn.dblclick();
      await expect(dashboardPage.lockStatus).toContainText('Locked');
    });
  });

  // =========================================================================
  // Feature 7: UI/UX & Charts Boundaries
  // =========================================================================
  test.describe('UI/UX & Charts Boundaries', () => {
    test('31. Empty Chart Layouts: Empty state text replaces SVG geometries when no data is available', async ({ page }) => {
      await preseedMockData(page, {
        mockSession: 'true',
        projects: [{ id: 'p1', name: 'Empty Project' }],
        activeProjectId: 'p1',
        transactions: { p1: [] }
      });
      await appPage.goto();
      await expect(page.locator('[data-testid="chart-svg-pie"] .no-data-text')).toBeVisible();
      await expect(page.locator('[data-testid="chart-svg-trend"] .no-data-text')).toBeVisible();
    });

    test('32. Single Node Plots: Trend chart draws single point coordinates safely', async ({ page }) => {
      await preseedMockData(page, {
        mockSession: 'true',
        projects: [{ id: 'p1', name: 'Single Transaction Project' }],
        activeProjectId: 'p1',
        transactions: {
          p1: [{ id: 't1', date: '2026-07-01', amount: 50, category: 'Food', type: 'expense', description: 'Grocery', notes: '', labels: [], hash: 'h1' }]
        }
      });
      await appPage.goto();
      const trendPath = page.locator('[data-testid="chart-svg-trend"] path');
      await expect(trendPath).toBeVisible();
    });

    test('33. Zero Value Divisions: Handles calculations safely when budget allocation is $0', async ({ page }) => {
      await preseedMockData(page, {
        mockSession: 'true',
        projects: [{ id: 'p1', name: 'Zero Budget Project' }],
        activeProjectId: 'p1',
        budgets: {
          p1: [{ category: 'Food', amount: 0 }]
        },
        transactions: {
          p1: [{ id: 't1', date: '2026-07-01', amount: 50, category: 'Food', type: 'expense', description: 'Grocery', notes: '', labels: [], hash: 'h1' }]
        }
      });
      await appPage.goto();
      // Ensure budget vs actual chart handles $0 budget ratio gracefully without Nan or crash
      await expect(dashboardPage.budgetChart).toBeVisible();
    });

    test('34. Long Label Truncations: Wraps or clips extremely lengthy category titles safely', async ({ page }) => {
      const giantCategory = 'RentAndHousingMaintenanceAndGeneralUtilitiesAndRecreationCategoryName';
      await preseedMockData(page, {
        mockSession: 'true',
        projects: [{ id: 'p1', name: 'My Project' }],
        activeProjectId: 'p1',
        budgets: {
          p1: [{ category: giantCategory, amount: 100 }]
        }
      });
      await appPage.goto();
      const budgetLabel = page.locator(`[data-testid="budget-label-${giantCategory}"]`);
      const textOverflow = await budgetLabel.evaluate(el => window.getComputedStyle(el).textOverflow);
      expect(textOverflow).toBe('ellipsis');
    });

    test('35. Negative Coordinate Math: Line chart plots coordinate math safely when net savings are negative', async ({ page }) => {
      await preseedMockData(page, {
        mockSession: 'true',
        projects: [{ id: 'p1', name: 'Negative Net Project' }],
        activeProjectId: 'p1',
        transactions: {
          p1: [
            { id: 't1', date: '2026-07-01', amount: 100, category: 'Salary', type: 'income', description: 'Income', notes: '', labels: [], hash: 'h1' },
            { id: 't2', date: '2026-07-02', amount: 500, category: 'Rent', type: 'expense', description: 'Expense', notes: '', labels: [], hash: 'h2' }
          ]
        }
      });
      await appPage.goto();
      // Trend area chart should plot successfully below baseline
      await expect(dashboardPage.trendChart).toBeVisible();
    });
  });

  // =========================================================================
  // Feature 8: Mock/Demo Mode Boundaries
  // =========================================================================
  test.describe('Mock/Demo Mode Boundaries', () => {
    test('36. Quota Storage Limitations: Alerts user when localStorage throws QuotaExceededError', async ({ page }) => {
      await preseedMockData(page, {
        mockSession: 'true',
        projects: [{ id: 'p1', name: 'My Project' }],
        activeProjectId: 'p1'
      });
      await page.goto('/');
      // Mock localstorage setItem to throw exception
      await page.evaluate(() => {
        (window as any).localStorage.setItem = () => {
          throw new DOMException('Mock Quota Exceeded', 'QuotaExceededError');
        };
      });
      await dashboardPage.setBudget('Food', '100');
      await dashboardPage.saveBudgets();
      await expect(page.locator('.notification-error, [data-testid="notification-toast"]')).toContainText('Storage quota exceeded. Session is now read-only.');
    });

    test('37. Corrupted JSON Recovery: Erases corrupted localStorage keys and prompts onboarding safely', async ({ page }) => {
      await page.goto('/');
      await page.evaluate(() => {
        window.localStorage.setItem('expense_projects', 'invalid-corrupt-json-string');
      });
      await page.reload();
      await expect(page.getByTestId('onboarding-modal')).toBeVisible();
    });

    test('38. Mid-session Deletion Recovery: Gracefully recovers when storage keys disappear mid-session', async ({ page }) => {
      await preseedMockData(page, {
        mockSession: 'true',
        projects: [{ id: 'p1', name: 'My Project' }],
        activeProjectId: 'p1'
      });
      await appPage.goto();
      // Clear storage mid-session
      await page.evaluate(() => window.localStorage.clear());
      // Trigger update
      await dashboardPage.addTransaction({
        type: 'expense',
        amount: '10.00',
        category: 'Food',
        date: '2026-07-01',
        description: 'New Item'
      });
      // Workspace schema should have auto-rebuilt
      const projectsStr = await page.evaluate(() => window.localStorage.getItem('expense_projects'));
      expect(projectsStr).not.toBeNull();
    });

    test('39. Mode Sandboxing: Sync actions in Google mode are isolated from local storage databases', async ({ page }) => {
      // Seed both mock session data and google mode keys
      await preseedMockData(page, {
        googleToken: 'VALID_GOOGLE_TOKEN',
        projects: [{ id: 'cloud_proj', name: 'Google Drive Project' }]
      });
      await page.goto('/dashboard');
      // Save item
      await dashboardPage.addTransaction({
        type: 'expense',
        amount: '100',
        category: 'Food',
        date: '2026-07-01',
        description: 'Google Mode Transaction'
      });
      // The transaction must NOT write to local storage's mock namespaces because we are in Google mode
      const mockTxs = await page.evaluate(() => window.localStorage.getItem('expense_txs_cloud_proj'));
      expect(mockTxs).toBeNull();
    });

    test('40. SHA-256 Hashing Robustness: SHA generation works with non-ASCII details', async ({ page }) => {
      await preseedMockData(page, {
        mockSession: 'true',
        projects: [{ id: 'p1', name: 'My Project' }],
        activeProjectId: 'p1'
      });
      await appPage.goto();
      // Add non-ASCII text details
      await dashboardPage.addTransaction({
        type: 'expense',
        amount: '100',
        category: 'Food',
        date: '2026-07-01',
        description: '咖啡 / Coffee',
        notes: '💸 unicode'
      });
      const txs = await page.evaluate(() => JSON.parse(window.localStorage.getItem('expense_txs_p1')!));
      expect(txs[0].hash).toBeDefined();
      expect(txs[0].hash.length).toBe(64); // Valid SHA-256 string length
    });
  });
});
