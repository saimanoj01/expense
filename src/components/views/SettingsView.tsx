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
      {/* Hero Header */}
      <div className="p-6 rounded-2xl bg-gradient-to-br from-card/80 to-card/40 border border-border backdrop-blur-md shadow-sm">
        <div className="flex items-center gap-2">
          <div className="p-2 rounded-xl bg-primary/10 text-primary">
            <Settings className="w-5 h-5" />
          </div>
          <h1 className="text-xl font-bold tracking-tight text-foreground">
            Settings & Workspace Preferences
          </h1>
        </div>
        <p className="text-xs text-muted-foreground mt-1">
          Manage projects, collaborators, custom categories, CSV statement imports, and Gemini AI configuration
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Project Administration Card */}
        <div className="p-5 rounded-2xl bg-card border border-border space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <FolderGit2 className="w-4 h-4 text-primary" />
              <h2 className="text-sm font-bold text-foreground">Projects & Workspaces</h2>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={onCreateProjectClick}
                data-testid="create-project-btn"
                className="px-3 py-1.5 rounded-lg bg-primary hover:bg-primary/90 text-primary-foreground text-xs font-bold transition-all flex items-center gap-1 shadow-sm active:scale-95"
              >
                <Plus className="w-3.5 h-3.5" /> New Project
              </button>
            </div>
          </div>

          <div className="space-y-2">
            <label className="text-xs font-semibold text-muted-foreground">Active Project</label>
            <div className="p-3 rounded-xl bg-muted/20 border border-border flex items-center justify-between">
              <div>
                <p className="font-bold text-sm text-foreground">{activeProject?.name || 'Personal Finances'}</p>
                <p className="text-[10px] text-muted-foreground">ID: {activeProject?.id || 'default'}</p>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={onShareProjectClick}
                  data-testid="share-project-btn"
                  className="px-2.5 py-1 rounded-lg bg-card hover:bg-card/80 border border-border text-foreground text-xs font-semibold flex items-center gap-1 transition-all"
                  title="Share Project"
                >
                  <Share2 className="w-3 h-3 text-primary" /> Collaborate
                </button>
                <button
                  onClick={onManageProjectsClick}
                  data-testid="manage-projects-trigger-btn"
                  className="px-2.5 py-1 rounded-lg bg-card hover:bg-card/80 border border-border text-foreground text-xs font-semibold transition-all"
                >
                  Switch
                </button>
              </div>
            </div>
          </div>

          <div>
            <label className="text-xs font-semibold text-muted-foreground mb-1 block">All Projects ({projects.length})</label>
            <div className="space-y-1.5 max-h-36 overflow-y-auto pr-1">
              {projects.map(p => (
                <div
                  key={p.id}
                  onClick={() => onSelectProject(p)}
                  className={`p-2.5 rounded-xl border text-xs flex items-center justify-between cursor-pointer transition-all ${
                    activeProject?.id === p.id
                      ? 'bg-primary/10 border-primary/30 text-primary font-bold'
                      : 'bg-muted/10 border-border text-muted-foreground hover:bg-muted/30 hover:text-foreground'
                  }`}
                >
                  <span>{p.name}</span>
                  {activeProject?.id === p.id && (
                    <span className="px-2 py-0.5 rounded-full text-[10px] bg-primary/20 text-primary">Active</span>
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Categories Administration Card */}
        <div className="p-5 rounded-2xl bg-card border border-border space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Tag className="w-4 h-4 text-primary" />
              <h2 className="text-sm font-bold text-foreground">Categories & Spending Buckets</h2>
            </div>
            <button
              onClick={onOpenCategoryManager}
              data-testid="open-add-category-btn"
              className="px-3 py-1.5 rounded-lg bg-card hover:bg-card/80 border border-border text-foreground text-xs font-bold transition-all flex items-center gap-1 shadow-sm active:scale-95"
            >
              <Plus className="w-3.5 h-3.5 text-primary" /> Category Manager
            </button>
          </div>

          <p className="text-xs text-muted-foreground">
            {categories.length} active categories configured with custom emoji and spending bucket assignments.
          </p>

          <div className="grid grid-cols-2 gap-2 max-h-48 overflow-y-auto pr-1">
            {categories.slice(0, 10).map(cat => (
              <div 
                key={cat.id} 
                className="p-2 rounded-xl bg-muted/20 border border-border/50 text-xs flex items-center gap-2"
                data-testid={`category-badge-${cat.name}`}
              >
                <span className="text-sm">{cat.emoji || '🏷️'}</span>
                <div className="truncate">
                  <p className="font-semibold text-foreground truncate">{cat.name}</p>
                  <p className="text-[10px] text-muted-foreground capitalize">{cat.defaultBucket || 'flexible'}</p>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* CSV Statement Import Card */}
        <div className="p-5 rounded-2xl bg-card border border-border space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <FileSpreadsheet className="w-4 h-4 text-emerald-500" />
              <h2 className="text-sm font-bold text-foreground">CSV Statement Wizard</h2>
            </div>
          </div>

          <p className="text-xs text-muted-foreground">
            Import statements from any bank (RFC 4180 standard), map credit/debit columns, run duplicate checks, and classify with AI.
          </p>

          <button
            onClick={onOpenCsvWizard}
            data-testid="import-csv-trigger-btn"
            className="w-full py-2.5 px-4 rounded-xl bg-emerald-500/10 hover:bg-emerald-500/20 border border-emerald-500/30 text-emerald-600 dark:text-emerald-400 font-bold text-xs transition-all flex items-center justify-center gap-2"
          >
            <FileSpreadsheet className="w-4 h-4" /> Open CSV Import Wizard
          </button>
        </div>

        {/* Gemini AI Intelligence Card */}
        <div className="p-5 rounded-2xl bg-card border border-border space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-primary animate-pulse" />
              <h2 className="text-sm font-bold text-foreground">Gemini AI Intelligence</h2>
            </div>
            {isKeySaved && (
              <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-500/10 text-emerald-500 border border-emerald-500/20 flex items-center gap-1">
                <Check className="w-3 h-3" /> Active
              </span>
            )}
          </div>

          <p className="text-xs text-muted-foreground">
            Auto-categorize transactions and receive deep retrospective spending insights via <code className="font-mono text-primary">gemini-3.5-flash-lite</code>.
          </p>
          {isKeySaved && savedMaskedKey && (
            <p className="text-[11px] text-muted-foreground font-semibold flex items-center gap-1.5">
              <span>Active key:</span>
              <code className="px-1.5 py-0.5 rounded bg-muted/40 font-mono text-primary">{savedMaskedKey}</code>
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
                className="w-full bg-background/80 border border-border rounded-xl pl-3 pr-16 py-2 text-xs font-mono focus:ring-2 focus:ring-primary outline-none"
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
                className="px-3.5 py-1.5 rounded-lg bg-primary hover:bg-primary/90 text-primary-foreground text-xs font-bold transition-all shadow-sm active:scale-95"
              >
                {isKeySaved ? 'Update Key' : 'Save Key'}
              </button>
              {saveSuccessMsg && (
                <span className="text-[11px] text-emerald-500 font-bold flex items-center gap-1">
                  <Check className="w-3 h-3" /> Key saved successfully!
                </span>
              )}
            </div>
          </form>
        </div>

        {/* Theme Preferences Card */}
        <div className="p-5 rounded-2xl bg-card border border-border space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              {theme === 'dark' ? <Moon className="w-4 h-4 text-primary" /> : <Sun className="w-4 h-4 text-amber-500" />}
              <h2 className="text-sm font-bold text-foreground">Theme & Display</h2>
            </div>
            <button
              onClick={onToggleTheme}
              data-testid="theme-toggle-btn"
              className="px-3.5 py-1.5 rounded-xl bg-card hover:bg-card/80 border border-border text-foreground text-xs font-bold transition-all flex items-center gap-2 shadow-sm active:scale-95"
            >
              {theme === 'dark' ? (
                <>
                  <Sun className="w-3.5 h-3.5 text-amber-500" /> Light Mode
                </>
              ) : (
                <>
                  <Moon className="w-3.5 h-3.5 text-primary" /> Dark Mode
                </>
              )}
            </button>
          </div>
          <p className="text-xs text-muted-foreground">
            Current mode: <span className="font-bold capitalize text-foreground">{theme} Mode</span> (Deep Obsidian in dark, crisp slate in light).
          </p>
        </div>

        {/* Demo & Sample Data Card */}
        {onLoadSampleData && (
          <div className="p-5 rounded-2xl bg-card border border-border space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Sparkles className="w-4 h-4 text-primary" />
                <h2 className="text-sm font-bold text-foreground">Sample & Demo Data</h2>
              </div>
              <button
                type="button"
                onClick={onLoadSampleData}
                data-testid="load-sample-data-btn"
                className="px-3.5 py-1.5 rounded-xl bg-primary/10 hover:bg-primary/20 text-primary border border-primary/30 text-xs font-bold transition-all flex items-center gap-1.5 shadow-sm active:scale-95"
              >
                <Sparkles className="w-3.5 h-3.5" />
                <span>Load Sample Data</span>
              </button>
            </div>
            <p className="text-xs text-muted-foreground">
              Populate the active project with 4 months of sample transactions, category budgets, and financial history.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

export default SettingsView;
