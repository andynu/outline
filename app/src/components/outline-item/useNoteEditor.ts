import { useState, useCallback, RefObject } from 'react';
import { Editor } from '@tiptap/core';
import DOMPurify from 'dompurify';

const NOTE_URL_PATTERN = /(?:https?:\/\/|ftp:\/\/|www\.)[^\s<>[\]{}|\\^`"']+/g;

interface UseNoteEditorParams {
  nodeId: string;
  note: string | null | undefined;
  isFocused: boolean;
  noteInputRef: RefObject<HTMLTextAreaElement | null>;
  editorRef: RefObject<Editor | null>;
  updateNote: (id: string, note: string) => void;
  setFocusedId: (id: string) => void;
  openNoteEditor: (id: string) => void;
}

export function useNoteEditor({ nodeId, note, isFocused, noteInputRef, editorRef, updateNote, setFocusedId, openNoteEditor }: UseNoteEditorParams) {
  const [isEditingNote, setIsEditingNote] = useState(false);

  const handleNoteInput = useCallback((e: React.ChangeEvent<HTMLTextAreaElement>) => {
    updateNote(nodeId, e.target.value);
  }, [nodeId, updateNote]);

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
  }, [editorRef]);

  const handleNoteBlur = useCallback(() => {
    // Close note editing when focus leaves (unless note is empty - then also clear it)
    if (!note?.trim()) {
      setIsEditingNote(false);
    }
  }, [note]);

  /** Render note content as HTML. Handles both HTML notes (from NoteEditor)
   *  and legacy plain-text notes (linkified with URL detection). */
  const renderNoteHtml = useCallback((text: string): string => {
    if (!text) return '';
    // If the note contains HTML block tags, it's a rich note — sanitize and pass through
    if (/<(?:p|h[1-3]|ul|ol|li|blockquote|pre|hr)\b/i.test(text)) {
      return DOMPurify.sanitize(text);
    }
    // Legacy plain-text note: escape HTML first, then linkify
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
    if (target.tagName === 'A') {
      e.preventDefault();
      e.stopPropagation();
      const href = target.getAttribute('href');
      if (href) {
        window.open(href, '_blank');
      }
      return;
    }
    // If note contains HTML (rich formatting), open the full NoteEditor
    if (note && /<(?:p|h[1-3]|ul|ol|li|blockquote|pre|hr)\b/i.test(note)) {
      openNoteEditor(nodeId);
      return;
    }
    // Otherwise enter inline edit mode for plain-text notes
    setFocusedId(nodeId);
    setIsEditingNote(true);
    setTimeout(() => noteInputRef.current?.focus(), 0);
  }, [nodeId, note, setFocusedId, openNoteEditor, noteInputRef]);

  return {
    isEditingNote, setIsEditingNote,
    handleNoteInput, handleNoteKeydown, handleNoteBlur, handleNoteClick, renderNoteHtml,
  };
}
