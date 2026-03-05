# Competitive Review: Dynalist vs Outline

## Executive Summary

Dynalist is the closest competitor to Outline -- both are hierarchical outliners with infinite nesting, zoom, checkboxes, dates, and tags. Outline was designed as a Dynalist replacement after Dynalist entered maintenance mode, and it has already surpassed Dynalist in several areas (wiki links, backlinks, recurrence, offline-first, self-hosted). However, Dynalist still has meaningful features Outline should consider adopting, particularly around search operators, bookmarks, and display modes.

---

## Feature-by-Feature Comparison

### Core Model

| Feature | Dynalist | Outline | Notes |
|---------|----------|---------|-------|
| Infinite nesting | Yes | Yes | Parity |
| Zoom/hoist | Yes | Yes | Parity |
| Collapse/expand | Yes | Yes | Parity |
| Multiple documents | Yes | Yes | Parity |
| Folders | Yes | Yes | Parity |
| Drag-and-drop | Yes | Yes | Parity |
| Undo/redo | Yes | Yes | Parity |
| Node notes | Yes | Partial | Dynalist notes have three display modes (show/1st-line/hide) configurable globally and per-document, toggled via Shift+Enter. Notes support basic inline markdown (bold, italic, code, links) but not block-level formatting (lists, headers, quotes). Notes are searchable via `in:note` operator. Outline has a `note` field with Shift+Enter editing but lacks the visibility toggle modes. |
| Numbered lists | Yes | No | Dynalist supports numbered list items as a node type. Outline only has bullet, checkbox, heading. |
| Multi-select | Yes | Yes | Outline supports multi-select with bulk operations |

### Document Management

| Feature | Dynalist | Outline | Notes |
|---------|----------|---------|-------|
| Sidebar file pane | Yes | Yes | Parity |
| Document search | Yes | Yes | Outline has QuickNavigator (Ctrl+O) |
| Folders | Yes | Yes | Outline has folder support with drag-and-drop |
| Document icons/emoji | No | No | Neither supports this. Outline stores UTF-8 so raw emoji already works in content. Explore `:emoji-word:` to UTF-8 conversion as a TipTap extension. |
| Recent documents | Implicit via file pane | No | Dynalist shows recently accessed docs. Skipping -- explicit document ordering is preferred. |

### Formatting

| Feature | Dynalist | Outline | Notes |
|---------|----------|---------|-------|
| Bold/Italic | Markdown syntax | TipTap rich text | Outline is richer -- WYSIWYG with toolbar |
| Strikethrough | Yes | Yes | Parity |
| Code inline | Yes | Yes | Parity |
| Code blocks | Yes | No | Dynalist has multi-line code blocks with syntax highlighting |
| Links (URL) | Markdown syntax | TipTap links | Parity |
| LaTeX math | Yes | No | Dynalist renders LaTeX expressions inline |
| Headings | H1-H3 | H1-H3 | Parity |
| Color labels | 6 colors | Yes | Parity |
| Inline images | Yes (Pro) | No | Dynalist Pro allows image attachments |
| File attachments | Yes (Pro) | No | Dynalist Pro allows file uploads |

**Verdict**: Outline's TipTap-based rich text is more polished for everyday formatting. Code blocks are worth exploring (TipTap has extensions). LaTeX is not needed.

### Dates and Tasks

| Feature | Dynalist | Outline | Notes |
|---------|----------|---------|-------|
| Checkboxes | Yes | Yes | Parity |
| Date input | `!` triggers date picker | `!` triggers date picker | Outline was directly inspired by Dynalist here |
| Date picker UI | Yes | Yes | Parity |
| Natural language dates | Limited | Yes | Outline supports "today", "tomorrow", "next monday", etc. |
| Date badges | Yes | Yes | Parity |
| Overdue highlighting | Red color | Yes | Parity |
| Recurring dates | Yes (Pro) | Yes | Outline supports this for free |
| Completion-based recurrence | Yes | Yes | Both support "from completion" patterns |
| Date ranges | Yes | No | Dynalist supports start+end date ranges |
| Custom date format | Yes (Pro) | No | Dynalist Pro allows custom date display |
| Google Calendar sync | Yes (Pro) | iCal feed | Outline uses standard iCal -- works with any calendar app, more open |

**Verdict**: Outline matches or exceeds Dynalist on dates/tasks. Date ranges and custom format are minor gaps.

### Bookmarks

| Feature | Dynalist | Outline | Notes |
|---------|----------|---------|-------|
| Bookmark documents | Yes (5 free, unlimited Pro) | No | Quick-access pinned documents |
| Bookmark items | Yes | No | Jump to any specific node |
| Bookmark searches | Yes | No | Save and name search queries |
| Access via Ctrl+O | Yes | Partial | Outline's QuickNavigator searches docs but doesn't show bookmarks |

**Verdict**: This is a meaningful gap. Bookmarks provide quick access to frequently-used items across documents. Outline's QuickNavigator partially covers the document-level use case but misses item and search bookmarks. See `docs/bookmarking-strategy.md` for an existing strategy.

### Tags and Search

| Feature | Dynalist | Outline | Notes |
|---------|----------|---------|-------|
| #hashtags | Yes | Yes | Parity |
| @mentions | Yes | Yes | Outline extracts mentions |
| Tag pane | Yes (Pro) | Yes | Outline has TagsPanel showing all tags |
| Full-text search | Yes | Yes (FTS5) | Outline uses SQLite FTS5 -- very fast |
| Search across docs | Yes | Yes | Parity |
| Search within doc | Yes | Yes | Parity |
| Search snippets | Yes | Yes | FTS5 generates highlighted snippets |
| `is:completed` | Yes | No | Filter for checked items |
| `has:date` | Yes | No | Filter for items with dates |
| `has:note` | Yes | No | Filter for items with notes |
| `has:children` | Yes | No | Filter for parent items |
| `has:color` | Yes | No | Filter for colored items |
| `color:red` | Yes | No | Filter by specific color |
| `is:heading` | Yes | No | Filter for heading items |
| `edited:DATE` | Yes | No | Filter by edit date range |
| `created:DATE` | Yes | No | Filter by creation date |
| `within:`, `since:`, `until:` | Yes | No | Relative date range searches |
| `parent:keyword` | Yes | No | Direct parent contains keyword |
| `ancestor:keyword` | Yes | No | Any ancestor contains keyword |
| `in:title`, `in:note` | Yes | No | Scope search to field |
| Boolean operators | `OR`, `-` (exclude) | No | Combine search terms |
| Exact phrase | `"quoted"` | No | Exact string matching |
| Saved searches | Yes (via bookmarks) | No | Bookmark a search query |
| Item finder | Yes (Pro) | Yes | QuickNavigator in item mode |

**Verdict**: Dynalist's search operators are significantly more powerful. Outline has fast FTS5 search but lacks structured query operators. This is the single biggest feature gap.

### Zoom and Navigation

| Feature | Dynalist | Outline | Notes |
|---------|----------|---------|-------|
| Zoom into node | Yes | Yes | Parity |
| Breadcrumbs | Yes | Yes | Parity |
| Ctrl+O file finder | Yes | Yes | QuickNavigator file mode |
| Ctrl+Shift+O item finder | Yes (Pro) | Yes | QuickNavigator item mode |
| Internal links `[[` | Yes | Yes | Parity -- Outline has WikiLink TipTap extension |
| Backlinks panel | No | Yes | Outline advantage -- shows all inbound links |
| Back/forward navigation | Browser history | No | Dynalist web uses browser history for zoom navigation |

**Verdict**: Outline has the edge here thanks to backlinks. Navigation history (back/forward after zooming) would be a nice addition.

### Collaboration

| Feature | Dynalist | Outline | Notes |
|---------|----------|---------|-------|
| Sharing via link | Yes | No | Dynalist supports public doc links |
| Private sharing | Yes | No | Share with specific Dynalist users |
| Real-time collab | Yes | No | Multiple editors simultaneously |
| Comments | Yes | No | Comment threads on items |
| Version history | Yes (Pro) | No | Restore previous versions |

**Verdict**: Outline is deliberately single-user and self-hosted. This is not a gap to fill -- it is a design choice. The thin server provides read-only viewing via `viewer.html` which partially addresses the sharing use case.

### OPML Import/Export

| Feature | Dynalist | Outline | Notes |
|---------|----------|---------|-------|
| OPML import | Yes | Yes | Outline supports import via file picker and bulk Dynalist backup import |
| OPML export | Yes | Yes | Parity |
| Dynalist backup import | N/A | Yes | Outline has `import_dynalist_backup` and `import_latest_dynalist_backup` commands |
| WorkFlowy import | Yes | Via OPML | Both use OPML as the interchange format |
| Markdown export | No | Yes | Outline advantage |
| JSON export/import | No | Yes | Outline advantage |
| Plain text export | Yes | Yes | Parity |
| HTML export | Yes | No | Dynalist exports to HTML |

**Verdict**: Outline has excellent import/export, especially the Dynalist-specific backup import tooling.

### Power User Features

| Feature | Dynalist | Outline | Notes |
|---------|----------|---------|-------|
| API | Yes (REST) | CLI + Tauri commands | Dynalist has a public REST API. Outline has Tauri IPC commands and a CLI (`outline-cli`) that provides power-user access without a server-based API. |
| Custom CSS | Yes (Pro) | No | Dynalist Pro lets users inject custom CSS |
| Custom shortcuts | Yes (Pro) | No | Rebind any keyboard shortcut |
| Custom mobile toolbar | Yes (Pro) | N/A | Desktop-only app |
| Browser clipper | Chrome + Firefox (Pro) | No | Clip web content to Dynalist inbox |
| Inbox capture | Yes (Pro) | Yes | Outline has inbox via thin server API + mobile form |
| Daily cloud backup | Yes (Pro, Dropbox/GDrive) | File sync | Outline syncs the raw files via Dropbox/Syncthing -- equivalent |
| Sorting | By title, date, etc. | No | Dynalist can sort children by various criteria |
| Mind map view | Yes (Pro) | No | Visual mind map rendering of outline |
| Article view | Yes | No | Render outline as flowing prose |
| List density | Cozy/Comfortable/Compact | No | Adjust vertical spacing |
| Theme selection | Multiple themes | No | Dynalist has multiple built-in themes |
| Font selection | Yes | No | Choose between fonts |

**Verdict**: Dynalist Pro has many polish features. Sorting and article view are approved for implementation. Custom shortcuts, browser clipper, and font selection are tracked as future directions.

---

## What Outline Does Better

1. **Wiki links + Backlinks**: Outline has `[[wiki-link]]` with autocomplete and a backlinks panel. Dynalist has internal links but no backlinks panel. This is a major structural advantage for building a knowledge base.

2. **Recurrence (free)**: Outline provides recurring dates without a paid tier. Dynalist gates this behind Pro ($8/month).

3. **Offline-first, self-hosted**: No dependency on a cloud service. Data is local JSONL files synced via Dropbox/Syncthing. Dynalist requires their servers.

4. **Multi-machine sync**: Outline's CRDT-like pending file approach (per-machine JSONL with LWW merge) handles offline edits gracefully. Dynalist relies on centralized cloud sync.

5. **iCal feed**: Standard iCalendar output that works with any calendar app. Dynalist only syncs to Google Calendar.

6. **Rich text editing**: TipTap-based WYSIWYG is smoother than Dynalist's Markdown rendering.

7. **Dynalist backup import**: Purpose-built tooling to migrate from Dynalist.

8. **Date views panel**: Aggregated view of items by date (today, upcoming, overdue). Dynalist requires manual search queries.

9. **Tags panel**: Dedicated panel showing all tags with click-to-filter.

10. **JSON/Markdown export**: More export formats than Dynalist.

---

## Approved Features to Adopt from Dynalist

### Priority 1 -- High Impact, Reasonable Effort

| Feature | Rationale | Effort | Status |
|---------|-----------|--------|--------|
| **Search operators** (`is:completed`, `has:date`, `color:red`, etc.) | Biggest feature gap. Power users rely on structured search. FTS5 can be extended with custom tokenizers or pre-query parsing. | Medium -- parse operators before FTS5 query, combine with SQL WHERE clauses | Approved |
| **Bookmarks** | Quick access to frequently-used items, docs, and searches. Already has a strategy doc (`docs/bookmarking-strategy.md`). | Medium -- UI + persistence | Approved |
| **Sorting** (sort children by title, date, updated) | Simple utility feature. Right-click a parent, "Sort children by..." | Small -- reorder positions by sort key | Approved |

### Priority 2 -- Medium Impact

| Feature | Rationale | Effort | Status |
|---------|-----------|--------|--------|
| **Date ranges** (start + end date) | Useful for events and project timelines. Extends the existing date model. | Small -- add `date_end` field | Approved |
| **Article view** | Render outline as flowing text. Useful for writing/reviewing. | Medium -- alternate CSS/rendering mode | Approved |
| **Navigation history** (back/forward) | After zooming around, users want to retrace their steps. | Small -- maintain a zoom history stack | Approved |
| **Numbered lists** | Useful node type variant alongside bullet, checkbox, heading. | Small | Approved |
| **Code blocks** | Multi-line code with syntax highlighting. TipTap has extensions for this. | Medium | Approved |
| **HTML export** | Export outlines as HTML documents. Support both light and dark mode output, light mode by default. | Small | Approved |
| **Emoji shortcodes** | `:emoji-word:` to UTF-8 conversion in TipTap. Raw emoji already works in content. | Small | Approved |

### Declined

| Feature | Decision |
|---------|----------|
| Custom CSS | Not needed |
| List density options | Not needed |
| LaTeX | Not needed |
| Mind map view | Not needed |
| Custom date format | Not needed |
| Theme selection | Not needed |
| Recent documents | Skipped -- explicit document ordering preferred |
| Inline images | Punted |
| File attachments | Not desired |
| Real-time collaboration | Not desired -- single-user by design |
| API (public REST) | Not desired -- CLI provides power-user access |
| Cloud-hosted option | Counter to self-hosted mission |

### Future Directions

See `docs/future-directions.md` for features deferred to future exploration:
- Custom keyboard shortcuts
- Browser clipper
- Font selection
- Dated backups of all documents

---

## Summary

Outline has already achieved feature parity or superiority in the core outlining experience: hierarchy, zoom, navigation, dates, checkboxes, recurrence, and links. The approved roadmap focuses on:

1. **Search operators** -- structured query language for filtering items (highest priority)
2. **Bookmarks** -- quick access to pinned items, docs, and searches
3. **Sorting** -- sort children by title, date, updated
4. **Date ranges, article view, navigation history** -- medium-impact quality-of-life improvements
5. **Numbered lists, code blocks, HTML export, emoji shortcodes** -- rounding out the feature set

Search operators should be the top priority as they unlock power-user workflows that are currently impossible in Outline.
