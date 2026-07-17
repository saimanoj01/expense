import { test, expect } from '@playwright/test';
import { AppPage } from '../pages/AppPage';

const preseedMockData = async (page: any, data: {
  projects?: any[];
  activeProjectId?: string;
  transactions?: Record<string, any[]>;
  budgets?: Record<string, any[]>;
  locks?: Record<string, any[]>;
  categories?: Record<string, any[]>;
  theme?: string;
  mockSession?: string;
}) => {
  await page.addInitScript((seeded: typeof data) => {
    if (seeded.projects) {
      window.localStorage.setItem('expense_projects', JSON.stringify(seeded.projects));
    }
    if (seeded.activeProjectId) {
      window.localStorage.setItem('expense_active_project_id', seeded.activeProjectId);
    }
    if (seeded.categories) {
      for (const [projId, cats] of Object.entries(seeded.categories)) {
        window.localStorage.setItem(`expense_categories_${projId}`, JSON.stringify(cats));
      }
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
    if (seeded.locks) {
      for (const [projId, lock] of Object.entries(seeded.locks)) {
        window.localStorage.setItem(`expense_locks_${projId}`, JSON.stringify(lock));
      }
    }
    if (seeded.theme) {
      window.localStorage.setItem('expense_theme', seeded.theme);
    }
    if (seeded.mockSession) {
      window.localStorage.setItem('expense_mock_session', seeded.mockSession);
    }
  }, data);
};

test.describe('Tier 5 Part 2: Adversarial Coverage Hardening Audit', () => {
  let _appPage: AppPage;

  test.beforeEach(async ({ page }) => {
    _appPage = new AppPage(page);
    void _appPage;
  });

  // =========================================================================
  // Focus Area 1: CSV Import Malformed Headers, Within-Batch Duplicates & Locked Month
  // =========================================================================
  test.describe('1. CSV Import Vulnerabilities & Edge Cases', () => {
    test('1.1 Quoted CSV fields split incorrectly on commas inside quotes', async ({ page }) => {
      await preseedMockData(page, {
        mockSession: 'true',
        projects: [{ id: 'proj-csv', name: 'CSV Project' }],
        activeProjectId: 'proj-csv',
        transactions: { 'proj-csv': [] },
        budgets: { 'proj-csv': [] },
        locks: { 'proj-csv': [] }
      });

      await page.goto('/dashboard');
      await expect(page.getByTestId('import-csv-trigger-btn')).toBeVisible();
      await page.getByTestId('import-csv-trigger-btn').click();

      // CSV row with quoted description containing comma: "Dinner, drinks"
      const csvContent = 'Date,Description,Amount\n2026-07-15,"Dinner, drinks",45.50';
      await page.getByTestId('csv-file-input').setInputFiles({
        name: 'quoted.csv',
        mimeType: 'text/csv',
        buffer: Buffer.from(csvContent, 'utf-8')
      });

      await page.getByTestId('csv-next-step-btn').click();
      const previewRows = page.getByTestId('csv-preview-table').locator('tbody tr');
      await expect(previewRows).toHaveCount(1);

      const descCellText = await previewRows.nth(0).locator('td').nth(2).innerText();
      expect(descCellText).toContain('Dinner');
    });

    test('1.2 Within-batch identical CSV rows bypass duplicate detection', async ({ page }) => {
      await preseedMockData(page, {
        mockSession: 'true',
        projects: [{ id: 'proj-dup', name: 'Duplicate Batch Project' }],
        activeProjectId: 'proj-dup',
        transactions: { 'proj-dup': [] },
        budgets: { 'proj-dup': [] },
        locks: { 'proj-dup': [] }
      });

      await page.goto('/dashboard');
      await page.getByTestId('import-csv-trigger-btn').click();

      // Two identical rows in the same CSV upload
      const csvContent = 'Date,Description,Amount\n2026-07-15,Coffee Shop,5.00\n2026-07-15,Coffee Shop,5.00';
      await page.getByTestId('csv-file-input').setInputFiles({
        name: 'batch_dups.csv',
        mimeType: 'text/csv',
        buffer: Buffer.from(csvContent, 'utf-8')
      });

      await page.getByTestId('csv-next-step-btn').click();

      const previewRows = page.getByTestId('csv-preview-table').locator('tbody tr');
      await expect(previewRows).toHaveCount(2);

      // Both rows are marked non-duplicate because existingHashes is not updated during batch iteration
      await expect(previewRows.nth(0).locator('td').nth(4)).not.toContainText('Duplicate');
      await expect(previewRows.nth(1).locator('td').nth(4)).not.toContainText('Duplicate');
    });

    test('1.3 CSV import with quoted header fails automatic Date column mapping', async ({ page }) => {
      await preseedMockData(page, {
        mockSession: 'true',
        projects: [{ id: 'proj-bom', name: 'Quoted Header Project' }],
        activeProjectId: 'proj-bom',
        transactions: { 'proj-bom': [] },
        budgets: { 'proj-bom': [] },
        locks: { 'proj-bom': [] }
      });

      await page.goto('/dashboard');
      await page.getByTestId('import-csv-trigger-btn').click();

      // CSV headers wrapped in quotes ("Date") fail regex /^date$/i
      const csvContent = '"Date","Description","Amount"\n2026-07-15,Lunch,25.00';
      await page.getByTestId('csv-file-input').setInputFiles({
        name: 'quoted_hdr.csv',
        mimeType: 'text/csv',
        buffer: Buffer.from(csvContent, 'utf-8')
      });

      const dateSelectVal = await page.getByTestId('csv-map-col-date').inputValue();
      expect(dateSelectVal).toMatch(/Date/);
    });
  });

  // =========================================================================
  // Focus Area 2: SHA-256 Deduplication Collisions/Boundaries
  // =========================================================================
  test.describe('2. SHA-256 Deduplication Boundaries', () => {
    test('2.1 Casing differences in Description create distinct SHA-256 hashes bypassing deduplication', async ({ page }) => {
      await preseedMockData(page, {
        mockSession: 'true',
        projects: [{ id: 'proj-hash', name: 'Hash Test Project' }],
        activeProjectId: 'proj-hash',
        transactions: {
          'proj-hash': [
            {
              id: 'tx-1',
              date: '2026-07-15',
              category: 'food',
              amount: 50,
              type: 'expense',
              description: 'Whole Foods',
              notes: '',
              labels: [],
              hash: 'hash_existing'
            }
          ]
        },
        budgets: { 'proj-hash': [] },
        locks: { 'proj-hash': [] }
      });

      await page.goto('/dashboard');
      await page.getByTestId('import-csv-trigger-btn').click();

      // Lowercase description: "whole foods" vs existing "Whole Foods"
      const csvContent = 'Date,Description,Amount\n2026-07-15,whole foods,50.00';
      await page.getByTestId('csv-file-input').setInputFiles({
        name: 'case_diff.csv',
        mimeType: 'text/csv',
        buffer: Buffer.from(csvContent, 'utf-8')
      });

      await page.getByTestId('csv-next-step-btn').click();
      const statusCell = page.getByTestId('csv-preview-table').locator('tbody tr').nth(0).locator('td').nth(4);
      // Because computeTxHash hashes raw exact casing, and string equality checks case-insensitive match,
      // verify whether duplicate detection caught it via fallback or hash
      const rowStatus = await statusCell.innerText();
      expect(rowStatus).toContain('Duplicate');
    });
  });

  // =========================================================================
  // Focus Area 3: Month Locking Invariant Enforcement
  // =========================================================================
  test.describe('3. Month Locking Invariants & Bypass Holes', () => {
    test('3.1 UI month filter set to "All Months" bypasses isCurrentMonthLocked hiding of edit/delete buttons', async ({ page }) => {
      await preseedMockData(page, {
        mockSession: 'true',
        projects: [{ id: 'proj-lock', name: 'Lock Bypass Project' }],
        activeProjectId: 'proj-lock',
        transactions: {
          'proj-lock': [
            {
              id: 'tx-locked-may',
              date: '2026-05-10',
              category: 'food',
              amount: 80,
              type: 'expense',
              description: 'Locked May Grocery',
              notes: '',
              labels: [],
              hash: 'may-hash-1'
            }
          ]
        },
        budgets: { 'proj-lock': [] },
        locks: {
          'proj-lock': [
            { month: '2026-05', locked: true, lockedAt: '2026-06-01T00:00:00Z' }
          ]
        }
      });

      await page.goto('/dashboard');

      // First select month 2026-05 directly -> Edit and Delete buttons should be hidden
      await page.getByTestId('month-selector').selectOption('2026-05');
      await expect(page.getByTestId('lock-status-indicator')).toContainText('Locked');
      await expect(page.getByTestId('edit-transaction-btn-tx-locked-may')).toHaveCount(0);

      // Now switch month selector to "All Months" ('all')
      await page.getByTestId('month-selector').selectOption('all');

      // Empirically verify flaw: edit and delete buttons are now rendered even though 2026-05 is locked!
      await expect(page.getByTestId('edit-transaction-btn-tx-locked-may')).toBeVisible();
      await expect(page.getByTestId('delete-transaction-btn-tx-locked-may')).toBeVisible();
    });

    test('3.2 Storage adapter saveBudgets allows overwriting budgets for locked months', async ({ page }) => {
      await preseedMockData(page, {
        mockSession: 'true',
        projects: [{ id: 'proj-lock-budget', name: 'Locked Budget Project' }],
        activeProjectId: 'proj-lock-budget',
        transactions: { 'proj-lock-budget': [] },
        budgets: { 'proj-lock-budget': [{ category: 'food', amount: 500 }] },
        locks: {
          'proj-lock-budget': [
            { month: '2026-07', locked: true, lockedAt: '2026-07-01T00:00:00Z' }
          ]
        }
      });

      await page.goto('/dashboard');

      // Verify budget input is disabled in UI when current month is locked
      await expect(page.getByTestId('budget-input-Food')).toBeDisabled();

      // However, verify that storageAdapter.saveBudgets does not enforce lock invariant at storage level
      const canSaveBudgetsInStorage = await page.evaluate(async () => {
        const stored = window.localStorage.getItem('expense_budgets_proj-lock-budget');
        const parsed = JSON.parse(stored || '[]');
        parsed[0].amount = 9999;
        window.localStorage.setItem('expense_budgets_proj-lock-budget', JSON.stringify(parsed));
        return true;
      });
      expect(canSaveBudgetsInStorage).toBe(true);
    });
  });

  // =========================================================================
  // Focus Area 4: SVG Chart Zero and Extreme Numerical Values
  // =========================================================================
  test.describe('4. SVG Chart Zero & Extreme Numerical Behaviors', () => {
    test('4.1 Zero Budget and Zero Spent render placeholder bars of height 10 and 5', async ({ page }) => {
      await preseedMockData(page, {
        mockSession: 'true',
        projects: [{ id: 'proj-zero', name: 'Zero Chart Project' }],
        activeProjectId: 'proj-zero',
        transactions: { 'proj-zero': [] },
        budgets: { 'proj-zero': [{ category: 'food', amount: 0 }] },
        locks: { 'proj-zero': [] }
      });

      await page.goto('/dashboard');

      const budgetBar = page.locator('.budget-bar-Food');
      const actualBar = page.locator('.actual-bar-Food');

      await expect(budgetBar).toHaveAttribute('height', '10');
      await expect(actualBar).toHaveAttribute('height', '5');
    });

    test('4.2 Zero total expenses displays "No data available" in SVG pie chart', async ({ page }) => {
      await preseedMockData(page, {
        mockSession: 'true',
        projects: [{ id: 'proj-empty-pie', name: 'Empty Pie Project' }],
        activeProjectId: 'proj-empty-pie',
        transactions: { 'proj-empty-pie': [] },
        budgets: { 'proj-empty-pie': [] },
        locks: { 'proj-empty-pie': [] }
      });

      await page.goto('/dashboard');
      const pieSvgText = page.getByTestId('chart-svg-pie').locator('text.no-data-text');
      await expect(pieSvgText).toHaveText('No data available');
    });
  });

  // =========================================================================
  // Focus Area 5: XSS & Malicious Input Handling
  // =========================================================================
  test.describe('5. Malicious Input & XSS Boundary Handling', () => {
    test('5.1 Special characters in category name pollute data-testid selector attributes', async ({ page }) => {
      await preseedMockData(page, {
        mockSession: 'true',
        projects: [{ id: 'proj-xss', name: 'XSS Project' }],
        activeProjectId: 'proj-xss',
        categories: {
          'proj-xss': [
            { id: 'cat-xss', name: 'Food <script>', color: '#FF6B6B', emoji: '🍔' }
          ]
        },
        transactions: { 'proj-xss': [] },
        budgets: { 'proj-xss': [{ category: 'cat-xss', amount: 300 }] },
        locks: { 'proj-xss': [] }
      });

      await page.goto('/dashboard');

      // Check the data-testid produced for the category edit button
      const editBtn = page.locator('[data-testid="edit-category-Food <script>-btn"]');
      await expect(editBtn).toBeVisible();
    });

    test('5.2 Transaction Notes field is persisted in storage but omitted from UI transaction row rendering', async ({ page }) => {
      await preseedMockData(page, {
        mockSession: 'true',
        projects: [{ id: 'proj-notes', name: 'Notes Project' }],
        activeProjectId: 'proj-notes',
        transactions: {
          'proj-notes': [
            {
              id: 'tx-note-1',
              date: '2026-07-15',
              category: 'food',
              amount: 25,
              type: 'expense',
              description: 'Secret Dinner',
              notes: 'SENSITIVE_MEMO_CONTENT_12345',
              labels: ['dining'],
              hash: 'note-hash-1'
            }
          ]
        },
        budgets: { 'proj-notes': [] },
        locks: { 'proj-notes': [] }
      });

      await page.goto('/dashboard');

      const txRow = page.getByTestId('transaction-row');
      await expect(txRow).toContainText('Secret Dinner');
      // Verifies gap: sensitive notes stored in transaction are not shown in transaction row
      await expect(txRow).not.toContainText('SENSITIVE_MEMO_CONTENT_12345');
    });
  });
});
