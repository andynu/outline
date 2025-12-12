import { Node, mergeAttributes } from '@tiptap/core';
import { Plugin, PluginKey } from '@tiptap/pm/state';

export interface WikiLinkOptions {
  HTMLAttributes: Record<string, unknown>;
  onNavigate?: (nodeId: string) => void;
}

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    wikiLink: {
      insertWikiLink: (nodeId: string, displayText: string) => ReturnType;
    };
  }
}

// WikiLink node extension for TipTap
export const WikiLink = Node.create<WikiLinkOptions>({
  name: 'wikiLink',

  group: 'inline',

  inline: true,

  atom: true,

  addOptions() {
    return {
      HTMLAttributes: {},
      onNavigate: undefined,
    };
  },

  addAttributes() {
    return {
      nodeId: {
        default: null,
        parseHTML: (element) => element.getAttribute('data-node-id'),
        renderHTML: (attributes) => {
          if (!attributes.nodeId) return {};
          return { 'data-node-id': attributes.nodeId };
        },
      },
      displayText: {
        default: null,
        parseHTML: (element) => element.textContent,
        renderHTML: () => ({}),
      },
    };
  },

  parseHTML() {
    return [
      {
        tag: 'span[data-wiki-link]',
      },
    ];
  },

  renderHTML({ node, HTMLAttributes }) {
    return [
      'span',
      mergeAttributes(
        this.options.HTMLAttributes,
        HTMLAttributes,
        {
          'data-wiki-link': '',
          class: 'wiki-link',
        }
      ),
      node.attrs.displayText || node.attrs.nodeId,
    ];
  },

  addCommands() {
    return {
      insertWikiLink:
        (nodeId: string, displayText: string) =>
        ({ chain }) => {
          return chain()
            .insertContent({
              type: this.name,
              attrs: { nodeId, displayText },
            })
            .run();
        },
    };
  },

  addProseMirrorPlugins() {
    const options = this.options;

    return [
      new Plugin({
        key: new PluginKey('wikiLinkClick'),
        props: {
          handleClick: (view, pos, event) => {
            const target = event.target as HTMLElement;
            if (target.classList.contains('wiki-link') || target.closest('.wiki-link')) {
              const linkEl = target.classList.contains('wiki-link') ? target : target.closest('.wiki-link') as HTMLElement;
              const nodeId = linkEl?.getAttribute('data-node-id');
              if (nodeId && options.onNavigate) {
                event.preventDefault();
                options.onNavigate(nodeId);
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

// Suggestion trigger for [[ autocomplete
export interface WikiLinkSuggestionOptions {
  query: string;
  onSelect: (nodeId: string, displayText: string) => void;
  onClose: () => void;
}

// Track [[ input for triggering suggestion
export function createWikiLinkInputHandler(
  onTrigger: (query: string, range: { from: number; to: number }) => void,
  onClose: () => void
) {
  let active = false;
  let startPos = 0;

  return new Plugin({
    key: new PluginKey('wikiLinkInput'),
    props: {
      handleTextInput: (view, from, to, text) => {
        const state = view.state;
        const prevChar = from > 0 ? state.doc.textBetween(from - 1, from) : '';

        // Detect [[ trigger
        if (text === '[' && prevChar === '[') {
          active = true;
          startPos = from - 1;
          onTrigger('', { from: startPos, to: from + 1 });
          return false;
        }

        // If active, update query
        if (active) {
          const textAfterTrigger = state.doc.textBetween(startPos + 2, from) + text;

          // Close on ]] or whitespace after empty query
          if (text === ']' && textAfterTrigger.endsWith(']')) {
            active = false;
            onClose();
            return false;
          }

          onTrigger(textAfterTrigger, { from: startPos, to: from + text.length + 1 });
        }

        return false;
      },
      handleKeyDown: (view, event) => {
        if (active) {
          if (event.key === 'Escape') {
            active = false;
            onClose();
            return true;
          }
          if (event.key === 'Backspace') {
            const state = view.state;
            const { from } = state.selection;
            // If backspacing to before start, close
            if (from <= startPos + 2) {
              active = false;
              onClose();
            }
          }
        }
        return false;
      },
    },
  });
}

export function isWikiLinkActive(): boolean {
  return false; // Will be managed by component state
}
