import { Page, Locator } from '@playwright/test';

export class ProjectPage {
  readonly page: Page;
  readonly createProjectBtn: Locator;
  readonly projectNameInput: Locator;
  readonly projectSubmitBtn: Locator;
  readonly shareProjectBtn: Locator;
  readonly collaboratorEmailInput: Locator;
  readonly collaboratorSubmitBtn: Locator;

  constructor(page: Page) {
    this.page = page;
    this.createProjectBtn = page.getByTestId('create-project-btn');
    this.projectNameInput = page.getByTestId('project-name-input');
    this.projectSubmitBtn = page.locator('[data-testid="project-submit-btn"], [data-testid="save-project-btn"], button[type="submit"]');
    this.shareProjectBtn = page.getByTestId('share-project-btn');
    this.collaboratorEmailInput = page.getByTestId('collaborator-email-input');
    this.collaboratorSubmitBtn = page.locator('[data-testid="collaborator-submit-btn"], [data-testid="save-collaborator-btn"], button[type="submit"]');
  }

  async createProject(name: string) {
    await this.createProjectBtn.click();
    await this.projectNameInput.fill(name);
    await this.projectSubmitBtn.click();
  }

  async selectProject(id: string) {
    await this.page.getByTestId(`project-item-${id}`).click();
  }

  async shareProject(email: string) {
    await this.shareProjectBtn.click();
    await this.collaboratorEmailInput.fill(email);
    await this.collaboratorSubmitBtn.click();
  }
}
