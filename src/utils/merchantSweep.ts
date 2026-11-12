import type { Transaction, MonthlyLock } from '../services/storage';
import {
  historyMerchantsMatch,
  isMultiCategoryMarketplace,
  isOpaqueDescription,
  normalizeMerchantName,
} from '../services/ingestion/normalizer';
import { isRefundTransaction } from './metrics';
import { isTransactionMonthLocked } from './transactionTaxonomy';

export interface MerchantSweepCandidateResult {
  merchantDisplay: string;
  matchingIds: string[];
  matchingTransactions: Transaction[];
}

/**
 * Finds other unlocked transactions from the same merchant across the workspace
 * that can safely be batch-reclassified when a user updates a row's category inline.
 *
 * Safety guards:
 * 1. Blocks bare/opaque multi-category marketplaces ("AMZN Mktp US*", "AMAZON.COM", "TARGET", "WALMART", "COSTCO")
 *    unless the description is item-enriched ("Amazon: Anker Charger"), in which case only exact normalized descriptions match.
 * 2. Excludes the edited source transaction itself.
 * 3. Excludes transactions in locked months (`isTransactionMonthLocked`).
 * 4. Requires matching accounting kind (`type` AND `isRefundTransaction` parity).
 * 5. Excludes transactions that already have the exact target `(category, subCategory)`.
 * 6. Protects divergent manual overrides: skips rows that already have `'category'` in `meta.userEdited` with a different non-misc category.
 */
export function findSimilarTransactionsForSweep(
  editedTx: Transaction,
  targetCategory: string,
  targetSubCategory: string | null | undefined,
  allTransactions: Transaction[],
  locks: MonthlyLock[] = []
): MerchantSweepCandidateResult | null {
  if (!editedTx || !targetCategory || editedTx.type === 'transfer') {
    return null;
  }

  const desc = (editedTx.description || '').trim();
  if (!desc) return null;

  const isMarketplace = isMultiCategoryMarketplace(desc);
  if (isMarketplace && isOpaqueDescription(desc)) {
    return null;
  }

  if (!normalizeMerchantName(desc)) {
    return null;
  }

  const sourceIsRefund = isRefundTransaction(editedTx);
  const normSub = targetSubCategory || null;

  const matches = allTransactions.filter(tx => {
    if (!tx || tx.id === editedTx.id) return false;
    if (isTransactionMonthLocked(tx.date, locks)) return false;
    if (tx.type !== editedTx.type) return false;
    if (isRefundTransaction(tx) !== sourceIsRefund) return false;

    if (tx.category === targetCategory && (tx.subCategory || null) === normSub) {
      return false;
    }

    const userEdited = Array.isArray(tx.meta?.userEdited) ? tx.meta.userEdited : [];
    if (
      userEdited.includes('category') &&
      tx.category &&
      tx.category !== 'misc' &&
      tx.category !== targetCategory
    ) {
      return false;
    }

    const candidateDesc = (tx.description || '').trim();
    if (!candidateDesc) return false;

    if (isMarketplace) {
      if (isOpaqueDescription(candidateDesc)) return false;
      return candidateDesc.toLowerCase() === desc.toLowerCase();
    }

    if (isMultiCategoryMarketplace(candidateDesc) && isOpaqueDescription(candidateDesc)) {
      return false;
    }

    return historyMerchantsMatch(candidateDesc, desc);
  });

  if (matches.length === 0) {
    return null;
  }

  return {
    merchantDisplay: desc,
    matchingIds: matches.map(m => m.id),
    matchingTransactions: matches,
  };
}
