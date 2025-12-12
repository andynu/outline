# Outline: Master Implementation Plan

A self-hosted Dynalist replacement with cross-linking, mirrors, and calendar integration.

## Architecture Summary

```
┌─────────────────────────────────────────────────────────────────┐
│                    Desktop App (Tauri + Svelte 5)               │
│  ├── TipTap editor for rich text                                │
│  ├── SQLite cache (FTS5 search)                                 │
│  └── JSONL file I/O                                             │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                    Local File Storage                           │
│  ├── documents/{uuid}/state.json      (merged state)            │
│  ├── documents/{uuid}/pending.*.jsonl (per-machine ops)         │
│  ├── meta.jsonl, inbox.jsonl, global/links.jsonl                │
│  └── .cache/outline.db (local SQLite, not synced)               │
└─────────────────────────────────────────────────────────────────┘
                              │
                              │ Dropbox / Syncthing
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                    Thin Server (Ruby/Sinatra)                   │
│  ├── /calendar/{token}/feed.ics   (iCal feed)                   │
│  ├── /outline/inbox POST          (capture)                     │
│  └── /outline/data/* GET          (read-only viewer)            │
└─────────────────────────────────────────────────────────────────┘
```

## Key Decisions

| Aspect | Choice |
|--------|--------|
| Desktop framework | Tauri 2 + Rust backend |
| Frontend | Svelte 5 + TipTap |
| Data format | JSONL (human-readable, git-friendly) |
| Conflict resolution | LWW (Last Write Wins) |
| Sync mechanism | Dumb file sync (Dropbox/Syncthing) |
| Server | Thin Ruby app (capture + calendar only) |

---

## Phase 1: Foundation (Usable Outliner)

**Goal:** Basic outliner that can replace a text file. Edit, save, reload.

### 1.1 Project Setup
- [ ] Create Tauri 2 + SvelteKit project
- [ ] Configure for static adapter (no SSR)
- [ ] Set up TypeScript, ESLint, Prettier
- [ ] Add TipTap dependencies

### 1.2 Data Layer (Rust)
- [ ] Define Node struct in Rust
- [ ] Implement state.json read/write
- [ ] Implement pending.{hostname}.jsonl append
- [ ] Add Tauri commands: `load_document`, `save_op`
- [ ] Create single hardcoded document for testing

### 1.3 Basic Tree UI
- [ ] Render flat list of nodes from state
- [ ] Indent based on depth (visual only)
- [ ] Click to select node
- [ ] Show content in TipTap editor

### 1.4 Editing
- [ ] Edit node content via TipTap
- [ ] Save changes to pending file on blur/debounce
- [ ] Create new node (Enter key)
- [ ] Delete node (Ctrl+Shift+Backspace)

### 1.5 Hierarchy Operations
- [ ] Indent node (Tab) — change parent
- [ ] Outdent node (Shift+Tab)
- [ ] Move up/down among siblings (Ctrl+↑/↓)

### 1.6 Persistence Round-Trip
- [ ] On startup: load state.json + replay pending files
- [ ] On edit: append to pending.{hostname}.jsonl
- [ ] Manual "save" merges pending → state.json
- [ ] Verify: close app, reopen, data persists

**Milestone:** Can create an outline, edit it, close app, reopen with data intact.

---

## Phase 2: Navigation & Polish

**Goal:** Feels like a real outliner. Keyboard-driven, collapse/expand, zoom.

### 2.1 Collapse/Expand
- [ ] Track `collapsed` state per node
- [ ] Toggle with Ctrl+. or click arrow
- [ ] Don't render children of collapsed nodes
- [ ] Persist collapsed state

### 2.2 Zoom (Hoisting)
- [ ] Track `focusedNodeId` (null = show roots)
- [ ] Ctrl+] to zoom into selected node
- [ ] Ctrl+[ to zoom out to parent
- [ ] Breadcrumb trail showing path to root

### 2.3 Keyboard Navigation
- [ ] Arrow keys move selection
- [ ] Enter creates sibling below
- [ ] Shift+Enter edits note (or creates child?)
- [ ] Home/End for first/last sibling

### 2.4 Multi-Document
- [ ] Document list in sidebar
- [ ] Create new document
- [ ] Switch between documents
- [ ] meta.jsonl for document registry

### 2.5 Visual Polish
- [ ] Proper indentation lines
- [ ] Focus ring on selected node
- [ ] Smooth collapse/expand animation
- [ ] Dark/light theme toggle

**Milestone:** Comfortable daily use for note-taking. Can reorganize freely.

---

## Phase 3: Multi-Machine Sync

**Goal:** Use on laptop and desktop via Dropbox. Edits merge automatically.

### 3.1 Sync Detection
- [ ] Poll document directories every 2-3 minutes
- [ ] Detect mtime changes on state.json and pending.*.jsonl
- [ ] Track sync state in .cache/sync-state.json

### 3.2 Merge Logic
- [ ] Read state.json as base
- [ ] Read all pending.*.jsonl files
- [ ] Apply ops sorted by updated_at (LWW per field)
- [ ] Normalize positions to clean integers
- [ ] Write merged state.json
- [ ] Delete all pending files after successful merge

### 3.3 Conflict File Recovery
- [ ] On startup, scan for Dropbox conflict copies
- [ ] Parse all state*.json variants
- [ ] Merge nodes by ID (LWW by updated_at)
- [ ] Write unified state.json, delete conflicts

### 3.4 Compaction
- [ ] Primary claim system (soft, via meta/primary.json)
- [ ] Only primary compacts by default
- [ ] Secondary machines can force takeover
- [ ] UI showing current role

### 3.5 Testing
- [ ] Test: edit on A, switch to B, see changes
- [ ] Test: edit on both offline, reconnect, merge
- [ ] Test: Dropbox conflict file created, auto-resolved

**Milestone:** Seamlessly switch between machines. Conflicts resolve automatically.

---

## Phase 4: Search & Links

**Goal:** Find anything fast. Connect ideas with wiki-links.

### 4.1 SQLite Cache
- [ ] Create .cache/outline.db on startup
- [ ] Rebuild from state.json files
- [ ] FTS5 virtual table for content search
- [ ] Indexes for parent_id, date, tags

### 4.2 Full-Text Search
- [ ] Search input (Ctrl+Shift+F)
- [ ] Query FTS5, show results
- [ ] Click result to navigate (switch doc + zoom)
- [ ] Search within current document (Ctrl+F)

### 4.3 Quick Navigation
- [ ] File Finder (Ctrl+O) — fuzzy match document titles
- [ ] Item Finder (Ctrl+Shift+O) — fuzzy match all nodes
- [ ] Recent documents list

### 4.4 Internal Links
- [ ] `[[` triggers autocomplete
- [ ] Search nodes by title/content
- [ ] Insert link as `[[node-id|display text]]`
- [ ] Render links as clickable chips
- [ ] Click to navigate to linked node

### 4.5 Backlinks
- [ ] Extract links on save, store in global/links.jsonl
- [ ] Backlinks panel showing "N items link here"
- [ ] Click backlink to navigate to source

**Milestone:** Knowledge base functionality. Ideas are connected.

---

## Phase 5: Tasks & Dates

**Goal:** Task management with calendar integration.

### 5.1 Checkboxes
- [ ] Node type: checkbox (vs bullet, heading)
- [ ] Toggle checkbox (Ctrl+Enter)
- [ ] Visual: checkbox UI, strikethrough when checked
- [ ] Option: hide/show checked items

### 5.2 Dates
- [ ] Date field on nodes
- [ ] Date picker UI (click date badge)
- [ ] Natural language: `!today`, `!tomorrow`, `!jan 15`
- [ ] Parse with chrono-node or similar
- [ ] Overdue highlighting (red badge)

### 5.3 Date Views
- [ ] "Today" view — all items with today's date
- [ ] "Upcoming" view — next 7 days
- [ ] "Overdue" view — past dates, unchecked
- [ ] Filter search: `has:date`, `overdue:`, `before:2025-02-01`

### 5.4 Recurring Tasks
- [ ] Recurrence field (RRULE format)
- [ ] UI for common patterns (daily, weekly, monthly)
- [ ] On check: auto-create next occurrence

### 5.5 iCalendar Feed (Desktop Generation)
- [ ] Generate feed.ics from dated items
- [ ] Write to data directory (syncs to server)
- [ ] VEVENT for dated items
- [ ] VTODO for checkbox items with dates
- [ ] Regenerate on save

**Milestone:** Replace task manager. Subscribe to calendar in Google Calendar.

---

## Phase 6: Thin Server

**Goal:** Mobile capture and calendar serving.

### 6.1 Server Setup
- [ ] Ruby Sinatra app skeleton
- [ ] Deploy to colo server
- [ ] nginx reverse proxy config
- [ ] Basic auth on /outline/*

### 6.2 Inbox Capture
- [ ] POST /outline/inbox endpoint
- [ ] Append to inbox.jsonl
- [ ] Simple mobile-friendly HTML form
- [ ] API endpoint for automation (POST JSON)

### 6.3 Calendar Serving
- [ ] GET /calendar/{token}/feed.ics
- [ ] Serve synced feed.ics file
- [ ] Token validation (UUID in config)
- [ ] Optional tag filter: ?tag=work

### 6.4 Read-Only Viewer
- [ ] Static viewer.html (Svelte SPA, built separately)
- [ ] Fetch state.json via /outline/data/{doc}/state.json
- [ ] Render read-only outline
- [ ] Zoom to node via URL param

### 6.5 Inbox Processing (Desktop)
- [ ] Show inbox badge in desktop app
- [ ] Inbox panel listing captured items
- [ ] Drag to target location (creates node)
- [ ] Delete from inbox.jsonl

**Milestone:** Capture ideas from phone. Calendar subscribable.

---

## Phase 7: Mirrors & Advanced

**Goal:** Transclusion (Workflowy-style mirrors), import/export.

### 7.1 Mirrors
- [ ] `((` triggers node picker (like `[[`)
- [ ] Create mirror node with `mirror_source_id`
- [ ] Render mirror: show source content, sync indicator
- [ ] Edit mirror → updates source
- [ ] All mirrors reflect changes

### 7.2 Mirror Lifecycle
- [ ] Delete mirror: removes only that reference
- [ ] Delete source: convert mirrors to regular nodes (copy content)
- [ ] Visual distinction (↔ icon or border)

### 7.3 Import
- [ ] OPML import (Dynalist, Workflowy)
- [ ] Parse OPML → create nodes
- [ ] Map OPML notes to our note field
- [ ] Preserve hierarchy

### 7.4 Export
- [ ] OPML export
- [ ] Markdown export (with indentation)
- [ ] Plain text export
- [ ] JSON backup (full data dump)

### 7.5 Tags
- [ ] Parse #tags from content
- [ ] Tag panel in sidebar
- [ ] Click tag to search
- [ ] Tag colors (optional)

**Milestone:** Full Dynalist replacement. Can migrate data.

---

## Phase 8: Polish & Edge Cases

**Goal:** Production-ready. Handle all the weird stuff.

### 8.1 Undo/Redo
- [ ] Operation history stack
- [ ] Ctrl+Z / Ctrl+Y
- [ ] Per-document undo stack

### 8.2 Rich Text
- [ ] Bold, italic, code, strikethrough
- [ ] Markdown shortcuts in TipTap
- [ ] Code blocks with syntax highlighting
- [ ] Inline images

### 8.3 Node Notes
- [ ] Note field (supplementary text)
- [ ] Toggle note visibility
- [ ] Shift+Enter to edit note

### 8.4 Settings
- [ ] Keyboard shortcut customization
- [ ] Theme selection
- [ ] Font size/family
- [ ] Data directory location

### 8.5 Error Handling
- [ ] Graceful handling of corrupt files
- [ ] Backup before destructive operations
- [ ] Crash recovery (detect incomplete writes)
- [ ] User-facing error messages

### 8.6 Performance
- [ ] Virtualized tree rendering (large documents)
- [ ] Lazy loading of collapsed subtrees
- [ ] Debounced saves
- [ ] Profile and optimize hot paths

**Milestone:** Reliable daily driver. No data loss scenarios.

---

## File Reference

| File | Purpose |
|------|---------|
| `dynalist-replacement-features.md` | Feature specification |
| `proposal-svelte5-tiptap.md` | Frontend architecture |
| `architecture-data-format.md` | Data format decisions |
| `architecture-wal-sync.md` | Sync mechanism |
| `architecture-compaction-strategies.md` | Multi-machine compaction |
| `architecture-client-server-split.md` | Desktop/server split |

---

## Next Action

Start with **Phase 1.1: Project Setup**

```bash
cd prototype  # or create fresh
npm create tauri-app@latest -- --template sveltekit-ts
```
