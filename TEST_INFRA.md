# E2E Test Infra: Expense Tracker and Budget Planning

## Test Philosophy
- **Opaque-box & Requirement-driven**: All test scenarios are derived directly from user requirements (R1 - R6) and acceptance criteria, executing actions via UI interactions instead of mocking internal application code.
- **Deterministic Bypassing of OAuth**: Headless and CI/CD operations rely on the built-in Mock/Demo Mode (localStorage) to perform all ledger mutations.
- **State Pre-seeding**: Avoid long sequences of setup interactions by pre-populating browser `localStorage` variables using Playwright's `page.addInitScript()` prior to React mounting.
- **Methodology**: 4-Tier Test Suite utilizing Category-Partition (Tier 1), Boundary Value Analysis (Tier 2), Pairwise Combinatorial (Tier 3), and Real-World Application Workloads (Tier 4).

## Feature Inventory
The E2E test suite covers 8 core features:
1. **Google Auth** (R1, R6)
2. **Project Storage (Drive/Sheets)** (R1)
3. **Manual Transactions** (R2)
4. **Monthly Budgeting** (R2)
5. **CSV Import/Deduplication** (R3)
6. **Month Locking/Email Reports** (R4)
7. **UI/UX & SVG/CSS Charts** (R5)
8. **Mock/Demo Mode** (R6)

| # | Feature | Source (Requirement) | Tier 1 (Happy) | Tier 2 (Boundary) | Tier 3 (Pairwise) | Tier 4 (Workloads) |
|---|---------|----------------------|:--------------:|:-----------------:|:-----------------:|:------------------:|
| 1 | Google Auth | ORIGINAL_REQUEST §R1, §R6 | 5 | 5 | ✓ | ✓ |
| 2 | Project Storage | ORIGINAL_REQUEST §R1 | 5 | 5 | ✓ | ✓ |
| 3 | Manual Transactions | ORIGINAL_REQUEST §R2 | 5 | 5 | ✓ | ✓ |
| 4 | Monthly Budgeting | ORIGINAL_REQUEST §R2 | 5 | 5 | ✓ | ✓ |
| 5 | CSV Import/Deduplication | ORIGINAL_REQUEST §R3 | 5 | 5 | ✓ | ✓ |
| 6 | Month Locking/Email Reports | ORIGINAL_REQUEST §R4 | 5 | 5 | ✓ | ✓ |
| 7 | UI/UX & SVG/CSS Charts | ORIGINAL_REQUEST §R5 | 5 | 5 | ✓ | ✓ |
| 8 | Mock/Demo Mode | ORIGINAL_REQUEST §R6 | 5 | 5 | ✓ | ✓ |

## Test Architecture
- **Test Runner**: Playwright Test (`@playwright/test`)
- **Invocation**: `npm run test:e2e` (triggers `playwright test` via root configuration)
- **Directory Layout**:
  - `playwright.config.ts`: Root Playwright configuration (ports, baseURL, local server bootups)
  - `tests/pages/`: Page Object Models (POMs)
    - `AppPage.ts`: Entry, Theme toggle, and Auth mode actions
    - `ProjectPage.ts`: Project management and collaborator share actions
    - `DashboardPage.ts`: Transaction grids, budgeting, locking, and charts assertions
    - `CSVWizardPage.ts`: Uploading, column mapper mapping, and CSV import commit
  - `tests/specs/`: Specification Tiers
    - `tier1_features.spec.ts`: Feature happy-path specs (40 cases)
    - `tier2_boundaries.spec.ts`: Edge cases and invalid states (40 cases)
    - `tier3_combinations.spec.ts`: Complex cross-feature interactions (8 cases)
    - `tier4_scenarios.spec.ts`: Real-world user flow workloads (5 cases)

## Real-World Application Scenarios (Tier 4)
| # | Scenario | Features Exercised | Complexity |
|---|----------|--------------------|------------|
| 1 | New User Onboarding & Initial Budgeting | F1 (Auth), F2 (Storage), F4 (Budgeting) | Medium |
| 2 | Bank Statement Upload & Reconciliation | F3 (Txns), F5 (CSV Wizard, Deduplication) | High |
| 3 | End of Month Locking & Report Dispatch | F2 (Collaborators), F6 (Locking, Email output) | High |
| 4 | Mode Shift (Auth Mode Transition) | F1 (OAuth Login), F2 (Drive API Mock Sync) | High |
| 5 | Multi-Project Allocation & Tracking | F2 (Multi-Project), F3 (Txn isolation), F4 (Budgeting) | Medium |

## Coverage Thresholds
- **Tier 1 (Feature Coverage)**: ≥5 tests per feature (Total: 40 tests)
- **Tier 2 (Boundary & Corner Cases)**: ≥5 tests per feature (Total: 40 tests)
- **Tier 3 (Cross-Feature Combinations)**: Pairwise coverage of major feature interactions (Total: 8 tests)
- **Tier 4 (Real-World Scenarios)**: High-level acceptance user journeys (Total: 5 tests)
- **Total Suite Count**: 93 test cases
