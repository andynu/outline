# Proposal: React + Lexical for Outliner Frontend

## Executive Summary

This proposal evaluates **React** with **Lexical** (Meta's extensible text editor framework) as the frontend stack for the Tauri-based outliner application. This combination offers a mature ecosystem, strong TypeScript support, and a battle-tested editing foundation from Meta, but requires significant custom work for outliner-specific features.

---

## 1. Feature Coverage Analysis

### 1.1 Core Outliner (Hierarchy & Navigation)

| Feature | Support | Implementation |
|---------|---------|----------------|
| Infinite nesting | Partial | `@lexical/list` supports nested lists but has [documented issues](https://github.com/facebook/lexical/issues/2951) with hierarchical numbering (1.1, 1.2 style) |
| Zoom in/out (hoisting) | Custom | Requires custom implementation - filter visible nodes based on "root" context |
| Collapse/expand | Partial | [Collapsible sections exist](https://github.com/facebook/lexical/issues/3906) but have bugs with toggle state; custom CollapsibleNode needed |
| Breadcrumb navigation | Custom | Build atop zoom/hoist - track ancestor chain in React state |
| Drag-drop reorder | Yes | [DraggableBlockPlugin](https://github.com/facebook/lexical/issues/2115) in playground; requires CSS and integration work |

**Implementation approach**: Rather than fighting Lexical's list model, implement a **custom OutlineNode** that manages its own hierarchy. Use Lexical for inline rich-text editing within each node, not for structural organization.

```tsx
// Custom node structure (simplified)
class OutlineItemNode extends DecoratorNode<JSX.Element> {
  __id: string;
  __parentId: string | null;
  __collapsed: boolean;
  __content: LexicalEditor; // Nested editor for rich text

  // ... node implementation
}
```

### 1.2 Node Types

| Feature | Support | Implementation |
|---------|---------|----------------|
| Bullet items | Native | TextNode with bullet styling |
| Checkbox items | Yes | [`@lexical/list` CheckListPlugin](https://lexical.dev/docs/react/plugins) with CSS for checkmarks |
| Headings | Native | HeadingNode (H1-H6) via `@lexical/rich-text` |
| Numbered lists | Partial | Works but [lacks hierarchical numbering](https://github.com/facebook/lexical/issues/7033) |

### 1.3 Rich Text & Formatting

| Feature | Support | Implementation |
|---------|---------|----------------|
| Bold/Italic/Code | Native | `@lexical/markdown` [TRANSFORMERS](https://lexical.dev/docs/packages/lexical-markdown) |
| Strikethrough | Native | Text format transformer included |
| Links | Native | LinkNode + AutoLinkPlugin |
| Inline images | Partial | ImageNode in playground (not core package) |
| Code blocks | Native | CodeNode with syntax highlighting |
| LaTeX math | Playground | [EquationNode with KaTeX](https://github.com/facebook/lexical/issues/4185) - needs porting from playground |

**Markdown shortcut support**:
```tsx
import { MarkdownShortcutPlugin } from '@lexical/react/LexicalMarkdownShortcutPlugin';
import { TRANSFORMERS } from '@lexical/markdown';

// Enables: **bold**, *italic*, `code`, etc.
<MarkdownShortcutPlugin transformers={TRANSFORMERS} />
```

### 1.4 Links & Mirrors

| Feature | Support | Implementation |
|---------|---------|----------------|
| `[[internal links]]` | Custom | Use [lexical-beautiful-mentions](https://github.com/sodenn/lexical-beautiful-mentions) pattern with `[[` trigger |
| Autocomplete | Yes | MentionsPlugin pattern adaptable |
| Backlinks panel | Custom | Maintain link graph in React state, update on content change |
| Node mirrors `(())` | Custom | Complex: MirrorNode pointing to source, bidirectional sync |

**Internal links implementation**:
```tsx
// Adapt mentions plugin for wiki-links
const WIKI_LINK_REGEX = /\[\[([^\]]+)\]\]/;

class WikiLinkNode extends TextNode {
  __targetId: string;

  static getType(): string {
    return 'wiki-link';
  }

  createDOM(): HTMLElement {
    const span = document.createElement('span');
    span.className = 'wiki-link';
    span.setAttribute('data-target', this.__targetId);
    return span;
  }
}
```

### 1.5 Task Management

| Feature | Support | Implementation |
|---------|---------|----------------|
| Checkbox toggle | Native | CheckListPlugin, Ctrl+Shift+C binding |
| Natural language dates | External | [chrono-node](https://github.com/wanasit/chrono) (38.7kB) for parsing "tomorrow", "next monday" |
| Date picker UI | Custom | React date picker (react-datepicker, @radix-ui/date) |
| Recurring tasks | Custom | Store RRULE format, parse with rrule.js |
| Overdue highlighting | Custom | CSS class based on date comparison |

### 1.6 Search & Navigation

| Feature | Support | Implementation |
|---------|---------|----------------|
| Full-text search | External | [MiniSearch](https://github.com/lucaong/minisearch) (recommended) or [Fuse.js](https://www.fusejs.io/) |
| Filtered search | Custom | Build query parser for `#tag`, `has:date`, `color:red` syntax |
| File Finder | Custom | Command palette pattern (cmdk or kbar) |
| Item Finder | Custom | Same, index all node titles |

**Search library comparison**:

| Library | Bundle Size | Best For | Limitations |
|---------|-------------|----------|-------------|
| MiniSearch | ~10kB | Full-text with prefix/fuzzy | Add/remove docs at runtime |
| Fuse.js | ~5kB | Fuzzy matching | Slow on large datasets (>10k items) |
| FlexSearch | ~6kB | Speed-optimized | More complex API |

**Recommendation**: MiniSearch for its balance of features and ability to update the index dynamically.

### 1.7 Keyboard-First Design

| Feature | Support | Implementation |
|---------|---------|----------------|
| Arrow navigation | Native | Lexical handles cursor movement |
| Tab/Shift+Tab indent | Custom | [ListMaxIndentPlugin](https://lexical.dev/docs/react/plugins) for limits |
| Custom shortcuts | Yes | [Commands system](https://lexical.dev/docs/concepts/commands) - register listeners |
| Shortcut customization | Custom | Store bindings in preferences, apply at runtime |

**Command system**:
```tsx
editor.registerCommand(
  KEY_DOWN_COMMAND,
  (event: KeyboardEvent) => {
    if (event.ctrlKey && event.key === ']') {
      // Zoom into item
      zoomToNode(getSelectedNode());
      return true; // Handled
    }
    return false;
  },
  COMMAND_PRIORITY_HIGH
);
```

### 1.8 Views & Themes

| Feature | Support | Implementation |
|---------|---------|----------------|
| Outline view | Default | Primary editing mode |
| Article view | Custom | Read-only render of nested content |
| Light/Dark themes | Native | [Theming via CSS classes](https://lexical.dev/docs/getting-started/theming) |
| Custom CSS | Native | Theme object maps classes to elements |

**Theme configuration**:
```tsx
const theme = {
  paragraph: 'outline-paragraph',
  text: {
    bold: 'text-bold',
    italic: 'text-italic',
    code: 'text-code',
  },
  list: {
    nested: { listitem: 'nested-list-item' },
    ulDepth: ['ul-depth-1', 'ul-depth-2', 'ul-depth-3'],
  },
};
```

---

## 2. Library Stack

### Core Framework
```json
{
  "dependencies": {
    "react": "^18.2.0",
    "react-dom": "^18.2.0",
    "lexical": "^0.20.0",
    "@lexical/react": "^0.20.0",
    "@lexical/rich-text": "^0.20.0",
    "@lexical/list": "^0.20.0",
    "@lexical/markdown": "^0.20.0",
    "@lexical/link": "^0.20.0"
  }
}
```

### Additional Dependencies
| Need | Package | Size |
|------|---------|------|
| Tree drag-drop | [dnd-kit-sortable-tree](https://github.com/Shaddix/dnd-kit-sortable-tree) | ~15kB |
| Date parsing | chrono-node | ~39kB |
| Search | minisearch | ~10kB |
| Math rendering | katex | ~280kB (can lazy-load) |
| Command palette | cmdk | ~5kB |
| Date picker | @radix-ui/react-popover + calendar | ~8kB |

**Total estimated bundle** (excluding React): ~360kB (before tree-shaking)

---

## 3. Code Examples

### 3.1 Basic Editor Setup
```tsx
import { LexicalComposer } from '@lexical/react/LexicalComposer';
import { RichTextPlugin } from '@lexical/react/LexicalRichTextPlugin';
import { ContentEditable } from '@lexical/react/LexicalContentEditable';
import { HistoryPlugin } from '@lexical/react/LexicalHistoryPlugin';
import { MarkdownShortcutPlugin } from '@lexical/react/LexicalMarkdownShortcutPlugin';
import { CheckListPlugin } from '@lexical/react/LexicalCheckListPlugin';
import { TRANSFORMERS } from '@lexical/markdown';

const initialConfig = {
  namespace: 'Outliner',
  theme: outlineTheme,
  nodes: [
    HeadingNode,
    ListNode,
    ListItemNode,
    LinkNode,
    // Custom nodes
    WikiLinkNode,
    DateNode,
    MirrorNode,
  ],
  onError: (error: Error) => console.error(error),
};

function OutlineEditor() {
  return (
    <LexicalComposer initialConfig={initialConfig}>
      <RichTextPlugin
        contentEditable={<ContentEditable className="editor" />}
        placeholder={<div className="placeholder">Start typing...</div>}
        ErrorBoundary={LexicalErrorBoundary}
      />
      <HistoryPlugin />
      <MarkdownShortcutPlugin transformers={TRANSFORMERS} />
      <CheckListPlugin />
      <WikiLinkPlugin />
      <DateParserPlugin />
      <KeyboardShortcutsPlugin />
    </LexicalComposer>
  );
}
```

### 3.2 Custom Wiki Link Node
```tsx
import {
  $applyNodeReplacement,
  TextNode,
  SerializedTextNode,
  NodeKey,
} from 'lexical';

export type SerializedWikiLinkNode = SerializedTextNode & {
  targetId: string;
  targetTitle: string;
};

export class WikiLinkNode extends TextNode {
  __targetId: string;
  __targetTitle: string;

  static getType(): string {
    return 'wiki-link';
  }

  static clone(node: WikiLinkNode): WikiLinkNode {
    return new WikiLinkNode(
      node.__targetId,
      node.__targetTitle,
      node.__key
    );
  }

  constructor(targetId: string, targetTitle: string, key?: NodeKey) {
    super(`[[${targetTitle}]]`, key);
    this.__targetId = targetId;
    this.__targetTitle = targetTitle;
  }

  createDOM(): HTMLElement {
    const span = document.createElement('span');
    span.className = 'wiki-link';
    span.setAttribute('data-target-id', this.__targetId);
    span.textContent = this.__targetTitle;
    return span;
  }

  static importJSON(json: SerializedWikiLinkNode): WikiLinkNode {
    return $createWikiLinkNode(json.targetId, json.targetTitle);
  }

  exportJSON(): SerializedWikiLinkNode {
    return {
      ...super.exportJSON(),
      type: 'wiki-link',
      targetId: this.__targetId,
      targetTitle: this.__targetTitle,
    };
  }
}

export function $createWikiLinkNode(
  targetId: string,
  targetTitle: string
): WikiLinkNode {
  return $applyNodeReplacement(new WikiLinkNode(targetId, targetTitle));
}
```

### 3.3 Outliner Tree with dnd-kit
```tsx
import { SortableTree } from 'dnd-kit-sortable-tree';
import type { TreeItem } from 'dnd-kit-sortable-tree';

interface OutlineItem extends TreeItem {
  id: string;
  content: string;
  collapsed: boolean;
  children: OutlineItem[];
}

function OutlineTree({ items, onChange }: Props) {
  return (
    <SortableTree
      items={items}
      onItemsChanged={onChange}
      TreeItemComponent={OutlineTreeItem}
      indentationWidth={24}
    />
  );
}

const OutlineTreeItem = React.forwardRef<HTMLDivElement, TreeItemProps>(
  ({ item, ...props }, ref) => {
    return (
      <FolderTreeItemWrapper {...props} ref={ref}>
        <div className="outline-item">
          <CollapseButton item={item} />
          <InlineEditor content={item.content} itemId={item.id} />
        </div>
      </FolderTreeItemWrapper>
    );
  }
);
```

---

## 4. Performance Considerations

### 4.1 Strengths

- **Efficient reconciliation**: Lexical has its own [DOM reconciler](https://lexical.dev/docs/concepts/editor-state) that diffs editor states and batches DOM updates
- **Lazy plugin loading**: Plugins can be code-split and loaded on demand
- **Frozen state**: Editor state uses [immutable patterns](https://lexical.dev/docs/concepts/editor-state) (frozen after reconciliation) enabling efficient undo/redo

### 4.2 Concerns for Large Trees

| Concern | Mitigation |
|---------|------------|
| Rendering 1000s of nodes | Virtualization with react-window or @tanstack/virtual |
| Re-renders on edits | React.memo + careful context design; separate tree state from editor state |
| Initial load time | Server-side serialize to HTML for instant display, hydrate Lexical after |
| Memory for nested editors | Share theme/config; lazy-init editors for collapsed items |

### 4.3 Virtualization Strategy
```tsx
import { FixedSizeList } from 'react-window';

function VirtualizedOutline({ flattenedItems }) {
  return (
    <FixedSizeList
      height={600}
      itemCount={flattenedItems.length}
      itemSize={32}
      itemData={flattenedItems}
    >
      {({ index, style, data }) => (
        <div style={style}>
          <OutlineItem item={data[index]} depth={data[index].depth} />
        </div>
      )}
    </FixedSizeList>
  );
}
```

---

## 5. Tauri Integration

### 5.1 Project Setup
```bash
npm create tauri-app@latest -- --template react-ts
cd outliner
npm install lexical @lexical/react @lexical/rich-text @lexical/list
```

### 5.2 Rust-Frontend Communication
```rust
// src-tauri/src/main.rs
#[tauri::command]
fn save_document(id: String, content: String) -> Result<(), String> {
    // Persist to SQLite
}

#[tauri::command]
fn load_document(id: String) -> Result<String, String> {
    // Load from SQLite, return JSON
}
```

```tsx
// Frontend
import { invoke } from '@tauri-apps/api/core';

async function saveDocument(id: string, editorState: SerializedEditorState) {
  await invoke('save_document', {
    id,
    content: JSON.stringify(editorState),
  });
}
```

### 5.3 Offline-First with SQLite
Tauri 2.0 supports [SQLite plugins](https://v2.tauri.app/plugin/sql/) for local storage:

```rust
// Use tauri-plugin-sql for SQLite access
tauri::Builder::default()
    .plugin(tauri_plugin_sql::Builder::default().build())
```

---

## 6. Risks and Mitigations

| Risk | Severity | Mitigation |
|------|----------|------------|
| **Lexical nested list limitations** | High | Custom OutlineNode bypassing list model |
| **Collapsible toggle bugs** | Medium | Fork/patch playground code; file upstream PR |
| **No official outliner support** | High | Significant custom node development required |
| **Bundle size with KaTeX** | Low | Lazy-load math renderer only when equations detected |
| **Learning curve for Lexical internals** | Medium | Team training; comprehensive Lexical docs available |
| **Performance with deep nesting** | Medium | Virtualization + lazy editor initialization |

### Critical Path Items
1. **OutlineItemNode implementation** - Core data structure
2. **Zoom/hoist mechanics** - View filtering based on context
3. **Mirror node synchronization** - Bidirectional updates across document

---

## 7. Ecosystem Maturity Assessment

| Aspect | Rating | Notes |
|--------|--------|-------|
| **React ecosystem** | Excellent | Mature, massive community, excellent tooling |
| **Lexical stability** | Good | Used in production at Meta; v0.x but stable API |
| **Lexical documentation** | Fair | [Official docs](https://lexical.dev/docs/intro) good; complex concepts underdocumented |
| **Lexical community** | Growing | Active GitHub, Discord; fewer tutorials than ProseMirror |
| **TypeScript support** | Excellent | First-class TypeScript throughout |
| **Tauri + React** | Excellent | [Official template](https://v2.tauri.app/start/create-project/), well-documented |

### Comparison to Alternatives

| Criterion | React+Lexical | SolidJS+TipTap | Svelte5+TipTap |
|-----------|---------------|----------------|-----------------|
| Ecosystem size | Largest | Small | Medium |
| Hiring pool | Largest | Limited | Growing |
| Performance (reactivity) | Good | Best | Very Good |
| Editor maturity | Good | Mature | Mature |
| Learning curve | Moderate | Moderate | Low |
| Bundle size | Medium | Small | Small |

---

## 8. Recommendation

### Verdict: **Viable with Significant Investment**

React + Lexical is a solid choice if:
- The team has React experience and wants ecosystem familiarity
- Meta's long-term support of Lexical is valued
- Custom node development is acceptable

### Estimated Custom Development
| Component | Effort |
|-----------|--------|
| OutlineItemNode + tree structure | High |
| Zoom/hoist navigation | Medium |
| Wiki-link autocomplete | Medium |
| Mirror node sync | High |
| Date parsing integration | Low |
| Search integration | Low |
| Keyboard shortcuts | Medium |
| Theme system | Low |

### Alternative Consideration
If the nested-editor architecture proves complex, consider:
- **Lexical for inline editing only** within bullet content
- **React state (or Zustand/Jotai)** for tree structure management
- **dnd-kit-sortable-tree** for drag-drop hierarchy

This "Lexical-lite" approach uses Lexical's strengths (text editing, markdown) while managing outliner structure separately.

---

## 9. Prototype Recommendations

Before committing, build a focused prototype covering:

1. **Nested OutlineItemNode** with 3 levels, collapse/expand
2. **Zoom to node** filtering visible items
3. **Wiki-link** insertion with autocomplete popup
4. **Drag-drop reorder** across hierarchy levels
5. **Persistence** round-trip (serialize → SQLite → deserialize)

Allocate 2-3 weeks for prototype to validate architecture.

---

## References

- [Lexical Documentation](https://lexical.dev/docs/intro)
- [Lexical GitHub](https://github.com/facebook/lexical)
- [Lexical Playground (reference implementation)](https://playground.lexical.dev/)
- [dnd-kit-sortable-tree](https://github.com/Shaddix/dnd-kit-sortable-tree)
- [MiniSearch](https://github.com/lucaong/minisearch)
- [chrono-node](https://github.com/wanasit/chrono)
- [Tauri 2.0 + React](https://v2.tauri.app/start/create-project/)
- [lexical-beautiful-mentions](https://github.com/sodenn/lexical-beautiful-mentions)
