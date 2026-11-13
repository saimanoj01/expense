import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import {
  FolderGit2,
  Tag,
  FileSpreadsheet,
  Sparkles,
  Moon,
  Sun,
  Share2,
  Plus,
  Download,
  Upload,
  Database,
  ShieldCheck,
  AlertTriangle,
  Check,
  Edit2,
  Trash2,
  ChevronRight,
  FolderPlus,
  LogOut,
} from 'lucide-react';
import type { User } from '../../context/AuthContext';
import type {
  Project,
  Category,
  Transaction,
  MonthlyLock,
  StorageAdapter,
  IngestState,
} from '../../services/storage';
import { BUCKETS } from '../../theme/buckets';
import { deriveCategoryBucket } from '../../utils/metrics';
import { buildTransactionsCsvExport, getLocalTodayDate } from '../../utils/csv';
import { showToast } from '../../utils/toast';
import { useNavigation } from '../../hooks/useNavigation';
import { Modal } from '../common/Modal';
import {
  buildWorkspaceSnapshot,
  clearWorkspaceData,
  computeWorkspaceHygieneReport,
  downloadWorkspaceSnapshotJson,
  parseAndValidateWorkspaceSnapshot,
  restoreWorkspaceSnapshot,
  slugifyWorkspaceName,
  triggerFileDownload,
  type ParseWorkspaceSnapshotResult,
} from '../../utils/workspacePortability';

export interface SettingsViewProps {
  activeProject?: Project | null;
  projects?: Project[];
  categories: Category[];
  transactions?: Transaction[];
  locks?: MonthlyLock[];
  duplicateTxnIds?: Set<string>;
  storageAdapter?: StorageAdapter | null;
  isMockMode?: boolean;
  user?: User | null;
  onLogout?: () => Promise<void> | void;
  onSelectProject?: (projectId: string) => void;
  onOpenCreateProject?: () => void;
  onRenameProject?: (projectId: string, newName: string) => Promise<unknown>;
  onDeleteProject?: (projectId: string) => Promise<void>;
  onWorkspaceDataMutated?: () => void;
  onShareProjectClick: () => void;
  onOpenCategoryManager: () => void;
  onOpenCsvWizard: () => void;
  onLoadSampleData?: () => void;
  theme: 'light' | 'dark';
  onToggleTheme: () => void;
}

export function SettingsView({
  activeProject,
  projects = [],
  categories,
  transactions = [],
  locks = [],
  duplicateTxnIds,
  storageAdapter,
  isMockMode = true,
  user,
  onLogout,
  onSelectProject,
  onOpenCreateProject,
  onRenameProject,
  onDeleteProject,
  onWorkspaceDataMutated,
  onShareProjectClick,
  onOpenCategoryManager,
  onOpenCsvWizard,
  onLoadSampleData,
  theme,
  onToggleTheme,
}: SettingsViewProps) {
  const { navigate } = useNavigation();
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Workspace inline rename state
  const [isRenaming, setIsRenaming] = useState(false);
  const [renameDraft, setRenameDraft] = useState('');
  const [savingRename, setSavingRename] = useState(false);

  // Delete workspace confirmation modal state
  const [showDeleteWorkspaceModal, setShowDeleteWorkspaceModal] = useState(false);
  const [deleteWorkspaceConfirmText, setDeleteWorkspaceConfirmText] = useState('');
  const [deletingWorkspace, setDeletingWorkspace] = useState(false);

  // Restore JSON snapshot state
  const [restoreError, setRestoreError] = useState<string | null>(null);
  const [pendingRestore, setPendingRestore] = useState<
    Extract<ParseWorkspaceSnapshotResult, { ok: true }> | null
  >(null);
  const [restoringSnapshot, setRestoringSnapshot] = useState(false);
  const [exportingSnapshot, setExportingSnapshot] = useState(false);

  // Sample data overwrite & Clear Workspace confirmation modals
  const [showSampleOverwriteModal, setShowSampleOverwriteModal] = useState(false);
  const [showClearDataModal, setShowClearDataModal] = useState(false);
  const [clearConfirmText, setClearConfirmText] = useState('');
  const [clearingData, setClearingData] = useState(false);

  // Ingest provenance state (refreshed on mount, project switch, and after restore/clear — Guardrail G7)
  const [ingestState, setIngestState] = useState<IngestState | null>(null);
  const [provenanceTick, setProvenanceTick] = useState(0);

  const loadIngestProvenance = useCallback(async () => {
    if (!storageAdapter?.getIngestState || !activeProject?.id) {
      setIngestState(null);
      return;
    }
    try {
      const st = await storageAdapter.getIngestState(activeProject.id);
      setIngestState(st);
    } catch {
      setIngestState(null);
    }
  }, [storageAdapter, activeProject?.id]);

  useEffect(() => {
    loadIngestProvenance();
  }, [loadIngestProvenance, provenanceTick, transactions.length]);

  useEffect(() => {
    setIsRenaming(false);
    setRestoreError(null);
  }, [activeProject?.id]);

  const hygiene = useMemo(
    () =>
      computeWorkspaceHygieneReport({
        transactions,
        categories,
        locks,
        duplicateTxnIds,
        ingestState,
      }),
    [transactions, categories, locks, duplicateTxnIds, ingestState]
  );

  const topLevelCategories = useMemo(
    () => categories.filter(c => !c.parentId),
    [categories]
  );

  const handleStartRename = () => {
    setRenameDraft(activeProject?.name || '');
    setIsRenaming(true);
  };

  const handleCommitRename = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeProject || !onRenameProject || !renameDraft.trim()) return;
    setSavingRename(true);
    try {
      await onRenameProject(activeProject.id, renameDraft.trim());
      setIsRenaming(false);
      showToast('Workspace renamed');
    } catch (err: unknown) {
      showToast(err instanceof Error ? err.message : 'Failed to rename workspace', 'error');
    } finally {
      setSavingRename(false);
    }
  };

  const handleExportWorkspaceJson = async () => {
    if (!storageAdapter || !activeProject) return;
    setExportingSnapshot(true);
    try {
      const snapshot = await buildWorkspaceSnapshot({
        project: activeProject,
        storageAdapter,
      });
      const filename = downloadWorkspaceSnapshotJson(snapshot);
      showToast(`Exported ${filename}`);
    } catch (err: unknown) {
      showToast(err instanceof Error ? err.message : 'Failed to export JSON snapshot', 'error');
    } finally {
      setExportingSnapshot(false);
    }
  };

  const handleFileSelected = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;

    setRestoreError(null);
    try {
      const text = await file.text();
      const parsed = parseAndValidateWorkspaceSnapshot(text, activeProject);
      if (!parsed.ok) {
        setRestoreError(parsed.error);
        return;
      }
      setPendingRestore(parsed);
    } catch {
      setRestoreError('Unable to read the selected file.');
    }
  };

  const handleConfirmRestore = async () => {
    if (!storageAdapter || !activeProject || !pendingRestore) return;
    setRestoringSnapshot(true);
    try {
      await restoreWorkspaceSnapshot(storageAdapter, activeProject.id, pendingRestore);
      const restoredCount = pendingRestore.summary.transactionCount;
      setPendingRestore(null);
      setRestoreError(null);
      setProvenanceTick(t => t + 1);
      onWorkspaceDataMutated?.();
      showToast(`Restored ${restoredCount} transaction${restoredCount === 1 ? '' : 's'} from JSON snapshot`);
    } catch (err: unknown) {
      showToast(
        err instanceof Error ? err.message : 'Failed to restore workspace snapshot',
        'error'
      );
    } finally {
      setRestoringSnapshot(false);
    }
  };

  const handleExportFullCsv = () => {
    if (transactions.length === 0) {
      showToast('No transactions to export', 'error');
      return;
    }
    const sorted = [...transactions].sort(
      (a, b) => (a.date || '').localeCompare(b.date || '') || (a.id || '').localeCompare(b.id || '')
    );
    const csvContent = buildTransactionsCsvExport(sorted, categories);
    const slug = slugifyWorkspaceName(activeProject?.name);
    const filename = `nebula-transactions-${slug}-${getLocalTodayDate()}.csv`;
    triggerFileDownload(csvContent, filename, 'text/csv;charset=utf-8;');
    showToast(`Exported ${sorted.length} transactions to CSV`);
  };

  const handleSampleDataTrigger = () => {
    if (!onLoadSampleData) return;
    if (transactions.length > 0) {
      setShowSampleOverwriteModal(true);
      return;
    }
    onLoadSampleData();
  };

  const handleConfirmClearWorkspace = async () => {
    if (!storageAdapter || !activeProject || clearConfirmText.trim().toUpperCase() !== 'CLEAR') {
      return;
    }
    setClearingData(true);
    try {
      await clearWorkspaceData(storageAdapter, activeProject.id);
      setShowClearDataModal(false);
      setClearConfirmText('');
      setProvenanceTick(t => t + 1);
      onWorkspaceDataMutated?.();
      showToast('Workspace data cleared');
    } catch (err: unknown) {
      showToast(err instanceof Error ? err.message : 'Failed to clear workspace data', 'error');
    } finally {
      setClearingData(false);
    }
  };

  const handleConfirmDeleteWorkspace = async () => {
    if (
      !activeProject ||
      !onDeleteProject ||
      deleteWorkspaceConfirmText.trim() !== activeProject.name
    ) {
      return;
    }
    setDeletingWorkspace(true);
    try {
      await onDeleteProject(activeProject.id);
      setShowDeleteWorkspaceModal(false);
      setDeleteWorkspaceConfirmText('');
      showToast('Workspace deleted');
    } catch (err: unknown) {
      showToast(err instanceof Error ? err.message : 'Failed to delete workspace', 'error');
    } finally {
      setDeletingWorkspace(false);
    }
  };

  const workspaceList = projects.length > 0 ? projects : activeProject ? [activeProject] : [];

  return (
    <div className="max-w-5xl mx-auto space-y-6 pb-8" data-testid="settings-workspace">
      {/* Header */}
      <div className="pb-4 border-b border-border">
        <h1 className="text-title text-foreground">Settings & Data Store</h1>
        <p className="text-label text-muted-foreground mt-1">
          Manage workspaces, lossless JSON backups, ledger hygiene diagnostics, categories, and display preferences
        </p>
      </div>

      {/* 1. Workspace Management */}
      <section
        data-testid="settings-section-workspaces"
        className="p-5 rounded-[14px] bg-card border border-border space-y-4"
      >
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <FolderGit2 className="w-4 h-4 text-muted-foreground" />
            <h2 className="text-heading text-foreground">Workspaces & Collaboration</h2>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onShareProjectClick}
              data-testid="share-project-btn"
              className="px-3 py-1.5 rounded-[10px] bg-surface2 hover:bg-secondary border border-border text-foreground text-label font-medium inline-flex items-center gap-1.5 transition-colors focus-visible:ring-2 ring-ring/40"
            >
              <Share2 className="w-3.5 h-3.5 text-muted-foreground" />
              <span>Collaborate</span>
            </button>
            {onOpenCreateProject && (
              <button
                type="button"
                onClick={onOpenCreateProject}
                data-testid="create-workspace-btn"
                className="px-3 py-1.5 rounded-[10px] bg-primary text-primary-foreground hover:opacity-90 text-label font-medium inline-flex items-center gap-1.5 transition-opacity focus-visible:ring-2 ring-ring/40"
              >
                <FolderPlus className="w-3.5 h-3.5" />
                <span>New Workspace</span>
              </button>
            )}
          </div>
        </div>

        {/* Active Workspace Rename / Identity */}
        <div className="pt-2 border-t border-border/60 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          {isRenaming ? (
            <form onSubmit={handleCommitRename} className="flex items-center gap-2 flex-1">
              <input
                type="text"
                data-testid="rename-workspace-input"
                value={renameDraft}
                onChange={e => setRenameDraft(e.target.value)}
                autoFocus
                className="h-9 px-3 rounded-[10px] bg-surface2 border border-border text-body text-foreground focus-visible:ring-2 ring-ring/40 outline-none flex-1 max-w-xs"
              />
              <button
                type="submit"
                disabled={savingRename || !renameDraft.trim()}
                data-testid="rename-workspace-save-btn"
                className="h-9 px-3 rounded-[10px] bg-primary text-primary-foreground text-label font-medium hover:opacity-90 transition-opacity disabled:opacity-50"
              >
                Save
              </button>
              <button
                type="button"
                onClick={() => setIsRenaming(false)}
                className="h-9 px-3 rounded-[10px] bg-surface2 border border-border text-label font-medium text-foreground"
              >
                Cancel
              </button>
            </form>
          ) : (
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <span className="text-body font-semibold text-foreground truncate">
                  {activeProject?.name || 'Personal Finances'}
                </span>
                <span className="px-2 py-0.5 rounded bg-surface2 text-label text-muted-foreground">
                  Active
                </span>
              </div>
              <p className="text-label text-muted-foreground mt-0.5 tabular-nums num">
                ID: {activeProject?.id || 'default'}
                {activeProject?.collaborators && activeProject.collaborators.length > 0
                  ? ` · ${activeProject.collaborators.length} collaborator${
                      activeProject.collaborators.length === 1 ? '' : 's'
                    }`
                  : ''}
              </p>
            </div>
          )}

          {!isRenaming && (
            <div className="flex items-center gap-2 shrink-0">
              {onRenameProject && activeProject && (
                <button
                  type="button"
                  data-testid="rename-workspace-btn"
                  onClick={handleStartRename}
                  className="px-2.5 py-1.5 rounded-[8px] bg-surface2 hover:bg-secondary border border-border text-label font-medium text-foreground inline-flex items-center gap-1.5 transition-colors"
                >
                  <Edit2 className="w-3.5 h-3.5 text-muted-foreground" />
                  <span>Rename</span>
                </button>
              )}
              {onDeleteProject && activeProject && (
                <button
                  type="button"
                  data-testid="delete-workspace-btn"
                  onClick={() => {
                    setDeleteWorkspaceConfirmText('');
                    setShowDeleteWorkspaceModal(true);
                  }}
                  className="px-2.5 py-1.5 rounded-[8px] bg-surface2 hover:bg-negative/10 border border-border text-label font-medium text-muted-foreground hover:text-negative inline-flex items-center gap-1.5 transition-colors"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  <span>Delete</span>
                </button>
              )}
            </div>
          )}
        </div>

        {/* Multi-Workspace Switcher List (when >= 2 workspaces exist) */}
        {workspaceList.length > 1 && onSelectProject && (
          <div className="pt-2 border-t border-border/60 divide-y divide-border/50">
            {workspaceList.map(proj => {
              const isSelected = proj.id === activeProject?.id;
              return (
                <button
                  key={proj.id}
                  type="button"
                  data-testid={`settings-workspace-row-${proj.id}`}
                  onClick={() => {
                    if (!isSelected) onSelectProject(proj.id);
                  }}
                  className="w-full min-h-[44px] py-2 px-2 -mx-2 rounded-[10px] hover:bg-surface2 transition-colors flex items-center justify-between gap-3 text-left"
                >
                  <div className="min-w-0">
                    <span className="text-body font-medium text-foreground truncate block">
                      {proj.name}
                    </span>
                    <span className="text-label text-muted-foreground">ID: {proj.id}</span>
                  </div>
                  {isSelected ? (
                    <span className="inline-flex items-center gap-1 text-label font-medium text-bucket-saved">
                      <Check className="w-3.5 h-3.5" /> Active
                    </span>
                  ) : (
                    <span className="text-label text-muted-foreground">Switch →</span>
                  )}
                </button>
              );
            })}
          </div>
        )}

        {/* SET-03: Account Session & Mobile Sign-Out Row (BUG-UX-SET-01 Fix) */}
        <div
          data-testid="settings-section-account"
          className="pt-3 border-t border-border/60 flex flex-col sm:flex-row sm:items-center justify-between gap-3"
        >
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <span className="text-body font-semibold text-foreground truncate">
                {user?.name || 'User'}
              </span>
              <span className="px-2 py-0.5 rounded bg-surface2 text-label text-muted-foreground">
                {isMockMode ? 'Mock / Demo Session' : user?.email || 'Google Account'}
              </span>
            </div>
            {!isMockMode && user?.email && (
              <p className="text-label text-muted-foreground mt-0.5 truncate">
                {user.email}
              </p>
            )}
          </div>

          {onLogout && (
            <button
              type="button"
              data-testid="settings-logout-btn"
              onClick={() => void onLogout()}
              className="px-3 py-1.5 rounded-[10px] bg-surface2 hover:bg-negative/10 border border-border text-foreground hover:text-negative text-label font-medium inline-flex items-center gap-1.5 transition-colors self-start sm:self-auto focus-visible:ring-2 ring-ring/40"
            >
              <LogOut className="w-3.5 h-3.5" />
              <span>Sign Out</span>
            </button>
          )}
        </div>
      </section>

      {/* 2. Data Store, Backups & Portability */}
      <section
        data-testid="settings-section-datastore"
        className="p-5 rounded-[14px] bg-card border border-border space-y-4"
      >
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <Database className="w-4 h-4 text-muted-foreground" />
            <div>
              <h2 className="text-heading text-foreground">Data Store, Backups & Portability</h2>
              <p className="text-label text-muted-foreground">
                Lossless JSON snapshots round-trip 1:1 with Nebula and CLI <code className="text-foreground">--state-file</code> workflows
              </p>
            </div>
          </div>

          <span
            data-testid="storage-engine-badge"
            className="px-2.5 py-1 rounded-[8px] bg-surface2 text-label font-medium text-foreground"
          >
            {isMockMode
              ? 'Local Storage (Browser)'
              : activeProject?.spreadsheetId
              ? 'Google Sheets Cloud Sync'
              : 'Cloud Workspace'}
          </span>
        </div>

        {/* Hidden file input — Guardrail G1: MUST use className="hidden" (display: none), NEVER .sr-only or .opacity-0 */}
        <input
          ref={fileInputRef}
          type="file"
          accept=".json,application/json"
          data-testid="restore-json-file-input"
          className="hidden"
          onChange={handleFileSelected}
        />

        {restoreError && (
          <div
            data-testid="restore-json-error"
            role="alert"
            className="p-3 rounded-[10px] bg-negative/10 text-negative text-label font-medium flex items-center justify-between gap-2"
          >
            <span>{restoreError}</span>
            <button
              type="button"
              onClick={() => setRestoreError(null)}
              className="text-label underline shrink-0"
            >
              Dismiss
            </button>
          </div>
        )}

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
          <button
            type="button"
            disabled={exportingSnapshot || !storageAdapter || !activeProject}
            onClick={handleExportWorkspaceJson}
            data-testid="export-workspace-json-btn"
            className="min-h-[44px] py-2.5 px-4 rounded-[10px] bg-primary text-primary-foreground hover:opacity-90 font-medium text-label transition-opacity flex items-center justify-center gap-2 focus-visible:ring-2 ring-ring/40 disabled:opacity-50"
          >
            <Download className="w-4 h-4" />
            <span>{exportingSnapshot ? 'Exporting…' : 'Export Workspace JSON'}</span>
          </button>

          <button
            type="button"
            disabled={!storageAdapter || !activeProject}
            onClick={() => {
              setRestoreError(null);
              fileInputRef.current?.click();
            }}
            data-testid="restore-workspace-json-btn"
            className="min-h-[44px] py-2.5 px-4 rounded-[10px] bg-surface2 hover:bg-secondary border border-border text-foreground font-medium text-label transition-colors flex items-center justify-center gap-2 focus-visible:ring-2 ring-ring/40 disabled:opacity-50"
          >
            <Upload className="w-4 h-4 text-muted-foreground" />
            <span>Restore from JSON Snapshot</span>
          </button>

          <button
            type="button"
            disabled={transactions.length === 0}
            onClick={handleExportFullCsv}
            data-testid="export-full-csv-btn"
            className="min-h-[44px] py-2.5 px-4 rounded-[10px] bg-surface2 hover:bg-secondary border border-border text-foreground font-medium text-label transition-colors flex items-center justify-center gap-2 focus-visible:ring-2 ring-ring/40 disabled:opacity-50"
          >
            <Download className="w-4 h-4 text-muted-foreground" />
            <span>Export Full Ledger CSV ({transactions.length})</span>
          </button>

          <button
            type="button"
            onClick={onOpenCsvWizard}
            data-testid="import-csv-trigger-btn"
            className="min-h-[44px] py-2.5 px-4 rounded-[10px] bg-surface2 hover:bg-secondary border border-border text-foreground font-medium text-label transition-colors flex items-center justify-center gap-2 focus-visible:ring-2 ring-ring/40"
          >
            <FileSpreadsheet className="w-4 h-4 text-muted-foreground" />
            <span>Open CSV Import Wizard</span>
          </button>
        </div>

        {/* Ingestion / Sync Provenance Footnote */}
        <div className="pt-3 border-t border-border/60 flex flex-wrap items-center justify-between gap-2 text-label text-muted-foreground tabular-nums num">
          <span>
            Sync sources:{' '}
            <strong className="text-foreground font-medium">
              {hygiene.syncSummary.sourceIds.length > 0
                ? hygiene.syncSummary.sourceIds.join(', ')
                : 'Manual / CSV only'}
            </strong>
          </span>
          <span>
            Tombstones: <strong className="text-foreground font-medium">{hygiene.syncSummary.tombstoneCount}</strong>
            {hygiene.syncSummary.lastSyncAt
              ? ` · Last sync ${hygiene.syncSummary.lastSyncAt.slice(0, 10)}`
              : ''}
          </span>
        </div>
      </section>

      {/* 3. Data Hygiene & Diagnostics + 4. Categories & Preferences */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-start">
        {/* Section 3: Data Hygiene & Diagnostics */}
        <section
          data-testid="settings-section-hygiene"
          className="p-5 rounded-[14px] bg-card border border-border space-y-4"
        >
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <ShieldCheck className="w-4 h-4 text-muted-foreground" />
              <h2 className="text-heading text-foreground">Data Hygiene & Diagnostics</h2>
            </div>
            <span className="text-label text-muted-foreground tabular-nums num">
              {hygiene.totalTransactions} total · {hygiene.activeMonthsCount} active mo
              {hygiene.activeMonthsCount === 1 ? '' : 's'}
            </span>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-2 text-label text-muted-foreground tabular-nums num pb-2 border-b border-border/60">
            <span>
              Span:{' '}
              <strong className="text-foreground font-medium">
                {hygiene.dateSpan.firstDate && hygiene.dateSpan.lastDate
                  ? `${hygiene.dateSpan.firstDate} → ${hygiene.dateSpan.lastDate}`
                  : 'No records yet'}
              </strong>
            </span>
            <span>
              Locked months:{' '}
              <strong className="text-foreground font-medium">{hygiene.lockedMonthsCount}</strong>
            </span>
          </div>

          <div className="divide-y divide-border/50">
            {[
              {
                id: 'review',
                label: 'Flagged for review',
                count: hygiene.needsReviewCount,
                href: '#/transactions?month=all&review=1',
                highlightTone: hygiene.needsReviewCount > 0 ? 'text-warning font-semibold' : 'text-muted-foreground',
              },
              {
                id: 'pending',
                label: 'Pending settlement',
                count: hygiene.pendingCount,
                href: '#/transactions?month=all&pending=1',
                highlightTone: hygiene.pendingCount > 0 ? 'text-foreground font-semibold' : 'text-muted-foreground',
              },
              {
                id: 'uncategorized',
                label: 'Uncategorized records',
                count: hygiene.uncategorizedCount,
                href: '#/transactions?month=all&cat=Uncategorized',
                highlightTone: hygiene.uncategorizedCount > 0 ? 'text-warning font-semibold' : 'text-muted-foreground',
              },
              {
                id: 'auto-bucket',
                label: 'Fallback bucket assignments',
                count: hygiene.fallbackBucketCount,
                href: '#/transactions?month=all&auto=1',
                highlightTone: hygiene.fallbackBucketCount > 0 ? 'text-foreground font-semibold' : 'text-muted-foreground',
              },
            ].map(row => (
              <button
                key={row.id}
                type="button"
                data-testid={`hygiene-link-${row.id}`}
                onClick={() => navigate(row.href)}
                className="w-full min-h-[44px] py-2 px-2 -mx-2 rounded-[10px] hover:bg-surface2 transition-colors flex items-center justify-between gap-3 text-left focus-visible:ring-2 ring-ring/40"
              >
                <span className="text-body text-foreground">{row.label}</span>
                <div className="flex items-center gap-2 tabular-nums num shrink-0">
                  <span className={`text-body ${row.highlightTone}`}>{row.count}</span>
                  <ChevronRight className="w-4 h-4 text-faint" />
                </div>
              </button>
            ))}
          </div>
        </section>

        {/* Section 4: Categories & Preferences */}
        <section
          data-testid="settings-section-preferences"
          className="p-5 rounded-[14px] bg-card border border-border space-y-4"
        >
          {/* Theme Row (SET-04: unique testid settings-theme-toggle-btn) */}
          <div className="flex items-center justify-between gap-2 pb-3 border-b border-border/60">
            <div className="flex items-center gap-2">
              {theme === 'dark' ? (
                <Moon className="w-4 h-4 text-muted-foreground" />
              ) : (
                <Sun className="w-4 h-4 text-muted-foreground" />
              )}
              <div>
                <h2 className="text-heading text-foreground">Appearance</h2>
                <p className="text-label text-muted-foreground capitalize">{theme} mode active</p>
              </div>
            </div>
            <button
              type="button"
              onClick={onToggleTheme}
              data-testid="settings-theme-toggle-btn"
              className="px-3 py-1.5 rounded-[10px] bg-surface2 hover:bg-secondary border border-border text-foreground text-label font-medium transition-colors inline-flex items-center gap-1.5 focus-visible:ring-2 ring-ring/40"
            >
              {theme === 'dark' ? (
                <>
                  <Sun className="w-3.5 h-3.5 text-muted-foreground" /> Light Mode
                </>
              ) : (
                <>
                  <Moon className="w-3.5 h-3.5 text-muted-foreground" /> Dark Mode
                </>
              )}
            </button>
          </div>

          {/* Categories Header */}
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <Tag className="w-4 h-4 text-muted-foreground" />
              <div>
                <h3 className="text-heading text-foreground">Categories & Buckets</h3>
                <p className="text-label text-muted-foreground tabular-nums num">
                  {categories.length} total ({topLevelCategories.length} top-level)
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={onOpenCategoryManager}
              data-testid="open-add-category-btn"
              className="px-3 py-1.5 rounded-[10px] bg-surface2 hover:bg-secondary border border-border text-foreground text-label font-medium transition-colors inline-flex items-center gap-1 focus-visible:ring-2 ring-ring/40"
            >
              <Plus className="w-3.5 h-3.5 text-muted-foreground" />
              <span>Category Manager</span>
            </button>
          </div>

          {/* Flat borderless category pills (SET-05: accurate derived bucket label, zero max-h clipping) */}
          <div className="grid grid-cols-2 gap-2">
            {topLevelCategories.map(cat => {
              const bucketLabel =
                cat.id === 'income' || cat.name?.toLowerCase() === 'income'
                  ? 'Inflow'
                  : cat.id === 'transfers' || cat.name?.toLowerCase() === 'transfers'
                  ? 'Transfer'
                  : BUCKETS[deriveCategoryBucket(cat.id, cat)]?.label || 'Variable';

              return (
                <div
                  key={cat.id}
                  className="px-2.5 py-2 rounded-[10px] bg-surface2 text-label flex items-center gap-2 min-w-0"
                  data-testid={`category-badge-${cat.name}`}
                >
                  <span className="text-sm shrink-0">{cat.emoji || '🏷️'}</span>
                  <div className="truncate min-w-0">
                    <p className="font-medium text-foreground truncate">{cat.name}</p>
                    <p className="text-label text-muted-foreground">{bucketLabel}</p>
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      </div>

      {/* 5. Sample Data & Danger Zone */}
      <section
        data-testid="settings-section-danger"
        className="p-5 rounded-[14px] bg-card border border-border space-y-4"
      >
        <div className="flex items-center gap-2">
          <AlertTriangle className="w-4 h-4 text-muted-foreground" />
          <h2 className="text-heading text-foreground">Sample Data & Workspace Reset</h2>
        </div>

        <div className="divide-y divide-border/60">
          {onLoadSampleData && (
            <div className="py-3 first:pt-0 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <p className="text-body font-medium text-foreground">Load 4-Month Sample Dataset</p>
                <p className="text-label text-muted-foreground">
                  Populate this workspace with realistic transactions and category budgets for exploration.
                </p>
              </div>
              <button
                type="button"
                onClick={handleSampleDataTrigger}
                data-testid="load-sample-data-btn"
                className="px-3.5 py-2 rounded-[10px] bg-surface2 hover:bg-secondary text-foreground border border-border text-label font-medium transition-colors inline-flex items-center gap-1.5 shrink-0 focus-visible:ring-2 ring-ring/40"
              >
                <Sparkles className="w-3.5 h-3.5 text-muted-foreground" />
                <span>Load Sample Data</span>
              </button>
            </div>
          )}

          {storageAdapter && activeProject && (
            <div className="py-3 last:pb-0 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <p className="text-body font-medium text-foreground">Clear Workspace Data</p>
                <p className="text-label text-muted-foreground">
                  Remove all transactions, budgets, notes, locks, and sync state while keeping your workspace and categories.
                </p>
              </div>
              <button
                type="button"
                onClick={() => {
                  setClearConfirmText('');
                  setShowClearDataModal(true);
                }}
                data-testid="clear-workspace-data-btn"
                className="px-3.5 py-2 rounded-[10px] bg-surface2 hover:bg-negative/10 border border-border text-negative text-label font-medium transition-colors inline-flex items-center gap-1.5 shrink-0 focus-visible:ring-2 ring-ring/40"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>Clear Workspace Data</span>
              </button>
            </div>
          )}
        </div>
      </section>

      {/* Restore JSON Preview & Confirmation Modal */}
      <Modal
        isOpen={Boolean(pendingRestore)}
        onClose={() => {
          if (!restoringSnapshot) setPendingRestore(null);
        }}
        dataTestId="restore-json-preview-modal"
        title="Restore Workspace Snapshot"
        maxWidth="max-w-md"
        className="p-6 space-y-4"
      >
        {pendingRestore && (
          <>
            <div>
              <h3 className="text-heading text-foreground">Restore Workspace Snapshot?</h3>
              <p className="text-label text-muted-foreground mt-1">
                This will replace the transactions in{' '}
                <strong className="text-foreground">{activeProject?.name || 'this workspace'}</strong>{' '}
                with the validated snapshot below.
              </p>
            </div>

            <div className="p-3.5 rounded-[10px] bg-surface2 space-y-1.5 text-label tabular-nums num">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Snapshot workspace</span>
                <span className="font-medium text-foreground">
                  {pendingRestore.summary.projectName}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Transactions</span>
                <span className="font-medium text-foreground">
                  {pendingRestore.summary.transactionCount}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Categories</span>
                <span className="font-medium text-foreground">
                  {pendingRestore.summary.categoryCount}
                </span>
              </div>
              {pendingRestore.includedSections.budgets && (
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Category budgets</span>
                  <span className="font-medium text-foreground">
                    {pendingRestore.summary.budgetCount}
                  </span>
                </div>
              )}
              {pendingRestore.summary.dateRange.firstDate && (
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Date range</span>
                  <span className="font-medium text-foreground">
                    {pendingRestore.summary.dateRange.firstDate} →{' '}
                    {pendingRestore.summary.dateRange.lastDate}
                  </span>
                </div>
              )}
            </div>

            {pendingRestore.summary.isPartialCliStateFile && (
              <p className="text-label text-muted-foreground">
                CLI state file detected: existing budgets, monthly notes, and locks not included in this file will be preserved.
              </p>
            )}

            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                disabled={restoringSnapshot}
                onClick={() => setPendingRestore(null)}
                className="px-4 py-2 rounded-[10px] bg-surface2 border border-border text-label font-medium text-foreground"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={restoringSnapshot}
                data-testid="confirm-restore-json-btn"
                onClick={handleConfirmRestore}
                className="px-4 py-2 rounded-[10px] bg-primary text-primary-foreground text-label font-semibold hover:opacity-90 transition-opacity disabled:opacity-50"
              >
                {restoringSnapshot ? 'Restoring…' : 'Replace & Restore'}
              </button>
            </div>
          </>
        )}
      </Modal>

      {/* Sample Data Non-Empty Overwrite Guard Modal */}
      <Modal
        isOpen={showSampleOverwriteModal}
        onClose={() => setShowSampleOverwriteModal(false)}
        dataTestId="confirm-sample-data-modal"
        title="Replace Existing Data with Sample Dataset?"
        maxWidth="max-w-sm"
        className="p-6 space-y-4"
      >
        <div>
          <h3 className="text-heading text-foreground">Replace with Sample Data?</h3>
          <p className="text-label text-muted-foreground mt-1">
            This workspace currently has{' '}
            <strong className="text-foreground tabular-nums num">{transactions.length}</strong>{' '}
            recorded transaction{transactions.length === 1 ? '' : 's'}. Loading sample data will overwrite current transactions and budgets.
          </p>
        </div>
        <div className="flex justify-end gap-2 pt-1">
          <button
            type="button"
            onClick={() => setShowSampleOverwriteModal(false)}
            className="px-4 py-2 rounded-[10px] bg-surface2 border border-border text-label font-medium text-foreground"
          >
            Cancel
          </button>
          <button
            type="button"
            data-testid="confirm-load-sample-btn"
            onClick={() => {
              setShowSampleOverwriteModal(false);
              onLoadSampleData?.();
            }}
            className="px-4 py-2 rounded-[10px] bg-primary text-primary-foreground text-label font-semibold hover:opacity-90 transition-opacity"
          >
            Overwrite with Sample Data
          </button>
        </div>
      </Modal>

      {/* Clear Workspace Data Typed Confirmation Modal */}
      <Modal
        isOpen={showClearDataModal}
        onClose={() => {
          if (!clearingData) setShowClearDataModal(false);
        }}
        dataTestId="clear-workspace-modal"
        title="Clear Workspace Data"
        maxWidth="max-w-sm"
        className="p-6 space-y-4"
      >
        <div>
          <h3 className="text-heading text-negative">Clear All Workspace Records?</h3>
          <p className="text-label text-muted-foreground mt-1">
            Type <strong className="text-foreground">CLEAR</strong> below to delete all{' '}
            <span className="tabular-nums num">{transactions.length}</span> transactions, budgets, notes, and locks in{' '}
            <strong className="text-foreground">{activeProject?.name}</strong>.
          </p>
        </div>
        <input
          type="text"
          data-testid="confirm-clear-workspace-input"
          value={clearConfirmText}
          onChange={e => setClearConfirmText(e.target.value)}
          placeholder="Type CLEAR to confirm"
          className="w-full h-9 px-3 rounded-[10px] bg-surface2 border border-border text-body text-foreground placeholder:text-muted-foreground outline-none focus-visible:ring-2 ring-ring/40"
        />
        <div className="flex justify-end gap-2 pt-1">
          <button
            type="button"
            disabled={clearingData}
            onClick={() => setShowClearDataModal(false)}
            className="px-4 py-2 rounded-[10px] bg-surface2 border border-border text-label font-medium text-foreground"
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={clearingData || clearConfirmText.trim().toUpperCase() !== 'CLEAR'}
            data-testid="confirm-clear-workspace-btn"
            onClick={handleConfirmClearWorkspace}
            className="px-4 py-2 rounded-[10px] bg-destructive text-destructive-foreground text-label font-semibold hover:opacity-90 transition-opacity disabled:opacity-50"
          >
            {clearingData ? 'Clearing…' : 'Clear Data'}
          </button>
        </div>
      </Modal>

      {/* Delete Workspace Typed Confirmation Modal */}
      <Modal
        isOpen={showDeleteWorkspaceModal}
        onClose={() => {
          if (!deletingWorkspace) setShowDeleteWorkspaceModal(false);
        }}
        dataTestId="delete-workspace-modal"
        title="Delete Workspace"
        maxWidth="max-w-sm"
        className="p-6 space-y-4"
      >
        <div>
          <h3 className="text-heading text-negative">Delete "{activeProject?.name}"?</h3>
          <p className="text-label text-muted-foreground mt-1">
            Type <strong className="text-foreground">{activeProject?.name}</strong> below to permanently delete this workspace and all its records.
          </p>
        </div>
        <input
          type="text"
          data-testid="confirm-delete-workspace-input"
          value={deleteWorkspaceConfirmText}
          onChange={e => setDeleteWorkspaceConfirmText(e.target.value)}
          placeholder={activeProject?.name || 'Workspace name'}
          className="w-full h-9 px-3 rounded-[10px] bg-surface2 border border-border text-body text-foreground placeholder:text-muted-foreground outline-none focus-visible:ring-2 ring-ring/40"
        />
        <div className="flex justify-end gap-2 pt-1">
          <button
            type="button"
            disabled={deletingWorkspace}
            onClick={() => setShowDeleteWorkspaceModal(false)}
            className="px-4 py-2 rounded-[10px] bg-surface2 border border-border text-label font-medium text-foreground"
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={
              deletingWorkspace || deleteWorkspaceConfirmText.trim() !== activeProject?.name
            }
            data-testid="confirm-delete-workspace-btn"
            onClick={handleConfirmDeleteWorkspace}
            className="px-4 py-2 rounded-[10px] bg-destructive text-destructive-foreground text-label font-semibold hover:opacity-90 transition-opacity disabled:opacity-50"
          >
            {deletingWorkspace ? 'Deleting…' : 'Delete Workspace'}
          </button>
        </div>
      </Modal>
    </div>
  );
}

export default SettingsView;
