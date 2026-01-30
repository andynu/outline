import React, { memo, useRef, useEffect, DragEvent, MouseEvent as ReactMouseEvent } from 'react';
import type { TreeNode } from '../lib/types';
import { useOutlineStore } from '../store/outlineStore';
import { processStaticContentElement, handleStaticContentClick } from '../lib/renderStaticContent';
import { formatDateRelative } from '../lib/dateUtils';
import DOMPurify from 'dompurify';

interface OutlineItemStaticProps {
  item: TreeNode;
  onNavigateToNode?: (nodeId: string) => void;
  isInFocusedSubtree?: boolean;
}

const useStaticItemState = (nodeId: string) => useOutlineStore(state => ({
  isSelected: state.selectedIds.has(nodeId),
  isDragging: state.draggedId === nodeId,
}));

/**
 * Lightweight static renderer for unfocused outline items.
 * Hook count: 5 (useStaticItemState, useRef x3, useEffect)
 */
export const OutlineItemStatic = memo(function OutlineItemStatic({
  item, onNavigateToNode, isInFocusedSubtree = false,
}: OutlineItemStaticProps) {
  const { node, depth, hasChildren } = item;
  const { isSelected, isDragging } = useStaticItemState(node.id);
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

  const itemClasses = [
    'outline-item',
    isSelected && 'selected',
    isInFocusedSubtree && 'in-focused-subtree',
    node.is_checked && 'checked',
    isDragging && 'dragging',
  ].filter(Boolean).join(' ');

  return (
    <div ref={itemRef} className={itemClasses} style={{ marginLeft: depth * 24 }}
      onDragOver={handleDragOver} onDragLeave={handleDragLeave} onDrop={handleDrop}>
      <div className="item-row" onClick={handleRowClick}>
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
    </div>
  );
});

export default OutlineItemStatic;
