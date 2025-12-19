import { Mark, mergeAttributes } from '@tiptap/core';
import { Plugin, PluginKey } from '@tiptap/pm/state';
import { Decoration, DecorationSet } from '@tiptap/pm/view';
import { getDateStatus, formatDateRelative } from './dateUtils';

export interface DueDateOptions {
  HTMLAttributes: Record<string, unknown>;
  onDueDateClick?: (date: string) => void;
}

// Due date pattern - matches !(YYYY-MM-DD)
// The date is captured in group 1
const DUE_DATE_PATTERN = /!\((\d{4}-\d{2}-\d{2})\)/g;

// Find all due dates in text and return their positions
function findDueDates(text: string, startPos: number): Array<{ from: number; to: number; date: string }> {
  const matches: Array<{ from: number; to: number; date: string }> = [];

  for (const match of text.matchAll(DUE_DATE_PATTERN)) {
    const fullMatch = match[0]; // !(YYYY-MM-DD)
    const date = match[1]; // YYYY-MM-DD
    const from = startPos + match.index!;
    const to = from + fullMatch.length;

    matches.push({ from, to, date });
  }

  return matches;
}

// Due date mark extension for TipTap
export const DueDate = Mark.create<DueDateOptions>({
  name: 'dueDate',

  priority: 1000,

  inclusive: false,

  addOptions() {
    return {
      HTMLAttributes: {},
      onDueDateClick: undefined,
    };
  },

  addAttributes() {
    return {
      date: {
        default: null,
      },
    };
  },

  parseHTML() {
    return [
      {
        tag: 'span[data-due-date]',
      },
    ];
  },

  renderHTML({ HTMLAttributes }) {
    return [
      'span',
      mergeAttributes(this.options.HTMLAttributes, HTMLAttributes, {
        'data-due-date': '',
        class: 'due-date',
      }),
      0,
    ];
  },

  addProseMirrorPlugins() {
    const options = this.options;

    return [
      // Decoration plugin to highlight due dates without modifying document
      new Plugin({
        key: new PluginKey('dueDateDecoration'),
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
      // Click handler for due dates
      new Plugin({
        key: new PluginKey('dueDateClick'),
        props: {
          handleClick: (view, pos, event) => {
            const target = event.target as HTMLElement;
            if (target.classList.contains('due-date')) {
              const date = target.getAttribute('data-date');
              if (date && options.onDueDateClick) {
                event.preventDefault();
                options.onDueDateClick(date);
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

// Build decorations for all due dates in the document
function buildDecorations(doc: any): DecorationSet {
  const decorations: Decoration[] = [];

  doc.descendants((node: any, pos: number) => {
    if (node.isText && node.text) {
      const dueDates = findDueDates(node.text, pos);
      for (const { from, to, date } of dueDates) {
        // Get the status to apply appropriate styling class
        const status = getDateStatus(date, false);
        const displayText = formatDateRelative(date);

        decorations.push(
          Decoration.inline(from, to, {
            nodeName: 'span',
            class: `due-date due-date-${status}`,
            'data-due-date': '',
            'data-date': date,
            'data-display': displayText,
          })
        );
      }
    }
  });

  return DecorationSet.create(doc, decorations);
}
