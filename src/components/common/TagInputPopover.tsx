import React, { useState, useEffect, useRef } from 'react';
import { Tag, Plus, X } from 'lucide-react';
import { motion } from 'framer-motion';

interface TagInputPopoverProps {
  availableTags?: string[];
  existingTags?: string[];
  onAddTag: (tags: string[]) => void;
  onClose: () => void;
  placeholder?: string;
  align?: 'left' | 'right';
}

export function TagInputPopover({
  availableTags = [],
  existingTags = [],
  onAddTag,
  onClose,
  placeholder = 'Add tag (e.g. bilt, tax)...',
  align = 'left'
}: TagInputPopoverProps) {
  const [inputValue, setInputValue] = useState('');
  const [selectedIndex, setSelectedIndex] = useState(0);
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Filter available tags that aren't already on the transaction and match current query
  const query = inputValue.trim().toLowerCase();
  const suggestions = availableTags
    .filter(t => !existingTags.includes(t))
    .filter(t => !query || t.toLowerCase().includes(query))
    .slice(0, 5);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  // Handle click outside to close popover
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        onClose();
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [onClose]);

  // Reset selected index when query changes
  useEffect(() => {
    setSelectedIndex(0);
  }, [inputValue]);

  const handleSubmit = (tagToSubmit?: string) => {
    const raw = tagToSubmit || inputValue;
    if (!raw.trim()) return;

    // Support comma-separated tags e.g. "bilt, statement"
    const tagsToAdd = raw
      .split(',')
      .map(t => t.trim().toLowerCase())
      .filter(Boolean);

    if (tagsToAdd.length > 0) {
      onAddTag(tagsToAdd);
    }
    setInputValue('');
    onClose();
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      e.preventDefault();
      onClose();
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      if (suggestions.length > 0) {
        setSelectedIndex(prev => (prev + 1) % suggestions.length);
      }
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      if (suggestions.length > 0) {
        setSelectedIndex(prev => (prev - 1 + suggestions.length) % suggestions.length);
      }
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (suggestions.length > 0 && selectedIndex < suggestions.length && !inputValue.includes(',')) {
        handleSubmit(suggestions[selectedIndex]);
      } else {
        handleSubmit();
      }
    }
  };

  return (
    <motion.div
      ref={containerRef}
      initial={{ opacity: 0, scale: 0.95, y: -5 }}
      animate={{ opacity: 1, scale: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.95, y: -5 }}
      transition={{ duration: 0.15 }}
      onClick={e => e.stopPropagation()}
      className={`absolute z-50 top-full mt-1.5 ${
        align === 'right' ? 'right-0' : 'left-0'
      } w-64 p-3 bg-card/95 backdrop-blur-xl border border-border/80 rounded-xl shadow-2xl space-y-2`}
    >
      <div className="flex items-center justify-between gap-1 border-b border-border/50 pb-2">
        <div className="flex items-center gap-1.5 text-xs font-bold text-muted-foreground uppercase tracking-wider">
          <Tag className="w-3.5 h-3.5 text-primary" />
          <span>Add Tag</span>
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close tag popover"
          className="p-1 hover:bg-card rounded-lg text-muted-foreground hover:text-foreground transition-colors"
        >
          <X className="w-3.5 h-3.5" />
        </button>
      </div>

      <div className="flex items-center gap-2">
        <input
          ref={inputRef}
          type="text"
          value={inputValue}
          onChange={e => setInputValue(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={placeholder}
          data-testid="tag-popover-input"
          className="w-full bg-background border border-border rounded-lg px-2.5 py-1.5 text-xs font-medium focus:ring-2 focus:ring-primary outline-none transition-all"
        />
        <button
          type="button"
          onClick={() => handleSubmit()}
          disabled={!inputValue.trim()}
          data-testid="tag-popover-submit-btn"
          className="p-1.5 bg-primary hover:bg-primary/90 text-primary-foreground rounded-lg disabled:opacity-40 transition-all"
        >
          <Plus className="w-4 h-4" />
        </button>
      </div>

      {suggestions.length > 0 && (
        <div className="pt-1 space-y-1">
          <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground px-1">
            Suggestions
          </p>
          <div className="flex flex-wrap gap-1 max-h-28 overflow-y-auto custom-scrollbar">
            {suggestions.map((t, idx) => (
              <button
                key={t}
                type="button"
                onClick={() => handleSubmit(t)}
                className={`px-2 py-0.5 rounded text-xs font-semibold transition-all ${
                  idx === selectedIndex
                    ? 'bg-primary text-primary-foreground ring-1 ring-primary'
                    : 'bg-secondary/10 text-secondary hover:bg-secondary/20 border border-secondary/20'
                }`}
              >
                #{t}
              </button>
            ))}
          </div>
        </div>
      )}
    </motion.div>
  );
}
