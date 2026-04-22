import React, { memo, useRef, useEffect, useCallback, useState, useMemo, MouseEvent as ReactMouseEvent } from 'react';
import { Editor } from '@tiptap/core';
import type { TreeNode } from '../../lib/types';
import { useOutlineStore } from '../../store/outlineStore';
import { useSelectionStore } from '../../store/selectionStore';
import { useSettingsStore } from '../../store/settingsStore';
import { ContextMenu, closeAllContextMenus } from '../ui/ContextMenu';
import { buildItemContextMenu } from './itemContextMenu';
import { buildBulkContextMenu } from './bulkContextMenu';
import { useDragDrop } from './useDragDrop';
import { useNoteEditor } from './useNoteEditor';
import { useSuggestions } from './useSuggestions';
import { useOutlineEditor } from './useOutlineEditor';
import { processStaticContentElement, handleStaticContentClick } from '../../lib/renderStaticContent';
import { buildNotePreview } from '../../lib/notePreview';
import DOMPurify from 'dompurify';

// Suggestion popups
import { WikiLinkSuggestion } from '../ui/WikiLinkSuggestion';
import { HashtagSuggestion } from '../ui/HashtagSuggestion';
import { DueDateSuggestion } from '../ui/DueDateSuggestion';
import { EmojiSuggestion } from '../ui/EmojiSuggestion';
import { DatePicker } from '../ui/DatePicker';
import { RecurrencePicker, type RecurrenceMode } from '../ui/RecurrencePicker';
import { formatDateRelative, formatDateRange } from '../../lib/dateUtils';
import { getColorCss } from '../../lib/colorPalette';
import { useBookmarkStore } from '../../store/bookmarkStore';

interface OutlineItemProps {
  item: TreeNode;
  onNavigateToNode?: (nodeId: string) => void;
  isInFocusedSubtree?: boolean;
  onOpenBulkQuickMove?: () => void;
  flat?: boolean;  // When true, don't render children recursively (for virtualization)
  childrenSlot?: React.ReactNode;  // Pre-rendered children when flat=true
}

/**
 * Full-featured outline item with TipTap rich-text editor.
 * Used only for the currently focused item to minimize overhead.
 *
 * Features:
 * - TipTap editor with extensions (WikiLink, Hashtag, DueDate, Mention)
 * - Suggestion popups for autocomplete
 * - Full keyboard navigation and editing
 * - Context menus (single and bulk operations)
 * - Drag and drop support
 * - Notes editing
 *
 * For unfocused items, use OutlineItemStatic instead (6 hooks vs ~40 here).
 *
 * @see OutlineItemStatic - Lightweight static renderer for unfocused items
 * @see TreeItemRenderer in App.tsx - Routes between OutlineItem and OutlineItemStatic
 */
export const OutlineItem = memo(function OutlineItem({
  item,
  onNavigateToNode,
  isInFocusedSubtree = false,
  onOpenBulkQuickMove,
  flat = false,
  childrenSlot
}: OutlineItemProps) {
  const { node, depth, hasChildren, children } = item;

  // Store selectors - use individual selectors for better performance
  const focusedId = useOutlineStore(state => state.focusedId);
  const setFocusedId = useOutlineStore(state => state.setFocusedId);
  const addSiblingAfter = useOutlineStore(state => state.addSiblingAfter);
  const updateContent = useOutlineStore(state => state.updateContent);
  const deleteNode = useOutlineStore(state => state.deleteNode);
  const toggleCollapse = useOutlineStore(state => state.toggleCollapse);
  const toggleCheckbox = useOutlineStore(state => state.toggleCheckbox);
  const toggleNodeType = useOutlineStore(state => state.toggleNodeType);
  const setHeadingLevel = useOutlineStore(state => state.setHeadingLevel);
  const clearHeading = useOutlineStore(state => state.clearHeading);
  const indentNode = useOutlineStore(state => state.indentNode);
  const outdentNode = useOutlineStore(state => state.outdentNode);
  const swapWithPrevious = useOutlineStore(state => state.swapWithPrevious);
  const swapWithNext = useOutlineStore(state => state.swapWithNext);
  const moveToPrevious = useOutlineStore(state => state.moveToPrevious);
  const moveToNext = useOutlineStore(state => state.moveToNext);
  const moveToFirst = useOutlineStore(state => state.moveToFirst);
  const moveToLast = useOutlineStore(state => state.moveToLast);
  const zoomTo = useOutlineStore(state => state.zoomTo);
  const zoomToParent = useOutlineStore(state => state.zoomToParent);
  const openNoteEditor = useOutlineStore(state => state.openNoteEditor);
  const selectedIds = useSelectionStore(state => state.selectedIds);
  const toggleSelection = useSelectionStore(state => state.toggleSelection);
  const selectRange = useSelectionStore(state => state.selectRange);
  const clearSelection = useSelectionStore(state => state.clearSelection);
  const completeSelectedNodes = useSelectionStore(state => state.completeSelectedNodes);
  const uncompleteSelectedNodes = useSelectionStore(state => state.uncompleteSelectedNodes);
  const convertSelectedToCheckbox = useSelectionStore(state => state.convertSelectedToCheckbox);
  const convertSelectedToBullet = useSelectionStore(state => state.convertSelectedToBullet);
  const convertSelectedToNumbered = useSelectionStore(state => state.convertSelectedToNumbered);
  const setNodeTypeTo = useOutlineStore(state => state.setNodeTypeTo);
  const indentSelectedNodes = useSelectionStore(state => state.indentSelectedNodes);
  const outdentSelectedNodes = useSelectionStore(state => state.outdentSelectedNodes);
  const moveSelectedToTop = useSelectionStore(state => state.moveSelectedToTop);
  const moveSelectedToBottom = useSelectionStore(state => state.moveSelectedToBottom);
  const copySelectedAsMarkdown = useSelectionStore(state => state.copySelectedAsMarkdown);
  const copySelectedAsPlainText = useSelectionStore(state => state.copySelectedAsPlainText);
  const showShortIds = useSettingsStore(state => state.showShortIds);
  const noteDisplayMode = useSettingsStore(state => state.noteDisplayMode);
  const exportSelectedToFile = useSelectionStore(state => state.exportSelectedToFile);
  const exportSelectedToFilePlainText = useSelectionStore(state => state.exportSelectedToFilePlainText);
  const deleteSelectedNodes = useSelectionStore(state => state.deleteSelectedNodes);
  const getSelectedNodes = useSelectionStore(state => state.getSelectedNodes);
  const groupSelectedUnderNewParent = useSelectionStore(state => state.groupSelectedUnderNewParent);
  const sortSelectedAlphabetical = useSelectionStore(state => state.sortSelectedAlphabetical);
  const sortSelectedReverseAlphabetical = useSelectionStore(state => state.sortSelectedReverseAlphabetical);
  const sortSelectedByDate = useSelectionStore(state => state.sortSelectedByDate);
  const sortSelectedByDateReverse = useSelectionStore(state => state.sortSelectedByDateReverse);
  const sortSelectedByCompletion = useSelectionStore(state => state.sortSelectedByCompletion);
  const reverseSelectedOrder = useSelectionStore(state => state.reverseSelectedOrder);
  const setNodeColor = useOutlineStore(state => state.setNodeColor);
  const setSelectedNodesColor = useSelectionStore(state => state.setSelectedNodesColor);
  const draggedId = useOutlineStore(state => state.draggedId);
  const startDrag = useOutlineStore(state => state.startDrag);
  const endDrag = useOutlineStore(state => state.endDrag);
  const dropOnNode = useOutlineStore(state => state.dropOnNode);
  const updateNote = useOutlineStore(state => state.updateNote);
  const getSiblings = useOutlineStore(state => state.getSiblings);
  const allNodes = useOutlineStore(state => state.nodes);

  const isFocused = focusedId === node.id;
  const isNodeSelected = selectedIds.has(node.id);
  const isDragging = draggedId === node.id;
  const {
    isDragOver, dropPosition,
    handleDragStart, handleDragEnd, handleDragOver, handleDragLeave, handleDrop,
  } = useDragDrop({ nodeId: node.id, draggedId, startDrag, endDrag, dropOnNode });
  const editorContainerRef = useRef<HTMLDivElement>(null);
  const staticContentRef = useRef<HTMLDivElement>(null);
  const noteInputRef = useRef<HTMLTextAreaElement>(null);
  const editorRef = useRef<Editor | null>(null);
  const {
    isEditingNote, setIsEditingNote,
    handleNoteInput, handleNoteKeydown, handleNoteBlur, handleNoteClick, renderNoteHtml,
  } = useNoteEditor({
    nodeId: node.id, note: node.note, isFocused,
    noteInputRef, editorRef,
    updateNote, setFocusedId, openNoteEditor,
  });
  const suggestions = useSuggestions({ editorRef, nodeId: node.id });
  // Keep a stable ref to suggestion controls so the editor closure (created once on focus)
  // can access up-to-date setters without stale closure issues.
  const suggestionsControlsRef = useRef(suggestions.controls);
  suggestionsControlsRef.current = suggestions.controls;

  const [showContextMenu, setShowContextMenu] = useState(false);
  const [contextMenuPosition, setContextMenuPosition] = useState({ x: 0, y: 0 });

  // Compute existing hashtags from all nodes for suggestion popup
  const existingTags = useMemo(() => {
    const tagMap = new Map<string, { count: number }>();
    const HASHTAG_PATTERN = /(?:^|[\s])#([a-zA-Z][a-zA-Z0-9_-]*)/g;

    for (const n of allNodes) {
      const plainText = (n.content || '').replace(/<[^>]*>/g, '');
      for (const match of plainText.matchAll(HASHTAG_PATTERN)) {
        const tag = match[1];
        const existing = tagMap.get(tag);
        if (existing) {
          existing.count++;
        } else {
          tagMap.set(tag, { count: 1 });
        }
      }
    }
    return tagMap;
  }, [allNodes]);

  // Keep stable refs to store functions to avoid stale closures in editor
  const storeRef = useRef({
    addSiblingAfter,
    deleteNode,
    updateContent,
    toggleCollapse,
    toggleCheckbox,
    toggleNodeType,
    setHeadingLevel,
    clearHeading,
    indentNode,
    outdentNode,
    swapWithPrevious,
    swapWithNext,
    moveToPrevious,
    moveToNext,
    moveToFirst,
    moveToLast,
    setFocusedId,
  });

  // Update refs when functions change
  useEffect(() => {
    storeRef.current = {
      addSiblingAfter,
      deleteNode,
      updateContent,
      toggleCollapse,
      toggleCheckbox,
      toggleNodeType,
      setHeadingLevel,
      clearHeading,
      indentNode,
      outdentNode,
      swapWithPrevious,
      swapWithNext,
      moveToPrevious,
      moveToNext,
      moveToFirst,
      moveToLast,
      setFocusedId,
    };
  });

  useOutlineEditor({
    isFocused, nodeId: node.id, nodeContent: node.content,
    nodeType: node.node_type, nodeIsChecked: node.is_checked,
    editorRef, editorContainerRef, storeRef, suggestionsControlsRef,
    setIsEditingNote, noteInputRef, zoomToParent, onNavigateToNode,
  });

  // Sync content from store to editor when it changes externally
  useEffect(() => {
    const editor = editorRef.current;
    if (editor && !editor.isFocused) {
      const currentContent = editor.getHTML();
      if (currentContent !== node.content) {
        editor.commands.setContent(node.content || '');
      }
    }
  }, [node.content]);

  // Render and process static content to add styling for hashtags, mentions, dates, URLs
  useEffect(() => {
    // Only run when not focused and the static content div exists
    if (isFocused) return;
    const el = staticContentRef.current;
    if (!el) return;

    // Sanitize and set the HTML content
    const sanitizedHtml = DOMPurify.sanitize(node.content || '', {
      ALLOWED_TAGS: ['p', 'br', 'strong', 'em', 'code', 's', 'a', 'span'],
      ALLOWED_ATTR: ['href', 'target', 'rel', 'class', 'data-wiki-link', 'data-node-id'],
    });
    el.innerHTML = sanitizedHtml;
    // Process to add interactive styling for hashtags, mentions, dates, URLs
    processStaticContentElement(el);
  }, [isFocused, node.content]);

  const handleCollapseClick = useCallback(() => {
    toggleCollapse(node.id);
  }, [node.id, toggleCollapse]);

  const handleBulletDblClick = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    zoomTo(node.id);
  }, [node.id, zoomTo]);

  const handleCheckboxClick = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    toggleCheckbox(node.id);
  }, [node.id, toggleCheckbox]);

  const handleRowClick = useCallback((e: React.MouseEvent) => {
    const target = e.target as HTMLElement;

    // Multi-selection with Ctrl/Cmd or Shift - always handle regardless of target
    if (e.ctrlKey || e.metaKey) {
      e.preventDefault();
      toggleSelection(node.id);
      return;
    }

    if (e.shiftKey) {
      e.preventDefault();
      selectRange(node.id);
      return;
    }

    // For regular clicks, skip if inside editor or drag handle
    if (target.closest('.outline-editor') || target.closest('.drag-handle')) {
      return;
    }

    // Normal click: clear selection and focus
    clearSelection();
    setFocusedId(node.id);
  }, [node.id, setFocusedId, toggleSelection, selectRange, clearSelection]);

  const handleStaticClick = useCallback((e: React.MouseEvent) => {
    // First, check for hashtag/mention/wiki-link clicks
    const handled = handleStaticContentClick(e.nativeEvent, {
      onHashtagClick: (tag) => {
        useOutlineStore.getState().setFilterQuery(`#${tag}`);
      },
      onMentionClick: (mention) => {
        useOutlineStore.getState().setFilterQuery(`@${mention}`);
      },
      onWikiLinkClick: (nodeId) => {
        if (onNavigateToNode) {
          onNavigateToNode(nodeId);
        }
      },
    });

    if (handled) return;

    // Support multi-selection with Ctrl/Cmd or Shift
    if (e.ctrlKey || e.metaKey) {
      e.preventDefault();
      toggleSelection(node.id);
    } else if (e.shiftKey) {
      e.preventDefault();
      selectRange(node.id);
    } else {
      clearSelection();
      setFocusedId(node.id);
    }
  }, [node.id, setFocusedId, toggleSelection, selectRange, clearSelection, onNavigateToNode]);

  // Capture handler for modifier clicks to catch them before TipTap editor
  const handleModifierClickCapture = useCallback((e: React.MouseEvent) => {
    if (e.ctrlKey || e.metaKey) {
      e.preventDefault();
      e.stopPropagation();
      toggleSelection(node.id);
    } else if (e.shiftKey) {
      e.preventDefault();
      e.stopPropagation();
      selectRange(node.id);
    }
  }, [node.id, toggleSelection, selectRange]);

  // Plain text version of content (for clipboard, search, etc.)
  const plainTextContent = node.content?.replace(/<[^>]*>/g, '') || '';


  // === Context Menu ===

  const handleContextMenu = useCallback((e: ReactMouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    closeAllContextMenus();
    setContextMenuPosition({ x: e.clientX, y: e.clientY });
    setShowContextMenu(true);
    setFocusedId(node.id);
  }, [node.id, setFocusedId]);

  // Helper to copy content to clipboard
  const copyToClipboard = useCallback(() => {
    const text = node.content?.replace(/<[^>]*>/g, '') || '';
    navigator.clipboard.writeText(text);
  }, [node.content]);

  // Helper to search web
  const webSearch = useCallback(() => {
    const text = node.content?.replace(/<[^>]*>/g, '').trim() || '';
    if (text) {
      const url = useSettingsStore.getState().buildSearchUrl(text);
      window.open(url, '_blank');
    }
  }, [node.content]);

  const documentId = useOutlineStore(state => state.documentId);
  const isBookmarked = useBookmarkStore(state => state.isBookmarked(node.id));

  const contextMenuItems = useMemo(() => buildItemContextMenu({
    node, hasChildren, isBookmarked, documentId, plainTextContent, contextMenuPosition,
    toggleCheckbox, toggleNodeType, setNodeTypeTo, setHeadingLevel, clearHeading,
    toggleCollapse, zoomTo, zoomToParent, openNoteEditor, indentNode, outdentNode,
    deleteNode, setNodeColor, copyToClipboard, webSearch,
    setDatePickerPosition: suggestions.controls.datePicker.setPosition,
    setDatePickerMode: suggestions.controls.datePicker.setMode,
    setShowDatePicker: suggestions.controls.datePicker.setShow,
  }), [node.id, node.is_checked, node.node_type, node.heading_level, node.collapsed, node.date, node.date_end, node.defer_date, node.color, hasChildren, plainTextContent, toggleCheckbox, toggleNodeType, setNodeTypeTo, setHeadingLevel, clearHeading, toggleCollapse, zoomTo, openNoteEditor, indentNode, outdentNode, deleteNode, copyToClipboard, webSearch, contextMenuPosition, setNodeColor, isBookmarked, documentId]);

  // Multi-selection context menu (shown when multiple items are selected)
  const bulkContextMenuItems = useMemo(() => buildBulkContextMenu({
    selectedNodes: getSelectedNodes(),
    completeSelectedNodes, uncompleteSelectedNodes,
    convertSelectedToCheckbox, convertSelectedToBullet, convertSelectedToNumbered,
    moveSelectedToTop, moveSelectedToBottom, groupSelectedUnderNewParent,
    sortSelectedAlphabetical, sortSelectedReverseAlphabetical,
    sortSelectedByDate, sortSelectedByDateReverse,
    sortSelectedByCompletion, reverseSelectedOrder,
    indentSelectedNodes, outdentSelectedNodes,
    copySelectedAsMarkdown, copySelectedAsPlainText,
    exportSelectedToFile, exportSelectedToFilePlainText,
    deleteSelectedNodes, setSelectedNodesColor, onOpenBulkQuickMove,
  }), [selectedIds, getSelectedNodes, completeSelectedNodes, uncompleteSelectedNodes, convertSelectedToCheckbox, convertSelectedToBullet, convertSelectedToNumbered, moveSelectedToTop, moveSelectedToBottom, groupSelectedUnderNewParent, sortSelectedAlphabetical, sortSelectedReverseAlphabetical, sortSelectedByDate, sortSelectedByDateReverse, sortSelectedByCompletion, reverseSelectedOrder, copySelectedAsMarkdown, copySelectedAsPlainText, exportSelectedToFile, exportSelectedToFilePlainText, indentSelectedNodes, outdentSelectedNodes, deleteSelectedNodes, onOpenBulkQuickMove, setSelectedNodesColor]);

  // Compute numbered index for numbered items
  const numberedIndex = useMemo(() => {
    if (node.node_type !== 'numbered') return 0;
    const siblings = getSiblings(node.id);
    let count = 0;
    for (const sibling of siblings) {
      if (sibling.node_type === 'numbered') count++;
      if (sibling.id === node.id) break;
    }
    return count;
  }, [node.id, node.node_type, node.position, getSiblings]);

  // Build className for the item
  const headingClass = node.node_type === 'heading' && node.heading_level
    ? `heading-${node.heading_level}`
    : null;
  const nodeColorCss = getColorCss(node.color);
  const itemClasses = [
    'outline-item',
    isFocused && 'focused',
    isNodeSelected && 'selected',
    (isInFocusedSubtree && !isFocused) && 'in-focused-subtree',
    node.is_checked && 'checked',
    isDragging && 'dragging',
    isDragOver && 'drag-over',
    dropPosition === 'before' && 'drop-before',
    dropPosition === 'after' && 'drop-after',
    dropPosition === 'child' && 'drop-child',
    headingClass,
    nodeColorCss && 'has-color',
  ].filter(Boolean).join(' ');

  return (
    <div
      className={itemClasses}
      style={{ marginLeft: depth === 0 ? 0 : 24, ...(nodeColorCss ? { borderLeftColor: nodeColorCss } as React.CSSProperties : {}) }}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      <div className="item-row" onClick={handleRowClick} onClickCapture={handleModifierClickCapture} onContextMenu={handleContextMenu}>
        {/* Three-dot menu button - positioned in left margin, shows on hover */}
        <button
          className="hover-menu-btn"
          onClick={(e) => {
            e.stopPropagation();
            closeAllContextMenus();
            setContextMenuPosition({ x: e.clientX, y: e.clientY });
            setShowContextMenu(true);
            setFocusedId(node.id);
          }}
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

        {/* Drag handle / bullet / checkbox / numbered */}
        <span
          className="drag-handle"
          draggable="true"
          onDragStart={handleDragStart}
          onDragEnd={handleDragEnd}
        >
          {node.node_type === 'checkbox' ? (
            <button
              className={`checkbox-btn ${node.is_checked ? 'checked' : ''}`}
              onClick={handleCheckboxClick}
              tabIndex={-1}
              aria-label={node.is_checked ? 'Mark incomplete' : 'Mark complete'}
            >
              <span className={`checkbox-icon ${node.is_checked ? 'checked' : ''}`}>
                {node.is_checked ? '✓' : ''}
              </span>
            </button>
          ) : node.node_type === 'numbered' ? (
            <span
              className={`numbered-indicator ${hasChildren ? 'has-children' : ''} ${node.collapsed ? 'collapsed' : ''}`}
              onClick={hasChildren ? handleCollapseClick : undefined}
              onDoubleClick={handleBulletDblClick}
            >
              {numberedIndex}.
            </span>
          ) : (
            <span
              className={`bullet ${hasChildren ? 'has-children' : ''} ${node.collapsed ? 'collapsed' : ''}`}
              onClick={hasChildren ? handleCollapseClick : undefined}
              onDoubleClick={handleBulletDblClick}
            >
              {hasChildren && node.collapsed ? '◉' : '●'}
            </span>
          )}
        </span>

        {/* Short ID badge */}
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

        {/* Editor or static content */}
        <div className="editor-wrapper">
          {isFocused ? (
            <div key="editor" ref={editorContainerRef} className="editor-container"></div>
          ) : (
            <div
              key="static"
              ref={staticContentRef}
              className="static-content"
              onClick={handleStaticClick}
            />
          )}
        </div>

        {/* Defer date badge */}
        {node.defer_date && (
          <span className="date-badge defer" onClick={suggestions.datePicker.onDeferBadgeClick} title={`Deferred until ${node.defer_date}`}>
            {'Defer: ' + formatDateRelative(node.defer_date)}
          </span>
        )}

        {/* Date badge */}
        {node.date && (
          <span className="date-badge" onClick={suggestions.datePicker.onDateBadgeClick} title={node.date_end ? `${node.date} - ${node.date_end}` : node.date}>
            {formatDateRange(node.date, node.date_end)}
          </span>
        )}

        {/* Recurrence indicator */}
        {node.recurrence && (
          <span className="recurrence-indicator" onClick={suggestions.recurrencePicker.onIndicatorClick} title="Repeating">
            ↻
          </span>
        )}
        {isBookmarked && <span className="bookmark-indicator" title="Bookmarked">★</span>}
      </div>

      {/* Note row — honors noteDisplayMode; isEditingNote always shows the textarea */}
      {(isEditingNote || (node.note && noteDisplayMode !== 'none')) && (
        <div className="note-row">
          {isEditingNote && isFocused ? (
            <textarea
              ref={noteInputRef}
              className="note-input"
              value={node.note || ''}
              onChange={handleNoteInput}
              onKeyDown={handleNoteKeydown}
              onBlur={handleNoteBlur}
              placeholder="Add a note..."
              rows={1}
            />
          ) : noteDisplayMode === 'one-line' ? (
            <div
              className="note-content note-preview"
              onClick={handleNoteClick}
            >
              {buildNotePreview(node.note || '')}
            </div>
          ) : (
            <div
              className="note-content"
              onClick={handleNoteClick}
              dangerouslySetInnerHTML={{ __html: renderNoteHtml(node.note || '') }}
            />
          )}
        </div>
      )}

      {/* Recursive children (flat mode uses pre-rendered childrenSlot) */}
      {flat && childrenSlot}
      {!flat && hasChildren && !node.collapsed && (
        <div className="children-wrapper">
          <div className="indent-guide"></div>
          <div className="children">
            {children.map(child => (
              <OutlineItem
                key={child.node.id}
                item={child}
                onNavigateToNode={onNavigateToNode}
                isInFocusedSubtree={isFocused || isInFocusedSubtree}
                onOpenBulkQuickMove={onOpenBulkQuickMove}
              />
            ))}
          </div>
        </div>
      )}

      {/* Context menu - show bulk menu when multiple items selected, otherwise single item menu */}
      {showContextMenu && (
        <ContextMenu
          items={selectedIds.size > 1 ? bulkContextMenuItems : contextMenuItems}
          position={contextMenuPosition}
          onClose={() => setShowContextMenu(false)}
        />
      )}

      {/* Wiki link suggestion popup */}
      {suggestions.wikiLink.show && (
        <WikiLinkSuggestion
          query={suggestions.wikiLink.query}
          position={suggestions.wikiLink.position}
          onSelect={suggestions.wikiLink.onSelect}
          onClose={suggestions.wikiLink.onClose}
        />
      )}

      {/* Hashtag suggestion popup */}
      {suggestions.hashtag.show && (
        <HashtagSuggestion
          query={suggestions.hashtag.query}
          position={suggestions.hashtag.position}
          onSelect={suggestions.hashtag.onSelect}
          onClose={suggestions.hashtag.onClose}
          existingTags={existingTags}
        />
      )}

      {/* Due date suggestion popup */}
      {suggestions.dueDate.show && (
        <DueDateSuggestion
          query={suggestions.dueDate.query}
          position={suggestions.dueDate.position}
          onSelect={suggestions.dueDate.onSelect}
          onClose={suggestions.dueDate.onClose}
        />
      )}

      {/* Emoji suggestion popup */}
      {suggestions.emoji.show && (
        <EmojiSuggestion
          query={suggestions.emoji.query}
          position={suggestions.emoji.position}
          onSelect={suggestions.emoji.onSelect}
          onClose={suggestions.emoji.onClose}
        />
      )}

      {/* Date picker modal */}
      {suggestions.datePicker.show && (
        <DatePicker
          position={suggestions.datePicker.position}
          currentDate={node.date}
          currentDeferDate={node.defer_date}
          currentDateEnd={node.date_end}
          initialMode={suggestions.datePicker.mode}
          onSelect={suggestions.datePicker.onSelect}
          onClose={suggestions.datePicker.onClose}
        />
      )}

      {/* Recurrence picker modal */}
      {suggestions.recurrencePicker.show && (
        <RecurrencePicker
          position={suggestions.recurrencePicker.position}
          currentRecurrence={node.recurrence}
          currentMode={(node.recurrence_mode as RecurrenceMode) ?? 'schedule'}
          onSelect={suggestions.recurrencePicker.onSelect}
          onClose={suggestions.recurrencePicker.onClose}
        />
      )}
    </div>
  );
});

export default OutlineItem;
