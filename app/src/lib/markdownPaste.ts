/**
 * Parse markdown list content into outline items.
 * Handles:
 * - Bullet lists: - item, * item
 * - Checkboxes: - [ ] item, - [x] item
 * - Headers: # heading
 * - Indentation for hierarchy
 */

export interface ParsedItem {
  content: string;          // The text content (inline formatting preserved)
  nodeType: 'bullet' | 'checkbox';
  isChecked: boolean;
  indent: number;           // Indent level (0 = root, 1 = child, etc.)
}

// Patterns for matching markdown list items
const CHECKBOX_PATTERN = /^(\s*)[-*]\s*\[([ xX])\]\s+(.*)$/;
const BULLET_PATTERN = /^(\s*)[-*]\s+(.*)$/;
const HEADER_PATTERN = /^(#+)\s+(.*)$/;
const ORDERED_PATTERN = /^(\s*)\d+\.\s+(.*)$/;

// Convert markdown inline formatting to HTML
function convertInlineFormatting(text: string): string {
  return text
    // Bold: **text** or __text__
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/__(.+?)__/g, '<strong>$1</strong>')
    // Italic: *text* or _text_ (but not inside words for underscore)
    .replace(/\*(.+?)\*/g, '<em>$1</em>')
    .replace(/(?<!\w)_(.+?)_(?!\w)/g, '<em>$1</em>')
    // Inline code: `code`
    .replace(/`(.+?)`/g, '<code>$1</code>');
}

/**
 * Parse markdown text into a list of outline items.
 * Returns null if the text doesn't look like a markdown list.
 */
export function parseMarkdownList(text: string): ParsedItem[] | null {
  const lines = text.split('\n');
  const items: ParsedItem[] = [];

  // Track if we've seen any list-like content
  let hasListContent = false;

  for (const line of lines) {
    // Skip empty lines
    if (!line.trim()) {
      continue;
    }

    // Try to match checkbox first (more specific)
    const checkboxMatch = line.match(CHECKBOX_PATTERN);
    if (checkboxMatch) {
      hasListContent = true;
      const [, indent, checked, content] = checkboxMatch;
      const indentLevel = Math.floor(indent.length / 2); // 2 spaces per level
      items.push({
        content: convertInlineFormatting(content.trim()),
        nodeType: 'checkbox',
        isChecked: checked.toLowerCase() === 'x',
        indent: indentLevel,
      });
      continue;
    }

    // Try bullet pattern
    const bulletMatch = line.match(BULLET_PATTERN);
    if (bulletMatch) {
      hasListContent = true;
      const [, indent, content] = bulletMatch;
      const indentLevel = Math.floor(indent.length / 2);
      items.push({
        content: convertInlineFormatting(content.trim()),
        nodeType: 'bullet',
        isChecked: false,
        indent: indentLevel,
      });
      continue;
    }

    // Try ordered list pattern (treat same as bullet)
    const orderedMatch = line.match(ORDERED_PATTERN);
    if (orderedMatch) {
      hasListContent = true;
      const [, indent, content] = orderedMatch;
      const indentLevel = Math.floor(indent.length / 2);
      items.push({
        content: convertInlineFormatting(content.trim()),
        nodeType: 'bullet',
        isChecked: false,
        indent: indentLevel,
      });
      continue;
    }

    // Try header pattern (# text becomes a bullet item at root level)
    const headerMatch = line.match(HEADER_PATTERN);
    if (headerMatch) {
      hasListContent = true;
      const [, , content] = headerMatch;
      items.push({
        content: convertInlineFormatting(content.trim()),
        nodeType: 'bullet',
        isChecked: false,
        indent: 0, // Headers are always at root level
      });
      continue;
    }

    // If this line doesn't match any pattern and we haven't seen list content yet,
    // this probably isn't a markdown list at all
    if (!hasListContent) {
      return null;
    }

    // Otherwise, treat unmatched non-empty lines as plain text items at root level
    // (This handles edge cases where someone pastes mixed content)
    items.push({
      content: convertInlineFormatting(line.trim()),
      nodeType: 'bullet',
      isChecked: false,
      indent: 0,
    });
  }

  // Only return items if we found actual list content
  return hasListContent && items.length > 0 ? items : null;
}

/**
 * Check if text looks like a markdown list (has 2+ list items).
 * This is a quick check before doing full parsing.
 */
export function looksLikeMarkdownList(text: string): boolean {
  const lines = text.split('\n');
  let listItemCount = 0;

  for (const line of lines) {
    if (CHECKBOX_PATTERN.test(line) ||
        BULLET_PATTERN.test(line) ||
        ORDERED_PATTERN.test(line) ||
        HEADER_PATTERN.test(line)) {
      listItemCount++;
      if (listItemCount >= 2) {
        return true;
      }
    }
  }

  return false;
}
