import { Mark, mergeAttributes } from '@tiptap/core';
import { Plugin, PluginKey } from '@tiptap/pm/state';
import { Decoration, DecorationSet } from '@tiptap/pm/view';

export interface MentionOptions {
  HTMLAttributes: Record<string, unknown>;
  onMentionClick?: (mention: string) => void;
}

// Mention pattern - matches @word (letters, numbers, underscores, hyphens)
// Must start with @ and be preceded by whitespace or start of text
const MENTION_PATTERN = /(?:^|(?<=\s))@([a-zA-Z][a-zA-Z0-9_-]*)/g;

// Find all mentions in text and return their positions
function findMentions(text: string, startPos: number): Array<{ from: number; to: number; mention: string }> {
  const matches: Array<{ from: number; to: number; mention: string }> = [];

  for (const match of text.matchAll(MENTION_PATTERN)) {
    const fullMatch = match[0];
    const mention = match[1]; // The mention without @
    const matchStart = match.index!;

    // Adjust for leading whitespace in lookbehind
    const atPos = fullMatch.indexOf('@');
    const from = startPos + matchStart + atPos;
    const to = from + 1 + mention.length; // @ + mention

    matches.push({ from, to, mention });
  }

  return matches;
}

// Mention mark extension for TipTap
export const Mention = Mark.create<MentionOptions>({
  name: 'mention',

  priority: 1000,

  inclusive: false,

  addOptions() {
    return {
      HTMLAttributes: {},
      onMentionClick: undefined,
    };
  },

  addAttributes() {
    return {
      mention: {
        default: null,
      },
    };
  },

  parseHTML() {
    return [
      {
        tag: 'span[data-mention]',
      },
    ];
  },

  renderHTML({ HTMLAttributes }) {
    return [
      'span',
      mergeAttributes(this.options.HTMLAttributes, HTMLAttributes, {
        'data-mention': '',
        class: 'mention',
      }),
      0,
    ];
  },

  addProseMirrorPlugins() {
    const options = this.options;

    return [
      // Decoration plugin to highlight mentions without modifying document
      new Plugin({
        key: new PluginKey('mentionDecoration'),
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
      // Click handler for mentions
      new Plugin({
        key: new PluginKey('mentionClick'),
        props: {
          handleClick: (view, pos, event) => {
            const target = event.target as HTMLElement;
            if (target.classList.contains('mention')) {
              const mention = target.getAttribute('data-mention-name');
              if (mention && options.onMentionClick) {
                event.preventDefault();
                options.onMentionClick(mention);
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

// Build decorations for all mentions in the document
function buildDecorations(doc: any): DecorationSet {
  const decorations: Decoration[] = [];

  doc.descendants((node: any, pos: number) => {
    if (node.isText && node.text) {
      const mentions = findMentions(node.text, pos);
      for (const { from, to, mention } of mentions) {
        decorations.push(
          Decoration.inline(from, to, {
            nodeName: 'span',
            class: 'mention',
            'data-mention': '',
            'data-mention-name': mention,
          })
        );
      }
    }
  });

  return DecorationSet.create(doc, decorations);
}
