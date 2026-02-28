# Competitive Analysis: OmniFocus vs Outline

## Executive Summary

OmniFocus is the gold standard GTD (Getting Things Done) task manager, purpose-built for structured task workflows with deep support for contexts, perspectives, defer dates, and review cycles. Outline is a hierarchical outliner that doubles as a task manager, emphasizing freeform structure, cross-linking, and writing over rigid task workflows. The two tools have fundamentally different philosophies: OmniFocus is task-first with optional notes; Outline is structure-first with optional task semantics.

This analysis identifies specific OmniFocus capabilities that would strengthen Outline's task workflow without compromising its outliner identity.

---

## Core Model Comparison

| Aspect | OmniFocus | Outline |
|--------|-----------|---------|
| **Primary unit** | Action (task) | Node (bullet/checkbox/heading) |
| **Hierarchy** | Projects > Action Groups > Actions | Unlimited nested nodes |
| **Organization** | Folders, Projects, Tags, Contexts | Documents, Folders, Hashtags, Wiki Links |
| **Task types** | Sequential, Parallel, Single Actions | Checkbox nodes (flat semantics) |
| **Content model** | Title + Note (plain/rich text) | Rich text content + optional note field |
| **Cross-linking** | None (tags only) | Wiki links `[[doc]]`, backlinks panel |
| **Data format** | Proprietary SQLite database | JSONL files (human-readable, portable) |

### Analysis

OmniFocus enforces a task-centric data model: everything is a "project" or an "action." This rigidity enables powerful automation (sequential projects automatically surface the next action) but makes it poor for non-task content like notes, drafts, or reference material.

Outline's node-based model is more flexible. Any node can be a task (checkbox), a heading, or a plain bullet. This means Outline naturally handles mixed content -- meeting notes with action items, project plans with reference material, writing drafts with TODO markers. The tradeoff is that Outline lacks the task-specific intelligence OmniFocus provides.

---

## Task Management

### Defer Dates vs Outline's Single Date

**OmniFocus** distinguishes between three date types:
- **Defer date**: When an action *becomes available* (hidden until then)
- **Due date**: When an action *must be completed*
- **Planned date** (v4.7+): When you *intend to work on it*

Items with future defer dates are grayed out and hidden from active views. This prevents overwhelm by showing only actionable items.

**Outline** has a single `date` field per node, typically used as a due date. There is no concept of deferral or planned dates.

### Sequential vs Parallel Projects

**OmniFocus** projects can be:
- **Sequential**: Only the first incomplete action is "available"; completing it surfaces the next
- **Parallel**: All actions are available simultaneously
- **Single Actions**: Unordered list of independent tasks

**Outline** has no equivalent. All children of a node are visible and "available" simultaneously. There is no way to mark a subtree as sequential to auto-surface the next action.

### Flagging

**OmniFocus** has a binary flag on any action, creating a cross-cutting "Flagged" perspective that works as a quick-access priority list independent of project structure.

**Outline** has `color` on nodes but no dedicated flag/priority system. Hashtags like `#priority` could serve this purpose but lack first-class UI support.

### Review Cycles

**OmniFocus** has a dedicated Review perspective. Each project has a configurable review interval (e.g., weekly, monthly). The Review view presents projects due for review one at a time, letting you mark them reviewed, adjust actions, or change status. This is a core GTD practice.

**Outline** has no review mechanism. Documents and subtrees can go stale without any prompt to revisit them.

---

## GTD Implementation

| GTD Phase | OmniFocus | Outline |
|-----------|-----------|---------|
| **Capture** | Quick Entry (global hotkey), Mail Drop, Shortcuts | Inbox panel, server capture API, inbox.jsonl |
| **Clarify** | Inbox processing with project/tag assignment | Manual organization from inbox node |
| **Organize** | Projects, Folders, Tags, Contexts, Defer dates | Documents, Folders, Hashtags, Hierarchy |
| **Reflect** | Built-in Review perspective with schedules | No equivalent |
| **Engage** | Forecast view, Perspectives, Available filter | Date Views panel, Tag filtering |

### Analysis

Both tools handle **Capture** well. Outline's server API and inbox.jsonl system is elegant and portable.

**Clarify** is where OmniFocus excels. Its inbox forces you to process each item: assign a project, set dates, add tags, or trash it. Outline's inbox is just a node in the document -- there's no workflow enforcing processing.

**Organize** is comparable, with different strengths. OmniFocus has tags and contexts; Outline has hashtags and wiki links. Outline's wiki links are a significant advantage for building a knowledge graph alongside tasks.

**Reflect** is OmniFocus's unique strength. The Review perspective is a genuine differentiator with no Outline equivalent.

**Engage** is roughly comparable. OmniFocus's Forecast view (combining calendar events with due tasks) is more sophisticated than Outline's Date Views panel, but Outline covers the basics.

---

## Forecast/Planning View

### OmniFocus Forecast

The Forecast perspective shows a timeline combining:
- Calendar events (from system calendars)
- Tasks with due dates
- Tasks with defer dates becoming available
- Tasks with planned dates

This gives a unified "what does my day/week look like?" view mixing calendar commitments with task deadlines.

### Outline Date Views

Outline's Date Views panel offers filtered views:
- **Today**: Nodes with today's date
- **Upcoming**: Nodes dated today through ~1 week out
- **Overdue**: Nodes with past dates
- **All**: All dated nodes

This covers basic date-based task surfacing but lacks calendar integration and the timeline visualization OmniFocus provides. Outline does have an iCal feed server endpoint (`/calendar/{token}/feed.ics`) that exports dates outward, but it doesn't import external calendar events into its views.

---

## Recurring Tasks

| Feature | OmniFocus | Outline |
|---------|-----------|---------|
| **Recurrence model** | Custom (3 modes) | RRULE (iCalendar standard) |
| **Repeat on schedule** | Yes -- next date from original schedule | Yes -- via RRULE |
| **Repeat on complete** | Yes -- next date from completion date | No |
| **Repeat on complete (defer)** | Yes -- defer date advances from completion | No |
| **Supported frequencies** | Daily, Weekly, Monthly, Yearly + custom | Daily, Weekly, Monthly, Yearly + BYDAY |

### Analysis

OmniFocus offers three repeat modes:
1. **Repeat Regularly**: Fixed schedule (like RRULE). If due every Monday, the next instance is always the following Monday regardless of when completed.
2. **Defer Another / Due Again (after completion)**: Next dates calculated from when you actually complete the task. Good for "every 3 days after I last did it" patterns.
3. **Due Again (after assigned date)**: Hybrid that re-schedules from the assigned due date.

Outline uses the RRULE standard, which is powerful and interoperable (works with iCal) but only supports mode 1 (fixed schedule). The "repeat on complete" pattern -- essential for habits and maintenance tasks -- is missing.

---

## Perspectives (Saved Views)

### OmniFocus Perspectives

OmniFocus Pro allows creating saved perspectives with filters on:
- Project, Folder, or Tag membership
- Availability (available, remaining, completed)
- Due date ranges (due soon, overdue, due within X days)
- Defer date status
- Flagged status
- Custom combinations using AND/OR/NOT logic

Perspectives sync across devices and can have custom icons and colors. Built-in perspectives include Inbox, Projects, Tags, Forecast, Flagged, Review, and Completed.

### Outline Equivalent

Outline has:
- **Tag filtering**: Filter the outline by a single hashtag or mention (`#tag`, `@person`)
- **Date Views panel**: Predefined date-based filters (today, upcoming, overdue)
- **Search**: FTS5 full-text search across all documents
- **Hide completed**: Toggle to hide checked items

There is no way to create arbitrary saved filter combinations, save them as named views, or combine multiple filter criteria. Each filtering mechanism is independent and single-purpose.

---

## Automation

| Feature | OmniFocus | Outline |
|---------|-----------|---------|
| **Scripting** | Omni Automation (JavaScript), AppleScript | None (file-based access) |
| **Shortcuts** | Apple Shortcuts support | None |
| **URL scheme** | `omnifocus:///add?name=...` | None |
| **API** | Omni Automation API | Server capture API, Tauri commands |
| **File access** | Encrypted database (no direct access) | Open JSONL files (full read/write) |
| **Plugins** | Omni Automation plug-ins | None |

### Analysis

OmniFocus has a richer automation story with scripting, Shortcuts, and plug-ins. However, Outline's open file format (JSONL) is a significant automation advantage for power users. Anyone can write scripts that read/write Outline data directly, build custom integrations, or process data with standard tools. OmniFocus's encrypted database locks users into Omni's automation APIs.

---

## Sync Model

| Feature | OmniFocus | Outline |
|---------|-----------|---------|
| **Sync method** | OmniSync Server or WebDAV | Dropbox / Syncthing (file sync) |
| **Encryption** | End-to-end (passphrase-based) | Depends on sync provider |
| **Conflict resolution** | Server-side merge (opaque) | LWW (Last Write Wins) per-field |
| **Offline support** | Full offline, sync when connected | Full offline, per-machine pending files |
| **Self-hosted** | WebDAV server option | Fully self-hosted (local files) |
| **Multi-machine** | Yes, via sync server | Yes, via per-machine JSONL files |

### Analysis

Both support full offline editing with eventual sync. OmniFocus's approach is more polished (automatic, encrypted, managed server option) but less transparent. Outline's file-based sync is more hackable and inspectable -- you can see exactly what each machine contributed via `pending.{hostname}.jsonl` files. Outline's LWW conflict resolution is simple and predictable; OmniFocus's merge logic is opaque.

---

## What Outline Does Better

1. **Freeform outlining**: Unlimited hierarchy depth, drag-and-drop reordering, collapse/expand -- Outline is first and foremost an outliner. OmniFocus's hierarchy is limited to Folders > Projects > Action Groups > Actions.

2. **Wiki links and knowledge graph**: `[[wiki-links]]` with backlinks tracking creates a connected knowledge base. OmniFocus has no cross-linking between projects/actions.

3. **Mixed content**: Outline handles notes, drafts, reference material, and tasks equally well in the same document. OmniFocus forces everything into the task paradigm.

4. **Rich text editing**: TipTap-based rich text editor with formatting, links, and inline elements. OmniFocus notes are secondary to the task title.

5. **Open data format**: JSONL files are human-readable, portable, and scriptable. No vendor lock-in. OmniFocus uses an encrypted proprietary database.

6. **Zoom/focus mode**: Navigate into any subtree as if it were the root. OmniFocus has project focus but not arbitrary subtree zoom.

7. **Mirrors**: Mirror nodes that reference content elsewhere in the outline. No OmniFocus equivalent.

8. **iCal integration**: Outline serves an iCal feed of dated items, integrating with any calendar app.

9. **Self-hosted simplicity**: No server required. Files live on your filesystem, synced however you choose.

10. **Hashtags and mentions**: Inline `#tags` and `@mentions` extracted from content, with tag panel for browsing. More organic than OmniFocus's separate tag assignment.

---

## Features to Adopt: Prioritized Recommendations

### High Priority

#### 1. Defer Dates (Start Dates)
**What**: Add a second date field (`defer_date` or `start_date`) that hides items from active views until that date arrives.
**Why**: This is the single most impactful missing feature for task management. Without defer dates, every dated task is visible immediately, causing overwhelm. Users cannot distinguish "due Friday" from "start thinking about this on Wednesday."
**Effort**: Medium. Requires a new node field, UI for setting it, and filter logic in Date Views.

#### 2. Repeat on Complete
**What**: Add a recurrence mode that calculates the next date from the completion date rather than the scheduled date.
**Why**: Essential for habits, maintenance tasks, and flexible recurring work. "Water plants every 3 days" should restart the counter when you actually water them, not when they were scheduled.
**Effort**: Low-Medium. Extend the existing RRULE system with a `repeat_on_complete` boolean. When a checkbox is checked, calculate the next date from today instead of from the RRULE series.

#### 3. Review System
**What**: Add a review interval to documents or top-level nodes. Surface documents due for review in a dedicated view.
**Why**: Without review prompts, documents and project plans go stale. A review system is the key GTD practice that keeps the system trustworthy.
**Effort**: Medium. Requires a `review_interval` field on documents, a `last_reviewed` timestamp, and a Review panel similar to Date Views.

### Medium Priority

#### 4. Saved Perspectives / Custom Views
**What**: Allow users to save filter combinations (tag + date range + completion status) as named views accessible from the sidebar.
**Why**: Power users need quick access to views like "all #work items due this week" or "all unchecked items tagged #errands." Currently each filter axis is independent.
**Effort**: Medium-High. Requires a filter query language, persistence, and sidebar UI.

#### 5. Sequential Mode for Subtrees
**What**: Add a "sequential" flag to parent nodes that auto-collapses all children except the first incomplete one.
**Why**: For project checklists with dependencies, showing only the next action reduces cognitive load. This is one of OmniFocus's most praised features.
**Effort**: Medium. Requires a new node property and rendering logic to only show the first unchecked child in sequential mode.

#### 6. Flagging / Priority System
**What**: Add a first-class "flag" toggle on nodes, with a Flagged view in the sidebar.
**Why**: A cross-cutting priority mechanism that works independently of hashtags and hierarchy. Quick way to mark "do this next" across multiple projects.
**Effort**: Low. A boolean field, a star/flag icon in the UI, and a filtered view.

### Lower Priority

#### 7. Forecast View Enhancement
**What**: Import calendar events into the Date Views panel to show a combined timeline of tasks and calendar commitments.
**Why**: Seeing tasks alongside meetings helps with daily planning. Currently the iCal integration is export-only.
**Effort**: High. Requires reading ICS files or integrating with system calendars.

#### 8. Planned Date (Third Date Type)
**What**: A "when do I intend to work on this" date separate from the due date.
**Why**: OmniFocus 4.7 added this, recognizing that "when it's due" and "when I plan to do it" are different concerns.
**Effort**: Medium. Another date field, but adds UI complexity.

---

## Summary

OmniFocus excels at structured GTD task management with features like defer dates, sequential projects, review cycles, and custom perspectives. These are mature, well-designed features refined over 15+ years.

Outline's strengths -- freeform outlining, wiki links, open data, rich text, and mixed content -- make it a better tool for thinking, writing, and organizing knowledge alongside tasks. These are capabilities OmniFocus fundamentally cannot replicate due to its task-centric data model.

The highest-value adoptions from OmniFocus are **defer dates**, **repeat on complete**, and **review cycles**. These three features would dramatically improve Outline's task workflow without requiring changes to its core outliner identity. They build on existing infrastructure (dates, recurrence, panels) and address the biggest gaps between "outliner with checkboxes" and "trusted task management system."
