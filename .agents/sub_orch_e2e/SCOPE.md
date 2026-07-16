# Scope: E2E Testing Track

## Architecture
We use Playwright for opaque-box, requirement-driven end-to-end testing.
- **Test Runner**: Playwright Test (`@playwright/test`)
- **Language**: TypeScript
- **Target Mode**: Mock/Demo Mode (using `localStorage` state pre-seeding where appropriate, and verifying components function without real Google APIs).
- **Directory Layout**:
  - `tests/`: Root of tests
    - `playwright.config.ts`: Configuration for running tests (headless, viewport, local server, etc.)
    - `pages/`: Page Object Models (POMs) representing the application views:
      - `AppPage.ts`: Base page and login/mock toggle handler
      - `ProjectPage.ts`: Projects listing, creation, and sharing controls
      - `DashboardPage.ts`: Transaction grids, budgets, locking, and charts
      - `CSVWizardPage.ts`: CSV import wizard and mapping
    - `specs/`: Test specification files divided by tiers:
      - `tier1_features.spec.ts`: Feature coverage (5+ cases for each of 8 features, total 40+ tests)
      - `tier2_boundaries.spec.ts`: Edge cases & error handling (5+ cases for each of 8 features, total 40+ tests)
      - `tier3_combinations.spec.ts`: Cross-feature combinations (8+ tests)
      - `tier4_scenarios.spec.ts`: Real-world user flows (5+ tests)

## Milestones
| # | Name | Scope | Dependencies | Status |
|---|------|-------|-------------|--------|
| 1 | Test Harness Setup | Install Playwright config, dependencies, and set up basic Page Object models. | None | PLANNED |
| 2 | Tier 1 Happy Paths | Implement happy path tests for Google Auth, Project Storage, Manual Transactions, Monthly Budgeting, CSV Import/Deduplication, Month Locking/Email Reports, UI/UX SVG/CSS Charts, Mock/Demo Mode (>=40 tests). | M1 | PLANNED |
| 3 | Tier 2 Edge & Boundaries | Implement edge case tests, error states, and bounds validation (>=40 tests). | M2 | PLANNED |
| 4 | Tier 3 Combinations | Implement pairwise interaction tests (>=8 tests). | M3 | PLANNED |
| 5 | Tier 4 Real-World | Implement realistic end-to-end user scenarios (>=5 tests). | M4 | PLANNED |
| 6 | Publish Infra & Signals | Verify suite executes correctly, write `TEST_INFRA.md` and publish `TEST_READY.md`. | M5 | PLANNED |

## Interface Contracts (Selectors / UI Hooks)
To keep E2E tests decoupled from CSS design changes, we will recommend the implementation track standardizes on `data-testid` attributes:
- `data-testid="mock-login-btn"`: Mock mode login button
- `data-testid="google-login-btn"`: Google OAuth login button
- `data-testid="create-project-btn"`: Button to create a project
- `data-testid="project-name-input"`: Input for new project name
- `data-testid="project-item-<id>"`: Project row/card
- `data-testid="transaction-type-toggle"`: Income/Expense toggle button
- `data-testid="transaction-amount-input"`: Transaction amount field
- `data-testid="transaction-category-select"`: Category selection dropdown
- `data-testid="transaction-date-input"`: Transaction date field
- `data-testid="transaction-desc-input"`: Description input
- `data-testid="transaction-notes-input"`: Notes input
- `data-testid="transaction-labels-input"`: Labels/Tags input
- `data-testid="save-transaction-btn"`: Button to submit transaction form
- `data-testid="budget-input-<category>"`: Budget input field for a specific category
- `data-testid="save-budgets-btn"`: Save budgets action button
- `data-testid="csv-file-input"`: File input for CSV statements
- `data-testid="csv-map-col-<source>"`: Selector for column mapping
- `data-testid="csv-import-btn"`: Button to execute CSV import
- `data-testid="lock-month-btn"`: Lock month action button
- `data-testid="unlock-month-btn"`: Unlock month action button
- `data-testid="chart-svg-pie"`: SVG element for pie chart
- `data-testid="chart-svg-trend"`: SVG element for trend area chart
- `data-testid="chart-svg-budget"`: SVG element for budget vs actual bar chart
