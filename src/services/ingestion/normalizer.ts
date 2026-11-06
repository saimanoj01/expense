/**
 * Merchant & Description Normalization, Marketplace Detection, Date Window Math,
 * and Largest-Remainder Cents Allocation for Transaction Ingestion.
 */

const PAYMENT_PROCESSOR_PREFIX_RE =
  /^(?:sq\s*\*|tst\s*\*|pp\s*\*|paypal\s*\*|sp\s*\*|awl\s*\*|dd\s*\*|doordash\s*\*|uber\s*\*|caviar\s*\*|Toast\s*\*)\s*/i;

const TRAILING_STORE_METADATA_RE =
  /\s+(?:#\s*\d+|\bstore\s*#?\s*\d+|\b(?:ca|ny|tx|wa|fl|il|nj|va|ga|nc|mi|az|co|nv|md|mn|wi|tn|ut|ct|sc|ky|al|nh|ri|mt|sd|nd|ak|vt|wy|dc)\b|\b\d{4,}\b|\b\d{3}-\d{3}-\d{4}\b)+$/gi;

const AMAZON_PATTERNS = [
  /\bamzn\b/i,
  /\bamazon\b/i,
  /\bamz\s*\*\s*/i,
];

const BILT_PATTERNS = [
  /\bbilt\s+rewards\b/i,
  /\bbilt\s+rent\b/i,
  /\bbilt\s+dining\b/i,
];

const KNOWN_MERCHANT_FAMILIES = new Set([
  'whole foods',
  'prime video',
  'amazon',
  'bilt',
  'target',
  'walmart',
  'costco',
  'trader joes',
  'starbucks',
  'blue bottle coffee',
  'chipotle',
  'uber eats',
  'uber',
  'lyft',
  'doordash',
]);

/**
 * Multi-category marketplaces where a bare merchant match in ledger history
 * is NOT safe to reuse for categorization without item-level context.
 */
const MULTI_CATEGORY_MARKETPLACES = new Set([
  'amazon',
  'target',
  'walmart',
  'costco',
  'sams club',
  'fred meyer',
  'meijer',
  'bj s wholesale',
]);

/**
 * Normalizes a raw bank statement descriptor or merchant name into a clean,
 * comparable lowercase merchant string.
 */
export function normalizeMerchantName(raw: string): string {
  if (!raw) return '';
  let s = raw.trim();

  // Strip processor prefixes like "SQ *", "TST*", "PP*"
  s = s.replace(PAYMENT_PROCESSOR_PREFIX_RE, '');

  // If formatted like "Amazon: Ceramic Plant Pots", check if prefix is Amazon
  if (/^amazon\s*:/i.test(s)) {
    return 'amazon';
  }

  // Collapse Amazon variants ("AMZN Mktp US*1A2B3C", "AMAZON.COM*9X8Y", "AMZ*Amazon")
  if (
    /\b(?:amzn|amazon\.com|amazon\s+mktp|amazon\s+marketplace|synchrony\s+amazon|amz\*amazon)\b/i.test(
      s
    )
  ) {
    return 'amazon';
  }

  // Collapse punctuation and asterisks used in statement descriptors (e.g. "AMZN Mktp US*2K9P1" -> "amzn mktp us")
  s = s.replace(/\*[a-z0-9]+/gi, ' ');
  s = s.replace(/[_/|]+/g, ' ');
  s = s.replace(/\s+/g, ' ').trim();

  // Remove trailing store numbers, phone numbers, and unambiguous state codes
  s = s.replace(TRAILING_STORE_METADATA_RE, '').trim();
  s = s.replace(/[#*.,:;!?()-]+$/g, '').trim();

  return s.toLowerCase();
}

/**
 * Maps a raw description or merchant string to a canonical merchant family ID
 * for cross-source matching (e.g., matching an Amazon order email `"Amazon: Anker Charger"`
 * with a Synchrony statement line `"AMZN Mktp US*2K9P"`).
 */
export function getMerchantFamily(raw: string): string {
  if (!raw) return '';
  const trimmed = raw.trim();
  const lower = trimmed.toLowerCase();

  // An item-enriched Amazon order ("Amazon: Whole Foods Delivery") belongs to the Amazon billing family
  if (/^amazon\s*:/i.test(trimmed)) return 'amazon';
  if (/\bwhole\s*foods\b/i.test(lower)) return 'whole foods';
  if (/\bprime\s+video\b/i.test(lower)) return 'prime video';
  if (AMAZON_PATTERNS.some(re => re.test(lower))) return 'amazon';
  if (BILT_PATTERNS.some(re => re.test(lower))) return 'bilt';
  if (/\btarget\b/i.test(lower)) return 'target';
  if (/\bwalmart\b|\bwal-mart\b|\bwm\s+supercenter\b/i.test(lower)) return 'walmart';
  if (/\bcostco\b/i.test(lower)) return 'costco';
  if (/\btrader\s+joe'?s\b/i.test(lower)) return 'trader joes';
  if (/\bstarbucks\b/i.test(lower)) return 'starbucks';
  if (/\bblue\s+bottle\b/i.test(lower)) return 'blue bottle coffee';
  if (/\bchipotle\b/i.test(lower)) return 'chipotle';
  if (/\buber\s*eats\b/i.test(lower)) return 'uber eats';
  if (/\buber\b/i.test(lower)) return 'uber';
  if (/\blyft\b/i.test(lower)) return 'lyft';
  if (/\bdoordash\b|\bdd\s*\*/i.test(lower)) return 'doordash';

  return normalizeMerchantName(raw);
}

function tokensMatchOnBoundaries(normA: string, normB: string): boolean {
  const shorter = normA.length <= normB.length ? normA : normB;
  const longer = normA.length <= normB.length ? normB : normA;
  if (shorter.length < 4) return false;

  const escapedPhrase = shorter.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  if (new RegExp(`\\b${escapedPhrase}\\b`, 'i').test(longer)) {
    return true;
  }

  const STOP_TOKENS = new Set(['payment', 'bill', 'online', 'store', 'inc', 'llc', 'corp', 'the']);
  const shortTokens = shorter
    .split(/\s+/)
    .filter(t => t.length >= 2 && !STOP_TOKENS.has(t));
  const longTokenSet = new Set(longer.split(/\s+/));

  if (shortTokens.length > 0 && shortTokens.some(t => t.length >= 4)) {
    return shortTokens.every(t => longTokenSet.has(t));
  }
  return false;
}

/**
 * Determines whether two transaction descriptions/merchants refer to the same merchant
 * or merchant family (supporting cross-source statement vs. email matching).
 */
export function merchantsMatch(
  descA: string,
  descB: string,
  merchantA?: string,
  merchantB?: string
): boolean {
  const candidatesA = [merchantA, descA].filter(Boolean) as string[];
  const candidatesB = [merchantB, descB].filter(Boolean) as string[];

  for (const a of candidatesA) {
    const famA = getMerchantFamily(a);
    const normA = normalizeMerchantName(a);
    for (const b of candidatesB) {
      const famB = getMerchantFamily(b);
      const normB = normalizeMerchantName(b);
      if (famA && famB && famA === famB) return true;
      // If both resolved to known canonical merchant families and they differ (e.g. 'uber' vs 'uber eats'),
      // do not fall through to substring matching.
      if (
        KNOWN_MERCHANT_FAMILIES.has(famA) &&
        KNOWN_MERCHANT_FAMILIES.has(famB) &&
        famA !== famB
      ) {
        continue;
      }
      if (normA && normB && normA === normB) return true;
      if (normA && normB && tokensMatchOnBoundaries(normA, normB)) {
        return true;
      }
    }
  }
  return false;
}

/**
 * Resolves the canonical card/account key for a transaction based on explicit `account`
 * or known card-specific `sourceId`.
 */
export function resolveCanonicalAccount(
  sourceId: string,
  explicitAccount?: string
): string | undefined {
  const src = (sourceId || '').trim().toLowerCase();
  const isBiltSource =
    src === 'bilt-plaid' ||
    src === 'bilt-statement' ||
    src === 'bilt-card' ||
    src === 'bilt-wallet-tap';
  const isSynchronySource =
    src === 'amazon-synchrony' ||
    src === 'synchrony-amazon' ||
    src === 'amazon-store-card';

  if (explicitAccount && explicitAccount.trim()) {
    const clean = explicitAccount.trim().toLowerCase();
    if (clean === 'any' || clean === '*') return undefined;
    if (clean.includes('bilt')) return 'bilt';
    if (clean.includes('synchrony') || clean.includes('amazon') || clean.includes('store card')) {
      return 'amazon-synchrony';
    }
    // Preserve 4-digit card suffixes (e.g., "1234" or "ending in 1234")
    const last4Match = clean.match(/(?:^|\b)(\d{4})$/);
    if (last4Match) {
      if (isBiltSource) return `bilt:${last4Match[1]}`;
      if (isSynchronySource) return `amazon-synchrony:${last4Match[1]}`;
      return last4Match[1];
    }
    // If source is explicitly Bilt or Synchrony and explicitAccount is an opaque upstream ID (like Plaid account_id), use the source's card brand
    if (isBiltSource) return 'bilt';
    if (isSynchronySource) return 'amazon-synchrony';
    return clean;
  }

  if (isBiltSource) return 'bilt';
  if (isSynchronySource || src === 'amazon-email') return 'amazon-synchrony';
  return undefined;
}

/**
 * Returns true if two transactions are on compatible accounts (either same account,
 * at least one is unspecified, or one is a bare 4-digit card suffix and the other is a canonical card brand).
 */
export function accountsAreCompatible(accountA?: string, accountB?: string): boolean {
  if (!accountA || !accountB) return true;
  const a = accountA.trim().toLowerCase();
  const b = accountB.trim().toLowerCase();
  if (a === b) return true;

  const parseAccount = (val: string) => {
    if (/^\d{4}$/.test(val)) return { brand: undefined, last4: val };
    const [brand, last4] = val.split(':');
    return { brand: brand || undefined, last4: last4 && /^\d{4}$/.test(last4) ? last4 : undefined };
  };

  const parsedA = parseAccount(a);
  const parsedB = parseAccount(b);

  if (parsedA.brand && parsedB.brand && parsedA.brand !== parsedB.brand) {
    return false;
  }
  if (parsedA.last4 && parsedB.last4 && parsedA.last4 !== parsedB.last4) {
    return false;
  }
  return true;
}

/**
 * Returns true if the merchant is a multi-category marketplace (Amazon, Target, Walmart, Costco)
 * where a bare merchant name is ambiguous without item details.
 */
export function isMultiCategoryMarketplace(descOrMerchant: string): boolean {
  const family = getMerchantFamily(descOrMerchant);
  return MULTI_CATEGORY_MARKETPLACES.has(family);
}

/**
 * Returns true if a transaction description is an opaque statement descriptor
 * that lacks itemization for a multi-category marketplace (e.g., `"AMZN Mktp US*1234"`,
 * `"AMAZON.COM"`, `"Amazon"`, `"TARGET 0001234"`).
 */
export function isOpaqueDescription(desc: string): boolean {
  if (!desc || !desc.trim()) return true;
  const trimmed = desc.trim();

  // Enriched descriptions like "Amazon: Anker USB-C Cable" or "Target: Laundry Detergent" are NOT opaque
  if (/^[a-z0-9\s]+:\s+\S+/i.test(trimmed)) {
    return false;
  }

  if (
    /^(?:amzn|amazon(?:\.com)?(?:\s+mktp|\s+marketplace)?(?:\s+us)?|amz\*amazon|synchrony\s+amazon|target|walmart|wal-mart|wm\s+supercenter|costco(?:\s+whse)?)(?:\s*[*#-]?\s*[a-z0-9-]*)*$/i.test(
      trimmed
    )
  ) {
    return true;
  }

  return false;
}

/**
 * Computes the absolute difference in calendar days between two YYYY-MM-DD strings.
 * Returns Infinity if either date is invalid.
 */
export function daysBetween(dateA: string, dateB: string): number {
  const msPerDay = 86_400_000;
  const tA = Date.parse(`${dateA.slice(0, 10)}T00:00:00Z`);
  const tB = Date.parse(`${dateB.slice(0, 10)}T00:00:00Z`);
  if (Number.isNaN(tA) || Number.isNaN(tB)) return Infinity;
  return Math.round(Math.abs(tA - tB) / msPerDay);
}

/**
 * Computes signed days from `dateA` to `dateB` (`dateB - dateA` in days).
 */
export function signedDaysBetween(dateA: string, dateB: string): number {
  const msPerDay = 86_400_000;
  const tA = Date.parse(`${dateA.slice(0, 10)}T00:00:00Z`);
  const tB = Date.parse(`${dateB.slice(0, 10)}T00:00:00Z`);
  if (Number.isNaN(tA) || Number.isNaN(tB)) return Infinity;
  return Math.round((tB - tA) / msPerDay);
}

/**
 * Normalizes any common date string (YYYY-MM-DD, MM/DD/YYYY, ISO timestamp) to YYYY-MM-DD.
 */
export function normalizeIsoDate(rawDate: string): string {
  if (!rawDate) {
    return new Date().toISOString().slice(0, 10);
  }
  const trimmed = rawDate.trim();
  if (/^\d{4}-\d{2}-\d{2}/.test(trimmed)) {
    return trimmed.slice(0, 10);
  }
  const slashMatch = trimmed.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/);
  if (slashMatch) {
    const month = slashMatch[1].padStart(2, '0');
    const day = slashMatch[2].padStart(2, '0');
    const year = slashMatch[3].length === 2 ? `20${slashMatch[3]}` : slashMatch[3];
    return `${year}-${month}-${day}`;
  }
  const parsed = new Date(trimmed);
  if (!Number.isNaN(parsed.getTime())) {
    return parsed.toISOString().slice(0, 10);
  }
  return trimmed;
}

/**
 * Largest-Remainder Method (Hamilton's Method) in integer cents.
 * Guarantees that allocated dollar amounts (to 2 decimal places) sum to `totalAmount`
 * with zero floating-point or penny rounding drift.
 */
export function allocateLargestRemainderCents(
  totalAmount: number,
  weights: number[]
): number[] {
  if (weights.length === 0) return [];
  if (weights.length === 1) {
    return [Math.round(totalAmount * 100) / 100];
  }

  const totalCents = Math.round(totalAmount * 100);
  const weightSum = weights.reduce((acc, w) => acc + Math.max(0, w), 0);

  if (weightSum <= 0) {
    const base = Math.floor(totalCents / weights.length);
    const rem = totalCents - base * weights.length;
    return weights.map((_, i) => (base + (i < rem ? 1 : 0)) / 100);
  }

  const exactQuotas = weights.map(w => (Math.max(0, w) / weightSum) * totalCents);
  const flooredCents = exactQuotas.map(q => Math.floor(q));
  const remainderCents =
    totalCents - flooredCents.reduce((acc, c) => acc + c, 0);

  const indicesByRemainder = exactQuotas
    .map((q, idx) => ({ idx, rem: q - flooredCents[idx] }))
    .sort((a, b) => b.rem - a.rem || a.idx - b.idx);

  for (let i = 0; i < remainderCents; i++) {
    const targetIdx = indicesByRemainder[i % indicesByRemainder.length].idx;
    flooredCents[targetIdx] += 1;
  }

  return flooredCents.map(c => c / 100);
}
