const { chromium } = require('playwright');

(async () => {
  console.log('Launching browser...');
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  
  // Listen for the prompt dialog we added
  page.on('dialog', async dialog => {
    console.log('\n--- Dialog Detected ---');
    console.log('Type:', dialog.type());
    console.log('Message:', dialog.message());
    
    // Provide a dummy client ID to test the redirect
    if (dialog.type() === 'prompt') {
      console.log('Accepting prompt with dummy Client ID...');
      await dialog.accept('test-dummy-client-id.apps.googleusercontent.com');
    } else {
      await dialog.dismiss();
    }
  });

  // Listen for navigation events to see where the browser goes
  page.on('framenavigated', frame => {
    if (frame === page.mainFrame()) {
      console.log('Navigated to:', frame.url());
    }
  });

  console.log('\nNavigating to http://localhost:3001...');
  await page.goto('http://localhost:3001');
  
  console.log('Clicking "Sign in with Google" button...');
  await page.click('button:has-text("Sign in with Google")');
  
  // Wait a bit to let the redirect happen
  await page.waitForTimeout(3000);
  
  console.log('\nFinal URL after click:', page.url());
  
  await browser.close();
  console.log('Browser closed.');
})();
