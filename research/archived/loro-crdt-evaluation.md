# Loro CRDT Evaluation for Outliner Data Model

Research conducted: 2025-12-09
Issue: otl-bxr

## Executive Summary

Loro is a promising fit for this outliner project. Its movable tree CRDT directly addresses the core data structure needs, and its architecture aligns well with our JSONL + SQLite caching strategy. The main gap is around mirrors/transclusion—Loro's tree CRDT enforces single-parent constraints, so mirrors would need to be implemented as a layer on top rather than as native CRDT nodes.

**Recommendation**: Strong candidate. Proceed with a proof-of-concept integration.

---

## Research Questions Answered

### 1. How does Loro's movable tree handle concurrent move operations?

Loro implements Kleppmann et al.'s algorithm from "A highly-available move operation for replicated trees":

- **Unified operation model**: Create, delete, and move are unified into a single `Move(t, p, m, c)` operation where:
  - `t` = Lamport timestamp (globally ordered)
  - `p` = parent node ID
  - `m` = metadata
  - `c` = child node ID

- **Concurrent moves to different parents**: Uses Lamport timestamps with peer IDs as tiebreakers. One move wins deterministically across all replicas.

- **Undo-replay mechanism**: When an out-of-order operation arrives:
  1. Undo all operations newer than the arriving one
  2. Apply the new operation
  3. Replay the undone operations in order

- **Cycle detection**: Operations that would create cycles are marked ineffective (not discarded—they remain in the log in case subsequent operations make them valid).

- **Deletion model**: A special `TRASH` node serves as the delete target. Moving to TRASH = deletion. Descendants remain in memory, enabling concurrent move operations on "deleted" subtrees to complete properly.

**Performance benchmarks** (M2 Max):
- 10,000 random moves on 1,000 nodes: **28 ms**
- 1,000 version switches (1,000 nodes + 1,000 moves): **153 ms**
- Deep trees (depth 300): 701 ms—significant degradation

### 2. What's the storage format? Can we export human-readable snapshots?

**Binary format is primary**: Loro uses optimized binary encoding for all export modes:
- `Uint8Array` output from `doc.export(mode)`
- Designed for storage and network transmission
- Includes LSM-like engine for lazy loading

**Human-readable via toJSON()**:
```javascript
doc.toJSON()  // Returns structured JSON of current state
```
This is the inspection method—not a persistence format, but sufficient for debugging and archival snapshots.

**Export modes**:
| Mode | Purpose |
|------|---------|
| `snapshot` | Full document + complete history |
| `shallow-snapshot` | Recent history + current state (trims old ops) |
| `update` | Delta from version vector to current |
| `updates-in-range` | Specific operation spans |

**Layering JSONL archival**: We can implement a hybrid approach:
```
Primary storage: Loro binary (operational, fast)
Archival export: Periodic toJSON() → JSONL (human-readable, git-friendly)
```

### 3. How does compaction/garbage collection work?

Loro uses **shallow snapshots** for history pruning:

- **Standard snapshot**: Full history + current state
- **Shallow snapshot**: Truncates history before specified frontiers, keeps recent ops + start state + current state

**Memory efficiency is impressive**:
- 360,000+ operations: 8.4 MB in memory, 361 KB on disk
- Log-spaced snapshots reduce version switch overhead

**No automatic GC**: Compaction is explicit via shallow snapshot export. For single-user, this is fine—compact on startup or manually.

**Comparison with Automerge**: Similar approach—periodic compaction with multi-process safety (track which changes were loaded, only delete those).

### 4. What are the Rust API ergonomics like?

**Core types**:
```rust
// Document creation
let doc = LoroDoc::new();

// Container access
let tree = doc.get_tree("outline");
let text = doc.get_text("content");
let map = doc.get_map("metadata");

// Tree operations
let root = tree.create();
let child = root.create();
child.mov(new_parent);
child.mov_to(parent, index);
child.move_after(sibling);
child.move_before(sibling);

// Export/import
let bytes = doc.export(ExportMode::Snapshot);
doc.import(&bytes);

// Subscriptions
let sub = doc.subscribe_root(|event| { ... });
let local_sub = doc.subscribe_local_update(|update| { ... });

// Version control
doc.checkout(&frontiers);  // Time travel (read-only)
doc.checkout_to_latest();
doc.revert_to(&frontiers); // Permanent revert
let vv = doc.oplog_vv();
let frontiers = doc.state_frontiers();

// Undo
let undo_manager = UndoManager::new(...);
```

**Assessment**: Clean, idiomatic Rust. Methods like `move_after`/`move_before` are exactly what outliners need. The subscription API is event-driven and composable.

### 5. How would it integrate with Tauri?

**Direct integration path**:
1. Add `loro` to Cargo.toml in Tauri backend
2. Expose Loro operations via Tauri commands
3. Optionally use `loro-crdt` npm package on frontend (WASM)

**Two architecture options**:

**Option A: Backend-centric (recommended)**
```
Frontend (JS/TS) → Tauri IPC → Rust backend w/ Loro → SQLite cache
                                    ↓
                              File sync (Dropbox)
```

**Option B: Frontend WASM**
```
Frontend (JS/TS + loro-crdt WASM) ↔ Tauri IPC ↔ Rust (file I/O only)
```

Option A keeps complexity in Rust and gives full access to Loro's Rust API.

**Note**: A 2024 compatibility issue exists with Tauri and Rust Edition 2024, but this is minor and being addressed.

### 6. Can we layer JSONL archival export on top of Loro's binary format?

**Yes, with a dual-format strategy**:

```
┌────────────────────────────────────────────────────────────────┐
│                      Storage Layers                             │
├────────────────────────────────────────────────────────────────┤
│  Loro Binary        │  JSONL Archive (periodic export)         │
│  ─────────────────  │  ──────────────────────────────────      │
│  • Fast operations  │  • Human-readable                         │
│  • Undo/time travel │  • Git-diffable                           │
│  • Real-time sync   │  • Archival-safe                          │
│  • Primary storage  │  • Derived from toJSON()                  │
└────────────────────────────────────────────────────────────────┘
```

**Implementation approach**:
1. Loro binary as working format
2. On save/checkpoint: `doc.toJSON()` → transform to JSONL records
3. On load: If Loro binary exists, use it. If only JSONL, reconstruct Loro doc from records.
4. File sync (Dropbox): Sync the JSONL for human-readability; optionally sync Loro binary for faster load.

**Tradeoff**: Maintaining two formats adds complexity. Could start with Loro-only, add JSONL export later.

### 7. What's the performance profile for typical outliner operations (10k-100k nodes)?

**From movable-tree benchmarks** (M1, ~10K nodes, depth ≤ 4):

| Nodes | 1M move ops | Memory (full history) |
|-------|-------------|----------------------|
| 10K   | 18 ms       | 3 MB                 |
| 100K  | 205 ms      | 39 MB                |
| 1M    | 2.07 s      | 450 MB               |

**Version switching** (time travel):
- 1,000 switches on 1,000 nodes + 1,000 moves: 153 ms
- Deep trees (depth 300): 701 ms—avoid very deep hierarchies

**Practical assessment for 10k-100k nodes**:
- Move operations: Fast enough (sub-second even at scale)
- Memory: Reasonable (40 MB for 100K nodes with full history)
- Initial load with shallow snapshot: Optimized
- Fractional index for sibling order: Works well, minor jitter needed for high-concurrency

**Potential concern**: Deep trees (> 200 depth) slow down. Outliners with deeply nested items may hit this, but typical use (depth < 20) should be fine.

### 8. How does it handle the mirror/transclusion use case from our spec?

**This is the gap**: Loro's tree CRDT enforces **single-parent** structure. A node cannot exist under multiple parents natively.

**Why**: Tree CRDTs are designed to prevent cycles and ensure consistent hierarchical structure. Multiple parents = DAG, not tree.

**Workaround options**:

**Option A: Mirrors as references (recommended)**
```
Node {
  id: uuid
  parent_id: uuid
  content: text | null
  mirror_source_id: uuid | null  // If set, display source's content
}
```
- Mirror nodes are real tree nodes with their own position
- `mirror_source_id` points to source; content is fetched at render time
- Editing a mirror → update source → all mirrors see change (via subscription)
- Loro handles the tree structure; mirror resolution is application logic

**Option B: Separate mirrors collection**
```
Loro Tree: Regular node hierarchy
Loro Map "mirrors": { mirrorId → sourceId }
```
Application layer resolves which nodes are mirrors during rendering.

**Option C: Links as pseudo-mirrors**
For read-only transclusion, use internal links (`[[node-id]]`) with expanded inline rendering. Less powerful but simpler.

**Recommendation**: Option A. It matches the schema in `dynalist-replacement-features.md` and keeps most logic in the tree CRDT. Mirror behavior (edit propagation, source deletion handling) is application code.

---

## Comparison Matrix

| Aspect | Loro | JSONL + LWW (from architecture-data-format.md) |
|--------|------|------------------------------------------------|
| Concurrent text edits | Merges at character level | Last-write-wins (lossy) |
| Concurrent moves | Deterministic resolution | Last-write-wins |
| Human-readable | Via toJSON() | Native |
| Git-friendly | Binary (needs JSONL layer) | Native |
| Time travel | Built-in | Would need op-log |
| Undo/redo | Built-in | Would need implementation |
| Implementation complexity | Medium (use library) | Low (DIY) |
| Future collaboration | Ready | Hard retrofit |
| Mirrors/transclusion | Application layer | Application layer |

---

## Recommended Architecture

```
┌───────────────────────────────────────────────────────────────────────┐
│                           Tauri App                                    │
├───────────────────────────────────────────────────────────────────────┤
│  Frontend (Svelte/React)                                              │
│  ├── Outliner UI components                                           │
│  ├── Keyboard navigation                                              │
│  └── IPC calls to backend                                             │
├───────────────────────────────────────────────────────────────────────┤
│  Rust Backend                                                          │
│  ├── LoroDoc (tree CRDT for each document)                            │
│  ├── Mirror resolution logic                                          │
│  ├── Link graph management                                            │
│  ├── SQLite cache (FTS5 for search)                                   │
│  └── File I/O (Loro binary + periodic JSONL)                          │
├───────────────────────────────────────────────────────────────────────┤
│  Storage                                                               │
│  ├── data/{doc-id}.loro        (binary, synced via Dropbox)           │
│  ├── data/archive/{doc-id}.jsonl (periodic human-readable export)     │
│  └── .cache/outline.db         (SQLite, not synced)                   │
└───────────────────────────────────────────────────────────────────────┘
```

---

## Open Questions for Next Steps

1. **Binary sync via Dropbox**: Does Loro's binary format play well with file-level sync? May need conflict detection at file level, then Loro-level merge.

2. **Cross-document operations**: Each document is a separate LoroDoc. Cross-document links/moves need coordination. May want a meta LoroDoc for document list/folders.

3. **Inbox handling**: Append-only inbox could stay JSONL (simple, safe for server writes) and convert to Loro on desktop processing.

4. **Mobile capture**: If mobile app exists, could use `loro-crdt` WASM or Swift bindings. Simpler: mobile captures to JSONL inbox, desktop processes.

---

## Next Steps

1. **Proof of concept**: Create a minimal Tauri app with Loro tree, test basic outliner operations
2. **Mirror implementation**: Build the `mirror_source_id` pattern on top of Loro tree
3. **JSONL export layer**: Implement periodic `toJSON()` → JSONL for archival
4. **Dropbox sync testing**: Validate binary file sync behavior with concurrent access

---

## References

- [Loro GitHub](https://github.com/loro-dev/loro)
- [Movable tree CRDTs and Loro's implementation](https://loro.dev/blog/movable-tree)
- [Loro Tree Tutorial](https://www.loro.dev/docs/tutorial/tree)
- [Loro Export Modes](https://www.loro.dev/docs/tutorial/encoding)
- [Loro Rust Docs](https://docs.rs/loro/)
- [Loro Mirror (state management)](https://loro.dev/blog/loro-mirror)
- [Kleppmann et al. - A highly-available move operation for replicated trees](https://martin.kleppmann.com/papers/move-op.pdf)
- [Automerge Storage Architecture](https://automerge.org/docs/reference/under-the-hood/storage/)
