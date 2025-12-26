# Codebase Tour

A file-by-file guide to the Outline codebase. Read this after the [Onboarding Guide](ONBOARDING.md).

## Directory Structure

```
outline/
├── app/                      # Desktop application
│   ├── src/                  # Frontend (Svelte)
│   │   ├── lib/              # Components & logic
│   │   └── routes/           # SvelteKit pages
│   ├── src-tauri/            # Backend (Rust)
│   │   └── src/              # Rust source
│   └── tests/                # Playwright E2E tests
├── server/                   # Optional thin server (Ruby)
└── docs/                     # Documentation
```

---

## Frontend: `app/src/lib/`

### Core Files

#### `outline.svelte.ts` (~1,400 lines)

**The heart of the application.** Manages all document state.

Key sections:
- **Lines 1-50**: Imports and type definitions
- **Lines 50-150**: Reactive state declarations (`$state` runes)
- **Lines 150-300**: Index management (`nodesById`, `childrenByParent`)
- **Lines 300-500**: Tree building and caching
- **Lines 500-800**: CRUD operations (`addSiblingAfter`, `updateContent`, `deleteNode`)
- **Lines 800-1000**: Move and indent operations
- **Lines 1000-1200**: Undo/redo system
- **Lines 1200-1400**: Utility functions and exports

Start here to understand:
- How state flows through the app
- How the tree is built from flat data
- How undo/redo works

#### `api.ts` (~850 lines)

**Bridge between frontend and backend.**

Key patterns:
```typescript
// Tauri detection
const isTauri = () => '__TAURI__' in window;

// Dual-mode API
export async function loadDocument(docId?: string) {
  if (isTauri()) {
    return await invoke<DocumentState>('load_document', { docId });
  } else {
    return mockDocument;  // Browser fallback
  }
}
```

All 30+ API functions follow this pattern. The browser mock enables:
- Development without Tauri (`npm run dev`)
- Potential future web version

#### `types.ts`

TypeScript interfaces that mirror Rust structs:
- `Node` - Document node
- `DocumentState` - Array of nodes
- `TreeNode` - Hierarchical view
- `SearchResult`, `BacklinkResult` - Query results

**Keep in sync with Rust!** Changes here need matching changes in `src-tauri/src/data/`.

---

### UI Components

#### `OutlineItem.svelte` (~1,200 lines)

**The workhorse component.** Renders a single node.

Key sections:
- **Lines 1-100**: Props and state
- **Lines 100-250**: TipTap editor setup (lazy creation)
- **Lines 250-400**: Event handlers (keyboard, focus, blur)
- **Lines 400-550**: Wiki link suggestions
- **Lines 550-700**: Hashtag suggestions
- **Lines 700-850**: Context menu
- **Lines 850-1000**: Drag and drop
- **Lines 1000-1200**: Template (HTML)

**Performance critical:** The lazy editor pattern:
```svelte
<script>
  let editor = $state<Editor | null>(null);

  function onFocus() {
    if (!editor) {
      editor = new Editor({ ... });
    }
  }

  function onBlur() {
    // Save content, then destroy
    editor?.destroy();
    editor = null;
  }
</script>
```

#### `Sidebar.svelte` (~700 lines)

Document and folder navigation:
- Folder tree with drag-drop reordering
- Document list with context menus
- New document/folder creation

#### Panel Components

| Component | Purpose |
|-----------|---------|
| `SearchModal.svelte` | Full-text search UI |
| `DateViewsPanel.svelte` | Calendar view, task agenda |
| `TagsPanel.svelte` | Hashtag filtering |
| `InboxPanel.svelte` | Captured items processing |
| `BacklinksPanel.svelte` | Nodes linking to current node |

---

### TipTap Extensions

Custom extensions for the rich text editor.

#### `WikiLink.ts`

Detects and handles `[[wiki-links]]`:
```typescript
// Mark type for styling
const WikiLink = Mark.create({
  name: 'wikiLink',
  // ...
});

// Input rule: typing [[ triggers suggestion
const wikiLinkInputRule = new InputRule(
  /\[\[([^\]]+)$/,
  // Show autocomplete...
);
```

#### `Hashtag.ts`

Similar pattern for `#tags`:
- Detects `#` followed by word characters
- Shows autocomplete from existing tags
- Stores in node's `tags` array

#### `DueDate.ts`

Inline date marks:
- Click to open date picker
- Renders as formatted date
- Stores in node's `date` field

---

### State Modules

#### `zoom.svelte.ts`

Focus mode - zoom into a subtree:
```typescript
export const zoomState = $state({
  zoomedNodeId: null as string | null,
});

export function zoomTo(nodeId: string) { ... }
export function zoomOut() { ... }
```

#### `settings.svelte.ts`

User preferences (persisted):
- Theme (light/dark/system)
- Default node type
- Keyboard shortcuts

#### `theme.svelte.ts`

Dark mode toggle, respects system preference.

---

## Backend: `app/src-tauri/src/`

### Entry Points

#### `lib.rs`

Tauri application setup:
```rust
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_shell::init())
        // ...
        .invoke_handler(tauri::generate_handler![
            commands::load_document,
            commands::create_node,
            // ... all commands
        ])
        .run(tauri::generate_context!())
}
```

#### `commands.rs` (~700 lines)

All Tauri command handlers. Pattern:
```rust
#[tauri::command]
pub fn update_node(
    id: String,
    changes: UpdateChanges,
    state: State<AppState>,
) -> Result<DocumentState, String> {
    let mut doc = state.current_document.lock().unwrap();
    let doc = doc.as_mut().ok_or("No document loaded")?;

    let op = Operation::Update { id, changes, updated_at: Utc::now() };
    doc.append_op(&op)?;

    Ok(doc.get_state())
}
```

---

### Data Layer: `data/`

#### `document.rs`

Document lifecycle:
- `Document::load(path)` - Load from disk
- `Document::create(path)` - New document
- `document.append_op(op)` - Write operation
- `document.compact()` - Merge pending files

Key structs:
```rust
pub struct Document {
    pub path: PathBuf,
    pub state: DocumentState,
    pending_file: File,  // Append-only handle
}
```

#### `operations.rs`

Operation types and application:
```rust
impl Operation {
    pub fn apply(&self, state: &mut DocumentState) {
        match self {
            Operation::Create { id, parent_id, ... } => {
                state.nodes.push(Node { ... });
            }
            Operation::Update { id, changes, ... } => {
                if let Some(node) = state.find_mut(id) {
                    changes.apply_to(node);
                }
            }
            // ...
        }
    }
}
```

#### `node.rs`

Node struct definition (must match TypeScript `types.ts`):
```rust
#[derive(Serialize, Deserialize, Clone)]
pub struct Node {
    pub id: Uuid,
    pub parent_id: Option<Uuid>,
    pub position: i32,
    pub content: String,
    // ... all fields
}
```

#### `folders.rs`

Folder organization (separate from documents):
```rust
pub struct FolderState {
    pub folders: Vec<Folder>,
    pub document_folders: HashMap<String, String>,
    pub document_order: HashMap<String, Vec<String>>,
}
```

---

### Search: `search/`

#### `mod.rs`

SQLite FTS5 integration:
```rust
pub struct SearchIndex {
    conn: Connection,
}

impl SearchIndex {
    pub fn search(&self, query: &str, limit: usize) -> Vec<SearchResult> {
        self.conn.prepare("
            SELECT node_id, snippet(nodes_fts, 0, '<mark>', '</mark>', '...', 32)
            FROM nodes_fts
            WHERE nodes_fts MATCH ?
            ORDER BY rank
            LIMIT ?
        ")?.query_map(...)
    }

    pub fn get_backlinks(&self, node_id: &str) -> Vec<BacklinkResult> {
        self.conn.prepare("
            SELECT source_node_id FROM links WHERE target_node_id = ?
        ")?.query_map(...)
    }
}
```

---

### Import/Export: `import_export/`

| File | Format |
|------|--------|
| `opml.rs` | OPML 2.0 (tree structure) |
| `markdown.rs` | Markdown with indentation |
| `json.rs` | JSON backup |

---

## Tests: `app/tests/`

Playwright E2E tests. Each file tests a feature:

| Test File | Coverage |
|-----------|----------|
| `basic-editing.spec.ts` | Create, update, delete nodes |
| `hierarchy.spec.ts` | Indent, outdent, reparent |
| `navigation.spec.ts` | Keyboard navigation |
| `drag-drop.spec.ts` | Drag and drop reordering |
| `wiki-links.spec.ts` | Link creation, navigation |
| `search.spec.ts` | Full-text search |

Pattern:
```typescript
test('can create a new item', async ({ page }) => {
  await page.goto('/');
  await page.keyboard.press('Enter');
  await page.keyboard.type('New item');
  await expect(page.locator('.outline-item')).toContainText('New item');
});
```

---

## Server: `server/`

Optional Ruby/Sinatra server for:
- iCalendar feeds (`/calendar/{token}/feed.ics`)
- Mobile capture (`/outline/capture`)
- Read-only viewer (`/outline/view`)

#### `app.rb` (~240 lines)

Simple Sinatra app:
```ruby
get '/calendar/:token/feed.ics' do
  halt 403 unless valid_token?(params[:token])
  content_type 'text/calendar'
  File.read(data_dir + '/feed.ics')
end

post '/outline/api/inbox' do
  item = JSON.parse(request.body.read)
  append_to_jsonl(data_dir + '/inbox.jsonl', item)
  status 201
end
```

---

## Where to Start

1. **Understanding data flow**: Read `outline.svelte.ts` and `commands.rs`
2. **Adding UI features**: Start with `OutlineItem.svelte`
3. **Modifying storage**: Start with `data/document.rs` and `operations.rs`
4. **Adding search features**: See `search/mod.rs`
5. **Writing tests**: Copy patterns from `app/tests/basic-editing.spec.ts`
