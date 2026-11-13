import { useMemo } from 'react';
import { Printer, Download, ShieldCheck, Lock } from 'lucide-react';
import { formatCurrency } from '../../utils/formatters';
import { formatMonthLabel } from '../../utils/navigation';
import { buildTransactionsCsvExport, escapeCsvCell } from '../../utils/csv';
import { isRefundTransaction } from '../../utils/metrics';
import { BUCKETS } from '../../theme/buckets';
import { triggerFileDownload } from '../../utils/workspacePortability';
import type { CategorySummary } from '../dashboard/BudgetUtilization';
import { DEFAULT_CATEGORIES, type Transaction, type Project, type Category } from '../../services/storage';

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
  rawCategories?: Category[];
  transactions: Transaction[];
  activeMonthsCount?: number;
  isLocked?: boolean;
}

export function ReportsView({
  month,
  project,
  financials,
  categories,
  rawCategories = [],
  transactions,
  activeMonthsCount = 1,
  isLocked = false,
}: ReportsViewProps) {
  const {
    totalIncome,
    totalExpenses,
    fixedExpenses,
    flexibleExpenses,
    nonMonthlyExpenses,
    savingsAmount,
    savingsRate,
    totalBudget,
  } = financials;

  const isAllTime = month === 'all';
  const periodMultiplier = isAllTime ? Math.max(1, activeMonthsCount || 1) : 1;
  const effectiveTotalBudget = totalBudget * periodMultiplier;

  const allKnownCategories = useMemo(() => {
    const map = new Map<string, Category>();
    DEFAULT_CATEGORIES.forEach(c => map.set(c.id, c));
    rawCategories.forEach(c => map.set(c.id, c));
    return Array.from(map.values());
  }, [rawCategories]);

  const periodTransactions = useMemo(() => {
    return transactions.filter(t => isAllTime || (t.date || '').startsWith(month));
  }, [transactions, month, isAllTime]);

  const periodExpenses = useMemo(() => {
    return periodTransactions
      .filter(t => t.type === 'expense')
      .sort((a, b) => (Number(b.amount) || 0) - (Number(a.amount) || 0));
  }, [periodTransactions]);

  const refundTotal = useMemo(() => {
    return periodTransactions
      .filter(t => isRefundTransaction(t))
      .reduce((sum, t) => sum + Math.abs(Number(t.amount) || 0), 0);
  }, [periodTransactions]);

  const budgetableRows = useMemo(() => {
    return categories
      .filter(c => !c.isNonBudgetable && (c.spent > 0 || c.budget > 0))
      .map(c => {
        const scaledBudget = c.budget * periodMultiplier;
        const remaining = scaledBudget - c.spent;
        const utilPct = scaledBudget > 0 ? (c.spent / scaledBudget) * 100 : 0;
        const bucketKey = c.bucket || 'flexible';
        const bucketLabel = BUCKETS[bucketKey]?.label || 'Variable';
        return {
          ...c,
          scaledBudget,
          remaining,
          utilPct,
          bucketLabel,
        };
      })
      .sort((a, b) => b.spent - a.spent || b.scaledBudget - a.scaledBudget);
  }, [categories, periodMultiplier]);

  const resolveCategoryLabel = (rawCat?: string, rawSubCat?: string | null): string => {
    if (rawSubCat) {
      const sub = allKnownCategories.find(c => c.id === rawSubCat);
      if (sub) {
        const parent = sub.parentId
          ? allKnownCategories.find(p => p.id === sub.parentId)
          : undefined;
        return parent ? `${parent.name} › ${sub.name}` : sub.name;
      }
    }
    if (!rawCat) return 'Uncategorized';
    const match = allKnownCategories.find(
      c => c.id.toLowerCase() === rawCat.toLowerCase() || c.name.toLowerCase() === rawCat.toLowerCase()
    );
    return match ? match.name : rawCat;
  };

  const handlePrint = () => {
    window.print();
  };

  const handleDownloadSummaryCsv = () => {
    const headers = [
      'Category',
      'Bucket',
      isAllTime ? `Budget Target (${periodMultiplier}m)` : 'Budget Target',
      'Actual Spent',
      'Remaining',
      'Utilization %',
    ];
    const rows = budgetableRows.map(c =>
      [
        escapeCsvCell(c.name),
        escapeCsvCell(c.bucketLabel),
        c.scaledBudget > 0 ? c.scaledBudget.toFixed(2) : '—',
        c.spent.toFixed(2),
        c.scaledBudget > 0 ? c.remaining.toFixed(2) : '—',
        c.scaledBudget > 0 ? `${c.utilPct.toFixed(0)}%` : '—',
      ].join(',')
    );

    const csvContent = [headers.join(','), ...rows].join('\n');
    triggerFileDownload(
      csvContent,
      `financial-report-${month}.csv`,
      'text/csv;charset=utf-8;'
    );
  };

  const handleDownloadLedgerCsv = () => {
    const sorted = [...periodTransactions].sort(
      (a, b) => (a.date || '').localeCompare(b.date || '') || (a.id || '').localeCompare(b.id || '')
    );
    const csvContent = buildTransactionsCsvExport(sorted, allKnownCategories);
    triggerFileDownload(
      csvContent,
      `financial-transactions-${month}.csv`,
      'text/csv;charset=utf-8;'
    );
  };

  const periodDisplayLabel = formatMonthLabel(month);

  return (
    <div className="max-w-5xl mx-auto space-y-5 pb-8 print:pb-0" data-testid="reports-workspace">
      {/* Action Header Banner (hidden in print) */}
      <div className="p-5 rounded-[14px] bg-card border border-border flex flex-col md:flex-row items-start md:items-center justify-between gap-4 print:hidden">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-title text-foreground flex items-center gap-2">
              {isAllTime ? 'All-Time Financial Statement' : 'Monthly Financial Statement'}
              {isLocked && !isAllTime && (
                <span
                  className="px-2 py-0.5 rounded-full text-label font-medium bg-warning/15 text-warning border border-warning/30 inline-flex items-center gap-1"
                  data-testid="report-lock-badge"
                >
                  <Lock className="w-3 h-3" /> Locked
                </span>
              )}
            </h1>
          </div>
          <p className="text-label text-muted-foreground mt-0.5">
            Publication-ready accounting statement for {periodDisplayLabel} ({project?.name || 'Personal Finances'})
          </p>
        </div>

        {/* Action Buttons */}
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={handlePrint}
            data-testid="print-report-btn"
            className="px-3.5 py-2 rounded-[10px] bg-primary text-primary-foreground hover:opacity-90 text-label font-semibold transition-opacity inline-flex items-center gap-1.5"
          >
            <Printer className="w-4 h-4" /> Print / Save PDF
          </button>
          <button
            type="button"
            onClick={handleDownloadSummaryCsv}
            data-testid="download-csv-btn"
            className="px-3.5 py-2 rounded-[10px] bg-surface2 hover:bg-secondary border border-border text-foreground text-label font-medium transition-colors inline-flex items-center gap-1.5"
          >
            <Download className="w-4 h-4 text-muted-foreground" /> Summary CSV
          </button>
          <button
            type="button"
            disabled={periodTransactions.length === 0}
            onClick={handleDownloadLedgerCsv}
            data-testid="download-ledger-csv-btn"
            className="px-3.5 py-2 rounded-[10px] bg-surface2 hover:bg-secondary border border-border text-foreground text-label font-medium transition-colors inline-flex items-center gap-1.5 disabled:opacity-50"
          >
            <Download className="w-4 h-4 text-muted-foreground" /> Transactions CSV
          </button>
        </div>
      </div>

      {/* Printable Statement Sheet (Zero nested bordered cards inside monthly-report-sheet) */}
      <div
        id="printable-statement"
        className="p-6 sm:p-8 rounded-[14px] bg-card border border-border print:border-none print:shadow-none print:p-0 space-y-6"
        data-testid="monthly-report-sheet"
      >
        {/* Statement Header */}
        <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3 border-b border-border pb-5">
          <div>
            <h2 className="text-title font-semibold tracking-tight text-foreground">
              Nebula Financial Statement
            </h2>
            <p className="text-body text-muted-foreground mt-1">
              Workspace: <strong className="text-foreground font-medium">{project?.name || 'Personal Finances'}</strong> · Period:{' '}
              <strong className="text-foreground font-medium">
                {periodDisplayLabel}
                {isAllTime ? ` (${periodMultiplier} active month${periodMultiplier === 1 ? '' : 's'})` : ''}
              </strong>
            </p>
          </div>
          <div className="sm:text-right tabular-nums num">
            <span className="text-label text-muted-foreground">
              Generated{' '}
              {new Date().toLocaleDateString('en-US', {
                year: 'numeric',
                month: 'short',
                day: 'numeric',
              })}
            </span>
            {isLocked && !isAllTime ? (
              <p className="text-label font-medium text-warning mt-0.5 inline-flex sm:flex items-center sm:justify-end gap-1">
                <ShieldCheck className="w-3.5 h-3.5" /> Certified Locked Record
              </p>
            ) : (
              <p className="text-label text-muted-foreground mt-0.5">
                {isAllTime ? 'Cumulative Ledger Summary' : 'Active Statement'}
              </p>
            )}
          </div>
        </div>

        {/* 8-KPI Summary Grid (Flat borderless surface2 cells — zero nested borders, zero purple, zero font-mono) */}
        <div className="grid grid-cols-2 lg:grid-cols-4 print:grid-cols-4 gap-3">
          <div className="p-3.5 rounded-[10px] bg-surface2">
            <span className="text-eyebrow uppercase text-muted-foreground">Total Inflow</span>
            <p className="text-heading sm:text-title font-semibold tabular-nums num text-bucket-saved mt-0.5">
              {formatCurrency(totalIncome)}
            </p>
          </div>

          <div className="p-3.5 rounded-[10px] bg-surface2">
            <span className="text-eyebrow uppercase text-muted-foreground">Total Outflow</span>
            <p className="text-heading sm:text-title font-semibold tabular-nums num text-foreground mt-0.5">
              {formatCurrency(totalExpenses)}
            </p>
            {refundTotal > 0 && (
              <p className="text-label text-muted-foreground tabular-nums num mt-0.5">
                Net of {formatCurrency(refundTotal)} refunds
              </p>
            )}
          </div>

          <div className="p-3.5 rounded-[10px] bg-surface2">
            <span className="text-eyebrow uppercase text-muted-foreground">Net Saved</span>
            <p
              className={`text-heading sm:text-title font-semibold tabular-nums num mt-0.5 ${
                savingsAmount >= 0 ? 'text-bucket-saved' : 'text-negative'
              }`}
            >
              {formatCurrency(savingsAmount)}
            </p>
          </div>

          <div className="p-3.5 rounded-[10px] bg-surface2">
            <span className="text-eyebrow uppercase text-muted-foreground">Savings Rate</span>
            <p className="text-heading sm:text-title font-semibold tabular-nums num text-foreground mt-0.5">
              {totalIncome <= 0 && totalExpenses > 0
                ? 'No income'
                : totalIncome <= 0 && totalExpenses <= 0
                ? '—'
                : `${savingsRate.toFixed(1)}%`}
            </p>
          </div>

          <div className="p-3.5 rounded-[10px] bg-surface2">
            <span className="text-eyebrow uppercase text-muted-foreground">Fixed Bills</span>
            <p className="text-heading font-semibold tabular-nums num text-bucket-fixed mt-0.5">
              {formatCurrency(fixedExpenses)}
            </p>
          </div>

          <div className="p-3.5 rounded-[10px] bg-surface2">
            <span className="text-eyebrow uppercase text-muted-foreground">Variable Spend</span>
            <p className="text-heading font-semibold tabular-nums num text-bucket-variable mt-0.5">
              {formatCurrency(flexibleExpenses)}
            </p>
          </div>

          <div className="p-3.5 rounded-[10px] bg-surface2">
            <span className="text-eyebrow uppercase text-muted-foreground">Non-Monthly</span>
            <p className="text-heading font-semibold tabular-nums num text-bucket-nonmonthly mt-0.5">
              {formatCurrency(nonMonthlyExpenses)}
            </p>
          </div>

          <div className="p-3.5 rounded-[10px] bg-surface2">
            <span className="text-eyebrow uppercase text-muted-foreground">
              {isAllTime ? `Budget (${periodMultiplier}m)` : 'Budget Target'}
            </span>
            <p className="text-heading font-semibold tabular-nums num text-muted-foreground mt-0.5">
              {formatCurrency(effectiveTotalBudget)}
            </p>
          </div>
        </div>

        {/* Category Breakdown Table */}
        <div className="space-y-2.5 pt-2">
          <h3 className="text-eyebrow uppercase text-muted-foreground">
            Category Breakdown & Performance
          </h3>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-label">
              <thead className="text-muted-foreground uppercase text-eyebrow border-b border-border">
                <tr>
                  <th className="py-2.5 pr-3">Category</th>
                  <th className="py-2.5 px-3">Bucket</th>
                  <th className="py-2.5 px-3 text-right">
                    {isAllTime ? `Target (${periodMultiplier}m)` : 'Target'}
                  </th>
                  <th className="py-2.5 px-3 text-right">Actual</th>
                  <th className="py-2.5 px-3 text-right">Remaining</th>
                  <th className="py-2.5 pl-3 text-right">Util %</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/60">
                {budgetableRows.length === 0 ? (
                  <tr>
                    <td
                      colSpan={6}
                      className="py-6 text-center text-label text-muted-foreground"
                    >
                      No category spend or budgets recorded for this period.
                    </td>
                  </tr>
                ) : (
                  budgetableRows.map(c => (
                    <tr key={c.id} className="hover:bg-surface2/50">
                      <td className="py-2.5 pr-3 font-medium text-foreground">
                        <span className="inline-flex items-center gap-2">
                          <span>{c.emoji || '🏷️'}</span>
                          <span>{c.name}</span>
                        </span>
                      </td>
                      <td className="py-2.5 px-3 text-muted-foreground">{c.bucketLabel}</td>
                      <td className="py-2.5 px-3 text-right tabular-nums num text-muted-foreground">
                        {c.scaledBudget > 0 ? formatCurrency(c.scaledBudget) : '—'}
                      </td>
                      <td className="py-2.5 px-3 text-right tabular-nums num font-semibold text-foreground">
                        {formatCurrency(c.spent)}
                      </td>
                      <td
                        className={`py-2.5 px-3 text-right tabular-nums num font-medium ${
                          c.scaledBudget <= 0
                            ? 'text-muted-foreground'
                            : c.remaining >= 0
                            ? 'text-bucket-saved'
                            : 'text-negative'
                        }`}
                      >
                        {c.scaledBudget > 0 ? formatCurrency(c.remaining) : '—'}
                      </td>
                      <td className="py-2.5 pl-3 text-right tabular-nums num text-muted-foreground">
                        {c.scaledBudget > 0 ? `${c.utilPct.toFixed(0)}%` : '—'}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Top Outflows List (Hairline divided rows — zero nested bordered cards) */}
        <div className="space-y-2.5 pt-2 border-t border-border">
          <h3 className="text-eyebrow uppercase text-muted-foreground">
            Top Outflows ({Math.min(periodExpenses.length, 5)} Largest)
          </h3>
          {periodExpenses.length === 0 ? (
            <p className="text-label text-muted-foreground py-2">
              No expense transactions recorded for this period.
            </p>
          ) : (
            <div className="divide-y divide-border/60">
              {periodExpenses.slice(0, 5).map((txn, idx) => (
                <div
                  key={txn.id || idx}
                  data-testid={`report-top-outflow-${idx}`}
                  className="py-2.5 flex items-center justify-between gap-3 text-body"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <span className="text-label font-medium tabular-nums num text-muted-foreground w-5 shrink-0">
                      {idx + 1}.
                    </span>
                    <div className="min-w-0">
                      <p className="font-medium text-foreground truncate">{txn.description}</p>
                      <p className="text-label text-muted-foreground tabular-nums num truncate">
                        {txn.date} · {resolveCategoryLabel(txn.category, txn.subCategory)}
                      </p>
                    </div>
                  </div>
                  <span className="font-semibold tabular-nums num text-foreground shrink-0">
                    {formatCurrency(txn.amount)}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default ReportsView;
