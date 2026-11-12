import React, { useState, useEffect, useLayoutEffect, useRef } from 'react';
import { Tag, Plus, X } from 'lucide-react';
import { motion } from 'framer-motion';

interface TagInputPopoverProps {
  availableTags?: string[];
  existingTags?: string[];
  onAddTag: (tags: string[]) => void;
  onClose: () => void;
  placeholder?: string;
  align?: 'left' | 'right';
  placement?: 'auto' | 'top' | 'bottom';
  direction?: 'down' | 'up';
}

export function TagInputPopover({
  availableTags = [],
  existingTags = [],
  onAddTag,
  onClose,
  placeholder = 'Add tag (e.g. trip, tax)...',
  align = 'left',
  placement = 'auto',
  direction,
}: TagInputPopoverProps) {
  const [inputValue, setInputValue] = useState('');
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [resolvedPlacement, setResolvedPlacement] = useState<'top' | 'bottom'>(
    placement === 'top' || direction === 'up' ? 'top' : 'bottom'
  );
  const [horizontalShift, setHorizontalShift] = useState(0);
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useLayoutEffect(() => {
    let nextPlacement: 'top' | 'bottom' = 'bottom';
    if (placement === 'top' || direction === 'up') {
      nextPlacement = 'top';
    } else if (placement === 'bottom') {
      nextPlacement = 'bottom';
    } else {
      const anchorEl = containerRef.current?.parentElement;
      const rect = anchorEl?.getBoundingClientRect();
      nextPlacement = rect && window.innerHeight - rect.bottom < 260 ? 'top' : 'bottom';
    }
    setResolvedPlacement(nextPlacement);

    const popEl = containerRef.current;
    if (popEl) {
      const popRect = popEl.getBoundingClientRect();
      const vw = window.innerWidth;
      let delta = 0;
      if (popRect.left < 8) {
        delta = 8 - popRect.left;
      } else if (popRect.right > vw - 8) {
        delta = vw - 8 - popRect.right;
      }
      if (delta !== 0) {
        setHorizontalShift(prev => prev + delta);
      }
    }
  }, [placement, direction, align]);

  // Filter available tags that aren't already on the transaction and match current query
  const query = inputValue.trim().toLowerCase();
  const suggestions = availableTags
    .filter(t => !existingTags.includes(t))
    .filter(t => !query || t.toLowerCase().includes(query))
    .slice(0, 5);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  // Handle click outside and Escape anywhere while popover is mounted
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        onClose();
      }
    }
    function handleWindowKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        onClose();
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    window.addEventListener('keydown', handleWindowKeyDown, true);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      window.removeEventListener('keydown', handleWindowKeyDown, true);
    };
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
      data-popover="tag-input"
      data-placement={resolvedPlacement}
      initial={{ opacity: 0, scale: 0.95, y: resolvedPlacement === 'top' ? 5 : -5 }}
      animate={{ opacity: 1, scale: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.95, y: resolvedPlacement === 'top' ? 5 : -5 }}
      transition={{ duration: 0.15 }}
      onClick={e => e.stopPropagation()}
      style={
        horizontalShift !== 0
          ? align === 'right'
            ? { right: `${-horizontalShift}px` }
            : { left: `${horizontalShift}px` }
          : undefined
      }
      className={`absolute z-[46] ${
        resolvedPlacement === 'top' ? 'bottom-full mb-2.5' : 'top-full mt-1.5'
      } ${
        align === 'right' ? 'right-0' : 'left-0'
      } w-64 max-w-[calc(100vw-2rem)] p-3 bg-card border border-border rounded-[14px] shadow-xl space-y-2`}
    >
      <div className="flex items-center justify-between gap-1 border-b border-border/50 pb-2">
        <div className="flex items-center gap-1.5 text-label font-medium text-muted-foreground uppercase tracking-[0.06em]">
          <Tag className="w-3.5 h-3.5 text-foreground" />
          <span>Add Tag</span>
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close tag popover"
          className="p-1 hover:bg-surface2 rounded-lg text-muted-foreground hover:text-foreground transition-colors focus-visible:ring-2 ring-ring/40"
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
          className="w-full bg-surface2 border border-border rounded-[10px] px-2.5 py-1.5 text-label font-medium focus-visible:ring-2 ring-ring/40 transition-all"
        />
        <button
          type="button"
          onClick={() => handleSubmit()}
          disabled={!inputValue.trim()}
          data-testid="tag-popover-submit-btn"
          className="p-1.5 bg-primary hover:bg-primary/90 text-primary-foreground rounded-[10px] disabled:opacity-40 transition-all focus-visible:ring-2 ring-ring/40"
        >
          <Plus className="w-4 h-4" />
        </button>
      </div>

      {suggestions.length > 0 && (
        <div className="pt-1 space-y-1">
          <p className="text-label font-medium uppercase tracking-[0.06em] text-muted-foreground px-1">
            Suggestions
          </p>
          <div className="flex flex-wrap gap-1 max-h-28 overflow-y-auto custom-scrollbar">
            {suggestions.map((t, idx) => (
              <button
                key={t}
                type="button"
                onClick={() => handleSubmit(t)}
                className={`px-2 py-0.5 rounded-[6px] text-label font-medium transition-all focus-visible:ring-2 ring-ring/40 ${
                  idx === selectedIndex
                    ? 'bg-primary text-primary-foreground'
                    : 'bg-surface2 text-muted-foreground hover:text-foreground border border-border'
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
