# Review Report: Milestone 1 (Generation 2) Verification

**Verdict**: REQUEST_CHANGES

This report evaluates the corrected Milestone 1 implementation, focusing on directory structure, local storage integration, UI selectors, CSS layout, and routing contexts. 

---

## 1. Review Summary

While the implementation makes progress on local storage key alignment, session state persistence, and basic component structure, several alignment gaps, missing selectors, and incomplete requirements (such as schema auto-repair) will cause E2E test failures. Therefore, the verdict is **REQUEST_CHANGES**.

---

## 2. Quality Review Findings

### Major Finding 1: Missing Base Classes for SVG Chart Bars
- **What**: The SVG bar charts in `src/App.tsx` use category-specific class names like `budget-bar-${eb.name}` and `actual-bar-${eb.name}`, but lack the base classes `.budget-bar` and `.actual-bar`.
- **Where**: `src/App.tsx`, lines 502 and 512:
  ```typescript
  className={`budget-bar-${eb.name}`}
  className={`actual-bar-${eb.name}`}
  ```
- **Why**: Playwright E2E tests (`tests/specs/tier1_features.spec.ts`, lines 607-608) query these elements using the base classes:
  ```typescript
  const budgetBars = dashboardPage.budgetChart.locator('.budget-bar');
  const actualBars = dashboardPage.budgetChart.locator('.actual-bar');
  ```
  Since the base classes are missing, the E2E tests will fail to locate the bars.
- **Suggestion**: Update class attributes to include both the base class and category-specific suffix:
  ```typescript
  className={`budget-bar budget-bar-${eb.name}`}
  className={`actual-bar actual-bar-${eb.name}`}
  ```

### Major Finding 2: Missing Schema Validation and Auto-Repair Routines
- **What**: There is no schema validation or auto-repair logic on project load to verify files/keys and repair them by seeding default values.
- **Where**: `src/services/storage.ts` and `src/context/AppContext.tsx`.
- **Why**: E2E test 1 in `tests/specs/tier3_combinations.spec.ts` seeds a project `p1` without any locks or categories in localStorage, expecting the app to automatically detect missing tables and initialize `expense_locks_p1` to `[]` on project load:
  ```typescript
  const locksStr = await page.evaluate(() => window.localStorage.getItem('expense_locks_p1'));
  expect(locksStr).not.toBeNull();
  expect(JSON.parse(locksStr!)).toEqual([]);
  ```
  Because the schema validator is missing, `expense_locks_p1` remains unitialized (`null`), causing the test to fail.
- **Suggestion**: Add a validation/repair function in `LocalStorageAdapter.ensureInitialized` or `AppContext.loadProjects` that checks all projects listed in `expense_projects`. For each project, if its associated storage keys (e.g. `expense_locks_${projectId}`, `expense_categories_${projectId}`) are missing from `localStorage`, write default empty arrays or default categories to prevent test failures.

### Major Finding 3: Missing Test IDs and Selectors checked by E2E Tests
- **What**: Multiple test IDs required by the Playwright page models and specs are missing from the markup in `src/App.tsx`.
- **Where**: `src/App.tsx`
- **Why**: The following page selectors are queried but missing:
  1. `data-testid="mock-banner"` or `.mock-mode-banner`: Checked by `AppPage.ts` line 15 and `tier1_features.spec.ts` line 639 to verify mock banner visibility.
  2. `data-testid="dashboard-header"`: Checked by `tier1_features.spec.ts` lines 70, 75, 85.
  3. `data-testid="project-selector"`: Checked by `tier1_features.spec.ts` line 134.
  4. `data-testid="onboarding-modal"`: Checked by `tier1_features.spec.ts` line 118.
- **Suggestion**: Add the corresponding `data-testid` attributes to the wrapping layout divs in `src/App.tsx`. For example:
  - Add `data-testid="project-selector"` to the project listing container.
  - Add `data-testid="dashboard-header"` to the header section within the dashboard view.
  - Add `data-testid="onboarding-modal"` to the fallback block shown when there are zero projects.

---

## 3. Verified Claims

- **Local Storage Key Standardization**: Verified that the adapter uses standardized keys matching E2E specs (`expense_projects`, `expense_txs_${projectId}`, `expense_categories_${projectId}`, `expense_budgets_${projectId}`, `expense_locks_${projectId}`) -> **PASS** (via static analysis of `src/services/storage.ts` lines 180-224).
- **Transaction Locking Verification**: Verified that `saveTransaction` checks the transaction date against monthly locks, and for updates, it also validates the *original* transaction date to prevent lock bypass -> **PASS** (via static analysis of `src/services/storage.ts` lines 285-301).
- **Graceful Parse Error Resilience**: Checked that all `JSON.parse` operations in storage initialization are wrapped in `try-catch` blocks that wipe corrupt cache entries and re-initialize seeds -> **PASS** (via static analysis of `src/services/storage.ts` lines 189-212).
- **SVG Chart Containers**: Verified that placeholders for SVG charts exist with `data-testid` attributes (`chart-svg-pie`, `chart-svg-trend`, `chart-svg-budget`) -> **PASS** (via static analysis of `src/App.tsx` lines 482, 527, 541).

---

## 4. Adversarial Review Challenges

### High Challenge 1: LocalStorage Quota Exceeded Crash
- **Assumption challenged**: The storage adapter assumes that write operations to `localStorage` will always succeed.
- **Attack scenario**: A user imports high-frequency transactions via CSV, or operates many projects. Once the browser's local storage quota (typically 5MB) is reached, `localStorage.setItem` throws a `QuotaExceededError`.
- **Blast radius**: The application will throw unhandled exceptions, interrupting transactions or project creations mid-flow, potentially resulting in UI state mismatches.
- **Mitigation**: Wrap all `localStorage.setItem` operations in the adapter inside a helper utility that catches `QuotaExceededError` and returns a clear, user-facing error message prompting the user to manage/delete unused projects.

### Medium Challenge 2: Client-side Form Validation and Month Lock Bypass
- **Assumption challenged**: The codebase assumes month locks are strictly enforced at the storage adapter level.
- **Attack scenario**: A user imports a statement CSV containing transactions spanning both locked and unlocked months.
- **Blast radius**: If the CSV import preview UI does not disable checkboxes or flag rows on locked months, the user could attempt to import them. While the storage layer will throw an error for locked months, bulk writes could fail partially, leaving the UI state out of sync.
- **Mitigation**: The CSV import wizard should cross-reference lock lists before rendering the preview, and explicitly disable select checkboxes for any rows matching locked months.

---

## 5. Unverified Items & Coverage Gaps

- **Build Compilation & E2E Executions**: Due to permission prompts timing out on `run_command` (`npm install` / `npm run build`), commands could not be run locally. All verifications are performed via static analysis.
- **Unimplemented Features**: Features such as manual transaction form editing, CSV mapping dropdowns, and month lock/unlock buttons are not yet implemented in `App.tsx`, as they are planned for later milestones (Milestones 2, 3, and 5). 

---

## 6. Handoff Checklist
- [x] Directory structure verified (layout matches project contract layout)
- [x] Local storage adapter and context provider keys analyzed
- [x] SVG/CSS chart classes and test IDs audited
- [x] Review report generated
