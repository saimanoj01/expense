# Nebula Expense Tracker — Ingestion API & Reconciliation Contract

This reference defines the data structures, 9-step reconciliation ladder, and 3-stage categorization waterfall implemented in [`src/services/ingestion/transactionIngestService.ts`](../../../src/services/ingestion/transactionIngestService.ts).

---

## 1. Request & Input Schema (`IngestRequest`)

```ts
export interface RawTransactionItem {
  title: string;
  price: number;
  quantity?: number;
  categoryHint?: string;
}

export interface RawTransactionInput {
  externalId?: string;           // Stable upstream ID (Plaid transaction_id, Amazon Order/Shipment ID)
  supersedesExternalId?: string; // Plaid pending_transaction_id for pending -> posted handoff
  op?: 'upsert' | 'remove';      // Default 'upsert'; use 'remove' for voided pending authorizations
  date: string;                  // YYYY-MM-DD or MM/DD/YYYY
  description: string;           // Statement descriptor or merchant description
  merchant?: string;             // Optional normalized merchant name
  amount: number;                // Dollar amount
  type?: 'expense' | 'income' | 'transfer';
  items?: RawTransactionItem[];  // Multi-item order details for consolidated category splitting
  categoryHint?: string;         // Upstream hint (e.g., Plaid personal_finance_category)
  category?: string;             // Explicit category ID override
  subCategory?: string | null;   // Explicit subcategory ID override
  spendingBucket?: 'fixed' | 'flexible' | 'non-monthly' | null;
  labels?: string[];
  notes?: string;
  metadataRichness?: 'high' | 'medium' | 'low';
  provisional?: boolean;         // True for pre-tip real-time wallet taps
  orderId?: string;              // Shared order identifier for split groups
  account?: string;              // Optional payment instrument / card identifier (e.g., 'bilt', 'amazon-store-card')
}

export interface IngestRequest {
  projectId: string;
  sourceId: string;              // e.g. 'bilt-plaid', 'amazon-email', 'amazon-synchrony'
  triggerMode: 'automated' | 'interactive';
  transactions: RawTransactionInput[];
  options?: {
    confidenceThreshold?: number;     // Default 0.70
    crossSourceWindowDays?: number;   // Default 4
    autoSplitItems?: boolean;         // Default true
    dryRun?: boolean;                 // Default false
    skipLlm?: boolean;                // Default false
    syncStartDate?: string;           // YYYY-MM-DD cutoff watermark
    matchProvisionalTipDrift?: boolean; // Default false
    nowIso?: string;                  // Deterministic timestamp override for pure planning/tests
    idGenerator?: () => string;       // Deterministic ID generator override for pure planning/tests
  };
}
```

---

## 2. Transaction Provenance Metadata (`TxMeta` — Column L)

System provenance is stored on `Transaction.meta` (persisted in Column L of `Transactions!A:L` in Google Sheets and `expense_txs_<projectId>` in `localStorage`) so visible `#labels` remain uncluttered:

- `sources`: `string[]` — Producers that contributed to this row (e.g., `["amazon-synchrony", "amazon-email"]`).
- `externalIds`: `Record<string, string>` — Per-source upstream IDs (e.g., `{ "bilt-plaid": "plaid_tx_99" }`).
- `account`: `string` — Canonical card/account identifier (`'bilt'`, `'amazon-synchrony'`, or `'amazon-synchrony:1234'`) used to prevent cross-card false merges.
- `aliasHashes`: `string[]` — 16-char prefixes of previous canonical hashes before enrichment, split, or amount updates.
- `orderId`: `string` — Shared order identifier across split child rows.
- `confidence`: `number` (`0.0`–`1.0`).
- `categorizedBy`: `'history' | 'keyword' | 'llm' | 'user' | 'fallback'`.
- `userEdited`: `EditableTxField[]` — Fields manually edited by the user in the UI (`'date' | 'description' | 'amount' | 'category' | 'subCategory' | 'spendingBucket' | 'type' | 'notes'`); **never** overwritten by automated updates or enrichments.
- `review`: `{ reason: ReviewReason, reasons?: ReviewReason[], detail?: string, flaggedAt?: string, resolvedAt?: string }`.

Only `'needs-review'` (when `meta.review` is active) and `'refund'` / `'duplicate-verified'` are added to `Transaction.labels`.

---

## 3. The 9-Step Reconciliation & Matching Ladder

For each incoming `RawTransactionInput`:

1. **`syncStartDate` Cutoff (`skipped_before_cutoff`)**: Ignores historical transactions strictly older than the source's explicit `syncStartDate`.
2. **Deletion Tombstones (`skipped_tombstoned`)**: Checks `ingestState.tombstones` (populated whenever a user deletes a transaction in the UI, and sharded across `__meta_ingest_tombstones_<idx>__` in Google Sheets `Notes!A:B`) against `externalId`, `supersedesExternalId`, and `hash.slice(0, 16)`.
3. **Upstream Void / Cancel (`op === 'remove'` → `removed`, `updated_from_source`, `skipped_tombstoned`, or `skipped_not_found`)**:
   - Finds all matched rows (including `#split-N` children sharing the parent `externalId` or `orderId`).
   - If the matched row(s) have no `meta.userEdited` fields, deletes them cleanly (`status: 'removed'`).
   - If the user already edited any matched row, preserves them and attaches `needs-review` + `review.reason = 'voided'`.
   - If no ledger row matches and the ID is not in `tombstones`, returns `status: 'skipped_not_found'`.
4. **Same-Source Lifecycle Upsert (`updated_from_source` / `skipped_exact_duplicate`)**:
   - Matches existing rows by `meta.externalIds[sourceId] === raw.externalId` or `raw.supersedesExternalId` (including `#split-N` children).
   - If unchanged, skips (`skipped_exact_duplicate`). If date, amount, or description changed, updates in place while preserving any fields in `meta.userEdited` and recording the old hash in `meta.aliasHashes`.
5. **Canonical Hash / `aliasHashes` Match (`skipped_exact_duplicate` / `inserted_flagged`)**:
   - Skips exact re-imports from prior runs.
   - If two identical rows appear on the same day without distinct `externalId`s, `'automated'` mode commits the second row with `needs-review (duplicate)` while `'interactive'` mode returns `needs_confirmation`.
6. **Cross-Source Enrichment & First-Sync Manual/CSV Claiming (`merged_enriched`)**:
   - Matches unclaimed rows (or an existing `meta.orderId` split-group whose sum equals `amount` ±\$0.01) within `±crossSourceWindowDays` (default 4 days) with compatible `account`, matching merchant family, and amount (`±$0.01`).
   - Claims legacy manual/CSV rows on first sync by attaching `meta.sources` and `meta.externalIds`.
   - Enriches opaque descriptors (`"AMZN Mktp US*..."`) with item-level descriptions/categories (`"Amazon: Ceramic Plant Pots"`), or expands a single statement row into $K$ split category rows (suffixing existing `externalIds` with `#split-N`) while reusing the original row's `id` for the first child.
7. **Opt-In Provisional Tip Drift (`merged_tip_adjusted`)**:
   - When `matchProvisionalTipDrift` or `meta.provisional` is active, matches compatible-account, same-merchant charges 0 to +3 days later with tip delta in `[max($1.00, 1%), max($5.00, 35%)]`.
8. **Ambiguous Duplicate Collision (`inserted_flagged` / `needs_confirmation`)**:
   - Same-merchant, same-amount, compatible-account collision within ±2 days that already belongs to `sourceId` when at least one side lacks a distinct `externalId`. Commits with `needs-review (duplicate)` in `'automated'` mode.
9. **Clean or Low-Confidence Insert (`inserted` / `inserted_flagged`)**:
   - Commits immediately; attaches `needs-review (category)` if `confidence < confidenceThreshold` (default `0.70`), `category === 'misc'`, or opaque multi-category marketplace, and/or `needs-review (amount-mismatch)` if item subtotals deviate from total charge by >25%.
