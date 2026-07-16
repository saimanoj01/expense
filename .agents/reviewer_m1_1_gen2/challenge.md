## Challenge Summary

**Overall risk assessment**: MEDIUM

Adversarial testing and static analysis were performed to uncover potential failure modes, implicit assumptions, and edge cases in the current implementation.

## Challenges

### Medium Challenge 1: LocalStorage Blocking / Security Restrictions
- **Assumption challenged**: The codebase assumes `localStorage` is always writable and readable without throwing runtime exceptions.
- **Attack scenario**: In browsers configured with strict cookie blocking (e.g. Safari Private Browsing mode or custom profiles), accessing `localStorage.getItem` or `localStorage.setItem` throws security exceptions.
- **Blast radius**: Although some calls like `seedMockDatabase()` are wrapped in try-catch blocks, helper functions like `getProjects()` (Line 230 in `storage.ts`) and others read directly from `localStorage` without try-catch wrapping around the read operation itself. This could crash the application on bootstrap or during view transitions in restricted browser environments.
- **Mitigation**: Wrap all `localStorage` access (reads and writes) in a try-catch, or implement an in-memory fallback adapter that acts as a temporary state store when `localStorage` is unavailable.

### Medium Challenge 2: Non-Standard Transaction Dates Bypassing Monthly Locks
- **Assumption challenged**: The codebase assumes `transaction.date` is formatted uniformly as `YYYY-MM-DD`.
- **Attack scenario**: If the frontend or an external CSV import inserts transaction dates in a non-standard format (such as US slashes `05/10/2026` or date objects), the lock check `transaction.date.substring(0, 7)` will result in a string (like `05/10/2`) that does not match the dashboard lock month format `YYYY-MM` (e.g. `2026-05`).
- **Blast radius**: The monthly lock check will evaluate to `false`, allowing the transaction to be saved or modified in a locked period, effectively bypassing the monthly lock rules.
- **Mitigation**: Enforce date validation and normalization within the `saveTransaction` method of the storage adapter to ensure dates are always normalized to `YYYY-MM-DD` before extracting the substring.

### Low Challenge 3: Incomplete/Placeholder Chart Visualizations
- **Assumption challenged**: The E2E tests assume visual/SVG charts render actual data structures (like paths and bars).
- **Attack scenario**: Running E2E tests on the current mock dashboard.
- **Blast radius**: Because the pie chart does not draw SVG `<path>` elements (it only draws a `<circle>`), and because the budget bars do not contain the base classes `.budget-bar` or `.actual-bar`, the corresponding Playwright tests will immediately fail.
- **Mitigation**: Update the SVG mock rendering in `App.tsx` to include base selector classes and mock SVG path structures.

## Stress Test Results

- **Corrupted LocalStorage Payload** → Expected: System catches parsing errors, wipes all keys prefixed with `expense_`, and seeds defaults → Actual: System safely catches errors, calls `clearAllExpenseKeys()` and `seedMockDatabase()`, resetting storage context cleanly. → **PASS**
- **Negative amount in saveTransaction** → Expected: Rejected by validation → Actual: Handled by client UI, but not validated inside `storage.ts` adapter itself. A direct adapter call can write a negative transaction. → **FAIL** (potential adapter vulnerability)
- **Month locking on May 2026, updating transaction in May 2026 to June 2026** → Expected: Thrown exception due to original month being locked → Actual: Correctly checked `isOriginalLocked` and threw exception. → **PASS**

## Unchallenged Areas

- **Google Drive / Sheets API Sync** — reason not challenged: The integration adapters are stubs (throwing not-implemented errors) since real Google OAuth and Sheets sync are scheduled for Milestone 4.
