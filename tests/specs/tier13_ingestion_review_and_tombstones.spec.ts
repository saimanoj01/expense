import { test, expect } from '@playwright/test';
import { AppPage } from '../pages/AppPage';
import { DashboardPage } from '../pages/DashboardPage';

const preseedMockData = async (
  page: any,
  data: {
    projects?: any[];
    activeProjectId?: string;
    transactions?: Record<string, any[]>;
    mockSession?: string;
  }
) => {
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

test.describe('Tier 13: Ingestion Review Queue, Dismiss ("Looks Good"), userEdited & Tombstones', () => {
  let appPage: AppPage;
  let dashboardPage: DashboardPage;

  test.beforeEach(async ({ page }) => {
    appPage = new AppPage(page);
    dashboardPage = new DashboardPage(page);
  });

  test('Needs Review filter pill, "Looks Good" dismiss button, userEdited category protection, and deletion tombstones work end-to-end', async ({
    page,
  }) => {
    await preseedMockData(page, {
      mockSession: 'true',
      projects: [{ id: 'p1', name: 'My Project' }],
      activeProjectId: 'p1',
      transactions: {
        p1: [
          {
            id: 'tx_flagged',
            date: '2026-07-10',
            amount: 42.5,
            category: 'shopping',
            subCategory: 'shopping-amazon',
            spendingBucket: 'flexible',
            type: 'expense',
            description: 'AMZN Mktp US*99X',
            notes: '',
            labels: ['needs-review'],
            hash: 'hash_flagged_99x',
            meta: {
              sources: ['amazon-synchrony'],
              externalIds: { 'amazon-synchrony': 'sync_ext_99x' },
              categorizedBy: 'keyword',
              confidence: 0.55,
              review: {
                reason: 'category',
                reasons: ['category'],
                detail: 'Un-itemized marketplace charge; category may need item enrichment or review.',
                flaggedAt: '2026-07-10T10:00:00.000Z',
              },
            },
          },
          {
            id: 'tx_clean',
            date: '2026-07-11',
            amount: 18.0,
            category: 'food',
            subCategory: 'food-takeout',
            spendingBucket: 'flexible',
            type: 'expense',
            description: 'Chipotle Mexican Grill',
            notes: '',
            labels: [],
            hash: 'hash_clean_chipotle',
            meta: {
              sources: ['bilt-plaid'],
              externalIds: { 'bilt-plaid': 'plaid_chipotle_1' },
              categorizedBy: 'keyword',
              confidence: 0.85,
            },
          },
        ],
      },
    });

    await appPage.goto();
    await dashboardPage.ensureTransactionsView();

    // 1. Verify "Needs Review" KPI pill and row badge are visible
    const needsReviewPill = page.getByTestId('kpi-needs-review');
    await expect(needsReviewPill).toBeVisible();
    await expect(needsReviewPill).toContainText('Needs Review');
    await expect(needsReviewPill).toContainText('1');

    const reviewBadge = page.getByTestId('needs-review-badge-tx_flagged');
    await expect(reviewBadge).toBeVisible();

    // Filter to Needs Review only
    await needsReviewPill.click();
    await expect(page.getByText('AMZN Mktp US*99X')).toBeVisible();
    await expect(page.getByText('Chipotle Mexican Grill')).toHaveCount(0);

    // 2. Click "Looks Good" to dismiss the review flag
    const dismissBtn = page.getByTestId('dismiss-review-btn-tx_flagged');
    await expect(dismissBtn).toBeVisible();
    await dismissBtn.click();

    // Needs Review pill should disappear since 0 items remain flagged
    await expect(needsReviewPill).toHaveCount(0);

    // Verify localStorage persisted resolvedAt and categorizedBy: 'user'
    const txsAfterDismiss = await page.evaluate(() =>
      JSON.parse(window.localStorage.getItem('expense_txs_p1') || '[]')
    );
    const dismissedTx = txsAfterDismiss.find((t: any) => t.id === 'tx_flagged');
    expect(dismissedTx.labels).not.toContain('needs-review');
    expect(dismissedTx.meta.categorizedBy).toBe('user');
    expect(dismissedTx.meta.review.resolvedAt).toBeTruthy();

    // 3. Change category on tx_clean via inline dropdown -> verify userEdited tracking
    const catSelect = page.getByTestId('transaction-category-select-tx_clean');
    await expect(catSelect).toBeVisible();
    await catSelect.selectOption('groceries|groceries-supermarket');

    const txsAfterEdit = await page.evaluate(() =>
      JSON.parse(window.localStorage.getItem('expense_txs_p1') || '[]')
    );
    const editedTx = txsAfterEdit.find((t: any) => t.id === 'tx_clean');
    expect(editedTx.category).toBe('groceries');
    expect(editedTx.meta.userEdited).toContain('category');
    expect(editedTx.meta.categorizedBy).toBe('user');

    // 4. Delete tx_clean -> verify deletion tombstone is written to expense_ingest_state_p1
    await page.getByTestId('delete-transaction-btn-tx_clean').click();
    const confirmDeleteBtn = page.getByRole('button', { name: /^Delete$/i });
    if ((await confirmDeleteBtn.count()) > 0) {
      await confirmDeleteBtn.click();
    }

    const ingestState = await page.evaluate(() =>
      JSON.parse(window.localStorage.getItem('expense_ingest_state_p1') || '{}')
    );
    expect(ingestState.tombstones).toBeDefined();
    expect(ingestState.tombstones).toContain('plaid_chipotle_1');
  });
});
