import { Mark, mergeAttributes } from '@tiptap/core';
import { Plugin, PluginKey } from '@tiptap/pm/state';
import { Decoration, DecorationSet } from '@tiptap/pm/view';

export interface MarkdownLinkOptions {
  HTMLAttributes: Record<string, unknown>;
  openOnClick: boolean;
}

// Markdown link pattern: [text](url)
// Matches [display text](url) where URL can be http(s), ftp, or www
const MARKDOWN_LINK_PATTERN = /\[([^\]]+)\]\(((?:https?:\/\/|ftp:\/\/|www\.)[^\s)]+)\)/g;

// Find all markdown links in text and return their positions
function findMarkdownLinks(
  text: string,
  startPos: number
): Array<{
  from: number;
  to: number;
  displayText: string;
  url: string;
}> {
  const matches: Array<{
    from: number;
    to: number;
    displayText: string;
    url: string;
  }> = [];

  for (const match of text.matchAll(MARKDOWN_LINK_PATTERN)) {
    const displayText = match[1];
    let url = match[2];
    const from = startPos + match.index!;
    const to = from + match[0].length;

    // Add https:// prefix to www URLs for the href
    const href = url.startsWith('www.') ? `https://${url}` : url;

    matches.push({
      from,
      to,
      displayText,
      url: href,
    });
  }

  return matches;
}

// MarkdownLink mark extension for TipTap
// In the editor (focused state), markdown links are shown with subtle styling
// to indicate they are links. The full syntax is visible for editing.
// When unfocused, the static content renderer shows just the clickable text.
export const MarkdownLink = Mark.create<MarkdownLinkOptions>({
  name: 'markdownLink',

  priority: 1100, // Higher than autoLink to take precedence

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
      displayText: {
        default: null,
      },
    };
  },

  parseHTML() {
    return [
      {
        tag: 'a[data-markdown-link]',
      },
    ];
  },

  renderHTML({ HTMLAttributes }) {
    return [
      'a',
      mergeAttributes(this.options.HTMLAttributes, HTMLAttributes, {
        'data-markdown-link': '',
        class: 'markdown-link',
      }),
      0,
    ];
  },

  addProseMirrorPlugins() {
    const options = this.options;

    return [
      // Decoration plugin to style markdown links while editing
      // Shows the full syntax but with visual indication it's a link
      new Plugin({
        key: new PluginKey('markdownLinkDecoration'),
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
      // Click handler to open URLs when clicking on the link syntax
      new Plugin({
        key: new PluginKey('markdownLinkClick'),
        props: {
          handleClick: (view, pos, event) => {
            if (!options.openOnClick) return false;

            const target = event.target as HTMLElement;
            // Check if clicking on markdown link syntax
            const markdownLink = target.closest('.markdown-link-syntax');
            if (markdownLink) {
              const href = markdownLink.getAttribute('data-href');
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

// Build decorations for markdown links while editing
// Wraps the entire [text](url) in a span with subtle styling
function buildDecorations(doc: any): DecorationSet {
  const decorations: Decoration[] = [];

  doc.descendants((node: any, pos: number) => {
    if (node.isText && node.text) {
      const links = findMarkdownLinks(node.text, pos);
      for (const link of links) {
        // Wrap the entire markdown link syntax with subtle styling
        decorations.push(
          Decoration.inline(link.from, link.to, {
            nodeName: 'span',
            class: 'markdown-link-syntax',
            'data-href': link.url,
            title: `Link to: ${link.url}`,
          })
        );
      }
    }
  });

  return DecorationSet.create(doc, decorations);
}
