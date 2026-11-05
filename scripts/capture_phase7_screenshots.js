import { chromium } from 'playwright';
import { spawn } from 'child_process';

const OUT_DIR = '/Users/saimanojb/.gemini/antigravity/brain/60ca1107-8826-4e12-9b6d-66517e99e196/swarm/scratch/phase7-shots';

async function main() {
  console.log('Starting preview server on port 4192...');
  const server = spawn('npx', ['vite', 'preview', '--port', '4192'], {
    cwd: process.cwd(),
    stdio: 'ignore'
  });

  // Give server 2s to bind
  await new Promise(r => setTimeout(r, 2000));

  const browser = await chromium.launch();
  try {
    const context = await browser.newContext({
      viewport: { width: 1440, height: 900 }
    });

    const page = await context.newPage();

    // Pre-seed full workspace
    await page.addInitScript(() => {
      window.localStorage.setItem('expense_mock_session', JSON.stringify({ email: 'demo@example.com', name: 'Demo User' }));
      window.localStorage.setItem('pref_mock_mode', 'true');
    });

    await page.goto('http://localhost:4192/');
    await page.waitForSelector('[data-testid="dashboard-header"]', { timeout: 10000 });
    await page.waitForTimeout(1000);

    // 1. Dark mode desktop
    console.log('Capturing dark mode desktop...');
    await page.screenshot({ path: `${OUT_DIR}/dashboard-dark-1440.png`, fullPage: false });

    // 2. Light mode desktop
    console.log('Capturing light mode desktop...');
    await page.getByTestId('theme-toggle-btn').click();
    await page.waitForTimeout(500);
    await page.screenshot({ path: `${OUT_DIR}/dashboard-light-1440.png`, fullPage: false });
    // Switch back to dark
    await page.getByTestId('theme-toggle-btn').click();
    await page.waitForTimeout(500);

    // 3. Story & Waterfall
    console.log('Capturing story & waterfall...');
    const storyCard = page.getByTestId('dashboard-header');
    if (await storyCard.isVisible()) {
      await storyCard.scrollIntoViewIfNeeded();
      await page.waitForTimeout(500);
      await storyCard.screenshot({ path: `${OUT_DIR}/monthly-financial-story-waterfall.png` });
    }

    // 4. Recharts Trend & Budget Utilization
    console.log('Capturing Trend pacing & budget utilization...');
    const trendSection = page.getByTestId('chart-svg-trend');
    if (await trendSection.isVisible()) {
      await trendSection.scrollIntoViewIfNeeded();
      await page.waitForTimeout(500);
      await page.screenshot({ path: `${OUT_DIR}/recharts-trend-budget.png`, fullPage: false });
    }

    // 5. Monthly Report Modal
    console.log('Capturing monthly report modal...');
    const reportBtn = page.getByTestId('story-print-report-btn');
    if (await reportBtn.isVisible()) {
      await reportBtn.click();
      await page.waitForSelector('[data-testid="print-report-btn"]', { timeout: 5000 });
      await page.waitForTimeout(500);
      await page.screenshot({ path: `${OUT_DIR}/monthly-report-modal.png` });
      await page.keyboard.press('Escape');
      await page.waitForTimeout(300);
    }

    // 6. Mobile 390px
    console.log('Capturing mobile view...');
    await page.setViewportSize({ width: 390, height: 844 });
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.waitForTimeout(500);
    await page.screenshot({ path: `${OUT_DIR}/dashboard-mobile-390.png`, fullPage: false });

    console.log('All screenshots captured successfully!');
  } finally {
    await browser.close();
    server.kill();
  }
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
