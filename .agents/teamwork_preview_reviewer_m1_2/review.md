# Milestone 1 Integration & Review Report

This report presents the objective evaluation, code verification, and adversarial analysis of the Milestone 1 scaffolding and core services.

---

## Part 1: Quality Review Report

### Review Summary

**Verdict**: **REQUEST_CHANGES**

*Rationale*: While the typescript structures, auth and app contexts, and Tailwind CSS/PostCSS setup compile correctly, there are critical integration defects. The local storage keys in the adapter mismatch those expected by the Playwright E2E test suite. Additionally, there are severe `data-testid` mismatches (e.g., the mock login button sharing a test ID with the project creation button, and missing test IDs for charts and project items) which will cause E2E test executions to fail. Lastly, a critical security logic flaw allows users to modify transactions in locked months by changing their dates to unlocked months.

---

### Findings

#### [Critical] Finding 1: LocalStorage Keys Mismatch
- **What**: The local storage keys defined in `storage.ts` and `AuthContext.tsx` do not match the keys expected/preseeded by the Playwright E2E test suite.
- **Where**: 
  - `src/services/storage.ts` (lines 180, 191, 194-197, 217-220, etc.)
  - `src/context/AuthContext.tsx` (lines 32-33, 78-79, 86)
- **Why**: The storage adapter uses `expense_tracker_*` keys and `mock_user_session`, but E2E tests preseed and look up `expense_*` keys and `expense_mock_session`. Because of this mismatch, when E2E tests run, the app will not read the test database state, and the tests will fail to authenticate or mutate the ledger.
- **Suggestion**: Rename the local storage keys in the React code to match the Playwright tests:
  - `expense_tracker_projects` &rarr; `expense_projects`
  - `expense_tracker_transactions_${projectId}` &rarr; `expense_txs_${projectId}`
  - `expense_tracker_budgets_${projectId}` &rarr; `expense_budgets_${projectId}`
  - `expense_tracker_locks_${projectId}` &rarr; `expense_locks_${projectId}`
  - `mock_user_session` &rarr; `expense_mock_session`
  - `pref_mock_mode` &rarr; `expense_pref_mock_mode` (or similar)

#### [Critical] Finding 2: Test ID and UI Selector Mismatches
- **What**: Test IDs and DOM elements expected by E2E page objects (`tests/pages/`) are incorrect or missing.
- **Where**: `src/App.tsx`
- **Why**: 
  - The Mock Sign-In button has `data-testid="create-project-btn"` (which conflicts with the actual project creation button) instead of `mock-login-btn` expected by `AppPage.ts`.
  - There are no `data-testid` values for `project-name-input`, `theme-toggle-btn`, `project-item-${id}`, or the charts `chart-svg-pie` and `chart-svg-trend`.
  - Crucial UI elements for adding/editing transactions, CSV importing, and monthly lock toggles are not implemented in the layout, which will lead to selector timeouts in E2E tests.
- **Suggestion**: Add the missing `data-testid` attributes and implement placeholder UI controls or align the test selectors with the mock interfaces.

#### [Major] Finding 3: Locked Month Transaction Date-Shift Bypass
- **What**: The monthly lock check on `saveTransaction` can be bypassed by changing the transaction's date during modification.
- **Where**: `src/services/storage.ts` (lines 230-252)
- **Why**: The logic only verifies if the *new/target* date's month is locked. If a user modifies a transaction that is currently in a locked month (e.g. May 2026) and changes its date to an unlocked month (e.g. July 2026), the check passes, successfully modifying and migrating the transaction out of the locked month.
- **Suggestion**: Retrieve the original transaction from the database by ID (if it exists) and verify that its *original* date's month is not locked before allowing the update.

#### [Minor] Finding 4: Unhandled JSON Parse Crash in AuthContext
- **What**: Parsing the user session from `localStorage` in the `useEffect` hook of `AuthContext.tsx` can crash the app if the storage contains invalid JSON.
- **Where**: `src/context/AuthContext.tsx` (lines 38, 45)
- **Why**: `JSON.parse` is not wrapped in a `try/catch`. If the session storage is corrupted, it throws an unhandled SyntaxError, preventing the entire React root from mounting.
- **Suggestion**: Wrap `JSON.parse` in a `try/catch` block and clear the key if it is corrupted.

#### [Minor] Finding 5: Missing `PROJECT.md`
- **What**: The project directory layout verification cannot be performed against `PROJECT.md` as the file is missing.
- **Where**: Project Root
- **Why**: The instruction requests layout verification against `PROJECT.md`, but only `ORIGINAL_REQUEST.md` exists.
- **Suggestion**: Restore or create `PROJECT.md` detailing the workspace file structure.

---

### Verified Claims

- **Claim**: Vite dev server is configured on port 3000.
  - *Verified via*: Inspecting `vite.config.ts` and `package.json`.
  - *Status*: **PASS** (scripts specify port 3000).
- **Claim**: Local storage database is pre-seeded with mockup data when empty.
  - *Verified via*: Examining `ensureInitialized()` and `seedMockDatabase()` in `LocalStorageAdapter`.
  - *Status*: **PASS** (properly handles empty state checking and seeds `personal-finances` and `saas-hackathon`).
- **Claim**: Tailwind configuration features glassmorphism styles.
  - *Verified via*: Inspecting `tailwind.config.js` and `src/index.css`.
  - *Status*: **PASS** (`.glass-panel`, `.glass-card` classes with `backdrop-filter` and neon color variables are fully configured).

---

### Coverage Gaps

- **CSV Import Deduplication Hash Generation** — *Risk level*: Medium.
  - *Details*: While `Transaction` has a `hash` field, the storage adapter does not calculate hashes dynamically on manual transaction save; it assumes the hash is pre-populated.
  - *Recommendation*: Move SHA-256 hash generation logic into the `LocalStorageAdapter` (or a helper utility) so that manual transactions and CSV imports generate hashes consistently.

---

### Unverified Items

- **`npm run build` execution** — *Reason*: Terminal execution timed out waiting for user permission.
  - *Static Analysis*: The TS configuration matches standard Vite-React guidelines and types are aligned, suggesting it will compile without errors. However, direct shell verification could not complete.

---
---

## Part 2: Adversarial Challenge Report

### Challenge Summary

**Overall Risk Assessment**: **HIGH**

The primary vulnerability lies in the storage adapter's validation bounds: the lack of original date check on transaction mutations allows historical accounting data in locked months to be tampered with. Additionally, the lack of slug collision avoidance in project creation introduces risk of silent overwrites.

---

### Challenges

#### [Critical] Challenge 1: Transaction Migration Attack (Month Lock Bypass)
- **Assumption challenged**: "Month locking freezes all transaction details in that month."
- **Attack scenario**: A user selects an existing transaction that is within a locked month (e.g. May 2026) and submits an edit request to change the transaction's date to an unlocked month (e.g. July 2026). The storage adapter only checks the target date's month lock status (July, which is unlocked) and lets the update proceed. The transaction is successfully edited and moved, altering the historical records of the locked month.
- **Blast radius**: Breaks the fundamental constraint that a locked month's data cannot be modified.
- **Mitigation**: Perform a lookup for the transaction being edited:
  ```typescript
  if (existingIndex > -1) {
    const originalTx = transactions[existingIndex];
    const originalMonth = originalTx.date.substring(0, 7);
    const isOriginalLocked = locks.some(lock => lock.month === originalMonth && lock.locked);
    if (isOriginalLocked) {
      throw new Error(`Cannot modify transaction. The original month ${originalMonth} is locked.`);
    }
  }
  ```

#### [High] Challenge 2: LocalStorage Quota Exhaustion
- **Assumption challenged**: "Browser localStorage writes always succeed."
- **Attack scenario**: When uploading large CSV files or after storing years of data, the data size exceeds the browser's 5MB localStorage limit. The `localStorage.setItem` method throws a `QuotaExceededError`. The current adapter has no try-catch blocks around writes, causing the application to crash.
- **Blast radius**: Complete app crash during save operations, resulting in data loss.
- **Mitigation**: Wrap write operations in `try/catch` and show a clean error message warning the user that their browser storage is full.

#### [Medium] Challenge 3: Project Slug Collision
- **Assumption challenged**: "Project names map to unique identifiers."
- **Attack scenario**: A user creates a project named "Business Expenses" and later creates a project named "Business! Expenses". Both names resolve to the slug `business-expenses`. The second creation silently overwrites the categories, budgets, and transactions of the first project.
- **Blast radius**: Silent data loss and state corruption.
- **Mitigation**: Validate if the slug already exists in the projects array. If it does, append a numerical suffix (e.g., `-1`) or a short unique hash.

---

### Stress Test Results

- **Attempting to modify a transaction in a locked month by shifting its date**
  - *Expected behavior*: The transaction is protected and the modification is rejected.
  - *Predicted actual behavior*: The adapter accepts the save because it only checks the target date's lock status.
  - *Result*: **FAIL** (Security Bypass)

- **Creating projects with names that resolve to the same slug (e.g. "Personal Expenses" vs "Personal Expenses!")**
  - *Expected behavior*: The second project is given a unique slug or the action is rejected.
  - *Predicted actual behavior*: The second project overwrites the first project's categories, budgets, and transactions in local storage.
  - *Result*: **FAIL** (Silent Overwrite)

- **Corrupting the mock user session string in localStorage (e.g. setting `mock_user_session` to `invalid_json`)**
  - *Expected behavior*: The app ignores the corrupted session and shows the login screen.
  - *Predicted actual behavior*: The app crashes with an unhandled syntax error on mount.
  - *Result*: **FAIL** (App Crash)

---

### Unchallenged Areas

- **Google Sheets API rate limits and token expirations** — *Reason*: Deferred as the `GoogleSheetsAdapter` is currently a stub throwing "Method not implemented" errors.

---
