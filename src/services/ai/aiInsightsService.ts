import { callGemini, hasGeminiApiKey } from './geminiClient';
import { Transaction, Category, Budget } from '../storage';

export interface AnomalyItem {
  type: 'spike' | 'new_merchant' | 'positive_trend' | 'suggestion';
  title: string;
  description: string;
}

export interface RecommendationItem {
  action: string;
  impact: string;
}

export interface AiInsightsResult {
  digest: string;
  anomalies: AnomalyItem[];
  recommendations: RecommendationItem[];
  generatedAt: string;
}

interface GenerateInsightsParams {
  transactions: Transaction[];
  categories: Category[];
  budgets: Budget[];
  selectedMonth: string;
  totalBudget: number;
}

const INSIGHTS_JSON_SCHEMA = {
  type: 'OBJECT',
  properties: {
    digest: {
      type: 'STRING',
      description: 'A 2-3 sentence conversational executive summary of spending trends, pace, and comparisons for this month.'
    },
    anomalies: {
      type: 'ARRAY',
      items: {
        type: 'OBJECT',
        properties: {
          type: {
            type: 'STRING',
            enum: ['spike', 'new_merchant', 'positive_trend', 'suggestion'],
            description: 'The type of insight/anomaly detected.'
          },
          title: { type: 'STRING', description: 'Short badge title (3-5 words)' },
          description: { type: 'STRING', description: 'Brief 1-sentence detail explanation.' }
        },
        required: ['type', 'title', 'description']
      }
    },
    recommendations: {
      type: 'ARRAY',
      items: {
        type: 'OBJECT',
        properties: {
          action: { type: 'STRING', description: 'Clear actionable suggestion for the user.' },
          impact: { type: 'STRING', description: 'Estimated savings or financial benefit.' }
        },
        required: ['action', 'impact']
      }
    }
  },
  required: ['digest', 'anomalies', 'recommendations']
};

export async function generateSpendingInsights({
  transactions,
  categories,
  budgets,
  selectedMonth,
  totalBudget
}: GenerateInsightsParams): Promise<AiInsightsResult> {
  if (!hasGeminiApiKey()) {
    throw new Error('Gemini API key is missing');
  }

  // Filter transactions for current month vs previous month
  const currentMonth = selectedMonth === 'all' ? new Date().toISOString().substring(0, 7) : selectedMonth;
  const currentTxns = transactions.filter(t => (t.date || '').startsWith(currentMonth));
  
  // Calculate previous month string (e.g., '2026-07' -> '2026-06')
  const [yearStr, monthStr] = currentMonth.split('-');
  const y = parseInt(yearStr, 10);
  const m = parseInt(monthStr, 10);
  const prevDate = new Date(y, m - 2, 1);
  const prevMonth = `${prevDate.getFullYear()}-${String(prevDate.getMonth() + 1).padStart(2, '0')}`;
  const prevTxns = transactions.filter(t => (t.date || '').startsWith(prevMonth));

  // Category map helper
  const catMap = new Map<string, string>();
  categories.forEach(c => catMap.set(c.id, c.name));

  // Summarize current month spending by category
  const currentCategoryTotals: Record<string, number> = {};
  let currentTotalExpenses = 0;
  let currentTotalIncome = 0;
  const merchantTotals: Record<string, number> = {};

  currentTxns.forEach(t => {
    if (t.type === 'expense') {
      const amt = Number(t.amount) || 0;
      const catName = catMap.get(t.category) || t.category || 'Uncategorized';
      currentCategoryTotals[catName] = (currentCategoryTotals[catName] || 0) + amt;
      currentTotalExpenses += amt;

      const merchant = (t.description || 'Unknown').trim();
      if (merchant) {
        merchantTotals[merchant] = (merchantTotals[merchant] || 0) + amt;
      }
    } else if (t.type === 'income') {
      currentTotalIncome += Number(t.amount) || 0;
    }
  });

  // Summarize previous month spending
  let prevTotalExpenses = 0;
  prevTxns.forEach(t => {
    if (t.type === 'expense') prevTotalExpenses += Number(t.amount) || 0;
  });

  // Top 5 spending merchants
  const topMerchants = Object.entries(merchantTotals)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([name, amt]) => `${name}: $${amt.toFixed(2)}`)
    .join(', ');

  const systemInstruction = `You are an expert personal finance counselor and data analyst. 
Analyze the provided financial dataset and return actionable, encouraging, and clear spending insights.
Be concise, specific with numbers, and prioritize non-obvious patterns.`;

  const prompt = `
Financial Summary for Month ${currentMonth}:
- Total Monthly Budget: $${totalBudget.toLocaleString()}
- Total Expenses This Month: $${currentTotalExpenses.toLocaleString()} (${currentTxns.length} transactions)
- Total Income This Month: $${currentTotalIncome.toLocaleString()}
- Total Expenses Previous Month (${prevMonth}): $${prevTotalExpenses.toLocaleString()}
- Category Breakdown: ${JSON.stringify(currentCategoryTotals)}
- Configured Category Budgets: ${JSON.stringify(budgets.map(b => ({ category: b.category, budget: b.amount })))}
- Top Spending Merchants: ${topMerchants || 'None'}

Please provide:
1. Executive Digest (2-3 sentences max) comparing pacing, spending growth/decrease, and budget health.
2. Anomalies/Patterns (2 to 4 items): Identify spending spikes, new merchant patterns, positive savings trends, or subscription suggestions.
3. Actionable Recommendations (2 items): Practical tweaks to improve cash flow or stay on budget.
`;

  const result = (await callGemini({
    prompt,
    systemInstruction,
    jsonSchema: INSIGHTS_JSON_SCHEMA,
    temperature: 0.2
  })) as Omit<AiInsightsResult, 'generatedAt'>;

  return {
    ...result,
    generatedAt: new Date().toISOString()
  };
}
