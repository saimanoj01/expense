---
name: expense-ingest
description: Automated and interactive transaction ingestion skill for the Nebula Expense Tracker. Activate when the user wants to import, sync, or add transactions from Bilt (Plaid JSON/sync), Amazon Store Card (order/shipment emails, Synchrony statements), CSVs, receipts, or natural language into the expense tracker with automatic deduplication, cross-source enrichment, multi-item splitting, and 3-stage categorization.
---

# Nebula Expense Tracker — Transaction Ingestion Skill (`expense-ingest`)

Use this skill whenever the user or an automation wants to ingest transactions into the Nebula Expense Tracker (`/home/antigravity/saimanoj01/expense`).

## Core Philosophy: "Optimistic Commit, Flag Only Doubts"

- **Automated Mode (`triggerMode: 'automated'`)**:
  - Transactions **never** wait in a staging queue for approval. Every valid transaction is immediately committed with its best-guess category and spending bucket (`fixed` | `flexible` | `non-monthly`) so dashboards and budgets stay up to date in real time.
  - Only transactions with genuine ambiguity receive the `'needs-review'` label and structured `meta.review` metadata (`reason`: `'duplicate' | 'category' | 'amount-mismatch' | 'voided'`).
- **Interactive Mode (`triggerMode: 'interactive'`)**:
  - Potential duplicates return `status: 'needs_confirmation'` before committing so the user or UI can confirm whether to keep or skip them.

---

## End-to-End Ingestion Workflow

### Step 1: Normalize Producer Data into `RawTransactionInput[]`

Convert the upstream source into the canonical `RawTransactionInput` array (see [`references/ingest_api_contract.md`](references/ingest_api_contract.md) for the full TypeScript contract):

1. **Bilt Card (Plaid `/transactions/sync` JSON)**:
   - Map `added` and `modified` items to `op: 'upsert'`:
     - `externalId`: `tx.transaction_id`
     - `supersedesExternalId`: `tx.pending_transaction_id ?? undefined` (automatically upgrades pending transactions to posted in place without duplicating)
     - `date`: `tx.authorized_date || tx.date` (`YYYY-MM-DD`)
     - `description`: `tx.name`
     - `merchant`: `tx.merchant_name ?? undefined`
     - `amount`: `tx.amount`
     - `categoryHint`: `tx.personal_finance_category?.detailed || tx.personal_finance_category?.primary`
     - `metadataRichness`: `'medium'`
   - Map `removed` items to `op: 'remove'`:
     - `externalId`: `removedTx.transaction_id`
   - *Note*: The CLI script (`scripts/ingest_transactions.py`) also accepts raw Plaid `{ added, modified, removed }` JSON directly and performs this mapping automatically.

2. **Amazon Order / Shipment Confirmation Emails (`sourceId: 'amazon-email'`)**:
   - Extract Order ID (`orderId`, e.g., `"112-3456789-0123456"`), shipment/order total (`amount`), date (`YYYY-MM-DD`), and `items: [{ title, price, quantity, categoryHint }]`.
   - Set `externalId` to the Shipment ID or Order ID, `merchant: 'Amazon'`, `metadataRichness: 'high'`.
   - The engine automatically groups items that share the same `(category, subCategory, spendingBucket)` into a single consolidated row, or splits across distinct categories using **Largest-Remainder cents allocation** (`allocateLargestRemainderCents`) so split rows always sum to the exact penny total.

3. **Amazon Synchrony Store Card Statement (`sourceId: 'amazon-synchrony'`)**:
   - Map statement lines (`"AMZN Mktp US*..."`, `"AMAZON.COM*..."`, `"PAYMENT - THANK YOU"`) with `metadataRichness: 'low'`.
   - If the corresponding Amazon order email already arrived (within ±4 days, ±\$0.01), the statement row automatically merges (`status: 'merged_enriched'`) into the itemized row(s) without creating a duplicate.
   - If the statement row arrives **before** the email, it commits immediately as `shopping / shopping-amazon` with `needs-review (category)` and is automatically enriched in place when the email arrives later.

4. **Refunds & Credits**:
   - Refunds are stored with `type: 'income'`, `'refund'` in `labels`, and the **merchant's underlying expense category** (e.g., `shopping` / `shopping-amazon`), **never** `category: 'refund'`. This allows `computeMonthMetrics` and `useBudgets` to net refunds directly against the category's spending.

---

### Step 2: Execute the Ingestion CLI or Programmatic API

#### Option A: Python CLI (`scripts/ingest_transactions.py`)

Run the bundled Python CLI script from `/home/antigravity/saimanoj01/expense` targeting either Google Sheets (`--spreadsheet-id` with `--access-token` or `--service-account`) or a local JSON ledger file (`--state-file`):

```bash
# Option A1: Sync directly to Google Sheets (OAuth token or Service Account JSON)
python3 .agents/skills/expense-ingest/scripts/ingest_transactions.py \
  --input /path/to/payload.json \
  --spreadsheet-id <google-spreadsheet-id> \
  --service-account /path/to/service-account.json \
  --project personal-finances \
  --source bilt-plaid \
  --mode automated

# Option A2: Sync to a local JSON ledger file
python3 .agents/skills/expense-ingest/scripts/ingest_transactions.py \
  --input /path/to/payload.json \
  --project personal-finances \
  --source bilt-plaid \
  --mode automated \
  --state-file /path/to/ledger_state.json
```

Use `--dry-run` to preview the `IngestPlan` without writing to storage, `--format summary` for a Markdown report, or `--skip-llm` for fast offline execution using only Stage 1 (History Memory) + Stage 2 (Enhanced Keyword Rules). Non-dry-run invocations require either `--spreadsheet-id` or `--state-file` so runs never silently write to ephemeral memory.

#### Option B: Programmatic TypeScript API

Import `planIngestion`, `executePlan`, or `ingestTransactions` from [`src/services/ingestion/transactionIngestService.ts`](../../../src/services/ingestion/transactionIngestService.ts):

```ts
import { ingestTransactions } from './src/services/ingestion/transactionIngestService';

const response = await ingestTransactions(
  {
    projectId: 'personal-finances',
    sourceId: 'amazon-email',
    triggerMode: 'automated',
    transactions: rawTransactions,
  },
  storageAdapter
);
```

---

### Step 3: Report Results Concisely to the User

After running an ingestion batch, present a clear summary:
1. **Batch Totals**: Inserted (clean), Inserted (flagged for review), Updated in place (`updated_from_source`), Cross-source enriched (`merged_enriched`), Removed (`removed`), and Skipped (`skipped_exact_duplicate` / `skipped_not_found` / `skipped_tombstoned` / `skipped_before_cutoff`).
2. **Actionable Review Queue (`flaggedTransactions`)**: If any transactions were flagged with `'needs-review'`, list their date, description, amount, best-guess category, and `meta.review.detail` (and `meta.review.reasons` when multiple flags apply) so the user can confirm or adjust them in one click.
