import { Printer, Download, X, Calendar, ShieldCheck, Mail, Layers } from 'lucide-react';
import { Modal } from '../common/Modal';
import { CategorySummary } from '../dashboard/BudgetUtilization';
import { Transaction } from '../../services/storage';
import { escapeCsvCell } from '../../utils/csv';

interface MonthlyReportModalProps {
  isOpen: boolean;
  onClose: () => void;
  month: string;
  projectName: string;
  collaborators: string[];
  financials: {
    totalIncome: number;
    totalExpenses: number;
    fixedExpenses: number;
    flexibleExpenses: number;
    nonMonthlyExpenses: number;
    savingsAmount: number;
    savingsRate: number;
    totalBudget: number;
  };
  categories: CategorySummary[];
  transactions: Transaction[];
  isLocked?: boolean;
}

export function MonthlyReportModal({
  isOpen,
  onClose,
  month,
  projectName,
  collaborators,
  financials,
  categories,
  transactions,
  isLocked = false
}: MonthlyReportModalProps) {
  const {
    totalIncome,
    totalExpenses,
    fixedExpenses,
    flexibleExpenses,
    nonMonthlyExpenses,
    savingsAmount,
    savingsRate,
    totalBudget
  } = financials;

  const monthExpenses = transactions
    .filter(t => t.type === 'expense' && (t.date || '').startsWith(month))
    .sort((a, b) => b.amount - a.amount);

  const handlePrint = () => {
    window.print();
  };

  const handleDownloadCsv = () => {
    const headers = ['Category', 'Bucket', 'Budget Target', 'Actual Spent', 'Remaining', 'Utilization %'];
    const rows = categories
      .filter(c => !c.isNonBudgetable)
      .map(c => [
        escapeCsvCell(c.name),
        escapeCsvCell(c.bucket || 'flexible'),
        c.budget.toFixed(2),
        c.spent.toFixed(2),
        (c.budget - c.spent).toFixed(2),
        `${c.percent}%`
      ]);

    const summaryRows = [
      ['Metric', 'Amount'],
      ['Total Income / Inflow', totalIncome.toFixed(2)],
      ['Total Expenses', totalExpenses.toFixed(2)],
      ['Fixed Commitments', fixedExpenses.toFixed(2)],
      ['Flexible / Variable Spend', flexibleExpenses.toFixed(2)],
      ['Non-Monthly Amortized', nonMonthlyExpenses.toFixed(2)],
      ['Net Surplus / Savings', savingsAmount.toFixed(2)],
      ['Savings Rate', `${savingsRate}%`],
      ['Total Expense Budget', totalBudget.toFixed(2)],
      [],
      headers,
      ...rows
    ];

    const csvContent = 'data:text/csv;charset=utf-8,' + summaryRows.map(r => r.join(',')).join('\n');
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `${projectName.toLowerCase().replace(/\s+/g, '_')}_${month}_financial_report.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      dataTestId="monthly-report-modal"
      title={`Monthly Financial Report - ${month}`}
      maxWidth="max-w-3xl"
      className="p-6 max-h-[90vh] overflow-y-auto print:max-h-none print:overflow-visible print:p-0 print:border-none print:shadow-none print:bg-white print:text-black"
    >
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-4 border-b border-border/40 gap-3">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="text-xl font-bold tracking-tight text-foreground print:text-black">
              Executive Monthly Financial Report
            </h2>
            {isLocked && (
              <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider bg-rose-500/20 text-rose-400 border border-rose-500/30 flex items-center gap-1 print:border-black print:text-black">
                <ShieldCheck className="w-3 h-3" /> Locked
              </span>
            )}
          </div>
          <p className="text-xs text-muted-foreground mt-0.5 flex items-center gap-1.5 print:text-gray-600">
            <Calendar className="w-3.5 h-3.5" />
            <span>{projectName}</span>
            <span>&bull;</span>
            <span className="font-semibold">{month}</span>
          </p>
        </div>

        {/* Action Controls */}
        <div className="flex items-center gap-2 print:hidden">
          <button
            onClick={handlePrint}
            data-testid="print-report-btn"
            className="px-3 py-1.5 rounded-lg bg-card/60 hover:bg-card border border-border text-xs font-semibold flex items-center gap-1.5 transition-all"
            title="Print or Save as PDF"
          >
            <Printer className="w-3.5 h-3.5" />
            <span>Print / PDF</span>
          </button>
          <button
            onClick={handleDownloadCsv}
            data-testid="download-report-csv-btn"
            className="px-3 py-1.5 rounded-lg bg-primary hover:bg-primary/90 text-primary-foreground text-xs font-bold flex items-center gap-1.5 shadow-sm transition-all"
            title="Download CSV Summary"
          >
            <Download className="w-3.5 h-3.5" />
            <span>Export CSV</span>
          </button>
          <button
            onClick={onClose}
            data-testid="close-report-btn"
            className="p-1.5 hover:bg-card/50 rounded-lg text-muted-foreground hover:text-foreground transition-colors ml-1"
            title="Close"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Recipient / Collaborator Notice */}
      {collaborators && collaborators.length > 0 && (
        <div className="my-3 p-2.5 rounded-xl bg-card/40 border border-border/40 text-xs text-muted-foreground flex items-center gap-2 print:border-gray-300 print:text-gray-700">
          <Mail className="w-3.5 h-3.5 text-primary shrink-0" />
          <span>CC Recipients: <strong className="text-foreground print:text-black">{collaborators.join(', ')}</strong></span>
        </div>
      )}

      {/* Financial Overview Grid */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 my-4">
        <div className="p-3 rounded-xl bg-card/40 border border-border/40 print:border-gray-300">
          <span className="text-[11px] font-semibold text-muted-foreground print:text-gray-600">Total Inflow</span>
          <p className="text-lg font-bold text-emerald-400 mt-0.5 print:text-emerald-700">
            ${totalIncome.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </p>
        </div>

        <div className="p-3 rounded-xl bg-card/40 border border-border/40 print:border-gray-300">
          <span className="text-[11px] font-semibold text-muted-foreground print:text-gray-600">Total Expenses</span>
          <p className="text-lg font-bold text-rose-400 mt-0.5 print:text-rose-700">
            ${totalExpenses.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </p>
        </div>

        <div className="p-3 rounded-xl bg-card/40 border border-border/40 print:border-gray-300">
          <span className="text-[11px] font-semibold text-muted-foreground print:text-gray-600">Net Surplus</span>
          <p className={`text-lg font-bold mt-0.5 ${savingsAmount >= 0 ? 'text-teal-400 print:text-teal-700' : 'text-rose-500 print:text-rose-700'}`}>
            ${savingsAmount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </p>
        </div>

        <div className="p-3 rounded-xl bg-card/40 border border-border/40 print:border-gray-300">
          <span className="text-[11px] font-semibold text-muted-foreground print:text-gray-600">Savings Rate</span>
          <p className={`text-lg font-bold mt-0.5 ${savingsRate >= 20 ? 'text-emerald-400 print:text-emerald-700' : 'text-amber-400 print:text-amber-700'}`}>
            {savingsRate}%
          </p>
        </div>
      </div>

      {/* Spending Breakdown by Bucket */}
      <div className="my-4 p-3 rounded-xl bg-card/30 border border-border/40 print:border-gray-300">
        <h3 className="text-xs font-bold uppercase tracking-wider text-muted-foreground mb-2 flex items-center gap-1.5 print:text-gray-700">
          <Layers className="w-3.5 h-3.5 text-primary" />
          Spending Buckets
        </h3>
        <div className="grid grid-cols-3 gap-2 text-xs">
          <div className="p-2 rounded-lg bg-card/40 border border-border/30">
            <span className="text-muted-foreground font-medium block">🔵 Fixed Commitments</span>
            <span className="text-sm font-bold text-foreground mt-0.5 block print:text-black">
              ${fixedExpenses.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </span>
          </div>
          <div className="p-2 rounded-lg bg-card/40 border border-border/30">
            <span className="text-muted-foreground font-medium block">🟣 Flexible / Variable</span>
            <span className="text-sm font-bold text-foreground mt-0.5 block print:text-black">
              ${flexibleExpenses.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </span>
          </div>
          <div className="p-2 rounded-lg bg-card/40 border border-border/30">
            <span className="text-muted-foreground font-medium block">🟠 Non-Monthly</span>
            <span className="text-sm font-bold text-foreground mt-0.5 block print:text-black">
              ${nonMonthlyExpenses.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </span>
          </div>
        </div>
      </div>

      {/* Category Breakdown Table */}
      <div className="my-4 space-y-2">
        <h3 className="text-xs font-bold uppercase tracking-wider text-muted-foreground print:text-gray-700">
          Category Utilization
        </h3>
        <div className="border border-border/40 rounded-xl overflow-hidden print:border-gray-300">
          <table className="w-full text-xs text-left">
            <thead className="bg-card/60 text-muted-foreground font-semibold border-b border-border/40 print:bg-gray-100 print:text-black">
              <tr>
                <th className="p-2.5">Category</th>
                <th className="p-2.5">Bucket</th>
                <th className="p-2.5 text-right">Target</th>
                <th className="p-2.5 text-right">Spent</th>
                <th className="p-2.5 text-right">Remaining</th>
                <th className="p-2.5 text-right">Used</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/20 print:divide-gray-200">
              {categories
                .filter(c => !c.isNonBudgetable)
                .map(cat => {
                  const remaining = cat.budget - cat.spent;
                  const isOver = cat.budget > 0 && cat.spent > cat.budget;
                  return (
                    <tr key={cat.id} className="hover:bg-card/20 transition-colors">
                      <td className="p-2.5 font-medium flex items-center gap-1.5 print:text-black">
                        <span>{cat.emoji}</span>
                        <span>{cat.name}</span>
                      </td>
                      <td className="p-2.5 capitalize text-muted-foreground print:text-gray-600">
                        {cat.bucket || 'flexible'}
                      </td>
                      <td className="p-2.5 text-right font-mono print:text-black">
                        ${cat.budget.toFixed(0)}
                      </td>
                      <td className="p-2.5 text-right font-mono font-semibold print:text-black">
                        ${cat.spent.toFixed(0)}
                      </td>
                      <td className={`p-2.5 text-right font-mono ${isOver ? 'text-destructive font-bold' : 'text-muted-foreground print:text-gray-700'}`}>
                        ${remaining.toFixed(0)}
                      </td>
                      <td className="p-2.5 text-right">
                        <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${isOver ? 'bg-destructive/20 text-destructive' : 'bg-emerald-500/15 text-emerald-500'}`}>
                          {cat.percent}%
                        </span>
                      </td>
                    </tr>
                  );
                })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Top 5 Expenses */}
      {monthExpenses.length > 0 && (
        <div className="my-4 space-y-2">
          <h3 className="text-xs font-bold uppercase tracking-wider text-muted-foreground print:text-gray-700">
            Top Outflows
          </h3>
          <div className="border border-border/40 rounded-xl overflow-hidden print:border-gray-300">
            <table className="w-full text-xs text-left">
              <thead className="bg-card/60 text-muted-foreground font-semibold border-b border-border/40 print:bg-gray-100 print:text-black">
                <tr>
                  <th className="p-2.5">Date</th>
                  <th className="p-2.5">Description</th>
                  <th className="p-2.5">Category</th>
                  <th className="p-2.5 text-right">Amount</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/20 print:divide-gray-200">
                {monthExpenses.slice(0, 5).map(txn => (
                  <tr key={txn.id} className="hover:bg-card/20 transition-colors">
                    <td className="p-2.5 font-mono text-muted-foreground print:text-gray-600">{txn.date}</td>
                    <td className="p-2.5 font-medium print:text-black">{txn.description}</td>
                    <td className="p-2.5 text-muted-foreground print:text-gray-600">{txn.category}</td>
                    <td className="p-2.5 text-right font-mono font-bold text-foreground print:text-black">
                      ${txn.amount.toFixed(2)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Footer Statement */}
      <div className="pt-3 border-t border-border/40 text-[11px] text-muted-foreground flex justify-between items-center print:text-gray-500">
        <span>Generated by Nebula Expense Tracker</span>
        <span>{new Date().toLocaleDateString()}</span>
      </div>
    </Modal>
  );
}
export default MonthlyReportModal;
