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

  test('5. Desktop Sidebar renders on 1440px, collapses and expands, and triggers navigation', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto('/#month/2026-11');
    const sidebar = page.getByTestId('sidebar');
    await expect(sidebar).toBeVisible();

    // Toggle collapse
    const toggleBtn = page.getByTestId('sidebar-toggle-btn');
    await toggleBtn.click();
    // After collapsing, expand button should become visible
    await expect(page.getByTestId('sidebar-expand-btn')).toBeVisible();
    await page.getByTestId('sidebar-expand-btn').click();
    await expect(page.getByTestId('sidebar-toggle-btn')).toBeVisible();

    // Navigate to transactions view via sidebar
    await page.getByTestId('nav-item-transactions').click();
    await expect(page.getByTestId('breadcrumb-item-transactions')).toBeVisible();
  });

  test('6. Mobile Bottom Navigation renders on 390px viewport with safe-area insets and drawer', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/#month/2026-11');
    const bottomNav = page.getByTestId('bottom-nav');
    await expect(bottomNav).toBeVisible();
    await expect(page.getByTestId('sidebar')).not.toBeVisible();

    // Click More to open mobile drawer
    await page.getByTestId('bottom-nav-more').click();
    const drawer = page.getByTestId('mobile-more-drawer');
    await expect(drawer).toBeVisible();

    // Click Trends in drawer
    await page.getByTestId('drawer-nav-trends').click();
    await expect(drawer).not.toBeVisible();
    await expect(page.getByTestId('breadcrumb-item-trends')).toBeVisible();
  });

  test('7. Command Palette opens via trigger and ⌘K, searches items, and navigates', async ({ page }) => {
    await page.goto('/#month/2026-11');
    const trigger = page.getByTestId('command-palette-trigger');
    await expect(trigger).toBeVisible();
    await trigger.click();

    const palette = page.getByTestId('command-palette-modal');
    await expect(palette).toBeVisible();

    const searchInput = page.getByTestId('command-palette-input');
    await searchInput.fill('Fixed');
    await expect(page.getByTestId('command-item-bucket-fixed')).toBeVisible();

    // Select with Enter
    await page.keyboard.press('Enter');
    await expect(palette).not.toBeVisible();
    await expect(page.getByTestId('breadcrumb-item-bucket-fixed')).toBeVisible();
  });

  test('8. Level 1 Calm Month Overview renders Hero Savings Card, Allocation Ring, and 4 Bucket Cards', async ({ page }) => {
    await page.goto('/#month/2026-11');

    // Month Switcher
    const switcher = page.getByTestId('month-switcher');
    await expect(switcher).toBeVisible();

    // Hero Savings Card
    const heroCard = page.getByTestId('hero-savings-card');
    await expect(heroCard).toBeVisible();
    await expect(page.getByTestId('kpi-savings-amount')).toBeVisible();
    await expect(page.getByTestId('kpi-savings-rate')).toBeVisible();

    // Income Allocation Ring
    const ring = page.getByTestId('income-allocation-ring');
    await expect(ring).toBeVisible();

    // 4 Morphing Bucket Cards
    await expect(page.getByTestId('kpi-total-income')).toBeVisible();
    await expect(page.getByTestId('kpi-fixed-expenses')).toBeVisible();
    await expect(page.getByTestId('kpi-flexible-spent')).toBeVisible();
    await expect(page.getByTestId('kpi-non-monthly')).toBeVisible();

    // Story Narrative Card
    await expect(page.getByTestId('story-narrative')).toBeVisible();
    await expect(page.getByTestId('guideline-meter-50-30-20')).toBeVisible();
  });

  test('9. Month Switcher arrow buttons, keyboard shortcuts, and drilldown CTA transitions', async ({ page }) => {
    await page.goto('/#month/2026-11');
    await expect(page.getByTestId('month-switcher')).toBeVisible();

    // Test next button
    const nextBtn = page.getByTestId('btn-next-month');
    await nextBtn.click();
    await expect(page.getByTestId('breadcrumb-item-month-overview')).toContainText('Dec 2026');
    await expect(page.getByTestId('month-selector')).toHaveValue('2026-12');

    // Test prev button
    const prevBtn = page.getByTestId('btn-prev-month');
    await prevBtn.click();
    await expect(page.getByTestId('breadcrumb-item-month-overview')).toContainText('Nov 2026');
    await expect(page.getByTestId('month-selector')).toHaveValue('2026-11');

    // Test keyboard ArrowLeft navigates to Oct 2026
    await page.keyboard.press('ArrowLeft');
    await expect(page.getByTestId('breadcrumb-item-month-overview')).toContainText('Oct 2026');
    await expect(page.getByTestId('month-selector')).toHaveValue('2026-10');

    // Test keyboard ArrowRight navigates back to Nov 2026
    await page.keyboard.press('ArrowRight');
    await expect(page.getByTestId('breadcrumb-item-month-overview')).toContainText('Nov 2026');
    await expect(page.getByTestId('month-selector')).toHaveValue('2026-11');

    // Test direct Level 2 Drill-down button on Fixed bucket card
    const drillFixedBtn = page.getByTestId('drill-down-fixed');
    await expect(drillFixedBtn).toBeVisible();
    await drillFixedBtn.click();
    await expect(page.getByTestId('breadcrumb-item-bucket-fixed')).toBeVisible();
  });

  test('10. Desktop Zero-Scroll Constraint & Tabular Numerals Formatting', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto('/#month/2026-11');

    // Tabular numerals verification on Hero KPI
    const savingsAmount = page.getByTestId('kpi-savings-amount');
    await expect(savingsAmount).toBeVisible();
    await expect(savingsAmount).toHaveClass(/tabular-nums/);

    // Verify desktop header bounding box fits comfortably within 900px viewport
    const dashboardHeader = page.getByTestId('dashboard-header');
    await expect(dashboardHeader).toBeVisible();
    const box = await dashboardHeader.boundingBox();
    expect(box).not.toBeNull();
    if (box) {
      // The Level 1 Overview component must fit within the 900px viewport
      expect(box.height).toBeLessThan(900);
    }

    // Strict zero-scroll assertion: the full document must not require vertical scrolling at 1440x900
    const isZeroScroll = await page.evaluate(() => window.innerHeight >= document.body.scrollHeight);
    expect(isZeroScroll).toBe(true);
  });

  test('11. Level 2 Bucket View renders Hero Bucket Banner, Ranked Categories, and transitions to Level 3', async ({ page }) => {
    // Navigate directly to Level 2 Fixed Bucket
    await page.goto('/#month/2026-11/bucket/fixed');

    const bucketView = page.getByTestId('level2-bucket-view');
    await expect(bucketView).toBeVisible();

    // Verify Bucket Total Spent
    const totalSpent = page.getByTestId('bucket-total-spent');
    await expect(totalSpent).toBeVisible();
    await expect(totalSpent).toContainText('$2,400.00');

    // Verify Ranked Categories in this bucket
    const housingRow = page.getByTestId('category-row-housing');
    await expect(housingRow).toBeVisible();
    await expect(housingRow).toContainText('Housing');

    // Click Category row to transition to Level 3
    await housingRow.click();
    await expect(page.getByTestId('level3-category-view')).toBeVisible();
    await expect(page.getByTestId('breadcrumb-item-category-housing')).toBeVisible();
  });

  test('12. Level 3 Category View renders Daily Spending Sparkline, Top Payees, and search filter', async ({ page }) => {
    // Navigate directly to Level 3 Housing Category
    await page.goto('/#month/2026-11/category/housing');

    const categoryView = page.getByTestId('level3-category-view');
    await expect(categoryView).toBeVisible();

    // Verify category spent
    const categorySpent = page.getByTestId('category-total-spent');
    await expect(categorySpent).toBeVisible();
    await expect(categorySpent).toContainText('$2,400.00');

    // Verify Daily Spend Timeline SVG sparkline
    const sparkline = page.getByTestId('daily-spend-timeline');
    await expect(sparkline).toBeVisible();

    // Verify Top Payees breakdown
    const payees = page.getByTestId('top-merchants-breakdown');
    await expect(payees).toBeVisible();

    // Test Category Transaction search filter
    const searchInput = page.getByTestId('category-txn-search');
    await expect(searchInput).toBeVisible();
    await searchInput.fill('Apartment');
    await expect(page.getByTestId('category-txn-tx-rent')).toBeVisible();

    // Test Back to Bucket button
    const backBtn = page.getByTestId('back-to-bucket-btn');
    await expect(backBtn).toBeVisible();
    await backBtn.click();
    await expect(page.getByTestId('level2-bucket-view')).toBeVisible();
  });

  test('13. Level 4 Complete Ledger Workspace renders filtered category transactions and search input', async ({ page }) => {
    // Navigate directly to Level 4 Category Transactions
    await page.goto('/#month/2026-11/category/housing/transactions');

    const ledgerWorkspace = page.getByTestId('level4-transactions-workspace');
    await expect(ledgerWorkspace).toBeVisible();

    // Verify search input
    const searchInput = page.getByTestId('transaction-search-input');
    await expect(searchInput).toBeVisible();
    await searchInput.fill('Lease');
    await expect(page.locator('text=Apartment Lease')).toBeVisible();

    // Verify sort selector
    await expect(page.getByTestId('transaction-sort-select')).toBeVisible();

    // Verify breadcrumbs
    await expect(page.getByTestId('breadcrumb-item-category-housing')).toBeVisible();
  });

  test('14. Budgets Workspace renders dedicated planning hub with target inputs and save controls', async ({ page }) => {
    // Navigate to dedicated budgets route
    await page.goto('/#/budgets');

    const budgetsWorkspace = page.getByTestId('budgets-workspace');
    await expect(budgetsWorkspace).toBeVisible();

    // Verify budget grid container and save button
    await expect(page.getByTestId('budget-grid-container')).toBeVisible();
    await expect(page.getByTestId('save-budgets-btn')).toBeVisible();

    // Verify category budget input
    const rentInput = page.locator('[data-testid="budget-input-Rent"], [data-testid="budget-input-Housing"]');
    await expect(rentInput).toBeVisible();
  });

  test('15. Trends Workspace renders Visual Analytics, Cumulative Pacing, and SVG Trend Chart', async ({ page }) => {
    // Navigate to dedicated trends route
    await page.goto('/#/trends');

    const trendsWorkspace = page.getByTestId('trends-workspace');
    await expect(trendsWorkspace).toBeVisible();

    // Verify SVG trend chart
    await expect(page.getByTestId('chart-svg-trend')).toBeVisible();
  });

  test('16. Reports and Settings Workspaces render dedicated administrative panels and action controls', async ({ page }) => {
    // Navigate to dedicated reports route
    await page.goto('/#/reports');

    const reportsWorkspace = page.getByTestId('reports-workspace');
    await expect(reportsWorkspace).toBeVisible();
    await expect(page.getByTestId('print-report-btn')).toBeVisible();
    await expect(page.getByTestId('download-csv-btn')).toBeVisible();
    await expect(page.getByTestId('email-report-btn')).toBeVisible();

    // Navigate to dedicated settings route
    await page.goto('/#/settings');

    const settingsWorkspace = page.getByTestId('settings-workspace');
    await expect(settingsWorkspace).toBeVisible();
    await expect(page.getByTestId('manage-projects-trigger-btn')).toBeVisible();
    await expect(page.getByTestId('open-add-category-btn')).toBeVisible();
    await expect(page.getByTestId('import-csv-trigger-btn')).toBeVisible();
    await expect(page.getByTestId('gemini-api-key-input')).toBeVisible();
  });

  test('17. v3 Canonical Route, #/dashboard Redirect, MoM Delta Polarity, and Sticky Bucket Filter Reset', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });

    // 1. Default route '/' redirects to canonical '#/month/YYYY-MM' with true zero-scroll
    await page.goto('/');
    await expect(page.getByTestId('hero-savings-card')).toBeVisible();
    await expect(page.getByTestId('income-allocation-ring')).toBeVisible();
    const initialHash = await page.evaluate(() => window.location.hash);
    expect(initialHash).toMatch(/^#\/month\/\d{4}-\d{2}$/);
    const isZeroScrollRoot = await page.evaluate(() => window.innerHeight >= document.body.scrollHeight);
    expect(isZeroScrollRoot).toBe(true);

    // 2. Legacy '#/dashboard?project=proj-v3&month=2026-10' redirects cleanly via replaceState preserving month
    await page.goto('/#/dashboard?project=proj-v3&month=2026-10');
    await expect(page.getByTestId('hero-savings-card')).toBeVisible();
    const redirectedHash = await page.evaluate(() => window.location.hash);
    expect(redirectedHash).toBe('#/month/2026-10');

    // 3. Seed prior month (Oct 2026) and verify MoM expense delta polarity in Nov 2026
    await page.addInitScript(() => {
      const raw = window.localStorage.getItem('expense_txs_proj-v3');
      const txs = raw ? JSON.parse(raw) : [];
      txs.push({
        id: 'tx-oct-rent',
        date: '2026-10-01',
        category: 'housing',
        amount: 2000,
        type: 'expense',
        spendingBucket: 'fixed',
        description: 'October Rent',
        notes: '',
        labels: ['fixed'],
        hash: 'h-oct-rent',
      });
      window.localStorage.setItem('expense_txs_proj-v3', JSON.stringify(txs));
    });
    await page.goto('/#/month/2026-11');
    await page.reload();

    // Fixed spent $2,400 in Nov vs $2,000 in Oct (+20.0% MoM) -> rising expense must be colored rose/red (text-rose-400)
    const fixedDelta = page.getByTestId('mom-delta-fixed');
    await expect(fixedDelta).toBeVisible();
    await expect(fixedDelta).toContainText('+20.0% MoM');
    await expect(fixedDelta.locator('span')).toHaveClass(/text-rose-400/);

    // 4. Clicking Fixed bucket card drills into Level 2 without leaving a sticky filter on #/transactions
    await page.getByTestId('kpi-fixed-expenses').click();
    await expect(page.getByTestId('level2-bucket-view')).toBeVisible();
    await page.evaluate(() => { window.location.hash = '#/transactions?month=2026-11'; });
    await expect(page.getByTestId('level4-transactions-workspace')).toBeVisible();
    // Both Fixed ('Apartment Lease') and Flexible ('Trader Joes') transactions must be visible (unfiltered)
    await expect(page.locator('h4:has-text("Apartment Lease")')).toBeVisible();
    await expect(page.locator('h4:has-text("Trader Joes")')).toBeVisible();
  });

  test('18. Zero-Shim Guard: no [data-testid] element or ancestor uses sr-only or opacity-0 across core routes', async ({ page }) => {
    const routes = [
      '/#/month/2026-11',
      '/#/month/2026-11/bucket/fixed',
      '/#/month/2026-11/category/housing',
      '/#/transactions',
      '/#/budgets',
      '/#/trends',
    ];

    for (const route of routes) {
      await page.goto(route);
      await page.locator('main [data-testid]').first().waitFor({ state: 'visible' });
      const shimViolations = await page.evaluate(() => {
        const nodes = Array.from(document.querySelectorAll('[data-testid]'));
        const violations: string[] = [];
        for (const el of nodes) {
          const testId = el.getAttribute('data-testid') || '';
          let curr: HTMLElement | null = el as HTMLElement;
          while (curr && curr !== document.body) {
            const cls = typeof curr.className === 'string' ? curr.className : '';
            const tokens = cls.split(/\s+/);
            if (tokens.includes('sr-only') || tokens.includes('opacity-0')) {
              violations.push(`${testId} (via ${curr.tagName.toLowerCase()}.${tokens.filter(t => t === 'sr-only' || t === 'opacity-0').join('.')})`);
              break;
            }
            curr = curr.parentElement;
          }
          const hiddenChild = el.querySelector('.sr-only, .opacity-0');
          if (hiddenChild) {
            violations.push(`${testId} (contains descendant .sr-only/.opacity-0)`);
          }
        }
        return violations;
      });
      expect(shimViolations, `Shim violations on ${route}`).toEqual([]);
    }
  });
});

