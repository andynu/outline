# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Outline is a self-hosted Dynalist/Workflowy replacement - a hierarchical outliner with cross-linking, tasks, dates, and calendar integration. The project uses a Tauri 2 + Rust backend with a Svelte 5 frontend.

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                    Desktop App (app/)                           │
│  ├── Svelte 5 + TipTap frontend (app/src/)                     │
│  └── Rust/Tauri backend (app/src-tauri/)                       │
│      ├── SQLite FTS5 search cache                              │
│      └── JSONL file I/O                                        │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                    Local File Storage (~/.outline-data/)        │
│  ├── documents/{uuid}/state.json      (merged state)           │
│  ├── documents/{uuid}/pending.*.jsonl (per-machine ops)        │
│  └── inbox.jsonl (captured items)                              │
├─────────────────────────────────────────────────────────────────┤
│  Platform Cache (~/Library/Caches/outline/ on macOS)           │
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
│  └── /outline/api/inbox           (capture API)                │
└─────────────────────────────────────────────────────────────────┘
```

## Commands

### Desktop App (app/)

```bash
cd app
npm install
npm run dev          # Vite dev server (http://localhost:5173)
npm run build        # Production build
npm run check        # TypeScript/Svelte type checking
npm run test         # Playwright E2E tests
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

### Thin Server (server/)

```bash
cd server
bundle install
bundle exec puma -p 9292              # Run dev server
bundle exec rerun -- puma -p 9292     # Auto-reload dev server
```

## Data Format

- **state.json**: Current document state (merged from all pending files)
- **pending.{hostname}.jsonl**: Per-machine operations, appended on each edit
- **Operations**: Create, Update, Move, Delete with LWW (Last Write Wins) conflict resolution
- **Nodes**: Hierarchical items with parent_id, position, content, dates, checkboxes

## Key Files

### Frontend (app/src/lib/)
- `outline.svelte.ts` - Core reactive state management, tree operations
- `api.ts` - Tauri invoke wrapper with browser-only mock fallback
- `types.ts` - TypeScript types matching Rust structs
- `OutlineItem.svelte` - Individual outline node component
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
- **Rust tests**: Unit tests in `app/src-tauri/src/` modules
- Playwright auto-starts dev server for E2E tests
- Use `npm run test:headed` to debug tests visually

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
