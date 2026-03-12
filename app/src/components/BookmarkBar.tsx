import { useState, useCallback, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { useBookmarkStore } from '../store/bookmarkStore';
import { EmojiPicker } from './ui/EmojiPicker';
import type { Bookmark } from '../lib/api';

interface BookmarkBarProps {
  currentDocumentId?: string;
  onNavigate: (nodeId: string, documentId: string) => void;
}

export function BookmarkBar({ currentDocumentId, onNavigate }: BookmarkBarProps) {
  const bookmarks = useBookmarkStore((s) => s.bookmarks);
  const removeBookmark = useBookmarkStore((s) => s.remove);
  const updateBookmarkEmoji = useBookmarkStore((s) => s.updateEmoji);
  const reorderBookmarks = useBookmarkStore((s) => s.reorder);

  // Context menu state
  const [contextMenu, setContextMenu] = useState<{ bookmark: Bookmark; x: number; y: number } | null>(null);
  const [emojiPicker, setEmojiPicker] = useState<{ bookmark: Bookmark; x: number; y: number } | null>(null);
  const [, setShowCustomEmojiManager] = useState(false);

  // Drag-and-drop state
  const [dragId, setDragId] = useState<string | null>(null);
  const [dropTarget, setDropTarget] = useState<{ nodeId: string; position: 'before' | 'after' } | null>(null);

  // Scroll overflow state
  const scrollRef = useRef<HTMLDivElement>(null);
  const [canScrollLeft, setCanScrollLeft] = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(false);

  const updateScrollState = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    setCanScrollLeft(el.scrollLeft > 0);
    setCanScrollRight(el.scrollLeft + el.clientWidth < el.scrollWidth - 1);
  }, []);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    updateScrollState();
    el.addEventListener('scroll', updateScrollState);
    const observer = new ResizeObserver(updateScrollState);
    observer.observe(el);
    return () => {
      el.removeEventListener('scroll', updateScrollState);
      observer.disconnect();
    };
  }, [updateScrollState, bookmarks.length]);

  // Close context menu on outside click
  useEffect(() => {
    if (!contextMenu) return;
    const handler = () => setContextMenu(null);
    document.addEventListener('click', handler);
    return () => document.removeEventListener('click', handler);
  }, [contextMenu]);

  // Scroll helpers
  const scrollBy = useCallback((delta: number) => {
    scrollRef.current?.scrollBy({ left: delta, behavior: 'smooth' });
  }, []);

  // Drag handlers
  const handleDragStart = useCallback((e: React.DragEvent, nodeId: string) => {
    setDragId(nodeId);
    e.dataTransfer.effectAllowed = 'move';
  }, []);

  const handleDragOver = useCallback((e: React.DragEvent, nodeId: string) => {
    e.preventDefault();
    if (!dragId || dragId === nodeId) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const midX = rect.left + rect.width / 2;
    const position = e.clientX < midX ? 'before' : 'after';
    setDropTarget({ nodeId, position });
  }, [dragId]);

  const handleDrop = useCallback(async (e: React.DragEvent, targetNodeId: string) => {
    e.preventDefault();
    e.stopPropagation();

    if (!dragId || dragId === targetNodeId) {
      setDragId(null);
      setDropTarget(null);
      return;
    }

    const currentIds = bookmarks.map(b => b.node_id);
    const newOrder = currentIds.filter(id => id !== dragId);
    const insertIndex = dropTarget?.position === 'before'
      ? newOrder.indexOf(targetNodeId)
      : newOrder.indexOf(targetNodeId) + 1;
    newOrder.splice(insertIndex, 0, dragId);

    setDragId(null);
    setDropTarget(null);

    await reorderBookmarks(newOrder);
  }, [dragId, bookmarks, dropTarget, reorderBookmarks]);

  const handleDragEnd = useCallback(() => {
    setDragId(null);
    setDropTarget(null);
  }, []);

  if (bookmarks.length === 0) return null;

  return (
    <>
      <div className="bookmark-bar">
        {canScrollLeft && (
          <button
            className="bookmark-bar-scroll bookmark-bar-scroll-left"
            onClick={() => scrollBy(-120)}
            aria-label="Scroll bookmarks left"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="14" height="14">
              <polyline points="15 18 9 12 15 6" />
            </svg>
          </button>
        )}
        <div className="bookmark-bar-tabs" ref={scrollRef}>
          {bookmarks.map((bm) => (
            <div
              key={bm.node_id}
              className={
                'bookmark-bar-tab'
                + (bm.document_id === currentDocumentId ? ' bookmark-bar-tab-active' : '')
                + (dragId === bm.node_id ? ' bookmark-bar-tab-dragging' : '')
                + (dropTarget?.nodeId === bm.node_id ? ` bookmark-bar-tab-drop-${dropTarget.position}` : '')
              }
              draggable
              onDragStart={(e) => handleDragStart(e, bm.node_id)}
              onDragOver={(e) => handleDragOver(e, bm.node_id)}
              onDragLeave={() => { if (dropTarget?.nodeId === bm.node_id) setDropTarget(null); }}
              onDrop={(e) => handleDrop(e, bm.node_id)}
              onDragEnd={handleDragEnd}
              onClick={() => onNavigate(bm.node_id, bm.document_id)}
              onContextMenu={(e) => {
                e.preventDefault();
                e.stopPropagation();
                setContextMenu({ bookmark: bm, x: e.clientX, y: e.clientY });
              }}
              title={bm.label}
            >
              {bm.emoji && <span className="bookmark-bar-tab-emoji">{bm.emoji}</span>}
              <span className="bookmark-bar-tab-label">{bm.label}</span>
            </div>
          ))}
        </div>
        {canScrollRight && (
          <button
            className="bookmark-bar-scroll bookmark-bar-scroll-right"
            onClick={() => scrollBy(120)}
            aria-label="Scroll bookmarks right"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="14" height="14">
              <polyline points="9 18 15 12 9 6" />
            </svg>
          </button>
        )}
      </div>

      {/* Context menu */}
      {contextMenu && createPortal(
        <div className="context-menu" style={{ left: contextMenu.x, top: contextMenu.y }}>
          <button
            className="context-menu-item"
            onClick={(e) => {
              e.stopPropagation();
              const bm = contextMenu.bookmark;
              setContextMenu(null);
              setEmojiPicker({ bookmark: bm, x: contextMenu.x, y: contextMenu.y });
            }}
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="12" cy="12" r="10" />
              <path d="M8 14s1.5 2 4 2 4-2 4-2" />
              <line x1="9" y1="9" x2="9.01" y2="9" />
              <line x1="15" y1="9" x2="15.01" y2="9" />
            </svg>
            Change Emoji
          </button>
          {contextMenu.bookmark.emoji != null && (
            <button
              className="context-menu-item"
              onClick={(e) => {
                e.stopPropagation();
                const bm = contextMenu.bookmark;
                setContextMenu(null);
                updateBookmarkEmoji(bm.node_id, null);
              }}
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <line x1="18" y1="6" x2="6" y2="18" />
                <line x1="6" y1="6" x2="18" y2="18" />
              </svg>
              Remove Emoji
            </button>
          )}
          <button
            className="context-menu-item context-menu-item-danger"
            onClick={(e) => {
              e.stopPropagation();
              const bm = contextMenu.bookmark;
              setContextMenu(null);
              removeBookmark(bm.node_id);
            }}
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <polyline points="3 6 5 6 21 6" />
              <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
            </svg>
            Remove Bookmark
          </button>
        </div>,
        document.body
      )}

      {/* Emoji picker */}
      {emojiPicker && createPortal(
        <EmojiPicker
          position={{ x: emojiPicker.x, y: emojiPicker.y }}
          onSelect={(emoji) => {
            updateBookmarkEmoji(emojiPicker.bookmark.node_id, emoji);
            setEmojiPicker(null);
          }}
          onClose={() => setEmojiPicker(null)}
          onOpenCustomEmojiManager={() => setShowCustomEmojiManager(true)}
        />,
        document.body
      )}
    </>
  );
}
