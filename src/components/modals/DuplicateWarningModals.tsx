import { AlertTriangle, Check, X } from 'lucide-react';
import { motion } from 'framer-motion';
import { Transaction } from '../../services/storage';
import { formatTransactionAmount } from '../../utils/formatters';

interface DuplicateWarningModalProps {
  showModal: boolean;
  pendingTxn: Transaction | null;
  onCancel: () => void;
  onProceed: () => void;
}

export function DuplicateWarningModal({ showModal, pendingTxn, onCancel, onProceed }: DuplicateWarningModalProps) {
  if (!showModal || !pendingTxn) return null;

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-background/80 backdrop-blur-sm">
      <motion.div 
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.95 }}
        className="glass-panel w-full max-w-md rounded-2xl p-6 shadow-2xl border border-destructive/30"
      >
        <div className="flex items-center gap-3 mb-4 text-destructive">
          <AlertTriangle className="w-8 h-8" />
          <h2 className="text-xl font-bold">Duplicate Detected</h2>
        </div>
        
        <p className="text-muted-foreground mb-4">
          A transaction with the exact same details already exists in your records. Are you sure you want to add it again?
        </p>

        <div className="bg-card/50 p-4 rounded-xl border border-border/50 mb-6 font-mono text-sm space-y-2">
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
                <span className={`font-bold ${colorClass}`}>
                  {formattedAmount}
                </span>
              );
            })()}
          </div>
        </div>

        <div className="flex gap-3">
          <button
            onClick={onCancel}
            className="flex-1 px-4 py-3 rounded-xl font-bold bg-card hover:bg-card/80 border border-border transition-colors flex items-center justify-center gap-2"
          >
            <X className="w-4 h-4" /> Cancel
          </button>
          <button
            onClick={onProceed}
            className="flex-1 px-4 py-3 rounded-xl bg-destructive hover:bg-destructive/90 text-destructive-foreground font-bold shadow-lg shadow-destructive/20 transition-all hover:scale-105 flex items-center justify-center gap-2"
          >
            <Check className="w-4 h-4" /> Add Anyway
          </button>
        </div>
      </motion.div>
    </div>
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
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-background/80 backdrop-blur-sm">
      <motion.div 
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.95 }}
        className="glass-panel w-full max-w-md rounded-2xl p-6 shadow-2xl border border-destructive/30"
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
            onClick={onCancel}
            className="flex-1 px-4 py-3 rounded-xl font-bold bg-card hover:bg-card/80 border border-border transition-colors flex items-center justify-center gap-2"
          >
            <X className="w-4 h-4" /> Cancel
          </button>
          <button
            onClick={onProceed}
            className="flex-1 px-4 py-3 rounded-xl bg-destructive hover:bg-destructive/90 text-destructive-foreground font-bold shadow-lg shadow-destructive/20 transition-all hover:scale-105 flex items-center justify-center gap-2"
          >
            <Check className="w-4 h-4" /> Import Anyway
          </button>
        </div>
      </motion.div>
    </div>
  );
}
