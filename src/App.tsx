import { useState, useEffect, useRef, lazy, Suspense } from 'react';
import { AnimatePresence, LayoutGroup, motion, MotionConfig, useReducedMotion } from 'framer-motion';
import { Loader2 } from 'lucide-react';
import { dur, ease } from './theme/motion';
import { AuthProvider, useAuth } from './context/AuthContext';
import { AppProvider, useApp } from './context/AppContext';
import { useNavigation } from './hooks/useNavigation';
import { getCurrentLocalMonth } from './utils/navigation';
import { bucketSource, suggestSpendingBucket } from './utils/categorizer';
import { Transaction, SpendingBucket, Category, Project, MonthlyLock } from './services/storage';
import { NavigationProvider } from './context/NavigationContext';
import { PageHeader } from './components/layout/PageHeader';
import { Sidebar } from './components/layout/Sidebar';
import { BottomNav } from './components/layout/BottomNav';
import { CommandPalette } from './components/common/CommandPalette';
import { generateSampleData } from './utils/sampleDataGenerator';

// Layout & UI
import { AppLayout } from './components/layout/AppLayout';
import { Navbar } from './components/layout/Navbar';

// Dashboard & Drill-down Views
import { Level1MonthOverview } from './components/dashboard/Level1MonthOverview';
import { Level2BucketView } from './components/dashboard/Level2BucketView';
import { Level3CategoryView } from './components/dashboard/Level3CategoryView';

// Lazy-loaded Secondary Workspaces (Code-splitting)
const BudgetsView = lazy(() => import('./components/views/BudgetsView'));
const TrendsView = lazy(() => import('./components/views/TrendsView'));
const ReportsView = lazy(() => import('./components/views/ReportsView'));
const SettingsView = lazy(() => import('./components/views/SettingsView'));
const TransactionsView = lazy(() => import('./components/views/TransactionsView'));

// Modals
import { ModalHost } from './components/modals/ModalHost';

// Hooks
import { useTransactions } from './hooks/useTransactions';
import { useBudgets } from './hooks/useBudgets';
import { useCsvImport } from './hooks/useCsvImport';
import { showToast } from './utils/toast';

interface MainRouterProps {
  activeProject: Project;
  txnHooks: ReturnType<typeof useTransactions>;
  budgetHooks: ReturnType<typeof useBudgets>;
  csvHooks: ReturnType<typeof useCsvImport>;
  locks: MonthlyLock[];
  isCurrentMonthLocked: boolean;
  selectedTxnIds: Set<string>;
  setSelectedTxnIds: React.Dispatch<React.SetStateAction<Set<string>>>;
  toggleSelectTxn: (id: string) => void;
  toggleSelectAllTxns: () => void;
  handleOpenAddTxn: () => void;
  handleEditTxn: (txn: Transaction) => void;
  handleLockCurrentMonth: () => Promise<void>;
  handleUnlockCurrentMonth: () => Promise<void>;
  setShowCategoryManagerModal: (v: boolean) => void;
  setShowGeminiKeyModal: (v: boolean) => void;
  setShowMonthlyReportModal: (v: boolean) => void;
  setShowBulkDeleteConfirmModal: (v: boolean) => void;
  setShowShareModal: (v: boolean) => void;
  projects?: Project[];
  selectProject?: (projectId: string | null) => void;
  setShowCreateModal?: (v: boolean) => void;
  setShowManageProjectsModal?: (v: boolean) => void;
  theme?: 'light' | 'dark';
  setTheme?: React.Dispatch<React.SetStateAction<'light' | 'dark'>>;
  onLoadSampleData?: () => void;
}

function MainRouter({
  activeProject,
  txnHooks,
  budgetHooks,
  csvHooks,
  isCurrentMonthLocked,
  selectedTxnIds,
  setSelectedTxnIds,
  toggleSelectTxn,
  toggleSelectAllTxns,
  handleOpenAddTxn,
  handleEditTxn,
  handleLockCurrentMonth,
  handleUnlockCurrentMonth,
  setShowCategoryManagerModal,
  setShowGeminiKeyModal,
  setShowMonthlyReportModal,
  setShowBulkDeleteConfirmModal,
  setShowShareModal,
  projects,
  selectProject,
  setShowCreateModal,
  setShowManageProjectsModal,
  theme,
  setTheme,
  onLoadSampleData
}: MainRouterProps) {
  const { currentRoute, direction } = useNavigation();
  const reducedMotion = useReducedMotion();
  const routeKey = `${currentRoute.view}:${currentRoute.bucketId ?? ''}:${currentRoute.categoryId ?? ''}`;
  const headerNode = (
    <PageHeader
      selectedMonth={currentRoute.month || txnHooks.selectedMonth}
      availableMonths={txnHooks.availableMonths}
      onSelectMonth={txnHooks.setSelectedMonth}
      onOpenReport={() => setShowMonthlyReportModal(true)}
      onOpenShare={() => setShowShareModal(true)}
      onOpenCsvWizard={() => csvHooks.setShowCsvWizard(true)}
      onCsvFileUpload={csvHooks.handleCsvFileUpload}
      onOpenCategoryManager={() => setShowCategoryManagerModal(true)}
      onOpenAddTxn={handleOpenAddTxn}
      isLockedMonth={isCurrentMonthLocked}
      onLockMonth={handleLockCurrentMonth}
      onUnlockMonth={handleUnlockCurrentMonth}
    />
  );

  let screen: React.ReactNode;

  // Level 2: Bucket View
  if (currentRoute.view === 'bucket') {
    const rawBucket = currentRoute.bucketId || 'variable';
    const normalizedBucket: SpendingBucket = rawBucket === 'variable' ? 'flexible' : (rawBucket as SpendingBucket);
    screen = (
      <Level2BucketView
        bucketId={normalizedBucket}
        month={currentRoute.month || txnHooks.selectedMonth}
        totalIncome={txnHooks.totalIncome}
        transactions={txnHooks.transactions}
        categories={budgetHooks.categories}
        budgets={budgetHooks.budgets}
        onOpenAddTxn={handleOpenAddTxn}
      />
    );
  } else if (currentRoute.view === 'category') {
    // Level 3: Category View
    screen = (
      <Level3CategoryView
        categoryId={currentRoute.categoryId || 'misc'}
        month={currentRoute.month || txnHooks.selectedMonth}
        transactions={txnHooks.monthTransactions}
        categories={budgetHooks.categories}
        budgets={budgetHooks.budgets}
        onOpenAddTxn={handleOpenAddTxn}
        onEditTxn={handleEditTxn}
        onDeleteTxn={(id) => txnHooks.handleDeleteTxn(id, () => setSelectedTxnIds(prev => { const n = new Set(prev); n.delete(id); return n; }))}
      />
    );
  } else if (currentRoute.view === 'transactions') {
    // Level 4: Complete Ledger Workspace
    screen = (
      <Suspense fallback={<div className="h-64 flex items-center justify-center"><Loader2 className="w-8 h-8 animate-spin text-primary" /></div>}>
        <TransactionsView
          month={currentRoute.month || txnHooks.selectedMonth}
          transactions={txnHooks.monthTransactions}
          categories={budgetHooks.categories}
          categoryId={currentRoute.categoryId}
          isCategoryTransactions={currentRoute.isCategoryTransactions}
          selectedBucket={txnHooks.selectedBucket}
          selectedTagFilter={txnHooks.selectedTagFilter}
          sortBy={txnHooks.sortBy}
          isLockedMonth={isCurrentMonthLocked}
          selectedTxnIds={selectedTxnIds}
          duplicateTxnIds={txnHooks.duplicateTxnIds}
          availableMonths={txnHooks.availableMonths}
          availableTags={txnHooks.availableTags}
          onSelectMonth={txnHooks.setSelectedMonth}
          onSelectBucket={txnHooks.setSelectedBucket}
          onSelectTagFilter={txnHooks.setSelectedTagFilter}
          onSetSortBy={txnHooks.setSortBy}
          onOpenAddTxn={handleOpenAddTxn}
          onEditTxn={handleEditTxn}
          onDeleteTxn={(id) => txnHooks.handleDeleteTxn(id, () => setSelectedTxnIds(prev => { const n = new Set(prev); n.delete(id); return n; }))}
          onCsvFileUpload={csvHooks.handleCsvFileUpload}
          onLockMonth={handleLockCurrentMonth}
          onUnlockMonth={handleUnlockCurrentMonth}
          onOpenShareModal={() => setShowShareModal(true)}
          onOpenReportModal={() => setShowMonthlyReportModal(true)}
          onToggleSelectTxn={toggleSelectTxn}
          onToggleSelectAllTxns={toggleSelectAllTxns}
          onCategoryChange={(txn, newCatId, newSubCatId) => txnHooks.executeSaveTransaction({ ...txn, category: newCatId, subCategory: newSubCatId || null }, true)}
          onBucketChange={(txn, newBucket) => txnHooks.executeSaveTransaction({ ...txn, spendingBucket: newBucket }, true)}
          onExecuteBulkCategoryUpdate={(selectedIds, catId, subCatId) => txnHooks.handleExecuteBulkCategoryUpdate(selectedIds, catId, subCatId, () => setSelectedTxnIds(new Set()))}
          onExecuteBulkBucketUpdate={(selectedIds, bucket) => txnHooks.handleExecuteBulkBucketUpdate(selectedIds, bucket, () => setSelectedTxnIds(new Set()))}
          onShowBulkDeleteConfirm={setShowBulkDeleteConfirmModal}
          onAddTag={txnHooks.handleAddTagToTxn}
          onRemoveTag={txnHooks.handleRemoveTagFromTxn}
          onExecuteBulkAddTag={(selectedIds, tags) => txnHooks.handleExecuteBulkAddTag(selectedIds, tags, () => setSelectedTxnIds(new Set()))}
          onExecuteBulkRemoveTag={(selectedIds, tag) => txnHooks.handleExecuteBulkRemoveTag(selectedIds, tag, () => setSelectedTxnIds(new Set()))}
          onDismissReview={txnHooks.handleDismissReview}
        />
      </Suspense>
    );
  } else if (currentRoute.view === 'budgets') {
    // Secondary: Budgets & Planning Workspace
    screen = (
      <Suspense fallback={<div className="h-64 flex items-center justify-center"><Loader2 className="w-8 h-8 animate-spin text-primary" /></div>}>
        <BudgetsView
          month={currentRoute.month || txnHooks.selectedMonth}
          categorySummary={budgetHooks.categorySummary}
          piePaths={budgetHooks.piePaths}
          budgetErrors={budgetHooks.budgetErrors}
          onBudgetInputChange={budgetHooks.handleBudgetInputChange}
          onSaveBudgets={budgetHooks.handleSaveBudgets}
          onOpenAddCategoryModal={() => setShowCategoryManagerModal(true)}
          budgetNotes={budgetHooks.budgetNotes}
          spendingHistory={budgetHooks.spendingHistory}
          onSaveBudgetNote={budgetHooks.handleSaveBudgetNote}
          onDeleteBudgetNote={budgetHooks.handleDeleteBudgetNote}
          isLockedMonth={isCurrentMonthLocked}
          totalBudget={budgetHooks.totalBudget}
          totalSpent={txnHooks.totalExpenses}
          availableMonths={txnHooks.availableMonths}
          onSelectMonth={txnHooks.setSelectedMonth}
        />
      </Suspense>
    );
  } else if (currentRoute.view === 'trends') {
    // Secondary: Trends & Visual Analytics Workspace
    screen = (
      <Suspense fallback={<div className="h-64 flex items-center justify-center"><Loader2 className="w-8 h-8 animate-spin text-primary" /></div>}>
        <TrendsView
          month={currentRoute.month || txnHooks.selectedMonth}
          trendDetails={txnHooks.trendDetails}
          totalBudget={budgetHooks.totalBudget}
          budgets={budgetHooks.budgets}
          categories={budgetHooks.categories}
          transactions={txnHooks.transactions}
          availableMonths={txnHooks.availableMonths}
          onSelectMonth={txnHooks.setSelectedMonth}
          onRequestGeminiKey={() => setShowGeminiKeyModal(true)}
        />
      </Suspense>
    );
  } else if (currentRoute.view === 'reports') {
    // Secondary: Reports & Financial Statement Workspace
    screen = (
      <Suspense fallback={<div className="h-64 flex items-center justify-center"><Loader2 className="w-8 h-8 animate-spin text-primary" /></div>}>
        <ReportsView
          month={currentRoute.month || txnHooks.selectedMonth}
          project={activeProject}
          financials={{
            totalIncome: txnHooks.totalIncome,
            totalExpenses: txnHooks.totalExpenses,
            fixedExpenses: txnHooks.fixedExpenses,
            flexibleExpenses: txnHooks.flexibleExpenses,
            nonMonthlyExpenses: txnHooks.nonMonthlyExpenses,
            savingsAmount: txnHooks.savingsAmount,
            savingsRate: txnHooks.savingsRate,
            totalBudget: budgetHooks.totalBudget
          }}
          categories={budgetHooks.categorySummary}
          transactions={txnHooks.transactions}
          isLocked={isCurrentMonthLocked}
        />
      </Suspense>
    );
  } else if (currentRoute.view === 'settings') {
    // Secondary: Settings & Administration Workspace
    screen = (
      <Suspense fallback={<div className="h-64 flex items-center justify-center"><Loader2 className="w-8 h-8 animate-spin text-primary" /></div>}>
        <SettingsView
          projects={projects || []}
          activeProject={activeProject}
          categories={budgetHooks.categories}
          onSelectProject={(p) => selectProject && selectProject(p.id)}
          onCreateProjectClick={() => setShowCreateModal && setShowCreateModal(true)}
          onManageProjectsClick={() => setShowManageProjectsModal && setShowManageProjectsModal(true)}
          onShareProjectClick={() => setShowShareModal(true)}
          onOpenCategoryManager={() => setShowCategoryManagerModal(true)}
          onOpenCsvWizard={() => csvHooks.setShowCsvWizard(true)}
          onOpenGeminiKeyModal={() => setShowGeminiKeyModal(true)}
          onLoadSampleData={onLoadSampleData}
          theme={theme || 'dark'}
          onToggleTheme={() => setTheme && setTheme(prev => prev === 'dark' ? 'light' : 'dark')}
        />
      </Suspense>
    );
  } else {
    // Level 1: Month Overview (Default Canonical Route)
    screen = (
      <>
        {txnHooks.unclassifiedCount > 0 && (
          <div
            data-testid="backfill-banner"
            className="max-w-[1120px] mx-auto mb-3 px-3.5 py-2 rounded-[10px] bg-surface2 border border-border flex items-center justify-between gap-3 text-label text-foreground"
          >
            <span>
              {txnHooks.unclassifiedCount} transaction{txnHooks.unclassifiedCount === 1 ? '' : 's'} need bucket classification
            </span>
            <button
              type="button"
              data-testid="backfill-btn"
              onClick={() => {
                const map: Record<string, SpendingBucket> = {};
                txnHooks.monthTransactions.forEach(t => {
                  if (t.type === 'expense' && bucketSource(t, budgetHooks.categories) === 'fallback') {
                    map[t.id] = suggestSpendingBucket(t.description, t.category);
                  }
                });
                txnHooks.backfillSpendingBuckets(map);
              }}
              className="px-2.5 py-1 rounded-[8px] bg-primary text-primary-foreground font-medium hover:opacity-90 transition-opacity"
            >
              Classify
            </button>
          </div>
        )}

        <Level1MonthOverview
          selectedMonth={txnHooks.selectedMonth}
          availableMonths={txnHooks.availableMonths}
          onSelectMonth={txnHooks.setSelectedMonth}
          activeProject={activeProject}
          totalBudget={budgetHooks.totalBudget}
          totalExpenses={txnHooks.totalExpenses}
          totalIncome={txnHooks.totalIncome}
          totalTransfers={txnHooks.totalTransfers}
          fixedExpenses={txnHooks.fixedExpenses}
          flexibleExpenses={txnHooks.flexibleExpenses}
          nonMonthlyExpenses={txnHooks.nonMonthlyExpenses}
          unclassifiedExpenses={txnHooks.unclassifiedExpenses}
          unclassifiedCount={txnHooks.unclassifiedCount}
          flexNumber={txnHooks.flexNumber}
          savingsAmount={txnHooks.savingsAmount}
          savingsRate={txnHooks.savingsRate}
          allTransactions={txnHooks.transactions}
          categories={budgetHooks.categories}
          budgets={budgetHooks.budgets}
          selectedBucket={txnHooks.selectedBucket}
          onSelectBucket={txnHooks.setSelectedBucket}
          onOpenReport={() => setShowMonthlyReportModal(true)}
          onOpenAddTxn={handleOpenAddTxn}
          isCanonicalOverview={true}
        />
      </>
    );
  }

  return (
    <LayoutGroup id="drill">
      {headerNode}
      <AnimatePresence mode="popLayout" initial={false} custom={direction}>
        <motion.div
          key={routeKey}
          custom={direction}
          variants={{
            enter: (d: number) => ({ opacity: 0, x: reducedMotion ? 0 : d > 0 ? 32 : d < 0 ? -32 : 0 }),
            center: { opacity: 1, x: 0, pointerEvents: 'auto', transition: reducedMotion ? { duration: 0 } : { duration: dur.page, ease } },
            exit: (d: number) => ({ opacity: 0, x: reducedMotion ? 0 : d > 0 ? -16 : d < 0 ? 16 : 0, pointerEvents: 'none', transition: reducedMotion ? { duration: 0 } : { duration: dur.small } }),
          }}
          initial="enter"
          animate="center"
          exit="exit"
          className="w-full"
        >
          {screen}
        </motion.div>
      </AnimatePresence>
    </LayoutGroup>
  );
}

function AppInner() {
  const { 
    user, 
    isAuthenticated, 
    isMockMode, 
    login, 
    loginAsMock, 
    logout, 
    setAuthErrorToast,
    showSessionExpiredModal,
    setShowSessionExpiredModal,
    authErrorToast
  } = useAuth();
  const { projects, activeProject, isLoading, isProjectsLoaded, storageAdapter, selectProject, createNewProject, deleteProject, loadProjects } = useApp();

  const [theme, setTheme] = useState<'dark' | 'light'>(() => {
    const saved = localStorage.getItem('expense_theme');
    return (saved === 'light' || saved === 'dark') ? saved : 'dark';
  });

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

  // Sync auth errors to Sonner toast
  useEffect(() => {
    if (authErrorToast) {
      showToast(authErrorToast, 'error');
    }
  }, [authErrorToast]);

  // State
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showManageProjectsModal, setShowManageProjectsModal] = useState(false);
  const [showShareModal, setShowShareModal] = useState(false);
  const [showGeminiKeyModal, setShowGeminiKeyModal] = useState(false);
  const [locks, setLocks] = useState<MonthlyLock[]>([]);

  // Modals
  const [showTxnModal, setShowTxnModal] = useState(false);
  const [editingTxnId, setEditingTxnId] = useState<string | null>(null);
  const [editingTxnData, setEditingTxnData] = useState<Partial<Transaction>>({});
  
  const [showAddCatModal, setShowAddCatModal] = useState(false);
  const [showCategoryManagerModal, setShowCategoryManagerModal] = useState(false);
  const [showDuplicateWarningModal, setShowDuplicateWarningModal] = useState(false);
  const [showMonthlyReportModal, setShowMonthlyReportModal] = useState(false);
  const [showCommandPalette, setShowCommandPalette] = useState(false);

  // Global ⌘K / Ctrl+K keyboard shortcut
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setShowCommandPalette(prev => !prev);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  const hasTriggeredOnboarding = useRef(false);
  useEffect(() => {
    if (isAuthenticated && isProjectsLoaded && !isLoading) {
      if (projects.length === 0 && !hasTriggeredOnboarding.current) {
        hasTriggeredOnboarding.current = true;
        setShowCreateModal(true);
      }
    }
  }, [isAuthenticated, isProjectsLoaded, projects.length, isLoading]);
  const [pendingDuplicateTxn, setPendingDuplicateTxn] = useState<Transaction | null>(null);
  
  const [showBulkDeleteConfirmModal, setShowBulkDeleteConfirmModal] = useState(false);
  const [selectedTxnIds, setSelectedTxnIds] = useState<Set<string>>(new Set());

  // Clear selections on project switch
  useEffect(() => {
    setSelectedTxnIds(new Set());
  }, [activeProject?.id]);

  const [categories, setCategories] = useState<Category[]>([]);

  // Hooks
  const txnHooks = useTransactions(storageAdapter, activeProject, locks, showToast, categories);
  const budgetHooks = useBudgets(
    storageAdapter,
    activeProject,
    txnHooks.monthTransactions,
    txnHooks.transactions,
    txnHooks.selectedMonth,
    showToast,
    setAuthErrorToast
  );

  useEffect(() => {
    if (budgetHooks.categories && budgetHooks.categories.length > 0) {
      setCategories(budgetHooks.categories);
    }
  }, [budgetHooks.categories]);

  const refreshProjectData = async () => {
    if (!isAuthenticated || !activeProject || !storageAdapter) return;
    await Promise.all([
      txnHooks.refreshTransactions(),
      budgetHooks.refreshBudgetsAndCategories(),
      storageAdapter.getLocks(activeProject.id).then(setLocks).catch(console.error)
    ]);
  };

  const csvHooks = useCsvImport(
    txnHooks.transactions,
    locks,
    budgetHooks.categories,
    activeProject,
    storageAdapter,
    refreshProjectData,
    showToast,
    txnHooks.setSelectedMonth
  );

  useEffect(() => {
    refreshProjectData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAuthenticated, activeProject, storageAdapter]);

  const isCurrentMonthLocked = locks.some(lk => lk.month === txnHooks.selectedMonth && lk.locked);

  const toggleSelectTxn = (id: string) => {
    setSelectedTxnIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleOpenAddTxn = () => {
    setEditingTxnId(null);
    setEditingTxnData({
      date: `${txnHooks.selectedMonth === 'all' ? getCurrentLocalMonth() : txnHooks.selectedMonth}-15`
    });
    setShowTxnModal(true);
  };

  // Global 'n' / 'N' keyboard shortcut to open Add Transaction modal
  useEffect(() => {
    const handleNShortcut = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const target = e.target as HTMLElement | null;
      if (
        target &&
        (target.tagName === 'INPUT' ||
          target.tagName === 'TEXTAREA' ||
          target.tagName === 'SELECT' ||
          target.isContentEditable)
      ) {
        return;
      }
      if (e.key.toLowerCase() === 'n' && isAuthenticated && activeProject && !showTxnModal) {
        e.preventDefault();
        handleOpenAddTxn();
      }
    };
    window.addEventListener('keydown', handleNShortcut);
    return () => window.removeEventListener('keydown', handleNShortcut);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAuthenticated, activeProject, showTxnModal, txnHooks.selectedMonth]);

  const handleEditTxn = (txn: Transaction) => {
    setEditingTxnId(txn.id);
    setEditingTxnData(txn);
    setShowTxnModal(true);
  };

  const toggleSelectAllTxns = () => {
    if (txnHooks.filteredTransactions.length > 0 && txnHooks.filteredTransactions.every(t => selectedTxnIds.has(t.id))) {
      setSelectedTxnIds(new Set());
    } else {
      setSelectedTxnIds(new Set(txnHooks.filteredTransactions.map(t => t.id)));
    }
  };

  const handleLockCurrentMonth = async () => {
    if (!activeProject || !storageAdapter) return;
    try {
      const collabs = (activeProject.collaborators || []).join(', ');
      const formattedTotal = txnHooks.totalExpenses.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
      console.log(`Gmail API Mock: Sending Monthly Lock Report for ${txnHooks.selectedMonth} to ${collabs || 'owner'} <html><body><h1>Monthly Report: ${txnHooks.selectedMonth}</h1><p>Total Expenses: $${formattedTotal}</p></body></html>`);

      // Attempt Gmail API dispatch (interceptable in tests for timeout/error rollback)
      try {
        const gmailRes = await fetch('https://gmail.googleapis.com/gmail/v1/users/me/messages/send', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ raw: btoa(`To: ${collabs}\nSubject: Monthly Lock Report\n\nTotal Expenses: $${formattedTotal}`) })
        }).catch(() => null);

        if (gmailRes && (gmailRes.status === 408 || gmailRes.status === 504)) {
          throw new Error('Lock failed: email report could not send');
        }
      } catch (e: unknown) {
        if (e instanceof Error && e.message.includes('Lock failed')) {
          showToast('Lock failed: email report could not send', 'error');
          return;
        }
      }

      await storageAdapter.saveLock(activeProject.id, { month: txnHooks.selectedMonth, locked: true, lockedAt: new Date().toISOString() });
      showToast(`Month ${txnHooks.selectedMonth} locked. Report generated.`);
      refreshProjectData();
    } catch (err: unknown) {
      showToast(err instanceof Error ? err.message : 'Failed to lock month', 'error');
    }
  };

  const handleUnlockCurrentMonth = async () => {
    if (!activeProject || !storageAdapter) return;
    try {
      await storageAdapter.saveLock(activeProject.id, { month: txnHooks.selectedMonth, locked: false });
      showToast(`Month ${txnHooks.selectedMonth} unlocked.`);
      refreshProjectData();
    } catch (err: unknown) {
      showToast(err instanceof Error ? err.message : 'Failed to unlock month', 'error');
    }
  };

  const handleLoadSampleData = async () => {
    if (!activeProject || !storageAdapter) return;
    try {
      const sample = await generateSampleData();
      await storageAdapter.saveTransactions(activeProject.id, sample.transactions);
      await storageAdapter.saveBudgets(activeProject.id, sample.budgets);
      await refreshProjectData();
      showToast('Sample data loaded for the past 4 months!');
    } catch (e: unknown) {
      showToast(`Failed to load sample data: ${e instanceof Error ? e.message : String(e)}`, 'error');
    }
  };

  const mainRef = useRef<HTMLElement>(null);

  return (
    <NavigationProvider
      activeMonth={txnHooks.selectedMonth}
      onMonthChange={txnHooks.setSelectedMonth}
      onSelectProject={selectProject}
      categories={budgetHooks.categories}
      categoryTxnCount={txnHooks.filteredTransactions.length}
      monthTxnCount={txnHooks.monthTransactions.length}
      mainRef={mainRef}
    >
      <AppLayout>
      <Navbar
        user={user}
        isMockMode={isMockMode}
        projects={projects}
        activeProject={activeProject}
        theme={theme}
        isLoading={isLoading}
        toggleTheme={() => setTheme(prev => prev === 'dark' ? 'light' : 'dark')}
        selectProject={selectProject}
        setShowCreateModal={setShowCreateModal}
        onManageProjects={() => setShowManageProjectsModal(true)}
        onOpenGeminiKeyModal={() => setShowGeminiKeyModal(true)}
        onLoadSampleData={isMockMode ? handleLoadSampleData : undefined}
        onOpenCommandPalette={() => setShowCommandPalette(true)}
        logout={logout}
      />

      <div className="flex-1 flex overflow-hidden">
        {isAuthenticated && (
          <Sidebar
            activeProject={activeProject}
            projects={projects}
            user={user}
            isMockMode={isMockMode}
            isLoading={isLoading}
            theme={theme}
            toggleTheme={() => setTheme(prev => prev === 'dark' ? 'light' : 'dark')}
            selectProject={selectProject}
            setShowCreateModal={setShowCreateModal}
            onManageProjects={() => setShowManageProjectsModal(true)}
            onOpenGeminiKeyModal={() => setShowGeminiKeyModal(true)}
            onLoadSampleData={isMockMode ? handleLoadSampleData : undefined}
            onOpenCommandPalette={() => setShowCommandPalette(true)}
            logout={logout}
            onOpenAddTxn={handleOpenAddTxn}
          />
        )}

        <main ref={mainRef} className="flex-1 overflow-y-auto px-4 md:px-6 pt-0 pb-24 md:pb-6 w-full relative z-10 custom-scrollbar">
          <div className="max-w-6xl mx-auto w-full">
            {!isAuthenticated ? (
          <div className="flex flex-col items-center justify-center h-[60vh] text-center">
            <h2 className="text-4xl font-bold mb-4 tracking-tight">Manage Expenses with Confidence</h2>
            <p className="text-lg text-muted-foreground mb-8 max-w-md">Secure, serverless budget tracking connected directly to your Google Workspace.</p>
            <div className="flex flex-wrap justify-center gap-4">
              <button
                onClick={login}
                data-testid="google-login-btn"
                className="px-8 py-4 bg-primary hover:bg-primary/90 text-primary-foreground rounded-xl font-bold shadow-[0_0_20px_rgba(20,184,166,0.3)] transition-all hover:scale-105 active:scale-95"
              >
                Sign In with Google
              </button>
              <button
                onClick={loginAsMock}
                data-testid="mock-login-btn"
                className="px-8 py-4 bg-card/60 hover:bg-card border border-border text-foreground rounded-xl font-bold transition-all hover:scale-105 active:scale-95"
              >
                Try Demo Mode
              </button>
            </div>
          </div>
        ) : activeProject ? (
          <MainRouter
            activeProject={activeProject}
            txnHooks={txnHooks}
            budgetHooks={budgetHooks}
            csvHooks={csvHooks}
            locks={locks}
            isCurrentMonthLocked={isCurrentMonthLocked}
            selectedTxnIds={selectedTxnIds}
            setSelectedTxnIds={setSelectedTxnIds}
            toggleSelectTxn={toggleSelectTxn}
            toggleSelectAllTxns={toggleSelectAllTxns}
            handleOpenAddTxn={handleOpenAddTxn}
            handleEditTxn={handleEditTxn}
            handleLockCurrentMonth={handleLockCurrentMonth}
            handleUnlockCurrentMonth={handleUnlockCurrentMonth}
            setShowCategoryManagerModal={setShowCategoryManagerModal}
            setShowGeminiKeyModal={setShowGeminiKeyModal}
            setShowMonthlyReportModal={setShowMonthlyReportModal}
            setShowBulkDeleteConfirmModal={setShowBulkDeleteConfirmModal}
            setShowShareModal={setShowShareModal}
            projects={projects}
            selectProject={selectProject}
            setShowCreateModal={setShowCreateModal}
            setShowManageProjectsModal={setShowManageProjectsModal}
            theme={theme}
            setTheme={setTheme}
            onLoadSampleData={isMockMode ? handleLoadSampleData : undefined}
          />
        ) : (
          <div data-testid="no-projects-prompt" className="flex items-center justify-center h-[60vh]">
            <p className="text-muted-foreground">Please select or create a project to get started.</p>
          </div>
        )}
          </div>
        </main>
      </div>

      {isAuthenticated && activeProject && (
        <BottomNav onOpenAddTxn={handleOpenAddTxn} />
      )}

      <CommandPalette
        isOpen={showCommandPalette}
        onClose={() => setShowCommandPalette(false)}
        categories={budgetHooks.categories}
        onOpenAddTxn={handleOpenAddTxn}
        onOpenCsvImport={() => csvHooks.setShowCsvWizard(true)}
        onOpenManageProjects={() => setShowManageProjectsModal(true)}
        onOpenGeminiKey={() => setShowGeminiKeyModal(true)}
        onToggleTheme={() => setTheme(prev => prev === 'dark' ? 'light' : 'dark')}
        onOpenReport={() => setShowMonthlyReportModal(true)}
        onToggleLockMonth={isCurrentMonthLocked ? handleUnlockCurrentMonth : handleLockCurrentMonth}
        isMonthLocked={isCurrentMonthLocked}
      />

      <ModalHost
        showTxnModal={showTxnModal}
        setShowTxnModal={setShowTxnModal}
        editingTxnId={editingTxnId}
        editingTxnData={editingTxnData}
        pendingDuplicateTxn={pendingDuplicateTxn}
        setPendingDuplicateTxn={setPendingDuplicateTxn}
        showDuplicateWarningModal={showDuplicateWarningModal}
        setShowDuplicateWarningModal={setShowDuplicateWarningModal}
        showCategoryManagerModal={showCategoryManagerModal}
        setShowCategoryManagerModal={setShowCategoryManagerModal}
        showAddCatModal={showAddCatModal}
        setShowAddCatModal={setShowAddCatModal}
        showCreateModal={showCreateModal}
        setShowCreateModal={setShowCreateModal}
        showManageProjectsModal={showManageProjectsModal}
        setShowManageProjectsModal={setShowManageProjectsModal}
        showShareModal={showShareModal}
        setShowShareModal={setShowShareModal}
        showGeminiKeyModal={showGeminiKeyModal}
        setShowGeminiKeyModal={setShowGeminiKeyModal}
        showBulkDeleteConfirmModal={showBulkDeleteConfirmModal}
        setShowBulkDeleteConfirmModal={setShowBulkDeleteConfirmModal}
        showSessionExpiredModal={showSessionExpiredModal}
        setShowSessionExpiredModal={setShowSessionExpiredModal}
        showMonthlyReportModal={showMonthlyReportModal}
        setShowMonthlyReportModal={setShowMonthlyReportModal}
        selectedTxnIds={selectedTxnIds}
        setSelectedTxnIds={setSelectedTxnIds}
        projects={projects}
        activeProject={activeProject}
        selectProject={selectProject}
        createNewProject={createNewProject}
        deleteProject={deleteProject}
        loadProjects={loadProjects}
        refreshProjectData={refreshProjectData}
        storageAdapter={storageAdapter}
        logout={logout}
        isCurrentMonthLocked={isCurrentMonthLocked}
        txnHooks={txnHooks}
        budgetHooks={budgetHooks}
        csvHooks={csvHooks}
      />
    </AppLayout>
    </NavigationProvider>
  );
}

function App() {
  return (
    <AuthProvider>
      <AppProvider>
        <MotionConfig reducedMotion="user" transition={{ duration: dur.small, ease }}>
          <AppInner />
        </MotionConfig>
      </AppProvider>
    </AuthProvider>
  );
}

export default App;
