import { useState, useEffect } from 'react';
import { TrendingDown, Calendar, DollarSign, Info, Sparkles, BarChart3, LineChart, AlertTriangle, ArrowUpRight, ArrowDownRight, RefreshCw, Key } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { TrendChartDetails, CumulativePacingPoint, MonthlyCashFlow } from '../../hooks/useTransactions';
import { generateSpendingInsights, AiInsightsResult } from '../../services/ai/aiInsightsService';
import { hasGeminiApiKey } from '../../services/ai/geminiClient';
import { Category, Budget, Transaction } from '../../services/storage';
import { useMemo } from 'react';

interface TrendChartProps {
  trendDetails?: TrendChartDetails;
  totalBudget?: number;
  budgets?: Budget[];
  categories?: Category[];
  transactions?: Transaction[];
  selectedMonth?: string;
  onSelectMonth?: (month: string) => void;
  onRequestGeminiKey?: () => void;
}

type ViewTab = 'pacing' | 'cashflow' | 'ai';

export function TrendChart({
  trendDetails,
  totalBudget = 0,
  budgets = [],
  categories = [],
  transactions = [],
  selectedMonth = '2026-07',
  onSelectMonth,
  onRequestGeminiKey
}: TrendChartProps) {
  const [activeTab, setActiveTab] = useState<ViewTab>('pacing');
  const [hoveredCumulativePoint, setHoveredCumulativePoint] = useState<CumulativePacingPoint | null>(null);
  const [hoveredCashFlowMonth, setHoveredCashFlowMonth] = useState<MonthlyCashFlow | null>(null);

  // AI Insights State
  const [aiResult, setAiResult] = useState<AiInsightsResult | null>(null);
  const [isGeneratingAi, setIsGeneratingAi] = useState(false);
  const [aiError, setAiError] = useState<string | null>(null);

  // Auto-switch to cashflow tab if user selects 'all' months
  useEffect(() => {
    if (selectedMonth === 'all') {
      setActiveTab('cashflow');
    }
  }, [selectedMonth]);

  const handleGenerateAiInsights = async () => {
    if (!hasGeminiApiKey()) {
      if (onRequestGeminiKey) onRequestGeminiKey();
      return;
    }

    setIsGeneratingAi(true);
    setAiError(null);

    try {
      const res = await generateSpendingInsights({
        transactions,
        categories,
        budgets,
        selectedMonth,
        totalBudget
      });
      setAiResult(res);
    } catch (err: any) {
      console.error('Failed to generate AI insights:', err);
      setAiError(err.message || 'Failed to generate AI insights. Please check your API key.');
    } finally {
      setIsGeneratingAi(false);
    }
  };

  if (!trendDetails) {
    return (
      <motion.div 
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        className="glass-card p-6 rounded-2xl flex-1 flex flex-col justify-between min-h-[320px]"
      >
        <div className="flex items-center gap-3 mb-4">
          <div className="p-2 rounded-xl bg-secondary/10 text-secondary">
            <TrendingDown className="w-5 h-5" />
          </div>
          <div>
            <h3 className="text-lg font-bold">Expense Trend & Insights</h3>
            <p className="text-xs text-muted-foreground">Financial analytics dashboard</p>
          </div>
        </div>
        <div className="flex-1 flex flex-col items-center justify-center text-center p-8 border border-dashed border-border/50 rounded-xl">
          <Info className="w-8 h-8 text-muted-foreground mb-2 opacity-50" />
          <p className="text-sm font-medium text-muted-foreground">No expense data available for this view.</p>
          <p className="text-xs text-muted-foreground/70 mt-1">Add transactions or change filters to view spending trends.</p>
        </div>
      </motion.div>
    );
  }

  const {
    cumulativePoints,
    cumulativePathData,
    cumulativeAreaPathData,
    prevMonthCumulativePoints,
    prevMonthPathData,
    highestSpendDay,
    dailyAvg,
    eomProjection,
    daysInMonth,
    monthlyCashFlows,
    avgMonthlySavings,
    overallSavingsRate,
    bestCashFlowMonth,
    maxCashFlowValue,
    yTicks,
    maxAmt: range
  } = trendDetails;

  // Compute ideal pacing line and pacing status from totalBudget prop
  const effectiveRange = Math.max(range, totalBudget ? totalBudget * 1.1 : 0);

  const idealPacingPathData = useMemo(() => {
    if (!totalBudget || totalBudget <= 0) return '';
    const width = 500;
    const height = 200;
    const paddingLeft = 55;
    const paddingRight = 25;
    const paddingTop = 25;
    const paddingBottom = 35;
    const chartWidth = width - paddingLeft - paddingRight;
    const chartHeight = height - paddingTop - paddingBottom;
    const coords: string[] = [];
    for (let d = 1; d <= daysInMonth; d++) {
      const idealCum = (totalBudget / daysInMonth) * d;
      const x = paddingLeft + ((d - 1) / Math.max(daysInMonth - 1, 1)) * chartWidth;
      const norm = idealCum / effectiveRange;
      const y = height - paddingBottom - Math.max(0, Math.min(1, norm)) * chartHeight;
      coords.push(`${x.toFixed(1)} ${y.toFixed(1)}`);
    }
    return `M ${coords.join(' L ')}`;
  }, [totalBudget, daysInMonth, effectiveRange]);

  const pacingStatus = useMemo(() => {
    if (totalBudget <= 0) return 'on_track' as const;
    if (eomProjection > totalBudget * 1.05) return 'over_budget' as const;
    if (eomProjection < totalBudget * 0.92) return 'under_budget' as const;
    return 'on_track' as const;
  }, [eomProjection, totalBudget]);

  return (
    <motion.div 
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ delay: 0.2 }}
      className="glass-card p-6 rounded-2xl flex-1 flex flex-col relative"
    >
      {/* Top Header & View Tabs */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
        <div className="flex items-center gap-3">
          <div className="p-2.5 rounded-xl bg-secondary/10 text-secondary shadow-sm">
            <TrendingDown className="w-5 h-5" />
          </div>
          <div>
            <h3 className="text-lg font-bold tracking-tight">Expense Trend & Insights</h3>
            <p className="text-xs text-muted-foreground">Track velocity, cash flow & AI intelligent analysis</p>
          </div>
        </div>

        {/* Tab Switcher */}
        <div className="flex items-center p-1 bg-card/60 border border-border/60 rounded-xl">
          <button
            onClick={() => setActiveTab('pacing')}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-all ${
              activeTab === 'pacing'
                ? 'bg-primary text-primary-foreground shadow-md'
                : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            <LineChart className="w-3.5 h-3.5" />
            <span>Monthly Pacing</span>
          </button>

          <button
            onClick={() => setActiveTab('cashflow')}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-all ${
              activeTab === 'cashflow'
                ? 'bg-primary text-primary-foreground shadow-md'
                : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            <BarChart3 className="w-3.5 h-3.5" />
            <span>Annual Cash Flow</span>
          </button>

          <button
            onClick={() => setActiveTab('ai')}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-all ${
              activeTab === 'ai'
                ? 'bg-gradient-to-r from-teal-500 to-emerald-500 text-white shadow-md'
                : 'text-teal-400 hover:text-teal-300'
            }`}
          >
            <Sparkles className="w-3.5 h-3.5 animate-pulse" />
            <span>AI Insights</span>
          </button>
        </div>
      </div>

      {/* TAB 1: MONTHLY CUMULATIVE PACING VIEW */}
      {activeTab === 'pacing' && (
        <div className="flex-1 flex flex-col justify-between">
          {/* Quick Stat Badges */}
          <div className="flex flex-wrap items-center justify-between gap-2 mb-4">
            <div className="flex flex-wrap items-center gap-2">
              {highestSpendDay && (
                <div className="px-3 py-1.5 rounded-lg bg-card/60 border border-border/60 flex items-center gap-2 text-xs">
                  <Calendar className="w-3.5 h-3.5 text-primary" />
                  <span className="text-muted-foreground">Peak:</span>
                  <span className="font-semibold text-foreground">{highestSpendDay.formattedDate} (${highestSpendDay.amount.toLocaleString()})</span>
                </div>
              )}
              <div className="px-3 py-1.5 rounded-lg bg-card/60 border border-border/60 flex items-center gap-2 text-xs">
                <DollarSign className="w-3.5 h-3.5 text-emerald-400" />
                <span className="text-muted-foreground">Avg:</span>
                <span className="font-semibold text-foreground">${dailyAvg.toLocaleString()}/day</span>
              </div>
            </div>

            {/* EOM Projection & Pacing Status Pill */}
            <div className="flex items-center gap-2">
              <div className="px-3 py-1.5 rounded-lg bg-card/60 border border-border/60 flex items-center gap-2 text-xs">
                <span className="text-muted-foreground">EOM Projection:</span>
                <span className="font-bold text-foreground">${eomProjection.toLocaleString()}</span>
                {totalBudget > 0 && (
                  <span className={`px-2 py-0.5 rounded-md text-[10px] font-extrabold uppercase tracking-wider ${
                    pacingStatus === 'under_budget'
                      ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                      : pacingStatus === 'over_budget'
                      ? 'bg-rose-500/20 text-rose-400 border border-rose-500/30'
                      : 'bg-amber-500/20 text-amber-400 border border-amber-500/30'
                  }`}>
                    {pacingStatus === 'under_budget' ? 'Under Budget' : pacingStatus === 'over_budget' ? 'Over Budget' : 'On Track'}
                  </span>
                )}
              </div>
            </div>
          </div>

          {/* SVG Pacing Chart Frame */}
          <div className="flex-1 min-h-[220px] relative w-full flex items-center justify-center select-none">
            <svg 
              viewBox="0 0 500 200" 
              data-testid="chart-svg-trend" 
              className="w-full h-full overflow-visible"
            >
              <defs>
                <linearGradient id="cumulativeGradient" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="rgb(20, 184, 166)" stopOpacity="0.35" />
                  <stop offset="100%" stopColor="rgb(20, 184, 166)" stopOpacity="0.0" />
                </linearGradient>
              </defs>

              {/* Y Grid Lines */}
              {yTicks.map((tick, idx) => (
                <g key={`y-tick-${idx}`}>
                  <line 
                    x1="55" 
                    y1={tick.y} 
                    x2="475" 
                    y2={tick.y} 
                    stroke="currentColor" 
                    className="text-border/30" 
                    strokeWidth="1" 
                    strokeDasharray="4 4" 
                  />
                  <text 
                    x="45" 
                    y={tick.y + 4} 
                    textAnchor="end" 
                    className="text-[11px] fill-muted-foreground font-medium"
                  >
                    {tick.label}
                  </text>
                </g>
              ))}

              {/* X Axis Labels */}
              <text x="55" y="188" textAnchor="start" className="text-[11px] fill-muted-foreground font-medium">Day 1</text>
              <text x="265" y="188" textAnchor="middle" className="text-[11px] fill-muted-foreground font-medium">Day {Math.round(daysInMonth / 2)}</text>
              <text x="475" y="188" textAnchor="end" className="text-[11px] fill-muted-foreground font-medium">Day {daysInMonth}</text>

              {/* Ideal Pacing Reference Line (Dotted Gray) */}
              {idealPacingPathData && (
                <path
                  d={idealPacingPathData}
                  fill="none"
                  stroke="rgba(156, 163, 175, 0.5)"
                  strokeWidth="2"
                  strokeDasharray="3 3"
                />
              )}

              {/* Previous Month Trajectory Line (Dashed Amber) */}
              {prevMonthPathData && prevMonthCumulativePoints.length > 0 && (
                <path
                  d={prevMonthPathData}
                  fill="none"
                  stroke="rgba(245, 158, 11, 0.6)"
                  strokeWidth="2"
                  strokeDasharray="6 4"
                />
              )}

              {/* Gradient Area under Cumulative Path */}
              {cumulativeAreaPathData && (
                <motion.path
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ duration: 0.8 }}
                  d={cumulativeAreaPathData}
                  fill="url(#cumulativeGradient)"
                />
              )}

              {/* Current Month Cumulative Path (Solid Teal) */}
              {cumulativePathData && (
                <motion.path
                  key={cumulativePathData}
                  initial={{ pathLength: 0 }}
                  animate={{ pathLength: 1 }}
                  transition={{ duration: 1, ease: "easeInOut" }}
                  d={cumulativePathData}
                  fill="none"
                  stroke="currentColor"
                  className="text-primary drop-shadow-[0_0_8px_rgba(20,184,166,0.6)]"
                  strokeWidth="3.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              )}

              {/* Interactive Data Nodes */}
              {cumulativePoints.map((pt, idx) => {
                const isHovered = hoveredCumulativePoint?.day === pt.day;
                // Highlight nodes every 5 days or hovered
                if (pt.day % 5 !== 0 && !isHovered && pt.day !== daysInMonth) return null;

                return (
                  <g key={`cum-point-${idx}`}>
                    <circle
                      cx={pt.x}
                      cy={pt.y}
                      r={isHovered ? "6.5" : "4"}
                      className="fill-background stroke-primary transition-all cursor-pointer"
                      strokeWidth={isHovered ? "3" : "2"}
                      onMouseEnter={() => setHoveredCumulativePoint(pt)}
                      onMouseLeave={() => setHoveredCumulativePoint(null)}
                    />
                  </g>
                );
              })}
            </svg>

            {/* Hover Tooltip */}
            <AnimatePresence>
              {hoveredCumulativePoint && (
                <motion.div
                  initial={{ opacity: 0, y: 5, scale: 0.95 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.95 }}
                  style={{
                    left: `${(hoveredCumulativePoint.x / 500) * 100}%`,
                    top: `${(hoveredCumulativePoint.y / 200) * 100}%`,
                    transform: 'translate(-50%, -120%)'
                  }}
                  className="absolute z-30 pointer-events-none bg-popover/95 border border-border text-popover-foreground px-3 py-2 rounded-xl shadow-xl backdrop-blur-md whitespace-nowrap"
                >
                  <p className="text-[11px] text-muted-foreground font-semibold">{hoveredCumulativePoint.formattedDate}</p>
                  <p className="text-sm font-extrabold text-primary">Cumulative: ${hoveredCumulativePoint.cumulativeAmount.toLocaleString(undefined, { minimumFractionDigits: 2 })}</p>
                  {hoveredCumulativePoint.dailyAmount > 0 && (
                    <p className="text-[11px] text-muted-foreground">Daily Spend: ${hoveredCumulativePoint.dailyAmount.toLocaleString()}</p>
                  )}
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          {/* Legend Footer */}
          <div className="flex flex-wrap items-center justify-center gap-6 mt-4 pt-3 border-t border-border/40 text-xs text-muted-foreground">
            <div className="flex items-center gap-2">
              <span className="w-3 h-1 bg-primary rounded-full"></span>
              <span>Actual Cumulative Spend</span>
            </div>
            {totalBudget > 0 && (
              <div className="flex items-center gap-2">
                <span className="w-3 h-0.5 bg-gray-400 border-t border-dashed border-gray-400"></span>
                <span>Ideal Budget Pace (${(totalBudget / daysInMonth).toFixed(0)}/day)</span>
              </div>
            )}
            {prevMonthCumulativePoints.length > 0 && (
              <div className="flex items-center gap-2">
                <span className="w-3 h-0.5 bg-amber-400 border-t border-dashed border-amber-400"></span>
                <span>Previous Month Trajectory</span>
              </div>
            )}
          </div>
        </div>
      )}

      {/* TAB 2: ANNUAL CASH FLOW VIEW */}
      {activeTab === 'cashflow' && (
        <div className="flex-1 flex flex-col justify-between">
          {/* Top Metric Badges */}
          <div className="flex flex-wrap items-center justify-between gap-2 mb-4">
            <div className="flex flex-wrap items-center gap-2">
              <div className="px-3 py-1.5 rounded-lg bg-card/60 border border-border/60 flex items-center gap-2 text-xs">
                <DollarSign className="w-3.5 h-3.5 text-emerald-400" />
                <span className="text-muted-foreground">Avg Monthly Savings:</span>
                <span className={`font-bold ${avgMonthlySavings >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                  ${avgMonthlySavings.toLocaleString()}
                </span>
              </div>
              <div className="px-3 py-1.5 rounded-lg bg-card/60 border border-border/60 flex items-center gap-2 text-xs">
                <span className="text-muted-foreground">Savings Rate:</span>
                <span className="font-bold text-foreground">{overallSavingsRate}%</span>
              </div>
            </div>

            {bestCashFlowMonth && (
              <div className="px-3 py-1.5 rounded-lg bg-card/60 border border-border/60 flex items-center gap-2 text-xs">
                <span className="text-muted-foreground">Best Month:</span>
                <span className="font-bold text-emerald-400">{bestCashFlowMonth.formattedMonth} (+${bestCashFlowMonth.net.toLocaleString()})</span>
              </div>
            )}
          </div>

          {/* Multi-Month SVG Grouped Bar Chart */}
          <div className="flex-1 min-h-[220px] relative w-full flex items-center justify-center select-none">
            {monthlyCashFlows.length === 0 ? (
              <div className="text-center text-muted-foreground text-sm">No multi-month cash flow data available.</div>
            ) : (
              <svg viewBox="0 0 500 200" className="w-full h-full overflow-visible">
                {/* Horizontal Baseline */}
                <line x1="40" y1="165" x2="480" y2="165" stroke="currentColor" className="text-border" strokeWidth="1" />

                {/* Render Monthly Grouped Bars */}
                {monthlyCashFlows.map((cf, idx) => {
                  const groupWidth = 440 / monthlyCashFlows.length;
                  const groupX = 45 + idx * groupWidth;
                  const barW = Math.min(18, groupWidth * 0.35);

                  const maxScale = Math.max(maxCashFlowValue, 1);
                  const incomeH = (cf.income / maxScale) * 130;
                  const expenseH = (cf.expense / maxScale) * 130;

                  const incomeY = 165 - incomeH;
                  const expenseY = 165 - expenseH;

                  const isHovered = hoveredCashFlowMonth?.month === cf.month;

                  return (
                    <g 
                      key={cf.month} 
                      className="cursor-pointer group"
                      onClick={() => {
                        if (onSelectMonth) onSelectMonth(cf.month);
                        setActiveTab('pacing');
                      }}
                      onMouseEnter={() => setHoveredCashFlowMonth(cf)}
                      onMouseLeave={() => setHoveredCashFlowMonth(null)}
                    >
                      {/* Income Bar (Emerald) */}
                      <rect
                        x={groupX + groupWidth / 2 - barW - 2}
                        y={incomeY}
                        width={barW}
                        height={Math.max(2, incomeH)}
                        rx="3"
                        className="fill-emerald-500/80 group-hover:fill-emerald-400 transition-colors"
                      />

                      {/* Expense Bar (Rose) */}
                      <rect
                        x={groupX + groupWidth / 2 + 2}
                        y={expenseY}
                        width={barW}
                        height={Math.max(2, expenseH)}
                        rx="3"
                        className="fill-rose-500/80 group-hover:fill-rose-400 transition-colors"
                      />

                      {/* Month Label */}
                      <text
                        x={groupX + groupWidth / 2}
                        y="185"
                        textAnchor="middle"
                        className={`text-[11px] font-semibold transition-colors ${isHovered ? 'fill-primary font-bold' : 'fill-muted-foreground'}`}
                      >
                        {cf.formattedMonth}
                      </text>
                    </g>
                  );
                })}
              </svg>
            )}

            {/* Hover Tooltip for Bar Chart */}
            <AnimatePresence>
              {hoveredCashFlowMonth && (
                <motion.div
                  initial={{ opacity: 0, y: 5, scale: 0.95 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.95 }}
                  className="absolute z-30 pointer-events-none bg-popover/95 border border-border text-popover-foreground px-4 py-3 rounded-xl shadow-xl backdrop-blur-md"
                  style={{
                    left: '50%',
                    bottom: '3rem',
                    transform: 'translateX(-50%)'
                  }}
                >
                  <p className="text-xs font-bold text-foreground mb-1">{hoveredCashFlowMonth.formattedMonth}</p>
                  <div className="space-y-0.5 text-xs">
                    <p className="text-emerald-400 font-medium">Income: ${hoveredCashFlowMonth.income.toLocaleString()}</p>
                    <p className="text-rose-400 font-medium">Expenses: ${hoveredCashFlowMonth.expense.toLocaleString()}</p>
                    <p className={`font-extrabold ${hoveredCashFlowMonth.net >= 0 ? 'text-teal-400' : 'text-rose-500'}`}>
                      Net Savings: ${hoveredCashFlowMonth.net.toLocaleString()} ({hoveredCashFlowMonth.savingsRate}%)
                    </p>
                  </div>
                  <p className="text-[10px] text-muted-foreground mt-1 text-center font-medium">Click bar to inspect pacing →</p>
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          {/* Bar Chart Legend */}
          <div className="flex items-center justify-center gap-6 mt-4 pt-3 border-t border-border/40 text-xs text-muted-foreground">
            <div className="flex items-center gap-2">
              <span className="w-3 h-3 bg-emerald-500 rounded-sm"></span>
              <span>Income</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="w-3 h-3 bg-rose-500 rounded-sm"></span>
              <span>Expenses</span>
            </div>
            <span className="text-[11px] text-muted-foreground/80 italic">💡 Click any month bar to inspect its daily cumulative pacing</span>
          </div>
        </div>
      )}

      {/* TAB 3: ✨ AI FINANCIAL INSIGHTS VIEW */}
      {activeTab === 'ai' && (
        <div className="flex-1 flex flex-col justify-between">
          {!hasGeminiApiKey() ? (
            <div className="flex-1 flex flex-col items-center justify-center text-center p-6 border border-dashed border-teal-500/30 rounded-xl bg-teal-500/5">
              <Sparkles className="w-8 h-8 text-teal-400 mb-2 animate-bounce" />
              <h4 className="text-base font-bold text-foreground">Unlock AI Financial Insights</h4>
              <p className="text-xs text-muted-foreground max-w-md mt-1 mb-4">
                Connect your Google Gemini API key to receive automated spending summaries, anomaly detection, and personalized budget advice.
              </p>
              <button
                onClick={() => {
                  if (onRequestGeminiKey) onRequestGeminiKey();
                }}
                className="px-4 py-2 bg-gradient-to-r from-teal-500 to-emerald-500 text-white rounded-xl text-xs font-bold shadow-lg shadow-teal-500/20 flex items-center gap-2 hover:scale-105 transition-all"
              >
                <Key className="w-3.5 h-3.5" />
                <span>Configure Gemini API Key</span>
              </button>
            </div>
          ) : !aiResult && !isGeneratingAi ? (
            <div className="flex-1 flex flex-col items-center justify-center text-center p-6 border border-dashed border-border rounded-xl">
              <Sparkles className="w-8 h-8 text-teal-400 mb-2" />
              <h4 className="text-base font-bold">Generate AI Financial Analysis</h4>
              <p className="text-xs text-muted-foreground max-w-sm mt-1 mb-4">
                Gemini will analyze your spending habits for {selectedMonth === 'all' ? 'all months' : selectedMonth} and provide intelligent recommendations.
              </p>
              <button
                onClick={handleGenerateAiInsights}
                className="px-5 py-2.5 bg-gradient-to-r from-teal-500 to-emerald-500 text-white rounded-xl text-xs font-bold shadow-lg shadow-teal-500/20 flex items-center gap-2 hover:scale-105 active:scale-95 transition-all"
              >
                <Sparkles className="w-4 h-4" />
                <span>Generate Insights Now</span>
              </button>
              {aiError && <p className="text-xs text-rose-400 mt-3 font-medium">{aiError}</p>}
            </div>
          ) : isGeneratingAi ? (
            <div className="flex-1 flex flex-col items-center justify-center p-8 text-center space-y-4">
              <div className="relative">
                <div className="w-12 h-12 rounded-full border-4 border-teal-500/20 border-t-teal-400 animate-spin" />
                <Sparkles className="w-5 h-5 text-teal-400 absolute inset-0 m-auto animate-pulse" />
              </div>
              <div>
                <p className="text-sm font-bold text-foreground">Analyzing your transaction data...</p>
                <p className="text-xs text-muted-foreground mt-1">Gemini is searching for spending patterns and savings opportunities.</p>
              </div>
            </div>
          ) : aiResult ? (
            <div className="flex-1 flex flex-col gap-4 overflow-y-auto max-h-[300px] pr-1">
              {/* Executive Digest Card */}
              <div className="p-4 rounded-xl bg-gradient-to-br from-teal-500/10 via-emerald-500/5 to-transparent border border-teal-500/20">
                <div className="flex items-center gap-2 mb-2">
                  <Sparkles className="w-4 h-4 text-teal-400" />
                  <h4 className="text-xs font-extrabold uppercase tracking-wider text-teal-400">Executive Spending Summary</h4>
                </div>
                <p className="text-xs text-foreground leading-relaxed font-medium">{aiResult.digest}</p>
              </div>

              {/* Anomalies & Badges */}
              {aiResult.anomalies && aiResult.anomalies.length > 0 && (
                <div>
                  <h5 className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground mb-2">Detected Patterns & Anomalies</h5>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    {aiResult.anomalies.map((anom, idx) => (
                      <div 
                        key={idx} 
                        className={`p-3 rounded-xl border flex items-start gap-2.5 text-xs ${
                          anom.type === 'spike'
                            ? 'bg-rose-500/10 border-rose-500/30 text-rose-300'
                            : anom.type === 'positive_trend'
                            ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300'
                            : anom.type === 'new_merchant'
                            ? 'bg-amber-500/10 border-amber-500/30 text-amber-300'
                            : 'bg-teal-500/10 border-teal-500/30 text-teal-300'
                        }`}
                      >
                        {anom.type === 'spike' ? (
                          <AlertTriangle className="w-4 h-4 shrink-0 text-rose-400 mt-0.5" />
                        ) : anom.type === 'positive_trend' ? (
                          <ArrowDownRight className="w-4 h-4 shrink-0 text-emerald-400 mt-0.5" />
                        ) : (
                          <ArrowUpRight className="w-4 h-4 shrink-0 text-amber-400 mt-0.5" />
                        )}
                        <div>
                          <p className="font-bold text-foreground">{anom.title}</p>
                          <p className="text-[11px] opacity-90 mt-0.5">{anom.description}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Recommendations */}
              {aiResult.recommendations && aiResult.recommendations.length > 0 && (
                <div>
                  <h5 className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground mb-2">Actionable Recommendations</h5>
                  <div className="space-y-2">
                    {aiResult.recommendations.map((rec, idx) => (
                      <div key={idx} className="p-3 rounded-xl bg-card/60 border border-border/60 flex items-center justify-between gap-3 text-xs">
                        <div className="flex items-center gap-2">
                          <span className="w-2 h-2 rounded-full bg-teal-400"></span>
                          <span className="text-foreground font-medium">{rec.action}</span>
                        </div>
                        <span className="px-2 py-1 rounded-lg bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 font-bold shrink-0 text-[10px]">
                          {rec.impact}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Regenerate Footer */}
              <div className="flex items-center justify-between pt-2 border-t border-border/30 text-[10px] text-muted-foreground">
                <span>Generated at {new Date(aiResult.generatedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                <button
                  onClick={handleGenerateAiInsights}
                  className="flex items-center gap-1 hover:text-foreground font-semibold transition-colors"
                >
                  <RefreshCw className="w-3 h-3" />
                  <span>Refresh Insights</span>
                </button>
              </div>
            </div>
          ) : null}
        </div>
      )}
    </motion.div>
  );
}
