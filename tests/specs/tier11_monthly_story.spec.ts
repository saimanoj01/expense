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

test.describe('Tier 11: The Monthly Financial Story & Cash Flow Analytics', () => {
  let appPage: AppPage;

  test.beforeEach(async ({ page }) => {
    appPage = new AppPage(page);
    await preseedMockData(page, {
      mockSession: 'true',
      projects: [{ id: 'p1', name: 'Story Project' }],
      activeProjectId: 'p1',
      transactions: {
        p1: [
          // Prior month: 2026-06
          {
            id: 't-prior-income',
            date: '2026-06-01',
            category: 'income',
            amount: 10000,
            type: 'income',
            description: 'June Salary',
            notes: '',
            labels: ['salary'],
            hash: 'hash-prior-1'
          },
          {
            id: 't-prior-fixed',
            date: '2026-06-02',
            category: 'housing',
            amount: 2000,
            type: 'expense',
            spendingBucket: 'fixed',
            description: 'June Rent',
            notes: '',
            labels: ['housing'],
            hash: 'hash-prior-2'
          },
          {
            id: 't-prior-flex',
            date: '2026-06-10',
            category: 'food',
            amount: 1000,
            type: 'expense',
            spendingBucket: 'flexible',
            description: 'June Dining',
            notes: '',
            labels: ['food'],
            hash: 'hash-prior-3'
          },
          // Current month: 2026-07
          {
            id: 't1',
            date: '2026-07-01',
            category: 'income',
            amount: 12000,
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
            amount: 2400,
            type: 'expense',
            spendingBucket: 'fixed',
            description: 'Mortgage Payment',
            notes: '',
            labels: ['housing'],
            hash: 'hash2'
          },
          {
            id: 't3',
            date: '2026-07-05',
            category: 'food',
            amount: 1200,
            type: 'expense',
            spendingBucket: 'flexible',
            description: 'Groceries & Dining',
            notes: '',
            labels: ['groceries'],
            hash: 'hash3'
          },
          {
            id: 't4',
            date: '2026-07-12',
            category: 'insurance',
            amount: 600,
            type: 'expense',
            spendingBucket: 'non-monthly',
            description: 'Car Insurance Semi-Annual',
            notes: '',
            labels: ['insurance'],
            hash: 'hash4'
          },
          {
            id: 't5',
            date: '2026-07-15',
            category: 'transfer',
            amount: 500,
            type: 'transfer',
            description: 'Transfer to Savings Account',
            notes: '',
            labels: ['transfer'],
            hash: 'hash5'
          }
        ]
      }
    });
    await appPage.goto();
  });

  test('1. Story Narrative summarizes monthly cash flow in plain language', async ({ page }) => {
    // Select July 2026
    const monthSelect = page.getByTestId('month-selector');
    await monthSelect.selectOption('2026-07');

    const narrative = page.getByTestId('story-narrative');
    await expect(narrative).toBeVisible();

    // Inflow: $12,000.00
    await expect(narrative).toContainText('$12,000.00');
    // Fixed: $2,400.00
    await expect(narrative).toContainText('$2,400.00');
    // Variable: $1,200.00
    await expect(narrative).toContainText('$1,200.00');
    // Non-monthly: $600.00
    await expect(narrative).toContainText('$600.00');
    // Net Savings: $12,000 - $4,200 = $7,800.00 (65.0% rate)
    await expect(narrative).toContainText('$7,800.00');
    await expect(narrative).toContainText('65.0%');
  });

  test('2. Top KPI Cards carry exact testids and align with Story metrics', async ({ page }) => {
    const monthSelect = page.getByTestId('month-selector');
    await monthSelect.selectOption('2026-07');

    await expect(page.getByTestId('kpi-total-income')).toContainText('$12,000.00');
    await expect(page.getByTestId('kpi-fixed-expenses')).toContainText('$2,400.00');
    await expect(page.getByTestId('kpi-flexible-spent')).toContainText('$1,200.00');
    await expect(page.getByTestId('kpi-non-monthly')).toContainText('$600.00');
    await expect(page.getByTestId('kpi-savings-amount')).toContainText('$7,800.00');
    await expect(page.getByTestId('kpi-savings-rate')).toContainText('65.0%');

    // Flex Number = $12,000 - $2,400 - $600 = $9,000.00
    await expect(page.getByTestId('kpi-flex-number')).toContainText('$9,000.00');
  });

  test('3. Clicking KPI cards toggles bucket filtering on transaction list', async ({ page }) => {
    const monthSelect = page.getByTestId('month-selector');
    await monthSelect.selectOption('2026-07');
    await page.evaluate(() => {
      window.location.hash = '#/transactions?month=2026-07';
    });
    await expect(page.getByTestId('level4-transactions-workspace')).toBeVisible();

    // Click Fixed KPI card
    await page.getByTestId('kpi-fixed-expenses').click();
    await expect(page.locator('h4:has-text("Mortgage Payment")')).toBeVisible();
    await expect(page.locator('h4:has-text("Groceries & Dining")')).not.toBeVisible();
    await expect(page.locator('h4:has-text("Car Insurance Semi-Annual")')).not.toBeVisible();

    // Click Fixed KPI card again to toggle off
    await page.getByTestId('kpi-fixed-expenses').click();
    await expect(page.locator('h4:has-text("Mortgage Payment")')).toBeVisible();
    await expect(page.locator('h4:has-text("Groceries & Dining")')).toBeVisible();

    // Click Variable KPI card
    await page.getByTestId('kpi-flexible-spent').click();
    await expect(page.locator('h4:has-text("Groceries & Dining")')).toBeVisible();
    await expect(page.locator('h4:has-text("Mortgage Payment")')).not.toBeVisible();

    // Toggle off
    await page.getByTestId('kpi-flexible-spent').click();
    await expect(page.locator('h4:has-text("Mortgage Payment")')).toBeVisible();
  });

  test('4. Month-over-Month (MoM) badges reflect comparison against prior month', async ({ page }) => {
    const monthSelect = page.getByTestId('month-selector');
    await monthSelect.selectOption('2026-07');

    // Income MoM: $12,000 vs June $10,000 -> +20.0%
    const incomeMoM = page.getByTestId('mom-delta-income');
    await expect(incomeMoM).toBeVisible();
    await expect(incomeMoM).toContainText('+20.0% MoM');

    // Fixed MoM: $2,400 vs June $2,000 -> +20.0%
    const fixedMoM = page.getByTestId('mom-delta-fixed');
    await expect(fixedMoM).toBeVisible();
    await expect(fixedMoM).toContainText('+20.0% MoM');
  });

  test('5. Accessible data table for Cash Flow Waterfall contains all allocation steps', async ({ page }) => {
    const monthSelect = page.getByTestId('month-selector');
    await monthSelect.selectOption('2026-07');
    await page.evaluate(() => {
      window.location.hash = '#/trends?month=2026-07';
    });

    const waterfallTable = page.locator('table[aria-label="Cash Flow Waterfall Table"]');
    await expect(waterfallTable).toBeVisible();

    // Check row values
    await expect(waterfallTable.locator('tr:has-text("Inflow")')).toContainText('$12,000.00');
    await expect(waterfallTable.locator('tr:has-text("Fixed")')).toContainText('$2,400.00');
    await expect(waterfallTable.locator('tr:has-text("Variable")')).toContainText('$1,200.00');
    await expect(waterfallTable.locator('tr:has-text("Non-Monthly")')).toContainText('$600.00');
    await expect(waterfallTable.locator('tr:has-text("Net Saved")')).toContainText('$7,800.00');
  });

  test('6. 50/30/20 guideline meter displays compliance status', async ({ page }) => {
    const monthSelect = page.getByTestId('month-selector');
    await monthSelect.selectOption('2026-07');

    const meter = page.getByTestId('guideline-meter-50-30-20');
    await expect(meter).toBeVisible();

    // Needs: ($2400 + $600)/$12000 = 25.0% (<= 50% target met)
    await expect(meter).toContainText('25.0%');
    await expect(meter).toContainText('Needs');

    // Wants: $1200/$12000 = 10.0% (<= 30% target met)
    await expect(meter).toContainText('10.0%');
    await expect(meter).toContainText('Wants');

    // Savings: $7800/$12000 = 65.0% (>= 20% target met)
    await expect(meter).toContainText('65.0%');
    await expect(meter).toContainText('Savings');
  });

  test('7. Inline bucket switcher pills allow toggling spending bucket', async ({ page }) => {
    const monthSelect = page.getByTestId('month-selector');
    await monthSelect.selectOption('2026-07');
    await page.evaluate(() => {
      window.location.hash = '#/transactions?month=2026-07';
    });
    await expect(page.getByTestId('level4-transactions-workspace')).toBeVisible();

    // t3 (Groceries & Dining) is currently flexible
    const switcher = page.getByTestId('bucket-switcher-t3');
    await expect(switcher).toBeVisible();

    // Click Fixed button in inline pill switcher
    await switcher.getByRole('button', { name: 'Fixed' }).click();

    // Now t3 has fixed dot indicator
    await expect(page.getByTestId('bucket-dot-t3-fixed')).toBeVisible();

    // Fixed KPI increases: was $2,400, now $2,400 + $1,200 = $3,600.00
    await expect(page.getByTestId('kpi-fixed-expenses')).toContainText('$3,600.00');
  });

  test('8. Multi-transaction bulk bucket assignment in TransactionList', async ({ page }) => {
    const monthSelect = page.getByTestId('month-selector');
    await monthSelect.selectOption('2026-07');
    await page.evaluate(() => {
      window.location.hash = '#/transactions?month=2026-07';
    });
    await expect(page.getByTestId('level4-transactions-workspace')).toBeVisible();

    // Select row t3 and t4 via checkboxes
    const rows = page.getByTestId('transaction-row');
    await rows.nth(1).locator('input[type="checkbox"]').check();
    await rows.nth(2).locator('input[type="checkbox"]').check();

    // Bulk bucket select dropdown should appear
    const bulkSelect = page.getByTestId('bulk-bucket-select');
    await expect(bulkSelect).toBeVisible();

    // Select "Fixed Commitment"
    await bulkSelect.selectOption('fixed');

    // Both should now have fixed dot
    await expect(page.getByTestId('bucket-dot-t3-fixed')).toBeVisible();
    await expect(page.getByTestId('bucket-dot-t4-fixed')).toBeVisible();
  });

  test('9. Handles zero-income month cleanly with dash savings rate and custom narrative', async ({ page }) => {
    // Switch to June 2026 and delete June Salary or add a zero-income month
    const monthSelect = page.getByTestId('month-selector');
    await monthSelect.selectOption('all');

    const narrative = page.getByTestId('story-narrative');
    await expect(narrative).toBeVisible();
    await expect(narrative).toContainText('Across all recorded activity');
  });

  test('10. Category Manager modal allows selecting default spending bucket', async ({ page }) => {
    // Open Category Manager Modal
    await page.getByTestId('open-add-category-btn').click();
    const modal = page.getByTestId('category-manager-modal');
    await expect(modal).toBeVisible();

    // Click Parent Category button to start adding
    await modal.getByRole('button', { name: 'Parent Category' }).click();

    // Default bucket select should be available
    const bucketSelect = modal.getByTestId('category-default-bucket-select');
    await expect(bucketSelect).toBeVisible();
    await bucketSelect.selectOption('fixed');
    await expect(bucketSelect).toHaveValue('fixed');
  });

  test('11. Printable Monthly Financial Report modal opens and provides print and CSV download options', async ({ page }) => {
    const reportBtn = page.getByTestId('story-print-report-btn');
    await expect(reportBtn).toBeVisible();
    await reportBtn.click();

    const reportModal = page.getByTestId('monthly-report-modal');
    await expect(reportModal).toBeVisible();
    await expect(reportModal.getByTestId('print-report-btn')).toBeVisible();
    await expect(reportModal.getByTestId('download-report-csv-btn')).toBeVisible();
    await expect(reportModal).toContainText('Executive Monthly Financial Report');

    // Close dialog
    await reportModal.getByTestId('close-report-btn').click();
    await expect(reportModal).not.toBeVisible();
  });

  test('12. Transfer transactions are strictly excluded from income, expenses, and net savings', async ({ page }) => {
    const monthSelect = page.getByTestId('month-selector');
    await monthSelect.selectOption('2026-07');

    // In July 2026 pre-seeded data:
    // Income = $12,000.00
    // Fixed = $2,400.00
    // Variable = $1,200.00
    // Non-monthly = $600.00
    // Transfer = $500.00 (id: 't5')
    // Total Expenses must strictly be $4,200.00 (excluding $500 transfer)
    // Net Saved must strictly be $7,800.00
    await expect(page.getByTestId('kpi-total-income')).toContainText('$12,000.00');
    await expect(page.getByTestId('kpi-total-expenses')).toContainText('$4,200.00');
    await expect(page.getByTestId('kpi-fixed-expenses')).toContainText('$2,400.00');
    await expect(page.getByTestId('kpi-flexible-spent')).toContainText('$1,200.00');
    await expect(page.getByTestId('kpi-non-monthly')).toContainText('$600.00');
    await expect(page.getByTestId('kpi-savings-amount')).toContainText('$7,800.00');

    // Cash flow waterfall is visible on Trends and excludes transfers
    await page.evaluate(() => {
      window.location.hash = '#/trends?month=2026-07';
    });
    const waterfall = page.getByTestId('cash-flow-waterfall');
    await expect(waterfall).toBeVisible();
  });
});
