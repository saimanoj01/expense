import { useState, useRef } from 'react';
import {
  parseCsv,
  standardizeDate,
  getLocalTodayDate,
  classifyCsvRowTypeAndRefund,
  type CsvSignConvention,
} from '../utils/csv';
import { computeTxHash } from '../utils/crypto';
import { Transaction, MonthlyLock, Category, SpendingBucket, Project, StorageAdapter } from '../services/storage';
import {
  suggestCategory,
  suggestSubCategory,
  suggestSpendingBucket,
  detectRefund,
} from '../utils/categorizer';
import { lookupHistoryClassification } from '../services/ingestion/transactionIngestService';
import { sanitizeUserTagsInput } from '../utils/transactionTaxonomy';

export interface CsvItem {
  date: string;
  description: string;
  amount: number;
  type: 'income' | 'expense' | 'transfer';
  isRefund?: boolean;
  category: string;
  subCategory?: string | null;
  spendingBucket?: SpendingBucket;
  labels: string[];
  hash: string;
  isDuplicate: boolean;
  isLockedMonth?: boolean;
  selected: boolean;
}

export function useCsvImport(
  transactions: Transaction[],
  locks: MonthlyLock[],
  categories: Category[],
  activeProject: Project | null,
  storageAdapter: StorageAdapter | null,
  refreshProjectData: () => Promise<void>,
  showToast: (msg: string, type?: 'success' | 'error' | 'info') => void,
  setSelectedMonth?: (m: string) => void
) {
  const [showCsvWizard, setShowCsvWizard] = useState(false);
  const [csvStep, setCsvStep] = useState<1 | 2>(1);
  const [signConvention, setSignConvention] = useState<CsvSignConvention>('card');
  const [batchTagsInput, setBatchTagsInput] = useState<string>('');
  const [batchAccountInput, setBatchAccountInput] = useState<string>('');
  const [csvRawHeaders, setCsvRawHeaders] = useState<string[]>([]);
  const [csvRawRows, setCsvRawRows] = useState<string[][]>([]);
  const [mapDateCol, setMapDateCol] = useState<string>('');
  const [mapDescCol, setMapDescCol] = useState<string>('');
  const [mapAmountCol, setMapAmountCol] = useState<string>('');
  const [mapTypeCol, setMapTypeCol] = useState<string>('');
  const [mapCategoryCol, setMapCategoryCol] = useState<string>('');
  const [mapSubCategoryCol, setMapSubCategoryCol] = useState<string>('');
  const [parsedCsvItems, setParsedCsvItems] = useState<CsvItem[]>([]);
  const [csvError, setCsvError] = useState<string | null>(null);
  const [showCsvDuplicateWarningModal, setShowCsvDuplicateWarningModal] = useState(false);
  const [isImportingCsv, setIsImportingCsv] = useState(false);
  const isImportingRef = useRef(false);

  const handleCsvFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    setCsvError(null);
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.name.toLowerCase().endsWith('.csv')) {
      setCsvError('Unable to parse CSV file');
      setShowCsvWizard(true);
      return;
    }
    const text = await file.text();
    e.target.value = '';
    if (!text.trim()) {
      setCsvError('File is empty');
      setShowCsvWizard(true);
      return;
    }
    const allParsed = parseCsv(text);
    if (allParsed.length < 2) {
      setCsvError('Unable to parse CSV file');
      setShowCsvWizard(true);
      return;
    }
    const headers = allParsed[0];
    const rows = allParsed.slice(1);
    setCsvRawHeaders(headers);
    setCsvRawRows(rows);
    setParsedCsvItems([]);

    setMapDateCol(headers.find((h: string) => /^date$/i.test(h)) || '');
    setMapDescCol(headers.find((h: string) => /^description$|^desc$|^payee$/i.test(h)) || '');
    setMapAmountCol(headers.find((h: string) => /^amount$/i.test(h)) || '');
    setMapTypeCol(headers.find((h: string) => /^type$/i.test(h)) || '');
    setMapCategoryCol(headers.find((h: string) => /^category$|^cat$/i.test(h)) || '');
    setMapSubCategoryCol(headers.find((h: string) => /subcategory|sub_category|subcat/i.test(h)) || '');
    setCsvStep(1);
    setShowCsvWizard(true);
  };

  const handleCsvNextStep = async () => {
    setCsvError(null);
    if (!mapAmountCol || !mapDescCol) {
      setCsvError('Amount and Description columns are required');
      return;
    }
    const dateIdx = csvRawHeaders.indexOf(mapDateCol);
    const descIdx = csvRawHeaders.indexOf(mapDescCol);
    const amtIdx = csvRawHeaders.indexOf(mapAmountCol);
    const typeIdx = csvRawHeaders.indexOf(mapTypeCol);
    const catIdx = csvRawHeaders.indexOf(mapCategoryCol);
    const subCatIdx = csvRawHeaders.indexOf(mapSubCategoryCol);

    const existingHashes = new Set(transactions.map(t => t.hash));
    const seenHashesInBatch = new Set<string>();
    const items: CsvItem[] = [];

    const defaultBatchTags = sanitizeUserTagsInput(
      batchTagsInput.split(','),
      batchAccountInput
    );

    for (let idx = 0; idx < csvRawRows.length; idx++) {
      const row = csvRawRows[idx];
      const rawDate = standardizeDate(row[dateIdx] || getLocalTodayDate());
      const rawDesc = row[descIdx] || 'Imported Transaction';
      const typeCell = typeIdx > -1 ? row[typeIdx] || '' : '';

      const {
        amount: rawAmt,
        type: rawType,
        isRefund,
      } = classifyCsvRowTypeAndRefund({
        description: rawDesc,
        amountCell: row[amtIdx] || '0',
        typeCell,
        hasTypeCol: typeIdx > -1,
        signConvention,
      });

      const rawCat = catIdx > -1 && row[catIdx] ? row[catIdx] : '';
      const rawSubCat = subCatIdx > -1 && row[subCatIdx] ? row[subCatIdx] : '';

      const hash = await computeTxHash(rawDate, rawDesc, rawAmt, rawType);
      const isDup =
        seenHashesInBatch.has(hash) ||
        existingHashes.has(hash) ||
        transactions.some(
          t =>
            t.date === rawDate &&
            (t.description || '').trim().toLowerCase() === rawDesc.trim().toLowerCase() &&
            Math.abs(t.amount - rawAmt) < 0.001 &&
            t.type === rawType
        );
      seenHashesInBatch.add(hash);

      const monthStr = rawDate.substring(0, 7);
      const isLockedMonth = locks.some((l: MonthlyLock) => l.locked && l.month === monthStr);

      let suggestedCategory: string;
      let matchedSubCat: string | null = null;
      let suggestedBucket: SpendingBucket;

      const historyHit =
        !rawCat && (rawType === 'expense' || rawType === 'income')
          ? lookupHistoryClassification(rawDesc, undefined, transactions, isRefund ? 'expense' : rawType)
          : null;

      if (historyHit) {
        suggestedCategory = historyHit.category;
        matchedSubCat = historyHit.subCategory;
        suggestedBucket =
          historyHit.spendingBucket || suggestSpendingBucket(rawDesc, suggestedCategory);
      } else {
        suggestedCategory = suggestCategory(rawDesc, rawCat, categories);
        matchedSubCat = suggestSubCategory(rawDesc, suggestedCategory, categories);
        suggestedBucket = suggestSpendingBucket(rawDesc, suggestedCategory);
      }

      if (rawSubCat) {
        const directSub = categories.find(
          c =>
            c.parentId === suggestedCategory &&
            (c.id.toLowerCase() === rawSubCat.toLowerCase() ||
              c.name.toLowerCase() === rawSubCat.toLowerCase())
        );
        if (directSub) matchedSubCat = directSub.id;
      }

      // Preserve previously edited labels if user stepped back from Step 2
      const existingItem = parsedCsvItems[idx];
      const itemLabels = existingItem
        ? sanitizeUserTagsInput(existingItem.labels || [], batchAccountInput)
        : [...defaultBatchTags];

      items.push({
        date: rawDate,
        description: rawDesc,
        amount: rawAmt,
        type: rawType,
        isRefund,
        category: suggestedCategory,
        subCategory: matchedSubCat,
        spendingBucket: rawType === 'expense' || isRefund ? suggestedBucket : undefined,
        labels: itemLabels,
        hash,
        isDuplicate: isDup,
        isLockedMonth,
        selected: !isDup && !isLockedMonth,
      });
    }

    setParsedCsvItems(items);
    setCsvStep(2);
  };

  const updateItemTags = (index: number, newTags: string[]) => {
    setParsedCsvItems(prev => {
      const copy = [...prev];
      if (copy[index]) {
        copy[index] = {
          ...copy[index],
          labels: sanitizeUserTagsInput(newTags, batchAccountInput),
        };
      }
      return copy;
    });
  };

  const updateItemType = async (
    index: number,
    newType: 'income' | 'expense' | 'transfer'
  ) => {
    const current = parsedCsvItems[index];
    if (!current) return;

    const nextIsRefund = newType === 'income' ? detectRefund(current.description) : false;
    let nextCategory = current.category;
    let nextSubCategory = current.subCategory ?? null;

    if (newType === 'transfer') {
      nextCategory = 'transfers';
      nextSubCategory = suggestSubCategory(current.description, 'transfers', categories);
    } else if (newType === 'income' && !nextIsRefund) {
      if (!nextCategory || nextCategory === 'transfers' || nextCategory === 'misc') {
        nextCategory = 'income';
        nextSubCategory = suggestSubCategory(current.description, 'income', categories);
      }
    } else if (newType === 'expense' || nextIsRefund) {
      if (!nextCategory || nextCategory === 'income' || nextCategory === 'transfers') {
        nextCategory = suggestCategory(current.description, '', categories);
        nextSubCategory = suggestSubCategory(current.description, nextCategory, categories);
      }
    }

    const nextBucket: SpendingBucket | undefined =
      newType === 'expense' || nextIsRefund
        ? current.spendingBucket || suggestSpendingBucket(current.description, nextCategory)
        : undefined;

    const nextHash = await computeTxHash(
      current.date,
      current.description,
      current.amount,
      newType
    );

    setParsedCsvItems(prev => {
      const target = prev[index];
      if (!target) return prev;
      const existingHashes = new Set(transactions.map(t => t.hash));
      const siblingDup = prev.some(
        (other, oIdx) => oIdx !== index && other.hash === nextHash
      );
      const isDup =
        siblingDup ||
        existingHashes.has(nextHash) ||
        transactions.some(
          t =>
            t.date === target.date &&
            (t.description || '').trim().toLowerCase() ===
              target.description.trim().toLowerCase() &&
            Math.abs(t.amount - target.amount) < 0.001 &&
            t.type === newType
        );
      const copy = [...prev];
      copy[index] = {
        ...target,
        type: newType,
        isRefund: nextIsRefund,
        category: nextCategory,
        subCategory: nextSubCategory,
        spendingBucket: nextBucket,
        hash: nextHash,
        isDuplicate: isDup,
      };
      return copy;
    });
  };

  const executeCommitCsvImport = async () => {
    if (!activeProject || !storageAdapter || isImportingRef.current) return;
    const toImport = parsedCsvItems.filter(i => i.selected);
    if (toImport.length === 0) return;

    isImportingRef.current = true;
    setIsImportingCsv(true);

    try {
      const nowIso = new Date().toISOString();
      const accountClean = batchAccountInput.trim() || undefined;

      const newTxns: Transaction[] = await Promise.all(
        toImport.map(async item => {
          const isRefund = Boolean(item.isRefund && item.type === 'income');
          const bucket =
            item.type === 'expense' || isRefund
              ? item.spendingBucket || suggestSpendingBucket(item.description, item.category)
              : undefined;
          const labels = sanitizeUserTagsInput(item.labels || [], accountClean);
          if (isRefund && !labels.includes('refund')) {
            labels.push('refund');
          }
          const freshHash = await computeTxHash(
            item.date,
            item.description,
            item.amount,
            item.type
          );
          return {
            id: crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36).substring(2),
            date: item.date,
            category: item.category || categories[0]?.id || 'misc',
            subCategory: item.subCategory || null,
            amount: item.amount,
            type: item.type,
            spendingBucket: bucket,
            description: item.description,
            notes: '',
            labels,
            hash: freshHash,
            meta: {
              sources: ['csv-import'],
              ...(accountClean ? { account: accountClean } : {}),
              ingestedAt: nowIso,
            },
          };
        })
      );

      setShowCsvDuplicateWarningModal(false);

      await storageAdapter.saveTransactions(activeProject.id, newTxns);
      setShowCsvWizard(false);
      setCsvStep(1);
      setParsedCsvItems([]);
      setCsvError(null);
      await refreshProjectData();

      // Auto-switch selectedMonth to the imported month (or 'all' if multi-month) and show ledger so imported data is immediately visible
      if (toImport.length > 0) {
        const importedMonths = Array.from(new Set(toImport.map(i => i.date.substring(0, 7))));
        const targetMonth = importedMonths.length === 1 ? importedMonths[0] : 'all';
        if (setSelectedMonth) {
          setSelectedMonth(targetMonth);
        }
        if (typeof window !== 'undefined') {
          window.location.hash = `#/transactions?month=${targetMonth}`;
        }
      }

      showToast(`Imported ${toImport.length} transactions`);
    } catch (err: unknown) {
      const errMsg = err instanceof Error ? err.message : 'Failed to import CSV';
      setCsvError(errMsg);
      showToast(errMsg, 'error');
    } finally {
      isImportingRef.current = false;
      setIsImportingCsv(false);
    }
  };

  const handleCommitCsvImport = async () => {
    if (isImportingRef.current) return;
    const toImport = parsedCsvItems.filter(i => i.selected);
    const duplicateSelected = toImport.filter(i => i.isDuplicate);
    if (duplicateSelected.length > 0) {
      setShowCsvDuplicateWarningModal(true);
      return;
    }
    await executeCommitCsvImport();
  };

  return {
    showCsvWizard,
    setShowCsvWizard,
    csvStep,
    setCsvStep,
    signConvention,
    setSignConvention,
    batchTagsInput,
    setBatchTagsInput,
    batchAccountInput,
    setBatchAccountInput,
    csvRawHeaders,
    mapDateCol,
    setMapDateCol,
    mapDescCol,
    setMapDescCol,
    mapAmountCol,
    setMapAmountCol,
    mapTypeCol,
    setMapTypeCol,
    mapCategoryCol,
    setMapCategoryCol,
    mapSubCategoryCol,
    setMapSubCategoryCol,
    parsedCsvItems,
    setParsedCsvItems,
    updateItemTags,
    updateItemType,
    isImportingCsv,
    csvError,
    showCsvDuplicateWarningModal,
    setShowCsvDuplicateWarningModal,
    handleCsvFileUpload,
    handleCsvNextStep,
    executeCommitCsvImport,
    handleCommitCsvImport,
  };
}
