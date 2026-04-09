import React, { memo, useRef, useEffect, useCallback, useState, useMemo, DragEvent, MouseEvent as ReactMouseEvent } from 'react';
import { Editor } from '@tiptap/core';
import { DOMSerializer } from '@tiptap/pm/model';
import StarterKit from '@tiptap/starter-kit';
import type { TreeNode } from '../../lib/types';
import { useOutlineStore } from '../../store/outlineStore';
import { useSelectionStore } from '../../store/selectionStore';
import { useSettingsStore } from '../../store/settingsStore';
import { ContextMenu, closeAllContextMenus } from '../ui/ContextMenu';
import { buildItemContextMenu } from './itemContextMenu';
import { buildBulkContextMenu } from './bulkContextMenu';
import { useDragDrop } from './useDragDrop';
import { useNoteEditor } from './useNoteEditor';
import { processStaticContentElement, handleStaticContentClick } from '../../lib/renderStaticContent';
import DOMPurify from 'dompurify';

// TipTap extensions
import { WikiLink, createWikiLinkInputHandler } from '../../lib/WikiLink';
import { Hashtag } from '../../lib/Hashtag';
import { DueDate } from '../../lib/DueDate';
import { AutoLink } from '../../lib/AutoLink';
import { MarkdownLink } from '../../lib/MarkdownLink';
import { Mention } from '../../lib/Mention';
import { EmojiShortcode } from '../../lib/EmojiShortcode';
import { CustomEmojiNode } from '../../lib/CustomEmojiNode';

// Suggestion popups
import { WikiLinkSuggestion } from '../ui/WikiLinkSuggestion';
import { HashtagSuggestion } from '../ui/HashtagSuggestion';
import { DueDateSuggestion } from '../ui/DueDateSuggestion';
import { EmojiSuggestion } from '../ui/EmojiSuggestion';
import { DatePicker, type DatePickerMode } from '../ui/DatePicker';
import { RecurrencePicker, type RecurrenceMode } from '../ui/RecurrencePicker';
import { formatDateRelative, formatDateRange } from '../../lib/dateUtils';
import { looksLikeMarkdownList, parseMarkdownList } from '../../lib/markdownPaste';
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
  const pendingCursorPos = useOutlineStore(state => state.pendingCursorPos);
  const setFocusedId = useOutlineStore(state => state.setFocusedId);
  const setPendingCursorPos = useOutlineStore(state => state.setPendingCursorPos);
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
  const toggleSelectedCheckboxes = useSelectionStore(state => state.toggleSelectedCheckboxes);
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
  const [editorReady, setEditorReady] = useState(false);
  const {
    isEditingNote, setIsEditingNote,
    handleNoteInput, handleNoteKeydown, handleNoteBlur, handleNoteClick, renderNoteHtml,
  } = useNoteEditor({
    nodeId: node.id, note: node.note, isFocused,
    noteInputRef, editorRef,
    updateNote, setFocusedId, openNoteEditor,
  });
  const [showContextMenu, setShowContextMenu] = useState(false);
  const [contextMenuPosition, setContextMenuPosition] = useState({ x: 0, y: 0 });
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [datePickerPosition, setDatePickerPosition] = useState({ x: 0, y: 0 });
  const [datePickerMode, setDatePickerMode] = useState<DatePickerMode>('due');
  const [showRecurrencePicker, setShowRecurrencePicker] = useState(false);
  const [recurrencePickerPosition, setRecurrencePickerPosition] = useState({ x: 0, y: 0 });

  // Wiki link suggestion state - use refs for values accessed in editor handlers
  // to avoid stale closure issues
  const [showWikiLinkSuggestion, setShowWikiLinkSuggestion] = useState(false);
  const [wikiLinkQuery, setWikiLinkQuery] = useState('');
  const [wikiLinkRange, setWikiLinkRange] = useState<{ from: number; to: number } | null>(null);
  const [wikiLinkPosition, setWikiLinkPosition] = useState({ x: 0, y: 0 });
  const wikiLinkActiveRef = useRef(false);
  const wikiLinkRangeRef = useRef<{ from: number; to: number } | null>(null);

  // Hashtag suggestion state
  const [showHashtagSuggestion, setShowHashtagSuggestion] = useState(false);
  const [hashtagQuery, setHashtagQuery] = useState('');
  const [hashtagRange, setHashtagRange] = useState<{ from: number; to: number } | null>(null);
  const [hashtagPosition, setHashtagPosition] = useState({ x: 0, y: 0 });
  const hashtagActiveRef = useRef(false);
  const hashtagRangeRef = useRef<{ from: number; to: number } | null>(null);

  // Due date suggestion state
  const [showDueDateSuggestion, setShowDueDateSuggestion] = useState(false);
  const [dueDateQuery, setDueDateQuery] = useState('');
  const [dueDateRange, setDueDateRange] = useState<{ from: number; to: number } | null>(null);
  const [dueDatePosition, setDueDatePosition] = useState({ x: 0, y: 0 });
  const dueDateActiveRef = useRef(false);
  const dueDateRangeRef = useRef<{ from: number; to: number } | null>(null);

  // Emoji suggestion state
  const [showEmojiSuggestion, setShowEmojiSuggestion] = useState(false);
  const [emojiQuery, setEmojiQuery] = useState('');
  const [emojiRange, setEmojiRange] = useState<{ from: number; to: number } | null>(null);
  const [emojiPosition, setEmojiPosition] = useState({ x: 0, y: 0 });
  const emojiActiveRef = useRef(false);
  const emojiRangeRef = useRef<{ from: number; to: number } | null>(null);

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

  // Create or destroy editor based on focus state
  useEffect(() => {
    if (isFocused && editorContainerRef.current && !editorRef.current) {
      const nodeId = node.id;

      // Create editor when focused
      const editor = new Editor({
        element: editorContainerRef.current,
        extensions: [
          StarterKit.configure({
            heading: false,
            bulletList: false,
            orderedList: false,
            blockquote: false,
            codeBlock: false,
            horizontalRule: false,
            hardBreak: false,
          }),
          // Wiki links with navigation
          WikiLink.configure({
            onNavigate: (targetNodeId: string) => {
              if (onNavigateToNode) {
                onNavigateToNode(targetNodeId);
              }
            },
          }),
          // Hashtag styling and click handling
          Hashtag.configure({
            onHashtagClick: (tag: string) => {
              // Filter to show items with this hashtag
              useOutlineStore.getState().setFilterQuery(`#${tag}`);
            },
          }),
          // Due date highlighting and click handling
          DueDate.configure({
            onDueDateClick: (date: string) => {
              // TODO: Implement date picker or date view
              console.log('Due date clicked:', date);
            },
          }),
          // Auto-link URLs
          AutoLink.configure({
            openOnClick: true,
          }),
          // Markdown-style links [text](url)
          MarkdownLink.configure({
            openOnClick: true,
          }),
          // @mentions
          Mention.configure({
            onMentionClick: (mention: string) => {
              // Filter to show items with this mention
              useOutlineStore.getState().setFilterQuery(`@${mention}`);
            },
          }),
          // Emoji shortcode conversion (:smile: -> emoji)
          EmojiShortcode,
          // Custom emoji inline images
          CustomEmojiNode,
        ],
        content: node.content || '',
        editorProps: {
          attributes: {
            class: 'outline-editor',
          },
          handleTextInput: (view, from, to, text) => {
            const state = view.state;
            const prevChar = from > 0 ? state.doc.textBetween(from - 1, from) : '';

            // Detect [[ trigger for wiki links
            if (text === '[' && prevChar === '[') {
              const coords = view.coordsAtPos(from);
              wikiLinkActiveRef.current = true;
              wikiLinkRangeRef.current = { from: from - 1, to: from + 1 };
              setShowWikiLinkSuggestion(true);
              setWikiLinkQuery('');
              setWikiLinkRange({ from: from - 1, to: from + 1 });
              setWikiLinkPosition({ x: coords.left, y: coords.bottom + 5 });
              return false;
            }

            // If wiki link suggestion is active, update query
            if (wikiLinkActiveRef.current && wikiLinkRangeRef.current) {
              const range = wikiLinkRangeRef.current;
              const queryStart = range.from + 2;
              const currentQuery = state.doc.textBetween(queryStart, from) + text;

              // Check for ]] to close
              if (text === ']' && currentQuery.endsWith(']')) {
                wikiLinkActiveRef.current = false;
                wikiLinkRangeRef.current = null;
                setShowWikiLinkSuggestion(false);
                setWikiLinkRange(null);
                return false;
              }

              const newRange = { from: range.from, to: from + text.length + 1 };
              wikiLinkRangeRef.current = newRange;
              setWikiLinkQuery(currentQuery);
              setWikiLinkRange(newRange);
              return false;
            }

            // Detect # trigger for hashtags (at start or after whitespace)
            if (text === '#' && (prevChar === '' || prevChar === ' ' || prevChar === '\t' || from === 1)) {
              const coords = view.coordsAtPos(from);
              hashtagActiveRef.current = true;
              hashtagRangeRef.current = { from: from, to: from + 1 };
              setShowHashtagSuggestion(true);
              setHashtagQuery('');
              setHashtagRange({ from: from, to: from + 1 });
              setHashtagPosition({ x: coords.left, y: coords.bottom + 5 });
              return false;
            }

            // If hashtag suggestion is active, update query
            if (hashtagActiveRef.current && hashtagRangeRef.current) {
              const range = hashtagRangeRef.current;
              const queryStart = range.from + 1; // After the #
              const currentQuery = state.doc.textBetween(queryStart, from) + text;

              // Check for space or special char to close
              if (text === ' ' || text === '\t' || text === '\n') {
                hashtagActiveRef.current = false;
                hashtagRangeRef.current = null;
                setShowHashtagSuggestion(false);
                setHashtagRange(null);
                return false;
              }

              const newRange = { from: range.from, to: from + text.length + 1 };
              hashtagRangeRef.current = newRange;
              setHashtagQuery(currentQuery);
              setHashtagRange(newRange);
              return false;
            }

            // Detect !( trigger for due dates
            if (text === '(' && prevChar === '!') {
              const coords = view.coordsAtPos(from);
              dueDateActiveRef.current = true;
              dueDateRangeRef.current = { from: from - 1, to: from + 1 };
              setShowDueDateSuggestion(true);
              setDueDateQuery('');
              setDueDateRange({ from: from - 1, to: from + 1 });
              setDueDatePosition({ x: coords.left, y: coords.bottom + 5 });
              return false;
            }

            // If due date suggestion is active, update query
            if (dueDateActiveRef.current && dueDateRangeRef.current) {
              const range = dueDateRangeRef.current;
              const queryStart = range.from + 2; // After the !(
              const currentQuery = state.doc.textBetween(queryStart, from) + text;

              // Check for ) to close and complete
              if (text === ')') {
                dueDateActiveRef.current = false;
                dueDateRangeRef.current = null;
                setShowDueDateSuggestion(false);
                setDueDateRange(null);
                return false;
              }

              const newRange = { from: range.from, to: from + text.length + 1 };
              dueDateRangeRef.current = newRange;
              setDueDateQuery(currentQuery);
              setDueDateRange(newRange);
              return false;
            }

            // Detect : trigger for emoji shortcodes (at start or after whitespace)
            if (text === ':' && !emojiActiveRef.current &&
                (prevChar === '' || prevChar === ' ' || prevChar === '\t' || from === 1)) {
              const coords = view.coordsAtPos(from);
              emojiActiveRef.current = true;
              emojiRangeRef.current = { from: from, to: from + 1 };
              setShowEmojiSuggestion(true);
              setEmojiQuery('');
              setEmojiRange({ from: from, to: from + 1 });
              setEmojiPosition({ x: coords.left, y: coords.bottom + 5 });
              return false;
            }

            // If emoji suggestion is active, update query
            if (emojiActiveRef.current && emojiRangeRef.current) {
              const range = emojiRangeRef.current;
              const queryStart = range.from + 1; // After the :
              const currentQuery = state.doc.textBetween(queryStart, from) + text;

              // Close on space, closing colon, or invalid characters
              if (text === ' ' || text === '\t' || text === '\n' || text === ':') {
                emojiActiveRef.current = false;
                emojiRangeRef.current = null;
                setShowEmojiSuggestion(false);
                setEmojiRange(null);
                return false;
              }

              const newRange = { from: range.from, to: from + text.length + 1 };
              emojiRangeRef.current = newRange;
              setEmojiQuery(currentQuery);
              setEmojiRange(newRange);
              return false;
            }

            // Auto-convert [ ] or [x] to checkbox when followed by space
            if (text === ' ') {
              // Get text content before the cursor
              const docText = state.doc.textContent;
              const textBeforeCursor = docText.substring(0, from - 1); // -1 because from is 1-indexed in TipTap

              // Check for [ ] or [x] pattern at start of content
              if (textBeforeCursor === '[ ]' || textBeforeCursor === '[x]' ||
                  textBeforeCursor === '[X]') {
                const isChecked = textBeforeCursor.toLowerCase() === '[x]';

                // Convert to checkbox and clear content
                useOutlineStore.getState().convertToCheckbox(nodeId, isChecked);

                // Prevent the space from being inserted
                return true;
              }
            }

            return false;
          },
          handleKeyDown: (view, event) => {
            const mod = event.ctrlKey || event.metaKey;
            const store = storeRef.current;

            // When wiki link, hashtag, due date, or emoji suggestion is active, let Enter/Tab/Arrow keys
            // pass through to the suggestion popup's keyboard handler
            if (wikiLinkActiveRef.current || hashtagActiveRef.current || dueDateActiveRef.current || emojiActiveRef.current) {
              if (event.key === 'Enter' || event.key === 'Tab' ||
                  event.key === 'ArrowUp' || event.key === 'ArrowDown') {
                // Don't handle - let the suggestion popup component handle it
                return false;
              }
            }

            // === TAB HANDLING ===
            if (event.key === 'Tab') {
              event.preventDefault();
              event.stopPropagation();
              if (event.shiftKey) {
                store.outdentNode(nodeId);
              } else {
                store.indentNode(nodeId);
              }
              return true;
            }

            // === NOTE EDITING ===
            // Shift+Enter: toggle note editing
            if (event.key === 'Enter' && !mod && event.shiftKey) {
              event.preventDefault();
              setIsEditingNote(true);
              // Focus the note input after it renders
              setTimeout(() => noteInputRef.current?.focus(), 0);
              return true;
            }

            // === EDITING ===
            if (event.key === 'Enter' && !mod && !event.shiftKey) {
              event.preventDefault();
              const { from, to, empty } = view.state.selection;
              const docSize = view.state.doc.content.size;

              // Check if cursor is at the end of content
              // In TipTap, the doc has 2 extra positions for paragraph start/end
              const isAtEnd = to >= docSize - 1;

              if (isAtEnd) {
                // Workflowy behavior: if item has visible children, create first child;
                // otherwise create sibling after
                const currentNode = useOutlineStore.getState().getNode(nodeId);
                const nodeChildren = useOutlineStore.getState().childrenOf(nodeId);
                if (nodeChildren.length > 0 && !currentNode?.collapsed) {
                  // Create as first child of this expanded node
                  useOutlineStore.getState().createFirstChild(nodeId);
                } else {
                  store.addSiblingAfter(nodeId);
                }
              } else {
                // In the middle - split the content
                // Get HTML content before and after cursor
                const beforeFragment = view.state.doc.slice(0, from);
                const afterFragment = view.state.doc.slice(from, docSize);

                // Serialize fragments to HTML
                const serializer = DOMSerializer.fromSchema(view.state.schema);

                const beforeDiv = document.createElement('div');
                const afterDiv = document.createElement('div');
                beforeDiv.appendChild(serializer.serializeFragment(beforeFragment.content));
                afterDiv.appendChild(serializer.serializeFragment(afterFragment.content));

                const beforeContent = beforeDiv.innerHTML;
                const afterContent = afterDiv.innerHTML;

                useOutlineStore.getState().splitNode(nodeId, beforeContent, afterContent);
              }
              return true;
            }

            if (event.key === 'Backspace' && mod && event.shiftKey) {
              event.preventDefault();
              store.deleteNode(nodeId);
              return true;
            }

            if (event.key === 'Backspace' && !mod && !event.shiftKey) {
              const { from } = view.state.selection;
              const isEmpty = view.state.doc.textContent.length === 0;
              if (from === 1) {
                if (isEmpty) {
                  event.preventDefault();
                  store.deleteNode(nodeId);
                  return true;
                } else {
                  // Merge with previous sibling at cursor position 1 with content
                  event.preventDefault();
                  useOutlineStore.getState().mergeWithPreviousSibling(nodeId);
                  return true;
                }
              }
            }

            if (event.key === 'Delete' && !mod && !event.shiftKey) {
              const { to } = view.state.selection;
              const docSize = view.state.doc.content.size;
              const isEmpty = view.state.doc.textContent.length === 0;

              if (isEmpty) {
                // Empty node - delete it and focus next item
                event.preventDefault();
                store.deleteNode(nodeId, 'next');
                return true;
              }

              // Check if cursor is at the end of content
              const isAtEnd = to >= docSize - 1;
              if (isAtEnd) {
                // At end - try to merge with next sibling
                event.preventDefault();
                useOutlineStore.getState().mergeWithNextSibling(nodeId);
                return true;
              }
            }

            // === NAVIGATION ===
            if (event.key === 'ArrowUp' && !mod && !event.shiftKey) {
              event.preventDefault();
              store.moveToPrevious();
              return true;
            }

            if (event.key === 'ArrowDown' && !mod && !event.shiftKey) {
              event.preventDefault();
              store.moveToNext();
              return true;
            }

            // Move item with Ctrl+Arrow (Shift+Arrow reserved for selection)
            if (event.key === 'ArrowUp' && mod) {
              event.preventDefault();
              store.swapWithPrevious(nodeId);
              return true;
            }

            if (event.key === 'ArrowDown' && mod) {
              event.preventDefault();
              store.swapWithNext(nodeId);
              return true;
            }

            if (event.key === 'Home' && mod) {
              event.preventDefault();
              store.moveToFirst();
              return true;
            }

            if (event.key === 'End' && mod) {
              event.preventDefault();
              store.moveToLast();
              return true;
            }

            // === COLLAPSE/EXPAND ===
            if (event.key === '.' && mod) {
              event.preventDefault();
              store.toggleCollapse(nodeId);
              return true;
            }

            // === ZOOM ===
            // Ctrl+] : zoom into current node's subtree
            if (event.key === ']' && mod) {
              event.preventDefault();
              useOutlineStore.getState().zoomTo(nodeId);
              return true;
            }

            // Ctrl+[ : zoom out to parent level
            if (event.key === '[' && mod) {
              event.preventDefault();
              zoomToParent();
              return true;
            }

            // === DATE PICKER ===
            // Ctrl+D : open date picker (due date)
            if (event.key === 'd' && mod && !event.shiftKey) {
              event.preventDefault();
              const rect = editorContainerRef.current?.getBoundingClientRect();
              if (rect) {
                setDatePickerPosition({ x: rect.left, y: rect.bottom + 5 });
              }
              setDatePickerMode('due');
              setShowDatePicker(true);
              return true;
            }

            // Ctrl+Shift+D : open date picker (defer/start date)
            if ((event.key === 'D' || event.key === 'd') && mod && event.shiftKey) {
              event.preventDefault();
              const rect = editorContainerRef.current?.getBoundingClientRect();
              if (rect) {
                setDatePickerPosition({ x: rect.left, y: rect.bottom + 5 });
              }
              setDatePickerMode('defer');
              setShowDatePicker(true);
              return true;
            }

            // Ctrl+R : open recurrence picker
            if (event.key === 'r' && mod && !event.shiftKey) {
              event.preventDefault();
              const rect = editorContainerRef.current?.getBoundingClientRect();
              if (rect) {
                setRecurrencePickerPosition({ x: rect.left, y: rect.bottom + 5 });
              }
              setShowRecurrencePicker(true);
              return true;
            }

            // === COMPLETION ===
            if (event.key === 'Enter' && mod && !event.shiftKey) {
              // If multi-selection, let App.tsx handle it to avoid double-firing
              if (useSelectionStore.getState().selectedIds.size > 0) {
                return false; // Don't handle, let it bubble to App.tsx
              }
              // Single item - toggle just this node, then advance focus
              event.preventDefault();
              // Determine next/prev visible node before toggling (item may vanish if hide-completed is on)
              const { getVisibleNodes } = useOutlineStore.getState();
              const visible = getVisibleNodes();
              const idx = visible.findIndex(n => n.id === nodeId);
              const nextId = idx >= 0 && idx < visible.length - 1 ? visible[idx + 1].id
                           : idx > 0 ? visible[idx - 1].id
                           : null;
              store.toggleCheckbox(nodeId);
              if (nextId) {
                store.setFocusedId(nextId);
              }
              return true;
            }

            if (event.key.toLowerCase() === 'x' && mod && event.shiftKey) {
              event.preventDefault();
              store.toggleNodeType(nodeId);
              return true;
            }

            // === HEADING LEVELS ===
            // Ctrl+1-6: Set heading level (also sets node_type to 'heading')
            if (mod && !event.shiftKey && event.key >= '1' && event.key <= '6') {
              event.preventDefault();
              store.setHeadingLevel(nodeId, parseInt(event.key, 10));
              return true;
            }

            // Ctrl+0: Reset to normal bullet (clear heading)
            if (mod && !event.shiftKey && event.key === '0') {
              event.preventDefault();
              store.clearHeading(nodeId);
              return true;
            }

            // === EXPORT SELECTION ===
            // Ctrl+Shift+E : export selection/focused node to markdown in clipboard
            if (event.key.toLowerCase() === 'e' && mod && event.shiftKey) {
              event.preventDefault();
              useSelectionStore.getState().exportSelection();
              return true;
            }

            // === WEB SEARCH ===
            // Ctrl+Shift+G : search selected text or item content on the web
            if (event.key.toLowerCase() === 'g' && mod && event.shiftKey) {
              event.preventDefault();
              // Get selected text, or fall back to item content
              const selection = window.getSelection();
              let searchText = selection?.toString()?.trim();
              if (!searchText) {
                searchText = useOutlineStore.getState().getNode(nodeId)?.content?.replace(/<[^>]*>/g, '').trim() || '';
              }
              if (searchText) {
                const url = useSettingsStore.getState().buildSearchUrl(searchText);
                window.open(url, '_blank');
              }
              return true;
            }

            // === WIKI LINK SUGGESTION HANDLING ===
            if (wikiLinkActiveRef.current) {
              if (event.key === 'Escape') {
                event.preventDefault();
                wikiLinkActiveRef.current = false;
                wikiLinkRangeRef.current = null;
                setShowWikiLinkSuggestion(false);
                setWikiLinkRange(null);
                return true;
              }
              if (event.key === 'Backspace' && wikiLinkRangeRef.current) {
                const { from } = view.state.selection;
                // If backspacing to before start of trigger, close suggestion
                if (from <= wikiLinkRangeRef.current.from + 2) {
                  wikiLinkActiveRef.current = false;
                  wikiLinkRangeRef.current = null;
                  setShowWikiLinkSuggestion(false);
                  setWikiLinkRange(null);
                }
              }
            }

            // === HASHTAG SUGGESTION HANDLING ===
            if (hashtagActiveRef.current) {
              if (event.key === 'Escape') {
                event.preventDefault();
                hashtagActiveRef.current = false;
                hashtagRangeRef.current = null;
                setShowHashtagSuggestion(false);
                setHashtagRange(null);
                return true;
              }
              if (event.key === 'Backspace' && hashtagRangeRef.current) {
                const { from } = view.state.selection;
                // If backspacing to before start of trigger, close suggestion
                if (from <= hashtagRangeRef.current.from + 1) {
                  hashtagActiveRef.current = false;
                  hashtagRangeRef.current = null;
                  setShowHashtagSuggestion(false);
                  setHashtagRange(null);
                }
              }
            }

            // === DUE DATE SUGGESTION HANDLING ===
            if (dueDateActiveRef.current) {
              if (event.key === 'Escape') {
                event.preventDefault();
                dueDateActiveRef.current = false;
                dueDateRangeRef.current = null;
                setShowDueDateSuggestion(false);
                setDueDateRange(null);
                return true;
              }
              if (event.key === 'Backspace' && dueDateRangeRef.current) {
                const { from } = view.state.selection;
                // If backspacing to before start of trigger !( , close suggestion
                if (from <= dueDateRangeRef.current.from + 2) {
                  dueDateActiveRef.current = false;
                  dueDateRangeRef.current = null;
                  setShowDueDateSuggestion(false);
                  setDueDateRange(null);
                }
              }
            }

            // === EMOJI SUGGESTION HANDLING ===
            if (emojiActiveRef.current) {
              if (event.key === 'Escape') {
                event.preventDefault();
                emojiActiveRef.current = false;
                emojiRangeRef.current = null;
                setShowEmojiSuggestion(false);
                setEmojiRange(null);
                return true;
              }
              if (event.key === 'Backspace' && emojiRangeRef.current) {
                const { from } = view.state.selection;
                // If backspacing to before start of trigger, close suggestion
                if (from <= emojiRangeRef.current.from + 1) {
                  emojiActiveRef.current = false;
                  emojiRangeRef.current = null;
                  setShowEmojiSuggestion(false);
                  setEmojiRange(null);
                }
              }
            }

            return false;
          },
          handlePaste: (view, event) => {
            // Check for markdown list in clipboard
            const text = event.clipboardData?.getData('text/plain');
            if (!text) return false;

            // Use the imported markdown paste helpers

            // Quick check to avoid expensive parsing for non-list content
            if (!looksLikeMarkdownList(text)) return false;

            // Parse the markdown
            const items = parseMarkdownList(text);
            if (!items || items.length === 0) return false;

            // Prevent default paste behavior
            event.preventDefault();

            // For single item, just insert the content in-place
            if (items.length === 1) {
              const singleItem = items[0];
              // Insert plain text (without HTML tags)
              view.dispatch(view.state.tr.insertText(singleItem.content.replace(/<[^>]*>/g, '')));

              // If it's a checkbox or numbered, convert this node
              if (singleItem.nodeType === 'checkbox') {
                const store = useOutlineStore.getState();
                if (node.node_type !== 'checkbox') {
                  store.toggleNodeType(nodeId);
                }
                if (singleItem.isChecked && !node.is_checked) {
                  store.toggleCheckbox(nodeId);
                }
              } else if (singleItem.nodeType === 'numbered') {
                const store = useOutlineStore.getState();
                if (node.node_type !== 'numbered') {
                  store.setNodeTypeTo(nodeId, 'numbered');
                }
              }
              return true;
            }

            // Multiple items: use the first item for current node, create rest as siblings/children
            const firstItem = items[0];
            const store = useOutlineStore.getState();

            // Update current node with first item's content
            store.updateContent(nodeId, firstItem.content);
            if (firstItem.nodeType === 'checkbox' && node.node_type !== 'checkbox') {
              store.toggleNodeType(nodeId);
              if (firstItem.isChecked) {
                store.toggleCheckbox(nodeId);
              }
            } else if (firstItem.nodeType === 'numbered' && node.node_type !== 'numbered') {
              store.setNodeTypeTo(nodeId, 'numbered');
            }

            // Process remaining items
            const remainingItems = items.slice(1);
            if (remainingItems.length > 0) {
              // Adjust indent levels: treat first item's indent as the "base"
              const baseIndent = firstItem.indent;
              const adjustedItems = remainingItems.map(ri => ({
                ...ri,
                indent: ri.indent - baseIndent
              }));

              store.createItemsFromMarkdown(nodeId, adjustedItems);
            }

            return true;
          },
        },
        onUpdate: ({ editor }) => {
          storeRef.current.updateContent(nodeId, editor.getHTML());
        },
        onFocus: () => {
          storeRef.current.setFocusedId(nodeId);
        },
      });

      editorRef.current = editor;
      setEditorReady(true);

      // Focus the editor at the pending cursor position or end
      setTimeout(() => {
        // Guard against strict mode double-mount: skip if editor was destroyed
        if (editor.isDestroyed) return;
        const cursorPos = useOutlineStore.getState().pendingCursorPos;
        if (cursorPos !== null) {
          // Position is in plain text chars, need to convert to ProseMirror position
          // ProseMirror adds 1 for the document start
          editor.commands.focus();
          editor.commands.setTextSelection(cursorPos + 1);
          useOutlineStore.getState().setPendingCursorPos(null);
        } else {
          editor.commands.focus('end');
        }
      }, 0);
    } else if (!isFocused && editorRef.current) {
      // Destroy editor when losing focus
      editorRef.current.destroy();
      editorRef.current = null;
      setEditorReady(false);
    }

    return () => {
      if (editorRef.current) {
        editorRef.current.destroy();
        editorRef.current = null;
      }
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isFocused, node.id]); // Intentionally omit node.content - editor syncs content via onUpdate

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
    setDatePickerPosition, setDatePickerMode, setShowDatePicker,
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

  // Wiki link suggestion handlers
  const handleWikiLinkSelect = useCallback((nodeId: string, displayText: string) => {
    const editor = editorRef.current;
    const range = wikiLinkRangeRef.current;
    if (!editor || !range) return;

    // Delete the [[query text and insert the wiki link
    editor
      .chain()
      .focus()
      .deleteRange(range)
      .insertWikiLink(nodeId, displayText)
      .run();

    wikiLinkActiveRef.current = false;
    wikiLinkRangeRef.current = null;
    setShowWikiLinkSuggestion(false);
    setWikiLinkRange(null);
  }, []);

  const handleWikiLinkClose = useCallback(() => {
    wikiLinkActiveRef.current = false;
    wikiLinkRangeRef.current = null;
    setShowWikiLinkSuggestion(false);
    setWikiLinkRange(null);
  }, []);

  // Hashtag suggestion handlers
  const handleHashtagSelect = useCallback((tag: string) => {
    const editor = editorRef.current;
    const range = hashtagRangeRef.current;
    if (!editor || !range) return;

    // Delete the #query text and insert the complete hashtag
    editor
      .chain()
      .focus()
      .deleteRange(range)
      .insertContent(`#${tag} `) // Insert hashtag with trailing space
      .run();

    hashtagActiveRef.current = false;
    hashtagRangeRef.current = null;
    setShowHashtagSuggestion(false);
    setHashtagRange(null);
  }, []);

  const handleHashtagClose = useCallback(() => {
    hashtagActiveRef.current = false;
    hashtagRangeRef.current = null;
    setShowHashtagSuggestion(false);
    setHashtagRange(null);
  }, []);

  // Due date suggestion handlers
  const handleDueDateSelect = useCallback((date: string) => {
    const editor = editorRef.current;
    const range = dueDateRangeRef.current;
    if (!editor || !range) return;

    // Delete the !(query text and insert the complete due date
    editor
      .chain()
      .focus()
      .deleteRange(range)
      .insertContent(`!(${date})`) // Insert due date with closing paren
      .run();

    dueDateActiveRef.current = false;
    dueDateRangeRef.current = null;
    setShowDueDateSuggestion(false);
    setDueDateRange(null);
  }, []);

  const handleDueDateClose = useCallback(() => {
    dueDateActiveRef.current = false;
    dueDateRangeRef.current = null;
    setShowDueDateSuggestion(false);
    setDueDateRange(null);
  }, []);

  // Emoji suggestion handlers
  const handleEmojiSelect = useCallback((shortcode: string, emoji: string, imageUrl?: string) => {
    const editor = editorRef.current;
    const range = emojiRangeRef.current;
    if (!editor || !range) return;

    if (imageUrl) {
      // Image-based custom emoji: insert as a customEmoji node
      editor
        .chain()
        .focus()
        .deleteRange(range)
        .insertContent({
          type: 'customEmoji',
          attrs: {
            src: imageUrl,
            alt: `:${shortcode}:`,
            shortcode: shortcode,
          },
        })
        .run();
    } else {
      // Unicode emoji or text custom emoji: insert as text
      editor
        .chain()
        .focus()
        .deleteRange(range)
        .insertContent(emoji)
        .run();
    }

    emojiActiveRef.current = false;
    emojiRangeRef.current = null;
    setShowEmojiSuggestion(false);
    setEmojiRange(null);
  }, []);

  const handleEmojiClose = useCallback(() => {
    emojiActiveRef.current = false;
    emojiRangeRef.current = null;
    setShowEmojiSuggestion(false);
    setEmojiRange(null);
  }, []);

  // Date picker handlers
  const handleDateSelect = useCallback(async (date: string | null, pickerMode: DatePickerMode) => {
    setShowDatePicker(false);
    const api = await import('../../lib/api');
    if (pickerMode === 'defer') {
      await api.updateNode(node.id, { defer_date: date || '' });
    } else if (pickerMode === 'end') {
      await api.updateNode(node.id, { date_end: date || '' });
    } else {
      await api.updateNode(node.id, { date: date || '' });
    }
    const state = await api.loadDocument();
    useOutlineStore.getState().updateFromState(state);
  }, [node.id]);

  const handleDatePickerClose = useCallback(() => {
    setShowDatePicker(false);
  }, []);

  const handleDateBadgeClick = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const rect = (e.target as HTMLElement).getBoundingClientRect();
    setDatePickerPosition({ x: rect.left, y: rect.bottom + 5 });
    setDatePickerMode('due');
    setShowDatePicker(true);
  }, []);

  const handleDeferBadgeClick = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const rect = (e.target as HTMLElement).getBoundingClientRect();
    setDatePickerPosition({ x: rect.left, y: rect.bottom + 5 });
    setDatePickerMode('defer');
    setShowDatePicker(true);
  }, []);

  // Recurrence picker handlers
  const handleRecurrenceSelect = useCallback(async (rrule: string | null, mode: RecurrenceMode) => {
    setShowRecurrencePicker(false);
    // Update node recurrence and mode via API
    const api = await import('../../lib/api');
    const changes: Record<string, string | undefined> = {
      recurrence: rrule || undefined,
    };
    // Only store recurrence_mode if it's "complete" (to preserve backward compat)
    // When clearing recurrence, also clear mode
    if (rrule == null) {
      changes.recurrence_mode = '';  // empty string clears the field
    } else {
      changes.recurrence_mode = mode === 'complete' ? 'complete' : '';
    }
    await api.updateNode(node.id, changes);
    // Reload state
    const state = await api.loadDocument();
    useOutlineStore.getState().updateFromState(state);
  }, [node.id]);

  const handleRecurrencePickerClose = useCallback(() => {
    setShowRecurrencePicker(false);
  }, []);

  const handleRecurrenceIndicatorClick = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const rect = (e.target as HTMLElement).getBoundingClientRect();
    setRecurrencePickerPosition({ x: rect.left, y: rect.bottom + 5 });
    setShowRecurrencePicker(true);
  }, []);

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
          <span className="date-badge defer" onClick={handleDeferBadgeClick} title={`Deferred until ${node.defer_date}`}>
            {'Defer: ' + formatDateRelative(node.defer_date)}
          </span>
        )}

        {/* Date badge */}
        {node.date && (
          <span className="date-badge" onClick={handleDateBadgeClick} title={node.date_end ? `${node.date} - ${node.date_end}` : node.date}>
            {formatDateRange(node.date, node.date_end)}
          </span>
        )}

        {/* Recurrence indicator */}
        {node.recurrence && (
          <span className="recurrence-indicator" onClick={handleRecurrenceIndicatorClick} title="Repeating">
            ↻
          </span>
        )}
        {isBookmarked && <span className="bookmark-indicator" title="Bookmarked">★</span>}
      </div>

      {/* Note row */}
      {(node.note || isEditingNote) && (
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
      {showWikiLinkSuggestion && (
        <WikiLinkSuggestion
          query={wikiLinkQuery}
          position={wikiLinkPosition}
          onSelect={handleWikiLinkSelect}
          onClose={handleWikiLinkClose}
        />
      )}

      {/* Hashtag suggestion popup */}
      {showHashtagSuggestion && (
        <HashtagSuggestion
          query={hashtagQuery}
          position={hashtagPosition}
          onSelect={handleHashtagSelect}
          onClose={handleHashtagClose}
          existingTags={existingTags}
        />
      )}

      {/* Due date suggestion popup */}
      {showDueDateSuggestion && (
        <DueDateSuggestion
          query={dueDateQuery}
          position={dueDatePosition}
          onSelect={handleDueDateSelect}
          onClose={handleDueDateClose}
        />
      )}

      {/* Emoji suggestion popup */}
      {showEmojiSuggestion && (
        <EmojiSuggestion
          query={emojiQuery}
          position={emojiPosition}
          onSelect={handleEmojiSelect}
          onClose={handleEmojiClose}
        />
      )}

      {/* Date picker modal */}
      {showDatePicker && (
        <DatePicker
          position={datePickerPosition}
          currentDate={node.date}
          currentDeferDate={node.defer_date}
          currentDateEnd={node.date_end}
          initialMode={datePickerMode}
          onSelect={handleDateSelect}
          onClose={handleDatePickerClose}
        />
      )}

      {/* Recurrence picker modal */}
      {showRecurrencePicker && (
        <RecurrencePicker
          position={recurrencePickerPosition}
          currentRecurrence={node.recurrence}
          currentMode={(node.recurrence_mode as RecurrenceMode) ?? 'schedule'}
          onSelect={handleRecurrenceSelect}
          onClose={handleRecurrencePickerClose}
        />
      )}
    </div>
  );
});

export default OutlineItem;
