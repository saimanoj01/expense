import { TrendingUp, Shield, Sparkles, PiggyBank } from 'lucide-react';
import { motion } from 'framer-motion';

interface KpiGridProps {
  totalBudget: number;
  totalExpenses: number;
  totalIncome: number;
  budgetRemaining: number;
  totalTransfers?: number;
  fixedExpenses?: number;
  flexibleExpenses?: number;
  nonMonthlyExpenses?: number;
  flexNumber?: number;
  savingsAmount?: number;
  savingsRate?: number;
}

export function KpiGrid({
  totalExpenses,
  totalIncome,
  fixedExpenses = 0,
  nonMonthlyExpenses = 0,
  flexNumber = totalIncome - fixedExpenses - nonMonthlyExpenses,
  savingsAmount = totalIncome - totalExpenses,
  savingsRate = totalIncome > 0 ? (savingsAmount / totalIncome) * 100 : 0
}: KpiGridProps) {
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
      data-testid="dashboard-header"
      variants={container}
      initial="hidden"
      animate="show"
      className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6 mb-8"
    >
      {/* 1. Total Income */}
      <motion.div variants={item} className="glass-card p-6 rounded-2xl relative overflow-hidden group border border-emerald-500/20">
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
        <p className="text-[11px] text-muted-foreground/80 mt-1 font-medium">Monthly cash inflow</p>
      </motion.div>

      {/* 2. Fixed Expenses */}
      <motion.div variants={item} className="glass-card p-6 rounded-2xl relative overflow-hidden group border border-blue-500/20">
        <div className="absolute top-0 right-0 p-4 opacity-10 transform group-hover:scale-110 transition-transform duration-500">
          <Shield className="w-16 h-16 text-blue-500" />
        </div>
        <div className="flex items-center justify-between gap-3 mb-2">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-blue-500/10 text-blue-500">
              <Shield className="w-5 h-5" />
            </div>
            <h3 className="text-sm font-medium text-muted-foreground">Fixed Expenses</h3>
          </div>
        </div>
        <div className="text-3xl font-bold tracking-tight text-blue-500" data-testid="kpi-fixed-expenses">{formatCurrency(fixedExpenses)}</div>
        <p className="text-[11px] text-muted-foreground/80 mt-1 font-medium">
          Unavoidable obligations (Mortgage, Bills)
        </p>
      </motion.div>

      {/* 3. Hero Metric: Flex Number */}
      <motion.div variants={item} className="glass-card p-6 rounded-2xl relative overflow-hidden group border-2 border-primary/50 shadow-lg shadow-primary/10">
        <div className="absolute top-0 right-0 p-4 opacity-15 transform group-hover:scale-110 transition-transform duration-500">
          <Sparkles className="w-16 h-16 text-primary" />
        </div>
        <div className="flex items-center justify-between gap-3 mb-2">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-primary/15 text-primary">
              <Sparkles className="w-5 h-5" />
            </div>
            <h3 className="text-sm font-bold text-foreground flex items-center gap-1">
              Flex Number <span className="text-[10px] bg-primary/20 text-primary px-1.5 py-0.5 rounded-full uppercase tracking-wider">Hero</span>
            </h3>
          </div>
        </div>
        <div className={`text-3xl font-extrabold tracking-tight ${flexNumber < 0 ? 'text-destructive' : 'text-primary'}`} data-testid="kpi-flex-number">
          {formatCurrency(flexNumber)}
        </div>
        <p className="text-[11px] text-muted-foreground/90 mt-1 font-medium">
          Income − Fixed & Non-Monthly (Controllable Pool)
        </p>
      </motion.div>

      {/* 4. Savings Rate & Amount */}
      <motion.div variants={item} className="glass-card p-6 rounded-2xl relative overflow-hidden group border border-purple-500/20">
        <div className="absolute top-0 right-0 p-4 opacity-10 transform group-hover:scale-110 transition-transform duration-500">
          <PiggyBank className="w-16 h-16 text-purple-500" />
        </div>
        <div className="flex items-center gap-3 mb-2">
          <div className="p-2.5 rounded-xl bg-purple-500/10 text-purple-500">
            <PiggyBank className="w-5 h-5" />
          </div>
          <h3 className="text-sm font-medium text-muted-foreground">Savings Rate</h3>
        </div>
        <div className="flex items-baseline gap-2">
          <span className={`text-3xl font-bold tracking-tight ${savingsAmount < 0 ? 'text-destructive' : 'text-purple-400'}`} data-testid="kpi-savings-amount">
            {formatCurrency(savingsAmount)}
          </span>
          <span className="text-sm font-bold text-muted-foreground" data-testid="kpi-savings-rate">
            ({savingsRate.toFixed(1)}%)
          </span>
        </div>
        <p className="text-[11px] text-muted-foreground/80 mt-1 font-medium">
          Total Net Saved after all spending
        </p>
      </motion.div>
    </motion.div>
  );
}

