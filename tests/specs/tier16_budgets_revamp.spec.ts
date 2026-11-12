import { test, expect, Page } from '@playwright/test';

interface SeedBudgetsPayload {
  projects?: Array<{ id: string; name: string }>;
  activeProjectId?: string;
  transactions?: Record<string, Array<Record<string, unknown>>>;
  budgets?: Record<string, Array<{ category: string; amount: number }>>;
  categories?: Record<string, Array<Record<string, unknown>>>;
  locks?: Record<string, Array<{ month: string; locked: boolean; lockedAt?: string }>>;
  notes?: Record<string, Record<string, { text: string; updatedAt: string; mood?: string }>>;
  mockSession?: string;
  theme?: 'dark' | 'light';
}

async function preseedBudgetsWorkspace(page: Page, seeded: SeedBudgetsPayload) {
  await page.addInitScript(data => {
    if (data.theme) {
      window.localStorage.setItem('expense_theme', data.theme);
    }
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
        window.localStorage.setItem(`expense_categories_${projId}`, JSON.stringify(cList));
      }
    }
    if (data.locks) {
      for (const [projId, lList] of Object.entries(data.locks)) {
        window.localStorage.setItem(`expense_locks_${projId}`, JSON.stringify(lList));
      }
    }
    if (data.notes) {
      for (const [projId, nMap] of Object.entries(data.notes)) {
        window.localStorage.setItem(
          `expense_budget_notes_${projId}`,
          JSON.stringify(nMap)
        );
      }
    }
    if (data.mockSession) {
      window.localStorage.setItem('expense_mock_session', data.mockSession);
    }
  }, seeded);
}

test.describe('Tier 16: Comprehensive Budgets & Category Planning Revamp', () => {
  test('1. Above-the-fold density (1440x900 >=7 rows, 390x844 >=3 rows), single-scroll container, unique header CTAs (G6, G7), and KPI reconciliation + Income/Runway anchors (BUG-BUD-02, BUG-BUD-03)', async ({
    page,
  }) => {
    const consoleErrors: string[] = [];
    page.on('console', msg => {
      if (msg.type() === 'error' && !msg.text().startsWith('Failed to load resource:')) {
        consoleErrors.push(msg.text());
      }
    });

    await page.setViewportSize({ width: 1440, height: 900 });
    await preseedBudgetsWorkspace(page, {
      mockSession: 'true',
      projects: [{ id: 'p-bud', name: 'Personal Finances' }],
      activeProjectId: 'p-bud',
      budgets: {
        'p-bud': [
          { category: 'housing', amount: 2400 },
          { category: 'food', amount: 900 },
          { category: 'groceries', amount: 600 },
          { category: 'utilities', amount: 250 },
          { category: 'entertainment', amount: 150 },
        ],
      },
      transactions: {
        'p-bud': [
          {
            id: 'tx-inc',
            date: '2026-10-01',
            amount: 6500,
            type: 'income',
            category: 'income',
            description: 'Monthly Paycheck',
            notes: '',
            labels: [],
            hash: 'h-inc',
          },
          {
            id: 'tx-rent',
            date: '2026-10-02',
            amount: 2400,
            type: 'expense',
            category: 'housing',
            spendingBucket: 'fixed',
            description: 'October Rent',
            notes: '',
            labels: [],
            hash: 'h-rent',
          },
          {
            id: 'tx-food',
            date: '2026-10-08',
            amount: 600,
            type: 'expense',
            category: 'food',
            spendingBucket: 'flexible',
            description: 'Neighborhood Bistro',
            notes: '',
            labels: [],
            hash: 'h-food',
          },
          {
            id: 'tx-unbudgeted-travel',
            date: '2026-10-14',
            amount: 640,
            type: 'expense',
            category: 'travel',
            spendingBucket: 'non-monthly',
            description: 'Weekend Flight',
            notes: '',
            labels: [],
            hash: 'h-travel',
          },
        ],
      },
    });

    await page.goto('/#/budgets?month=2026-10');
    await expect(page.getByTestId('budgets-workspace')).toBeVisible();

    // Guardrail G7: Unique action testids
    await expect(page.getByTestId('open-add-category-btn')).toHaveCount(1);
    await expect(page.getByTestId('save-budgets-btn')).toHaveCount(1);

    // BUG-BUD-03: Budgeted vs Unbudgeted reconciliation
    // Total Target = 2400 + 900 + 600 + 250 + 150 = $4,300.00
    // Budgeted Spend = 2400 + 600 = $3,000.00 (excludes $640 unbudgeted travel!)
    // Budgeted Remaining = 4300 - 3000 = $1,300.00
    await expect(page.getByTestId('kpi-total-budget')).toHaveText('$4,300.00');
    await expect(page.getByTestId('kpi-budgeted-spent')).toHaveText('$3,000.00');
    await expect(page.getByTestId('kpi-budget-remaining')).toHaveText('$1,300.00');
    await expect(page.getByTestId('unbudgeted-spend-callout')).toContainText(
      '+$640 unbudgeted (1)'
    );

    // BUG-BUD-02: Income / Planned Savings ($6,500 - $4,300 = $2,200/mo) + Variable Runway
    await expect(page.getByTestId('income-plan-anchor')).toContainText('$2,200/mo');
    await expect(page.getByTestId('budgets-variable-runway')).toBeVisible();

    // BUG-BUD-05: Fixed Housing at 100% ($2,400 / $2,400) shows 'Paid · On Plan', never 'Near Limit'
    await expect(page.getByTestId('budget-utilization-Rent')).toContainText(
      'Paid · On Plan'
    );

    // Desktop 1440x900 Above-the-fold density: >= 7 complete category rows visible without scrolling
    const desktopVisibleRows = await page.evaluate(() => {
      const rows = Array.from(document.querySelectorAll('[data-testid^="budget-row-"]'));
      return rows.filter(el => {
        const rect = el.getBoundingClientRect();
        return rect.height > 0 && rect.top >= 0 && rect.bottom <= 900;
      }).length;
    });
    expect(desktopVisibleRows).toBeGreaterThanOrEqual(7);

    // Single-scroll verification: budget-grid-container has no inner scroll trap
    const gridScrollTrap = await page.evaluate(() => {
      const grid = document.querySelector('[data-testid="budget-grid-container"]');
      if (!grid) return true;
      return grid.scrollHeight > grid.clientHeight + 2;
    });
    expect(gridScrollTrap).toBe(false);

    // Mobile 390x844 Above-the-fold density: >= 3 complete category rows visible above BottomNav (775px) + 0px horizontal overflow
    await page.setViewportSize({ width: 390, height: 844 });
    const mobileMetrics = await page.evaluate(() => {
      const rows = Array.from(document.querySelectorAll('[data-testid^="budget-row-"]'));
      const visibleAboveNav = rows.filter(el => {
        const rect = el.getBoundingClientRect();
        return rect.height > 0 && rect.top >= 0 && rect.bottom <= 775;
      }).length;
      return {
        visibleAboveNav,
        overflowX: document.documentElement.scrollWidth - window.innerWidth,
      };
    });
    expect(mobileMetrics.visibleAboveNav).toBeGreaterThanOrEqual(3);
    expect(mobileMetrics.overflowX).toBeLessThanOrEqual(0);
    expect(consoleErrors).toEqual([]);
  });

  test('2. Historical Sub-Category Rollup (BUG-BUD-01), Quick-Fill Presets, Parent <-> Sub-Category Rollup & Tombstone Prevention (BUG-BUD-07, G2), and All-Time Normalization (BUG-BUD-04, G5)', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await preseedBudgetsWorkspace(page, {
      mockSession: 'true',
      projects: [{ id: 'p-hist', name: 'History Workspace' }],
      activeProjectId: 'p-hist',
      budgets: {
        'p-hist': [
          { category: 'food', amount: 0 }, // Legacy tombstone must NOT clobber sub-categories!
          { category: 'food-dine-in', amount: 200 },
          { category: 'food-takeout', amount: 300 },
        ],
      },
      transactions: {
        'p-hist': [
          // Sep 2026: Groceries sub-category spend = $400
          {
            id: 'sep-g1',
            date: '2026-09-10',
            amount: 400,
            type: 'expense',
            category: 'groceries',
            subCategory: 'groceries-costco',
            description: 'Costco Wholesale',
            notes: '',
            labels: [],
            hash: 'hg1',
          },
          // Oct 2026: Groceries sub-category spend = $600 -> 3-mo avg across 2 active months = $500
          {
            id: 'oct-g1',
            date: '2026-10-12',
            amount: 600,
            type: 'expense',
            category: 'groceries',
            subCategory: 'groceries-supermarket',
            description: 'Whole Foods Market',
            notes: '',
            labels: [],
            hash: 'hg2',
          },
          // Nov 2026: Food sub-category spend = $250 + Penny-over Shopping = $50.01
          {
            id: 'nov-f1',
            date: '2026-11-05',
            amount: 250,
            type: 'expense',
            category: 'food',
            subCategory: 'food-dine-in',
            description: 'Sushi House',
            notes: '',
            labels: [],
            hash: 'hf1',
          },
          {
            id: 'nov-s1',
            date: '2026-11-06',
            amount: 50.01,
            type: 'expense',
            category: 'shopping',
            description: 'Bookstore',
            notes: '',
            labels: [],
            hash: 'hs1',
          },
        ],
      },
    });

    await page.goto('/#/budgets?month=2026-11');
    await expect(page.getByTestId('budgets-workspace')).toBeVisible();

    // BUG-BUD-07: Food parent rolls up $200 + $300 = $500 despite { category: 'food', amount: 0 } tombstone
    await expect(page.getByTestId('budget-input-Food')).toHaveValue('500');
    await expect(page.getByTestId('budget-utilization-Food')).toContainText('50%');

    // Guardrail G2: Drill down to Level3CategoryView for Food and verify $500 budget + $250 sub-category spend parity
    await page.getByTestId('budget-drilldown-food').click();
    await expect(page.getByTestId('level3-category-view')).toBeVisible();
    await expect(page.getByTestId('category-total-spent')).toContainText('$250');
    await expect(page.getByTestId('level3-category-view')).toContainText('$250 left of $500');

    // Return to #/budgets?month=2026-11
    await page.goto('/#/budgets?month=2026-11');
    await expect(page.getByTestId('budgets-workspace')).toBeVisible();

    // Guardrail G3: Set Shopping budget to $50 -> $50.01 spend must show 'Over by $0.01', never 'Over by $0'
    await page.getByTestId('budget-input-Shopping').fill('50');
    await expect(page.getByTestId('budget-utilization-Shopping')).toContainText(
      'Over by $0.01'
    );
    await expect(page.getByTestId('budget-indicator-Shopping')).toHaveClass(
      /budget-overspent/
    );

    // BUG-BUD-01: Expand Groceries and verify rolled-up historical spend ($600 last month, $500 3-mo avg) + 1-click quick-fill
    await page.getByTestId('budget-expand-groceries').click();
    const histStrip = page.getByTestId('budget-history-groceries');
    await expect(histStrip).toContainText('Last month: $600');
    await expect(histStrip).toContainText('3-mo avg: $500');
    await page.getByTestId('quickfill-avg3mo-groceries').click();
    await expect(page.getByTestId('budget-input-Groceries')).toHaveValue('500');
    await page.getByTestId('save-budgets-btn').click();

    // BUG-BUD-04 & G5: Switch to All Time -> 3 active months (Sep, Oct, Nov)
    // Groceries cumulative = $1,000 -> normalized monthly avg = $333.33 / mo against $500 target (67% used, NOT 200%!)
    await page.getByTestId('month-selector').selectOption('all');
    await expect(page.getByTestId('budgets-period-subtitle')).toContainText(
      'across 3 active months'
    );
    await expect(page.getByTestId('budgets-period-subtitle')).not.toContainText('for all');
    await expect(page.getByTestId('budget-utilization-Groceries')).toContainText('67%');

    // All-Time drilldown routes to filtered ledger (#/transactions?month=all&cat=groceries)
    await page.getByTestId('budget-drilldown-groceries').click();
    await expect(page.getByTestId('level4-transactions-workspace')).toBeVisible();
    await expect(page).toHaveURL(/#\/transactions\?month=all&cat=groceries/);
  });

  test('3. Draft Insulation across Overview & Reports (G1), Unsaved/Discard Bar, Ctrl+S Save, Bucket-Scoped Donut SVG (BUG-BUD-06), Locked Governance (BUG-BUD-09), and Zero-Purple/Zero-Shim Audit (BUG-BUD-12, BUG-BUD-13, G8)', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await preseedBudgetsWorkspace(page, {
      mockSession: 'true',
      theme: 'light',
      projects: [{ id: 'p-gov', name: 'Governance Project' }],
      activeProjectId: 'p-gov',
      budgets: {
        'p-gov': [
          { category: 'housing', amount: 1500 },
          { category: 'food', amount: 500 },
        ],
      },
      locks: {
        'p-gov': [{ month: '2026-09', locked: true, lockedAt: '2026-10-01T00:00:00Z' }],
      },
      transactions: {
        'p-gov': [
          {
            id: 'sep-locked-tx',
            date: '2026-09-05',
            amount: 120,
            type: 'expense',
            category: 'entertainment',
            spendingBucket: 'flexible',
            description: 'Locked Concert Ticket',
            notes: '',
            labels: [],
            hash: 'hl1',
          },
          {
            id: 'oct-open-tx',
            date: '2026-10-05',
            amount: 80,
            type: 'expense',
            category: 'entertainment',
            spendingBucket: 'flexible',
            description: 'Unlocked Movie Night',
            notes: '',
            labels: [],
            hash: 'ho1',
          },
          {
            id: 'oct-rent-tx',
            date: '2026-10-02',
            amount: 1500,
            type: 'expense',
            category: 'housing',
            spendingBucket: 'fixed',
            description: 'October Rent',
            notes: '',
            labels: [],
            hash: 'ho2',
          },
          {
            id: 'oct-food-tx',
            date: '2026-10-08',
            amount: 250,
            type: 'expense',
            category: 'food',
            spendingBucket: 'flexible',
            description: 'October Bistro',
            notes: '',
            labels: [],
            hash: 'ho3',
          },
        ],
      },
    });

    await page.goto('/#/budgets?month=2026-10');
    await expect(page.getByTestId('budgets-workspace')).toBeVisible();

    // BUG-BUD-06: Synchronized Bucket Tabs + Donut SVG slice count
    // All tab: housing ($1500), food ($250), entertainment ($80) = 3 <path> slices
    const pieSvg = page.getByTestId('chart-svg-pie');
    await expect(pieSvg.locator('path')).toHaveCount(3);

    const tabs = page.getByTestId('budget-bucket-tabs');
    await tabs.getByRole('button', { name: 'Fixed' }).click();
    await expect(pieSvg.locator('path')).toHaveCount(1);
    await expect(page.getByTestId('pie-segment-housing')).toBeVisible();

    await tabs.getByRole('button', { name: 'Flexible' }).click();
    await expect(pieSvg.locator('path')).toHaveCount(2);

    await tabs.getByRole('button', { name: 'All' }).click();
    await expect(pieSvg.locator('path')).toHaveCount(3);

    // Guardrail G1 & BUG-BUD-08: Edit Food target to $4,000 WITHOUT saving
    await page.getByTestId('budget-input-Food').fill('4000');
    await expect(page.getByTestId('budgets-unsaved-badge')).toContainText('Unsaved (1)');
    await expect(page.getByTestId('discard-budgets-btn')).toBeVisible();
    await expect(page.getByTestId('kpi-total-budget')).toHaveText('$5,500.00');

    // Navigate to Overview (#/month/2026-10) -> must stay insulated at saved $2,000 total budget ($500 Food)!
    await page.evaluate(() => {
      window.location.hash = '#/month/2026-10';
    });
    await expect(page.getByTestId('level1-month-overview')).toBeVisible();
    await expect(page.getByTestId('overview-cat-row-food')).toContainText('$250 / $500');

    // Navigate to Reports (#/reports?month=2026-10) -> must also stay insulated on saved $2,000 total budget!
    await page.evaluate(() => {
      window.location.hash = '#/reports?month=2026-10';
    });
    await expect(page.getByTestId('reports-workspace')).toBeVisible();
    await expect(page.getByTestId('reports-workspace')).not.toContainText('$5,500.00');

    // Return to #/budgets?month=2026-10, test Discard, then edit to $750 and save with Ctrl+S
    await page.evaluate(() => {
      window.location.hash = '#/budgets?month=2026-10';
    });
    await expect(page.getByTestId('budgets-workspace')).toBeVisible();
    await page.getByTestId('discard-budgets-btn').click();
    await expect(page.getByTestId('budget-input-Food')).toHaveValue('500');
    await expect(page.getByTestId('discard-budgets-btn')).toHaveCount(0);

    await page.getByTestId('budget-input-Food').fill('750');
    await page.keyboard.press('Control+s');
    await expect(page.getByTestId('discard-budgets-btn')).toHaveCount(0);
    await expect(page.getByTestId('kpi-total-budget')).toHaveText('$2,250.00');

    // BUG-BUD-13 & BUG-BUD-09: Open CategoryManagerModal in Light Theme -> opaque background + inline delete respecting locked month
    await page.getByTestId('open-add-category-btn').click();
    const modal = page.getByTestId('category-manager-modal');
    await expect(modal).toBeVisible();

    const dialogBg = await modal.evaluate(el => {
      const panel = el.firstElementChild as HTMLElement | null;
      return panel ? window.getComputedStyle(panel).backgroundColor : '';
    });
    expect(dialogBg).not.toBe('rgba(0, 0, 0, 0)');
    expect(dialogBg).not.toBe('transparent');

    // Delete 'entertainment' via inline confirmation -> unlocked Oct txn moves to 'misc', locked Sep txn stays 'entertainment'!
    await modal.getByTestId('delete-category-entertainment-btn').click();
    const confirmBanner = modal.getByTestId('confirm-delete-category-entertainment');
    await expect(confirmBanner).toContainText('1 unlocked txn');
    await expect(confirmBanner).toContainText('1 locked-month txn preserved');
    await modal.getByTestId('confirm-delete-category-btn-entertainment').click();
    await expect(confirmBanner).toHaveCount(0);

    const savedTxs = await page.evaluate(() => {
      const raw = window.localStorage.getItem('expense_txs_p-gov');
      return raw ? JSON.parse(raw) : [];
    });
    const sepLocked = savedTxs.find((t: { id: string }) => t.id === 'sep-locked-tx');
    const octOpen = savedTxs.find((t: { id: string }) => t.id === 'oct-open-tx');
    expect(sepLocked?.category).toBe('entertainment');
    expect(octOpen?.category).toBe('misc');

    await page.keyboard.press('Escape');
    await expect(modal).toHaveCount(0);

    // Switch to Locked Month 2026-09 -> verify full read-only governance on #/budgets
    await page.getByTestId('month-selector').selectOption('2026-09');
    await expect(page.getByTestId('budgets-locked-banner')).toBeVisible();
    await expect(page.getByTestId('save-budgets-btn')).toBeDisabled();
    await expect(page.getByTestId('budget-input-Food')).toBeDisabled();
    await expect(
      page.getByRole('button', { name: 'Month mood: Good' })
    ).toBeDisabled();

    // Zero-Shim & Zero-Purple Guard across 390px, 768px, and 1440px
    for (const vp of [
      { width: 390, height: 844 },
      { width: 768, height: 1024 },
      { width: 1440, height: 900 },
    ]) {
      await page.setViewportSize(vp);
      const audit = await page.evaluate(() => {
        const nodes = Array.from(document.querySelectorAll('[data-testid]'));
        const shimViolations: string[] = [];
        for (const el of nodes) {
          const testId = el.getAttribute('data-testid') || '';
          let curr: HTMLElement | null = el as HTMLElement;
          while (curr && curr !== document.body) {
            const cls = typeof curr.className === 'string' ? curr.className : '';
            const tokens = cls.split(/\s+/);
            if (tokens.includes('sr-only') || tokens.includes('opacity-0')) {
              shimViolations.push(`${testId} (${tokens.join('.')})`);
              break;
            }
            curr = curr.parentElement;
          }
          if (el.querySelector('.sr-only, .opacity-0')) {
            shimViolations.push(`${testId} (descendant .sr-only/.opacity-0)`);
          }
        }
        return { shimViolations };
      });
      expect(audit.shimViolations, `Zero-Shim Guard at ${vp.width}px`).toEqual([]);
    }
  });

  test('4. Round 2 Surgical Polish: Sticky Dirty Bar at scrollTop=250 (QA-BUD-01), Tablet 768x1024 Zero-Clipping & Scoped Bucket Summary (QA-BUD-02, CR-3), 320x568 & 390x844 Anti-Truncation (QA-BUD-03), Unbudgeted Callout Focus + Sub-Dollar Precision (QA-BUD-04, CR-2), and 390x844 CategoryManagerModal Density (CR-3)', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await preseedBudgetsWorkspace(page, {
      mockSession: 'true',
      projects: [{ id: 'p-r2', name: 'Round 2 Polish' }],
      activeProjectId: 'p-r2',
      budgets: {
        'p-r2': [
          { category: 'housing', amount: 2400 },
          { category: 'food', amount: 900 },
          { category: 'groceries', amount: 600 },
          { category: 'utilities', amount: 250 },
          { category: 'shopping', amount: 1310 },
        ],
      },
      transactions: {
        'p-r2': [
          {
            id: 'r2-inc',
            date: '2026-11-01',
            amount: 6800,
            type: 'income',
            category: 'income',
            description: 'Monthly Salary',
            notes: '',
            labels: [],
            hash: 'hr2-1',
          },
          {
            id: 'r2-rent',
            date: '2026-11-02',
            amount: 2400,
            type: 'expense',
            category: 'housing',
            spendingBucket: 'fixed',
            description: 'November Rent',
            notes: '',
            labels: [],
            hash: 'hr2-2',
          },
          {
            id: 'r2-food',
            date: '2026-11-05',
            amount: 660,
            type: 'expense',
            category: 'food',
            spendingBucket: 'flexible',
            description: 'Dining',
            notes: '',
            labels: [],
            hash: 'hr2-3',
          },
          {
            id: 'r2-groc',
            date: '2026-11-06',
            amount: 1260,
            type: 'expense',
            category: 'groceries',
            spendingBucket: 'flexible',
            description: 'Market',
            notes: '',
            labels: [],
            hash: 'hr2-4',
          },
          // Lower-spend unbudgeted category listed BEFORE higher-spend unbudgeted Travel to verify descending effSpent sort!
          {
            id: 'r2-ent-unb',
            date: '2026-11-07',
            amount: 0.45,
            type: 'expense',
            category: 'entertainment',
            spendingBucket: 'flexible',
            description: 'Micro Rental Charge',
            notes: '',
            labels: [],
            hash: 'hr2-5',
          },
          {
            id: 'r2-travel-unb',
            date: '2026-11-09',
            amount: 640,
            type: 'expense',
            category: 'travel',
            spendingBucket: 'non-monthly',
            description: 'Weekend Airfare',
            notes: '',
            labels: [],
            hash: 'hr2-6',
          },
        ],
      },
    });

    await page.goto('/#/budgets?month=2026-11');
    await expect(page.getByTestId('budgets-workspace')).toBeVisible();

    // CR-2: Fractional-cent unbudgeted total ($640 + $0.45 = $640.45) renders exact cents, never rounded away
    const callout = page.getByTestId('unbudgeted-spend-callout');
    await expect(callout).toContainText('+$640.45 unbudgeted (2)');

    // QA-BUD-04 & CR-2: Switch to Fixed tab (hiding Travel & Entertainment), then click unbudgeted-spend-callout
    // Must switch back to 'all', target the highest-spend unbudgeted category (Travel $640 > Entertainment $0.45), and focus its input!
    const tabs = page.getByTestId('budget-bucket-tabs');
    await tabs.getByRole('button', { name: 'Fixed' }).click();
    await expect(page.getByTestId('scoped-bucket-summary')).toContainText(
      'Fixed: $2,400 of $2,650 target · 91%'
    );
    await expect(page.locator('#budget-row-travel')).toHaveCount(0);

    await callout.click();
    await expect(page.getByTestId('scoped-bucket-summary')).toHaveCount(0);
    await expect(page.locator('#budget-row-travel')).toBeVisible();
    await expect(page.getByTestId('budget-input-Travel')).toBeFocused();

    // QA-BUD-01 & CR-1: Make workspace dirty and scroll <main> to scrollTop = 250px (using 1440x620 so scrollHeight exceeds clientHeight by >350px)
    await page.setViewportSize({ width: 1440, height: 620 });
    await page.getByTestId('budget-input-Shopping').fill('2500');
    await expect(page.getByTestId('budgets-unsaved-badge')).toContainText('Unsaved (1)');

    const stickyMetrics = await page.evaluate(() => {
      const main = document.querySelector('main');
      if (main) {
        main.scrollTop = 250;
      }
      const saveBtn = document.querySelector('[data-testid="save-budgets-btn"]');
      const discardBtn = document.querySelector('[data-testid="discard-budgets-btn"]');
      const stickyBar = document.querySelector('[data-testid="budgets-sticky-header"]');
      const saveRect = saveBtn?.getBoundingClientRect();
      const discardRect = discardBtn?.getBoundingClientRect();
      const stickyStyle = stickyBar ? window.getComputedStyle(stickyBar) : null;
      return {
        scrollTop: main?.scrollTop ?? 0,
        saveY: saveRect?.y ?? -999,
        saveBottom: saveRect?.bottom ?? -999,
        discardVisible: Boolean(discardRect && discardRect.y >= 40 && discardRect.y <= 110),
        stickyBg: stickyStyle?.backgroundColor ?? '',
      };
    });
    expect(stickyMetrics.scrollTop).toBeGreaterThanOrEqual(200);
    expect(stickyMetrics.saveY).toBeGreaterThanOrEqual(40);
    expect(stickyMetrics.saveY).toBeLessThanOrEqual(110);
    expect(stickyMetrics.saveBottom).toBeLessThanOrEqual(140);
    expect(stickyMetrics.discardVisible).toBe(true);
    expect(stickyMetrics.stickyBg).not.toBe('rgba(0, 0, 0, 0)');

    // Reset scroll & discard draft before responsive checks
    await page.evaluate(() => {
      const main = document.querySelector('main');
      if (main) main.scrollTop = 0;
    });
    await page.getByTestId('discard-budgets-btn').click();

    // QA-BUD-02 & CR-3: Tablet 768x1024 (<main> = 478px alongside 240px Sidebar)
    // Verify 0px horizontal clipping in budget-grid-container + visible Variable & Fixed tab text + scoped-bucket-summary
    await page.setViewportSize({ width: 768, height: 1024 });
    const tabletMetrics = await page.evaluate(() => {
      const grid = document.querySelector(
        '[data-testid="budget-grid-container"]'
      ) as HTMLElement | null;
      const drilldowns = Array.from(
        document.querySelectorAll('[data-testid^="budget-drilldown-"]')
      );
      const allDrilldownsInBounds = drilldowns.every(el => {
        const r = el.getBoundingClientRect();
        return r.width >= 30 && r.right <= window.innerWidth;
      });
      const tabButtons = Array.from(
        document.querySelectorAll('[data-testid="budget-bucket-tabs"] button')
      );
      const tabLabelStats = tabButtons.map(btn => {
        const spans = Array.from(btn.querySelectorAll('span')).filter(
          s =>
            window.getComputedStyle(s).display !== 'none' &&
            (s.textContent || '').trim().length > 0
        );
        const labelSpan = spans[0] as HTMLElement | undefined;
        return {
          width: labelSpan?.getBoundingClientRect().width ?? 0,
          truncatedPx: labelSpan ? labelSpan.scrollWidth - labelSpan.clientWidth : 999,
        };
      });
      return {
        gridOverflowX: grid ? grid.scrollWidth - grid.clientWidth : 999,
        allDrilldownsInBounds,
        tabLabelStats,
      };
    });
    expect(tabletMetrics.gridOverflowX).toBeLessThanOrEqual(0);
    expect(tabletMetrics.allDrilldownsInBounds).toBe(true);
    // All 4 tabs ('All', 'Variable', 'Fixed', 'Non-Monthly') must be visible and 100% untruncated
    for (const stat of tabletMetrics.tabLabelStats) {
      expect(stat.width).toBeGreaterThan(12);
      expect(stat.truncatedPx).toBeLessThanOrEqual(1);
    }

    await tabs.getByRole('button', { name: /Variable/ }).click();
    await expect(page.getByTestId('scoped-bucket-summary')).toBeVisible();
    await expect(page.getByTestId('scoped-bucket-summary')).toContainText('Variable:');
    await tabs.getByRole('button', { name: 'All' }).click();

    // QA-BUD-03: Narrow 320x568 viewport — non-truncated <h1>Budgets</h1> & 3 KPI amounts ($5,460.00, $4,320.00, $1,140.00)
    await page.setViewportSize({ width: 320, height: 568 });
    const narrow320Metrics = await page.evaluate(() => {
      const h1 = document.querySelector(
        '[data-testid="budgets-workspace"] h1'
      ) as HTMLElement | null;
      const kpiIds = ['kpi-total-budget', 'kpi-budgeted-spent', 'kpi-budget-remaining'];
      const kpiTruncations = kpiIds.map(id => {
        const el = document.querySelector(`[data-testid="${id}"]`) as HTMLElement | null;
        return el ? el.scrollWidth - el.clientWidth : 999;
      });
      return {
        h1Text: h1?.textContent?.trim() ?? '',
        h1TruncatedPx: h1 ? h1.scrollWidth - h1.clientWidth : 999,
        kpiTruncations,
        docOverflowX: document.documentElement.scrollWidth - window.innerWidth,
      };
    });
    expect(narrow320Metrics.h1Text).toBe('Budgets');
    expect(narrow320Metrics.h1TruncatedPx).toBeLessThanOrEqual(1);
    for (const diff of narrow320Metrics.kpiTruncations) {
      expect(diff).toBeLessThanOrEqual(1);
    }
    expect(narrow320Metrics.docOverflowX).toBeLessThanOrEqual(0);

    // QA-BUD-03 & CR-3: Mobile 390x844 — >= 4 rows above BottomNav when clean, non-truncated <h1> + visible Unsaved badge when dirty, and CategoryManagerModal >= 4 visible rows + "Add Category"
    await page.setViewportSize({ width: 390, height: 844 });
    const clean390Rows = await page.evaluate(() => {
      return Array.from(document.querySelectorAll('[data-testid^="budget-row-"]')).filter(
        el => {
          const r = el.getBoundingClientRect();
          return r.height > 0 && r.top >= 0 && r.bottom <= 775;
        }
      ).length;
    });
    expect(clean390Rows).toBeGreaterThanOrEqual(4);

    await page.getByTestId('budget-input-Shopping').fill('2000');
    await expect(page.getByTestId('budgets-unsaved-badge')).toBeVisible();
    await expect(page.getByTestId('save-budgets-btn')).toHaveCount(1);
    const dirty390H1Trunc = await page.evaluate(() => {
      const h1 = document.querySelector(
        '[data-testid="budgets-workspace"] h1'
      ) as HTMLElement | null;
      return h1 ? h1.scrollWidth - h1.clientWidth : 999;
    });
    expect(dirty390H1Trunc).toBeLessThanOrEqual(1);

    await page.getByTestId('open-add-category-btn').click();
    const modal = page.getByTestId('category-manager-modal');
    await expect(modal).toBeVisible();
    await expect(modal.getByTestId('save-category-btn')).toContainText('Add Category');

    const modalVisibleRows = await modal.evaluate(el => {
      const panelRect = (el.firstElementChild as HTMLElement | null)?.getBoundingClientRect();
      if (!panelRect) return 0;
      const editBtns = Array.from(
        el.querySelectorAll('[data-testid^="edit-category-"]')
      );
      return editBtns.filter(btn => {
        const r = btn.getBoundingClientRect();
        return r.height >= 28 && r.top >= panelRect.top && r.bottom <= panelRect.bottom;
      }).length;
    });
    expect(modalVisibleRows).toBeGreaterThanOrEqual(4);
  });
});
