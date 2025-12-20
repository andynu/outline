# Macro Format Research: Inline Widgets for Outline

## Overview

This document researches and proposes a macro format for inline widgets in Outline, starting with progress bars. The goal is to design a syntax that is:
- Consistent with existing inline patterns (`[[wiki-links]]`, `#hashtags`, `!(dates)`)
- Extensible to other widget types
- Easy to type and remember
- Reactively updated when dependent data changes

## Prior Art

### Existing Outline Inline Patterns

| Pattern | Trigger | Example | Implementation |
|---------|---------|---------|----------------|
| Wiki Link | `[[` | `[[Shopping List]]` | Node (atomic) |
| Hashtag | `#` | `#urgent` | Mark (decoration) |
| Mention | `@` | `@john` | Mark (decoration) |
| Due Date | `!(` | `!(2024-12-25)` | Mark (decoration) |
| URL | auto | `https://...` | Mark (decoration) |

All marks use the **decoration pattern**: regex-matched text is visually styled via ProseMirror decorations without modifying the underlying document structure.

### Other Tools

#### Roam Research
- Uses `{{[[roam/render]]}}` syntax for custom components
- Progress bars are community extensions via ClojureScript render components
- No standard inline progress bar syntax

#### Logseq
- Plugin-based: `{{renderer :todomaster}}` renders progress for current block
- Progress is auto-calculated from child TODO markers
- Advanced queries can count/filter child blocks

#### Notion
- Formula properties with rollups: `slice("▓▓▓▓▓▓▓▓▓▓", 0, floor(prop("progress") * 10))`
- Native progress bar property for number columns
- Not inline text - database column feature

#### Dynalist
- No native progress bars
- Users embed external images: `![](https://progress-bar.dev/66/)`
- Checkboxes with completion search: `is:completed`

### Analysis

Most tools treat progress bars as either:
1. **Database/formula-driven** (Notion) - computed from related records
2. **Plugin/extension** (Roam, Logseq) - custom render components
3. **External images** (Dynalist) - static, manually updated

None have a simple inline text syntax for progress. This is an opportunity for Outline to provide a cleaner, more integrated experience.

## Proposed Syntax

### Design Principles

1. **Braces for macros**: Use `{...}` to distinguish from existing patterns
2. **Type prefix**: Start with widget type (e.g., `pb:` for progress bar)
3. **Colon separator**: Consistent with URL-like schemes
4. **Intuitive parameters**: Values that match mental models

### Progress Bar Syntax

#### Static/Manual Values

```
{pb:3/5}        # Explicit fraction (3 of 5 complete)
{pb:75%}        # Explicit percentage
{pb:75}         # Short form for percentage (same as 75%)
```

#### Calculated Values

```
{pb:checked}    # Auto-calculate from descendant checkboxes
{pb:children}   # Alias for checked (clearer intent)
```

### Other Potential Macros

The `{type:params}` format is extensible:

```
{count:checked}    # Show "3/5" text instead of bar
{count:children}   # Count all children (not just checked)
{sum:children}     # Sum of child numeric values
{status:project}   # Project status indicator
{embed:nodeId}     # Inline embed of another node
```

## Technical Implementation

### Architecture Decision: Mark with Decorations

Based on the codebase analysis, macros should use **Mark extensions with decoration plugins**, matching the pattern used by hashtags, mentions, and due dates.

**Why not Node (like WikiLink)?**
- Marks allow fluid text editing
- The `{pb:checked}` text remains in the document
- Decorations can update reactively without document changes
- Easier to toggle/remove by editing text

### Regex Pattern

```typescript
// Matches all macro formats
const MACRO_PATTERN = /\{([a-z]+):([^}]+)\}/g;
// Groups: [1] = type, [2] = params

// Specific progress bar patterns
const PROGRESS_FRACTION = /^(\d+)\/(\d+)$/;  // e.g., "3/5"
const PROGRESS_PERCENT = /^(\d+)%?$/;        // e.g., "75" or "75%"
const PROGRESS_CALCULATED = /^(checked|children)$/;
```

### Decoration Plugin Structure

```typescript
export const MacroWidget = Mark.create<MacroWidgetOptions>({
  name: 'macroWidget',
  priority: 1000,
  inclusive: false,

  addProseMirrorPlugins() {
    const outline = this.options.outline; // Pass outline state

    return [
      new Plugin({
        key: new PluginKey('macroDecoration'),
        state: {
          init(_, { doc }) {
            return buildMacroDecorations(doc, outline);
          },
          apply(tr, oldSet, _, newState) {
            if (tr.docChanged) {
              return buildMacroDecorations(newState.doc, outline);
            }
            return oldSet.map(tr.mapping, newState.doc);
          },
        },
        props: {
          decorations(state) {
            return this.getState(state);
          },
        },
      }),
    ];
  },
});
```

### Calculated Values: {pb:checked}

For `{pb:checked}`, we need access to the node tree to count descendants:

```typescript
function calculateCheckedProgress(nodeId: string, outline: OutlineState): { done: number, total: number } {
  let done = 0;
  let total = 0;

  function countDescendants(parentId: string) {
    const children = outline.nodes.filter(n => n.parent_id === parentId);
    for (const child of children) {
      if (child.node_type === 'checkbox') {
        total++;
        if (child.is_checked) done++;
      }
      countDescendants(child.id);
    }
  }

  countDescendants(nodeId);
  return { done, total };
}
```

### Reactivity Challenge

When a child checkbox changes, the `{pb:checked}` decoration must update. Solutions:

1. **Full re-render on any node change**: Simple but potentially slow
2. **Track macro node IDs**: When a checkbox changes, find macros in ancestors
3. **Svelte reactivity**: If decorations depend on `outline.nodes`, Svelte's reactivity handles it

Option 3 is most aligned with the codebase's existing patterns.

### CSS Rendering

```css
.macro-progressbar {
  display: inline-block;
  width: 60px;
  height: 12px;
  background: var(--bg-tertiary);
  border-radius: 3px;
  position: relative;
  vertical-align: middle;
  overflow: hidden;
}

.macro-progressbar::before {
  content: '';
  position: absolute;
  top: 0;
  left: 0;
  height: 100%;
  background: var(--accent-primary);
  transition: width 0.2s ease;
  /* Width set via inline style from decoration */
}

/* Color coding by progress */
.macro-progressbar[data-status="low"]::before { background: var(--status-error); }
.macro-progressbar[data-status="mid"]::before { background: var(--status-warning); }
.macro-progressbar[data-status="high"]::before { background: var(--accent-primary); }
.macro-progressbar[data-status="complete"]::before { background: var(--status-success); }
```

### Static Content Rendering

Add macro handling to `renderStaticContent.ts`:

```typescript
function processStaticContentElement(element: HTMLElement, nodeId: string, outline: OutlineState) {
  // ... existing processing ...

  // Process macros
  const macroPattern = /\{([a-z]+):([^}]+)\}/g;
  // Replace with rendered widget spans
}
```

## User Experience

### Typing Flow

1. User types `{pb:`
2. Could optionally show autocomplete: `checked`, `75%`, etc.
3. User types value and closes with `}`
4. Decoration renders progress bar inline

### Editing

- Cursor can be placed in the macro text
- Editing the value updates the decoration reactively
- Deleting text removes the macro naturally

### Visual Design

```
Project Alpha {pb:checked} ▓▓▓▓▓▓░░░░ 60%
├── [x] Design
├── [x] Implement
├── [x] Test
├── [ ] Deploy
└── [ ] Document
```

The progress bar shows:
- Visual bar with fill
- Optional percentage text
- Color coding based on progress level

## Implementation Plan

### Phase 1: Static Progress Bars
- Add `MacroWidget.ts` TipTap extension
- Implement regex-based decoration pattern
- Parse `{pb:N/M}` and `{pb:N%}` formats
- Add CSS for progress bar rendering
- Add to static content renderer

### Phase 2: Calculated Progress Bars
- Implement `{pb:checked}` calculation
- Wire up node tree access to decorations
- Ensure reactive updates when checkboxes change

### Phase 3: Additional Macros
- `{count:checked}` for text-only display
- Consider other widget types based on user needs

## Open Questions

1. **Should autocomplete be added for macro types?** (Like the date popup)
2. **What's the ideal progress bar size?** (60px? 80px? Configurable?)
3. **Should macros support custom labels?** e.g., `{pb:3/5 "Tasks"}`
4. **How to handle {pb:checked} in search results?** (Show calculated value?)

## Conclusion

The proposed `{type:params}` macro format provides a clean, extensible syntax for inline widgets. Starting with progress bars, the same architecture can support counters, rollups, and other calculated widgets. The decoration-based implementation maintains document simplicity while enabling rich visual rendering.

## References

- [Logseq Todo Master Plugin](https://github.com/pengx17/logseq-plugin-todo-master)
- [Notion Progress Bar Formulas](https://uno.notion.vip/notion-formulas-create-a-progress-bar/)
- [Dynalist Progress Bar Discussion](https://talk.dynalist.io/t/adding-progress-bars/8265)
- [Roam Render Components](https://github.com/8bitgentleman/Roam-Render-Components)
