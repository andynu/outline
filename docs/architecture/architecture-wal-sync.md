# Architecture: Per-Machine WAL with Dumb File Sync

> **Status:** Aligned with [architecture-data-format.md](architecture-data-format.md) decisions.
> Uses per-document pending files rather than global WALs.

## Problem Statement

CRDTs provide elegant conflict resolution, but require a CRDT-aware sync layer. File sync tools (Dropbox, Nextcloud, Syncthing) treat files as opaque blobs:

- Same file edited on two machines → conflict copy or last-write-wins
- No awareness of internal structure or merge semantics
- User must manually resolve conflicts

For a single user rapidly switching between machines, this is a real risk. Edits can happen faster than sync completes.

## Proposed Solution

Use per-machine pending logs (per document) that never conflict, combined with application-level merge logic:

```
outline-data/
├── meta.jsonl                          ← Documents, folders, settings
├── documents/
│   └── {doc-uuid}/
│       ├── state.json                  ← Merged state (plain JSON)
│       └── pending.{hostname}.jsonl    ← Ops from this machine only
├── global/
│   └── links.jsonl                     ← Cross-document links
├── inbox.jsonl                         ← Capture queue (append-only)
├── deletions.jsonl                     ← Tombstones
├── .sync/                              ← Sync metadata (synced)
│   ├── machines.jsonl                  ← Known machine registry
│   └── merge-history.jsonl             ← Record of merges
└── .cache/                             ← Local only (not synced)
    └── outline.db                      ← SQLite cache
```

**Key insight:** Each machine writes exclusively to its own `pending.{hostname}.jsonl` file within each document directory. Dropbox syncs all pending files without conflict. The application merges ops from all pending files into `state.json`.

---

## Data Flow

### Normal Operation (Single Machine)

```
User edits node in document {doc-uuid}
       │
       ▼
┌──────────────────────────────────────────────────────┐
│ 1. Append op to documents/{doc-uuid}/pending.{hostname}.jsonl
│ 2. Update local SQLite cache
│ 3. state.json unchanged (pending ops not yet merged)
└──────────────────────────────────────────────────────┘
       │
       ▼
Dropbox syncs pending.{hostname}.jsonl
Other machines see the new ops
```

### Multi-Machine Sync (No Conflict)

```
Machine A                          Machine B
─────────                          ─────────
Edit node X in doc-123
Append to doc-123/pending.A.jsonl
                    ──sync──►
                                   See new ops in doc-123/pending.A.jsonl
                                   Replay into local SQLite

                                   Edit node Y in doc-123
                                   Append to doc-123/pending.B.jsonl
                    ◄──sync──
See new ops in doc-123/pending.B.jsonl
Replay into local SQLite
```

Both machines converge to same state. No file-level conflicts because different pending files.

### Multi-Machine Sync (Concurrent Edits)

```
Machine A (offline)                Machine B (offline)
───────────────────                ───────────────────
Edit node X → "AAA"                Edit node X → "BBB"
Append to pending.A.jsonl          Append to pending.B.jsonl

            ──── both come online, Dropbox syncs ────

Machine A sees:                    Machine B sees:
  pending.A.jsonl (own ops)          pending.A.jsonl (A's ops)
  pending.B.jsonl (B's ops)          pending.B.jsonl (own ops)

Both machines replay both pending files with merge logic
Both arrive at same deterministic result
```

### Cross-Document Isolation

```
Machine A edits doc-123            Machine B edits doc-456
─────────────────────              ─────────────────────
Append to doc-123/pending.A.jsonl  Append to doc-456/pending.B.jsonl

Zero interaction. Different document directories = completely independent.
```

---

## Pending File Record Format

Each line in `pending.{hostname}.jsonl` is a self-contained operation:

```jsonl
{"op":"create","id":"node-uuid-1","parent_id":null,"position":0,"content":"New item","node_type":"bullet","updated_at":"2025-01-15T10:00:00Z"}
{"op":"update","id":"node-uuid-1","changes":{"content":"Updated item"},"updated_at":"2025-01-15T10:00:01Z"}
{"op":"update","id":"node-uuid-1","changes":{"is_checked":true},"updated_at":"2025-01-15T10:00:02Z"}
{"op":"move","id":"node-uuid-1","parent_id":"node-uuid-2","position":3,"updated_at":"2025-01-15T10:00:03Z"}
{"op":"delete","id":"node-uuid-1","updated_at":"2025-01-15T10:00:04Z"}
```

### Record Fields

| Field | Type | Description |
|-------|------|-------------|
| `op` | string | Operation type: `create`, `update`, `move`, `delete` |
| `id` | uuid | Target node ID |
| `updated_at` | ISO8601 | Timestamp for LWW conflict resolution |
| `parent_id` | uuid/null | Parent node (for `create`, `move`) |
| `position` | integer | Sibling position (for `create`, `move`) |
| `content` | string | Node text (for `create`) |
| `node_type` | string | bullet/checkbox/heading (for `create`) |
| `changes` | object | Changed fields (for `update`) |

Note: Machine identity is implicit in the filename (`pending.{hostname}.jsonl`), so it's not repeated in each record.

### Operation Types

**create** — New node
```jsonl
{"op":"create","id":"...","parent_id":"...","position":0,"content":"...","node_type":"bullet","updated_at":"..."}
```

**update** — Field changes on existing node
```jsonl
{"op":"update","id":"...","changes":{"content":"new text","is_checked":true},"updated_at":"..."}
```

**move** — Structural change (parent/position)
```jsonl
{"op":"move","id":"...","parent_id":"new-parent-id","position":2,"updated_at":"..."}
```

**delete** — Remove node (creates tombstone in deletions.jsonl)
```jsonl
{"op":"delete","id":"...","updated_at":"..."}
```

---

## Merge Logic

When replaying WALs from multiple machines, conflicts arise when both machines edited the same field of the same record. Resolution rules:

### Scalar Fields (LWW)

Fields like `is_checked`, `color`, `date`, `collapsed`:

```
Rule: Latest timestamp wins

Machine A at T1: is_checked = true
Machine B at T2: is_checked = false
Result: false (T2 > T1)
```

### Text Fields (Content, Note)

Options in order of complexity:

**Option 1: LWW (simple, some data loss)**
```
Latest timestamp wins, other edit is lost.
Acceptable for single-user with rare conflicts.
```

**Option 2: Concatenate with marker (no data loss, manual cleanup)**
```
Machine A: "Buy oat milk"
Machine B: "Buy milk and eggs"
Result: "Buy oat milk\n<<<CONFLICT>>>\nBuy milk and eggs"

User sees conflict marker, manually resolves.
```

**Option 3: Field-level versioning (no data loss, UI support)**
```json
{
  "content": "Buy oat milk",
  "content_conflicts": [
    {"machine": "desktop-tower", "ts": "...", "value": "Buy milk and eggs"}
  ]
}
```
UI shows conflict indicator, user picks or merges.

**Option 4: Character-level CRDT merge (complex, best results)**
```
Use the `old` and `new` values to compute a diff.
Apply both diffs to the common ancestor.
Result: "Buy oat milk and eggs"

Requires: operational transform or CRDT text merge algorithm.
```

**Recommendation:** Start with Option 2 (concatenate with marker). It's simple, loses no data, and makes conflicts visible. Upgrade to Option 4 later if conflicts are frequent.

### Structural Changes (Move)

```
Machine A moves node X under parent P1
Machine B moves node X under parent P2

Rule: Latest timestamp wins (LWW)
Alternative: Deterministic by ID (e.g., P1 < P2 alphabetically → P1 wins)
```

### Create/Delete Interactions

```
Machine A creates node X at T1
Machine B never sees X, creates unrelated node Y at T2
→ Both nodes exist (no conflict)

Machine A creates node X at T1
Machine B deletes node X at T2 (saw it from A, deleted it)
→ Node X is deleted (delete wins if T2 > T1)

Machine A edits node X at T2
Machine B deletes node X at T1
→ Node X exists with A's edits (edit wins if T2 > T1)
```

**Tombstone rule:** A delete op creates a tombstone with timestamp. The node is considered deleted if `delete_ts > max(update_ts for all fields)`.

---

## State Reconstruction

### On Application Startup

```
For each document directory:
  1. Load state.json (merged state)
  2. Load all pending.*.jsonl files
  3. If any pending files exist:
     a. Apply ops to state (LWW by updated_at)
     b. Update SQLite cache
  4. (Don't merge yet - wait for sync check)
```

### Periodic Sync Check (Every 2-3 Minutes)

```
For each document directory:
  1. Check mtimes of state.json and all pending.*.jsonl
  2. If any file changed since last check:
     a. Read state.json (base state)
     b. Read all pending.*.jsonl files
     c. Apply ops in updated_at order (LWW per node)
     d. Normalize positions to clean integers (0, 1, 2, ...)
     e. Write new state.json
     f. Delete all pending.*.jsonl files
     g. Log merge to .sync/merge-history.jsonl
  3. Update SQLite cache
```

### Tracking Sync State

```json
// .cache/sync-state.json (local, not synced)
{
  "documents": {
    "doc-uuid-1": {
      "state_mtime": "2025-01-15T10:00:00Z",
      "pending_mtimes": {
        "macbook-pro": "2025-01-15T10:05:00Z",
        "desktop-tower": "2025-01-15T10:03:00Z"
      }
    }
  },
  "last_check": "2025-01-15T10:10:00Z"
}
```

On each sync check, compare current mtimes to cached mtimes. Only process documents with changes.

---

## Compaction

### Document Merge (Not Traditional Compaction)

With the per-document `state.json` + `pending.*.jsonl` model, there's no traditional compaction needed for documents. The periodic sync check already:
1. Merges all pending ops into state.json
2. Deletes pending files after merge
3. state.json is always the clean, current state

This happens automatically every 2-3 minutes when changes are detected.

### Global File Compaction

`meta.jsonl` and `global/links.jsonl` are append-only and do need periodic compaction:

**When to Compact:**
- On app startup if file > threshold (e.g., 1 MB)
- Manually via "Compact now" command
- Less urgent than old WAL model (these files grow slowly)

**Compaction Process:**

```
1. Read meta.jsonl → dedupe by record ID, keep latest updated_at
2. Write meta.jsonl.new (compacted)
3. Atomic rename: meta.jsonl.new → meta.jsonl
4. Log to .sync/merge-history.jsonl

Same for global/links.jsonl if needed.
```

No lockfiles needed for single-user. If you're worried about concurrent compaction across machines, add a simple lockfile check:

```
.sync/compacting.{hostname}
Contents: {"started":"2025-01-15T10:00:00Z"}
TTL: 5 minutes (assume stale if older)
```

---

## Machine Registry

Track known machines for UI and debugging:

```jsonl
// .sync/machines.jsonl
{"id":"macbook-pro","first_seen":"2025-01-01T00:00:00Z","last_seen":"2025-01-15T10:00:00Z","display_name":"Andy's MacBook Pro"}
{"id":"desktop-tower","first_seen":"2025-01-02T00:00:00Z","last_seen":"2025-01-14T18:00:00Z","display_name":"Home Desktop"}
{"id":"server","first_seen":"2025-01-03T00:00:00Z","last_seen":"2025-01-15T09:00:00Z","display_name":"Capture Server"}
```

On first run on a new machine, append a registration record. Update `last_seen` on each app launch.

**Uses:**
- UI: "Last edited on MacBook Pro"
- Debugging: see which machines have contributed ops
- Future: could track per-machine sync status

---

## Clock Skew Handling

If machine clocks differ significantly, timestamp ordering becomes unreliable.

### Detection

On startup, compare local time to timestamps in other machines' WALs:

```
If any op.ts is > 1 minute in the future relative to local clock:
  → Show warning: "Clock skew detected with {machine}"
```

### Mitigation Options

1. **Warn and continue** — acceptable for single user
2. **Hybrid logical clocks (HLC)** — combine wall clock + logical counter
3. **NTP enforcement** — require machines to be time-synced

**Recommendation:** Start with (1). Add HLC later if clock skew is a real problem.

### Hybrid Logical Clock (Future Enhancement)

```jsonl
{"ts":"2025-01-15T10:00:00.000Z","hlc":{"wall":"2025-01-15T10:00:00.000Z","logical":0,"machine":"A"}}
{"ts":"2025-01-15T10:00:00.000Z","hlc":{"wall":"2025-01-15T10:00:00.000Z","logical":1,"machine":"B"}}
```

HLC ensures total ordering even when wall clocks collide.

---

## Thin Server Integration

The server is minimal - it serves synced files and provides two dynamic endpoints:

### Server Endpoints

```
# No auth (token in URL provides security)
/calendar/{token}/feed.ics          ← iCal feed
/calendar/{token}/feed.ics?tag=work ← Filtered by tag

# Basic auth on /outline/*
/outline/inbox              POST ← Append to inbox.jsonl
/outline/viewer.html        GET  ← Static JS viewer
/outline/data/*             GET  ← Serve synced files read-only
```

Single basic auth rule on `/outline/*` simplifies nginx/caddy config. Calendar stays outside since calendar apps don't support auth headers.

### Inbox Capture

Server appends to `inbox.jsonl`:

```jsonl
{"id":"inbox-uuid-1","content":"Remember to call dentist","source":"mobile","captured_at":"2025-01-15T10:00:00Z"}
{"id":"inbox-uuid-2","content":"Book flight for March","source":"api","captured_at":"2025-01-15T10:05:00Z"}
```

Server ops are limited to:
- Inbox item creation (capture from mobile, API, browser extension)

Server never touches document files. Desktop processes inbox items.

### iCalendar Feed

Server reads all `documents/*/state.json` files, finds nodes with dates, generates VCALENDAR:

```
GET /calendar/{token}/feed.ics              ← Token-based access (no auth)
GET /calendar/{token}/feed.ics?tag=work     ← Optional tag filter
```

**Token-based security:**
- Token is a UUID stored in server config (not in synced files)
- URL is unguessable but requires no authentication (works with Google Calendar subscribe)
- Rotate token if leaked: regenerate UUID, update calendar subscriptions

```
# Server config (not synced)
calendar_token: "a1b2c3d4-e5f6-7890-abcd-ef1234567890"
```

This is the only server-side "rendering" - generating iCal from JSON.

### Static Viewer

The viewer is a static JS app served by the server:

```
/viewer.html?doc={doc-uuid}&zoom={node-id}
```

Viewer fetches `/data/documents/{doc-uuid}/state.json` and renders client-side.
No server-side HTML rendering required.

### Inbox Processing Flow (Desktop)

```
1. User reviews inbox items in desktop app
2. Drags item to target document/node
3. App creates node in document (via pending.{hostname}.jsonl)
4. App removes item from inbox.jsonl (or marks as processed)
```

---

## Failure Modes and Recovery

### Corrupt Pending File

```
Symptom: JSON parse error on a line in pending.{hostname}.jsonl
Recovery:
  1. Log the error with line number and document ID
  2. Skip the corrupt line
  3. Continue processing remaining ops
  4. Notify user: "Skipped N corrupt operations in document X"
```

### Corrupt state.json

```
Symptom: JSON parse error in state.json
Recovery:
  1. Check for state.json.backup (if you keep one)
  2. If no backup: rebuild from pending files only (partial state)
  3. Notify user: "Document X state corrupted, rebuilt from pending ops"
  4. Some data may be lost if pending files were already cleared
```

### Conflicting state.json (Dropbox Conflict Copy)

```
Symptom: Two machines merged simultaneously
Result:
  - state.json from machine A
  - state (conflict copy).json from machine B
Recovery:
  1. Detect conflict copies on startup (glob for "state*.json")
  2. Parse both, merge nodes by ID (LWW by updated_at)
  3. Write unified state.json
  4. Delete conflict copy
  5. Log to .sync/merge-history.jsonl
```

### Pending File Deleted Before Other Machine Saw It

```
Symptom: Machine A merged and deleted pending files before Machine B synced
Result: Machine B never sees A's ops that were in pending.A.jsonl
Prevention:
  - Sync tools usually sync before allowing deletes
  - If concerned: keep pending files for N minutes after merge
  - Or: archive to .sync/archive/ instead of delete
Recovery:
  - If detected (state.json has nodes B doesn't know about): accept state.json as truth
  - state.json is always the canonical merged state
```

### App Crash During Merge

```
Symptom: state.json partially written
Prevention:
  - Write to state.json.new, then atomic rename
  - Pending files not deleted until rename succeeds
Recovery:
  - On startup, if state.json.new exists:
    - If valid JSON: rename to state.json
    - If corrupt: delete and re-merge from state.json + pending files
```

---

## File Layout Summary

```
outline-data/
├── meta.jsonl                          ← Documents, folders, settings (append + compact)
├── documents/
│   └── {doc-uuid}/
│       ├── state.json                  ← Merged state (plain JSON, canonical)
│       ├── pending.macbook-pro.jsonl   ← Unmerged ops from this machine
│       └── pending.desktop-tower.jsonl ← Unmerged ops from other machine
├── global/
│   └── links.jsonl                     ← Cross-document links (append + compact)
├── inbox.jsonl                         ← Capture queue (append-only, server writes here)
├── deletions.jsonl                     ← Tombstones for deleted records
├── .sync/                              ← Sync metadata (synced between machines)
│   ├── machines.jsonl                  ← Known machine registry
│   ├── merge-history.jsonl             ← Audit log of merges
│   └── compacting.{hostname}           ← Lockfile for meta.jsonl compaction
└── .cache/                             ← Local only (not synced, gitignored)
    ├── outline.db                      ← SQLite cache (rebuilt from above)
    └── sync-state.json                 ← Cached mtimes for change detection
```

---

## Advantages

1. **No file sync conflicts** — each machine owns its pending file exclusively
2. **Per-document isolation** — editing different documents = no interaction at all
3. **Human-readable** — state.json is plain JSON, pending files are JSONL, both inspectable
4. **Offline-first** — works entirely offline, merges when connected
5. **Dumb sync compatible** — Dropbox, Nextcloud, Syncthing, rsync all work
6. **Clean state representation** — state.json is always the canonical truth, not an append log
7. **Automatic merge** — no manual compaction needed for documents
8. **Auditable** — .sync/merge-history.jsonl tracks all merges

## Tradeoffs

1. **More files** — each document is a directory with multiple files
2. **Startup cost** — must scan document directories for pending files
3. **Clock dependency** — relies on reasonably synchronized clocks for LWW
4. **Merge logic required** — must implement conflict resolution
5. **Polling overhead** — checking mtimes every 2-3 minutes (minimal)

## Decisions

1. **Text merge strategy:** ✅ **LWW (Last Write Wins)**
   - Simple, debuggable, acceptable for single-user

2. **Pending file retention:** ✅ **Delete immediately after merge**
   - Sync tools handle ordering; simpler implementation

3. **Conflict UI:** ✅ **Silent auto-merge + notification badge**
   - Show "X merges since last session" on startup

4. **state.json backup:** ✅ **Yes, keep state.json.backup on each merge**
   - Essential for crash recovery

---

## Comparison to Alternatives

| Aspect | Single JSONL (LWW) | Per-Doc Pending (this design) | Full CRDT (Loro) |
|--------|-------------------|------------------------------|------------------|
| Dropbox conflicts | Likely | Very rare (only state.json) | N/A (needs own sync) |
| Conflict isolation | None | Per-document | Per-field |
| Data loss on conflict | Entire edit session | Per-field within doc | None |
| Human readable | ✅ Excellent | ✅ Excellent | ❌ Binary |
| State clarity | Append log (needs compaction) | Clean JSON snapshot | Internal |
| Implementation | Simple | Medium | Medium-Complex |
| Multi-user ready | No | Possible | Yes |

---

## Next Steps

1. **Implement pending file writer** — append ops to `pending.{hostname}.jsonl`
2. **Implement state.json reader/writer** — load and save document state
3. **Implement merge logic** — combine pending ops with state, LWW resolution
4. **Add sync polling** — check mtimes every 2-3 minutes, trigger merge
5. **Add merge notification UI** — badge showing "synced N changes from other machines"
6. **Implement SQLite cache rebuild** — from state.json files
