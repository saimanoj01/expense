import { Coins, TrendingUp, TrendingDown, DollarSign } from 'lucide-react';
import { motion } from 'framer-motion';

interface KpiGridProps {
  totalBudget: number;
  totalExpenses: number;
  totalIncome: number;
  budgetRemaining: number;
  totalTransfers?: number;
}

export function KpiGrid({ totalBudget, totalExpenses, totalIncome, budgetRemaining, totalTransfers = 0 }: KpiGridProps) {
  const formatCurrency = (val: number) => 
    val.toLocaleString('en-US', { style: 'currency', currency: 'USD' });

  const container = {
    hidden: { opacity: 0 },
    show: {
      opacity: 1,
      transition: {
        staggerChildren: 0.1
      }
    }
  };

  const item = {
    hidden: { opacity: 0, y: 20 },
    show: { opacity: 1, y: 0, transition: { type: 'spring' as const, stiffness: 300, damping: 24 } }
  };

  return (
    <motion.div 
      variants={container}
      initial="hidden"
      animate="show"
      className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6 mb-8"
    >
      <motion.div variants={item} className="glass-card p-6 rounded-2xl relative overflow-hidden group">
        <div className="absolute top-0 right-0 p-4 opacity-10 transform group-hover:scale-110 transition-transform duration-500">
          <Coins className="w-16 h-16 text-primary" />
        </div>
        <div className="flex items-center gap-3 mb-2">
          <div className="p-2.5 rounded-xl bg-primary/10 text-primary">
            <Coins className="w-5 h-5" />
          </div>
          <h3 className="text-sm font-medium text-muted-foreground">Total Budget</h3>
        </div>
        <div className="text-3xl font-bold tracking-tight" data-testid="kpi-total-budget">{formatCurrency(totalBudget)}</div>
      </motion.div>

      <motion.div variants={item} className="glass-card p-6 rounded-2xl relative overflow-hidden group">
        <div className="absolute top-0 right-0 p-4 opacity-10 transform group-hover:scale-110 transition-transform duration-500">
          <TrendingDown className="w-16 h-16 text-destructive" />
        </div>
        <div className="flex items-center justify-between gap-3 mb-2">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-destructive/10 text-destructive">
              <TrendingDown className="w-5 h-5" />
            </div>
            <h3 className="text-sm font-medium text-muted-foreground">Total Expenses</h3>
          </div>
        </div>
        <div className="text-3xl font-bold tracking-tight text-destructive" data-testid="kpi-total-expenses">{formatCurrency(totalExpenses)}</div>
        {totalTransfers > 0 && (
          <p className="text-[11px] text-muted-foreground/80 mt-1 font-medium">
            Excludes {formatCurrency(totalTransfers)} in Transfers/Payments
          </p>
        )}
      </motion.div>

      <motion.div variants={item} className="glass-card p-6 rounded-2xl relative overflow-hidden group">
        <div className="absolute top-0 right-0 p-4 opacity-10 transform group-hover:scale-110 transition-transform duration-500">
          <TrendingUp className="w-16 h-16 text-emerald-500" />
        </div>
        <div className="flex items-center gap-3 mb-2">
          <div className="p-2.5 rounded-xl bg-emerald-500/10 text-emerald-500">
            <TrendingUp className="w-5 h-5" />
          </div>
          <h3 className="text-sm font-medium text-muted-foreground">Total Income</h3>
        </div>
        <div className="text-3xl font-bold tracking-tight text-emerald-500" data-testid="kpi-total-income">{formatCurrency(totalIncome)}</div>
      </motion.div>

      <motion.div variants={item} className="glass-card p-6 rounded-2xl relative overflow-hidden group">
        <div className="absolute top-0 right-0 p-4 opacity-10 transform group-hover:scale-110 transition-transform duration-500">
          <DollarSign className="w-16 h-16 text-secondary" />
        </div>
        <div className="flex items-center gap-3 mb-2">
          <div className="p-2.5 rounded-xl bg-secondary/10 text-secondary">
            <DollarSign className="w-5 h-5" />
          </div>
          <h3 className="text-sm font-medium text-muted-foreground">Remaining Budget</h3>
        </div>
        <div className={`text-3xl font-bold tracking-tight ${budgetRemaining < 0 ? 'text-destructive' : ''}`} data-testid="kpi-budget-remaining">
          {formatCurrency(budgetRemaining)}
        </div>
      </motion.div>
    </motion.div>
  );
}
