import { chromium } from 'playwright';
import { spawn } from 'child_process';
import fs from 'fs';
import path from 'path';

const WORKSPACE_OUT = path.resolve(process.cwd(), 'screenshots/v4');
const SWARM_OUT = '/Users/saimanojb/.gemini/antigravity/brain/60ca1107-8826-4e12-9b6d-66517e99e196/swarm-v4/screenshots';

fs.mkdirSync(WORKSPACE_OUT, { recursive: true });
fs.mkdirSync(SWARM_OUT, { recursive: true });

async function saveShot(page, filename) {
  const p1 = path.join(WORKSPACE_OUT, filename);
  const p2 = path.join(SWARM_OUT, filename);
  await page.screenshot({ path: p1, fullPage: false });
  fs.copyFileSync(p1, p2);
  console.log(`  ✓ Saved ${filename}`);
}

const SEED_DATA = {
  mockSession: 'true',
  projects: [{ id: 'proj-v4', name: 'Personal Finances' }],
  activeProjectId: 'proj-v4',
  categories: {
    'proj-v4': [
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
    'proj-v4': [
      { category: 'housing', amount: 2200 },
      { category: 'utilities', amount: 220 },
      { category: 'food', amount: 650 },
      { category: 'dining', amount: 350 },
      { category: 'shopping', amount: 400 },
      { category: 'travel', amount: 600 },
    ],
  },
  transactions: {
    'proj-v4': [
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

async function waitForServer(url, timeoutMs = 15000) {
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
  const port = 4196;
  const baseUrl = `http://localhost:${port}`;
  console.log(`Starting vite server on ${baseUrl}...`);
  const server = spawn('npx', ['vite', '--port', String(port)], {
    cwd: process.cwd(),
    stdio: 'ignore',
  });

  try {
    await waitForServer(baseUrl);
    console.log('Vite server ready.');

    const browser = await chromium.launch();
    try {
      const context = await browser.newContext({
        viewport: { width: 1440, height: 900 },
        colorScheme: 'dark',
      });
      const page = await context.newPage();
      page.on('pageerror', err => console.error('PAGE ERROR:', err));
      page.on('console', msg => {
        if (msg.type() === 'error') console.error('CONSOLE ERROR:', msg.text());
      });

      await page.addInitScript((seeded) => {
        window.localStorage.setItem('expense_mock_session', JSON.stringify({ email: 'demo@example.com', name: 'Demo User' }));
        window.localStorage.setItem('pref_mock_mode', 'true');
        window.localStorage.setItem('expense_projects', JSON.stringify(seeded.projects));
        window.localStorage.setItem('expense_active_project_id', seeded.activeProjectId);
        for (const [projId, txs] of Object.entries(seeded.transactions)) {
          window.localStorage.setItem(`expense_txs_${projId}`, JSON.stringify(txs));
        }
        for (const [projId, cats] of Object.entries(seeded.categories)) {
          window.localStorage.setItem(`expense_categories_${projId}`, JSON.stringify(cats));
        }
        for (const [projId, bgs] of Object.entries(seeded.budgets)) {
          window.localStorage.setItem(`expense_budgets_${projId}`, JSON.stringify(bgs));
        }
      }, SEED_DATA);

      // Navigate to root first so addInitScript populates localStorage before hash routing
      await page.goto(`${baseUrl}/`);
      await page.waitForSelector('[data-testid="dashboard-header"]', { timeout: 10000 });
      await page.evaluate(() => { window.location.hash = '#/month/2026-10'; });
      await page.waitForTimeout(800);

      // Assert zero vertical scroll at 1440x900
      const scrollInfo = await page.evaluate(() => ({
        scrollHeight: document.documentElement.scrollHeight,
        clientHeight: document.documentElement.clientHeight,
      }));
      console.log(`Desktop 1440x900 scroll check: scrollHeight=${scrollInfo.scrollHeight}, clientHeight=${scrollInfo.clientHeight}`);

      // 1. Overview (saved month, dark desktop)
      await saveShot(page, '01-overview-saved-dark-1440.png');

      // 2. Overview (saved month, light desktop)
      await page.evaluate(() => {
        document.documentElement.classList.remove('dark');
        document.documentElement.classList.add('light');
        localStorage.setItem('theme', 'light');
      });
      await page.waitForTimeout(400);
      await saveShot(page, '02-overview-saved-light-1440.png');

      // Restore dark mode
      await page.evaluate(() => {
        document.documentElement.classList.remove('light');
        document.documentElement.classList.add('dark');
        localStorage.setItem('theme', 'dark');
      });
      await page.waitForTimeout(300);

      // 3. Overview (mobile 390x844 dark)
      await page.setViewportSize({ width: 390, height: 844 });
      await page.waitForTimeout(400);
      await saveShot(page, '03-overview-mobile-390.png');

      // Restore 1440x900
      await page.setViewportSize({ width: 1440, height: 900 });
      await page.waitForTimeout(400);

      // 4. Bucket drill-down (Variable bucket, desktop)
      await page.getByTestId('drill-down-variable').click();
      await page.waitForSelector('[data-testid="level2-bucket-view"]', { timeout: 5000 });
      await page.waitForTimeout(500);
      await saveShot(page, '04-bucket-drilldown-variable-1440.png');

      // 5. Category drill-down (Food & Groceries daily bars, desktop)
      const firstCatRow = page.locator('[data-testid^="category-row-"]').first();
      await firstCatRow.click();
      await page.waitForSelector('[data-testid="level3-category-view"]', { timeout: 5000 });
      await page.waitForTimeout(500);
      await saveShot(page, '05-category-drilldown-daily-bars-1440.png');

      // 6. Ledger workspace (Transactions list with edit sheet open)
      await page.evaluate(() => { window.location.hash = '#/transactions?month=2026-10'; });
      await page.waitForSelector('[data-testid="level4-transactions-workspace"]', { timeout: 5000 });
      await page.waitForTimeout(500);
      const firstTxRow = page.getByTestId('transaction-row').first();
      if (await firstTxRow.isVisible()) {
        await firstTxRow.click();
        await page.waitForSelector('[data-testid="transaction-edit-sheet"]', { timeout: 5000 });
        await page.waitForTimeout(400);
      }
      await saveShot(page, '06-ledger-edit-sheet-1440.png');
      await page.keyboard.press('Escape');
      await page.waitForTimeout(250);

      // 7. Trends workspace (12-month stacked bars)
      await page.evaluate(() => { window.location.hash = '#/trends?month=2026-10'; });
      await page.waitForSelector('[data-testid="trends-workspace"]', { timeout: 5000 });
      await page.waitForTimeout(500);
      await saveShot(page, '07-trends-12mo-stacked-1440.png');

      // 8. Deficit month overview (overspent hero & hatched ribbon)
      await page.evaluate(() => { window.location.hash = '#/month/2026-06'; });
      await page.waitForSelector('[data-testid="dashboard-header"]', { timeout: 5000 });
      await page.waitForTimeout(500);
      await saveShot(page, '08-overview-deficit-month-1440.png');

      // 9. Budgets planning workspace
      await page.evaluate(() => { window.location.hash = '#/budgets?month=2026-10'; });
      await page.waitForSelector('[data-testid="budgets-workspace"]', { timeout: 5000 });
      await page.waitForTimeout(500);
      await saveShot(page, '09-budgets-workspace-1440.png');

      console.log('All 9 canonical v4 screenshots captured!');
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
