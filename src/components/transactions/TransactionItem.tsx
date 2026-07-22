import { Edit2, Trash2 } from 'lucide-react';
import { motion } from 'framer-motion';
import { Transaction, Category } from '../../services/storage';

interface TransactionItemProps {
  transaction: Transaction;
  categories: Category[];
  isLockedMonth: boolean;
  isSelected: boolean;
  isDuplicate: boolean;
  toggleSelectTxn: (id: string) => void;
  handleEditTxn: (txn: Transaction) => void;
  handleDeleteTxn: (id: string) => void;
  setSelectedTagFilter: (tag: string | null) => void;
}

export function TransactionItem({
  transaction,
  categories,
  isLockedMonth,
  isSelected,
  isDuplicate,
  toggleSelectTxn,
  handleEditTxn,
  handleDeleteTxn,
  setSelectedTagFilter
}: TransactionItemProps) {
  const cat = categories.find(c => c.id === transaction.category) || categories.find(c => c.name.toLowerCase() === transaction.category.toLowerCase());
  
  return (
    <motion.div 
      layout
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.95 }}
      whileHover={{ scale: 1.01 }}
      className={`group flex items-center justify-between p-4 bg-card/40 hover:bg-card/80 border-b border-border/50 last:border-0 transition-all ${
        isSelected ? 'bg-primary/5' : ''
      } ${isDuplicate ? 'bg-destructive/10' : ''}`}
    >
      <div className="flex items-center gap-4 flex-1 min-w-0">
        {!isLockedMonth && (
          <input
            type="checkbox"
            checked={isSelected}
            onChange={() => toggleSelectTxn(transaction.id)}
            className="w-4 h-4 rounded bg-background border-border text-primary focus:ring-primary focus:ring-offset-background"
          />
        )}
        
        <div 
          className="w-10 h-10 rounded-xl flex items-center justify-center text-lg flex-shrink-0"
          style={{ backgroundColor: `${cat?.color || '#38bdf8'}20`, color: cat?.color || '#38bdf8' }}
        >
          {cat?.emoji || '🏷️'}
        </div>
        
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <h4 className="font-semibold truncate">{transaction.description}</h4>
            {isDuplicate && (
              <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-destructive/20 text-destructive uppercase tracking-wider border border-destructive/20">
                Duplicate
              </span>
            )}
          </div>
          <div className="flex items-center gap-2 text-xs text-muted-foreground mt-1">
            <span>{transaction.date}</span>
            <span className="w-1 h-1 rounded-full bg-border" />
            <span className="truncate">{cat?.name || transaction.category}</span>
            {transaction.labels && transaction.labels.length > 0 && (
              <>
                <span className="w-1 h-1 rounded-full bg-border" />
                <div className="flex items-center gap-1">
                  {transaction.labels.map((lbl, idx) => (
                    <button 
                      key={idx}
                      onClick={(e) => { e.stopPropagation(); setSelectedTagFilter(lbl); }}
                      className="px-1.5 py-0.5 rounded bg-secondary/10 text-secondary text-[10px] uppercase font-bold tracking-wider hover:bg-secondary/20 transition-colors"
                    >
                      {lbl}
                    </button>
                  ))}
                </div>
              </>
            )}
          </div>
        </div>
      </div>
      
      <div className="flex items-center gap-4 pl-4 flex-shrink-0">
        <div className={`font-bold tabular-nums text-right ${
          transaction.type === 'income' ? 'text-emerald-500' : ''
        }`}>
          {transaction.type === 'income' ? '+' : '-'}${transaction.amount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
        </div>
        
        {!isLockedMonth && (
          <div className="flex items-center gap-1 opacity-100 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity">
            <button 
              onClick={() => handleEditTxn(transaction)}
              data-testid={`edit-transaction-btn-${transaction.id}`}
              className="p-2 hover:bg-card rounded-lg text-muted-foreground hover:text-foreground transition-colors"
            >
              <Edit2 className="w-4 h-4" />
            </button>
            <button 
              onClick={() => handleDeleteTxn(transaction.id)}
              data-testid={`delete-transaction-btn-${transaction.id}`}
              className="p-2 hover:bg-destructive/10 rounded-lg text-muted-foreground hover:text-destructive transition-colors"
            >
              <Trash2 className="w-4 h-4" />
            </button>
          </div>
        )}
      </div>
    </motion.div>
  );
}
