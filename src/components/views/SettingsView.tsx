import { useState, useEffect } from 'react';
import { 
  Settings, 
  FolderGit2, 
  Tag, 
  FileSpreadsheet, 
  Sparkles, 
  Moon, 
  Sun, 
  Share2, 
  Plus, 
  Check, 
  Trash2, 
  Eye, 
  EyeOff
} from 'lucide-react';
import { Project, Category } from '../../services/storage';
import { getGeminiApiKey, setGeminiApiKey, clearGeminiApiKey, hasUserStoredKey } from '../../services/ai/geminiClient';

export interface SettingsViewProps {
  projects: Project[];
  activeProject?: Project | null;
  categories: Category[];
  onSelectProject: (p: Project) => void;
  onCreateProjectClick: () => void;
  onManageProjectsClick: () => void;
  onShareProjectClick: () => void;
  onOpenCategoryManager: () => void;
  onOpenCsvWizard: () => void;
  onOpenGeminiKeyModal?: () => void;
  onLoadSampleData?: () => void;
  theme: 'light' | 'dark';
  onToggleTheme: () => void;
}

export function SettingsView({
  projects,
  activeProject,
  categories,
  onSelectProject,
  onCreateProjectClick,
  onManageProjectsClick,
  onShareProjectClick,
  onOpenCategoryManager,
  onOpenCsvWizard,
  onOpenGeminiKeyModal: _onOpenGeminiKeyModal,
  onLoadSampleData,
  theme,
  onToggleTheme
}: SettingsViewProps) {
  const [apiKeyInput, setApiKeyInput] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [isKeySaved, setIsKeySaved] = useState(false);
  const [savedMaskedKey, setSavedMaskedKey] = useState<string | null>(null);
  const [saveSuccessMsg, setSaveSuccessMsg] = useState(false);

  useEffect(() => {
    const existingKey = getGeminiApiKey();
    const isUserStored = hasUserStoredKey();
    if (existingKey) {
      setIsKeySaved(true);
      const len = existingKey.length;
      if (len > 8) {
        setSavedMaskedKey(`${existingKey.substring(0, 6)}...${existingKey.substring(len - 4)}`);
      } else {
        setSavedMaskedKey('••••••••••••');
      }
      setApiKeyInput(isUserStored ? existingKey : '');
    } else {
      setIsKeySaved(false);
      setSavedMaskedKey(null);
      setApiKeyInput('');
    }
  }, []);

  const handleSaveApiKey = (e: React.FormEvent) => {
    e.preventDefault();
    if (!apiKeyInput.trim()) return;
    setGeminiApiKey(apiKeyInput.trim());
    setIsKeySaved(true);
    const trimmed = apiKeyInput.trim();
    if (trimmed.length > 8) {
      setSavedMaskedKey(`${trimmed.substring(0, 6)}...${trimmed.substring(trimmed.length - 4)}`);
    } else {
      setSavedMaskedKey('••••••••••••');
    }
    setSaveSuccessMsg(true);
    setTimeout(() => setSaveSuccessMsg(false), 2500);
  };

  const handleClearApiKey = () => {
    clearGeminiApiKey();
    setIsKeySaved(false);
    setSavedMaskedKey(null);
    setApiKeyInput('');
  };

  return (
    <div className="space-y-6" data-testid="settings-workspace">
      {/* Clean Header */}
      <div className="pb-4 border-b border-border flex items-center justify-between">
        <div>
          <h1 className="text-title text-foreground">
            Settings & Workspace Preferences
          </h1>
          <p className="text-label text-muted-foreground mt-1">
            Manage projects, collaborators, custom categories, CSV statement imports, and Gemini AI configuration
          </p>
        </div>
        <div className="p-2 rounded-[10px] bg-surface2 text-muted-foreground">
          <Settings className="w-4 h-4" />
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Project Administration Card */}
        <div className="p-5 rounded-[14px] bg-card border border-border space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <FolderGit2 className="w-4 h-4 text-muted-foreground" />
              <h2 className="text-section font-semibold text-foreground">Projects & Workspaces</h2>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={onCreateProjectClick}
                data-testid="create-project-btn"
                className="px-3 py-1.5 rounded-[10px] bg-primary hover:bg-primary/90 text-primary-foreground text-label font-medium transition-colors flex items-center gap-1 focus-visible:ring-2 ring-ring/40"
              >
                <Plus className="w-3.5 h-3.5" /> New Project
              </button>
            </div>
          </div>

          <div className="space-y-2">
            <label className="text-label font-medium text-muted-foreground">Active Project</label>
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
                <button
                  onClick={onManageProjectsClick}
                  data-testid="manage-projects-trigger-btn"
                  className="px-2.5 py-1 rounded-[8px] bg-card hover:bg-surface2 border border-border text-foreground text-label font-medium transition-colors focus-visible:ring-2 ring-ring/40"
                >
                  Switch
                </button>
              </div>
            </div>
          </div>

          <div>
            <label className="text-label font-medium text-muted-foreground mb-1 block">All Projects ({projects.length})</label>
            <div className="space-y-1.5 max-h-36 overflow-y-auto pr-1">
              {projects.map(p => (
                <div
                  key={p.id}
                  onClick={() => onSelectProject(p)}
                  className={`p-2.5 rounded-[10px] border text-label flex items-center justify-between cursor-pointer transition-colors ${
                    activeProject?.id === p.id
                      ? 'bg-surface2 border-border text-foreground font-semibold'
                      : 'bg-background/30 border-border text-muted-foreground hover:bg-surface2/50 hover:text-foreground'
                  }`}
                >
                  <span>{p.name}</span>
                  {activeProject?.id === p.id && (
                    <span className="px-2 py-0.5 rounded-full text-label bg-primary/15 text-primary">Active</span>
                  )}
                </div>
              ))}
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
            Import statements from any bank (RFC 4180 standard), map credit/debit columns, run duplicate checks, and classify with AI.
          </p>

          <button
            onClick={onOpenCsvWizard}
            data-testid="import-csv-trigger-btn"
            className="w-full py-2.5 px-4 rounded-[10px] bg-surface2 hover:bg-surface2/80 border border-border text-foreground font-medium text-label transition-colors flex items-center justify-center gap-2 focus-visible:ring-2 ring-ring/40"
          >
            <FileSpreadsheet className="w-4 h-4 text-muted-foreground" /> Open CSV Import Wizard
          </button>
        </div>

        {/* Gemini AI Intelligence Card */}
        <div className="p-5 rounded-[14px] bg-card border border-border space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-muted-foreground" />
              <h2 className="text-section font-semibold text-foreground">Gemini AI Intelligence</h2>
            </div>
            {isKeySaved && (
              <span className="px-2 py-0.5 rounded-full text-label font-medium bg-emerald-500/10 text-emerald-500 border border-emerald-500/20 flex items-center gap-1">
                <Check className="w-3 h-3" /> Active
              </span>
            )}
          </div>

          <p className="text-label text-muted-foreground">
            Auto-categorize transactions and receive deep retrospective spending insights via <code className="font-mono text-foreground">gemini-3.5-flash-lite</code>.
          </p>
          {isKeySaved && savedMaskedKey && (
            <p className="text-label text-muted-foreground font-medium flex items-center gap-1.5">
              <span>Active key:</span>
              <code className="px-1.5 py-0.5 rounded bg-surface2 font-mono text-foreground">{savedMaskedKey}</code>
            </p>
          )}

          <form onSubmit={handleSaveApiKey} className="space-y-3">
            <div className="relative">
              <input
                type={showPassword ? 'text' : 'password'}
                data-testid="gemini-api-key-input"
                value={apiKeyInput}
                onChange={(e) => setApiKeyInput(e.target.value)}
                placeholder="AIzaSy..."
                className="w-full bg-background/80 border border-border rounded-[10px] pl-3 pr-16 py-2 text-label font-mono focus-visible:ring-2 ring-ring/40 outline-none"
              />
              <div className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center gap-1">
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="p-1 text-muted-foreground hover:text-foreground"
                >
                  {showPassword ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                </button>
                {isKeySaved && (
                  <button
                    type="button"
                    onClick={handleClearApiKey}
                    className="p-1 text-destructive hover:opacity-80"
                    title="Remove key"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
            </div>

            <div className="flex items-center justify-between">
              <button
                type="submit"
                className="px-3.5 py-1.5 rounded-[10px] bg-primary hover:bg-primary/90 text-primary-foreground text-label font-medium transition-colors focus-visible:ring-2 ring-ring/40"
              >
                {isKeySaved ? 'Update Key' : 'Save Key'}
              </button>
              {saveSuccessMsg && (
                <span className="text-label text-emerald-500 font-medium flex items-center gap-1">
                  <Check className="w-3 h-3" /> Key saved successfully!
                </span>
              )}
            </div>
          </form>
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
