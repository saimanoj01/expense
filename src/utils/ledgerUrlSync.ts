import type { SpendingBucket } from '../services/storage';
import { getCanonicalAccountKey, SYSTEM_LABELS } from './transactionTaxonomy';

export type LedgerTypeFilterValue = 'expense' | 'income' | 'refund' | 'transfer' | null;
export type LedgerBucketFilterValue = 'income' | SpendingBucket | null;

export interface LedgerUrlState {
  bucket: LedgerBucketFilterValue;
  type: LedgerTypeFilterValue;
  cat: string | null;
  account: string | null;
  tag: string | null;
  review: boolean;
  day: number | null;
  auto: boolean;
  pending: boolean;
  q: string;
  sort: string | null;
}

export interface LedgerUrlParseContext {
  isCategoryTransactions?: boolean;
  initialCategoryId?: string;
}

export interface LedgerUrlBuildInput {
  month: string;
  isCategoryTransactions?: boolean;
  initialCategoryId?: string;
  bucket?: LedgerBucketFilterValue;
  type?: LedgerTypeFilterValue;
  cat?: string | null;
  account?: string | null;
  tag?: string | null;
  review?: boolean;
  day?: number | null;
  auto?: boolean;
  pending?: boolean;
  q?: string;
  sort?: string | null;
}

const VALID_SORT_VALUES = new Set<string>([
  'date-desc',
  'date-asc',
  'amount-desc',
  'amount-asc',
  'desc-asc',
  'desc-desc',
  'cat-asc',
  'cat-desc',
  'category-asc',
  'description-asc',
]);

function normalizeBucketParam(raw: string | null): LedgerBucketFilterValue {
  if (!raw) return null;
  const lower = raw.trim().toLowerCase();
  if (lower === 'fixed') return 'fixed';
  if (lower === 'flexible' || lower === 'variable') return 'flexible';
  if (lower === 'non-monthly' || lower === 'nonmonthly' || lower === 'irregular') {
    return 'non-monthly';
  }
  if (lower === 'income' || lower === 'inflow') return 'income';
  return null;
}

function normalizeTypeParam(raw: string | null): LedgerTypeFilterValue {
  if (!raw) return null;
  const lower = raw.trim().toLowerCase();
  if (
    lower === 'expense' ||
    lower === 'income' ||
    lower === 'refund' ||
    lower === 'transfer'
  ) {
    return lower;
  }
  return null;
}

/**
 * Parses URL hash query parameters and category-drilldown context into a complete,
 * deterministic filter state (always resetting absent filters to `null`/`false` so
 * ghost filters never leak across route transitions).
 */
export function parseLedgerUrlState(
  hash: string,
  context: LedgerUrlParseContext = {}
): LedgerUrlState {
  const qIdx = hash.indexOf('?');
  const params = new URLSearchParams(qIdx !== -1 ? hash.slice(qIdx + 1) : '');

  const bucket = normalizeBucketParam(params.get('bucket'));
  const type = normalizeTypeParam(params.get('type'));

  const rawCat = (params.get('cat') || params.get('category'))?.trim() || null;
  const cat =
    context.isCategoryTransactions && context.initialCategoryId
      ? context.initialCategoryId
      : rawCat;

  const rawAcct = params.get('account');
  const account = rawAcct ? getCanonicalAccountKey(rawAcct) || null : null;

  const rawTag = params.get('tag')?.trim() || null;
  const cleanTag = rawTag ? rawTag.replace(/^#+/, '').toLowerCase() : null;
  const isLegacyReviewTag = cleanTag === 'needs-review';
  const tag =
    cleanTag && !isLegacyReviewTag && !SYSTEM_LABELS.has(cleanTag) ? cleanTag : null;

  const review = params.get('review') === '1' || isLegacyReviewTag;

  const dayRaw = parseInt(params.get('day') || '', 10);
  const day = !isNaN(dayRaw) && dayRaw >= 1 && dayRaw <= 31 ? dayRaw : null;

  const auto = params.get('auto') === '1';
  const pending = params.get('pending') === '1';
  const q = params.get('q') || '';

  const rawSort = params.get('sort')?.trim() || null;
  const sort = rawSort && VALID_SORT_VALUES.has(rawSort) ? rawSort : null;

  return {
    bucket,
    type,
    cat,
    account,
    tag,
    review,
    day,
    auto,
    pending,
    q,
    sort,
  };
}

/**
 * Serializes current ledger filter state into a canonical URL hash string.
 * Preserves `#/month/:m/category/:catId/transactions` path when inside a Level 4 category drilldown,
 * and omits `sort` when `sort === 'date-desc'` so clean hashes match `#/transactions?month=YYYY-MM`.
 */
export function buildLedgerUrlHash(state: LedgerUrlBuildInput): string {
  const keepCategoryPath = Boolean(
    state.isCategoryTransactions &&
      state.initialCategoryId &&
      state.cat &&
      state.cat.toLowerCase() === state.initialCategoryId.toLowerCase()
  );

  const params = new URLSearchParams();
  if (!keepCategoryPath) {
    params.set('month', state.month);
  }

  if (state.bucket) {
    params.set('bucket', state.bucket);
  }
  if (state.type) {
    params.set('type', state.type);
  }
  if (!keepCategoryPath && state.cat) {
    params.set('cat', state.cat);
  }
  if (state.account) {
    params.set('account', state.account);
  }
  if (state.tag) {
    params.set('tag', state.tag);
  }
  if (state.review) {
    params.set('review', '1');
  }
  if (state.day !== null && state.day !== undefined && state.day >= 1 && state.day <= 31) {
    params.set('day', String(state.day));
  }
  if (state.auto) {
    params.set('auto', '1');
  }
  if (state.pending) {
    params.set('pending', '1');
  }
  if (state.q && state.q.trim()) {
    params.set('q', state.q);
  }
  if (state.sort && state.sort !== 'date-desc' && VALID_SORT_VALUES.has(state.sort)) {
    params.set('sort', state.sort);
  }

  const qs = params.toString();
  if (keepCategoryPath && state.initialCategoryId) {
    const base = `#/month/${state.month}/category/${encodeURIComponent(
      state.initialCategoryId
    )}/transactions`;
    return qs ? `${base}?${qs}` : base;
  }

  return `#/transactions?${qs}`;
}

/**
 * Preserves active non-day ledger query parameters (`bucket`, `type`, `cat`, `account`,
 * `tag`, `review`, `auto`, `pending`, `q`, `sort`) when switching months via `MonthSwitcher`.
 */
export function preserveLedgerParamsOnMonthSwitch(
  currentHash: string,
  nextMonth: string
): string {
  const parsed = parseLedgerUrlState(currentHash);
  return buildLedgerUrlHash({
    month: nextMonth,
    bucket: parsed.bucket,
    type: parsed.type,
    cat: parsed.cat,
    account: parsed.account,
    tag: parsed.tag,
    review: parsed.review,
    day: null, // Drop day-of-month filter on month switch
    auto: parsed.auto,
    pending: parsed.pending,
    q: parsed.q,
    sort: parsed.sort,
  });
}
