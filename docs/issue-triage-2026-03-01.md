# Issue Triage — 2026-03-01

37 open issues reviewed. 6 codebase explorations run. Decisions recorded 2026-03-01.

---

## 1. otl-ipqa — Undo for split/merge (bug, P2)

**Current state:** The undo system uses a typed action stack (`create | delete | update | move | swap`). Split and merge are composite — split creates a node, moves children, updates content in one operation. Two explicit TODOs in outlineStore.ts confirm this is known-missing.

**The design question:** Split/merge don't fit the existing single-action undo model.

**Option A — New dedicated action types:** Add `split` and `merge` action types to `UndoAction`. Each captures all the state needed to reverse the composite operation (original content, new node ID, child IDs, positions). More code in `_executeUndoAction` but self-contained.

**Option B — Compound undo entries:** Extend the undo system so an entry can contain an array of atomic actions executed in sequence. More general-purpose but changes the undo architecture.

> **Decision:** A — New dedicated action types for split and merge.
>
> _Answer: A_

---

## 2. otl-96u9 — Date ranges (feature, P2)

**Current state:** No `date_end` field exists anywhere. Current date model: `date` (due/target), `defer_date` (hide-until), `date_recurrence` (RRULE). DatePicker has two modes (due/defer). iCal feed generates `DTSTART` only, no `DTEND`.

Adding `date_end: Option<String>` to the node struct is straightforward — same pattern as `defer_date`.

### Questions

**2a. What is `date_end` for?**

- [ ] Calendar events only (multi-day events in iCal feed)
- [ ] Also affects date views panel (item shows as "active" when today is within range)
- [x] Both
- [ ] Other: ___

> _Answer: Both — date_end affects iCal feed (DTEND) and date views panel (item active when today is within range)._

**2b. How should the DatePicker expose end dates?**

- [x] Third tab alongside "Due date" and "Defer until" (simple, consistent)
- [ ] Shown as a secondary field when a due date is already set (contextual)
- [ ] Other: ___

> _Answer: Third tab._

**2c. Should `date_end` interact with recurrence?**

A recurring event with a 3-day duration is meaningful (e.g., "3-day conference every quarter") but adds complexity. The iCal spec supports this (DTSTART+DTEND+RRULE).

- [ ] Yes, support it from the start
- [ ] No, date_end and recurrence are mutually exclusive for now
- [x] Defer — don't worry about it until someone asks

> _Answer: Defer._

---

## 3. otl-p9zb — Numbered lists (feature, P2)

**Current state:** Node type enum is `Bullet | Checkbox | Heading`. Adding `Numbered` to the enum, operations, and storage is trivial. Markdown paste already recognizes `1. ` patterns but converts to bullets. The interesting part is rendering.

### Questions

**3a. Counting behavior — what resets the numbering?**

- [ ] Count only consecutive `numbered` siblings (a bullet or checkbox in between resets to 1) — this is what Dynalist does
- [x] Count all siblings regardless of type (position-based)
- [ ] Other: ___

> _Answer: All siblings (position-based counting)._

**3b. Nested numbering style?**

- [ ] Flat: 1, 2, 3 at every nesting level (Dynalist behavior, simpler)
- [ ] Hierarchical: 1.1, 1.2, 1.3 (outline numbering)
- [ ] User choice via setting
- [x] Flat now, hierarchical later

> _Answer: Flat inline display, but track enough data (parent position chain) so exports to markdown/HTML can produce hierarchical numbering (1.1, 1.2)._

**3c. Keyboard shortcut for converting to numbered?**

Current: `Ctrl+Shift+X` toggles bullet/checkbox. Options:

- [x] Extend toggle cycle: bullet → checkbox → numbered → bullet
- [ ] Separate shortcut (e.g., `Ctrl+Shift+N`)
- [ ] Context menu only, no shortcut
- [ ] Other: ___

> _Answer: Extend toggle cycle (Ctrl+Shift+X): bullet → checkbox → numbered → bullet._

---

## 4. otl-ogp3 — Navigation history (feature, P2)

**Current state:** Zoom is a single `zoomedNodeId`. No history. Breadcrumbs show the current path but don't record prior locations. Session state persists zoom per document.

### Questions

**4a. History model?**

- [x] Browser-style: linear stack, navigating somewhere new after "back" truncates forward history
- [ ] Simple back-only stack (no forward, just retrace steps)
- [ ] Other: ___

> _Answer: Browser-style._

**4b. Should document switches be part of zoom history?**

Example: You're in Doc A zoomed to node X, switch to Doc B zoomed to node Y. Should "Back" return you to Doc A at node X?

- [ ] Yes — unified navigation history across documents
- [ ] No — zoom history is per-document only
- [x] Defer this, just do per-document zoom history first

> _Answer: Start with per-document zoom history. Cross-document unified history deferred._

**4c. Keyboard shortcuts?**

- [x] `Alt+Left` / `Alt+Right` (browser convention)
- [ ] `Alt+[` / `Alt+]` (matches existing `Ctrl+[` / `Ctrl+]` zoom shortcuts)
- [ ] Other: ___

> _Answer: Alt+Left / Alt+Right (browser convention)._

**4d. Max history size?**

- [x] 50 entries (generous, low memory)
- [ ] 20 entries (conservative)
- [ ] Unlimited within session
- [ ] Other: ___

> _Answer: 50 entries._

---

## 5. otl-2qap — Bookmarks / Pinned items (feature, P1)

**Current state:** `docs/bookmarking-strategy.md` exists and recommends NOT building a separate bookmarks subsystem — use outline primitives instead. It does recommend a "Favorites/Pinned" sidebar section as a P2 enhancement. `SavedSearchStore` already exists and persists saved searches to localStorage, but has no UI in QuickNavigator.

### Questions

**5a. Scope — what does "bookmarks" actually mean here?**

The strategy doc pushes back on a full bookmarks system. Should this issue be scoped to:

- [ ] Pinned documents in sidebar + pinned nodes in QuickNavigator + expose saved searches in QuickNavigator
- [ ] Full bookmarks system (separate bookmark store with its own management UI)
- [x] Just pin documents for now, expand later
- [ ] Other: ___

> _Answer: Pinned documents in the sidebar._

**5b. Storage for pins?**

- [ ] localStorage (like savedSearchStore — simple, app-global, doesn't sync across machines)
- [ ] Separate file in data directory (syncs via Dropbox/Syncthing)
- [x] Per-document metadata in state.json (for node pins)
- [ ] Other: ___

> _Answer: Per-document metadata in state.json, suitable for file syncing._

**5c. QuickNavigator integration — should pinned items appear first?**

- [x] Yes, show pinned docs/nodes at the top before search results (like VS Code's recent files)
- [ ] Separate section/tab in QuickNavigator for bookmarks
- [ ] No QuickNavigator changes, just sidebar pins
- [ ] Other: ___

> _Answer: Yes, pinned items show first in QuickNavigator._

---

## 6. ~~otl-svq4 — Code blocks (feature, P2)~~ CLOSED

**Decision:** Close this issue. Code blocks are disabled in TipTap for good reason (outline content model). May revisit later, likely only for the notes field which will have a different editor setup (see section 8, single-entry dive-in).

---

## 7. otl-bgzq — Article view (feature, P2)

**Current state:** No exploration needed — the issue is 294 characters and entirely vague. "Alternate CSS/rendering mode that strips bullets and nesting" doesn't address any of the real questions.

### Questions

**7a. How is article view activated?**

- [x] Toggle button in toolbar (switches the whole document view)
- [ ] Separate route/panel (side-by-side with outline)
- [x] Also available when zoomed into a node (renders that subtree as prose)
- [ ] Other: ___

> _Answer: Toggle button in toolbar. Also works when zoomed in (renders zoomed subtree as prose)._

**7b. How should hierarchy map to prose?**

- [ ] Top-level items become paragraphs, children become indented sub-paragraphs
- [ ] Heading nodes become headings, everything else becomes paragraphs (depth-aware heading levels)
- [x] Flat: all items become paragraphs in order, nesting ignored
- [ ] Other: ___

> _Answer: Flat — flatten everything into paragraphs, ignore nesting._

**7c. What happens to non-text elements?**

- [x] Checkboxes render as strikethrough (completed) or bold (incomplete)
- [ ] Checkboxes hidden entirely
- [x] Notes render inline as italic text below their parent
- [ ] Notes hidden
- [ ] Other: ___

> _Answer: Show checkboxes. Show notes as italic._

**7d. Is this read-only or editable?**

- [ ] Read-only rendering (click to go back to outline view)
- [ ] Editable (TipTap in article layout — much more complex)
- [x] Read-only for now, editable later

> _Answer: Read-only for now. Note: a simpler "editable" approach might be possible by just hiding bullets and removing indentation from the existing TipTap rendering, keeping all existing editor behavior intact._

---

## 8. otl-6vlf — Single-entry dive-in (feature, P2)

**Current state:** The issue itself poses three design questions and answers none. The notes editor is currently a plain textarea with linkification. Zoom currently shows children of a node. This feature would let you open one item's note for long-form editing.

### Questions

**8a. UI model?**

- [x] New zoom variant: `Ctrl+]` on a node with no children opens note editor instead of child zoom
- [ ] Separate keyboard shortcut (e.g., `Ctrl+Enter` or `Ctrl+Shift+]`) opens note as full editor
- [ ] Panel/drawer that slides in from the right (like a detail pane)
- [ ] Other: ___

> _Answer: New zoom variant — Ctrl+] on childless nodes opens note editor._

**8b. Note editor technology?**

- [x] TipTap with same extensions as outline content (wiki links, dates, hashtags) — most consistent
- [ ] Markdown editor with preview (CodeMirror or similar) — different paradigm
- [ ] Enhanced textarea with markdown shortcuts — minimal change
- [ ] Other: ___

> _Answer: TipTap with same extensions as outline content._

**8c. Note storage format change?**

Currently notes are stored as plain text strings. A rich editor would produce HTML or structured content.

- [ ] Keep plain text storage, render markdown on display (backward compatible)
- [x] Migrate to HTML storage (like item content) — breaking change for existing notes
- [ ] Store as markdown, render with TipTap — middle ground
- [ ] Defer this decision until editor is chosen

> _Answer: Migrate to HTML storage (like item content). Will need migration for existing plain-text notes._

---

## 9. otl-u9rq — HTML export (feature, P2)

**Current state:** 270 characters. Backend export commands exist for Markdown and JSON but not HTML. OPML export is the only one wired to UI.

### Questions

**9a. Output target?**

- [ ] Save to file (Tauri save dialog)
- [ ] Copy to clipboard as HTML
- [x] Both
- [ ] Other: ___

> _Answer: Both — save to file and copy to clipboard._

**9b. How are wiki-links handled in export?**

- [ ] Resolve to plain text (just show the link text, no interactivity)
- [ ] Convert to `#anchor` links within the document (if target exists in exported content)
- [ ] Strip entirely
- [x] Other: Convert to `#anchor` links if target exists in exported content, otherwise fall back to plain text.

> _Answer: Convert to anchor links when possible, plain text fallback otherwise._

---

## 10. otl-w09e — Emoji shortcodes (feature, P3)

**Current state:** 422 characters. Clear enough on the what, but not the how.

**10a. Input mechanism?**

- [ ] TipTap input rule: typing `:smile:` auto-converts to 😄 on the closing colon (like Slack)
- [ ] Suggestion popup: typing `:smi` shows a dropdown of matching emoji (like GitHub)
- [x] Both (input rule for exact matches, popup for browsing)
- [ ] Other: ___

> _Answer: Both — TipTap input rule first, suggestion popup as progressive enhancement._

---

## Issues That Are Fine As-Is

These don't need additional detail — they're either well-scoped "wire up" tasks or have enough context:

| Issue | Title | Notes |
|-------|-------|-------|
| otl-sahu | Wire up iCal feed export | Backend + API exist, just needs UI button |
| otl-whbt | Wire up heading levels | Field exists, needs picker + rendering |
| otl-60p0 | Wire up node colors | Field exists, needs color picker + rendering |
| otl-8d6x | Wire up folder drag-drop | Backend exists, needs drag handler |
| otl-gpsb | Wire up JSON import / OPML merge | Backends exist, needs import dialog |
| otl-r6by | Wire up export buttons | Backends exist, needs export menu |
| otl-dr47 | Bullet vertical alignment | CSS fix |
| otl-905u | Context menu clips at right edge | Positioning math fix |
| otl-ejpy | Tighten toolbar width | CSS/responsive layout |
| otl-w8gt | Notes display config | Setting + conditional rendering |
| otl-cu7c | Reorganize context menu | Submenus, well-described |
| otl-8o0z | Copy semantics | Two modes, clear options given |
| otl-0s8g | App logo | Design task, no code questions |
| otl-cxu1 | Unify inbox/capture UX | Design issue, well-described |
| otl-14ik | Search operators | Well-described with examples |

### Selection & keyboard mode epic (otl-8lwe and children)

These 5 issues form a coherent epic and are well-specified:
- otl-z3vu — Navigate mode
- otl-rbdp — Shift+Up/Down selection
- otl-90fl — Ctrl+Up/Down move
- otl-6anb — Ctrl+A context-aware
- otl-cv2u — Cross-sibling movement

### Larger features (well-described)

- otl-539 — Ancestry-aware quick move (1884c, thorough)
- otl-jkf — Today/daily agenda view (1372c, thorough)
- otl-6xl — Repeat-on-complete (1653c, thorough)
- otl-bybx — CLI epic (1828c, thorough)
- otl-op8o — CLI capture command (1135c, thorough)
- otl-7blt — Sorting (319c but clear enough)
