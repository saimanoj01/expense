import React from 'react';
import { Transaction, Project, StorageAdapter, MonthlyLock } from '../../services/storage';
import { useTransactions } from '../../hooks/useTransactions';
import { useBudgets } from '../../hooks/useBudgets';
import { useCsvImport } from '../../hooks/useCsvImport';
import { showToast } from '../../utils/toast';
import { Modal } from '../common/Modal';
import { TransactionModal } from './TransactionModal';
import { CategoryManagerModal } from './CategoryManagerModal';
import { CsvImportWizard } from './CsvImportWizard';
import { DuplicateWarningModal, CsvDuplicateWarningModal } from './DuplicateWarningModals';
import { CreateProjectModal } from './CreateProjectModal';
import { ShareProjectModal } from './ShareProjectModal';

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
  showCreateModal: boolean;
  setShowCreateModal: (v: boolean) => void;
  showShareModal: boolean;
  setShowShareModal: (v: boolean) => void;
  showBulkDeleteConfirmModal: boolean;
  setShowBulkDeleteConfirmModal: (v: boolean) => void;
  showSessionExpiredModal: boolean;
  setShowSessionExpiredModal: (v: boolean) => void;
  selectedTxnIds: Set<string>;
  setSelectedTxnIds: React.Dispatch<React.SetStateAction<Set<string>>>;
  activeProject: Project | null;
  createNewProject: (name: string) => Promise<unknown>;
  loadProjects: () => Promise<void>;
  refreshProjectData: () => void;
  storageAdapter: StorageAdapter | null;
  logout: () => void;
  locks?: MonthlyLock[];
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
  showCreateModal,
  setShowCreateModal,
  showShareModal,
  setShowShareModal,
  showBulkDeleteConfirmModal,
  setShowBulkDeleteConfirmModal,
  showSessionExpiredModal,
  setShowSessionExpiredModal,
  selectedTxnIds,
  setSelectedTxnIds,
  activeProject,
  createNewProject,
  loadProjects,
  refreshProjectData,
  storageAdapter,
  logout,
  locks,
  txnHooks,
  budgetHooks,
  csvHooks,
}) => {
  const isEditingTxnLocked = Boolean(
    editingTxnId &&
      editingTxnData?.date &&
      locks?.some(lk => lk.locked && editingTxnData.date!.startsWith(lk.month))
  );

  return (
    <>
      {showTxnModal && (
        <TransactionModal
          showTxnModal={showTxnModal}
          setShowTxnModal={setShowTxnModal}
          categories={budgetHooks.categories}
          editingTxnId={editingTxnId}
          initialData={editingTxnData}
          transactions={txnHooks.transactions}
          availableTags={txnHooks.availableTags}
          duplicateTxnIds={txnHooks.duplicateTxnIds}
          executeSaveTransaction={txnHooks.executeSaveTransaction}
          setPendingDuplicateTxn={setPendingDuplicateTxn}
          setShowDuplicateWarningModal={setShowDuplicateWarningModal}
          setShowCategoryManagerModal={setShowCategoryManagerModal}
          locks={locks}
          isTxnLocked={isEditingTxnLocked}
          onDismissReview={txnHooks.handleDismissReview}
          onDeleteTransaction={id => {
            txnHooks.handleDeleteTxn(id, () => {
              setSelectedTxnIds(prev => {
                const next = new Set(prev);
                next.delete(id);
                return next;
              });
              setShowTxnModal(false);
            });
          }}
        />
      )}

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

      {csvHooks.showCsvWizard && (
        <CsvImportWizard
          {...csvHooks}
          categories={budgetHooks.categories}
          setShowCategoryManagerModal={setShowCategoryManagerModal}
        />
      )}

      {showDuplicateWarningModal && (
        <DuplicateWarningModal
          showModal={showDuplicateWarningModal}
          pendingTxn={pendingDuplicateTxn}
          isEdit={!!editingTxnId}
          onCancel={() => setShowDuplicateWarningModal(false)}
          onProceed={async () => {
            if (pendingDuplicateTxn) {
              const verifiedLabels = Array.from(
                new Set([
                  ...(Array.isArray(pendingDuplicateTxn.labels)
                    ? pendingDuplicateTxn.labels
                    : []),
                  'duplicate-verified',
                ])
              );
              const verifiedTxn: Transaction = {
                ...pendingDuplicateTxn,
                labels: verifiedLabels,
              };
              const ok = await txnHooks.executeSaveTransaction(
                verifiedTxn,
                !!editingTxnId
              );
              if (ok) {
                setShowTxnModal(false);
              }
              setShowDuplicateWarningModal(false);
            }
          }}
        />
      )}

      {csvHooks.showCsvDuplicateWarningModal && (
        <CsvDuplicateWarningModal
          showModal={csvHooks.showCsvDuplicateWarningModal}
          onCancel={() => csvHooks.setShowCsvDuplicateWarningModal(false)}
          onProceed={csvHooks.executeCommitCsvImport}
        />
      )}

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
    </>
  );
};
