import { test, expect } from '@playwright/test';
import { AppPage } from '../pages/AppPage';
import { DashboardPage } from '../pages/DashboardPage';

const preseedMockData = async (page: any, data: {
  projects?: any[];
  activeProjectId?: string;
  transactions?: Record<string, any[]>;
  budgets?: Record<string, any[]>;
  categories?: Record<string, any[]>;
  mockSession?: string;
}) => {
  await page.goto('/');
  await page.evaluate((d: any) => {
    if (d.mockSession) window.localStorage.setItem('expense_mock_session', d.mockSession);
    if (d.projects) window.localStorage.setItem('expense_projects', JSON.stringify(d.projects));
    if (d.activeProjectId) window.localStorage.setItem('expense_active_project_id', d.activeProjectId);
    if (d.transactions) {
      for (const [pId, txs] of Object.entries(d.transactions)) {
        window.localStorage.setItem(`expense_txs_${pId}`, JSON.stringify(txs));
      }
    }
    if (d.categories) {
      for (const [pId, cats] of Object.entries(d.categories)) {
        window.localStorage.setItem(`expense_categories_${pId}`, JSON.stringify(cats));
      }
    }
  }, data);
};

test.describe('Tier 7: Unified Categories & Category Manager Modal', () => {
  let appPage: AppPage;
  let dashboardPage: DashboardPage;

  test.beforeEach(async ({ page }) => {
    appPage = new AppPage(page);
    dashboardPage = new DashboardPage(page);
  });

  test('47. Homepage Budget Card renders full 13 parent categories', async ({ page }) => {
    await preseedMockData(page, {
      mockSession: 'true',
      projects: [{ id: 'p1', name: 'My Project' }],
      activeProjectId: 'p1'
    });
    await appPage.goto();

    const expectedParents = [
      'Groceries', 'Shopping', 'Merchandise', 'Utilities', 'Food & Dining',
      'Entertainment', 'Miscellaneous', 'Income', 'Transfers', 'Travel',
      'Housing', 'Transport', 'Health & Medical'
    ];

    for (const name of expectedParents) {
      await expect(page.locator(`text=${name}`).first()).toBeVisible();
    }
  });

  test('48. Category Manager Modal: Opens from homepage and supports adding a custom sub-category', async ({ page }) => {
    await preseedMockData(page, {
      mockSession: 'true',
      projects: [{ id: 'p1', name: 'My Project' }],
      activeProjectId: 'p1'
    });
    await appPage.goto();

    // Open Category Manager Modal
    await page.getByTestId('open-add-category-btn').click();
    await expect(page.getByTestId('category-manager-modal')).toBeVisible();

    // Click + Sub on first category (Groceries)
    await page.getByRole('button', { name: 'Sub' }).first().click();

    // Fill new sub-category form
    await page.locator('input[placeholder="e.g. Subscriptions"]').fill('Trader Joes Special');
    await page.getByRole('button', { name: 'Save Category' }).click();

    // Verify localStorage updated with new sub-category under groceries
    const storedCatsStr = await page.evaluate(() => window.localStorage.getItem('expense_categories_p1'));
    expect(storedCatsStr).not.toBeNull();
    const cats = JSON.parse(storedCatsStr!);
    const newSub = cats.find((c: any) => c.name === 'Trader Joes Special');
    expect(newSub).toBeDefined();
    expect(newSub.parentId).toBe('groceries');
  });

  test('49. Category Manager Modal: Accessible from Add Transaction Modal', async ({ page }) => {
    await preseedMockData(page, {
      mockSession: 'true',
      projects: [{ id: 'p1', name: 'My Project' }],
      activeProjectId: 'p1'
    });
    await appPage.goto();

    await dashboardPage.openAddTxnModalBtn.click();
    await page.getByRole('button', { name: '+ Manage Categories' }).click();

    await expect(page.getByTestId('category-manager-modal')).toBeVisible();
  });
});
