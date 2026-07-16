## 2026-07-16T20:27:11Z

Objective:
Resolve all compatibility, selector, and integration gaps identified by the reviewers in the Gen 2 review cycle.

Detailed Tasks:
1. Expose Storage Adapter to Window:
   - In `src/context/AppContext.tsx`, add a `useEffect` hook to expose the active `storageAdapter` as `window.expenseStorage` so that Playwright E2E tests can interact with it directly.

2. Database Schema Auto-Repair / Validator on Load:
   - In `src/services/storage.ts` inside `ensureInitialized()`:
     - Scan the parsed list of projects from `expense_projects`.
     - For each project, ensure `expense_categories_${proj.id}`, `expense_budgets_${proj.id}`, `expense_txs_${proj.id}`, and `expense_locks_${proj.id}` exist in localStorage.
     - If any of these keys do not exist, initialize them (using default categories for categories, and empty arrays `[]` for budgets, transactions, and locks).
     - This repairs legacy project databases seeded during E2E testing automatically upon initialization.

3. SVG Pie Chart Path Rendering:
   - In `src/App.tsx`, replace the `<circle>` inside the pie chart SVG with actual `<path>` elements representing the segments.
   - Group transactions by category and calculate total expense per category.
   - If total expenses > 0, calculate the percentage and arc angles for each category.
   - Construct SVG path data strings (`M cx cy L x1 y1 A r r 0 largeArcFlag 1 x2 y2 Z`) for each category segment, rendering `<path d={pathData} fill={color} />`.
   - Prevent degeneracy if there is only 1 category (or 100% of expense) by subtracting a tiny amount (e.g. 0.001) from the end angle.
   - This ensures the test `locator('path')` successfully counts and validates pie chart portions.

4. SVG Budget vs Actual Bar Classes:
   - In `src/App.tsx`, inside the budget chart, ensure the budget `<rect>` contains both classes `budget-bar` and `budget-bar-${category}`.
   - Ensure the spent/actual `<rect>` contains both classes `actual-bar` and `actual-bar-${category}`.

5. Missing Critical Test ID Selectors:
   - `data-testid="mock-banner"` and class `mock-mode-banner` on a banner visible at the very top of the page if `isMockMode` is true (whether authenticated or not). It must contain the text "Mock Mode".
   - `data-testid="project-selector"` on the outer container div of the project selector view (visible after login if user has projects).
   - `data-testid="onboarding-modal"`: when `projects.length === 0`, display a welcome/onboarding panel with this ID housing the project name input (`data-testid="project-name-input"`) and submit button (`data-testid="project-submit-btn"`).

6. Build Verification:
   - Run `npm run build` in the workspace directory to verify that the application compiles with zero errors or warnings.
   - Document commands run and output results in your handoff report.
