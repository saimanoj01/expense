import {
  type Transaction,
  type Category,
  type SpendingBucket,
  type StorageAdapter,
  type TxMeta,
  type TxReviewInfo,
  type EditableTxField,
  type ReviewReason,
  type IngestState,
  DEFAULT_CATEGORIES,
} from '../storage';
import { computeTxHash as generateTransactionHash } from '../../utils/crypto';
import {
  suggestCategory,
  suggestSubCategory,
  suggestSpendingBucket,
  isTransfer,
  detectRefund,
} from '../../utils/categorizer';
import {
  classifyTransactionsWithLLM,
  type ClassifiedResultItem,
} from '../llmCategorizer';
import { resolveTransactionAccount } from '../../utils/transactionTaxonomy';
import type {
  RawTransactionInput,
  IngestRequest,
  IngestSnapshot,
  IngestPlan,
  IngestResponse,
  IngestRecordReport,
  IngestOp,
} from './types';
import {
  getMerchantFamily,
  merchantsMatch,
  historyMerchantsMatch,
  isMultiCategoryMarketplace,
  isOpaqueDescription,
  daysBetween,
  signedDaysBetween,
  normalizeIsoDate,
  allocateLargestRemainderCents,
  resolveCanonicalAccount,
  accountsAreCompatible,
} from './normalizer';

const DEFAULT_CONFIDENCE_THRESHOLD = 0.7;
const DEFAULT_CROSS_SOURCE_WINDOW_DAYS = 4;
const MAX_TOMBSTONES = 2000;
const MAX_RUN_HISTORY = 30;

const REVIEW_PRIORITY: Record<ReviewReason, number> = {
  voided: 5,
  'amount-mismatch': 4,
  'tip-drift': 3,
  duplicate: 2,
  category: 1,
};

function generateId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `tx-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

function shortHash(hash?: string): string {
  return (hash || '').slice(0, 16);
}

function dedupeStrings(arr: string[]): string[] {
  return Array.from(new Set(arr.filter(Boolean)));
}

function resolveMerchantPrefix(raw: RawTransactionInput): string {
  if (raw.merchant?.trim()) return raw.merchant.trim();
  if (getMerchantFamily(raw.description) === 'amazon') return 'Amazon';
  if (raw.description && raw.description.includes(':')) {
    const pre = raw.description.split(':')[0].trim();
    if (pre) return pre;
  }
  return 'Order';
}

function mergeReviewInfo(
  existingReview: TxReviewInfo | undefined,
  newReview: { reason: ReviewReason; detail?: string } | undefined,
  nowIso: string
): TxReviewInfo | undefined {
  if (!newReview) return existingReview;
  if (!existingReview || existingReview.resolvedAt) {
    return {
      reason: newReview.reason,
      reasons: [newReview.reason],
      detail: newReview.detail,
      flaggedAt: nowIso,
    };
  }
  const prevReasons = existingReview.reasons?.length
    ? existingReview.reasons
    : [existingReview.reason];
  const combinedReasons = dedupeStrings([
    ...prevReasons,
    newReview.reason,
  ]) as ReviewReason[];
  combinedReasons.sort(
    (a, b) => (REVIEW_PRIORITY[b] || 0) - (REVIEW_PRIORITY[a] || 0)
  );
  const details = dedupeStrings(
    [existingReview.detail || '', newReview.detail || ''].filter(Boolean)
  );
  return {
    reason: combinedReasons[0],
    reasons: combinedReasons,
    detail: details.join(' | ') || undefined,
    flaggedAt: existingReview.flaggedAt || nowIso,
  };
}

function clearReviewReason(
  existingReview: TxReviewInfo | undefined,
  reasonToClear: ReviewReason,
  nowIso: string
): TxReviewInfo | undefined {
  if (!existingReview || existingReview.resolvedAt) return existingReview;
  const activeReasons = (
    existingReview.reasons?.length
      ? existingReview.reasons
      : [existingReview.reason]
  ).filter(r => r !== reasonToClear);

  if (activeReasons.length === 0) {
    return {
      ...existingReview,
      resolvedAt: nowIso,
    };
  }
  return {
    ...existingReview,
    reason: activeReasons[0],
    reasons: activeReasons,
  };
}

function normalizeTombstoneArray(rawTombstones: unknown): string[] {
  if (Array.isArray(rawTombstones)) {
    return rawTombstones.filter((x): x is string => typeof x === 'string' && Boolean(x));
  }
  if (rawTombstones && typeof rawTombstones === 'object') {
    return Object.keys(rawTombstones);
  }
  return [];
}

/**
 * Records tombstones for user-deleted transactions so automated syncs never
 * resurrect a transaction the user intentionally deleted.
 */
export function recordDeletionTombstones(
  deletedTxs: Transaction[],
  state: IngestState
): IngestState {
  const nextTombstones = normalizeTombstoneArray(state?.tombstones);
  for (const tx of deletedTxs) {
    if (tx.meta?.externalIds) {
      for (const extId of Object.values(tx.meta.externalIds)) {
        if (extId) {
          nextTombstones.push(extId);
          const baseExt = extId.replace(/#split-\d+$/, '');
          if (baseExt !== extId) nextTombstones.push(baseExt);
        }
      }
    }
    if (tx.hash) {
      nextTombstones.push(shortHash(tx.hash));
    }
    if (tx.meta?.aliasHashes) {
      for (const ah of tx.meta.aliasHashes) {
        if (ah) nextTombstones.push(ah);
      }
    }
  }
  const deduped = dedupeStrings(nextTombstones).slice(-MAX_TOMBSTONES);
  return {
    ...state,
    version: state?.version || 1,
    tombstones: deduped,
    sources: state?.sources || {},
    recentRuns: Array.isArray(state?.recentRuns) ? state.recentRuns : [],
  };
}

/**
 * Reverses previously recorded deletion tombstones when a user clicks Undo on a deleted transaction.
 */
export function removeDeletionTombstones(
  tombstonesToRemove: string[],
  state: IngestState
): IngestState {
  if (!tombstonesToRemove.length) return state;
  const removeSet = new Set(tombstonesToRemove);
  const current = normalizeTombstoneArray(state?.tombstones);
  return {
    ...state,
    version: state?.version || 1,
    tombstones: current.filter(t => !removeSet.has(t)),
    sources: state?.sources || {},
    recentRuns: Array.isArray(state?.recentRuns) ? state.recentRuns : [],
  };
}

/**
 * Tracks fields manually edited by the user so future automated upserts or
 * cross-source enrichments never overwrite user overrides.
 * When `oldTx` is undefined (new manual entry), `category` (and present `subCategory` / `spendingBucket`)
 * are marked as user-authored so automated feeds respect them.
 */
export function markUserEditedFields(
  oldTx: Transaction | undefined,
  newTx: Transaction,
  nowIso: string = new Date().toISOString(),
  options?: { autoDerivedBucket?: boolean }
): TxMeta {
  const prevMeta: TxMeta = oldTx?.meta || newTx.meta || {};
  const edited = new Set<EditableTxField>(prevMeta.userEdited || []);
  const hasExplicitNewAccount = Boolean(
    newTx.meta && Object.prototype.hasOwnProperty.call(newTx.meta, 'account')
  );
  const nextAccount = hasExplicitNewAccount ? newTx.meta?.account : prevMeta.account;
  const prevResolvedAccount = resolveTransactionAccount(oldTx) || '';

  if (oldTx) {
    if (oldTx.date !== newTx.date) edited.add('date');
    if (oldTx.description !== newTx.description) edited.add('description');
    if (Math.abs(oldTx.amount - newTx.amount) > 0.001) edited.add('amount');
    if (oldTx.category !== newTx.category) edited.add('category');
    if ((oldTx.subCategory || null) !== (newTx.subCategory || null)) edited.add('subCategory');
    if (
      !options?.autoDerivedBucket &&
      (oldTx.spendingBucket || null) !== (newTx.spendingBucket || null)
    ) {
      edited.add('spendingBucket');
    }
    if (oldTx.type !== newTx.type) edited.add('type');
    if ((oldTx.notes || '') !== (newTx.notes || '')) edited.add('notes');
    if (hasExplicitNewAccount && prevResolvedAccount !== (nextAccount || '')) {
      edited.add('account');
    }
  } else {
    // Manual creation (!oldTx): mark category (and present subCategory/spendingBucket/account) as user-edited
    // so subsequent automated cross-source enrichments preserve the user's chosen classification.
    edited.add('category');
    if (newTx.subCategory) edited.add('subCategory');
    if (newTx.spendingBucket && !options?.autoDerivedBucket) edited.add('spendingBucket');
    if (nextAccount) edited.add('account');
  }

  const categoryEdited =
    edited.has('category') || edited.has('subCategory') || edited.has('spendingBucket');

  const hadLegacyNeedsReview = [
    ...(Array.isArray(oldTx?.labels) ? oldTx.labels : []),
    ...(Array.isArray(newTx.labels) ? newTx.labels : []),
  ].some(l => typeof l === 'string' && l.trim().toLowerCase() === 'needs-review');

  const explicitResolvedReview = Boolean(newTx.meta?.review?.resolvedAt);
  let review = explicitResolvedReview ? newTx.meta?.review : prevMeta.review;
  if (review && !review.resolvedAt && categoryEdited) {
    review = clearReviewReason(review, 'category', nowIso);
  } else if (!review && categoryEdited && hadLegacyNeedsReview) {
    review = {
      reason: 'category',
      reasons: ['category'],
      resolvedAt: nowIso,
    };
  }

  const result: TxMeta = {
    ...prevMeta,
    userEdited: Array.from(edited),
    categorizedBy:
      categoryEdited || explicitResolvedReview
        ? 'user'
        : prevMeta.categorizedBy || 'user',
    confidence:
      categoryEdited || explicitResolvedReview ? 1.0 : prevMeta.confidence ?? 1.0,
    review,
  };
  if (nextAccount) {
    result.account = nextAccount;
  } else if (hasExplicitNewAccount) {
    delete result.account;
  }
  return result;
}

/**
 * Resolves/dismisses an active review flag on a transaction ("Looks Good" action).
 */
export function resolveTransactionReview(
  tx: Transaction,
  nowIso: string = new Date().toISOString(),
  options?: { clearDuplicate?: boolean }
): Transaction {
  const currentLabels = Array.isArray(tx.labels) ? tx.labels : [];
  const nextLabels = currentLabels.filter(l => l !== 'needs-review');
  const existingReview = tx.meta?.review;
  const activeReasons = existingReview?.reasons?.length
    ? existingReview.reasons
    : existingReview?.reason
    ? [existingReview.reason]
    : [];

  const hasReviewLabel = currentLabels.includes('needs-review');
  // A needs-review label with no structured meta.review (e.g. rows written by hand) is an
  // unknown-reason flag: treat "Looks Good" as the user confirming the best-guess category.
  const isLegacyLabelReview = !existingReview && hasReviewLabel;
  const isDuplicateReview =
    Boolean(options?.clearDuplicate) ||
    activeReasons.includes('duplicate') ||
    (!existingReview && !hasReviewLabel);
  const isCategoryReview = activeReasons.includes('category') || isLegacyLabelReview;

  if (isDuplicateReview && !nextLabels.includes('duplicate-verified')) {
    nextLabels.push('duplicate-verified');
  }

  const resolvedReasons: ReviewReason[] = Array.from(
    new Set<ReviewReason>([
      ...activeReasons,
      ...(isLegacyLabelReview ? (['category'] as ReviewReason[]) : []),
      ...(isDuplicateReview ? (['duplicate'] as ReviewReason[]) : []),
    ])
  );

  const nextMeta: TxMeta = {
    ...(tx.meta || {}),
    categorizedBy: isCategoryReview
      ? 'user'
      : tx.meta?.categorizedBy || 'user',
    confidence: isCategoryReview ? 1.0 : tx.meta?.confidence ?? 1.0,
    review: existingReview
      ? {
          ...existingReview,
          reasons: resolvedReasons.length > 0 ? resolvedReasons : existingReview.reasons,
          resolvedAt: nowIso,
        }
      : isLegacyLabelReview
      ? {
          reason: 'category',
          reasons: resolvedReasons,
          resolvedAt: nowIso,
        }
      : {
          reason: 'duplicate',
          reasons: resolvedReasons.length > 0 ? resolvedReasons : ['duplicate'],
          resolvedAt: nowIso,
        },
  };

  return {
    ...tx,
    labels: nextLabels,
    meta: nextMeta,
  };
}

interface ResolvedClassification {
  type: 'expense' | 'income' | 'transfer';
  category: string;
  subCategory: string | null;
  spendingBucket: SpendingBucket | null;
  isRefund: boolean;
  confidence: number;
  categorizedBy: 'history' | 'keyword' | 'llm' | 'user' | 'fallback';
  reviewReason?: ReviewReason;
  reviewDetail?: string;
}

interface CandidateChild {
  externalId?: string;
  supersedesExternalId?: string;
  orderId?: string;
  account?: string;
  date: string;
  description: string;
  merchant?: string;
  amount: number;
  type: 'expense' | 'income' | 'transfer';
  category: string;
  subCategory: string | null;
  spendingBucket: SpendingBucket | null;
  labels: string[];
  notes: string;
  hash: string;
  confidence: number;
  categorizedBy: 'history' | 'keyword' | 'llm' | 'user' | 'fallback';
  reviewReason?: ReviewReason;
  reviewDetail?: string;
  additionalReview?: { reason: ReviewReason; detail?: string };
  provisional?: boolean;
  metadataRichness: 'high' | 'medium' | 'low';
}

function isUnclassifiedMisc(category: string, subCategory?: string | null): boolean {
  return category === 'misc' && (!subCategory || subCategory === 'misc-other');
}

function resolveModalSpendingBucket(
  txs: Transaction[],
  fallbackDescription: string,
  fallbackCategory: string
): SpendingBucket {
  const stats = new Map<SpendingBucket, { count: number; latestDate: string }>();
  for (const tx of txs) {
    let b: SpendingBucket | null = tx.spendingBucket || null;
    if (!b && Array.isArray(tx.labels)) {
      if (tx.labels.includes('fixed')) b = 'fixed';
      else if (tx.labels.includes('non-monthly')) b = 'non-monthly';
      else if (tx.labels.includes('flexible')) b = 'flexible';
    }
    if (!b) continue;
    const prev = stats.get(b);
    const txDate = tx.date || '';
    if (prev) {
      prev.count += 1;
      if (txDate > prev.latestDate) prev.latestDate = txDate;
    } else {
      stats.set(b, { count: 1, latestDate: txDate });
    }
  }
  let bestBucket: SpendingBucket | null = null;
  let bestStat: { count: number; latestDate: string } | null = null;
  for (const [bucket, st] of stats.entries()) {
    if (
      !bestStat ||
      st.count > bestStat.count ||
      (st.count === bestStat.count && st.latestDate > bestStat.latestDate)
    ) {
      bestBucket = bucket;
      bestStat = st;
    }
  }
  return bestBucket || suggestSpendingBucket(fallbackDescription, fallbackCategory);
}

/**
 * Stage 1: Looks up verified ledger history for the same merchant/family.
 */
export function lookupHistoryClassification(
  targetText: string,
  merchant: string | undefined,
  existingTransactions: Transaction[],
  targetType: 'expense' | 'income' = 'expense'
): {
  category: string;
  subCategory: string | null;
  spendingBucket: SpendingBucket | null;
  confidence: number;
} | null {
  const isMarketplace = isMultiCategoryMarketplace(merchant || targetText);
  const opaque = isOpaqueDescription(targetText);

  // Never trust bare marketplace history (e.g. "AMZN MKTPLACE") without item context
  if (isMarketplace && opaque) {
    return null;
  }

  const candidates = existingTransactions.filter(tx => {
    if (!tx.category || tx.category === 'transfers') return false;
    // Only learn from rows of the same kind: transfers and payroll must never teach expense categories
    if (tx.type !== targetType) return false;
    // Generic 'misc' or 'misc-other' is a non-answer, but a deliberate misc sub-category (e.g. misc-salon) is real signal
    if (isUnclassifiedMisc(tx.category, tx.subCategory)) return false;
    const labels = Array.isArray(tx.labels) ? tx.labels : [];
    if (labels.includes('needs-review')) return false;
    if (labels.includes('refund')) return false;
    if (tx.meta?.review?.reason === 'category' && !tx.meta.review.resolvedAt) return false;
    return historyMerchantsMatch(tx.description, targetText, merchant);
  });

  if (candidates.length === 0) return null;

  // For marketplaces with item descriptions, require exact normalized description match
  if (isMarketplace) {
    const normTarget = targetText.trim().toLowerCase();
    const exactMatches = candidates.filter(
      c => c.description.trim().toLowerCase() === normTarget
    );
    if (exactMatches.length === 0) return null;
    const best =
      exactMatches.find(c => c.meta?.categorizedBy === 'user') || exactMatches[0];
    return {
      category: best.category,
      subCategory: best.subCategory || null,
      spendingBucket: resolveModalSpendingBucket(
        exactMatches,
        best.description,
        best.category
      ),
      confidence: best.meta?.categorizedBy === 'user' ? 0.96 : 0.9,
    };
  }

  // Prefer user-categorized transactions first
  const userVerified = candidates.filter(
    c => c.meta?.categorizedBy === 'user' || (c.meta?.userEdited || []).includes('category')
  );
  const pool = userVerified.length > 0 ? userVerified : candidates;

  const counts = new Map<string, { count: number; tx: Transaction; txs: Transaction[] }>();
  for (const tx of pool) {
    const key = `${tx.category}|${tx.subCategory || ''}`;
    const entry = counts.get(key);
    if (entry) {
      entry.count += 1;
      entry.txs.push(tx);
    } else {
      counts.set(key, { count: 1, tx, txs: [tx] });
    }
  }

  let topEntry: { count: number; tx: Transaction; txs: Transaction[] } | null = null;
  for (const entry of counts.values()) {
    if (!topEntry || entry.count > topEntry.count) {
      topEntry = entry;
    }
  }

  if (!topEntry) return null;
  const purity = topEntry.count / pool.length;
  if (purity < 0.6 && userVerified.length === 0) return null;

  return {
    category: topEntry.tx.category,
    subCategory: topEntry.tx.subCategory || null,
    spendingBucket:
      targetType === 'expense'
        ? resolveModalSpendingBucket(
            topEntry.txs,
            topEntry.tx.description,
            topEntry.tx.category
          )
        : null,
    confidence: userVerified.length > 0 ? 0.95 : Math.min(0.92, 0.78 + purity * 0.14),
  };
}

/**
 * 3-Stage Categorization Waterfall (History -> Keyword/Hint/Transfer/Refund -> Gemini LLM -> Fallback)
 */
function resolveCategoryWaterfall(
  input: {
    description: string;
    merchant?: string;
    notes?: string;
    amount: number;
    rawType?: 'expense' | 'income' | 'transfer';
    categoryHint?: string;
    explicitCategory?: string;
    explicitSubCategory?: string | null;
    explicitBucket?: SpendingBucket | null;
    metadataRichness: 'high' | 'medium' | 'low';
    llmKey?: string;
  },
  existingTransactions: Transaction[],
  allCategories: Category[],
  llmMap: Map<string, ClassifiedResultItem>,
  confidenceThreshold: number
): ResolvedClassification {
  const combinedText = [input.merchant, input.description, input.categoryHint]
    .filter(Boolean)
    .join(' ');
  const combinedWithNotes = [combinedText, input.notes].filter(Boolean).join(' ');
  const isBiltHousingAchInNotes = /\bbilt\s+card\s+des:housing\b/i.test(input.notes || '');

  // 1. Check Transfer first (do NOT feed arbitrary free-text notes into isTransfer)
  if (
    input.rawType === 'transfer' ||
    isTransfer(input.description, input.rawType) ||
    isTransfer(combinedText, input.rawType) ||
    isBiltHousingAchInNotes
  ) {
    if (input.explicitCategory && input.explicitCategory !== 'misc') {
      return {
        type: 'transfer',
        category: input.explicitCategory,
        subCategory:
          input.explicitSubCategory !== undefined
            ? input.explicitSubCategory
            : suggestSubCategory(combinedWithNotes, input.explicitCategory, allCategories),
        spendingBucket: null,
        isRefund: false,
        confidence: 1.0,
        categorizedBy: 'user',
      };
    }
    // Bilt Protect housing pass-through legs keep the ledger's housing/mortgage tagging
    // (the single "Bilt Housing Payment" expense carries the spend; these legs are transfers).
    if (
      /\bbilt\b.*\bhousing\b|\bhousing\b.*\bbilt\b/i.test(combinedWithNotes) ||
      (input.rawType === 'transfer' && /^bilt$/i.test(input.description.trim()))
    ) {
      return {
        type: 'transfer',
        category: 'housing',
        subCategory: 'housing-mortgage',
        spendingBucket: null,
        isRefund: false,
        confidence: 0.95,
        categorizedBy: 'keyword',
      };
    }
    return {
      type: 'transfer',
      category: 'transfers',
      subCategory:
        suggestSubCategory(combinedText, 'transfers', allCategories) ||
        'transfers-cc',
      spendingBucket: null,
      isRefund: false,
      confidence: 0.98,
      categorizedBy: 'keyword',
    };
  }

  // 2. Check Refund & Pure Income semantics
  const refundDetected =
    detectRefund(combinedText, input.rawType) ||
    /\b(?:credit\/refund|purchase\s+refund)\b/i.test(input.notes || '') ||
    (input.amount < 0 && input.rawType !== 'expense');

  const pureIncomeDetected =
    !refundDetected &&
    (input.rawType === 'income' ||
      (input.categoryHint || '').trim().toLowerCase() === 'income' ||
      /\b(?:payroll|direct\s+deposit|your\s+rental|rental\s+income)\b/i.test(
        combinedWithNotes
      ));

  const resolvedType: 'expense' | 'income' | 'transfer' =
    refundDetected || pureIncomeDetected ? 'income' : input.rawType || 'expense';

  // 3. Explicit caller override
  if (input.explicitCategory && !isUnclassifiedMisc(input.explicitCategory, input.explicitSubCategory)) {
    const sub =
      input.explicitSubCategory !== undefined
        ? input.explicitSubCategory
        : suggestSubCategory(combinedText, input.explicitCategory, allCategories);
    const bucket =
      resolvedType === 'expense' || refundDetected
        ? input.explicitBucket || suggestSpendingBucket(combinedText, input.explicitCategory)
        : null;
    return {
      type: resolvedType,
      category: input.explicitCategory,
      subCategory: sub || null,
      spendingBucket: bucket,
      isRefund: refundDetected,
      confidence: 1.0,
      categorizedBy: 'user',
    };
  }

  // 4. Pure income (non-refund): ledger history first (payroll, rental income), then keywords
  if (resolvedType === 'income' && !refundDetected) {
    const incomeHistory = lookupHistoryClassification(
      input.description,
      input.merchant,
      existingTransactions,
      'income'
    );
    if (incomeHistory) {
      return {
        type: 'income',
        category: incomeHistory.category,
        subCategory: incomeHistory.subCategory,
        spendingBucket: null,
        isRefund: false,
        confidence: incomeHistory.confidence,
        categorizedBy: 'history',
      };
    }
    const cat = suggestCategory(combinedWithNotes, input.categoryHint, allCategories);
    const finalCat = cat !== 'misc' ? cat : 'income';
    return {
      type: 'income',
      category: finalCat,
      subCategory: suggestSubCategory(combinedWithNotes, finalCat, allCategories),
      spendingBucket: null,
      isRefund: false,
      confidence: 0.9,
      categorizedBy: 'keyword',
    };
  }

  // 5. Stage 1: Ledger History Memory (expense rows first; if unhinted and no expense history matches, check income history)
  const historyMatch = lookupHistoryClassification(
    input.description,
    input.merchant,
    existingTransactions,
    'expense'
  );
  if (historyMatch) {
    return {
      type: resolvedType,
      category: historyMatch.category,
      subCategory: historyMatch.subCategory,
      spendingBucket: historyMatch.spendingBucket,
      isRefund: refundDetected,
      confidence: historyMatch.confidence,
      categorizedBy: 'history',
    };
  }

  if (!refundDetected && !input.rawType) {
    const unhintedIncomeHistory = lookupHistoryClassification(
      input.description,
      input.merchant,
      existingTransactions,
      'income'
    );
    if (unhintedIncomeHistory && unhintedIncomeHistory.category === 'income') {
      return {
        type: 'income',
        category: unhintedIncomeHistory.category,
        subCategory: unhintedIncomeHistory.subCategory,
        spendingBucket: null,
        isRefund: false,
        confidence: unhintedIncomeHistory.confidence,
        categorizedBy: 'history',
      };
    }
  }

  // 6. Stage 2: Keyword & Category-Hint Rules
  const textForCategory = refundDetected
    ? combinedText.replace(/\b(?:refund|return|reversal|chargeback|rebate|credit\s+memo)\b/gi, ' ')
    : combinedText;

  // If description is an enriched item (e.g. "Amazon: Whole Foods Grocery Delivery"), prioritize item text over bare "Amazon" prefix
  const itemTextOnly =
    input.description.includes(':') && !isOpaqueDescription(input.description)
      ? `${input.description.split(':').slice(1).join(':')} ${input.categoryHint || ''}`
      : textForCategory;

  let kwCat = suggestCategory(itemTextOnly, input.categoryHint, allCategories);
  if (kwCat === 'misc') {
    kwCat = suggestCategory(textForCategory, input.categoryHint, allCategories);
  }
  const kwSubCandidate =
    kwCat && kwCat !== 'transfers'
      ? suggestSubCategory(
          kwCat === 'shopping' ? textForCategory : itemTextOnly,
          kwCat,
          allCategories
        )
      : null;

  if (kwCat && kwCat !== 'transfers' && !isUnclassifiedMisc(kwCat, kwSubCandidate)) {
    const kwSub = kwSubCandidate;
    const kwBucket = suggestSpendingBucket(itemTextOnly, kwCat);

    const opaqueMarketplace =
      isMultiCategoryMarketplace(input.merchant || input.description) &&
      (isOpaqueDescription(input.description) || input.metadataRichness === 'low') &&
      !refundDetected;

    const confidence = opaqueMarketplace ? 0.55 : 0.85;
    return {
      type: resolvedType,
      category: kwCat,
      subCategory: kwSub,
      spendingBucket: kwBucket,
      isRefund: refundDetected,
      confidence,
      categorizedBy: 'keyword',
      reviewReason: confidence < confidenceThreshold ? 'category' : undefined,
      reviewDetail:
        confidence < confidenceThreshold
          ? 'Un-itemized marketplace charge; category may need item enrichment or review.'
          : undefined,
    };
  }

  // 7. Stage 3: Gemini LLM Classification (if available)
  if (input.llmKey && llmMap.has(input.llmKey)) {
    const llmItem = llmMap.get(input.llmKey)!;
    const llmSub =
      llmItem?.subCategoryId ||
      (llmItem?.categoryId
        ? suggestSubCategory(textForCategory, llmItem.categoryId, allCategories)
        : null);
    if (llmItem && llmItem.categoryId && !isUnclassifiedMisc(llmItem.categoryId, llmSub)) {
      const llmConfidence =
        typeof llmItem.confidence === 'number' ? llmItem.confidence : 0.78;
      return {
        type: resolvedType,
        category: llmItem.categoryId,
        subCategory: llmSub,
        spendingBucket:
          llmItem.spendingBucket ||
          suggestSpendingBucket(textForCategory, llmItem.categoryId),
        isRefund: refundDetected,
        confidence: llmConfidence,
        categorizedBy: 'llm',
        reviewReason: llmConfidence < confidenceThreshold ? 'category' : undefined,
        reviewDetail:
          llmConfidence < confidenceThreshold
            ? `Low-confidence AI category guess (${Math.round(llmConfidence * 100)}%).`
            : undefined,
      };
    }
  }

  // 8. Graceful Fallback -> 'misc / misc-other' + flag for review
  const fallbackSub = allCategories.some(c => c.id === 'misc-other') ? 'misc-other' : null;
  return {
    type: resolvedType,
    category: 'misc',
    subCategory: fallbackSub,
    spendingBucket: resolvedType === 'expense' || refundDetected ? 'flexible' : null,
    isRefund: refundDetected,
    confidence: 0.35,
    categorizedBy: 'fallback',
    reviewReason: 'category',
    reviewDetail: 'Unrecognized merchant or description; assigned to Miscellaneous for review.',
  };
}

function inferRichness(raw: RawTransactionInput): 'high' | 'medium' | 'low' {
  if (raw.metadataRichness) return raw.metadataRichness;
  if (raw.items && raw.items.length > 0) return 'high';
  if (isOpaqueDescription(raw.description)) return 'low';
  if (/^[a-z0-9\s]+:\s+\S+/i.test(raw.description.trim())) return 'high';
  return 'medium';
}

function formatConsolidatedItemDescription(
  merchantPrefix: string,
  titles: string[]
): string {
  const cleanTitles = titles.map(t => t.trim()).filter(Boolean);
  if (cleanTitles.length === 0) return merchantPrefix;
  const joined = cleanTitles.join(', ');
  const full = `${merchantPrefix}: ${joined}`;
  return full.length > 90 ? `${full.slice(0, 87)}...` : full;
}

/**
 * Expands a single `RawTransactionInput` into 1..K `CandidateChild` records.
 * Consolidates multi-item orders by resolved `(category, subCategory, spendingBucket)`
 * and allocates exact cents via Largest-Remainder.
 */
async function expandAndClassifyInput(
  raw: RawTransactionInput,
  inputIndex: number,
  sourceId: string,
  existingTransactions: Transaction[],
  allCategories: Category[],
  llmMap: Map<string, ClassifiedResultItem>,
  confidenceThreshold: number,
  autoSplitItems: boolean
): Promise<CandidateChild[]> {
  const normalizedDate = normalizeIsoDate(raw.date);
  const absAmount = Math.round(Math.abs(Number(raw.amount) || 0) * 100) / 100;
  const richness = inferRichness(raw);
  const resolvedAccount = resolveCanonicalAccount(sourceId, raw.account);
  const baseLabels = dedupeStrings(
    (raw.labels || []).map(l => l.trim().toLowerCase())
  );

  // Check if multi-item consolidation & splitting applies
  if (raw.items && raw.items.length > 0 && autoSplitItems && raw.op !== 'remove') {
    const itemsSubtotal = raw.items.reduce(
      (sum, it) => sum + Math.abs(Number(it.price) || 0) * (it.quantity ?? 1),
      0
    );

    const hasAmountMismatch =
      itemsSubtotal > 0 &&
      absAmount > 0 &&
      Math.abs(itemsSubtotal - absAmount) / absAmount > 0.25;

    const mismatchDetail = hasAmountMismatch
      ? `Item subtotal ($${itemsSubtotal.toFixed(2)}) differs from total charge ($${absAmount.toFixed(2)}) by >25% (possible gift card, promo, or partial shipment).`
      : undefined;

    const merchantPrefix = resolveMerchantPrefix(raw);

    interface ItemGroup {
      key: string;
      resolved: ResolvedClassification;
      titles: string[];
      subtotalWeight: number;
    }

    const groupsMap = new Map<string, ItemGroup>();

    for (let i = 0; i < raw.items.length; i++) {
      const item = raw.items[i];
      const itemWeight = Math.abs(Number(item.price) || 0) * (item.quantity ?? 1);
      const itemDesc = `${merchantPrefix}: ${item.title}`;
      const llmKey = `item:${inputIndex}:${i}`;

      const resolved = resolveCategoryWaterfall(
        {
          description: itemDesc,
          merchant: merchantPrefix,
          amount: raw.amount,
          rawType: raw.type,
          categoryHint: item.categoryHint || raw.categoryHint,
          explicitCategory: raw.category,
          explicitSubCategory: raw.subCategory,
          explicitBucket: raw.spendingBucket,
          metadataRichness: 'high',
          llmKey,
        },
        existingTransactions,
        allCategories,
        llmMap,
        confidenceThreshold
      );

      const groupKey = `${resolved.category}|${resolved.subCategory || ''}|${resolved.spendingBucket || ''}|${resolved.type}`;
      const existingGroup = groupsMap.get(groupKey);
      if (existingGroup) {
        existingGroup.titles.push(item.title);
        existingGroup.subtotalWeight += itemWeight;
        existingGroup.resolved.confidence = Math.min(
          existingGroup.resolved.confidence,
          resolved.confidence
        );
      } else {
        groupsMap.set(groupKey, {
          key: groupKey,
          resolved,
          titles: [item.title],
          subtotalWeight: itemWeight,
        });
      }
    }

    const groups = Array.from(groupsMap.values());
    const allocatedAmounts = allocateLargestRemainderCents(
      absAmount,
      groups.map(g => g.subtotalWeight)
    );
    const resolvedOrderId =
      raw.orderId ||
      raw.externalId ||
      `order-${normalizedDate}-${Math.round(absAmount * 100)}`;

    const children: CandidateChild[] = [];
    for (let idx = 0; idx < groups.length; idx++) {
      const grp = groups[idx];
      const childAmt = allocatedAmounts[idx];
      const childDesc = formatConsolidatedItemDescription(merchantPrefix, grp.titles);
      const childLabels = [...baseLabels];
      if (grp.resolved.isRefund && !childLabels.includes('refund')) {
        childLabels.push('refund');
      }

      const childExtId =
        groups.length === 1
          ? raw.externalId
          : raw.externalId
          ? `${raw.externalId}#split-${idx + 1}`
          : undefined;

      const hash = await generateTransactionHash(
        normalizedDate,
        childDesc,
        childAmt,
        grp.resolved.type
      );

      const reviewReason: ReviewReason | undefined = hasAmountMismatch
        ? 'amount-mismatch'
        : grp.resolved.reviewReason;
      const reviewDetail = hasAmountMismatch
        ? mismatchDetail
        : grp.resolved.reviewDetail;
      const additionalReview =
        hasAmountMismatch && grp.resolved.reviewReason
          ? {
              reason: grp.resolved.reviewReason,
              detail: grp.resolved.reviewDetail,
            }
          : undefined;

      const childProvisional =
        raw.provisional !== undefined
          ? raw.provisional
          : /\bpending\b/i.test(`${childDesc} ${raw.notes || ''}`)
          ? true
          : undefined;

      children.push({
        externalId: childExtId,
        supersedesExternalId: idx === 0 ? raw.supersedesExternalId : undefined,
        orderId: resolvedOrderId,
        account: resolvedAccount,
        date: normalizedDate,
        description: childDesc,
        merchant: raw.merchant || merchantPrefix,
        amount: childAmt,
        type: grp.resolved.type,
        category: grp.resolved.category,
        subCategory: grp.resolved.subCategory,
        spendingBucket: grp.resolved.spendingBucket,
        labels: childLabels,
        notes: raw.notes || '',
        hash,
        confidence: grp.resolved.confidence,
        categorizedBy: grp.resolved.categorizedBy,
        reviewReason,
        reviewDetail,
        additionalReview,
        provisional: childProvisional,
        metadataRichness: 'high',
      });
    }

    return children;
  }

  // Single-item classification path
  const resolved = resolveCategoryWaterfall(
    {
      description: raw.description,
      merchant: raw.merchant,
      notes: raw.notes,
      amount: raw.amount,
      rawType: raw.type,
      categoryHint: raw.categoryHint,
      explicitCategory: raw.category,
      explicitSubCategory: raw.subCategory,
      explicitBucket: raw.spendingBucket,
      metadataRichness: richness,
      llmKey: `tx:${inputIndex}`,
    },
    existingTransactions,
    allCategories,
    llmMap,
    confidenceThreshold
  );

  const labels = [...baseLabels];
  if (resolved.isRefund && !labels.includes('refund')) {
    labels.push('refund');
  }

  const cleanDesc = (raw.description || raw.merchant || 'Transaction').trim();
  const hash = await generateTransactionHash(
    normalizedDate,
    cleanDesc,
    absAmount,
    resolved.type
  );

  const inferredProvisional =
    raw.provisional !== undefined
      ? raw.provisional
      : /\bpending\b/i.test(`${cleanDesc} ${raw.notes || ''}`)
      ? true
      : undefined;

  return [
    {
      externalId: raw.externalId,
      supersedesExternalId: raw.supersedesExternalId,
      orderId: raw.orderId,
      account: resolvedAccount,
      date: normalizedDate,
      description: cleanDesc,
      merchant: raw.merchant,
      amount: absAmount,
      type: resolved.type,
      category: resolved.category,
      subCategory: resolved.subCategory,
      spendingBucket: resolved.spendingBucket,
      labels,
      notes: raw.notes || '',
      hash,
      confidence: resolved.confidence,
      categorizedBy: resolved.categorizedBy,
      reviewReason: resolved.reviewReason,
      reviewDetail: resolved.reviewDetail,
      provisional: inferredProvisional,
      metadataRichness: richness,
    },
  ];
}

function buildTransactionFromCandidate(
  candidate: CandidateChild,
  sourceId: string,
  nowIso: string,
  overrideReview?: { reason: ReviewReason; detail: string },
  existingToMerge?: Transaction,
  idGen: () => string = generateId
): Transaction {
  const userEdited = new Set<EditableTxField>(existingToMerge?.meta?.userEdited || []);

  const finalDate =
    existingToMerge && userEdited.has('date') ? existingToMerge.date : candidate.date;
  const finalAmount =
    existingToMerge && userEdited.has('amount')
      ? existingToMerge.amount
      : candidate.amount;
  const finalType =
    existingToMerge && userEdited.has('type') ? existingToMerge.type : candidate.type;

  const incomingIsRicher =
    !existingToMerge ||
    candidate.metadataRichness === 'high' ||
    (isOpaqueDescription(existingToMerge.description) &&
      !isOpaqueDescription(candidate.description));

  const finalDescription =
    existingToMerge && (userEdited.has('description') || !incomingIsRicher)
      ? existingToMerge.description
      : candidate.description;

  const finalCategory =
    existingToMerge &&
    (userEdited.has('category') ||
      existingToMerge.meta?.categorizedBy === 'user' ||
      (!incomingIsRicher && !isUnclassifiedMisc(existingToMerge.category, existingToMerge.subCategory)))
      ? existingToMerge.category
      : candidate.category;

  const finalSubCategory =
    existingToMerge &&
    (userEdited.has('subCategory') ||
      userEdited.has('category') ||
      existingToMerge.meta?.categorizedBy === 'user' ||
      (!incomingIsRicher && !isUnclassifiedMisc(existingToMerge.category, existingToMerge.subCategory)))
      ? existingToMerge.subCategory ?? null
      : candidate.subCategory;

  const finalSpendingBucket =
    existingToMerge &&
    (userEdited.has('spendingBucket') ||
      existingToMerge.meta?.categorizedBy === 'user' ||
      (!incomingIsRicher && existingToMerge.spendingBucket))
      ? existingToMerge.spendingBucket ?? null
      : candidate.spendingBucket;

  const finalNotes =
    existingToMerge && (userEdited.has('notes') || existingToMerge.notes)
      ? existingToMerge.notes
      : candidate.notes;

  const prevSources = existingToMerge?.meta?.sources || [];
  const nextSources = dedupeStrings([...prevSources, sourceId]);

  const nextExternalIds: Record<string, string> = {
    ...(existingToMerge?.meta?.externalIds || {}),
  };
  if (candidate.externalId) {
    nextExternalIds[sourceId] = candidate.externalId;
  }

  const prevAliasHashes = existingToMerge?.meta?.aliasHashes || [];
  const nextAliasHashes = [...prevAliasHashes];
  if (existingToMerge?.hash && existingToMerge.hash !== candidate.hash) {
    nextAliasHashes.push(shortHash(existingToMerge.hash));
  }
  if (candidate.hash) {
    nextAliasHashes.push(shortHash(candidate.hash));
  }

  const candidateHasCategoryReview =
    candidate.reviewReason === 'category' ||
    candidate.additionalReview?.reason === 'category' ||
    overrideReview?.reason === 'category';

  let finalReview = existingToMerge?.meta?.review;
  if (
    finalReview &&
    !finalReview.resolvedAt &&
    incomingIsRicher &&
    !isUnclassifiedMisc(finalCategory, finalSubCategory) &&
    candidate.confidence >= DEFAULT_CONFIDENCE_THRESHOLD &&
    !candidateHasCategoryReview
  ) {
    finalReview = clearReviewReason(finalReview, 'category', nowIso);
  }
  if (candidate.reviewReason) {
    finalReview = mergeReviewInfo(
      finalReview,
      { reason: candidate.reviewReason, detail: candidate.reviewDetail },
      nowIso
    );
  }
  if (candidate.additionalReview) {
    finalReview = mergeReviewInfo(finalReview, candidate.additionalReview, nowIso);
  }
  if (overrideReview) {
    finalReview = mergeReviewInfo(finalReview, overrideReview, nowIso);
  }

  const isFlagged = Boolean(finalReview && !finalReview.resolvedAt);
  const mergedLabels = dedupeStrings([
    ...(existingToMerge?.labels || []),
    ...candidate.labels,
  ]).filter(l => (isFlagged ? true : l !== 'needs-review'));

  if (isFlagged && !mergedLabels.includes('needs-review')) {
    mergedLabels.push('needs-review');
  }

  const finalCategorizedBy =
    existingToMerge?.meta?.categorizedBy === 'user'
      ? 'user'
      : incomingIsRicher
      ? candidate.categorizedBy
      : existingToMerge?.meta?.categorizedBy || candidate.categorizedBy;

  const finalConfidence =
    finalCategorizedBy === 'user'
      ? 1.0
      : incomingIsRicher
      ? candidate.confidence
      : Math.max(existingToMerge?.meta?.confidence ?? 0, candidate.confidence);

  const resolvedAccount =
    existingToMerge && userEdited.has('account')
      ? existingToMerge.meta?.account
      : candidate.account || existingToMerge?.meta?.account;

  const basePrevMeta: TxMeta = { ...(existingToMerge?.meta || {}) };
  if (!resolvedAccount) {
    delete basePrevMeta.account;
  }

  const meta: TxMeta = {
    ...basePrevMeta,
    sources: nextSources,
    externalIds: Object.keys(nextExternalIds).length > 0 ? nextExternalIds : undefined,
    ...(resolvedAccount ? { account: resolvedAccount } : {}),
    aliasHashes: dedupeStrings(nextAliasHashes),
    orderId: candidate.orderId || existingToMerge?.meta?.orderId,
    confidence: finalConfidence,
    categorizedBy: finalCategorizedBy,
    userEdited: userEdited.size > 0 ? Array.from(userEdited) : undefined,
    provisional:
      candidate.provisional !== undefined
        ? candidate.provisional
        : existingToMerge?.meta?.provisional
        ? false
        : undefined,
    review: finalReview,
    ingestedAt: existingToMerge?.meta?.ingestedAt || nowIso,
    updatedAt: nowIso,
  };

  return {
    id: existingToMerge?.id || idGen(),
    date: finalDate,
    description: finalDescription,
    amount: finalAmount,
    category: finalCategory,
    subCategory: finalSubCategory,
    spendingBucket: finalSpendingBucket ?? undefined,
    type: finalType,
    labels: mergedLabels,
    notes: finalNotes,
    hash: candidate.hash,
    meta,
  };
}

/**
 * Pure, side-effect-free Ingestion Planner.
 * Computes the exact set of storage operations (`insert`, `update`, `delete`),
 * updated `IngestState`, and per-record reconciliation statuses.
 */
export async function planIngestion(
  snapshot: IngestSnapshot,
  request: IngestRequest,
  llmClassifications: Map<string, ClassifiedResultItem> = new Map()
): Promise<IngestPlan> {
  const nowIso = request.options?.nowIso || new Date().toISOString();
  const idGen = request.options?.idGenerator || generateId;
  const { sourceId, triggerMode } = request;
  const confidenceThreshold =
    request.options?.confidenceThreshold ?? DEFAULT_CONFIDENCE_THRESHOLD;
  const crossSourceWindowDays =
    request.options?.crossSourceWindowDays ?? DEFAULT_CROSS_SOURCE_WINDOW_DAYS;
  const autoSplitItems = request.options?.autoSplitItems ?? true;
  const matchProvisionalTipDrift = request.options?.matchProvisionalTipDrift ?? false;

  const allCategories: Category[] = (() => {
    const map = new Map<string, Category>();
    DEFAULT_CATEGORIES.forEach(c => map.set(c.id, c));
    (snapshot.categories || []).forEach(c => map.set(c.id, c));
    return Array.from(map.values());
  })();

  const prevIngestState: IngestState = snapshot.ingestState || {
    version: 1,
    sources: {},
    tombstones: [],
    recentRuns: [],
  };

  const effectiveCutoff =
    request.options?.syncStartDate ||
    prevIngestState.sources?.[sourceId]?.syncStartDate;

  const tombstoneSet = new Set<string>(
    normalizeTombstoneArray(prevIngestState.tombstones)
  );

  // Maintain a mutable working copy of the ledger so intra-batch items see earlier ops
  const workingLedger: Transaction[] = snapshot.existingTransactions.map(t => ({
    ...t,
    labels: Array.isArray(t.labels) ? [...t.labels] : [],
    meta: t.meta ? { ...t.meta } : undefined,
  }));
  const createdInBatchIds = new Set<string>();
  const claimedExistingIds = new Set<string>();

  const isTxPending = (tx: Transaction): boolean => {
    if (typeof tx.meta?.provisional === 'boolean') {
      return tx.meta.provisional;
    }
    return /\bpending\b/i.test(`${tx.notes || ''} ${tx.description || ''}`);
  };

  const stripPendingFromNotes = (notes?: string): string => {
    if (!notes) return '';
    return notes
      .replace(/\s*[•·|-]\s*pending\b/gi, '')
      .replace(/\bpending\s*[•·|-]\s*/gi, '')
      .replace(/\(\s*pending\s*\)/gi, '')
      .replace(/^pending$/i, '')
      .trim();
  };

  const ops: IngestOp[] = [];
  const records: IngestRecordReport[] = [];
  const flaggedTransactions: Transaction[] = [];

  const summary = {
    totalInput: request.transactions.length,
    inserted: 0,
    insertedFlagged: 0,
    updatedFromSource: 0,
    mergedEnriched: 0,
    mergedTipAdjusted: 0,
    removed: 0,
    skippedDuplicate: 0,
    skippedTombstoned: 0,
    skippedBeforeCutoff: 0,
    needsConfirmation: 0,
  };

  const upsertOp = (op: IngestOp) => {
    if (op.type === 'update') {
      const existingCreateIdx = ops.findIndex(
        o => o.type === 'insert' && o.tx.id === op.tx.id
      );
      if (existingCreateIdx >= 0) {
        ops[existingCreateIdx] = { type: 'insert', tx: op.tx };
        return;
      }
      const existingUpdateIdx = ops.findIndex(
        o => o.type === 'update' && o.tx.id === op.tx.id
      );
      if (existingUpdateIdx >= 0) {
        ops[existingUpdateIdx] = op;
        return;
      }
    }
    ops.push(op);
  };

  for (let inputIndex = 0; inputIndex < request.transactions.length; inputIndex++) {
    const raw = request.transactions[inputIndex];
    const normalizedDate = normalizeIsoDate(raw.date);
    const rawAccount = resolveCanonicalAccount(sourceId, raw.account);

    // STEP 1: `syncStartDate` Cutoff Check (skip for 'remove' ops so voids still clean up)
    if (raw.op !== 'remove' && effectiveCutoff && normalizedDate < effectiveCutoff) {
      summary.skippedBeforeCutoff += 1;
      records.push({
        inputIndex,
        externalId: raw.externalId,
        status: 'skipped_before_cutoff',
        transactions: [],
        confidence: 1.0,
        categorizedBy: 'fallback',
      });
      continue;
    }

    // STEP 2a: Pre-expansion Tombstone Check by externalId / supersedesExternalId
    if (
      raw.op !== 'remove' &&
      ((raw.externalId && tombstoneSet.has(raw.externalId)) ||
        (raw.supersedesExternalId && tombstoneSet.has(raw.supersedesExternalId)))
    ) {
      summary.skippedTombstoned += 1;
      records.push({
        inputIndex,
        externalId: raw.externalId,
        status: 'skipped_tombstoned',
        transactions: [],
        confidence: 1.0,
        categorizedBy: 'fallback',
      });
      continue;
    }

    // STEP 3 (checked before expansion if op === 'remove'): Upstream Void / Cancel
    if (raw.op === 'remove') {
      const targetExtId = raw.externalId || raw.supersedesExternalId;
      const targetOrderId = raw.orderId || targetExtId;
      const matchedTxs = workingLedger.filter(t => {
        const storedId = t.meta?.externalIds?.[sourceId];
        if (
          targetExtId &&
          storedId &&
          (storedId === targetExtId || storedId.startsWith(`${targetExtId}#split-`))
        ) {
          return true;
        }
        if (targetOrderId && t.meta?.orderId === targetOrderId) {
          return true;
        }
        return false;
      });

      if (matchedTxs.length === 0) {
        const wasTombstoned = Boolean(targetExtId && tombstoneSet.has(targetExtId));
        if (wasTombstoned) {
          summary.skippedTombstoned += 1;
        } else {
          summary.skippedDuplicate += 1;
        }
        records.push({
          inputIndex,
          externalId: raw.externalId,
          status: wasTombstoned ? 'skipped_tombstoned' : 'skipped_not_found',
          transactions: [],
          confidence: 1.0,
          categorizedBy: 'fallback',
        });
        continue;
      }

      const anyUserEdited = matchedTxs.some(
        t => (t.meta?.userEdited?.length ?? 0) > 0
      );

      if (!anyUserEdited) {
        const matchedIds = new Set(matchedTxs.map(t => t.id));
        for (let i = workingLedger.length - 1; i >= 0; i--) {
          if (matchedIds.has(workingLedger[i].id)) {
            workingLedger.splice(i, 1);
          }
        }
        for (let i = ops.length - 1; i >= 0; i--) {
          const opItem = ops[i];
          if (
            (opItem.type === 'insert' || opItem.type === 'update') &&
            matchedIds.has(opItem.tx.id)
          ) {
            ops.splice(i, 1);
          }
        }
        let hadFlaggedInBatch = false;
        for (let i = flaggedTransactions.length - 1; i >= 0; i--) {
          if (matchedIds.has(flaggedTransactions[i].id)) {
            flaggedTransactions.splice(i, 1);
            hadFlaggedInBatch = true;
          }
        }
        let wasCreatedInBatch = false;
        for (const targetTx of matchedTxs) {
          if (createdInBatchIds.has(targetTx.id)) {
            createdInBatchIds.delete(targetTx.id);
            wasCreatedInBatch = true;
          } else {
            ops.push({ type: 'delete', id: targetTx.id });
          }
        }
        if (wasCreatedInBatch) {
          if (hadFlaggedInBatch) {
            summary.insertedFlagged = Math.max(0, summary.insertedFlagged - 1);
          } else {
            summary.inserted = Math.max(0, summary.inserted - 1);
          }
        }
        summary.removed += 1;
        records.push({
          inputIndex,
          externalId: raw.externalId,
          status: 'removed',
          transactions: matchedTxs,
          matchedExistingId: matchedTxs[0].id,
          matchedExistingIds: matchedTxs.map(t => t.id),
          confidence: 1.0,
          categorizedBy: matchedTxs[0].meta?.categorizedBy || 'fallback',
        });
      } else {
        // User edited this transaction -> do NOT silently delete; flag as voided
        const updatedVoidTxs: Transaction[] = [];
        for (const targetTx of matchedTxs) {
          const labels = dedupeStrings([...(targetTx.labels || []), 'needs-review']);
          const mergedReview = mergeReviewInfo(
            targetTx.meta?.review,
            {
              reason: 'voided',
              detail:
                'Upstream source canceled/voided this transaction after manual edits were made.',
            },
            nowIso
          );
          const updatedTx: Transaction = {
            ...targetTx,
            labels,
            meta: {
              ...(targetTx.meta || {}),
              review: mergedReview,
              updatedAt: nowIso,
            },
          };
          const ledgerIdx = workingLedger.findIndex(t => t.id === targetTx.id);
          if (ledgerIdx >= 0) workingLedger[ledgerIdx] = updatedTx;
          upsertOp({ type: 'update', tx: updatedTx, previousId: targetTx.id });
          flaggedTransactions.push(updatedTx);
          updatedVoidTxs.push(updatedTx);
        }
        summary.updatedFromSource += 1;
        records.push({
          inputIndex,
          externalId: raw.externalId,
          status: 'updated_from_source',
          transactions: updatedVoidTxs,
          matchedExistingId: updatedVoidTxs[0].id,
          matchedExistingIds: updatedVoidTxs.map(t => t.id),
          reviewReason: 'voided',
          reviewDetail: updatedVoidTxs[0].meta?.review?.detail,
          confidence: updatedVoidTxs[0].meta?.confidence ?? 1.0,
          categorizedBy: updatedVoidTxs[0].meta?.categorizedBy || 'user',
        });
      }
      continue;
    }

    // Expand & classify input (1 child for normal rows, 1..K children for multi-category item orders)
    const candidates = await expandAndClassifyInput(
      raw,
      inputIndex,
      sourceId,
      workingLedger,
      allCategories,
      llmClassifications,
      confidenceThreshold,
      autoSplitItems
    );
    const primary = candidates[0];

    // STEP 2b: Tombstone Check (including expanded split externalIds and canonical hashes)
    const isTombstoned = candidates.some(
      c =>
        (c.externalId && tombstoneSet.has(c.externalId)) ||
        tombstoneSet.has(shortHash(c.hash))
    );

    if (isTombstoned) {
      summary.skippedTombstoned += 1;
      records.push({
        inputIndex,
        externalId: raw.externalId,
        status: 'skipped_tombstoned',
        transactions: [],
        confidence: primary.confidence,
        categorizedBy: primary.categorizedBy,
      });
      continue;
    }

    // STEP 4: Same-Source Lifecycle Upsert by `externalId` or `supersedesExternalId`
    if (raw.externalId || raw.supersedesExternalId) {
      const sameSourceMatches = workingLedger.filter(t => {
        const storedId = t.meta?.externalIds?.[sourceId];
        if (!storedId) return false;
        if (raw.externalId && storedId === raw.externalId) return true;
        if (raw.supersedesExternalId && storedId === raw.supersedesExternalId) return true;
        if (raw.externalId && storedId.startsWith(`${raw.externalId}#split-`)) return true;
        if (
          raw.supersedesExternalId &&
          storedId.startsWith(`${raw.supersedesExternalId}#split-`)
        ) {
          return true;
        }
        return false;
      });

      if (sameSourceMatches.length > 0) {
        if (candidates.length === 1 && sameSourceMatches.length === 1) {
          const existingTx = sameSourceMatches[0];
          const storedExtId = existingTx.meta?.externalIds?.[sourceId];
          const isUnchanged =
            storedExtId === primary.externalId &&
            existingTx.date === primary.date &&
            Math.abs(existingTx.amount - primary.amount) < 0.005 &&
            (existingTx.description === primary.description ||
              (existingTx.meta?.userEdited || []).includes('description'));

          if (isUnchanged) {
            summary.skippedDuplicate += 1;
            records.push({
              inputIndex,
              externalId: raw.externalId,
              status: 'skipped_exact_duplicate',
              transactions: [existingTx],
              matchedExistingId: existingTx.id,
              confidence: existingTx.meta?.confidence ?? primary.confidence,
              categorizedBy: existingTx.meta?.categorizedBy || primary.categorizedBy,
            });
            continue;
          }

          // Update in place (e.g. pending -> posted date/amount change or description update)
          const updatedTx = buildTransactionFromCandidate(
            primary,
            sourceId,
            nowIso,
            undefined,
            existingTx,
            idGen
          );
          const ledgerIdx = workingLedger.findIndex(t => t.id === existingTx.id);
          if (ledgerIdx >= 0) workingLedger[ledgerIdx] = updatedTx;
          upsertOp({ type: 'update', tx: updatedTx, previousId: existingTx.id });
          if (updatedTx.labels.includes('needs-review')) {
            flaggedTransactions.push(updatedTx);
          }
          summary.updatedFromSource += 1;
          records.push({
            inputIndex,
            externalId: raw.externalId,
            status: 'updated_from_source',
            transactions: [updatedTx],
            matchedExistingId: existingTx.id,
            reviewReason: updatedTx.meta?.review?.reason,
            reviewDetail: updatedTx.meta?.review?.detail,
            confidence: updatedTx.meta?.confidence ?? primary.confidence,
            categorizedBy: updatedTx.meta?.categorizedBy || primary.categorizedBy,
          });
          continue;
        } else {
          // Multi-split same-source match: check if date or externalId superseded
          const baseIncomingExtId = raw.externalId;
          const anySplitNeedsUpdate = sameSourceMatches.some((m, idx) => {
            const expectedExtId = baseIncomingExtId
              ? `${baseIncomingExtId}#split-${idx + 1}`
              : m.meta?.externalIds?.[sourceId];
            const dateChanged =
              m.date !== primary.date && !(m.meta?.userEdited || []).includes('date');
            const idChanged =
              Boolean(expectedExtId) && m.meta?.externalIds?.[sourceId] !== expectedExtId;
            return dateChanged || idChanged;
          });

          if (
            (candidates.length === 1 || candidates.length === sameSourceMatches.length) &&
            anySplitNeedsUpdate
          ) {
            const updatedSplits: Transaction[] = [];
            for (let idx = 0; idx < sameSourceMatches.length; idx++) {
              const part = sameSourceMatches[idx];
              const nextDate = (part.meta?.userEdited || []).includes('date')
                ? part.date
                : primary.date;
              const nextExtIds: Record<string, string> = {
                ...(part.meta?.externalIds || {}),
              };
              if (baseIncomingExtId) {
                nextExtIds[sourceId] = `${baseIncomingExtId}#split-${idx + 1}`;
              }
              const updatedPart: Transaction = {
                ...part,
                date: nextDate,
                meta: {
                  ...(part.meta || {}),
                  externalIds: nextExtIds,
                  updatedAt: nowIso,
                },
              };
              const ledgerIdx = workingLedger.findIndex(t => t.id === part.id);
              if (ledgerIdx >= 0) workingLedger[ledgerIdx] = updatedPart;
              upsertOp({ type: 'update', tx: updatedPart, previousId: part.id });
              updatedSplits.push(updatedPart);
            }
            summary.updatedFromSource += 1;
            records.push({
              inputIndex,
              externalId: raw.externalId,
              status: 'updated_from_source',
              transactions: updatedSplits,
              matchedExistingId: updatedSplits[0].id,
              matchedExistingIds: updatedSplits.map(m => m.id),
              confidence: primary.confidence,
              categorizedBy: primary.categorizedBy,
            });
            continue;
          }

          summary.skippedDuplicate += 1;
          records.push({
            inputIndex,
            externalId: raw.externalId,
            status: 'skipped_exact_duplicate',
            transactions: sameSourceMatches,
            matchedExistingId: sameSourceMatches[0].id,
            matchedExistingIds: sameSourceMatches.map(m => m.id),
            confidence: primary.confidence,
            categorizedBy: primary.categorizedBy,
          });
          continue;
        }
      }
    }

    // STEP 5: Exact Canonical Hash / `aliasHashes` Match (Same-Source Re-import Without externalId)
    if (candidates.length === 1) {
      const candShortHash = shortHash(primary.hash);
      const exactHashMatches = workingLedger.filter(
        t =>
          t.hash === primary.hash ||
          (t.meta?.aliasHashes || []).includes(candShortHash)
      );

      if (exactHashMatches.length > 0) {
        const sameSourceUnclaimed = exactHashMatches.find(
          t =>
            (t.meta?.sources || []).includes(sourceId) &&
            !createdInBatchIds.has(t.id) &&
            !claimedExistingIds.has(t.id)
        );

        if (sameSourceUnclaimed) {
          const existingExtId = sameSourceUnclaimed.meta?.externalIds?.[sourceId];
          const hasDistinctExternalIds =
            Boolean(primary.externalId) &&
            Boolean(existingExtId) &&
            primary.externalId !== existingExtId;

          if (!hasDistinctExternalIds) {
            claimedExistingIds.add(sameSourceUnclaimed.id);

            // If existing row was Pending and incoming row is settled, upgrade in place
            if (isTxPending(sameSourceUnclaimed) && !primary.provisional) {
              const settledTx = buildTransactionFromCandidate(
                primary,
                sourceId,
                nowIso,
                undefined,
                sameSourceUnclaimed,
                idGen
              );
              if (!sameSourceUnclaimed.meta?.userEdited?.includes('notes')) {
                settledTx.notes =
                  stripPendingFromNotes(sameSourceUnclaimed.notes) ||
                  stripPendingFromNotes(primary.notes);
              }
              if (
                !sameSourceUnclaimed.meta?.userEdited?.includes('description') &&
                /\bpending\b/i.test(sameSourceUnclaimed.description) &&
                !/\bpending\b/i.test(primary.description)
              ) {
                settledTx.description = primary.description;
              }
              settledTx.meta = {
                ...(settledTx.meta || {}),
                provisional: false,
              };
              const ledgerIdx = workingLedger.findIndex(
                t => t.id === sameSourceUnclaimed.id
              );
              if (ledgerIdx >= 0) workingLedger[ledgerIdx] = settledTx;
              upsertOp({
                type: 'update',
                tx: settledTx,
                previousId: sameSourceUnclaimed.id,
              });
              summary.updatedFromSource += 1;
              records.push({
                inputIndex,
                externalId: raw.externalId,
                status: 'updated_from_source',
                transactions: [settledTx],
                matchedExistingId: sameSourceUnclaimed.id,
                confidence: settledTx.meta?.confidence ?? primary.confidence,
                categorizedBy:
                  settledTx.meta?.categorizedBy || primary.categorizedBy,
              });
              continue;
            }

            summary.skippedDuplicate += 1;
            records.push({
              inputIndex,
              externalId: raw.externalId,
              status: 'skipped_exact_duplicate',
              transactions: [sameSourceUnclaimed],
              matchedExistingId: sameSourceUnclaimed.id,
              confidence: sameSourceUnclaimed.meta?.confidence ?? primary.confidence,
              categorizedBy:
                sameSourceUnclaimed.meta?.categorizedBy || primary.categorizedBy,
            });
            continue;
          }
        }

        const sameSourceClaimedOrBatch = exactHashMatches.find(
          t =>
            (t.meta?.sources || []).includes(sourceId) &&
            (createdInBatchIds.has(t.id) || claimedExistingIds.has(t.id))
        );

        if (sameSourceClaimedOrBatch && !primary.externalId) {
          if (triggerMode === 'interactive') {
            summary.needsConfirmation += 1;
            records.push({
              inputIndex,
              externalId: raw.externalId,
              status: 'needs_confirmation',
              transactions: [],
              matchedExistingId: sameSourceClaimedOrBatch.id,
              reviewReason: 'duplicate',
              reviewDetail:
                'Identical transaction in the same import batch; confirm if this is a separate charge.',
              confidence: primary.confidence,
              categorizedBy: primary.categorizedBy,
            });
            continue;
          } else {
            const flaggedTx = buildTransactionFromCandidate(
              primary,
              sourceId,
              nowIso,
              {
                reason: 'duplicate',
                detail: `Same-day identical charge ($${primary.amount.toFixed(2)} at ${primary.description}); verify not a duplicate.`,
              },
              undefined,
              idGen
            );
            workingLedger.push(flaggedTx);
            createdInBatchIds.add(flaggedTx.id);
            ops.push({ type: 'insert', tx: flaggedTx });
            flaggedTransactions.push(flaggedTx);
            summary.insertedFlagged += 1;
            records.push({
              inputIndex,
              externalId: raw.externalId,
              status: 'inserted_flagged',
              transactions: [flaggedTx],
              matchedExistingId: sameSourceClaimedOrBatch.id,
              reviewReason: 'duplicate',
              reviewDetail: flaggedTx.meta?.review?.detail,
              confidence: primary.confidence,
              categorizedBy: primary.categorizedBy,
            });
            continue;
          }
        }
      }
    }

    // STEP 5b: Same-Source Pending -> Settled Upgrade (Without externalId, e.g. Google Wallet +/-3d date shift or description change)
    if (candidates.length === 1 && !primary.provisional && !raw.externalId) {
      const pendingMatches = workingLedger
        .filter(t => {
          if (createdInBatchIds.has(t.id) || claimedExistingIds.has(t.id)) return false;
          if (!isTxPending(t)) return false;
          if (!accountsAreCompatible(t.meta?.account, rawAccount)) return false;
          if (t.type !== primary.type) return false;
          if (Math.abs(t.amount - primary.amount) > 0.01) return false;
          if (daysBetween(t.date, primary.date) > 3) return false;
          const isBothCcPayoff =
            t.type === 'transfer' &&
            primary.type === 'transfer' &&
            t.subCategory === 'transfers-cc' &&
            primary.subCategory === 'transfers-cc';
          return (
            isBothCcPayoff ||
            merchantsMatch(t.description, raw.description, undefined, raw.merchant)
          );
        })
        .sort(
          (a, b) =>
            daysBetween(a.date, primary.date) - daysBetween(b.date, primary.date)
        );

      if (pendingMatches.length >= 1) {
        const targetPending = pendingMatches[0];
        claimedExistingIds.add(targetPending.id);
        const settledTx = buildTransactionFromCandidate(
          primary,
          sourceId,
          nowIso,
          undefined,
          targetPending,
          idGen
        );
        if (!targetPending.meta?.userEdited?.includes('notes')) {
          settledTx.notes =
            stripPendingFromNotes(targetPending.notes) ||
            stripPendingFromNotes(primary.notes);
        }
        if (
          !targetPending.meta?.userEdited?.includes('description') &&
          /\bpending\b/i.test(targetPending.description) &&
          !/\bpending\b/i.test(primary.description)
        ) {
          settledTx.description = primary.description;
        }
        settledTx.meta = {
          ...(settledTx.meta || {}),
          provisional: false,
        };
        const ledgerIdx = workingLedger.findIndex(t => t.id === targetPending.id);
        if (ledgerIdx >= 0) workingLedger[ledgerIdx] = settledTx;
        upsertOp({ type: 'update', tx: settledTx, previousId: targetPending.id });
        summary.updatedFromSource += 1;
        records.push({
          inputIndex,
          externalId: raw.externalId,
          status: 'updated_from_source',
          transactions: [settledTx],
          matchedExistingId: targetPending.id,
          confidence: settledTx.meta?.confidence ?? primary.confidence,
          categorizedBy: settledTx.meta?.categorizedBy || primary.categorizedBy,
        });
        continue;
      }
    }

    // STEP 6: Cross-Source Enrichment & First-Sync Claiming of Manual/CSV Rows (`merged_enriched`)
    const totalInputAmount = Math.round(Math.abs(Number(raw.amount) || 0) * 100) / 100;

    // 6a. Split-group sum match (by `meta.orderId`)
    if (candidates.length === 1) {
      const orderGroups = new Map<string, Transaction[]>();
      for (const t of workingLedger) {
        if (!t.meta?.orderId) continue;
        if (t.meta?.externalIds?.[sourceId]) continue;
        if (!accountsAreCompatible(t.meta?.account, rawAccount)) continue;
        const list = orderGroups.get(t.meta.orderId) || [];
        list.push(t);
        orderGroups.set(t.meta.orderId, list);
      }

      let matchedGroup: Transaction[] | null = null;
      for (const groupTxs of orderGroups.values()) {
        if (groupTxs.length < 2) continue;
        const groupSum =
          Math.round(groupTxs.reduce((s, t) => s + t.amount, 0) * 100) / 100;
        const firstTx = groupTxs[0];
        if (
          firstTx.type === primary.type &&
          Math.abs(groupSum - totalInputAmount) <= 0.01 &&
          daysBetween(firstTx.date, primary.date) <= crossSourceWindowDays &&
          merchantsMatch(firstTx.description, raw.description, undefined, raw.merchant)
        ) {
          matchedGroup = groupTxs;
          break;
        }
      }

      if (matchedGroup) {
        const updatedGroupTxs: Transaction[] = [];
        for (let idx = 0; idx < matchedGroup.length; idx++) {
          const existingPart = matchedGroup[idx];
          const nextSources = dedupeStrings([
            ...(existingPart.meta?.sources || []),
            sourceId,
          ]);
          const nextExternalIds: Record<string, string> = {
            ...(existingPart.meta?.externalIds || {}),
          };
          if (raw.externalId) {
            nextExternalIds[sourceId] =
              matchedGroup.length > 1
                ? `${raw.externalId}#split-${idx + 1}`
                : raw.externalId;
          }
          const nextAliases = dedupeStrings([
            ...(existingPart.meta?.aliasHashes || []),
            shortHash(primary.hash),
          ]);
          const resolvedAccount = existingPart.meta?.account || rawAccount;

          const updatedPart: Transaction = {
            ...existingPart,
            meta: {
              ...(existingPart.meta || {}),
              sources: nextSources,
              externalIds:
                Object.keys(nextExternalIds).length > 0 ? nextExternalIds : undefined,
              ...(resolvedAccount ? { account: resolvedAccount } : {}),
              aliasHashes: nextAliases,
              updatedAt: nowIso,
            },
          };

          const ledgerIdx = workingLedger.findIndex(t => t.id === existingPart.id);
          if (ledgerIdx >= 0) workingLedger[ledgerIdx] = updatedPart;
          upsertOp({ type: 'update', tx: updatedPart, previousId: existingPart.id });
          updatedGroupTxs.push(updatedPart);
        }

        summary.mergedEnriched += 1;
        records.push({
          inputIndex,
          externalId: raw.externalId,
          status: 'merged_enriched',
          transactions: updatedGroupTxs,
          matchedExistingId: updatedGroupTxs[0].id,
          matchedExistingIds: updatedGroupTxs.map(t => t.id),
          confidence: updatedGroupTxs[0].meta?.confidence ?? 0.9,
          categorizedBy: updatedGroupTxs[0].meta?.categorizedBy || 'keyword',
        });
        continue;
      }
    }

    // 6b. Single unclaimed cross-source / manual row match within ±crossSourceWindowDays
    const unclaimedCrossMatches = workingLedger
      .filter(t => {
        if ((t.meta?.sources || []).includes(sourceId)) return false;
        if (t.meta?.externalIds?.[sourceId]) return false;
        if (!accountsAreCompatible(t.meta?.account, rawAccount)) return false;
        if (t.type !== primary.type) return false;
        if (Math.abs(t.amount - totalInputAmount) > 0.01) return false;
        if (daysBetween(t.date, primary.date) > crossSourceWindowDays) return false;
        return merchantsMatch(t.description, raw.description, undefined, raw.merchant);
      })
      .sort(
        (a, b) =>
          daysBetween(a.date, primary.date) - daysBetween(b.date, primary.date)
      );

    if (unclaimedCrossMatches.length === 1) {
      const targetExisting = unclaimedCrossMatches[0];

      if (candidates.length === 1) {
        const mergedTx = buildTransactionFromCandidate(
          primary,
          sourceId,
          nowIso,
          undefined,
          targetExisting,
          idGen
        );
        const ledgerIdx = workingLedger.findIndex(t => t.id === targetExisting.id);
        if (ledgerIdx >= 0) workingLedger[ledgerIdx] = mergedTx;
        upsertOp({ type: 'update', tx: mergedTx, previousId: targetExisting.id });
        if (mergedTx.labels.includes('needs-review')) {
          flaggedTransactions.push(mergedTx);
        }
        summary.mergedEnriched += 1;
        records.push({
          inputIndex,
          externalId: raw.externalId,
          status: 'merged_enriched',
          transactions: [mergedTx],
          matchedExistingId: targetExisting.id,
          reviewReason: mergedTx.meta?.review?.reason,
          reviewDetail: mergedTx.meta?.review?.detail,
          confidence: mergedTx.meta?.confidence ?? primary.confidence,
          categorizedBy: mergedTx.meta?.categorizedBy || primary.categorizedBy,
        });
        continue;
      } else {
        const hasUserCategoryEdits = (targetExisting.meta?.userEdited || []).some(f =>
          ['category', 'subCategory', 'spendingBucket', 'amount'].includes(f)
        );

        if (hasUserCategoryEdits) {
          const preservedTx = buildTransactionFromCandidate(
            {
              ...primary,
              amount: targetExisting.amount,
              description: formatConsolidatedItemDescription(
                resolveMerchantPrefix(raw),
                (raw.items || []).map(i => i.title)
              ),
            },
            sourceId,
            nowIso,
            undefined,
            targetExisting,
            idGen
          );
          const ledgerIdx = workingLedger.findIndex(t => t.id === targetExisting.id);
          if (ledgerIdx >= 0) workingLedger[ledgerIdx] = preservedTx;
          upsertOp({ type: 'update', tx: preservedTx, previousId: targetExisting.id });
          summary.mergedEnriched += 1;
          records.push({
            inputIndex,
            externalId: raw.externalId,
            status: 'merged_enriched',
            transactions: [preservedTx],
            matchedExistingId: targetExisting.id,
            confidence: 1.0,
            categorizedBy: 'user',
          });
          continue;
        }

        // Reuse `targetExisting.id` for the first split child and insert the remaining K-1 children
        const resultingSplitTxs: Transaction[] = [];
        for (let idx = 0; idx < candidates.length; idx++) {
          const cand = candidates[idx];
          const suffixedExistingExtIds: Record<string, string> = {};
          for (const [srcK, extV] of Object.entries(
            targetExisting.meta?.externalIds || {}
          )) {
            if (extV) {
              const baseVal = extV.replace(/#split-\d+$/, '');
              suffixedExistingExtIds[srcK] = `${baseVal}#split-${idx + 1}`;
            }
          }

          if (idx === 0) {
            const firstChildTx = buildTransactionFromCandidate(
              cand,
              sourceId,
              nowIso,
              undefined,
              {
                ...targetExisting,
                amount: cand.amount,
                meta: {
                  ...(targetExisting.meta || {}),
                  externalIds: suffixedExistingExtIds,
                },
              },
              idGen
            );
            firstChildTx.meta = {
              ...(firstChildTx.meta || {}),
              aliasHashes: dedupeStrings([
                ...(firstChildTx.meta?.aliasHashes || []),
                shortHash(targetExisting.hash),
              ]),
            };
            const ledgerIdx = workingLedger.findIndex(t => t.id === targetExisting.id);
            if (ledgerIdx >= 0) workingLedger[ledgerIdx] = firstChildTx;
            upsertOp({
              type: 'update',
              tx: firstChildTx,
              previousId: targetExisting.id,
            });
            if (firstChildTx.labels.includes('needs-review')) {
              flaggedTransactions.push(firstChildTx);
            }
            resultingSplitTxs.push(firstChildTx);
          } else {
            const extraChildTx = buildTransactionFromCandidate(
              cand,
              sourceId,
              nowIso,
              undefined,
              undefined,
              idGen
            );
            extraChildTx.meta = {
              ...(extraChildTx.meta || {}),
              sources: dedupeStrings([
                ...(targetExisting.meta?.sources || []),
                sourceId,
              ]),
              externalIds: {
                ...suffixedExistingExtIds,
                ...(extraChildTx.meta?.externalIds || {}),
              },
              aliasHashes: dedupeStrings([
                ...(extraChildTx.meta?.aliasHashes || []),
                shortHash(targetExisting.hash),
              ]),
            };
            workingLedger.push(extraChildTx);
            createdInBatchIds.add(extraChildTx.id);
            ops.push({ type: 'insert', tx: extraChildTx });
            if (extraChildTx.labels.includes('needs-review')) {
              flaggedTransactions.push(extraChildTx);
            }
            resultingSplitTxs.push(extraChildTx);
          }
        }

        summary.mergedEnriched += 1;
        records.push({
          inputIndex,
          externalId: raw.externalId,
          status: 'merged_enriched',
          transactions: resultingSplitTxs,
          matchedExistingId: targetExisting.id,
          matchedExistingIds: [targetExisting.id],
          reviewReason: resultingSplitTxs[0].meta?.review?.reason,
          reviewDetail: resultingSplitTxs[0].meta?.review?.detail,
          confidence: primary.confidence,
          categorizedBy: primary.categorizedBy,
        });
        continue;
      }
    }

    // STEP 7: Opt-In Provisional Tip Drift (`merged_tip_adjusted`)
    if (candidates.length === 1 && !primary.provisional) {
      const provisionalMatches = workingLedger
        .filter(t => {
          if (createdInBatchIds.has(t.id) || claimedExistingIds.has(t.id)) return false;
          if (!matchProvisionalTipDrift && !isTxPending(t)) return false;
          if (!accountsAreCompatible(t.meta?.account, rawAccount)) return false;
          if (t.type !== 'expense' || primary.type !== 'expense') return false;
          const deltaDays = signedDaysBetween(t.date, primary.date);
          if (deltaDays < 0 || deltaDays > 3) return false;
          if (!merchantsMatch(t.description, raw.description, undefined, raw.merchant)) {
            return false;
          }
          const tipDelta = primary.amount - t.amount;
          const minTip = Math.max(1.0, t.amount * 0.01);
          const maxTip = Math.max(5.0, t.amount * 0.35);
          return tipDelta >= minTip - 0.005 && tipDelta <= maxTip + 0.005;
        })
        .sort(
          (a, b) =>
            daysBetween(a.date, primary.date) - daysBetween(b.date, primary.date)
        );

      if (provisionalMatches.length >= 1) {
        const provTarget = provisionalMatches[0];
        claimedExistingIds.add(provTarget.id);
        const updatedTipTx = buildTransactionFromCandidate(
          primary,
          sourceId,
          nowIso,
          undefined,
          provTarget,
          idGen
        );
        if (!provTarget.meta?.userEdited?.includes('notes')) {
          updatedTipTx.notes =
            stripPendingFromNotes(provTarget.notes) ||
            stripPendingFromNotes(primary.notes);
        }
        updatedTipTx.meta = {
          ...(updatedTipTx.meta || {}),
          provisional: false,
        };
        const ledgerIdx = workingLedger.findIndex(t => t.id === provTarget.id);
        if (ledgerIdx >= 0) workingLedger[ledgerIdx] = updatedTipTx;
        upsertOp({ type: 'update', tx: updatedTipTx, previousId: provTarget.id });
        summary.mergedTipAdjusted += 1;
        records.push({
          inputIndex,
          externalId: raw.externalId,
          status: 'merged_tip_adjusted',
          transactions: [updatedTipTx],
          matchedExistingId: provTarget.id,
          confidence: updatedTipTx.meta?.confidence ?? primary.confidence,
          categorizedBy: updatedTipTx.meta?.categorizedBy || primary.categorizedBy,
        });
        continue;
      }
    }

    // STEP 8: Ambiguous Duplicate Collision Check
    const collisionCandidates = workingLedger.filter(t => {
      if (t.type !== primary.type) return false;
      if (Math.abs(t.amount - totalInputAmount) > 0.01) return false;
      if (daysBetween(t.date, primary.date) > 2) return false;
      if (!accountsAreCompatible(t.meta?.account, rawAccount)) return false;
      // If both existing and incoming have distinct externalIds from the same source,
      // upstream guarantees they are separate transactions (e.g. two separate Plaid coffees).
      const existingSameSourceExtId = t.meta?.externalIds?.[sourceId];
      if (
        existingSameSourceExtId &&
        primary.externalId &&
        existingSameSourceExtId !== primary.externalId
      ) {
        return false;
      }
      return merchantsMatch(t.description, raw.description, undefined, raw.merchant);
    });

    if (collisionCandidates.length > 0 && candidates.length === 1) {
      const matchedCollision = collisionCandidates[0];
      if (triggerMode === 'interactive') {
        summary.needsConfirmation += 1;
        records.push({
          inputIndex,
          externalId: raw.externalId,
          status: 'needs_confirmation',
          transactions: [],
          matchedExistingId: matchedCollision.id,
          reviewReason: 'duplicate',
          reviewDetail: `Potential duplicate of $${matchedCollision.amount.toFixed(2)} at "${matchedCollision.description}" on ${matchedCollision.date}.`,
          confidence: primary.confidence,
          categorizedBy: primary.categorizedBy,
        });
        continue;
      }

      const dupReview = {
        reason: 'duplicate' as ReviewReason,
        detail: `Same merchant and amount ($${primary.amount.toFixed(2)}) within ${daysBetween(matchedCollision.date, primary.date)}d of "${matchedCollision.description}"; verify not a duplicate.`,
      };
      const insertedTx = buildTransactionFromCandidate(
        primary,
        sourceId,
        nowIso,
        dupReview,
        undefined,
        idGen
      );
      workingLedger.push(insertedTx);
      createdInBatchIds.add(insertedTx.id);
      ops.push({ type: 'insert', tx: insertedTx });
      flaggedTransactions.push(insertedTx);
      summary.insertedFlagged += 1;
      records.push({
        inputIndex,
        externalId: raw.externalId,
        status: 'inserted_flagged',
        transactions: [insertedTx],
        matchedExistingId: matchedCollision.id,
        reviewReason: 'duplicate',
        reviewDetail: dupReview.detail,
        confidence: primary.confidence,
        categorizedBy: primary.categorizedBy,
      });
      continue;
    }

    // STEP 9: Clean Insert or Flagged Insert (Low Confidence / Opaque Category / Amount Mismatch)
    const createdTxs: Transaction[] = [];
    let anyFlagged = false;
    for (const cand of candidates) {
      const needsCategoryFlag =
        cand.confidence < confidenceThreshold ||
        isUnclassifiedMisc(cand.category, cand.subCategory) ||
        Boolean(cand.reviewReason);

      const overrideRev = needsCategoryFlag
        ? {
            reason: (cand.reviewReason || 'category') as ReviewReason,
            detail:
              cand.reviewDetail ||
              `Low confidence category assignment (${Math.round(cand.confidence * 100)}%).`,
          }
        : undefined;

      const newTx = buildTransactionFromCandidate(
        cand,
        sourceId,
        nowIso,
        overrideRev,
        undefined,
        idGen
      );
      workingLedger.push(newTx);
      createdInBatchIds.add(newTx.id);
      ops.push({ type: 'insert', tx: newTx });
      createdTxs.push(newTx);

      if (newTx.labels.includes('needs-review')) {
        anyFlagged = true;
        flaggedTransactions.push(newTx);
      }
    }

    if (anyFlagged) {
      summary.insertedFlagged += 1;
      records.push({
        inputIndex,
        externalId: raw.externalId,
        status: 'inserted_flagged',
        transactions: createdTxs,
        reviewReason: createdTxs[0].meta?.review?.reason,
        reviewDetail: createdTxs[0].meta?.review?.detail,
        confidence: primary.confidence,
        categorizedBy: primary.categorizedBy,
      });
    } else {
      summary.inserted += 1;
      records.push({
        inputIndex,
        externalId: raw.externalId,
        status: 'inserted',
        transactions: createdTxs,
        confidence: primary.confidence,
        categorizedBy: primary.categorizedBy,
      });
    }
  }

  // Compute updated IngestState (only persist syncStartDate if explicitly configured)
  const prevSourceState = prevIngestState.sources?.[sourceId];
  const nextSourceSyncStartDate =
    request.options?.syncStartDate ||
    prevSourceState?.syncStartDate ||
    undefined;

  const nextIngestState: IngestState = {
    version: 1,
    sources: {
      ...(prevIngestState.sources || {}),
      [sourceId]: {
        sourceId,
        ...(nextSourceSyncStartDate ? { syncStartDate: nextSourceSyncStartDate } : {}),
        lastSyncAt: nowIso,
        totalIngested:
          (prevSourceState?.totalIngested || 0) +
          summary.inserted +
          summary.insertedFlagged +
          summary.mergedEnriched +
          summary.updatedFromSource,
      },
    },
    tombstones: Array.from(tombstoneSet).slice(-MAX_TOMBSTONES),
    recentRuns: [
      ...(Array.isArray(prevIngestState.recentRuns)
        ? prevIngestState.recentRuns
        : []
      ).slice(-(MAX_RUN_HISTORY - 1)),
      {
        runId: request.options?.idGenerator
          ? `run-${idGen()}`
          : `run-${Number.isFinite(Date.parse(nowIso)) ? Date.parse(nowIso) : 0}`,
        sourceId,
        timestamp: nowIso,
        inserted: summary.inserted,
        flagged: summary.insertedFlagged,
        merged: summary.mergedEnriched + summary.mergedTipAdjusted,
        updated: summary.updatedFromSource,
        removed: summary.removed,
        skipped:
          summary.skippedDuplicate +
          summary.skippedTombstoned +
          summary.skippedBeforeCutoff,
      },
    ],
  };

  return {
    sourceId,
    triggerMode,
    ops,
    nextIngestState,
    summary,
    records,
    flaggedTransactions,
  };
}

/**
 * Collects unknown/low-confidence descriptions that failed Stage 1 & Stage 2
 * so they can be batch-classified with Gemini in a single call before planning.
 */
async function collectLlmClassifications(
  snapshot: IngestSnapshot,
  request: IngestRequest
): Promise<Map<string, ClassifiedResultItem>> {
  const result = new Map<string, ClassifiedResultItem>();
  if (request.options?.skipLlm) return result;

  const { sourceId } = request;
  const effectiveCutoff =
    request.options?.syncStartDate ||
    snapshot.ingestState?.sources?.[sourceId]?.syncStartDate;
  const tombstoneSet = new Set<string>(
    normalizeTombstoneArray(snapshot.ingestState?.tombstones)
  );

  const allCategories: Category[] = (() => {
    const map = new Map<string, Category>();
    DEFAULT_CATEGORIES.forEach(c => map.set(c.id, c));
    (snapshot.categories || []).forEach(c => map.set(c.id, c));
    return Array.from(map.values());
  })();

  const pendingBatch: {
    id: string;
    description: string;
    amount: number;
    type: string;
  }[] = [];

  for (let i = 0; i < request.transactions.length; i++) {
    const raw = request.transactions[i];
    if (raw.op === 'remove' || raw.category) continue;

    const normalizedDate = normalizeIsoDate(raw.date);
    if (effectiveCutoff && normalizedDate < effectiveCutoff) continue;

    if (
      (raw.externalId && tombstoneSet.has(raw.externalId)) ||
      (raw.supersedesExternalId && tombstoneSet.has(raw.supersedesExternalId))
    ) {
      continue;
    }

    // Skip if already ingested from the same source with identical externalId
    if (raw.externalId) {
      const alreadyIngested = snapshot.existingTransactions.some(t => {
        const storedId = t.meta?.externalIds?.[sourceId];
        return (
          storedId === raw.externalId ||
          Boolean(storedId && storedId.startsWith(`${raw.externalId}#split-`))
        );
      });
      if (alreadyIngested) continue;
    }

    if (raw.items && raw.items.length > 0) {
      const merchantPrefix = resolveMerchantPrefix(raw);
      for (let j = 0; j < raw.items.length; j++) {
        const item = raw.items[j];
        const desc = `${merchantPrefix}: ${item.title}`;
        const hint = item.categoryHint || raw.categoryHint;
        const itemTextOnly = `${item.title} ${hint || ''}`;
        const combined = `${desc} ${hint || ''}`;
        if (raw.type === 'income' && !detectRefund(combined, raw.type)) continue;
        const itemCat = suggestCategory(itemTextOnly, hint, allCategories);
        const itemSub = suggestSubCategory(itemTextOnly, itemCat, allCategories);
        const useItem = !isUnclassifiedMisc(itemCat, itemSub);
        const kwCat = useItem
          ? itemCat
          : suggestCategory(combined, hint, allCategories);
        const kwSub = useItem
          ? itemSub
          : suggestSubCategory(combined, kwCat, allCategories);
        if (
          !isTransfer(combined) &&
          !lookupHistoryClassification(desc, merchantPrefix, snapshot.existingTransactions) &&
          isUnclassifiedMisc(kwCat, kwSub)
        ) {
          pendingBatch.push({
            id: `item:${i}:${j}`,
            description: desc,
            amount: Math.abs(item.price),
            type: raw.type || 'expense',
          });
        }
      }
    } else {
      const combined = [raw.merchant, raw.description, raw.categoryHint]
        .filter(Boolean)
        .join(' ');
      if (raw.type === 'income' && !detectRefund(combined, raw.type)) continue;
      const itemTextOnly =
        raw.description.includes(':') && !isOpaqueDescription(raw.description)
          ? `${raw.description.split(':').slice(1).join(':')} ${raw.categoryHint || ''}`
          : combined;
      const itemCat = suggestCategory(itemTextOnly, raw.categoryHint, allCategories);
      const itemSub = suggestSubCategory(itemTextOnly, itemCat, allCategories);
      const useItem = !isUnclassifiedMisc(itemCat, itemSub);
      const kwCat = useItem
        ? itemCat
        : suggestCategory(combined, raw.categoryHint, allCategories);
      const kwSub = useItem
        ? itemSub
        : suggestSubCategory(combined, kwCat, allCategories);
      if (
        !isTransfer(combined) &&
        !lookupHistoryClassification(
          raw.description,
          raw.merchant,
          snapshot.existingTransactions
        ) &&
        isUnclassifiedMisc(kwCat, kwSub)
      ) {
        pendingBatch.push({
          id: `tx:${i}`,
          description: combined,
          amount: Math.abs(raw.amount),
          type: raw.type || 'expense',
        });
      }
    }
  }

  if (pendingBatch.length === 0) return result;

  try {
    const classifiedMap = await classifyTransactionsWithLLM(
      pendingBatch.map(p => ({
        id: p.id,
        description: p.description,
        amount: p.amount,
        type: (p.type as 'expense' | 'income' | 'transfer') || 'expense',
      })),
      allCategories
    );
    for (const [id, item] of Object.entries(classifiedMap)) {
      if (id && item) {
        result.set(id, item);
      }
    }
  } catch {
    // Graceful fallback: Stage 2/3 in planIngestion will assign 'misc' + 'needs-review'
  }

  return result;
}

/**
 * Storage Executor: Applies a planned `IngestPlan` against a `StorageAdapter`.
 * Always passes `{ ignoreLocks: true }` per user configuration.
 * Uses `adapter.commitIngestBatch` when available for single-write atomicity + rollback,
 * and falls back to snapshot + rollback if a mid-flight failure occurs on custom adapters.
 */
export async function executePlan(
  plan: IngestPlan,
  adapter: StorageAdapter,
  projectId: string
): Promise<void> {
  adapter.invalidateCache?.(projectId);

  const upserts = plan.ops
    .filter(
      (op): op is { type: 'insert'; tx: Transaction } | { type: 'update'; tx: Transaction; previousId: string } =>
        op.type === 'insert' || op.type === 'update'
    )
    .map(op => op.tx);

  const upsertIds = new Set(upserts.map(u => u.id));
  const deleteIds = plan.ops
    .filter(
      (op): op is { type: 'delete'; id: string } =>
        op.type === 'delete' && !upsertIds.has(op.id)
    )
    .map(op => op.id);

  if (typeof adapter.commitIngestBatch === 'function') {
    await adapter.commitIngestBatch(
      projectId,
      {
        upserts,
        deleteIds,
        ingestState: plan.nextIngestState,
      },
      { ignoreLocks: true }
    );
    return;
  }

  // Fallback path for custom adapters without commitIngestBatch: snapshot & roll back on failure
  const previousTransactions = await adapter.getTransactions(projectId);
  const previousIds = new Set(previousTransactions.map(t => t.id));
  let mutatedTransactions = false;

  try {
    if (upserts.length > 0) {
      await adapter.saveTransactions(projectId, upserts, { ignoreLocks: true });
      mutatedTransactions = true;
    }

    if (deleteIds.length > 0) {
      if (typeof adapter.deleteTransactions === 'function') {
        await adapter.deleteTransactions(projectId, deleteIds, { ignoreLocks: true });
      } else {
        for (const id of deleteIds) {
          await adapter.deleteTransaction(projectId, id, { ignoreLocks: true });
        }
      }
      mutatedTransactions = true;
    }

    if (typeof adapter.saveIngestState === 'function') {
      await adapter.saveIngestState(projectId, plan.nextIngestState);
    }
  } catch (err) {
    if (mutatedTransactions) {
      try {
        const newlyInsertedIds = upserts
          .map(u => u.id)
          .filter(id => !previousIds.has(id));
        if (newlyInsertedIds.length > 0) {
          if (typeof adapter.deleteTransactions === 'function') {
            await adapter.deleteTransactions(projectId, newlyInsertedIds, { ignoreLocks: true });
          } else {
            for (const id of newlyInsertedIds) {
              await adapter.deleteTransaction(projectId, id, { ignoreLocks: true });
            }
          }
        }
        if (previousTransactions.length > 0) {
          await adapter.saveTransactions(projectId, previousTransactions, { ignoreLocks: true });
        }
      } catch {
        // Preserve original error
      }
    }
    throw err;
  }
}

const projectIngestLocks = new Map<string, Promise<unknown>>();

function withProjectIngestLock<T>(
  projectId: string,
  fn: () => Promise<T>
): Promise<T> {
  const prev = projectIngestLocks.get(projectId) || Promise.resolve();
  const next = prev.then(fn, fn);
  projectIngestLocks.set(
    projectId,
    next.catch(() => {})
  );
  return next;
}

/**
 * Top-level Orchestrator: Serializes concurrent runs per `projectId` (both in-process
 * via `withProjectIngestLock` and cross-process via `adapter.acquireIngestLock`),
 * loads snapshot from `StorageAdapter`, runs optional Gemini batch classification,
 * plans ingestion via `planIngestion`, and persists via `executePlan`.
 */
export async function ingestTransactions(
  request: IngestRequest,
  adapter: StorageAdapter
): Promise<IngestResponse> {
  return withProjectIngestLock(request.projectId, async () => {
    const dryRun = Boolean(request.options?.dryRun);
    const holderId = `${request.sourceId}-${generateId()}`;

    if (!dryRun && typeof adapter.acquireIngestLock === 'function') {
      await adapter.acquireIngestLock(request.projectId, holderId);
    }

    try {
      adapter.invalidateCache?.(request.projectId);

      const [existingTransactions, categories, ingestState] = await Promise.all([
        adapter.getTransactions(request.projectId),
        adapter.getCategories(request.projectId),
        typeof adapter.getIngestState === 'function'
          ? adapter.getIngestState(request.projectId)
          : Promise.resolve({
              version: 1 as const,
              sources: {},
              tombstones: [],
              recentRuns: [],
            }),
      ]);

      const snapshot: IngestSnapshot = {
        existingTransactions,
        categories,
        ingestState,
      };

      const llmClassifications = await collectLlmClassifications(snapshot, request);
      const plan = await planIngestion(snapshot, request, llmClassifications);

      if (!dryRun) {
        await executePlan(plan, adapter, request.projectId);
      }

      return {
        ...plan,
        dryRun,
      };
    } finally {
      if (!dryRun && typeof adapter.releaseIngestLock === 'function') {
        try {
          await adapter.releaseIngestLock(request.projectId, holderId);
        } catch {
          // Best-effort lock cleanup
        }
      }
    }
  });
}
