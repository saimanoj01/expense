import { test, expect, Page } from '@playwright/test';

interface SeedData {
  projects?: Array<{ id: string; name: string }>;
  activeProjectId?: string;
  transactions?: Record<string, unknown[]>;
  categories?: Record<string, unknown[]>;
  budgets?: Record<string, unknown[]>;
  mockSession?: string;
}

const preseedMockData = async (page: Page, data: SeedData) => {
  await page.addInitScript((seeded: SeedData) => {
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
    if (seeded.categories) {
      for (const [projId, cats] of Object.entries(seeded.categories)) {
        window.localStorage.setItem(`expense_categories_${projId}`, JSON.stringify(cats));
      }
    }
    if (seeded.budgets) {
      for (const [projId, bgs] of Object.entries(seeded.budgets)) {
        window.localStorage.setItem(`expense_budgets_${projId}`, JSON.stringify(bgs));
      }
    }
    if (seeded.mockSession) {
      window.localStorage.setItem('expense_mock_session', seeded.mockSession);
    }
  }, data);
};

test.describe('Tier 12: v3 Progressive Disclosure Drill-Down Experience', () => {
  test.beforeEach(async ({ page }) => {
    await preseedMockData(page, {
      mockSession: 'true',
      projects: [{ id: 'proj-v3', name: 'DrillDown Test Project' }],
      activeProjectId: 'proj-v3',
      transactions: {
        'proj-v3': [
          {
            id: 'tx-rent',
            date: '2026-11-01',
            category: 'housing',
            amount: 2400,
            type: 'expense',
            description: 'Apartment Lease',
            notes: '',
            labels: ['fixed'],
            hash: 'hash-rent',
            spendingBucket: 'fixed'
          },
          {
            id: 'tx-groceries',
            date: '2026-11-05',
            category: 'food',
            amount: 150,
            type: 'expense',
            description: 'Trader Joes',
            notes: '',
            labels: ['groceries'],
            hash: 'hash-groceries',
            spendingBucket: 'flexible'
          },
          {
            id: 'tx-salary',
            date: '2026-11-01',
            category: 'income',
            amount: 6000,
            type: 'income',
            description: 'Primary Salary',
            notes: '',
            labels: ['salary'],
            hash: 'hash-salary'
          }
        ]
      },
      categories: {
        'proj-v3': [
          { id: 'housing', name: 'Housing', color: '#6366F1', emoji: '🏠', defaultBucket: 'fixed' },
          { id: 'food', name: 'Food & Dining', color: '#8B5CF6', emoji: '🍔', defaultBucket: 'flexible' },
          { id: 'income', name: 'Salary', color: '#10B981', emoji: '💰' }
        ]
      },
      budgets: {
        'proj-v3': [
          { category: 'housing', amount: 2400 },
          { category: 'food', amount: 500 }
        ]
      }
    });
  });

  test('1. Breadcrumb trail renders on dashboard and updates dynamically with hash changes', async ({ page }) => {
    await page.goto('/#month/2026-11');
    const breadcrumbs = page.getByTestId('breadcrumb-trail');
    await expect(breadcrumbs).toBeVisible();
    await expect(page.getByTestId('breadcrumb-item-month-overview')).toContainText('Nov 2026');

    // Navigate to Level 2 Bucket via hash
    await page.evaluate(() => { window.location.hash = '#/month/2026-11/bucket/fixed'; });
    await expect(page.getByTestId('breadcrumb-back-btn')).toBeVisible();
    await expect(page.getByTestId('breadcrumb-item-bucket-fixed')).toContainText('Fixed Commitments');

    // Click back button to return to overview
    await page.getByTestId('breadcrumb-back-btn').click();
    await expect(page.getByTestId('breadcrumb-item-month-overview')).toBeVisible();
    await expect(page.getByTestId('breadcrumb-back-btn')).not.toBeVisible();
  });

  test('2. Deep linking into Level 2 Bucket parses shorthand hash and supports keyboard Escape navigation', async ({ page }) => {
    await page.goto('/#2026-11/bucket/fixed');
    await expect(page.getByTestId('breadcrumb-item-bucket-fixed')).toBeVisible();

    // Press Escape to go back one level
    await page.keyboard.press('Escape');
    await expect(page.getByTestId('breadcrumb-item-month-overview')).toBeVisible();
  });

  test('3. Category drilldown breadcrumb supports ancestor click to return', async ({ page }) => {
    await page.goto('/#month/2026-11/category/housing');
    await expect(page.getByTestId('breadcrumb-item-category-housing')).toBeVisible();
    await expect(page.getByTestId('breadcrumb-item-bucket-fixed')).toBeVisible();

    // Clicking ancestor breadcrumb segment 'Nov 2026' navigates to Level 1
    await page.getByTestId('breadcrumb-item-month-root').locator('button').click();
    await expect(page.getByTestId('breadcrumb-item-month-overview')).toBeVisible();
  });

  test('4. Browser Back and Forward buttons seamlessly navigate drilldown history', async ({ page }) => {
    await page.goto('/#month/2026-11');
    await page.evaluate(() => { window.location.hash = '#/month/2026-11/bucket/variable'; });
    await expect(page.getByTestId('breadcrumb-item-bucket-variable')).toBeVisible();

    // Browser back
    await page.goBack();
    await expect(page.getByTestId('breadcrumb-item-month-overview')).toBeVisible();

    // Browser forward
    await page.goForward();
    await expect(page.getByTestId('breadcrumb-item-bucket-variable')).toBeVisible();
  });
});
