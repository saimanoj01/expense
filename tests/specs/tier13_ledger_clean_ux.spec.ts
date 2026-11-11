import { test, expect, Page } from '@playwright/test';
import { AppPage } from '../pages/AppPage';
import { DashboardPage } from '../pages/DashboardPage';

const preseedLedgerData = async (page: Page) => {
  const seeded = {
    mockSession: 'true',
    projects: [{ id: 'proj-clean', name: 'Clean Ledger Project' }],
    activeProjectId: 'proj-clean',
    transactions: {
      'proj-clean': [
        {
          id: 'tx_rent',
          date: '2026-11-01',
          amount: 2400.0,
          category: 'housing',
          subCategory: 'housing-mortgage',
          spendingBucket: 'fixed',
          type: 'expense',
          description: 'Avalon Apartment Rent',
          notes: 'Google Wallet (Plaid) • Bilt Palladium Card (7702)',
          labels: ['fixed', 'bilt', 'imported'],
          hash: 'hash_rent_1',
          meta: {
            account: 'bilt',
            sources: ['google_wallet'],
          },
        },
        {
          id: 'tx_sushi',
          date: '2026-11-08',
          amount: 84.5,
          category: 'food',
          subCategory: 'food-dine-in',
          spendingBucket: 'flexible',
          type: 'expense',
          description: 'Omakase Tokyo',
          notes: 'Imported via CSV',
          labels: ['flexible', 'priyanka chase', 'japan-trip'],
          hash: 'hash_sushi_1',
          meta: {
            account: 'priyanka chase',
          },
        },
        {
          id: 'tx_review',
          date: '2026-11-09',
          amount: 39.99,
          category: 'misc',
          subCategory: null,
          spendingBucket: 'flexible',
          type: 'expense',
          description: 'AMZN Mktp US*11A',
          notes: '',
          labels: ['needs-review', 'amazon store card'],
          hash: 'hash_amzn_rev_1',
          meta: {
            account: 'amazon-synchrony',
            review: {
              reason: 'category',
              reasons: ['category'],
              detail: 'Un-itemized marketplace charge',
              flaggedAt: '2026-11-09T12:00:00.000Z',
            },
          },
        },
        {
          id: 'tx_dup_a',
          date: '2026-11-10',
          amount: 14.25,
          category: 'food',
          subCategory: 'food-takeout',
          spendingBucket: 'flexible',
          type: 'expense',
          description: 'Blue Bottle Coffee',
          notes: '',
          labels: [],
          hash: 'hash_dup_coffee',
          meta: { account: 'bilt' },
        },
        {
          id: 'tx_dup_b',
          date: '2026-11-10',
          amount: 14.25,
          category: 'food',
          subCategory: 'food-takeout',
          spendingBucket: 'flexible',
          type: 'expense',
          description: 'Blue Bottle Coffee',
          notes: '',
          labels: [],
          hash: 'hash_dup_coffee',
          meta: { account: 'bilt' },
        },
      ],
    },
  };

  await page.addInitScript(data => {
    window.localStorage.setItem('expense_projects', JSON.stringify(data.projects));
    window.localStorage.setItem('expense_active_project_id', data.activeProjectId);
    for (const [projId, txs] of Object.entries(data.transactions)) {
      window.localStorage.setItem(`expense_txs_${projId}`, JSON.stringify(txs));
    }
    window.localStorage.setItem('expense_mock_session', data.mockSession);
  }, seeded);
};

test.describe('Tier 13: Clean Transactions Ledger UX & 4-Layer Label Taxonomy', () => {
  test('1. Zero duplicate controls, clean taxonomy (#tags exclude system/bucket/account), account & #tag search/filter, and selection pruning', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await preseedLedgerData(page);

    const appPage = new AppPage(page);
    const dashboardPage = new DashboardPage(page);
    await appPage.goto();
    await dashboardPage.ensureTransactionsView();

    // 1. Zero duplicate controls on /transactions
    await expect(page.getByTestId('month-selector')).toHaveCount(1);
    await expect(page.getByTestId('lock-status-indicator')).toHaveCount(1);
    await expect(page.getByTestId('ledger-filter-btn')).toHaveCount(1);
    await expect(page.getByTestId('transaction-sort-select')).toHaveCount(1);

    // 2. Redundant system/bucket/account labels ('#fixed', '#flexible', '#bilt', '#imported', '#needs-review')
    // must NEVER render as #tag pills, while genuine user '#japan-trip' DOES render
    await expect(page.getByText('#japan-trip')).toBeVisible();
    await expect(page.getByText('#fixed')).toHaveCount(0);
    await expect(page.getByText('#flexible')).toHaveCount(0);
    await expect(page.getByText('#bilt')).toHaveCount(0);
    await expect(page.getByText('#imported')).toHaveCount(0);
    await expect(page.getByText('#needs-review')).toHaveCount(0);

    // Open Filter popover and verify system/account labels are absent from Tag section while Account section lists accounts
    await page.getByTestId('ledger-filter-btn').click();
    const filterPopover = page.locator('[data-popover="ledger-filter"]');
    await expect(filterPopover).toBeVisible();
    await expect(page.getByTestId('filter-account-bilt')).toBeVisible();
    await expect(page.getByTestId('filter-account-priyanka chase')).toBeVisible();
    await expect(page.getByTestId('filter-tag-japan-trip')).toBeVisible();
    await expect(page.getByTestId('filter-tag-fixed')).toHaveCount(0);
    await expect(page.getByTestId('filter-tag-bilt')).toHaveCount(0);

    // Pressing Escape closes filter popover WITHOUT navigating away from /transactions
    await page.keyboard.press('Escape');
    await expect(filterPopover).toHaveCount(0);
    await expect(page.getByTestId('level4-transactions-workspace')).toBeVisible();

    // 3. Search by leading '#japan-trip' and by account display name 'Priyanka Chase'
    const searchInput = page.getByTestId('transaction-search-input');
    await searchInput.fill('#japan-trip');
    await expect(page.getByText('Omakase Tokyo')).toBeVisible();
    await expect(page.getByText('Avalon Apartment Rent')).toHaveCount(0);

    await searchInput.fill('Priyanka Chase');
    await expect(page.getByText('Omakase Tokyo')).toBeVisible();
    await expect(page.getByText('Avalon Apartment Rent')).toHaveCount(0);
    await searchInput.fill('');

    // 4. Stale hidden selection guard: Select all (5), then filter to 'Priyanka Chase' (1 row) -> selection prunes to 1!
    await page.getByTestId('select-all-txns-checkbox').check();
    await expect(page.getByTestId('floating-bulk-action-bar')).toContainText('5 selected');

    await page.getByTestId('ledger-filter-btn').click();
    await page.getByTestId('filter-account-priyanka chase').click();
    await page.keyboard.press('Escape');

    await expect(page.getByTestId('transaction-row')).toHaveCount(1);
    await expect(page.getByTestId('floating-bulk-action-bar')).toContainText('1 selected');
  });

  test('2. Inline category & bucket quick-edit, Escape safety on bucket switcher, Duplicate?/Needs Review dismissal, and category chip URL sync', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await preseedLedgerData(page);

    const appPage = new AppPage(page);
    const dashboardPage = new DashboardPage(page);
    await appPage.goto();
    await dashboardPage.ensureTransactionsView();

    // 1. Bucket switcher popover + Escape closes popover without leaving /transactions
    const bucketPill = page.getByTestId('bucket-pill-tx_sushi');
    await expect(bucketPill).toContainText('Variable');
    await bucketPill.click();

    const bucketSwitcher = page.getByTestId('bucket-switcher-tx_sushi');
    await expect(bucketSwitcher).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(bucketSwitcher).toHaveCount(0);
    await expect(page.getByTestId('level4-transactions-workspace')).toBeVisible();

    // Re-open bucket switcher and change Variable -> Non-monthly
    await bucketPill.click();
    await page.getByTestId('bucket-switcher-tx_sushi').getByRole('button', { name: 'Set Non-monthly' }).click();
    await expect(bucketPill).toContainText('Non-monthly');

    // 2. Inline category select is tightly sized to its selected label (not ~194px widest option)
    const miscCatSelect = page.getByTestId('transaction-category-select-tx_review');
    const miscBox = await miscCatSelect.boundingBox();
    expect(miscBox).not.toBeNull();
    expect(miscBox!.width).toBeLessThan(125);

    // Editing category on flagged tx_review resolves its Needs Review badge automatically
    await expect(page.getByTestId('needs-review-badge-tx_review')).toBeVisible();
    await miscCatSelect.selectOption('shopping|shopping-amazon');
    await expect(page.getByTestId('needs-review-badge-tx_review')).toHaveCount(0);

    // 3. Duplicate? rows show Needs Review count (2 colliding rows) and "Looks Good" dismisses duplicate review
    const reviewKpi = page.getByTestId('kpi-needs-review');
    await expect(reviewKpi).toContainText('2');
    await expect(page.getByTestId('needs-review-badge-tx_dup_a')).toContainText('Duplicate?');
    await page.getByTestId('dismiss-review-btn-tx_dup_a').click();
    // Once 1 of 2 colliding rows is verified, neither remains an unverified collision!
    await expect(page.getByTestId('kpi-needs-review')).toHaveCount(0);

    // 4. Category drilldown breadcrumb count & clearing Category chip syncs URL back to #/transactions
    await page.goto('/#/month/2026-11/category/housing/transactions');
    await expect(page.getByTestId('breadcrumb-item-category-transactions-housing')).toContainText('Transactions (1)');
    await expect(page.getByTestId('level4-transactions-workspace')).toHaveCount(1);
    await page.getByLabel('Clear category filter').click();
    await expect
      .poll(() => page.evaluate(() => window.location.hash))
      .toBe('#/transactions?month=2026-11');
  });

  test('3. Mobile (390x844) clean responsive toolbar, unclipped Filter popover, tap-to-edit modal Delete, and Select/Done bulk mode', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await preseedLedgerData(page);

    const appPage = new AppPage(page);
    await appPage.goto();
    await page.goto('/#/transactions?month=2026-11');
    await expect(page.getByTestId('level4-transactions-workspace')).toBeVisible();

    // 1. Filter popover opens fully inside the 390px viewport without horizontal clipping
    await page.getByTestId('ledger-filter-btn').click();
    const filterPopover = page.locator('[data-popover="ledger-filter"]');
    await expect(filterPopover).toBeVisible();
    const popBox = await filterPopover.boundingBox();
    expect(popBox).not.toBeNull();
    expect(popBox!.x).toBeGreaterThanOrEqual(8);
    expect(popBox!.x + popBox!.width).toBeLessThanOrEqual(382);
    await page.keyboard.press('Escape');

    // 2. Mobile bulk Select / Done toggle reveals checkboxes and clears on Done
    const mobileSelectBtn = page.getByTestId('mobile-select-toggle-btn');
    await expect(mobileSelectBtn).toHaveText('Select');
    await mobileSelectBtn.click();
    await expect(mobileSelectBtn).toHaveText('Done');
    await expect(page.getByTestId('select-all-txns-checkbox')).toBeVisible();
    await mobileSelectBtn.click();
    await expect(mobileSelectBtn).toHaveText('Select');

    // 3. Tapping a row on mobile opens the Edit Record modal with a working Delete button
    await page.getByText('Omakase Tokyo').click();
    const deleteModalBtn = page.getByTestId('modal-delete-transaction-btn');
    await expect(deleteModalBtn).toBeVisible();
    await deleteModalBtn.click();
    await expect(page.getByText('Omakase Tokyo')).toHaveCount(0);
  });
});
