# Competitive Review: Roam Research vs Outline

## Executive Summary

Roam Research pioneered the "tools for thought" category in 2020, introducing bidirectional linking and block references to a mainstream audience. Its core innovation is treating every bullet as a uniquely addressable, referenceable block in a graph database. Roam's influence on the space is enormous -- it inspired Logseq, Obsidian's backlinks, and much of the "networked thought" movement. However, Roam's development has stagnated, its pricing remains steep at $15/month with no free tier, and many users have migrated to alternatives. Outline takes a fundamentally different approach: self-hosted, offline-first, file-based sync, with stronger task management (dates, recurrence, iCal). The key lessons from Roam are (1) block references as a concept worth tracking but not adopting wholesale, (2) daily notes as a workflow pattern Outline partially addresses with date views, and (3) the practical limits of graph-centric design -- most users want structured outlines, not freeform graphs.

---

## Feature-by-Feature Comparison

### Core Model

| Feature | Roam Research | Outline | Notes |
|---------|--------------|---------|-------|
| Infinite nesting | Yes | Yes | Parity |
| Every block has a unique ID | Yes (visible, referenceable) | Yes (UUID, internal) | Roam exposes IDs for referencing; Outline uses them internally |
| Zoom/hoist | Yes | Yes | Parity |
| Collapse/expand | Yes | Yes | Parity |
| Page-based vs document-based | Pages in a single graph | Multiple documents with sidebar | Different models (see below) |
| Drag-and-drop | Yes | Yes | Parity |
| Undo/redo | Yes | Yes | Parity |
| Multi-select | No | Yes | Outline advantage |
| Rich text formatting | Basic (bold, italic, highlight) | Full TipTap WYSIWYG | Outline has richer formatting |

**Pages vs Documents**

Roam's "pages" are lightweight -- any `[[Page Name]]` automatically creates one. This makes creating structure effortless but leads to page sprawl (hundreds of half-empty pages). Outline's documents are more intentional, with a sidebar for navigation. Roam's frictionless page creation is powerful for capturing, but Outline's multi-document model gives clearer conceptual boundaries and better sync granularity.

### Daily Notes

Roam's journal-first workflow is its most distinctive UX pattern:

- **How it works**: Opening Roam takes you to today's daily note page, automatically titled with the current date. Everything starts here. Structure emerges by linking outward to topic pages.
- **Workflow**: Users capture everything in the daily note, then link to permanent pages with `[[brackets]]`. Over time, each page accumulates backlinks from multiple daily notes, forming a chronological record of when you thought about a topic.
- **Strengths**: Zero friction to start writing. No decision about where to put things. Every thought is timestamped by virtue of being on a dated page.
- **Weaknesses**: Can create a dependency on daily pages as a crutch. Structure must be actively created through linking; without discipline, daily notes become a graveyard of disconnected thoughts.

**Comparison to Outline**: Outline's date-centric approach is structurally different but serves overlapping goals. The date views panel shows items organized by date (today, upcoming, overdue). Items with dates surface in the iCal feed. The inbox capture feature provides a landing zone for quick thoughts. Outline does not have a "daily note page" concept, but its date system is more structured -- items have explicit dates with recurrence rules, rather than being organized by the day they were written.

**Assessment**: Daily notes are a workflow pattern, not a feature Outline needs to adopt directly. Outline's date views panel and inbox already provide the core benefits (a place for today's items, quick capture). The missing piece is the "everything tagged by when I thought about it" aspect, which backlinks partially address -- if you link to a topic, the backlink shows when you made that connection.

### Bidirectional Linking

| Feature | Roam Research | Outline | Notes |
|---------|--------------|---------|-------|
| Page links (`[[...]]`) | Yes (auto-creates pages) | Yes (wiki links to nodes) | Different targets: Roam links to pages, Outline links to nodes |
| Backlinks panel | Yes (at bottom of every page) | Yes (sidebar panel) | Both show incoming references |
| Unlinked references | Yes (mentions without `[[]]`) | No | Roam finds text mentions even without explicit links |
| Block references (`((...))`) | Yes (inline transclusion) | No | Roam's unique feature (see block references section) |
| Autocomplete on typing `[[` | Yes | Yes | Parity |
| Link to any block | Yes (any bullet is linkable) | Yes (any node is linkable) | Parity on addressability |

**Roam's Implementation Details**:
- `[[Page Name]]` creates a link to a page (auto-created if it doesn't exist). This is a page-level link.
- `((block-id))` creates an inline reference to a specific block. This renders the block's content inline and clicking navigates to it.
- The backlinks section at the bottom of every page shows all pages/blocks that reference this page, grouped by source page with surrounding context.
- "Unlinked references" shows text mentions of the page title that aren't wrapped in `[[]]`, letting you retroactively add links.

**Comparison**: Outline's wiki links are node-level rather than page-level, which is actually more granular than Roam's page links. Outline's backlinks panel serves the same discovery purpose. The key gap is unlinked references -- Roam's ability to find mentions that aren't explicitly linked is useful for discovering connections you didn't realize existed.

**Lesson for Outline**: Unlinked references is an interesting feature but low priority. It requires scanning all content for text matching node titles, which is computationally expensive and noisy for short titles. The existing wiki link + backlinks system covers the core use case well.

### Block References and Embeds

This is Roam's most distinctive feature and the most relevant to Outline's mirrors decision (otl-z6k, decided against).

**How Roam Block References Work**:
- Every bullet has a unique block ID (a 9-character alphanumeric string).
- `((block-id))` creates a reference that renders the block's content inline.
- Block references are read-only by default -- clicking navigates to the original.
- `{{embed: ((block-id))}}` creates a full embed where the block (and its children) render inline and can be edited in-place.
- Editing an embedded block updates the original and all other embeds simultaneously.
- Block references track a count of how many places reference them.

**Practical Reality of Block References**:
- Power users love them; casual users rarely use them.
- They create a "web of blocks" that can be hard to reason about -- editing in one place affects many others.
- Export/portability breaks down: Roam's JSON export preserves block IDs, but Markdown export cannot represent block references meaningfully.
- Performance degrades with many embeds, as each requires resolving and rendering the source block.

**Relevance to Outline's No-Mirrors Decision**: Outline's decision to not implement mirrors (documented in `docs/decisions/no-mirrors.md`) aligns with the practical lessons from Roam:

1. **Complexity vs. value**: Roam demonstrates that block references are powerful but niche. Most Roam users use `[[page links]]` far more than `((block refs))`.
2. **Sync challenges**: Roam is cloud-only, avoiding the multi-machine sync problem entirely. Outline's file-based sync would make mirrored content significantly harder to handle correctly.
3. **Mental model**: Roam users frequently report confusion about which copy is the "real" one, especially with embeds.
4. **Wiki links are sufficient**: For the "reference content elsewhere" use case, Outline's wiki links + backlinks provide the navigation and discovery benefits without the sync complexity.

**Recommendation**: The no-mirrors decision remains correct. If block referencing were reconsidered in the future, a read-only "block preview on hover" for wiki links would capture 80% of the value with 10% of the complexity -- show the linked node's content in a tooltip without actual transclusion.

### Sidebar (Multi-Pane)

Roam's right sidebar enables viewing multiple blocks/pages simultaneously:

- **How it works**: Shift-click any link or block to open it in the right sidebar. Multiple items stack vertically.
- **Use cases**: Compare two pages, reference one page while writing in another, keep a running list visible while working.
- **Saved sidebar state**: Extensions (like RoamJS) can save and restore sidebar configurations.

**Comparison to Outline**: Outline has a sidebar for document navigation, tags panel, date views panel, and backlinks panel. It does not have a "content sidebar" where you can open arbitrary nodes for reference while working on the main outline.

**Assessment**: Multi-pane viewing is genuinely useful for knowledge work. However, it adds significant UI complexity and is primarily valuable for reference-heavy workflows (research, writing). For Outline's task-oriented focus, the existing sidebar panels (dates, tags, backlinks) serve the primary navigation needs. A content sidebar is a potential future feature but not high priority.

### Queries

Roam's query system is one of its most powerful (and most complex) features:

- **Syntax**: `{{[[query]]: {and: [[tag1]] [[tag2]] {not: [[tag3]]}}}}` -- boolean logic with AND, OR, NOT.
- **Embedded results**: Queries render their results inline in the outline, updating dynamically.
- **Query targets**: Can query by page references, tags, todo status, date ranges.
- **Use cases**: "Show all tasks tagged #project-x that are not done", "Show all blocks mentioning both [[Person]] and [[Meeting]]."
- **Reality**: The syntax is notoriously difficult. Most users rely on community templates or never learn queries.

**Comparison to Outline**: Outline has tag filtering (click a hashtag to filter the view), date views panel (shows items by date), and FTS5 search. These are simpler but cover the most common query use cases.

**Lesson for Outline**: Roam's queries demonstrate that inline dynamic views are powerful but need simple syntax. Outline's existing tag filtering and date views are the right level of complexity for most users. If Outline added query-like features, they should use a visual builder (like filter dropdowns) rather than a text syntax.

### Graph View

Roam includes a visual knowledge graph:

- **What it shows**: Nodes represent pages, edges represent links between them. Can be filtered by tags, date ranges, etc.
- **Interactive**: Click nodes to navigate, drag to rearrange, zoom in/out.
- **Practical value**: Mostly aesthetic. Very few users cite the graph as essential to their workflow. It is useful for spotting "orphan" pages (no links) and densely connected clusters.
- **Performance**: Degrades significantly with large graphs (1000+ pages).

**Assessment for Outline**: Graph visualization is not worth implementing. The backlinks panel provides the practical link-discovery benefits without the visual overhead. Users who want graph views can export data and use dedicated graph tools.

### Attributes and Tables

Roam's attribute system adds structured data to blocks:

- **Syntax**: `Attribute:: Value` as a child block creates a key-value pair on the parent.
- **Attribute tables**: `{{attr-table: [[Attribute]]}}` renders a table of all blocks with that attribute across the database.
- **Use cases**: Reading logs (`Author:: Name`, `Rating:: 4/5`), project tracking (`Status:: In Progress`), CRM-like data.
- **Interoperability**: Attributes work with queries -- you can query for blocks where `Rating::` is greater than 3.

**Comparison to Outline**: Outline has flat content (rich text in each node) with no structured metadata beyond the built-in fields (date, tags, checkbox, color). Nodes don't support arbitrary key-value pairs.

**Assessment**: Attributes are powerful for database-like use cases but add significant complexity. Outline's focus is outlining and task management, not personal databases. Tools like Notion and Tana serve the "everything is a database" use case better. Outline should stay focused on doing outlining well rather than becoming a general-purpose tool. If lightweight structured data were needed, tags and dates already cover the most common cases.

### Templates

Roam's template system:

- **Native templates**: Define a template as a block tree, tag it as a template, then insert via `/template` command.
- **SmartBlocks**: Community extension that adds dynamic templates with variables, date math, API calls, and conditional logic. Extremely powerful but requires learning a custom syntax.
- **Use cases**: Daily note structure, meeting notes, project setup, weekly reviews.

**Comparison to Outline**: Outline does not have a template system. Repeated structures must be created manually.

**Assessment**: Templates are a "nice to have" for recurring structures (meeting notes, weekly reviews). For Outline, the most pragmatic approach would be simple "saved snippets" -- a list of block trees that can be inserted at the cursor. SmartBlocks-level dynamism is overkill.

### API and Extensions

| Feature | Roam Research | Outline | Notes |
|---------|--------------|---------|-------|
| JavaScript API | Yes (roam/js) | No | Roam allows custom JS in the graph |
| Community extensions | Yes (RoamJS ecosystem) | No | Active but shrinking community |
| SmartBlocks | Yes (programmable templates) | No | Power-user feature |
| Themes | Yes (roam/css) | Basic (light/dark) | Roam allows full CSS customization |
| Data API | Yes (pull/push API) | Tauri commands (internal) | Different architectures |

**Assessment**: Roam's extensibility powered a vibrant community in 2020-2022, but extension development has slowed as the community has fragmented. Outline's Tauri architecture makes a JavaScript plugin system possible in the future, but it is not a priority. The built-in feature set should be complete enough without requiring extensions.

### Pricing and Lock-in

| Aspect | Roam Research | Outline | Notes |
|--------|--------------|---------|-------|
| Pricing | $15/month or $500/5yr | Free (self-hosted) | Major Outline advantage |
| Free tier | None (31-day trial only) | N/A (free forever) | Outline advantage |
| Data location | Roam's servers | Your filesystem | Outline advantage |
| Export formats | JSON, Markdown | JSONL, OPML | Both support export |
| Export fidelity | Lossy (block refs break) | Lossless (file format IS the storage) | Outline advantage |
| Vendor dependency | Full (cloud-only) | None | Outline advantage |
| Development pace | Stalled (2023-present) | Active | Outline advantage |

**Assessment**: Roam's pricing and lock-in are its biggest weaknesses. $15/month for a note-taking tool with no free tier has driven significant churn. Data portability is poor -- block references and embeds don't survive export to Markdown. Outline's self-hosted, file-based approach is the opposite: data is always accessible, always portable, never held hostage.

---

## What Outline Does Better

1. **Task management**: Checkboxes, dates, RRULE recurrence, iCal integration. Roam has basic TODOs but no date system, no recurrence, no calendar feed.
2. **Self-hosted and offline-first**: No subscription, no cloud dependency, no vendor lock-in. Data lives on your machine.
3. **iCal integration**: Dates surface in any calendar app. Unique in the outliner and tools-for-thought space.
4. **Date views panel**: Dedicated view organizing items by date (today, upcoming, overdue). Roam has no equivalent.
5. **Performance**: Tauri + SQLite FTS5 should outperform Roam's browser-based graph database, especially at scale.
6. **Data portability**: JSONL file format is the primary storage -- no export step needed. Roam's exports are lossy.
7. **Multi-select**: Bulk operations on multiple nodes. Roam has no multi-select.
8. **Rich text editing**: TipTap WYSIWYG is more capable than Roam's basic formatting.
9. **Cost**: Free forever vs $180/year.
10. **Development momentum**: Active development vs stalled.

## What Roam Does Better

1. **Block references**: Inline transclusion of any block anywhere. Powerful for "write once, reference everywhere" workflows.
2. **Daily notes workflow**: Zero-friction journaling with automatic date pages and emergent structure through linking.
3. **Unlinked references**: Discovering connections between content that isn't explicitly linked.
4. **Queries**: Boolean query blocks embedded in the outline for dynamic filtered views.
5. **Right sidebar**: Multi-pane viewing for comparing and referencing while writing.
6. **Attribute system**: Structured key-value data on blocks for database-like use cases.
7. **Graph view**: Visual representation of the knowledge graph (though practical value is limited).
8. **Extensibility**: JavaScript API and community extensions (SmartBlocks, themes, etc.).
9. **Frictionless page creation**: Any `[[New Page]]` auto-creates, encouraging liberal linking.
10. **Community and ecosystem**: Despite decline, Roam still has a dedicated community with courses, workflows, and templates.

---

## Strategic Recommendations

### Lessons to Learn (Not Features to Copy)

Roam's trajectory is a cautionary tale about over-indexing on power features at the expense of usability and reliability. Its most enduring contributions are conceptual:

1. **Every block should be addressable**: Outline already does this with UUIDs. The lesson is to keep investing in wiki links as the primary way to leverage addressability.

2. **Backlinks are the real value of bidirectional linking**: Roam users consistently report that the backlinks panel is more valuable than block references. Outline has this. Ensure the backlinks panel is discoverable and useful.

3. **Daily capture matters**: Roam's daily notes succeed because they remove the "where should I put this?" decision. Outline's inbox serves this purpose. Consider making inbox items more prominent in the main workflow.

### Features Worth Considering

4. **Block preview on hover** (Low effort, medium impact): When hovering over a wiki link, show a tooltip preview of the linked node's content. This captures the "see content without navigating" benefit of block references without any transclusion complexity.

5. **Unlinked references** (Medium effort, low-medium impact): In the backlinks panel, add a section showing nodes that mention the current node's content text but don't have an explicit wiki link. Useful for discovering implicit connections.

### Features to NOT Adopt

6. **Block references / transclusion**: The no-mirrors decision is correct. The sync complexity alone disqualifies this for a file-based offline-first architecture. Wiki links are sufficient.

7. **Graph view**: Visual appeal with minimal practical value. Not worth the implementation effort.

8. **Query blocks**: The syntax complexity makes them inaccessible to most users. Outline's tag filtering and date views are simpler and cover the primary use cases.

9. **Attribute system / structured data**: Moves Outline toward being a database tool (Notion, Tana territory) rather than a focused outliner.

10. **Extension API**: Premature. The core feature set should be complete before investing in extensibility.

---

## Summary

Roam Research was a genuinely innovative tool that introduced important concepts -- bidirectional linking, block-level addressability, and the daily notes workflow -- to a mainstream audience. However, its trajectory illustrates the risks of complexity: block references, queries, and attributes create a powerful system that most users never fully leverage, while basic reliability, performance, and mobile support were neglected.

Outline is positioned well against Roam. It already has the features that matter most in practice (wiki links, backlinks, search) without the complexity that drove Roam users away (block references, query syntax, attribute system). Outline's decisive advantages -- task management, dates/recurrence, iCal, self-hosted, offline-first -- address real daily needs that Roam ignores entirely.

The most actionable takeaway is that Outline should continue investing in its strengths (dates, tasks, wiki links, offline-first) rather than chasing Roam's power features. The one Roam concept worth borrowing is block preview on hover for wiki links -- a lightweight way to see linked content without navigating away.
