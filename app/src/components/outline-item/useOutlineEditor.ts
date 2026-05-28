import React, { useState, useEffect } from 'react';
import { Editor } from '@tiptap/core';
import { DOMSerializer } from '@tiptap/pm/model';
import StarterKit from '@tiptap/starter-kit';
import { WikiLink } from '../../lib/WikiLink';
import { Hashtag } from '../../lib/Hashtag';
import { DueDate } from '../../lib/DueDate';
import { AutoLink } from '../../lib/AutoLink';
import { MarkdownLink } from '../../lib/MarkdownLink';
import { Mention } from '../../lib/Mention';
import { EmojiShortcode } from '../../lib/EmojiShortcode';
import { CustomEmojiNode } from '../../lib/CustomEmojiNode';
import { looksLikeMarkdownList, parseMarkdownList } from '../../lib/markdownPaste';
import { useOutlineStore } from '../../store/outlineStore';
import { useSelectionStore } from '../../store/selectionStore';
import { useSettingsStore } from '../../store/settingsStore';
import type { SuggestionControls } from './useSuggestions';

export interface StoreActions {
  addSiblingAfter: (nodeId: string) => Promise<string | null>;
  deleteNode: (nodeId: string, focusDirection?: 'previous' | 'next') => Promise<string | null>;
  updateContent: (nodeId: string, content: string) => Promise<void>;
  toggleCollapse: (nodeId: string) => void;
  toggleCheckbox: (nodeId: string) => void;
  toggleNodeType: (nodeId: string) => void;
  setHeadingLevel: (nodeId: string, level: number) => void;
  clearHeading: (nodeId: string) => void;
  indentNode: (nodeId: string) => void;
  outdentNode: (nodeId: string) => void;
  swapWithPrevious: (nodeId: string) => void;
  swapWithNext: (nodeId: string) => void;
  moveToPrevious: () => void;
  moveToNext: () => void;
  moveToFirst: () => void;
  moveToLast: () => void;
  setFocusedId: (id: string | null) => void;
}

interface UseOutlineEditorParams {
  isFocused: boolean;
  nodeId: string;
  nodeContent: string | undefined;
  nodeType: string | undefined;
  nodeIsChecked: boolean | undefined;
  editorRef: React.RefObject<Editor | null>;
  editorContainerRef: React.RefObject<HTMLDivElement | null>;
  storeRef: React.RefObject<StoreActions>;
  suggestionsControlsRef: React.RefObject<SuggestionControls>;
  setIsEditingNote: (v: boolean) => void;
  noteInputRef: React.RefObject<HTMLTextAreaElement | null>;
  zoomToParent: () => void;
  onNavigateToNode?: (nodeId: string) => void;
}

export function useOutlineEditor({
  isFocused,
  nodeId,
  nodeContent,
  nodeType,
  nodeIsChecked,
  editorRef,
  editorContainerRef,
  storeRef,
  suggestionsControlsRef,
  setIsEditingNote,
  noteInputRef,
  zoomToParent,
  onNavigateToNode,
}: UseOutlineEditorParams) {
  const [editorReady, setEditorReady] = useState(false);

  // Create or destroy editor based on focus state
  useEffect(() => {
    if (isFocused && editorContainerRef.current && !editorRef.current) {
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
        content: nodeContent || '',
        editorProps: {
          attributes: {
            class: 'outline-editor',
          },
          handleTextInput: (view, from, to, text) => {
            const state = view.state;
            const prevChar = from > 0 ? state.doc.textBetween(from - 1, from) : '';
            const sc = suggestionsControlsRef.current;

            // Detect [[ trigger for wiki links
            if (text === '[' && prevChar === '[') {
              const coords = view.coordsAtPos(from);
              sc.wikiLink.activeRef.current = true;
              sc.wikiLink.rangeRef.current = { from: from - 1, to: from + 1 };
              sc.wikiLink.setShow(true);
              sc.wikiLink.setQuery('');
              sc.wikiLink.setRange({ from: from - 1, to: from + 1 });
              sc.wikiLink.setPosition({ x: coords.left, y: coords.bottom + 5 });
              return false;
            }

            // If wiki link suggestion is active, update query
            if (sc.wikiLink.activeRef.current && sc.wikiLink.rangeRef.current) {
              const range = sc.wikiLink.rangeRef.current;
              const queryStart = range.from + 2;
              const currentQuery = state.doc.textBetween(queryStart, from) + text;

              // Check for ]] to close
              if (text === ']' && currentQuery.endsWith(']')) {
                sc.wikiLink.activeRef.current = false;
                sc.wikiLink.rangeRef.current = null;
                sc.wikiLink.setShow(false);
                sc.wikiLink.setRange(null);
                return false;
              }

              const newRange = { from: range.from, to: from + text.length + 1 };
              sc.wikiLink.rangeRef.current = newRange;
              sc.wikiLink.setQuery(currentQuery);
              sc.wikiLink.setRange(newRange);
              return false;
            }

            // Detect # trigger for hashtags (at start or after whitespace)
            if (text === '#' && (prevChar === '' || prevChar === ' ' || prevChar === '\t' || from === 1)) {
              const coords = view.coordsAtPos(from);
              sc.hashtag.activeRef.current = true;
              sc.hashtag.rangeRef.current = { from: from, to: from + 1 };
              sc.hashtag.setShow(true);
              sc.hashtag.setQuery('');
              sc.hashtag.setRange({ from: from, to: from + 1 });
              sc.hashtag.setPosition({ x: coords.left, y: coords.bottom + 5 });
              return false;
            }

            // If hashtag suggestion is active, update query
            if (sc.hashtag.activeRef.current && sc.hashtag.rangeRef.current) {
              const range = sc.hashtag.rangeRef.current;
              const queryStart = range.from + 1; // After the #
              const currentQuery = state.doc.textBetween(queryStart, from) + text;

              // Check for space or special char to close
              if (text === ' ' || text === '\t' || text === '\n') {
                sc.hashtag.activeRef.current = false;
                sc.hashtag.rangeRef.current = null;
                sc.hashtag.setShow(false);
                sc.hashtag.setRange(null);
                return false;
              }

              const newRange = { from: range.from, to: from + text.length + 1 };
              sc.hashtag.rangeRef.current = newRange;
              sc.hashtag.setQuery(currentQuery);
              sc.hashtag.setRange(newRange);
              return false;
            }

            // Detect !( trigger for due dates
            if (text === '(' && prevChar === '!') {
              const coords = view.coordsAtPos(from);
              sc.dueDate.activeRef.current = true;
              sc.dueDate.rangeRef.current = { from: from - 1, to: from + 1 };
              sc.dueDate.setShow(true);
              sc.dueDate.setQuery('');
              sc.dueDate.setRange({ from: from - 1, to: from + 1 });
              sc.dueDate.setPosition({ x: coords.left, y: coords.bottom + 5 });
              return false;
            }

            // If due date suggestion is active, update query
            if (sc.dueDate.activeRef.current && sc.dueDate.rangeRef.current) {
              const range = sc.dueDate.rangeRef.current;
              const queryStart = range.from + 2; // After the !(
              const currentQuery = state.doc.textBetween(queryStart, from) + text;

              // Check for ) to close and complete
              if (text === ')') {
                sc.dueDate.activeRef.current = false;
                sc.dueDate.rangeRef.current = null;
                sc.dueDate.setShow(false);
                sc.dueDate.setRange(null);
                return false;
              }

              const newRange = { from: range.from, to: from + text.length + 1 };
              sc.dueDate.rangeRef.current = newRange;
              sc.dueDate.setQuery(currentQuery);
              sc.dueDate.setRange(newRange);
              return false;
            }

            // Detect : trigger for emoji shortcodes (at start or after whitespace)
            if (text === ':' && !sc.emoji.activeRef.current &&
                (prevChar === '' || prevChar === ' ' || prevChar === '\t' || from === 1)) {
              const coords = view.coordsAtPos(from);
              sc.emoji.activeRef.current = true;
              sc.emoji.rangeRef.current = { from: from, to: from + 1 };
              sc.emoji.setShow(true);
              sc.emoji.setQuery('');
              sc.emoji.setRange({ from: from, to: from + 1 });
              sc.emoji.setPosition({ x: coords.left, y: coords.bottom + 5 });
              return false;
            }

            // If emoji suggestion is active, update query
            if (sc.emoji.activeRef.current && sc.emoji.rangeRef.current) {
              const range = sc.emoji.rangeRef.current;
              const queryStart = range.from + 1; // After the :
              const currentQuery = state.doc.textBetween(queryStart, from) + text;

              // Close on space, closing colon, or invalid characters
              if (text === ' ' || text === '\t' || text === '\n' || text === ':') {
                sc.emoji.activeRef.current = false;
                sc.emoji.rangeRef.current = null;
                sc.emoji.setShow(false);
                sc.emoji.setRange(null);
                return false;
              }

              const newRange = { from: range.from, to: from + text.length + 1 };
              sc.emoji.rangeRef.current = newRange;
              sc.emoji.setQuery(currentQuery);
              sc.emoji.setRange(newRange);
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
            const sc = suggestionsControlsRef.current;

            // When wiki link, hashtag, due date, or emoji suggestion is active, let Enter/Tab/Arrow keys
            // pass through to the suggestion popup's keyboard handler
            if (sc.wikiLink.activeRef.current || sc.hashtag.activeRef.current || sc.dueDate.activeRef.current || sc.emoji.activeRef.current) {
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
                  // Merge up into the previous visible row. Focus moves there,
                  // so its editor remounts with the merged content. (otl-7yri)
                  event.preventDefault();
                  useOutlineStore.getState().mergeWithPrevious(nodeId);
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
                // At end - merge the next visible row up into this node. Focus
                // stays here, so the focused editor won't auto-sync the longer
                // merged content (index.tsx sync is gated on !isFocused) —
                // reconcile the live editor once the async merge resolves. (otl-7yri)
                event.preventDefault();
                useOutlineStore.getState().mergeWithNext(nodeId).then(res => {
                  const ed = editorRef.current;
                  if (res && ed && !ed.isDestroyed) {
                    ed.commands.setContent(res.mergedContent, false);
                    ed.commands.setTextSelection(res.cursorPos + 1);
                  }
                });
                return true;
              }
            }

            // === NAVIGATION ===
            // Only cross to the adjacent item when the caret is on the first/last
            // visual line. Otherwise let ProseMirror move the caret within a
            // wrapped, multi-line item. (otl-fspy)
            if (event.key === 'ArrowUp' && !mod && !event.shiftKey) {
              if (view.endOfTextblock('up')) {
                event.preventDefault();
                store.moveToPrevious();
                return true;
              }
              return false;
            }

            if (event.key === 'ArrowDown' && !mod && !event.shiftKey) {
              if (view.endOfTextblock('down')) {
                event.preventDefault();
                store.moveToNext();
                return true;
              }
              return false;
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
              // stopPropagation prevents the window-level handler in App.tsx
              // (toggleFocusedCollapse) from firing and immediately undoing this toggle.
              event.preventDefault();
              event.stopPropagation();
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
                sc.datePicker.setPosition({ x: rect.left, y: rect.bottom + 5 });
              }
              sc.datePicker.setMode('due');
              sc.datePicker.setShow(true);
              return true;
            }

            // Ctrl+Shift+D : open date picker (defer/start date)
            if ((event.key === 'D' || event.key === 'd') && mod && event.shiftKey) {
              event.preventDefault();
              const rect = editorContainerRef.current?.getBoundingClientRect();
              if (rect) {
                sc.datePicker.setPosition({ x: rect.left, y: rect.bottom + 5 });
              }
              sc.datePicker.setMode('defer');
              sc.datePicker.setShow(true);
              return true;
            }

            // Ctrl+R : open recurrence picker
            if (event.key === 'r' && mod && !event.shiftKey) {
              event.preventDefault();
              const rect = editorContainerRef.current?.getBoundingClientRect();
              if (rect) {
                sc.recurrencePicker.setPosition({ x: rect.left, y: rect.bottom + 5 });
              }
              sc.recurrencePicker.setShow(true);
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
            if (sc.wikiLink.activeRef.current) {
              if (event.key === 'Escape') {
                event.preventDefault();
                sc.wikiLink.activeRef.current = false;
                sc.wikiLink.rangeRef.current = null;
                sc.wikiLink.setShow(false);
                sc.wikiLink.setRange(null);
                return true;
              }
              if (event.key === 'Backspace' && sc.wikiLink.rangeRef.current) {
                const { from } = view.state.selection;
                // If backspacing to before start of trigger, close suggestion
                if (from <= sc.wikiLink.rangeRef.current.from + 2) {
                  sc.wikiLink.activeRef.current = false;
                  sc.wikiLink.rangeRef.current = null;
                  sc.wikiLink.setShow(false);
                  sc.wikiLink.setRange(null);
                }
              }
            }

            // === HASHTAG SUGGESTION HANDLING ===
            if (sc.hashtag.activeRef.current) {
              if (event.key === 'Escape') {
                event.preventDefault();
                sc.hashtag.activeRef.current = false;
                sc.hashtag.rangeRef.current = null;
                sc.hashtag.setShow(false);
                sc.hashtag.setRange(null);
                return true;
              }
              if (event.key === 'Backspace' && sc.hashtag.rangeRef.current) {
                const { from } = view.state.selection;
                // If backspacing to before start of trigger, close suggestion
                if (from <= sc.hashtag.rangeRef.current.from + 1) {
                  sc.hashtag.activeRef.current = false;
                  sc.hashtag.rangeRef.current = null;
                  sc.hashtag.setShow(false);
                  sc.hashtag.setRange(null);
                }
              }
            }

            // === DUE DATE SUGGESTION HANDLING ===
            if (sc.dueDate.activeRef.current) {
              if (event.key === 'Escape') {
                event.preventDefault();
                sc.dueDate.activeRef.current = false;
                sc.dueDate.rangeRef.current = null;
                sc.dueDate.setShow(false);
                sc.dueDate.setRange(null);
                return true;
              }
              if (event.key === 'Backspace' && sc.dueDate.rangeRef.current) {
                const { from } = view.state.selection;
                // If backspacing to before start of trigger !( , close suggestion
                if (from <= sc.dueDate.rangeRef.current.from + 2) {
                  sc.dueDate.activeRef.current = false;
                  sc.dueDate.rangeRef.current = null;
                  sc.dueDate.setShow(false);
                  sc.dueDate.setRange(null);
                }
              }
            }

            // === EMOJI SUGGESTION HANDLING ===
            if (sc.emoji.activeRef.current) {
              if (event.key === 'Escape') {
                event.preventDefault();
                sc.emoji.activeRef.current = false;
                sc.emoji.rangeRef.current = null;
                sc.emoji.setShow(false);
                sc.emoji.setRange(null);
                return true;
              }
              if (event.key === 'Backspace' && sc.emoji.rangeRef.current) {
                const { from } = view.state.selection;
                // If backspacing to before start of trigger, close suggestion
                if (from <= sc.emoji.rangeRef.current.from + 1) {
                  sc.emoji.activeRef.current = false;
                  sc.emoji.rangeRef.current = null;
                  sc.emoji.setShow(false);
                  sc.emoji.setRange(null);
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
                if (nodeType !== 'checkbox') {
                  store.toggleNodeType(nodeId);
                }
                if (singleItem.isChecked && !nodeIsChecked) {
                  store.toggleCheckbox(nodeId);
                }
              } else if (singleItem.nodeType === 'numbered') {
                const store = useOutlineStore.getState();
                if (nodeType !== 'numbered') {
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
            if (firstItem.nodeType === 'checkbox' && nodeType !== 'checkbox') {
              store.toggleNodeType(nodeId);
              if (firstItem.isChecked) {
                store.toggleCheckbox(nodeId);
              }
            } else if (firstItem.nodeType === 'numbered' && nodeType !== 'numbered') {
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
  }, [isFocused, nodeId]); // Intentionally omit node.content - editor syncs content via onUpdate

  return { editorReady };
}
