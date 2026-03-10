import React, { memo, useRef, useEffect, useState, useMemo, DragEvent, MouseEvent as ReactMouseEvent } from 'react';
import type { TreeNode } from '../lib/types';
import { useOutlineStore } from '../store/outlineStore';
import { useSettingsStore } from '../store/settingsStore';
import { ContextMenu, closeAllContextMenus } from './ui/ContextMenu';
import { processStaticContentElement, handleStaticContentClick } from '../lib/renderStaticContent';
import { formatDateRelative, formatDateRange } from '../lib/dateUtils';
import { NODE_COLORS, getColorCss } from '../lib/colorPalette';
import { useBookmarkStore } from '../store/bookmarkStore';
import { stripHtml } from '../lib/utils';
import DOMPurify from 'dompurify';

interface OutlineItemStaticProps {
  item: TreeNode;
  onNavigateToNode?: (nodeId: string) => void;
  isInFocusedSubtree?: boolean;
  childrenSlot?: React.ReactNode;  // Pre-rendered children passed from parent wrapper
  onOpenBulkQuickMove?: () => void;
}

/**
 * Lightweight static renderer for unfocused outline items.
 * Hook count: 6 (useOutlineStore x2, useRef x3, useEffect)
 */
export const OutlineItemStatic = memo(function OutlineItemStatic({
  item, onNavigateToNode, isInFocusedSubtree = false, childrenSlot, onOpenBulkQuickMove,
}: OutlineItemStaticProps) {
  const { node, depth, hasChildren } = item;
  // Use separate selectors with primitive returns for stable memoization
  const isSelected = useOutlineStore(state => state.selectedIds.has(node.id));
  const isDragging = useOutlineStore(state => state.draggedId === node.id);
  const isNavigateFocused = useOutlineStore(state => state.focusedId === node.id && state.keyboardMode === 'navigate');
  const noteDisplayMode = useSettingsStore(state => state.noteDisplayMode);
  const showShortIds = useSettingsStore(state => state.showShortIds);
  const staticContentRef = useRef<HTMLDivElement>(null);
  const dropPositionRef = useRef<'before' | 'after' | 'child' | null>(null);
  const itemRef = useRef<HTMLDivElement>(null);
  const store = useOutlineStore.getState;

  // Scroll navigate-focused item into view
  useEffect(() => {
    if (isNavigateFocused && itemRef.current) {
      itemRef.current.scrollIntoView({ block: 'nearest' });
    }
  }, [isNavigateFocused]);

  useEffect(() => {
    const el = staticContentRef.current;
    if (!el) return;
    const sanitizedHtml = DOMPurify.sanitize(node.content || '', {
      ALLOWED_TAGS: ['p', 'br', 'strong', 'em', 'code', 's', 'a', 'span', 'img'],
      ALLOWED_ATTR: ['href', 'target', 'rel', 'class', 'data-wiki-link', 'data-node-id',
        'src', 'alt', 'title', 'data-emoji-shortcode', 'draggable'],
    });
    el.innerHTML = sanitizedHtml;
    processStaticContentElement(el);
  }, [node.content]);

  const handleCollapseClick = (e: ReactMouseEvent) => {
    e.stopPropagation();
    store().toggleCollapse(node.id);
  };

  const handleBulletDblClick = (e: ReactMouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    store().zoomTo(node.id);
  };

  const handleCheckboxClick = (e: ReactMouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    store().toggleCheckbox(node.id);
  };

  const handleRowClick = (e: ReactMouseEvent) => {
    const target = e.target as HTMLElement;
    const s = store();
    if (e.ctrlKey || e.metaKey) { e.preventDefault(); s.toggleSelection(node.id); return; }
    if (e.shiftKey) { e.preventDefault(); s.selectRange(node.id); return; }
    if (target.closest('.drag-handle')) return;
    s.clearSelection();
    s.setFocusedId(node.id);
  };

  const handleStaticClick = (e: ReactMouseEvent) => {
    // Stop propagation to prevent handleRowClick from also handling the click
    e.stopPropagation();
    const handled = handleStaticContentClick(e.nativeEvent, {
      onHashtagClick: (tag) => store().setFilterQuery(`#${tag}`),
      onMentionClick: (mention) => store().setFilterQuery(`@${mention}`),
      onWikiLinkClick: (targetId) => onNavigateToNode?.(targetId),
    });
    if (handled) return;
    const s = store();
    if (e.ctrlKey || e.metaKey) { e.preventDefault(); s.toggleSelection(node.id); }
    else if (e.shiftKey) { e.preventDefault(); s.selectRange(node.id); }
    else { s.clearSelection(); s.setFocusedId(node.id); }
  };

  const handleDragStart = (e: DragEvent<HTMLSpanElement>) => {
    e.stopPropagation();
    if (e.dataTransfer) {
      e.dataTransfer.effectAllowed = 'move';
      e.dataTransfer.setData('application/x-outline-node', node.id);
    }
    store().startDrag(node.id);
  };

  const handleDragEnd = (e: DragEvent<HTMLSpanElement>) => {
    e.stopPropagation();
    store().endDrag();
    dropPositionRef.current = null;
    itemRef.current?.classList.remove('drag-over', 'drop-before', 'drop-after', 'drop-child');
  };

  const handleDragOver = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    if (store().draggedId === node.id) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const y = e.clientY - rect.top;
    const height = rect.height;
    const pos = y < height * 0.25 ? 'before' : y > height * 0.75 ? 'after' : 'child';
    dropPositionRef.current = pos;
    const el = itemRef.current;
    if (el) {
      el.classList.add('drag-over');
      el.classList.toggle('drop-before', pos === 'before');
      el.classList.toggle('drop-after', pos === 'after');
      el.classList.toggle('drop-child', pos === 'child');
    }
    if (e.dataTransfer) e.dataTransfer.dropEffect = 'move';
  };

  const handleDragLeave = (e: DragEvent<HTMLDivElement>) => {
    e.stopPropagation();
    dropPositionRef.current = null;
    itemRef.current?.classList.remove('drag-over', 'drop-before', 'drop-after', 'drop-child');
  };

  const handleDrop = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    const s = store();
    if (s.draggedId && s.draggedId !== node.id) {
      s.dropOnNode(node.id, dropPositionRef.current === 'child');
    }
    dropPositionRef.current = null;
    itemRef.current?.classList.remove('drag-over', 'drop-before', 'drop-after', 'drop-child');
  };

  // Context menu state
  const [showContextMenu, setShowContextMenu] = useState(false);
  const [contextMenuPosition, setContextMenuPosition] = useState({ x: 0, y: 0 });

  const openContextMenu = (e: ReactMouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    closeAllContextMenus();
    setContextMenuPosition({ x: e.clientX, y: e.clientY });
    setShowContextMenu(true);
  };

  // Get selected nodes info for bulk menu
  const selectedIds = useOutlineStore(state => state.selectedIds);
  const getSelectedNodes = useOutlineStore(state => state.getSelectedNodes);
  const documentId = useOutlineStore(state => state.documentId);
  const isBookmarked = useBookmarkStore(state => state.isBookmarked(node.id));

  // Context menu items - simplified for static items
  const contextMenuItems = useMemo(() => {
    const s = store();
    const selected = getSelectedNodes();
    const isBulkMode = selectedIds.size > 1;

    if (isBulkMode) {
      const selectionCount = selected.length;
      const hasAnyUnchecked = selected.some(n => !n.is_checked || n.node_type !== 'checkbox');
      const hasAnyChecked = selected.some(n => n.is_checked && n.node_type === 'checkbox');
      const hasAnyBullet = selected.some(n => n.node_type === 'bullet');
      const hasAnyCheckbox = selected.some(n => n.node_type === 'checkbox');
      const hasAnyNonNumbered = selected.some(n => n.node_type !== 'numbered');

      return [
        { label: `Complete all (${selectionCount})`, action: () => s.completeSelectedNodes(), shortcut: 'Ctrl+Enter', disabled: !hasAnyUnchecked },
        { label: `Uncomplete all (${selectionCount})`, action: () => s.uncompleteSelectedNodes(), disabled: !hasAnyChecked },
        { separator: true as const },
        { label: 'Convert to checkbox', action: () => s.convertSelectedToCheckbox(), disabled: !hasAnyBullet && !hasAnyNonNumbered },
        { label: 'Convert to bullet', action: () => s.convertSelectedToBullet(), disabled: !hasAnyCheckbox && !hasAnyNonNumbered },
        { label: 'Convert to numbered', action: () => s.convertSelectedToNumbered(), disabled: !hasAnyNonNumbered },
        { separator: true as const },
        {
          submenu: true as const,
          label: 'Move',
          children: [
            { label: 'Move to...', action: () => onOpenBulkQuickMove?.(), shortcut: 'Ctrl+Shift+M', disabled: !onOpenBulkQuickMove },
            { label: 'Move to top', action: () => s.moveSelectedToTop() },
            { label: 'Move to bottom', action: () => s.moveSelectedToBottom() },
            { label: 'Group under new item', action: () => s.groupSelectedUnderNewParent() },
          ],
        },
        {
          submenu: true as const,
          label: 'Sort',
          children: [
            { label: 'A-Z', action: () => s.sortSelectedAlphabetical() },
            { label: 'Z-A', action: () => s.sortSelectedReverseAlphabetical() },
            { separator: true as const },
            { label: 'By date (earliest)', action: () => s.sortSelectedByDate() },
            { label: 'By date (latest)', action: () => s.sortSelectedByDateReverse() },
            { separator: true as const },
            { label: 'By completion', action: () => s.sortSelectedByCompletion() },
            { label: 'Reverse order', action: () => s.reverseSelectedOrder() },
          ],
        },
        { separator: true as const },
        { label: 'Indent', action: () => s.indentSelectedNodes(), shortcut: 'Tab' },
        { label: 'Outdent', action: () => s.outdentSelectedNodes(), shortcut: 'Shift+Tab' },
        { separator: true as const },
        {
          submenu: true as const,
          label: 'Copy / Export',
          children: [
            { label: 'Copy as Markdown', action: () => s.copySelectedAsMarkdown(), shortcut: 'Ctrl+Shift+C' },
            { label: 'Copy as Plain Text', action: () => s.copySelectedAsPlainText() },
            { separator: true as const },
            { label: 'Export as Markdown...', action: () => s.exportSelectedToFile() },
            { label: 'Export as Plain Text...', action: () => s.exportSelectedToFilePlainText() },
          ],
        },
        { separator: true as const },
        { colorPicker: true as const, label: 'Color', colors: NODE_COLORS, currentColor: '', onSelectColor: (color: string) => s.setSelectedNodesColor(color) },
        { separator: true as const },
        { label: `Delete selected (${selectionCount})`, action: () => s.deleteSelectedNodes(), shortcut: 'Ctrl+Shift+Backspace' },
      ];
    }

    // Single item menu
    return [
      { label: node.is_checked ? 'Mark Incomplete' : 'Mark Complete', action: () => s.toggleCheckbox(node.id), shortcut: 'Ctrl+Enter' },
      { label: node.node_type === 'checkbox' ? 'Convert to Bullet' : 'Convert to Checkbox', action: () => s.toggleNodeType(node.id), shortcut: 'Ctrl+Shift+X' },
      { label: 'Convert to Numbered', action: () => s.setNodeTypeTo(node.id, 'numbered'), disabled: node.node_type === 'numbered' },
      { separator: true as const },
      { headingPicker: true as const, currentLevel: node.node_type === 'heading' ? (node.heading_level ?? null) : null, onSelect: (level: number) => { if (level === 0) s.clearHeading(node.id); else s.setHeadingLevel(node.id, level); } },
      { separator: true as const },
      {
        submenu: true as const,
        label: 'Copy / Export',
        children: [
          { label: 'Copy', action: () => navigator.clipboard.writeText((node.content || '').replace(/<[^>]*>/g, '')), shortcut: 'Ctrl+C' },
          { label: 'Copy tree as Markdown', action: () => s.copyTreeAsMarkdown(node.id), shortcut: 'Ctrl+Shift+C', disabled: !hasChildren },
          { label: 'Copy tree as Plain Text', action: () => s.copyTreeAsPlainText(node.id), disabled: !hasChildren },
          { label: 'Copy Short ID', action: () => { const prefix = useOutlineStore.getState().docPrefix; const sid = node.short_id; if (prefix && sid) navigator.clipboard.writeText(`${prefix}-${sid}`); }, disabled: !node.short_id },
        ],
      },
      { separator: true as const },
      { label: node.collapsed ? 'Expand' : 'Collapse', action: () => s.toggleCollapse(node.id), shortcut: 'Ctrl+.', disabled: !hasChildren },
      { separator: true as const },
      { label: 'Zoom In', action: () => s.zoomTo(node.id), shortcut: 'Ctrl+]', disabled: !hasChildren },
      { label: 'Zoom Out', action: () => s.zoomToParent(), shortcut: 'Ctrl+[' },
      { separator: true as const },
      { label: 'Edit Note', action: () => s.openNoteEditor(node.id), shortcut: 'Ctrl+Shift+Enter' },
      { separator: true as const },
      { label: 'Indent', action: () => s.indentNode(node.id), shortcut: 'Tab' },
      { label: 'Outdent', action: () => s.outdentNode(node.id), shortcut: 'Shift+Tab' },
      { separator: true as const },
      {
        submenu: true as const,
        label: 'Sort children',
        disabled: !hasChildren,
        children: [
          { label: 'Title (A-Z)', action: () => s.sortChildrenByTitle(node.id), disabled: !hasChildren },
          { label: 'Title (Z-A)', action: () => s.sortChildrenByTitleReverse(node.id), disabled: !hasChildren },
          { separator: true as const },
          { label: 'Date (newest)', action: () => s.sortChildrenByDate(node.id), disabled: !hasChildren },
          { label: 'Date (oldest)', action: () => s.sortChildrenByDateReverse(node.id), disabled: !hasChildren },
          { separator: true as const },
          { label: 'Updated (newest)', action: () => s.sortChildrenByUpdated(node.id), disabled: !hasChildren },
          { label: 'Updated (oldest)', action: () => s.sortChildrenByUpdatedReverse(node.id), disabled: !hasChildren },
          { separator: true as const },
          { label: 'Created (newest)', action: () => s.sortChildrenByCreated(node.id), disabled: !hasChildren },
          { label: 'Created (oldest)', action: () => s.sortChildrenByCreatedReverse(node.id), disabled: !hasChildren },
        ],
      },
      { separator: true as const },
      { colorPicker: true as const, label: 'Color', colors: NODE_COLORS, currentColor: node.color || '', onSelectColor: (color: string) => s.setNodeColor(node.id, color) },
      { separator: true as const },
      {
        label: isBookmarked ? 'Remove Bookmark' : 'Bookmark',
        action: () => {
          if (isBookmarked) {
            useBookmarkStore.getState().remove(node.id);
          } else {
            const label = (node.content || '').replace(/<[^>]*>/g, '').trim() || 'Untitled';
            useBookmarkStore.getState().add(node.id, documentId ?? '', label);
          }
        },
      },
      { separator: true as const },
      { label: 'Delete', action: () => s.deleteNode(node.id), shortcut: 'Ctrl+Shift+Backspace' },
    ];
  }, [node.id, node.is_checked, node.node_type, node.heading_level, node.collapsed, node.content, node.color, hasChildren, selectedIds, getSelectedNodes, isBookmarked, documentId]);

  // Compute numbered index for numbered items
  const numberedIndex = useMemo(() => {
    if (node.node_type !== 'numbered') return 0;
    const siblings = store().getSiblings(node.id);
    let count = 0;
    for (const sibling of siblings) {
      if (sibling.node_type === 'numbered') count++;
      if (sibling.id === node.id) break;
    }
    return count;
  }, [node.id, node.node_type, node.position]);

  const headingClass = node.node_type === 'heading' && node.heading_level
    ? `heading-${node.heading_level}`
    : null;
  const nodeColorCss = getColorCss(node.color);
  const itemClasses = [
    'outline-item',
    isSelected && 'selected',
    isNavigateFocused && 'navigate-focused',
    isInFocusedSubtree && 'in-focused-subtree',
    node.is_checked && 'checked',
    isDragging && 'dragging',
    headingClass,
    nodeColorCss && 'has-color',
  ].filter(Boolean).join(' ');

  return (
    <div ref={itemRef} className={itemClasses} style={{ marginLeft: depth * 24, ...(nodeColorCss ? { borderLeftColor: nodeColorCss } as React.CSSProperties : {}) }}
      onDragOver={handleDragOver} onDragLeave={handleDragLeave} onDrop={handleDrop}
      onContextMenu={openContextMenu}>
      <div className="item-row" onClick={handleRowClick}>
        {/* Three-dot menu button - positioned in left margin, shows on hover */}
        <button
          className="hover-menu-btn"
          onClick={openContextMenu}
          tabIndex={-1}
          aria-label="Open menu"
          title="Menu"
        >
          <svg viewBox="0 0 16 16" fill="currentColor">
            <circle cx="8" cy="3" r="1.5"/>
            <circle cx="8" cy="8" r="1.5"/>
            <circle cx="8" cy="13" r="1.5"/>
          </svg>
        </button>
        <span className="drag-handle" draggable="true"
          onDragStart={handleDragStart} onDragEnd={handleDragEnd}>
          {node.node_type === 'checkbox' ? (
            <button className={`checkbox-btn ${node.is_checked ? 'checked' : ''}`}
              onClick={handleCheckboxClick} tabIndex={-1}
              aria-label={node.is_checked ? 'Mark incomplete' : 'Mark complete'}>
              <span className={`checkbox-icon ${node.is_checked ? 'checked' : ''}`}>
                {node.is_checked ? '✓' : ''}
              </span>
            </button>
          ) : node.node_type === 'numbered' ? (
            <span className={`numbered-indicator ${hasChildren ? 'has-children' : ''} ${node.collapsed ? 'collapsed' : ''}`}
              onClick={hasChildren ? handleCollapseClick : undefined}
              onDoubleClick={handleBulletDblClick}>
              {numberedIndex}.
            </span>
          ) : (
            <span className={`bullet ${hasChildren ? 'has-children' : ''} ${node.collapsed ? 'collapsed' : ''}`}
              onClick={hasChildren ? handleCollapseClick : undefined}
              onDoubleClick={handleBulletDblClick}>
              {hasChildren && node.collapsed ? '◉' : '●'}
            </span>
          )}
        </span>
        {showShortIds && node.short_id && (
          <span
            className="short-id-badge"
            title="Click to copy"
            onClick={(e) => {
              e.stopPropagation();
              const prefix = useOutlineStore.getState().docPrefix;
              if (prefix) navigator.clipboard.writeText(`${prefix}-${node.short_id}`);
            }}
          >
            {node.short_id}
          </span>
        )}
        <div className="editor-wrapper">
          <div ref={staticContentRef} className="static-content" onClick={handleStaticClick} />
        </div>
        {node.defer_date && <span className="date-badge defer" title={`Deferred until ${node.defer_date}`}>{'Defer: ' + formatDateRelative(node.defer_date)}</span>}
        {node.date && <span className="date-badge" title={node.date_end ? `${node.date} - ${node.date_end}` : node.date}>{formatDateRange(node.date, node.date_end)}</span>}
        {node.recurrence && <span className="recurrence-indicator" title="Repeating">↻</span>}
        {isBookmarked && <span className="bookmark-indicator" title="Bookmarked">★</span>}
      </div>
      {node.note && noteDisplayMode !== 'none' && (
        <div className="note-row">
          <div
            className="note-content note-preview"
            dangerouslySetInnerHTML={{
              __html: noteDisplayMode === 'one-line'
                ? (() => {
                    const plain = stripHtml(node.note);
                    return plain.length > 100 ? plain.slice(0, 100) + '...' : plain;
                  })()
                : DOMPurify.sanitize(node.note)
            }}
          />
        </div>
      )}
      {childrenSlot}

      {/* Context menu */}
      {showContextMenu && (
        <ContextMenu
          items={contextMenuItems}
          position={contextMenuPosition}
          onClose={() => setShowContextMenu(false)}
        />
      )}
    </div>
  );
});

export default OutlineItemStatic;
