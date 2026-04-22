import { stripHtml } from './utils';

/**
 * Maximum characters to show in a one-line note preview before truncating.
 * Kept in a shared helper so focused and unfocused renderers stay in sync.
 */
export const NOTE_PREVIEW_MAX_CHARS = 100;

/**
 * Build the plain-text preview shown in `'one-line'` note display mode.
 * Strips HTML, trims, and truncates to {@link NOTE_PREVIEW_MAX_CHARS} with an ellipsis.
 */
export function buildNotePreview(note: string): string {
  const plain = stripHtml(note);
  return plain.length > NOTE_PREVIEW_MAX_CHARS
    ? plain.slice(0, NOTE_PREVIEW_MAX_CHARS) + '...'
    : plain;
}
