import { Mark, mergeAttributes } from '@tiptap/core';
import { Plugin, PluginKey } from '@tiptap/pm/state';
import { Decoration, DecorationSet } from '@tiptap/pm/view';

export interface AutoLinkOptions {
  HTMLAttributes: Record<string, unknown>;
  openOnClick: boolean;
}

// URL regex pattern - matches http(s), ftp, and www URLs
const URL_PATTERN = /(?:https?:\/\/|ftp:\/\/|www\.)[^\s<>[\]{}|\\^`"']+/g;

// Markdown link pattern - used to exclude URLs inside markdown syntax
const MARKDOWN_LINK_PATTERN = /\[([^\]]+)\]\(((?:https?:\/\/|ftp:\/\/|www\.)[^\s)]+)\)/g;

// Find all URLs in text and return their positions
// Excludes URLs that are part of markdown link syntax [text](url)
function findUrls(text: string, startPos: number): Array<{ from: number; to: number; url: string }> {
  const matches: Array<{ from: number; to: number; url: string }> = [];

  // First, find all markdown links to exclude their URLs
  const markdownLinkRanges: Array<{ start: number; end: number }> = [];
  for (const match of text.matchAll(MARKDOWN_LINK_PATTERN)) {
    markdownLinkRanges.push({
      start: match.index!,
      end: match.index! + match[0].length,
    });
  }

  // Find URLs and exclude those inside markdown links
  for (const match of text.matchAll(URL_PATTERN)) {
    const urlStart = match.index!;

    // Check if this URL is inside a markdown link
    const isInsideMarkdownLink = markdownLinkRanges.some(
      range => urlStart >= range.start && urlStart < range.end
    );
    if (isInsideMarkdownLink) {
      continue; // Skip URLs inside markdown links
    }

    let url = match[0];
    // Clean trailing punctuation that's likely not part of URL
    const trailingPunct = /[.,;:!?)]+$/;
    const trailingMatch = url.match(trailingPunct);
    if (trailingMatch) {
      url = url.slice(0, -trailingMatch[0].length);
    }

    matches.push({
      from: startPos + match.index!,
      to: startPos + match.index! + url.length,
      url: url.startsWith('www.') ? `https://${url}` : url,
    });
  }

  return matches;
}

// AutoLink mark extension for TipTap
export const AutoLink = Mark.create<AutoLinkOptions>({
  name: 'autoLink',

  priority: 1000,

  inclusive: false,

  addOptions() {
    return {
      HTMLAttributes: {
        target: '_blank',
        rel: 'noopener noreferrer',
      },
      openOnClick: true,
    };
  },

  addAttributes() {
    return {
      href: {
        default: null,
      },
    };
  },

  parseHTML() {
    return [
      {
        tag: 'a[data-auto-link]',
      },
    ];
  },

  renderHTML({ HTMLAttributes }) {
    return [
      'a',
      mergeAttributes(this.options.HTMLAttributes, HTMLAttributes, {
        'data-auto-link': '',
        class: 'auto-link',
      }),
      0,
    ];
  },

  addProseMirrorPlugins() {
    const options = this.options;

    return [
      // Decoration plugin to highlight URLs without modifying document
      new Plugin({
        key: new PluginKey('autoLinkDecoration'),
        state: {
          init(_, { doc }) {
            return buildDecorations(doc);
          },
          apply(tr, oldSet) {
            if (tr.docChanged) {
              return buildDecorations(tr.doc);
            }
            return oldSet.map(tr.mapping, tr.doc);
          },
        },
        props: {
          decorations(state) {
            return this.getState(state);
          },
        },
      }),
      // Click handler to open URLs
      new Plugin({
        key: new PluginKey('autoLinkClick'),
        props: {
          handleClick: (view, pos, event) => {
            if (!options.openOnClick) return false;

            const target = event.target as HTMLElement;
            if (target.tagName === 'A' && target.classList.contains('auto-link')) {
              const href = target.getAttribute('href');
              if (href) {
                event.preventDefault();
                window.open(href, '_blank', 'noopener,noreferrer');
                return true;
              }
            }
            return false;
          },
        },
      }),
    ];
  },
});

// Build decorations for all URLs in the document
function buildDecorations(doc: any): DecorationSet {
  const decorations: Decoration[] = [];

  doc.descendants((node: any, pos: number) => {
    if (node.isText && node.text) {
      const urls = findUrls(node.text, pos);
      for (const { from, to, url } of urls) {
        decorations.push(
          Decoration.inline(from, to, {
            nodeName: 'a',
            href: url,
            target: '_blank',
            rel: 'noopener noreferrer',
            class: 'auto-link',
            'data-auto-link': '',
          })
        );
      }
    }
  });

  return DecorationSet.create(doc, decorations);
}
