# Tier 5 Adversarial Coverage Audit & Gap Report - Part 1

**Challenger Role**: Empirical Challenger 1 (Milestone 6 Phase 2 - Adversarial Coverage Hardening)  
**Target Codebase**: Expense Tracker and Budget Planning  
**Audit Scope**:  
- `src/App.tsx` (UI state transitions, modals, KPI calculations, CSV wizard, charts)
- `src/context/AuthContext.tsx` (OAuth/Mock mode switching, token expiration, corrupted recovery, offline detection)
- `src/context/AppContext.tsx` (Project selector state, active project initialization, storage adapter switching)
- `src/services/storage.ts` (`LocalStorageAdapter`, `GoogleSheetsAdapter`, schema repairs, month lock validation)
- `src/services/googleApi.ts` (*Audit Note*: File does not exist; Google Sheets API adapter logic is embedded in `src/services/storage.ts` (`GoogleSheetsAdapter`) and `src/App.tsx`)

---

## 1. Executive Summary

Our adversarial white-box audit of the implementation source code against existing Tier 1–4 Playwright test suites (`tier1_features.spec.ts` through `tier4_scenarios.spec.ts`) identified **7 critical uncovered edge-case paths and failure modes** across State Transitions, OAuth/Mock Mode Switching, Concurrency, Data Corruption Resilience, and Google Drive/Sheets adapter interactions.

While Tiers 1–4 cover happy paths, boundary validations, and standard cross-feature workflows, high-risk error handling paths and recovery mechanisms were previously untested.

---

## 2. White-Box Audit Matrix & Identified Coverage Gaps

| Module | Line Range | Uncovered Adversarial Scenario / Path | Blast Radius | Status |
|---|---|---|---|---|
| `src/App.tsx` | 427–436 | **Monthly Lock Email Report Timeout (`HTTP 408`)**: When `handleLockCurrentMonth` calls `/gmail/v1/users/me/messages/send` and receives `HTTP 408`, the app rolls back the lock (`locked: false`) and displays `"Lock failed: email report could not send"`. | Medium (Incomplete lock state rollback without user notification if untested) | Uncovered in Tiers 1–4 |
| `src/App.tsx` | 129–136 | **Spreadsheet 404 Missing/Deleted Cloud Sheet**: Active project with `spreadsheetId === 'sheets-123'` triggers a fetch to `/spreadsheets/sheets-123`. A `404` status opens the Spreadsheet Not Found modal (`[data-testid="spreadsheet-not-found-modal"]`). | High (Cloud users permanently blocked if modal fails to render) | Uncovered in Tiers 1–4 |
| `src/App.tsx` | 140–150 | **Remote Metadata Version Conflict Detection**: Active project with `version: 1` fetches `/metadata/${activeProject.id}`. When remote `version > 1`, `showConflictModal(true)` renders the Conflict Detected modal (`[data-testid="conflict-modal"]`). | High (Silent overwrite of multi-device changes) | Uncovered in Tiers 1–4 |
| `src/context/AuthContext.tsx` | 84–88 | **OAuth Hash Error URL Parameter (`error=access_denied`)**: Navigating with `#error=access_denied` in hash triggers `setAuthErrorToast('Access Denied')`. | Medium (Silent OAuth failure) | Uncovered in Tiers 1–4 |
| `src/context/AuthContext.tsx` | 166–170 | **Offline Mock Login Detection**: Attempting `loginAsMock()` when `navigator.onLine === false` sets `authErrorToast('You are currently offline')` while still provisioning local session. | Low-Medium (Confusing UX during network drops) | Uncovered in Tiers 1–4 |
| `src/services/storage.ts` | 191–222 | **Corrupted Project JSON Recovery**: If `localStorage.getItem('expense_projects')` is corrupted JSON or non-array JSON, `ensureInitialized()` resets storage and flags `expense_corrupt_recovered = 'true'`, triggering Demo User auto-recovery in `AuthContext`. | Critical (White screen of death on JSON syntax error) | Uncovered in Tiers 1–4 |
| `src/App.tsx` & `storage.ts` | 343–355 | **Storage Quota Exceeded Read-Only Fallback**: Attempting `handleSaveBudgets` when localStorage quota is exceeded shows error toast `"Storage quota exceeded. Session is now read-only."`. | High (Uncontrolled crash on storage quota exhaustion) | Uncovered in Tiers 1–4 |

---

## 3. Detailed Failure Mode & Attack Surface Analysis

### 3.1 State Transitions & Remote Sync Edge Cases (`App.tsx`)
1. **Email Report Dispatch Timeout Rollback**:
   - **Mechanism**: `handleLockCurrentMonth` optimistic lock save -> `fetch('/gmail/v1/users/me/messages/send')`. If status is `408`, calls `storageAdapter.saveLock(activeProject.id, { month: selectedMonth, locked: false })` and triggers toast `"Lock failed: email report could not send"`.
   - **Adversarial Test Case**: Mock route `/gmail/v1/users/me/messages/send` with HTTP 408, click Lock Month, verify status indicator reverts to Unlocked and error toast is displayed.

2. **Spreadsheet Deletion / 404 Modal Trap**:
   - **Mechanism**: On mount/refresh, if `activeProject.spreadsheetId === 'sheets-123'`, it checks `/spreadsheets/sheets-123`. A `404` response renders `[data-testid="spreadsheet-not-found-modal"]`.
   - **Adversarial Test Case**: Preseed project with `spreadsheetId: 'sheets-123'`, route `/spreadsheets/sheets-123` to return 404, assert modal appears with title "Spreadsheet Not Found".

3. **Multi-Client Version Conflict Detection**:
   - **Mechanism**: On refresh, if project has `version: 1`, `fetch('/metadata/${activeProject.id}')` compares remote version against local version. If remote > local, renders `[data-testid="conflict-modal"]`.
   - **Adversarial Test Case**: Preseed project with `version: 1`, mock `/metadata/*` returning `{ version: 2 }`, verify Conflict Detected modal appears.

### 3.2 OAuth Error Routing & Offline Handling (`AuthContext.tsx`)
4. **OAuth Access Denied Callback Hash Handling**:
   - **Mechanism**: When window hash contains `error=access_denied`, `AuthContext.useEffect` catches it and calls `setAuthErrorToast('Access Denied')`.
   - **Adversarial Test Case**: Navigate to `/#error=access_denied`, verify notification toast displays `"Access Denied"`.

5. **Offline Network Mock Login**:
   - **Mechanism**: Calling `loginAsMock()` while `navigator.onLine === false` emits `"You are currently offline"` error toast.
   - **Adversarial Test Case**: Using Playwright `context.setOffline(true)`, trigger mock login and assert `"You are currently offline"` toast appears.

### 3.3 Concurrency & Corrupted LocalStorage Recovery (`storage.ts` & `AuthContext.tsx`)
6. **Corrupted Project JSON Auto-Recovery**:
   - **Mechanism**: When `expense_projects` contains invalid JSON (e.g. `"{corrupt-data"`), `LocalStorageAdapter.ensureInitialized()` purges corrupted keys, writes `expense_projects = '[]'`, and sets `expense_corrupt_recovered = 'true'`. `AuthContext` sees this flag and auto-provisions Demo User session (`demo@example.com`).
   - **Adversarial Test Case**: Inject corrupted JSON into `expense_projects`, load application, assert Demo User is logged in and projects list is reset without application crash.

7. **Storage Quota Exceeded Handling**:
   - **Mechanism**: When saving budgets fails with `QuotaExceededError`, `App.tsx` catches the error and displays `"Storage quota exceeded. Session is now read-only."`.
   - **Adversarial Test Case**: Override `localStorage.setItem` to throw a `QuotaExceededError` when saving budgets, click Save Budgets, assert read-only error toast appears.

---

## 4. Verification Plan
- Implement executable Playwright tests in `tests/specs/tier5_adversarial_part1.spec.ts` covering all 7 scenarios above.
- Ensure Tiers 1–5 build and execute cleanly (`npm run build` and `npx playwright test`).
