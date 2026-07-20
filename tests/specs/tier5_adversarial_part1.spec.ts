import { test, expect } from '@playwright/test';
import { AppPage } from '../pages/AppPage';
import { ProjectPage } from '../pages/ProjectPage';
import { DashboardPage } from '../pages/DashboardPage';

// Helper to pre-seed localStorage
const preseedMockData = async (page: any, data: {
  projects?: any[];
  activeProjectId?: string;
  transactions?: Record<string, any[]>;
  budgets?: Record<string, any[]>;
  locks?: Record<string, any[]>;
  theme?: string;
  mockSession?: string;
  googleToken?: string;
  corruptProjectsRaw?: string;
}) => {
  await page.addInitScript((seeded: typeof data) => {
    if (seeded.corruptProjectsRaw !== undefined) {
      window.localStorage.setItem('expense_projects', seeded.corruptProjectsRaw);
    } else if (seeded.projects) {
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
    if (seeded.googleToken) {
      window.localStorage.setItem('expense_google_token', seeded.googleToken);
    }
  }, data);
};

test.describe('Tier 5 Part 1: State Transitions, OAuth Edge Cases & Corruption Hardening', () => {
  let appPage: AppPage;
  let _projectPage: ProjectPage;
  let _dashboardPage: DashboardPage;

  test.beforeEach(async ({ page }) => {
    appPage = new AppPage(page);
    _projectPage = new ProjectPage(page);
    _dashboardPage = new DashboardPage(page);
    void _projectPage;
    void _dashboardPage;
  });

  test.describe('1. State Transitions & Remote Sync Edge Cases', () => {
    test.skip('1.1 Monthly Lock Email Report Timeout (HTTP 408) rolls back lock state and shows error toast', async ({ page }) => {
      await preseedMockData(page, {
        mockSession: 'true',
        projects: [{ id: 'p-lock', name: 'Lock Rollback Project' }],
        activeProjectId: 'p-lock',
        locks: {
          'p-lock': []
        }
      });

      // Intercept Gmail send endpoint returning HTTP 408 Request Timeout
      await page.route('**/gmail/v1/users/me/messages/send', async route => {
        await route.fulfill({
          status: 408,
          contentType: 'application/json',
          body: JSON.stringify({ error: 'Request Timeout' })
        });
      });

      await appPage.goto();
      await expect(page.getByTestId('dashboard-header')).toBeVisible();

      // Click lock month button
      const lockBtn = page.getByTestId('lock-month-btn');
      await lockBtn.click();

      // Should show rollback notification toast
      await expect(page.getByTestId('notification-toast')).toContainText('Lock failed: email report could not send');

      // Verify lock state rolled back in localStorage
      const locksRaw = await page.evaluate(() => window.localStorage.getItem('expense_locks_p-lock'));
      expect(locksRaw).not.toBeNull();
      const parsedLocks = JSON.parse(locksRaw!);
      expect(parsedLocks.some((l: any) => l.month === '2026-07' && l.locked === true)).toBe(false);
    });

    test.skip('1.2 Spreadsheet 404 missing cloud sheet renders Spreadsheet Not Found modal', async ({ page }) => {
      await preseedMockData(page, {
        mockSession: 'true',
        projects: [{ id: 'p-sheet404', name: 'Cloud Sheet Project', spreadsheetId: 'sheets-123' }],
        activeProjectId: 'p-sheet404'
      });

      await page.route('**/spreadsheets/sheets-123', async route => {
        await route.fulfill({
          status: 404,
          contentType: 'application/json',
          body: JSON.stringify({ error: 'Not Found' })
        });
      });

      await appPage.goto();
      await expect(page.getByTestId('spreadsheet-not-found-modal')).toBeVisible();
      await expect(page.getByTestId('spreadsheet-not-found-modal')).toContainText('Spreadsheet Not Found');
    });

    test.skip('1.3 Remote Metadata Version Conflict renders Conflict Detected modal', async ({ page }) => {
      await preseedMockData(page, {
        mockSession: 'true',
        projects: [{ id: 'p-conflict', name: 'Versioned Project', version: 1 }],
        activeProjectId: 'p-conflict'
      });

      await page.route('**/metadata/p-conflict', async route => {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ version: 2 })
        });
      });

      await appPage.goto();
      await expect(page.getByTestId('conflict-modal')).toBeVisible();
      await expect(page.getByTestId('conflict-modal')).toContainText('Conflict Detected');
    });
  });

  test.describe('2. OAuth/Mock Mode Switching & Offline Edge Cases', () => {
    test('2.1 OAuth access_denied hash parameter triggers Access Denied toast', async ({ page }) => {
      await page.goto('/#error=access_denied');
      await expect(page.getByTestId('notification-toast')).toBeVisible();
      await expect(page.getByTestId('notification-toast')).toContainText('Access Denied');
    });

    test('2.2 Offline network mock login shows offline warning notification', async ({ page, context }) => {
      await appPage.goto();
      await context.setOffline(true);
      await appPage.loginAsMock();
      await expect(page.getByTestId('notification-toast')).toBeVisible();
      await expect(page.getByTestId('notification-toast')).toContainText('You are currently offline');
    });
  });

  test.describe('3. Concurrency & Data Corruption Resilience', () => {
    test('3.1 Corrupted JSON in expense_projects recovers cleanly and logs in Demo User session', async ({ page }) => {
      await preseedMockData(page, {
        corruptProjectsRaw: '{corrupt-json-data-that-is-not-valid'
      });
      await appPage.goto();

      // App should recover from corrupted JSON without crashing and render onboarding/dashboard
      await expect(page.locator('[data-testid="onboarding-modal"], [data-testid="dashboard-header"]')).toBeVisible();

      // Ensure expense_projects was reset to empty array
      const restoredProjects = await page.evaluate(() => window.localStorage.getItem('expense_projects'));
      expect(restoredProjects).toBe('[]');

      // Flag should indicate recovery occurred
      const flag = await page.evaluate(() => window.localStorage.getItem('expense_corrupt_recovered'));
      expect(flag).toBe('true');
    });

    test('3.2 Storage Quota Exceeded error during Save Budgets triggers read-only fallback toast', async ({ page }) => {
      await preseedMockData(page, {
        mockSession: 'true',
        projects: [{ id: 'p-quota', name: 'Quota Project' }],
        activeProjectId: 'p-quota',
        budgets: {
          'p-quota': [{ category: 'food', amount: 500 }]
        }
      });

      await appPage.goto();
      await expect(page.getByTestId('dashboard-header')).toBeVisible();

      // Override localStorage.setItem to throw QuotaExceededError specifically when expense_budgets_p-quota is written
      await page.evaluate(() => {
        const originalSetItem = window.localStorage.setItem.bind(window.localStorage);
        window.localStorage.setItem = (key: string, value: string) => {
          if (key.includes('expense_budgets_p-quota')) {
            const err = new Error('QuotaExceededError');
            err.name = 'QuotaExceededError';
            throw err;
          }
          return originalSetItem(key, value);
        };
      });

      const saveBtn = page.getByTestId('save-budgets-btn');
      await saveBtn.click();

      await expect(page.getByTestId('notification-toast')).toBeVisible();
      await expect(page.getByTestId('notification-toast')).toContainText('Storage quota exceeded. Session is now read-only.');
    });
  });
});
