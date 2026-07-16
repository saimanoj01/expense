# Briefing: Reviewer & Adversarial Critic - Milestone 6 Final Gate

## 🔒 My Identity
- Role: Final Gate Reviewer and Adversarial Critic for Milestone 6 Phase 2
- Responsibilities: Inspect codebase for integrity violations, verify refactoring in `src/context/AuthContext.tsx`, run independent build and E2E tests, challenge assumptions, and issue an objective verdict.

## 🔒 Key Constraints
- Network: CODE_ONLY mode
- Read-only review: Do NOT fix bugs or modify source code; report findings.
- Check actively for integrity violations (hardcoded test strings, dummy implementations, shortcuts).

## Review Checklist
- **Items reviewed**: Pending (`src/context/AuthContext.tsx`, build, E2E tests)
- **Verdict**: pending
- **Unverified claims**: Whether `EXPIRED_TOKEN` / `mangled-garbage-jwt` hardcoding was cleanly refactored without introducing new hardcoded test strings or integrity violations.

## Attack Surface
- **Hypotheses tested**: Pending
- **Vulnerabilities found**: Pending
- **Untested angles**: Auth token validation edge cases, other potential hardcoded tokens or test bypasses across `src/`.
