import React, { useState, useEffect, useMemo } from 'react';
import { AuthProvider, useAuth } from './context/AuthContext';
import { AppProvider, useApp } from './context/AppContext';
import { useHashRouting } from './hooks/useHashRouting';
import { Transaction, Budget, Category, MonthlyLock } from './services/storage';
import { 
  Shield, Sparkles, FolderOpen, Sun, Moon, LogOut, 
  PlusCircle, LayoutDashboard, KeyRound, Lock, Unlock,
  Coins, TrendingUp, TrendingDown, DollarSign, Upload, Plus, Check, X,
  Edit2, Trash2, Share2
} from 'lucide-react';

// Compute SHA-256 hash for deduplication
async function computeTxHash(date: string, description: string, amount: number, type: string): Promise<string> {
  const payload = `${date}|${description.trim().toLowerCase()}|${amount.toFixed(2)}|${type}`;
  const encoder = new TextEncoder();
  const data = encoder.encode(payload);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

function parseCsvLine(line: string): string[] {
  const result: string[] = [];
  let current = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    if (char === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (char === ',' && !inQuotes) {
      result.push(current.trim());
      current = '';
    } else {
      current += char;
    }
  }
  result.push(current.trim());
  return result;
}

function AppInner() {
  const { user, isAuthenticated, isMockMode, login, loginAsMock, logout, toggleMockMode, googleClientIdExists, showSessionExpiredModal, setShowSessionExpiredModal, authErrorToast, setAuthErrorToast } = useAuth();
  const { 
    projects, activeProject, currentView, isLoading, error, 
    storageAdapter, selectProject, createNewProject 
  } = useApp();

  useHashRouting();

  const [theme, setTheme] = useState<'dark' | 'light'>(() => {
    const saved = localStorage.getItem('expense_theme');
    return (saved === 'light' || saved === 'dark') ? saved : 'dark';
  });

  const [newProjectName, setNewProjectName] = useState('');
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 3500);
  };

  useEffect(() => {
    const root = window.document.documentElement;
    if (theme === 'dark') {
      root.classList.add('dark');
      root.classList.remove('light');
    } else {
      root.classList.add('light');
      root.classList.remove('dark');
    }
    localStorage.setItem('expense_theme', theme);
  }, [theme]);

  // Active project data state
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [budgets, setBudgets] = useState<Budget[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [locks, setLocks] = useState<MonthlyLock[]>([]);
  const [selectedMonth, setSelectedMonth] = useState<string>('2026-07');

  // Transaction Modal State
  const [showTxnModal, setShowTxnModal] = useState(false);
  const [editingTxnId, setEditingTxnId] = useState<string | null>(null);
  const [txnType, setTxnType] = useState<'income' | 'expense'>('expense');
  const [txnAmount, setTxnAmount] = useState('');
  const [txnDate, setTxnDate] = useState('2026-07-15');
  const [txnCategory, setTxnCategory] = useState('food');
  const [txnDescription, setTxnDescription] = useState('');
  const [txnNotes, setTxnNotes] = useState('');
  const [txnLabels, setTxnLabels] = useState('');

  // Category Modal State
  const [showAddCatModal, setShowAddCatModal] = useState(false);
  const [editingCatId, setEditingCatId] = useState<string | null>(null);
  const [newCatName, setNewCatName] = useState('');
  const [newCatColor, setNewCatColor] = useState('#38bdf8');
  const [newCatEmoji, setNewCatEmoji] = useState('📦');

  const [amountError, setAmountError] = useState<string | null>(null);
  const [dateError, setDateError] = useState<string | null>(null);
  const [descError, setDescError] = useState<string | null>(null);
  const [categoryModalError, setCategoryModalError] = useState<string | null>(null);
  const [budgetErrors, setBudgetErrors] = useState<Record<string, string>>({});

  // Share Project Modal
  const [showShareModal, setShowShareModal] = useState(false);
  const [collaboratorEmail, setCollaboratorEmail] = useState('');
  const [collaboratorList, setCollaboratorList] = useState<string[]>([]);

  // CSV Import Wizard State
  const [showCsvWizard, setShowCsvWizard] = useState(false);
  const [csvStep, setCsvStep] = useState<1 | 2>(1);
  const [csvRawHeaders, setCsvRawHeaders] = useState<string[]>([]);
  const [csvRawRows, setCsvRawRows] = useState<string[][]>([]);
  const [mapDateCol, setMapDateCol] = useState<string>('');
  const [mapDescCol, setMapDescCol] = useState<string>('');
  const [mapAmountCol, setMapAmountCol] = useState<string>('');
  const [mapTypeCol, setMapTypeCol] = useState<string>('');
  const [parsedCsvItems, setParsedCsvItems] = useState<Array<{
    date: string;
    description: string;
    amount: number;
    type: 'income' | 'expense';
    category?: string;
    hash: string;
    isDuplicate: boolean;
    isLockedMonth?: boolean;
    selected: boolean;
  }>>([]);

  // Tag filter state
  const [selectedTagFilter, setSelectedTagFilter] = useState<string | null>(null);

  const [showSpreadsheetNotFoundModal, setShowSpreadsheetNotFoundModal] = useState<boolean>(false);
  const [showConflictModal, setShowConflictModal] = useState<boolean>(false);
  const [showDuplicateWarningModal, setShowDuplicateWarningModal] = useState<boolean>(false);
  const [pendingDuplicateTxn, setPendingDuplicateTxn] = useState<Transaction | null>(null);
  const [showCsvDuplicateWarningModal, setShowCsvDuplicateWarningModal] = useState<boolean>(false);
  const [selectedTxnIds, setSelectedTxnIds] = useState<Set<string>>(new Set());
  const [showBulkDeleteConfirmModal, setShowBulkDeleteConfirmModal] = useState<boolean>(false);

  // Load project details
  const refreshProjectData = async () => {
    if (!isAuthenticated || !activeProject || !storageAdapter) {
      setTransactions([]);
      setBudgets([]);
      setCategories([]);
      setLocks([]);
      return;
    }
    try {
      const txs = await storageAdapter.getTransactions(activeProject.id);
      const bgs = await storageAdapter.getBudgets(activeProject.id);
      const cats = await storageAdapter.getCategories(activeProject.id);
      const lks = await storageAdapter.getLocks(activeProject.id);
      setTransactions(txs);
      setBudgets(bgs);
      setCategories(cats);
      setLocks(lks);
      setCollaboratorList(activeProject.collaborators || []);
    } catch (err) {
      console.error("Failed to load project details:", err);
    }
  };

  useEffect(() => {
    refreshProjectData();
  }, [isAuthenticated, activeProject, storageAdapter]);

  const toggleTheme = () => {
    setTheme(prev => prev === 'dark' ? 'light' : 'dark');
  };

  const handleCreateProject = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newProjectName.trim()) return;
    try {
      await createNewProject(newProjectName.trim());
      setNewProjectName('');
      setShowCreateModal(false);
      showToast('Project created successfully');
    } catch (err) {
      console.error(err);
    }
  };

  const isCurrentMonthLocked = useMemo(() => {
    return locks.some(lk => lk.month === selectedMonth && lk.locked);
  }, [locks, selectedMonth]);

  // Filtering transactions by selected month and active tag filter
  const filteredTransactions = useMemo(() => {
    return transactions.filter(t => {
      const monthMatches = t.date.startsWith(selectedMonth);
      if (!monthMatches && selectedMonth !== 'all') return false;
      if (selectedTagFilter && !t.labels.includes(selectedTagFilter)) return false;
      return true;
    });
  }, [transactions, selectedMonth, selectedTagFilter]);

  // Duplicate transaction detector across all transactions
  const duplicateTxnIds = useMemo(() => {
    const dups = new Set<string>();
    for (let i = 0; i < transactions.length; i++) {
      for (let j = i + 1; j < transactions.length; j++) {
        const t1 = transactions[i];
        const t2 = transactions[j];
        const sameHash = Boolean(t1.hash && t2.hash && t1.hash === t2.hash);
        const sameFields = t1.date === t2.date && 
          t1.description.trim().toLowerCase() === t2.description.trim().toLowerCase() && 
          Math.abs(t1.amount - t2.amount) < 0.001 && 
          t1.type === t2.type;

        if (sameHash || sameFields) {
          dups.add(t1.id);
          dups.add(t2.id);
        }
      }
    }
    return dups;
  }, [transactions]);

  // KPI Calculations
  const totalBudget = useMemo(() => budgets.reduce((sum, b) => sum + b.amount, 0), [budgets]);
  const totalExpenses = useMemo(() => filteredTransactions
    .filter(t => t.type === 'expense')
    .reduce((sum, t) => sum + t.amount, 0), [filteredTransactions]);
  const totalIncome = useMemo(() => filteredTransactions
    .filter(t => t.type === 'income')
    .reduce((sum, t) => sum + t.amount, 0), [filteredTransactions]);
  const budgetRemaining = totalBudget - totalExpenses;

  // Category utilization map
  const categorySummary = useMemo(() => {
    const allCatNames = new Set<string>(categories.map(c => c.name));
    budgets.forEach(b => {
      if (!allCatNames.has(b.category) && !categories.some(c => c.id === b.category)) {
        allCatNames.add(b.category);
      }
    });

    const items: Array<{ id: string; name: string; emoji: string; color: string; budget: number; spent: number; percent: number }> = [];
    allCatNames.forEach(name => {
      const cat = categories.find(c => c.name === name || c.id === name);
      const bObj = budgets.find(b => b.category === (cat?.id || name) || b.category === name);
      const budgetAmt = bObj?.amount || 0;
      const spent = filteredTransactions
        .filter(t => (t.category === (cat?.id || name) || t.category.toLowerCase() === name.toLowerCase()) && t.type === 'expense')
        .reduce((sum, t) => sum + t.amount, 0);
      const percent = budgetAmt > 0 ? Math.min(Math.round((spent / budgetAmt) * 100), 100) : 0;
      items.push({
        id: cat?.id || name,
        name: cat?.name || name,
        emoji: cat?.emoji || '🏷️',
        color: cat?.color || '#a855f7',
        budget: budgetAmt,
        spent,
        percent
      });
    });
    return items;
  }, [categories, budgets, filteredTransactions]);

  const availableMonths = useMemo(() => {
    const monthsSet = new Set<string>(['2026-05', '2026-06', '2026-07']);
    transactions.forEach(t => {
      if (t.date && t.date.length >= 7) monthsSet.add(t.date.substring(0, 7));
    });
    locks.forEach(l => {
      if (l.month) monthsSet.add(l.month);
    });
    return Array.from(monthsSet).sort();
  }, [transactions, locks]);

  const availableTags = useMemo(() => {
    const tagSet = new Set<string>(['groceries', 'utilities', 'salary', 'dining-out']);
    transactions.forEach(t => {
      (t.labels || []).forEach(l => {
        if (l && l.trim()) tagSet.add(l.trim().toLowerCase());
      });
    });
    return Array.from(tagSet);
  }, [transactions]);

  const trendPathData = useMemo(() => {
    const expenses = filteredTransactions.filter(t => t.type === 'expense');
    if (expenses.length === 0) return '';
    const dateMap: { [date: string]: number } = {};
    expenses.forEach(t => {
      dateMap[t.date] = (dateMap[t.date] || 0) + t.amount;
    });
    const sortedDates = Object.keys(dateMap).sort();
    if (sortedDates.length === 0) return '';
    if (sortedDates.length === 1) {
      return 'M 30 105 Q 150 90, 270 105';
    }
    const maxAmt = Math.max(...Object.values(dateMap), 1);
    const width = 300;
    const height = 150;
    const padding = 20;
    const points = sortedDates.map((date, idx) => {
      const x = padding + (idx / (sortedDates.length - 1)) * (width - 2 * padding);
      const y = height - padding - (dateMap[date] / maxAmt) * (height - 2 * padding);
      return `${x.toFixed(1)} ${y.toFixed(1)}`;
    });
    return `M ${points.join(' L ')}`;
  }, [filteredTransactions]);

  const executeSaveTransaction = async (txnToSave: Transaction) => {
    if (!activeProject || !storageAdapter) return;
    try {
      await storageAdapter.saveTransaction(activeProject.id, txnToSave);
      await refreshProjectData();
      setShowTxnModal(false);
      setShowDuplicateWarningModal(false);
      setPendingDuplicateTxn(null);
      setEditingTxnId(null);
      setTxnAmount('');
      setTxnDescription('');
      setTxnNotes('');
      setTxnLabels('');
      showToast(editingTxnId ? 'Transaction updated successfully' : 'Transaction saved successfully');
    } catch (err: any) {
      alert(err.message || 'Failed to save transaction');
    }
  };

  // Handle Save Transaction (Add or Edit)
  const handleSaveTransaction = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeProject || !storageAdapter) return;

    if (isCurrentMonthLocked) {
      showToast(`Month ${selectedMonth} is locked`);
      return;
    }

    setAmountError(null);
    setDateError(null);
    setDescError(null);

    const amtNum = parseFloat(txnAmount);
    if (isNaN(amtNum) || amtNum <= 0) {
      setAmountError('Amount must be greater than 0');
      return;
    }

    const year = parseInt(txnDate.split('-')[0] || '0', 10);
    if (!txnDate || isNaN(year) || year < 1900 || year > 2100) {
      setDateError('Invalid transaction date');
      return;
    }

    if (!txnDescription.trim()) {
      setDescError('Description cannot be empty');
      return;
    }

    const parsedLabels = txnLabels
      .split(',')
      .map(s => s.trim().toLowerCase())
      .filter(Boolean);

    const hash = await computeTxHash(txnDate, txnDescription, amtNum, txnType);

    const targetId = editingTxnId || (crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36).substring(2));
    const newTxn: Transaction = {
      id: targetId,
      date: txnDate,
      category: txnCategory,
      amount: amtNum,
      type: txnType,
      description: txnDescription,
      notes: txnNotes,
      labels: parsedLabels,
      hash
    };

    const isDup = transactions.some(t => 
      t.id !== targetId && (
        (t.hash && t.hash === hash) || 
        (t.date === txnDate && 
         t.description.trim().toLowerCase() === txnDescription.trim().toLowerCase() && 
         Math.abs(t.amount - amtNum) < 0.001 && 
         t.type === txnType)
      )
    );

    if (isDup && !editingTxnId) {
      setPendingDuplicateTxn(newTxn);
      setShowDuplicateWarningModal(true);
      return;
    }

    await executeSaveTransaction(newTxn);
  };

  const handleOpenAddTxn = () => {
    setEditingTxnId(null);
    setTxnAmount('');
    setTxnDescription('');
    setTxnNotes('');
    setTxnLabels('');
    setTxnDate(`${selectedMonth}-15`);
    setTxnCategory(categories[0]?.id || 'food');
    setShowTxnModal(true);
  };

  const handleEditTxn = (txn: Transaction) => {
    setEditingTxnId(txn.id);
    setTxnType(txn.type);
    setTxnAmount(txn.amount.toString());
    setTxnCategory(txn.category);
    setTxnDate(txn.date);
    setTxnDescription(txn.description);
    setTxnNotes(txn.notes || '');
    setTxnLabels((txn.labels || []).join(', '));
    setShowTxnModal(true);
  };

  const handleDeleteTxn = async (id: string) => {
    if (!activeProject || !storageAdapter) return;
    try {
      await storageAdapter.deleteTransaction(activeProject.id, id);
      await refreshProjectData();
      setSelectedTxnIds(prev => {
        const next = new Set(prev);
        next.delete(id);
        return next;
      });
      showToast('Transaction deleted');
    } catch (err: any) {
      alert(err.message || 'Failed to delete transaction');
    }
  };

  const toggleSelectTxn = (id: string) => {
    setSelectedTxnIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const isAllSelected = filteredTransactions.length > 0 && filteredTransactions.every(t => selectedTxnIds.has(t.id));

  const toggleSelectAllTxns = () => {
    if (isAllSelected) {
      setSelectedTxnIds(new Set());
    } else {
      setSelectedTxnIds(new Set(filteredTransactions.map(t => t.id)));
    }
  };

  const handleExecuteBulkDelete = async () => {
    if (!activeProject || !storageAdapter || selectedTxnIds.size === 0) return;
    const idsToDelete = Array.from(selectedTxnIds);
    let count = 0;
    try {
      for (const id of idsToDelete) {
        await storageAdapter.deleteTransaction(activeProject.id, id);
        count++;
      }
      await refreshProjectData();
      setSelectedTxnIds(new Set());
      setShowBulkDeleteConfirmModal(false);
      showToast(`Successfully deleted ${count} transaction${count > 1 ? 's' : ''}`);
    } catch (err: any) {
      alert(err.message || 'Failed to delete selected transactions');
    }
  };

  // Handle Save Budgets
  const handleSaveBudgets = async () => {
    if (!activeProject || !storageAdapter) return;
    try {
      await storageAdapter.saveBudgets(activeProject.id, budgets);
      showToast('Budgets saved successfully');
    } catch (err: any) {
      if (err.name === 'QuotaExceededError' || /quota/i.test(err.message || '')) {
        setAuthErrorToast('Storage quota exceeded. Session is now read-only.');
      } else {
        alert(err.message || 'Failed to save budgets');
      }
    }
  };

  const handleBudgetInputChange = (catName: string, val: string) => {
    const num = parseFloat(val);
    if (isNaN(num) || num < 0) {
      setBudgetErrors(prev => ({ ...prev, [catName]: 'Budget must be positive' }));
      return;
    }
    setBudgetErrors(prev => ({ ...prev, [catName]: '' }));
    setBudgets(prev => {
      const existing = prev.findIndex(b => b.category === catName || b.category.toLowerCase() === catName.toLowerCase());
      if (existing > -1) {
        const next = [...prev];
        next[existing] = { category: catName, amount: num };
        return next;
      }
      return [...prev, { category: catName, amount: num }];
    });
  };

  // Category Management
  const handleSaveCategory = async (e: React.FormEvent) => {
    e.preventDefault();
    setCategoryModalError(null);
    if (!activeProject || !storageAdapter || !newCatName.trim()) return;

    // Check duplicate category name
    const dup = categories.some(c => c.id !== editingCatId && c.name.toLowerCase() === newCatName.trim().toLowerCase());
    if (dup) {
      setCategoryModalError('Category already exists');
      return;
    }

    const catId = editingCatId || newCatName.trim().toLowerCase().replace(/[^a-z0-9]/g, '-');
    const validHexColor = /^#[0-9A-Fa-f]{6}$/i.test(newCatColor) ? newCatColor : '#38bdf8';
    const newCat: Category = {
      id: catId,
      name: newCatName.trim(),
      color: validHexColor,
      emoji: newCatEmoji || '📦'
    };

    try {
      await storageAdapter.saveCategory(activeProject.id, newCat);
      await refreshProjectData();
      setShowAddCatModal(false);
      setEditingCatId(null);
      setNewCatName('');
      showToast(editingCatId ? 'Category edited successfully' : 'Category added successfully');
    } catch (err: any) {
      alert(err.message || 'Failed to save category');
    }
  };

  // Lock / Unlock Month
  const handleLockCurrentMonth = async () => {
    if (!activeProject || !storageAdapter) return;
    const lockRecord: MonthlyLock = {
      month: selectedMonth,
      locked: true,
      lockedAt: new Date().toISOString()
    };
    try {
      // Print HTML Report Email in console for collaborators immediately
      const collabs = Array.from(new Set([...(activeProject.collaborators || []), ...collaboratorList]));
      const ccList = collabs.join(', ');
      const formattedTotal = totalExpenses.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
      console.log(`Gmail API Mock: Sending Monthly Lock Report for ${selectedMonth} to ${ccList} <html><body><h1>Monthly Report: ${selectedMonth}</h1><p>Total Expenses: $${formattedTotal}</p></body></html>`);

      await storageAdapter.saveLock(activeProject.id, lockRecord);
      await refreshProjectData();
      const mailtoLink = `mailto:${ccList}?subject=Monthly Lock Report: ${selectedMonth}&body=Monthly Report: ${selectedMonth}%0A%0ATotal Expenses: $${formattedTotal}`;
      console.log(`Lock Report Generated: ${mailtoLink}`);
      
      showToast(`Month ${selectedMonth} locked. Report generated.`);
    } catch (err: any) {
      alert(err.message || 'Failed to lock month');
    }
  };

  const handleUnlockCurrentMonth = async () => {
    if (!activeProject || !storageAdapter) return;
    const unlockRecord: MonthlyLock = {
      month: selectedMonth,
      locked: false
    };
    try {
      await storageAdapter.saveLock(activeProject.id, unlockRecord);
      await refreshProjectData();
      showToast(`Month ${selectedMonth} unlocked`);
    } catch (err: any) {
      alert(err.message || 'Failed to unlock month');
    }
  };

  const [csvError, setCsvError] = useState<string | null>(null);

  function standardizeDate(raw: string): string {
    if (!raw) return '2026-07-15';
    if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw;
    const dotMatch = raw.match(/^(\d{4})\.(\d{2})\.(\d{2})$/);
    if (dotMatch) return `${dotMatch[1]}-${dotMatch[2]}-${dotMatch[3]}`;
    const slashMatch = raw.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
    if (slashMatch) return `${slashMatch[3]}-${slashMatch[1]}-${slashMatch[2]}`;
    const d = new Date(raw);
    if (!isNaN(d.getTime())) {
      const year = d.getFullYear();
      const month = String(d.getMonth() + 1).padStart(2, '0');
      const day = String(d.getDate()).padStart(2, '0');
      return `${year}-${month}-${day}`;
    }
    return raw;
  }

  // CSV Import Wizard
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

    // Auto mapping guesses for standard names
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
    const items: typeof parsedCsvItems = [];

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

    await storageAdapter.saveTransactions(activeProject.id, newTxns);
    await refreshProjectData();
    setShowCsvWizard(false);
    setShowCsvDuplicateWarningModal(false);
    showToast(`Imported ${toImport.length} transactions`);
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

  // Pie chart calculation
  const piePaths = useMemo(() => {
    const expenseTxns = filteredTransactions.filter(t => t.type === 'expense');
    const grouped = categories.map(cat => {
      const total = expenseTxns
        .filter(t => t.category === cat.id || t.category.toLowerCase() === cat.name.toLowerCase())
        .reduce((sum, t) => sum + t.amount, 0);
      return {
        category: cat.id,
        name: cat.name,
        color: cat.color,
        total
      };
    }).filter(item => item.total > 0);

    const totalPieExpense = grouped.reduce((sum, item) => sum + item.total, 0);
    const cx = 150;
    const cy = 96;
    const r = 60;
    const result: Array<{ pathData: string; color: string; category: string; name: string }> = [];

    if (totalPieExpense > 0) {
      let accumulatedAngle = -Math.PI / 2;
      grouped.forEach(item => {
        const percentage = item.total / totalPieExpense;
        let angleSpan = percentage * 2 * Math.PI;
        if (percentage >= 0.999) {
          angleSpan = 2 * Math.PI - 0.001;
        }
        const startAngle = accumulatedAngle;
        const endAngle = accumulatedAngle + angleSpan;
        const x1 = cx + r * Math.cos(startAngle);
        const y1 = cy + r * Math.sin(startAngle);
        const x2 = cx + r * Math.cos(endAngle);
        const y2 = cy + r * Math.sin(endAngle);
        const largeArcFlag = angleSpan > Math.PI ? 1 : 0;
        const pathData = `M ${cx} ${cy} L ${x1} ${y1} A ${r} ${r} 0 ${largeArcFlag} 1 ${x2} ${y2} Z`;
        result.push({ pathData, color: item.color, category: item.category, name: item.name });
        accumulatedAngle = endAngle;
      });
    }
    return { segments: result, totalPieExpense };
  }, [filteredTransactions, categories]);

  return (
    <div className="min-h-screen transition-colors duration-300 bg-background text-foreground flex flex-col">
      {/* Toast Notification */}
      {toastMessage && (
        <div 
          data-testid="notification-toast" 
          className="notification-success fixed bottom-6 right-6 z-50 py-2.5 px-5 rounded-xl bg-emerald-500 text-black font-bold text-sm shadow-glow-cyan animate-slide-up flex items-center gap-2"
        >
          <Check className="h-4 w-4" />
          <span>{toastMessage}</span>
        </div>
      )}

      {isMockMode && (
        <div 
          data-testid="mock-banner" 
          className="mock-mode-banner bg-amber-500 text-black py-1.5 px-4 text-center font-bold text-xs"
        >
          Mock Mode
        </div>
      )}

      {/* Header Panel */}
      <header className="glass-panel sticky top-0 z-50 px-6 py-4 flex items-center justify-between shadow-glass border-b border-border">
        <div className="flex items-center gap-3 cursor-pointer" onClick={() => selectProject(null)}>
          <div className="p-2 rounded-lg bg-primary/10 border border-primary/30">
            <Sparkles className="h-6 w-6 text-primary animate-pulse-glow" />
          </div>
          <div>
            <h1 className="text-xl font-bold tracking-wider text-glow-cyan">NEBULA EXPENSE</h1>
            <p className="text-xs text-muted-foreground">Decentralized Budget Planning</p>
          </div>
        </div>

        <div className="flex items-center gap-4">
          <button
            onClick={toggleTheme}
            className="p-2 rounded-full border border-border bg-accent/20 hover:bg-accent/40 transition-colors"
            title="Toggle theme"
            data-testid="theme-toggle-btn"
          >
            {theme === 'dark' ? <Sun className="h-5 w-5 text-yellow-400" /> : <Moon className="h-5 w-5 text-indigo-500" />}
          </button>

          {isAuthenticated && (
            <div className="flex items-center gap-3 border-l border-border pl-4">
              {user?.picture ? (
                <img src={user.picture} alt={user.name} className="h-8 w-8 rounded-full border border-primary/40" />
              ) : (
                <div className="h-8 w-8 rounded-full bg-accent flex items-center justify-center text-xs font-bold text-primary">
                  {user?.name?.charAt(0) || 'U'}
                </div>
              )}
              <div className="hidden md:block text-left">
                <p className="text-xs font-semibold">{user?.name}</p>
                <p className="text-[10px] text-muted-foreground">{isMockMode ? 'Mock Session' : 'Google Account'}</p>
              </div>
              <button
                onClick={logout}
                className="p-2 rounded-lg border border-border bg-rose-500/10 text-rose-400 hover:bg-rose-500/20 transition-colors"
                title="Log Out"
                data-testid="logout-btn"
              >
                <LogOut className="h-4 w-4" />
              </button>
            </div>
          )}

          {!isAuthenticated && (
            <div className="flex items-center gap-2 px-3 py-1.5 rounded-full border border-emerald-500/30 bg-emerald-500/10 text-emerald-400 text-xs">
              <Shield className="h-4 w-4" />
              <span>Sign In Required</span>
            </div>
          )}
        </div>
      </header>

      {/* Main Body */}
      <main className="flex-1 flex flex-col items-center justify-start p-6 max-w-7xl mx-auto w-full">
        {isLoading && (
          <div className="text-center py-10">
            <div className="animate-spin rounded-full h-10 w-10 border-t-2 border-b-2 border-primary mx-auto mb-4"></div>
            <p className="text-sm text-muted-foreground">Loading workspace...</p>
          </div>
        )}

        {error && (
          <div className="w-full max-w-lg mb-6 p-4 rounded-xl border border-rose-500/30 bg-rose-500/10 text-rose-400 text-sm">
            {error}
          </div>
        )}

        {!isLoading && !isAuthenticated && (
          <div className="glass-card max-w-md w-full p-8 rounded-2xl flex flex-col gap-6 text-center animate-slide-up my-auto">
            <div className="mx-auto p-4 rounded-full bg-primary/10 border border-primary/30 text-primary w-fit">
              <KeyRound className="h-10 w-10" />
            </div>
            <div>
              <h2 className="text-2xl font-bold text-glow-cyan mb-2">Access Your Dashboard</h2>
              <p className="text-sm text-muted-foreground">
                Select your preferred workspace mode. Google Workspace mode connects directly to your Google Sheets storage.
              </p>
            </div>

            <div className="flex flex-col gap-4">
              <button 
                onClick={loginAsMock}
                className="w-full py-3 px-4 rounded-xl bg-primary text-primary-foreground font-semibold hover:opacity-90 active:scale-95 transition-all shadow-glow-cyan"
                data-testid="mock-login-btn"
              >
                Sign In with Mock Account
              </button>
              
              <button 
                onClick={login}
                className="w-full py-3 px-4 rounded-xl border border-border bg-accent/20 hover:bg-accent/30 transition-all text-sm font-medium flex items-center justify-center gap-2"
                data-testid="google-login-btn"
              >
                <Shield className="h-4 w-4 text-emerald-400" />
                <span>Sign In with Google</span>
              </button>
            </div>

            <div className="border-t border-border/40 pt-4 flex flex-col items-center gap-2">
              <label className="text-xs text-muted-foreground flex items-center gap-2 cursor-pointer">
                <input 
                  type="checkbox" 
                  checked={isMockMode} 
                  disabled={!googleClientIdExists}
                  onChange={(e) => toggleMockMode(e.target.checked)}
                  className="rounded border-border text-primary focus:ring-primary bg-background"
                />
                Force Mock/Demo Mode Fallback
              </label>
            </div>
          </div>
        )}

        {!isLoading && isAuthenticated && currentView === 'project-selector' && (
          <div 
            data-testid="project-selector"
            className="glass-card max-w-2xl w-full p-8 rounded-2xl flex flex-col gap-6 animate-slide-up my-auto"
          >
            <div className="flex items-center justify-between border-b border-border/40 pb-4">
              <div className="flex items-center gap-3">
                <div className="p-3 rounded-full bg-secondary/10 border border-secondary/30 text-secondary">
                  <FolderOpen className="h-6 w-6" />
                </div>
                <div className="text-left">
                  <h2 className="text-xl font-bold text-glow-purple">Your Projects</h2>
                  <p className="text-xs text-muted-foreground">Select an existing budget project or initialize a new one.</p>
                </div>
              </div>
              
              <button
                onClick={() => setShowCreateModal(true)}
                className="py-2 px-4 rounded-xl bg-primary text-primary-foreground font-semibold hover:opacity-90 active:scale-95 transition-all text-sm flex items-center gap-2"
                data-testid="create-project-btn"
              >
                <PlusCircle className="h-4 w-4" />
                <span>New Project</span>
              </button>
            </div>

            {projects.length === 0 ? (
              <div 
                data-testid="onboarding-modal"
                className="text-center py-10 border-2 border-dashed border-border rounded-xl p-6 flex flex-col items-center justify-center gap-4"
              >
                <h3 className="text-lg font-bold text-glow-purple">Welcome to Nebula Expense!</h3>
                <p className="text-sm text-muted-foreground">To get started, create your first budget project.</p>
                <form onSubmit={handleCreateProject} className="flex gap-2 w-full max-w-md mt-2 justify-center">
                  <input
                    type="text"
                    value={newProjectName}
                    onChange={(e) => setNewProjectName(e.target.value)}
                    placeholder="Project Name (e.g. Household Expenses)"
                    required
                    className="flex-1 px-3 py-2 rounded-lg border border-border bg-background text-sm focus:outline-none focus:border-primary"
                    data-testid="project-name-input"
                  />
                  <button
                    type="submit"
                    className="px-4 py-2 bg-primary text-primary-foreground rounded-lg text-sm font-semibold hover:opacity-90 active:scale-95 transition-all whitespace-nowrap"
                    data-testid="project-submit-btn"
                  >
                    Create
                  </button>
                </form>
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {projects.map(proj => (
                  <button
                    key={proj.id}
                    onClick={() => selectProject(proj.id)}
                    className="p-5 rounded-xl border border-border bg-accent/5 hover:bg-accent/10 hover:border-primary/40 transition-all text-left flex flex-col justify-between group"
                    data-testid={`project-item-${proj.id}`}
                  >
                    <div>
                      <h3 className="font-bold text-base group-hover:text-primary transition-colors">{proj.name}</h3>
                      <p className="text-xs text-muted-foreground mt-1">ID: {proj.id}</p>
                    </div>
                    <div className="mt-4 flex items-center justify-between">
                      <span className="text-[10px] py-0.5 px-2 rounded bg-accent border border-border text-muted-foreground uppercase">
                        {isMockMode ? 'Local' : 'Google Sheets'}
                      </span>
                      <span className="text-xs text-primary group-hover:underline">Open Dashboard &rarr;</span>
                    </div>
                  </button>
                ))}
              </div>
            )}

          </div>
        )}

        {!isLoading && isAuthenticated && currentView === 'dashboard' && activeProject && (
          <div className="glass-card w-full p-8 rounded-2xl flex flex-col gap-6 animate-slide-up">
            {/* Project Header Bar */}
            <div 
              data-testid="dashboard-header"
              className="flex flex-col md:flex-row justify-between items-start md:items-center border-b border-border/40 pb-4 gap-4"
            >
              <div className="text-left">
                <div className="flex items-center gap-2">
                  <LayoutDashboard className="h-5 w-5 text-primary" />
                  <h2 className="text-2xl font-extrabold text-glow-cyan">{activeProject.name}</h2>
                </div>
                <p className="text-xs text-muted-foreground mt-1">
                  Active Session: {isMockMode ? 'Mock Database (LocalStorage)' : 'Google Sheets'}
                </p>
              </div>

              {/* Toolbar Actions */}
              <div className="flex flex-wrap items-center gap-2">
                {/* Project Switcher */}
                <div data-testid="project-selector" className="flex items-center gap-1">
                  {projects.map(p => (
                    <button
                      key={p.id}
                      data-testid={`project-item-${p.id}`}
                      onClick={() => selectProject(p.id)}
                      className={`py-1 px-2.5 rounded-lg border text-xs font-semibold ${
                        p.id === activeProject.id
                          ? 'bg-primary/20 text-primary border-primary/40'
                          : 'bg-secondary/10 border-border/40 hover:bg-secondary/20'
                      }`}
                    >
                      {p.name}
                    </button>
                  ))}
                  <button
                    data-testid="create-project-btn"
                    onClick={() => setShowCreateModal(true)}
                    className="py-1 px-2 rounded-lg bg-primary/20 text-primary border border-primary/40 text-xs font-semibold hover:bg-primary/30"
                    title="Create New Project"
                  >
                    +
                  </button>
                </div>

                {/* Month Selector */}
                <select
                  data-testid="month-selector"
                  value={selectedMonth}
                  onChange={(e) => setSelectedMonth(e.target.value)}
                  className="py-1.5 px-3 rounded-lg border border-border bg-background text-xs font-semibold"
                >
                  <option value="all">All Months</option>
                  {availableMonths.map(m => {
                    const [y, mon] = m.split('-');
                    const dateObj = new Date(parseInt(y, 10), parseInt(mon, 10) - 1, 1);
                    const label = isNaN(dateObj.getTime()) ? m : dateObj.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
                    return <option key={m} value={m}>{label}</option>;
                  })}
                </select>

                {/* Lock Status & Action */}
                <span
                  data-testid="lock-status-indicator"
                  className={`py-1 px-2.5 rounded-full text-xs font-bold border flex items-center gap-1 ${
                    isCurrentMonthLocked 
                      ? 'bg-rose-500/20 text-rose-400 border-rose-500/40' 
                      : 'bg-emerald-500/20 text-emerald-400 border-emerald-500/40'
                  }`}
                >
                  {isCurrentMonthLocked ? <Lock className="h-3 w-3" /> : <Unlock className="h-3 w-3" />}
                  <span>{isCurrentMonthLocked ? 'Locked' : 'Unlocked'}</span>
                </span>

                {isCurrentMonthLocked ? (
                  <button
                    data-testid="unlock-month-btn"
                    onClick={handleUnlockCurrentMonth}
                    className="py-1.5 px-3 rounded-lg bg-emerald-600/30 text-emerald-300 border border-emerald-500/40 text-xs font-semibold hover:bg-emerald-600/40"
                  >
                    Unlock Month
                  </button>
                ) : (
                  <button
                    data-testid="lock-month-btn"
                    onClick={handleLockCurrentMonth}
                    className="py-1.5 px-3 rounded-lg bg-rose-600/30 text-rose-300 border border-rose-500/40 text-xs font-semibold hover:bg-rose-600/40"
                  >
                    Lock Month
                  </button>
                )}

                {/* Add Transaction Button */}
                {!isCurrentMonthLocked && (
                  <button
                    data-testid="open-add-transaction-btn"
                    onClick={handleOpenAddTxn}
                    className="py-1.5 px-3 rounded-lg bg-primary text-primary-foreground text-xs font-semibold hover:opacity-90 flex items-center gap-1.5"
                  >
                    <Plus className="h-3.5 w-3.5" />
                    <span>Add Transaction</span>
                  </button>
                )}

                {/* CSV Import Button */}
                {!isCurrentMonthLocked && (
                  <label 
                    data-testid="import-csv-trigger-btn"
                    onClick={() => setShowCsvWizard(true)}
                    className="py-1.5 px-3 rounded-lg border border-border bg-accent/20 hover:bg-accent/30 text-xs font-semibold cursor-pointer flex items-center gap-1.5"
                  >
                    <Upload className="h-3.5 w-3.5 text-primary" />
                    <span>Import CSV</span>
                  </label>
                )}

                {/* Share Project */}
                <button
                  data-testid="share-project-btn"
                  onClick={() => setShowShareModal(true)}
                  className="py-1.5 px-3 rounded-lg border border-border bg-accent/20 hover:bg-accent/30 text-xs font-semibold flex items-center gap-1.5"
                >
                  <Share2 className="h-3.5 w-3.5 text-secondary" />
                  <span>Share</span>
                </button>

                <button 
                  onClick={() => selectProject(null)}
                  className="py-1.5 px-3 rounded-lg border border-border text-xs font-semibold hover:bg-accent/20 transition-all"
                >
                  Back to Projects
                </button>
              </div>
            </div>

            {/* KPI Summary Cards */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              <div 
                data-testid="kpi-total-budget"
                className="p-5 rounded-xl border border-border bg-accent/5 flex items-center justify-between text-left"
              >
                <div>
                  <p className="text-[10px] text-muted-foreground uppercase tracking-widest font-semibold">Allocated Budget</p>
                  <p className="text-2xl font-extrabold mt-1 text-glow-purple">
                    ${totalBudget.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </p>
                </div>
                <div className="p-3 rounded-lg bg-secondary/15 text-secondary border border-secondary/20">
                  <Coins className="h-5 w-5" />
                </div>
              </div>

              <div 
                data-testid="kpi-total-income"
                className="p-5 rounded-xl border border-border bg-accent/5 flex items-center justify-between text-left"
              >
                <div>
                  <p className="text-[10px] text-muted-foreground uppercase tracking-widest font-semibold">Total Income</p>
                  <p className="text-2xl font-extrabold mt-1 text-emerald-400">
                    ${totalIncome.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </p>
                </div>
                <div className="p-3 rounded-lg bg-emerald-500/15 text-emerald-400 border border-emerald-500/20">
                  <TrendingUp className="h-5 w-5" />
                </div>
              </div>

              <div 
                data-testid="kpi-total-expenses"
                className="p-5 rounded-xl border border-border bg-accent/5 flex items-center justify-between text-left overflow-hidden"
              >
                <div>
                  <p className="text-[10px] text-muted-foreground uppercase tracking-widest font-semibold">Total Expenses</p>
                  <p className="text-2xl font-extrabold mt-1 text-rose-400">
                    ${totalExpenses.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </p>
                </div>
                <div className="p-3 rounded-lg bg-rose-500/15 text-rose-400 border border-rose-500/20">
                  <TrendingDown className="h-5 w-5" />
                </div>
              </div>

              <div className="p-5 rounded-xl border border-border bg-accent/5 flex items-center justify-between text-left">
                <div>
                  <p className="text-[10px] text-muted-foreground uppercase tracking-widest font-semibold">Remaining Budget</p>
                  <p className={`text-2xl font-extrabold mt-1 ${budgetRemaining >= 0 ? 'text-primary text-glow-cyan' : 'text-rose-500'}`}>
                    ${budgetRemaining.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </p>
                </div>
                <div className="p-3 rounded-lg bg-primary/15 text-primary border border-primary/20">
                  <DollarSign className="h-5 w-5" />
                </div>
              </div>
            </div>

            {/* Split content columns: Transactions vs Category Budgets */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              {/* Left Column: Transactions List & Tag Filters */}
              <div className="lg:col-span-2 p-6 rounded-xl border border-border bg-accent/5 flex flex-col gap-4 text-left">
                <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border/40 pb-3">
                  <div className="flex items-center gap-3">
                    <h3 className="font-bold text-sm uppercase tracking-wider text-muted-foreground">Transactions</h3>
                    {filteredTransactions.length > 0 && !isCurrentMonthLocked && (
                      <label className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground cursor-pointer select-none">
                        <input
                          type="checkbox"
                          data-testid="select-all-txns-checkbox"
                          checked={isAllSelected}
                          onChange={toggleSelectAllTxns}
                          className="accent-primary cursor-pointer h-3.5 w-3.5 rounded"
                        />
                        <span>Select All</span>
                      </label>
                    )}
                    {selectedTxnIds.size > 0 && !isCurrentMonthLocked && (
                      <button
                        data-testid="bulk-delete-btn"
                        type="button"
                        onClick={() => setShowBulkDeleteConfirmModal(true)}
                        className="px-2.5 py-1 rounded-lg bg-rose-500/20 text-rose-300 border border-rose-500/40 hover:bg-rose-500/30 text-xs font-bold flex items-center gap-1.5 transition-all"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                        Delete Selected ({selectedTxnIds.size})
                      </button>
                    )}
                  </div>
                  <div className="flex items-center gap-1.5 flex-wrap">
                    {/* Common quick filter tags */}
                    {availableTags.map(tag => (
                      <button
                        key={tag}
                        data-testid={`filter-tag-${tag}`}
                        onClick={() => setSelectedTagFilter(prev => prev === tag ? null : tag)}
                        className={`px-2.5 py-1 rounded-full text-xs font-semibold border transition-all ${
                          selectedTagFilter === tag 
                            ? 'bg-primary/20 text-primary border-primary' 
                            : 'bg-background border-border text-muted-foreground hover:text-foreground'
                        }`}
                      >
                        #{tag}
                      </button>
                    ))}
                    {duplicateTxnIds.size > 0 && (
                      <span className="text-[10px] py-0.5 px-2 rounded-full bg-amber-500/20 text-amber-400 border border-amber-500/30 font-semibold" title="Duplicate transactions present">
                        ⚠️ {duplicateTxnIds.size} Duplicate{duplicateTxnIds.size > 1 ? 's' : ''} Flagged
                      </span>
                    )}
                    {selectedTagFilter && (
                      <button 
                        onClick={() => setSelectedTagFilter(null)}
                        className="text-xs text-rose-400 hover:underline px-2"
                      >
                        Clear filter
                      </button>
                    )}
                  </div>
                </div>

                {filteredTransactions.length === 0 ? (
                  <p className="text-xs text-muted-foreground py-10 text-center">No transactions found for the current period.</p>
                ) : (
                  <div className="flex flex-col gap-2 max-h-96 overflow-y-auto custom-scrollbar pr-1">
                    {filteredTransactions.map(txn => {
                      const catObj = categories.find(c => c.id === txn.category || c.name.toLowerCase() === txn.category.toLowerCase());
                      return (
                        <div
                          key={txn.id}
                          data-testid="transaction-row"
                          className={`p-3.5 rounded-xl border flex items-center justify-between gap-4 transition-colors ${
                            selectedTxnIds.has(txn.id) ? 'border-primary/60 bg-primary/5' : 'border-border bg-background hover:border-primary/40'
                          }`}
                        >
                          <div className="flex items-center gap-3 text-left">
                            {!isCurrentMonthLocked && (
                              <input
                                type="checkbox"
                                data-testid={`select-txn-checkbox-${txn.id}`}
                                checked={selectedTxnIds.has(txn.id)}
                                onChange={() => toggleSelectTxn(txn.id)}
                                className="accent-primary cursor-pointer h-4 w-4 rounded"
                              />
                            )}
                            <span 
                              data-testid={`category-badge-${catObj?.name || txn.category}`}
                              className="h-9 w-9 rounded-lg flex items-center justify-center text-base"
                              style={{ backgroundColor: `${catObj?.color || '#38bdf8'}20` }}
                            >
                              {catObj?.emoji || '📦'}
                            </span>
                            <div>
                                <div className="flex items-center gap-2">
                                  <p className="text-sm font-bold text-foreground">{txn.description}</p>
                                  {duplicateTxnIds.has(txn.id) && (
                                    <span 
                                      data-testid="duplicate-badge"
                                      className="text-[10px] py-0.5 px-1.5 rounded bg-amber-500/20 text-amber-400 border border-amber-500/30 font-semibold"
                                      title="Duplicate transaction detected"
                                    >
                                      ⚠️ Duplicate
                                    </span>
                                  )}
                                </div>
                                <div className="flex items-center gap-2 mt-0.5">
                                  <span data-testid="transaction-date-row" className="text-[10px] text-muted-foreground">{txn.date}</span>
                                  {txn.labels.map(l => (
                                    <span key={l} className="text-[10px] py-0.5 px-1.5 rounded bg-accent/30 text-muted-foreground">
                                      #{l}
                                    </span>
                                  ))}
                                </div>
                              </div>
                          </div>

                          <div className="flex items-center gap-3">
                            <span className={`font-mono font-bold text-sm ${
                              txn.type === 'income' ? 'text-emerald-400' : 'text-rose-400'
                            }`}>
                              {txn.type === 'income' ? '+' : '-'}${txn.amount.toFixed(2)}
                            </span>

                            {!isCurrentMonthLocked && (
                              <div className="flex items-center gap-1">
                                <button
                                  data-testid={`edit-transaction-btn-${txn.id}`}
                                  onClick={() => handleEditTxn(txn)}
                                  className="p-1.5 rounded-lg border border-border hover:bg-accent/20 text-muted-foreground hover:text-foreground"
                                  title="Edit"
                                >
                                  <Edit2 className="h-3.5 w-3.5" />
                                </button>
                                <button
                                  data-testid={`delete-transaction-btn-${txn.id}`}
                                  onClick={() => handleDeleteTxn(txn.id)}
                                  className="p-1.5 rounded-lg border border-border hover:bg-rose-500/20 text-muted-foreground hover:text-rose-400"
                                  title="Delete"
                                >
                                  <Trash2 className="h-3.5 w-3.5" />
                                </button>
                              </div>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* Right Column: Category Budgets Grid */}
              <div 
                data-testid="budget-grid-container"
                style={{ overflowY: 'auto' }}
                className="p-6 rounded-xl border border-border bg-accent/5 flex flex-col gap-4 text-left overflow-y-auto"
              >
                <div className="flex items-center justify-between border-b border-border/40 pb-3">
                  <h3 className="font-bold text-sm uppercase tracking-wider text-muted-foreground">Category Budgets</h3>
                  <button
                    data-testid="open-add-category-btn"
                    onClick={() => setShowAddCatModal(true)}
                    className="py-1 px-2.5 rounded-lg bg-primary/15 text-primary border border-primary/30 text-xs font-semibold hover:bg-primary/25"
                  >
                    + Category
                  </button>
                </div>

                <div data-testid="budget-category-grid" style={{ overflowY: 'auto' }} className="flex flex-col gap-4 max-h-96 overflow-y-auto custom-scrollbar pr-1">
                  {categorySummary.map(eb => {
                    const remaining = eb.budget - eb.spent;
                    return (
                      <div key={eb.id} className="flex flex-col gap-1.5">
                        <div className="flex justify-between items-center text-xs">
                          <span data-testid={`category-badge-${eb.name}`} className="flex items-center gap-1.5 font-semibold">
                            <span>{eb.emoji}</span>
                            <span data-testid={`budget-label-${eb.name}`} className="truncate max-w-[120px] inline-block">{eb.name}</span>
                            <button
                              data-testid={`edit-category-${eb.name}-btn`}
                              onClick={() => {
                                setEditingCatId(eb.id);
                                setNewCatName(eb.name);
                                setNewCatColor(eb.color);
                                setNewCatEmoji(eb.emoji);
                                setShowAddCatModal(true);
                              }}
                              className="text-muted-foreground hover:text-primary ml-1"
                              title="Edit Category"
                            >
                              <Edit2 className="h-2.5 w-2.5" />
                            </button>
                          </span>
                          <span className="text-muted-foreground flex items-center gap-2">
                            <span data-testid={`budget-utilization-${eb.name}`} className="text-[10px] font-bold">
                              {eb.percent}%
                            </span>
                            <span>
                              <span className="font-bold text-foreground">${eb.spent}</span> of ${eb.budget}
                            </span>
                          </span>
                        </div>

                        <div className="flex items-center gap-2">
                          <input
                            data-testid={`budget-input-${eb.name}`}
                            type="number"
                            disabled={isCurrentMonthLocked}
                            value={eb.budget}
                            onChange={(e) => handleBudgetInputChange(eb.name, e.target.value)}
                            className="w-20 px-2 py-0.5 rounded border border-border bg-background text-xs disabled:opacity-50"
                          />
                          <span
                            data-testid={`budget-remaining-${eb.name}`}
                            className={`text-[10px] font-semibold ${remaining >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}
                          >
                            Rem: ${remaining.toFixed(2)}
                          </span>
                        </div>
                        {budgetErrors[eb.name] && (
                          <p data-testid="budget-error" className={`budget-error-${eb.name} text-[10px] text-rose-400`}>
                            {budgetErrors[eb.name]}
                          </p>
                        )}

                        <div className="h-2 w-full rounded-full bg-accent border border-border overflow-hidden">
                          <div 
                            data-testid={`budget-indicator-${eb.name}`}
                            className={`h-full rounded-full transition-all duration-500 ${eb.spent > eb.budget && eb.budget > 0 ? 'budget-overspent bg-red-500' : ''}`}
                            style={{ 
                              width: `${Math.min(eb.percent, 100)}%`,
                              backgroundColor: eb.spent > eb.budget && eb.budget > 0 ? '#ef4444' : eb.color
                            }}
                          ></div>
                        </div>
                      </div>
                    );
                  })}
                </div>

                <button
                  data-testid="save-budgets-btn"
                  onClick={handleSaveBudgets}
                  className="w-full mt-2 py-2 rounded-xl bg-primary text-primary-foreground text-xs font-bold hover:opacity-90 shadow-glow-cyan"
                >
                  Save Budgets
                </button>
              </div>
            </div>

            {/* Dashboard SVG Charts Section */}
            <div data-testid="charts-container" className="grid grid-cols-1 md:grid-cols-3 gap-6">
              <div className="p-6 rounded-xl border border-border bg-accent/5 flex flex-col items-center gap-4">
                <span className="text-sm text-muted-foreground font-semibold">Budget vs Actual</span>
                <svg className="w-full h-48" data-testid="chart-svg-budget">
                  <rect width="100%" height="100%" fill="rgba(255,255,255,0.02)" rx="8" />
                  <g className="budget-bar">
                    {categorySummary.map((eb, idx) => {
                      const x = 30 + idx * 55;
                      const maxVal = Math.max(eb.budget, eb.spent, 1);
                      const budgetHeight = Math.min((eb.budget / maxVal) * 90, 95) || 10;
                      return (
                        <rect 
                          key={`b-${eb.id}`}
                          className={`budget-bar-${eb.name}`}
                          x={x} 
                          y={130 - budgetHeight} 
                          width="12" 
                          height={budgetHeight} 
                          fill="rgba(255,255,255,0.1)" 
                          rx="2"
                        />
                      );
                    })}
                  </g>
                  <g className="actual-bar">
                    {categorySummary.map((eb, idx) => {
                      const x = 30 + idx * 55;
                      const maxVal = Math.max(eb.budget, eb.spent, 1);
                      const spentHeight = Math.min((eb.spent / maxVal) * 90, 95) || 5;
                      return (
                        <rect 
                          key={`a-${eb.id}`}
                          className={`actual-bar-${eb.name}`}
                          x={x + 14} 
                          y={130 - spentHeight} 
                          width="12" 
                          height={spentHeight} 
                          fill={eb.color} 
                          rx="2"
                        />
                      );
                    })}
                  </g>
                  {categorySummary.map((eb, idx) => {
                    const x = 30 + idx * 55;
                    return (
                      <text key={`t-${eb.id}`} x={x + 13} y="150" textAnchor="middle" fontSize="12">
                        {eb.emoji}
                      </text>
                    );
                  })}
                  <line x1="10" y1="130" x2="350" y2="130" stroke="rgba(255,255,255,0.1)" strokeWidth="1" />
                </svg>
              </div>

              <div className="p-6 rounded-xl border border-border bg-accent/5 flex flex-col items-center gap-4">
                <span className="text-sm text-muted-foreground font-semibold">Category Breakdown (Pie)</span>
                <svg className="w-full h-48" data-testid="chart-svg-pie" viewBox="0 0 300 192">
                  <rect width="100%" height="100%" fill="rgba(255,255,255,0.02)" rx="8" />
                  {piePaths.totalPieExpense === 0 ? (
                    <text x="50%" y="50%" textAnchor="middle" fill="currentColor" className="no-data-text text-muted-foreground text-xs">
                      No data available
                    </text>
                  ) : (
                    piePaths.segments.map(p => (
                      <path
                        key={p.category}
                        d={p.pathData}
                        fill={p.color}
                        data-testid={`pie-segment-${p.category}`}
                      />
                    ))
                  )}
                </svg>
              </div>

              <div className="p-6 rounded-xl border border-border bg-accent/5 flex flex-col items-center gap-4">
                <span className="text-sm text-muted-foreground font-semibold">Spending Trend</span>
                <svg className="w-full h-48" data-testid="chart-svg-trend" viewBox="0 0 300 192">
                  <rect width="100%" height="100%" fill="rgba(255,255,255,0.02)" rx="8" />
                  {filteredTransactions.length === 0 && (
                    <text x="50%" y="50%" textAnchor="middle" fill="currentColor" className="no-data-text text-muted-foreground text-xs">
                      No data available
                    </text>
                  )}
                  {trendPathData ? (
                    <path d={trendPathData} fill="none" stroke="currentColor" strokeWidth="3" className="text-primary" />
                  ) : (
                    <path d="M 30 130 C 100 80, 200 120, 300 50" fill="none" stroke="currentColor" strokeWidth="3" className="text-primary/40" />
                  )}
                </svg>
              </div>
            </div>
          </div>
        )}
      </main>

      {/* Add / Edit Transaction Modal */}
      {showTxnModal && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="glass-card max-w-md w-full p-6 rounded-2xl animate-slide-up text-left">
            <div className="flex items-center justify-between border-b border-border/40 pb-3 mb-4">
              <h3 className="font-bold text-base text-glow-cyan">
                {editingTxnId ? 'Edit Transaction' : 'Add Transaction'}
              </h3>
              <button onClick={() => setShowTxnModal(false)} className="text-muted-foreground hover:text-foreground">
                <X className="h-5 w-5" />
              </button>
            </div>

            <form onSubmit={handleSaveTransaction} className="flex flex-col gap-4" noValidate>
              {/* Type Toggle */}
              <div className="grid grid-cols-2 gap-2 p-1 rounded-xl bg-background border border-border">
                <button
                  type="button"
                  data-testid="transaction-type-toggle"
                  data-active-type={txnType}
                  onClick={() => setTxnType(prev => prev === 'expense' ? 'income' : 'expense')}
                  className={`py-2 rounded-lg font-bold text-xs transition-all ${
                    txnType === 'expense' 
                      ? 'bg-rose-500/20 text-rose-400 border border-rose-500/30' 
                      : 'text-muted-foreground hover:text-foreground'
                  }`}
                >
                  Expense
                </button>
                <button
                  type="button"
                  onClick={() => setTxnType('income')}
                  className={`py-2 rounded-lg font-bold text-xs transition-all ${
                    txnType === 'income' 
                      ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30' 
                      : 'text-muted-foreground hover:text-foreground'
                  }`}
                >
                  Income
                </button>
              </div>

              <div>
                <label className="text-xs text-muted-foreground font-semibold">Amount</label>
                <input
                  data-testid="transaction-amount-input"
                  type="number"
                  step="0.01"
                  required
                  value={txnAmount}
                  onChange={(e) => setTxnAmount(e.target.value)}
                  placeholder="0.00"
                  className="w-full px-3 py-2 rounded-lg border border-border bg-background mt-1 font-mono text-sm focus:outline-none focus:border-primary"
                />
                {amountError && <p data-testid="amount-error" className="field-error-amount text-xs text-rose-400 mt-1">{amountError}</p>}
              </div>

              <div>
                <label className="text-xs text-muted-foreground font-semibold">Category</label>
                <select
                  data-testid="transaction-category-select"
                  value={txnCategory}
                  onChange={(e) => setTxnCategory(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg border border-border bg-background mt-1 text-sm focus:outline-none focus:border-primary"
                >
                  {categories.map(c => (
                    <option key={c.id} value={c.id}>
                      {c.emoji} {c.name}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="text-xs text-muted-foreground font-semibold">Date</label>
                <input
                  data-testid="transaction-date-input"
                  type="date"
                  required
                  value={txnDate}
                  onChange={(e) => setTxnDate(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg border border-border bg-background mt-1 text-sm focus:outline-none focus:border-primary"
                />
                {dateError && <p data-testid="date-error" className="field-error-date text-xs text-rose-400 mt-1">{dateError}</p>}
              </div>

              <div>
                <label className="text-xs text-muted-foreground font-semibold">Description</label>
                <input
                  data-testid="transaction-desc-input"
                  type="text"
                  required
                  value={txnDescription}
                  onChange={(e) => setTxnDescription(e.target.value)}
                  placeholder="e.g. Trader Joe's"
                  className="w-full px-3 py-2 rounded-lg border border-border bg-background mt-1 text-sm focus:outline-none focus:border-primary"
                />
                {descError && <p data-testid="desc-error" className="field-error-desc text-xs text-rose-400 mt-1">{descError}</p>}
              </div>

              <div>
                <label className="text-xs text-muted-foreground font-semibold">Notes</label>
                <textarea
                  data-testid="transaction-notes-input"
                  rows={2}
                  value={txnNotes}
                  onChange={(e) => setTxnNotes(e.target.value)}
                  placeholder="Optional details"
                  className="w-full px-3 py-2 rounded-lg border border-border bg-background mt-1 text-sm focus:outline-none focus:border-primary"
                />
              </div>

              <div>
                <label className="text-xs text-muted-foreground font-semibold">Labels (comma-separated)</label>
                <input
                  data-testid="transaction-labels-input"
                  type="text"
                  value={txnLabels}
                  onChange={(e) => setTxnLabels(e.target.value)}
                  placeholder="groceries, essential"
                  className="w-full px-3 py-2 rounded-lg border border-border bg-background mt-1 text-sm focus:outline-none focus:border-primary"
                />
              </div>

              <div className="flex gap-2 justify-end mt-2">
                <button
                  type="button"
                  onClick={() => setShowTxnModal(false)}
                  className="px-4 py-2 rounded-lg border border-border text-xs font-semibold hover:bg-accent/20"
                >
                  Cancel
                </button>
                <button
                  data-testid="save-transaction-btn"
                  type="submit"
                  className="px-5 py-2 rounded-lg bg-primary text-primary-foreground text-xs font-bold hover:opacity-90 shadow-glow-cyan"
                >
                  Save
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Add / Edit Category Modal */}
      {showAddCatModal && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="glass-card max-w-sm w-full p-6 rounded-2xl animate-slide-up text-left">
            <h3 className="font-bold text-base text-glow-purple mb-4">
              {editingCatId ? 'Edit Category' : 'New Category'}
            </h3>

            <form onSubmit={handleSaveCategory} className="flex flex-col gap-4">
              <div>
                <label className="text-xs text-muted-foreground font-semibold">Name</label>
                <input
                  data-testid={editingCatId ? 'edit-category-name-input' : 'new-category-name-input'}
                  type="text"
                  required
                  value={newCatName}
                  onChange={(e) => setNewCatName(e.target.value)}
                  placeholder="Category title"
                  className="w-full px-3 py-2 rounded-lg border border-border bg-background mt-1 text-sm focus:outline-none focus:border-primary"
                />
                {categoryModalError && <p data-testid="category-modal-error" className="text-xs text-rose-400 mt-1">{categoryModalError}</p>}
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-xs text-muted-foreground font-semibold">Color</label>
                  <input
                    data-testid={editingCatId ? 'edit-category-color-input' : 'new-category-color-input'}
                    type="text"
                    value={newCatColor}
                    onChange={(e) => setNewCatColor(e.target.value)}
                    className="w-full h-10 px-2 rounded-lg border border-border bg-background mt-1"
                  />
                </div>

                <div>
                  <label className="text-xs text-muted-foreground font-semibold">Emoji</label>
                  <input
                    data-testid={editingCatId ? 'edit-category-emoji-input' : 'new-category-emoji-input'}
                    type="text"
                    value={newCatEmoji}
                    onChange={(e) => setNewCatEmoji(e.target.value)}
                    maxLength={2}
                    className="w-full px-3 py-2 rounded-lg border border-border bg-background mt-1 text-sm text-center"
                  />
                </div>
              </div>

              <div className="flex gap-2 justify-end mt-2">
                <button
                  type="button"
                  onClick={() => { setShowAddCatModal(false); setEditingCatId(null); }}
                  className="px-4 py-2 rounded-lg border border-border text-xs font-semibold"
                >
                  Cancel
                </button>
                <button
                  data-testid={editingCatId ? 'save-edited-category-btn' : 'save-category-btn'}
                  type="submit"
                  className="px-5 py-2 rounded-lg bg-primary text-primary-foreground text-xs font-bold shadow-glow-cyan"
                >
                  Save
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Global Create Project Modal */}
      {showCreateModal && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="glass-card max-w-md w-full p-6 rounded-2xl animate-slide-up text-left">
            <div className="flex items-center justify-between border-b border-border/40 pb-3 mb-4">
              <h3 className="font-bold text-base text-glow-cyan">Create New Project</h3>
              <button onClick={() => setShowCreateModal(false)}>
                <X className="h-5 w-5 text-muted-foreground" />
              </button>
            </div>
            <form onSubmit={handleCreateProject} className="flex gap-2">
              <input
                type="text"
                value={newProjectName}
                onChange={(e) => setNewProjectName(e.target.value)}
                placeholder="Project Name (e.g. Household Expenses)"
                required
                className="flex-1 px-3 py-2 rounded-lg border border-border bg-background text-sm focus:outline-none focus:border-primary"
                data-testid="project-name-input"
              />
              <button
                type="submit"
                className="px-4 py-2 bg-primary text-primary-foreground rounded-lg text-sm font-semibold hover:opacity-90 active:scale-95 transition-all whitespace-nowrap"
                data-testid="project-submit-btn"
              >
                Create
              </button>
            </form>
          </div>
        </div>
      )}

      {/* Share Modal */}
      {showShareModal && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 pointer-events-none">
          <div className="glass-card max-w-md w-full p-6 rounded-2xl animate-slide-up text-left pointer-events-auto">
            <div className="flex items-center justify-between border-b border-border/40 pb-3 mb-4">
              <h3 className="font-bold text-base text-glow-cyan">Share Project</h3>
              <button onClick={() => setShowShareModal(false)}>
                <X className="h-5 w-5 text-muted-foreground" />
              </button>
            </div>

            <div className="flex gap-2 mb-4">
              <input
                data-testid="collaborator-email-input"
                type="email"
                placeholder="collaborator@example.com"
                value={collaboratorEmail}
                onChange={(e) => setCollaboratorEmail(e.target.value)}
                className="flex-1 px-3 py-2 rounded-lg border border-border bg-background text-sm"
              />
              <button
                data-testid="collaborator-submit-btn"
                onClick={async () => {
                  const email = collaboratorEmail.trim();
                  if (email && activeProject && storageAdapter) {
                    const newCollabs = Array.from(new Set([...(activeProject.collaborators || []), email]));
                    setCollaboratorList(newCollabs);
                    const updatedProj = { ...activeProject, collaborators: newCollabs };
                    try {
                      await storageAdapter.saveProject(updatedProj);
                    } catch (err) {
                      console.error("Failed to save project collaborators:", err);
                    }
                    setCollaboratorEmail('');
                    showToast('Collaborator added');
                  }
                }}
                className="px-4 py-2 rounded-lg bg-primary text-primary-foreground text-xs font-bold"
              >
                Add
              </button>
            </div>

            <div className="flex flex-col gap-2 max-h-48 overflow-y-auto">
              {collaboratorList.map(email => (
                <div key={email} className="flex items-center justify-between p-2.5 rounded-lg border border-border bg-background">
                  <span className="text-xs font-semibold">{email}</span>
                  <span className="text-[10px] px-2 py-0.5 rounded bg-accent/40 text-muted-foreground uppercase">Editor</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* CSV Import Wizard Modal */}
      {showCsvWizard && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="glass-card max-w-2xl w-full p-6 rounded-2xl animate-slide-up text-left">
            <div className="flex items-center justify-between border-b border-border/40 pb-3 mb-4">
              <h3 className="font-bold text-base text-glow-cyan">Import Bank Statement (CSV)</h3>
              <button onClick={() => setShowCsvWizard(false)}>
                <X className="h-5 w-5 text-muted-foreground" />
              </button>
            </div>

            {csvStep === 1 && (
              <div className="flex flex-col gap-4">
                <div>
                  <label className="text-xs text-muted-foreground font-semibold">1. Select CSV File</label>
                  <input
                    data-testid="csv-file-input"
                    type="file"
                    accept=".csv"
                    onChange={handleCsvFileUpload}
                    className="w-full mt-2 text-xs text-muted-foreground file:mr-4 file:py-2 file:px-4 file:rounded-lg file:border-0 file:text-xs file:font-semibold file:bg-primary/20 file:text-primary hover:file:bg-primary/30"
                  />
                </div>

                {csvRawHeaders.length > 0 && (
                  <div className="grid grid-cols-2 gap-3 p-4 rounded-xl bg-background border border-border mt-2">
                    <div>
                      <label className="text-xs text-muted-foreground">Date Column</label>
                      <select
                        data-testid="csv-map-col-date"
                        value={mapDateCol}
                        onChange={(e) => setMapDateCol(e.target.value)}
                        className="w-full px-2.5 py-1.5 rounded-lg border border-border bg-background mt-1 text-xs"
                      >
                        {csvRawHeaders.map(h => <option key={h} value={h}>{h}</option>)}
                      </select>
                    </div>

                    <div>
                      <label className="text-xs text-muted-foreground">Description Column</label>
                      <select
                        data-testid="csv-map-col-description"
                        value={mapDescCol}
                        onChange={(e) => setMapDescCol(e.target.value)}
                        className="w-full px-2.5 py-1.5 rounded-lg border border-border bg-background mt-1 text-xs"
                      >
                        {csvRawHeaders.map(h => <option key={h} value={h}>{h}</option>)}
                      </select>
                    </div>

                    <div>
                      <label className="text-xs text-muted-foreground">Amount Column</label>
                      <select
                        data-testid="csv-map-col-amount"
                        value={mapAmountCol}
                        onChange={(e) => setMapAmountCol(e.target.value)}
                        className="w-full px-2.5 py-1.5 rounded-lg border border-border bg-background mt-1 text-xs"
                      >
                        {csvRawHeaders.map(h => <option key={h} value={h}>{h}</option>)}
                      </select>
                    </div>

                    <div>
                      <label className="text-xs text-muted-foreground">Type Column (Optional)</label>
                      <select
                        data-testid="csv-map-col-type"
                        value={mapTypeCol}
                        onChange={(e) => setMapTypeCol(e.target.value)}
                        className="w-full px-2.5 py-1.5 rounded-lg border border-border bg-background mt-1 text-xs"
                      >
                        <option value="">None</option>
                        {csvRawHeaders.map(h => <option key={h} value={h}>{h}</option>)}
                      </select>
                    </div>
                  </div>
                )}

                {csvError && <p data-testid="csv-error" className="csv-mapping-error text-xs text-rose-400 mt-2">{csvError}</p>}

                <div className="flex justify-end gap-2 mt-4">
                  <button
                    onClick={() => setShowCsvWizard(false)}
                    className="px-4 py-2 rounded-lg border border-border text-xs font-semibold"
                  >
                    Cancel
                  </button>
                  <button
                    data-testid="csv-next-step-btn"
                    onClick={handleCsvNextStep}
                    disabled={csvRawHeaders.length === 0}
                    className="px-5 py-2 rounded-lg bg-primary text-primary-foreground text-xs font-bold shadow-glow-cyan disabled:opacity-50"
                  >
                    Next Preview
                  </button>
                </div>
              </div>
            )}

            {csvStep === 2 && (
              <div className="flex flex-col gap-4">
                <p className="text-xs text-muted-foreground">
                  Verify statement entries. Detected duplicates are highlighted and unselected by default.
                </p>

                <div className="max-h-64 overflow-y-auto custom-scrollbar border border-border rounded-xl">
                  <table data-testid="csv-preview-table" className="w-full text-left text-xs border-collapse">
                    <thead className="bg-accent/40 sticky top-0">
                      <tr>
                        <th className="p-2.5">Select</th>
                        <th className="p-2.5">Date</th>
                        <th className="p-2.5">Description</th>
                        <th className="p-2.5">Amount</th>
                        <th className="p-2.5">Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {parsedCsvItems.map((item, i) => (
                        <tr
                          key={i}
                          className={`border-b border-border/20 text-xs ${
                            item.isLockedMonth ? 'csv-locked-month-row bg-rose-500/10' : item.isDuplicate ? 'csv-duplicate-row bg-amber-500/10' : ''
                          }`}
                        >
                          <td className="p-2.5">
                            <input
                              type="checkbox"
                              checked={item.selected}
                              disabled={item.isLockedMonth}
                              onChange={(e) => {
                                setParsedCsvItems(prev => {
                                  const next = [...prev];
                                  next[i].selected = e.target.checked;
                                  return next;
                                });
                              }}
                            />
                          </td>
                          <td className="p-2.5">{item.date}</td>
                          <td className="p-2.5 font-semibold">{item.description}</td>
                          <td className="p-2.5 font-mono">${item.amount.toFixed(2)}</td>
                          <td className="p-2.5">
                            {item.isLockedMonth ? (
                              <span className="text-[10px] font-bold text-rose-400 py-0.5 px-2 rounded bg-rose-500/20 border border-rose-500/30">
                                Locked Month
                              </span>
                            ) : item.isDuplicate ? (
                              <span className="text-[10px] font-bold text-amber-400 py-0.5 px-2 rounded bg-amber-500/20 border border-amber-500/30">
                                Duplicate
                              </span>
                            ) : (
                              <span className="text-[10px] font-bold text-emerald-400 py-0.5 px-2 rounded bg-emerald-500/20 border border-emerald-500/30">
                                Ready
                              </span>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                <div className="flex justify-end gap-2 mt-4">
                  <button
                    onClick={() => setCsvStep(1)}
                    className="px-4 py-2 rounded-lg border border-border text-xs font-semibold"
                  >
                    Back
                  </button>
                  <button
                    data-testid="csv-import-btn"
                    onClick={handleCommitCsvImport}
                    disabled={parsedCsvItems.filter(i => i.selected).length === 0}
                    className="px-5 py-2 rounded-lg bg-primary text-primary-foreground text-xs font-bold shadow-glow-cyan disabled:opacity-50"
                  >
                    Import Selected ({parsedCsvItems.filter(i => i.selected).length})
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {showSessionExpiredModal && (
        <div data-testid="session-expired-modal" className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="glass-card max-w-sm w-full p-6 rounded-2xl animate-slide-up text-center">
            <h3 className="font-bold text-base text-rose-400 mb-2">Session Expired</h3>
            <p className="text-xs text-muted-foreground mb-4">Please log in again.</p>
            <button
              data-testid="modal-ok-btn"
              onClick={() => setShowSessionExpiredModal(false)}
              className="px-5 py-2 rounded-lg bg-primary text-primary-foreground text-xs font-bold"
            >
              OK
            </button>
          </div>
        </div>
      )}

      {showSpreadsheetNotFoundModal && (
        <div data-testid="spreadsheet-not-found-modal" className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="glass-card max-w-sm w-full p-6 rounded-2xl animate-slide-up text-center">
            <h3 className="font-bold text-base text-rose-400 mb-2">Spreadsheet Not Found</h3>
            <p className="text-xs text-muted-foreground mb-4">The spreadsheet file was deleted or unaccessible.</p>
            <button onClick={() => setShowSpreadsheetNotFoundModal(false)} className="px-5 py-2 rounded-lg bg-primary text-primary-foreground text-xs font-bold">OK</button>
          </div>
        </div>
      )}

      {showConflictModal && (
        <div data-testid="conflict-modal" className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="glass-card max-w-sm w-full p-6 rounded-2xl animate-slide-up text-center">
            <h3 className="font-bold text-base text-rose-400 mb-2">Conflict Detected</h3>
            <p className="text-xs text-muted-foreground mb-4">Remote changes differ from local copy.</p>
            <button onClick={() => setShowConflictModal(false)} className="px-5 py-2 rounded-lg bg-primary text-primary-foreground text-xs font-bold">Resolve</button>
          </div>
        </div>
      )}

      {showDuplicateWarningModal && pendingDuplicateTxn && (
        <div data-testid="duplicate-warning-modal" className="fixed inset-0 z-50 bg-black/70 backdrop-blur-md flex items-center justify-center p-4">
          <div className="glass-card max-w-md w-full p-6 rounded-2xl animate-slide-up border border-amber-500/40 text-left">
            <div className="flex items-center gap-3 text-amber-400 mb-3">
              <span className="h-10 w-10 rounded-full bg-amber-500/20 flex items-center justify-center text-xl font-bold">⚠️</span>
              <div>
                <h3 className="font-bold text-base text-foreground">Duplicate Transaction Detected</h3>
                <p className="text-xs text-muted-foreground">An identical transaction already exists in this project.</p>
              </div>
            </div>

            <div className="p-3.5 rounded-xl bg-accent/30 border border-border/60 my-4 text-xs space-y-1.5 font-mono">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Date:</span>
                <span className="font-semibold text-foreground">{pendingDuplicateTxn.date}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Description:</span>
                <span className="font-semibold text-foreground">{pendingDuplicateTxn.description}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Amount:</span>
                <span className={`font-bold ${pendingDuplicateTxn.type === 'income' ? 'text-emerald-400' : 'text-rose-400'}`}>
                  {pendingDuplicateTxn.type === 'income' ? '+' : '-'}${pendingDuplicateTxn.amount.toFixed(2)}
                </span>
              </div>
            </div>

            <p className="text-xs text-muted-foreground mb-5">
              Are you sure you want to proceed and save this entry anyway?
            </p>

            <div className="flex items-center justify-end gap-3">
              <button
                data-testid="duplicate-modal-cancel-btn"
                type="button"
                onClick={() => {
                  setShowDuplicateWarningModal(false);
                  setPendingDuplicateTxn(null);
                }}
                className="px-4 py-2 rounded-lg border border-border hover:bg-accent/40 text-xs font-semibold text-foreground transition-colors"
              >
                Cancel / Edit
              </button>
              <button
                data-testid="duplicate-modal-confirm-btn"
                type="button"
                onClick={() => executeSaveTransaction(pendingDuplicateTxn)}
                className="px-4 py-2 rounded-lg bg-amber-500 hover:bg-amber-600 text-slate-950 text-xs font-bold shadow-lg shadow-amber-500/20 transition-colors"
              >
                Yes, Save Duplicate
              </button>
            </div>
          </div>
        </div>
      )}

      {showCsvDuplicateWarningModal && (
        <div data-testid="csv-duplicate-warning-modal" className="fixed inset-0 z-50 bg-black/70 backdrop-blur-md flex items-center justify-center p-4">
          <div className="glass-card max-w-md w-full p-6 rounded-2xl animate-slide-up border border-amber-500/40 text-left">
            <div className="flex items-center gap-3 text-amber-400 mb-3">
              <span className="h-10 w-10 rounded-full bg-amber-500/20 flex items-center justify-center text-xl font-bold">⚠️</span>
              <div>
                <h3 className="font-bold text-base text-foreground">Duplicate CSV Transactions Detected</h3>
                <p className="text-xs text-muted-foreground">
                  {parsedCsvItems.filter(i => i.selected && i.isDuplicate).length} selected entry(s) match existing transactions or duplicates in this file.
                </p>
              </div>
            </div>

            <div className="max-h-40 overflow-y-auto custom-scrollbar my-4 p-3 rounded-xl bg-accent/30 border border-border/60 text-xs space-y-2 font-mono">
              {parsedCsvItems.filter(i => i.selected && i.isDuplicate).map((item, idx) => (
                <div key={idx} className="flex justify-between border-b border-border/40 pb-1 last:border-0 last:pb-0">
                  <span className="text-muted-foreground">{item.date}</span>
                  <span className="font-semibold text-foreground truncate max-w-[150px]">{item.description}</span>
                  <span className={item.type === 'income' ? 'text-emerald-400 font-bold' : 'text-rose-400 font-bold'}>
                    {item.type === 'income' ? '+' : '-'}${item.amount.toFixed(2)}
                  </span>
                </div>
              ))}
            </div>

            <p className="text-xs text-muted-foreground mb-5">
              Do you still want to proceed and import these duplicate entries into your project?
            </p>

            <div className="flex items-center justify-end gap-3">
              <button
                data-testid="csv-duplicate-modal-cancel-btn"
                type="button"
                onClick={() => setShowCsvDuplicateWarningModal(false)}
                className="px-4 py-2 rounded-lg border border-border hover:bg-accent/40 text-xs font-semibold text-foreground transition-colors"
              >
                Cancel / Review CSV
              </button>
              <button
                data-testid="csv-duplicate-modal-confirm-btn"
                type="button"
                onClick={() => executeCommitCsvImport()}
                className="px-4 py-2 rounded-lg bg-amber-500 hover:bg-amber-600 text-slate-950 text-xs font-bold shadow-lg shadow-amber-500/20 transition-colors"
              >
                Yes, Import Duplicates
              </button>
            </div>
          </div>
        </div>
      )}

      {showBulkDeleteConfirmModal && (
        <div data-testid="bulk-delete-modal" className="fixed inset-0 z-50 bg-black/70 backdrop-blur-md flex items-center justify-center p-4">
          <div className="glass-card max-w-md w-full p-6 rounded-2xl animate-slide-up border border-rose-500/40 text-left">
            <div className="flex items-center gap-3 text-rose-400 mb-3">
              <span className="h-10 w-10 rounded-full bg-rose-500/20 flex items-center justify-center text-xl font-bold">🗑️</span>
              <div>
                <h3 className="font-bold text-base text-foreground">Delete Selected Transactions</h3>
                <p className="text-xs text-muted-foreground">Are you sure you want to permanently delete these entries?</p>
              </div>
            </div>

            <p className="text-xs text-muted-foreground my-4 p-3.5 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-300">
              You are about to delete <strong className="font-bold text-rose-200">{selectedTxnIds.size}</strong> transaction{selectedTxnIds.size > 1 ? 's' : ''}. This operation cannot be undone.
            </p>

            <div className="flex items-center justify-end gap-3">
              <button
                data-testid="bulk-delete-cancel-btn"
                type="button"
                onClick={() => setShowBulkDeleteConfirmModal(false)}
                className="px-4 py-2 rounded-lg border border-border hover:bg-accent/40 text-xs font-semibold text-foreground transition-colors"
              >
                Cancel
              </button>
              <button
                data-testid="bulk-delete-confirm-btn"
                type="button"
                onClick={handleExecuteBulkDelete}
                className="px-4 py-2 rounded-lg bg-rose-500 hover:bg-rose-600 text-white text-xs font-bold shadow-lg shadow-rose-500/20 transition-colors flex items-center gap-1.5"
              >
                <Trash2 className="h-3.5 w-3.5" />
                Delete All Selected ({selectedTxnIds.size})
              </button>
            </div>
          </div>
        </div>
      )}

      {authErrorToast && (
        <div data-testid="notification-toast" className="notification-error fixed bottom-6 right-6 z-50 p-4 rounded-xl border border-rose-500/40 bg-rose-500/20 text-rose-300 text-sm">
          {authErrorToast}
        </div>
      )}

      {/* Footer */}
      <footer className="glass-panel mt-auto py-4 text-center border-t border-border/40 text-xs text-muted-foreground">
        &copy; {new Date().getFullYear()} Nebula Expense. All data stored locally in browser session.
      </footer>
    </div>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <AppProvider>
        <AppInner />
      </AppProvider>
    </AuthProvider>
  );
}
