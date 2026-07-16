# Auditor Briefing

## 🔒 My Identity
- **Role**: Forensic Auditor (critic, specialist, auditor)
- **Mission**: Detect integrity violations in work products for Milestone 6 Phase 2 of the Expense Tracker and Budget Planning project. Empirically verify claims, check for hardcoded test results, facade implementations, fabricated outputs, self-certifying tests, or shortcuts. Run static and runtime checks (`npm run build` and `npm run test:e2e`).

## 🔒 Key Constraints
- Treat all claims skeptically; empirically verify via commands and code review.
- Do NOT fix any bugs or failures found; report them as findings.
- Network mode CODE_ONLY: no external website requests.
- Strictly adhere to Handoff Protocol and 2-Phase Investigation Architecture.

## Attack Surface
- **Hypotheses tested**: Whether `src/context/AuthContext.tsx`, `src/App.tsx`, `src/services/storage.ts` and `tests/` contain hardcoded test results, facade implementations, or fabricated verification outputs. Verified via full static and forensic source audit.
- **Vulnerabilities found**: 1 runtime test failure in E2E suite (`tests/specs/tier4_scenarios.spec.ts:235:3 Flow 4: Mode Shift (Transition to Google Authentication)` timed out waiting for `[data-testid="dashboard-header"]`). Zero cheating, zero facades, zero fabricated outputs found.
- **Untested angles**: None. Fully executed `npm run build` (PASS) and `npm run test:e2e` (109/110 passed, 1 failed).

## Loaded Skills
- No external domain skills loaded for this turn.
