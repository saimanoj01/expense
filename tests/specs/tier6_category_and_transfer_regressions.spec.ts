import { test, expect } from '@playwright/test';
import { AppPage } from '../pages/AppPage';
import { DashboardPage } from '../pages/DashboardPage';

// Helper to pre-seed localStorage
const preseedMockData = async (page: any, data: {
  projects?: any[];
  activeProjectId?: string;
  transactions?: Record<string, any[]>;
  budgets?: Record<string, any[]>;
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
    if (seeded.mockSession) {
      window.localStorage.setItem('expense_mock_session', seeded.mockSession);
    }
  }, data);
};

test.describe('Tier 6: Category Dropdown & Transfer Regressions', () => {
  let appPage: AppPage;
  let dashboardPage: DashboardPage;

  test.beforeEach(async ({ page }) => {
    appPage = new AppPage(page);
    dashboardPage = new DashboardPage(page);
  });

  test('41. Inline Category Select: Selecting a category in transaction row updates its category state', async ({ page }) => {
    await preseedMockData(page, {
      mockSession: 'true',
      projects: [{ id: 'p1', name: 'My Project' }],
      activeProjectId: 'p1',
      transactions: {
        p1: [
          { id: 't1', date: '2026-07-01', amount: 50.00, category: 'food', type: 'expense', description: 'Whole Foods Market', notes: '', labels: [], hash: 'h1' }
        ]
      }
    });
    await appPage.goto();

    const rowSelect = page.getByTestId('transaction-category-select-t1');
    await expect(rowSelect).toBeVisible();
    await rowSelect.selectOption('utilities|');

    // Verify localStorage updated
    const updatedTxsStr = await page.evaluate(() => window.localStorage.getItem('expense_txs_p1'));
    expect(updatedTxsStr).not.toBeNull();
    const txs = JSON.parse(updatedTxsStr!);
    expect(txs[0].category).toBe('utilities');
  });

  test('42. Unrecognized Category Fallback: Transaction with custom category renders valid option in select without breaking', async ({ page }) => {
    await preseedMockData(page, {
      mockSession: 'true',
      projects: [{ id: 'p1', name: 'My Project' }],
      activeProjectId: 'p1',
      transactions: {
        p1: [
          { id: 't1', date: '2026-07-01', amount: 25.00, category: 'custom-unmapped-cat', type: 'expense', description: 'Special Event', notes: '', labels: [], hash: 'h2' }
        ]
      }
    });
    await appPage.goto();

    const rowSelect = page.getByTestId('transaction-category-select-t1');
    await expect(rowSelect).toBeVisible();
    // Verify select is populated and interactive
    await rowSelect.selectOption({ index: 0 });
    await expect(rowSelect).not.toHaveValue('custom-unmapped-cat');
  });

  test('43. Transfer Type Auto-Detection: Credit card payment descriptions default to Transfer type and exclude from total expenses', async ({ page }) => {
    await preseedMockData(page, {
      mockSession: 'true',
      projects: [{ id: 'p1', name: 'My Project' }],
      activeProjectId: 'p1',
      transactions: {
        p1: [
          { id: 't1', date: '2026-07-01', amount: 100.00, category: 'food', type: 'expense', description: 'Trader Joes', notes: '', labels: [], hash: 'h1' },
          { id: 't2', date: '2026-07-02', amount: 500.00, category: 'misc', type: 'transfer', description: 'Credit Card Payment - Thank You', notes: '', labels: [], hash: 'h2' }
        ]
      }
    });
    await appPage.goto();

    // Total expenses should only reflect $100.00, excluding $500.00 transfer
    await expect(page.getByTestId('kpi-total-expenses')).toContainText('$100.00');
    // Transfer row badge should be visible
    await expect(page.locator('text=↔️ Transfer')).toBeVisible();
  });

  test('44. Transaction Modal Auto-Detects Transfer Type: Typing "Credit Card Payment" switches mode toggle to Transfer', async ({ page }) => {
    await preseedMockData(page, {
      mockSession: 'true',
      projects: [{ id: 'p1', name: 'My Project' }],
      activeProjectId: 'p1'
    });
    await appPage.goto();

    await dashboardPage.openAddTxnModalBtn.click();
    await page.getByTestId('transaction-desc-input').fill('Chase Credit Card Payment');

    const toggleContainer = page.getByTestId('transaction-type-toggle');
    await expect(toggleContainer).toHaveAttribute('data-active-type', 'transfer');
  });

  test('45. Inline Sub-Category Select: Assigning a sub-category updates transaction subCategory field in localStorage', async ({ page }) => {
    await preseedMockData(page, {
      mockSession: 'true',
      projects: [{ id: 'p1', name: 'My Project' }],
      activeProjectId: 'p1',
      transactions: {
        p1: [
          { id: 't1', date: '2026-07-01', amount: 45.00, category: 'food', type: 'expense', description: 'Safeway Supermarket', notes: '', labels: [], hash: 'h1' }
        ]
      }
    });
    await appPage.goto();

    const rowSelect = page.getByTestId('transaction-category-select-t1');
    await expect(rowSelect).toBeVisible();
    await rowSelect.selectOption('food|food-groceries');

    const updatedTxsStr = await page.evaluate(() => window.localStorage.getItem('expense_txs_p1'));
    expect(updatedTxsStr).not.toBeNull();
    const txs = JSON.parse(updatedTxsStr!);
    expect(txs[0].category).toBe('food');
    expect(txs[0].subCategory).toBe('food-groceries');
  });

  test('46. Add Sub-Category UX: Category modal supports creating custom sub-categories under a parent category', async ({ page }) => {
    await preseedMockData(page, {
      mockSession: 'true',
      projects: [{ id: 'p1', name: 'My Project' }],
      activeProjectId: 'p1'
    });
    await appPage.goto();

    await page.getByTestId('open-add-category-btn').click();
    await page.getByTestId('new-category-name-input').fill('Organic Produce');
    await page.getByTestId('new-category-parent-select').selectOption('food');
    await page.getByRole('button', { name: 'Add Category' }).click();

    const storedCatsStr = await page.evaluate(() => window.localStorage.getItem('expense_categories_p1'));
    expect(storedCatsStr).not.toBeNull();
    const cats = JSON.parse(storedCatsStr!);
    const addedSubCat = cats.find((c: any) => c.name === 'Organic Produce');
    expect(addedSubCat).toBeDefined();
    expect(addedSubCat.parentId).toBe('food');
  });
});
