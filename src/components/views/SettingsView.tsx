import { 
  Settings, 
  FolderGit2, 
  Tag, 
  FileSpreadsheet, 
  Sparkles, 
  Moon, 
  Sun, 
  Share2, 
  Plus
} from 'lucide-react';
import { Project, Category } from '../../services/storage';

export interface SettingsViewProps {
  activeProject?: Project | null;
  categories: Category[];
  onShareProjectClick: () => void;
  onOpenCategoryManager: () => void;
  onOpenCsvWizard: () => void;
  onLoadSampleData?: () => void;
  theme: 'light' | 'dark';
  onToggleTheme: () => void;
}

export function SettingsView({
  activeProject,
  categories,
  onShareProjectClick,
  onOpenCategoryManager,
  onOpenCsvWizard,
  onLoadSampleData,
  theme,
  onToggleTheme
}: SettingsViewProps) {
  return (
    <div className="space-y-6" data-testid="settings-workspace">
      {/* Clean Header */}
      <div className="pb-4 border-b border-border flex items-center justify-between">
        <div>
          <h1 className="text-title text-foreground">
            Settings & Workspace Preferences
          </h1>
          <p className="text-label text-muted-foreground mt-1">
            Manage workspace collaboration, custom categories, CSV statement imports, and display preferences
          </p>
        </div>
        <div className="p-2 rounded-[10px] bg-surface2 text-muted-foreground">
          <Settings className="w-4 h-4" />
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Workspace & Collaboration Card */}
        <div className="p-5 rounded-[14px] bg-card border border-border space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <FolderGit2 className="w-4 h-4 text-muted-foreground" />
              <h2 className="text-section font-semibold text-foreground">Workspace & Collaboration</h2>
            </div>
          </div>

          <div className="space-y-2">
            <label className="text-label font-medium text-muted-foreground">Active Workspace</label>
            <div className="p-3 rounded-[10px] bg-background/50 border border-border flex items-center justify-between">
              <div>
                <p className="font-medium text-row text-foreground">{activeProject?.name || 'Personal Finances'}</p>
                <p className="text-label text-muted-foreground">ID: {activeProject?.id || 'default'}</p>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={onShareProjectClick}
                  data-testid="share-project-btn"
                  className="px-2.5 py-1 rounded-[8px] bg-card hover:bg-surface2 border border-border text-foreground text-label font-medium flex items-center gap-1 transition-colors focus-visible:ring-2 ring-ring/40"
                  title="Share Project"
                >
                  <Share2 className="w-3 h-3 text-muted-foreground" /> Collaborate
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* Categories Administration Card */}
        <div className="p-5 rounded-[14px] bg-card border border-border space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Tag className="w-4 h-4 text-muted-foreground" />
              <h2 className="text-section font-semibold text-foreground">Categories & Spending Buckets</h2>
            </div>
            <button
              onClick={onOpenCategoryManager}
              data-testid="open-add-category-btn"
              className="px-3 py-1.5 rounded-[10px] bg-card hover:bg-surface2 border border-border text-foreground text-label font-medium transition-colors flex items-center gap-1 focus-visible:ring-2 ring-ring/40"
            >
              <Plus className="w-3.5 h-3.5 text-muted-foreground" /> Category Manager
            </button>
          </div>

          <p className="text-label text-muted-foreground">
            {categories.length} active categories configured with custom emoji and spending bucket assignments.
          </p>

          <div className="grid grid-cols-2 gap-2 max-h-48 overflow-y-auto pr-1">
            {categories.slice(0, 10).map(cat => (
              <div 
                key={cat.id} 
                className="p-2 rounded-[10px] bg-background/40 border border-border text-label flex items-center gap-2"
                data-testid={`category-badge-${cat.name}`}
              >
                <span className="text-sm">{cat.emoji || '🏷️'}</span>
                <div className="truncate">
                  <p className="font-medium text-foreground truncate">{cat.name}</p>
                  <p className="text-label text-muted-foreground capitalize">{cat.defaultBucket || 'flexible'}</p>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* CSV Statement Import Card */}
        <div className="p-5 rounded-[14px] bg-card border border-border space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <FileSpreadsheet className="w-4 h-4 text-muted-foreground" />
              <h2 className="text-section font-semibold text-foreground">CSV Statement Wizard</h2>
            </div>
          </div>

          <p className="text-label text-muted-foreground">
            Import statements from any bank (RFC 4180 standard), map credit/debit columns, and run duplicate checks before committing.
          </p>

          <button
            onClick={onOpenCsvWizard}
            data-testid="import-csv-trigger-btn"
            className="w-full py-2.5 px-4 rounded-[10px] bg-surface2 hover:bg-surface2/80 border border-border text-foreground font-medium text-label transition-colors flex items-center justify-center gap-2 focus-visible:ring-2 ring-ring/40"
          >
            <FileSpreadsheet className="w-4 h-4 text-muted-foreground" /> Open CSV Import Wizard
          </button>
        </div>

        {/* Theme Preferences Card */}
        <div className="p-5 rounded-[14px] bg-card border border-border space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              {theme === 'dark' ? <Moon className="w-4 h-4 text-muted-foreground" /> : <Sun className="w-4 h-4 text-muted-foreground" />}
              <h2 className="text-section font-semibold text-foreground">Theme & Display</h2>
            </div>
            <button
              onClick={onToggleTheme}
              data-testid="theme-toggle-btn"
              className="px-3.5 py-1.5 rounded-[10px] bg-card hover:bg-surface2 border border-border text-foreground text-label font-medium transition-colors flex items-center gap-2 focus-visible:ring-2 ring-ring/40"
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
          <p className="text-label text-muted-foreground">
            Current mode: <span className="font-semibold capitalize text-foreground">{theme} Mode</span> (Deep Obsidian in dark, crisp slate in light).
          </p>
        </div>

        {/* Demo & Sample Data Card */}
        {onLoadSampleData && (
          <div className="p-5 rounded-[14px] bg-card border border-border space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Sparkles className="w-4 h-4 text-muted-foreground" />
                <h2 className="text-section font-semibold text-foreground">Sample & Demo Data</h2>
              </div>
              <button
                type="button"
                onClick={onLoadSampleData}
                data-testid="load-sample-data-btn"
                className="px-3.5 py-1.5 rounded-[10px] bg-surface2 hover:bg-surface2/80 text-foreground border border-border text-label font-medium transition-colors flex items-center gap-1.5 focus-visible:ring-2 ring-ring/40"
              >
                <Sparkles className="w-3.5 h-3.5 text-muted-foreground" />
                <span>Load Sample Data</span>
              </button>
            </div>
            <p className="text-label text-muted-foreground">
              Populate the active project with 4 months of sample transactions, category budgets, and financial history.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

export default SettingsView;
