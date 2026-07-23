import { Category, DEFAULT_CATEGORIES } from './storage';
import { suggestCategory } from '../utils/categorizer';
import { callGemini, hasGeminiApiKey } from './ai/geminiClient';

export interface ClassifiedResultItem {
  categoryId: string;
  subCategoryId?: string;
}

export type ClassificationResultMap = Record<string, ClassifiedResultItem>;

/**
 * Service interface for Gemini LLM Auto-Classification.
 * Formats categories and transactions into a structured JSON prompt,
 * calls gemini-3.5-flash-lite via callGemini(), and maps the returned
 * parent and sub-category selections.
 */
export async function classifyTransactionsWithLLM(
  items: { id: string; description: string; rawCategory?: string }[],
  categories: Category[]
): Promise<ClassificationResultMap> {
  if (!hasGeminiApiKey()) {
    throw new Error('Gemini API Key is not configured. Please set your key in AI Settings.');
  }

  if (!items || items.length === 0) {
    return {};
  }

  // Combine default and project categories
  const catMap = new Map<string, Category>();
  DEFAULT_CATEGORIES.forEach(c => catMap.set(c.id, c));
  categories.forEach(c => catMap.set(c.id, c));
  const allCategories = Array.from(catMap.values());

  const parentCats = allCategories.filter(c => !c.parentId);

  // Format category hierarchy for Gemini prompt
  const categoryTreeDescription = parentCats.map(parent => {
    const subs = allCategories.filter(c => c.parentId === parent.id);
    const subDesc = subs.length > 0
      ? subs.map(s => `    - ID: "${s.id}" (Name: "${s.name}")`).join('\n')
      : '    (No sub-categories)';
    return `- Parent ID: "${parent.id}" (Name: "${parent.name}" ${parent.emoji})\n  Sub-categories:\n${subDesc}`;
  }).join('\n\n');

  const systemInstruction = `You are a precise personal finance transaction categorizer.
Your goal is to categorize each given financial transaction into the single best matching Parent Category ID, and if applicable, a Sub-Category ID from the provided category list.

CRITICAL RULES:
1. ONLY return categoryId and subCategoryId values that EXACTLY match one of the Category IDs listed in the provided hierarchy.
2. If a sub-category matches, subCategoryId MUST be a valid child ID of the chosen categoryId.
3. If no sub-category fits well, omit subCategoryId or leave it null/empty.
4. Do NOT invent new category IDs.`;

  const jsonSchema = {
    type: 'OBJECT',
    properties: {
      classifications: {
        type: 'ARRAY',
        items: {
          type: 'OBJECT',
          properties: {
            id: { type: 'STRING' },
            categoryId: { type: 'STRING' },
            subCategoryId: { type: 'STRING' }
          },
          required: ['id', 'categoryId']
        }
      }
    },
    required: ['classifications']
  };

  // Batch items in chunks of 50
  const BATCH_SIZE = 50;
  const resultMap: ClassificationResultMap = {};
  const batchErrors: Error[] = [];

  for (let i = 0; i < items.length; i += BATCH_SIZE) {
    const batch = items.slice(i, i + BATCH_SIZE);

    const transactionText = batch.map(t => 
      `Transaction ID: "${t.id}" | Description: "${t.description}"`
    ).join('\n');

    const prompt = `Available Category Hierarchy:\n${categoryTreeDescription}\n\nTransactions to Classify:\n${transactionText}\n\nClassify each transaction accurately using the provided JSON schema.`;

    try {
      const response = (await callGemini({
        prompt,
        systemInstruction,
        model: 'gemini-3.5-flash-lite',
        jsonSchema,
        temperature: 0.1
      })) as { classifications?: { id: string; categoryId: string; subCategoryId?: string }[] };

      if (response && Array.isArray(response.classifications)) {
        for (const res of response.classifications) {
          const isValidParent = parentCats.some(p => p.id === res.categoryId);
          const originalItem = batch.find(b => b.id === res.id);
          const finalParent = isValidParent ? res.categoryId : suggestCategory(
            originalItem?.description || '',
            originalItem?.rawCategory,
            categories
          );

          let finalSub: string | undefined = undefined;
          if (res.subCategoryId) {
            const validSub = allCategories.find(c => c.id === res.subCategoryId && c.parentId === finalParent);
            if (validSub) {
              finalSub = validSub.id;
            }
          }

          resultMap[res.id] = {
            categoryId: finalParent,
            subCategoryId: finalSub
          };
        }
      }
    } catch (err) {
      console.error(`Gemini classification failed for batch starting at index ${i}:`, err);
      batchErrors.push(err instanceof Error ? err : new Error(String(err)));
      // Fallback: use local keyword categorizer for this batch, then continue with remaining batches
      for (const item of batch) {
        if (!resultMap[item.id]) {
          resultMap[item.id] = {
            categoryId: suggestCategory(item.description, item.rawCategory, categories)
          };
        }
      }
    }
  }

  // Ensure all requested item IDs have a result (covers items the model may have skipped)
  for (const item of items) {
    if (!resultMap[item.id]) {
      resultMap[item.id] = {
        categoryId: suggestCategory(item.description, item.rawCategory, categories)
      };
    }
  }

  // If any batches failed, surface the first error so the caller can show a warning
  // (but still return partial results from successful batches + fallbacks)
  if (batchErrors.length > 0) {
    throw batchErrors[0];
  }

  return resultMap;
}
