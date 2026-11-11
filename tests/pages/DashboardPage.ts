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
  }

  async ensureTransactionsView() {
    if (!(await this.page.getByTestId('level4-transactions-workspace').isVisible())) {
      await this.page.evaluate(() => {
        window.location.hash = '#/transactions';
      });
      await this.page.getByTestId('level4-transactions-workspace').waitFor({ state: 'visible' });
    }
  }

  async ensureBudgetsView() {
    if (!(await this.page.getByTestId('budgets-workspace').isVisible())) {
      await this.page.evaluate(() => {
        window.location.hash = '#/budgets';
      });
      await this.page.getByTestId('budgets-workspace').waitFor({ state: 'visible' });
    }
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
    await this.ensureTransactionsView();
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
    await this.saveTxnBtn.waitFor({ state: 'hidden' });
  }

  async editTransaction(id: string, updatedData: {
    amount?: string;
    description?: string;
  }) {
    await this.ensureTransactionsView();
    const editBtn = this.page.getByTestId(`edit-transaction-btn-${id}`);
    const row = this.page.locator('[data-testid="transaction-row"]', { has: editBtn });
    if ((await row.count()) > 0) {
      await row.hover();
    }
    if (await editBtn.isVisible()) {
      await editBtn.click();
    } else {
      await row.click();
    }
    if (updatedData.amount) {
      await this.amountInput.fill(updatedData.amount);
    }
    if (updatedData.description) {
      await this.descInput.fill(updatedData.description);
    }
    await this.saveTxnBtn.click();
    await this.saveTxnBtn.waitFor({ state: 'hidden' });
  }

  async deleteTransaction(id: string) {
    await this.ensureTransactionsView();
    const delBtn = this.page.getByTestId(`delete-transaction-btn-${id}`);
    const row = this.page.locator('[data-testid="transaction-row"]', { has: delBtn });
    if ((await row.count()) > 0) {
      await row.hover();
    }
    if (await delBtn.isVisible()) {
      await delBtn.click();
    } else {
      await row.click();
      await this.page.getByTestId('modal-delete-transaction-btn').click();
    }
  }

  async setBudget(category: string, amount: string) {
    await this.ensureBudgetsView();
    const input = this.page.getByTestId(`budget-input-${category}`);
    await input.fill(amount);
  }

  async saveBudgets() {
    await this.ensureBudgetsView();
    await this.saveBudgetsBtn.click();
  }

  async lockCurrentMonth() {
    await this.ensureTransactionsView();
    if (!(await this.lockMonthBtn.isVisible())) {
      await this.page.getByTestId('page-header-more-btn').click();
    }
    await this.lockMonthBtn.click();
  }

  async unlockCurrentMonth() {
    await this.ensureTransactionsView();
    if (!(await this.unlockMonthBtn.isVisible())) {
      await this.page.getByTestId('page-header-more-btn').click();
    }
    await this.unlockMonthBtn.click();
  }
}
