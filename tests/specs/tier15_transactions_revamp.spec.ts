import { test, expect, Page } from '@playwright/test';

interface SeedPayload {
  projects: Array<{ id: string; name: string }>;
  activeProjectId: string;
  transactions: Record<string, Array<Record<string, unknown>>>;
  budgets?: Record<string, Array<Record<string, unknown>>>;
  locks?: Record<string, Array<Record<string, unknown>>>;
}

interface StoredTxRecord {
  id: string;
  labels?: string[];
  category?: string;
  spendingBucket?: string;
}

async function seedStorage(page: Page, payload: SeedPayload) {
  await page.addInitScript(data => {
    window.localStorage.setItem('expense_mock_session', 'true');
    window.localStorage.setItem('expense_projects', JSON.stringify(data.projects));
    window.localStorage.setItem('expense_active_project_id', data.activeProjectId);
    for (const [projId, txs] of Object.entries(data.transactions)) {
      window.localStorage.setItem(`expense_txs_${projId}`, JSON.stringify(txs));
    }
    if (data.budgets) {
      for (const [projId, b] of Object.entries(data.budgets)) {
        window.localStorage.setItem(`expense_budgets_${projId}`, JSON.stringify(b));
      }
    }
    if (data.locks) {
      for (const [projId, l] of Object.entries(data.locks)) {
        window.localStorage.setItem(`expense_locks_${projId}`, JSON.stringify(l));
      }
    }
  }, payload);
}

test.describe('Tier 15: Sprint 2 Transactions Workspace Revamp & Bug Fixes (BUG-TXN-01..16)', () => {
  test('1. Deep-link hydration race guard, external hash navigation without stale param leak, two-way URL<->filter sync, ghost-filter reset, MonthSwitcher param preservation, and Income bucket drilldown', async ({
    page,
  }) => {
    const errors: string[] = [];
    page.on('console', msg => {
      if (msg.type() === 'error') {
        const text = msg.text();
        if (!text.startsWith('Failed to load resource:')) {
          errors.push(text);
        }
      }
    });
    page.on('pageerror', err => errors.push(err.message));

    await page.setViewportSize({ width: 1440, height: 900 });
    await seedStorage(page, {
      projects: [{ id: 'p-url', name: 'URL Sync Workspace' }],
      activeProjectId: 'p-url',
      transactions: {
        'p-url': [
          {
            id: 'oct-rent',
            date: '2026-10-01',
            amount: 2450,
            category: 'housing',
            subCategory: 'housing-mortgage',
            spendingBucket: 'fixed',
            type: 'expense',
            description: 'Avalon October Rent',
            notes: '',
            labels: ['oct-only-tag'],
            hash: 'h-oct-rent',
            meta: { account: 'bilt' },
          },
          {
            id: 'oct-coffee',
            date: '2026-10-05',
            amount: 6.5,
            category: 'food',
            subCategory: 'food-takeout',
            spendingBucket: 'flexible',
            type: 'expense',
            description: 'Sightglass Coffee',
            notes: '',
            labels: [],
            hash: 'h-oct-coffee',
            meta: { account: 'chase' },
          },
          {
            id: 'nov-rent',
            date: '2026-11-01',
            amount: 2450,
            category: 'housing',
            subCategory: 'housing-mortgage',
            spendingBucket: 'fixed',
            type: 'expense',
            description: 'Avalon November Rent',
            notes: '',
            labels: [],
            hash: 'h-nov-rent',
            meta: { account: 'bilt' },
          },
          {
            id: 'nov-salary',
            date: '2026-11-02',
            amount: 6200,
            category: 'income',
            subCategory: 'income-salary',
            type: 'income',
            description: 'Acme Corp Payroll',
            notes: '',
            labels: [],
            hash: 'h-nov-sal',
            meta: { account: 'chase' },
          },
          {
            id: 'nov-dinner',
            date: '2026-11-08',
            amount: 72,
            category: 'food',
            subCategory: 'food-dine-in',
            spendingBucket: 'flexible',
            type: 'expense',
            description: 'Nopa Restaurant',
            notes: '',
            labels: ['date-night', 'needs-review'],
            hash: 'h-nov-din',
            meta: { account: 'chase', review: { reason: 'category' } },
          },
        ],
      },
    });

    // Deep-link into 2026-10 (even though 2026-11 is latest!) with bucket + account + search
    await page.goto('/#/transactions?month=2026-10&bucket=fixed&account=bilt&q=Rent');
    await expect(page.getByTestId('level4-transactions-workspace')).toBeVisible();
    await expect(page.getByTestId('month-selector')).toHaveValue('2026-10');
    await expect(page.getByTestId('transaction-row')).toHaveCount(1);
    await expect(page.getByText('Avalon October Rent')).toBeVisible();

    // MonthSwitcher preserves active bucket + account + search params into 2026-11!
    await page.getByTestId('month-selector').selectOption('2026-11');
    await expect
      .poll(() => page.evaluate(() => window.location.hash))
      .toBe('#/transactions?month=2026-11&bucket=fixed&account=bilt&q=Rent');
    await expect(page.getByText('Avalon November Rent')).toBeVisible();
    await expect(page.getByText('Nopa Restaurant')).toHaveCount(0);

    // Clear all resets search + chips + hash cleanly
    await page.getByTestId('clear-all-filters-btn').click();
    await expect
      .poll(() => page.evaluate(() => window.location.hash))
      .toBe('#/transactions?month=2026-11');

    // External URL hash navigation (QA-TXN-05): toggle Needs Review -> navigate to empty 2026-08 via hash -> must NOT re-inject review=1!
    await page.getByTestId('kpi-needs-review').click();
    await expect
      .poll(() => page.evaluate(() => window.location.hash))
      .toBe('#/transactions?month=2026-11&review=1');

    await page.goto('/#/transactions?month=2026-08');
    await expect
      .poll(() => page.evaluate(() => window.location.hash))
      .toBe('#/transactions?month=2026-08');
    await expect(page.getByTestId('empty-month-ledger-state')).toBeVisible();
    await expect(page.getByTestId('empty-state-add-txn-btn')).toBeVisible();
    await expect(page.getByTestId('empty-state-import-csv-btn')).toBeVisible();

    // External URL hash navigation with incoming query param (?q=ZZZ_NO_MATCH_999) must preserve q and show filtered empty state!
    await page.goto('/#/transactions?month=2026-11&q=ZZZ_NO_MATCH_999');
    await expect
      .poll(() => page.evaluate(() => window.location.hash))
      .toBe('#/transactions?month=2026-11&q=ZZZ_NO_MATCH_999');
    await expect(page.getByTestId('transaction-search-input')).toHaveValue('ZZZ_NO_MATCH_999');
    await expect(page.getByTestId('empty-filtered-ledger-state')).toBeVisible();
    await page.getByTestId('empty-reset-filters-btn').click();
    await expect(page.getByTestId('transaction-row')).toHaveCount(3);

    // Navigate to Level 4 Category transactions: prior filters MUST reset cleanly without leaking!
    await page.getByTestId('kpi-fixed-expenses').click();
    await page.goto('/#/month/2026-11/category/food/transactions');
    await expect(page.getByTestId('level4-transactions-workspace')).toBeVisible();
    await expect(page.getByText('Nopa Restaurant')).toBeVisible();
    await expect(page.getByTestId('transaction-search-input')).toHaveValue('');
    await expect
      .poll(() => page.evaluate(() => window.location.hash))
      .toBe('#/month/2026-11/category/food/transactions');

    // Level 2 Inflow & Income row drills into #/transactions?month=2026-11&bucket=income
    await page.goto('/#/month/2026-11/bucket/income');
    await expect(page.getByTestId('level2-bucket-view')).toBeVisible();
    await page.locator('[data-testid^="category-row-"]').first().click();
    await expect(page.getByTestId('level4-transactions-workspace')).toBeVisible();
    await expect
      .poll(() => page.evaluate(() => window.location.hash))
      .toContain('bucket=income');
    await expect(page.getByText('Acme Corp Payroll')).toBeVisible();
    await expect(page.getByText('Nopa Restaurant')).toHaveCount(0);

    expect(errors).toEqual([]);
  });

  test('2. Zero vertical filter-toggle shift, transfer-only day header (⇄ $X.XX), inline category->bucket sync, Merchant Sweep banner, Delete Undo with tombstone reversal, and unclamped net-refund slice summary', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await seedStorage(page, {
      projects: [{ id: 'p-triage', name: 'Triage & Undo Workspace' }],
      activeProjectId: 'p-triage',
      transactions: {
        'p-triage': [
          {
            id: 'tx-xfer-only',
            date: '2026-11-14',
            amount: 500,
            category: 'transfers',
            subCategory: 'transfers-credit-card',
            type: 'transfer',
            description: 'Chase Card Autopay Transfer',
            notes: '',
            labels: [],
            hash: 'h-xfer-1',
          },
          {
            id: 'tx-misc-lease',
            date: '2026-11-02',
            amount: 1850,
            category: 'misc',
            subCategory: null,
            spendingBucket: 'flexible',
            type: 'expense',
            description: 'Sunset Property Mgmt',
            notes: '',
            labels: [],
            hash: 'h-lease',
          },
          {
            id: 'tx-chipotle-1',
            date: '2026-11-04',
            amount: 16.25,
            category: 'misc',
            subCategory: null,
            spendingBucket: 'flexible',
            type: 'expense',
            description: 'Chipotle Mexican Grill #104',
            notes: '',
            labels: [],
            hash: 'h-chip-1',
            meta: {
              sources: ['bilt-plaid'],
              externalIds: { 'bilt-plaid': 'plaid_chip_104' },
            },
          },
          {
            id: 'tx-chipotle-2',
            date: '2026-11-09',
            amount: 17.5,
            category: 'misc',
            subCategory: null,
            spendingBucket: 'flexible',
            type: 'expense',
            description: 'TST* Chipotle Mexican Grill',
            notes: '',
            labels: [],
            hash: 'h-chip-2',
          },
          {
            id: 'tx-amzn-1',
            date: '2026-11-10',
            amount: 29.99,
            category: 'misc',
            subCategory: null,
            spendingBucket: 'flexible',
            type: 'expense',
            description: 'AMZN Mktp US*11A',
            notes: '',
            labels: [],
            hash: 'h-amzn-1',
          },
          {
            id: 'tx-amzn-2',
            date: '2026-11-11',
            amount: 49.99,
            category: 'misc',
            subCategory: null,
            spendingBucket: 'flexible',
            type: 'expense',
            description: 'AMZN Mktp US*22B',
            notes: '',
            labels: [],
            hash: 'h-amzn-2',
          },
          {
            id: 'tx-shop-exp',
            date: '2026-11-12',
            amount: 80,
            category: 'shopping',
            subCategory: 'shopping-apparel',
            spendingBucket: 'flexible',
            type: 'expense',
            description: 'Nordstrom Rack',
            notes: '',
            labels: [],
            hash: 'h-nord-1',
          },
          {
            id: 'tx-shop-ref',
            date: '2026-11-13',
            amount: 200,
            category: 'shopping',
            subCategory: 'shopping-apparel',
            spendingBucket: 'flexible',
            type: 'income',
            description: 'Nordstrom Return',
            notes: '',
            labels: ['refund'],
            hash: 'h-nord-ref',
          },
        ],
      },
    });

    await page.goto('/#/transactions?month=2026-11');
    await expect(page.getByTestId('level4-transactions-workspace')).toBeVisible();

    // 0. Transfer-only day header shows "⇄ $500.00" instead of "$0.00" (CR-06 / QA-TXN-08)
    const xferHeader = page.locator('[data-testid="transaction-day-header"][data-date="2026-11-14"]');
    await expect(xferHeader).toContainText('⇄ $500.00');

    // 1. Toggling KPI filter causes 0px vertical jump on the first day header & renders Clear all!
    const beforeHeaderBox = await page.getByTestId('transaction-day-header').first().boundingBox();
    expect(beforeHeaderBox).not.toBeNull();
    await page.getByTestId('kpi-flexible-spent').click();
    await expect(page.getByTestId('clear-all-filters-btn')).toBeVisible();
    const afterHeaderBox = await page.getByTestId('transaction-day-header').first().boundingBox();
    expect(afterHeaderBox).not.toBeNull();
    expect(Math.abs(afterHeaderBox!.y - beforeHeaderBox!.y)).toBeLessThanOrEqual(1);
    await page.getByTestId('clear-all-filters-btn').click();

    // 2. BUG-TXN-11: Reclassifying misc -> housing|housing-mortgage auto-syncs bucket from Variable -> Fixed!
    await expect(page.getByTestId('bucket-pill-tx-misc-lease')).toContainText('Variable');
    await page
      .getByTestId('transaction-category-select-tx-misc-lease')
      .selectOption('housing|housing-mortgage');
    await expect(page.getByTestId('bucket-pill-tx-misc-lease')).toContainText('Fixed');

    // 3. Opaque Amazon descriptor must NEVER trigger merchant sweep banner
    await page
      .getByTestId('transaction-category-select-tx-amzn-1')
      .selectOption('shopping|shopping-amazon');
    await expect(page.getByTestId('merchant-sweep-banner')).toHaveCount(0);

    // 4. Reclassifying Chipotle #104 triggers Merchant Sweep banner for TST* Chipotle Mexican Grill!
    await page
      .getByTestId('transaction-category-select-tx-chipotle-1')
      .selectOption('food|food-takeout');
    const sweepBanner = page.getByTestId('merchant-sweep-banner');
    await expect(sweepBanner).toBeVisible();
    await expect(sweepBanner).toContainText('1');
    await page.getByTestId('apply-merchant-sweep-btn').click();
    await expect(sweepBanner).toHaveCount(0);
    await expect(
      page.getByTestId('transaction-category-select-tx-chipotle-2')
    ).toHaveValue('food|food-takeout');

    // 5. Delete tx-chipotle-1 -> immediate tombstone recorded -> click Undo -> row restored & tombstone reversed!
    const chipotleRow = page.locator('[data-testid="transaction-row"]', {
      hasText: 'Chipotle Mexican Grill #104',
    });
    await chipotleRow.hover();
    await page.getByTestId('delete-transaction-btn-tx-chipotle-1').click();
    await expect(page.getByText('Chipotle Mexican Grill #104')).toHaveCount(0);

    const tombstonesAfterDelete = await page.evaluate(
      () =>
        (
          JSON.parse(window.localStorage.getItem('expense_ingest_state_p-triage') || '{}') as {
            tombstones?: string[];
          }
        ).tombstones || []
    );
    expect(tombstonesAfterDelete).toContain('plaid_chip_104');

    const undoBtn = page.getByTestId('toast-undo-btn');
    await expect(undoBtn).toBeVisible();
    await undoBtn.click();

    await expect(page.getByText('Chipotle Mexican Grill #104')).toBeVisible();
    const tombstonesAfterUndo = await page.evaluate(
      () =>
        (
          JSON.parse(window.localStorage.getItem('expense_ingest_state_p-triage') || '{}') as {
            tombstones?: string[];
          }
        ).tombstones || []
    );
    expect(tombstonesAfterUndo).not.toContain('plaid_chip_104');

    // 6. Unclamped Slice Summary: filter by Category "Apparel & Clothing" ($80 expense vs $200 refund -> +$120.00 net credit!)
    await page.getByTestId('ledger-filter-btn').click();
    await expect(page.getByTestId('filter-status-review')).toBeVisible();
    await expect(page.getByTestId('filter-status-pending')).toBeVisible();
    await expect(page.getByTestId('filter-status-auto')).toBeVisible();
    await page.getByTestId('filter-category-select').selectOption('shopping-apparel');
    await page.keyboard.press('Escape');
    await expect(page.getByTestId('ledger-slice-summary')).toContainText(
      '2 of 8 shown · +$120.00 net credit'
    );
  });

  test('3. Edit-mode duplicate guard, tip-drift review callout & inline review detail, modal category->bucket auto-sync, refund uncheck cleanup, and history auto-fill', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await seedStorage(page, {
      projects: [{ id: 'p-modal', name: 'Modal Integrity Workspace' }],
      activeProjectId: 'p-modal',
      transactions: {
        'p-modal': [
          {
            id: 'tx-coffee-a',
            date: '2026-11-05',
            amount: 6.5,
            category: 'food',
            subCategory: 'food-takeout',
            spendingBucket: 'flexible',
            type: 'expense',
            description: 'Blue Bottle Coffee',
            notes: '',
            labels: [],
            hash: 'h-bb-a',
            meta: { categorizedBy: 'user', userEdited: ['category'] },
          },
          {
            id: 'tx-coffee-b',
            date: '2026-11-05',
            amount: 9.25,
            category: 'food',
            subCategory: 'food-takeout',
            spendingBucket: 'flexible',
            type: 'expense',
            description: 'Blue Bottle Coffee',
            notes: '',
            labels: [],
            hash: 'h-bb-b',
          },
          {
            id: 'tx-tip-drift',
            date: '2026-11-08',
            amount: 64.0,
            category: 'misc',
            subCategory: null,
            spendingBucket: 'flexible',
            type: 'expense',
            description: 'State Bird Provisions',
            notes: '',
            labels: ['needs-review'],
            hash: 'h-tip',
            meta: {
              sources: ['google_wallet', 'bilt-plaid'],
              orderId: 'ORD-991',
              review: {
                reason: 'tip-drift',
                reasons: ['tip-drift'],
                detail: 'Settled $64.00 after $12.00 tip',
                flaggedAt: '2026-11-08T20:00:00.000Z',
              },
            },
          },
          {
            id: 'tx-cat-rev',
            date: '2026-11-07',
            amount: 22.0,
            category: 'misc',
            subCategory: null,
            spendingBucket: 'flexible',
            type: 'expense',
            description: 'Mystery Kiosk Charge',
            notes: '',
            labels: ['needs-review'],
            hash: 'h-kiosk',
            meta: {
              review: {
                reason: 'category',
                reasons: ['category'],
                detail: 'Unrecognized merchant descriptor',
                flaggedAt: '2026-11-07T12:00:00.000Z',
              },
            },
          },
          {
            id: 'tx-refund-row',
            date: '2026-11-09',
            amount: 45.0,
            category: 'refund',
            subCategory: null,
            spendingBucket: 'flexible',
            type: 'income',
            description: 'REI Gear Credit',
            notes: '',
            labels: ['refund'],
            hash: 'h-rei-ref',
          },
        ],
      },
    });

    await page.goto('/#/transactions?month=2026-11');
    await expect(page.getByTestId('level4-transactions-workspace')).toBeVisible();

    // 1. Human-readable review badge ("Needs Review · Tip adjusted"), Split badge, 390px non-overlap, inline review-detail & dismiss-all-reviews-btn
    await page.setViewportSize({ width: 390, height: 844 });
    const tipRowMobile = page.locator('[data-testid="transaction-row"]', {
      hasText: 'State Bird Provisions',
    });
    const badgeBox390 = await page.getByTestId('needs-review-badge-tx-tip-drift').boundingBox();
    const amtBox390 = await tipRowMobile.locator('.text-right').boundingBox();
    expect(badgeBox390).not.toBeNull();
    expect(amtBox390).not.toBeNull();
    expect(badgeBox390!.x + badgeBox390!.width).toBeLessThanOrEqual(amtBox390!.x);

    await page.setViewportSize({ width: 1440, height: 900 });
    await expect(page.getByTestId('needs-review-badge-tx-tip-drift')).toContainText(
      'Needs Review · Tip adjusted'
    );
    await expect(page.getByTestId('split-badge-tx-tip-drift')).toBeVisible();

    await page.getByTestId('kpi-needs-review').click();
    await expect(page.getByTestId('dismiss-all-reviews-btn')).toBeVisible();
    await expect(page.getByTestId('review-detail-tx-tip-drift')).toContainText(
      'Settled $64.00 after $12.00 tip'
    );
    await page.getByTestId('kpi-needs-review').click();

    // Open tip-drift row in Edit Sheet -> modal-review-callout + provenance shown -> changing category auto-syncs bucket when spendingBucket was NOT userEdited!
    await page.getByText('State Bird Provisions').click();
    await expect(page.getByTestId('modal-review-callout')).toBeVisible();
    await expect(page.getByTestId('sheet-provenance-strip')).toContainText('ORD-991');
    await page.getByTestId('transaction-category-select').selectOption('housing|housing-mortgage');
    await page.getByTestId('save-transaction-btn').click();
    await expect(page.getByTestId('needs-review-badge-tx-tip-drift')).toHaveCount(0);
    await expect(page.getByTestId('bucket-pill-tx-tip-drift')).toContainText('Fixed');

    // Dismiss remaining review item inline
    await page.getByTestId('dismiss-review-btn-tx-cat-rev').click();
    await expect(page.getByTestId('kpi-needs-review')).toHaveCount(0);

    // 2. Edit tx-coffee-b ($9.25 -> $6.50) into exact collision with tx-coffee-a -> triggers DuplicateWarningModal!
    const rowB = page.locator('[data-testid="transaction-row"]', { hasText: '9.25' });
    await rowB.hover();
    await page.getByTestId('edit-transaction-btn-tx-coffee-b').click();
    await page.getByTestId('transaction-amount-input').fill('6.50');
    await page.getByTestId('save-transaction-btn').click();

    await expect(page.getByTestId('duplicate-warning-modal')).toBeVisible();
    await page.getByTestId('confirm-duplicate-save-btn').click();
    await expect(page.getByTestId('kpi-needs-review')).toHaveCount(0);

    // 3. Unchecking Refund toggle on legacy category='refund' row cleans up #refund and switches category to Income
    await page.getByText('REI Gear Credit').click();
    const refundCheckbox = page
      .getByTestId('transaction-refund-toggle')
      .locator('input[type="checkbox"]');
    await expect(refundCheckbox).toBeChecked();
    await refundCheckbox.uncheck();
    await expect(page.getByTestId('transaction-category-select')).toHaveValue('income');
    await page.getByTestId('save-transaction-btn').click();

    const storedAfterRefundUncheck = await page.evaluate(
      () =>
        JSON.parse(
          window.localStorage.getItem('expense_txs_p-modal') || '[]'
        ) as StoredTxRecord[]
    );
    const updatedRei = storedAfterRefundUncheck.find(t => t.id === 'tx-refund-row');
    expect(updatedRei?.labels).not.toContain('refund');
    expect(updatedRei?.category).toBe('income');

    // 4. Add Record modal auto-fills category from merchant history AND syncs category on Type toggle
    await page.getByTestId('open-add-transaction-btn').click();
    await page
      .getByTestId('transaction-type-toggle')
      .getByRole('button', { name: 'Income' })
      .click();
    await expect(page.getByTestId('transaction-category-select')).toHaveValue('income');
    await page
      .getByTestId('transaction-type-toggle')
      .getByRole('button', { name: 'Expense' })
      .click();
    await page.getByTestId('transaction-desc-input').fill('Blue Bottle Coffee');
    await expect(page.getByTestId('transaction-category-select')).toHaveValue(
      'food|food-takeout'
    );
    await expect(page.getByTestId('modal-category-auto-badge')).toContainText('History');
    await page.keyboard.press('Escape');
  });

  test('4. All-Time 4-digit years & per-row lock UX, sticky top-12 day header, layered Escape, note popover, Electric Power & comma search, 390px centered bulk bar & month-scoped filter tags, 768px 1-row toolbar, and Zero-Shim Guard', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await seedStorage(page, {
      projects: [{ id: 'p-power', name: 'Power Ledger Workspace' }],
      activeProjectId: 'p-power',
      locks: {
        'p-power': [{ month: '2026-10', locked: true, lockedAt: '2026-11-01T00:00:00Z' }],
      },
      transactions: {
        'p-power': [
          {
            id: 'oct-locked-1',
            date: '2026-10-15',
            amount: 120,
            category: 'utilities',
            subCategory: 'utilities-electric',
            spendingBucket: 'fixed',
            type: 'expense',
            description: 'Locked October Electric',
            notes: '',
            labels: ['oct-archive'],
            hash: 'h-oct-1',
          },
          {
            id: 'nov-1',
            date: '2026-11-12',
            amount: 2450,
            category: 'utilities',
            subCategory: 'utilities-electric',
            spendingBucket: 'fixed',
            type: 'expense',
            description: 'Row One ConEd Bill',
            notes: 'CONFIDENTIAL_METER_NOTE_77',
            labels: ['needs-review', 'nov-bill', 'utility-2026'],
            hash: 'h-n1',
            meta: { account: 'bilt', review: { reason: 'category' } },
          },
          {
            id: 'nov-2',
            date: '2026-11-11',
            amount: 35,
            category: 'food',
            spendingBucket: 'flexible',
            type: 'expense',
            description: 'Row Two Dinner',
            notes: '',
            labels: ['needs-review'],
            hash: 'h-n2',
            meta: { review: { reason: 'category' } },
          },
          {
            id: 'nov-3',
            date: '2026-11-10',
            amount: 45,
            category: 'groceries',
            spendingBucket: 'flexible',
            type: 'expense',
            description: 'Row Three Groceries',
            notes: '',
            labels: [],
            hash: 'h-n3',
          },
        ],
      },
    });

    await page.goto('/#/transactions?month=all');
    await expect(page.getByTestId('level4-transactions-workspace')).toBeVisible();

    // 1. Sticky day header uses top: 48px (top-12 below h-12 PageHeader!) & includes 4-digit year in All Time
    const firstDayHeader = page.getByTestId('transaction-day-header').first();
    const stickyTop = await firstDayHeader.evaluate(el => getComputedStyle(el).top);
    expect(stickyTop).toBe('48px');
    await expect(firstDayHeader).toContainText('2026');

    // 2. All-Time per-row lock UX: locked Oct row renders locked-row-icon, keeps edit/delete visible (tier5),
    // opens Read-Only Inspection Sheet on click, and blocks delete with lock toast!
    await expect(page.getByTestId('locked-row-icon-oct-locked-1')).toBeVisible();
    await expect(page.getByTestId('edit-transaction-btn-oct-locked-1')).toBeVisible();
    await expect(page.getByTestId('delete-transaction-btn-oct-locked-1')).toBeVisible();

    await page.getByTestId('edit-transaction-btn-oct-locked-1').click();
    await expect(page.getByTestId('modal-locked-banner')).toBeVisible();
    await page.getByTestId('modal-close-locked-btn').click();
    await expect(page.getByTestId('modal-locked-banner')).toHaveCount(0);

    await page.getByTestId('delete-transaction-btn-oct-locked-1').click();
    await expect(page.getByTestId('notification-toast')).toContainText(
      'Cannot delete transaction — 2026-10 is locked.'
    );
    await expect(page.getByText('Locked October Electric')).toBeVisible();

    // 3. Privacy-safe Note Popover: userNote is absent at rest and shown on note-preview-btn click!
    const nov1Row = page.locator('[data-testid="transaction-row"]', {
      hasText: 'Row One ConEd Bill',
    });
    await expect(nov1Row).not.toContainText('CONFIDENTIAL_METER_NOTE_77');
    await page.getByTestId('note-preview-btn-nov-1').click();
    await expect(page.locator('[data-popover="note-preview"]')).toContainText(
      'CONFIDENTIAL_METER_NOTE_77'
    );
    await page.keyboard.press('Escape');
    await expect(page.locator('[data-popover="note-preview"]')).toHaveCount(0);

    // 4. Select All selects ONLY the 3 unlocked Nov rows; layered Escape clears selection WITHOUT leaving /transactions!
    await page.getByTestId('select-all-txns-checkbox').check();
    await expect(page.getByTestId('floating-bulk-action-bar')).toContainText('3 selected');
    await page.keyboard.press('Escape');
    await expect(page.getByTestId('floating-bulk-action-bar')).toHaveCount(0);
    await expect(page.getByTestId('level4-transactions-workspace')).toBeVisible();

    // 5. Upward Bulk + Tag Popover & Bulk "Mark Reviewed" (bulk-dismiss-review-btn)
    await page.getByTestId('select-all-txns-checkbox').check();
    await page.getByTestId('bulk-add-tag-btn').click();
    const tagPopover = page.locator('[data-popover="tag-input"]');
    await expect(tagPopover).toBeVisible();
    const popBox = await tagPopover.boundingBox();
    const barBox = await page.getByTestId('floating-bulk-action-bar').boundingBox();
    expect(popBox).not.toBeNull();
    expect(barBox).not.toBeNull();
    expect(popBox!.y + popBox!.height).toBeLessThanOrEqual(barBox!.y + 2);
    await page.keyboard.press('Escape');

    await expect(page.getByTestId('bulk-dismiss-review-btn')).toContainText('Mark Reviewed (2)');
    await page.getByTestId('bulk-dismiss-review-btn').click();
    await expect(page.getByTestId('kpi-needs-review')).toHaveCount(0);

    // 6. Shift+Click range selection on unlocked rows 1 -> 3 selects all 3 rows!
    await page.getByLabel('Select Row One ConEd Bill').check();
    await expect(page.getByTestId('floating-bulk-action-bar')).toContainText('1 selected');
    await page.getByLabel('Select Row Three Groceries').click({ modifiers: ['Shift'] });
    await expect(page.getByTestId('floating-bulk-action-bar')).toContainText('3 selected');

    // Switch to 2026-11 and lock current month -> active selection is cleared immediately!
    await page.getByTestId('month-selector').selectOption('2026-11');
    await page.getByLabel('Select Row One ConEd Bill').check();
    await expect(page.getByTestId('floating-bulk-action-bar')).toContainText('1 selected');
    await page.getByTestId('lock-month-btn').click();
    await expect(page.getByTestId('floating-bulk-action-bar')).toHaveCount(0);
    await page.getByTestId('unlock-month-btn').click();

    // 7. Search parity: "Electric Power" and comma-formatted "2,450" both match Row One ConEd Bill!
    await page.keyboard.press('/');
    await expect(page.getByTestId('transaction-search-input')).toBeFocused();
    await page.getByTestId('transaction-search-input').fill('Electric Power');
    await expect(page.getByText('Row One ConEd Bill')).toBeVisible();
    await expect(page.getByText('Row Two Dinner')).toHaveCount(0);

    await page.getByTestId('transaction-search-input').fill('2,450');
    await expect(page.getByText('Row One ConEd Bill')).toBeVisible();
    await page.getByTestId('clear-all-filters-btn').click();

    const downloadPromise = page.waitForEvent('download');
    await page.getByTestId('export-csv-btn').click();
    const download = await downloadPromise;
    expect(download.suggestedFilename()).toBe('nebula-transactions-2026-11.csv');

    const checkWrappedDotViolations = () =>
      page.evaluate(() => {
        const violations: string[] = [];
        const rows = Array.from(document.querySelectorAll('[data-testid="transaction-row"]'));
        for (const row of rows) {
          const firstMetaItem = row.querySelector('.ledger-meta-item');
          const metaContainer = firstMetaItem?.parentElement;
          if (!metaContainer) continue;
          const kids = (Array.from(metaContainer.children) as HTMLElement[]).filter(
            el => el.offsetParent !== null
          );
          for (let i = 0; i < kids.length; i++) {
            const isLineStart = i === 0 || kids[i].offsetTop - kids[i - 1].offsetTop > 6;
            if (isLineStart) {
              const beforeContent = getComputedStyle(kids[i], '::before').content;
              if (beforeContent && beforeContent !== 'none' && beforeContent !== 'normal') {
                violations.push(
                  `${row.textContent?.slice(0, 24)} item#${i} before=${beforeContent}`
                );
              }
            }
          }
        }
        return violations;
      });

    // 8. Tablet 768x1024: single-row toolbar, orphan-free wrapped metadata dots & Zero-Shim Guard
    await page.setViewportSize({ width: 768, height: 1024 });
    const searchBox768 = await page.getByTestId('transaction-search-input').boundingBox();
    const addBox768 = await page.getByTestId('open-add-transaction-btn').boundingBox();
    expect(searchBox768).not.toBeNull();
    expect(addBox768).not.toBeNull();
    expect(Math.abs(searchBox768!.y - addBox768!.y)).toBeLessThanOrEqual(4);
    expect(await checkWrappedDotViolations()).toEqual([]);

    // 9. Mobile 390x844: untruncated slice summary, orphan-free wrapped metadata dots, non-clipping modal sticky footer,
    // centered floating-bulk-action-bar with upward + Tag popover clearing wrapped bar, & month-scoped Filter popover!
    await page.setViewportSize({ width: 390, height: 844 });

    const sliceTruncated390 = await page
      .getByTestId('ledger-slice-summary')
      .evaluate(el => el.scrollWidth > el.clientWidth + 1);
    expect(sliceTruncated390).toBe(false);
    expect(await checkWrappedDotViolations()).toEqual([]);

    // Open Edit TransactionModal at 390x844 -> verify save-transaction-btn right <= 374 (<= 382) & sticky footer flush with sheet bottom
    await page.getByText('Row One ConEd Bill').click();
    const saveBtn390 = page.getByTestId('save-transaction-btn');
    await expect(saveBtn390).toBeVisible();
    await expect
      .poll(async () => {
        const b = await saveBtn390.boundingBox();
        return b ? Math.round(b.x + b.width) : 999;
      })
      .toBeLessThanOrEqual(374);
    const saveBox390 = await saveBtn390.boundingBox();
    expect(saveBox390).not.toBeNull();
    expect(saveBox390!.x).toBeGreaterThanOrEqual(8);
    expect(saveBox390!.x + saveBox390!.width).toBeLessThanOrEqual(382);
    const modalFooterBleedGap = await saveBtn390.evaluate(btn => {
      const footer = btn.closest('.sticky');
      const dialogSheet = btn.closest('[role="dialog"] > div');
      if (!footer || !dialogSheet) return -1;
      return Math.abs(
        dialogSheet.getBoundingClientRect().bottom - footer.getBoundingClientRect().bottom
      );
    });
    expect(modalFooterBleedGap).toBeGreaterThanOrEqual(0);
    expect(modalFooterBleedGap).toBeLessThanOrEqual(2);
    await page.keyboard.press('Escape');

    await page.getByTestId('ledger-filter-btn').click();
    const mobileFilterPop = page.locator('[data-popover="ledger-filter"]');
    await expect(mobileFilterPop).toBeVisible();
    await expect(page.getByTestId('filter-tag-nov-bill')).toBeVisible();
    await expect(page.getByTestId('filter-tag-oct-archive')).toHaveCount(0);
    const mobilePopBox = await mobileFilterPop.boundingBox();
    expect(mobilePopBox).not.toBeNull();
    expect(mobilePopBox!.x).toBeGreaterThanOrEqual(8);
    expect(mobilePopBox!.x + mobilePopBox!.width).toBeLessThanOrEqual(382);
    const mobilePopZ = await mobileFilterPop.evaluate(el => getComputedStyle(el).zIndex);
    expect(Number(mobilePopZ)).toBeGreaterThanOrEqual(46);
    await page.keyboard.press('Escape');

    await page.getByTestId('mobile-select-toggle-btn').click();
    await page.getByTestId('select-all-txns-checkbox').check();
    const mobileBulkBar = page.getByTestId('floating-bulk-action-bar');
    await expect(mobileBulkBar).toBeVisible();
    const mobileBarBox = await mobileBulkBar.boundingBox();
    expect(mobileBarBox).not.toBeNull();
    expect(mobileBarBox!.x).toBeGreaterThanOrEqual(8);
    expect(mobileBarBox!.x + mobileBarBox!.width).toBeLessThanOrEqual(382);

    await page.getByTestId('bulk-add-tag-btn').click();
    const mobileBulkTagPop = page.locator('[data-popover="tag-input"]');
    await expect(mobileBulkTagPop).toBeVisible();
    await expect
      .poll(async () => {
        const pBox = await mobileBulkTagPop.boundingBox();
        const bBox = await mobileBulkBar.boundingBox();
        return pBox && bBox ? pBox.y + pBox.height - bBox.y : 999;
      })
      .toBeLessThanOrEqual(0);
    const mobileBulkTagBox = await mobileBulkTagPop.boundingBox();
    const wrappedBarBox = await mobileBulkBar.boundingBox();
    expect(mobileBulkTagBox).not.toBeNull();
    expect(wrappedBarBox).not.toBeNull();
    expect(mobileBulkTagBox!.x).toBeGreaterThanOrEqual(8);
    expect(mobileBulkTagBox!.x + mobileBulkTagBox!.width).toBeLessThanOrEqual(382);
    expect(mobileBulkTagBox!.y + mobileBulkTagBox!.height).toBeLessThanOrEqual(wrappedBarBox!.y);
    await page.keyboard.press('Escape');
    await expect(mobileBulkTagPop).toHaveCount(0);

    await page.getByTestId('mobile-select-toggle-btn').click();

    // 10. Zero-Shim Guard across 390px, 768px, and 1440px
    for (const vp of [
      { width: 390, height: 844 },
      { width: 768, height: 1024 },
      { width: 1440, height: 900 },
    ]) {
      await page.setViewportSize(vp);
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
              violations.push(`${testId} (${tokens.join('.')})`);
              break;
            }
            curr = curr.parentElement;
          }
          if (el.querySelector('.sr-only, .opacity-0')) {
            violations.push(`${testId} (descendant .sr-only/.opacity-0)`);
          }
        }
        return violations;
      });
      expect(shimViolations, `Zero-Shim Guard at ${vp.width}px`).toEqual([]);
    }
  });

  test('5. Progressive 150-row windowing (ledger-show-more-btn) with full-dataset Select All & slice summary', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    const bulkRows = Array.from({ length: 180 }, (_, idx) => ({
      id: `tx-win-${String(idx + 1).padStart(3, '0')}`,
      date: `2026-11-${String((idx % 28) + 1).padStart(2, '0')}`,
      amount: 10 + (idx % 50),
      category: 'food',
      subCategory: 'food-takeout',
      spendingBucket: 'flexible',
      type: 'expense',
      description: `Windowed Cafe #${idx + 1}`,
      notes: '',
      labels: [],
      hash: `h-win-${idx + 1}`,
    }));

    await seedStorage(page, {
      projects: [{ id: 'p-win', name: 'Windowed Ledger' }],
      activeProjectId: 'p-win',
      transactions: { 'p-win': bulkRows },
    });

    await page.goto('/#/transactions?month=2026-11');
    await expect(page.getByTestId('level4-transactions-workspace')).toBeVisible();

    // Initially renders 150 DOM rows while slice summary & Select All reflect all 180 matching records!
    await expect(page.getByTestId('transaction-row')).toHaveCount(150);
    await expect(page.getByTestId('ledger-slice-summary')).toContainText('180 transactions');

    await page.getByTestId('select-all-txns-checkbox').check();
    await expect(page.getByTestId('floating-bulk-action-bar')).toContainText('180 selected');
    await page.keyboard.press('Escape');

    const showMoreBtn = page.getByTestId('ledger-show-more-btn');
    await expect(showMoreBtn).toContainText('Show more (30 remaining)');
    // Focusing or scrolling into view programmatically must NOT detach ledger-show-more-btn!
    await showMoreBtn.focus();
    await expect(showMoreBtn).toBeFocused();
    await expect(page.getByTestId('transaction-row')).toHaveCount(150);
    await showMoreBtn.click();
    await expect(page.getByTestId('transaction-row')).toHaveCount(180);
    await expect(showMoreBtn).toHaveCount(0);

    // Scroll <main> down and verify sticky day header locks flush below PageHeader (48px, 0px bleed gap)
    // AND bottom-near-viewport row bucket-switcher auto-flips upward (data-placement="top")!
    await page.evaluate(() => {
      const mainEl = document.querySelector('main');
      if (mainEl) mainEl.scrollTop = 600;
    });
    const pinnedGap = await page.evaluate(() => {
      const pageHeader = document.querySelector('[data-testid="dashboard-header"]');
      const headers = Array.from(
        document.querySelectorAll('[data-testid="transaction-day-header"]')
      );
      const headerBottom = pageHeader?.getBoundingClientRect().bottom ?? 48;
      const pinned = headers.find(
        h => Math.abs(h.getBoundingClientRect().top - headerBottom) <= 2
      );
      return pinned ? Math.abs(pinned.getBoundingClientRect().top - headerBottom) : -1;
    });
    expect(pinnedGap).toBeGreaterThanOrEqual(0);
    expect(pinnedGap).toBeLessThanOrEqual(2);

    // Find a bucket pill near the bottom of the 900px viewport (y in [750, 880]) and verify upward auto-flip!
    const bottomRowId = await page.evaluate(() => {
      const pills = Array.from(
        document.querySelectorAll<HTMLElement>('[data-testid^="bucket-pill-"]')
      );
      const hit = pills.find(el => {
        const r = el.getBoundingClientRect();
        return r.bottom > 760 && r.bottom < 890;
      });
      return hit?.getAttribute('data-testid')?.replace('bucket-pill-', '') || null;
    });
    expect(bottomRowId).not.toBeNull();
    await page.getByTestId(`bucket-pill-${bottomRowId}`).click();
    const flippedSwitcher = page.getByTestId(`bucket-switcher-${bottomRowId}`);
    await expect(flippedSwitcher).toHaveAttribute('data-placement', 'top');
    const switcherBox = await flippedSwitcher.boundingBox();
    expect(switcherBox).not.toBeNull();
    expect(switcherBox!.y + switcherBox!.height).toBeLessThanOrEqual(900);
    await page.keyboard.press('Escape');
  });
});
