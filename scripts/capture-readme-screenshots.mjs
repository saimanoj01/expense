// Captures the screenshots used in README.md (docs/screenshots/).
// Usage: node scripts/capture-readme-screenshots.mjs
// Optional: CHROMIUM_PATH=/usr/bin/chromium to use a system Chromium.
import { chromium } from '@playwright/test';
import { spawn } from 'child_process';
import fs from 'fs';
import path from 'path';

const OUT = path.resolve(process.cwd(), 'docs/screenshots');
fs.mkdirSync(OUT, { recursive: true });

const SEED_DATA = {
  mockSession: 'true',
  projects: [{ id: 'proj-demo', name: 'Personal Finances' }],
  activeProjectId: 'proj-demo',
  categories: {
    'proj-demo': [
      { id: 'housing', name: 'Rent & Housing', emoji: '🏠', color: '#475569', defaultBucket: 'fixed' },
      { id: 'utilities', name: 'Utilities & Fiber', emoji: '⚡', color: '#64748B', defaultBucket: 'fixed' },
      { id: 'food', name: 'Food & Groceries', emoji: '🥗', color: '#0D9488', defaultBucket: 'flexible' },
      { id: 'dining', name: 'Dining & Coffee', emoji: '☕', color: '#14B8A6', defaultBucket: 'flexible' },
      { id: 'shopping', name: 'Shopping & Gear', emoji: '🛍️', color: '#0F766E', defaultBucket: 'flexible' },
      { id: 'travel', name: 'Travel & Flights', emoji: '✈️', color: '#D97706', defaultBucket: 'non-monthly' },
      { id: 'salary', name: 'Primary Income', emoji: '💰', color: '#16A34A', defaultBucket: 'fixed' },
    ],
  },
  budgets: {
    'proj-demo': [
      { category: 'housing', amount: 2200 },
      { category: 'utilities', amount: 220 },
      { category: 'food', amount: 650 },
      { category: 'dining', amount: 350 },
      { category: 'shopping', amount: 400 },
      { category: 'travel', amount: 600 },
    ],
  },
  transactions: {
    'proj-demo': [
      // October 2026 (Saved month: +$1,945 saved, 31% of $6,200 income)
      { id: 'oct-1', date: '2026-10-01', category: 'salary', amount: 6200, type: 'income', description: 'Monthly Payroll Deposit', meta: { account: 'manoj bofa' }, labels: [] },
      { id: 'oct-2', date: '2026-10-02', category: 'housing', amount: 2200, type: 'expense', description: 'Apartment Lease Payment', spendingBucket: 'fixed', meta: { account: 'bilt' }, labels: [] },
      { id: 'oct-3', date: '2026-10-04', category: 'utilities', amount: 185, type: 'expense', description: 'ConEdison & Fiber Internet', spendingBucket: 'fixed', meta: { account: 'priyanka chase' }, labels: [] },
      { id: 'oct-4', date: '2026-10-06', category: 'food', amount: 164, type: 'expense', description: 'Trader Joes Weekly Run', spendingBucket: 'flexible', meta: { account: 'bilt' }, labels: [] },
      { id: 'oct-5', date: '2026-10-09', category: 'dining', amount: 78, type: 'expense', description: 'Blue Bottle & Bistro Dinner', spendingBucket: 'flexible', meta: { account: 'bilt' }, labels: [] },
      { id: 'oct-6', date: '2026-10-12', category: 'food', amount: 192, type: 'expense', description: 'Whole Foods Market', spendingBucket: 'flexible', meta: { account: 'bilt' }, labels: [] },
      { id: 'oct-7', date: '2026-10-15', category: 'travel', amount: 540, type: 'expense', description: 'Delta Airlines Autumn Trip', spendingBucket: 'non-monthly', meta: { account: 'bofa atmos' }, labels: ['autumn-trip'] },
      { id: 'oct-8', date: '2026-10-18', category: 'shopping', amount: 310, type: 'expense', description: 'Uniqlo & Home Office Lamp', spendingBucket: 'flexible', meta: { account: 'amazon store card' }, labels: [] },
      { id: 'oct-9', date: '2026-10-21', category: 'food', amount: 176, type: 'expense', description: 'Farmers Market & Butcher', spendingBucket: 'flexible', meta: { account: 'bilt' }, labels: [] },
      { id: 'oct-10', date: '2026-10-25', category: 'dining', amount: 115, type: 'expense', description: 'Saturday Sushi Night', spendingBucket: 'flexible', meta: { account: 'bilt' }, labels: [] },
      { id: 'oct-11', date: '2026-10-28', category: 'food', amount: 145, type: 'expense', description: 'Trader Joes Pantry Restock', spendingBucket: 'flexible', meta: { account: 'bilt' }, labels: [] },
      { id: 'oct-12', date: '2026-10-29', category: 'utilities', amount: 150, type: 'expense', description: 'Auto Insurance Installment', spendingBucket: 'non-monthly', meta: { account: 'priyanka chase' }, labels: ['annual'] },

      // September 2026 (Prior month comparison)
      { id: 'sep-1', date: '2026-09-01', category: 'salary', amount: 6200, type: 'income', description: 'Monthly Payroll Deposit', meta: { account: 'manoj bofa' }, labels: [] },
      { id: 'sep-2', date: '2026-09-02', category: 'housing', amount: 2200, type: 'expense', description: 'Apartment Lease Payment', spendingBucket: 'fixed', meta: { account: 'bilt' }, labels: [] },
      { id: 'sep-3', date: '2026-09-05', category: 'utilities', amount: 190, type: 'expense', description: 'Electric & Fiber', spendingBucket: 'fixed', meta: { account: 'priyanka chase' }, labels: [] },
      { id: 'sep-4', date: '2026-09-10', category: 'food', amount: 580, type: 'expense', description: 'September Groceries', spendingBucket: 'flexible', meta: { account: 'bilt' }, labels: [] },
      { id: 'sep-5', date: '2026-09-15', category: 'dining', amount: 290, type: 'expense', description: 'September Dining Out', spendingBucket: 'flexible', meta: { account: 'bilt' }, labels: [] },
      { id: 'sep-6', date: '2026-09-20', category: 'shopping', amount: 420, type: 'expense', description: 'Autumn Jacket & Shoes', spendingBucket: 'flexible', meta: { account: 'bilt' }, labels: [] },
      { id: 'sep-7', date: '2026-09-24', category: 'travel', amount: 310, type: 'expense', description: 'Amtrak Weekend Pass', spendingBucket: 'non-monthly', meta: { account: 'bofa atmos' }, labels: [] },

      // August 2026
      { id: 'aug-1', date: '2026-08-01', category: 'salary', amount: 6000, type: 'income', description: 'Monthly Payroll Deposit', meta: { account: 'manoj bofa' }, labels: [] },
      { id: 'aug-2', date: '2026-08-02', category: 'housing', amount: 2200, type: 'expense', description: 'Apartment Lease Payment', spendingBucket: 'fixed', meta: { account: 'bilt' }, labels: [] },
      { id: 'aug-3', date: '2026-08-12', category: 'food', amount: 610, type: 'expense', description: 'August Groceries', spendingBucket: 'flexible', meta: { account: 'bilt' }, labels: [] },
      { id: 'aug-4', date: '2026-08-19', category: 'travel', amount: 850, type: 'expense', description: 'Summer Lodge Booking', spendingBucket: 'non-monthly', meta: { account: 'bofa atmos' }, labels: ['summer-trip'] },

      // July 2026
      { id: 'jul-1', date: '2026-07-01', category: 'salary', amount: 6000, type: 'income', description: 'Monthly Payroll Deposit', meta: { account: 'manoj bofa' }, labels: [] },
      { id: 'jul-2', date: '2026-07-02', category: 'housing', amount: 2200, type: 'expense', description: 'Apartment Lease Payment', spendingBucket: 'fixed', meta: { account: 'bilt' }, labels: [] },
      { id: 'jul-3', date: '2026-07-14', category: 'food', amount: 590, type: 'expense', description: 'July Groceries', spendingBucket: 'flexible', meta: { account: 'bilt' }, labels: [] },
      { id: 'jul-4', date: '2026-07-22', category: 'dining', amount: 340, type: 'expense', description: 'Patio Dinners', spendingBucket: 'flexible', meta: { account: 'bilt' }, labels: [] },

      // June 2026 (Deficit month: Overspent -$680, -13% of $5,200 income)
      { id: 'jun-1', date: '2026-06-01', category: 'salary', amount: 5200, type: 'income', description: 'Monthly Payroll Deposit', meta: { account: 'manoj bofa' }, labels: [] },
      { id: 'jun-2', date: '2026-06-02', category: 'housing', amount: 2200, type: 'expense', description: 'Apartment Lease Payment', spendingBucket: 'fixed', meta: { account: 'bilt' }, labels: [] },
      { id: 'jun-3', date: '2026-06-05', category: 'utilities', amount: 210, type: 'expense', description: 'Summer AC & Fiber', spendingBucket: 'fixed', meta: { account: 'priyanka chase' }, labels: [] },
      { id: 'jun-4', date: '2026-06-10', category: 'travel', amount: 2150, type: 'expense', description: 'International Summer Flights & Hotel', spendingBucket: 'non-monthly', meta: { account: 'bofa atmos' }, labels: ['summer-trip'] },
      { id: 'jun-5', date: '2026-06-18', category: 'food', amount: 740, type: 'expense', description: 'June Groceries & Hosting', spendingBucket: 'flexible', meta: { account: 'bilt' }, labels: [] },
      { id: 'jun-6', date: '2026-06-24', category: 'shopping', amount: 580, type: 'expense', description: 'Luggage & Camera Lens', spendingBucket: 'flexible', meta: { account: 'amazon store card' }, labels: [] },
    ],
  },
};

async function waitForServer(url, timeoutMs = 20000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      const res = await fetch(url);
      if (res.ok) return;
    } catch {
      // retry
    }
    await new Promise(r => setTimeout(r, 300));
  }
  throw new Error(`Server at ${url} did not start within ${timeoutMs}ms`);
}

async function main() {
  const port = 4197;
  const baseUrl = `http://localhost:${port}`;
  const server = spawn('npx', ['vite', '--port', String(port), '--strictPort'], {
    cwd: process.cwd(),
    stdio: 'ignore',
  });

  try {
    await waitForServer(baseUrl);
    const browser = await chromium.launch(
      process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {}
    );
    try {
      const shoot = async ({ name, hash, theme = 'dark', width = 1440, height = 900, ready, action }) => {
        const context = await browser.newContext({
          viewport: { width, height },
          deviceScaleFactor: 2,
          colorScheme: theme,
        });
        const page = await context.newPage();
        page.on('pageerror', err => console.error(`PAGE ERROR (${name}):`, err.message));
        await page.addInitScript(({ seeded, theme }) => {
          if (window.sessionStorage.getItem('__seeded')) return;
          window.sessionStorage.setItem('__seeded', '1');
          window.localStorage.setItem('expense_mock_session', JSON.stringify({ email: 'demo@example.com', name: 'Demo User' }));
          window.localStorage.setItem('pref_mock_mode', 'true');
          window.localStorage.setItem('expense_theme', theme);
          window.localStorage.setItem('expense_projects', JSON.stringify(seeded.projects));
          window.localStorage.setItem('expense_active_project_id', seeded.activeProjectId);
          for (const [id, v] of Object.entries(seeded.transactions)) window.localStorage.setItem(`expense_txs_${id}`, JSON.stringify(v));
          for (const [id, v] of Object.entries(seeded.categories)) window.localStorage.setItem(`expense_categories_${id}`, JSON.stringify(v));
          for (const [id, v] of Object.entries(seeded.budgets)) window.localStorage.setItem(`expense_budgets_${id}`, JSON.stringify(v));
        }, { seeded: SEED_DATA, theme });
        await page.goto(`${baseUrl}/`);
        await page.waitForSelector('[data-testid="dashboard-header"]', { timeout: 15000 });
        await page.evaluate(h => { window.location.hash = h; }, hash);
        await page.waitForSelector(`[data-testid="${ready}"]`, { timeout: 10000 });
        await page.waitForTimeout(900);
        if (action) await action(page);
        await page.screenshot({ path: path.join(OUT, `${name}.png`) });
        console.log(`  ✓ ${name}.png`);
        await context.close();
      };

      await shoot({ name: 'overview-dark', hash: '#/month/2026-10', ready: 'hero-savings-card' });
      await shoot({ name: 'overview-light', hash: '#/month/2026-10', ready: 'hero-savings-card', theme: 'light' });
      await shoot({ name: 'overview-mobile', hash: '#/month/2026-10', ready: 'hero-savings-card', width: 390, height: 844 });
      await shoot({ name: 'transactions', hash: '#/transactions?month=2026-10', ready: 'level4-transactions-workspace' });
      await shoot({ name: 'budgets', hash: '#/budgets?month=2026-10', ready: 'budgets-workspace' });
      await shoot({ name: 'trends', hash: '#/trends?month=2026-10', ready: 'trends-workspace' });
      await shoot({ name: 'trends-mobile', hash: '#/trends?month=2026-10', ready: 'trends-workspace', width: 390, height: 844 });
      await shoot({ name: 'reports', hash: '#/reports?month=2026-10', ready: 'reports-workspace', theme: 'light' });
      await shoot({ name: 'settings', hash: '#/settings', ready: 'settings-workspace' });
      await shoot({
        name: 'drilldown',
        hash: '#/month/2026-10',
        ready: 'hero-savings-card',
        action: async page => {
          await page.getByTestId('drill-down-variable').click();
          await page.waitForSelector('[data-testid="level2-bucket-view"]');
          await page.locator('[data-testid^="category-row-"]').first().click();
          await page.waitForSelector('[data-testid="level3-category-view"]');
          await page.waitForTimeout(700);
        },
      });
    } finally {
      await browser.close();
    }
  } finally {
    server.kill();
  }
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
