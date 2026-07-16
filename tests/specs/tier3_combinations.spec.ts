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

test.describe('Tier 3: Cross-Feature Combinations', () => {
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

  test('1. Google Auth + Project Storage: Schema validator updates database schemas when mock credentials activate', async ({ page }) => {
    // Seed database containing an outdated format (missing default lists)
    await preseedMockData(page, {
      projects: [{ id: 'p1', name: 'Legacy Project' }]
      // lacking locks or custom categories array structures
    });
    await page.goto('/');
    await appPage.loginAsMock();
    
    // Schema repair should automatically trigger on load
    await expect(page.locator('[data-testid="dashboard-header"]')).toBeVisible();
    const locksStr = await page.evaluate(() => window.localStorage.getItem('expense_locks_p1'));
    expect(locksStr).not.toBeNull();
    expect(JSON.parse(locksStr!)).toEqual([]);
  });

  test('2. Project Storage + Manual Transactions + Charts: Switching active project context updates the grid and pie charts', async ({ page }) => {
    await preseedMockData(page, {
      mockSession: 'true',
      projects: [
        { id: 'projA', name: 'Project A' },
        { id: 'projB', name: 'Project B' }
      ],
      activeProjectId: 'projA',
      transactions: {
        projA: [{ id: 't1', date: '2026-07-01', amount: 2000, category: 'Rent', type: 'expense', description: 'Rent A', notes: '', labels: [], hash: 'ha' }],
        projB: [{ id: 't2', date: '2026-07-01', amount: 150, category: 'Food', type: 'expense', description: 'Food B', notes: '', labels: [], hash: 'hb' }]
      }
    });
    await appPage.goto();
    
    // Check Project A details
    await expect(page.locator('text=Rent A')).toBeVisible();
    await expect(page.locator('text=Food B')).not.toBeVisible();
    await expect(page.getByTestId('kpi-total-expenses')).toContainText('$2,000.00');

    // Switch to Project B
    await projectPage.selectProject('projB');
    await expect(page.locator('text=Food B')).toBeVisible();
    await expect(page.locator('text=Rent A')).not.toBeVisible();
    await expect(page.getByTestId('kpi-total-expenses')).toContainText('$150.00');

    // Chart segments should reflect new category counts
    const piePaths = dashboardPage.pieChart.locator('path');
    await expect(piePaths).toHaveCount(1); // just Food
  });

  test('3. Manual Transactions + Budgeting + Charts: Modifying category budgets updates over-budget visualization indicators', async ({ page }) => {
    await preseedMockData(page, {
      mockSession: 'true',
      projects: [{ id: 'p1', name: 'Budget Sync Project' }],
      activeProjectId: 'p1',
      budgets: {
        p1: [{ category: 'Utilities', amount: 100 }]
      },
      transactions: {
        p1: [{ id: 't1', date: '2026-07-01', amount: 120, category: 'Utilities', type: 'expense', description: 'Power bill', notes: '', labels: [], hash: 'hu' }]
      }
    });
    await appPage.goto();

    // Check SVG bar chart displays actual bar higher than budget bar
    const utilitiesActualBar = page.locator('[data-testid="chart-svg-budget"] .actual-bar-Utilities');
    const utilitiesBudgetBar = page.locator('[data-testid="chart-svg-budget"] .budget-bar-Utilities');
    const actualHeight = await utilitiesActualBar.getAttribute('height');
    const budgetHeight = await utilitiesBudgetBar.getAttribute('height');
    expect(Number(actualHeight)).toBeGreaterThan(Number(budgetHeight));

    // Increase budget to $200
    await dashboardPage.setBudget('Utilities', '200');
    await dashboardPage.saveBudgets();

    // Re-evaluate actual vs budget heights
    const newActualHeight = await utilitiesActualBar.getAttribute('height');
    const newBudgetHeight = await utilitiesBudgetBar.getAttribute('height');
    expect(Number(newActualHeight)).toBeLessThan(Number(newBudgetHeight));
  });

  test('4. CSV Import + Manual Transactions + Deduplication: Imported CSV rows identical to manual inputs are flagged and excluded', async ({ page }) => {
    await preseedMockData(page, {
      mockSession: 'true',
      projects: [{ id: 'p1', name: 'My Project' }],
      activeProjectId: 'p1',
      transactions: {
        p1: [{ id: 't1', date: '2026-07-15', amount: 15.99, category: 'Food', type: 'expense', description: 'Supermarket', notes: '', labels: [], hash: 'h_supermarket' }]
      }
    });
    await appPage.goto();

    await page.getByTestId('import-csv-trigger-btn').click();
    const csvContent = 'DateHeader,DescHeader,OutflowHeader\n2026-07-15,Supermarket,15.99\n2026-07-16,Movie Ticket,12.50';
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

    // The first row (Supermarket) must be greyed out as a duplicate of the manual transaction
    const duplicateRow = csvWizardPage.previewTable.locator('tr.csv-duplicate-row');
    await expect(duplicateRow).toContainText('Supermarket');
    const checkbox = duplicateRow.locator('input[type="checkbox"]');
    await expect(checkbox).not.toBeChecked();

    // Execute Import
    await csvWizardPage.clickImport();
    // Verify only Movie Ticket is added, Supermarket is not duplicated
    await expect(page.locator('text=Movie Ticket')).toBeVisible();
    const rows = page.locator('[data-testid="transaction-row"]');
    await expect(rows).toHaveCount(2); // 1 original manual + 1 new CSV
  });

  test('5. Month Locking + Manual Transactions + Budgeting: Locking disables transaction inputs and locks category budgeting inputs', async ({ page }) => {
    await preseedMockData(page, {
      mockSession: 'true',
      projects: [{ id: 'p1', name: 'Lock Sync Project' }],
      activeProjectId: 'p1',
      budgets: {
        p1: [{ category: 'Food', amount: 100 }]
      }
    });
    await appPage.goto();

    await dashboardPage.lockCurrentMonth();

    // Budget input for category must be set to read-only / disabled
    const budgetInput = page.getByTestId('budget-input-Food');
    await expect(budgetInput).toBeDisabled();

    // Add transaction button is hidden
    await expect(dashboardPage.openAddTxnModalBtn).not.toBeVisible();
  });

  test('6. CSV Import + Month Locking: CSV wizard warns and filters import records belonging to locked months', async ({ page }) => {
    await preseedMockData(page, {
      mockSession: 'true',
      projects: [{ id: 'p1', name: 'My Project' }],
      activeProjectId: 'p1',
      locks: {
        p1: [{ month: '2026-05', locked: true }] // May locked, June unlocked
      }
    });
    await appPage.goto();

    await page.getByTestId('import-csv-trigger-btn').click();
    // One transaction in June (unlocked), one in May (locked)
    const csvContent = 'DateHeader,DescHeader,OutflowHeader\n2026-06-15,Active Rent,1200.00\n2026-05-10,Locked Rent,1200.00';
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

    // Check preview alerts
    const lockedRow = csvWizardPage.previewTable.locator('tr.csv-locked-month-row');
    await expect(lockedRow).toContainText('Locked Rent');
    await expect(lockedRow.locator('input[type="checkbox"]')).toBeDisabled();

    // Commit import
    await csvWizardPage.clickImport();
    
    // Switch to June view
    await page.getByTestId('month-selector').selectOption('2026-06');
    await expect(page.locator('text=Active Rent')).toBeVisible();

    // Switch to May view
    await page.getByTestId('month-selector').selectOption('2026-05');
    await expect(page.locator('text=Locked Rent')).not.toBeVisible();
  });

  test('7. Mock Mode + CSV Import + Project Storage: Imported statements are stored under specific active project database namespaces', async ({ page }) => {
    await preseedMockData(page, {
      mockSession: 'true',
      projects: [
        { id: 'proj1', name: 'Project One' },
        { id: 'proj2', name: 'Project Two' }
      ],
      activeProjectId: 'proj1'
    });
    await appPage.goto();

    // Import on Project One
    await page.getByTestId('import-csv-trigger-btn').click();
    const csvContent = 'DateHeader,DescHeader,OutflowHeader\n2026-07-15,Electricity,85.00';
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

    // Verify localStorage namespaces are specific
    const proj1Txs = await page.evaluate(() => window.localStorage.getItem('expense_txs_proj1'));
    const proj2Txs = await page.evaluate(() => window.localStorage.getItem('expense_txs_proj2'));
    
    expect(proj1Txs).not.toBeNull();
    expect(JSON.parse(proj1Txs!).find((t: any) => t.description === 'Electricity')).toBeDefined();
    expect(proj2Txs).toBeNull();
  });

  test('8. Lock Month + Project Storage Collaborators: Report emails are CCed to all project collaborators fetched from Drive metadata', async ({ page }) => {
    await preseedMockData(page, {
      mockSession: 'true',
      projects: [{ id: 'p1', name: 'Shared Project', collaborators: ['manager@company.com', 'accountant@company.com'] }],
      activeProjectId: 'p1'
    });
    await appPage.goto();

    const consoleMessages: string[] = [];
    page.on('console', msg => {
      consoleMessages.push(msg.text());
    });

    await dashboardPage.lockCurrentMonth();

    // The console output must show dispatching email CC list populated with collaborators
    const expectedCCs = consoleMessages.find(m => m.includes('manager@company.com') && m.includes('accountant@company.com'));
    expect(expectedCCs).toBeDefined();
  });
});
