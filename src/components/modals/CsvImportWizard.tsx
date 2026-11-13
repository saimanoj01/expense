import React from 'react';
import { Upload, Check, X } from 'lucide-react';
import { Modal } from '../common/Modal';
import { CsvItem } from '../../hooks/useCsvImport';
import { Category, DEFAULT_CATEGORIES } from '../../services/storage';
import { formatTransactionAmount } from '../../utils/formatters';

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
  batchAccountInput?: string;
  batchTagsInput?: string;
  categories: Category[];
  parsedCsvItems: CsvItem[];
  setShowCsvWizard: (show: boolean) => void;
  setMapDateCol: (col: string) => void;
  setMapDescCol: (col: string) => void;
  setMapAmountCol: (col: string) => void;
  setMapTypeCol: (col: string) => void;
  setMapCategoryCol: (col: string) => void;
  setMapSubCategoryCol?: (col: string) => void;
  setBatchAccountInput?: (v: string) => void;
  setBatchTagsInput?: (v: string) => void;
  setParsedCsvItems: React.Dispatch<React.SetStateAction<CsvItem[]>>;
  updateItemTags?: (index: number, newTags: string[]) => void;
  setShowCategoryManagerModal?: (v: boolean) => void;
  handleCsvFileUpload?: (e: React.ChangeEvent<HTMLInputElement>) => void;
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
  batchAccountInput = '',
  batchTagsInput = '',
  categories,
  parsedCsvItems,
  setShowCsvWizard,
  setMapDateCol,
  setMapDescCol,
  setMapAmountCol,
  setMapTypeCol,
  setMapCategoryCol,
  setMapSubCategoryCol,
  setBatchAccountInput,
  setBatchTagsInput,
  setParsedCsvItems,
  updateItemTags,
  setShowCategoryManagerModal,
  handleCsvFileUpload,
  handleCsvNextStep,
  handleCommitCsvImport
}: CsvImportWizardProps) {
  if (!showCsvWizard) return null;

  return (
    <Modal
      isOpen={showCsvWizard}
      onClose={() => setShowCsvWizard(false)}
      title={csvStep === 1 ? 'Map Columns & Batch Tags' : 'Preview Import & Categorize'}
      dataTestId="csv-wizard-modal"
      maxWidth="max-w-5xl"
      className="max-h-[90vh] p-6 overflow-hidden flex flex-col"
    >
      <div className="flex justify-between items-center mb-6">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-xl bg-primary/10 text-primary">
              <Upload className="w-6 h-6" />
            </div>
            <div>
              <h2 className="text-2xl font-bold">
                {csvStep === 1 ? 'Map Columns & Batch Tags' : 'Preview Import & Categorize'}
              </h2>
              <p className="text-xs text-muted-foreground">Step {csvStep} of 2</p>
            </div>
          </div>
          <button onClick={() => setShowCsvWizard(false)} className="p-2 hover:bg-card rounded-lg text-muted-foreground hover:text-foreground transition-colors">
            <X className="w-6 h-6" />
          </button>
        </div>
        
        {csvError && (
          <div data-testid="csv-error" className="mb-4 p-4 rounded-xl bg-destructive/10 border border-destructive/20 text-destructive font-bold csv-error csv-upload-error csv-mapping-error">
            {csvError}
          </div>
        )}

        <div className="flex-1 overflow-y-auto custom-scrollbar">
          {csvStep === 1 ? (
            <div className="space-y-6">
              {handleCsvFileUpload && (
                <div className="p-4 rounded-xl bg-surface2/60 border border-border flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <p className="text-sm font-semibold text-foreground">
                      {csvRawHeaders.length > 0
                        ? `CSV loaded (${csvRawHeaders.length} columns detected)`
                        : 'Select a CSV statement file'}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {csvRawHeaders.length > 0
                        ? 'Review mapped columns below or choose another .csv file.'
                        : 'Upload a .csv export from your bank or card to populate column mappings.'}
                    </p>
                  </div>
                  <label
                    data-testid="csv-wizard-upload-btn"
                    className="px-4 py-2 rounded-xl bg-primary text-primary-foreground hover:bg-primary/90 font-semibold text-xs cursor-pointer transition-colors inline-flex items-center gap-2 shrink-0"
                  >
                    <Upload className="w-4 h-4" />
                    {csvRawHeaders.length > 0 ? 'Change CSV File' : 'Choose CSV File'}
                    <input
                      type="file"
                      accept=".csv"
                      data-testid="csv-wizard-file-input"
                      className="hidden"
                      onChange={handleCsvFileUpload}
                      onClick={(e: React.MouseEvent<HTMLInputElement>) => {
                        (e.target as HTMLInputElement).value = '';
                      }}
                    />
                  </label>
                </div>
              )}

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
                  <select value={mapDescCol} data-testid="csv-map-col-description" onChange={e => setMapDescCol(e.target.value)} className="w-full bg-card/50 border border-border rounded-xl px-4 py-2 font-medium focus:ring-2 focus:ring-primary outline-none">
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
              </div>

              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-bold text-muted-foreground mb-1">Account / Card (Optional)</label>
                  <input
                    type="text"
                    data-testid="csv-batch-account-input"
                    value={batchAccountInput}
                    onChange={e => setBatchAccountInput && setBatchAccountInput(e.target.value)}
                    placeholder="e.g. Bilt, Priyanka Chase, BofA"
                    className="w-full bg-card/50 border border-border rounded-xl px-4 py-2 font-medium focus:ring-2 focus:ring-primary outline-none"
                  />
                  <p className="text-[11px] text-muted-foreground mt-1">Stored cleanly as statement account metadata on imported rows.</p>
                </div>
                <div>
                  <label className="block text-sm font-bold text-muted-foreground mb-1">Batch Tags (Optional)</label>
                  <input
                    type="text"
                    data-testid="csv-batch-tag-input"
                    value={batchTagsInput}
                    onChange={e => setBatchTagsInput && setBatchTagsInput(e.target.value)}
                    placeholder="e.g. japan-trip, tax-2026"
                    className="w-full bg-card/50 border border-border rounded-xl px-4 py-2 font-medium focus:ring-2 focus:ring-primary outline-none"
                  />
                  <p className="text-[11px] text-muted-foreground mt-1">Optional custom tags separated by commas.</p>
                </div>
                <div>
                  <label className="block text-sm font-bold text-muted-foreground mb-1">Type Column (Optional)</label>
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
            </div>
          ) : (
            <div className="space-y-4">
              <div className="flex justify-between items-center px-1">
                <p className="text-xs text-muted-foreground">
                  Review and tweak categories and tags per item before committing import.
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
                </div>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse" data-testid="csv-preview-table">
                  <thead>
                    <tr className="border-b border-border/50 text-muted-foreground text-sm">
                      <th className="p-3 font-medium">Import</th>
                      <th className="p-3 font-medium">Date</th>
                      <th className="p-3 font-medium">Description</th>
                      <th className="p-3 font-medium">Category</th>
                      <th className="p-3 font-medium">Bucket</th>
                      <th className="p-3 font-medium">Tags</th>
                      <th className="p-3 font-medium text-right">Amount</th>
                      <th className="p-3 font-medium">Type</th>
                      <th className="p-3 font-medium">Status</th>
                    </tr>
                  </thead>
                  <tbody className="text-sm">
                    {parsedCsvItems.map((item, idx) => {
                      const isDisabled = item.isLockedMonth;
                      const itemLabels = item.labels || [];
                      return (
                        <tr key={idx} className={`border-b border-border/20 ${item.isDuplicate ? 'bg-destructive/10 csv-duplicate-row' : ''} ${item.isLockedMonth ? 'opacity-50 csv-locked-month-row' : ''}`}>
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
                                            {s.emoji} {s.name === 'Electricity' ? 'Electric Power' : s.name}
                                          </option>
                                        ))}
                                      </optgroup>
                                    );
                                  })}
                                </select>
                              );
                            })()}
                          </td>
                          <td className="p-3">
                            {item.type === 'expense' ? (
                              <select
                                value={item.spendingBucket || 'flexible'}
                                onChange={(e) => {
                                  const bucket = e.target.value as 'fixed' | 'flexible' | 'non-monthly';
                                  setParsedCsvItems(prev => {
                                    const next = [...prev];
                                    const curLabels = (next[idx].labels || []).filter(
                                      l => l !== 'fixed' && l !== 'flexible' && l !== 'non-monthly'
                                    );
                                    next[idx] = { ...next[idx], spendingBucket: bucket, labels: curLabels };
                                    return next;
                                  });
                                }}
                                className="bg-card/70 border border-border/70 rounded-lg px-2 py-1 text-xs font-semibold focus:ring-1 focus:ring-primary outline-none"
                              >
                                <option value="flexible" className="bg-card text-card-foreground">🟢 Variable</option>
                                <option value="fixed" className="bg-card text-card-foreground">🔵 Fixed</option>
                                <option value="non-monthly" className="bg-card text-card-foreground">🟠 Non-Monthly</option>
                              </select>
                            ) : (
                              <span className="text-xs text-muted-foreground">—</span>
                            )}
                          </td>
                          <td className="p-3 relative">
                            <div className="flex flex-wrap items-center gap-1">
                              {itemLabels.map((tag, tIdx) => (
                                <span
                                  key={tIdx}
                                  className="group/tag inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-surface2 text-foreground text-[10px] uppercase font-semibold tracking-wider border border-border"
                                >
                                  <span>{tag}</span>
                                  <button
                                    type="button"
                                    onClick={() => {
                                      const nextTags = itemLabels.filter((_, i) => i !== tIdx);
                                      if (updateItemTags) {
                                        updateItemTags(idx, nextTags);
                                      } else {
                                        setParsedCsvItems(prev => {
                                          const copy = [...prev];
                                          copy[idx] = { ...copy[idx], labels: nextTags };
                                          return copy;
                                        });
                                      }
                                    }}
                                    className="hover:text-destructive transition-colors"
                                  >
                                    <X className="w-2.5 h-2.5" />
                                  </button>
                                </span>
                              ))}
                            </div>
                          </td>
                          {(() => {
                            const { formattedAmount, colorClass } = formatTransactionAmount(item.amount, item.type);
                            return (
                              <td className={`p-3 text-right font-bold tabular-nums ${colorClass}`}>
                                {formattedAmount}
                              </td>
                            );
                          })()}
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
                              <span className="text-bucket-saved font-bold text-xs flex items-center gap-1"><Check className="w-3 h-3"/> OK</span>
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
              data-testid="csv-next-step-btn"
              className="px-6 py-2.5 rounded-xl bg-primary hover:opacity-90 text-primary-foreground font-semibold transition-opacity flex items-center gap-2"
            >
              Next Step
            </button>
          ) : (
            <button
              onClick={handleCommitCsvImport}
              data-testid="csv-import-btn"
              disabled={parsedCsvItems.filter(i => i.selected).length === 0}
              className="px-6 py-2.5 rounded-xl bg-primary hover:opacity-90 text-primary-foreground font-semibold transition-opacity flex items-center gap-2 disabled:opacity-50 disabled:pointer-events-none"
            >
              <Check className="w-5 h-5" /> Import Selected
            </button>
          )}
        </div>
    </Modal>
  );
}
