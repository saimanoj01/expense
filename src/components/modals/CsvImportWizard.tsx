import React, { useState } from 'react';
import { Upload, Check, X, Sparkles, Loader2 } from 'lucide-react';
import { motion } from 'framer-motion';
import { CsvItem } from '../../hooks/useCsvImport';
import { Category } from '../../services/storage';
import { classifyTransactionsWithLLM } from '../../services/llmCategorizer';

interface CsvImportWizardProps {
  showCsvWizard: boolean;
  csvStep: 1 | 2;
  csvError: string | null;
  csvRawHeaders: string[];
  mapDateCol: string;
  mapDescCol: string;
  mapAmountCol: string;
  mapTypeCol: string;
  mapCategoryCol: string;
  categories: Category[];
  parsedCsvItems: CsvItem[];
  setMapDateCol: (v: string) => void;
  setMapDescCol: (v: string) => void;
  setMapAmountCol: (v: string) => void;
  setMapTypeCol: (v: string) => void;
  setMapCategoryCol: (v: string) => void;
  setParsedCsvItems: React.Dispatch<React.SetStateAction<CsvItem[]>>;
  setShowCsvWizard: (v: boolean) => void;
  handleCsvNextStep: () => void;
  handleCommitCsvImport: () => void;
}

export function CsvImportWizard({
  showCsvWizard,
  csvStep,
  csvError,
  csvRawHeaders,
  mapDateCol,
  mapDescCol,
  mapAmountCol,
  mapTypeCol,
  mapCategoryCol,
  categories,
  parsedCsvItems,
  setMapDateCol,
  setMapDescCol,
  setMapAmountCol,
  setMapTypeCol,
  setMapCategoryCol,
  setParsedCsvItems,
  setShowCsvWizard,
  handleCsvNextStep,
  handleCommitCsvImport
}: CsvImportWizardProps) {
  const [isAiClassifying, setIsAiClassifying] = useState(false);

  if (!showCsvWizard) return null;

  const handleRunAiClassification = async () => {
    setIsAiClassifying(true);
    try {
      const itemsToClassify = parsedCsvItems.map((item, idx) => ({
        id: String(idx),
        description: item.description,
        rawCategory: item.category
      }));
      const results = await classifyTransactionsWithLLM(itemsToClassify, categories);
      setParsedCsvItems(prev => prev.map((item, idx) => {
        const aiCategory = results[String(idx)];
        return aiCategory ? { ...item, category: aiCategory } : item;
      }));
    } catch (e) {
      console.error("AI classification failed:", e);
    } finally {
      setIsAiClassifying(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-background/80 backdrop-blur-sm">
      <motion.div 
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.95 }}
        className="glass-panel w-full max-w-4xl max-h-[90vh] rounded-2xl p-6 overflow-hidden flex flex-col shadow-2xl"
      >
        <div className="flex justify-between items-center mb-6">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-xl bg-primary/10 text-primary">
              <Upload className="w-6 h-6" />
            </div>
            <div>
              <h2 className="text-2xl font-bold">
                {csvStep === 1 ? 'Map Columns' : 'Preview Import & Categorize'}
              </h2>
              <p className="text-xs text-muted-foreground">Step {csvStep} of 2</p>
            </div>
          </div>
          <button onClick={() => setShowCsvWizard(false)} className="p-2 hover:bg-card rounded-lg text-muted-foreground hover:text-foreground transition-colors">
            <X className="w-6 h-6" />
          </button>
        </div>
        
        {csvError && (
          <div className="mb-4 p-4 rounded-xl bg-destructive/10 border border-destructive/20 text-destructive font-bold">
            {csvError}
          </div>
        )}

        <div className="flex-1 overflow-y-auto custom-scrollbar">
          {csvStep === 1 ? (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="space-y-4">
                <p className="text-muted-foreground text-sm">Select the columns from your CSV that correspond to the required fields.</p>
                <div>
                  <label className="block text-sm font-bold text-muted-foreground mb-1">Date Column (Optional)</label>
                  <select value={mapDateCol} data-testid="csv-map-col-date" onChange={e => setMapDateCol(e.target.value)} className="w-full bg-card/50 border border-border rounded-xl px-4 py-2 font-medium focus:ring-2 focus:ring-primary outline-none">
                    <option value="" className="bg-card text-card-foreground">-- None -- (Uses today)</option>
                    {csvRawHeaders.map(h => <option key={h} value={h} className="bg-card text-card-foreground">{h}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-bold text-muted-foreground mb-1">Description Column (Required)</label>
                  <select value={mapDescCol} data-testid="csv-map-col-desc" onChange={e => setMapDescCol(e.target.value)} className="w-full bg-card/50 border border-border rounded-xl px-4 py-2 font-medium focus:ring-2 focus:ring-primary outline-none">
                    <option value="" className="bg-card text-card-foreground">-- Select --</option>
                    {csvRawHeaders.map(h => <option key={h} value={h} className="bg-card text-card-foreground">{h}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-bold text-muted-foreground mb-1">Amount Column (Required)</label>
                  <select value={mapAmountCol} data-testid="csv-map-col-amount" onChange={e => setMapAmountCol(e.target.value)} className="w-full bg-card/50 border border-border rounded-xl px-4 py-2 font-medium focus:ring-2 focus:ring-primary outline-none">
                    <option value="" className="bg-card text-card-foreground">-- Select --</option>
                    {csvRawHeaders.map(h => <option key={h} value={h} className="bg-card text-card-foreground">{h}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-bold text-muted-foreground mb-1">Type Column (Optional - checks for 'income' or positive inflow)</label>
                  <select value={mapTypeCol} data-testid="csv-map-col-type" onChange={e => setMapTypeCol(e.target.value)} className="w-full bg-card/50 border border-border rounded-xl px-4 py-2 font-medium focus:ring-2 focus:ring-primary outline-none">
                    <option value="" className="bg-card text-card-foreground">-- None --</option>
                    {csvRawHeaders.map(h => <option key={h} value={h} className="bg-card text-card-foreground">{h}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-bold text-muted-foreground mb-1">Category Column (Optional)</label>
                  <select value={mapCategoryCol} data-testid="csv-map-col-category" onChange={e => setMapCategoryCol(e.target.value)} className="w-full bg-card/50 border border-border rounded-xl px-4 py-2 font-medium focus:ring-2 focus:ring-primary outline-none">
                    <option value="" className="bg-card text-card-foreground">-- None -- (Uses smart auto-suggest)</option>
                    {csvRawHeaders.map(h => <option key={h} value={h} className="bg-card text-card-foreground">{h}</option>)}
                  </select>
                </div>
              </div>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="flex justify-between items-center px-1">
                <p className="text-xs text-muted-foreground">
                  Review and tweak categories per item before committing import.
                </p>
                <button
                  type="button"
                  onClick={handleRunAiClassification}
                  disabled={isAiClassifying}
                  className="px-3 py-1.5 rounded-lg bg-primary/10 hover:bg-primary/20 text-primary border border-primary/20 font-bold text-xs flex items-center gap-1.5 transition-all"
                >
                  {isAiClassifying ? (
                    <>
                      <Loader2 className="w-3.5 h-3.5 animate-spin" /> Classifying...
                    </>
                  ) : (
                    <>
                      <Sparkles className="w-3.5 h-3.5" /> Auto-Classify with AI
                    </>
                  )}
                </button>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse" data-testid="csv-preview-table">
                  <thead>
                    <tr className="border-b border-border/50 text-muted-foreground text-sm">
                      <th className="p-3 font-medium">Import</th>
                      <th className="p-3 font-medium">Date</th>
                      <th className="p-3 font-medium">Description</th>
                      <th className="p-3 font-medium">Category</th>
                      <th className="p-3 font-medium text-right">Amount</th>
                      <th className="p-3 font-medium">Type</th>
                      <th className="p-3 font-medium">Status</th>
                    </tr>
                  </thead>
                  <tbody className="text-sm">
                    {parsedCsvItems.map((item, idx) => {
                      const isDisabled = item.isLockedMonth;
                      return (
                        <tr key={idx} className={`border-b border-border/20 ${item.isDuplicate ? 'bg-destructive/10' : ''} ${item.isLockedMonth ? 'opacity-50' : ''}`}>
                          <td className="p-3">
                            <input 
                              type="checkbox" 
                              disabled={isDisabled}
                              checked={item.selected}
                              onChange={(e) => {
                                const checked = e.target.checked;
                                setParsedCsvItems(prev => {
                                  const next = [...prev];
                                  next[idx].selected = checked;
                                  return next;
                                });
                              }}
                              className="w-4 h-4 rounded bg-background border-border text-primary focus:ring-primary disabled:opacity-50"
                            />
                          </td>
                          <td className="p-3 whitespace-nowrap">{item.date}</td>
                          <td className="p-3 font-medium">{item.description}</td>
                          <td className="p-3">
                            <select
                              value={item.category}
                              onChange={(e) => {
                                const newCat = e.target.value;
                                setParsedCsvItems(prev => {
                                  const next = [...prev];
                                  next[idx].category = newCat;
                                  return next;
                                });
                              }}
                              className="bg-card/70 border border-border/70 rounded-lg px-2.5 py-1 text-xs font-semibold focus:ring-1 focus:ring-primary outline-none"
                            >
                              {categories.map(c => (
                                <option key={c.id} value={c.id} className="bg-card text-card-foreground">
                                  {c.emoji} {c.name}
                                </option>
                              ))}
                            </select>
                          </td>
                          <td className={`p-3 text-right font-bold tabular-nums ${item.type === 'income' ? 'text-emerald-500' : item.type === 'transfer' ? 'text-blue-400 font-medium' : ''}`}>
                            {item.type === 'income' ? '+' : item.type === 'transfer' ? '↔ ' : '-'}${item.amount.toLocaleString(undefined, {minimumFractionDigits: 2})}
                          </td>
                          <td className="p-3">
                            <select
                              value={item.type}
                              onChange={(e) => {
                                const newType = e.target.value as 'income' | 'expense' | 'transfer';
                                setParsedCsvItems(prev => {
                                  const next = [...prev];
                                  next[idx].type = newType;
                                  return next;
                                });
                              }}
                              className="bg-card/70 border border-border/70 rounded-lg px-2 py-1 text-xs font-semibold uppercase focus:ring-1 focus:ring-primary outline-none"
                            >
                              <option value="expense" className="bg-card text-card-foreground">Expense</option>
                              <option value="income" className="bg-card text-card-foreground">Income</option>
                              <option value="transfer" className="bg-card text-card-foreground">Transfer</option>
                            </select>
                          </td>
                          <td className="p-3">
                            {item.isLockedMonth ? (
                              <span className="text-destructive font-bold text-xs flex items-center gap-1"><X className="w-3 h-3"/> Locked Month</span>
                            ) : item.isDuplicate ? (
                              <span className="text-destructive font-bold text-xs flex items-center gap-1"><X className="w-3 h-3"/> Duplicate</span>
                            ) : (
                              <span className="text-emerald-500 font-bold text-xs flex items-center gap-1"><Check className="w-3 h-3"/> OK</span>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>

        <div className="mt-6 flex justify-end gap-3 pt-4 border-t border-border/50">
          <button
            onClick={() => setShowCsvWizard(false)}
            className="px-6 py-2.5 rounded-xl font-bold hover:bg-card transition-colors border border-border"
          >
            Cancel
          </button>
          {csvStep === 1 ? (
            <button
              onClick={handleCsvNextStep}
              className="px-6 py-2.5 rounded-xl bg-primary hover:bg-primary/90 text-primary-foreground font-bold shadow-lg shadow-primary/20 transition-all hover:scale-105 active:scale-95 flex items-center gap-2"
            >
              Next Step
            </button>
          ) : (
            <button
              onClick={handleCommitCsvImport}
              data-testid="csv-import-btn"
              className="px-6 py-2.5 rounded-xl bg-primary hover:bg-primary/90 text-primary-foreground font-bold shadow-lg shadow-primary/20 transition-all hover:scale-105 active:scale-95 flex items-center gap-2"
            >
              <Check className="w-5 h-5" /> Import Selected
            </button>
          )}
        </div>
      </motion.div>
    </div>
  );
}
