import React, { useState, useEffect } from 'react';
import { Upload, Check, X, Sparkles, Loader2, AlertCircle } from 'lucide-react';
import { motion } from 'framer-motion';
import { CsvItem } from '../../hooks/useCsvImport';
import { Category, DEFAULT_CATEGORIES } from '../../services/storage';
import { classifyTransactionsWithLLM } from '../../services/llmCategorizer';
import { hasGeminiApiKey } from '../../services/ai/geminiClient';

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
  mapSubCategoryCol?: string;
  categories: Category[];
  parsedCsvItems: CsvItem[];
  setShowCsvWizard: (show: boolean) => void;
  setMapDateCol: (col: string) => void;
  setMapDescCol: (col: string) => void;
  setMapAmountCol: (col: string) => void;
  setMapTypeCol: (col: string) => void;
  setMapCategoryCol: (col: string) => void;
  setMapSubCategoryCol?: (col: string) => void;
  setParsedCsvItems: React.Dispatch<React.SetStateAction<CsvItem[]>>;
  setShowCategoryManagerModal?: (v: boolean) => void;
  onRequestGeminiKey?: () => void;
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
  mapSubCategoryCol = '',
  categories,
  parsedCsvItems,
  setShowCsvWizard,
  setMapDateCol,
  setMapDescCol,
  setMapAmountCol,
  setMapTypeCol,
  setMapCategoryCol,
  setMapSubCategoryCol,
  setParsedCsvItems,
  setShowCategoryManagerModal,
  onRequestGeminiKey,
  handleCsvNextStep,
  handleCommitCsvImport
}: CsvImportWizardProps) {
  const [isAiClassifying, setIsAiClassifying] = useState(false);
  const [aiError, setAiError] = useState<string | null>(null);
  const [hasAutoClassified, setHasAutoClassified] = useState(false);

  useEffect(() => {
    if (!showCsvWizard || csvStep === 1) {
      setHasAutoClassified(false);
    }
  }, [showCsvWizard, csvStep]);

  useEffect(() => {
    if (showCsvWizard && csvStep === 2 && !hasAutoClassified && !isAiClassifying && parsedCsvItems.length > 0) {
      if (hasGeminiApiKey()) {
        setHasAutoClassified(true);
        handleRunAiClassification();
      }
    }
  }, [showCsvWizard, csvStep, hasAutoClassified, isAiClassifying, parsedCsvItems.length]);

  if (!showCsvWizard) return null;

  const handleRunAiClassification = async () => {
    setAiError(null);
    if (!hasGeminiApiKey()) {
      if (onRequestGeminiKey) {
        onRequestGeminiKey();
      } else {
        setAiError('Gemini API key is required. Please set your key in AI Settings.');
      }
      return;
    }

    setIsAiClassifying(true);
    let classificationError: string | null = null;
    try {
      const itemsToClassify = parsedCsvItems.map((item, idx) => ({
        id: String(idx),
        description: item.description,
        amount: item.amount,
        type: item.type,
        rawCategory: item.category
      }));

      const results = await classifyTransactionsWithLLM(itemsToClassify, categories);
      applyClassificationResults(results);
    } catch (e: unknown) {
      console.error("AI classification failed:", e);
      classificationError = e instanceof Error ? e.message : "AI classification failed. Check API Key or network connection.";
      setAiError(classificationError);
    } finally {
      setIsAiClassifying(false);
    }
  };

  const applyClassificationResults = (results: Record<string, { categoryId: string; subCategoryId?: string }>) => {
    setParsedCsvItems(prev => prev.map((item, idx) => {
      const aiRes = results[String(idx)];
      if (aiRes) {
        return {
          ...item,
          category: aiRes.categoryId,
          subCategory: aiRes.subCategoryId || null
        };
      }
      return item;
    }));
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
                {setMapSubCategoryCol && (
                  <div>
                    <label className="block text-sm font-bold text-muted-foreground mb-1">Sub-Category Column (Optional)</label>
                    <select value={mapSubCategoryCol} data-testid="csv-map-col-subcategory" onChange={e => setMapSubCategoryCol(e.target.value)} className="w-full bg-card/50 border border-border rounded-xl px-4 py-2 font-medium focus:ring-2 focus:ring-primary outline-none">
                      <option value="" className="bg-card text-card-foreground">-- None --</option>
                      {csvRawHeaders.map(h => <option key={h} value={h} className="bg-card text-card-foreground">{h}</option>)}
                    </select>
                  </div>
                )}
              </div>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="flex justify-between items-center px-1">
                <p className="text-xs text-muted-foreground">
                  Review and tweak categories per item before committing import.
                </p>
                <div className="flex items-center gap-2">
                  {setShowCategoryManagerModal && (
                    <button
                      type="button"
                      onClick={() => setShowCategoryManagerModal(true)}
                      className="px-3 py-1.5 rounded-lg bg-card hover:bg-card/80 text-foreground border border-border/70 font-bold text-xs flex items-center gap-1.5 transition-all"
                    >
                      + Manage Categories
                    </button>
                  )}
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
              </div>

              {isAiClassifying && (
                <div className="p-3 rounded-xl bg-primary/10 border border-primary/20 text-primary text-xs font-semibold flex items-center gap-2 animate-pulse">
                  <Loader2 className="w-4 h-4 animate-spin shrink-0" />
                  <span>AI is categorizing your transactions in the background...</span>
                </div>
              )}

              {!hasGeminiApiKey() && !aiError && (
                <div className="p-3 rounded-xl bg-card border border-border/70 text-muted-foreground text-xs flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <Sparkles className="w-4 h-4 text-primary shrink-0" />
                    <span>AI auto-categorization is inactive because no Gemini API Key is configured.</span>
                  </div>
                  {onRequestGeminiKey && (
                    <button
                      type="button"
                      onClick={onRequestGeminiKey}
                      className="px-2.5 py-1 rounded-md bg-primary/10 hover:bg-primary/20 text-primary font-bold text-xs shrink-0 transition-colors"
                    >
                      Configure Key
                    </button>
                  )}
                </div>
              )}

              {aiError && (
                <div className="p-3 rounded-xl bg-destructive/10 border border-destructive/20 text-destructive text-xs font-semibold flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <AlertCircle className="w-4 h-4 shrink-0" />
                    <span>{aiError}</span>
                  </div>
                  {onRequestGeminiKey && aiError.toLowerCase().includes('key') && (
                    <button
                      type="button"
                      onClick={() => { setAiError(null); onRequestGeminiKey(); }}
                      className="px-2.5 py-1 rounded-md bg-destructive/20 hover:bg-destructive/30 text-destructive font-bold text-xs shrink-0 transition-colors"
                    >
                      Configure Key
                    </button>
                  )}
                </div>
              )}

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
                            {(() => {
                              const allCategoriesMap = new Map<string, Category>();
                              DEFAULT_CATEGORIES.forEach(c => allCategoriesMap.set(c.id, c));
                              categories.forEach(c => allCategoriesMap.set(c.id, c));
                              const allCats = Array.from(allCategoriesMap.values());
                              const parentCats = allCats.filter(c => !c.parentId);

                              const itemParent = parentCats.some(c => c.id === item.category) ? item.category : (parentCats[0]?.id || 'misc');
                              const activeValue = `${itemParent}|${item.subCategory || ''}`;

                              return (
                                <select
                                  value={activeValue}
                                  onChange={(e) => {
                                    const [catId, subId] = e.target.value.split('|');
                                    setParsedCsvItems(prev => {
                                      const next = [...prev];
                                      next[idx].category = catId;
                                      next[idx].subCategory = subId || null;
                                      return next;
                                    });
                                  }}
                                  className="bg-card border border-border/70 text-foreground rounded-lg px-2.5 py-1 text-xs font-semibold focus:ring-1 focus:ring-primary outline-none cursor-pointer"
                                >
                                  {parentCats.map(p => {
                                    const subs = allCats.filter(c => c.parentId === p.id);
                                    return (
                                      <optgroup key={p.id} label={`${p.emoji} ${p.name}`} className="bg-card font-bold text-muted-foreground">
                                        <option value={`${p.id}|`} className="bg-card text-card-foreground font-semibold">
                                          {p.emoji} {p.name} (General)
                                        </option>
                                        {subs.map(s => (
                                          <option key={s.id} value={`${p.id}|${s.id}`} className="bg-card text-card-foreground">
                                            {s.emoji} {s.name}
                                          </option>
                                        ))}
                                      </optgroup>
                                    );
                                  })}
                                </select>
                              );
                            })()}
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
