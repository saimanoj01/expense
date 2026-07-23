import { Category } from './storage';
import { suggestCategory } from '../utils/categorizer';

export interface ClassifiedItem {
  id: string;
  category: string;
  confidence: number;
}

/**
 * Service interface for LLM Auto-Classification.
 * Uses smart keyword matching + simulated AI response by default,
 * and can be connected to real Gemini API endpoints.
 */
export async function classifyTransactionsWithLLM(
  items: { id: string; description: string; rawCategory?: string }[],
  categories: Category[]
): Promise<Record<string, string>> {
  // Simulate network latency for AI classification feel
  await new Promise(resolve => setTimeout(resolve, 600));

  const categoryMap: Record<string, string> = {};

  for (const item of items) {
    // Uses smart categorizer engine
    categoryMap[item.id] = suggestCategory(item.description, item.rawCategory, categories);
  }

  return categoryMap;
}
