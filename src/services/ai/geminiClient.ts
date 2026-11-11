const GEMINI_KEY_STORAGE_KEY = 'expense_gemini_api_key';

export const DEFAULT_GEMINI_MODEL = 'gemini-3.5-flash-lite';

export class GeminiApiError extends Error {
  status?: number;
  constructor(message: string, status?: number) {
    super(message);
    this.name = 'GeminiApiError';
    this.status = status;
  }
}

function getSafeLocalStorage(): Storage | null {
  try {
    return typeof localStorage !== 'undefined' ? localStorage : null;
  } catch {
    return null;
  }
}

/**
 * Retrieves the Gemini API key from GEMINI_API_KEY / VITE_GEMINI_API_KEY environment variables (or localStorage if present).
 */
export function getGeminiApiKey(): string | null {
  const storage = getSafeLocalStorage();
  const stored = storage?.getItem(GEMINI_KEY_STORAGE_KEY);
  if (stored && stored.trim()) {
    return stored.trim();
  }
  const viteEnv = (import.meta as { env?: Record<string, string | undefined> }).env;
  const envKey =
    viteEnv?.VITE_GEMINI_API_KEY ||
    (typeof process !== 'undefined' ? process.env?.GEMINI_API_KEY || process.env?.VITE_GEMINI_API_KEY : undefined);
  if (typeof envKey === 'string' && envKey.trim()) {
    return envKey.trim();
  }
  return null;
}

export function hasGeminiApiKey(): boolean {
  return !!getGeminiApiKey();
}

export interface GeminiConfig {
  prompt: string;
  systemInstruction?: string;
  model?: string;
  jsonSchema?: object;
  temperature?: number;
  maxOutputTokens?: number;
}

interface GeminiContentPart {
  text: string;
}

interface GeminiContentItem {
  role?: string;
  parts: GeminiContentPart[];
}

interface GeminiRequestBody {
  contents: GeminiContentItem[];
  generationConfig: {
    temperature: number;
    maxOutputTokens: number;
    responseMimeType?: string;
    responseSchema?: object;
  };
  systemInstruction?: {
    parts: GeminiContentPart[];
  };
}

/**
 * Calls the Google Gemini REST API using fetch.
 * Returns the raw parsed text or parsed JSON object if jsonSchema is provided.
 */
export async function callGemini(config: GeminiConfig): Promise<unknown> {
  const apiKey = getGeminiApiKey();
  if (!apiKey) {
    throw new GeminiApiError('Gemini API key is not configured. Set the GEMINI_API_KEY environment variable.');
  }

  const model = config.model || DEFAULT_GEMINI_MODEL;
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`;

  const contents: GeminiContentItem[] = [
    {
      role: 'user',
      parts: [{ text: config.prompt }]
    }
  ];

  const body: GeminiRequestBody = {
    contents,
    generationConfig: {
      temperature: config.temperature ?? 0.1,
      maxOutputTokens: config.maxOutputTokens ?? 8192
    }
  };

  if (config.systemInstruction) {
    body.systemInstruction = {
      parts: [{ text: config.systemInstruction }]
    };
  }

  if (config.jsonSchema) {
    body.generationConfig.responseMimeType = 'application/json';
    body.generationConfig.responseSchema = config.jsonSchema;
  }

  let response: Response;
  try {
    response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-goog-api-key': apiKey
      },
      body: JSON.stringify(body)
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unable to connect to Gemini API';
    throw new GeminiApiError(`Network request failed: ${message}`);
  }

  if (!response.ok) {
    let errorDetail = '';
    try {
      const errJson = await response.json();
      errorDetail = errJson.error?.message || response.statusText;
    } catch {
      errorDetail = response.statusText;
    }

    if (response.status === 400) {
      throw new GeminiApiError(`Invalid request: ${errorDetail}`, 400);
    } else if (response.status === 403) {
      throw new GeminiApiError(`API key forbidden: ${errorDetail}`, 403);
    } else if (response.status === 429) {
      throw new GeminiApiError(`Rate limit exceeded: ${errorDetail}`, 429);
    } else {
      throw new GeminiApiError(`Gemini API Error (${response.status}): ${errorDetail}`, response.status);
    }
  }

  const data = await response.json();
  const rawText = data.candidates?.[0]?.content?.parts?.[0]?.text;

  if (rawText === undefined || rawText === null) {
    throw new GeminiApiError('Gemini API returned empty response candidates.');
  }

  if (config.jsonSchema || body.generationConfig.responseMimeType === 'application/json') {
    try {
      return JSON.parse(rawText);
    } catch {
      throw new GeminiApiError('Failed to parse Gemini JSON output.');
    }
  }

  return rawText;
}
