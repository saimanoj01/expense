import { Page, Locator } from '@playwright/test';

export class DashboardPage {
  readonly page: Page;
  // Transactions form
  readonly typeToggle: Locator;
  readonly amountInput: Locator;
  readonly categorySelect: Locator;
  readonly dateInput: Locator;
  readonly descInput: Locator;
  readonly notesInput: Locator;
  readonly labelsInput: Locator;
  readonly saveTxnBtn: Locator;
  readonly openAddTxnModalBtn: Locator;
  // Budgets
  readonly saveBudgetsBtn: Locator;
  // Locking
  readonly lockMonthBtn: Locator;
  readonly unlockMonthBtn: Locator;
  readonly lockStatus: Locator;
  // SVG Charts
  readonly pieChart: Locator;
  readonly trendChart: Locator;
  readonly budgetChart: Locator;

  constructor(page: Page) {
    this.page = page;
    this.openAddTxnModalBtn = page.getByTestId('open-add-transaction-btn');
    this.typeToggle = page.getByTestId('transaction-type-toggle');
    this.amountInput = page.getByTestId('transaction-amount-input');
    this.categorySelect = page.getByTestId('transaction-category-select');
    this.dateInput = page.getByTestId('transaction-date-input');
    this.descInput = page.getByTestId('transaction-desc-input');
    this.notesInput = page.getByTestId('transaction-notes-input');
    this.labelsInput = page.getByTestId('transaction-labels-input');
    this.saveTxnBtn = page.getByTestId('save-transaction-btn');
    this.saveBudgetsBtn = page.getByTestId('save-budgets-btn');
    this.lockMonthBtn = page.getByTestId('lock-month-btn');
    this.unlockMonthBtn = page.getByTestId('unlock-month-btn');
    this.lockStatus = page.getByTestId('lock-status-indicator');
    this.pieChart = page.getByTestId('chart-svg-pie');
    this.trendChart = page.getByTestId('chart-svg-trend');
    this.budgetChart = page.getByTestId('chart-svg-budget');
  }

  async addTransaction(data: {
    type: 'income' | 'expense';
    amount: string;
    category: string;
    date: string;
    description: string;
    notes?: string;
    labels?: string[];
  }) {
    await this.page.getByTestId('dashboard-header').waitFor({ state: 'visible' });
    if (!(await this.typeToggle.isVisible())) {
      await this.openAddTxnModalBtn.click();
    }
    const currentType = await this.typeToggle.getAttribute('data-active-type');
    if (currentType !== data.type) {
      await this.typeToggle.click();
    }
    await this.amountInput.fill(data.amount);
    await this.categorySelect.selectOption(data.category);
    await this.dateInput.fill(data.date);
    await this.descInput.fill(data.description);
    if (data.notes) await this.notesInput.fill(data.notes);
    if (data.labels) await this.labelsInput.fill(data.labels.join(','));
    await this.saveTxnBtn.click();
  }

  async editTransaction(id: string, updatedData: {
    amount?: string;
    description?: string;
  }) {
    await this.page.getByTestId(`edit-transaction-btn-${id}`).click();
    if (updatedData.amount) {
      await this.amountInput.fill(updatedData.amount);
    }
    if (updatedData.description) {
      await this.descInput.fill(updatedData.description);
    }
    await this.saveTxnBtn.click();
  }

  async deleteTransaction(id: string) {
    await this.page.getByTestId(`delete-transaction-btn-${id}`).click();
  }

  async setBudget(category: string, amount: string) {
    const input = this.page.getByTestId(`budget-input-${category}`);
    await input.fill(amount);
  }

  async saveBudgets() {
    await this.saveBudgetsBtn.click();
  }

  async lockCurrentMonth() {
    await this.lockMonthBtn.click();
  }

  async unlockCurrentMonth() {
    await this.unlockMonthBtn.click();
  }
}
