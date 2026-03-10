/**
 * NoteEditor - Full-screen TipTap editor for a single node's note.
 *
 * Activated by "Edit Note" context menu or Ctrl+Shift+Enter.
 * Provides a rich markdown-like editing experience with the same
 * TipTap extensions used in the main outline editor (wiki links,
 * hashtags, dates, etc.), plus block-level features like headings,
 * lists, blockquotes, and code blocks.
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

interface NoteEditorProps {
  nodeId: string;
  onClose: () => void;
  onNavigateToNode?: (nodeId: string) => void;
}

export const NoteEditor = React.memo(function NoteEditor({
  nodeId,
  onClose,
  onNavigateToNode,
}: NoteEditorProps) {
  const node = useOutlineStore(state => state.nodes.find(n => n.id === nodeId));
  const updateNote = useOutlineStore(state => state.updateNote);
  const setFilterQuery = useOutlineStore(state => state.setFilterQuery);

  // Track the latest note from store (for initial content only)
  const initialNoteRef = useRef(node?.note || '');

  // Convert plain text note to HTML for TipTap.
  // Notes are stored as plain text, so we convert newlines to paragraphs.
  // Uses DOMPurify to sanitize any embedded markup.
  const noteToHtml = useCallback((text: string): string => {
    if (!text) return '<p></p>';
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

  // Convert TipTap HTML back to plain text for storage
  const htmlToNote = useCallback((html: string): string => {
    const div = document.createElement('div');
    div.textContent = ''; // clear
    // Use DOMPurify before parsing
    const clean = DOMPurify.sanitize(html);
    const parser = new DOMParser();
    const doc = parser.parseFromString(clean, 'text/html');
    const paragraphs = doc.querySelectorAll('p, h1, h2, h3, h4, h5, h6, li');
    if (paragraphs.length === 0) {
      return doc.body.textContent || '';
    }
    const lines: string[] = [];
    paragraphs.forEach(p => {
      lines.push(p.textContent || '');
    });
    // Remove trailing empty lines
    while (lines.length > 0 && lines[lines.length - 1] === '') {
      lines.pop();
    }
    return lines.join('\n');
  }, []);

  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        // Enable full block-level features for long-form writing
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
          onClose();
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
    ],
    content: noteToHtml(initialNoteRef.current),
    editorProps: {
      attributes: {
        class: 'note-editor-content',
      },
    },
    onUpdate: ({ editor: ed }) => {
      const html = ed.getHTML();
      const text = htmlToNote(html);
      updateNote(nodeId, text);
    },
  });

  // Focus editor on mount
  useEffect(() => {
    if (editor) {
      // Small delay to let the DOM settle
      setTimeout(() => {
        editor.commands.focus('end');
      }, 50);
    }
  }, [editor]);

  // Handle Escape to close
  useEffect(() => {
    const handleKeydown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeydown);
    return () => window.removeEventListener('keydown', handleKeydown);
  }, [onClose]);

  // Cleanup editor on unmount
  useEffect(() => {
    return () => {
      editor?.destroy();
    };
  }, [editor]);

  if (!node) {
    return null;
  }

  // Strip HTML from content for the header display
  const nodeTitle = node.content
    ?.replace(/<[^>]*>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .trim() || 'Untitled';

  return (
    <div className="note-editor-view">
      <div className="note-editor-header">
        <button
          className="note-editor-back"
          onClick={onClose}
          title="Back to outline (Escape)"
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="16" height="16">
            <polyline points="15 18 9 12 15 6"/>
          </svg>
          Back
        </button>
        <div className="note-editor-title" title={nodeTitle}>
          {nodeTitle}
        </div>
      </div>
      <div className="note-editor-body">
        <EditorContent editor={editor} />
      </div>
    </div>
  );
});
