# OutlineItem.tsx Decomposition

**Goal:** Improve readability and maintainability by extracting standalone chunks from the 2082-line OutlineItem component. Conservative approach — extract what has clean boundaries, keep OutlineItem as the orchestrator.

**Non-goals:** Performance optimization, reusability across components, rethinking the component boundary.

## Current State

OutlineItem.tsx contains 11 responsibility areas in a single component:
- TipTap editor lifecycle (717 lines, 34%)
- Context menus — single-item and bulk (350 lines, 17%)
- Suggestion popup handlers (190 lines, 9%)
- Click handlers (70 lines)
- Drag & drop (70 lines)
- Note editing (75 lines)
- Store selectors, state, refs (184 lines)
- Content sync effects (25 lines)
- JSX return (237 lines)

## Extractions

Seven files extracted into `app/src/components/outline-item/`. OutlineItem.tsx moves into this directory as `index.tsx` and re-exports.

### 1. `useOutlineEditor.ts` — Custom hook (~717 lines)

The entire TipTap editor creation useEffect, currently lines 251-967. This is the largest single block and includes:
- Editor creation with 9 extensions (StarterKit, WikiLink, Hashtag, DueDate, AutoLink, MarkdownLink, Mention, EmojiShortcode, CustomEmojiNode)
- `handleTextInput` — suggestion trigger detection (`[[`, `#`, `!(`, `:`)
- `handleKeyDown` — 30+ keyboard shortcuts
- `handlePaste` — markdown list detection and insertion
- `onUpdate`, `onFocus` callbacks
- Editor cleanup on unmount/unfocus

**Interface:**
```typescript
function useOutlineEditor(opts: {
  nodeId: string;
  content: string;
  isFocused: boolean;
  editorContainerRef: RefObject<HTMLDivElement>;
  storeRef: RefObject<StoreActions>;
  suggestions: SuggestionControls; // setters + active refs from useSuggestions
  onNavigateToNode: (nodeId: string) => void;
}): {
  editorRef: RefObject<Editor | null>;
  editorReady: boolean;
}
```

The `storeRef` pattern stays as-is — the hook receives it rather than owning it, since OutlineItem already maintains it for other purposes (content sync effect, click handlers).

**Risk:** Medium. The suggestion trigger detection in `handleTextInput` needs the suggestion state setters and active refs, which creates a cross-boundary dependency with `useSuggestions`. Solved by having OutlineItem pass the suggestion controls into the hook.

### 2. `useSuggestions.ts` — Custom hook (~190 lines)

All 4 suggestion popup patterns (wiki link, hashtag, due date, emoji) plus date picker and recurrence picker handlers. Currently lines 155-184 (state/refs) and 1617-1809 (handlers).

Each suggestion follows an identical shape:
- `show`, `query`, `range`, `position` state (useState)
- `activeRef`, `rangeRef` refs (useRef)
- `handleSelect` callback — replaces editor range with selected value
- `handleClose` callback — resets state and refs

Plus date/recurrence picker state and handlers:
- `showDatePicker`, `datePickerPosition`, `datePickerMode` state
- `showRecurrencePicker`, `recurrencePickerPosition` state
- `handleDateSelect`, `handleDatePickerClose`, `handleDateBadgeClick`, `handleDeferBadgeClick`
- `handleRecurrenceSelect`, `handleRecurrencePickerClose`, `handleRecurrenceIndicatorClick`

**Interface:**
```typescript
function useSuggestions(opts: {
  editorRef: RefObject<Editor | null>;
  nodeId: string;
}): {
  // Per-suggestion: show, query, position, handleSelect, handleClose
  wikiLink: SuggestionState & SuggestionHandlers;
  hashtag: SuggestionState & SuggestionHandlers;
  dueDate: SuggestionState & SuggestionHandlers;
  emoji: SuggestionState & SuggestionHandlers;
  // Controls passed to useOutlineEditor for trigger detection
  controls: SuggestionControls; // setters + active refs
  // Date/recurrence pickers
  datePicker: DatePickerState & DatePickerHandlers;
  recurrencePicker: RecurrencePickerState & RecurrencePickerHandlers;
}
```

**Risk:** Low. Self-contained state and handlers. The only coupling is the `editorRef` needed by select handlers to manipulate the editor range.

### 3. `itemContextMenu.ts` — Pure function (~208 lines)

Single-item context menu definition, currently lines 1264-1472. A `useMemo` that builds a `MenuItem[]` array with 40+ items organized into submenus.

**Interface:**
```typescript
function buildItemContextMenu(opts: {
  node: OutlineNode;
  hasChildren: boolean;
  isBookmarked: boolean;
  documentId: string;
  // Store actions used by menu items
  actions: {
    toggleCheckbox: (id: string) => void;
    toggleNodeType: (id: string) => void;
    setNodeTypeTo: (id: string, type: string) => void;
    setHeadingLevel: (id: string, level: number) => void;
    clearHeading: (id: string) => void;
    // ... remaining store actions referenced by menu items
  };
  // UI triggers
  ui: {
    openDatePicker: (mode: string) => void;
    openRecurrencePicker: () => void;
    openNoteEditor: (id: string) => void;
    copyToClipboard: () => void;
    webSearch: () => void;
  };
}): MenuItem[]
```

**Risk:** Low. Pure data — the menu definition has zero coupling to editor state, hooks, or rendering. It just maps node state + actions into menu item arrays.

### 4. `bulkContextMenu.ts` — Pure function (~140 lines)

Multi-selection context menu, currently lines 1475-1614. Same pattern as above but for 2+ selected items.

**Interface:**
```typescript
function buildBulkContextMenu(opts: {
  selectedIds: Set<string>;
  selectedNodes: OutlineNode[];
  actions: {
    toggleSelectedCheckboxes: () => void;
    convertSelectedToType: (type: string) => void;
    indentSelectedNodes: () => void;
    outdentSelectedNodes: () => void;
    deleteSelectedNodes: () => void;
    // ... remaining bulk actions
  };
  ui: {
    copySelectedAsMarkdown: () => void;
    // ...
  };
}): MenuItem[]
```

**Risk:** Low. Same rationale as single-item menu.

### 5. `useNoteEditor.ts` — Custom hook (~75 lines)

Note editing state and handlers, currently lines 1158-1233 plus the `isEditingNote` state.

**Interface:**
```typescript
function useNoteEditor(opts: {
  nodeId: string;
  note: string | null;
  isFocused: boolean;
  noteInputRef: RefObject<HTMLTextAreaElement>;
  updateNote: (id: string, note: string) => void;
  setFocusedId: (id: string) => void;
  openNoteEditor: (id: string) => void;
}): {
  isEditingNote: boolean;
  setIsEditingNote: (v: boolean) => void;
  handleNoteInput: (e: ChangeEvent) => void;
  handleNoteKeydown: (e: KeyboardEvent) => void;
  handleNoteBlur: () => void;
  handleNoteClick: (e: MouseEvent) => void;
  renderNoteHtml: () => { __html: string };
}
```

**Risk:** Low. Isolated state, no coupling beyond store actions passed in.

### 6. `useDragDrop.ts` — Custom hook (~70 lines)

Drag & drop handlers and state, currently lines 1085-1151 plus `isDragOver`/`dropPosition` state.

**Interface:**
```typescript
function useDragDrop(opts: {
  nodeId: string;
  startDrag: (id: string) => void;
  endDrag: () => void;
  dropOnNode: (targetId: string, position: string) => void;
  draggedId: string | null;
}): {
  isDragOver: boolean;
  dropPosition: 'before' | 'after' | 'child' | null;
  handleDragStart: (e: DragEvent) => void;
  handleDragEnd: (e: DragEvent) => void;
  handleDragOver: (e: DragEvent) => void;
  handleDragLeave: (e: DragEvent) => void;
  handleDrop: (e: DragEvent) => void;
}
```

**Risk:** Low. Self-contained.

## File Structure

```
app/src/components/outline-item/
  index.tsx              (~850 lines) — OutlineItem component, wires hooks + renders
  useOutlineEditor.ts    (~717 lines) — TipTap editor lifecycle
  useSuggestions.ts      (~190 lines) — suggestion popups + date/recurrence pickers
  itemContextMenu.ts     (~208 lines) — single-item context menu builder
  bulkContextMenu.ts     (~140 lines) — bulk context menu builder
  useNoteEditor.ts       (~75 lines)  — note editing
  useDragDrop.ts         (~70 lines)  — drag & drop
```

Existing imports of `OutlineItem` from `'../components/OutlineItem'` or similar will need updating to `'../components/outline-item'` (the directory index re-export handles it).

## What Stays in index.tsx (~850 lines)

- Props interface and destructuring
- 60+ store selectors (these wire hooks to the store — the orchestration glue)
- `storeRef` initialization and sync effect
- `existingTags` useMemo
- Content sync effect (external changes → editor)
- 6 click handlers (handleRowClick, handleStaticClick, handleCollapseClick, handleBulletDblClick, handleCheckboxClick, handleModifierClickCapture)
- Context menu trigger (handleContextMenu, showContextMenu state)
- Class name building
- JSX return (237 lines)

850 lines is still substantial, but it's now all orchestration and rendering — no 700-line useEffects, no 200-line menu definitions. Each piece can be read and understood in isolation.

## Execution Order

Extract in order of risk (lowest first):
1. `itemContextMenu.ts` + `bulkContextMenu.ts` — pure functions, zero risk
2. `useDragDrop.ts` + `useNoteEditor.ts` — small isolated hooks
3. `useSuggestions.ts` — medium hook, sets up interface for step 4
4. `useOutlineEditor.ts` — largest extraction, depends on suggestion controls interface

Run `npm run check` after each extraction to catch type errors. Run Playwright tests after steps 2 and 4 to verify behavior.

## Testing Strategy

No new tests needed — this is a pure refactor. The existing Playwright E2E suite covers all the behavior being moved:
- Keyboard shortcuts, editing, navigation
- Context menus
- Drag and drop
- Wiki links, hashtags, dates
- Note editing

Run the full Playwright suite after the final extraction to confirm nothing broke.
