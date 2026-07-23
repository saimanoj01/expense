import { TrendingDown } from 'lucide-react';
import { motion } from 'framer-motion';

interface TrendChartProps {
  trendPathData: string;
}

export function TrendChart({ trendPathData }: TrendChartProps) {
  return (
    <motion.div 
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ delay: 0.2 }}
      className="glass-card p-6 rounded-2xl flex-1 flex flex-col"
    >
      <div className="flex items-center gap-3 mb-6">
        <div className="p-2 rounded-xl bg-secondary/10 text-secondary">
          <TrendingDown className="w-5 h-5" />
        </div>
        <h3 className="text-lg font-bold">Expense Trend</h3>
      </div>
      <div className="flex-1 min-h-[200px] flex items-center justify-center relative overflow-hidden">
        <svg viewBox="0 0 300 150" data-testid="chart-svg-trend" className="w-full h-full overflow-hidden drop-shadow-md">
          {/* Subtle grid lines */}
          <line x1="0" y1="25" x2="300" y2="25" stroke="currentColor" className="text-border/30" strokeWidth="1" strokeDasharray="4 4" />
          <line x1="0" y1="75" x2="300" y2="75" stroke="currentColor" className="text-border/30" strokeWidth="1" strokeDasharray="4 4" />
          <line x1="0" y1="125" x2="300" y2="125" stroke="currentColor" className="text-border/30" strokeWidth="1" strokeDasharray="4 4" />
          
          <motion.path
            key={trendPathData}
            initial={{ pathLength: 0 }}
            animate={{ pathLength: 1 }}
            transition={{ duration: 1.5, ease: "easeInOut" }}
            d={trendPathData || "M 0 150 L 300 150"}
            fill="none"
            stroke="currentColor"
            className="text-primary drop-shadow-[0_0_8px_rgba(20,184,166,0.5)]"
            strokeWidth="3"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </div>
    </motion.div>
  );
}
