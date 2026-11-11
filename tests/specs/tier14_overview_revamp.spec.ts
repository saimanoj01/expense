import { test, expect, Page } from '@playwright/test';

interface SeedPayload {
  projects?: Array<{ id: string; name: string }>;
  activeProjectId?: string;
  transactions?: Record<string, Array<Record<string, unknown>>>;
  budgets?: Record<string, Array<{ category: string; amount: number }>>;
  categories?: Record<string, Array<Record<string, unknown>>>;
  locks?: Record<string, Array<{ month: string; locked: boolean }>>;
  mockSession?: string;
}

const preseedOverviewData = async (page: Page, seeded: SeedPayload) => {
  await page.addInitScript(data => {
    if (data.projects) {
      window.localStorage.setItem('expense_projects', JSON.stringify(data.projects));
    }
    if (data.activeProjectId) {
      window.localStorage.setItem('expense_active_project_id', data.activeProjectId);
    }
    if (data.transactions) {
      for (const [projId, txs] of Object.entries(data.transactions)) {
        window.localStorage.setItem(`expense_txs_${projId}`, JSON.stringify(txs));
      }
    }
    if (data.budgets) {
      for (const [projId, bList] of Object.entries(data.budgets)) {
        window.localStorage.setItem(`expense_budgets_${projId}`, JSON.stringify(bList));
      }
    }
    if (data.categories) {
      for (const [projId, cList] of Object.entries(data.categories)) {
        window.localStorage.setItem(`expense_cats_${projId}`, JSON.stringify(cList));
      }
    }
    if (data.locks) {
      for (const [projId, lList] of Object.entries(data.locks)) {
        window.localStorage.setItem(`expense_locks_${projId}`, JSON.stringify(lList));
      }
    }
    if (data.mockSession) {
      window.localStorage.setItem('expense_mock_session', data.mockSession);
    }
  }, seeded);
};

test.describe('Tier 14: Comprehensive Overview Revamp & Financial Integrity', () => {
  test('1. 1440x900 Desktop Zero-Scroll, unique testids, CategoryWatchlist urgency sort, closed-month short label ("vs Sep"), Sidebar non-truncation, and 0 console errors on Edit Modal', async ({
    page,
  }) => {
    const consoleErrors: string[] = [];
    page.on('console', msg => {
      if (msg.type() === 'error') {
        const text = msg.text();
        if (!text.startsWith('Failed to load resource:')) {
          consoleErrors.push(text);
        }
      }
    });

    await page.setViewportSize({ width: 1440, height: 900 });
    await preseedOverviewData(page, {
      mockSession: 'true',
      projects: [{ id: 'p-revamp', name: 'Personal Finances' }],
      activeProjectId: 'p-revamp',
      budgets: {
        'p-revamp': [
          { category: 'housing', amount: 2400 },
          { category: 'food', amount: 400 },      // Variable ($480 spent -> Over by $80!)
          { category: 'shopping', amount: 400 },  // Variable
          { category: 'utilities', amount: 200 },
        ],
      },
      transactions: {
        'p-revamp': [
          // Sep 2026 (tests closed-month Oct vs Sep short label!)
          {
            id: 'sep-inc-1',
            date: '2026-09-01',
            amount: 6000,
            type: 'income',
            category: 'income',
            description: 'Sep Paycheck',
            notes: '',
            labels: [],
            hash: 'h-sep-1',
          },
          {
            id: 'sep-rent',
            date: '2026-09-02',
            amount: 2400,
            type: 'expense',
            category: 'housing',
            spendingBucket: 'fixed',
            description: 'Sep Rent',
            notes: '',
            labels: [],
            hash: 'h-sep-2',
          },
          // Oct 2026: Day 1-11 activity + Day 28 late spike (tests same-day MTD slicing!)
          {
            id: 'oct-inc-1',
            date: '2026-10-01',
            amount: 5000,
            type: 'income',
            category: 'income',
            description: 'Oct Paycheck 1',
            notes: '',
            labels: [],
            hash: 'h-oct-1',
          },
          {
            id: 'oct-rent',
            date: '2026-10-01',
            amount: 2400,
            type: 'expense',
            category: 'housing',
            spendingBucket: 'fixed',
            description: 'Oct Apartment Rent',
            notes: '',
            labels: [],
            hash: 'h-oct-2',
          },
          {
            id: 'oct-food-early',
            date: '2026-10-06',
            amount: 240,
            type: 'expense',
            category: 'food',
            spendingBucket: 'flexible',
            description: 'Oct Trader Joes',
            notes: '',
            labels: [],
            hash: 'h-oct-3',
          },
          {
            id: 'oct-inc-late',
            date: '2026-10-28',
            amount: 5000,
            type: 'income',
            category: 'income',
            description: 'Oct Paycheck 2 (Late)',
            notes: '',
            labels: [],
            hash: 'h-oct-4',
          },
          // Nov 2026 (Active month)
          {
            id: 'nov-inc-1',
            date: '2026-11-01',
            amount: 6000,
            type: 'income',
            category: 'income',
            description: 'Nov Paycheck',
            notes: '',
            labels: [],
            hash: 'h-nov-1',
          },
          {
            id: 'nov-rent',
            date: '2026-11-01',
            amount: 2400,
            type: 'expense',
            category: 'housing',
            spendingBucket: 'fixed',
            description: 'Avalon Apartment Rent',
            notes: '',
            labels: [],
            hash: 'h-nov-2',
            meta: { account: 'bilt' },
          },
          {
            id: 'nov-food',
            date: '2026-11-05',
            amount: 480,
            type: 'expense',
            category: 'food',
            spendingBucket: 'flexible',
            description: 'Whole Foods & Dining',
            notes: '',
            labels: [],
            hash: 'h-nov-3',
            meta: { account: 'amex gold' },
          },
          {
            id: 'nov-util',
            date: '2026-11-07',
            amount: 160,
            type: 'expense',
            category: 'utilities',
            spendingBucket: 'fixed',
            description: 'PG&E Electric',
            notes: '',
            labels: [],
            hash: 'h-nov-4',
          },
          {
            id: 'nov-shop',
            date: '2026-11-09',
            amount: 120,
            type: 'expense',
            category: 'shopping',
            spendingBucket: 'flexible',
            description: 'Uniqlo Jacket',
            notes: '',
            labels: [],
            hash: 'h-nov-5',
          },
          {
            id: 'nov-nm',
            date: '2026-11-10',
            amount: 300,
            type: 'expense',
            category: 'travel',
            spendingBucket: 'non-monthly',
            description: 'Annual Passport Renewal',
            notes: '',
            labels: [],
            hash: 'h-nov-6',
          },
          // Solitary future-dated 2027 transaction (BUG-12: must NOT hijack '/' landing!)
          {
            id: 'fut-flight',
            date: '2027-02-14',
            amount: 650,
            type: 'expense',
            category: 'travel',
            spendingBucket: 'non-monthly',
            description: 'Scheduled Feb Flight',
            notes: '',
            labels: [],
            hash: 'h-fut-1',
          },
        ],
      },
    });

    // Landing on '/' must pick current month 2026-11, NOT 2027-02!
    await page.goto('/');
    await expect(page.getByTestId('hero-savings-card')).toBeVisible();
    expect(await page.evaluate(() => window.location.hash)).toBe('#/month/2026-11');

    // Sidebar expanded width fits "Personal Finances" & "Mock Mode" without ellipsis truncation (QA-BUG-07b)
    const sidebarTruncation = await page.evaluate(() => {
      const sel = document.querySelector('[data-testid="project-selector"]') as HTMLElement | null;
      const mock = document.querySelector('[data-testid="mock-banner"]') as HTMLElement | null;
      return {
        projectTextFits: sel ? sel.scrollWidth <= sel.clientWidth + 1 : false,
        mockTruncated: mock ? mock.scrollWidth > mock.clientWidth + 1 : true,
      };
    });
    expect(sidebarTruncation.projectTextFits).toBe(true);
    expect(sidebarTruncation.mockTruncated).toBe(false);

    // Inbox-Zero Triage Strip collapses to 0px (not rendered)
    await expect(page.getByTestId('overview-triage-strip')).toHaveCount(0);

    // Strictly 1 kpi-total-expenses on Overview
    await expect(page.getByTestId('kpi-total-expenses')).toHaveCount(1);
    await expect(page.getByTestId('kpi-total-expenses')).toContainText('$3,460.00');

    // Safe-to-Spend Runway reflects ONLY Variable budget ($400 + $400 = $800, NOT $3,400 totalBudget!)
    const safeToSpend = page.getByTestId('hero-safe-to-spend');
    await expect(safeToSpend).toBeVisible();
    await expect(safeToSpend).toContainText('$200 left');
    await expect(safeToSpend).toContainText('of $800 target');

    // Same-day MTD comparison on active Nov 2026 compares against Oct 1-11 ($5,000 income, NOT $10,000 full Oct!)
    await expect(page.getByTestId('mom-delta-income')).toContainText('↑ 20% vs Oct 1–');

    // CategoryWatchlist ranks Over-budget Food ($480 / $400) FIRST above on-budget Housing ($2,400 / $2,400)!
    const watchlist = page.getByTestId('overview-category-watchlist');
    await expect(watchlist).toBeVisible();
    const firstCatRow = watchlist.locator('button[data-testid^="overview-cat-row-"]').first();
    await expect(firstCatRow).toHaveAttribute('data-testid', 'overview-cat-row-food');
    await expect(firstCatRow).toContainText('Over');

    // RecentActivityCard renders latest 5 transactions without colliding with transaction-row testid
    const recentCard = page.getByTestId('overview-recent-activity');
    await expect(recentCard).toBeVisible();
    await expect(page.getByTestId('transaction-row')).toHaveCount(0);
    await expect(page.getByTestId('overview-recent-txn-nov-nm')).toBeVisible();

    // Verify 1440x900 zero-scroll constraint with all 5 zones populated!
    const zeroScrollCheck = await page.evaluate(() => {
      const main = document.querySelector('main');
      return {
        windowFitsBody: window.innerHeight >= document.body.scrollHeight,
        mainFitsContent: main ? main.clientHeight >= main.scrollHeight - 2 : false,
      };
    });
    expect(zeroScrollCheck.windowFitsBody).toBe(true);
    expect(zeroScrollCheck.mainFitsContent).toBe(true);

    // Closed historical surplus month (Oct 2026) shows "vs Sep", NEVER raw "vs 2026-09" (QA-BUG-02)!
    await page.getByTestId('month-selector').selectOption('2026-10');
    await expect(page.getByTestId('hero-savings-card')).toContainText('vs Sep');
    await expect(page.getByTestId('hero-savings-card')).not.toContainText('2026-09');
    await page.getByTestId('month-selector').selectOption('2026-11');

    // Verify non-purple --c-variable token in Dark and Light themes + zero hero textShadow
    const themeTokens = await page.evaluate(() => {
      const rootStyle = getComputedStyle(document.documentElement);
      const darkVar = rootStyle.getPropertyValue('--c-variable').trim();
      const heroEl = document.querySelector('[data-testid="kpi-savings-amount"]') as HTMLElement;
      const heroShadow = heroEl ? getComputedStyle(heroEl).textShadow : 'none';
      return { darkVar, heroShadow };
    });
    expect(themeTokens.darkVar).toBe('194 86% 56%');
    expect(themeTokens.heroShadow).toBe('none');

    await page.getByTestId('theme-toggle-btn').click();
    const lightVar = await page.evaluate(() =>
      getComputedStyle(document.documentElement).getPropertyValue('--c-variable').trim()
    );
    expect(lightVar).toBe('196 88% 35%');

    // Clicking RecentActivityCard row opens Edit Record modal with ZERO console.error messages & non-overlapping Category/Account fields (QA-BUG-09 / QA-BUG-09b)!
    await page.getByTestId('overview-recent-txn-nov-shop').click();
    const editSheet = page.getByTestId('transaction-edit-sheet');
    await expect(editSheet).toBeVisible();
    const modalFieldBoxes = await page.evaluate(() => {
      const catSel = document.querySelector('[data-testid="transaction-category-select"]');
      const accInp = document.querySelector('[data-testid="transaction-account-input"]');
      if (!catSel || !accInp) return null;
      return {
        catBottom: catSel.getBoundingClientRect().bottom,
        accTop: accInp.getBoundingClientRect().top,
      };
    });
    expect(modalFieldBoxes).not.toBeNull();
    if (modalFieldBoxes) {
      expect(modalFieldBoxes.accTop).toBeGreaterThan(modalFieldBoxes.catBottom);
    }
    expect(consoleErrors).toEqual([]);
  });

  test('2. Mobile 390x844 sticky header non-overlap & scroll pinning (QA-BUG-01), 768px tablet layout, Triage Strip lifecycle, and neutral $0-income Net Outflow (QA-BUG-04)', async ({
    page,
  }) => {
    await preseedOverviewData(page, {
      mockSession: 'true',
      projects: [{ id: 'p-resp', name: 'Responsive Workspace' }],
      activeProjectId: 'p-resp',
      transactions: {
        'p-resp': [
          {
            id: 'tx-inc',
            date: '2026-11-01',
            amount: 5000,
            type: 'income',
            category: 'income',
            description: 'Salary',
            notes: '',
            labels: [],
            hash: 'hr-1',
          },
          {
            id: 'tx-rev',
            date: '2026-11-04',
            amount: 89.99,
            type: 'expense',
            category: 'misc',
            description: 'AMZN Mktp Unclear Charge',
            notes: '',
            labels: ['needs-review'],
            hash: 'hr-2',
            meta: {
              review: {
                reason: 'category',
                reasons: ['category'],
                flaggedAt: '2026-11-04T10:00:00.000Z',
              },
            },
          },
          {
            id: 'tx-oct-clean',
            date: '2026-10-10',
            amount: 1200,
            type: 'expense',
            category: 'housing',
            spendingBucket: 'fixed',
            description: 'Oct Rent',
            notes: '',
            labels: [],
            hash: 'hr-3',
          },
        ],
      },
    });

    // 1. Mobile 390x844: zero horizontal overflow AND PageHeader sits cleanly at ~52px with ZERO overlap!
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/#/month/2026-11');
    await expect(page.getByTestId('overview-triage-strip')).toBeVisible();

    const mobileTopGeometry = await page.evaluate(() => {
      const header = document.querySelector('[data-testid="dashboard-header"]')!;
      const triage = document.querySelector('[data-testid="overview-triage-strip"]')!;
      const hRect = header.getBoundingClientRect();
      const tRect = triage.getBoundingClientRect();
      return {
        noHorizontalOverflow: document.documentElement.scrollWidth <= window.innerWidth,
        headerTop: Math.round(hRect.top),
        headerBottom: Math.round(hRect.bottom),
        triageTop: Math.round(tRect.top),
      };
    });
    expect(mobileTopGeometry.noHorizontalOverflow).toBe(true);
    expect(mobileTopGeometry.headerTop).toBe(52);
    expect(mobileTopGeometry.headerBottom).toBeLessThanOrEqual(mobileTopGeometry.triageTop);

    // Scroll <main> down 240px on mobile -> both Navbar (top=0) and PageHeader (top=52) stay pinned!
    const mobileScrolledGeometry = await page.evaluate(() => {
      const main = document.querySelector('main')!;
      main.scrollTop = 240;
      const header = document.querySelector('[data-testid="dashboard-header"]')!;
      return {
        mainScrolled: main.scrollTop > 100,
        headerTopAfterScroll: Math.round(header.getBoundingClientRect().top),
      };
    });
    expect(mobileScrolledGeometry.mainScrolled).toBe(true);
    expect(mobileScrolledGeometry.headerTopAfterScroll).toBe(52);

    // 2. Check 768x1024 tablet: zero horizontal overflow
    await page.setViewportSize({ width: 768, height: 1024 });
    const tabletOverflow = await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth
    );
    expect(tabletOverflow).toBe(true);

    // 3. Classify unclassified bucket directly from Triage Strip
    await expect(page.getByTestId('backfill-banner')).toBeVisible();
    await page.getByTestId('backfill-btn').click();
    await expect(page.getByTestId('backfill-banner')).toHaveCount(0);

    // 4. Review button navigates to /transactions with Needs Review filter active!
    await page.getByTestId('overview-review-btn').click();
    await expect(page.getByTestId('level4-transactions-workspace')).toBeVisible();
    await expect(page.getByTestId('transaction-row')).toHaveCount(1);
    await expect(page.locator('h4', { hasText: 'AMZN Mktp Unclear Charge' })).toBeVisible();
    await expect(page.locator('h4', { hasText: 'Salary' })).toHaveCount(0);

    // 5. Navigate to clean $0-income past month (2026-10):
    // - Shows Net Outflow + No income in neutral text-foreground (NEVER text-negative, QA-BUG-04!)
    // - Shows dismissible [Lock month] prompt (QA-BUG-05)
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto('/#/month/2026-10');
    await expect(page.getByTestId('drill-down-saved')).toContainText('Net Outflow');
    await expect(page.getByTestId('drill-down-saved')).toContainText('No income');
    await expect(page.getByTestId('kpi-saved-stat')).not.toHaveClass(/text-negative/);

    await expect(page.getByTestId('dismiss-lock-prompt-btn')).toBeVisible();
    await page.getByTestId('overview-lock-prompt-btn').click();

    // Once locked, lock-status-indicator has count === 1, Add buttons & 'n' shortcut are suppressed!
    await expect(page.getByTestId('lock-status-indicator')).toHaveCount(1);
    await expect(page.getByTestId('lock-status-indicator')).toContainText('Locked');
    await expect(page.getByTestId('open-add-transaction-btn')).toHaveCount(0);
    await expect(page.getByTestId('sidebar-add-txn-btn')).toBeDisabled();
    await page.keyboard.press('n');
    await expect(page.getByTestId('transaction-modal')).toHaveCount(0);
  });

  test('3. Refund parity across L1->L2->L3, L2 MTD & Deficit parity (QA-BUG-06 & Reviewer #3/#4), Empty/Locked month runway suppression (QA-BUG-03), and SpendTimeline isolation', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await preseedOverviewData(page, {
      mockSession: 'true',
      projects: [{ id: 'p-math', name: 'Math Integrity Project' }],
      activeProjectId: 'p-math',
      budgets: {
        'p-math': [{ category: 'shopping', amount: 600 }],
      },
      locks: {
        'p-math': [{ month: '2026-08', locked: true }],
      },
      transactions: {
        'p-math': [
          // Oct 2026 deficit + late Oct shopping ($400 on Oct 28 to test L1/L2 MTD parity!)
          {
            id: 'm-oct-inc',
            date: '2026-10-01',
            amount: 1000,
            type: 'income',
            category: 'income',
            description: 'Oct Part-Time',
            notes: '',
            labels: [],
            hash: 'hm-1',
          },
          {
            id: 'm-oct-rent',
            date: '2026-10-01',
            amount: 1500,
            type: 'expense',
            category: 'housing',
            spendingBucket: 'fixed',
            description: 'Oct Rent',
            notes: '',
            labels: [],
            hash: 'hm-2',
          },
          {
            id: 'm-oct-shop-early',
            date: '2026-10-05',
            amount: 10,
            type: 'expense',
            category: 'shopping',
            spendingBucket: 'flexible',
            description: 'Oct Early Coffee',
            notes: '',
            labels: [],
            hash: 'hm-2b',
          },
          {
            id: 'm-oct-shop-late',
            date: '2026-10-28',
            amount: 400,
            type: 'expense',
            category: 'shopping',
            spendingBucket: 'flexible',
            description: 'Oct Late Spree',
            notes: '',
            labels: [],
            hash: 'hm-2c',
          },
          // Nov 2026 deeper deficit + Shopping refund ($500 - $480 = $20 net) + Non-monthly ($1,200)
          {
            id: 'm-nov-inc',
            date: '2026-11-01',
            amount: 1500,
            type: 'income',
            category: 'income',
            description: 'Nov Income',
            notes: '',
            labels: [],
            hash: 'hm-3',
          },
          {
            id: 'm-nov-rent',
            date: '2026-11-01',
            amount: 2000,
            type: 'expense',
            category: 'housing',
            spendingBucket: 'fixed',
            description: 'Nov Rent',
            notes: '',
            labels: [],
            hash: 'hm-4',
          },
          {
            id: 'm-nov-coat',
            date: '2026-11-03',
            amount: 500,
            type: 'expense',
            category: 'shopping',
            spendingBucket: 'flexible',
            description: 'Winter Parka',
            notes: '',
            labels: [],
            hash: 'hm-5',
          },
          {
            id: 'm-nov-refund',
            date: '2026-11-05',
            amount: 480,
            type: 'income',
            category: 'shopping',
            spendingBucket: 'flexible',
            description: 'Winter Parka Return',
            notes: '',
            labels: ['refund'],
            hash: 'hm-6',
          },
          {
            id: 'm-nov-nm',
            date: '2026-11-06',
            amount: 1200,
            type: 'expense',
            category: 'travel',
            spendingBucket: 'non-monthly',
            description: 'Annual Property Tax',
            notes: '',
            labels: [],
            hash: 'hm-7',
          },
        ],
      },
    });

    await page.goto('/#/month/2026-11');

    // 1. Negative Flex Number is visible and formatted with signed negative currency (-$1,700.00)
    await expect(page.getByTestId('kpi-flex-number')).toContainText('-$1,700.00');

    // 2. Deeper deficit (-$510 MTD -> -$1,720) renders ↓ −$1,210 in text-negative (NEVER ↑!)
    const savedDelta = page.getByTestId('mom-delta-savings');
    await expect(savedDelta).toContainText('↓ −$1,210');
    await expect(savedDelta).toHaveClass(/text-negative/);

    // 3. Non-overlapping deficit ribbon geometry + L2 Income & saved shows "Overspent" (Reviewer #3)
    const ribbonBoxes = await page.evaluate(() => {
      const ring = document.querySelector('[data-testid="income-allocation-ring"]');
      const overspent = document.querySelector('[data-testid="ribbon-overspent-segment"]');
      if (!ring || !overspent) return null;
      const expBtns = Array.from(ring.querySelectorAll('button')).filter(b => b !== overspent);
      const maxExpRight = Math.max(...expBtns.map(b => b.getBoundingClientRect().right));
      const overspentLeft = overspent.getBoundingClientRect().left;
      return { maxExpRight, overspentLeft };
    });
    expect(ribbonBoxes).not.toBeNull();
    if (ribbonBoxes) {
      expect(ribbonBoxes.overspentLeft).toBeGreaterThanOrEqual(ribbonBoxes.maxExpRight - 1);
    }

    await page.getByTestId('drill-down-saved').click();
    await expect(page.getByTestId('level2-bucket-view')).toContainText('Overspent $1,720');
    await expect(page.getByTestId('level2-bucket-view')).not.toContainText('Saved $0');
    await page.getByTestId('back-to-overview-btn').click();

    // 4. SpendTimeline All | Variable toggle & drag-scrub gesture isolation
    await expect(page.getByTestId('timeline-total-expenses')).toContainText('$3,220');
    await page.getByTestId('timeline-mode-variable').click();
    await expect(page.getByTestId('timeline-total-expenses')).toContainText('$20');

    const slider = page.getByTestId('spend-timeline-slider');
    const sBox = await slider.boundingBox();
    if (sBox) {
      await page.mouse.move(sBox.x + sBox.width * 0.8, sBox.y + sBox.height / 2);
      await page.mouse.down();
      await page.mouse.move(sBox.x + sBox.width * 0.2, sBox.y + sBox.height / 2, { steps: 6 });
      await page.mouse.up();
    }
    expect(await page.evaluate(() => window.location.hash)).toBe('#/month/2026-11');

    // 5. Refund Parity + Active-Month L1/L2 MTD parity ($20 vs $10 Oct 1-11 = ↑ 100%, NOT vs $410 full Oct! QA-BUG-06)
    await expect(page.getByTestId('mom-delta-flexible')).toContainText('↑ 100% vs Oct 1–');
    await page.getByTestId('drill-down-variable').click();
    await expect(page.getByTestId('level2-bucket-view')).toBeVisible();
    await expect(page.getByTestId('bucket-total-spent')).toContainText('$20.00');
    await expect(page.getByTestId('level2-bucket-view')).toContainText('↑ 100% vs Oct 1–');
    await page.getByTestId('category-row-shopping').click();
    await expect(page.getByTestId('level3-category-view')).toBeVisible();
    await expect(page.getByTestId('category-total-spent')).toContainText('$20.00');

    // 7. Level 3 Category ('travel') resolves to Non-monthly on back-to-bucket-btn (Reviewer #4)
    await page.goto('/#/month/2026-11/category/travel');
    await expect(page.getByTestId('back-to-bucket-btn')).toContainText('Non-monthly');

    // 8. Empty unlocked month (2026-09) & empty locked month (2026-08):
    // - Hides Safe-to-Spend runway (count === 0, never "Finished $600 under", QA-BUG-03!)
    // - Shows neutral "—" MoM delta (never "↓ 100%", QA-BUG-03!)
    // - Shows "Month is locked" pill on locked empty month (2026-08)
    await page.goto('/#/month/2026-08');
    await expect(page.getByTestId('hero-safe-to-spend')).toHaveCount(0);
    await expect(page.getByTestId('hero-empty-locked-pill')).toContainText('Month is locked');
    await expect(page.getByTestId('mom-delta-income')).toHaveText('—');

    await page.goto('/#/month/2026-09');
    await expect(page.getByTestId('hero-safe-to-spend')).toHaveCount(0);
    await expect(page.getByTestId('mom-delta-flexible')).toHaveText('—');
    const emptyRibbonButtons = await page
      .getByTestId('income-allocation-ring')
      .locator('button')
      .count();
    expect(emptyRibbonButtons).toBe(0);

    await page.getByTestId('hero-import-csv-btn').click();
    await expect(page.getByTestId('csv-wizard-modal')).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(page.getByTestId('csv-wizard-modal')).toHaveCount(0);

    // 9. All-Time mode renders Monthly spending trend without dividing non-monthly by 12
    await page.getByTestId('month-selector').selectOption('all');
    await expect(page.getByRole('heading', { name: 'Monthly spending trend' })).toBeVisible();
    await expect(page.getByTestId('kpi-non-monthly')).toContainText('$1,200.00');
  });
});
