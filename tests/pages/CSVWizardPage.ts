import { Page, Locator } from '@playwright/test';

export class CSVWizardPage {
  readonly page: Page;
  readonly csvFileInput: Locator;
  readonly importBtn: Locator;
  readonly previewTable: Locator;

  constructor(page: Page) {
    this.page = page;
    this.csvFileInput = page.getByTestId('csv-file-input');
    this.importBtn = page.getByTestId('csv-import-btn');
    this.previewTable = page.getByTestId('csv-preview-table');
  }

  async uploadFile(filePath: string) {
    await this.csvFileInput.setInputFiles(filePath);
  }

  async mapColumn(appField: string, sourceHeader: string) {
    await this.page.getByTestId(`csv-map-col-${appField}`).selectOption(sourceHeader);
  }

  async clickImport() {
    await this.importBtn.click();
  }
}
