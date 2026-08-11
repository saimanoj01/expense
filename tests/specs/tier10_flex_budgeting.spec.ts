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

test.describe('Tier 10: Flex Budgeting & Spending Bucket Separation', () => {
  let appPage: AppPage;

  test.beforeEach(async ({ page }) => {
    appPage = new AppPage(page);
    await preseedMockData(page, {
      mockSession: 'true',
      projects: [{ id: 'p1', name: 'Flex Budget Project' }],
      activeProjectId: 'p1',
      transactions: {
        p1: [
          {
            id: 't1',
            date: '2026-07-01',
            category: 'income',
            amount: 15000,
            type: 'income',
            description: 'Monthly Salary',
            notes: '',
            labels: ['salary'],
            hash: 'hash1'
          },
          {
            id: 't2',
            date: '2026-07-02',
            category: 'housing',
            amount: 10000,
            type: 'expense',
            spendingBucket: 'fixed',
            description: 'Mortgage Payment',
            notes: '',
            labels: ['housing', 'fixed'],
            hash: 'hash2'
          },
          {
            id: 't3',
            date: '2026-07-05',
            category: 'food',
            amount: 50,
            type: 'expense',
            spendingBucket: 'flexible',
            description: 'Starbucks Coffee',
            notes: '',
            labels: ['coffee', 'flexible'],
            hash: 'hash3'
          }
        ]
      }
    });
    await appPage.goto();
  });

  test('Displays Flex Number KPI card correctly ($15,000 Income - $10,000 Fixed = $5,000 Flex Pool)', async ({ page }) => {
    await expect(page.getByTestId('kpi-total-income')).toContainText('$15,000.00');
    await expect(page.getByTestId('kpi-fixed-expenses')).toContainText('$10,000.00');
    await expect(page.getByTestId('kpi-flex-number')).toContainText('$5,000.00');
  });

  test('Renders colored dot indicators on transaction items', async ({ page }) => {
    const fixedDot = page.getByTestId('bucket-dot-t2-fixed');
    await expect(fixedDot).toBeVisible();

    const flexDot = page.getByTestId('bucket-dot-t3-flexible');
    await expect(flexDot).toBeVisible();
  });

  test('Toolbar bucket filter chips filter transaction list', async ({ page }) => {
    // Filter to Fixed only
    await page.getByTestId('filter-bucket-fixed').click();
    await expect(page.locator('h4:has-text("Mortgage Payment")')).toBeVisible();
    await expect(page.locator('h4:has-text("Starbucks Coffee")')).not.toBeVisible();

    // Toggle off filter
    await page.getByTestId('filter-bucket-fixed').click();
    await expect(page.locator('h4:has-text("Starbucks Coffee")')).toBeVisible();
  });

  test('Budget Utilization tabs toggle bucket views', async ({ page }) => {
    const tabs = page.getByTestId('budget-bucket-tabs');
    await expect(tabs).toBeVisible();
    await tabs.getByRole('button', { name: 'Fixed' }).click();
    await tabs.getByRole('button', { name: 'Flexible' }).click();
  });
});
