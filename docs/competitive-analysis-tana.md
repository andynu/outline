# Competitive Analysis: Tana vs Outline

*Date: 2026-02-28*

## Executive Summary

Tana is a cloud-based outliner that layers a structured database model ("supertags") on top of a node/bullet hierarchy. Its key innovation is treating any outline node as a potential database row with typed fields, then offering multiple views (table, kanban, calendar) over the same data. Outline is simpler, faster, offline-first, and self-hosted — but there are specific Tana ideas worth adopting.

---

## 1. Core Model

### Tana
Everything is a **node**. Nodes live in a hierarchical outline, but any node can be "typed" with a **supertag** (e.g., `#Task`, `#Meeting`, `#Person`). Applying a supertag adds structured **fields** to the node — it becomes both an outline bullet and a database row simultaneously. Nodes can appear in multiple places via references.

### Outline
Everything is a **node** with fixed fields: `content`, `note`, `node_type` (bullet/checkbox/heading), `date`, `date_recurrence`, `tags[]`, `color`, `is_checked`, `collapsed`, `mirror_source_id`. The schema is uniform — all nodes have the same shape. Structure comes from hierarchy and content rather than typed metadata.

### Assessment
Outline's uniform node model is simpler and more predictable. Tana's model is more powerful for structured workflows but adds significant complexity. The question is whether Outline can get 80% of the benefit with 20% of the complexity.

---

## 2. Supertags and Structured Node Types

### How Tana Supertags Work
- A supertag is a tag that carries a **field definition**: applying `#Meeting` to a node automatically adds fields like `Date`, `Attendees`, `Action Items`.
- Supertags define both the fields and their types (text, date, URL, reference, options).
- Multiple supertags can be applied to one node (a node can be both a `#Task` and a `#Bug`).
- Supertags can inherit from other supertags (like class inheritance).

### What Outline Has Today
- `tags[]` array — flat string tags extracted from `#hashtags` in content. No field definitions, no structure.
- Fixed fields on every node (`date`, `is_checked`, `color`, etc.) cover the most common metadata needs.
- Wiki links (`[[node-name]]`) provide cross-referencing.

### Gap Analysis
Outline's tags are labels, not types. Adding `#meeting` to a node doesn't change its structure or add fields. The fixed field set (date, checkbox, recurrence, color) covers the 80% case for task management and planning, but can't represent arbitrary structured data like "Attendees" or "Priority: P1".

### Recommendation
**Do not adopt full supertags.** The complexity of user-defined schemas, field types, and inheritance would transform Outline from a simple outliner into a database tool. Instead, consider:
- **Tag-specific views**: When filtering by a tag, show relevant aggregations (e.g., filter by `#project` shows a date summary of tagged items and their children).
- **Convention over configuration**: Continue using hierarchy for structure (children of a `#meeting` node ARE the attendees and action items) rather than adding typed fields.

---

## 3. Fields and Properties

### Tana
Field types include: plain text, number, date, URL, email, checkbox, options (single/multi-select), reference (link to another node), and computed fields. Fields are defined once and reused across all nodes with that supertag.

### Outline
Fixed properties: `content` (rich text), `note` (secondary text), `date`, `date_recurrence`, `is_checked`, `color`, `tags[]`, `node_type`, `heading_level`, `mirror_source_id`. All stored in the Node struct, all optional.

### Assessment
Outline's fixed fields are sufficient for task/project management. The fields Tana users most commonly configure (date, status/checkbox, priority via color, recurrence) already exist in Outline. The gap is in **domain-specific metadata** (e.g., "URL", "Assignee", "Budget") — but this is better handled by child nodes and conventions than by a field system.

### Recommendation
**No change needed for fields.** If anything, consider adding one or two more fixed fields in the future (e.g., `url` for link bookmarking, `assignee` for team use), but avoid a generic field system.

---

## 4. Views

### Tana
Six view types over the same data:
1. **Outline** — default hierarchical view
2. **Table** — spreadsheet-like grid showing fields as columns
3. **Cards/Kanban** — cards grouped by a field (e.g., status)
4. **List** — flat list without hierarchy
5. **Calendar** — nodes plotted by date field
6. **Tabs/Side menu** — organizational containers

Views can be applied to any node's children, including search results.

### Outline
- **Outline view** — the primary (and only) editing view
- **Date Views panel** — a sidebar panel showing items grouped by date
- **Tags panel** — sidebar showing items filtered by tag
- **Search** — modal search with FTS5
- **Backlinks panel** — shows nodes linking to current node

### Gap Analysis
This is where Tana has the biggest advantage. The ability to view the same data as a table, kanban board, or calendar without changing the underlying structure is genuinely powerful. Outline's Date Views panel is a step in this direction but is limited to date-based grouping in a sidebar.

### Recommendations (prioritized)
1. **Calendar view** (high value): A proper monthly/weekly calendar view of date-tagged items. Outline already has dates and recurrence — a calendar view is a natural extension. This also complements the existing iCal feed.
2. **Table view for tagged items** (medium value): When viewing items with a specific tag, offer a table layout showing common fields (date, checkbox status, color) as columns. Doesn't require supertags — just expose existing fields in a grid.
3. **Skip kanban**: Kanban requires a "status" field concept that Outline doesn't have. The checkbox (done/not-done) is too binary for meaningful kanban. Not worth the complexity.

---

## 5. Live Search Nodes

### Tana
A **search node** is a node whose children are live query results. You embed it anywhere in your outline and it dynamically shows matching nodes. Queries support AND/OR/NOT operators, field comparisons, and system fields. Results are capped at 2500 nodes. Searches only run when expanded (not in background). Results are references — editing them edits the original.

### Outline
- FTS5 search in a modal dialog
- Tag filtering (sidebar panel)
- Date filtering (sidebar panel)
- Backlinks panel
- No inline/embedded search results

### Gap Analysis
Live search nodes are Tana's most innovative feature for knowledge management. Being able to embed "all nodes tagged #bug that have a date this week" directly in your outline is powerful for dashboards and reviews. Outline has no equivalent — search is always a separate modal.

### Recommendation
**Consider a "saved search" or "smart node" concept.** A node that displays search results inline (similar to `mirror_source_id` but for a query rather than a single node). This would be high-complexity but high-value. A simpler first step: **saved searches** accessible from the sidebar, below the existing Tags and Date Views panels.

---

## 6. AI Integration

### Tana
- Built-in access to OpenAI, Claude, and Gemini models
- **AI Command Nodes**: nodes that run AI prompts and stream results into the outline
- AI-powered field extraction from content
- Meeting transcription agent
- Voice memo transcription (iOS)
- MCP server for external AI tool integration
- Custom AI "agents" with specific prompts

### Outline
- No AI integration

### Assessment
Tana's AI is deeply integrated but creates vendor lock-in and recurring costs. It's impressive for users who want AI built into their workflow, but it also means Tana is dependent on third-party AI APIs and pricing.

### Recommendation
**Not a priority for Outline.** AI integration adds complexity, cost, and external dependencies. Outline's value proposition is simplicity and self-hosting. If AI is added later, it should be optional and user-configured (bring your own API key), not core to the product. The MCP server approach (exposing Outline data to external AI tools) would be more aligned with Outline's philosophy than embedding AI directly.

---

## 7. Command Node / Automation

### Tana
Command nodes are automation triggers embedded in the outline. They can run AI prompts, transform data, or trigger workflows. Combined with supertags, they enable things like "whenever a node gets tagged #Task, automatically add a due date field and assign it."

### Outline
- No automation system
- Operations are purely user-driven

### Recommendation
**Not needed.** Outline's simplicity is a feature. Automation requires the supertag/field system to be useful — without typed fields, there's nothing meaningful to automate. If automation is ever desired, a simple "on-save hook" system for external scripts would be more appropriate than inline command nodes.

---

## 8. Daily Notes

### Tana
A dedicated "day page" for each date. Navigating to today's date opens a workspace for daily notes, journal entries, and task lists. Calendar nodes connect dates to content. Habit tracking templates integrate directly.

### Outline
- Items can have dates assigned
- Date Views panel shows items by date
- iCal feed exports dated items
- No dedicated "daily note" page concept

### Gap Analysis
Daily notes are a lightweight feature with high engagement value. Many users want a "what am I doing today" view. Outline's Date Views panel partially serves this need but requires manual navigation.

### Recommendation
**Consider a "Today" view.** A dedicated view (accessible via keyboard shortcut) that shows: (1) items due today, (2) items with today's date, (3) recently modified items, (4) inbox items. This doesn't require new data structures — just a new view over existing date-tagged items. Could be implemented as a panel or a special zoom mode.

---

## 9. References

### Tana
- **@-references**: Inline references to other nodes. The referenced node appears as a live embed.
- **Field references**: Nodes referenced via typed fields (e.g., "Attendees: @Alice, @Bob").
- A node's "reference section" shows everywhere it's referenced, including which field it appears in.
- Nodes can exist in multiple places simultaneously (similar to transclusion).

### Outline
- **Wiki links** (`[[node name]]`): Create links between nodes. Clicking navigates to the target.
- **Backlinks panel**: Shows all nodes that link to the current node.
- **Mirror nodes** (`mirror_source_id`): A node that mirrors another node's content.

### Assessment
Outline's wiki links + backlinks cover the core cross-referencing need. Tana's @-references are richer (they embed content inline) but Outline's mirrors provide similar functionality for the transclusion case. The main gap is that Outline's backlinks are in a separate panel rather than shown inline.

### Recommendation
**No major changes.** Wiki links and backlinks are sufficient. A minor improvement would be showing a backlink count badge on nodes that have backlinks, making the graph structure more visible without requiring a panel.

---

## 10. Data Model Implications

### Could Outline support supertag-like functionality?

The JSONL operation format is extensible — adding new fields to the Node struct and corresponding operations is straightforward (as demonstrated by the addition of `mirror_source_id`, `color`, `tags[]`, etc.).

A minimal supertag implementation would require:
1. A `tag_definitions` store mapping tag names to field schemas
2. A `custom_fields: HashMap<String, Value>` on each Node
3. UI for defining tag fields and displaying them
4. View system for rendering nodes in table/calendar/kanban layouts

This would be a **major architectural change** — essentially building a schema-on-read database. The JSONL format could handle it (custom_fields would serialize fine), but the UI complexity would be enormous.

### Verdict
**Not recommended.** The ROI is poor. Outline's strength is that it's a fast, simple outliner. Adding a database layer would put it in direct competition with Notion, Tana, and Anytype — tools with much larger teams. Better to stay focused and adopt specific high-value features (calendar view, today view, saved searches) without the underlying schema system.

---

## 11. What Outline Does Better

| Area | Outline Advantage |
|------|-------------------|
| **Offline-first** | True offline with file-based sync. Tana requires online for shared workspaces. |
| **Self-hosted** | Full data ownership with local files. Tana is cloud-only (Google Cloud). |
| **Data format** | Human-readable JSONL. Tana exports are "technical dumps." |
| **Speed** | Native Tauri app with SQLite. No cloud latency. |
| **Simplicity** | One data model, one view. Easy to learn, hard to misconfigure. |
| **Recurrence** | Full iCal RRULE support with calendar feed. Tana has basic date fields. |
| **Cost** | Free, self-hosted. Tana is $10-18/month for full features. |
| **Privacy** | Data never leaves your machine. No third-party cloud. |
| **Multi-machine sync** | Works with any file sync tool (Dropbox, Syncthing). |

---

## 12. Features Worth Adopting

Ranked by value-to-effort ratio:

### High Priority
1. **Today/daily view** — A keyboard-shortcut-accessible view showing today's items, due items, and inbox. Low effort, high engagement value.
2. **Calendar view** — Monthly/weekly view of date-tagged items. Medium effort, high value given existing date infrastructure.

### Medium Priority
3. **Backlink count badges** — Show a small count on nodes that have backlinks. Tiny effort, makes the knowledge graph visible.
4. **Saved searches** — Persist search queries in the sidebar for quick access. Low-medium effort.

### Low Priority / Watch
5. **Table view for tag filters** — When filtering by tag, show items in a table grid. Medium effort, niche value.
6. **MCP server** — Expose Outline data via Model Context Protocol for external AI tools. Aligns with self-hosted philosophy. Medium effort.

### Not Recommended
- Full supertags / user-defined fields
- Built-in AI
- Command nodes / automation
- Kanban view
- Supertag inheritance

---

## Sources

- [Tana Supertags Documentation](https://tana.inc/docs/supertags)
- [Intro to Nodes, Fields, and Supertags](https://tana.inc/articles/intro-to-nodes-fields-and-supertags)
- [Tana Fields Documentation](https://tana.inc/docs/fields)
- [Tana Views Documentation](https://tana.inc/docs/views)
- [Tana Search Nodes](https://tana.inc/docs/search-nodes)
- [Tana AI Documentation](https://tana.inc/docs/tana-ai)
- [AI Command Nodes Guide](https://tana.inc/docs/ai-command-nodes)
- [Tana Daily Notes](https://tana.inc/docs/daily-notes)
- [Tana Pricing](https://tana.inc/pricing)
- [What's New in Tana 2025](https://tana.inc/articles/whats-new-in-tana-2025-product-updates)
- [Tana Dates and Calendar Nodes](https://tana.inc/docs/dates-and-calendar-nodes)
- [Tana Nodes and References](https://tana.inc/docs/nodes-and-references)
- [XDA Developers: Tana Supertags Review](https://www.xda-developers.com/tana-supertags-review/)
