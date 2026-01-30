import React, { memo, useRef, useEffect, useState, useMemo, DragEvent, MouseEvent as ReactMouseEvent } from 'react';
import type { TreeNode } from '../lib/types';
import { useOutlineStore } from '../store/outlineStore';
import { ContextMenu } from './ui/ContextMenu';
import { processStaticContentElement, handleStaticContentClick } from '../lib/renderStaticContent';
import { formatDateRelative } from '../lib/dateUtils';
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
  const staticContentRef = useRef<HTMLDivElement>(null);
  const dropPositionRef = useRef<'before' | 'after' | 'child' | null>(null);
  const itemRef = useRef<HTMLDivElement>(null);
  const store = useOutlineStore.getState;

  useEffect(() => {
    const el = staticContentRef.current;
    if (!el) return;
    const sanitizedHtml = DOMPurify.sanitize(node.content || '', {
      ALLOWED_TAGS: ['p', 'br', 'strong', 'em', 'code', 's', 'a', 'span'],
      ALLOWED_ATTR: ['href', 'target', 'rel', 'class', 'data-wiki-link', 'data-node-id'],
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

  const handleContextMenu = (e: ReactMouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setContextMenuPosition({ x: e.clientX, y: e.clientY });
    setShowContextMenu(true);
    // Don't set focus here - it would switch to OutlineItem and lose our context menu state
  };

  const handleMenuButtonClick = (e: ReactMouseEvent) => {
    e.stopPropagation();
    setContextMenuPosition({ x: e.clientX, y: e.clientY });
    setShowContextMenu(true);
    // Don't set focus here - it would switch to OutlineItem and lose our context menu state
  };

  // Get selected nodes info for bulk menu
  const selectedIds = useOutlineStore(state => state.selectedIds);
  const getSelectedNodes = useOutlineStore(state => state.getSelectedNodes);

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

      return [
        { label: `Complete all (${selectionCount})`, action: () => s.completeSelectedNodes(), shortcut: 'Ctrl+Enter', disabled: !hasAnyUnchecked },
        { label: `Uncomplete all (${selectionCount})`, action: () => s.uncompleteSelectedNodes(), disabled: !hasAnyChecked },
        { separator: true as const },
        { label: 'Convert to checkbox', action: () => s.convertSelectedToCheckbox(), disabled: !hasAnyBullet },
        { label: 'Convert to bullet', action: () => s.convertSelectedToBullet(), disabled: !hasAnyCheckbox },
        { separator: true as const },
        { label: 'Move to...', action: () => onOpenBulkQuickMove?.(), shortcut: 'Ctrl+Shift+M', disabled: !onOpenBulkQuickMove },
        { label: 'Move to top', action: () => s.moveSelectedToTop() },
        { label: 'Move to bottom', action: () => s.moveSelectedToBottom() },
        { label: 'Group under new item', action: () => s.groupSelectedUnderNewParent() },
        { separator: true as const },
        { label: 'Sort A-Z', action: () => s.sortSelectedAlphabetical() },
        { label: 'Sort Z-A', action: () => s.sortSelectedReverseAlphabetical() },
        { label: 'Sort by date (earliest)', action: () => s.sortSelectedByDate() },
        { label: 'Sort by date (latest)', action: () => s.sortSelectedByDateReverse() },
        { label: 'Sort by completion', action: () => s.sortSelectedByCompletion() },
        { label: 'Reverse order', action: () => s.reverseSelectedOrder() },
        { separator: true as const },
        { label: 'Indent', action: () => s.indentSelectedNodes(), shortcut: 'Tab' },
        { label: 'Outdent', action: () => s.outdentSelectedNodes(), shortcut: 'Shift+Tab' },
        { separator: true as const },
        { label: 'Copy as Markdown', action: () => s.copySelectedAsMarkdown(), shortcut: 'Ctrl+Shift+C' },
        { label: 'Copy as Plain Text', action: () => s.copySelectedAsPlainText() },
        { label: 'Export to file...', action: () => s.exportSelectedToFile() },
        { separator: true as const },
        { label: `Delete selected (${selectionCount})`, action: () => s.deleteSelectedNodes(), shortcut: 'Ctrl+Shift+Backspace' },
      ];
    }

    // Single item menu
    return [
      { label: node.is_checked ? 'Mark Incomplete' : 'Mark Complete', action: () => s.toggleCheckbox(node.id), shortcut: 'Ctrl+Enter' },
      { label: node.node_type === 'checkbox' ? 'Convert to Bullet' : 'Convert to Checkbox', action: () => s.toggleNodeType(node.id), shortcut: 'Ctrl+Shift+X' },
      { separator: true as const },
      { label: 'Copy', action: () => navigator.clipboard.writeText((node.content || '').replace(/<[^>]*>/g, '')), shortcut: 'Ctrl+C' },
      { separator: true as const },
      { label: node.collapsed ? 'Expand' : 'Collapse', action: () => s.toggleCollapse(node.id), shortcut: 'Ctrl+.', disabled: !hasChildren },
      { separator: true as const },
      { label: 'Zoom In', action: () => s.zoomTo(node.id), shortcut: 'Ctrl+]', disabled: !hasChildren },
      { label: 'Zoom Out', action: () => s.zoomToParent(), shortcut: 'Ctrl+[' },
      { separator: true as const },
      { label: 'Indent', action: () => s.indentNode(node.id), shortcut: 'Tab' },
      { label: 'Outdent', action: () => s.outdentNode(node.id), shortcut: 'Shift+Tab' },
      { separator: true as const },
      { label: 'Delete', action: () => s.deleteNode(node.id), shortcut: 'Ctrl+Shift+Backspace' },
    ];
  }, [node.id, node.is_checked, node.node_type, node.collapsed, node.content, hasChildren, selectedIds, getSelectedNodes]);

  const itemClasses = [
    'outline-item',
    isSelected && 'selected',
    isInFocusedSubtree && 'in-focused-subtree',
    node.is_checked && 'checked',
    isDragging && 'dragging',
  ].filter(Boolean).join(' ');

  return (
    <div ref={itemRef} className={itemClasses} style={{ marginLeft: depth * 24 }}
      onDragOver={handleDragOver} onDragLeave={handleDragLeave} onDrop={handleDrop}
      onContextMenu={handleContextMenu}>
      <div className="item-row" onClick={handleRowClick}>
        {/* Three-dot menu button - positioned in left margin, shows on hover */}
        <button
          className="hover-menu-btn"
          onClick={handleMenuButtonClick}
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
          ) : (
            <span className={`bullet ${hasChildren ? 'has-children' : ''} ${node.collapsed ? 'collapsed' : ''}`}
              onClick={hasChildren ? handleCollapseClick : undefined}
              onDoubleClick={handleBulletDblClick}>
              {hasChildren && node.collapsed ? '◉' : '●'}
            </span>
          )}
        </span>
        <div className="editor-wrapper">
          <div ref={staticContentRef} className="static-content" onClick={handleStaticClick} />
        </div>
        {node.date && <span className="date-badge">{formatDateRelative(node.date)}</span>}
        {node.recurrence && <span className="recurrence-indicator" title="Repeating">↻</span>}
      </div>
      {node.note && (
        <div className="note-row">
          <div className="note-content note-preview">
            {node.note.length > 100 ? node.note.slice(0, 100) + '...' : node.note}
          </div>
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
