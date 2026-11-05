import React from 'react';
import { AnimatePresence } from 'framer-motion';
import { Transaction, Project, StorageAdapter } from '../../services/storage';
import { useTransactions } from '../../hooks/useTransactions';
import { useBudgets } from '../../hooks/useBudgets';
import { useCsvImport } from '../../hooks/useCsvImport';
import { showToast } from '../../utils/toast';
import { Modal } from '../common/Modal';
import { TransactionModal } from './TransactionModal';
import { CategoryModal } from './CategoryModal';
import { CategoryManagerModal } from './CategoryManagerModal';
import { CsvImportWizard } from './CsvImportWizard';
import { DuplicateWarningModal, CsvDuplicateWarningModal } from './DuplicateWarningModals';
import { CreateProjectModal } from './CreateProjectModal';
import { ManageProjectsModal } from './ManageProjectsModal';
import { ShareProjectModal } from './ShareProjectModal';
import { GeminiKeyModal } from './GeminiKeyModal';
import { MonthlyReportModal } from './MonthlyReportModal';

export interface ModalHostProps {
  showTxnModal: boolean;
  setShowTxnModal: (v: boolean) => void;
  editingTxnId: string | null;
  editingTxnData?: Partial<Transaction>;
  pendingDuplicateTxn: Transaction | null;
  setPendingDuplicateTxn: (t: Transaction | null) => void;
  showDuplicateWarningModal: boolean;
  setShowDuplicateWarningModal: (v: boolean) => void;
  showCategoryManagerModal: boolean;
  setShowCategoryManagerModal: (v: boolean) => void;
  showAddCatModal: boolean;
  setShowAddCatModal: (v: boolean) => void;
  showCreateModal: boolean;
  setShowCreateModal: (v: boolean) => void;
  showManageProjectsModal: boolean;
  setShowManageProjectsModal: (v: boolean) => void;
  showShareModal: boolean;
  setShowShareModal: (v: boolean) => void;
  showGeminiKeyModal: boolean;
  setShowGeminiKeyModal: (v: boolean) => void;
  showBulkDeleteConfirmModal: boolean;
  setShowBulkDeleteConfirmModal: (v: boolean) => void;
  showSessionExpiredModal: boolean;
  setShowSessionExpiredModal: (v: boolean) => void;
  showMonthlyReportModal: boolean;
  setShowMonthlyReportModal: (v: boolean) => void;
  selectedTxnIds: Set<string>;
  setSelectedTxnIds: React.Dispatch<React.SetStateAction<Set<string>>>;
  projects: Project[];
  activeProject: Project | null;
  selectProject: (id: string | null) => void;
  createNewProject: (name: string) => Promise<unknown>;
  deleteProject: (id: string) => Promise<void>;
  loadProjects: () => Promise<void>;
  refreshProjectData: () => void;
  storageAdapter: StorageAdapter | null;
  logout: () => void;
  isCurrentMonthLocked: boolean;
  txnHooks: ReturnType<typeof useTransactions>;
  budgetHooks: ReturnType<typeof useBudgets>;
  csvHooks: ReturnType<typeof useCsvImport>;
}

export const ModalHost: React.FC<ModalHostProps> = ({
  showTxnModal,
  setShowTxnModal,
  editingTxnId,
  editingTxnData,
  pendingDuplicateTxn,
  setPendingDuplicateTxn,
  showDuplicateWarningModal,
  setShowDuplicateWarningModal,
  showCategoryManagerModal,
  setShowCategoryManagerModal,
  showAddCatModal,
  setShowAddCatModal,
  showCreateModal,
  setShowCreateModal,
  showManageProjectsModal,
  setShowManageProjectsModal,
  showShareModal,
  setShowShareModal,
  showGeminiKeyModal,
  setShowGeminiKeyModal,
  showBulkDeleteConfirmModal,
  setShowBulkDeleteConfirmModal,
  showSessionExpiredModal,
  setShowSessionExpiredModal,
  showMonthlyReportModal,
  setShowMonthlyReportModal,
  selectedTxnIds,
  setSelectedTxnIds,
  projects,
  activeProject,
  selectProject,
  createNewProject,
  deleteProject,
  loadProjects,
  refreshProjectData,
  storageAdapter,
  logout,
  isCurrentMonthLocked,
  txnHooks,
  budgetHooks,
  csvHooks,
}) => {
  return (
    <>
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
            onCreate={async name => {
              await createNewProject(name);
              showToast('Project created successfully');
            }}
          />
        )}
      </AnimatePresence>

      <AnimatePresence>
        {showManageProjectsModal && (
          <ManageProjectsModal
            showModal={showManageProjectsModal}
            onClose={() => setShowManageProjectsModal(false)}
            projects={projects}
            activeProject={activeProject}
            onSelectProject={selectProject}
            onCreateProject={async name => {
              await createNewProject(name);
              showToast('Project created successfully');
            }}
            onDeleteProject={async projectId => {
              await deleteProject(projectId);
              showToast('Project deleted');
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
            onAddCollaborator={async email => {
              if (!storageAdapter || !activeProject) return;
              try {
                await storageAdapter.shareProject(activeProject.id, email);
                showToast('Collaborator added');
                await loadProjects();
                refreshProjectData();
              } catch (err: unknown) {
                showToast(
                  err instanceof Error ? err.message : 'Failed to share project',
                  'error'
                );
              }
            }}
          />
        )}
      </AnimatePresence>

      {csvHooks.showCsvWizard && (
        <CsvImportWizard
          {...csvHooks}
          categories={budgetHooks.categories}
          setShowCategoryManagerModal={setShowCategoryManagerModal}
          onRequestGeminiKey={() => setShowGeminiKeyModal(true)}
        />
      )}

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
                await txnHooks.executeSaveTransaction(
                  pendingDuplicateTxn,
                  !!editingTxnId
                );
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

      <Modal
        isOpen={showBulkDeleteConfirmModal}
        onClose={() => setShowBulkDeleteConfirmModal(false)}
        title={`Delete ${selectedTxnIds.size} records?`}
        maxWidth="max-w-sm"
        overlayClassName="z-[60]"
        className="p-6 text-center border border-destructive/30"
      >
        <h2 className="text-xl font-bold text-destructive mb-2">
          Delete {selectedTxnIds.size} records?
        </h2>
        <p className="text-muted-foreground mb-6 text-sm">
          This action cannot be undone.
        </p>
        <div className="flex gap-3">
          <button
            type="button"
            onClick={() => setShowBulkDeleteConfirmModal(false)}
            className="flex-1 px-4 py-2 bg-card border border-border rounded-xl font-bold"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={() => {
              txnHooks.handleExecuteBulkDelete(selectedTxnIds, () => {
                setSelectedTxnIds(new Set());
                setShowBulkDeleteConfirmModal(false);
              });
            }}
            className="flex-1 px-4 py-2 bg-destructive text-destructive-foreground rounded-xl font-bold shadow-lg shadow-destructive/20"
          >
            Delete
          </button>
        </div>
      </Modal>

      <Modal
        isOpen={showSessionExpiredModal}
        onClose={() => {
          setShowSessionExpiredModal(false);
          logout();
        }}
        dataTestId="session-expired-modal"
        title="Session Expired"
        maxWidth="max-w-sm"
        className="p-6 text-center"
      >
        <h3 className="font-bold text-base text-rose-400 mb-2">Session Expired</h3>
        <p className="text-xs text-muted-foreground mb-4">Please log in again.</p>
        <button
          data-testid="modal-ok-btn"
          onClick={() => {
            setShowSessionExpiredModal(false);
            logout();
          }}
          className="px-5 py-2 rounded-lg bg-primary text-primary-foreground text-xs font-bold"
        >
          OK
        </button>
      </Modal>

      <MonthlyReportModal
        isOpen={showMonthlyReportModal}
        onClose={() => setShowMonthlyReportModal(false)}
        month={txnHooks.selectedMonth}
        projectName={activeProject?.name || 'My Expenses'}
        collaborators={activeProject?.collaborators || []}
        financials={{
          totalIncome: txnHooks.totalIncome,
          totalExpenses: txnHooks.totalExpenses,
          fixedExpenses: txnHooks.fixedExpenses,
          flexibleExpenses: txnHooks.flexibleExpenses,
          nonMonthlyExpenses: txnHooks.nonMonthlyExpenses,
          savingsAmount: txnHooks.savingsAmount,
          savingsRate: txnHooks.savingsRate,
          totalBudget: budgetHooks.totalBudget,
        }}
        categories={budgetHooks.categorySummary}
        transactions={txnHooks.transactions}
        isLocked={isCurrentMonthLocked}
      />
    </>
  );
};
