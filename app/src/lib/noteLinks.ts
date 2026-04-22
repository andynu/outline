/**
 * Shared helpers for rendering and handling clicks on raw URLs inside
 * note content. Keeps three render paths in sync:
 *
 *   - useNoteEditor.renderNoteHtml (focused item, inline preview)
 *   - OutlineItemStatic (unfocused item, preview)
 *   - ArticleView (article view blockquotes)
 *
 * All three must:
 *   1. Linkify bare URLs inside text nodes (HTML or plain text) so they
 *      render as clickable anchors. AutoLink's decoration-based URLs do
 *      NOT persist into editor.getHTML().
 *   2. Intercept anchor clicks so links open via the Tauri shell plugin
 *      (openUrl) rather than window.open, which in a Tauri webview may
 *      open a new webview instead of the OS default browser.
 */
import DOMPurify from 'dompurify';
import { openUrl } from './api';

// Match the URL pattern used in AutoLink.ts so behavior stays consistent.
const URL_PATTERN_SOURCE = "(?:https?:\\/\\/|ftp:\\/\\/|www\\.)[^\\s<>\\[\\]{}|\\\\^`\"']+";

// Elements whose text content we must NOT linkify.
const SKIP_TAGS = new Set(['A', 'CODE', 'PRE']);

// Trailing punctuation we should not treat as part of the URL.
const TRAILING_PUNCT = /[.,;:!?)]+$/;

function buildHref(rawUrl: string): string {
  return rawUrl.startsWith('www.') ? `https://${rawUrl}` : rawUrl;
}

/** Splits a raw text string into text fragments and URL matches. */
function splitByUrls(text: string): Array<{ text: string; url?: string }> {
  const re = new RegExp(URL_PATTERN_SOURCE, 'g');
  const parts: Array<{ text: string; url?: string }> = [];
  let lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = re.exec(text)) !== null) {
    let url = match[0];
    const trailing = url.match(TRAILING_PUNCT);
    if (trailing) {
      url = url.slice(0, -trailing[0].length);
    }
    const start = match.index;
    const end = start + url.length;
    if (start > lastIndex) {
      parts.push({ text: text.slice(lastIndex, start) });
    }
    parts.push({ text: url, url: buildHref(url) });
    lastIndex = end;
    re.lastIndex = end;
  }
  if (lastIndex < text.length) {
    parts.push({ text: text.slice(lastIndex) });
  }
  return parts;
}

/**
 * Walks a DOM tree and wraps bare URLs inside text nodes in anchor tags.
 * Skips a, code, pre subtrees so existing links and code blocks are preserved.
 */
function linkifyDomInPlace(root: Element | DocumentFragment, doc: Document): void {
  const walker = doc.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
    acceptNode(node: Node) {
      let parent = node.parentElement;
      while (parent) {
        if (SKIP_TAGS.has(parent.tagName)) {
          return NodeFilter.FILTER_REJECT;
        }
        if (parent === root) break;
        parent = parent.parentElement;
      }
      return NodeFilter.FILTER_ACCEPT;
    },
  });

  const textNodes: Text[] = [];
  let current: Node | null = walker.nextNode();
  while (current) {
    textNodes.push(current as Text);
    current = walker.nextNode();
  }

  for (const textNode of textNodes) {
    const raw = textNode.nodeValue ?? '';
    if (!raw) continue;
    const parts = splitByUrls(raw);
    if (!parts.some(p => p.url)) continue;

    const frag = doc.createDocumentFragment();
    for (const part of parts) {
      if (part.url) {
        const a = doc.createElement('a');
        a.setAttribute('href', part.url);
        a.setAttribute('target', '_blank');
        a.setAttribute('rel', 'noopener noreferrer');
        a.setAttribute('class', 'note-link');
        a.textContent = part.text;
        frag.appendChild(a);
      } else {
        frag.appendChild(doc.createTextNode(part.text));
      }
    }
    textNode.parentNode?.replaceChild(frag, textNode);
  }
}

/**
 * Linkifies bare URLs inside already-sanitized HTML. Safe to call on HTML
 * produced by DOMPurify; existing anchors and code blocks are preserved.
 */
export function linkifyHtml(sanitizedHtml: string): string {
  if (!sanitizedHtml) return sanitizedHtml;
  const container = document.createElement('div');
  container.innerHTML = sanitizedHtml;
  linkifyDomInPlace(container, document);
  return container.innerHTML;
}

/**
 * Renders note content as HTML. Handles both HTML notes (from NoteEditor)
 * and legacy plain-text notes, linkifying bare URLs in both cases.
 */
export function renderNoteHtml(text: string): string {
  if (!text) return '';
  const hasBlockTags = /<(?:p|h[1-3]|ul|ol|li|blockquote|pre|hr)\b/i.test(text);
  if (hasBlockTags) {
    const sanitized = DOMPurify.sanitize(text);
    return linkifyHtml(sanitized);
  }
  const escaped = text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
  const parts = splitByUrls(escaped);
  const linkified = parts
    .map(part => {
      if (part.url) {
        return `<a href="${part.url}" class="note-link" target="_blank" rel="noopener noreferrer">${part.text}</a>`;
      }
      return part.text;
    })
    .join('');
  return linkified.replace(/\n/g, '<br>');
}

/**
 * Handler for clicks inside a note preview. If the click lands on an anchor,
 * opens the URL via the Tauri shell plugin (openUrl) and returns true so
 * the caller can short-circuit further click handling.
 */
export function handleNoteLinkClick(
  e: { target: EventTarget | null; preventDefault: () => void; stopPropagation: () => void }
): boolean {
  const target = e.target as HTMLElement | null;
  if (!target) return false;
  const anchor = target.closest?.('a');
  if (!anchor) return false;
  const href = anchor.getAttribute('href');
  if (!href) return false;
  e.preventDefault();
  e.stopPropagation();
  void openUrl(href);
  return true;
}
