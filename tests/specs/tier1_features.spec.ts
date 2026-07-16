import { test, expect } from '@playwright/test';
import { AppPage } from '../pages/AppPage';
import { ProjectPage } from '../pages/ProjectPage';
import { DashboardPage } from '../pages/DashboardPage';
import { CSVWizardPage } from '../pages/CSVWizardPage';

// Helper to pre-seed localStorage
const preseedMockData = async (page: any, data: {
  projects?: any[];
  activeProjectId?: string;
  transactions?: Record<string, any[]>;
  budgets?: Record<string, any[]>;
  locks?: Record<string, any[]>;
  theme?: string;
  mockSession?: string;
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
  }, data);
};

test.describe('Tier 1: Feature Coverage (Happy Paths)', () => {
  let appPage: AppPage;
  let projectPage: ProjectPage;
  let dashboardPage: DashboardPage;
  let csvWizardPage: CSVWizardPage;

  test.beforeEach(async ({ page }) => {
    appPage = new AppPage(page);
    projectPage = new ProjectPage(page);
    dashboardPage = new DashboardPage(page);
    csvWizardPage = new CSVWizardPage(page);
  });

  // =========================================================================
  // Feature 1: Google Auth
  // =========================================================================
  test.describe('Google Auth', () => {
    test('1. Login Toggle Navigation: Page displays mock and Google login buttons initially', async () => {
      await appPage.goto();
      await expect(appPage.mockLoginBtn).toBeVisible();
      await expect(appPage.googleLoginBtn).toBeVisible();
    });

    test('2. Mock Authentication Flow: Login via Mock Auth mode button navigates to dashboard', async ({ page }) => {
      await appPage.goto();
      await appPage.loginAsMock();
      // Should show project dashboard/list and bypass auth
      await expect(page.locator('[data-testid="create-project-btn"], [data-testid="dashboard-header"]')).toBeVisible();
    });

    test('3. Session Verification: Session persists on page reload under mock mode', async ({ page }) => {
      await preseedMockData(page, {
        mockSession: 'true',
        projects: [{ id: 'p1', name: 'My Project' }],
        activeProjectId: 'p1'
      });
      await appPage.goto();
      await expect(page.locator('[data-testid="dashboard-header"]')).toBeVisible();
      await expect(appPage.mockLoginBtn).not.toBeVisible();
    });

    test('4. Log Out Action: Logging out clears session credentials and redirects to login page', async ({ page }) => {
      await preseedMockData(page, {
        mockSession: 'true',
        projects: [{ id: 'p1', name: 'My Project' }],
        activeProjectId: 'p1'
      });
      await appPage.goto();
      const logoutBtn = page.getByTestId('logout-btn');
      await logoutBtn.click();
      await expect(appPage.mockLoginBtn).toBeVisible();
      const session = await page.evaluate(() => window.localStorage.getItem('expense_mock_session'));
      expect(session).toBeNull();
    });

    test('5. Route Guarding: Route protection redirects unauthenticated users to login', async ({ page }) => {
      // Simulate no credentials
      await page.goto('/dashboard');
      await expect(appPage.mockLoginBtn).toBeVisible();
    });
  });

  // =========================================================================
  // Feature 2: Project Storage (Drive/Sheets)
  // =========================================================================
  test.describe('Project Storage', () => {
    test('6. Onboarding Project Creation: Default project creation prompt shown to new users', async ({ page }) => {
      await preseedMockData(page, { mockSession: 'true', projects: [] });
      await appPage.goto();
      // Should prompt onboarding modal since projects list is empty
      await expect(page.getByTestId('onboarding-modal')).toBeVisible();
      await page.getByTestId('project-name-input').fill('First Project');
      await page.locator('[data-testid="project-submit-btn"], button[type="submit"]').click();
      await expect(page.getByTestId('onboarding-modal')).not.toBeVisible();
    });

    test('7. Multiple Projects Listing: Display multiple projects in project selector dropdown', async ({ page }) => {
      await preseedMockData(page, {
        mockSession: 'true',
        projects: [
          { id: 'p1', name: 'Personal Expenses' },
          { id: 'p2', name: 'Business Expenses' }
        ],
        activeProjectId: 'p1'
      });
      await appPage.goto();
      const selector = page.getByTestId('project-selector');
      await expect(selector).toBeVisible();
      await expect(page.getByTestId('project-item-p1')).toBeVisible();
      await expect(page.getByTestId('project-item-p2')).toBeVisible();
    });

    test('8. Switching Projects: Selecting/switching projects updates the active context', async ({ page }) => {
      await preseedMockData(page, {
        mockSession: 'true',
        projects: [
          { id: 'p1', name: 'Personal Expenses' },
          { id: 'p2', name: 'Business Expenses' }
        ],
        activeProjectId: 'p1',
        transactions: {
          p1: [{ id: 't1', date: '2026-07-01', amount: 10, category: 'Food', type: 'expense', description: 't1 description', notes: '', labels: [], hash: 'h1' }],
          p2: [{ id: 't2', date: '2026-07-02', amount: 50, category: 'Utilities', type: 'expense', description: 't2 description', notes: '', labels: [], hash: 'h2' }]
        }
      });
      await appPage.goto();
      await expect(page.locator('text=t1 description')).toBeVisible();
      await projectPage.selectProject('p2');
      await expect(page.locator('text=t2 description')).toBeVisible();
      await expect(page.locator('text=t1 description')).not.toBeVisible();
    });

    test('9. Project Sharing Submission: Submitting a valid collaborator email shows it in list', async ({ page }) => {
      await preseedMockData(page, {
        mockSession: 'true',
        projects: [{ id: 'p1', name: 'My Project', collaborators: ['existing@test.com'] }],
        activeProjectId: 'p1'
      });
      await appPage.goto();
      await projectPage.shareProject('new@test.com');
      await expect(page.locator('text=new@test.com')).toBeVisible();
    });

    test('10. Schema Checker Pass: Project loads successfully when the schema is valid', async ({ page }) => {
      await preseedMockData(page, {
        mockSession: 'true',
        projects: [{ id: 'p1', name: 'Valid Schema Project' }],
        activeProjectId: 'p1'
      });
      await appPage.goto();
      await expect(page.getByTestId('schema-error-modal')).not.toBeVisible();
      await expect(page.locator('[data-testid="dashboard-header"]')).toBeVisible();
    });
  });

  // =========================================================================
  // Feature 3: Manual Transactions
  // =========================================================================
  test.describe('Manual Transactions', () => {
    test.beforeEach(async ({ page }) => {
      await preseedMockData(page, {
        mockSession: 'true',
        projects: [{ id: 'p1', name: 'Personal Expenses' }],
        activeProjectId: 'p1'
      });
      await appPage.goto();
    });

    test('11. Expense Submission: Adding a manual Expense updates calculations and transaction grid', async ({ page }) => {
      await dashboardPage.addTransaction({
        type: 'expense',
        amount: '120.50',
        category: 'Food',
        date: '2026-07-10',
        description: 'Dinner out',
        notes: 'Celebration dinner',
        labels: ['essential']
      });
      await expect(page.locator('text=Dinner out')).toBeVisible();
      await expect(page.getByTestId('kpi-total-expenses')).toContainText('$120.50');
    });

    test('12. Income Submission: Adding a manual Income updates calculations and transaction grid', async ({ page }) => {
      await dashboardPage.addTransaction({
        type: 'income',
        amount: '1500.00',
        category: 'Salary',
        date: '2026-07-01',
        description: 'Bi-weekly payroll',
        notes: 'Main salary source',
        labels: ['salary']
      });
      await expect(page.locator('text=Bi-weekly payroll')).toBeVisible();
      await expect(page.getByTestId('kpi-total-income')).toContainText('$1,500.00');
    });

    test('13. Transaction Details Update: Editing a transaction updates details and calculations', async ({ page }) => {
      await preseedMockData(page, {
        mockSession: 'true',
        projects: [{ id: 'p1', name: 'Personal Expenses' }],
        activeProjectId: 'p1',
        transactions: {
          p1: [{ id: 't1', date: '2026-07-01', amount: 100, category: 'Food', type: 'expense', description: 'Grocery', notes: '', labels: [], hash: 'h1' }]
        }
      });
      await appPage.goto();
      await dashboardPage.editTransaction('t1', { amount: '80.00', description: 'Discounted Grocery' });
      await expect(page.locator('text=Discounted Grocery')).toBeVisible();
      await expect(page.getByTestId('kpi-total-expenses')).toContainText('$80.00');
    });

    test('14. Transaction Deletion: Deleting a transaction removes it and updates dashboard', async ({ page }) => {
      await preseedMockData(page, {
        mockSession: 'true',
        projects: [{ id: 'p1', name: 'Personal Expenses' }],
        activeProjectId: 'p1',
        transactions: {
          p1: [{ id: 't1', date: '2026-07-01', amount: 100, category: 'Food', type: 'expense', description: 'Grocery', notes: '', labels: [], hash: 'h1' }]
        }
      });
      await appPage.goto();
      await dashboardPage.deleteTransaction('t1');
      await expect(page.locator('text=Grocery')).not.toBeVisible();
      await expect(page.getByTestId('kpi-total-expenses')).toContainText('$0.00');
    });

    test('15. Filter by Label/Tag: Filtering transactions list by label shows only the tagged rows', async ({ page }) => {
      await preseedMockData(page, {
        mockSession: 'true',
        projects: [{ id: 'p1', name: 'Personal Expenses' }],
        activeProjectId: 'p1',
        transactions: {
          p1: [
            { id: 't1', date: '2026-07-01', amount: 100, category: 'Food', type: 'expense', description: 'Grocery', notes: '', labels: ['groceries'], hash: 'h1' },
            { id: 't2', date: '2026-07-02', amount: 50, category: 'Utilities', type: 'expense', description: 'Electricity', notes: '', labels: ['utilities'], hash: 'h2' }
          ]
        }
      });
      await appPage.goto();
      // Click filter or tag
      await page.getByTestId('filter-tag-groceries').click();
      await expect(page.locator('text=Grocery')).toBeVisible();
      await expect(page.locator('text=Electricity')).not.toBeVisible();
    });
  });

  // =========================================================================
  // Feature 4: Monthly Budgeting
  // =========================================================================
  test.describe('Monthly Budgeting', () => {
    test.beforeEach(async ({ page }) => {
      await preseedMockData(page, {
        mockSession: 'true',
        projects: [{ id: 'p1', name: 'My Project' }],
        activeProjectId: 'p1'
      });
      await appPage.goto();
    });

    test('16. Budget Grid Input & Persistence: Setting category budgets in the grid persists values', async ({ page }) => {
      await dashboardPage.setBudget('Food', '500');
      await dashboardPage.saveBudgets();
      await page.reload();
      const budgetInput = page.getByTestId('budget-input-Food');
      await expect(budgetInput).toHaveValue('500');
    });

    test('17. New Category Creation: Adding a new category with color/emoji renders it in list', async ({ page }) => {
      const openAddCategoryBtn = page.getByTestId('open-add-category-btn');
      await openAddCategoryBtn.click();
      await page.getByTestId('new-category-name-input').fill('Vacation');
      await page.getByTestId('new-category-color-input').fill('#ff5733');
      await page.getByTestId('new-category-emoji-input').fill('✈️');
      await page.getByTestId('save-category-btn').click();

      // Check category in dropdown list
      if (await dashboardPage.openAddTxnModalBtn.isVisible()) {
        await dashboardPage.openAddTxnModalBtn.click();
      }
      const option = page.locator('[data-testid="transaction-category-select"] option', { hasText: 'Vacation' });
      await expect(option).toBeAttached();
    });

    test('18. Budget Utilization Percentage: Dashboard shows correct budget utilization percentage', async ({ page }) => {
      await preseedMockData(page, {
        mockSession: 'true',
        projects: [{ id: 'p1', name: 'My Project' }],
        activeProjectId: 'p1',
        budgets: {
          p1: [{ category: 'Food', amount: 200 }]
        },
        transactions: {
          p1: [{ id: 't1', date: '2026-07-01', amount: 100, category: 'Food', type: 'expense', description: 'Grocery', notes: '', labels: [], hash: 'h1' }]
        }
      });
      await appPage.goto();
      const progressText = page.getByTestId('budget-utilization-Food');
      await expect(progressText).toContainText('50%'); // 100/200
    });

    test('19. Budget Calculations Propagation: Editing an existing budget updates total budget', async ({ page }) => {
      await preseedMockData(page, {
        mockSession: 'true',
        projects: [{ id: 'p1', name: 'My Project' }],
        activeProjectId: 'p1',
        budgets: {
          p1: [{ category: 'Food', amount: 200 }, { category: 'Rent', amount: 1000 }]
        }
      });
      await appPage.goto();
      await expect(page.getByTestId('kpi-total-budget')).toContainText('$1,200.00');
      await dashboardPage.setBudget('Food', '300');
      await dashboardPage.saveBudgets();
      await expect(page.getByTestId('kpi-total-budget')).toContainText('$1,300.00');
    });

    test('20. Custom Category Editing: Modifying category color/emoji propagates change to items', async ({ page }) => {
      // Modify a category "Food" custom details
      await page.getByTestId('edit-category-Food-btn').click();
      await page.getByTestId('edit-category-color-input').fill('#0000ff');
      await page.getByTestId('edit-category-emoji-input').fill('🍔');
      await page.getByTestId('save-edited-category-btn').click();
      
      const badge = page.getByTestId('category-badge-Food');
      await expect(badge).toContainText('🍔');
    });
  });

  // =========================================================================
  // Feature 5: CSV Statement Import & Deduplication
  // =========================================================================
  test.describe('CSV Statement Import & Deduplication', () => {
    test.beforeEach(async ({ page }) => {
      await preseedMockData(page, {
        mockSession: 'true',
        projects: [{ id: 'p1', name: 'My Project' }],
        activeProjectId: 'p1'
      });
      await appPage.goto();
    });

    test('21. Column Mapping Alignment: Mapping CSV columns updates field selectors correctly', async ({ page }) => {
      await page.getByTestId('import-csv-trigger-btn').click();
      // Set test file
      const csvContent = 'DateHeader,DescHeader,OutflowHeader\n2026-07-05,Coffee,4.50\n';
      const buffer = Buffer.from(csvContent, 'utf-8');
      await csvWizardPage.csvFileInput.setInputFiles({
        name: 'statement.csv',
        mimeType: 'text/csv',
        buffer
      });

      await csvWizardPage.mapColumn('date', 'DateHeader');
      await csvWizardPage.mapColumn('description', 'DescHeader');
      await csvWizardPage.mapColumn('amount', 'OutflowHeader');

      await expect(page.getByTestId('csv-map-col-date')).toHaveValue('DateHeader');
      await expect(page.getByTestId('csv-map-col-description')).toHaveValue('DescHeader');
      await expect(page.getByTestId('csv-map-col-amount')).toHaveValue('OutflowHeader');
    });

    test('22. Transaction Preview Rendering: Uploading CSV displays parsed transactions table preview', async ({ page }) => {
      await page.getByTestId('import-csv-trigger-btn').click();
      const csvContent = 'DateHeader,DescHeader,OutflowHeader\n2026-07-05,Coffee,4.50\n2026-07-06,Electricity,85.00';
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

      await expect(csvWizardPage.previewTable).toBeVisible();
      await expect(csvWizardPage.previewTable.locator('text=Coffee')).toBeVisible();
      await expect(csvWizardPage.previewTable.locator('text=Electricity')).toBeVisible();
    });

    test('23. Importing Debit and Credit: Importing credit and debit compiles correct transaction types', async ({ page }) => {
      await page.getByTestId('import-csv-trigger-btn').click();
      const csvContent = 'DateHeader,DescHeader,AmountHeader,TypeHeader\n2026-07-05,Coffee,4.50,expense\n2026-07-06,Bonus,200.00,income';
      const buffer = Buffer.from(csvContent, 'utf-8');
      await csvWizardPage.csvFileInput.setInputFiles({
        name: 'statement.csv',
        mimeType: 'text/csv',
        buffer
      });
      await csvWizardPage.mapColumn('date', 'DateHeader');
      await csvWizardPage.mapColumn('description', 'DescHeader');
      await csvWizardPage.mapColumn('amount', 'AmountHeader');
      await csvWizardPage.mapColumn('type', 'TypeHeader');
      await page.getByTestId('csv-next-step-btn').click();
      await csvWizardPage.clickImport();

      await expect(page.locator('text=Coffee')).toBeVisible();
      await expect(page.locator('text=Bonus')).toBeVisible();
      await expect(page.getByTestId('kpi-total-expenses')).toContainText('$4.50');
      await expect(page.getByTestId('kpi-total-income')).toContainText('$200.00');
    });

    test('24. Duplicate Highlighting: Pre-existing transactions highlight duplicate warning', async ({ page }) => {
      // Seed a transaction with a known details hash
      await preseedMockData(page, {
        mockSession: 'true',
        projects: [{ id: 'p1', name: 'My Project' }],
        activeProjectId: 'p1',
        transactions: {
          p1: [{ id: 't1', date: '2026-07-05', amount: 4.50, category: 'Food', type: 'expense', description: 'Coffee', notes: '', labels: [], hash: 'a12b34' }]
        }
      });
      await appPage.goto();
      await page.getByTestId('import-csv-trigger-btn').click();
      const csvContent = 'DateHeader,DescHeader,AmountHeader\n2026-07-05,Coffee,4.50\n2026-07-06,Electricity,85.00';
      const buffer = Buffer.from(csvContent, 'utf-8');
      await csvWizardPage.csvFileInput.setInputFiles({
        name: 'statement.csv',
        mimeType: 'text/csv',
        buffer
      });
      await csvWizardPage.mapColumn('date', 'DateHeader');
      await csvWizardPage.mapColumn('description', 'DescHeader');
      await csvWizardPage.mapColumn('amount', 'AmountHeader');
      await page.getByTestId('csv-next-step-btn').click();

      // Check if duplicate is flagged in preview table
      const duplicateRow = csvWizardPage.previewTable.locator('tr.csv-duplicate-row');
      await expect(duplicateRow).toBeVisible();
      const checkbox = duplicateRow.locator('input[type="checkbox"]');
      await expect(checkbox).not.toBeChecked(); // default disabled/unchecked
    });

    test('25. Executing Import: Importing adds non-duplicate CSV rows to transaction grid', async ({ page }) => {
      await preseedMockData(page, {
        mockSession: 'true',
        projects: [{ id: 'p1', name: 'My Project' }],
        activeProjectId: 'p1',
        transactions: {
          p1: [{ id: 't1', date: '2026-07-05', amount: 4.50, category: 'Food', type: 'expense', description: 'Coffee', notes: '', labels: [], hash: 'a12b34' }]
        }
      });
      await appPage.goto();
      await page.getByTestId('import-csv-trigger-btn').click();
      const csvContent = 'DateHeader,DescHeader,AmountHeader\n2026-07-05,Coffee,4.50\n2026-07-06,Electricity,85.00';
      const buffer = Buffer.from(csvContent, 'utf-8');
      await csvWizardPage.csvFileInput.setInputFiles({
        name: 'statement.csv',
        mimeType: 'text/csv',
        buffer
      });
      await csvWizardPage.mapColumn('date', 'DateHeader');
      await csvWizardPage.mapColumn('description', 'DescHeader');
      await csvWizardPage.mapColumn('amount', 'AmountHeader');
      await page.getByTestId('csv-next-step-btn').click();
      await csvWizardPage.clickImport();

      // Should have Coffee and Electricity. Electricity is new. Coffee was duplicate and skipped.
      await expect(page.locator('text=Electricity')).toBeVisible();
      // Total transactions should be 2 (original Coffee + new Electricity)
      const rows = page.locator('[data-testid="transaction-row"]');
      await expect(rows).toHaveCount(2);
    });
  });

  // =========================================================================
  // Feature 6: Month Locking & Email Reports
  // =========================================================================
  test.describe('Month Locking & Email Reports', () => {
    test.beforeEach(async ({ page }) => {
      await preseedMockData(page, {
        mockSession: 'true',
        projects: [{ id: 'p1', name: 'My Project', collaborators: ['friend@test.com', 'partner@test.com'] }],
        activeProjectId: 'p1',
        transactions: {
          p1: [{ id: 't1', date: '2026-07-15', amount: 1500, category: 'Rent', type: 'expense', description: 'Rent payment', notes: '', labels: [], hash: 'h1' }]
        }
      });
      await appPage.goto();
    });

    test('26. Locking Lockout States: Locking a month disables adding/editing/deleting transactions in that month', async ({ page }) => {
      await dashboardPage.lockCurrentMonth();
      await expect(dashboardPage.openAddTxnModalBtn).not.toBeVisible();
      await expect(page.getByTestId('edit-transaction-btn-t1')).not.toBeVisible();
      await expect(page.getByTestId('delete-transaction-btn-t1')).not.toBeVisible();
    });

    test('27. Lock Confirmation Console Event: Locking a month prints HTML report email in console', async ({ page }) => {
      const consoleMessages: string[] = [];
      page.on('console', msg => {
        consoleMessages.push(msg.text());
      });
      await dashboardPage.lockCurrentMonth();
      // Check that a message containing the email template is printed
      const emailLog = consoleMessages.find(m => m.includes('Gmail API Mock') && m.includes('<html>'));
      expect(emailLog).toBeDefined();
    });

    test('28. CC and Recipient Emails: Email report matches project collaborators', async ({ page }) => {
      const consoleMessages: string[] = [];
      page.on('console', msg => {
        consoleMessages.push(msg.text());
      });
      await dashboardPage.lockCurrentMonth();
      const emailLog = consoleMessages.find(m => m.includes('friend@test.com') && m.includes('partner@test.com'));
      expect(emailLog).toBeDefined();
    });

    test('29. Lock Report Calculations: Lock report matches UI dashboard KPIs', async ({ page }) => {
      const consoleMessages: string[] = [];
      page.on('console', msg => {
        consoleMessages.push(msg.text());
      });
      await dashboardPage.lockCurrentMonth();
      const emailLog = consoleMessages.find(m => m.includes('Total Expenses: $1,500.00'));
      expect(emailLog).toBeDefined();
    });

    test('30. Month Unlocking Restore: Unlocking a month removes lock status and re-enables transaction controls', async ({ page }) => {
      await preseedMockData(page, {
        mockSession: 'true',
        projects: [{ id: 'p1', name: 'My Project' }],
        activeProjectId: 'p1',
        locks: {
          p1: [{ month: '2026-07', locked: true, lockedAt: '2026-07-16T12:00:00Z' }]
        },
        transactions: {
          p1: [{ id: 't1', date: '2026-07-15', amount: 1500, category: 'Rent', type: 'expense', description: 'Rent payment', notes: '', labels: [], hash: 'h1' }]
        }
      });
      await appPage.goto();
      await expect(dashboardPage.openAddTxnModalBtn).not.toBeVisible();
      await dashboardPage.unlockCurrentMonth();
      await expect(dashboardPage.openAddTxnModalBtn).toBeVisible();
      await expect(page.getByTestId('edit-transaction-btn-t1')).toBeVisible();
    });
  });

  // =========================================================================
  // Feature 7: UI/UX & SVG/CSS Charts
  // =========================================================================
  test.describe('UI/UX & SVG/CSS Charts', () => {
    test.beforeEach(async ({ page }) => {
      await preseedMockData(page, {
        mockSession: 'true',
        projects: [{ id: 'p1', name: 'My Project' }],
        activeProjectId: 'p1',
        budgets: {
          p1: [{ category: 'Food', amount: 100 }]
        },
        transactions: {
          p1: [
            { id: 't1', date: '2026-07-01', amount: 80, category: 'Rent', type: 'expense', description: 'Rent', notes: '', labels: [], hash: 'h1' },
            { id: 't2', date: '2026-07-02', amount: 20, category: 'Food', type: 'expense', description: 'Food', notes: '', labels: [], hash: 'h2' }
          ]
        }
      });
      await appPage.goto();
    });

    test('31. Pie Chart Portions: Expense pie chart displays SVG path elements representing portions', async () => {
      await expect(dashboardPage.pieChart).toBeVisible();
      // Ensure SVG paths exist
      const paths = dashboardPage.pieChart.locator('path');
      await expect(paths).toHaveCount(2); // Two categories: Rent and Food
    });

    test('32. Trend Chart Path: Monthly trend area chart plots coordinate segments', async () => {
      await expect(dashboardPage.trendChart).toBeVisible();
      const path = dashboardPage.trendChart.locator('path');
      await expect(path).toBeVisible();
      const dAttr = await path.getAttribute('d');
      expect(dAttr).not.toBeNull();
      expect(dAttr?.length).toBeGreaterThan(10);
    });

    test('33. Budget vs Actual Chart: Budget vs Actual chart draws dual budget/actual bars', async () => {
      await expect(dashboardPage.budgetChart).toBeVisible();
      const budgetBars = dashboardPage.budgetChart.locator('.budget-bar');
      const actualBars = dashboardPage.budgetChart.locator('.actual-bar');
      await expect(budgetBars).toBeVisible();
      await expect(actualBars).toBeVisible();
    });

    test('34. Theme Switch Stylesheet: Toggling theme changes html tag class and shifts CSS styles', async ({ page }) => {
      await appPage.toggleTheme();
      const htmlClass = await page.locator('html').getAttribute('class');
      expect(htmlClass).toContain('light');
      await appPage.toggleTheme();
      const htmlClassDark = await page.locator('html').getAttribute('class');
      expect(htmlClassDark).toContain('dark');
    });

    test('35. Chart Responsive Scaling: App renders responsively at 320px width', async ({ page }) => {
      await page.setViewportSize({ width: 320, height: 568 });
      await expect(dashboardPage.pieChart).toBeVisible();
      // Width of charts should be constrained and not cause layout breakage
      const containerWidth = await page.locator('[data-testid="charts-container"]').evaluate(el => el.clientWidth);
      expect(containerWidth).toBeLessThanOrEqual(320);
    });
  });

  // =========================================================================
  // Feature 8: Mock/Demo Mode
  // =========================================================================
  test.describe('Mock/Demo Mode', () => {
    test('36. Fallback Trigger: Absence of client variables triggers fallback to mock mode banner', async ({ page }) => {
      // Clear storage to force landing page
      await preseedMockData(page, { projects: undefined, mockSession: undefined });
      await page.goto('/');
      await expect(appPage.mockBanner).toBeVisible();
      await expect(appPage.mockBanner).toContainText('Mock Mode');
    });

    test('37. Mock Database Seed: Mock mode preloads default data in localStorage on initialization', async ({ page }) => {
      await page.goto('/');
      await appPage.loginAsMock();
      const projects = await page.evaluate(() => window.localStorage.getItem('expense_projects'));
      expect(projects).not.toBeNull();
      const parsedProjects = JSON.parse(projects!);
      expect(parsedProjects.length).toBeGreaterThan(0);
    });

    test('38. Storage Mutation: Local storage updates correctly after writing changes in mock mode', async ({ page }) => {
      await preseedMockData(page, {
        mockSession: 'true',
        projects: [{ id: 'p1', name: 'My Project' }],
        activeProjectId: 'p1'
      });
      await appPage.goto();
      await dashboardPage.addTransaction({
        type: 'expense',
        amount: '10.00',
        category: 'Food',
        date: '2026-07-01',
        description: 'Mock Item'
      });
      const txsStr = await page.evaluate(() => window.localStorage.getItem('expense_txs_p1'));
      expect(txsStr).not.toBeNull();
      const txs = JSON.parse(txsStr!);
      expect(txs.find((t: any) => t.description === 'Mock Item')).toBeDefined();
    });

    test('39. Mock Google Sign-in: Google Sign-in button acts as mock fallback if no credentials present', async ({ page }) => {
      await page.goto('/');
      await appPage.loginWithGoogle();
      await expect(page.locator('[data-testid="dashboard-header"]')).toBeVisible();
    });

    test('40. Offline API Sync: Syncing in mock mode does not throw error and acts synchronously', async ({ page }) => {
      await preseedMockData(page, {
        mockSession: 'true',
        projects: [{ id: 'p1', name: 'My Project' }],
        activeProjectId: 'p1'
      });
      await appPage.goto();
      // Should save budget successfully
      await dashboardPage.setBudget('Food', '100');
      await dashboardPage.saveBudgets();
      const message = page.locator('.notification-success, [data-testid="notification-toast"]');
      await expect(message).toContainText('Budgets saved successfully');
    });
  });
});
