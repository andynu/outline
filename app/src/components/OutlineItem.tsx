import React, { memo, useRef, useEffect, useCallback, useState, useMemo, DragEvent, MouseEvent as ReactMouseEvent } from 'react';
import { Editor } from '@tiptap/core';
import { DOMSerializer } from '@tiptap/pm/model';
import StarterKit from '@tiptap/starter-kit';
import type { TreeNode } from '../lib/types';
import { useOutlineStore } from '../store/outlineStore';
import { useSettingsStore } from '../store/settingsStore';
import { ContextMenu } from './ui/ContextMenu';
import { processStaticContentElement, handleStaticContentClick } from '../lib/renderStaticContent';
import DOMPurify from 'dompurify';

// TipTap extensions
import { WikiLink, createWikiLinkInputHandler } from '../lib/WikiLink';
import { Hashtag } from '../lib/Hashtag';
import { DueDate } from '../lib/DueDate';
import { AutoLink } from '../lib/AutoLink';
import { MarkdownLink } from '../lib/MarkdownLink';
import { Mention } from '../lib/Mention';

// Suggestion popups
import { WikiLinkSuggestion } from './ui/WikiLinkSuggestion';
import { HashtagSuggestion } from './ui/HashtagSuggestion';
import { DueDateSuggestion } from './ui/DueDateSuggestion';
import { DatePicker } from './ui/DatePicker';
import { RecurrencePicker } from './ui/RecurrencePicker';
import { formatDateRelative } from '../lib/dateUtils';
import { looksLikeMarkdownList, parseMarkdownList } from '../lib/markdownPaste';

interface OutlineItemProps {
  item: TreeNode;
  onNavigateToNode?: (nodeId: string) => void;
  isInFocusedSubtree?: boolean;
  onOpenBulkQuickMove?: () => void;
}

// Memoized to prevent unnecessary re-renders
export const OutlineItem = memo(function OutlineItem({
  item,
  onNavigateToNode,
  isInFocusedSubtree = false,
  onOpenBulkQuickMove
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
  const selectedIds = useOutlineStore(state => state.selectedIds);
  const toggleSelection = useOutlineStore(state => state.toggleSelection);
  const selectRange = useOutlineStore(state => state.selectRange);
  const clearSelection = useOutlineStore(state => state.clearSelection);
  const toggleSelectedCheckboxes = useOutlineStore(state => state.toggleSelectedCheckboxes);
  const completeSelectedNodes = useOutlineStore(state => state.completeSelectedNodes);
  const uncompleteSelectedNodes = useOutlineStore(state => state.uncompleteSelectedNodes);
  const convertSelectedToCheckbox = useOutlineStore(state => state.convertSelectedToCheckbox);
  const convertSelectedToBullet = useOutlineStore(state => state.convertSelectedToBullet);
  const indentSelectedNodes = useOutlineStore(state => state.indentSelectedNodes);
  const outdentSelectedNodes = useOutlineStore(state => state.outdentSelectedNodes);
  const moveSelectedToTop = useOutlineStore(state => state.moveSelectedToTop);
  const moveSelectedToBottom = useOutlineStore(state => state.moveSelectedToBottom);
  const copySelectedAsMarkdown = useOutlineStore(state => state.copySelectedAsMarkdown);
  const copySelectedAsPlainText = useOutlineStore(state => state.copySelectedAsPlainText);
  const exportSelectedToFile = useOutlineStore(state => state.exportSelectedToFile);
  const deleteSelectedNodes = useOutlineStore(state => state.deleteSelectedNodes);
  const getSelectedNodes = useOutlineStore(state => state.getSelectedNodes);
  const groupSelectedUnderNewParent = useOutlineStore(state => state.groupSelectedUnderNewParent);
  const draggedId = useOutlineStore(state => state.draggedId);
  const startDrag = useOutlineStore(state => state.startDrag);
  const endDrag = useOutlineStore(state => state.endDrag);
  const dropOnNode = useOutlineStore(state => state.dropOnNode);
  const updateNote = useOutlineStore(state => state.updateNote);
  const allNodes = useOutlineStore(state => state.nodes);

  const isFocused = focusedId === node.id;
  const isNodeSelected = selectedIds.has(node.id);
  const isDragging = draggedId === node.id;
  const editorContainerRef = useRef<HTMLDivElement>(null);
  const staticContentRef = useRef<HTMLDivElement>(null);
  const noteInputRef = useRef<HTMLTextAreaElement>(null);
  const editorRef = useRef<Editor | null>(null);
  const [editorReady, setEditorReady] = useState(false);
  const [isDragOver, setIsDragOver] = useState(false);
  const [dropPosition, setDropPosition] = useState<'before' | 'after' | 'child' | null>(null);
  const [isEditingNote, setIsEditingNote] = useState(false);
  const [showContextMenu, setShowContextMenu] = useState(false);
  const [contextMenuPosition, setContextMenuPosition] = useState({ x: 0, y: 0 });
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [datePickerPosition, setDatePickerPosition] = useState({ x: 0, y: 0 });
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

            // When wiki link, hashtag, or due date suggestion is active, let Enter/Tab/Arrow keys
            // pass through to the suggestion popup's keyboard handler
            if (wikiLinkActiveRef.current || hashtagActiveRef.current || dueDateActiveRef.current) {
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
                // At end - just create new empty sibling
                store.addSiblingAfter(nodeId);
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
              if (from === 1 && isEmpty) {
                event.preventDefault();
                store.deleteNode(nodeId);
                return true;
              }
            }

            if (event.key === 'Delete' && !mod && !event.shiftKey) {
              const { to } = view.state.selection;
              const docSize = view.state.doc.content.size;
              const isEmpty = view.state.doc.textContent.length === 0;

              if (isEmpty) {
                // Empty node - delete it
                event.preventDefault();
                store.deleteNode(nodeId);
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

            // Swap position with Shift+Arrow (move item up/down in list)
            if (event.key === 'ArrowUp' && event.shiftKey && !mod) {
              event.preventDefault();
              store.swapWithPrevious(nodeId);
              return true;
            }

            if (event.key === 'ArrowDown' && event.shiftKey && !mod) {
              event.preventDefault();
              store.swapWithNext(nodeId);
              return true;
            }

            // Swap position with Ctrl+Arrow (alternative shortcut)
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
            // Ctrl+D : open date picker
            if (event.key === 'd' && mod && !event.shiftKey) {
              event.preventDefault();
              // Get position from the editor
              const rect = editorContainerRef.current?.getBoundingClientRect();
              if (rect) {
                setDatePickerPosition({ x: rect.left, y: rect.bottom + 5 });
              }
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
              const currentState = useOutlineStore.getState();
              // If multi-selection, let App.tsx handle it to avoid double-firing
              if (currentState.selectedIds.size > 0) {
                return false; // Don't handle, let it bubble to App.tsx
              }
              // Single item - toggle just this node
              event.preventDefault();
              store.toggleCheckbox(nodeId);
              return true;
            }

            if (event.key.toLowerCase() === 'x' && mod && event.shiftKey) {
              event.preventDefault();
              store.toggleNodeType(nodeId);
              return true;
            }

            // === EXPORT SELECTION ===
            // Ctrl+Shift+E : export selection/focused node to markdown in clipboard
            if (event.key.toLowerCase() === 'e' && mod && event.shiftKey) {
              event.preventDefault();
              useOutlineStore.getState().exportSelection();
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

              // If it's a checkbox, convert this node
              if (singleItem.nodeType === 'checkbox') {
                const store = useOutlineStore.getState();
                if (node.node_type !== 'checkbox') {
                  store.toggleNodeType(nodeId);
                }
                if (singleItem.isChecked && !node.is_checked) {
                  store.toggleCheckbox(nodeId);
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

      // Focus the editor
      setTimeout(() => {
        editor.commands.focus('end');
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

  // === Drag and Drop handlers ===

  const handleDragStart = useCallback((e: DragEvent<HTMLSpanElement>) => {
    e.stopPropagation();
    if (e.dataTransfer) {
      e.dataTransfer.effectAllowed = 'move';
      // Use custom MIME type so TipTap won't try to insert it as text
      e.dataTransfer.setData('application/x-outline-node', node.id);
    }
    startDrag(node.id);
  }, [node.id, startDrag]);

  const handleDragEnd = useCallback((e: DragEvent<HTMLSpanElement>) => {
    e.stopPropagation();
    endDrag();
    setIsDragOver(false);
    setDropPosition(null);
  }, [endDrag]);

  const handleDragOver = useCallback((e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();

    // Don't allow dropping on self
    if (draggedId === node.id) {
      return;
    }

    setIsDragOver(true);

    // Determine drop position based on mouse Y position
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    const y = e.clientY - rect.top;
    const height = rect.height;

    if (y < height * 0.25) {
      setDropPosition('before');
    } else if (y > height * 0.75) {
      setDropPosition('after');
    } else {
      setDropPosition('child');
    }

    if (e.dataTransfer) {
      e.dataTransfer.dropEffect = 'move';
    }
  }, [draggedId, node.id]);

  const handleDragLeave = useCallback((e: DragEvent<HTMLDivElement>) => {
    e.stopPropagation();
    setIsDragOver(false);
    setDropPosition(null);
  }, []);

  const handleDrop = useCallback((e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();

    if (draggedId && draggedId !== node.id) {
      if (dropPosition === 'child') {
        dropOnNode(node.id, true);
      } else {
        dropOnNode(node.id, false);
      }
    }

    setIsDragOver(false);
    setDropPosition(null);
  }, [draggedId, node.id, dropPosition, dropOnNode]);

  // Plain text version of content (for clipboard, search, etc.)
  const plainTextContent = node.content?.replace(/<[^>]*>/g, '') || '';

  // === Note editing handlers ===

  const handleNoteInput = useCallback((e: React.ChangeEvent<HTMLTextAreaElement>) => {
    updateNote(node.id, e.target.value);
  }, [node.id, updateNote]);

  const handleNoteKeydown = useCallback((e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    // Escape: close note editor
    if (e.key === 'Escape') {
      e.preventDefault();
      setIsEditingNote(false);
      // Re-focus the main editor
      editorRef.current?.commands.focus('end');
    }
    // Shift+Enter in note: also close and return to main editor
    if (e.key === 'Enter' && e.shiftKey) {
      e.preventDefault();
      setIsEditingNote(false);
      editorRef.current?.commands.focus('end');
    }
  }, []);

  const handleNoteBlur = useCallback(() => {
    // Close note editing when focus leaves (unless note is empty - then also clear it)
    if (!node.note?.trim()) {
      setIsEditingNote(false);
    }
  }, [node.note]);

  // URL pattern for linkifying notes
  const NOTE_URL_PATTERN = /(?:https?:\/\/|ftp:\/\/|www\.)[^\s<>[\]{}|\\^`"']+/g;

  /** Convert URLs in text to clickable links, escaping HTML */
  const linkifyNote = useCallback((text: string): string => {
    if (!text) return '';
    // Escape HTML first
    let result = text
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
    // Replace URLs with links
    result = result.replace(NOTE_URL_PATTERN, (url) => {
      const href = url.startsWith('www.') ? `https://${url}` : url;
      return `<a href="${href}" class="note-link" target="_blank" rel="noopener noreferrer">${url}</a>`;
    });
    // Convert newlines to <br>
    result = result.replace(/\n/g, '<br>');
    return result;
  }, []);

  const handleNoteClick = useCallback((e: React.MouseEvent) => {
    const target = e.target as HTMLElement;
    // If clicking a link, open it externally
    if (target.tagName === 'A' && target.classList.contains('note-link')) {
      e.preventDefault();
      e.stopPropagation();
      const href = target.getAttribute('href');
      if (href) {
        window.open(href, '_blank');
      }
      return;
    }
    // Otherwise enter edit mode
    setFocusedId(node.id);
    setIsEditingNote(true);
    setTimeout(() => noteInputRef.current?.focus(), 0);
  }, [node.id, setFocusedId]);

  // === Context Menu ===

  const handleContextMenu = useCallback((e: ReactMouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
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

  const contextMenuItems = useMemo(() => [
    {
      label: node.is_checked ? 'Mark Incomplete' : 'Mark Complete',
      action: () => toggleCheckbox(node.id),
      shortcut: 'Ctrl+Enter',
    },
    {
      label: node.node_type === 'checkbox' ? 'Convert to Bullet' : 'Convert to Checkbox',
      action: () => toggleNodeType(node.id),
      shortcut: 'Ctrl+Shift+X',
    },
    { separator: true as const },
    {
      label: 'Copy',
      action: copyToClipboard,
      shortcut: 'Ctrl+C',
    },
    {
      label: 'Web Search',
      action: webSearch,
      shortcut: 'Ctrl+Shift+G',
      disabled: !plainTextContent.trim(),
    },
    {
      label: 'Export to Markdown',
      action: () => useOutlineStore.getState().exportSelection(),
      shortcut: 'Ctrl+Shift+E',
    },
    { separator: true as const },
    {
      label: node.collapsed ? 'Expand' : 'Collapse',
      action: () => toggleCollapse(node.id),
      shortcut: 'Ctrl+.',
      disabled: !hasChildren,
    },
    { separator: true as const },
    {
      label: 'Zoom In',
      action: () => zoomTo(node.id),
      shortcut: 'Ctrl+]',
      disabled: !hasChildren,
    },
    {
      label: 'Zoom Out',
      action: () => zoomToParent(),
      shortcut: 'Ctrl+[',
    },
    { separator: true as const },
    {
      label: 'Indent',
      action: () => indentNode(node.id),
      shortcut: 'Tab',
    },
    {
      label: 'Outdent',
      action: () => outdentNode(node.id),
      shortcut: 'Shift+Tab',
    },
    { separator: true as const },
    {
      label: 'Delete',
      action: () => deleteNode(node.id),
      shortcut: 'Ctrl+Shift+Backspace',
    },
  ], [node.id, node.is_checked, node.node_type, node.collapsed, hasChildren, plainTextContent, toggleCheckbox, toggleNodeType, toggleCollapse, zoomTo, indentNode, outdentNode, deleteNode, copyToClipboard, webSearch]);

  // Multi-selection context menu (shown when multiple items are selected)
  const bulkContextMenuItems = useMemo(() => {
    const selected = getSelectedNodes();
    const selectionCount = selected.length;
    const hasAnyUnchecked = selected.some(n => !n.is_checked || n.node_type !== 'checkbox');
    const hasAnyChecked = selected.some(n => n.is_checked && n.node_type === 'checkbox');
    const hasAnyBullet = selected.some(n => n.node_type === 'bullet');
    const hasAnyCheckbox = selected.some(n => n.node_type === 'checkbox');

    return [
      {
        label: `Complete all (${selectionCount})`,
        action: completeSelectedNodes,
        shortcut: 'Ctrl+Enter',
        disabled: !hasAnyUnchecked,
      },
      {
        label: `Uncomplete all (${selectionCount})`,
        action: uncompleteSelectedNodes,
        disabled: !hasAnyChecked,
      },
      { separator: true as const },
      {
        label: 'Convert to checkbox',
        action: convertSelectedToCheckbox,
        disabled: !hasAnyBullet,
      },
      {
        label: 'Convert to bullet',
        action: convertSelectedToBullet,
        disabled: !hasAnyCheckbox,
      },
      { separator: true as const },
      {
        label: 'Move to...',
        action: () => onOpenBulkQuickMove?.(),
        shortcut: 'Ctrl+Shift+M',
        disabled: !onOpenBulkQuickMove,
      },
      {
        label: 'Move to top',
        action: moveSelectedToTop,
      },
      {
        label: 'Move to bottom',
        action: moveSelectedToBottom,
      },
      {
        label: 'Group under new item',
        action: groupSelectedUnderNewParent,
      },
      { separator: true as const },
      {
        label: 'Indent',
        action: indentSelectedNodes,
        shortcut: 'Tab',
      },
      {
        label: 'Outdent',
        action: outdentSelectedNodes,
        shortcut: 'Shift+Tab',
      },
      { separator: true as const },
      {
        label: 'Copy as Markdown',
        action: copySelectedAsMarkdown,
        shortcut: 'Ctrl+Shift+C',
      },
      {
        label: 'Copy as Plain Text',
        action: copySelectedAsPlainText,
      },
      {
        label: 'Export to file...',
        action: exportSelectedToFile,
      },
      { separator: true as const },
      {
        label: `Delete selected (${selectionCount})`,
        action: deleteSelectedNodes,
        shortcut: 'Ctrl+Shift+Backspace',
      },
    ];
  }, [selectedIds, getSelectedNodes, completeSelectedNodes, uncompleteSelectedNodes, convertSelectedToCheckbox, convertSelectedToBullet, moveSelectedToTop, moveSelectedToBottom, groupSelectedUnderNewParent, copySelectedAsMarkdown, copySelectedAsPlainText, exportSelectedToFile, indentSelectedNodes, outdentSelectedNodes, deleteSelectedNodes, onOpenBulkQuickMove]);

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

  // Date picker handlers
  const handleDateSelect = useCallback(async (date: string | null) => {
    setShowDatePicker(false);
    // Update node date via API
    const api = await import('../lib/api');
    await api.updateNode(node.id, { date: date || undefined });
    // Reload state
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
    setShowDatePicker(true);
  }, []);

  // Recurrence picker handlers
  const handleRecurrenceSelect = useCallback(async (rrule: string | null) => {
    setShowRecurrencePicker(false);
    // Update node recurrence via API
    const api = await import('../lib/api');
    await api.updateNode(node.id, { recurrence: rrule || undefined });
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

  // Build className for the item
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
  ].filter(Boolean).join(' ');

  return (
    <div
      className={itemClasses}
      style={{ marginLeft: depth * 24 }}
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

        {/* Drag handle / bullet / checkbox */}
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

        {/* Date badge */}
        {node.date && (
          <span className="date-badge" onClick={handleDateBadgeClick}>
            {formatDateRelative(node.date)}
          </span>
        )}

        {/* Recurrence indicator */}
        {node.recurrence && (
          <span className="recurrence-indicator" onClick={handleRecurrenceIndicatorClick} title="Repeating">
            ↻
          </span>
        )}
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
              dangerouslySetInnerHTML={{ __html: linkifyNote(node.note || '') }}
            />
          )}
        </div>
      )}

      {/* Recursive children */}
      {hasChildren && !node.collapsed && (
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

      {/* Date picker modal */}
      {showDatePicker && (
        <DatePicker
          position={datePickerPosition}
          currentDate={node.date}
          onSelect={handleDateSelect}
          onClose={handleDatePickerClose}
        />
      )}

      {/* Recurrence picker modal */}
      {showRecurrencePicker && (
        <RecurrencePicker
          position={recurrencePickerPosition}
          currentRecurrence={node.recurrence}
          onSelect={handleRecurrenceSelect}
          onClose={handleRecurrencePickerClose}
        />
      )}
    </div>
  );
});

export default OutlineItem;
