/**
 * ZoomedLeafNoteEditor - Inline note editor shown when zoomed into a leaf node.
 *
 * When a user zooms into a node that has no children, the normal tree view
 * would show nothing. Instead, this component renders a prominent note editor
 * for that node, providing a natural long-form writing space.
 *
 * Unlike the modal NoteEditor, this is embedded inline in the content area
 * (breadcrumbs are already visible above). It always shows regardless of the
 * global noteDisplayMode setting.
 */
import React, { useEffect, useRef, useCallback } from 'react';
import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import DOMPurify from 'dompurify';
import { useOutlineStore } from '../store/outlineStore';
import { WikiLink } from '../lib/WikiLink';
import { Hashtag } from '../lib/Hashtag';
import { DueDate } from '../lib/DueDate';
import { AutoLink } from '../lib/AutoLink';
import { MarkdownLink } from '../lib/MarkdownLink';
import { CustomEmojiNode } from '../lib/CustomEmojiNode';
import { stripHtml } from '../lib/utils';

interface ZoomedLeafNoteEditorProps {
  nodeId: string;
  onNavigateToNode?: (nodeId: string) => void;
}

export const ZoomedLeafNoteEditor = React.memo(function ZoomedLeafNoteEditor({
  nodeId,
  onNavigateToNode,
}: ZoomedLeafNoteEditorProps) {
  const node = useOutlineStore(state => state.getNode(nodeId));
  const updateNote = useOutlineStore(state => state.updateNote);
  const setFilterQuery = useOutlineStore(state => state.setFilterQuery);

  const initialNoteRef = useRef(node?.note || '');

  // Debounced save
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const debouncedSave = useCallback((html: string) => {
    if (saveTimerRef.current) {
      clearTimeout(saveTimerRef.current);
    }
    saveTimerRef.current = setTimeout(() => {
      const sanitized = DOMPurify.sanitize(html);
      if (sanitized === '<p></p>' || sanitized === '<p><br></p>') {
        updateNote(nodeId, '');
      } else {
        updateNote(nodeId, sanitized);
      }
    }, 150);
  }, [nodeId, updateNote]);

  // Convert stored note to HTML for TipTap
  const noteToHtml = useCallback((text: string): string => {
    if (!text) return '<p></p>';
    if (/<(?:p|h[1-3]|ul|ol|li|blockquote|pre|hr)\b/i.test(text)) {
      return DOMPurify.sanitize(text);
    }
    const lines = text.split('\n');
    const raw = lines.map(line => {
      const escaped = line
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;');
      return `<p>${escaped || '<br>'}</p>`;
    }).join('');
    return DOMPurify.sanitize(raw);
  }, []);

  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        heading: { levels: [1, 2, 3] },
        bulletList: {},
        orderedList: {},
        blockquote: {},
        codeBlock: {},
        horizontalRule: {},
        hardBreak: {},
      }),
      WikiLink.configure({
        onNavigate: (targetNodeId: string) => {
          if (onNavigateToNode) {
            onNavigateToNode(targetNodeId);
          }
        },
      }),
      Hashtag.configure({
        onHashtagClick: (tag: string) => {
          setFilterQuery(`#${tag}`);
        },
      }),
      DueDate.configure({
        onDueDateClick: (_date: string) => {
          // TODO: date picker integration
        },
      }),
      AutoLink.configure({
        openOnClick: true,
      }),
      MarkdownLink.configure({
        openOnClick: true,
      }),
      CustomEmojiNode,
    ],
    content: noteToHtml(initialNoteRef.current),
    editorProps: {
      attributes: {
        class: 'note-editor-content',
      },
    },
    onUpdate: ({ editor: ed }) => {
      debouncedSave(ed.getHTML());
    },
  });

  // Focus editor on mount
  useEffect(() => {
    if (editor) {
      setTimeout(() => {
        editor.commands.focus('end');
      }, 50);
    }
  }, [editor]);

  // Flush pending save and cleanup editor on unmount
  useEffect(() => {
    return () => {
      if (saveTimerRef.current) {
        clearTimeout(saveTimerRef.current);
        if (editor && !editor.isDestroyed) {
          const html = editor.getHTML();
          const sanitized = DOMPurify.sanitize(html);
          if (sanitized === '<p></p>' || sanitized === '<p><br></p>') {
            updateNote(nodeId, '');
          } else {
            updateNote(nodeId, sanitized);
          }
        }
      }
      editor?.destroy();
    };
  }, [editor, nodeId, updateNote]);

  if (!node) {
    return null;
  }

  const nodeTitle = stripHtml(node.content || '') || 'Untitled';
  // Sanitize content for safe rendering of the title with formatting
  const sanitizedTitle = DOMPurify.sanitize(node.content || 'Untitled');

  return (
    <div className="zoomed-leaf-note">
      <div className="zoomed-leaf-note-header">
        <h2 className="zoomed-leaf-note-title" title={nodeTitle}
          dangerouslySetInnerHTML={{ __html: sanitizedTitle }}
        />
      </div>
      <div className="zoomed-leaf-note-label">Notes</div>
      <div className="zoomed-leaf-note-body">
        <EditorContent editor={editor} />
      </div>
    </div>
  );
});
