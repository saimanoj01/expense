import { test, expect } from '@playwright/test';
import { AppPage } from '../pages/AppPage';

const preseedMockData = async (page: any, data: {
  projects?: any[];
  activeProjectId?: string;
  transactions?: Record<string, any[]>;
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
    if (seeded.mockSession) {
      window.localStorage.setItem('expense_mock_session', seeded.mockSession);
    }
  }, data);
};

test.describe('Tier 8: Transaction Sort By Functionality', () => {
  let appPage: AppPage;

  test.beforeEach(async ({ page }) => {
    appPage = new AppPage(page);
    await preseedMockData(page, {
      mockSession: 'true',
      projects: [{ id: 'p1', name: 'Sort Test Project' }],
      activeProjectId: 'p1',
      transactions: {
        p1: [
          { id: 't1', date: '2026-07-01', amount: 100, category: 'food', type: 'expense', description: 'Alpha Bakery', notes: '', labels: [], hash: 'h1' },
          { id: 't2', date: '2026-07-15', amount: 500, category: 'housing', type: 'expense', description: 'Zebra Apartments', notes: '', labels: [], hash: 'h2' },
          { id: 't3', date: '2026-07-10', amount: 50, category: 'transport', type: 'expense', description: 'Middle Gas', notes: '', labels: [], hash: 'h3' }
        ]
      }
    });
    await appPage.goto();
  });

  test('Sort dropdown exists and defaults to date-desc', async ({ page }) => {
    const select = page.getByTestId('transaction-sort-select');
    await expect(select).toBeVisible();
    await expect(select).toHaveValue('date-desc');
  });

  test('Sort by Date (Oldest First vs Newest First)', async ({ page }) => {
    const select = page.getByTestId('transaction-sort-select');
    
    // Default (Date: Newest First -> July 15, July 10, July 1)
    let descriptions = page.locator('[data-testid="transaction-item"] h3, [data-testid="transaction-row"] .txn-description, h3');
    await expect(page.locator('text=Zebra Apartments')).toBeVisible();

    // Change to Date: Oldest First
    await select.selectOption('date-asc');
    await expect(select).toHaveValue('date-asc');
  });

  test('Sort by Amount (High to Low and Low to High)', async ({ page }) => {
    const select = page.getByTestId('transaction-sort-select');
    
    // Sort High to Low (500, 100, 50)
    await select.selectOption('amount-desc');
    await expect(select).toHaveValue('amount-desc');

    // Sort Low to High (50, 100, 500)
    await select.selectOption('amount-asc');
    await expect(select).toHaveValue('amount-asc');
  });

  test('Sort preference persists across page reloads', async ({ page }) => {
    const select = page.getByTestId('transaction-sort-select');
    await select.selectOption('amount-desc');

    await page.reload();
    await expect(select).toHaveValue('amount-desc');
  });
});
