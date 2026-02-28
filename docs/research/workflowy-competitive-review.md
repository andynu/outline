# Competitive Review: Workflowy vs Outline

## Executive Summary

Workflowy is the original infinite outliner and the spiritual ancestor of every tool in the category. Its defining philosophy is radical simplicity: one giant tree, zero configuration, instant search-as-filter. After years of minimalism, Workflowy has recently added mirrors (transclusion), kanban boards, bullet types (headings, paragraphs, to-dos), dates with a calendar view, and a polished mobile app. Outline takes a different path: multi-document, self-hosted, offline-first, with richer dates/recurrence, wiki links, and iCal integration. The key lessons from Workflowy are (1) simplicity as a feature, (2) how mirrors/transclusion work in practice, and (3) search-as-filter as the primary navigation paradigm.

---

## Feature-by-Feature Comparison

### Core Model

| Feature | Workflowy | Outline | Notes |
|---------|-----------|---------|-------|
| Infinite nesting | Yes | Yes | Parity |
| Zoom/hoist | Yes | Yes | Parity |
| Collapse/expand | Yes | Yes | Parity |
| Single vs multi-document | Single tree | Multiple documents | Workflowy puts everything in one infinite tree. Outline uses separate documents with a sidebar. Each has tradeoffs (see analysis below). |
| Drag-and-drop | Yes | Yes | Parity |
| Undo/redo | Yes | Yes | Parity |
| Node notes | Yes (inline notes) | Partial (data model exists, basic UI) | Workflowy has toggle-visible notes per bullet |
| Multi-select | Limited | Yes | Outline has richer multi-select with bulk operations |

**Single Tree vs Multi-Document Tradeoffs**

Workflowy's single-tree model is its most distinctive design choice:

- **Advantages of single tree**: Everything is always connected. You never wonder "which document did I put that in?" Search covers everything. Mirrors can reference any node. There is zero friction to create structure -- just add a child.
- **Advantages of multi-document**: Clearer conceptual boundaries. Better for distinct projects. Easier mental model for "what am I working on right now." Better sync granularity (only sync changed documents). Outline's multi-document approach also naturally supports separate wiki-link namespaces.
- **Lesson for Outline**: The single-tree advantage is primarily about discoverability and zero-friction linking. Outline mitigates this with wiki links and global search, but could further bridge the gap by making cross-document linking even more seamless.

### Simplicity

Workflowy's radical simplicity is arguably its greatest competitive advantage:

- **Zero onboarding**: Open it, start typing. No documents to create, no folders to set up, no settings to configure.
- **One interaction model**: Every node is the same. Zoom in, zoom out. That's it.
- **Progressive disclosure**: Features like boards, mirrors, and dates are opt-in and don't clutter the default experience.
- **Minimal chrome**: The interface is nearly invisible -- just text and bullets.

**Assessment for Outline**: Outline is well-balanced rather than over-featured. Its features (dates, recurrence, wiki links, backlinks) serve real workflows. The risk is in the settings/configuration surface area. Outline should resist adding features that require explanation and ensure new features follow Workflowy's example of progressive disclosure.

### Mirrors / Transclusion

Workflowy pioneered mirrors in the outliner space:

- **Source and virtual mirrors**: Every mirror has one "source" (the original) and one or more "virtual mirrors" (references). Visual indicator: a diamond icon instead of a bullet.
- **Full sync**: Edit any mirror and all copies update instantly. Children are also mirrored.
- **Creation methods**: Bullet menu, keyboard shortcut (Cmd+Shift+M), or inline `((`double-paren search.
- **Board integration**: Mirrors can appear in multiple kanban boards, allowing cross-project views.
- **Limitations**: You cannot mirror a mirror (only the source). Deleting the source deletes all mirrors.

**Lessons for Outline's mirror implementation (otl-z6k)**:
1. The `((` inline syntax is intuitive and should be considered alongside or as an extension of the `[[` wiki-link syntax.
2. The source/virtual distinction is important -- Outline's `mirror_source_id` field already models this correctly.
3. Mirrored children should be read-only in the virtual view unless explicitly "broken off" (forked).
4. Visual differentiation (diamond icon) is essential so users know they are editing a shared node.
5. Mirrors are most powerful when combined with boards/views -- showing the same task in multiple contexts.

### Search

| Feature | Workflowy | Outline | Notes |
|---------|-----------|---------|-------|
| Full-text search | Yes | Yes (FTS5) | Parity |
| Instant results | Yes (real-time filtering) | Yes (modal with results) | Different paradigm (see below) |
| Search operators | AND, OR, NOT (-), hierarchy (>) | Basic text matching | Workflowy significantly ahead |
| Tag search | `#tag`, `@tag` filtering | `#tag` filtering | Parity on basics |
| Date search | `is:todo`, `has:note`, `changed:` | No operators | Gap |
| Scope to current view | Yes (default) | No (always global) | Workflowy filters within zoomed context |
| Search-as-navigation | Primary paradigm | Secondary to browsing | Key philosophical difference |

**Search-as-Filter vs Search Modal**

This is the most significant UX difference between the two tools:

- **Workflowy**: Search is a filter. You type, and the current view narrows to show only matching nodes (with ancestors for context). You stay in your document and keep working. Search IS navigation.
- **Outline**: Search opens a modal, shows results, and you click one to navigate to it. It is a "find and go" model.

**Lesson for Outline**: The search-as-filter model is extremely powerful for large outlines. Outline already has tag filtering (click a `#tag` to filter the current view). Extending this to arbitrary text would bring the Workflowy search experience. This doesn't require replacing the current modal search -- both can coexist (modal for cross-document search, inline filter for within-document).

### Tags and Filters

| Feature | Workflowy | Outline | Notes |
|---------|-----------|---------|-------|
| Hashtags | `#tag` | `#tag` | Parity |
| Mentions | `@name` | `@name` | Parity |
| Click-to-filter | Yes | Yes | Parity |
| Multi-tag filter | AND by default, OR supported | Single tag filter | Gap -- Outline only filters one tag at a time |
| Downstream filtering | Yes (parent tag filters children) | No | Workflowy filters descendants of tagged nodes |
| Tags panel | No (inline only) | Yes (sidebar panel) | Outline has a dedicated tags panel -- advantage |
| Tag-based views | Via search | Via tags panel | Different approaches, both functional |

**Lesson for Outline**: Multi-tag filtering (AND/OR) and downstream filtering (show children of tagged parents) would meaningfully improve Outline's tag system.

### Boards / Kanban

Workflowy recently added kanban board view:

- **How it works**: Any nested list can become a board via slash command or bullet menu. First-level children become columns, second-level become cards.
- **Fractal boards**: Boards can contain boards. Cards can be expanded into sub-boards.
- **Integration with mirrors**: Same task can appear as a card in multiple boards.
- **Integration with tags/dates**: Cards can be filtered by tags and dates.

**Assessment for Outline**: A kanban view is a valuable future feature but not urgent. Outline's tag filtering and date views already provide structured views of tasks. If implemented, the key is that boards should be a "view mode" on existing data (like Workflowy), not a separate data structure.

### Dates and Calendar

| Feature | Workflowy | Outline | Notes |
|---------|-----------|---------|-------|
| Date picker | Yes (`!` trigger) | Yes (`!` trigger) | Parity on trigger |
| Natural language dates | Yes | Yes | Parity |
| Date ranges | Yes | No | Gap |
| Recurrence | No | Yes (RRULE) | Outline significantly ahead |
| Calendar view | Yes (built-in) | Yes (iCal feed + external calendar) | Different approach |
| "Found dates" | Yes (scans natural language) | No | Workflowy finds dates in prose text |
| Move to today | Yes (slash command) | No | Convenience feature |
| iCal integration | No | Yes | Outline advantage -- dates appear in any calendar app |
| Date views panel | No | Yes | Outline has dedicated date-organized panel |

**Assessment**: Outline has a materially stronger date system. RRULE recurrence is a major advantage that Workflowy completely lacks. The iCal feed integration is unique in the outliner space. Workflowy's calendar is simpler and more visual (built-in), while Outline's approach of external calendar integration is more flexible.

### Bullet / Node Types

| Feature | Workflowy | Outline | Notes |
|---------|-----------|---------|-------|
| Regular bullet | Yes | Yes | Parity |
| Checkbox / To-do | Yes | Yes | Parity |
| Headings (H1-H3) | Yes (H1, H2) | Yes (H1-H3) | Outline has more levels |
| Paragraph mode | Yes (hides bullet) | No | Workflowy can hide bullets for prose writing |
| Numbered lists | Yes | No | Gap |
| Color labels | No | Yes | Outline advantage |
| Completed item hiding | Yes ("ghost bullets") | Yes (hide completed) | Parity |

**Lesson for Outline**: Paragraph mode (hiding the bullet) is interesting for long-form writing but not essential for an outliner. Numbered lists are a reasonable future addition.

### Performance

| Feature | Workflowy | Outline | Notes |
|---------|-----------|---------|-------|
| Architecture | Cloud-first, single-page app | Local-first, Tauri + SQLite | Different models |
| Large outlines (10k+) | Handles well with virtual scrolling | Untested at scale but SQLite should handle well | Both adequate |
| Very large (100k+) | Degrades gradually, virtualization helps | Likely better due to local SQLite | Outline's architecture should scale better |
| Offline support | Yes (reconnects) | Yes (native offline-first) | Outline advantage -- no server dependency |
| Sync model | Real-time cloud sync | File-based sync (Dropbox/Syncthing) | Different tradeoffs |

**Assessment**: Outline's Tauri + SQLite architecture should handle large data sets better than Workflowy's browser-based approach. Workflowy has more experience with large user bases and has invested in virtual scrolling optimizations. If Outline needs to handle 10k+ items in a single document view, virtual scrolling should be investigated.

### Mobile

| Feature | Workflowy | Outline | Notes |
|---------|-----------|---------|-------|
| Native mobile app | Yes (iOS + Android) | No | Significant gap |
| Mobile editing | Full editing | No | Gap |
| Mobile capture | Via app | Web capture form | Outline has a lightweight capture form |
| Share-to-app | Yes (Android) | No | Gap |

**Assessment**: Workflowy has a major advantage in mobile. Outline's capture form is a pragmatic solution for the most common mobile use case (quick capture), but full mobile editing is a significant gap. However, building a native mobile app is a large investment. The capture form approach is an appropriate trade-off for a self-hosted, single-developer project.

### Sharing and Collaboration

| Feature | Workflowy | Outline | Notes |
|---------|-----------|---------|-------|
| Shared nodes | Yes (real-time) | No | Gap |
| Team workspaces | Yes | No | Gap |
| Public sharing | Yes (shareable links) | No | Gap |
| Multi-user editing | Yes (collaborative) | No (single-user) | Architectural difference |

**Assessment**: Outline is explicitly single-user and self-hosted. This is a deliberate design choice, not a gap. Single-user means simpler architecture, better privacy, and no dependency on external services. Workflowy's collaboration features are irrelevant to Outline's target user.

---

## What Outline Does Better

1. **Recurrence (RRULE)**: Full recurrence rules with iCal-standard RRULEs. Workflowy has no recurrence at all.
2. **Wiki links and backlinks**: `[[wiki-links]]` with bidirectional backlink tracking. Workflowy has internal links but not a wiki-link graph.
3. **Self-hosted and offline-first**: Data lives on your machine. No cloud dependency, no subscription, no vendor lock-in.
4. **iCal integration**: Dates surface in any calendar app via standard iCal feed. Unique in the outliner space.
5. **Date views panel**: Dedicated panel organizing items by date -- today, upcoming, overdue.
6. **Tags panel**: Dedicated panel for browsing and filtering by tags.
7. **Multi-document model**: Clear conceptual boundaries for different projects/areas.
8. **Rich text editing**: TipTap-based WYSIWYG is more polished than Workflowy's simpler formatting.
9. **Color labels**: Node-level color coding for visual organization.
10. **Data portability**: JSONL file format, OPML import/export, no proprietary lock-in.

## What Workflowy Does Better

1. **Simplicity**: Lower cognitive overhead. Zero onboarding. One infinite tree.
2. **Mirrors**: Mature transclusion with intuitive `((` syntax. Outline has the data model but not the UI.
3. **Search-as-filter**: Real-time filtering of the current view. Much more fluid than a search modal.
4. **Search operators**: AND, OR, NOT, hierarchy search, metadata filters (`is:todo`, `has:note`).
5. **Mobile app**: Full native editing on iOS and Android.
6. **Kanban boards**: Visual board view on any nested list.
7. **Downstream tag filtering**: Parent tags automatically filter descendants.
8. **Paragraph mode**: Bullet-hiding for prose writing.
9. **Calendar view**: Built-in visual calendar (vs Outline's external calendar approach).
10. **"Found dates"**: Detects dates in natural language text.

---

## Strategic Recommendations

### High-Impact Lessons to Adopt

1. **Search-as-filter mode**: Add an in-document filter (Ctrl+F style) that narrows the current view to matching nodes, complementing the existing cross-document search modal. This is the single highest-impact UX improvement Outline could adopt from Workflowy.

2. **Mirror UI (otl-z6k)**: Implement the mirror/transclusion UI. The data model (`mirror_source_id`) is ready. Key design decisions:
   - Use `((` syntax for inline mirror creation (alongside `[[` for wiki links)
   - Diamond icon visual indicator for mirrored nodes
   - Edits to any mirror propagate to all copies
   - Mirrored children render inline but are read-only

3. **Multi-tag filtering**: Allow combining tags with AND/OR in the tag filter. This is a relatively small UI change with large usability impact.

### Medium-Impact, Consider for Roadmap

4. **Search operators**: Add basic operators (NOT, exact match quotes) to search. Full Workflowy-style operators are nice but less critical.

5. **Downstream tag filtering**: When filtering by `#tag`, also show descendants of tagged nodes. This makes tags work as "scopes" rather than just labels.

6. **Kanban board view**: A "view mode" that renders first-level children as columns and second-level as cards. Should be a view on existing data, not new data structures.

### Low Priority / Not Recommended

7. **Single-tree model**: Not recommended to change. Outline's multi-document model is the right choice for its architecture and sync approach.

8. **Paragraph mode**: Niche use case. Not worth the complexity.

9. **Native mobile app**: Too large an investment. The capture form approach is appropriate.

10. **Collaboration features**: Out of scope for single-user architecture. Not a meaningful gap for target users.

---

## Summary

Workflowy's greatest strength is that it does less, better. The single-tree + search-as-filter paradigm creates a uniquely frictionless experience. Outline's strength is doing more, thoughtfully: richer dates, wiki links, self-hosted, offline-first. The two tools serve slightly different philosophies -- Workflowy for those who want radical simplicity, Outline for those who want power and ownership.

The most actionable takeaways for Outline are: (1) search-as-filter for in-document navigation, (2) mirror UI implementation building on the existing data model, and (3) multi-tag filtering. These three features would close the most meaningful gaps while preserving Outline's distinct advantages.
