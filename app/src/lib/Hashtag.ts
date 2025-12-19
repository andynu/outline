import { Mark, mergeAttributes } from '@tiptap/core';
import { Plugin, PluginKey } from '@tiptap/pm/state';
import { Decoration, DecorationSet } from '@tiptap/pm/view';

export interface HashtagOptions {
  HTMLAttributes: Record<string, unknown>;
  onHashtagClick?: (tag: string) => void;
}

// Hashtag pattern - matches #word (letters, numbers, underscores, hyphens)
// Must start with # and be preceded by whitespace or start of text
const HASHTAG_PATTERN = /(?:^|(?<=\s))#([a-zA-Z][a-zA-Z0-9_-]*)/g;

// Find all hashtags in text and return their positions
function findHashtags(text: string, startPos: number): Array<{ from: number; to: number; tag: string }> {
  const matches: Array<{ from: number; to: number; tag: string }> = [];

  for (const match of text.matchAll(HASHTAG_PATTERN)) {
    const fullMatch = match[0];
    const tag = match[1]; // The tag without #
    const matchStart = match.index!;

    // Adjust for leading whitespace in lookbehind
    const hashPos = fullMatch.indexOf('#');
    const from = startPos + matchStart + hashPos;
    const to = from + 1 + tag.length; // # + tag

    matches.push({ from, to, tag });
  }

  return matches;
}

// Hashtag mark extension for TipTap
export const Hashtag = Mark.create<HashtagOptions>({
  name: 'hashtag',

  priority: 1000,

  inclusive: false,

  addOptions() {
    return {
      HTMLAttributes: {},
      onHashtagClick: undefined,
    };
  },

  addAttributes() {
    return {
      tag: {
        default: null,
      },
    };
  },

  parseHTML() {
    return [
      {
        tag: 'span[data-hashtag]',
      },
    ];
  },

  renderHTML({ HTMLAttributes }) {
    return [
      'span',
      mergeAttributes(this.options.HTMLAttributes, HTMLAttributes, {
        'data-hashtag': '',
        class: 'hashtag',
      }),
      0,
    ];
  },

  addProseMirrorPlugins() {
    const options = this.options;

    return [
      // Decoration plugin to highlight hashtags without modifying document
      new Plugin({
        key: new PluginKey('hashtagDecoration'),
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
      // Click handler for hashtags
      new Plugin({
        key: new PluginKey('hashtagClick'),
        props: {
          handleClick: (view, pos, event) => {
            const target = event.target as HTMLElement;
            if (target.classList.contains('hashtag')) {
              const tag = target.getAttribute('data-tag');
              if (tag && options.onHashtagClick) {
                event.preventDefault();
                options.onHashtagClick(tag);
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

// Build decorations for all hashtags in the document
function buildDecorations(doc: any): DecorationSet {
  const decorations: Decoration[] = [];

  doc.descendants((node: any, pos: number) => {
    if (node.isText && node.text) {
      const hashtags = findHashtags(node.text, pos);
      for (const { from, to, tag } of hashtags) {
        decorations.push(
          Decoration.inline(from, to, {
            nodeName: 'span',
            class: 'hashtag',
            'data-hashtag': '',
            'data-tag': tag,
          })
        );
      }
    }
  });

  return DecorationSet.create(doc, decorations);
}
