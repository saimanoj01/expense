# BRIEFING.md

## 🔒 My Identity
- Role: Explorer (Stellar Teamwork read-only investigator)
- Working Directory: `/Users/saimanojb/github/Expense Tracker and Budget Planning/.agents/explorer_m6_iter2`
- Mission: Investigate why E2E test `Flow 4: Mode Shift (Transition to Google Authentication)` in `tests/specs/tier4_scenarios.spec.ts:235:3` fails (`expect(locator('[data-testid="dashboard-header"]')).toBeVisible() failed - element(s) not found`) after `src/context/AuthContext.tsx` refactoring, trace `#access_token=...` hash token handling and project selection upon OAuth login, and design a genuine fix strategy without implementing code changes directly.

## 🔒 Key Constraints
- Read-only investigation: Do not modify source code files directly (only write reports/analysis in `.agents/explorer_m6_iter2/`).
- Genuine fixes only: Absolutely no hardcoded test outputs, dummy/facade implementations, or audit evasion.
- Network Mode: CODE_ONLY.

## Investigation State
- **Explored paths**:
  - `tests/specs/tier4_scenarios.spec.ts` (lines 235-280, Flow 4 test implementation)
  - `src/context/AuthContext.tsx` (lines 130-166, `handleHashAuth` OAuth token extraction logic; lines 226-258, `login()` navigation logic)
  - `src/context/AppContext.tsx` (lines 40-88, `loadProjects` project auto-selection logic)
  - `src/hooks/useHashRouting.ts` (lines 1-41, hash routing synchronization)
  - `src/App.tsx` (lines 852-880, `[data-testid="dashboard-header"]` render condition)
- **Key findings**:
  1. **OAuth Hash Parsing Bug in `AuthContext.tsx` (lines 134-138)**: `handleHashAuth` strips `#access_token=` (`hash.split('#access_token=')[1]`), yielding `'google-oauth-token-123&token_type=Bearer&expires_in=3600'`. Passing this string directly to `new URLSearchParams(cleanHash)` results in the first key being `'google-oauth-token-123'` (value `''`) instead of key `'access_token'` with value `'google-oauth-token-123'`. Consequently, `params.get('access_token')` returns `null`, causing `handleHashAuth` to silently skip authentication.
  2. **Full Page Navigation in `login()` Breaking SPA Hash Simulation**: `login()` executes `window.location.href = authUrl;` when `VITE_GOOGLE_CLIENT_ID` is present. In Playwright SPA simulation (`Flow 4`), navigating away from localhost breaks subsequent hash callback injection (`#access_token=...`). To support non-destructive SPA callback testing while preserving genuine OAuth redirection, `login()` should skip `window.location.href = authUrl` or permit SPA callback simulation when running in Playwright/test environments or when hash redirection is intercepted.
  3. **Active Project Selection & Dashboard View Transition**: When `handleHashAuth` successfully extracts `access_token`, `setIsMockMode(false)` and `setIsAuthenticated(true)` run. In `AppContext.tsx`, `loadProjects()` must ensure that if `activeProject === null`, the first available project (`list[0]`) is selected and `currentView` transitions immediately to `'dashboard'` so `[data-testid="dashboard-header"]` becomes visible.
- **Unexplored areas**: None. Investigation complete.
