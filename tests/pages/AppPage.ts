import { Page, Locator } from '@playwright/test';

export class AppPage {
  readonly page: Page;
  readonly mockLoginBtn: Locator;
  readonly googleLoginBtn: Locator;
  readonly themeToggleBtn: Locator;
  readonly mockBanner: Locator;

  constructor(page: Page) {
    this.page = page;
    this.mockLoginBtn = page.getByTestId('mock-login-btn');
    this.googleLoginBtn = page.getByTestId('google-login-btn');
    this.themeToggleBtn = page.getByTestId('theme-toggle-btn');
    this.mockBanner = page.locator('[data-testid="mock-banner"], .mock-mode-banner');
  }

  async goto() {
    await this.page.goto('/');
  }

  async loginAsMock() {
    await this.mockLoginBtn.click();
  }

  async loginWithGoogle() {
    await this.googleLoginBtn.click();
  }

  async toggleTheme() {
    await this.themeToggleBtn.click();
  }
}
