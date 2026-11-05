import { chromium } from 'playwright';
import * as path from 'path';
import * as fs from 'fs';

const SCREENSHOT_DIR = '/Users/saimanojb/.gemini/antigravity/brain/60ca1107-8826-4e12-9b6d-66517e99e196/swarm-v3/screenshots';
fs.mkdirSync(SCREENSHOT_DIR, { recursive: true });

async function run() {
  const browser = await chromium.launch({ headless: true });

  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    colorScheme: 'dark'
  });

  // Setup mock session and seed project
  await context.addInitScript(() => {
    const mockUser = {
      email: 'demo@example.com',
      name: 'Demo User',
      picture: 'https://api.dicebear.com/7.x/bottts/svg?seed=Demo'
    };
    window.localStorage.setItem('expense_mock_session', JSON.stringify(mockUser));
    window.localStorage.setItem('pref_mock_mode', 'true');
    window.localStorage.setItem('expense_theme', 'dark');
    
    // Seed project
    const projId = 'demo-project';
    window.localStorage.setItem('expense_projects', JSON.stringify([
      { id: projId, name: 'Personal Finances' }
    ]));
    window.localStorage.setItem('expense_active_project_id', projId);

    // Standard Categories
    const categories = [
      { id: 'salary', name: 'Salary', color: '#10B981', emoji: '💰' },
      { id: 'housing', name: 'Housing & Rent', color: '#6366F1', emoji: '🏠', defaultBucket: 'fixed' },
      { id: 'utilities', name: 'Utilities', color: '#8B5CF6', emoji: '⚡', defaultBucket: 'fixed' },
      { id: 'food', name: 'Food & Groceries', color: '#EC4899', emoji: '🍔', defaultBucket: 'flexible' },
      { id: 'shopping', name: 'Shopping', color: '#F43F5E', emoji: '🛍️', defaultBucket: 'flexible' },
      { id: 'travel', name: 'Travel & Vacation', color: '#F59E0B', emoji: '✈️', defaultBucket: 'non-monthly' },
      { id: 'insurance', name: 'Annual Insurance', color: '#EAB308', emoji: '🛡️', defaultBucket: 'non-monthly' }
    ];
    window.localStorage.setItem(`expense_categories_${projId}`, JSON.stringify(categories));

    // Current month 2026-11 transactions
    const txs = [
      { id: 'tx-1', date: '2026-11-01', category: 'salary', amount: 6500, type: 'income', description: 'Tech Corp Direct Deposit', notes: '', labels: ['salary'], hash: 'h1' },
      { id: 'tx-2', date: '2026-11-01', category: 'housing', amount: 2200, type: 'expense', description: 'Monthly Apartment Lease', notes: '', labels: ['rent'], hash: 'h2', spendingBucket: 'fixed' },
      { id: 'tx-3', date: '2026-11-02', category: 'utilities', amount: 180, type: 'expense', description: 'Power & Water Utility', notes: '', labels: ['utilities'], hash: 'h3', spendingBucket: 'fixed' },
      { id: 'tx-4', date: '2026-11-03', category: 'food', amount: 480, type: 'expense', description: 'Whole Foods Market', notes: '', labels: ['groceries'], hash: 'h4', spendingBucket: 'flexible' },
      { id: 'tx-5', date: '2026-11-04', category: 'shopping', amount: 220, type: 'expense', description: 'Electronics & Home Office', notes: '', labels: ['work'], hash: 'h5', spendingBucket: 'flexible' },
      { id: 'tx-6', date: '2026-11-04', category: 'travel', amount: 350, type: 'expense', description: 'Flight Ticket Reservation', notes: '', labels: ['vacation'], hash: 'h6', spendingBucket: 'non-monthly' },
      // Prior month 2026-10 transactions for MoM calculation
      { id: 'tx-prior-1', date: '2026-10-01', category: 'salary', amount: 6500, type: 'income', description: 'Direct Deposit', notes: '', labels: [], hash: 'hp1' },
      { id: 'tx-prior-2', date: '2026-10-01', category: 'housing', amount: 2200, type: 'expense', description: 'Rent', notes: '', labels: [], hash: 'hp2', spendingBucket: 'fixed' },
      { id: 'tx-prior-3', date: '2026-10-03', category: 'food', amount: 550, type: 'expense', description: 'Groceries', notes: '', labels: [], hash: 'hp3', spendingBucket: 'flexible' }
    ];
    window.localStorage.setItem(`expense_txs_${projId}`, JSON.stringify(txs));

    const budgets = [
      { category: 'housing', amount: 2200 },
      { category: 'utilities', amount: 200 },
      { category: 'food', amount: 600 },
      { category: 'shopping', amount: 300 },
      { category: 'travel', amount: 500 }
    ];
    window.localStorage.setItem(`expense_budgets_${projId}`, JSON.stringify(budgets));
  });

  const page = await context.newPage();
  await page.goto('http://localhost:4173/expense/#/month/2026-11');
  await page.waitForLoadState('networkidle');
  await page.waitForSelector('[data-testid="dashboard-header"]', { timeout: 10000 });
  await page.waitForTimeout(600);

  // 1. Scroll metrics check on 1440x900
  const scrollMetrics = await page.evaluate(() => {
    const el = document.documentElement;
    const body = document.body;
    return {
      innerHeight: window.innerHeight,
      scrollHeight: el.scrollHeight,
      bodyScrollHeight: body.scrollHeight,
      clientHeight: el.clientHeight,
      hasVerticalScrollbar: el.scrollHeight > window.innerHeight
    };
  });
  console.log('--- Desktop 1440x900 Zero-Scroll Metrics ---');
  console.log(JSON.stringify(scrollMetrics, null, 2));

  // Screenshot 1: Desktop Dark Overview
  await page.screenshot({ path: path.join(SCREENSHOT_DIR, 'final-01-desktop-dark-overview.png') });
  console.log('Saved final-01-desktop-dark-overview.png');

  // Screenshot 3: Desktop Dark Bucket View (Variable Spending)
  await page.goto('http://localhost:4173/expense/#/bucket/flexible');
  await page.waitForSelector('[data-testid="level2-bucket-view"]', { timeout: 5000 });
  await page.waitForTimeout(500);
  await page.screenshot({ path: path.join(SCREENSHOT_DIR, 'final-03-desktop-dark-bucket.png') });
  console.log('Saved final-03-desktop-dark-bucket.png');

  // Screenshot 5: Desktop Dark Transactions View
  await page.goto('http://localhost:4173/expense/#/transactions');
  await page.waitForSelector('[data-testid="level4-transactions-workspace"]', { timeout: 5000 });
  await page.waitForTimeout(500);
  await page.screenshot({ path: path.join(SCREENSHOT_DIR, 'final-05-desktop-dark-transactions.png') });
  console.log('Saved final-05-desktop-dark-transactions.png');

  // Screenshot 8: Desktop Dark Settings View
  await page.goto('http://localhost:4173/expense/#/settings');
  await page.waitForSelector('[data-testid="settings-workspace"]', { timeout: 5000 });
  await page.waitForTimeout(500);
  await page.screenshot({ path: path.join(SCREENSHOT_DIR, 'final-08-desktop-dark-settings.png') });
  console.log('Saved final-08-desktop-dark-settings.png');

  // Screenshot 9: Desktop Dark Trends View (Waterfall Chart)
  await page.goto('http://localhost:4173/expense/#/trends');
  await page.waitForSelector('[data-testid="trends-workspace"]', { timeout: 5000 });
  await page.waitForTimeout(1000);
  await page.screenshot({ path: path.join(SCREENSHOT_DIR, 'final-09-desktop-dark-trends.png') });
  console.log('Saved final-09-desktop-dark-trends.png');

  // Switch to Light Mode on Desktop
  await page.evaluate(() => {
    document.documentElement.classList.remove('dark');
    document.documentElement.classList.add('light');
    localStorage.setItem('expense_theme', 'light');
  });
  await page.goto('http://localhost:4173/expense/#/month/2026-11');
  await page.waitForSelector('[data-testid="dashboard-header"]', { timeout: 5000 });
  await page.waitForTimeout(600);

  // Screenshot 2: Desktop Light Overview
  await page.screenshot({ path: path.join(SCREENSHOT_DIR, 'final-02-desktop-light-overview.png') });
  console.log('Saved final-02-desktop-light-overview.png');

  // Screenshot 4: Desktop Light Category View (Food & Groceries)
  await page.goto('http://localhost:4173/expense/#/category/food');
  await page.waitForSelector('[data-testid="level3-category-view"]', { timeout: 5000 });
  await page.waitForTimeout(500);
  await page.screenshot({ path: path.join(SCREENSHOT_DIR, 'final-04-desktop-light-category.png') });
  console.log('Saved final-04-desktop-light-category.png');

  await context.close();

  // Mobile Context (390x844)
  const mobileContext = await browser.newContext({
    viewport: { width: 390, height: 844 },
    isMobile: true,
    colorScheme: 'dark'
  });
  await mobileContext.addInitScript(() => {
    const mockUser = {
      email: 'demo@example.com',
      name: 'Demo User',
      picture: 'https://api.dicebear.com/7.x/bottts/svg?seed=Demo'
    };
    window.localStorage.setItem('expense_mock_session', JSON.stringify(mockUser));
    window.localStorage.setItem('pref_mock_mode', 'true');
    window.localStorage.setItem('expense_theme', 'dark');
    const projId = 'demo-project';
    window.localStorage.setItem('expense_projects', JSON.stringify([{ id: projId, name: 'Personal Finances' }]));
    window.localStorage.setItem('expense_active_project_id', projId);

    const categories = [
      { id: 'salary', name: 'Salary', color: '#10B981', emoji: '💰' },
      { id: 'housing', name: 'Housing & Rent', color: '#6366F1', emoji: '🏠', defaultBucket: 'fixed' },
      { id: 'food', name: 'Food & Groceries', color: '#EC4899', emoji: '🍔', defaultBucket: 'flexible' }
    ];
    window.localStorage.setItem(`expense_categories_${projId}`, JSON.stringify(categories));

    const txs = [
      { id: 'tx-1', date: '2026-11-01', category: 'salary', amount: 6500, type: 'income', description: 'Tech Corp Direct Deposit', notes: '', labels: ['salary'], hash: 'h1' },
      { id: 'tx-2', date: '2026-11-01', category: 'housing', amount: 2200, type: 'expense', description: 'Apartment Lease', notes: '', labels: ['rent'], hash: 'h2', spendingBucket: 'fixed' },
      { id: 'tx-3', date: '2026-11-03', category: 'food', amount: 480, type: 'expense', description: 'Whole Foods Market', notes: '', labels: ['groceries'], hash: 'h3', spendingBucket: 'flexible' }
    ];
    window.localStorage.setItem(`expense_txs_${projId}`, JSON.stringify(txs));
  });

  const mobilePage = await mobileContext.newPage();
  await mobilePage.goto('http://localhost:4173/expense/#/month/2026-11');
  await mobilePage.waitForLoadState('networkidle');
  await mobilePage.waitForSelector('[data-testid="dashboard-header"]', { timeout: 10000 });
  await mobilePage.waitForTimeout(500);

  // Screenshot 6: Mobile Dark Overview
  await mobilePage.screenshot({ path: path.join(SCREENSHOT_DIR, 'final-06-mobile-dark-overview.png') });
  console.log('Saved final-06-mobile-dark-overview.png');

  // Switch to Light Mode on Mobile
  await mobilePage.evaluate(() => {
    document.documentElement.classList.remove('dark');
    document.documentElement.classList.add('light');
    localStorage.setItem('expense_theme', 'light');
  });
  await mobilePage.goto('http://localhost:4173/expense/#/bucket/fixed');
  await mobilePage.waitForSelector('[data-testid="level2-bucket-view"]', { timeout: 5000 });
  await mobilePage.waitForTimeout(500);

  // Screenshot 7: Mobile Light Bucket View
  await mobilePage.screenshot({ path: path.join(SCREENSHOT_DIR, 'final-07-mobile-light-bucket.png') });
  console.log('Saved final-07-mobile-light-bucket.png');

  await mobileContext.close();
  await browser.close();
  console.log('--- ALL VERIFICATION SCREENSHOTS AND SCROLL MEASUREMENTS COMPLETE ---');
}

run().catch(err => {
  console.error('Error during execution:', err);
  process.exit(1);
});
