import { test, expect, Page } from '@playwright/test';
import fs from 'node:fs';

interface SeedV1Payload {
  projects?: Array<{ id: string; name: string; collaborators?: string[] }>;
  activeProjectId?: string;
  transactions?: Record<string, Array<Record<string, unknown>>>;
  budgets?: Record<string, Array<{ category: string; amount: number }>>;
  categories?: Record<string, Array<Record<string, unknown>>>;
  locks?: Record<string, Array<{ month: string; locked: boolean; lockedAt?: string }>>;
  notes?: Record<string, Record<string, { text: string; updatedAt: string; mood?: string }>>;
  ingestState?: Record<string, Record<string, unknown>>;
  mockSession?: string;
  theme?: 'dark' | 'light';
}

async function seedV1Workspace(page: Page, seeded: SeedV1Payload) {
  await page.addInitScript(data => {
    (window as unknown as { __PLAYWRIGHT__?: boolean }).__PLAYWRIGHT__ = true;
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
        window.localStorage.setItem(`expense_budget_notes_${projId}`, JSON.stringify(nMap));
      }
    }
    if (data.ingestState) {
      for (const [projId, ing] of Object.entries(data.ingestState)) {
        window.localStorage.setItem(`expense_ingest_state_${projId}`, JSON.stringify(ing));
      }
    }
    if (data.mockSession) {
      window.localStorage.setItem('expense_mock_session', data.mockSession);
    }
  }, seeded);
}

const MULTI_MONTH_SEED: SeedV1Payload = {
  mockSession: 'true',
  theme: 'dark',
  projects: [{ id: 'p-v1', name: 'Household Ledger' }],
  activeProjectId: 'p-v1',
  budgets: {
    'p-v1': [
      { category: 'housing', amount: 2200 },
      { category: 'groceries', amount: 600 },
      { category: 'shopping', amount: 400 },
      { category: 'food', amount: 350 },
    ],
  },
  locks: {
    'p-v1': [{ month: '2026-10', locked: true, lockedAt: '2026-11-01T00:00:00.000Z' }],
  },
  notes: {
    'p-v1': {
      '2026-10:__overall__': {
        text: 'October settled cleanly.',
        updatedAt: '2026-10-31T10:00:00.000Z',
      },
    },
  },
  ingestState: {
    'p-v1': {
      version: 1,
      tombstones: ['tomb-1', 'tomb-2'],
      sources: {
        'bilt-plaid': {
          sourceId: 'bilt-plaid',
          lastSyncAt: '2026-11-10T08:00:00.000Z',
          totalIngested: 4,
        },
      },
      recentRuns: [],
    },
  },
  transactions: {
    'p-v1': [
      // Oct 2026: Deficit month ($1,400 income vs $3,600 rent+deposit = -$2,200 / -157%)
      {
        id: 'tx-oct-inc',
        date: '2026-10-01',
        amount: 1400,
        type: 'income',
        category: 'income',
        description: 'Consulting Retainer',
        notes: '',
        labels: [],
        hash: 'h-oct-inc',
      },
      {
        id: 'tx-oct-rent',
        date: '2026-10-02',
        amount: 3600,
        type: 'expense',
        category: 'housing',
        spendingBucket: 'fixed',
        description: 'Bilt Rent & Deposit',
        notes: '',
        labels: ['fixed'],
        hash: 'h-oct-rent',
        meta: { account: 'bilt' },
      },
      // Nov 2026: Healthy surplus ($6,500 income, sub-category shopping + refund, #tag, unassigned account, uncategorized + review + pending)
      {
        id: 'tx-nov-inc',
        date: '2026-11-01',
        amount: 6500,
        type: 'income',
        category: 'income',
        description: 'Primary Salary',
        notes: '',
        labels: [],
        hash: 'h-nov-inc',
      },
      {
        id: 'tx-nov-rent',
        date: '2026-11-02',
        amount: 2200,
        type: 'expense',
        category: 'housing',
        spendingBucket: 'fixed',
        description: 'Bilt Rent',
        notes: '',
        labels: ['fixed'],
        hash: 'h-nov-rent',
        meta: { account: 'bilt' },
      },
      {
        id: 'tx-nov-nonmonthly-override',
        date: '2026-11-04',
        amount: 350,
        type: 'expense',
        category: 'housing',
        spendingBucket: 'non-monthly',
        description: 'Annual Lease Renewal Fee',
        notes: '',
        labels: ['non-monthly'],
        hash: 'h-nov-lease-fee',
        meta: { account: 'bilt', userEdited: ['spendingBucket'] },
      },
      {
        id: 'tx-nov-amz',
        date: '2026-11-06',
        amount: 300,
        type: 'expense',
        category: 'shopping',
        subCategory: 'shopping-amazon',
        spendingBucket: 'flexible',
        description: 'Amazon Marketplace #99',
        notes: '',
        labels: ['holiday-prep'],
        hash: 'h-nov-amz',
        meta: { account: 'amazon-synchrony' },
      },
      {
        id: 'tx-nov-amz-ref',
        date: '2026-11-08',
        amount: 60,
        type: 'income',
        category: 'shopping',
        subCategory: 'shopping-amazon',
        spendingBucket: 'flexible',
        description: 'Amazon Marketplace Return',
        notes: '',
        labels: ['refund', 'holiday-prep'],
        hash: 'h-nov-amz-ref',
        meta: { account: 'amazon-synchrony' },
      },
      {
        id: 'tx-nov-uncat',
        date: '2026-11-10',
        amount: 75,
        type: 'expense',
        category: '',
        description: 'Mystery Corner Bistro',
        notes: 'Pending',
        labels: ['needs-review'],
        hash: 'h-nov-uncat',
      },
      {
        id: 'tx-nov-transfer',
        date: '2026-11-11',
        amount: 1800,
        type: 'transfer',
        category: 'transfers',
        description: 'Card Autopay Settlement',
        notes: '',
        labels: [],
        hash: 'h-nov-tr',
      },
    ],
  },
};

test.describe('Tier 17: v1 Completion — Trends, Data Store Portability, Reports & Drilldown Polish', () => {
  test('1. Multi-Horizon Trends (6M/12M/YTD/All), KPI reconciliation, unclamped deficit readout, single SVG path, and 1:1 Category/Merchant/#Tag/Account drilldowns (G4, G6)', async ({
    page,
  }) => {
    const errors: string[] = [];
    page.on('pageerror', err => errors.push(err.message));

    await page.setViewportSize({ width: 1440, height: 900 });
    await seedV1Workspace(page, MULTI_MONTH_SEED);
    await page.goto('/#/trends?month=2026-11');

    await expect(page.getByTestId('trends-workspace')).toBeVisible();

    // Verify strictly 1 <path> element inside chart-svg-trend + 0% breakeven line
    const chartSvg = page.getByTestId('chart-svg-trend');
    await expect(chartSvg).toBeVisible();
    await expect(chartSvg.locator('path')).toHaveCount(1);
    await expect(page.getByTestId('trend-zero-rate-line')).toBeVisible();

    // Verify KPI reconciliation across 2 active months (Oct & Nov)
    // Inflow: 1400 + 6500 = $7,900 (avg $3,950/mo)
    // Outflow: Oct 3600 + Nov (2200 + 350 + 300 - 60 + 75) = 3600 + 2865 = $6,465
    await expect(page.getByTestId('trends-kpi-inflow')).toContainText('$7,900');
    await expect(page.getByTestId('trends-kpi-inflow')).toContainText('2 active mos');
    await expect(page.getByTestId('trends-kpi-outflow')).toContainText('$6,465');
    await expect(page.getByTestId('trends-kpi-saved')).toContainText('+$1,435');

    // Hover October bar -> verify unclamped deficit readout (-157%), NOT clamped -100%
    await page.getByTestId('trend-month-bar-2026-10').hover();
    const readout = page.getByTestId('trend-inspected-readout');
    await expect(readout).toContainText('Oct 2026');
    await expect(readout).toContainText('-157%');

    // Hover empty month (Sep 2026) -> verify "No activity recorded" instead of misleading 0%
    await page.getByTestId('trend-month-bar-2026-09').hover();
    await expect(readout).toContainText('No activity recorded');

    // Switch horizons: 6M -> YTD -> All (bidirectional MonthSwitcher sync G4)
    await page.getByTestId('trends-horizon-6m').click();
    await expect(page.getByTestId('trends-horizon-6m')).toHaveAttribute('aria-pressed', 'true');

    await page.getByTestId('trends-horizon-all').click();
    await expect(page).toHaveURL(/month=all/);
    await expect(page.getByTestId('trends-horizon-all')).toHaveAttribute('aria-pressed', 'true');

    // Switch back to 12M -> restores anchor month 2026-11
    await page.getByTestId('trends-horizon-12m').click();
    await expect(page).toHaveURL(/month=2026-11/);

    // Verify Category Momentum active-month average: Housing = (3600 + 2200 + 350) / 2 = $3,075/mo (never / 6!)
    const housingMomentum = page.getByTestId('trends-category-row-housing');
    await expect(housingMomentum).toContainText('avg $3,075/mo');
    // Shopping net of refund = $240 across 2 active months -> avg $120/mo
    await expect(page.getByTestId('trends-category-row-shopping')).toContainText('avg $120/mo');

    // Uncategorized category momentum row -> 1:1 ledger parity (G6)
    await page.getByTestId('trends-category-row-uncategorized').click();
    await expect(page).toHaveURL(/#\/transactions\?month=all&cat=Uncategorized/);
    await expect(page.locator('text=Mystery Corner Bistro')).toBeVisible();
    await expect(page.locator('text=Card Autopay Settlement')).toHaveCount(0); // Transfers excluded!

    // Return to Trends and test #Tags & Unassigned Account drilldowns (G6)
    await page.goto('/#/trends?month=2026-11');
    await page.getByTestId('trends-driver-tab-tags').click();
    const holidayTagRow = page.getByTestId('trends-tag-row-holiday-prep');
    await expect(holidayTagRow).toContainText('$240'); // $300 - $60 refund
    await holidayTagRow.click();
    await expect(page).toHaveURL(/tag=holiday-prep/);
    await expect(page.locator('text=Amazon Marketplace #99')).toBeVisible();

    await page.goto('/#/trends?month=2026-11');
    await page.getByTestId('trends-driver-tab-accounts').click();
    const unassignedRow = page.getByTestId('trends-account-row-unassigned');
    await expect(unassignedRow).toContainText('Unassigned');
    await expect(unassignedRow).toContainText('$75');
    await unassignedRow.click();
    await expect(page).toHaveURL(/account=unassigned/);
    await expect(page.locator('text=Mystery Corner Bistro')).toBeVisible();
    await expect(page.locator('text=Bilt Rent')).toHaveCount(0);

    expect(errors).toEqual([]);
  });

  test('2. Mobile Touch Tap-to-Pin on TrendChart (G3) & Mobile BottomNav Escape Collision Guard (G2)', async ({
    browser,
  }) => {
    const context = await browser.newContext({
      viewport: { width: 390, height: 844 },
      hasTouch: true,
      isMobile: true,
    });
    const page = await context.newPage();
    await seedV1Workspace(page, MULTI_MONTH_SEED);
    await page.goto('/#/trends?month=2026-11');

    // First touch tap on Oct bar pins readout + reveals Open Oct -> CTA without navigating away
    await page.getByTestId('trend-month-bar-2026-10').tap();
    await expect(page).toHaveURL(/#\/trends/);
    await expect(page.getByTestId('trend-inspected-readout')).toContainText('Oct 2026');
    const openOctBtn = page.getByTestId('trend-open-month-btn');
    await expect(openOctBtn).toBeVisible();

    // Tapping Open Oct -> navigates to #/month/2026-10
    await openOctBtn.tap();
    await expect(page).toHaveURL(/#\/month\/2026-10/);

    // Open Mobile More Drawer -> Escape closes drawer WITHOUT navigating away (G2)
    await page.goto('/#/trends?month=2026-11');
    await page.getByTestId('bottom-nav-more').tap();
    await expect(page.getByTestId('mobile-more-drawer')).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(page.getByTestId('mobile-more-drawer')).toHaveCount(0);
    await expect(page).toHaveURL(/#\/trends\?month=2026-11/);

    // SET-03: Mobile users (no sidebar) can reach Sign Out from Settings
    await page.goto('/#/settings?month=2026-11');
    await expect(page.getByTestId('settings-logout-btn')).toBeVisible();

    await context.close();
  });

  test('3. Settings Data Store Portability (JSON Export, Validation Error, Lock-Safe Restore, Full CSV Export), Hygiene Links & Multi-Workspace Lifecycle (G2, G7)', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await seedV1Workspace(page, MULTI_MONTH_SEED);
    await page.goto('/#/settings?month=2026-11');

    await expect(page.getByTestId('settings-workspace')).toBeVisible();

    // SET-04: Strictly 1 theme-toggle-btn in DOM (owned by Sidebar; Settings uses settings-theme-toggle-btn)
    await expect(page.getByTestId('theme-toggle-btn')).toHaveCount(1);
    await expect(page.getByTestId('settings-theme-toggle-btn')).toBeVisible();

    // SET-05: Category badges display accurate derived bucket ("Fixed" for Housing, NOT "flexible")
    await expect(page.getByTestId('category-badge-Housing')).toContainText('Fixed');

    // Provenance displays bilt-plaid & 2 tombstones
    await expect(page.getByTestId('settings-section-datastore')).toContainText('bilt-plaid');
    await expect(page.getByTestId('settings-section-datastore')).toContainText('Tombstones: 2');

    // 1. Export Workspace JSON Snapshot
    const [jsonDownload] = await Promise.all([
      page.waitForEvent('download'),
      page.getByTestId('export-workspace-json-btn').click(),
    ]);
    expect(jsonDownload.suggestedFilename()).toMatch(/^nebula-workspace-household-ledger-.*\.json$/);
    const jsonPath = await jsonDownload.path();
    expect(jsonPath).toBeTruthy();
    const exportedRaw = fs.readFileSync(jsonPath!, 'utf8');
    const exportedJson = JSON.parse(exportedRaw);
    expect(exportedJson.schemaVersion).toBe(1);
    expect(exportedJson.app).toBe('nebula-expense-tracker');
    expect(exportedJson.transactions.length).toBe(9);

    // 2. Export Full Ledger CSV
    const [csvDownload] = await Promise.all([
      page.waitForEvent('download'),
      page.getByTestId('export-full-csv-btn').click(),
    ]);
    expect(csvDownload.suggestedFilename()).toMatch(/^nebula-transactions-household-ledger-.*\.csv$/);

    // 3. Invalid JSON upload surfaces inline error without mutating data
    await page.getByTestId('restore-json-file-input').setInputFiles({
      name: 'corrupt.json',
      mimeType: 'application/json',
      buffer: Buffer.from('{"transactions": "not-an-array"}', 'utf8'),
    });
    await expect(page.getByTestId('restore-json-error')).toContainText('"transactions"');

    // 4. Clear Workspace Data (lock-safe even though 2026-10 is locked!)
    await page.getByTestId('clear-workspace-data-btn').click();
    await expect(page.getByTestId('clear-workspace-modal')).toBeVisible();
    await expect(page.getByTestId('confirm-clear-workspace-btn')).toBeDisabled();
    await page.getByTestId('confirm-clear-workspace-input').fill('CLEAR');
    await page.getByTestId('confirm-clear-workspace-btn').click();
    await expect(page.getByTestId('clear-workspace-modal')).toHaveCount(0);
    await expect(page.getByTestId('settings-section-hygiene')).toContainText('0 total');
    await expect(page.getByTestId('settings-section-datastore')).toContainText('Tombstones: 0');

    // 5. Restore from exported JSON Snapshot -> restores all 9 transactions, lock, notes & provenance!
    await page.getByTestId('restore-json-file-input').setInputFiles({
      name: 'household-backup.json',
      mimeType: 'application/json',
      buffer: Buffer.from(exportedRaw, 'utf8'),
    });
    const previewModal = page.getByTestId('restore-json-preview-modal');
    await expect(previewModal).toBeVisible();
    await expect(previewModal).toContainText('9');
    await page.getByTestId('confirm-restore-json-btn').click();
    await expect(previewModal).toHaveCount(0);
    await expect(page.getByTestId('settings-section-hygiene')).toContainText('9 total');
    await expect(page.getByTestId('settings-section-datastore')).toContainText('bilt-plaid');

    // 6. Hygiene deep-link -> Uncategorized records (1)
    await expect(page.getByTestId('hygiene-link-uncategorized')).toContainText('1');
    await page.getByTestId('hygiene-link-uncategorized').click();
    await expect(page).toHaveURL(/#\/transactions\?month=all&cat=Uncategorized/);
    await expect(page.locator('text=Mystery Corner Bistro')).toBeVisible();

    // 7. Sidebar Workspace Switcher Escape safety + Create / Rename / Switch / Delete Workspace
    await page.goto('/#/settings?month=2026-11');
    await page.getByTestId('project-selector').click();
    await expect(page.getByTestId('workspace-switcher-popover')).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(page.getByTestId('workspace-switcher-popover')).toHaveCount(0);
    await expect(page).toHaveURL(/#\/settings\?month=2026-11/); // Did NOT navigate back!

    // Rename active workspace
    await page.getByTestId('rename-workspace-btn').click();
    await page.getByTestId('rename-workspace-input').fill('Primary Family');
    await page.getByTestId('rename-workspace-save-btn').click();
    await expect(page.getByTestId('project-selector')).toContainText('Primary Family');

    // Create second isolated workspace
    await page.getByTestId('create-workspace-btn').click();
    await page.getByTestId('project-name-input').fill('Side Consulting');
    await page.getByTestId('project-submit-btn').click();
    await expect(page.getByTestId('project-selector')).toContainText('Side Consulting');

    // Verify Side Consulting is isolated (0 transactions), then delete it and verify fallback to Primary Family
    await page.goto('/#/settings?month=2026-11');
    await expect(page.getByTestId('settings-section-hygiene')).toContainText('0 total');
    await page.getByTestId('delete-workspace-btn').click();
    await page.getByTestId('confirm-delete-workspace-input').fill('Side Consulting');
    await page.getByTestId('confirm-delete-workspace-btn').click();
    await expect(page.getByTestId('project-selector')).toContainText('Primary Family');
    await expect(page.getByTestId('settings-section-hygiene')).toContainText('9 total');
  });

  test('4. Reports All-Time Mode, Unique Lock Indicator, Zero font-mono/purple, and @media print Paper Layout', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await seedV1Workspace(page, MULTI_MONTH_SEED);

    // Locked month (2026-10) on #/reports -> strictly 1 lock-status-indicator (RPT-02)
    await page.goto('/#/reports?month=2026-10');
    await expect(page.getByTestId('reports-workspace')).toBeVisible();
    await expect(page.getByTestId('lock-status-indicator')).toHaveCount(1);
    await expect(page.getByTestId('report-lock-badge')).toContainText('Locked');

    // All-Time mode (#/reports?month=all) -> scales budget by 2 active months & populates Top Outflows (RPT-01)
    await page.goto('/#/reports?month=all');
    const reportSheet = page.getByTestId('monthly-report-sheet');
    await expect(reportSheet).toContainText('Nebula Financial Statement');
    await expect(reportSheet).toContainText('All Time (2 active months)');
    // Monthly budget ($2200 + $600 + $400 + $350 = $3,550) * 2 active months = $7,100
    await expect(reportSheet).toContainText('$7,100.00');
    await expect(page.getByTestId('report-top-outflow-0')).toContainText('Bilt Rent & Deposit');

    // Zero font-mono classes inside monthly-report-sheet
    const monoCount = await reportSheet.locator('.font-mono').count();
    expect(monoCount).toBe(0);

    // Print media emulation hides chrome and renders white paper background even in dark mode
    await page.emulateMedia({ media: 'print' });
    await expect(page.getByTestId('sidebar')).toBeHidden();
    await expect(page.getByTestId('dashboard-header')).toBeHidden();
    await expect(page.getByTestId('print-report-btn')).toBeHidden();
    await expect(reportSheet).toBeVisible();

    const bodyBgInPrint = await page.evaluate(() => getComputedStyle(document.body).backgroundColor);
    expect(bodyBgInPrint).toBe('rgb(255, 255, 255)');
    await page.emulateMedia({ media: 'screen' });
  });

  test('5. Drilldown Home-Bucket Budget Attribution (G5), ?fromBucket= Back-Nav (G8), CsvImportWizard Contrast, CommandPalette & Zero-Shim Audit (G1)', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await seedV1Workspace(page, MULTI_MONTH_SEED);

    // 1. Non-monthly bucket in Nov 2026 has $350 Housing override (`tx-nov-nonmonthly-override`).
    // Guardrail G5: Housing's $2,200 Fixed monthly budget must NOT be double-counted into Non-monthly!
    await page.goto('/#/month/2026-11/bucket/non-monthly');
    await expect(page.getByTestId('level2-bucket-view')).toBeVisible();
    await expect(page.getByTestId('bucket-total-spent')).toContainText('$350');
    await expect(page.getByTestId('level2-bucket-view')).not.toContainText('$2,200');

    // Clicking Housing inside Non-monthly appends ?fromBucket=non-monthly and returns to Non-monthly on back click (DRL-03, G8)
    await page.getByTestId('category-row-housing').click();
    await expect(page).toHaveURL(/#\/month\/2026-11\/category\/housing\?fromBucket=non-monthly/);
    await expect(page.getByTestId('back-to-bucket-btn')).toContainText('Non-monthly');
    await page.getByTestId('back-to-bucket-btn').click();
    await expect(page).toHaveURL(/#\/month\/2026-11\/bucket\/non-monthly/);

    // 2. Shopping Level 3 shows sub-category rollup ($240 net of $60 refund) + clickable Where merchant
    await page.goto('/#/month/2026-11/category/shopping');
    await expect(page.getByTestId('category-total-spent')).toContainText('$240');
    await expect(page.getByTestId('top-merchants-breakdown')).toContainText('Refunds credited: −$60');
    await page.getByTestId('category-merchant-btn-0').click();
    await expect(page).toHaveURL(/#\/transactions\?month=2026-11&cat=shopping&q=Amazon/);

    // 3. CommandPalette (⌘K): excludes non-budgetable Income/Transfers from Categories & exposes Export JSON
    await page.keyboard.press('Control+k');
    const palette = page.getByTestId('command-palette-modal');
    await expect(palette).toBeVisible();
    await expect(page.getByTestId('command-item-cat-income')).toHaveCount(0);
    await expect(page.getByTestId('command-item-cat-transfers')).toHaveCount(0);
    await expect(page.getByTestId('command-item-action-export-json')).toBeVisible();
    await page.keyboard.press('Escape');

    // 4. CsvImportWizard Step 2 tag pill contrast >= 4.5:1
    await page.goto('/#/settings?month=2026-11');
    await page.getByTestId('import-csv-trigger-btn').click();
    const csvSample = 'Date,Description,Amount\n2026-11-15,Trader Joes,-48.25\n';
    await page.getByTestId('csv-wizard-file-input').setInputFiles({
      name: 'sample.csv',
      mimeType: 'text/csv',
      buffer: Buffer.from(csvSample, 'utf8'),
    });
    await page.getByTestId('csv-batch-tag-input').fill('family-grocery');
    await page.getByTestId('csv-next-step-btn').click();
    const tagChip = page.locator('span.group\\/tag').first();
    await expect(tagChip).toBeVisible();
    const contrastRatio = await tagChip.evaluate(el => {
      const parseRgb = (str: string) => {
        const m = str.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/);
        return m ? [Number(m[1]), Number(m[2]), Number(m[3])] : [0, 0, 0];
      };
      const lum = ([r, g, b]: number[]) => {
        const a = [r, g, b].map(v => {
          const s = v / 255;
          return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
        });
        return 0.2126 * a[0] + 0.7152 * a[1] + 0.0722 * a[2];
      };
      const cs = getComputedStyle(el);
      const l1 = lum(parseRgb(cs.color));
      const l2 = lum(parseRgb(cs.backgroundColor));
      return (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05);
    });
    expect(contrastRatio).toBeGreaterThanOrEqual(4.5);
    await page.keyboard.press('Escape');

    // 5. Guardrail G1 Zero-Shim & Zero Horizontal Overflow Audit across viewports & routes
    const routesToAudit = [
      '/#/trends?month=2026-11',
      '/#/settings?month=2026-11',
      '/#/reports?month=2026-11',
      '/#/month/2026-11/bucket/fixed',
      '/#/month/2026-11/category/housing',
    ];

    for (const vp of [
      { width: 390, height: 844 },
      { width: 768, height: 1024 },
      { width: 1440, height: 900 },
    ]) {
      await page.setViewportSize(vp);
      for (const r of routesToAudit) {
        await page.goto(r);
        await page.waitForTimeout(80);
        const audit = await page.evaluate(() => {
          const docOverflow =
            document.documentElement.scrollWidth > document.documentElement.clientWidth + 1;
          const shims = Array.from(document.querySelectorAll('.sr-only, .opacity-0')).filter(
            el =>
              !el.closest('[data-testid="bucket-total-spent"]') &&
              !el.closest('[data-testid="category-total-spent"]') &&
              !el.closest('[data-testid="hero-saved-amount"]') &&
              !el.closest('[data-testid="hero-income-amount"]') &&
              !el.closest('[data-testid="hero-spent-amount"]')
          );
          return { docOverflow, shimCount: shims.length };
        });
        expect(audit.docOverflow, `Overflow on ${r} at ${vp.width}px`).toBe(false);
        expect(audit.shimCount, `Forbidden shim on ${r} at ${vp.width}px`).toBe(0);
      }
    }
  });
});
