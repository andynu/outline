import React, { memo, useRef, useEffect, useCallback, useState } from 'react';
import { Editor } from '@tiptap/core';
import StarterKit from '@tiptap/starter-kit';
import type { TreeNode } from '../lib/types';
import { useOutlineStore } from '../store/outlineStore';

// TipTap extensions
import { WikiLink, createWikiLinkInputHandler } from '../lib/WikiLink';
import { Hashtag } from '../lib/Hashtag';
import { DueDate } from '../lib/DueDate';
import { AutoLink } from '../lib/AutoLink';
import { MarkdownLink } from '../lib/MarkdownLink';
import { Mention } from '../lib/Mention';

interface OutlineItemProps {
  item: TreeNode;
  onNavigateToNode?: (nodeId: string) => void;
  isInFocusedSubtree?: boolean;
}

// Memoized to prevent unnecessary re-renders
export const OutlineItem = memo(function OutlineItem({
  item,
  onNavigateToNode,
  isInFocusedSubtree = false
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

  const isFocused = focusedId === node.id;
  const editorContainerRef = useRef<HTMLDivElement>(null);
  const editorRef = useRef<Editor | null>(null);
  const [editorReady, setEditorReady] = useState(false);

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
              // TODO: Implement hashtag search/filter
              console.log('Hashtag clicked:', tag);
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
              // TODO: Implement mention handling
              console.log('Mention clicked:', mention);
            },
          }),
        ],
        content: node.content || '',
        editorProps: {
          attributes: {
            class: 'outline-editor',
          },
          handleKeyDown: (view, event) => {
            const mod = event.ctrlKey || event.metaKey;
            const store = storeRef.current;

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

            // === EDITING ===
            if (event.key === 'Enter' && !mod && !event.shiftKey) {
              event.preventDefault();
              store.addSiblingAfter(nodeId);
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
              const isEmpty = view.state.doc.textContent.length === 0;
              if (isEmpty) {
                event.preventDefault();
                store.deleteNode(nodeId);
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

            if (event.key === 'ArrowUp' && (event.shiftKey || mod)) {
              event.preventDefault();
              store.swapWithPrevious(nodeId);
              return true;
            }

            if (event.key === 'ArrowDown' && (event.shiftKey || mod)) {
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

            // === COMPLETION ===
            if (event.key === 'Enter' && mod && !event.shiftKey) {
              event.preventDefault();
              store.toggleCheckbox(nodeId);
              return true;
            }

            if (event.key.toLowerCase() === 'x' && mod && event.shiftKey) {
              event.preventDefault();
              store.toggleNodeType(nodeId);
              return true;
            }

            return false;
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

  const handleCollapseClick = useCallback(() => {
    toggleCollapse(node.id);
  }, [node.id, toggleCollapse]);

  const handleBulletDblClick = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setFocusedId(node.id);
  }, [node.id, setFocusedId]);

  const handleCheckboxClick = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    toggleCheckbox(node.id);
  }, [node.id, toggleCheckbox]);

  const handleRowClick = useCallback((e: React.MouseEvent) => {
    const target = e.target as HTMLElement;
    if (target.closest('.outline-editor') || target.closest('.drag-handle')) {
      return;
    }
    setFocusedId(node.id);
  }, [node.id, setFocusedId]);

  const handleStaticClick = useCallback(() => {
    setFocusedId(node.id);
  }, [node.id, setFocusedId]);

  // Strip HTML tags for static display
  const staticContent = node.content?.replace(/<[^>]*>/g, '') || '\u00A0';

  return (
    <div
      className={`outline-item ${isFocused ? 'focused' : ''} ${node.is_checked ? 'checked' : ''}`}
      style={{ marginLeft: depth * 24 }}
    >
      <div className="item-row" onClick={handleRowClick}>
        {/* Drag handle / bullet / checkbox */}
        <span className="drag-handle">
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
            <div ref={editorContainerRef} className="editor-container"></div>
          ) : (
            <div className="static-content" onClick={handleStaticClick}>
              <p>{staticContent}</p>
            </div>
          )}
        </div>
      </div>

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
              />
            ))}
          </div>
        </div>
      )}
    </div>
  );
});

export default OutlineItem;
