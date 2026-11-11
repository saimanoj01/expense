import type { Transaction } from '../services/storage';

/**
 * Reserved structural, accounting, and workflow labels that must NEVER
 * appear as visible user `#tags` or in tag autocomplete/filter lists.
 */
export const SYSTEM_LABELS = new Set<string>([
  'fixed',
  'flexible',
  'non-monthly',
  'income',
  'expense',
  'transfer',
  'needs-review',
  'refund',
  'reimbursement',
  'duplicate-verified',
  'imported',
]);

/**
 * Canonical payment account slugs -> human-readable display names.
 */
export const KNOWN_ACCOUNT_DISPLAY_MAP: Record<string, string> = {
  bilt: 'Bilt',
  'manoj bofa': 'Manoj BofA',
  'priyanka chase': 'Priyanka Chase',
  'bofa atmos': 'BofA Atmos',
  'wells fargo': 'Wells Fargo',
  'amazon-synchrony': 'Amazon Card',
  'amazon store card': 'Amazon Card',
  'amazon card': 'Amazon Card',
};

/**
 * Maps aliases (e.g. 'amazon store card' and 'amazon-synchrony') onto a shared
 * canonical filter/grouping key while preserving custom account strings.
 */
const ACCOUNT_CANONICAL_KEY_MAP: Record<string, string> = {
  bilt: 'bilt',
  'manoj bofa': 'manoj bofa',
  'priyanka chase': 'priyanka chase',
  'bofa atmos': 'bofa atmos',
  'wells fargo': 'wells fargo',
  'amazon-synchrony': 'amazon-synchrony',
  'amazon store card': 'amazon-synchrony',
  'amazon card': 'amazon-synchrony',
};

function ensureStringLabels(labels: unknown): string[] {
  if (Array.isArray(labels)) {
    return labels.filter((l): l is string => typeof l === 'string');
  }
  if (typeof labels === 'string' && labels.trim()) {
    return labels
      .split(',')
      .map(s => s.trim())
      .filter(Boolean);
  }
  return [];
}

export function getCanonicalAccountKey(rawAccount?: string | null): string {
  if (!rawAccount) return '';
  const norm = rawAccount.trim().toLowerCase();
  if (!norm) return '';
  return ACCOUNT_CANONICAL_KEY_MAP[norm] || norm;
}

export function isKnownAccountLabel(label: string): boolean {
  const norm = label.trim().toLowerCase();
  return Boolean(norm && Object.prototype.hasOwnProperty.call(KNOWN_ACCOUNT_DISPLAY_MAP, norm));
}

/**
 * Resolves a transaction's payment account, reading `tx.meta.account` first
 * and falling back to any legacy account slug stored in `tx.labels`.
 */
export function resolveTransactionAccount(tx?: Partial<Transaction> | null): string | null {
  if (!tx) return null;
  const metaAcct = tx.meta?.account?.trim();
  if (metaAcct) return metaAcct;
  if (Array.isArray(tx.meta?.userEdited) && tx.meta.userEdited.includes('account')) {
    return null;
  }

  const labels = ensureStringLabels(tx.labels);
  for (const raw of labels) {
    const norm = raw.trim().toLowerCase();
    if (isKnownAccountLabel(norm)) {
      return ACCOUNT_CANONICAL_KEY_MAP[norm] || norm;
    }
  }
  return null;
}

/**
 * Formats an account identifier into a concise, readable display label.
 */
export function formatAccountDisplay(rawAccount?: string | null): string {
  if (!rawAccount) return '';
  const trimmed = rawAccount.trim();
  if (!trimmed) return '';
  const norm = trimmed.toLowerCase();
  if (KNOWN_ACCOUNT_DISPLAY_MAP[norm]) {
    return KNOWN_ACCOUNT_DISPLAY_MAP[norm];
  }
  const canonical = ACCOUNT_CANONICAL_KEY_MAP[norm];
  if (canonical && KNOWN_ACCOUNT_DISPLAY_MAP[canonical]) {
    return KNOWN_ACCOUNT_DISPLAY_MAP[canonical];
  }
  // If already mixed-case (user entered "Chase Sapphire"), preserve their casing
  if (trimmed !== norm && trimmed !== trimmed.toUpperCase()) {
    return trimmed;
  }
  return trimmed
    .split(/\s+/)
    .map(w => (w ? w.charAt(0).toUpperCase() + w.slice(1).toLowerCase() : ''))
    .join(' ');
}

/**
 * Returns only genuine user-authored `#tags`, excluding structural buckets,
 * workflow/accounting flags, and payment account slugs.
 */
export function getVisibleUserTags(tx?: Partial<Transaction> | null): string[] {
  if (!tx) return [];
  const rawLabels = ensureStringLabels(tx.labels);
  if (rawLabels.length === 0) return [];

  const metaAcctNorm = tx.meta?.account?.trim().toLowerCase() || '';
  const metaAcctCanon = getCanonicalAccountKey(metaAcctNorm);
  const seen = new Set<string>();
  const result: string[] = [];

  for (const raw of rawLabels) {
    const norm = raw.trim().toLowerCase();
    if (!norm) continue;
    if (SYSTEM_LABELS.has(norm)) continue;
    if (isKnownAccountLabel(norm)) continue;
    if (metaAcctNorm && (norm === metaAcctNorm || getCanonicalAccountKey(norm) === metaAcctCanon)) {
      continue;
    }
    if (!seen.has(norm)) {
      seen.add(norm);
      result.push(norm);
    }
  }
  return result;
}

/**
 * Sanitizes user-entered tag strings (from tag popovers, modal inputs, or CSV batch tags),
 * stripping leading `#` and filtering out reserved system/bucket/account labels.
 */
export function sanitizeUserTagsInput(rawTags: string[], accountHint?: string | null): string[] {
  const acctNorm = accountHint?.trim().toLowerCase() || '';
  const acctCanon = getCanonicalAccountKey(acctNorm);
  const seen = new Set<string>();
  const out: string[] = [];

  for (const raw of rawTags) {
    const cleaned = raw.replace(/^#+/, '').trim().toLowerCase();
    if (!cleaned) continue;
    if (SYSTEM_LABELS.has(cleaned)) continue;
    if (isKnownAccountLabel(cleaned)) continue;
    if (acctNorm && (cleaned === acctNorm || getCanonicalAccountKey(cleaned) === acctCanon)) {
      continue;
    }
    if (!seen.has(cleaned)) {
      seen.add(cleaned);
      out.push(cleaned);
    }
  }
  return out;
}

/**
 * Determines whether a transaction is currently Pending / provisional.
 * Respects `tx.meta.provisional` when explicitly boolean, and avoids false-positives
 * on settled notes such as `"Settled with $5.00 tip (was $50.00 Pending)"`.
 */
export function isTransactionPending(tx?: Partial<Transaction> | null): boolean {
  if (!tx) return false;
  if (typeof tx.meta?.provisional === 'boolean') {
    return tx.meta.provisional;
  }
  const notes = tx.notes || '';
  if (notes) {
    const segments = notes.split(/\s*[•|]\s*/).map(s => s.trim()).filter(Boolean);
    if (segments.some(seg => /^pending$/i.test(seg))) {
      return true;
    }
    if (/\bpending\b/i.test(notes) && !/\bsettled\b/i.test(notes) && !/\(was\b[^)]*pending\)/i.test(notes)) {
      return true;
    }
  }
  const desc = tx.description || '';
  return /^\s*pending\b|\bpending\s*$/i.test(desc);
}

const BOILERPLATE_NOTE_EXACT = new Set<string>([
  'imported via csv',
  'google wallet (plaid)',
  'google wallet',
  'plaid',
  'pending',
]);

/**
 * Strips machine-generated ingestion provenance boilerplate from `tx.notes`
 * (e.g. `"Imported via CSV"`, `"Google Wallet (Plaid) • Bilt Palladium Card (7702) • Pending"`)
 * while preserving genuine user notes and meaningful enrichment details.
 */
export function getUserFacingNote(tx?: Partial<Transaction> | null): string {
  if (!tx?.notes) return '';
  const raw = tx.notes.trim();
  if (!raw) return '';

  const segments = raw
    .split(/\s*[•|]\s*/)
    .map(s => s.trim())
    .filter(Boolean);

  if (segments.length === 0) return '';

  const hasWalletPrefix = segments.some(s => /^google wallet/i.test(s));
  const resolvedAcct = resolveTransactionAccount(tx);
  const acctDisplayLower = formatAccountDisplay(resolvedAcct).toLowerCase();
  const acctRawLower = resolvedAcct?.toLowerCase() || '';

  const kept = segments.filter(seg => {
    const lower = seg.toLowerCase();
    if (BOILERPLATE_NOTE_EXACT.has(lower)) return false;
    // Strip card/account display segment like "Bilt Palladium Card (7702)" or "TOTAL CHECKING (8885)"
    if (hasWalletPrefix && /\(\d{4}\)$/.test(seg) && seg.length <= 64) {
      return false;
    }
    if (acctDisplayLower && lower === acctDisplayLower) return false;
    if (acctRawLower && lower === acctRawLower) return false;
    return true;
  });

  return kept.join(' · ');
}

/**
 * True if a transaction's duplicate status has already been verified/dismissed by the user.
 */
export function isDuplicateVerified(tx?: Partial<Transaction> | null): boolean {
  if (!tx) return false;
  const labels = ensureStringLabels(tx.labels);
  if (labels.some(l => l.trim().toLowerCase() === 'duplicate-verified')) {
    return true;
  }
  const rev = tx.meta?.review;
  if (rev?.resolvedAt) {
    const reasons = rev.reasons?.length ? rev.reasons : rev.reason ? [rev.reason] : [];
    if (reasons.includes('duplicate')) {
      return true;
    }
  }
  return false;
}

/**
 * Unified predicate for whether a transaction requires user review
 * (either flagged by ingestion review metadata/label or part of an unverified duplicate collision).
 */
export function isTransactionNeedsReview(
  tx?: Partial<Transaction> | null,
  duplicateTxnIds?: Set<string>
): boolean {
  if (!tx) return false;
  const labels = ensureStringLabels(tx.labels);
  if (labels.some(l => l.trim().toLowerCase() === 'needs-review')) {
    return true;
  }
  if (tx.meta?.review && !tx.meta.review.resolvedAt) {
    return true;
  }
  if (tx.id && duplicateTxnIds?.has(tx.id)) {
    return true;
  }
  return false;
}
