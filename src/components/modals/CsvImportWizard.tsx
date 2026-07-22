import { Upload, Check, X } from 'lucide-react';
import { motion } from 'framer-motion';
import { CsvItem } from '../../hooks/useCsvImport';

interface CsvImportWizardProps {
  showCsvWizard: boolean;
  csvStep: 1 | 2;
  csvError: string | null;
  csvRawHeaders: string[];
  mapDateCol: string;
  mapDescCol: string;
  mapAmountCol: string;
  mapTypeCol: string;
  parsedCsvItems: CsvItem[];
  setMapDateCol: (v: string) => void;
  setMapDescCol: (v: string) => void;
  setMapAmountCol: (v: string) => void;
  setMapTypeCol: (v: string) => void;
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
  parsedCsvItems,
  setMapDateCol,
  setMapDescCol,
  setMapAmountCol,
  setMapTypeCol,
  setParsedCsvItems,
  setShowCsvWizard,
  handleCsvNextStep,
  handleCommitCsvImport
}: CsvImportWizardProps) {
  if (!showCsvWizard) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-background/80 backdrop-blur-sm">
      <motion.div 
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.95 }}
        className="glass-panel w-full max-w-4xl max-h-[90vh] rounded-2xl p-6 overflow-hidden flex flex-col shadow-2xl"
      >
        <div className="flex justify-between items-center mb-6">
          <h2 className="text-2xl font-bold flex items-center gap-2">
            <Upload className="text-primary w-6 h-6" /> 
            {csvStep === 1 ? 'Map Columns' : 'Preview Import'}
          </h2>
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
              </div>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse" data-testid="csv-preview-table">
                <thead>
                  <tr className="border-b border-border/50 text-muted-foreground text-sm">
                    <th className="p-3 font-medium">Import</th>
                    <th className="p-3 font-medium">Date</th>
                    <th className="p-3 font-medium">Description</th>
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
                        <td className="p-3">{item.description}</td>
                        <td className={`p-3 text-right font-bold tabular-nums ${item.type === 'income' ? 'text-emerald-500' : ''}`}>
                          {item.type === 'income' ? '+' : '-'}${item.amount.toLocaleString(undefined, {minimumFractionDigits: 2})}
                        </td>
                        <td className="p-3 uppercase text-[10px] tracking-wider font-bold">{item.type}</td>
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
