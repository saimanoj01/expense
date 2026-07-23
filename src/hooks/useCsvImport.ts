import { useState } from 'react';
import { parseCsvLine, standardizeDate } from '../utils/csv';
import { computeTxHash } from '../utils/crypto';
import { Transaction, MonthlyLock, Category } from '../services/storage';
import { suggestCategory, detectTransactionType } from '../utils/categorizer';

export interface CsvItem {
  date: string;
  description: string;
  amount: number;
  type: 'income' | 'expense' | 'transfer';
  category: string;
  hash: string;
  isDuplicate: boolean;
  isLockedMonth?: boolean;
  selected: boolean;
}

export function useCsvImport(
  transactions: Transaction[],
  locks: MonthlyLock[],
  categories: Category[],
  activeProject: any,
  storageAdapter: any,
  refreshProjectData: () => Promise<void>,
  showToast: (msg: string) => void,
  setSelectedMonth?: (m: string) => void
) {
  const [showCsvWizard, setShowCsvWizard] = useState(false);
  const [csvStep, setCsvStep] = useState<1 | 2>(1);
  const [csvRawHeaders, setCsvRawHeaders] = useState<string[]>([]);
  const [csvRawRows, setCsvRawRows] = useState<string[][]>([]);
  const [mapDateCol, setMapDateCol] = useState<string>('');
  const [mapDescCol, setMapDescCol] = useState<string>('');
  const [mapAmountCol, setMapAmountCol] = useState<string>('');
  const [mapTypeCol, setMapTypeCol] = useState<string>('');
  const [mapCategoryCol, setMapCategoryCol] = useState<string>('');
  const [parsedCsvItems, setParsedCsvItems] = useState<CsvItem[]>([]);
  const [csvError, setCsvError] = useState<string | null>(null);
  const [showCsvDuplicateWarningModal, setShowCsvDuplicateWarningModal] = useState(false);

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
    if (!text.trim()) {
      setCsvError('File is empty');
      setShowCsvWizard(true);
      return;
    }
    const lines = text.split(/\r?\n/).filter(line => line.trim().length > 0);
    if (lines.length < 2) {
      setCsvError('Unable to parse CSV file');
      setShowCsvWizard(true);
      return;
    }
    const headers = parseCsvLine(lines[0]);
    const rows = lines.slice(1).map(line => parseCsvLine(line));
    setCsvRawHeaders(headers);
    setCsvRawRows(rows);

    setMapDateCol(headers.find((h: string) => /^date$/i.test(h)) || '');
    setMapDescCol(headers.find((h: string) => /^description$|^desc$|^payee$/i.test(h)) || '');
    setMapAmountCol(headers.find((h: string) => /^amount$/i.test(h)) || '');
    setMapTypeCol(headers.find((h: string) => /^type$/i.test(h)) || '');
    setMapCategoryCol(headers.find((h: string) => /^category$|^cat$/i.test(h)) || '');
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

    const existingHashes = new Set(transactions.map(t => t.hash));
    const seenHashesInBatch = new Set<string>();
    const items: CsvItem[] = [];

    for (const row of csvRawRows) {
      const rawDate = standardizeDate(row[dateIdx] || new Date().toISOString().substring(0, 10));
      const rawDesc = row[descIdx] || 'Imported Transaction';
      let rawAmt = parseFloat(row[amtIdx] || '0') || 0;
      let rawType: 'income' | 'expense' | 'transfer' = detectTransactionType(rawDesc, typeIdx > -1 ? row[typeIdx] : '');
      const rawCat = catIdx > -1 && row[catIdx] ? row[catIdx] : '';

      if (typeIdx > -1) {
        const inflowVal = parseFloat(row[typeIdx] || '0');
        if (!isNaN(inflowVal) && inflowVal > 0 && rawAmt === 0) {
          rawType = 'income';
          rawAmt = inflowVal;
        } else if (/income/i.test(row[typeIdx] || '')) {
          rawType = 'income';
        } else if (/transfer|payment/i.test(row[typeIdx] || '')) {
          rawType = 'transfer';
        }
      }
      const hash = await computeTxHash(rawDate, rawDesc, rawAmt, rawType);
      const isDup = seenHashesInBatch.has(hash) || existingHashes.has(hash) || transactions.some(t => 
        t.date === rawDate && 
        (t.description || '').trim().toLowerCase() === rawDesc.trim().toLowerCase() && 
        Math.abs(t.amount - rawAmt) < 0.001 && 
        t.type === rawType
      );
      seenHashesInBatch.add(hash);

      const monthStr = rawDate.substring(0, 7);
      const isLockedMonth = locks.some((l: MonthlyLock) => l.locked && l.month === monthStr);

      const suggestedCategory = suggestCategory(rawDesc, rawCat, categories);

      items.push({
        date: rawDate,
        description: rawDesc,
        amount: rawAmt,
        type: rawType,
        category: suggestedCategory,
        hash,
        isDuplicate: isDup,
        isLockedMonth,
        selected: !isDup && !isLockedMonth
      });
    }

    setParsedCsvItems(items);
    setCsvStep(2);
  };

  const executeCommitCsvImport = async () => {
    if (!activeProject || !storageAdapter) return;
    const toImport = parsedCsvItems.filter(i => i.selected);
    if (toImport.length === 0) return;

    const newTxns: Transaction[] = toImport.map(item => {
      return {
        id: crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36).substring(2),
        date: item.date,
        category: item.category || categories[0]?.id || 'misc',
        amount: item.amount,
        type: item.type,
        description: item.description,
        notes: 'Imported via CSV',
        labels: ['imported'],
        hash: item.hash
      };
    });

    try {
      await storageAdapter.saveTransactions(activeProject.id, newTxns);
      await refreshProjectData();

      // Auto-switch selectedMonth to the imported month (or 'all' if multi-month) so imported data is immediately visible
      if (toImport.length > 0 && setSelectedMonth) {
        const importedMonths = Array.from(new Set(toImport.map(i => i.date.substring(0, 7))));
        if (importedMonths.length === 1) {
          setSelectedMonth(importedMonths[0]);
        } else if (importedMonths.length > 1) {
          setSelectedMonth('all');
        }
      }

      setShowCsvWizard(false);
      setShowCsvDuplicateWarningModal(false);
      showToast(`Imported ${toImport.length} transactions`);
    } catch (err: any) {
      alert(err.message || 'Failed to import CSV');
    }
  };

  const handleCommitCsvImport = async () => {
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
    parsedCsvItems,
    setParsedCsvItems,
    csvError,
    showCsvDuplicateWarningModal,
    setShowCsvDuplicateWarningModal,
    handleCsvFileUpload,
    handleCsvNextStep,
    executeCommitCsvImport,
    handleCommitCsvImport
  };
}
