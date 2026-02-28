# Bookmarking and Reference Management Strategy

Review date: 2026-02-28

## Current State Assessment

### What Exists Today

**URL Handling**
- `AutoLink.ts`: Bare URLs in node content are auto-detected and rendered as clickable links via ProseMirror decorations. Clicking opens the URL externally (via Tauri `openUrl`).
- `MarkdownLink.ts`: Markdown-style `[text](url)` links are supported. In edit mode the raw syntax is visible with subtle styling; in static mode `renderStaticContent.ts` renders just the clickable display text.
- URLs are stored as plain text within node `content` (HTML). There is no separate URL/bookmark data structure.

**Internal Linking (Wiki Links)**
- `WikiLink.ts`: `[[node-id]]` syntax creates inline cross-references between nodes. Autocomplete via `WikiLinkSuggestion.svelte` searches for nodes by content.
- `BacklinksPanel.svelte`: Displays a collapsible panel showing all nodes that link to the current node via wiki links. Backed by a `links` table in the SQLite search index.

**Tagging**
- `Hashtag.ts`: `#tag` syntax is auto-detected in content and rendered with distinct styling. Clickable to filter.
- `TagsPanel.svelte`: Aggregates all hashtags across the outline, shows counts, and lets users drill into nodes with a specific tag.
- Tags are also stored in the `tags` field on `Node` and indexed in the FTS5 search (`nodes_fts` includes a `tags` column).

**Search**
- SQLite FTS5 full-text search across `content`, `note`, and `tags` fields. Supports cross-document and within-document scoping.
- `SearchModal.svelte`: Global search with debounced queries, BM25 ranking, and snippet highlighting.

**Quick Capture**
- Server-side capture form at `/outline/capture` (mobile-friendly web form).
- API endpoint at `/outline/api/inbox` for programmatic capture (Shortcuts, automation).
- `InboxPanel.svelte`: Desktop UI for reviewing captured items, grouped by date, with keyboard navigation and dismiss/process actions.
- Inbox items are plain text with optional notes, stored as `inbox.jsonl`.

**Import**
- OPML import (Dynalist backup format) via `import_export/opml.rs`.
- Markdown import via `import_export/markdown.rs`.
- JSON import via `import_export/json.rs`.
- Markdown paste parsing in `markdownPaste.ts` (preserves hierarchy and checkboxes).

---

## Evaluation by Area

### 1. Web Clipping

**Current**: No dedicated web clipping. Users can paste URLs into nodes manually, and `AutoLink` renders them clickable.

**Gaps**:
- No browser extension or bookmarklet.
- No automatic metadata extraction (title, description, favicon).
- No share sheet integration on mobile.

**Recommendations**:
- **P1**: Build a bookmarklet that sends `{content: "title", note: "url"}` to the existing `/outline/api/inbox` endpoint. This is minimal effort and immediately useful.
- **P2**: Build a browser extension (Chrome/Firefox) that extracts page title + URL + selected text and POSTs to the inbox API. Could also support `[title](url)` markdown format directly.
- **P3**: iOS/Android share sheet support would require a companion mobile app or PWA with Web Share Target API. Defer unless mobile usage is high.

### 2. Link Preview / Open Graph

**Current**: No link preview. Pasted URLs display as raw text with clickable decoration.

**Gaps**:
- No title/description fetch on paste.
- No Open Graph metadata extraction.
- No visual preview cards.

**Recommendations**:
- **P2**: Add a Tauri command `fetch_url_metadata(url)` that makes an HTTP request, parses `<title>`, `og:title`, `og:description`, and `og:image` from the HTML. On paste of a bare URL, auto-convert to `[Page Title](url)` markdown link format. This uses the existing MarkdownLink rendering and stores the title in-content without needing a new data structure.
- **P3**: Rich preview cards (with images/descriptions) are heavy for an outliner. The markdown link approach keeps things lightweight while still showing meaningful text instead of raw URLs.

### 3. Bookmark Organization

**Current**: Bookmarks are just nodes containing URLs. They inherit the full outline hierarchy -- nesting, reordering, collapsing. Tags via `#hashtag` syntax apply to any node.

**Assessment**: This is actually a strength. The hierarchical outliner structure naturally supports bookmark organization better than flat folders or tag-only systems. A user can create a "Reading" section, nest categories under it, and drop bookmarked URLs into the hierarchy. Tags cross-cut the hierarchy for thematic grouping.

**Gaps**:
- No way to filter/view "all nodes containing URLs" as a dedicated view.
- No bookmark-specific metadata (favicon, domain, saved date).

**Recommendations**:
- **P2**: Add a "Links" panel (similar to DateViewsPanel or TagsPanel) that queries the search index for nodes containing URL patterns. Group by domain or date.
- **P3**: Extract and store domain as a searchable attribute when URLs are present in a node.

### 4. Quick Capture for URLs

**Current**: The capture API and web form exist. The inbox captures plain text with optional notes.

**Assessment**: The capture pipeline is already suitable for URL bookmarking. A user can capture a URL via the API, then process it from the inbox into the outline hierarchy.

**Gaps**:
- The capture form does not distinguish URLs from plain text.
- No auto-title-fetch on capture.
- No dedicated "bookmark this URL" capture flow.

**Recommendations**:
- **P1**: Enhance the bookmarklet to send `{content: "[Page Title](url)", source: "bookmarklet"}` so captured URLs arrive pre-formatted with titles.
- **P2**: Add URL detection in the inbox processing flow -- if an item contains a URL, offer to fetch the title and convert to markdown link format before inserting into the outline.

### 5. Wiki Links as Internal Bookmarks

**Current**: Wiki links (`[[node-id]]`) provide cross-references between nodes. Backlinks panel shows reverse references.

**Assessment**: Wiki links are effective as an internal bookmarking system. Any node can reference any other node, creating a bidirectional link graph. The backlinks panel surfaces these connections in context.

**Gaps**:
- Wiki links use node IDs, not human-readable names. The display text is stored but if a node's content changes, the wiki link display text becomes stale.
- No "starred" or "pinned" concept for frequently accessed nodes.

**Recommendations**:
- **P2**: Add a "Favorites" or "Pinned" list in the sidebar for quick access to frequently referenced nodes. This is simpler than a full bookmarking system and works with the existing data model (could be a setting or a dedicated list in the document).
- **P3**: Consider auto-updating wiki link display text when the target node's content changes.

### 6. Backlinks as Discovery

**Current**: `BacklinksPanel.svelte` shows all inbound wiki links for the focused node. Backed by the `links` table in SQLite.

**Assessment**: Backlinks are functional for discovery. When you view a node, you see everything that references it. This is the core of a Zettelkasten-style reference system.

**Gaps**:
- Backlinks only track wiki links (`[[...]]`), not markdown links or bare URLs. If node A contains a URL that is also referenced by node B, there is no cross-referencing.
- No graph visualization of link relationships.

**Recommendations**:
- **P3**: Track URL co-occurrences -- if two nodes contain the same URL, surface that as a "related by URL" connection.
- **P3**: Link graph visualization is interesting but not essential for a text-first outliner. Defer.

### 7. Search Over Bookmarks

**Current**: FTS5 indexes `content`, `note`, and `tags`. URLs within content are searchable as text.

**Assessment**: Searching for a URL, domain name, or words in a link title already works via the existing search. The FTS5 index strips HTML but preserves text content including URLs.

**Gaps**:
- No dedicated "search by URL" or "search by domain" filter.
- FTS5 word tokenization may not handle URLs well (e.g., searching "github.com" might not match "https://github.com/foo/bar").

**Recommendations**:
- **P2**: Test and verify URL search behavior in FTS5. If needed, add a separate `urls` column in the search index that stores extracted URLs for exact-match searching.
- **P1**: For now, the markdown link approach (`[GitHub Repo](url)`) makes the title searchable, which covers most discovery use cases.

### 8. Read-Later Workflow

**Current**: Nodes support checkboxes (`node_type: 'checkbox'`), dates, and tags. A user could tag items `#to-read` and use checkboxes to track completion.

**Assessment**: The building blocks exist. The DateViewsPanel already surfaces items by date, and the TagsPanel surfaces items by tag. A `#to-read` workflow is possible today with no code changes.

**Gaps**:
- No dedicated "reading list" view or workflow.
- No automatic archiving of completed reading items.

**Recommendations**:
- **P3**: A dedicated "Reading List" view that filters for nodes tagged `#to-read` with unchecked checkboxes, ordered by date added. This is a UI convenience over the existing TagsPanel.
- **Not recommended**: Auto-archiving. Let users manage their hierarchy.

### 9. Archive / Snapshot

**Current**: No content archiving or snapshotting of external pages.

**Assessment**: This is a significant feature (essentially building a web archive). For a local-first outliner focused on personal knowledge management, this adds complexity and storage concerns.

**Recommendations**:
- **Not recommended for now**. Web archiving is a separate concern best served by dedicated tools (Pocket, ArchiveBox, Wayback Machine). The outliner should focus on organizing references, not duplicating content.
- **P3**: If demand exists, a minimal approach would be to save a plain-text excerpt (first N characters of page content) in the node's `note` field during URL capture.

### 10. Import from Browser Bookmarks

**Current**: OPML and markdown import exist. No browser bookmark import.

**Gaps**:
- Chrome bookmarks are in JSON format, Firefox in JSON or HTML.
- Most bookmark managers (Raindrop, Pinboard) export as HTML or CSV.

**Recommendations**:
- **P2**: Add an HTML bookmark import (Netscape Bookmark File format) -- this is the universal format exported by Chrome, Firefox, Safari, and most bookmark managers. Parse `<DT><A HREF="url">title</A>` entries into nodes with `[title](url)` content, preserving the folder hierarchy as outline nesting.
- **P3**: Raindrop/Pinboard CSV import.

### 11. Broken Link Detection

**Current**: No link checking.

**Recommendations**:
- **P3**: Add a background task (Tauri command) that iterates over nodes containing URLs, performs HEAD requests, and flags 404/unreachable links. Surface these in a "Broken Links" panel. This is useful but not critical for initial bookmarking support.

---

## Implementation Priority Summary

### P1 -- Quick Wins (days of effort)
1. **Bookmarklet** that sends `[title](url)` to `/outline/api/inbox`
2. **Verify FTS5 URL search** works acceptably with markdown link format

### P2 -- Medium Effort (1-2 weeks each)
3. **URL metadata fetch on paste** (`fetch_url_metadata` Tauri command, auto-convert URL to markdown link)
4. **Links panel** (query search index for URL-containing nodes, group by domain)
5. **HTML bookmark import** (Netscape Bookmark File format into outline hierarchy)
6. **Favorites/Pinned sidebar** for frequently accessed nodes
7. **Enhanced inbox URL handling** (auto-fetch title for captured URLs)

### P3 -- Larger Efforts / Defer
8. Browser extension for clipping
9. URL co-occurrence tracking
10. Reading list view
11. Broken link detection
12. Content archiving/snapshots
13. Wiki link display text auto-update
14. Mobile share sheet integration

---

## Key Design Principle

The outliner's hierarchical structure is the bookmark organizer. Rather than building a separate "bookmarks" subsystem, lean into the existing primitives:
- **Nodes** hold URLs (as markdown links for title display)
- **Hierarchy** provides folder-like organization
- **Tags** provide cross-cutting categorization
- **Search** provides discovery
- **Wiki links + backlinks** provide internal cross-referencing
- **Inbox** provides capture

The primary gap is getting URLs into the system with metadata (title) attached. Closing that gap with a bookmarklet and paste-time metadata fetch covers the majority of bookmarking use cases without architectural changes.
