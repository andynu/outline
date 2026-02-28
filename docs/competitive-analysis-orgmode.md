# Competitive Analysis: Emacs Org-mode vs Outline

*Date: 2026-02-28*

## Executive Summary

Org-mode is a 30+ year old plain-text outliner and productivity system built on Emacs. It represents the ceiling of what an outliner can become when extensibility is unlimited and the user base is technical. Its key strengths are a sophisticated TODO workflow state machine, an agenda system that aggregates tasks across files, and deep scheduling semantics (SCHEDULED vs DEADLINE). Outline is more accessible, visually polished, and GUI-driven — but several Org-mode patterns have stood the test of time and are worth adopting.

---

## 1. Core Model

### Org-mode
Everything is a **headline** (line starting with one or more `*` characters). Headlines form a tree via indentation level. Each headline can have:
- **Body text** (paragraphs below the headline)
- **Properties** (key-value pairs in a `:PROPERTIES:` drawer)
- **Tags** (`:tag1:tag2:` at the end of the headline)
- **Timestamps** (angle-bracket date/time syntax)
- **TODO keyword** (at the start of the headline)

The format is **plain text** — `.org` files are human-readable and editable in any text editor. The entire system is a layer of parsing and behavior on top of structured text. No database, no binary format, no server.

### Outline
Everything is a **node** in a JSON tree. Nodes have fixed typed fields (`content`, `note`, `date`, `is_checked`, `tags[]`, `color`, etc.). Data lives in JSONL operation logs with LWW conflict resolution. A SQLite FTS5 index provides search. The format is machine-readable and designed for programmatic access rather than manual editing.

### Assessment
Both systems use hierarchical trees as their fundamental structure. The key philosophical difference: Org-mode is **text-first** (structure is inferred from markup), while Outline is **data-first** (structure is explicit in typed fields). Org-mode's plain-text approach means zero lock-in and universal editability, but it requires a parser to understand structure. Outline's typed model is more constrained but enables richer UI and reliable programmatic operations.

Outline's JSONL format is a good middle ground — human-inspectable, version-control-friendly, and more structured than plain text.

---

## 2. TODO System

### Org-mode
Headlines can carry a **TODO keyword** that defines their workflow state. The default cycle is `TODO -> DONE`, but users can define arbitrary state sequences per file or globally:

```
#+TODO: TODO IN-PROGRESS REVIEW | DONE CANCELLED
```

The `|` separates "active" states (left) from "done" states (right). Key features:
- **Multiple sequences** per project (e.g., bugs use `REPORTED -> CONFIRMED -> FIXED | WONTFIX`, while tasks use `TODO -> DOING | DONE CANCELLED`)
- **Fast state selection** with single-key shortcuts (`C-c C-t` cycles states)
- **Logging on state change** — Org can automatically timestamp when a task entered each state, with optional notes
- **Blocking** — a parent TODO can't be marked DONE until all children are DONE
- **Statistics cookies** — `[2/5]` or `[40%]` showing child completion counts, auto-updated

### Outline
Binary checkbox: a node is either unchecked or checked (`is_checked: true/false`). Checked items get a strikethrough visual. There is no concept of intermediate workflow states, and no blocking rules between parent and child checkboxes.

### Gap Analysis
This is a meaningful gap. The binary checkbox covers simple todo lists, but real project management often needs states like "waiting", "in review", "blocked", or "delegated." Org-mode's state machine is the most imitated feature across all outliners.

However, the full state machine (with custom per-project sequences, logging, and blocking) is complex. Most Org users stick to 3-4 states.

### Recommendation
**Consider adding 1-2 additional states beyond checked/unchecked.** A pragmatic approach:
- Add a `node_status` field with values: `none`, `todo`, `in_progress`, `done`, `cancelled`
- Map existing `is_checked: true` to `done`, `is_checked: false` with checkbox enabled to `todo`
- Show a visual indicator (icon or color) for each state
- Cycle through states with a keyboard shortcut

This captures 90% of the value without the complexity of user-defined state sequences. **Do not** implement custom state sequences, per-project configurations, or state change logging — these are Emacs-specific power features with poor ROI in a GUI app.

---

## 3. Agenda Views

### Org-mode
The **agenda** is Org-mode's most celebrated feature. It aggregates TODO items, scheduled tasks, and deadlines from across all `.org` files into unified views:

- **Daily/weekly view** — shows what's on your plate today/this week. Items appear based on their SCHEDULED date, DEADLINE date, or plain timestamps. Overdue items carry forward. Deadline warnings appear N days before the due date.
- **Global TODO list** — all TODO items across all files, filterable by state, tag, or property.
- **Match view** — items matching a boolean expression of tags and properties (e.g., `+work-meeting/DONE` = work items excluding meetings that are done).
- **Search view** — full-text search across all agenda files.
- **Stuck projects** — automatically identifies projects (parent TODOs) that have no active next action.
- **Custom views** — users can define named agenda views combining multiple blocks (e.g., "Morning review" showing today's schedule, overdue items, and waiting tasks).

The agenda is **read-write**: you can change TODO states, reschedule items, set priorities, and add notes directly from the agenda view without navigating to the source file.

### Outline
- **Date Views panel** — sidebar showing items grouped by date (today, upcoming, overdue)
- **Tags panel** — sidebar showing items filtered by tag
- **Search** — modal FTS5 search
- **Backlinks panel** — nodes linking to current node
- **iCal feed** — exports dated items to external calendar apps

### Gap Analysis
Outline's Date Views panel is a simplified version of Org's daily agenda view. The key differences:
1. **Org aggregates across files; Outline's Date Views is per-document** (or cross-document via search)
2. **Org's agenda is a primary workspace; Outline's is a sidebar panel** — Org users live in the agenda, while Outline users live in the outline
3. **Org's match/filter expressions are far more powerful** — boolean tag+property queries vs. simple tag filtering
4. **Org's "stuck projects" detection has no Outline equivalent** — automatic identification of projects missing next actions

### Recommendations
1. **Cross-document date aggregation** (high value): The Date Views panel should show items from ALL documents, not just the current one. This is the single most impactful Org-mode lesson — a unified view across all your data.
2. **"Stuck projects" indicator** (medium value): Flag parent items with unchecked children but no clear "next action." This is a simple heuristic that surfaces forgotten projects.
3. **Do not build a full custom agenda DSL.** Org's agenda query language is powerful but is built for keyboard-driven Emacs users. A GUI equivalent would be saved filters or smart views.

---

## 4. Scheduling: SCHEDULED vs DEADLINE

### Org-mode
Org distinguishes two types of task dates:

- **SCHEDULED** — "I plan to start working on this on date X." A scheduled item appears on the agenda starting on that date and every day after until it's done. It's a **commitment to yourself** to begin work.
- **DEADLINE** — "This must be completed by date X." A deadline shows a warning in the agenda N days before (default 14). After the deadline passes, the item appears as overdue with increasing urgency.

These are **separate fields** on a headline. A task can have both: scheduled for Monday (start working), deadline on Friday (must be done). They can also have neither, or just one.

Additionally, Org supports **plain timestamps** (an event happening at a specific time, like a meeting) and **inactive timestamps** (recorded for reference but don't appear in agenda).

### Outline
A single `date` field per node. No semantic distinction between "start working" and "due by." Recurrence is supported via `date_recurrence` (iCal RRULE). Items appear in Date Views based on their date.

### Gap Analysis
The SCHEDULED/DEADLINE distinction is genuinely useful for task management. "When should I start thinking about this?" is a different question from "When is this due?" Currently in Outline, a date could mean either — there's no way to express both.

### Recommendation
**Consider adding a `deadline` field alongside the existing `date` field.** Semantics:
- `date` = when to work on it (equivalent to Org's SCHEDULED or a plain event date)
- `deadline` = when it must be done by

In Date Views, items with deadlines would show a warning indicator as the deadline approaches. Items past their deadline would be visually flagged. This is a small data model change (one new optional field) with meaningful workflow improvement.

Alternatively, keep a single date field but add a `date_type` enum (`event`, `scheduled`, `deadline`) to provide semantic context. This avoids a second date picker but limits items to one date.

---

## 5. Clocking (Time Tracking)

### Org-mode
Built-in time tracking at the task level:
- `C-c C-x C-i` clocks into a task (starts timer)
- `C-c C-x C-o` clocks out (stops timer)
- Clock entries are stored as timestamp ranges in a `:LOGBOOK:` drawer
- **Clock reports** (`org-clock-report`) generate tables summarizing time spent per task/project/day
- **Clock history** lets you resume a recent clock
- **Idle detection** — if Emacs detects you've been idle, it asks how to handle the idle time (subtract it, keep it, etc.)
- Clocking works from the agenda view — clock into any task without navigating to it

### Outline
No time tracking functionality.

### Assessment
Time tracking is a power feature used by a subset of Org users (consultants, freelancers, people who bill by the hour). It's deeply integrated into the outline structure, which is elegant — the same tree that organizes your tasks also tracks your time.

### Recommendation
**Not a priority.** Time tracking adds UI complexity (clock in/out controls, reports, idle handling) that benefits a niche audience. Users who need time tracking already use dedicated tools (Toggl, Clockify, Harvest) that are better at it. If ever added, it should be a minimal "start/stop timer on a node" feature, not a full reporting system.

---

## 6. Capture and Refile

### Org-mode
**Org-capture** is a quick-entry system:
- Press a global hotkey from anywhere in Emacs (or via org-protocol, from a browser)
- A pre-configured template appears (e.g., "TODO item", "Journal entry", "Meeting note")
- Fill in the template, press `C-c C-c` to save
- The item is appended to a configured location (e.g., `inbox.org`)
- Templates can include auto-populated fields: date, file being visited, clipboard contents, prompted input

**Org-refile** moves a headline to a different location:
- `C-c C-w` prompts for a target headline (with fuzzy completion across all agenda files)
- The item is cut from its current location and pasted under the target
- Supports refiling to any level of any configured file

The capture-then-refile workflow is central: items go to inbox quickly, then get organized later.

### Outline
- **Inbox** (`inbox.jsonl`): Items captured via the mobile web form or API endpoint go to inbox
- **Capture form** (`/outline/capture`): Web-based capture with title and optional body
- **No refile equivalent**: Items can be moved via drag-and-drop or cut/paste, but there's no dedicated "refile" command with fuzzy target selection

### Assessment
Outline's inbox and capture API cover the "quick entry" part well. The gap is in **refile** — Org's fuzzy-match refile across all files is a fast way to organize inbox items. In Outline, organizing captured items requires navigating to the right document and position, then dragging or moving the item.

### Recommendation
**Add a "move to" command** (keyboard shortcut on any node) that opens a search dialog for selecting a target location. The dialog would search across all documents by node content, letting you type a few characters to find the right place. This is essentially Org's refile adapted for a GUI — high value, moderate effort.

---

## 7. Properties and Column View

### Org-mode
Every headline can have arbitrary **key-value properties** stored in a `:PROPERTIES:` drawer:

```org
* My Task
  :PROPERTIES:
  :Assignee: Alice
  :Effort:   2h
  :Priority:  A
  :Status:   In Review
  :END:
```

Properties support:
- **Inheritance** — child nodes inherit parent properties unless overridden
- **Special properties** — `TODO`, `TAGS`, `PRIORITY`, `DEADLINE`, `SCHEDULED` are built-in
- **Custom properties** — any string key with any string value
- **Allowed values** — properties can have a set of permitted values for fast selection

**Column view** turns a subtree into a spreadsheet-like table where each column displays a property:

```
| ITEM           | Assignee | Effort | Status    |
|----------------|----------|--------|-----------|
| My Task        | Alice    | 2h     | In Review |
| Subtask 1      | Bob      | 1h     | Done      |
| Subtask 2      | Alice    | 30min  | TODO      |
```

This is navigable and editable inline — you can change property values directly in the table. Effort values can be summed up the tree.

### Outline
Fixed fields on every node: `content`, `note`, `date`, `date_recurrence`, `is_checked`, `color`, `tags[]`, `node_type`, `heading_level`, `mirror_source_id`. No arbitrary key-value properties. No column/table view.

### Gap Analysis
Org's property system is the plain-text equivalent of Tana's supertags — arbitrary metadata per node. Column view is the equivalent of Tana's table view. Both are powerful for structured project tracking (effort estimation, assignees, status tracking).

However, like Tana's supertags, this is a slippery slope toward building a database. Org gets away with it because properties are just text in a drawer — there's no schema, no validation, no typed fields. The simplicity of "any key, any value" avoids the complexity trap.

### Recommendation
**Same verdict as the Tana analysis: do not add arbitrary properties.** Outline's fixed field set covers the common cases. If additional metadata is needed, it's better served by:
- Child nodes (hierarchy as structure)
- Tags (for categorization)
- The note field (for free-form annotations)

Column view is interesting but requires properties to be useful. Without properties, there's nothing meaningful to show in columns beyond existing fields (date, checkbox, tags) — which are already visible in the outline.

---

## 8. Links

### Org-mode
Org has a rich link system:
- **Internal links**: `[[#custom-id]]` links to a headline with a `CUSTOM_ID` property. `[[*Headline]]` links to a headline by text. `[[target]]` links to a `<<target>>` anchor.
- **External links**: `[[https://example.com][Description]]` for URLs, `[[file:path/to/file]]` for local files, `[[mailto:user@example.com]]` for email.
- **Custom protocols**: Users can register custom link types (e.g., `[[bug:1234]]` could open a bug tracker). This is extensible via Elisp.
- **org-protocol**: A URL scheme (`org-protocol://`) that triggers Emacs actions from external apps (capture from browser, open file at line).
- **Link storage**: `C-c l` stores a link to the current location, `C-c C-l` inserts a stored link. Links can reference specific lines in files.
- **Radio targets**: A `<<<Radio Target>>>` makes every occurrence of "Radio Target" in the buffer into a clickable link. Auto-linking by keyword.

### Outline
- **Wiki links**: `[[node name]]` links to a node by its content text. Autocomplete during entry.
- **Backlinks panel**: Shows all nodes that link to the current node.
- **Mirror nodes**: A node that reflects another node's content (`mirror_source_id`).
- URLs in content are auto-linked.

### Assessment
Outline's wiki links cover the primary cross-referencing use case. Org's link system is more powerful but much of that power is Emacs-specific (file links, org-protocol, radio targets). The most relevant gap is **custom link protocols** — the ability to make `[[gh:123]]` link to a GitHub issue, for example.

Org's **radio targets** (automatic linking of keywords) is an interesting concept — similar to "unlinked references" in Roam/Logseq. Outline could detect when text matches a node name and suggest linking.

### Recommendation
**No major changes needed.** Wiki links and backlinks are solid. Two minor ideas:
- **Unlinked reference detection**: In the backlinks panel, show nodes that mention the current node's text but don't have a formal wiki link. Low-effort knowledge discovery feature.
- **URL node type**: A node type specifically for bookmarks/links with URL metadata. Minor enhancement for web clipping use cases.

---

## 9. Export

### Org-mode
Org exports to a wide range of formats via its export dispatcher (`C-c C-e`):
- **ASCII/UTF-8** — plain text
- **HTML** — full HTML with CSS theming
- **LaTeX/PDF** — publication-quality documents via LaTeX engines (pdflatex, xelatex, lualatex)
- **ODT** — OpenDocument for LibreOffice/Word
- **Markdown** — GitHub-flavored and standard
- **Beamer** — LaTeX presentation slides
- **Texinfo** — GNU documentation format
- **iCalendar** — `.ics` export of scheduled/deadline items

The export system is extensible — backends can be added or modified. Export supports per-file and per-subtree settings, table of contents generation, and selective export via tags.

### Outline
- **OPML export** — via `import-dynalist.js` tool (import, not export, currently)
- **iCal feed** — server-side calendar feed of dated items
- **Markdown export** — not currently implemented
- No PDF, HTML, or other format export

### Gap Analysis
Export is a relatively minor feature for a personal outliner — most value comes from using the tool, not exporting from it. Org's extensive export system reflects its dual role as both a productivity tool and a document authoring system (many academics write papers in Org-mode).

### Recommendation
**Low priority.** If export is needed:
1. **Markdown export** — highest value, simplest to implement. Outline's content is already close to Markdown.
2. **OPML export** — for interoperability with other outliners.
3. **Skip LaTeX/PDF/HTML** — these serve academic/publishing workflows that aren't Outline's target.

---

## 10. Babel / Literate Programming

### Org-mode
Org Babel allows executable code blocks inside `.org` files:

```org
#+BEGIN_SRC python :results output
print("Hello from Python")
#+END_SRC
```

Pressing `C-c C-c` on the block executes it and inserts results below. Key features:
- **40+ languages supported** (Python, R, shell, SQL, JavaScript, etc.)
- **Data flow between blocks** — output of one block feeds into another, even across languages
- **Tangling** — extract code blocks into source files (literate programming)
- **Noweb syntax** — reference one code block inside another
- **Session support** — persistent interpreter sessions across blocks
- **Caching** — skip re-execution if inputs haven't changed
- **Inline results** — results embedded in prose

### Outline
No code execution capability.

### Assessment
Babel is Org-mode's most unique feature and entirely Emacs-specific. It turns Org into a computational notebook (predating Jupyter). This is firmly outside Outline's scope — Outline is a task/knowledge outliner, not a programming environment.

### Recommendation
**Out of scope.** Not relevant to Outline's mission. Users who need literate programming should use Org-mode, Jupyter, or Observable.

---

## 11. Archiving

### Org-mode
Org provides multiple archiving strategies for completed/obsolete items:
- **Archive to file** (`C-c C-x C-s`): Moves the subtree to `filename.org_archive`, preserving the original outline path as a property. The archive file is excluded from agenda.
- **Archive tag** (`C-c C-x a`): Adds an `:ARCHIVE:` tag that hides the subtree from agenda and sparse trees without moving it.
- **Archive sibling** (`C-c C-x A`): Moves the subtree under a sibling headline called "Archive" within the same file.
- Archive files accumulate over time, serving as a historical record.

### Outline
- **Delete node** (`delete_node`): Permanently removes a node and its descendants.
- **Hide completed**: Visual filter to hide checked items (if implemented).
- No archive concept — deleted items are gone (unless recoverable from JSONL history).

### Gap Analysis
Archiving is the middle ground between "visible" and "deleted." Org users archive completed projects to keep their active files lean while preserving history. In Outline, the only options are "keep it visible" or "delete it."

### Recommendation
**Consider a "completed items" archive.** When a parent node with all children checked is "archived," it moves to a separate document or section that's searchable but hidden from the main view. This keeps the active outline clean without losing history. Implementation could be:
- An `archived` boolean field on nodes
- Archived nodes hidden from default view but included in search results
- An "Archive" section in the sidebar to browse archived items

---

## 12. Effort Estimates

### Org-mode
The `Effort` property stores estimated time for a task:
- Values in flexible formats: `2h`, `30min`, `1d3h`, `1:30`
- **Effort summation** — column view can sum effort estimates up the tree, showing total project effort
- **Agenda filtering by effort** — "show only tasks I can complete in under 30 minutes"
- Tasks can be sorted by effort in agenda views (shortest first for quick wins)
- Effort vs. clock time comparison for estimation accuracy tracking

### Outline
No effort estimation feature.

### Assessment
Effort estimates are a niche feature even among Org users. The most useful aspect is the "quick wins" filter — showing short tasks when you have limited time. This is a planning tool, not a core outliner feature.

### Recommendation
**Not a priority.** If ever implemented, a simple `estimated_minutes` field on nodes would suffice, with the ability to filter Date Views by effort. But this is low on the ROI curve.

---

## 13. Habits

### Org-mode
`org-habit` is a module for tracking recurring habits:
- A habit is a TODO item with a `.+` (minimum interval) repeater and a `STYLE: habit` property
- The agenda shows a **consistency graph** — a row of colored bars showing completion history (green = done on time, yellow = late, red = missed)
- Habits appear in the agenda on their scheduled date and persist until completed
- After completion, they automatically reschedule to the next occurrence

### Outline
- Recurrence via `date_recurrence` (iCal RRULE format)
- No visual history or consistency tracking
- No habit-specific behavior

### Gap Analysis
Org-habit's consistency graph is its killer feature — visual feedback on whether you're maintaining a habit. Outline has recurrence mechanics but no history or visual tracking of completion patterns.

### Recommendation
**Interesting but not urgent.** A habit tracking feature would require storing completion history (currently, checking a recurring item just advances to the next date — previous completions aren't recorded). If habits become a priority:
- Store a `completions[]` array of dates when the item was checked
- Show a small streak/consistency indicator in the UI
- This would be a meaningful differentiator from most outliners

---

## 14. What Outline Does Better

| Area | Outline Advantage |
|------|-------------------|
| **Accessibility** | GUI with visual affordances. Org requires learning Emacs + Org keybindings (months-long learning curve). |
| **Rich text** | TipTap-based inline formatting (bold, italic, code). Org has markup but no WYSIWYG. |
| **Drag and drop** | Visual reordering of items by dragging. Org uses `M-up/M-down` or `org-refile`. |
| **Visual date picker** | Calendar widget for selecting dates. Org uses a minibuffer date prompt with keyboard shortcuts. |
| **Recurrence UI** | Dedicated recurrence picker with visual RRULE builder. Org requires typing RRULE-like syntax (`.+1w`, `++2d`). |
| **Color coding** | Node color property for visual organization. Org uses tags and priorities but no color. |
| **Cross-platform** | Tauri desktop app runs on macOS, Windows, Linux with native feel. Org requires Emacs. |
| **Mobile capture** | Web-based capture form works on any phone. Org mobile options (Orgzly, Beorg) are third-party and limited. |
| **Sync simplicity** | Drop-in file sync (Dropbox/Syncthing). Org files sync the same way, but merge conflicts in plain text are harder to resolve than Outline's LWW JSONL operations. |
| **Search** | SQLite FTS5 with relevance ranking. Org's search is regex-based without ranking. |
| **Modern UX** | Context menus, tooltips, sidebar panels, keyboard shortcuts with discoverability. Org's UI is the Emacs UI. |
| **Wiki links** | `[[node name]]` with autocomplete and backlinks panel. Org's internal links require knowing target IDs or exact headline text. |

---

## 15. Features Worth Adopting

Ranked by value-to-effort ratio:

### High Priority
1. **Cross-document date aggregation** — Date Views should show items from ALL documents, creating a unified "agenda" view. This is the single most impactful lesson from Org-mode.
2. **"Move to" / refile command** — A keyboard shortcut that opens a search-based target selector for moving a node to any location across documents. Replaces the tedious navigate-then-drag workflow.
3. **SCHEDULED vs DEADLINE distinction** — Add a `deadline` field alongside `date`. Small data model change, meaningful workflow improvement for task management.

### Medium Priority
4. **Multi-state tasks** — Expand beyond binary checkbox to support `todo`, `in_progress`, `done`, `cancelled` states. Covers 90% of Org's TODO value.
5. **Archive completed items** — Move done subtrees to an archive space, keeping the active outline clean without losing history.
6. **Stuck project detection** — Flag parent items with unchecked children but no active next steps. Simple heuristic, high signal.

### Low Priority / Watch
7. **Unlinked reference detection** — Show nodes mentioning current node text without formal wiki links. Knowledge discovery feature.
8. **Completion history for recurring items** — Store when recurring items were completed, enabling streak/consistency visualization. Foundation for habit tracking.
9. **Effort estimates** — Optional time estimate field with filtering by duration. Niche but useful for "quick wins" planning.

### Not Recommended
- Custom TODO state sequences (too complex for GUI)
- Arbitrary properties / column view (database territory — see Tana analysis)
- Babel / code execution (out of scope)
- Clock-based time tracking (dedicated tools do it better)
- Export to LaTeX/PDF/Beamer (academic use case)
- Custom link protocols (insufficient ROI)
- Agenda query DSL (Emacs-specific paradigm)

---

## 16. Key Takeaway

Org-mode's 30-year evolution reveals which outliner features have lasting value versus which are complexity traps. The features that users consistently praise — the agenda, capture/refile, SCHEDULED/DEADLINE, and the TODO state machine — are all about **making tasks actionable across multiple documents.** The features that create the steepest learning curves — custom properties, column view, Babel, clock reports — serve power users but aren't essential to the outliner experience.

Outline should adopt the **cross-document task aggregation** pattern (Org's greatest innovation) while avoiding the **configuration-as-code** pattern (Org's greatest barrier to entry). The goal is to provide Org-mode's task management clarity in a GUI that someone can learn in 5 minutes instead of 5 months.

---

## Sources

- [Org-mode Features Overview](https://orgmode.org/features.html)
- [The Org Manual](https://orgmode.org/org.html)
- [Deadlines and Scheduling (Org Manual)](https://www.gnu.org/software/emacs/manual/html_node/org/Deadlines-and-Scheduling.html)
- [Capture, Refile, Archive (Org Compact Guide)](https://orgmode.org/guide/Capture-Refile-Archive.html)
- [Properties and Columns (Org Manual)](https://orgmode.org/manual/Properties-and-Columns.html)
- [Column View (Org Manual)](https://orgmode.org/manual/Column-View.html)
- [Org Column View Tutorial](https://orgmode.org/worg/org-tutorials/org-column-view-tutorial.html)
- [Hyperlinks (Org Manual)](https://orgmode.org/manual/Hyperlinks.html)
- [External Links (Org Manual)](https://orgmode.org/manual/External-Links.html)
- [Exporting (Org Manual)](https://orgmode.org/manual/Exporting.html)
- [Introducing Babel](https://orgmode.org/worg/org-contrib/babel/intro.html)
- [Evaluating Code Blocks (Org Manual)](https://orgmode.org/manual/Evaluating-Code-Blocks.html)
- [Org-mode Scheduling and Deadlines - Jeff Bradberry](https://jeffbradberry.com/posts/2022/06/orgmode-scheduling-and-deadlines/)
- [How I Get Work Done with Emacs and Org-mode - Phil Newton](https://www.philnewton.net/blog/how-i-get-work-done-with-emacs/)
- [Org Mode: Organize Your Life in Plain Text - Bernt Hansen](https://doc.norang.ca/org-mode.html)
- [Emacs Org TODO and Agenda Basics - Protesilaos Stavrou](https://protesilaos.com/codelog/2025-01-16-emacs-org-todo-agenda-basics/)
