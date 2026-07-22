import React from 'react';
import { Upload, Plus, Lock, Unlock, Share2, Tag } from 'lucide-react';
import { motion } from 'framer-motion';

interface TransactionToolbarProps {
  selectedMonth: string;
  availableMonths: string[];
  availableTags?: string[];
  selectedTagFilter?: string | null;
  isCurrentMonthLocked: boolean;
  setSelectedMonth: (m: string) => void;
  setSelectedTagFilter?: (t: string | null) => void;
  handleOpenAddTxn: () => void;
  handleCsvFileUpload: (e: React.ChangeEvent<HTMLInputElement>) => void;
  handleLockCurrentMonth: () => void;
  handleUnlockCurrentMonth: () => void;
  setShowShareModal: (v: boolean) => void;
}

export function TransactionToolbar({
  selectedMonth,
  availableMonths,
  availableTags = [],
  selectedTagFilter,
  isCurrentMonthLocked,
  setSelectedMonth,
  setSelectedTagFilter,
  handleOpenAddTxn,
  handleCsvFileUpload,
  handleLockCurrentMonth,
  handleUnlockCurrentMonth,
  setShowShareModal
}: TransactionToolbarProps) {
  return (
    <motion.div 
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-6"
    >
      <div className="flex flex-wrap items-center gap-3">
        <select
          className="bg-card/50 border border-border rounded-xl px-4 py-2 font-medium focus:ring-2 focus:ring-primary outline-none transition-all"
          value={selectedMonth}
          onChange={(e) => setSelectedMonth(e.target.value)}
        >
          <option value="all" className="bg-card text-card-foreground">All Time</option>
          {availableMonths.map(m => (
            <option key={m} value={m} className="bg-card text-card-foreground">{m}</option>
          ))}
        </select>
        
        {selectedMonth !== 'all' && (
          <button
            onClick={isCurrentMonthLocked ? handleUnlockCurrentMonth : handleLockCurrentMonth}
            data-testid={isCurrentMonthLocked ? "unlock-month-btn" : "lock-month-btn"}
            className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium transition-colors border ${
              isCurrentMonthLocked 
                ? 'bg-destructive/10 text-destructive border-destructive/20 hover:bg-destructive/20' 
                : 'bg-emerald-500/10 text-emerald-500 border-emerald-500/20 hover:bg-emerald-500/20'
            }`}
          >
            {isCurrentMonthLocked ? <Lock className="w-4 h-4" /> : <Unlock className="w-4 h-4" />}
            <span data-testid="lock-status-indicator">{isCurrentMonthLocked ? 'Locked' : 'Lock Month'}</span>
          </button>
        )}

        {/* Tag Filters */}
        {availableTags.length > 0 && setSelectedTagFilter && (
          <div className="flex items-center gap-1.5 overflow-x-auto custom-scrollbar py-1">
            <Tag className="w-3.5 h-3.5 text-muted-foreground flex-shrink-0" />
            {availableTags.map(tag => (
              <button
                key={tag}
                data-testid={`filter-tag-${tag}`}
                onClick={() => setSelectedTagFilter(selectedTagFilter === tag ? null : tag)}
                className={`px-2 py-0.5 rounded-lg text-xs font-bold uppercase tracking-wider transition-colors flex-shrink-0 ${
                  selectedTagFilter === tag 
                    ? 'bg-primary text-primary-foreground' 
                    : 'bg-card/60 hover:bg-card border border-border/60 text-muted-foreground'
                }`}
              >
                {tag}
              </button>
            ))}
          </div>
        )}
      </div>

      <div className="flex items-center gap-3 flex-wrap sm:flex-nowrap">
        <button
          onClick={() => setShowShareModal(true)}
          data-testid="share-project-btn"
          className="flex items-center gap-2 px-4 py-2 bg-card/50 hover:bg-card border border-border rounded-xl text-sm font-medium transition-colors"
        >
          <Share2 className="w-4 h-4" /> Share
        </button>
        
        {!isCurrentMonthLocked && (
          <>
            <label className="flex items-center gap-2 px-4 py-2 bg-card/50 hover:bg-card border border-border rounded-xl text-sm font-medium transition-colors cursor-pointer">
              <Upload className="w-4 h-4" /> Import CSV
              <input type="file" accept=".csv" data-testid="csv-file-input" className="hidden" onChange={handleCsvFileUpload} onClick={(e: any) => e.target.value = null} />
            </label>
            <button
              onClick={handleOpenAddTxn}
              data-testid="open-add-transaction-btn"
              className="flex items-center gap-2 px-4 py-2 bg-primary hover:bg-primary/90 text-primary-foreground rounded-xl font-bold shadow-lg shadow-primary/20 transition-all hover:scale-105 active:scale-95"
            >
              <Plus className="w-4 h-4" /> Add Record
            </button>
          </>
        )}
      </div>
    </motion.div>
  );
}
