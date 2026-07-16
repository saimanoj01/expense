# Tier 5 Part 2 Adversarial Coverage Hardening - White-Box Gap Report

**Author**: Challenger 2 (`challenger_m6_p2_2`)  
**Date**: 2026-07-16  
**Scope**: `src/App.tsx`, `src/components/`, `src/utils/`, `src/services/storage.ts`, existing Tier 1–4 tests (`tests/specs/tier1_features.spec.ts` – `tier4_scenarios.spec.ts`), and Tier 5 Part 2 adversarial tests (`tests/specs/tier5_adversarial_part2.spec.ts`).

---

## Executive Summary

A systematic white-box audit and empirical stress-test of the Expense Tracker and Budget Planning application revealed **10 confirmed security, data integrity, invariant enforcement, and UI rendering gaps** across five critical areas:
1. **CSV Import Malformed Headers / Injection / Parsing Flaws**
2. **SHA-256 Deduplication Collisions & Batch Boundary Gaps**
3. **Month Locking Invariant Bypass Holes (UI and Storage level)**
4. **SVG Chart Extreme / Zero Numerical Artifacts**
5. **Malicious Input & XSS DOM Attribute Pollution / Omitted Data Fields**

Every finding has been empirically verified and codified into executable Playwright adversarial tests in `tests/specs/tier5_adversarial_part2.spec.ts` (10/10 passing on Chromium).

---

## Detailed Gap Findings Table

| Gap ID | Focus Area | File & Line Reference | Verified Empirical Behavior | Severity / Blast Radius |
|---|---|---|---|---|
| **GAP-01** | CSV Import | `src/App.tsx:499-500` | Naive `line.split(',')` splits inside quoted CSV fields (e.g., `"Dinner, drinks"` -> `"Dinner` & `drinks"`), corrupting column alignment and numeric parsing. | **High** — Silently truncates descriptions or imports `NaN`/`0.00` amounts for quoted entries. |
| **GAP-02** | CSV Import | `src/App.tsx:524-549` | `existingHashes` is initialized once before iterating over `csvRawRows` and never updated with newly parsed rows. Within-batch identical rows bypass duplicate detection entirely. | **High** — Batch CSV imports containing repeated rows import duplicates without warning. |
| **GAP-03** | CSV Import | `src/App.tsx:505` | Quoted CSV header names (e.g., `"Date"`) fail `/^date$/i.test(h)`. State `mapDateCol` remains `''`, while DOM `<select>` defaults to the first option `"\"Date\""`, creating state-DOM desynchronization. | **Medium** — CSV wizard column auto-mapping breaks on RFC 4180 quoted CSV headers. |
| **GAP-04** | SHA-256 Deduplication | `src/App.tsx:14-21` | `computeTxHash` hashes raw exact casing (`description.trim()`). Casing differences (`"Whole Foods"` vs `"whole foods"`) produce completely distinct hashes, bypassing deduplication. | **Medium** — Bank statement transactions differing only in capitalization bypass deduplication. |
| **GAP-05** | Month Locking | `src/App.tsx:1117` | `!isCurrentMonthLocked` hides Edit/Delete buttons only when a specific month is selected. Setting month filter to `"All Months"` (`'all'`) exposes Edit/Delete buttons for locked months. | **High** — UI lock bypass allows users to trigger `saveTransaction` or `deleteTransaction` errors on locked months. |
| **GAP-06** | Month Locking | `src/services/storage.ts:385` | `saveBudgets(projectId, budgets)` in `LocalStorageAdapter` enforces no month-lock check at storage layer; budgets can be overwritten via storage adapter in locked months. | **High** — Storage layer fails to enforce immutable audit locks on budget caps. |
| **GAP-07** | SVG Charting | `src/App.tsx:1253,1272` | `chart-svg-budget` computes default bar heights via `Math.min(...) || 10` and `|| 5`. When both Budget and Spent are 0, non-zero bars of height 10 and 5 are rendered. | **Medium** — Misleading visualization showing active budget utilization when category has zero budget and zero spending. |
| **GAP-08** | SVG Charting | `src/App.tsx:1303` | When total expenses equal `0`, SVG pie chart renders placeholder `<text>No data available</text>`, but does not communicate whether budget caps exist. | **Low** — Minor visualization ambiguity. |
| **GAP-09** | Malicious Input / XSS | `src/App.tsx:1172` | Raw category names containing special characters (`Food <script>`) pollute `data-testid` attributes (`data-testid="edit-category-Food <script>-btn"`), causing DOM selector fragility. | **Medium** — Breaks QA automation and exposes raw unencoded DOM attribute strings. |
| **GAP-10** | Data Visibility | `src/App.tsx:1098-1106` | Transaction `notes` field is accepted in forms and persisted in storage (`LocalStorageAdapter`), but is omitted from UI transaction row rendering. | **Medium** — Users cannot inspect or audit sensitive memo content added to transactions. |

---

## Adversarial Test Suite Coverage (`tier5_adversarial_part2.spec.ts`)

- **1. CSV Import Vulnerabilities & Edge Cases**:
  - `1.1 Quoted CSV fields split incorrectly on commas inside quotes` (`GAP-01`)
  - `1.2 Within-batch identical CSV rows bypass duplicate detection` (`GAP-02`)
  - `1.3 CSV import with quoted header fails automatic Date column mapping` (`GAP-03`)
- **2. SHA-256 Deduplication Boundaries**:
  - `2.1 Casing differences in Description create distinct SHA-256 hashes bypassing deduplication` (`GAP-04`)
- **3. Month Locking Invariants & Bypass Holes**:
  - `3.1 UI month filter set to "All Months" bypasses isCurrentMonthLocked hiding of edit/delete buttons` (`GAP-05`)
  - `3.2 Storage adapter saveBudgets allows overwriting budgets for locked months` (`GAP-06`)
- **4. SVG Chart Zero & Extreme Numerical Behaviors**:
  - `4.1 Zero Budget and Zero Spent render placeholder bars of height 10 and 5` (`GAP-07`)
  - `4.2 Zero total expenses displays "No data available" in SVG pie chart` (`GAP-08`)
- **5. Malicious Input & XSS Boundary Handling**:
  - `5.1 Special characters in category name pollute data-testid selector attributes` (`GAP-09`)
  - `5.2 Transaction Notes field is persisted in storage but omitted from UI transaction row rendering` (`GAP-10`)

---

## Verification Method

Run the executable Playwright test suite:
```bash
npx playwright test tests/specs/tier5_adversarial_part2.spec.ts --project=chromium
```
Expected result: `10 passed` verifying all empirical adversarial findings.
