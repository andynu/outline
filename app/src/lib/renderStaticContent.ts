/**
 * Render static content with styling for hashtags, mentions, dates, URLs, etc.
 * This is used when TipTap is not active (unfocused items) to provide
 * consistent styling and interaction for inline elements.
 */

import { getDateStatus } from './dateUtils';

// Patterns matching TipTap extensions
const HASHTAG_PATTERN = /(?:^|(?<=\s))#([a-zA-Z][a-zA-Z0-9_-]*)/g;
const MENTION_PATTERN = /(?:^|(?<=\s))@([a-zA-Z][a-zA-Z0-9_-]*)/g;
const DUE_DATE_PATTERN = /!\((\d{4}-\d{2}-\d{2})\)/g;
const MARKDOWN_LINK_PATTERN = /\[([^\]]+)\]\(((?:https?:\/\/|ftp:\/\/|www\.)[^\s)]+)\)/g;
const URL_PATTERN = /(?:https?:\/\/|ftp:\/\/|www\.)[^\s<>[\]{}|\\^`"']+/g;

/**
 * Clean trailing punctuation from URLs
 */
function cleanUrl(url: string): { cleanedUrl: string; trailing: string } {
  const trailingPunct = /[.,;:!?)]+$/;
  const match = url.match(trailingPunct);
  if (match) {
    return {
      cleanedUrl: url.slice(0, -match[0].length),
      trailing: match[0]
    };
  }
  return { cleanedUrl: url, trailing: '' };
}

interface Replacement {
  start: number;
  end: number;
  createNodes: () => Node[];
}

/**
 * Process a text node and return replacement nodes
 */
function processTextNode(textNode: Text): Node[] | null {
  const text = textNode.textContent || '';
  if (!text) return null;

  const replacements: Replacement[] = [];

  // Find hashtags
  for (const match of text.matchAll(HASHTAG_PATTERN)) {
    const fullMatch = match[0];
    const tag = match[1];
    const hashPos = fullMatch.indexOf('#');
    const start = match.index! + hashPos;
    const end = start + 1 + tag.length;

    replacements.push({
      start,
      end,
      createNodes: () => {
        const span = document.createElement('span');
        span.className = 'hashtag';
        span.dataset.tag = tag;
        span.textContent = `#${tag}`;
        return [span];
      }
    });
  }

  // Find mentions
  for (const match of text.matchAll(MENTION_PATTERN)) {
    const fullMatch = match[0];
    const mention = match[1];
    const atPos = fullMatch.indexOf('@');
    const start = match.index! + atPos;
    const end = start + 1 + mention.length;

    replacements.push({
      start,
      end,
      createNodes: () => {
        const span = document.createElement('span');
        span.className = 'mention';
        span.dataset.mention = mention;
        span.textContent = `@${mention}`;
        return [span];
      }
    });
  }

  // Find due dates
  for (const match of text.matchAll(DUE_DATE_PATTERN)) {
    const date = match[1];
    const start = match.index!;
    const end = start + match[0].length;

    replacements.push({
      start,
      end,
      createNodes: () => {
        // Pass false for isChecked - inline dates show actual status, not completion
        const status = getDateStatus(date, false);
        const span = document.createElement('span');
        span.className = `due-date due-date-${status}`;
        span.dataset.date = date;
        span.textContent = `!(${date})`;
        return [span];
      }
    });
  }

  // Find markdown links: [text](url) - must come before plain URLs
  for (const match of text.matchAll(MARKDOWN_LINK_PATTERN)) {
    const displayText = match[1];
    let url = match[2];
    const start = match.index!;
    const end = start + match[0].length;

    // Add https:// prefix to www URLs
    if (url.startsWith('www.')) {
      url = `https://${url}`;
    }

    replacements.push({
      start,
      end,
      createNodes: () => {
        const link = document.createElement('a');
        link.className = 'markdown-link';
        link.href = url;
        link.target = '_blank';
        link.rel = 'noopener noreferrer';
        link.textContent = displayText;
        link.dataset.markdownLink = '';
        return [link];
      }
    });
  }

  // Find URLs
  for (const match of text.matchAll(URL_PATTERN)) {
    const url = match[0];
    const start = match.index!;
    const { cleanedUrl, trailing } = cleanUrl(url);
    const end = start + cleanedUrl.length;
    const href = cleanedUrl.startsWith('www.') ? `https://${cleanedUrl}` : cleanedUrl;

    replacements.push({
      start,
      end,
      createNodes: () => {
        const link = document.createElement('a');
        link.className = 'auto-link';
        link.href = href;
        link.target = '_blank';
        link.rel = 'noopener noreferrer';
        link.textContent = cleanedUrl;
        const nodes: Node[] = [link];
        if (trailing) {
          nodes.push(document.createTextNode(trailing));
        }
        return nodes;
      }
    });
  }

  if (replacements.length === 0) return null;

  // Sort replacements by position (ascending)
  replacements.sort((a, b) => a.start - b.start);

  // Check for overlaps and keep only non-overlapping
  const validReplacements: Replacement[] = [];
  let lastEnd = 0;
  for (const r of replacements) {
    if (r.start >= lastEnd) {
      validReplacements.push(r);
      lastEnd = r.end;
    }
  }

  if (validReplacements.length === 0) return null;

  // Build result nodes
  const result: Node[] = [];
  let pos = 0;

  for (const r of validReplacements) {
    // Add text before this replacement
    if (r.start > pos) {
      result.push(document.createTextNode(text.slice(pos, r.start)));
    }
    // Add replacement nodes
    result.push(...r.createNodes());
    pos = r.end;
  }

  // Add remaining text
  if (pos < text.length) {
    result.push(document.createTextNode(text.slice(pos)));
  }

  return result;
}

/**
 * Process a DOM element's text nodes to add styling for inline elements.
 * Modifies the element in place.
 */
export function processStaticContentElement(element: HTMLElement): void {
  // Find all text nodes
  const walker = document.createTreeWalker(
    element,
    NodeFilter.SHOW_TEXT,
    null
  );

  const textNodes: Text[] = [];
  let node: Node | null;
  while ((node = walker.nextNode())) {
    // Skip text nodes inside already-processed elements
    const parent = node.parentElement;
    if (parent && (
      parent.classList.contains('hashtag') ||
      parent.classList.contains('mention') ||
      parent.classList.contains('due-date') ||
      parent.classList.contains('auto-link') ||
      parent.classList.contains('wiki-link') ||
      parent.tagName === 'A'
    )) {
      continue;
    }
    textNodes.push(node as Text);
  }

  // Process each text node
  for (const textNode of textNodes) {
    const replacementNodes = processTextNode(textNode);
    if (replacementNodes && replacementNodes.length > 0) {
      const parent = textNode.parentNode;
      if (parent) {
        for (const newNode of replacementNodes) {
          parent.insertBefore(newNode, textNode);
        }
        parent.removeChild(textNode);
      }
    }
  }
}

/**
 * Handle clicks on static content elements via event delegation
 */
export function handleStaticContentClick(
  event: MouseEvent,
  handlers: {
    onHashtagClick?: (tag: string) => void;
    onMentionClick?: (mention: string) => void;
    onWikiLinkClick?: (nodeId: string) => void;
    onDateClick?: (date: string) => void;
  }
): boolean {
  const target = event.target as HTMLElement;

  // Check for hashtag click
  if (target.classList.contains('hashtag')) {
    const tag = target.dataset.tag;
    if (tag && handlers.onHashtagClick) {
      event.preventDefault();
      event.stopPropagation();
      handlers.onHashtagClick(tag);
      return true;
    }
  }

  // Check for mention click
  if (target.classList.contains('mention')) {
    const mention = target.dataset.mention;
    if (mention && handlers.onMentionClick) {
      event.preventDefault();
      event.stopPropagation();
      handlers.onMentionClick(mention);
      return true;
    }
  }

  // Check for wiki-link click
  if (target.classList.contains('wiki-link') || target.closest('.wiki-link')) {
    const linkEl = target.classList.contains('wiki-link') ? target : target.closest('.wiki-link') as HTMLElement;
    const nodeId = linkEl?.dataset.nodeId;
    if (nodeId && handlers.onWikiLinkClick) {
      event.preventDefault();
      event.stopPropagation();
      handlers.onWikiLinkClick(nodeId);
      return true;
    }
  }

  // Check for due-date click
  if (target.classList.contains('due-date')) {
    const date = target.dataset.date;
    if (date && handlers.onDateClick) {
      event.preventDefault();
      event.stopPropagation();
      handlers.onDateClick(date);
      return true;
    }
  }

  // Auto-links handle themselves via href

  return false;
}
