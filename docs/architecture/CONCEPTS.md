# Key Concepts Reference

Deep-dive into the core concepts that power Outline.

## Table of Contents

1. [Document Model](#document-model)
2. [Operation Log & Conflict Resolution](#operation-log--conflict-resolution)
3. [Tree Building & Caching](#tree-building--caching)
4. [Search & Backlinks](#search--backlinks)
5. [Multi-Machine Sync](#multi-machine-sync)
6. [Undo/Redo](#undoredo)

---

## Document Model

### Node Structure

A document is a flat array of nodes. Each node has:

```typescript
interface Node {
  id: string;              // UUID v7 (sortable by creation time)
  parent_id: string | null; // null = root level
  position: number;         // Order among siblings (0, 1, 2...)
  content: string;          // HTML from TipTap
  note: string | null;      // Extended notes (collapsed by default)

  node_type: 'bullet' | 'checkbox' | 'heading';
  heading_level: number | null;  // 1-6 for headings
  is_checked: boolean;           // For checkboxes

  color: string | null;          // Label color
  tags: string[];                // Extracted #hashtags
  date: string | null;           // ISO 8601 due date
  date_recurrence: string | null; // iCal RRULE

  collapsed: boolean;            // UI state
  mirror_source_id: string | null; // For mirrored nodes

  created_at: string;            // ISO 8601
  updated_at: string;            // ISO 8601 (used for LWW)
}
```

### Why Flat Storage?

Storing nodes as a flat array (not nested) has advantages:

1. **Simpler file format**: Just `{ nodes: [...] }`
2. **Efficient updates**: Change one node without rewriting entire tree
3. **Flexible queries**: Filter by any field without tree traversal
4. **Merge-friendly**: Operations reference nodes by ID, not path

The tree structure is built in memory from `parent_id` relationships.

### Position Numbering

Siblings are ordered by `position` (integer). When inserting:
- Between positions 2 and 3: new node gets position 2.5 (fractional)
- On save/compact: positions are renumbered to integers

This avoids rewriting all siblings on every insert.

---

## Operation Log & Conflict Resolution

### Operation Types

All document changes are expressed as operations:

```rust
enum Operation {
    Create {
        id: Uuid,
        parent_id: Option<Uuid>,
        position: i32,
        content: String,
        node_type: NodeType,
        updated_at: DateTime<Utc>,
    },
    Update {
        id: Uuid,
        changes: UpdateChanges,  // Only changed fields
        updated_at: DateTime<Utc>,
    },
    Move {
        id: Uuid,
        parent_id: Option<Uuid>,
        position: i32,
        updated_at: DateTime<Utc>,
    },
    Delete {
        id: Uuid,
        updated_at: DateTime<Utc>,
    },
}
```

### Last-Write-Wins (LWW)

When conflicts occur (same node edited on multiple machines):

1. Operations are sorted by `updated_at` timestamp
2. Later operations overwrite earlier ones
3. Resolution is **per-field**:
   - Machine A changes `content` at T1
   - Machine B changes `is_checked` at T2
   - Result: B's `is_checked` wins, but A's `content` is preserved (if T1 > any content change from B)

### Why LWW?

- Simple to implement and reason about
- No user intervention needed
- Timestamps from different machines are "close enough" in practice
- For a personal tool, conflicts are rare

### Append-Only Log

Operations are appended to `pending.{hostname}.jsonl`:

```
{"Create": {..., "updated_at": "2024-01-15T10:00:00Z"}}
{"Update": {..., "updated_at": "2024-01-15T10:00:05Z"}}
{"Update": {..., "updated_at": "2024-01-15T10:00:10Z"}}
```

Benefits:
- Fast writes (no read-modify-write)
- Natural audit log
- Per-machine isolation (no write conflicts between machines)

---

## Tree Building & Caching

### The Problem

With thousands of nodes, rebuilding the full tree on every change is expensive.

### The Solution: Surgical Invalidation

`outline.svelte.ts` maintains caches:

```typescript
// Primary indexes
nodesById: Map<string, Node>
childrenByParent: Map<string, Node[]>  // Sorted by position

// Derived
treeCache: Map<string, TreeNode[]>  // Built trees per root
```

On update:
1. Find which parent's children are affected
2. Invalidate only that parent's cache entry
3. Rebuild on next access (lazy)

### Tree Building Algorithm

```typescript
function buildTree(parentId: string, depth: number): TreeNode[] {
  // Check cache first
  if (treeCache.has(parentId)) return treeCache.get(parentId);

  const children = childrenByParent.get(parentId) ?? [];
  const result = children
    .filter(n => passesFilters(n))  // Hashtag filter, hide completed, etc.
    .map(node => ({
      node,
      depth,
      children: node.collapsed ? [] : buildTree(node.id, depth + 1)
    }));

  treeCache.set(parentId, result);
  return result;
}
```

### Flattening for Rendering

Svelte renders a flat list (for virtualization potential):

```typescript
function flattenTree(tree: TreeNode[]): FlatNode[] {
  const result = [];
  for (const node of tree) {
    result.push({ ...node.node, depth: node.depth });
    result.push(...flattenTree(node.children));
  }
  return result;
}
```

---

## Search & Backlinks

### SQLite FTS5

Full-text search uses SQLite's FTS5 extension:

```sql
CREATE VIRTUAL TABLE nodes_fts USING fts5(
  content,
  note,
  document_id UNINDEXED,
  node_id UNINDEXED
);
```

Queries use FTS5 syntax:
- `project` - matches "project", "projects", etc.
- `"exact phrase"` - exact match
- `project AND meeting` - both terms
- `project*` - prefix match

### Backlinks Table

Wiki links are tracked separately:

```sql
CREATE TABLE links (
  source_node_id TEXT,
  target_node_id TEXT,
  document_id TEXT
);
CREATE INDEX idx_target ON links(target_node_id);
```

When content changes:
1. Parse `[[wiki-links]]` from HTML
2. Resolve link text to node IDs
3. Update links table

### Background Indexing

Search indexing runs in a background thread:
- Doesn't block document load
- Updates incrementally on changes
- Full reindex on document switch

---

## Multi-Machine Sync

### The Scenario

User edits on laptop, then edits on desktop, then laptop again. Both machines should see all changes merged correctly.

### File Layout

```
documents/{uuid}/
  state.json           # Base state (last compaction)
  pending.laptop.jsonl  # Ops from laptop
  pending.desktop.jsonl # Ops from desktop
```

### Sync Protocol

1. **Edit**: Append operation to `pending.{hostname}.jsonl`
2. **File Sync**: Dropbox/Syncthing copies files between machines
3. **Load**: Read `state.json` + all `pending.*.jsonl` files
4. **Merge**: Sort all ops by timestamp, apply in order
5. **Compact**: Periodically merge into new `state.json`, delete pending files

### Why Per-Machine Pending Files?

- No write conflicts at file level (each machine writes its own file)
- Operations from all machines visible after sync
- Clear provenance (which machine made which change)

### Compaction

Pending files grow over time. Compaction:
1. Collects all operations
2. Applies them to build final state
3. Writes new `state.json`
4. Deletes all `pending.*.jsonl`

Should be done when all machines have synced to avoid losing operations.

---

## Undo/Redo

### Stack Structure

```typescript
interface UndoEntry {
  type: 'create' | 'update' | 'move' | 'delete';
  nodeId: string;
  before: Partial<Node> | null;  // State before change
  after: Partial<Node> | null;   // State after change
}

undoStack: UndoEntry[]  // Max 100 entries
redoStack: UndoEntry[]
```

### How It Works

**On change:**
1. Capture node state before change
2. Apply change
3. Capture node state after change
4. Push to undo stack
5. Clear redo stack

**On undo:**
1. Pop from undo stack
2. Restore `before` state
3. Push to redo stack

**On redo:**
1. Pop from redo stack
2. Restore `after` state
3. Push to undo stack

### Session-Local

Undo history is:
- Not persisted to disk
- Not synced between machines
- Cleared on document switch

This keeps it simple and fast.

---

## Performance Budget

Target metrics for a document with 5,000 nodes:

| Operation | Target |
|-----------|--------|
| Document load | < 500ms |
| Single node update | < 50ms |
| Tree rebuild (full) | < 100ms |
| Search query | < 200ms |
| Memory usage | < 100MB |

Achieved through:
- Flat storage (no deep nesting in files)
- Lazy editor creation (TipTap only on focus)
- Surgical cache invalidation
- Background search indexing
- Append-only writes
