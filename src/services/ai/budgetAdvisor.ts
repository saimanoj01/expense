import { callGemini, hasGeminiApiKey } from './geminiClient';
import { Budget, Category, Transaction } from '../storage';

export interface BudgetSuggestion {
  categoryId: string;
  categoryName: string;
  emoji: string;
  currentBudget: number;
  avgSpent2Months: number;
  suggestedBudget: number;
  rationale: string;
  isSubCategory?: boolean;
}

/**
 * Robustly parses a date string into a YYYY-MM month key.
 */
function getYearMonthKey(dateStr: string): string {
  if (!dateStr) return '';
  // Handles YYYY-MM-DD, YYYY-MM, or ISO date strings
  const match = dateStr.match(/^(\d{4})-(\d{2})/);
  if (match) {
    return `${match[1]}-${match[2]}`;
  }
  const parsed = new Date(dateStr);
  if (!isNaN(parsed.getTime())) {
    return `${parsed.getFullYear()}-${String(parsed.getMonth() + 1).padStart(2, '0')}`;
  }
  return '';
}

/**
 * Generates budget recommendations based on the last 2 months of transactions for both parent categories and sub-categories.
 * Uses Gemini AI if key is present, otherwise falls back to intelligent baseline average calculation.
 */
export async function generateBudgetSuggestions(
  transactions: Transaction[],
  categories: Category[],
  budgets: Budget[]
): Promise<BudgetSuggestion[]> {
  const now = new Date();
  const currentMonthKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  
  const prevMonthDate = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const prevMonthKey = `${prevMonthDate.getFullYear()}-${String(prevMonthDate.getMonth() + 1).padStart(2, '0')}`;

  const relevantTxns = transactions.filter(t => {
    if (t.type !== 'expense') return false;
    const ym = getYearMonthKey(t.date);
    return ym === currentMonthKey || ym === prevMonthKey;
  });

  // Track spending per category/sub-category ID
  const spendingMap: Record<string, { current: number; prev: number }> = {};
  categories.forEach(c => {
    spendingMap[c.id] = { current: 0, prev: 0 };
  });

  relevantTxns.forEach(t => {
    const ym = getYearMonthKey(t.date);
    const isCurrent = ym === currentMonthKey;

    // Track for parent category or direct category
    if (t.category && spendingMap[t.category]) {
      if (isCurrent) spendingMap[t.category].current += t.amount;
      else spendingMap[t.category].prev += t.amount;
    }

    // Also track for sub-category if present
    if (t.subCategory && spendingMap[t.subCategory]) {
      if (isCurrent) spendingMap[t.subCategory].current += t.amount;
      else spendingMap[t.subCategory].prev += t.amount;
    }
  });

  // Prepare input list for AI or baseline
  const catInputList = categories.map(c => {
    const bObj = budgets.find(b => b.category === c.id || b.category === c.name);
    const currentBudget = bObj?.amount || 0;
    const spent = spendingMap[c.id] || { current: 0, prev: 0 };
    const avgSpent = Math.round((spent.current + spent.prev) / (spent.prev > 0 && spent.current > 0 ? 2 : 1));
    const isSub = !!c.parentId;

    return {
      id: c.id,
      name: isSub ? `${categories.find(p => p.id === c.parentId)?.name || ''} → ${c.name}` : c.name,
      emoji: c.emoji || (isSub ? '🏷️' : '📁'),
      currentBudget,
      avgSpent2Months: avgSpent,
      currentMonthSpent: spent.current,
      prevMonthSpent: spent.prev,
      isSubCategory: isSub,
    };
  }).filter(c => c.avgSpent2Months > 0 || c.currentBudget > 0);

  if (catInputList.length === 0) {
    return [];
  }

  // Use Gemini AI if key is configured
  if (hasGeminiApiKey()) {
    try {
      const prompt = `You are an expert personal finance AI assistant.
Analyze the following expense categories (including sub-categories) with their current monthly budgets and actual spending over the last 2 months:
${JSON.stringify(catInputList, null, 2)}

Your task is to suggest a realistic, optimized monthly budget for each category/sub-category.
Rules:
- Round suggested budgets to neat numbers (multiples of 5, 10, or 50).
- If a user consistently overspends by a small margin, raise the budget slightly to be realistic.
- If spending is well below the budget for 2 consecutive months, suggest a modest reduction to encourage savings.
- Provide a concise 1-sentence rationale for each recommendation.
- Ignore extreme one-off spikes.

Return a JSON array where each object has:
- "categoryId": exact ID from input
- "suggestedBudget": number
- "rationale": string`;

      const aiResponse = await callGemini({
        prompt,
        temperature: 0.2,
        jsonSchema: {
          type: 'ARRAY',
          items: {
            type: 'OBJECT',
            properties: {
              categoryId: { type: 'STRING' },
              suggestedBudget: { type: 'NUMBER' },
              rationale: { type: 'STRING' },
            },
            required: ['categoryId', 'suggestedBudget', 'rationale'],
          },
        },
      }) as Array<{ categoryId: string; suggestedBudget: number; rationale: string }>;

      if (Array.isArray(aiResponse) && aiResponse.length > 0) {
        return catInputList.map(item => {
          const match = aiResponse.find(r => r.categoryId === item.id);
          return {
            categoryId: item.id,
            categoryName: item.name,
            emoji: item.emoji,
            currentBudget: item.currentBudget,
            avgSpent2Months: item.avgSpent2Months,
            suggestedBudget: match?.suggestedBudget ?? Math.round(item.avgSpent2Months * 1.1 / 10) * 10,
            rationale: match?.rationale ?? `Based on 2-month average spending of $${item.avgSpent2Months}/mo.`,
            isSubCategory: item.isSubCategory,
          };
        });
      }
    } catch (err) {
      console.warn('Gemini budget suggestion failed, falling back to baseline calculation:', err);
    }
  }

  // Fallback / deterministic calculation
  return catInputList.map(item => {
    let suggested = Math.round(item.avgSpent2Months * 1.08 / 10) * 10;
    if (suggested < 50 && item.avgSpent2Months > 0) suggested = Math.ceil(item.avgSpent2Months / 10) * 10;
    
    let rationale = `Averaged $${item.avgSpent2Months}/mo over the last 2 months. Setting target slightly above average for safety.`;
    if (item.currentBudget > 0 && item.avgSpent2Months > item.currentBudget) {
      rationale = `You spent an avg of $${item.avgSpent2Months}/mo vs your $${item.currentBudget} budget. Recommending $${suggested} to avoid overruns.`;
    } else if (item.currentBudget > 0 && item.avgSpent2Months < item.currentBudget * 0.7) {
      rationale = `Spending ($${item.avgSpent2Months}/mo) is well below your $${item.currentBudget} cap. Recommending $${suggested} to capture savings.`;
    }

    return {
      categoryId: item.id,
      categoryName: item.name,
      emoji: item.emoji,
      currentBudget: item.currentBudget,
      avgSpent2Months: item.avgSpent2Months,
      suggestedBudget: suggested,
      rationale,
      isSubCategory: item.isSubCategory,
    };
  });
}
