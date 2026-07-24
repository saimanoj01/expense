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

test.describe('Tier 9: Negative CSV Amounts Mapped to Transfers', () => {
  let appPage: AppPage;

  test.beforeEach(async ({ page }) => {
    appPage = new AppPage(page);
    await preseedMockData(page, {
      mockSession: 'true',
      projects: [{ id: 'p1', name: 'CSV Test Project' }],
      activeProjectId: 'p1',
      transactions: { p1: [] }
    });
    await appPage.goto();
  });

  test('Uploading a CSV with negative amounts defaults to Transfer type and converts to positive figure', async ({ page }) => {
    // Set file input content directly
    const csvContent = 'Date,Description,Amount\n2026-07-01,External Transfer Payment,-150.25\n';
    await page.getByTestId('csv-file-input').setInputFiles({
      name: 'statement.csv',
      mimeType: 'text/csv',
      buffer: Buffer.from(csvContent)
    });

    // Step 1: Click Next Step
    await page.click('button:has-text("Next Step")');

    // Step 2: Verify amount is positive $150.25 with Transfer select value
    const previewTable = page.getByTestId('csv-preview-table');
    await expect(previewTable).toContainText('$150.25');

    // Confirm that the type dropdown in preview table is selected to "transfer"
    const typeSelect = previewTable.getByRole('cell', { name: 'Transfer', exact: true }).getByRole('combobox');
    await expect(typeSelect).toHaveValue('transfer');
  });
});
