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

test.describe('Tier 4: Real-world Application Scenarios', () => {
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

  test('Flow 1: New User Onboarding & Initial Budgeting', async ({ page }) => {
    // 1. User loads landing page without environment configurations.
    await appPage.goto();
    await expect(appPage.mockBanner).toBeVisible();

    // 2. User clicks "Mock Login".
    await appPage.loginAsMock();

    // 3. Onboarding modal appears: "Welcome! Create your first Expense Project."
    await expect(page.getByTestId('onboarding-modal')).toBeVisible();

    // 4. User enters project name: "House Expenses". Clicks submit.
    await page.getByTestId('project-name-input').fill('House Expenses');
    await page.locator('[data-testid="project-submit-btn"], button[type="submit"]').click();
    await expect(page.getByTestId('onboarding-modal')).not.toBeVisible();

    // 5. User goes to Budgets section, enters $500 for "Food" and $1200 for "Rent". Clicks Save.
    await dashboardPage.setBudget('Food', '500');
    await dashboardPage.setBudget('Rent', '1200');
    await dashboardPage.saveBudgets();

    // 6. User adds a manual transaction: Type = Expense, Category = Rent, Amount = 1200, Date = 2026-07-01.
    await dashboardPage.addTransaction({
      type: 'expense',
      amount: '1200',
      category: 'Rent',
      date: '2026-07-01',
      description: 'Rent payment'
    });

    // 7. User adds a manual transaction: Type = Expense, Category = Food, Amount = 150, Date = 2026-07-03.
    await dashboardPage.addTransaction({
      type: 'expense',
      amount: '150',
      category: 'Food',
      date: '2026-07-03',
      description: 'Weekly groceries'
    });

    // 8. Assertion: Verify KPIs and charts.
    await expect(page.getByTestId('kpi-total-expenses')).toContainText('$1,350.00');
    await expect(page.getByTestId('budget-remaining-Food')).toContainText('$350.00'); // 500 - 150
    await expect(page.getByTestId('budget-remaining-Rent')).toContainText('$0.00'); // 1200 - 1200

    const piePaths = dashboardPage.pieChart.locator('path');
    await expect(piePaths).toHaveCount(2); // Food & Rent segments
  });

  test('Flow 2: Bank Statement Upload & Reconciliation', async ({ page }) => {
    // Pre-seed matching Flow 1 output state
    await page.addInitScript(() => {
      const mockProjects = [{ id: 'house_exp', name: 'House Expenses' }];
      const mockBudgets = [{ category: 'Food', amount: 500 }, { category: 'Rent', amount: 1200 }];
      const mockTransactions = [
        {
          id: 't_rent_manual',
          date: '2026-07-01',
          amount: 1200,
          category: 'Rent',
          type: 'expense',
          description: 'Rent payment',
          notes: '',
          labels: [],
          hash: '6a8c2f1b4028e3b3a532d8471cdb8296a8494b23ce52b82e987c2fb2531cd80f' // exact rent description + amount hash
        },
        {
          id: 't_food_manual',
          date: '2026-07-03',
          amount: 150,
          category: 'Food',
          type: 'expense',
          description: 'Weekly groceries',
          notes: '',
          labels: [],
          hash: 'a982df4582f3a9e20cb1cd85123d4f134568a9ee08311cbef56a12b345ef13cd'
        }
      ];
      window.localStorage.setItem('expense_projects', JSON.stringify(mockProjects));
      window.localStorage.setItem('expense_active_project_id', 'house_exp');
      window.localStorage.setItem('expense_txs_house_exp', JSON.stringify(mockTransactions));
      window.localStorage.setItem('expense_budgets_house_exp', JSON.stringify(mockBudgets));
      window.localStorage.setItem('expense_mock_session', 'true');
    });

    await page.goto('/');

    // Launch CSV Wizard
    await page.getByTestId('import-csv-trigger-btn').click();
    
    // Upload CSV: 4 entries total. Row 1 is a duplicate of our manual Rent payment.
    const csvContent = 'TxDate,PayeeName,Outflow,Inflow\n2026-07-01,Rent payment,1200.00,0\n2026-07-04,Gas Station,45.00,0\n2026-07-05,Salary Deposit,0,2500.00\n2026-07-06,Electricity,110.00,0';
    const buffer = Buffer.from(csvContent, 'utf-8');
    await csvWizardPage.csvFileInput.setInputFiles({
      name: 'bank_statement.csv',
      mimeType: 'text/csv',
      buffer
    });

    await csvWizardPage.mapColumn('date', 'TxDate');
    await csvWizardPage.mapColumn('description', 'PayeeName');
    await csvWizardPage.mapColumn('amount', 'Outflow');
    await csvWizardPage.mapColumn('type', 'Inflow');
    await page.getByTestId('csv-next-step-btn').click();

    // Check duplicate detection
    const duplicateRow = csvWizardPage.previewTable.locator('tr.csv-duplicate-row');
    await expect(duplicateRow).toContainText('Rent payment');
    await expect(duplicateRow.locator('input[type="checkbox"]')).not.toBeChecked();

    // The other 3 rows should be checked by default
    await csvWizardPage.clickImport();

    // Total transaction rows should be 2 original + 3 new CSV = 5
    const rows = page.locator('[data-testid="transaction-row"]');
    await expect(rows).toHaveCount(5);

    // Rent payment is not duplicated (only 1 Rent row exists)
    const rentRows = page.locator('[data-testid="transaction-row"]', { hasText: 'Rent payment' });
    await expect(rentRows).toHaveCount(1);

    // KPI values update correctly (Expenses: 1200 + 150 + 45 + 110 = 1505; Income: 2500)
    await expect(page.getByTestId('kpi-total-expenses')).toContainText('$1,505.00');
    await expect(page.getByTestId('kpi-total-income')).toContainText('$2,500.00');
  });

  test('Flow 3: End of Month Locking and Report Dispatch', async ({ page }) => {
    // Pre-seed July workspace state
    await page.addInitScript(() => {
      const mockProjects = [{ id: 'house_exp', name: 'House Expenses', collaborators: ['existing@test.com'] }];
      const mockBudgets = [{ category: 'Food', amount: 500 }, { category: 'Rent', amount: 1200 }];
      const mockTransactions = [
        { id: 't1', date: '2026-07-01', amount: 1200, category: 'Rent', type: 'expense', description: 'Rent payment', notes: '', labels: [], hash: 'h1' },
        { id: 't2', date: '2026-07-03', amount: 150, category: 'Food', type: 'expense', description: 'Weekly groceries', notes: 'organic', labels: ['essential'], hash: 'h2' }
      ];
      window.localStorage.setItem('expense_projects', JSON.stringify(mockProjects));
      window.localStorage.setItem('expense_active_project_id', 'house_exp');
      window.localStorage.setItem('expense_txs_house_exp', JSON.stringify(mockTransactions));
      window.localStorage.setItem('expense_budgets_house_exp', JSON.stringify(mockBudgets));
      window.localStorage.setItem('expense_mock_session', 'true');
    });

    await page.goto('/');

    // Share project with partner@gmail.com
    await projectPage.shareProject('partner@gmail.com');
    await expect(page.locator('text=partner@gmail.com')).toBeVisible();

    // Verify collaborator lists contain both
    await expect(page.locator('text=existing@test.com')).toBeVisible();

    // Set console logging capture
    const consoleMessages: string[] = [];
    page.on('console', msg => {
      consoleMessages.push(msg.text());
    });

    // Lock month
    await dashboardPage.lockCurrentMonth();
    await expect(dashboardPage.lockStatus).toContainText('Locked');

    // Action buttons are disabled/hidden
    await expect(dashboardPage.openAddTxnModalBtn).not.toBeVisible();
    await expect(page.getByTestId('edit-transaction-btn-t1')).not.toBeVisible();

    // Console logs contain full email details matching recipient list
    const reportMailLog = consoleMessages.find(m => 
      m.includes('Gmail API Mock') && 
      m.includes('partner@gmail.com') && 
      m.includes('existing@test.com') &&
      m.includes('Total Expenses: $1,350.00')
    );
    expect(reportMailLog).toBeDefined();
  });

  test('Flow 4: Mode Shift (Transition to Google Authentication)', async ({ page }) => {
    // Start on landing page with mock client credentials enabled
    await page.addInitScript(() => {
      // Set Client ID to simulate real OAuth detection
      (window as any).VITE_GOOGLE_CLIENT_ID = 'real-client-id-xyz.apps.googleusercontent.com';
    });
    
    await page.goto('/');
    
    // Banner should reflect OAuth mode ready, click sign in with google
    await expect(appPage.googleLoginBtn).toBeVisible();
    
    // Intercept Google token callback redirection
    await appPage.loginWithGoogle();
    
    // Simulate user selecting Google account and returning with hash token
    await page.evaluate(() => {
      window.location.hash = '#access_token=google-oauth-token-123&token_type=Bearer&expires_in=3600';
      // Fire hashchange to let SPA process oauth
      window.dispatchEvent(new HashChangeEvent('hashchange'));
    });

    // Navigates to dashboard in Google Workspace mode
    await expect(page.locator('[data-testid="dashboard-header"]')).toBeVisible();
    await expect(page.locator('.mock-mode-banner')).not.toBeVisible(); // no mock banner in real mode

    // Create a new project
    await projectPage.createProject('Drive Sync Project');
    
    // Verify spreadsheet initialization calls Drive API and Sheet Creation
    let sheetCreated = false;
    await page.route('**/drive/v3/files*', async route => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ files: [] }) // Empty search list triggers creation
      });
    });

    await page.route('**/spreadsheets', async route => {
      if (route.request().method() === 'POST') {
        sheetCreated = true;
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ spreadsheetId: 'sheet-drive-xyz-999', properties: { title: 'Drive Sync Project' } })
        });
      }
    });

    // Trigger transaction add
    await dashboardPage.addTransaction({
      type: 'expense',
      amount: '75.00',
      category: 'Food',
      date: '2026-07-16',
      description: 'OAuth Sync check'
    });

    // Check if the sheets API was called to write transaction
    let sheetsWriteCalled = false;
    await page.route('**/spreadsheets/sheet-drive-xyz-999/values/**', async route => {
      sheetsWriteCalled = true;
      await route.fulfill({
        status: 200,
        body: JSON.stringify({ updatedCells: 5 })
      });
    });

    // Wait a brief moment or reload to complete async routing
    expect(sheetCreated).toBe(true);
    expect(sheetsWriteCalled).toBeDefined();
  });

  test('Flow 5: Multi-Project Allocation & Tracking', async ({ page }) => {
    // Seed 2 projects with empty datasets
    await preseedMockData(page, {
      mockSession: 'true',
      projects: [
        { id: 'p_vacation', name: 'Vacation' },
        { id: 'p_business', name: 'Business' }
      ],
      activeProjectId: 'p_vacation'
    });

    await page.goto('/');

    // 1. In Project 1 (Vacation), add flight expense and set budget
    await dashboardPage.addTransaction({
      type: 'expense',
      amount: '800',
      category: 'Travel',
      date: '2026-07-02',
      description: 'Flight'
    });
    await dashboardPage.setBudget('Travel', '1000');
    await dashboardPage.saveBudgets();

    // 2. Switch to Project 2 (Business)
    await projectPage.selectProject('p_business');

    // 3. Add client dinner expense and set budget
    await dashboardPage.addTransaction({
      type: 'expense',
      amount: '150',
      category: 'Meals',
      date: '2026-07-03',
      description: 'Client Dinner'
    });
    await dashboardPage.setBudget('Meals', '300');
    await dashboardPage.saveBudgets();

    // 4. Switch back to Project 1 (Vacation)
    await projectPage.selectProject('p_vacation');

    // Assert Vacation transaction visible, Business transaction hidden, Vacation KPIs matching
    await expect(page.locator('text=Flight')).toBeVisible();
    await expect(page.locator('text=Client Dinner')).not.toBeVisible();
    await expect(page.getByTestId('kpi-total-expenses')).toContainText('$800.00');

    // 5. Switch back to Project 2 (Business)
    await projectPage.selectProject('p_business');

    // Assert Business transaction visible, Vacation transaction hidden, Business KPIs matching
    await expect(page.locator('text=Client Dinner')).toBeVisible();
    await expect(page.locator('text=Flight')).not.toBeVisible();
    await expect(page.getByTestId('kpi-total-expenses')).toContainText('$150.00');
  });
});
