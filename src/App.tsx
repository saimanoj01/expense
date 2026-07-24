import { useState, useEffect } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { AuthProvider, useAuth } from './context/AuthContext';
import { AppProvider, useApp } from './context/AppContext';
import { useHashRouting } from './hooks/useHashRouting';
import { Transaction } from './services/storage';

// Layout & UI
import { AppLayout } from './components/layout/AppLayout';
import { Navbar } from './components/layout/Navbar';

// Dashboard
import { KpiGrid } from './components/dashboard/KpiGrid';
import { TrendChart } from './components/dashboard/TrendChart';
import { BudgetUtilization } from './components/dashboard/BudgetUtilization';

// Transactions
import { TransactionToolbar } from './components/transactions/TransactionToolbar';
import { TransactionList } from './components/transactions/TransactionList';

// Modals
import { TransactionModal } from './components/modals/TransactionModal';
import { CategoryModal } from './components/modals/CategoryModal';
import { CategoryManagerModal } from './components/modals/CategoryManagerModal';
import { CsvImportWizard } from './components/modals/CsvImportWizard';
import { DuplicateWarningModal, CsvDuplicateWarningModal } from './components/modals/DuplicateWarningModals';
import { CreateProjectModal } from './components/modals/CreateProjectModal';
import { ShareProjectModal } from './components/modals/ShareProjectModal';
import { GeminiKeyModal } from './components/modals/GeminiKeyModal';

// Hooks
import { useTransactions } from './hooks/useTransactions';
import { useBudgets } from './hooks/useBudgets';
import { useCsvImport } from './hooks/useCsvImport';

function AppInner() {
  const { user, isAuthenticated, isMockMode, login, loginAsMock, logout, setAuthErrorToast } = useAuth();
  const { projects, activeProject, isLoading, storageAdapter, selectProject, createNewProject } = useApp();

  useHashRouting();

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

  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 3500);
  };

  // State
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showShareModal, setShowShareModal] = useState(false);
  const [showGeminiKeyModal, setShowGeminiKeyModal] = useState(false);
  const [locks, setLocks] = useState<any[]>([]);

  // Modals
  const [showTxnModal, setShowTxnModal] = useState(false);
  const [editingTxnId, setEditingTxnId] = useState<string | null>(null);
  const [editingTxnData, setEditingTxnData] = useState<Partial<Transaction>>({});
  
  const [showAddCatModal, setShowAddCatModal] = useState(false);
  const [showCategoryManagerModal, setShowCategoryManagerModal] = useState(false);
  const [showDuplicateWarningModal, setShowDuplicateWarningModal] = useState(false);
  const [pendingDuplicateTxn, setPendingDuplicateTxn] = useState<Transaction | null>(null);
  
  const [showBulkDeleteConfirmModal, setShowBulkDeleteConfirmModal] = useState(false);
  const [selectedTxnIds, setSelectedTxnIds] = useState<Set<string>>(new Set());

  // Clear selections on project switch
  useEffect(() => {
    setSelectedTxnIds(new Set());
  }, [activeProject?.id]);

  // Hooks
  const txnHooks = useTransactions(storageAdapter, activeProject, locks, showToast);
  const budgetHooks = useBudgets(storageAdapter, activeProject, txnHooks.filteredTransactions, showToast, setAuthErrorToast);

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
      date: `${txnHooks.selectedMonth === 'all' ? new Date().toISOString().substring(0,7) : txnHooks.selectedMonth}-15`
    });
    setShowTxnModal(true);
  };

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

      await storageAdapter.saveLock(activeProject.id, { month: txnHooks.selectedMonth, locked: true, lockedAt: new Date().toISOString() });
      showToast(`Month ${txnHooks.selectedMonth} locked. Report generated.`);
      refreshProjectData();
    } catch (err: any) {
      alert(err.message || 'Failed to lock month');
    }
  };

  const handleUnlockCurrentMonth = async () => {
    if (!activeProject || !storageAdapter) return;
    try {
      await storageAdapter.saveLock(activeProject.id, { month: txnHooks.selectedMonth, locked: false });
      showToast(`Month ${txnHooks.selectedMonth} unlocked.`);
      refreshProjectData();
    } catch (err: any) {
      alert(err.message || 'Failed to unlock month');
    }
  };

  return (
    <AppLayout toastMessage={toastMessage}>
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
        onOpenGeminiKeyModal={() => setShowGeminiKeyModal(true)}
        logout={logout}
      />

      <main className="max-w-6xl mx-auto px-4 py-8 w-full flex-1 relative z-10">
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
          <>
            <KpiGrid
              totalBudget={budgetHooks.totalBudget}
              totalExpenses={txnHooks.totalExpenses}
              totalIncome={txnHooks.totalIncome}
              totalTransfers={txnHooks.totalTransfers}
              budgetRemaining={budgetHooks.totalBudget - txnHooks.totalExpenses}
            />

            <div className="flex flex-col lg:flex-row gap-6 mb-8">
              <TrendChart
                trendDetails={txnHooks.trendDetails}
                totalBudget={budgetHooks.totalBudget}
                budgets={budgetHooks.budgets}
                categories={budgetHooks.categories}
                transactions={txnHooks.transactions}
                selectedMonth={txnHooks.selectedMonth}
                onSelectMonth={txnHooks.setSelectedMonth}
                onRequestGeminiKey={() => setShowGeminiKeyModal(true)}
              />
              <BudgetUtilization
                categorySummary={budgetHooks.categorySummary}
                piePaths={budgetHooks.piePaths}
                budgetErrors={budgetHooks.budgetErrors}
                handleBudgetInputChange={budgetHooks.handleBudgetInputChange}
                handleSaveBudgets={budgetHooks.handleSaveBudgets}
                setShowAddCatModal={() => setShowCategoryManagerModal(true)}
              />
            </div>

            <TransactionToolbar
              selectedMonth={txnHooks.selectedMonth}
              availableMonths={txnHooks.availableMonths}
              availableTags={txnHooks.availableTags}
              selectedTagFilter={txnHooks.selectedTagFilter}
              sortBy={txnHooks.sortBy}
              isCurrentMonthLocked={isCurrentMonthLocked}
              setSelectedMonth={txnHooks.setSelectedMonth}
              setSelectedTagFilter={txnHooks.setSelectedTagFilter}
              setSortBy={txnHooks.setSortBy}
              handleOpenAddTxn={handleOpenAddTxn}
              handleCsvFileUpload={csvHooks.handleCsvFileUpload}
              setShowShareModal={setShowShareModal}
              handleLockCurrentMonth={handleLockCurrentMonth}
              handleUnlockCurrentMonth={handleUnlockCurrentMonth}
            />

            <TransactionList
              transactions={txnHooks.filteredTransactions}
              categories={budgetHooks.categories}
              selectedTagFilter={txnHooks.selectedTagFilter}
              duplicateTxnIds={txnHooks.duplicateTxnIds}
              isLockedMonth={isCurrentMonthLocked}
              selectedTxnIds={selectedTxnIds}
              setSelectedTagFilter={txnHooks.setSelectedTagFilter}
              toggleSelectTxn={toggleSelectTxn}
              toggleSelectAllTxns={toggleSelectAllTxns}
              handleEditTxn={handleEditTxn}
              handleDeleteTxn={id => txnHooks.handleDeleteTxn(id, () => setSelectedTxnIds(prev => { const n = new Set(prev); n.delete(id); return n; }))}
              handleCategoryChange={(txn, newCatId, newSubCatId) => txnHooks.executeSaveTransaction({ ...txn, category: newCatId, subCategory: newSubCatId || null }, true)}
              handleExecuteBulkCategoryUpdate={(selectedIds, catId, subCatId) => txnHooks.handleExecuteBulkCategoryUpdate(selectedIds, catId, subCatId, () => setSelectedTxnIds(new Set()))}
              setShowBulkDeleteConfirmModal={setShowBulkDeleteConfirmModal}
            />
          </>
        ) : (
          <div className="flex items-center justify-center h-[60vh]">
            <p className="text-muted-foreground">Please select or create a project to get started.</p>
          </div>
        )}
      </main>

      {/* Modals Wrapped in AnimatePresence for Smooth Exit Transitions */}
      <AnimatePresence>
        {showTxnModal && (
          <TransactionModal
            showTxnModal={showTxnModal}
            setShowTxnModal={setShowTxnModal}
            categories={budgetHooks.categories}
            editingTxnId={editingTxnId}
            initialData={editingTxnData}
            transactions={txnHooks.transactions}
            executeSaveTransaction={txnHooks.executeSaveTransaction}
            setPendingDuplicateTxn={setPendingDuplicateTxn}
            setShowDuplicateWarningModal={setShowDuplicateWarningModal}
            setShowCategoryManagerModal={setShowCategoryManagerModal}
          />
        )}
      </AnimatePresence>

      <AnimatePresence>
        {showCategoryManagerModal && (
          <CategoryManagerModal
            showModal={showCategoryManagerModal}
            setShowModal={setShowCategoryManagerModal}
            categories={budgetHooks.categories}
            transactions={txnHooks.transactions}
            handleSaveCategory={budgetHooks.handleSaveCategory}
            handleDeleteCategory={budgetHooks.handleDeleteCategory}
            handleExecuteBulkCategoryUpdate={txnHooks.handleExecuteBulkCategoryUpdate}
          />
        )}
      </AnimatePresence>

      <AnimatePresence>
        {showAddCatModal && (
          <CategoryModal
            showModal={showAddCatModal}
            setShowModal={setShowAddCatModal}
            handleSaveCategory={budgetHooks.handleSaveCategory}
            categories={budgetHooks.categories}
          />
        )}
      </AnimatePresence>

      <AnimatePresence>
        {showCreateModal && (
          <CreateProjectModal
            showModal={showCreateModal}
            onClose={() => setShowCreateModal(false)}
            onCreate={async (name) => {
              await createNewProject(name);
              showToast('Project created successfully');
            }}
          />
        )}
      </AnimatePresence>

      <AnimatePresence>
        {showShareModal && activeProject && (
          <ShareProjectModal
            showModal={showShareModal}
            onClose={() => setShowShareModal(false)}
            collaborators={activeProject.collaborators || []}
            onAddCollaborator={async (email) => {
              const updatedCollabs = Array.from(new Set([...(activeProject.collaborators || []), email]));
              await storageAdapter?.saveProject({ ...activeProject, collaborators: updatedCollabs });
              showToast('Collaborator added');
              refreshProjectData();
            }}
          />
        )}
      </AnimatePresence>

      <AnimatePresence>
        {csvHooks.showCsvWizard && (
          <CsvImportWizard
            {...csvHooks}
            categories={budgetHooks.categories}
            setShowCategoryManagerModal={setShowCategoryManagerModal}
            onRequestGeminiKey={() => setShowGeminiKeyModal(true)}
          />
        )}
      </AnimatePresence>

      <AnimatePresence>
        {showGeminiKeyModal && (
          <GeminiKeyModal
            showModal={showGeminiKeyModal}
            onClose={() => setShowGeminiKeyModal(false)}
          />
        )}
      </AnimatePresence>
      
      <AnimatePresence>
        {showDuplicateWarningModal && (
          <DuplicateWarningModal
            showModal={showDuplicateWarningModal}
            pendingTxn={pendingDuplicateTxn}
            onCancel={() => setShowDuplicateWarningModal(false)}
            onProceed={async () => {
              if (pendingDuplicateTxn) {
                await txnHooks.executeSaveTransaction(pendingDuplicateTxn, !!editingTxnId);
                setShowTxnModal(false);
                setShowDuplicateWarningModal(false);
              }
            }}
          />
        )}
      </AnimatePresence>
      
      <AnimatePresence>
        {csvHooks.showCsvDuplicateWarningModal && (
          <CsvDuplicateWarningModal
            showModal={csvHooks.showCsvDuplicateWarningModal}
            onCancel={() => csvHooks.setShowCsvDuplicateWarningModal(false)}
            onProceed={csvHooks.executeCommitCsvImport}
          />
        )}
      </AnimatePresence>

      <AnimatePresence>
        {showBulkDeleteConfirmModal && (
          <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-background/80 backdrop-blur-sm">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="glass-panel w-full max-w-sm rounded-2xl p-6 shadow-2xl border border-destructive/30 text-center"
            >
              <h2 className="text-xl font-bold text-destructive mb-2">Delete {selectedTxnIds.size} records?</h2>
              <p className="text-muted-foreground mb-6 text-sm">This action cannot be undone.</p>
              <div className="flex gap-3">
                <button onClick={() => setShowBulkDeleteConfirmModal(false)} className="flex-1 px-4 py-2 bg-card border border-border rounded-xl font-bold">Cancel</button>
                <button onClick={() => {
                  txnHooks.handleExecuteBulkDelete(selectedTxnIds, () => {
                    setSelectedTxnIds(new Set());
                    setShowBulkDeleteConfirmModal(false);
                  });
                }} className="flex-1 px-4 py-2 bg-destructive text-destructive-foreground rounded-xl font-bold shadow-lg shadow-destructive/20">Delete</button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </AppLayout>
  );
}

function App() {
  return (
    <AuthProvider>
      <AppProvider>
        <AppInner />
      </AppProvider>
    </AuthProvider>
  );
}

export default App;
