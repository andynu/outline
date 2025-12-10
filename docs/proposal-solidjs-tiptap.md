# Proposal: SolidJS + TipTap for Outliner Frontend

## Executive Summary

This proposal evaluates **SolidJS** with **TipTap** as the frontend stack for the Tauri-based outliner application. SolidJS offers exceptional performance through fine-grained reactivity ideal for tree structures, while TipTap provides a mature, extensible rich text editing foundation. This combination is well-suited for building a performant outliner with complex editing requirements.

---

## 1. Feature Coverage Analysis

### 1.1 Core Outliner (Hierarchy & Navigation)

| Feature | Support | Implementation |
|---------|---------|----------------|
| Infinite nesting | Partial | TipTap's `@tiptap/extension-list` supports nested lists but has [known issues](https://github.com/ueberdosis/tiptap/issues/1731) with deep nesting; custom OutlineNode recommended |
| Zoom in/out (hoisting) | Custom | Filter visible nodes based on focused context in Solid signals |
| Collapse/expand | Custom | Track collapsed state per node in Solid store; conditionally render children |
| Breadcrumb navigation | Custom | Derive ancestor chain from tree structure using signals |
| Drag-drop reorder | Yes | [solid-nest](https://github.com/Rafferty97/solid-nest) purpose-built for hierarchical drag-drop |

**Implementation approach**: Use TipTap for inline rich-text editing within each outline item, while managing tree structure separately with SolidJS signals/stores. This avoids fighting TipTap's list model.

```tsx
// Outline structure managed by Solid signals
import { createStore } from 'solid-js/store';

interface OutlineNode {
  id: string;
  parentId: string | null;
  content: string; // Serialized TipTap JSON
  collapsed: boolean;
  nodeType: 'bullet' | 'checkbox' | 'heading';
  children: string[]; // Child node IDs
}

const [outline, setOutline] = createStore<Record<string, OutlineNode>>({});

// Fine-grained updates - only the changed node rerenders
setOutline(nodeId, 'collapsed', true);
```

### 1.2 Node Types

| Feature | Support | Implementation |
|---------|---------|----------------|
| Bullet items | Native | Default TipTap list styling |
| Checkbox items | Yes | [TaskList extension](https://tiptap.dev/docs/editor/extensions/nodes/task-list) with checkbox toggle |
| Headings | Native | `@tiptap/extension-heading` (H1-H6) |
| Numbered lists | Native | `@tiptap/extension-ordered-list` |

### 1.3 Rich Text & Formatting

| Feature | Support | Implementation |
|---------|---------|----------------|
| Bold/Italic/Code | Native | [StarterKit](https://tiptap.dev/docs/editor/extensions/functionality/starterkit) includes all |
| Strikethrough | Native | `@tiptap/extension-strike` |
| Links | Native | [Link extension](https://tiptap.dev/docs/editor/extensions/marks/link) with autolink |
| Inline images | Native | `@tiptap/extension-image` |
| Code blocks | Native | `@tiptap/extension-code-block` with syntax highlighting via lowlight |
| LaTeX math | Extension | [@aarkue/tiptap-math-extension](https://github.com/aarkue/tiptap-math-extension) with KaTeX |

**Markdown shortcut support** via [Typography](https://tiptap.dev/docs/editor/extensions/marks/typography) and input rules:

```tsx
import StarterKit from '@tiptap/starter-kit';
import Typography from '@tiptap/extension-typography';

const editor = createTiptapEditor(() => ({
  extensions: [
    StarterKit,
    Typography, // Smart quotes, fractions, etc.
  ],
}));
```

### 1.4 Links & Mirrors

| Feature | Support | Implementation |
|---------|---------|----------------|
| `[[internal links]]` | Extension | [tiptap-wikilink-extension](https://github.com/aarkue/tiptap-wikilink-extension) provides `[[` trigger |
| Autocomplete | Yes | WikiLink extension includes suggestion rendering |
| Backlinks panel | Custom | Maintain link graph in Solid store, derive backlinks reactively |
| Node mirrors `(())` | Custom | MirrorNode pointing to source, sync via Solid effects |

**Internal links with autocomplete**:

```tsx
import { WikiLink } from 'tiptap-wikilink-extension';

const WikiLinkExtension = WikiLink.configure({
  onWikiLinkClick: (id, name, event) => {
    navigateToNode(id);
  },
  renderSuggestionFunction: (items, command, view) => {
    // Render SolidJS autocomplete popup
    return createSuggestionPopup(items, (item) => command({ id: item.id, name: item.title }));
  },
});
```

**Backlinks with fine-grained reactivity**:

```tsx
import { createMemo } from 'solid-js';

// Link index maintained as Solid store
const [links, setLinks] = createStore<{ sourceId: string; targetId: string }[]>([]);

// Backlinks derived reactively - updates only when relevant links change
const backlinksFor = (nodeId: string) => createMemo(() =>
  links.filter(link => link.targetId === nodeId)
    .map(link => outline[link.sourceId])
);
```

### 1.5 Task Management

| Feature | Support | Implementation |
|---------|---------|----------------|
| Checkbox toggle | Native | TaskItem extension, Ctrl+Shift+C binding |
| Natural language dates | External | [chrono-node](https://github.com/wanasit/chrono) for parsing "tomorrow", "next monday" |
| Date picker UI | Custom | Solid date picker component or port from React ecosystem |
| Recurring tasks | Custom | Store RRULE format, parse with rrule.js |
| Overdue highlighting | Custom | Reactive CSS class based on date comparison |

**Date handling with Solid reactivity**:

```tsx
import { createSignal, createEffect } from 'solid-js';
import * as chrono from 'chrono-node';

const [dateInput, setDateInput] = createSignal('');
const parsedDate = () => chrono.parseDate(dateInput());

// Reactive overdue check
const isOverdue = () => {
  const date = parsedDate();
  return date && date < new Date();
};

// Automatically apply overdue styling
createEffect(() => {
  element.classList.toggle('overdue', isOverdue());
});
```

### 1.6 Search & Navigation

| Feature | Support | Implementation |
|---------|---------|----------------|
| Full-text search | External | [MiniSearch](https://github.com/lucaong/minisearch) or [FlexSearch](https://github.com/nextapps-de/flexsearch) |
| Filtered search | Custom | Query parser for `#tag`, `has:date`, `color:red` syntax |
| File Finder | Custom | Command palette pattern with [@solid-aria](https://github.com/solidjs-community/solid-aria) |
| Item Finder | Custom | Same architecture, index all node titles |

**Reactive search with MiniSearch**:

```tsx
import MiniSearch from 'minisearch';
import { createSignal, createMemo } from 'solid-js';

const miniSearch = new MiniSearch({
  fields: ['content', 'note'],
  storeFields: ['id', 'content'],
});

const [query, setQuery] = createSignal('');

// Results update reactively as query changes
const searchResults = createMemo(() => {
  const q = query();
  return q.length > 1 ? miniSearch.search(q, { fuzzy: 0.2 }) : [];
});
```

### 1.7 Keyboard-First Design

| Feature | Support | Implementation |
|---------|---------|----------------|
| Arrow navigation | Native | TipTap handles cursor movement |
| Tab/Shift+Tab indent | Custom | TipTap keyboard shortcuts API |
| Custom shortcuts | Yes | [addKeyboardShortcuts](https://tiptap.dev/docs/editor/core-concepts/keyboard-shortcuts) extension method |
| Shortcut customization | Custom | Store bindings in Solid signal, apply at runtime |

**TipTap keyboard shortcuts**:

```tsx
import { Extension } from '@tiptap/core';

const OutlinerShortcuts = Extension.create({
  name: 'outlinerShortcuts',

  addKeyboardShortcuts() {
    return {
      'Mod-]': () => {
        zoomToNode(this.editor);
        return true;
      },
      'Mod-[': () => {
        zoomOut();
        return true;
      },
      'Mod-.': () => {
        toggleCollapse(this.editor);
        return true;
      },
      'Mod-Shift-c': () => {
        this.editor.commands.toggleTaskList();
        return true;
      },
    };
  },
});
```

### 1.8 Views & Themes

| Feature | Support | Implementation |
|---------|---------|----------------|
| Outline view | Default | Primary editing mode |
| Article view | Custom | Read-only render without bullets |
| Light/Dark themes | Native | CSS custom properties + Solid signal for theme state |
| Custom CSS | Native | Standard CSS with dynamic class bindings |

**Theme system with Solid**:

```tsx
import { createSignal, createEffect } from 'solid-js';

type Theme = 'light' | 'dark' | 'sepia';
const [theme, setTheme] = createSignal<Theme>('light');

// Apply theme class to document root
createEffect(() => {
  document.documentElement.className = `theme-${theme()}`;
});

// Theme-aware component styling
const OutlineItem = () => (
  <div class={`outline-item theme-${theme()}`}>
    {/* content */}
  </div>
);
```

---

## 2. Library Stack

### Core Framework

```json
{
  "dependencies": {
    "solid-js": "^1.9.0",
    "@tiptap/core": "^2.10.0",
    "@tiptap/pm": "^2.10.0",
    "@tiptap/starter-kit": "^2.10.0",
    "@tiptap/extension-link": "^2.10.0",
    "@tiptap/extension-image": "^2.10.0",
    "@tiptap/extension-task-list": "^2.10.0",
    "@tiptap/extension-task-item": "^2.10.0"
  }
}
```

### SolidJS/TipTap Bindings

Two options available:

1. **[solid-tiptap](https://github.com/lxsmnsyc/solid-tiptap)** by lxsmnsyc
   - `createTiptapEditor` for reactive editor creation
   - `useEditorHTML`, `useEditorIsActive` for subscriptions
   - Well-maintained, follows Solid conventions

2. **[@vrite/tiptap-solid](https://github.com/vriteio/tiptap-solid)** by Vrite
   - Based on official @tiptap/react, adapted for Solid
   - `SolidNodeViewRenderer` for custom node views
   - Used in production by Vrite CMS

**Recommendation**: Use `solid-tiptap` for simpler projects, `@vrite/tiptap-solid` if custom node views are needed.

### Additional Dependencies

| Need | Package | Size |
|------|---------|------|
| Tree drag-drop | [solid-nest](https://github.com/Rafferty97/solid-nest) | ~8kB |
| Utility primitives | [@solid-primitives/*](https://primitives.solidjs.community/) | Modular |
| Date parsing | chrono-node | ~39kB |
| Search | minisearch | ~10kB |
| Math rendering | katex | ~280kB (lazy-load) |
| Virtualization | [@tanstack/solid-virtual](https://tanstack.com/virtual/latest) | ~10kB |
| WikiLinks | tiptap-wikilink-extension | ~5kB |

**Total estimated bundle** (excluding Solid core): ~350kB before tree-shaking

---

## 3. Code Examples

### 3.1 Basic Editor Setup with solid-tiptap

```tsx
import { createTiptapEditor, useEditorHTML } from 'solid-tiptap';
import StarterKit from '@tiptap/starter-kit';
import Link from '@tiptap/extension-link';
import TaskList from '@tiptap/extension-task-list';
import TaskItem from '@tiptap/extension-task-item';
import { onCleanup, onMount } from 'solid-js';

interface OutlineEditorProps {
  content: string;
  onUpdate: (html: string) => void;
}

function OutlineEditor(props: OutlineEditorProps) {
  let editorRef: HTMLDivElement;

  const editor = createTiptapEditor(() => ({
    element: editorRef!,
    extensions: [
      StarterKit,
      Link.configure({ openOnClick: false }),
      TaskList,
      TaskItem.configure({ nested: true }),
      WikiLink,
      OutlinerShortcuts,
    ],
    content: props.content,
    onUpdate: ({ editor }) => {
      props.onUpdate(editor.getHTML());
    },
  }));

  // Reactive HTML subscription
  const html = useEditorHTML(editor);

  onCleanup(() => editor()?.destroy());

  return (
    <div ref={editorRef!} class="tiptap-editor" />
  );
}
```

### 3.2 Outline Tree with solid-nest

```tsx
import { BlockTree } from 'solid-nest';
import { createStore } from 'solid-js/store';
import { For, Show } from 'solid-js';

interface OutlineBlock {
  id: string;
  content: string;
  collapsed: boolean;
  children: OutlineBlock[];
}

function OutlineTree() {
  const [blocks, setBlocks] = createStore<OutlineBlock[]>([]);

  const handleMove = (event: { blockId: string; parentId: string | null; index: number }) => {
    // Update tree structure
    moveBlock(event.blockId, event.parentId, event.index);
  };

  return (
    <BlockTree
      blocks={blocks}
      onMove={handleMove}
      renderBlock={(block, depth) => (
        <OutlineItem
          block={block}
          depth={depth}
          onToggleCollapse={() => setBlocks(
            b => b.id === block.id,
            'collapsed',
            c => !c
          )}
        />
      )}
    />
  );
}

function OutlineItem(props: { block: OutlineBlock; depth: number; onToggleCollapse: () => void }) {
  return (
    <div class="outline-item" style={{ 'margin-left': `${props.depth * 24}px` }}>
      <button
        class="collapse-toggle"
        onClick={props.onToggleCollapse}
        data-drag-handle
      >
        {props.block.collapsed ? '>' : 'v'}
      </button>
      <OutlineEditor
        content={props.block.content}
        onUpdate={(html) => updateBlockContent(props.block.id, html)}
      />
    </div>
  );
}
```

### 3.3 Fine-Grained Reactive Tree Store

```tsx
import { createStore, produce } from 'solid-js/store';
import { createSignal, createMemo, createEffect, batch } from 'solid-js';

interface TreeState {
  nodes: Record<string, OutlineNode>;
  rootIds: string[];
  focusedId: string | null; // Current zoom context
}

const [tree, setTree] = createStore<TreeState>({
  nodes: {},
  rootIds: [],
  focusedId: null,
});

// Zoom into a node (hoisting)
function zoomTo(nodeId: string) {
  setTree('focusedId', nodeId);
}

function zoomOut() {
  const current = tree.focusedId;
  if (current) {
    const parent = tree.nodes[current]?.parentId;
    setTree('focusedId', parent);
  }
}

// Breadcrumb path - derived reactively
const breadcrumbs = createMemo(() => {
  const path: string[] = [];
  let current = tree.focusedId;
  while (current) {
    path.unshift(current);
    current = tree.nodes[current]?.parentId ?? null;
  }
  return path;
});

// Visible nodes based on zoom context
const visibleRoots = createMemo(() => {
  if (tree.focusedId) {
    return [tree.focusedId];
  }
  return tree.rootIds;
});

// Toggle collapse with fine-grained update
function toggleCollapse(nodeId: string) {
  setTree('nodes', nodeId, 'collapsed', (c) => !c);
}

// Move node (drag-drop)
function moveNode(nodeId: string, newParentId: string | null, index: number) {
  setTree(produce((state) => {
    const node = state.nodes[nodeId];
    const oldParentId = node.parentId;

    // Remove from old parent
    if (oldParentId) {
      const oldParent = state.nodes[oldParentId];
      oldParent.children = oldParent.children.filter(id => id !== nodeId);
    } else {
      state.rootIds = state.rootIds.filter(id => id !== nodeId);
    }

    // Add to new parent
    node.parentId = newParentId;
    if (newParentId) {
      const newParent = state.nodes[newParentId];
      newParent.children.splice(index, 0, nodeId);
    } else {
      state.rootIds.splice(index, 0, nodeId);
    }
  }));
}
```

### 3.4 Mirror Node Implementation

```tsx
import { createMemo, Show } from 'solid-js';

interface MirrorNode {
  id: string;
  sourceId: string; // ID of the original node
  type: 'mirror';
}

// Resolve mirror to source content reactively
function MirrorRenderer(props: { mirrorId: string }) {
  const mirror = () => tree.nodes[props.mirrorId] as MirrorNode;
  const sourceNode = createMemo(() => tree.nodes[mirror().sourceId]);

  return (
    <Show when={sourceNode()}>
      <div class="mirror-node">
        <span class="mirror-indicator" title="This is a mirror">
          ↔
        </span>
        <OutlineEditor
          content={sourceNode()!.content}
          onUpdate={(html) => {
            // Update source - all mirrors see change via reactivity
            setTree('nodes', mirror().sourceId, 'content', html);
          }}
        />
      </div>
    </Show>
  );
}

// Create a mirror of a node
function createMirror(sourceId: string, parentId: string | null): string {
  const mirrorId = generateId();

  setTree(produce((state) => {
    state.nodes[mirrorId] = {
      id: mirrorId,
      type: 'mirror',
      sourceId,
      parentId,
      collapsed: false,
      children: [],
    };

    if (parentId) {
      state.nodes[parentId].children.push(mirrorId);
    } else {
      state.rootIds.push(mirrorId);
    }
  }));

  return mirrorId;
}
```

---

## 4. Performance Advantages of Fine-Grained Reactivity

### 4.1 Why SolidJS Excels for Tree Structures

1. **No Virtual DOM diffing**: SolidJS updates the exact DOM nodes that depend on changed data, without diffing entire component subtrees.

2. **Granular store updates**: Updating `tree.nodes[nodeId].collapsed` only re-renders that specific node, not the entire tree.

3. **Efficient list rendering**: Solid's `<For>` component tracks items by reference, minimizing DOM operations when children reorder.

4. **No re-render cascades**: Unlike React where parent re-renders trigger child re-renders, Solid components only re-run when their specific dependencies change.

```tsx
// React: Editing node A re-renders entire tree (without careful memoization)
// SolidJS: Editing node A updates only node A's content element

// This is automatic - no React.memo, useMemo, or useCallback needed
const NodeContent = (props: { nodeId: string }) => {
  // Only re-runs when this specific node's content changes
  return <div>{tree.nodes[props.nodeId].content}</div>;
};
```

### 4.2 Performance for Large Trees

| Concern | SolidJS Approach |
|---------|------------------|
| 10,000+ nodes | Virtualization with @tanstack/solid-virtual |
| Deep nesting | Only visible (uncollapsed) nodes render |
| Frequent edits | Store updates are O(1), DOM updates are surgical |
| Initial load | Streaming with SolidStart; lazy-init TipTap editors |

### 4.3 Virtualization with TanStack Virtual

```tsx
import { createVirtualizer } from '@tanstack/solid-virtual';
import { createMemo, For } from 'solid-js';

function VirtualizedOutline() {
  // Flatten tree for virtualization
  const flatNodes = createMemo(() => {
    const result: { id: string; depth: number }[] = [];

    function traverse(ids: string[], depth: number) {
      for (const id of ids) {
        const node = tree.nodes[id];
        result.push({ id, depth });
        if (!node.collapsed && node.children.length) {
          traverse(node.children, depth + 1);
        }
      }
    }

    traverse(visibleRoots(), 0);
    return result;
  });

  let containerRef: HTMLDivElement;

  const virtualizer = createVirtualizer(() => ({
    count: flatNodes().length,
    getScrollElement: () => containerRef,
    estimateSize: () => 32,
    overscan: 5,
  }));

  return (
    <div ref={containerRef!} class="outline-container" style={{ height: '100vh', overflow: 'auto' }}>
      <div style={{ height: `${virtualizer.getTotalSize()}px`, position: 'relative' }}>
        <For each={virtualizer.getVirtualItems()}>
          {(virtualItem) => {
            const item = () => flatNodes()[virtualItem.index];
            return (
              <div
                style={{
                  position: 'absolute',
                  top: `${virtualItem.start}px`,
                  height: `${virtualItem.size}px`,
                  'padding-left': `${item().depth * 24}px`,
                }}
              >
                <OutlineItem nodeId={item().id} />
              </div>
            );
          }}
        </For>
      </div>
    </div>
  );
}
```

---

## 5. TipTap/Solid Integration Specifics

### 5.1 Integration Maturity

| Aspect | Status |
|--------|--------|
| Official TipTap support | No official adapter (React/Vue only) |
| Community libraries | Two mature options: solid-tiptap, @vrite/tiptap-solid |
| Custom node views | Supported via SolidNodeViewRenderer in @vrite/tiptap-solid |
| Production usage | Vrite CMS uses TipTap+Solid in production |
| Maintenance | Both libraries actively maintained as of 2025 |

### 5.2 solid-tiptap API

```tsx
import {
  createTiptapEditor,
  useEditorHTML,
  useEditorIsActive,
  createEditorTransaction
} from 'solid-tiptap';

function RichTextToolbar() {
  const editor = useEditor(); // Context-provided

  // Reactive active state checks
  const isBold = useEditorIsActive(editor, 'bold');
  const isItalic = useEditorIsActive(editor, 'italic');

  // Safe command execution with transaction
  const toggleBold = createEditorTransaction(
    editor,
    (e) => e.chain().focus().toggleBold().run()
  );

  return (
    <div class="toolbar">
      <button class={isBold() ? 'active' : ''} onClick={toggleBold}>
        Bold
      </button>
      <button class={isItalic() ? 'active' : ''} onClick={() =>
        editor()?.chain().focus().toggleItalic().run()
      }>
        Italic
      </button>
    </div>
  );
}
```

### 5.3 Custom Node View with Solid

Using @vrite/tiptap-solid for complex node views:

```tsx
import { SolidNodeViewRenderer, NodeViewWrapper } from '@vrite/tiptap-solid';
import { Node } from '@tiptap/core';

// Custom date node with picker
const DateNode = Node.create({
  name: 'date',
  group: 'inline',
  inline: true,
  atom: true,

  addAttributes() {
    return {
      date: { default: null },
      recurrence: { default: null },
    };
  },

  addNodeView() {
    return SolidNodeViewRenderer(DateNodeView);
  },
});

function DateNodeView(props: NodeViewProps) {
  const [showPicker, setShowPicker] = createSignal(false);

  const date = () => props.node.attrs.date;
  const isOverdue = () => date() && new Date(date()) < new Date();

  return (
    <NodeViewWrapper as="span" class="date-node">
      <span
        class={`date-badge ${isOverdue() ? 'overdue' : ''}`}
        onClick={() => setShowPicker(true)}
      >
        {formatDate(date())}
      </span>
      <Show when={showPicker()}>
        <DatePicker
          value={date()}
          onChange={(newDate) => {
            props.updateAttributes({ date: newDate });
            setShowPicker(false);
          }}
        />
      </Show>
    </NodeViewWrapper>
  );
}
```

---

## 6. Tauri Integration

### 6.1 Project Setup

```bash
# Create Tauri + SolidJS project
npm create tauri-app@latest -- --template solid-ts
cd outliner
npm install @tiptap/core @tiptap/starter-kit solid-tiptap
```

### 6.2 Rust-Frontend Communication

```rust
// src-tauri/src/main.rs
use tauri::Manager;
use serde::{Deserialize, Serialize};

#[derive(Serialize, Deserialize)]
struct OutlineDocument {
    id: String,
    nodes: serde_json::Value,
    root_ids: Vec<String>,
}

#[tauri::command]
async fn save_document(id: String, document: OutlineDocument) -> Result<(), String> {
    // Persist to SQLite
    Ok(())
}

#[tauri::command]
async fn load_document(id: String) -> Result<OutlineDocument, String> {
    // Load from SQLite
    Ok(OutlineDocument {
        id,
        nodes: serde_json::json!({}),
        root_ids: vec![]
    })
}
```

```tsx
// Frontend - Solid integration
import { invoke } from '@tauri-apps/api/core';
import { createResource } from 'solid-js';

// Reactive document loading
const [document, { refetch }] = createResource(
  () => documentId(),
  (id) => invoke('load_document', { id })
);

// Auto-save with debounce
import { createDebounce } from '@solid-primitives/scheduled';

const debouncedSave = createDebounce(
  (doc: OutlineDocument) => invoke('save_document', { id: doc.id, document: doc }),
  1000
);

// Effect to auto-save on changes
createEffect(() => {
  if (tree.nodes && Object.keys(tree.nodes).length > 0) {
    debouncedSave({
      id: documentId(),
      nodes: tree.nodes,
      root_ids: tree.rootIds,
    });
  }
});
```

### 6.3 Tauri + Solid Templates

Several community templates available:
- [tauri-start-solid](https://github.com/riipandi/tauri-start-solid) - Full-featured with tray support, TypeScript, Tailwind
- [ZanzyTHEbar/SolidJSTauri](https://github.com/ZanzyTHEbar/SolidJSTauri) - Fully-featured template

---

## 7. Risks and Mitigations

| Risk | Severity | Mitigation |
|------|----------|------------|
| **No official TipTap/Solid adapter** | Medium | solid-tiptap and @vrite/tiptap-solid are mature; Vrite uses in production |
| **SolidJS ecosystem smaller than React** | Medium | Core libraries exist; @solid-primitives fills gaps; growing community |
| **TipTap nested list bugs** | Medium | Use custom OutlineNode structure; TipTap for inline content only |
| **solid-nest not as mature as dnd-kit** | Medium | Alternative: port dnd-kit patterns or use solid-dnd-directive |
| **Fewer SolidJS developers** | Low | JSX familiarity eases onboarding; Solid concepts are simpler than React hooks |
| **Bundle size with KaTeX** | Low | Lazy-load math renderer only when equations detected |

### Critical Path Items

1. **Validate TipTap/Solid integration** - Build minimal editor with custom node views
2. **solid-nest evaluation** - Test with 3+ level deep drag-drop
3. **Mirror sync mechanism** - Prototype bidirectional updates

---

## 8. Ecosystem Maturity Assessment

| Aspect | Rating | Notes |
|--------|--------|-------|
| **SolidJS core** | Excellent | Stable 1.x, used by Netflix, Cloudflare, Microsoft |
| **SolidJS ecosystem** | Good | [@solid-primitives](https://primitives.solidjs.community/) covers 80% of needs |
| **TipTap** | Excellent | Mature, 100+ extensions, active development |
| **TipTap/Solid adapters** | Good | Two maintained options, production usage at Vrite |
| **TypeScript support** | Excellent | First-class in both SolidJS and TipTap |
| **Tauri + Solid** | Good | Official template, community templates available |
| **Community resources** | Growing | Solid Discord active; TipTap docs comprehensive |

### Production Usage

- **SolidJS**: Netflix, Cloudflare, Microsoft
- **TipTap + Solid**: Vrite CMS
- **Tauri + Solid**: Various community projects

### Comparison to Alternatives

| Criterion | SolidJS+TipTap | React+Lexical | Svelte5+TipTap |
|-----------|----------------|---------------|-----------------|
| Performance (reactivity) | Best | Good | Very Good |
| Ecosystem size | Small | Largest | Medium |
| Editor maturity | Mature | Good | Mature |
| Framework maturity | Stable | Stable | New (v5) |
| Bundle size | Small | Medium | Smallest |
| Learning curve | Moderate | Moderate | Low |

---

## 9. Recommendation

### Verdict: **Strong Candidate for Performance-Critical Outliner**

SolidJS + TipTap is recommended if:
- Fine-grained reactivity is valued for tree performance
- Bundle size is a concern
- Team is open to learning SolidJS (JSX familiarity helps)
- Production validation from Vrite is reassuring

### Key Advantages

1. **Performance**: Fine-grained reactivity is ideal for frequently-updated tree structures
2. **Bundle size**: Smaller than React + Lexical
3. **TipTap maturity**: Battle-tested editor with extensive extensions
4. **Developer experience**: Simple mental model, no hook rules or useMemo gymnastics

### Estimated Custom Development

| Component | Effort |
|-----------|--------|
| TipTap/Solid integration validation | Low |
| Outline tree structure with stores | Medium |
| Zoom/hoist navigation | Medium |
| Wiki-link with autocomplete | Low (extension exists) |
| Mirror node sync | High |
| Drag-drop with solid-nest | Medium |
| Keyboard shortcuts | Low |
| Virtualization | Medium |

---

## 10. Prototype Recommendations

Before committing, build a focused prototype covering:

1. **TipTap editor** with solid-tiptap, including bold/italic/links
2. **Nested outline** with 3+ levels using Solid stores
3. **Collapse/expand** with fine-grained updates
4. **Drag-drop reorder** with solid-nest
5. **Zoom to node** filtering visible items
6. **Persistence round-trip** (serialize -> Tauri/SQLite -> deserialize)

---

## References

- [SolidJS Documentation](https://docs.solidjs.com/)
- [SolidJS Fine-Grained Reactivity](https://docs.solidjs.com/advanced-concepts/fine-grained-reactivity)
- [solid-tiptap](https://github.com/lxsmnsyc/solid-tiptap)
- [@vrite/tiptap-solid](https://github.com/vriteio/tiptap-solid)
- [TipTap Documentation](https://tiptap.dev/docs/editor/getting-started/overview)
- [tiptap-wikilink-extension](https://github.com/aarkue/tiptap-wikilink-extension)
- [solid-nest](https://github.com/Rafferty97/solid-nest)
- [@solid-primitives](https://primitives.solidjs.community/)
- [@tanstack/solid-virtual](https://tanstack.com/virtual/latest)
- [Solid Primitives Overview](https://best-of-web.builder.io/library/solidjs-community/solid-primitives)
- [Tauri + SolidJS Tutorial](https://blog.logrocket.com/rust-solid-js-tauri-desktop-app/)
- [tauri-start-solid template](https://github.com/riipandi/tauri-start-solid)
