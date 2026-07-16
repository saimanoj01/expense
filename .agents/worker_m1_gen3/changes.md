# Changes Summary - Milestone 1 (Generation 3)

The following changes were made to resolve the compatibility, selector, and integration gaps identified in the Gen 2 review:

## 1. Expose Storage Adapter to Window
- **File**: `src/context/AppContext.tsx`
- **Change**: Added a `useEffect` hook in `AppProvider` that exposes the active `storageAdapter` as `window.expenseStorage`.
- **Rationale**: Enables Playwright E2E tests to directly programmatically query/interact with the storage layer.

## 2. Database Schema Auto-Repair / Validator on Load
- **File**: `src/services/storage.ts`
- **Change**: Added auto-repair validation loop inside `ensureInitialized()` in `LocalStorageAdapter`. It iterates over all parsed projects from `expense_projects` and initializes missing tables (`expense_categories_${proj.id}`, `expense_budgets_${proj.id}`, `expense_txs_${proj.id}`, and `expense_locks_${proj.id}`) if they do not exist.
- **Rationale**: Prevents E2E tests that seed projects without all associated keys from failing due to uninitialized entries.

## 3. SVG Pie Chart Path Rendering
- **File**: `src/App.tsx`
- **Change**: Replaced the placeholder `<circle>` element with actual `<path>` elements. Grouped transaction expenses by category, calculated the angles, and constructed SVG path data strings (`M cx cy L x1 y1 A r r 0 largeArcFlag 1 x2 y2 Z`) for each category segment.
- **Rationale**: Prevents degeneracy by subtracting `0.001` when a single category has 100% of expense, and enables E2E test `locator('path')` selectors to successfully find slice segments.

## 4. SVG Budget vs Actual Bar Classes
- **File**: `src/App.tsx`
- **Change**: Added both `budget-bar` and `budget-bar-${category}` classes to the budget `<rect>` bars, and both `actual-bar` and `actual-bar-${category}` classes to the spent/actual `<rect>` bars.
- **Rationale**: Ensures E2E tests can successfully target `.budget-bar` and `.actual-bar` base selectors.

## 5. Missing Critical Test ID Selectors
- **File**: `src/App.tsx`
- **Change**: Added the following data attributes:
  - `data-testid="mock-banner"` and class `mock-mode-banner` on the very top banner when `isMockMode` is active.
  - `data-testid="project-selector"` on the project selector outer wrapper container.
  - `data-testid="onboarding-modal"` on the fallback div when `projects.length === 0`, housing the project name input (`data-testid="project-name-input"`) and create button (`data-testid="project-submit-btn"`).
  - `data-testid="dashboard-header"` on the project dashboard header div.
- **Rationale**: Enables E2E tests to locate essential page regions and fields.
