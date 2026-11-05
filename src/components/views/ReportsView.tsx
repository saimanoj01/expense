import { Printer, Download, Mail, ShieldCheck, Lock } from 'lucide-react';
import { formatCurrency } from '../../utils/formatters';
import { formatMonthLabel } from '../../utils/navigation';
import { escapeCsvCell } from '../../utils/csv';
import { CategorySummary } from '../dashboard/BudgetUtilization';
import { Transaction, Project } from '../../services/storage';

export interface ReportsViewProps {
  month: string;
  project?: Project | null;
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

export function ReportsView({
  month,
  project,
  financials,
  categories,
  transactions,
  isLocked = false
}: ReportsViewProps) {
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
      .map(c => {
        const remaining = c.budget - c.spent;
        return [
          escapeCsvCell(c.name),
          escapeCsvCell(c.bucket || 'flexible'),
          c.budget.toFixed(2),
          c.spent.toFixed(2),
          remaining.toFixed(2),
          `${c.percent.toFixed(0)}%`
        ].join(',');
      });

    const csvContent = [headers.join(','), ...rows].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', `financial-report-${month}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const handleSendEmail = () => {
    // Retain mock Gmail log side-effect for automated test compatibility
    const collaborators = project?.collaborators || [];
    console.log('Gmail API Mock: Sending monthly report to', collaborators.join(', ') || 'user');
    alert(`Report email mock sent to ${collaborators.length} collaborators!`);
  };

  return (
    <div className="space-y-4" data-testid="reports-workspace">
      {/* Action Header Banner */}
      <div className="p-6 rounded-2xl bg-card/80 border border-border backdrop-blur-md shadow-sm flex flex-col md:flex-row items-start md:items-center justify-between gap-4 print:hidden">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-xl font-bold tracking-tight text-foreground flex items-center gap-2">
              Monthly Financial Statement
              {isLocked && (
                <span className="px-2 py-0.5 rounded-full text-xs font-bold bg-amber-500/10 text-amber-500 border border-amber-500/20 flex items-center gap-1" data-testid="lock-status-indicator">
                  <Lock className="w-3 h-3" /> Locked
                </span>
              )}
            </h1>
          </div>
          <p className="text-xs text-muted-foreground mt-1">
            Publication-ready accounting statement for {formatMonthLabel(month)} ({project?.name || 'Personal Finances'})
          </p>
        </div>

        {/* Action Buttons */}
        <div className="flex items-center gap-2">
          <button
            onClick={handlePrint}
            data-testid="print-report-btn"
            className="px-4 py-2 rounded-xl bg-card hover:bg-card/80 border border-border text-foreground text-xs font-bold transition-all flex items-center gap-1.5 shadow-sm active:scale-95"
          >
            <Printer className="w-4 h-4 text-primary" /> Print / Save PDF
          </button>
          <button
            onClick={handleDownloadCsv}
            data-testid="download-csv-btn"
            className="px-4 py-2 rounded-xl bg-card hover:bg-card/80 border border-border text-foreground text-xs font-bold transition-all flex items-center gap-1.5 shadow-sm active:scale-95"
          >
            <Download className="w-4 h-4 text-emerald-500" /> Export CSV
          </button>
          <button
            onClick={handleSendEmail}
            data-testid="email-report-btn"
            className="px-4 py-2 rounded-xl bg-primary hover:bg-primary/90 text-primary-foreground text-xs font-bold transition-all flex items-center gap-1.5 shadow-sm active:scale-95"
          >
            <Mail className="w-4 h-4" /> Email Statement
          </button>
        </div>
      </div>

      {/* Printable Statement Sheet */}
      <div 
        id="printable-statement" 
        className="p-8 rounded-2xl bg-card border border-border shadow-md print:border-none print:shadow-none print:p-0 space-y-6"
        data-testid="monthly-report-modal"
      >
        {/* Statement Header */}
        <div className="flex items-start justify-between border-b border-border pb-6">
          <div>
            <div className="flex items-center gap-2">
              <span className="text-2xl">✨</span>
              <h2 className="text-2xl font-black tracking-tight text-foreground">Nebula Financial Statement</h2>
            </div>
            <p className="text-sm font-semibold text-muted-foreground mt-1">
              Project: {project?.name || 'Personal Finances'} • Period: {formatMonthLabel(month)}
            </p>
          </div>
          <div className="text-right">
            <span className="text-xs text-muted-foreground font-mono">
              Generated {new Date().toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' })}
            </span>
            {isLocked ? (
              <p className="text-xs font-bold text-amber-500 mt-0.5 flex items-center justify-end gap-1">
                <ShieldCheck className="w-3.5 h-3.5" /> Certified Locked Record
              </p>
            ) : (
              <p className="text-xs font-semibold text-muted-foreground mt-0.5">
                Draft / Active Period
              </p>
            )}
          </div>
        </div>

        {/* 8-KPI Summary Grid */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          <div className="p-4 rounded-xl bg-muted/20 border border-border">
            <span className="text-[10px] text-muted-foreground uppercase font-bold">Total Inflow</span>
            <p className="text-lg font-black font-mono tabular-nums text-teal-500 mt-0.5">
              {formatCurrency(totalIncome)}
            </p>
          </div>
          <div className="p-4 rounded-xl bg-muted/20 border border-border">
            <span className="text-[10px] text-muted-foreground uppercase font-bold">Total Outflow</span>
            <p className="text-lg font-black font-mono tabular-nums text-foreground mt-0.5">
              {formatCurrency(totalExpenses)}
            </p>
          </div>
          <div className="p-4 rounded-xl bg-muted/20 border border-border">
            <span className="text-[10px] text-muted-foreground uppercase font-bold">Net Saved</span>
            <p className={`text-lg font-black font-mono tabular-nums mt-0.5 ${savingsAmount >= 0 ? 'text-emerald-500' : 'text-rose-500'}`}>
              {formatCurrency(savingsAmount)}
            </p>
          </div>
          <div className="p-4 rounded-xl bg-muted/20 border border-border">
            <span className="text-[10px] text-muted-foreground uppercase font-bold">Savings Rate</span>
            <p className="text-lg font-black font-mono tabular-nums text-primary mt-0.5">
              {savingsRate.toFixed(1)}%
            </p>
          </div>
          <div className="p-4 rounded-xl bg-muted/20 border border-border">
            <span className="text-[10px] text-muted-foreground uppercase font-bold">Fixed Commitments</span>
            <p className="text-base font-extrabold font-mono tabular-nums text-indigo-500 mt-0.5">
              {formatCurrency(fixedExpenses)}
            </p>
          </div>
          <div className="p-4 rounded-xl bg-muted/20 border border-border">
            <span className="text-[10px] text-muted-foreground uppercase font-bold">Variable Spending</span>
            <p className="text-base font-extrabold font-mono tabular-nums text-purple-500 mt-0.5">
              {formatCurrency(flexibleExpenses)}
            </p>
          </div>
          <div className="p-4 rounded-xl bg-muted/20 border border-border">
            <span className="text-[10px] text-muted-foreground uppercase font-bold">Non-Monthly Irregular</span>
            <p className="text-base font-extrabold font-mono tabular-nums text-amber-500 mt-0.5">
              {formatCurrency(nonMonthlyExpenses)}
            </p>
          </div>
          <div className="p-4 rounded-xl bg-muted/20 border border-border">
            <span className="text-[10px] text-muted-foreground uppercase font-bold">Budget Target</span>
            <p className="text-base font-extrabold font-mono tabular-nums text-muted-foreground mt-0.5">
              {formatCurrency(totalBudget)}
            </p>
          </div>
        </div>

        {/* Category Breakdown Table */}
        <div>
          <h3 className="text-sm font-bold uppercase tracking-wider text-muted-foreground mb-3">
            Category Breakdown & Performance
          </h3>
          <div className="overflow-x-auto rounded-xl border border-border">
            <table className="w-full text-left text-xs">
              <thead className="bg-muted/40 text-muted-foreground uppercase font-bold border-b border-border">
                <tr>
                  <th className="py-2.5 px-3">Category</th>
                  <th className="py-2.5 px-3">Bucket</th>
                  <th className="py-2.5 px-3 text-right">Target</th>
                  <th className="py-2.5 px-3 text-right">Actual</th>
                  <th className="py-2.5 px-3 text-right">Remaining</th>
                  <th className="py-2.5 px-3 text-right">Util %</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/50">
                {categories.filter(c => !c.isNonBudgetable).map(c => {
                  const rem = c.budget - c.spent;
                  return (
                    <tr key={c.id} className="hover:bg-muted/20">
                      <td className="py-2 px-3 font-semibold text-foreground flex items-center gap-2">
                        <span>{c.emoji || '🏷️'}</span> {c.name}
                      </td>
                      <td className="py-2 px-3 text-muted-foreground capitalize">
                        {c.bucket || 'flexible'}
                      </td>
                      <td className="py-2 px-3 text-right font-mono tabular-nums text-muted-foreground">
                        {formatCurrency(c.budget)}
                      </td>
                      <td className="py-2 px-3 text-right font-mono tabular-nums font-bold text-foreground">
                        {formatCurrency(c.spent)}
                      </td>
                      <td className={`py-2 px-3 text-right font-mono tabular-nums font-bold ${rem >= 0 ? 'text-emerald-500' : 'text-rose-500'}`}>
                        {formatCurrency(rem)}
                      </td>
                      <td className="py-2 px-3 text-right font-mono tabular-nums">
                        {c.percent.toFixed(0)}%
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>

        {/* Top Expenses List */}
        <div>
          <h3 className="text-sm font-bold uppercase tracking-wider text-muted-foreground mb-3">
            Top Outflows ({Math.min(monthExpenses.length, 5)} Largest)
          </h3>
          <div className="space-y-2">
            {monthExpenses.slice(0, 5).map((txn, idx) => (
              <div key={txn.id || idx} className="flex items-center justify-between p-3 rounded-xl bg-muted/20 border border-border/50 text-xs">
                <div className="flex items-center gap-3">
                  <span className="font-bold font-mono text-muted-foreground">{idx + 1}.</span>
                  <div>
                    <p className="font-bold text-foreground">{txn.description}</p>
                    <p className="text-[10px] text-muted-foreground">{txn.date} • {txn.category}</p>
                  </div>
                </div>
                <span className="font-extrabold font-mono tabular-nums text-foreground">
                  {formatCurrency(txn.amount)}
                </span>
              </div>
            ))}
            {monthExpenses.length === 0 && (
              <p className="text-xs text-muted-foreground italic">No expense transactions recorded for this period.</p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

export default ReportsView;
