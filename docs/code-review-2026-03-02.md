# Code Review: Simplicity & Maintainability

*2026-03-02*

## Summary

The Outline codebase is well-architected overall. The Tauri/React split is clean, the Rust core library is modular, and the Playwright test suite is broad. The main maintainability risks are concentrated in a few large files where duplication has accumulated as features were added.

**Top 3 action items:**
1. Split `outlineStore.ts` (3,504 lines, 229 methods) into focused slices
2. Extract shared code between OutlineItem and OutlineItemStatic (context menus, drag-drop)
3. Replace `waitForTimeout(100)` in Playwright tests with condition-based waits

---

## Critical

### 1. outlineStore.ts is 3,504 lines with 229 methods

`app/src/lib/outlineStore.ts`

Seven functional areas crammed into one store: state management, tree computation, navigation, document operations, drag-and-drop, undo/redo, and multi-selection. This is the single biggest maintainability bottleneck.

**Specific duplication:** 50+ instances of identical try-catch-finally boilerplate:
```typescript
set(s => ({ pendingOperations: s.pendingOperations + 1 }));
try {
  // one-liner operation
} catch (e) {
  set({ error: e instanceof Error ? e.message : String(e) });
} finally {
  set(s => ({ pendingOperations: s.pendingOperations - 1 }));
}
```

**Fix:** Extract a `withPendingOp(set, fn)` wrapper. Then split into Zustand slices:
- `outlineStore.ts` — core state + tree computation
- `navigationStore.ts` — focus, arrow keys, zoom
- `bulkOperationsStore.ts` — multi-select, bulk toggle, bulk indent
- `undoStore.ts` — undo/redo stack management

### 2. Context menu items duplicated between OutlineItem and OutlineItemStatic

`app/src/components/OutlineItem.tsx` and `app/src/components/OutlineItemStatic.tsx`

~240 lines of nearly identical menu item definitions (32 single-item actions, 22 bulk actions) exist in both files. A bug fix or new menu item requires changes in two places. The menus will silently drift apart.

**Fix:** Extract to `lib/contextMenuItems.ts`:
```typescript
export function getSingleItemMenuItems(node, store, options): MenuItem[] { ... }
export function getBulkMenuItems(selectedNodes, store): MenuItem[] { ... }
```

### 3. Filter logic tripled across tree-building functions

`app/src/lib/outlineStore.ts` — `buildTree()`, `flattenTree()`, and navigation methods

The `hideCompleted`, `hideDeferred`, and `filterQuery` filtering logic is repeated in 3+ places. A filter change (like adding "hide archived") requires updating all three independently.

**Fix:** Extract a single `shouldShowNode(node, filters)` predicate. Use it in all three locations.

---

## High

### 4. 59 individual useOutlineStore() selectors in OutlineItem

`app/src/components/OutlineItem.tsx:68-126`

59 separate `useOutlineStore(state => state.X)` calls. Each line is boilerplate. Makes refactoring store method names painful (59 lines to update per rename).

**Fix:** Group into 2-3 custom hooks by concern:
```typescript
const { focusedId, setFocusedId, ... } = useOutlineNavigation();
const { createNode, updateNode, ... } = useOutlineActions();
```

### 5. Suggestion popup state tripled for wiki links, hashtags, due dates

`app/src/components/OutlineItem.tsx:147-170`

Three nearly identical state blocks (show, query, range, position, activeRef, rangeRef) repeated for each suggestion type. ~200 lines of repetitive state + handlers.

**Fix:** Generic `useSuggestionPopup()` hook returning `{ show, query, range, position, handlers }`. Instantiate three times with different configs.

### 6. Drag-drop handlers duplicated across both components

`app/src/components/OutlineItemStatic.tsx:89-139` and corresponding code in OutlineItem

Nearly identical drag start/over/leave/end/drop logic in both components.

**Fix:** Extract `useDragDrop(node, store)` hook returning `{ dragHandlers, dropIndicator }`.

### 7. commands.rs is 1,420 lines with 49 command functions

`app/src-tauri/src/commands.rs`

Import/export, search, folders, inbox, document CRUD all in one file. UUID parsing boilerplate repeated in 15+ functions:
```rust
let parent_uuid = if let Some(id_str) = parent_id {
    Some(parse_uuid(&id_str)?)
} else {
    None
};
```

**Fix:** Split into modules (`commands/documents.rs`, `commands/search.rs`, `commands/import_export.rs`, `commands/folders.rs`). Extract `parse_optional_uuid()` helper.

### 8. Sidebar.tsx has 14 separate useState calls

`app/src/components/Sidebar.tsx:62-86`

State is grouped by implementation detail, not domain concept. Adding a feature means adding another scattered `useState`.

**Fix:** Consolidate into 2-3 `useReducer` or grouped state objects (e.g., `contextMenuState`, `documentListState`, `uiState`).

---

## Medium

### 9. ContextMenu MenuItem type is an implicit union

`app/src/components/ui/ContextMenu.tsx:9-46`

Four object shapes unioned together without a discriminant field. Requires scattered runtime type guards throughout the component.

**Fix:** Add `type: 'action' | 'separator' | 'colorPicker' | 'headingPicker'` discriminant. Enables `switch(item.type)` narrowing.

### 10. Playwright tests use 100+ hardcoded waitForTimeout(100) calls

`app/tests/*.spec.ts` — throughout all test files

Adds ~10+ seconds of unnecessary latency. Fragile on slow CI. Doesn't actually wait for the right condition.

**Fix:** Replace with condition-based waits:
```typescript
// Before
await page.waitForTimeout(100);
// After
await expect(page.locator('.outline-item')).toHaveCount(expectedCount);
```

### 11. Full document reload after every bulk operation

`app/src/lib/outlineStore.ts` — 15+ locations

`updateFromState(await api.loadDocument())` appears after nearly every operation. For bulk operations (indent 10 items), this means N API calls + 1 full reload.

**Fix (longer term):** Return updated state from bulk API calls, or apply optimistic updates locally and only reload on conflict.

### 12. Dead code with #[allow(dead_code)] suppressions

`app/src-tauri/crates/outline-core/src/data/document.rs:27,33,48,523`

Four methods marked `#[allow(dead_code)]`: `nodes_by_id()`, `nodes_by_id_mut()`, `root_nodes()`, `list_documents()`. Either use them or remove them.

### 13. iCalendar generation by string building

`app/src-tauri/src/commands.rs:576-650`

Hand-building iCal strings is error-prone (escaping, line folding, timezone handling). Consider the `icalendar` crate or at minimum a builder pattern.

---

## Low

### 14. Sample data hardcoded in backend

`app/src-tauri/src/commands.rs:274-312` — `create_sample_data()` couples backend to demo content. Better as a frontend concern or optional flag.

### 15. No docs index

`CLI.md`, `docs/future-directions.md`, `docs/issue-triage-2026-03-01.md` exist but aren't cross-referenced. A `docs/README.md` index would help discoverability.

### 16. Session restoration uses setTimeout(100)

`app/src/App.tsx:270-276` — timing-based session restoration could fail on slow machines. Should use a state-ready callback instead.

---

## Strengths (worth preserving)

- **OutlineItem/OutlineItemStatic split** — excellent perf architecture for 1500+ items
- **Rust core library** — clean module boundaries, solid JSONL sync design, LWW conflict resolution
- **node.rs (130 lines)** — compact, well-typed data model
- **zoomStore.ts / settingsStore.ts** — ideal small-store reference models
- **File watcher** — proper debouncing, event filtering, clean lifecycle
- **Playwright coverage** — 103 tests across 12+ feature areas
- **types.ts** — good use of discriminated unions for Operations and UndoActions
