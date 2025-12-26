# Developer Onboarding Guide

Welcome to Outline! This guide will help you understand the codebase and start contributing.

## What is Outline?

Outline is a self-hosted hierarchical outliner (think Dynalist/Workflowy) with:
- Infinite nesting of items
- Wiki-style `[[cross-links]]` between items
- Tasks with checkboxes, due dates, and recurrence
- Full-text search
- Calendar integration via iCalendar feeds
- Multi-machine sync via file sync services (Dropbox, Syncthing)

## Architecture at a Glance

```
┌─────────────────────────────────────────┐
│         Desktop App (Tauri 2)           │
│  ┌─────────────────┬─────────────────┐  │
│  │  Svelte 5 + UI  │   Rust Backend  │  │
│  │  (app/src/)     │  (src-tauri/)   │  │
│  └────────┬────────┴────────┬────────┘  │
│           │   Tauri IPC     │           │
└───────────┼─────────────────┼───────────┘
            │                 │
            ▼                 ▼
     ┌──────────┐      ┌──────────┐
     │  SQLite  │      │  JSONL   │
     │  (cache) │      │  (data)  │
     └──────────┘      └──────────┘
```

See the [C4 diagrams](README.md) for detailed architecture views.

## Quick Start

### Prerequisites

- Node.js 18+
- Rust 1.77+
- pnpm or npm

### Running the App

```bash
# Frontend only (browser dev mode with mock data)
cd app
npm install
npm run dev
# Open http://localhost:5173

# Full desktop app (Tauri + Rust backend)
cd app
npm run tauri dev
```

### Running Tests

```bash
# E2E tests (Playwright)
cd app
npm run test

# With browser visible
npm run test:headed

# Rust unit tests
cd app/src-tauri
cargo test
```

## Codebase Tour

### Frontend (`app/src/lib/`)

| File | Purpose |
|------|---------|
| `outline.svelte.ts` | **Core state management** - the brain of the app. Manages document tree, undo/redo, caching. Start here to understand data flow. |
| `api.ts` | Bridge to Rust backend. Wraps Tauri `invoke()` calls with TypeScript types. Has browser mock fallback. |
| `types.ts` | TypeScript interfaces matching Rust structs. |
| `OutlineItem.svelte` | Individual node component. Lazy TipTap editor, context menu, drag handle. |
| `Sidebar.svelte` | Document/folder navigation. |

**TipTap Extensions** (rich text editor customizations):
| File | Purpose |
|------|---------|
| `WikiLink.ts` | `[[wiki-link]]` detection and autocomplete |
| `Hashtag.ts` | `#tag` parsing and suggestions |
| `DueDate.ts` | Inline date marks |

### Backend (`app/src-tauri/src/`)

| File | Purpose |
|------|---------|
| `commands.rs` | **Tauri command handlers** - all frontend→backend calls land here. |
| `data/document.rs` | Document loading, saving, compaction logic. |
| `data/operations.rs` | Operation types (Create, Update, Move, Delete) and conflict resolution. |
| `data/node.rs` | Node struct definition. |
| `search/mod.rs` | SQLite FTS5 full-text search. |

### Key Data Files (`~/.outline-data/`)

```
documents/
  {uuid}/
    state.json         # Current merged state
    pending.host.jsonl # Operations from this machine
    pending.other.jsonl # Operations from other machines
inbox.jsonl            # Captured items
folders.json           # Folder organization
.cache/outline.db      # SQLite search index (not synced)
```

## Core Concepts

### 1. Nodes

Everything is a node. Nodes have:
- `id` (UUID v7, sortable by creation time)
- `parent_id` (hierarchy)
- `position` (order among siblings)
- `content` (HTML from TipTap)
- `node_type` (bullet, checkbox, heading)
- `date`, `date_recurrence` (for tasks)
- `updated_at` (for conflict resolution)

### 2. Operations

All changes are operations appended to `pending.{hostname}.jsonl`:

```json
{"Create": {"id": "...", "parent_id": "...", "position": 0, "content": "Hello", "updated_at": "..."}}
{"Update": {"id": "...", "changes": {"content": "Hello World"}, "updated_at": "..."}}
{"Move": {"id": "...", "parent_id": "...", "position": 1, "updated_at": "..."}}
{"Delete": {"id": "...", "updated_at": "..."}}
```

### 3. Last-Write-Wins (LWW)

When the same node is edited on multiple machines:
1. All `pending.*.jsonl` files are collected
2. Operations are sorted by `updated_at`
3. Later timestamps overwrite earlier ones
4. Resolution is per-field (content and position are separate)

### 4. Compaction

Over time, pending files accumulate. Compaction:
1. Merges all operations into a single state
2. Writes new `state.json`
3. Deletes all `pending.*.jsonl` files

Triggered manually or periodically.

### 5. Lazy Editors

For performance, TipTap editors are only created when a node receives focus. On blur, the editor is destroyed. This allows thousands of nodes without memory issues.

## Data Flow

![Data Flow](data-flow.svg)

**Edit Flow:**
1. User types in OutlineItem
2. Svelte handler calls `outline.updateContent()`
3. `api.ts` invokes Tauri command
4. Rust appends operation to `pending.jsonl`
5. Operation applied to in-memory state
6. State returned to frontend
7. UI updates via Svelte reactivity

**Load Flow:**
1. Read `state.json` (base state)
2. Collect all `pending.*.jsonl` files
3. Sort operations by timestamp
4. Replay in order (LWW for conflicts)
5. Background: index for search
6. Render tree

## Common Tasks

### Adding a New Node Field

1. Add field to `Node` struct in `app/src-tauri/src/data/node.rs`
2. Add to `UpdateChanges` in `operations.rs`
3. Add to TypeScript `Node` in `app/src/lib/types.ts`
4. Update `OutlineItem.svelte` UI
5. Add Playwright test in `app/tests/`

### Adding a TipTap Extension

1. Create extension in `app/src/lib/YourExtension.ts`
2. Register in `OutlineItem.svelte` editor config
3. Add autocomplete suggestions if needed
4. Test with Playwright

### Adding a Tauri Command

1. Add handler in `app/src-tauri/src/commands.rs`
2. Register in `lib.rs` `.invoke_handler()`
3. Add wrapper in `app/src/lib/api.ts`
4. Call from Svelte components

## Testing Strategy

**Playwright E2E tests are primary.** The test suite covers:
- Basic editing (create, update, delete)
- Navigation (keyboard, focus)
- Hierarchy (indent, outdent, collapse)
- Drag and drop
- Wiki links and backlinks
- Search
- Date picker and recurrence

Run tests frequently:
```bash
npm run test           # Headless
npm run test:headed    # See the browser
```

## Performance Considerations

- **Flat storage**: Nodes stored as flat array, tree built in memory
- **Surgical cache invalidation**: Only rebuild affected parent's children
- **Lazy editors**: TipTap created on focus, destroyed on blur
- **Background indexing**: Search index updated asynchronously
- **Append-only writes**: Operations appended, not rewritten

## Getting Help

- Read the [C4 architecture diagrams](README.md)
- Check existing tests in `app/tests/` for usage examples
- The `outline.svelte.ts` file has extensive comments
