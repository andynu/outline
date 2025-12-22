# Architecture: Data Format Options

## Decisions (Settled)

| Decision | Choice | Rationale |
|----------|--------|-----------|
| File organization | Option D Hybrid | Per-document isolation + global cross-cutting concerns |
| Document storage | `state.json` + `pending.{hostname}.jsonl` | Plain JSON for state, append-only log for unsynced edits |
| Machine ID | Hostname | Simple, no collisions for single-user multi-machine |
| Sync detection | Poll every 2-3 min | Simpler than FS watchers, works with Dropbox/Syncthing |
| Position handling | Integers, normalize on merge | Simple, conflicts resolved during merge anyway |
| Tags | Field on node record | Build index later if speed becomes an issue |
| Mirrors | `mirror_source_id` on node only | Separate mirrors.jsonl would be redundant |
| Global files | Just `links.jsonl` | Cross-document links only |

### Final Structure

```
outline-data/
├── meta.jsonl                          ← Documents, folders, settings
├── documents/
│   └── {doc-uuid}/
│       ├── state.json                  ← Merged state (all machines agree)
│       └── pending.{hostname}.jsonl    ← Per-machine unsynced edits
├── global/
│   └── links.jsonl                     ← Cross-document links
├── inbox.jsonl                         ← Capture queue (append-only)
├── deletions.jsonl                     ← Tombstones
└── .cache/
    └── outline.db                      ← SQLite cache (local, not synced)
```

### Sync Flow

```
Write (local):
  User edits node → Append op to pending.{hostname}.jsonl → Update SQLite

Sync (every 2-3 min):
  1. Check mtimes of all pending.*.jsonl and state.json files
  2. If changes detected from other machines:
     a. Read state.json (base state)
     b. Read all pending.*.jsonl files (ops from all machines)
     c. Apply ops in updated_at order (LWW per node)
     d. Normalize positions to clean integers
     e. Write new state.json
     f. Clear all pending.*.jsonl files
  3. Update SQLite cache
```

### pending.{hostname}.jsonl Format

```jsonl
{"op":"create","id":"node-uuid","parent_id":"...","position":0,"content":"New node","node_type":"bullet","updated_at":"2025-01-15T10:00:00Z"}
{"op":"update","id":"node-uuid","changes":{"content":"Updated text","is_checked":true},"updated_at":"2025-01-15T10:05:00Z"}
{"op":"move","id":"node-uuid","parent_id":"new-parent","position":2,"updated_at":"2025-01-15T10:10:00Z"}
{"op":"delete","id":"node-uuid","updated_at":"2025-01-15T10:15:00Z"}
```

---

## Core Principle

JSONL as the archival, syncable, human-readable source of truth. SQLite as a derived local cache for fast queries. The JSONL files are what get synced; the SQLite is rebuilt on each machine.

```
JSONL (synced)          SQLite (local, derived)
─────────────────       ─────────────────────────
• Human-readable        • Fast queries
• Diffable              • Full-text search (FTS5)
• Git-friendly          • Indexed relationships
• Line-based merging    • Rebuilt from JSONL
• Archival-safe         • Disposable/rebuildable
```

---

## File Organization Options

### Option A: Single JSONL File

```
outline-data/
├── data.jsonl           ← All records: nodes, documents, links
├── inbox.jsonl          ← Capture queue (append-only)
├── deletions.jsonl      ← Tombstones for deleted records
└── .cache/
    └── outline.db       ← SQLite cache (gitignored/not synced)
```

**Record format:**
```jsonl
{"type":"document","id":"doc-uuid-1","title":"Projects","folder_id":null,"icon":"📁","created_at":"...","updated_at":"..."}
{"type":"node","id":"node-uuid-1","doc_id":"doc-uuid-1","parent_id":null,"position":0,"content":"Project Alpha","node_type":"bullet","updated_at":"..."}
{"type":"node","id":"node-uuid-2","doc_id":"doc-uuid-1","parent_id":"node-uuid-1","position":0,"content":"Task one","node_type":"checkbox","is_checked":false,"updated_at":"..."}
{"type":"link","id":"link-uuid-1","source_node_id":"node-uuid-5","target_node_id":"node-uuid-2","created_at":"..."}
```

**Pros:**
- Simplest implementation
- Single file to backup/restore
- Easy to reason about

**Cons:**
- File grows unbounded (thousands of edits = large file)
- Every write touches the whole file (or requires append + periodic compaction)
- Merge conflicts more likely with frequent edits

**Best for:** Small to medium outlines, infrequent multi-device access.

---

### Option B: Per-Document JSONL Files

```
outline-data/
├── meta.jsonl           ← Document metadata, folder structure
├── documents/
│   ├── doc-uuid-1.jsonl ← All nodes for "Projects" document
│   ├── doc-uuid-2.jsonl ← All nodes for "Personal" document
│   └── doc-uuid-3.jsonl ← ...
├── links.jsonl          ← Cross-document links (or per-doc)
├── inbox.jsonl          ← Capture queue
├── deletions.jsonl      ← Tombstones
└── .cache/
    └── outline.db
```

**meta.jsonl:**
```jsonl
{"type":"folder","id":"folder-1","name":"Work","parent_id":null,"position":0}
{"type":"document","id":"doc-uuid-1","title":"Projects","folder_id":"folder-1","position":0,"icon":"📁"}
{"type":"document","id":"doc-uuid-2","title":"Personal","folder_id":null,"position":1,"icon":"📝"}
```

**documents/doc-uuid-1.jsonl:**
```jsonl
{"id":"node-uuid-1","parent_id":null,"position":0,"content":"Project Alpha","node_type":"bullet","updated_at":"..."}
{"id":"node-uuid-2","parent_id":"node-uuid-1","position":0,"content":"Task one","node_type":"checkbox","is_checked":false,"date":"2025-01-20","updated_at":"..."}
```

**Pros:**
- Conflicts isolated to single documents
- Can sync/backup individual documents
- Large outline = many small files (better for sync)
- Version history per document if using git
- Faster writes (only touch one file)

**Cons:**
- More files to manage
- Cross-document operations touch multiple files
- Renaming document doesn't rename file (file is by UUID)

**Best for:** Large outlines, heavy multi-device use, wanting per-document history.

---

### Option C: By Record Type

```
outline-data/
├── documents.jsonl      ← Document and folder metadata
├── nodes.jsonl          ← All nodes across all documents
├── links.jsonl          ← Internal links
├── mirrors.jsonl        ← Mirror relationships (or in nodes.jsonl)
├── inbox.jsonl          ← Capture queue
├── deletions.jsonl      ← Tombstones
└── .cache/
    └── outline.db
```

**Pros:**
- Clean separation mirrors the data model
- Easy to query by type (grep nodes.jsonl)
- Moderate file sizes

**Cons:**
- Editing a document touches multiple files (node + maybe link)
- Conflicts span record types (less isolated than per-document)

**Best for:** When you want the data model explicit in the file structure.

---

### Option D: Hybrid (SELECTED)

```
outline-data/
├── meta.jsonl                          ← Documents, folders, settings
├── documents/
│   └── {doc-uuid}/
│       ├── state.json                  ← Merged state (all machines agree)
│       └── pending.{hostname}.jsonl    ← Per-machine unsynced edits
├── global/
│   └── links.jsonl                     ← Cross-document links
├── inbox.jsonl                         ← Capture queue (append-only)
├── deletions.jsonl                     ← Tombstones
└── .cache/
    └── outline.db
```

**Rationale:**
- Per-document directories isolate most edits
- `state.json` = plain JSON, easy to read/edit, represents merged truth
- `pending.{hostname}.jsonl` = append-only ops, per-machine to avoid file conflicts
- Global links file for cross-document relationships
- Mirrors handled via `mirror_source_id` field on node (no separate file)
- Inbox stays separate for append-only server writes

**state.json example:**
```json
{
  "nodes": [
    {
      "id": "node-uuid-1",
      "parent_id": null,
      "position": 0,
      "content": "Project Alpha",
      "node_type": "bullet",
      "tags": ["work"],
      "created_at": "2025-01-15T10:00:00Z",
      "updated_at": "2025-01-15T10:00:00Z"
    },
    {
      "id": "node-uuid-2",
      "parent_id": "node-uuid-1",
      "position": 0,
      "content": "Task one",
      "node_type": "checkbox",
      "is_checked": false,
      "date": "2025-01-20",
      "created_at": "2025-01-15T10:00:00Z",
      "updated_at": "2025-01-15T10:05:00Z"
    }
  ]
}
```

---

## Record Schema

### Node Record

```json
{
  "id": "uuid-v7",
  "parent_id": "uuid-v7 | null",
  "position": 0,
  "content": "Node text content here",
  "note": "Optional note text",
  "node_type": "bullet | checkbox | heading",
  "heading_level": "1 | 2 | 3 | null",
  "is_checked": false,
  "color": "red | blue | green | ... | null",
  "tags": ["work", "urgent"],
  "date": "2025-01-20 | null",
  "date_recurrence": "RRULE:FREQ=WEEKLY;BYDAY=MO | null",
  "collapsed": false,
  "mirror_source_id": "uuid-v7 | null",
  "created_at": "2025-01-15T10:00:00Z",
  "updated_at": "2025-01-15T10:05:00Z"
}
```

**Notes:**
- `id`: UUID v7 recommended (time-sortable, unique)
- `position`: Integer for sibling ordering (0, 1, 2, ...), normalized on merge
- `mirror_source_id`: If set, this node is a mirror; display source's content
- `tags`: Array of tag strings; index built on SQLite rebuild if needed
- `date_recurrence`: iCal RRULE format for recurring tasks

### Document Record

```json
{
  "id": "uuid-v7",
  "title": "Document Title",
  "folder_id": "uuid-v7 | null",
  "position": 0,
  "icon": "📁 | null",
  "created_at": "2025-01-15T10:00:00Z",
  "updated_at": "2025-01-15T10:00:00Z"
}
```

### Link Record

```json
{
  "id": "uuid-v7",
  "source_node_id": "uuid-v7",
  "target_node_id": "uuid-v7",
  "created_at": "2025-01-15T10:00:00Z"
}
```

Links are extracted from `[[wiki-style]]` links in node content. The link record enables fast backlink queries without parsing all content.

### Inbox Record

```json
{
  "id": "uuid-v7",
  "content": "Quick capture text",
  "note": "Optional additional context",
  "source": "mobile | api | extension",
  "target_hint": "uuid-v7 | tag:work | null",
  "captured_at": "2025-01-15T10:00:00Z"
}
```

**Notes:**
- `target_hint`: Optional suggestion for where to file (a document, a tag, etc.)
- Inbox items are processed by desktop app and moved to proper location

### Deletion Record

```json
{
  "id": "uuid-v7",
  "deleted_id": "uuid-v7",
  "deleted_type": "node | document | link",
  "deleted_at": "2025-01-15T10:00:00Z"
}
```

---

## Conflict Resolution Strategy

### Last-Write-Wins (Per Record)

```
Machine A edits node X at T1: {"id":"X", "content":"AAA", "updated_at":"T1"}
Machine B edits node X at T2: {"id":"X", "content":"BBB", "updated_at":"T2"}

After sync, both machines see both lines.
Resolution: T2 > T1, so "BBB" wins.
```

**Implementation:**
1. When rebuilding SQLite from JSONL, process lines in order
2. For each record ID, keep the one with latest `updated_at`
3. Deletions win if `deleted_at` > `updated_at`

### Append-Only With Compaction

JSONL files grow over time (edits append new versions, don't modify in place).

**Write path:**
```
Edit node → Append new version to JSONL → Update SQLite
```

**Compaction (periodic):**
```
Read all records → Keep only latest version of each ID → Write new file → Replace old file
```

**When to compact:**
- On app startup if file > threshold
- Manual "compact now" command
- Never automatically (user controls when)

**Compaction safety:**
- Write to `.jsonl.new`, then atomic rename
- Keep `.jsonl.backup` for N days

---

## SQLite Cache Schema

The SQLite database is derived from JSONL and can be rebuilt at any time.

```sql
-- Nodes with full-text search
CREATE TABLE nodes (
  id TEXT PRIMARY KEY,
  doc_id TEXT NOT NULL,
  parent_id TEXT,
  position INTEGER NOT NULL,
  content TEXT NOT NULL,
  note TEXT,
  node_type TEXT NOT NULL DEFAULT 'bullet',
  heading_level INTEGER,
  is_checked INTEGER NOT NULL DEFAULT 0,
  color TEXT,
  tags TEXT,  -- JSON array, e.g. '["work", "urgent"]'
  date TEXT,
  date_recurrence TEXT,
  collapsed INTEGER NOT NULL DEFAULT 0,
  mirror_source_id TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (doc_id) REFERENCES documents(id),
  FOREIGN KEY (parent_id) REFERENCES nodes(id),
  FOREIGN KEY (mirror_source_id) REFERENCES nodes(id)
);

CREATE INDEX idx_nodes_doc_id ON nodes(doc_id);
CREATE INDEX idx_nodes_parent_id ON nodes(parent_id);
CREATE INDEX idx_nodes_date ON nodes(date) WHERE date IS NOT NULL;
CREATE INDEX idx_nodes_mirror ON nodes(mirror_source_id) WHERE mirror_source_id IS NOT NULL;

-- Full-text search
CREATE VIRTUAL TABLE nodes_fts USING fts5(
  content, note,
  content='nodes',
  content_rowid='rowid'
);

-- Documents
CREATE TABLE documents (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  folder_id TEXT,
  position INTEGER NOT NULL,
  icon TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

-- Links (for backlink queries)
CREATE TABLE links (
  id TEXT PRIMARY KEY,
  source_node_id TEXT NOT NULL,
  target_node_id TEXT NOT NULL,
  created_at TEXT NOT NULL,
  FOREIGN KEY (source_node_id) REFERENCES nodes(id),
  FOREIGN KEY (target_node_id) REFERENCES nodes(id)
);

CREATE INDEX idx_links_target ON links(target_node_id);

-- Inbox (temporary, processed by desktop)
CREATE TABLE inbox (
  id TEXT PRIMARY KEY,
  content TEXT NOT NULL,
  note TEXT,
  source TEXT,
  target_hint TEXT,
  captured_at TEXT NOT NULL
);

-- Sync metadata
CREATE TABLE sync_meta (
  key TEXT PRIMARY KEY,
  value TEXT
);
-- e.g., ("last_jsonl_mtime", "2025-01-15T10:00:00Z")
```

---

## Edge Cases

### Mirror Deletion

When the source node of a mirror is deleted:
1. Find all nodes where `mirror_source_id = deleted_id`
2. Convert them to regular nodes (copy content, clear `mirror_source_id`)
3. This happens during JSONL → SQLite rebuild

### Cross-Document Moves

Moving a node from Document A to Document B:
1. Update the node's `doc_id`
2. If per-document files: remove from A.jsonl, append to B.jsonl
3. Update `updated_at` so the move propagates

### Position Conflicts

Two machines insert a node at the same position:
```
Machine A: Insert at position 2, updated_at T1
Machine B: Insert at position 2, updated_at T2
```

Resolution: Both nodes exist, both at "position 2". On rebuild, sort by `(position, updated_at)` to deterministically order them.

Alternative: Use fractional positions (0.0, 1.0, 1.5, 2.0) to allow insertion without reordering siblings.

---

## Recommendations

### For Your Use Case

Given: single user, desktop-primary, mobile-capture-only, file sync via Dropbox

**Recommended: Option B (Per-Document) or Option D (Hybrid)**

- Per-document files isolate most conflicts
- Inbox stays separate for safe server writes
- Cross-document links in a global file
- Compaction per-document (smaller operations)

### On Position Handling

**Recommended: Integer positions with normalization**

- Simple integers (0, 1, 2, ...)
- When inserting, shift siblings if needed
- Periodically normalize (0, 1, 2, ...) during compaction
- Simpler than fractional, works fine for single-user

### On UUIDs

**Recommended: UUID v7**

- Time-sortable (created_at implicit in ID)
- Globally unique without coordination
- Supported in most languages

---

## Questions to Decide

1. **File organization:** ~~Single file (A), per-document (B), by-type (C), or~~ hybrid (D)? ✅ **DECIDED: Option D**

2. **Compaction strategy:** ✅ **DECIDED: On app startup if > 1MB**
   - N/A for documents (state.json is always current)
   - For meta.jsonl and global/links.jsonl: compact on startup if > 1MB

3. **Position handling:** ✅ **DECIDED: Integers with normalize-on-merge**
   - ~~Integers with shift-on-insert?~~
   - ~~Fractional positions?~~
   - ~~Strings (lexicographic: "a", "b", "ba", "bb")?~~

4. **Mirror storage:** ✅ **DECIDED: Field on node only**
   - Field on node (`mirror_source_id`)? ← Yes
   - ~~Separate mirrors.jsonl?~~
   - ~~Both (redundant but explicit)?~~

5. **Tag extraction:** ✅ **DECIDED: Stored on node, index built if needed**
   - Stored in node record (`tags: ["work", "urgent"]`)? ← Yes
   - ~~Extracted on index rebuild only?~~
   - ~~Separate tags.jsonl for tag metadata (colors, hierarchy)?~~ (can add later if needed)

6. **Conflict resolution:** ✅ **DECIDED: LWW (Last Write Wins)**
   - Simple, debuggable, works with dumb file sync
   - Acceptable data loss risk for single-user scenario
   - ~~CRDTs~~ (too complex, conflicts with file sync mechanism)
