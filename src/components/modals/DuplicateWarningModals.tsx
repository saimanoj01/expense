import { AlertTriangle, Check, X } from 'lucide-react';
import { Modal } from '../common/Modal';
import { Transaction } from '../../services/storage';
import { formatTransactionAmount } from '../../utils/formatters';

interface DuplicateWarningModalProps {
  showModal: boolean;
  pendingTxn: Transaction | null;
  isEdit?: boolean;
  onCancel: () => void;
  onProceed: () => void;
}

export function DuplicateWarningModal({
  showModal,
  pendingTxn,
  isEdit = false,
  onCancel,
  onProceed,
}: DuplicateWarningModalProps) {
  if (!showModal || !pendingTxn) return null;

  return (
    <Modal
      isOpen={showModal}
      onClose={onCancel}
      title="Duplicate Detected"
      dataTestId="duplicate-warning-modal"
      maxWidth="max-w-md"
      overlayClassName="z-[60]"
      className="p-6 border border-destructive/30"
    >
      <div className="flex items-center gap-3 mb-4 text-destructive">
        <AlertTriangle className="w-8 h-8" />
        <h2 className="text-xl font-bold">Duplicate Detected</h2>
      </div>
      
      <p className="text-muted-foreground mb-4">
        A transaction with the exact same details already exists in your records. Are you sure you want to {isEdit ? 'save these duplicate details' : 'add it again'}?
      </p>

      <div className="bg-surface2 p-4 rounded-xl border border-border mb-6 font-mono text-sm space-y-2">
        <div className="flex justify-between">
          <span className="text-muted-foreground">Date:</span>
          <span>{pendingTxn.date}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-muted-foreground">Desc:</span>
          <span className="truncate ml-2">{pendingTxn.description}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-muted-foreground">Amount:</span>
          {(() => {
            const { formattedAmount, colorClass } = formatTransactionAmount(pendingTxn.amount, pendingTxn.type);
            return (
              <span className={`font-bold tabular-nums num ${colorClass}`}>
                {formattedAmount}
              </span>
            );
          })()}
        </div>
      </div>

      <div className="flex gap-3">
        <button
          type="button"
          onClick={onCancel}
          className="flex-1 px-4 py-3 rounded-xl font-bold bg-surface2 hover:bg-secondary border border-border transition-colors flex items-center justify-center gap-2 whitespace-nowrap"
        >
          <X className="w-4 h-4" /> Cancel
        </button>
        <button
          type="button"
          data-testid="confirm-duplicate-save-btn"
          onClick={onProceed}
          className="flex-1 px-4 py-3 rounded-xl bg-destructive hover:bg-destructive/90 text-destructive-foreground font-bold transition-colors flex items-center justify-center gap-2 whitespace-nowrap"
        >
          <Check className="w-4 h-4" /> {isEdit ? 'Save Anyway' : 'Add Anyway'}
        </button>
      </div>
    </Modal>
  );
}

interface CsvDuplicateWarningModalProps {
  showModal: boolean;
  onCancel: () => void;
  onProceed: () => void;
}

export function CsvDuplicateWarningModal({ showModal, onCancel, onProceed }: CsvDuplicateWarningModalProps) {
  if (!showModal) return null;

  return (
    <Modal
      isOpen={showModal}
      onClose={onCancel}
      title="Import Duplicates Detected"
      maxWidth="max-w-md"
      overlayClassName="z-[60]"
      className="p-6 border border-destructive/30"
    >
      <div className="flex items-center gap-3 mb-4 text-destructive">
        <AlertTriangle className="w-8 h-8" />
        <h2 className="text-xl font-bold">Import Duplicates Detected</h2>
      </div>
      
      <p className="text-muted-foreground mb-6">
        You have selected one or more transactions to import that match existing records. Importing duplicates may distort your budgeting. Do you want to proceed and import them anyway?
      </p>

      <div className="flex gap-3">
        <button
          type="button"
          onClick={onCancel}
          className="flex-1 px-4 py-3 rounded-xl font-bold bg-surface2 hover:bg-secondary border border-border transition-colors flex items-center justify-center gap-2 whitespace-nowrap"
        >
          <X className="w-4 h-4" /> Cancel
        </button>
        <button
          type="button"
          onClick={onProceed}
          className="flex-1 px-4 py-3 rounded-xl bg-destructive hover:bg-destructive/90 text-destructive-foreground font-bold transition-colors flex items-center justify-center gap-2 whitespace-nowrap"
        >
          <Check className="w-4 h-4" /> Import Anyway
        </button>
      </div>
    </Modal>
  );
}
