import React, { useState, useEffect } from 'react';
import { Sparkles, Key, X, Eye, EyeOff, ExternalLink, Trash2, Check } from 'lucide-react';
import { motion } from 'framer-motion';
import { getGeminiApiKey, setGeminiApiKey, clearGeminiApiKey, hasUserStoredKey } from '../../services/ai/geminiClient';

interface GeminiKeyModalProps {
  showModal: boolean;
  onClose: () => void;
  onSaveSuccess?: () => void;
}

export function GeminiKeyModal({ showModal, onClose, onSaveSuccess }: GeminiKeyModalProps) {
  const [apiKeyInput, setApiKeyInput] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [isKeySaved, setIsKeySaved] = useState(false);
  const [savedMaskedKey, setSavedMaskedKey] = useState<string | null>(null);
  const [saveSuccessMsg, setSaveSuccessMsg] = useState(false);

  useEffect(() => {
    if (showModal) {
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
        // Only pre-populate the input with the key if the user stored it themselves.
        // If it came from env var, leave the input blank so the user can enter their own.
        setApiKeyInput(isUserStored ? existingKey : '');
      } else {
        setIsKeySaved(false);
        setSavedMaskedKey(null);
        setApiKeyInput('');
      }
      setSaveSuccessMsg(false);
    }
  }, [showModal]);

  if (!showModal) return null;

  const handleSave = (e: React.FormEvent) => {
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
    setTimeout(() => {
      onClose();
      if (onSaveSuccess) onSaveSuccess();
    }, 600);
  };

  const handleClear = () => {
    clearGeminiApiKey();
    setIsKeySaved(false);
    setSavedMaskedKey(null);
    setApiKeyInput('');
  };

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-background/80 backdrop-blur-sm" data-testid="gemini-key-modal">
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.95 }}
        className="glass-panel w-full max-w-md rounded-2xl p-6 shadow-2xl border border-border/50"
      >
        <div className="flex justify-between items-center mb-4">
          <div className="flex items-center gap-2 font-bold text-lg">
            <div className="p-1.5 rounded-lg bg-primary/10 text-primary">
              <Sparkles className="w-5 h-5" />
            </div>
            <span>Gemini AI Configuration</span>
          </div>
          <button onClick={onClose} className="p-1 hover:bg-card rounded-lg text-muted-foreground hover:text-foreground">
            <X className="w-5 h-5" />
          </button>
        </div>

        <p className="text-xs text-muted-foreground mb-4">
          Provide your Gemini API key to enable AI-powered features like transaction auto-classification (powered by <span className="font-semibold text-primary">gemini-3.5-flash-lite</span>).
        </p>

        {isKeySaved && savedMaskedKey && (
          <div className="mb-4 p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-600 dark:text-emerald-400 flex items-center justify-between text-xs font-semibold">
            <div className="flex items-center gap-2">
              <Check className="w-4 h-4" />
              <span>Configured Key: <code className="font-mono bg-background/50 px-1.5 py-0.5 rounded">{savedMaskedKey}</code></span>
            </div>
            <button
              type="button"
              onClick={handleClear}
              className="text-destructive hover:underline text-xs flex items-center gap-1 font-bold"
              title="Remove stored key"
            >
              <Trash2 className="w-3.5 h-3.5" /> Clear
            </button>
          </div>
        )}

        <form onSubmit={handleSave} className="space-y-4">
          <div>
            <label className="block text-xs font-bold text-muted-foreground mb-1 flex items-center gap-1">
              <Key className="w-3.5 h-3.5" /> {isKeySaved ? 'Update API Key' : 'Enter Gemini API Key'}
            </label>
            <div className="relative">
              <input
                type={showPassword ? 'text' : 'password'}
                required
                data-testid="gemini-api-key-input"
                value={apiKeyInput}
                onChange={e => setApiKeyInput(e.target.value)}
                placeholder="AIzaSy..."
                className="w-full bg-card/50 border border-border rounded-xl px-4 py-2.5 text-sm font-mono focus:ring-2 focus:ring-primary outline-none pr-10"
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground p-1"
              >
                {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
          </div>

          <div className="flex items-center justify-between text-xs pt-1">
            <a
              href="https://aistudio.google.com/apikey"
              target="_blank"
              rel="noopener noreferrer"
              className="text-primary hover:underline flex items-center gap-1 font-medium"
            >
              Get a free key from Google AI Studio <ExternalLink className="w-3 h-3" />
            </a>
          </div>

          <div className="flex justify-end gap-3 pt-3 border-t border-border/40">
            <button type="button" onClick={onClose} className="px-4 py-2 rounded-xl font-bold hover:bg-card border border-border text-sm">
              Cancel
            </button>
            <button
              type="submit"
              data-testid="save-gemini-key-btn"
              className="px-5 py-2 rounded-xl bg-primary text-primary-foreground font-bold hover:bg-primary/90 shadow-lg shadow-primary/20 text-sm flex items-center gap-1.5"
            >
              {saveSuccessMsg ? (
                <>
                  <Check className="w-4 h-4" /> Saved!
                </>
              ) : (
                'Save Key'
              )}
            </button>
          </div>
        </form>
      </motion.div>
    </div>
  );
}
