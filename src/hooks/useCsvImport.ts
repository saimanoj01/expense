import { useState } from 'react';
import { parseCsvLine, standardizeDate } from '../utils/csv';
import { computeTxHash } from '../utils/crypto';
import { Transaction, MonthlyLock, Category } from '../services/storage';

export interface CsvItem {
  date: string;
  description: string;
  amount: number;
  type: 'income' | 'expense';
  category?: string;
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
  refreshTransactions: () => Promise<void>,
  showToast: (msg: string) => void
) {
  const [showCsvWizard, setShowCsvWizard] = useState(false);
  const [csvStep, setCsvStep] = useState<1 | 2>(1);
  const [csvRawHeaders, setCsvRawHeaders] = useState<string[]>([]);
  const [csvRawRows, setCsvRawRows] = useState<string[][]>([]);
  const [mapDateCol, setMapDateCol] = useState<string>('');
  const [mapDescCol, setMapDescCol] = useState<string>('');
  const [mapAmountCol, setMapAmountCol] = useState<string>('');
  const [mapTypeCol, setMapTypeCol] = useState<string>('');
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
    const catIdx = csvRawHeaders.findIndex(h => /^category$/i.test(h));

    const existingHashes = new Set(transactions.map(t => t.hash));
    const seenHashesInBatch = new Set<string>();
    const items: CsvItem[] = [];

    for (const row of csvRawRows) {
      const rawDate = standardizeDate(row[dateIdx] || '2026-07-15');
      const rawDesc = row[descIdx] || 'Imported Transaction';
      let rawAmt = parseFloat(row[amtIdx] || '0') || 0;
      let rawType: 'income' | 'expense' = 'expense';
      const rawCat = catIdx > -1 && row[catIdx] ? row[catIdx] : '';

      if (typeIdx > -1) {
        const inflowVal = parseFloat(row[typeIdx] || '0');
        if (!isNaN(inflowVal) && inflowVal > 0 && rawAmt === 0) {
          rawType = 'income';
          rawAmt = inflowVal;
        } else if (/income/i.test(row[typeIdx] || '')) {
          rawType = 'income';
        }
      }
      const hash = await computeTxHash(rawDate, rawDesc, rawAmt, rawType);
      const isDup = seenHashesInBatch.has(hash) || existingHashes.has(hash) || transactions.some(t => 
        t.date === rawDate && 
        t.description.trim().toLowerCase() === rawDesc.trim().toLowerCase() && 
        Math.abs(t.amount - rawAmt) < 0.001 && 
        t.type === rawType
      );
      seenHashesInBatch.add(hash);

      const monthStr = rawDate.substring(0, 7);
      const isLockedMonth = locks.some((l: MonthlyLock) => l.locked && l.month === monthStr);

      items.push({
        date: rawDate,
        description: rawDesc,
        amount: rawAmt,
        type: rawType,
        category: rawCat,
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
      const rawCat = item.category || '';
      const matched = categories.find(c => 
        c.id.toLowerCase() === rawCat.toLowerCase() || 
        c.name.toLowerCase() === rawCat.toLowerCase()
      );
      const categoryId = matched ? matched.id : (categories[0]?.id || 'food');

      return {
        id: crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36).substring(2),
        date: item.date,
        category: categoryId,
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
      await refreshTransactions();
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
