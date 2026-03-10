import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import * as api from '../../lib/api';
import type { CustomEmojiRegistry } from '../../lib/api';
import EMOJI_CATEGORIES from '../../lib/emoji-categories.json';

// ── Types ────────────────────────────────────────────────────────

interface CategoryData {
  name: string;
  emoji: Array<{ e: string; s: string[] }>;
}

interface EmojiPickerProps {
  onSelect: (emoji: string) => void;
  onClose: () => void;
  /** Position for absolute placement (optional — if omitted, renders inline) */
  position?: { x: number; y: number };
  /** Callback to open the custom emoji manager */
  onOpenCustomEmojiManager?: () => void;
}

// ── Constants ────────────────────────────────────────────────────

const RECENTS_KEY = 'outline-emoji-recents';
const MAX_RECENTS = 32;
const COLS = 9;
const CELL_SIZE = 36;

/** Category icons (emoji used as tab labels) */
const CATEGORY_ICONS: Record<string, string> = {
  'Recents': '\u{1F554}',           // clock
  'Custom': '\u{2B50}',             // star
  'Smileys & Emotion': '\u{1F600}', // grinning face
  'People & Body': '\u{1F44B}',     // waving hand
  'Animals & Nature': '\u{1F43E}',  // paw prints
  'Food & Drink': '\u{1F354}',      // hamburger
  'Travel & Places': '\u{2708}',    // airplane
  'Activities': '\u{26BD}',         // soccer ball
  'Objects': '\u{1F4A1}',           // light bulb
  'Symbols': '\u{2764}',            // heart
  'Flags': '\u{1F3F3}',             // white flag
};

const categories = EMOJI_CATEGORIES as CategoryData[];

// ── Helpers ──────────────────────────────────────────────────────

function loadRecents(): string[] {
  try {
    const stored = localStorage.getItem(RECENTS_KEY);
    if (stored) return JSON.parse(stored);
  } catch { /* ignore */ }
  return [];
}

function saveRecents(recents: string[]) {
  try {
    localStorage.setItem(RECENTS_KEY, JSON.stringify(recents));
  } catch { /* ignore */ }
}

function addToRecents(emoji: string) {
  const recents = loadRecents().filter(e => e !== emoji);
  recents.unshift(emoji);
  saveRecents(recents.slice(0, MAX_RECENTS));
}

// ── Flat list builder ────────────────────────────────────────────

interface FlatItem {
  type: 'header' | 'emoji';
  category: string;
  emoji?: string;
  shortcodes?: string[];
  /** For custom emoji with image src */
  src?: string;
}

function buildFlatList(
  searchQuery: string,
  recents: string[],
  customEmoji: CustomEmojiRegistry | null,
): FlatItem[] {
  const items: FlatItem[] = [];
  const query = searchQuery.toLowerCase().trim();

  if (query) {
    // Search mode — flat filtered list, no category headers
    // Search custom emoji
    if (customEmoji) {
      for (const [shortcode, ce] of Object.entries(customEmoji.emoji)) {
        if (shortcode.includes(query)) {
          items.push({
            type: 'emoji',
            category: 'Custom',
            emoji: ce.text || undefined,
            shortcodes: [shortcode],
            src: ce.src || undefined,
          });
        }
      }
    }

    // Search standard emoji
    for (const cat of categories) {
      for (const em of cat.emoji) {
        if (em.s.some(sc => sc.includes(query))) {
          items.push({ type: 'emoji', category: cat.name, emoji: em.e, shortcodes: em.s });
        }
        if (items.length >= 200) break;
      }
      if (items.length >= 200) break;
    }
    return items;
  }

  // Browse mode — recents, custom, then standard categories
  if (recents.length > 0) {
    items.push({ type: 'header', category: 'Recents' });
    for (const emoji of recents) {
      items.push({ type: 'emoji', category: 'Recents', emoji, shortcodes: [] });
    }
  }

  if (customEmoji && Object.keys(customEmoji.emoji).length > 0) {
    items.push({ type: 'header', category: 'Custom' });
    for (const [shortcode, ce] of Object.entries(customEmoji.emoji)) {
      items.push({
        type: 'emoji',
        category: 'Custom',
        emoji: ce.text || undefined,
        shortcodes: [shortcode],
        src: ce.src || undefined,
      });
    }
  }

  for (const cat of categories) {
    items.push({ type: 'header', category: cat.name });
    for (const em of cat.emoji) {
      items.push({ type: 'emoji', category: cat.name, emoji: em.e, shortcodes: em.s });
    }
  }

  return items;
}

// ── Row layout ───────────────────────────────────────────────────

interface Row {
  type: 'header' | 'emoji-row';
  category: string;
  /** For emoji-row: indices into the flat items array */
  itemIndices?: number[];
}

function buildRows(items: FlatItem[]): Row[] {
  const rows: Row[] = [];
  let currentRow: number[] = [];
  let currentCategory = '';

  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    if (item.type === 'header') {
      // Flush current row
      if (currentRow.length > 0) {
        rows.push({ type: 'emoji-row', category: currentCategory, itemIndices: currentRow });
        currentRow = [];
      }
      rows.push({ type: 'header', category: item.category });
      currentCategory = item.category;
    } else {
      if (item.category !== currentCategory && currentRow.length > 0) {
        rows.push({ type: 'emoji-row', category: currentCategory, itemIndices: currentRow });
        currentRow = [];
      }
      currentCategory = item.category;
      currentRow.push(i);
      if (currentRow.length >= COLS) {
        rows.push({ type: 'emoji-row', category: currentCategory, itemIndices: currentRow });
        currentRow = [];
      }
    }
  }
  if (currentRow.length > 0) {
    rows.push({ type: 'emoji-row', category: currentCategory, itemIndices: currentRow });
  }

  return rows;
}

// ── Component ────────────────────────────────────────────────────

export function EmojiPicker({ onSelect, onClose, position, onOpenCustomEmojiManager }: EmojiPickerProps) {
  const [search, setSearch] = useState('');
  const [recents, setRecents] = useState<string[]>(loadRecents);
  const [customEmoji, setCustomEmoji] = useState<CustomEmojiRegistry | null>(null);
  const [selectedIndex, setSelectedIndex] = useState(-1); // index into emojiItems
  const inputRef = useRef<HTMLInputElement>(null);
  const gridRef = useRef<HTMLDivElement>(null);
  const categoryHeaderRefs = useRef<Map<string, HTMLDivElement>>(new Map());

  // Load custom emoji on mount
  useEffect(() => {
    api.loadCustomEmoji().then(setCustomEmoji).catch(() => setCustomEmoji({ version: 1, emoji: {} }));
  }, []);

  // Focus input on mount
  useEffect(() => {
    setTimeout(() => inputRef.current?.focus(), 50);
  }, []);

  // Build flat list and rows
  const flatItems = useMemo(
    () => buildFlatList(search, recents, customEmoji),
    [search, recents, customEmoji],
  );

  const emojiItems = useMemo(
    () => flatItems.filter(i => i.type === 'emoji'),
    [flatItems],
  );

  // Map from flatItems index to emojiItems index (for keyboard nav)
  const flatToEmojiIndex = useMemo(() => {
    const map = new Map<number, number>();
    let eidx = 0;
    for (let i = 0; i < flatItems.length; i++) {
      if (flatItems[i].type === 'emoji') {
        map.set(i, eidx++);
      }
    }
    return map;
  }, [flatItems]);

  const rows = useMemo(() => buildRows(flatItems), [flatItems]);

  // Visible row range for lazy rendering
  const [visibleRange, setVisibleRange] = useState({ start: 0, end: 30 });

  const handleScroll = useCallback(() => {
    const el = gridRef.current;
    if (!el) return;
    const scrollTop = el.scrollTop;
    const viewHeight = el.clientHeight;
    const headerHeight = 28;
    const rowHeight = CELL_SIZE;
    const avgRowHeight = (headerHeight + rowHeight) / 2; // rough estimate

    const start = Math.max(0, Math.floor(scrollTop / avgRowHeight) - 5);
    const end = Math.min(rows.length, Math.ceil((scrollTop + viewHeight) / avgRowHeight) + 5);
    setVisibleRange({ start, end });
  }, [rows.length]);

  useEffect(() => {
    handleScroll();
  }, [rows, handleScroll]);

  // Reset selection when search changes
  useEffect(() => {
    setSelectedIndex(search ? 0 : -1);
  }, [search]);

  // Available category names (for tabs)
  const availableCategories = useMemo(() => {
    const cats: string[] = [];
    const seen = new Set<string>();
    for (const item of flatItems) {
      if (item.type === 'header' && !seen.has(item.category)) {
        seen.add(item.category);
        cats.push(item.category);
      }
    }
    return cats;
  }, [flatItems]);

  const handleSelect = useCallback((emoji: string) => {
    addToRecents(emoji);
    setRecents(loadRecents());
    onSelect(emoji);
  }, [onSelect]);

  const scrollToCategory = useCallback((category: string) => {
    const headerEl = categoryHeaderRefs.current.get(category);
    if (headerEl && gridRef.current) {
      const containerRect = gridRef.current.getBoundingClientRect();
      const headerRect = headerEl.getBoundingClientRect();
      gridRef.current.scrollTo({
        top: gridRef.current.scrollTop + headerRect.top - containerRect.top,
        behavior: 'smooth',
      });
    }
  }, []);

  // Keyboard navigation
  useEffect(() => {
    const handleKeydown = (event: KeyboardEvent) => {
      switch (event.key) {
        case 'ArrowRight': {
          event.preventDefault();
          setSelectedIndex(prev => Math.min(prev + 1, emojiItems.length - 1));
          break;
        }
        case 'ArrowLeft': {
          event.preventDefault();
          setSelectedIndex(prev => Math.max(prev - 1, 0));
          break;
        }
        case 'ArrowDown': {
          event.preventDefault();
          setSelectedIndex(prev => Math.min(prev + COLS, emojiItems.length - 1));
          break;
        }
        case 'ArrowUp': {
          event.preventDefault();
          setSelectedIndex(prev => {
            const next = prev - COLS;
            if (next < 0) {
              inputRef.current?.focus();
              return -1;
            }
            return next;
          });
          break;
        }
        case 'Enter': {
          if (selectedIndex >= 0 && selectedIndex < emojiItems.length) {
            event.preventDefault();
            const item = emojiItems[selectedIndex];
            if (item.emoji) handleSelect(item.emoji);
          }
          break;
        }
        case 'Escape': {
          event.preventDefault();
          onClose();
          break;
        }
      }
    };

    window.addEventListener('keydown', handleKeydown);
    return () => window.removeEventListener('keydown', handleKeydown);
  }, [selectedIndex, emojiItems, handleSelect, onClose]);

  // Scroll selected emoji into view
  useEffect(() => {
    if (selectedIndex >= 0) {
      const el = document.querySelector(`[data-emoji-index="${selectedIndex}"]`);
      if (el && gridRef.current) {
        const containerRect = gridRef.current.getBoundingClientRect();
        const elRect = el.getBoundingClientRect();
        if (elRect.bottom > containerRect.bottom || elRect.top < containerRect.top) {
          gridRef.current.scrollTo({
            top: gridRef.current.scrollTop + elRect.top - containerRect.top - containerRect.height / 2,
          });
        }
      }
    }
  }, [selectedIndex]);

  const handleBackdropClick = useCallback((event: React.MouseEvent) => {
    if (event.target === event.currentTarget) {
      onClose();
    }
  }, [onClose]);

  // Compute spacer heights for virtualization
  const headerHeight = 28;
  const rowHeight = CELL_SIZE;
  let topSpacer = 0;
  let bottomSpacer = 0;
  for (let i = 0; i < visibleRange.start; i++) {
    topSpacer += rows[i]?.type === 'header' ? headerHeight : rowHeight;
  }
  for (let i = visibleRange.end; i < rows.length; i++) {
    bottomSpacer += rows[i]?.type === 'header' ? headerHeight : rowHeight;
  }

  const pickerContent = (
    <div className="emoji-picker" onClick={e => e.stopPropagation()}>
      {/* Search input */}
      <div className="emoji-picker-search">
        <input
          ref={inputRef}
          type="text"
          placeholder="Search emoji..."
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="emoji-picker-search-input"
        />
      </div>

      {/* Category tabs */}
      {!search && (
        <div className="emoji-picker-tabs">
          {availableCategories.map(cat => (
            <button
              key={cat}
              className="emoji-picker-tab"
              title={cat}
              onClick={() => scrollToCategory(cat)}
            >
              {CATEGORY_ICONS[cat] || cat[0]}
            </button>
          ))}
        </div>
      )}

      {/* Emoji grid */}
      <div
        ref={gridRef}
        className="emoji-picker-grid"
        onScroll={handleScroll}
      >
        {topSpacer > 0 && <div style={{ height: topSpacer }} />}

        {rows.slice(visibleRange.start, visibleRange.end).map((row, ri) => {
          const rowIndex = visibleRange.start + ri;

          if (row.type === 'header') {
            return (
              <div
                key={`h-${row.category}`}
                className="emoji-picker-category-header"
                ref={el => { if (el) categoryHeaderRefs.current.set(row.category, el); }}
              >
                {row.category}
              </div>
            );
          }

          return (
            <div key={`r-${rowIndex}`} className="emoji-picker-row">
              {row.itemIndices?.map(itemIdx => {
                const item = flatItems[itemIdx];
                const myEmojiIndex = flatToEmojiIndex.get(itemIdx) ?? -1;

                if (item.src) {
                  // Custom emoji with image
                  return (
                    <button
                      key={`${itemIdx}`}
                      className={`emoji-picker-cell ${myEmojiIndex === selectedIndex ? 'selected' : ''}`}
                      data-emoji-index={myEmojiIndex}
                      title={item.shortcodes?.[0] || ''}
                      onClick={() => {
                        // For custom image emoji, pass the shortcode
                        if (item.shortcodes?.[0]) handleSelect(`:${item.shortcodes[0]}:`);
                      }}
                    >
                      <img src={item.src} alt={item.shortcodes?.[0]} className="emoji-picker-custom-img" />
                    </button>
                  );
                }

                return (
                  <button
                    key={`${itemIdx}`}
                    className={`emoji-picker-cell ${myEmojiIndex === selectedIndex ? 'selected' : ''}`}
                    data-emoji-index={myEmojiIndex}
                    title={item.shortcodes?.join(', ') || ''}
                    onClick={() => item.emoji && handleSelect(item.emoji)}
                  >
                    {item.emoji}
                  </button>
                );
              })}
            </div>
          );
        })}

        {bottomSpacer > 0 && <div style={{ height: bottomSpacer }} />}

        {search && emojiItems.length === 0 && (
          <div className="emoji-picker-no-results">No emoji found</div>
        )}
      </div>

      {/* Footer hint */}
      <div className="emoji-picker-footer">
        {selectedIndex >= 0 && selectedIndex < emojiItems.length && emojiItems[selectedIndex].shortcodes?.[0] ? (
          <span className="emoji-picker-preview">
            <span className="emoji-picker-preview-emoji">
              {emojiItems[selectedIndex].emoji}
            </span>
            <span className="emoji-picker-preview-name">
              :{emojiItems[selectedIndex].shortcodes?.[0]}:
            </span>
          </span>
        ) : (
          <span className="emoji-picker-hint">
            <kbd>Arrow keys</kbd> Navigate <kbd>Enter</kbd> Select <kbd>Esc</kbd> Close
          </span>
        )}
        {onOpenCustomEmojiManager && (
          <button
            className="emoji-picker-manage-btn"
            onClick={(e) => { e.stopPropagation(); onClose(); onOpenCustomEmojiManager(); }}
            title="Manage custom emoji"
          >
            +
          </button>
        )}
      </div>
    </div>
  );

  if (position) {
    return (
      <div className="modal-backdrop emoji-picker-backdrop" onClick={handleBackdropClick}>
        {pickerContent}
      </div>
    );
  }

  return pickerContent;
}

export default EmojiPicker;
