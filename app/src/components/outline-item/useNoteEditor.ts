import { useState, useCallback, RefObject } from 'react';
import { Editor } from '@tiptap/core';
import { renderNoteHtml as renderNoteHtmlShared, handleNoteLinkClick } from '../../lib/noteLinks';

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

  /** Render note content as HTML. Delegates to the shared helper so that
   *  plain-text and HTML notes both get URL linkification, and all note
   *  render paths stay in sync. */
  const renderNoteHtml = useCallback((text: string): string => {
    return renderNoteHtmlShared(text);
  }, []);

  const handleNoteClick = useCallback((e: React.MouseEvent) => {
    // If clicking a link, open it via the Tauri shell plugin (OS default browser).
    if (handleNoteLinkClick(e)) {
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
