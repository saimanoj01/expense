# E2E Test Suite Ready

## Test Runner
- **Command**: `npm run test:e2e` (or `npx playwright test`)
- **Expected**: All 93 tests compile and pass with exit code 0 when execution targets the fully implemented React app (operating in Mock Mode).
- **Vite port**: Boots a local dev server at `http://localhost:3000` via the root configuration's `webServer` option.

## Coverage Summary
| Tier | Count | Description |
|------|------:|-------------|
| 1. Feature Coverage | 40 | Happy path tests (5 per feature across 8 features) |
| 2. Boundary & Corner | 40 | Edge cases, form validation, error states, and storage constraints |
| 3. Cross-Feature | 8 | Pairwise interactions of features (e.g. CSV import on locked months) |
| 4. Real-world Application | 5 | End-to-end user journeys representing typical workflows |
| **Total** | **93** | |

## Feature Checklist
| Feature | Tier 1 | Tier 2 | Tier 3 | Tier 4 | Status |
|---------|:------:|:------:|:------:|:------:|:------:|
| Google Auth | 5 / 5 | 5 / 5 | ✓ | ✓ | READY |
| Project Storage (Drive/Sheets) | 5 / 5 | 5 / 5 | ✓ | ✓ | READY |
| Manual Transactions | 5 / 5 | 5 / 5 | ✓ | ✓ | READY |
| Monthly Budgeting | 5 / 5 | 5 / 5 | ✓ | ✓ | READY |
| CSV Import/Deduplication | 5 / 5 | 5 / 5 | ✓ | ✓ | READY |
| Month Locking/Email Reports | 5 / 5 | 5 / 5 | ✓ | ✓ | READY |
| UI/UX & SVG/CSS Charts | 5 / 5 | 5 / 5 | ✓ | ✓ | READY |
| Mock/Demo Mode | 5 / 5 | 5 / 5 | ✓ | ✓ | READY |

## Instructions on How to Run
1. Navigate to the project root directory.
2. Install the application dependencies:
   ```bash
   npm install
   ```
3. Run the E2E test suite in headless mode:
   ```bash
   npm run test:e2e
   ```
4. To run tests in interactive UI mode:
   ```bash
   npx playwright test --ui
   ```
5. To view the HTML report of the latest run:
   ```bash
   npx playwright show-report
   ```
