import type {
  Transaction,
  Category,
  SpendingBucket,
  ReviewReason,
  IngestState,
} from '../storage';

export interface RawTransactionItem {
  title: string;
  price: number;
  quantity?: number;
  categoryHint?: string;
}

export interface RawTransactionInput {
  /** Stable idempotency ID from upstream (Plaid transaction_id, Amazon Order/Shipment ID, Gmail msg ID) */
  externalId?: string;
  /** For Plaid pending -> posted handoff (`pending_transaction_id`) */
  supersedesExternalId?: string;
  /** Lifecycle operation: default 'upsert'. Set 'remove' when upstream cancels/voids a pending transaction */
  op?: 'upsert' | 'remove';
  /** ISO date YYYY-MM-DD or parseable date string */
  date: string;
  /** Primary description or statement descriptor */
  description: string;
  /** Optional cleaner merchant name if known separately from statement descriptor */
  merchant?: string;
  /** Amount in dollars (signed or unsigned; interpreted via `type` and refund detection) */
  amount: number;
  /** Explicit transaction type if known */
  type?: 'expense' | 'income' | 'transfer';
  /** Optional line items (e.g., Amazon order items) for consolidated category splitting */
  items?: RawTransactionItem[];
  /** Optional upstream category hint (e.g., Plaid personal_finance_category, Amazon department) */
  categoryHint?: string;
  /** Optional explicit category override */
  category?: string;
  /** Optional explicit subCategory override */
  subCategory?: string | null;
  /** Optional explicit spendingBucket override */
  spendingBucket?: SpendingBucket | null;
  /** Optional user/automation labels */
  labels?: string[];
  /** Optional notes */
  notes?: string;
  /** How rich/trustworthy the description & itemization are */
  metadataRichness?: 'high' | 'medium' | 'low';
  /** Optional flag for provisional real-time taps (e.g. Google Wallet pre-tip authorization) */
  provisional?: boolean;
  /** Optional explicit order/group ID (e.g. Amazon Order ID) */
  orderId?: string;
  /** Optional card/account identifier (e.g. 'bilt', 'amazon-synchrony', or card last-4) for cross-source isolation */
  account?: string;
}

export interface IngestOptions {
  /** Minimum LLM confidence before auto-flagging `needs-review` (default: 0.70) */
  confidenceThreshold?: number;
  /** Cross-source date matching window in days (default: 4) */
  crossSourceWindowDays?: number;
  /** Group multi-item orders by resolved category and split across categories (default: true) */
  autoSplitItems?: boolean;
  /** Preview plan without persisting to StorageAdapter (default: false) */
  dryRun?: boolean;
  /** Skip Gemini LLM calls and rely on History + Enhanced Keyword rules only (default: false) */
  skipLlm?: boolean;
  /** Ignore transactions dated strictly before this YYYY-MM-DD cutoff (overrides stored source state if provided) */
  syncStartDate?: string;
  /** Opt-in: allow matching against existing `meta.provisional` rows with +1%..+35% tip drift (default: false) */
  matchProvisionalTipDrift?: boolean;
  /** Optional deterministic ISO timestamp override for pure planning/snapshot tests */
  nowIso?: string;
  /** Optional deterministic ID generator override for pure planning/snapshot tests */
  idGenerator?: () => string;
}

export interface IngestRequest {
  projectId: string;
  /** Identifier for the producer, e.g. 'bilt-plaid', 'amazon-email', 'amazon-synchrony', 'manual-ui', 'cli-agent' */
  sourceId: string;
  /**
   * 'automated': Never blocks on duplicates; skips exact matches, merges cross-source enrichments,
   *              and inserts ambiguous/low-confidence records with `needs-review` flag.
   * 'interactive': Flags duplicates as `needs_confirmation` so the UI can show a confirmation modal.
   */
  triggerMode: 'automated' | 'interactive';
  transactions: RawTransactionInput[];
  options?: IngestOptions;
}

export interface IngestSnapshot {
  existingTransactions: Transaction[];
  categories: Category[];
  ingestState: IngestState;
}

export type IngestRecordStatus =
  | 'inserted'
  | 'inserted_flagged'
  | 'updated_from_source'
  | 'merged_enriched'
  | 'merged_tip_adjusted'
  | 'removed'
  | 'skipped_exact_duplicate'
  | 'skipped_tombstoned'
  | 'skipped_before_cutoff'
  | 'skipped_not_found'
  | 'needs_confirmation';

export interface IngestRecordReport {
  inputIndex: number;
  externalId?: string;
  status: IngestRecordStatus;
  /** Resulting or matched Transaction(s) (multiple if grouped & split across categories) */
  transactions: Transaction[];
  matchedExistingId?: string;
  matchedExistingIds?: string[];
  reviewReason?: ReviewReason;
  reviewDetail?: string;
  confidence: number;
  categorizedBy: 'history' | 'keyword' | 'llm' | 'user' | 'fallback';
}

export type IngestOp =
  | { type: 'insert'; tx: Transaction }
  | { type: 'update'; tx: Transaction; previousId: string }
  | { type: 'delete'; id: string };

export interface IngestPlan {
  sourceId: string;
  triggerMode: 'automated' | 'interactive';
  ops: IngestOp[];
  nextIngestState: IngestState;
  summary: {
    totalInput: number;
    inserted: number;
    insertedFlagged: number;
    updatedFromSource: number;
    mergedEnriched: number;
    mergedTipAdjusted: number;
    removed: number;
    skippedDuplicate: number;
    skippedTombstoned: number;
    skippedBeforeCutoff: number;
    needsConfirmation: number;
  };
  records: IngestRecordReport[];
  flaggedTransactions: Transaction[];
}

export interface IngestResponse extends IngestPlan {
  dryRun: boolean;
}
