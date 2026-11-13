import type {
  Budget,
  BudgetNote,
  Category,
  IngestState,
  MonthlyLock,
  Project,
  SpendingBucket,
  StorageAdapter,
  Transaction,
} from '../services/storage';
import { countActiveTransactionMonths } from './budgetPlanning';
import { bucketSource } from './categorizer';
import { getLocalTodayDate } from './csv';
import { isTransactionNeedsReview, isTransactionPending } from './transactionTaxonomy';

export interface NebulaWorkspaceSnapshotV1 {
  schemaVersion: 1;
  app: 'nebula-expense-tracker';
  exportedAt: string; // ISO 8601
  updatedAt: string; // ISO 8601 (expense-ingest --state-file contract)
  projectId: string; // Active project ID (expense-ingest contract)
  project: Project; // { id, name, spreadsheetId?, collaborators? }
  transactions: Transaction[]; // Chronological (date asc, id asc)
  categories: Category[];
  budgets: Budget[];
  notes: Record<string, BudgetNote>;
  locks: MonthlyLock[];
  ingestState: IngestState;
}

export interface SnapshotValidationSummary {
  projectName: string;
  projectId: string;
  transactionCount: number;
  categoryCount: number;
  budgetCount: number;
  noteCount: number;
  lockedMonthsCount: number;
  ingestSourceCount: number;
  dateRange: { firstDate: string | null; lastDate: string | null };
  isPartialCliStateFile: boolean;
}

export interface IncludedSnapshotSections {
  categories: boolean;
  budgets: boolean;
  notes: boolean;
  locks: boolean;
  ingestState: boolean;
}

export type ParseWorkspaceSnapshotResult =
  | {
      ok: true;
      snapshot: NebulaWorkspaceSnapshotV1;
      includedSections: IncludedSnapshotSections;
      summary: SnapshotValidationSummary;
    }
  | {
      ok: false;
      error: string;
    };

export interface WorkspaceHygieneReport {
  totalTransactions: number;
  activeMonthsCount: number;
  dateSpan: { firstDate: string | null; lastDate: string | null };
  lockedMonthsCount: number;
  needsReviewCount: number;
  pendingCount: number;
  uncategorizedCount: number;
  fallbackBucketCount: number;
  syncSummary: {
    sourceIds: string[];
    lastSyncAt: string | null;
    tombstoneCount: number;
    recentRunCount: number;
  };
}

const VALID_DATE_RE = /^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/;
const VALID_MONTH_RE = /^\d{4}-(0[1-9]|1[0-2])$/;
const VALID_TX_TYPES = new Set(['income', 'expense', 'transfer']);
const VALID_SPENDING_BUCKETS = new Set(['fixed', 'flexible', 'non-monthly']);

export function slugifyWorkspaceName(name?: string | null): string {
  const cleaned = (name || 'workspace')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return cleaned || 'workspace';
}

function normalizeCategoryRecord(c: Category): Category {
  const normalized: Category = {
    id: String(c.id).trim(),
    name: String(c.name).trim(),
    color: typeof c.color === 'string' && c.color.trim() ? c.color.trim() : '#38BDF8',
    emoji: typeof c.emoji === 'string' && c.emoji.trim() ? c.emoji.trim() : '🏷️',
    parentId: c.parentId ? String(c.parentId).trim() : null,
  };
  if (c.defaultBucket && VALID_SPENDING_BUCKETS.has(c.defaultBucket)) {
    normalized.defaultBucket = c.defaultBucket;
  }
  return normalized;
}

export async function buildWorkspaceSnapshot(params: {
  project: Project;
  storageAdapter: StorageAdapter;
  exportedAt?: string;
}): Promise<NebulaWorkspaceSnapshotV1> {
  const { project, storageAdapter } = params;
  const nowIso = params.exportedAt || new Date().toISOString();

  const [rawTxns, rawCats, rawBudgets, rawNotes, rawLocks, rawIngest] = await Promise.all([
    storageAdapter.getTransactions(project.id),
    storageAdapter.getCategories(project.id),
    storageAdapter.getBudgets(project.id),
    storageAdapter.getBudgetNotes(project.id),
    storageAdapter.getLocks(project.id),
    storageAdapter.getIngestState
      ? storageAdapter.getIngestState(project.id)
      : Promise.resolve({ version: 1, tombstones: [], sources: {}, recentRuns: [] }),
  ]);

  const sortedTransactions = [...rawTxns].sort(
    (a, b) => (a.date || '').localeCompare(b.date || '') || (a.id || '').localeCompare(b.id || '')
  );

  const normalizedCategories = rawCats.map(normalizeCategoryRecord);

  const cleanNotes: Record<string, BudgetNote> = {};
  for (const [key, note] of Object.entries(rawNotes || {})) {
    if (key.startsWith('__meta_')) continue;
    if (note && typeof note === 'object') {
      cleanNotes[key] = {
        text: typeof note.text === 'string' ? note.text : '',
        updatedAt: typeof note.updatedAt === 'string' ? note.updatedAt : nowIso,
        ...(typeof note.mood === 'string' && note.mood ? { mood: note.mood } : {}),
      };
    }
  }

  const cleanLocks: MonthlyLock[] = (rawLocks || [])
    .filter(lk => lk && VALID_MONTH_RE.test(lk.month || ''))
    .map(lk => ({
      month: lk.month,
      locked: Boolean(lk.locked),
      ...(lk.lockedAt ? { lockedAt: lk.lockedAt } : {}),
    }));

  const ingestState: IngestState = {
    version: rawIngest?.version || 1,
    tombstones: Array.isArray(rawIngest?.tombstones) ? [...rawIngest.tombstones] : [],
    sources:
      rawIngest?.sources && typeof rawIngest.sources === 'object'
        ? { ...rawIngest.sources }
        : {},
    recentRuns: Array.isArray(rawIngest?.recentRuns) ? [...rawIngest.recentRuns] : [],
  };

  return {
    schemaVersion: 1,
    app: 'nebula-expense-tracker',
    exportedAt: nowIso,
    updatedAt: nowIso,
    projectId: project.id,
    project: {
      id: project.id,
      name: project.name,
      ...(project.spreadsheetId ? { spreadsheetId: project.spreadsheetId } : {}),
      ...(Array.isArray(project.collaborators) ? { collaborators: [...project.collaborators] } : {}),
    },
    transactions: sortedTransactions,
    categories: normalizedCategories,
    budgets: [...rawBudgets],
    notes: cleanNotes,
    locks: cleanLocks,
    ingestState,
  };
}

export function serializeWorkspaceSnapshot(snapshot: NebulaWorkspaceSnapshotV1): string {
  return JSON.stringify(snapshot, null, 2);
}

export function triggerFileDownload(
  content: string,
  filename: string,
  mimeType: string
): void {
  if (typeof document === 'undefined') return;
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.setAttribute('download', filename);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function downloadWorkspaceSnapshotJson(
  snapshot: NebulaWorkspaceSnapshotV1,
  todayStr: string = getLocalTodayDate()
): string {
  const filename = `nebula-workspace-${slugifyWorkspaceName(snapshot.project.name)}-${todayStr}.json`;
  triggerFileDownload(
    serializeWorkspaceSnapshot(snapshot),
    filename,
    'application/json;charset=utf-8;'
  );
  return filename;
}

function isPlainObject(val: unknown): val is Record<string, unknown> {
  return Boolean(val && typeof val === 'object' && !Array.isArray(val));
}

export function parseAndValidateWorkspaceSnapshot(
  jsonText: string,
  fallbackProject?: Project | null
): ParseWorkspaceSnapshotResult {
  if (typeof jsonText !== 'string' || !jsonText.trim()) {
    return { ok: false, error: 'Snapshot file is empty.' };
  }

  let raw: unknown;
  try {
    raw = JSON.parse(jsonText);
  } catch {
    return { ok: false, error: 'Invalid JSON syntax. Please select a valid Nebula workspace JSON file.' };
  }

  if (!isPlainObject(raw)) {
    return { ok: false, error: 'Invalid snapshot root: expected a JSON object.' };
  }

  if (!Array.isArray(raw.transactions)) {
    return {
      ok: false,
      error: 'Invalid snapshot: missing required "transactions" array.',
    };
  }

  const hasProp = (key: string) => Object.prototype.hasOwnProperty.call(raw, key);

  if (hasProp('categories') && !Array.isArray(raw.categories)) {
    return { ok: false, error: 'Invalid snapshot: "categories" must be an array.' };
  }
  if (hasProp('budgets') && !Array.isArray(raw.budgets)) {
    return { ok: false, error: 'Invalid snapshot: "budgets" must be an array.' };
  }
  if (hasProp('notes') && !isPlainObject(raw.notes)) {
    return { ok: false, error: 'Invalid snapshot: "notes" must be an object.' };
  }
  if (hasProp('locks') && !Array.isArray(raw.locks)) {
    return { ok: false, error: 'Invalid snapshot: "locks" must be an array.' };
  }
  if (hasProp('ingestState') && !isPlainObject(raw.ingestState)) {
    return { ok: false, error: 'Invalid snapshot: "ingestState" must be an object.' };
  }

  const includedSections: IncludedSnapshotSections = {
    categories: hasProp('categories'),
    budgets: hasProp('budgets'),
    notes: hasProp('notes'),
    locks: hasProp('locks'),
    ingestState: hasProp('ingestState'),
  };

  // Validate transactions
  const transactions: Transaction[] = [];
  for (let i = 0; i < raw.transactions.length; i++) {
    const item = raw.transactions[i];
    if (!isPlainObject(item)) {
      return { ok: false, error: `Invalid transaction at index ${i}: expected an object.` };
    }
    const id = typeof item.id === 'string' ? item.id.trim() : '';
    if (!id) {
      return { ok: false, error: `Invalid transaction at index ${i}: non-empty "id" is required.` };
    }
    const date = typeof item.date === 'string' ? item.date.trim() : '';
    if (!VALID_DATE_RE.test(date)) {
      return {
        ok: false,
        error: `Invalid transaction at index ${i} (${id}): "date" must be YYYY-MM-DD.`,
      };
    }
    const rawAmount = typeof item.amount === 'number' ? item.amount : Number(item.amount);
    if (!Number.isFinite(rawAmount) || rawAmount < 0) {
      return {
        ok: false,
        error: `Invalid transaction at index ${i} (${id}): "amount" must be a finite number >= 0.`,
      };
    }
    const txType = typeof item.type === 'string' ? item.type.trim() : '';
    if (!VALID_TX_TYPES.has(txType)) {
      return {
        ok: false,
        error: `Invalid transaction at index ${i} (${id}): "type" must be income, expense, or transfer.`,
      };
    }
    if (typeof item.category !== 'string') {
      return {
        ok: false,
        error: `Invalid transaction at index ${i} (${id}): "category" must be a string.`,
      };
    }
    if (typeof item.description !== 'string') {
      return {
        ok: false,
        error: `Invalid transaction at index ${i} (${id}): "description" must be a string.`,
      };
    }

    const notesStr = typeof item.notes === 'string' ? item.notes : '';
    const labelsArr = Array.isArray(item.labels)
      ? item.labels.filter((l): l is string => typeof l === 'string')
      : [];
    const hashStr =
      typeof item.hash === 'string' && item.hash.trim()
        ? item.hash.trim()
        : `${date}|${item.description.trim().toLowerCase()}|${rawAmount.toFixed(2)}|${txType}`;

    const normalizedTx: Transaction = {
      id,
      date,
      category: item.category,
      ...(typeof item.subCategory === 'string' || item.subCategory === null
        ? { subCategory: item.subCategory }
        : {}),
      amount: rawAmount,
      type: txType as Transaction['type'],
      description: item.description,
      notes: notesStr,
      labels: labelsArr,
      hash: hashStr,
    };

    if (
      typeof item.spendingBucket === 'string' &&
      VALID_SPENDING_BUCKETS.has(item.spendingBucket)
    ) {
      normalizedTx.spendingBucket = item.spendingBucket as SpendingBucket;
    }
    if (isPlainObject(item.meta)) {
      normalizedTx.meta = item.meta as unknown as Transaction['meta'];
    }

    transactions.push(normalizedTx);
  }

  transactions.sort(
    (a, b) => a.date.localeCompare(b.date) || a.id.localeCompare(b.id)
  );

  // Validate categories
  const categories: Category[] = [];
  if (includedSections.categories && Array.isArray(raw.categories)) {
    for (let i = 0; i < raw.categories.length; i++) {
      const c = raw.categories[i];
      if (!isPlainObject(c)) {
        return { ok: false, error: `Invalid category at index ${i}: expected an object.` };
      }
      const id = typeof c.id === 'string' ? c.id.trim() : '';
      const name = typeof c.name === 'string' ? c.name.trim() : '';
      if (!id || !name) {
        return {
          ok: false,
          error: `Invalid category at index ${i}: non-empty "id" and "name" are required.`,
        };
      }
      categories.push(
        normalizeCategoryRecord({
          id,
          name,
          color: typeof c.color === 'string' && c.color.trim() ? c.color.trim() : '#38BDF8',
          emoji: typeof c.emoji === 'string' && c.emoji.trim() ? c.emoji.trim() : '🏷️',
          parentId: typeof c.parentId === 'string' && c.parentId.trim() ? c.parentId.trim() : null,
          ...(typeof c.defaultBucket === 'string' && VALID_SPENDING_BUCKETS.has(c.defaultBucket)
            ? { defaultBucket: c.defaultBucket as SpendingBucket }
            : {}),
        })
      );
    }
  }

  // Validate budgets
  const budgets: Budget[] = [];
  if (includedSections.budgets && Array.isArray(raw.budgets)) {
    for (let i = 0; i < raw.budgets.length; i++) {
      const b = raw.budgets[i];
      if (!isPlainObject(b)) {
        return { ok: false, error: `Invalid budget at index ${i}: expected an object.` };
      }
      const cat = typeof b.category === 'string' ? b.category.trim() : '';
      const amt = typeof b.amount === 'number' ? b.amount : Number(b.amount);
      if (!cat) {
        return {
          ok: false,
          error: `Invalid budget at index ${i}: non-empty "category" is required.`,
        };
      }
      if (!Number.isFinite(amt) || amt < 0) {
        return {
          ok: false,
          error: `Invalid budget at index ${i} (${cat}): "amount" must be a finite number >= 0.`,
        };
      }
      budgets.push({ category: cat, amount: amt });
    }
  }

  // Validate notes (stripping __meta_* keys per Guardrail G7 and prototype-pollution keys)
  const notes: Record<string, BudgetNote> = {};
  if (includedSections.notes && isPlainObject(raw.notes)) {
    const nowIso = new Date().toISOString();
    for (const [key, val] of Object.entries(raw.notes)) {
      if (key === '__proto__' || key === 'constructor' || key === 'prototype') continue;
      if (key.startsWith('__meta_')) continue;
      if (!isPlainObject(val)) {
        return { ok: false, error: `Invalid budget note "${key}": expected an object.` };
      }
      if (typeof val.text !== 'string') {
        return { ok: false, error: `Invalid budget note "${key}": "text" must be a string.` };
      }
      notes[key] = {
        text: val.text,
        updatedAt: typeof val.updatedAt === 'string' ? val.updatedAt : nowIso,
        ...(typeof val.mood === 'string' && val.mood ? { mood: val.mood } : {}),
      };
    }
  }

  // Validate locks
  const locks: MonthlyLock[] = [];
  if (includedSections.locks && Array.isArray(raw.locks)) {
    for (let i = 0; i < raw.locks.length; i++) {
      const lk = raw.locks[i];
      if (!isPlainObject(lk)) {
        return { ok: false, error: `Invalid lock at index ${i}: expected an object.` };
      }
      const month = typeof lk.month === 'string' ? lk.month.trim() : '';
      if (!VALID_MONTH_RE.test(month)) {
        return {
          ok: false,
          error: `Invalid lock at index ${i}: "month" must be YYYY-MM.`,
        };
      }
      if (typeof lk.locked !== 'boolean') {
        return {
          ok: false,
          error: `Invalid lock at index ${i} (${month}): "locked" must be a boolean.`,
        };
      }
      locks.push({
        month,
        locked: lk.locked,
        ...(typeof lk.lockedAt === 'string' && lk.lockedAt ? { lockedAt: lk.lockedAt } : {}),
      });
    }
  }

  // Validate ingestState (safely filtering prototype keys)
  let ingestState: IngestState = {
    version: 1,
    tombstones: [],
    sources: {},
    recentRuns: [],
  };
  if (includedSections.ingestState && isPlainObject(raw.ingestState)) {
    const rawIng = raw.ingestState;
    const tombstones = Array.isArray(rawIng.tombstones)
      ? rawIng.tombstones.filter((t): t is string => typeof t === 'string')
      : isPlainObject(rawIng.tombstones)
      ? Object.keys(rawIng.tombstones).filter(k => k !== '__proto__' && k !== 'constructor' && k !== 'prototype')
      : [];
    const cleanSources: IngestState['sources'] = {};
    if (isPlainObject(rawIng.sources)) {
      for (const [srcKey, srcVal] of Object.entries(rawIng.sources)) {
        if (srcKey === '__proto__' || srcKey === 'constructor' || srcKey === 'prototype') continue;
        if (isPlainObject(srcVal)) {
          cleanSources[srcKey] = srcVal as unknown as IngestState['sources'][string];
        }
      }
    }
    const recentRuns = Array.isArray(rawIng.recentRuns)
      ? (rawIng.recentRuns as IngestState['recentRuns'])
      : [];
    ingestState = {
      version: typeof rawIng.version === 'number' ? rawIng.version : 1,
      tombstones,
      sources: cleanSources,
      recentRuns,
    };
  }

  const rawProjectObj = isPlainObject(raw.project) ? raw.project : null;
  const resolvedProjectId =
    (typeof raw.projectId === 'string' && raw.projectId.trim()) ||
    (rawProjectObj && typeof rawProjectObj.id === 'string' && rawProjectObj.id.trim()) ||
    fallbackProject?.id ||
    'default';

  const resolvedProjectName =
    (rawProjectObj && typeof rawProjectObj.name === 'string' && rawProjectObj.name.trim()) ||
    fallbackProject?.name ||
    'Workspace';

  const nowIso = new Date().toISOString();
  const exportedAt =
    typeof raw.exportedAt === 'string' && raw.exportedAt.trim()
      ? raw.exportedAt
      : typeof raw.updatedAt === 'string' && raw.updatedAt.trim()
      ? raw.updatedAt
      : nowIso;
  const updatedAt =
    typeof raw.updatedAt === 'string' && raw.updatedAt.trim() ? raw.updatedAt : exportedAt;

  const snapshot: NebulaWorkspaceSnapshotV1 = {
    schemaVersion: 1,
    app: 'nebula-expense-tracker',
    exportedAt,
    updatedAt,
    projectId: resolvedProjectId,
    project: {
      id: resolvedProjectId,
      name: resolvedProjectName,
      ...(rawProjectObj && typeof rawProjectObj.spreadsheetId === 'string'
        ? { spreadsheetId: rawProjectObj.spreadsheetId }
        : fallbackProject?.spreadsheetId
        ? { spreadsheetId: fallbackProject.spreadsheetId }
        : {}),
      ...(rawProjectObj && Array.isArray(rawProjectObj.collaborators)
        ? {
            collaborators: rawProjectObj.collaborators.filter(
              (c): c is string => typeof c === 'string'
            ),
          }
        : {}),
    },
    transactions,
    categories,
    budgets,
    notes,
    locks,
    ingestState,
  };

  const firstDate = transactions.length > 0 ? transactions[0].date : null;
  const lastDate = transactions.length > 0 ? transactions[transactions.length - 1].date : null;
  const isPartialCliStateFile =
    !includedSections.budgets || !includedSections.notes || !includedSections.locks;

  return {
    ok: true,
    snapshot,
    includedSections,
    summary: {
      projectName: resolvedProjectName,
      projectId: resolvedProjectId,
      transactionCount: transactions.length,
      categoryCount: categories.length,
      budgetCount: budgets.length,
      noteCount: Object.keys(notes).length,
      lockedMonthsCount: locks.filter(l => l.locked).length,
      ingestSourceCount: Object.keys(ingestState.sources || {}).length,
      dateRange: { firstDate, lastDate },
      isPartialCliStateFile,
    },
  };
}

export async function restoreWorkspaceSnapshot(
  storageAdapter: StorageAdapter,
  projectId: string,
  parsed: Extract<ParseWorkspaceSnapshotResult, { ok: true }>
): Promise<void> {
  const { snapshot, includedSections } = parsed;

  const [currentTxns, currentCats, currentNotes, currentLocks] = await Promise.all([
    storageAdapter.getTransactions(projectId),
    storageAdapter.getCategories(projectId),
    storageAdapter.getBudgetNotes(projectId),
    storageAdapter.getLocks(projectId),
  ]);

  // Deep-clone original locks before mutating storage (Guardrail G7)
  const originalLocks: MonthlyLock[] = currentLocks.map(l => ({ ...l }));

  // 1. Temporarily unlock all currently locked months so note deletions/saves never fail
  for (const lk of originalLocks) {
    if (lk.locked) {
      await storageAdapter.saveLock(projectId, { month: lk.month, locked: false });
    }
  }

  // 2. Delete all existing transactions with ignoreLocks
  if (currentTxns.length > 0) {
    await storageAdapter.deleteTransactions(
      projectId,
      currentTxns.map(t => t.id),
      { ignoreLocks: true }
    );
  }

  // 3. Sync notes when included in snapshot
  if (includedSections.notes) {
    for (const key of Object.keys(currentNotes || {})) {
      if (key.startsWith('__meta_')) continue;
      if (!Object.prototype.hasOwnProperty.call(snapshot.notes, key)) {
        await storageAdapter.deleteBudgetNote(projectId, key);
      }
    }
    for (const [key, note] of Object.entries(snapshot.notes)) {
      if (key.startsWith('__meta_')) continue;
      await storageAdapter.saveBudgetNote(projectId, key, note);
    }
  }

  // 4. Sync categories when included and non-empty
  if (includedSections.categories && snapshot.categories.length > 0) {
    const snapCatIds = new Set(snapshot.categories.map(c => c.id));
    for (const cat of snapshot.categories) {
      await storageAdapter.saveCategory(projectId, normalizeCategoryRecord(cat));
    }
    for (const existing of currentCats) {
      if (!snapCatIds.has(existing.id)) {
        await storageAdapter.deleteCategory(projectId, existing.id);
      }
    }
  }

  // 5. Save snapshot transactions
  if (snapshot.transactions.length > 0) {
    await storageAdapter.saveTransactions(projectId, snapshot.transactions, {
      ignoreLocks: true,
    });
  }

  // 6. Save budgets when included
  if (includedSections.budgets) {
    await storageAdapter.saveBudgets(projectId, snapshot.budgets);
  }

  // 7. Save ingestState when included
  if (includedSections.ingestState && storageAdapter.saveIngestState) {
    await storageAdapter.saveIngestState(projectId, snapshot.ingestState);
  }

  // 8. Re-apply target locks (snapshot locks if included, else originalLocks)
  const targetLocks = includedSections.locks ? snapshot.locks : originalLocks;
  const targetLockMap = new Map(targetLocks.map(l => [l.month, l]));

  for (const orig of originalLocks) {
    if (!targetLockMap.has(orig.month)) {
      await storageAdapter.saveLock(projectId, { month: orig.month, locked: false });
    }
  }
  for (const tl of targetLocks) {
    await storageAdapter.saveLock(projectId, {
      month: tl.month,
      locked: Boolean(tl.locked),
      ...(tl.lockedAt ? { lockedAt: tl.lockedAt } : {}),
    });
  }

  storageAdapter.invalidateCache?.(projectId);
}

export async function clearWorkspaceData(
  storageAdapter: StorageAdapter,
  projectId: string
): Promise<void> {
  const [currentTxns, currentNotes, currentLocks] = await Promise.all([
    storageAdapter.getTransactions(projectId),
    storageAdapter.getBudgetNotes(projectId),
    storageAdapter.getLocks(projectId),
  ]);

  const originalLocks: MonthlyLock[] = currentLocks.map(l => ({ ...l }));

  for (const lk of originalLocks) {
    if (lk.locked) {
      await storageAdapter.saveLock(projectId, { month: lk.month, locked: false });
    }
  }

  if (currentTxns.length > 0) {
    await storageAdapter.deleteTransactions(
      projectId,
      currentTxns.map(t => t.id),
      { ignoreLocks: true }
    );
  }

  for (const key of Object.keys(currentNotes || {})) {
    if (key.startsWith('__meta_')) continue;
    await storageAdapter.deleteBudgetNote(projectId, key);
  }

  await storageAdapter.saveBudgets(projectId, []);

  if (storageAdapter.saveIngestState) {
    await storageAdapter.saveIngestState(projectId, {
      version: 1,
      tombstones: [],
      sources: {},
      recentRuns: [],
    });
  }

  storageAdapter.invalidateCache?.(projectId);
}

export function computeWorkspaceHygieneReport(params: {
  transactions: Transaction[];
  categories: Category[];
  locks: MonthlyLock[];
  duplicateTxnIds?: Set<string>;
  ingestState?: IngestState | null;
}): WorkspaceHygieneReport {
  const { transactions, categories, locks, duplicateTxnIds, ingestState } = params;

  const validDates = transactions
    .map(t => t.date)
    .filter((d): d is string => Boolean(d && VALID_DATE_RE.test(d)))
    .sort();

  const firstDate = validDates.length > 0 ? validDates[0] : null;
  const lastDate = validDates.length > 0 ? validDates[validDates.length - 1] : null;

  let needsReviewCount = 0;
  let pendingCount = 0;
  let uncategorizedCount = 0;
  let fallbackBucketCount = 0;

  for (const t of transactions) {
    if (isTransactionNeedsReview(t, duplicateTxnIds)) {
      needsReviewCount += 1;
    }
    if (isTransactionPending(t)) {
      pendingCount += 1;
    }
    if (
      t.type !== 'transfer' &&
      (!t.category || !t.category.trim() || t.category.trim().toLowerCase() === 'uncategorized')
    ) {
      uncategorizedCount += 1;
    }
    if (t.type === 'expense' && bucketSource(t, categories) === 'fallback') {
      fallbackBucketCount += 1;
    }
  }

  const sourcesObj = ingestState?.sources || {};
  const sourceIds = Object.keys(sourcesObj);
  const timestamps: string[] = [];
  for (const s of Object.values(sourcesObj)) {
    if (s?.lastSyncAt) timestamps.push(s.lastSyncAt);
  }
  if (Array.isArray(ingestState?.recentRuns)) {
    for (const r of ingestState.recentRuns) {
      if (r?.timestamp) timestamps.push(r.timestamp);
    }
  }
  timestamps.sort();
  const lastSyncAt = timestamps.length > 0 ? timestamps[timestamps.length - 1] : null;

  return {
    totalTransactions: transactions.length,
    activeMonthsCount: countActiveTransactionMonths(transactions),
    dateSpan: { firstDate, lastDate },
    lockedMonthsCount: (locks || []).filter(l => l.locked).length,
    needsReviewCount,
    pendingCount,
    uncategorizedCount,
    fallbackBucketCount,
    syncSummary: {
      sourceIds,
      lastSyncAt,
      tombstoneCount: Array.isArray(ingestState?.tombstones)
        ? ingestState.tombstones.length
        : 0,
      recentRunCount: Array.isArray(ingestState?.recentRuns)
        ? ingestState.recentRuns.length
        : 0,
    },
  };
}
