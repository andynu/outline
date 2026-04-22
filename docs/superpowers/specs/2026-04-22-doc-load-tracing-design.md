---
date: 2026-04-22
status: approved
related-issues: otl-w5rj, otl-sj95, otl-yh8l
---

# Doc-load tracing: persistent logs for navigation forensics

## Problem

On 2026-04-22 the user experienced a "jump" to an unfamiliar document (`a0f259b4-...`, a phantom Welcome doc). Log analysis (see otl-yh8l) traced the *exit* from that doc (the post-delete `api.loadDocument()` with no arg hit the default doc) but could not determine how the user *arrived* there in the first place. Frontend `console.log` is ephemeral (needs devtools open); only Rust-side `log::info!` is persistent. No navigation trail survives a session.

## Goal

Capture enough persistent log context that the *next* mystery doc-switch can be reconstructed end-to-end from a single log file, without needing devtools to have been open.

## Non-goals

- In-app log viewer / forensics UI (single-user app; file + `grep` is sufficient).
- Remote telemetry.
- Log rotation redesign — use the plugin default.
- Removing existing `console.log` calls — they should survive and be captured automatically.

## Design

Three layers:

### 1. Bridge webview console to the persistent log

`app/src-tauri/src/lib.rs` already wires up `tauri-plugin-log` in debug builds. Two changes:

- Add `Target::new(TargetKind::Webview)` to the builder so frontend `console.log/info/warn/error` append to the same log file as Rust.
- Enable in release builds too (remove the `cfg!(debug_assertions)` gate). This is a personal, single-user desktop app; the overhead is trivial and the diagnostic value is high.

Result: every existing `[API]`, `[Sync]`, `[getTree]` etc. log line starts persisting with zero frontend code changes.

### 2. `logNav` helper for doc-switch events

New file `app/src/lib/navLog.ts`:

```ts
export function logNav(source: string, data: Record<string, unknown>) {
  console.info(`[NAV] ${source}`, JSON.stringify(data));
}
```

Grep-friendly prefix (`[NAV]`) lets you `grep '\[NAV\]' outline.log` for a clean navigation timeline. Structured payload (JSON-in-console-arg) is good enough for post-mortem parsing; we don't need schema validation.

### 3. Instrument every doc-switching code path

Every call site that can change the active document emits a `logNav` line with a `source` tag:

| Location | Source tag | Payload |
|---|---|---|
| `App.tsx` mount effect | `app-start` | `{sessionDocId, fallbackReason?}` |
| `App.tsx#switchDocument` | `switch-doc` | `{prevDocId, newDocId, caller}` where caller is the arg passed from callsite |
| `App.tsx` sidebar click handler | `sidebar-click` | `{docId}` |
| `App.tsx` new-doc handler | `new-doc` | `{newDocId}` |
| `App.tsx` delete-doc handler | `delete-doc-fallback` | `{deletedDocId, fallbackDocId}` |
| QuickNavigator selection | `quick-nav` | `{docId}` |
| wiki-link click | `wiki-link` | `{fromDocId, toDocId, nodeId}` |
| backlink click | `backlink` | `{fromDocId, toDocId, nodeId}` |
| `outlineStore.load(docId)` | `store-load` | `{docId, caller}` — add optional `caller: string` param |
| `api.ts#loadDocument(docId)` | `api-load` | `{docId}` — logs `undefined` when no arg is passed, which is the smoking gun for otl-w5rj-class bugs |
| Every no-arg `api.loadDocument()` in selectionStore/outlineStore/useSuggestions | `bulk-refresh` | `{caller}` — identifies the 17 silent-swap sites |

### 4. Rust-side audit messages in `load_document`

`app/src-tauri/src/commands/document.rs#load_document` (line 29-36 currently) is the origin of the silent-reseed. Add:

```rust
if doc_dir.exists() {
    log::info!("load_document: loaded existing {} ({} nodes)", doc_uuid, doc.state.nodes.len());
} else {
    log::warn!("load_document: folder missing, creating new doc with sample data: {}", doc_uuid);
}
```

The `warn!` level for the re-seed path makes otl-sj95 obvious in any future log scan.

## Acceptance criteria

After these changes, when a mystery doc-switch happens again, a single `grep '\[NAV\]\|load_document' outline.log` produces a human-readable sequence of:

1. What the app restored on start (`app-start`)
2. Every explicit switch and the UI action that triggered it (`sidebar-click`, `wiki-link`, etc.)
3. Every silent switch via no-arg loadDocument (`bulk-refresh`)
4. Every Rust-side doc load with existence state (`loaded existing` vs `creating new doc`)

That trail is sufficient to answer "how did the user end up on doc X?" without needing to reproduce.

## Work breakdown

- `otl-emww` — Plumbing: webview target + release-mode gate + `navLog.ts` helper
- `otl-yovg` — Instrumentation: sprinkle `logNav` across the 11+ call sites above (blocked on otl-emww)
- `otl-oh53` — Rust-side load audit messages (blocked on otl-emww)
