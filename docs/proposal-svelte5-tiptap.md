# Proposal: Svelte 5 + TipTap for Outliner Frontend

## Executive Summary

This proposal evaluates **Svelte 5** (with Runes) + **TipTap** as the frontend stack for the Tauri-based outliner application. Svelte 5 introduces a signal-based reactivity system (Runes) that enables fine-grained updates comparable to SolidJS, while TipTap provides a mature, extensible rich text editing foundation. This combination offers an excellent developer experience with minimal boilerplate and strong performance characteristics.

---

## 1. Feature Coverage Analysis

### 1.1 Core Outliner (Hierarchy & Navigation)

| Feature | Support | Implementation |
|---------|---------|----------------|
| Infinite nesting | Partial | TipTap's `@tiptap/extension-list` has [known issues](https://github.com/ueberdosis/tiptap/issues/1731) with deep nesting; custom OutlineNode recommended |
| Zoom in/out (hoisting) | Custom | Filter visible nodes via Svelte 5 `$state` and `$derived` runes |
| Collapse/expand | Custom | Track collapsed state per node in `$state`; conditionally render children |
| Breadcrumb navigation | Custom | Derive ancestor chain using `$derived` from tree structure |
| Drag-drop reorder | Yes | [svelte-dnd-action](https://github.com/isaacHagoel/svelte-dnd-action) supports nested zones, works with Svelte 5 |

**Implementation approach**: Manage tree structure separately with Svelte 5 `$state`, use TipTap for inline rich-text editing within each outline item. This avoids fighting TipTap's list model.

```svelte
<script lang="ts">
  // Svelte 5 runes for reactive tree state
  interface OutlineNode {
    id: string;
    parentId: string | null;
    content: string; // Serialized TipTap JSON
    collapsed: boolean;
    nodeType: 'bullet' | 'checkbox' | 'heading';
    children: string[];
  }

  let nodes: Record<string, OutlineNode> = $state({});
  let focusedNodeId: string | null = $state(null);

  // Derived breadcrumb path - updates automatically when focusedNodeId changes
  let breadcrumbs = $derived(() => {
    const path: string[] = [];
    let current = focusedNodeId;
    while (current) {
      path.unshift(current);
      current = nodes[current]?.parentId ?? null;
    }
    return path;
  });

  // Toggle collapse with surgical update
  function toggleCollapse(nodeId: string) {
    nodes[nodeId].collapsed = !nodes[nodeId].collapsed;
  }
</script>
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

**Markdown shortcut support** via input rules:

```svelte
<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import { Editor } from '@tiptap/core';
  import StarterKit from '@tiptap/starter-kit';
  import Link from '@tiptap/extension-link';

  let editor: Editor | null = $state(null);
  let element: HTMLElement;

  onMount(() => {
    editor = new Editor({
      element,
      extensions: [
        StarterKit,
        Link.configure({ openOnClick: false }),
      ],
      content: '<p>Hello world!</p>',
      onTransaction: () => {
        // Force reactivity update
        editor = editor;
      },
    });
  });

  onDestroy(() => {
    editor?.destroy();
  });
</script>

<div bind:this={element} class="tiptap-editor"></div>
```

### 1.4 Links & Mirrors

| Feature | Support | Implementation |
|---------|---------|----------------|
| `[[internal links]]` | Extension | Use TipTap [Suggestion utility](https://tiptap.dev/docs/editor/api/utilities/suggestion) with `[[` trigger |
| Autocomplete | Yes | Suggestion utility provides full autocomplete support |
| Backlinks panel | Custom | Maintain link graph in `$state`, derive backlinks with `$derived` |
| Node mirrors `(())` | Custom | MirrorNode pointing to source, sync via `$effect` |

**Internal links with autocomplete**:

```svelte
<script lang="ts">
  import { Suggestion } from '@tiptap/suggestion';

  // Custom WikiLink extension
  const WikiLinkSuggestion = {
    char: '[[',
    items: async ({ query }) => {
      // Search nodes by title
      const results = await searchNodes(query);
      return results.slice(0, 10);
    },
    render: () => {
      let popup: SvelteComponent;
      return {
        onStart: (props) => {
          popup = new AutocompletePopup({
            target: document.body,
            props: { items: props.items, command: props.command },
          });
        },
        onUpdate: (props) => {
          popup.$set({ items: props.items });
        },
        onExit: () => {
          popup.$destroy();
        },
      };
    },
  };
</script>
```

**Backlinks with fine-grained reactivity**:

```svelte
<script lang="ts">
  interface Link { sourceId: string; targetId: string; }

  let links: Link[] = $state([]);
  let currentNodeId: string = $state('');

  // Backlinks derived reactively - updates only when links or currentNodeId change
  let backlinks = $derived(
    links
      .filter(link => link.targetId === currentNodeId)
      .map(link => nodes[link.sourceId])
  );
</script>

<aside class="backlinks-panel">
  <h3>Backlinks</h3>
  {#if backlinks.length === 0}
    <p>No backlinks</p>
  {:else}
    {#each backlinks as backlink (backlink.id)}
      <BacklinkItem node={backlink} />
    {/each}
  {/if}
</aside>
```

### 1.5 Task Management

| Feature | Support | Implementation |
|---------|---------|----------------|
| Checkbox toggle | Native | TaskItem extension, Ctrl+Shift+C binding |
| Natural language dates | External | [chrono-node](https://github.com/wanasit/chrono) for parsing "tomorrow", "next monday" |
| Date picker UI | Custom | Svelte date picker component |
| Recurring tasks | Custom | Store RRULE format, parse with rrule.js |
| Overdue highlighting | Custom | Reactive CSS class based on date comparison |

**Date handling with Svelte 5 reactivity**:

```svelte
<script lang="ts">
  import * as chrono from 'chrono-node';

  let dateInput: string = $state('');

  // Automatically parse natural language dates
  let parsedDate = $derived(chrono.parseDate(dateInput));

  // Reactive overdue check
  let isOverdue = $derived(parsedDate && parsedDate < new Date());
</script>

<span class="date-badge" class:overdue={isOverdue}>
  {parsedDate ? formatDate(parsedDate) : dateInput}
</span>
```

### 1.6 Search & Navigation

| Feature | Support | Implementation |
|---------|---------|----------------|
| Full-text search | External | [MiniSearch](https://github.com/lucaong/minisearch) or [FlexSearch](https://github.com/nextapps-de/flexsearch) |
| Filtered search | Custom | Query parser for `#tag`, `has:date`, `color:red` syntax |
| File Finder | Custom | Command palette pattern (ninja-keys or svelte-command-palette) |
| Item Finder | Custom | Same architecture, index all node titles |

**Reactive search with MiniSearch**:

```svelte
<script lang="ts">
  import MiniSearch from 'minisearch';

  const miniSearch = new MiniSearch({
    fields: ['content', 'note'],
    storeFields: ['id', 'content'],
  });

  let query: string = $state('');

  // Debounced search results
  let searchResults = $derived(
    query.length > 1
      ? miniSearch.search(query, { fuzzy: 0.2 })
      : []
  );
</script>

<input
  type="text"
  placeholder="Search... (#tag, has:date, overdue:)"
  bind:value={query}
/>

<div class="results">
  {#each searchResults as result (result.id)}
    <SearchResult {result} />
  {/each}
</div>
```

### 1.7 Keyboard-First Design

| Feature | Support | Implementation |
|---------|---------|----------------|
| Arrow navigation | Native | TipTap handles cursor movement |
| Tab/Shift+Tab indent | Custom | TipTap keyboard shortcuts API |
| Custom shortcuts | Yes | [addKeyboardShortcuts](https://tiptap.dev/docs/editor/core-concepts/keyboard-shortcuts) extension method |
| Shortcut customization | Custom | Store bindings in `$state`, apply at runtime |

**TipTap keyboard shortcuts**:

```typescript
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

**Global shortcuts with @svelte-put/shortcut**:

```svelte
<script lang="ts">
  import { shortcut } from '@svelte-put/shortcut';

  function handleQuickFind() {
    openFileFinder();
  }
</script>

<svelte:window
  use:shortcut={{
    trigger: { key: 'k', modifier: ['ctrl', 'meta'] },
    callback: handleQuickFind,
  }}
/>
```

### 1.8 Views & Themes

| Feature | Support | Implementation |
|---------|---------|----------------|
| Outline view | Default | Primary editing mode |
| Article view | Custom | Read-only render without bullets |
| Light/Dark themes | Native | CSS custom properties + `$state` for theme state |
| Custom CSS | Native | Standard CSS with Svelte's scoped styles |

**Theme system with Svelte 5**:

```svelte
<script lang="ts">
  type Theme = 'light' | 'dark' | 'sepia';
  let theme: Theme = $state('light');

  // Apply theme class to document root
  $effect(() => {
    document.documentElement.className = `theme-${theme}`;
  });
</script>
```

---

## 2. Svelte 5 Runes and Fine-Grained Reactivity

### 2.1 Why Svelte 5 Runes Excel for Tree Structures

Svelte 5's runes system provides truly fine-grained reactivity similar to SolidJS signals:

1. **`$state`**: Creates reactive state. When a `$state` value changes, only the specific `$derived` values and `$effect`s that depend on it are updated.

2. **`$derived`**: Computes values that automatically update when dependencies change. Memoized—calculated only when needed.

3. **`$effect`**: Runs side effects when dependencies change. Perfect for syncing with external systems.

4. **Deep reactivity**: Svelte 5 runes are deeply reactive—if you update a property inside an object or push an item onto an array, those changes are correctly reflected.

```svelte
<script lang="ts">
  // Tree structure with fine-grained updates
  let nodes = $state<Record<string, OutlineNode>>({});
  let focusedId = $state<string | null>(null);

  // Only reruns when focusedId or specific node changes
  let visibleNodes = $derived(
    focusedId
      ? [focusedId]
      : Object.keys(nodes).filter(id => nodes[id].parentId === null)
  );

  // Toggle collapse - only affected node updates
  function toggleCollapse(nodeId: string) {
    nodes[nodeId].collapsed = !nodes[nodeId].collapsed;
    // No explicit rerender needed - Svelte tracks this automatically
  }
</script>
```

### 2.2 Universal Reactivity (Outside Components)

Svelte 5 runes can be used outside components in `.svelte.js` or `.svelte.ts` files:

```typescript
// stores/outline.svelte.ts
interface TreeState {
  nodes: Record<string, OutlineNode>;
  rootIds: string[];
  focusedId: string | null;
}

export const tree = $state<TreeState>({
  nodes: {},
  rootIds: [],
  focusedId: null,
});

export function zoomTo(nodeId: string) {
  tree.focusedId = nodeId;
}

export function zoomOut() {
  const current = tree.focusedId;
  if (current) {
    tree.focusedId = tree.nodes[current]?.parentId ?? null;
  }
}

// Derived values accessible anywhere
export const breadcrumbs = $derived(() => {
  const path: string[] = [];
  let current = tree.focusedId;
  while (current) {
    path.unshift(current);
    current = tree.nodes[current]?.parentId ?? null;
  }
  return path;
});
```

### 2.3 Performance Comparison

| Concern | Svelte 5 Approach |
|---------|-------------------|
| 10,000+ nodes | Virtualization with @humanspeak/svelte-virtual-list |
| Deep nesting | Only visible (uncollapsed) nodes render |
| Frequent edits | `$state` updates are O(1), DOM updates are surgical |
| Initial load | Svelte compiles to vanilla JS—no runtime overhead |
| Bundle size | ~3-10KB for simple apps vs React's ~40KB |

Performance benchmarks show Svelte 5 apps startup 2-3x faster than React equivalents, with 30% faster load times on average.

---

## 3. Library Stack

### Core Framework

```json
{
  "dependencies": {
    "svelte": "^5.0.0",
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

### TipTap/Svelte Bindings

Two options available:

1. **[svelte-tiptap](https://github.com/sibiraj-s/svelte-tiptap)** (v3.0.1)
   - `createEditor` for editor creation
   - `SvelteNodeViewRenderer` for custom node views
   - Updated for Svelte 5 with runes syntax support
   - Used by 15+ npm projects

2. **[Tipex](https://github.com/friendofsvelte/tipex)** by Friend of Svelte
   - Purpose-built for Svelte 5 with runes, snippets
   - Smart control system with floating menus
   - Built with Tailwind CSS v4
   - More opinionated but batteries-included

**Recommendation**: Use `svelte-tiptap` for maximum flexibility; consider `Tipex` if you want a more complete out-of-box solution.

### Additional Dependencies

| Need | Package | Size |
|------|---------|------|
| Tree drag-drop | [svelte-dnd-action](https://github.com/isaacHagoel/svelte-dnd-action) | ~15kB |
| Utility runes | [runed](https://runed.dev/) | Modular |
| Date parsing | chrono-node | ~39kB |
| Search | minisearch | ~10kB |
| Math rendering | katex | ~280kB (lazy-load) |
| Virtualization | [@humanspeak/svelte-virtual-list](https://virtuallist.svelte.page/) | ~5kB |
| Keyboard shortcuts | [@svelte-put/shortcut](https://svelte-put.vnphanquang.com/docs/shortcut) | ~3kB |
| Command palette | [ninja-keys](https://github.com/ssleptsov/ninja-keys) | ~8kB |

**Total estimated bundle** (excluding Svelte core): ~360kB before tree-shaking

---

## 4. Code Examples

### 4.1 Basic Editor Setup with svelte-tiptap

```svelte
<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import { createEditor, EditorContent } from 'svelte-tiptap';
  import type { Readable } from 'svelte/store';
  import type { Editor } from '@tiptap/core';
  import StarterKit from '@tiptap/starter-kit';
  import Link from '@tiptap/extension-link';
  import TaskList from '@tiptap/extension-task-list';
  import TaskItem from '@tiptap/extension-task-item';

  interface Props {
    content: string;
    onUpdate: (html: string) => void;
  }

  let { content, onUpdate }: Props = $props();
  let editor: Readable<Editor> = $state() as Readable<Editor>;

  onMount(() => {
    editor = createEditor({
      extensions: [
        StarterKit,
        Link.configure({ openOnClick: false }),
        TaskList,
        TaskItem.configure({ nested: true }),
      ],
      content,
      onUpdate: ({ editor }) => {
        onUpdate(editor.getHTML());
      },
    });
  });

  onDestroy(() => {
    $editor?.destroy();
  });
</script>

<EditorContent editor={$editor} />
```

### 4.2 Outline Tree with svelte-dnd-action

```svelte
<script lang="ts">
  import { dndzone, SHADOW_ITEM_MARKER_PROPERTY_NAME } from 'svelte-dnd-action';

  interface OutlineBlock {
    id: string;
    content: string;
    collapsed: boolean;
    children: OutlineBlock[];
  }

  let blocks: OutlineBlock[] = $state([]);

  function handleDndConsider(e: CustomEvent) {
    blocks = e.detail.items;
  }

  function handleDndFinalize(e: CustomEvent) {
    blocks = e.detail.items;
    // Persist to backend
    saveBlocks(blocks);
  }
</script>

<div
  use:dndzone={{ items: blocks, type: 'outline' }}
  onconsider={handleDndConsider}
  onfinalize={handleDndFinalize}
  class="outline-tree"
>
  {#each blocks as block (block.id)}
    <OutlineItem {block} />
  {/each}
</div>
```

```svelte
<!-- OutlineItem.svelte -->
<script lang="ts">
  import { dndzone, SHADOW_ITEM_MARKER_PROPERTY_NAME } from 'svelte-dnd-action';

  interface Props {
    block: OutlineBlock;
    depth?: number;
  }

  let { block, depth = 0 }: Props = $props();

  function handleChildDndConsider(e: CustomEvent) {
    block.children = e.detail.items;
  }

  function handleChildDndFinalize(e: CustomEvent) {
    block.children = e.detail.items;
  }
</script>

<div
  class="outline-item"
  style:margin-left="{depth * 24}px"
  data-is-dnd-shadow-item-hint={block[SHADOW_ITEM_MARKER_PROPERTY_NAME]}
>
  <button
    class="collapse-toggle"
    onclick={() => block.collapsed = !block.collapsed}
  >
    {block.collapsed ? '▶' : '▼'}
  </button>

  <OutlineEditor content={block.content} onUpdate={(html) => block.content = html} />

  {#if !block.collapsed && block.children.length > 0}
    <div
      use:dndzone={{ items: block.children, type: 'outline' }}
      onconsider={handleChildDndConsider}
      onfinalize={handleChildDndFinalize}
      class="children"
    >
      {#each block.children as child (child.id)}
        <svelte:self block={child} depth={depth + 1} />
      {/each}
    </div>
  {/if}
</div>
```

### 4.3 Mirror Node Implementation

```svelte
<script lang="ts">
  import { tree, nodes } from '$lib/stores/outline.svelte';

  interface Props {
    mirrorId: string;
  }

  let { mirrorId }: Props = $props();

  // Derive source node reactively
  let sourceId = $derived(nodes[mirrorId]?.sourceId);
  let sourceNode = $derived(sourceId ? nodes[sourceId] : null);
</script>

{#if sourceNode}
  <div class="mirror-node">
    <span class="mirror-indicator" title="This is a mirror">↔</span>

    <OutlineEditor
      content={sourceNode.content}
      onUpdate={(html) => {
        // Update source - all mirrors see change via reactivity
        nodes[sourceId].content = html;
      }}
    />
  </div>
{/if}
```

### 4.4 Virtualized Outline Tree

```svelte
<script lang="ts">
  import VirtualList from '@humanspeak/svelte-virtual-list';

  // Flatten tree for virtualization
  let flatNodes = $derived(() => {
    const result: { id: string; depth: number }[] = [];

    function traverse(ids: string[], depth: number) {
      for (const id of ids) {
        const node = nodes[id];
        result.push({ id, depth });
        if (!node.collapsed && node.children.length) {
          traverse(node.children, depth + 1);
        }
      }
    }

    traverse(visibleRoots, 0);
    return result;
  });
</script>

<VirtualList items={flatNodes} let:item>
  <div style:padding-left="{item.depth * 24}px">
    <OutlineItem nodeId={item.id} />
  </div>
</VirtualList>
```

---

## 5. TipTap/Svelte Integration

### 5.1 Integration Maturity

| Aspect | Status |
|--------|--------|
| Official TipTap support | Guide available in [TipTap docs](https://tiptap.dev/docs/editor/getting-started/install/svelte) |
| Svelte 5 compatibility | svelte-tiptap v3.0.1 supports Svelte 5 runes |
| Custom node views | Supported via SvelteNodeViewRenderer |
| Production usage | Used by multiple projects in npm ecosystem |
| Maintenance | Actively maintained as of December 2025 |

### 5.2 svelte-tiptap API

```svelte
<script lang="ts">
  import { createEditor, EditorContent, SvelteNodeViewRenderer } from 'svelte-tiptap';

  // Create editor with Svelte 5 runes
  let editor = $state() as Readable<Editor>;

  onMount(() => {
    editor = createEditor({
      extensions: [
        StarterKit,
        DateNode.extend({
          addNodeView() {
            return SvelteNodeViewRenderer(DateNodeView);
          },
        }),
      ],
      content: '',
    });
  });
</script>
```

### 5.3 Custom Node View with Svelte 5

```svelte
<!-- DateNodeView.svelte -->
<script lang="ts">
  import { NodeViewWrapper } from 'svelte-tiptap';
  import type { NodeViewProps } from '@tiptap/core';

  let { node, updateAttributes }: NodeViewProps = $props();

  let showPicker = $state(false);
  let date = $derived(node.attrs.date);
  let isOverdue = $derived(date && new Date(date) < new Date());
</script>

<NodeViewWrapper as="span" class="date-node">
  <span
    class="date-badge"
    class:overdue={isOverdue}
    onclick={() => showPicker = true}
  >
    {formatDate(date)}
  </span>

  {#if showPicker}
    <DatePicker
      value={date}
      onchange={(newDate) => {
        updateAttributes({ date: newDate });
        showPicker = false;
      }}
    />
  {/if}
</NodeViewWrapper>
```

---

## 6. Tauri Integration

### 6.1 Project Setup

```bash
# Create Tauri + SvelteKit project
npm create tauri-app@latest -- --template sveltekit-ts
cd outliner
npm install @tiptap/core @tiptap/starter-kit svelte-tiptap
```

### 6.2 SvelteKit Configuration for Tauri

```typescript
// svelte.config.js
import adapter from '@sveltejs/adapter-static';

export default {
  kit: {
    adapter: adapter({
      fallback: 'index.html',
    }),
  },
};
```

```typescript
// src/routes/+layout.ts
export const ssr = false; // Disable SSR for Tauri
export const prerender = true;
```

### 6.3 Rust-Frontend Communication

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

```svelte
<script lang="ts">
  import { invoke } from '@tauri-apps/api/core';

  // Reactive document loading
  let documentId = $state('default');
  let document = $state<OutlineDocument | null>(null);

  $effect(() => {
    invoke<OutlineDocument>('load_document', { id: documentId })
      .then(doc => document = doc);
  });

  // Auto-save with debounce
  let saveTimeout: number;

  $effect(() => {
    if (document) {
      clearTimeout(saveTimeout);
      saveTimeout = setTimeout(() => {
        invoke('save_document', { id: documentId, document });
      }, 1000);
    }
  });
</script>
```

### 6.4 Tauri + Svelte 5 Templates

Several community templates available:
- [tauri2-svelte5-shadcn](https://github.com/alysonhower/tauri2-svelte5-shadcn) - Tauri 2 + Svelte 5 + shadcn-svelte with CI/CD
- [auros-one/tauri-sveltekit](https://github.com/auros-one/tauri-sveltekit) - Minimal Tauri & SvelteKit starter

---

## 7. Risks and Mitigations

| Risk | Severity | Mitigation |
|------|----------|------------|
| **Svelte 5 ecosystem catching up** | Medium | Major libraries (TipTap, dnd-action) already support Svelte 5; use runed for primitives |
| **TipTap nested list bugs** | Medium | Use custom OutlineNode structure; TipTap for inline content only |
| **TanStack Virtual Svelte 5 issues** | Medium | Use @humanspeak/svelte-virtual-list or virtua (both support Svelte 5) |
| **svelte-tiptap maintenance** | Low | Well-maintained, updated for Svelte 5; alternative Tipex available |
| **Smaller talent pool than React** | Low | Svelte syntax is simple; developers ramp up quickly |
| **Bundle size with KaTeX** | Low | Lazy-load math renderer only when equations detected |

### Critical Path Items

1. **Validate svelte-tiptap with Svelte 5** - Build minimal editor with custom node views
2. **svelte-dnd-action nested evaluation** - Test with 3+ level deep drag-drop
3. **Mirror sync mechanism** - Prototype bidirectional updates

---

## 8. Ecosystem Maturity Assessment

| Aspect | Rating | Notes |
|--------|--------|-------|
| **Svelte 5 core** | Excellent | Stable release, compiler-based, used in production |
| **Svelte ecosystem** | Good | Growing rapidly; shadcn-svelte, Bits UI, Mode Watcher all support Svelte 5 |
| **TipTap** | Excellent | Mature, 100+ extensions, active development |
| **TipTap/Svelte adapters** | Good | svelte-tiptap v3.0.1 supports Svelte 5; Tipex is purpose-built |
| **TypeScript support** | Excellent | First-class in both Svelte 5 and TipTap |
| **Tauri + Svelte** | Excellent | Official template, community templates available |
| **Community resources** | Growing | Svelte Discord active; monthly "What's new in Svelte" posts |

### Production Usage

- **Svelte 5**: Adopted by major companies, growing production usage
- **TipTap + Svelte**: Multiple npm projects using svelte-tiptap
- **Tauri + Svelte**: Documented as "favorite stack" for native apps in 2025

### Comparison to Alternatives

| Criterion | Svelte5+TipTap | React+Lexical | SolidJS+TipTap |
|-----------|----------------|---------------|-----------------|
| Performance (reactivity) | Excellent | Good | Best |
| Ecosystem size | Medium | Largest | Small |
| Editor maturity | Mature | Good | Mature |
| Framework maturity | Stable (v5) | Stable | Stable |
| Bundle size | Smallest (~3-10KB) | Medium (~40KB) | Small (~7KB) |
| Learning curve | Low | Moderate | Moderate |
| DX/Boilerplate | Minimal | High | Low |

---

## 9. Recommendation

### Verdict: **Excellent Choice for Modern Outliner**

Svelte 5 + TipTap is recommended if:
- You want minimal boilerplate with maximum performance
- Fine-grained reactivity for tree structures is valued
- Bundle size is a concern (desktop apps benefit from fast startup)
- Team values developer experience and readable code
- You're building a new project without React legacy constraints

### Key Advantages

1. **Performance**: Compiler-based approach eliminates runtime overhead; benchmarks show 2-3x faster startup than React
2. **Bundle size**: Smallest of all options (~3-10KB core)
3. **Developer experience**: Svelte 5 runes are intuitive; no useState/useEffect ceremony
4. **TipTap maturity**: Battle-tested editor with extensive extensions
5. **Reactivity model**: `$state`, `$derived`, `$effect` map naturally to tree operations
6. **Tauri integration**: Excellent support with official templates

### Estimated Custom Development

| Component | Effort |
|-----------|--------|
| TipTap/Svelte 5 integration validation | Low |
| Outline tree structure with runes | Medium |
| Zoom/hoist navigation | Medium |
| Wiki-link with autocomplete | Medium (Suggestion utility exists) |
| Mirror node sync | High |
| Drag-drop with svelte-dnd-action | Low-Medium |
| Keyboard shortcuts | Low |
| Virtualization | Low |

### Compared to Other Proposals

**vs React + Lexical**: Svelte 5 offers smaller bundles, less boilerplate, and comparable performance. React's advantage is ecosystem size and Lexical's deep integration with Meta's tooling. Choose Svelte 5 if you value simplicity and aren't constrained by existing React codebases.

**vs SolidJS + TipTap**: Both offer fine-grained reactivity. SolidJS has a slight performance edge, but Svelte 5 has better documentation, official TipTap support, and a simpler mental model. Choose SolidJS if raw performance is the absolute top priority; choose Svelte 5 for better DX and ecosystem support.

---

## 10. Prototype Recommendations

Before committing, build a focused prototype covering:

1. **TipTap editor** with svelte-tiptap, including bold/italic/links
2. **Nested outline** with 3+ levels using Svelte 5 `$state`
3. **Collapse/expand** with fine-grained updates
4. **Drag-drop reorder** with svelte-dnd-action across levels
5. **Zoom to node** filtering visible items
6. **Wiki-link** with Suggestion utility autocomplete
7. **Persistence round-trip** (serialize → Tauri/SQLite → deserialize)

---

## References

- [Svelte 5 Documentation](https://svelte.dev/docs)
- [Svelte Blog: Introducing Runes](https://svelte.dev/blog/runes)
- [svelte-tiptap](https://github.com/sibiraj-s/svelte-tiptap)
- [Tipex Editor](https://github.com/friendofsvelte/tipex)
- [TipTap Svelte Guide](https://tiptap.dev/docs/editor/getting-started/install/svelte)
- [TipTap Suggestion Utility](https://tiptap.dev/docs/editor/api/utilities/suggestion)
- [svelte-dnd-action](https://github.com/isaacHagoel/svelte-dnd-action)
- [@humanspeak/svelte-virtual-list](https://virtuallist.svelte.page/)
- [@svelte-put/shortcut](https://svelte-put.vnphanquang.com/docs/shortcut)
- [Tauri + SvelteKit Guide](https://v2.tauri.app/start/frontend/sveltekit/)
- [tauri2-svelte5-shadcn template](https://github.com/alysonhower/tauri2-svelte5-shadcn)
- [MiniSearch](https://github.com/lucaong/minisearch)
- [chrono-node](https://github.com/wanasit/chrono)
