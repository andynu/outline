# outline-web — Scaffold + Core (Phase 0+1) Design

**Date:** 2026-06-02
**Status:** Approved for planning
**Scope of this spec:** Phase 0 (scaffold) + Phase 1 (data model + API core) of the `outline-web` fork. Later phases are sketched for context but specced separately.

## Background & Motivation

The current Outline app is a Tauri 2 + Rust desktop application with a React 19 frontend. Storage is an append-only operation log (`pending.{hostname}.jsonl`) merged into `state.json`, with last-write-wins (LWW) conflict resolution on `updated_at`. OPML is **not** the storage medium — it is one of four export formats (html/json/markdown/opml).

We are forking the project into **`outline-web`**: a single-user, self-hosted, **SaaS-style web app with an HTTP API**, so the same backend serves the browser UI and command-line/scripted access. This replaces the Tauri desktop shell with a web client + server.

### Decisions locked in (from brainstorming)

| Decision | Choice | Rationale |
|---|---|---|
| Tenancy | **Single-user, self-hosted** | No accounts/billing/tenant isolation. Server is a personal persistence + sync hub + API. |
| Offline model | **Online-first with local cache** | Web client talks to server live; local store is a read cache + write queue that flushes on reconnect. No CRDT/merge engine. |
| Fork strategy | **Hard fork → new `outline-web` repo** | Clean break. The Rust/Tauri/`outline-core` code becomes reference material; the React UI is the main carried-over asset. |
| Server stack | **Rails + SQLite** | Best-known stack; matches existing deploy target. Node/tree/op/search logic is **reimplemented** in ActiveRecord (cost accepted). |
| CLI (`otl`) | **Pure HTTP API client + personal access token** | Same API as the web UI; works against localhost or a remote deploy. No local file access. |
| OPML | **Periodic backup/archival artifact** (Phase 5) | Server writes OPML snapshots to a Nextcloud/Dropbox-synced dir for durable, portable, recoverable backups. Not the live store. |

## Target Architecture (whole system, for context)

```
CLIENT (browser)
  UI (React, ported from app/src — Tauri removed)
    │  TipTap editor, virtual scroll, zustand stores, extensions reused
    ▼
  Client API  (api.ts — same function surface, transport swapped invoke→fetch)
    ├──▶ Local cache + write queue (IndexedDB)   [Phase 3]
    └──▶ HTTP/JSON ─────────────────┐
                                    ▼
SERVER (Rails + SQLite)        API (token auth)
  ┌─────────────────────────────────────────────┐
  │ REST endpoints mirroring today's commands     │
  │ Persistent storage: SQLite via ActiveRecord   │
  │ FTS5 search + backlinks                        │
  │ Scheduled OPML snapshot → synced dir  [Phase 5]│
  └─────────────────────────────────────────────┘
        ▲
        │ HTTP/JSON + personal access token
   otl CLI  (HTTP API client; local or remote)   [Phase 4]
```

### Phase roadmap (each phase = its own spec → plan → implementation)

| Phase | Slice |
|---|---|
| **0** | Scaffold — new Rails repo, SQLite, single-user auth (session + token), `.beads/`, CI, deploy skeleton |
| **1** | Data model + API core — ActiveRecord models, op endpoints, FTS5 search + backlinks (port `outline-core` + its tests) |
| 2 | Web client on HTTP — port React app, strip Tauri, rewire `api.ts` invoke→fetch (online-only first) |
| 3 | Offline cache + write queue — IndexedDB read cache + op queue + reconnect flush |
| 4 | `otl` over HTTP — rewrite CLI as token-auth API client |
| 5 | Aux — OPML snapshot job + recovery import, `.ics` calendar feed, capture endpoint/form, import/export, recurrence |
| 6 | Mobile clients — Android phone + iOS iPad (responsive PWA or native shell) |

**Cross-phase constraint (from Phase 6):** the web client must reach the server *only* through the clean `api.ts`/HTTP boundary, and the UI should be responsive-friendly, so a future mobile client reuses the same API rather than a parallel backend. No mobile work in early phases; just don't paint into a desktop-only corner.

---

## This Spec: Phase 0 + Phase 1

Phase 0 and 1 are merged into one spec/implementation cycle because they are tightly coupled (the data model needs a repo and auth to live in; the scaffold is meaningless without the core).

### Phase 0 — Scaffold

- New `outline-web` Rails app (latest stable Rails, SQLite).
- `.beads/` issue tracker initialized.
- minitest as the test framework; CI runs `rake test`.
- Deploy skeleton matching the existing Rails-style deploy target.
- **Auth (single-user):**
  - Password-protected **session** for the browser UI.
  - One **personal access token** for `otl`/API, sent as `Authorization: Bearer <token>`.
  - No multi-user machinery, no registration, no roles.
- **Dropped (Tauri-only) commands — not ported:** `start/stop/is_documents_watcher_running`, `pick_directory`, `get/set_data_directory`, `save_to_file_with_dialog`, `pick_emoji_image`. (Filesystem/dialog/watcher concerns vanish in a server model.)

### Phase 1 — Data Model

Faithful port of the Rust structs to ActiveRecord + SQLite. **Migrations are DDL-only**; any data backfill is a rake task. Enforce constraints at the DB layer (NOT NULL, FKs, check constraints).

| Table | Key columns | Notes |
|---|---|---|
| `documents` | id, name, doc_prefix, folder_id (FK, null), position, created_at, updated_at | `doc_prefix` drives short-id namespacing |
| `folders` | id, name, position, created_at, updated_at | |
| `nodes` | id (uuid), document_id (FK), parent_id (uuid, null), position (int), content (text), note (text, null), node_type, heading_level (int, null), is_checked (bool), color (string, null), tags (JSON), date (string, null), date_recurrence (string, null), recurrence_mode (string, null), date_end (string, null), defer_date (string, null), short_id (string, null), collapsed (bool), mirror_source_id (uuid, null), created_at, updated_at | Faithful to Rust `Node` |
| `bookmarks` | id, node_id (FK), label, emoji, position | |
| `capture_targets` | id, name, node_id (FK), is_default (bool) | |
| `custom_emoji` | id, name, image (blob or path) | |
| `nodes_fts` | FTS5 virtual table over (content, note) | Backs `search`, backlinks, unlinked references |

**Type/representation decisions:**
- `node_type` enum: `bullet` (default), `checkbox`, `heading`, `numbered`.
- **Dates stay strings** (ISO / date-only + recurrence semantics), *not* Rails datetimes — preserves exact meaning of `date`, `date_recurrence`, `recurrence_mode`, `date_end`, `defer_date`.
- `tags` stored as a JSON column.
- **IDs are UUIDs** for nodes (matches Rust `Uuid`), preserving `mirror_source_id` and client-generated IDs.
- **Conflict resolution:** LWW on `updated_at`, identical to today.

#### Ordering & the `Move` operation

`Move` is a **distinct operation**, not an `Update {parent_id, position}`, because:
1. **Position is relational** — it only means something relative to siblings. Moving X to slot 3 requires shifting every sibling at position ≥ 3. The server owns this reindex atomically rather than the client sending N sibling updates.
2. **Tree invariants** — a parent change must enforce no-cycles (can't move under own descendant), parent-exists, same-document. That validation belongs on a dedicated move path, not on every content edit.
3. **Replay determinism** — a queued `Move {id, parent, pos}` replays deterministically and is distinguishable from a content edit in the op log (matters for the Phase-3 write queue).

**Order representation:** contiguous **integer `position` + transactional reindex** (faithful to the current i32 model and its tests). On `Move`, the server shifts affected siblings in one transaction. A move may touch many rows; for single-user that is negligible. (Sparse/gap integers and fractional/LexoRank keys were considered and rejected for now — unnecessary complexity for single-user online-first.)

The HTTP surface for move is `PATCH /nodes/:id/move` (or `POST .../move`); the important part is the **semantics** (server-owned reindex + invariants), not the URL.

### Phase 1 — API Surface

REST endpoints mirroring the **core** Tauri commands. Token/session auth on all. Everything not listed (import/export, ical, recurrence, emoji management) is deferred to Phase 5.

- **Nodes:** create · update · move (`PATCH /nodes/:id/move`) · delete
- **Batch ops:** `POST /ops` — replays an ordered queue of `Create | Update | Move | Delete`. This is the exact vocabulary the UI already emits and what the Phase-3 offline queue will flush. Preserving it keeps Phase 2 (`api.ts` rewire) and Phase 3 (write queue) aligned with the current client.
- **Documents:** list · load · create · delete · rename-prefix
- **Folders:** CRUD + reorder
- **Bookmarks:** CRUD + reorder
- **Query:** `search` (FTS5) · `backlinks` · `unlinked_references` · `dated_nodes`

### Data Flow (online-first, this phase = online-only)

1. UI action → `api.ts` → HTTP request to Rails endpoint (or `POST /ops` for batched mutations).
2. Rails applies the op(s) in a transaction: mutate `nodes`/etc., run reindex/invariant checks for moves, update FTS index, bump `updated_at`.
3. Response returns updated state (or the affected subtree).
4. (Phase 3 will insert the IndexedDB cache + queue between steps 1 and 2; the contract here is designed so that drop-in is additive.)

### Error Handling

- **Validation errors** (cycle in move, missing parent, cross-document move, unknown id) → 422 with a structured error body; the op is rejected without partial application (transaction rollback).
- **Auth failures** → 401.
- **Batch `/ops`** → applied transactionally; a single invalid op fails the batch with an index pointer to the offending op (so the client can correct and resubmit). *(Open question flagged below: whether batches should be all-or-nothing or best-effort with a per-op result list — to settle during planning.)*

### Testing Strategy

- Port the Rust `#[cfg(test)]` cases for op-apply, tree integrity, and short-id generation into **minitest**.
- **Model tests:** node CRUD, move reindex correctness, cycle/invariant rejection, LWW behavior, short-id uniqueness per `doc_prefix`.
- **Search tests:** FTS5 query results, backlinks, unlinked references.
- **API request tests:** each endpoint with token auth; `POST /ops` batch (success + rejection/rollback); 401/422 paths.
- New behavior requires tests; run `rake test` before every commit; never commit on red.

## Costs & Risks (called out honestly)

- **`outline-core` is reimplemented, not reused.** The subtle tree/op/short-id/search logic is re-created in Rails. Mitigation: port the existing Rust tests as the spec/oracle for the Ruby implementation.
- **The Rust/Tauri app diverges and effectively dies.** Accepted — hard fork was chosen deliberately.
- **Integer reindex touches many rows on deep moves.** Negligible for single-user; revisit only if a multi-writer or scale need ever appears (would motivate fractional keys).

## Out of Scope (this spec)

Web client port (Phase 2), offline cache/queue (Phase 3), CLI (Phase 4), OPML snapshot/import + ical + capture + import/export + recurrence (Phase 5), mobile (Phase 6).

## Open Questions (resolve during planning)

1. `POST /ops` batch semantics: all-or-nothing transaction vs. best-effort with a per-op result list.
2. `custom_emoji` image storage: SQLite blob vs. file path under the app data dir.
3. Exact Rails version + deploy mechanism on the target host (confirm against the existing Rails deploy setup).
