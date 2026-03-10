# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Outline is a self-hosted Dynalist/Workflowy replacement - a hierarchical outliner with cross-linking, tasks, dates, and calendar integration. The project uses a Tauri 2 + Rust backend with a React 19 + Zustand frontend.

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                    Desktop App (app/)                           │
│  ├── React 19 + TipTap frontend (app/src/)                     │
│  └── Rust/Tauri backend (app/src-tauri/)                       │
│      ├── SQLite FTS5 search cache                              │
│      └── JSONL file I/O                                        │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                    Local File Storage (~/.outline-data/)        │
│  ├── documents/{uuid}/state.json      (merged state)           │
│  └── documents/{uuid}/pending.*.jsonl (per-machine ops)        │
├─────────────────────────────────────────────────────────────────┤
│  Platform Cache (varies by OS, see below)                      │
│  └── outline.db (SQLite FTS5 search index, not synced)         │
└─────────────────────────────────────────────────────────────────┘
                              │
                              │ Dropbox / Syncthing
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                    Thin Server (server/)                        │
│  ├── Ruby/Sinatra                                              │
│  ├── /calendar/{token}/feed.ics   (iCal feed)                  │
│  ├── /outline/capture             (mobile capture form)        │
│  └── /outline/api/capture         (capture API)                │
└─────────────────────────────────────────────────────────────────┘
```

## Commands

### Desktop App (app/)

```bash
cd app
npm install
npm run dev          # Vite dev server (http://localhost:5173)
npm run build        # Production build
npm run check        # TypeScript type checking
npm run test         # Playwright E2E tests
npm run test:ui      # Playwright interactive UI mode
npm run test:headed  # E2E tests with browser visible
npm run tauri dev    # Run as Tauri desktop app
npm run tauri build  # Build Tauri app for distribution
```

### Rust Backend (app/src-tauri/)

```bash
cd app/src-tauri
cargo build          # Build Rust backend
cargo test           # Run Rust tests
cargo check          # Type check without building
```

### Outline CLI (`otl`)

The `otl` command provides direct access to Outline data without the desktop app. Use it to look up nodes, search, and perform CRUD operations. **When the user references a node by short ID (e.g., "outline-q4jo"), use `otl doc show` to look it up directly.**

```bash
# Browsing & lookup
otl doc list                          # List all documents with short IDs
otl doc show <short-id>               # Show a node and its subtree (e.g., otl doc show outline-q4jo)
otl doc show <doc-prefix>             # Show entire document tree (e.g., otl doc show outline)
otl doc show <short-id> --json        # Machine-readable output with full node data

# Search
otl search "query"                    # FTS5 search across all documents
otl search "is:completed has:date"    # Search with operators
otl backlinks <short-id>              # Find nodes linking to this node

# Node CRUD (positional args, not flags)
otl node create <parent-id> "content" # Create child node under parent
otl node create <parent-id> "content" --type checkbox  # Create as checkbox
otl node create <parent-id> "content" --note "extra"   # With note text
otl node update --check <short-id>    # Check/uncheck a checkbox
otl node update --content "new" <id>  # Update content
otl node move <id> --parent <parent-id> --position <pos>  # Move node in hierarchy
otl node delete <short-id>            # Delete node and descendants

# Capture (creates node directly in target document)
otl capture "content"                 # Capture to default target
otl capture "content" --to <target>   # Capture to named target
otl capture "content" --note "extra"  # With note text
otl capture "content" --type checkbox # Create as checkbox
otl capture "a" "b" "c"              # Multiple items at once
echo "text" | otl capture --stdin     # Read from stdin

# Capture targets
otl target list                       # List capture targets
otl target add <name> --node <id>     # Add target (auto-infers doc)
otl target remove <name>              # Remove target
otl target set-default <name>         # Set default target

# Other
otl export markdown <doc-id>          # Export document
otl compact                           # Merge pending ops into state.json
```

**Short IDs** use `<doc-prefix>-<4char>` format (e.g., `outline-q4jo`). The doc prefix comes from the document name. Use `otl doc show <short-id>` as the primary way to navigate — it shows the node and its full subtree with short IDs on each line.

Add `--json` to any command for machine-readable output (useful for parsing with scripts or piping to jq).

### Thin Server (server/)

```bash
cd server
bundle install
bundle exec puma -p 9292              # Run dev server
bundle exec rerun -- puma -p 9292     # Auto-reload dev server
```

## Frontend Architecture

**State Management:** Zustand stores in `app/src/lib/`:
- `outlineStore.ts` - Core document state, node CRUD, navigation, focus management (largest file)
- `zoomStore.ts` - Zoom/focus mode state
- `settingsStore.ts` - Application settings
- `toastStore.ts` - Toast notifications

**Path alias:** `@/*` maps to `src/*` in imports.

**Virtual scrolling:** Uses `@tanstack/react-virtual` for rendering large documents (1500+ items). Combined with the OutlineItem/OutlineItemStatic split, this enables 60fps with large trees.

**No ESLint or Prettier configured.** TypeScript strict mode is the only static analysis. `noUnusedLocals` and `noUnusedParameters` are disabled.

## Data Format

- **state.json**: Current document state (merged from all pending files)
- **pending.{hostname}.jsonl**: Per-machine operations, appended on each edit
- **Operations**: Create, Update, Move, Delete with LWW (Last Write Wins) conflict resolution
- **Nodes**: Hierarchical items with parent_id, position, content, dates, checkboxes

## Key Files

### Frontend Components (app/src/components/)

**OutlineItem Component Split (Performance Optimization)**

The outline renderer uses a two-component architecture for performance with large documents (1500+ items):

```
TreeItemRenderer (App.tsx)
    ├── OutlineItem (focused item only)
    │   └── Full TipTap editor, ~40 hooks, all features
    │
    └── OutlineItemStatic (all other items)
        └── Static HTML, ~6 hooks, minimal overhead
```

- **OutlineItem.tsx** - Full-featured editor for the focused item only
  - TipTap rich-text editor with extensions (WikiLink, Hashtag, DueDate, Mention)
  - Suggestion popups for autocomplete
  - Full keyboard navigation and editing
  - Context menus, drag-drop, notes editing

- **OutlineItemStatic.tsx** - Lightweight renderer for unfocused items
  - Static HTML content (no TipTap)
  - Click-to-focus behavior
  - Context menus and drag-drop
  - ~6 hooks vs ~40 in OutlineItem

- **TreeItemRenderer** (in App.tsx) - Smart router that chooses between components
  - Subscribes to focusedId to determine which component to render
  - Passes childrenSlot for recursive tree rendering

This split enables 60fps navigation with 1500+ items (vs multi-second renders before).

### Frontend Libraries (app/src/lib/)
- `api.ts` - Tauri invoke wrapper with browser-only mock fallback
- `types.ts` - TypeScript types matching Rust structs
- `WikiLink.ts` - TipTap extension for `[[wiki-links]]`

### Rust Backend (app/src-tauri/src/)
- `lib.rs` - Tauri app setup, command registration
- `commands.rs` - Tauri command handlers (load_document, create_node, search, etc.)
- `data/document.rs` - Document loading, saving, compaction
- `data/node.rs` - Node struct and operations
- `data/operations.rs` - Operation types and apply logic
- `search/mod.rs` - SQLite FTS5 search index, backlinks tracking

## Tauri Commands

The frontend communicates with the Rust backend via these commands:
- `load_document(docId?)` - Load document state
- `create_node(parentId, position, content)` - Create new node
- `update_node(id, changes)` - Update node fields
- `move_node(id, parentId, position)` - Move node in hierarchy
- `delete_node(id)` - Delete node and descendants
- `compact_document()` - Merge pending files into state.json
- `search(query, docId?, limit?)` - FTS5 search
- `get_backlinks(nodeId)` - Find nodes linking to this node
- `get_next_occurrence(rrule, afterDate)` - Calculate next recurrence date

## Multi-Machine Sync

The app supports offline editing on multiple machines via file sync (Dropbox/Syncthing):
1. Each machine writes to its own `pending.{hostname}.jsonl`
2. On load, all pending files are replayed in timestamp order
3. `compact_document()` merges state and clears pending files
4. Conflicts resolved via LWW (Last Write Wins) on `updated_at`

## Testing

**Playwright E2E tests are the primary testing strategy for the frontend.** New features should include Playwright tests covering user interactions.

- **E2E tests**: `app/tests/*.spec.ts` using Playwright
- **Rust tests**: Unit tests in `app/src-tauri/src/` modules (inline `#[cfg(test)]`)
- **Rust test data isolation**: Rust tests that touch the filesystem MUST use `set_data_dir(Some(tmp_path))` (not env vars) to redirect to a temp directory, and reset on teardown. See `folders.rs` `TestDataDir` RAII guard pattern. Never let tests write to `~/.outline-data/`.
- Playwright auto-starts Vite dev server on port 5173 (reuses existing if running)
- Runs on Chromium only
- Use `npm run test:headed` to debug tests visually

### Running a Single Test

```bash
cd app
npx playwright test tests/wiki-links.spec.ts           # Single file
npx playwright test -g "creates a wiki link"            # By test name
npx playwright test tests/wiki-links.spec.ts --headed   # With browser visible
npx playwright test tests/wiki-links.spec.ts --ui       # Interactive UI mode
```

### Test Coverage Areas

The Playwright suite covers:
- Basic editing (create, update, delete items)
- Navigation (arrow keys, focus management)
- Hierarchy operations (indent, outdent, collapse/expand)
- Drag and drop reordering
- Checkboxes and task completion
- Wiki links and backlinks
- Hashtags
- Inline dates and date picker
- Recurrence picker
- Rich text formatting
- Search
- Sidebar and document switching
- Context menus
- Date views panel
- Tags panel

## Coding Conventions

### Null vs Undefined Handling

Data from the Rust backend may have `undefined` where TypeScript types say `null` (due to JSON serialization of `Option<T>`). To prevent bugs:

1. **Use loose equality for null checks** - `== null` catches both `null` and `undefined`:
   ```typescript
   // GOOD - handles both null and undefined
   if (node.parent_id == null) { ... }

   // BAD - misses undefined, causes blank views
   if (node.parent_id === null) { ... }
   ```

2. **Coerce undefined to null when assigning** - use nullish coalescing:
   ```typescript
   // GOOD
   zoomedNodeId = node.parent_id ?? null;

   // BAD - propagates undefined
   zoomedNodeId = node.parent_id;
   ```

3. **Key fields affected**: `parent_id`, and any `Option<T>` field from Rust

## Issue Tracking in Outline

When working on bd issues that correspond to outline nodes, use robot emoji tracking nodes as children:

- **Creating**: When starting a bd issue linked to an outline node, create a child: `🤖 Tracked: otl-xxxx (open, P2)`
- **Completing**: When closing the issue, update the node and prepend ☑️: `☑️ 🤖 Tracked: otl-xxxx (closed) — summary of outcome`
- **Open issues** use just `🤖`, closed issues add `☑️` prefix
