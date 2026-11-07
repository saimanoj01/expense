---
name: expense-ingest
description: Automated and interactive transaction ingestion skill for the Nebula Expense Tracker. Activate when the user wants to import, sync, or add transactions from Google Wallet (Plaid), Bilt (Plaid JSON/sync), Amazon Store Card (order/shipment emails, Synchrony statements), CSVs, receipts, or natural language into the expense tracker with automatic deduplication, 7-day rolling lookback, pending-to-settled upgrades, cross-source enrichment, multi-item splitting, and 3-stage categorization.
---
# Nebula Expense Tracker — Transaction Ingestion Skill (`expense-ingest`)

Use this skill whenever the user or a scheduled automation wants to ingest or reconcile transactions into the Nebula Expense Tracker (`/home/antigravity/saimanoj01/expense`).

- **Default Cloud Target Spreadsheet**: **Nebula Expense - PriyMan** (`1Whmjhktu_sgdw9WYFYx9JydpB61JU2RGuCm7AT_USLY`, overridable via `--spreadsheet-id` or `NEBULA_SPREADSHEET_ID`)
- **Canonical Sheet Range**: `Transactions!A:L` (12 columns: `id, date, category, subCategory, amount, type, description, notes, labels, hash, spendingBucket, meta`). Readers also accept legacy 11-column (`A:K`) rows and upgrade them to `A:L` on write.

## Core Philosophy: "Optimistic Commit, Flag Only Doubts"

- **Automated Mode (`triggerMode: 'automated'`)**:
  - Transactions **never** wait in a staging queue for approval. Every valid transaction is immediately committed with its best-guess category and spending bucket (`fixed` | `flexible` | `non-monthly`) so dashboards and budgets stay up to date in real time.
  - Only transactions with genuine ambiguity receive the `'needs-review'` label and structured `meta.review` metadata (`reason`: `'duplicate' | 'category' | 'amount-mismatch' | 'voided'`).
- **Interactive Mode (`triggerMode: 'interactive'`)**:
  - Potential duplicates return `status: 'needs_confirmation'` before committing so the user or UI can confirm whether to keep or skip them.

---

## Step 1: Producer Mapping & Multi-Account Rules

See [`references/ingest_api_contract.md`](references/ingest_api_contract.md) for the TypeScript contract and [`references/wallet_rules.json`](references/wallet_rules.json) for the machine-readable Google Wallet rule table.

### 1. Google Wallet (`sourceId: 'gpay-plaid'`) — Daily Sync Producer

Google Wallet's transaction feed does not expose persistent Plaid `transaction_id`s (its `id` column is a per-query `1..N` counter), and bank ACH pulls / weekend card charges often settle 2–4 days after the transaction date. Always apply these deterministic rules:

| Rule Type | Pattern in Google Wallet | Target Nebula Mapping |
| :--- | :--- | :--- |
| **Account Labels** | `7702` → `bilt` (`Bilt Palladium (7702)`) • `9666` → `manoj bofa` (`BofA SafeBalance (9666)`) • `8885` → `priyanka chase` (`Chase Total Checking (8885)`) • `6823` → `priyanka chase` (`Chase Savings (6823)`) • `4692` → `bofa atmos` (`BofA Atmos Ascent Visa (4692)`) • `4359` → `wells fargo` (`Wells Fargo Checking (4359)`) • `4558` → `wells fargo` (`Wells Fargo Way2Save (4558)`) | Added to `labels` JSON array alongside `spendingBucket` (`fixed` / `flexible` / `non-monthly`) and stored in `meta.account` |
| **Bilt Housing Pass-Through & Month-End Normalization** | • `Bilt Housing Payment` on `7702` = `expense` (`housing` / `housing-mortgage`, `fixed`)<br>• `Payment - Bilt Housing` on `7702` (Refund/Credit) = `transfer` (`housing` / `housing-mortgage`)<br>• `BILT CARD DES:HOUSING...` on `9666` (Purchase) = `transfer` (`description: "Bilt"`, `housing` / `housing-mortgage`, raw descriptor preserved in `notes`)<br>• **Month-End Rule (`days 28..31` & `amount >= $1,000`)**: When `Bilt Housing Payment` or `Payment - Bilt Housing` posts on days `28..31` of month `M` for `>= $1,000` (excluding smaller HOA charges like `$352.95`), normalize its effective `date` to `YYYY-(M+1)-01`, append `• Posted YYYY-MM-DD` to `notes`, and store both `raw_hash[:16]` and `norm_hash[:16]` in `meta.aliasHashes`. | Counts each month's mortgage/rent **once** in its target calendar month and treats the two Bilt Protect ACH pass-through legs as `transfer` |
| **Credit Card Bill Payoffs** | `BILT CARD PMT` (`8885`), `AMAZON CORP SYF PAYMNT` (`8885`), `Mobile Banking payment to CRD 4692` (`9666`), `Payment` (`7702`), `PENDING PAYMENT` (`4692`) | Always `type: 'transfer'`, `category: 'transfers'`, `subCategory: 'transfers-cc'` (even when Google Wallet labels the bank debit `Purchase`) |
| **Known Recurring ACHs & Utilities** | • `WOODINVILLE 8609257058 PPD ID: 1470259040` (`8885`) → `expense` / `child-care` (`fixed`)<br>• `ZG - Your Rental Rent-#K5-7 ST-...` (`4359`) → `income` / `income-investment` (strip `ST-<id>` suffix when matching history)<br>• `ACH CREDIT GOOGLE LLC PAYROLL` / `Google` payroll (`9666`) → `income` / `income-salary`<br>• `Puget Sound Energy` → `utilities` / `utilities-gas` (`fixed`)<br>• `Snohomish County Pud` → `utilities` / `utilities-electric` (`fixed`)<br>• `Google Fi` → `utilities` / `utilities-phone` (`fixed`)<br>• `Eastside Exterminators` → `housing` / `housing-hoa` (`fixed`) | High-confidence Stage 1/2 rules so recurring bills and income never fall back to `misc` |
| **Category-Netted Refunds** | `Status == 'Refund'` or negative charge (e.g., `-$16.77` `Google One`) | `type: 'income'`, `'refund'` in `labels`, and the **merchant's underlying expense category** (`entertainment` / `entertainment-subs`), **never** `category: 'refund'` |
| **Deterministic SHA-256 Hash** | `sha256(f"{date}|{description.strip().lower()}|{amount:.2f}|{type.strip().lower()}")` | Matches `computeTxHash` in `src/utils/crypto.ts` for idempotent re-runs |

#### 7-Day Rolling Lookback (`T-7` to `Today`) & Pending → Settled Lifecycle
Always pull the **last 7 days (`T-7` to `Today`)** from Google Wallet and compare against the **last 14 days** of sheet rows (plus full sheet history for Stage 1 History Memory and exact hash deduplication):
1. **Tombstone Check**: Check `Notes!A:B` (`__meta_ingest_state__` and `__meta_ingest_tombstones_1__..5__`). Skip any row whose `externalId` or 16-char hash prefix (`hash[:16]`) is tombstoned (`skipped_tombstoned`) so user-deleted rows are never resurrected during a 7-day lookback.
2. **Exact Hash Match (Occurrence-Aware)**:
   - Each existing sheet row can be claimed at most **once** per batch (`claimed_existing_ids`).
   - If the unclaimed existing sheet row is `Pending` (`meta.provisional == true` or `"pending"` in `notes`/`description`) and the incoming Google Wallet row is now `Purchase` (settled), **upgrade in place** (`updated_pending_to_settled`): strip `Pending` from `notes`, update `"Pending..."` descriptions, and set `meta.provisional = false`.
   - If a second identical charge arrives in the same batch after the existing row was already claimed (or created in the same batch), commit and flag it (`inserted_flagged` with `reason: 'duplicate'`) rather than silently dropping it.
3. **Pending → Settled with Settlement Date Drift (±3 Days)**:
   - Same merchant (or both `transfers / transfers-cc`) + compatible account + same `type` + `abs(amount_diff) <= $0.01` within `±3` days where existing row is `Pending` and incoming row is `Purchase` → **upgrade closest unclaimed row in place** (`updated_pending_to_settled`), update `date`, `description`, and `hash`, and append old `hash[:16]` to `meta.aliasHashes`.
4. **Restaurant Tip Drift (`0` to `+3` Days)**:
   - Same merchant + compatible account on a `Pending` expense row where the settled `Purchase` amount increased within restaurant tip bounds (`max($1.00, 1%)` to `max($5.00, 35%)`) within `+3` days → **update closest unclaimed row's `amount`, `date`, `notes`, and `hash` in place** (`merged_tip_adjusted`), preserving old `hash[:16]` in `meta.aliasHashes`.

### 2. Bilt Card (Raw Plaid `/transactions/sync` JSON)
- Map `added` and `modified` items to `op: 'upsert'` (`externalId: tx.transaction_id`, `supersedesExternalId: tx.pending_transaction_id ?? undefined`, `date: tx.authorized_date || tx.date`, `description: tx.name`, `merchant: tx.merchant_name ?? undefined`, `amount: tx.amount`).
- Map `removed` items to `op: 'remove'` (`externalId: removedTx.transaction_id`).

### 3. Amazon Order Emails (`sourceId: 'amazon-email'`) & Synchrony Statements (`sourceId: 'amazon-synchrony'`)
- Statement lines (`"AMZN Mktp US*..."`, `"Amazon Marketplace"`) without itemization commit immediately as `shopping / shopping-amazon` with `needs-review (category)`.
- Optional cross-source enrichment (when Amazon order emails are provided) matches within `±4` days and `±$0.01`, splitting multi-category orders via Largest-Remainder cents allocation (`allocateLargestRemainderCents`) and clearing the `category` review flag automatically.

---

## Step 2: Execute Ingestion (Cloud Native vs. Local Repo CLI)

### Option A: Cloud Native Google Wallet → Google Sheets Workflow (Scheduled Gemini Tasks & Plugin CLI)

Use [`scripts/wallet_reconcile.py`](scripts/wallet_reconcile.py) (100% Python 3 standard library; no Node.js or external packages required) together with the connected `gsheets` / `gdrive` CLIs:

1. **Materialize Bundled Skill Scripts (When Repo Is Not Mounted)**:
   If `/home/antigravity/saimanoj01/expense` is not present in the VM, call `get_skill_resources(name="expense-ingest", filenames=["scripts/wallet_reconcile.py", "references/wallet_rules.json"])` and write them to `/tmp/expense-ingest/scripts/wallet_reconcile.py` and `/tmp/expense-ingest/references/wallet_rules.json`.

2. **Export Sheet & Run the Reconciler**:
```bash
# 1. Export current Transactions (A:L or A:K) and Notes from Nebula Expense - PriyMan
gsheets readonly export 1Whmjhktu_sgdw9WYFYx9JydpB61JU2RGuCm7AT_USLY /tmp/nebula_transactions.tsv --format tsv --sheet Transactions
# (Or read as a 2D JSON grid: gsheets readonly read 1Whmjhktu_sgdw9WYFYx9JydpB61JU2RGuCm7AT_USLY 'Transactions!A1:L2000' --json > /tmp/nebula_transactions.json)
gsheets readonly read 1Whmjhktu_sgdw9WYFYx9JydpB61JU2RGuCm7AT_USLY 'Notes!A1:B50' --json > /tmp/nebula_notes.json

# 2. Run the pure-Python 7-day rolling reconciler to produce a gsheets batch file + Morning Digest
python3 .agents/skills/expense-ingest/scripts/wallet_reconcile.py \
  --input /tmp/wallet_7d.json \
  --transactions-tsv /tmp/nebula_transactions.tsv \
  --notes-json /tmp/nebula_notes.json \
  --lookback-days 7 \
  --batch-out /tmp/gsheets_batch.json \
  --format summary

# 3. Apply the in-place updates, appended rows (A:L), and updated __meta_ingest_state__ note in one batch
gsheets mutate batch 1Whmjhktu_sgdw9WYFYx9JydpB61JU2RGuCm7AT_USLY -f /tmp/gsheets_batch.json
```

### Option B: Local Repo Python → Node Bridge (`scripts/ingest_transactions.py`)

When running inside `/home/antigravity/saimanoj01/expense` with **Python 3** and **Node.js ≥ 24**:

```bash
# Sync to Google Sheets (OAuth token or Service Account JSON)
python3 .agents/skills/expense-ingest/scripts/ingest_transactions.py \
  --input /path/to/payload.json \
  --spreadsheet-id 1Whmjhktu_sgdw9WYFYx9JydpB61JU2RGuCm7AT_USLY \
  --service-account /path/to/service-account.json \
  --project personal-finances \
  --source bilt-plaid \
  --mode automated

# Sync to a local JSON ledger file
python3 .agents/skills/expense-ingest/scripts/ingest_transactions.py \
  --input /path/to/payload.json \
  --project personal-finances \
  --source bilt-plaid \
  --mode automated \
  --state-file /path/to/ledger_state.json
```

Use `--dry-run` to preview the `IngestPlan`, `--format summary` for a Markdown report, `--skip-llm` for offline Stage 1 + Stage 2 execution, or `--verbose` for full tracebacks.

---

## Step 3: Morning Sync Digest & Reporting (`0 8 * * *` / 8:00 AM PT)

After running a daily or interactive ingestion batch, present a concise summary:
1. **Batch Totals**: Inserted (clean), Inserted (`needs-review`), Upgraded Pending → Settled (`updated_pending_to_settled` / `updated_from_source`), Restaurant Tip Adjusted (`merged_tip_adjusted`), Cross-source enriched (`merged_enriched`), and Skipped (`skipped_exact_duplicate` / `skipped_tombstoned`).
2. **Newly Ingested & Updated Rows**: Table of only the newly added or settled/tip-updated rows from this run.
3. **Month-to-Date Snapshot (`expense-qna`)**: Net expenses (gross minus category-netted refunds), fixed vs. flexible breakdown, total income, and net cash flow.
4. **Actionable Review Queue (`flaggedTransactions`)**: List any `'needs-review'` rows with their date, description, amount, best-guess category, and review reason so the user can confirm or adjust them in one click.
