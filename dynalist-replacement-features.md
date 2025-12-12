# Dynalist Replacement: Feature Specification

A self-hosted, maintainable outliner to replace Dynalist (now in maintenance mode).

## Core Requirements

| Requirement | Priority | Notes |
|-------------|----------|-------|
| Self-hosted/maintainable | Critical | Dynalist is abandoned; we need ownership |
| Cross-linking between nodes | Core | `[[link]]` syntax with backlinks |
| Node mirroring (transclusion) | High | Like Workflowy mirrors - edit anywhere, syncs everywhere |
| iCalendar feed output | High | Subscribe in Google Calendar for ticklers |
| Two-way calendar sync | Medium | CalDAV server (stretch goal) |

---

## Feature Set

### 1. Outliner Foundation

#### Hierarchy & Navigation
- Infinite nesting of bullet items
- Zoom in/out (hoisting) - focus on any node as the root
- Collapse/expand individual nodes
- Collapse/expand all children
- Multiple documents organized in folders
- Breadcrumb navigation when zoomed

#### Node Types
- Regular bullet items
- Checkbox items (tasks)
- Headings (H1, H2, H3)
- Numbered list items

#### Notes
- Each item can have an attached note (supplementary text)
- Toggle note visibility: hidden / first line / full

---

### 2. Content & Formatting

#### Markdown Support
- **Bold** (`**text**` or `Ctrl+B`)
- *Italic* (`*text*` or `Ctrl+I`)
- `Code` (backticks or `Ctrl+Backtick`)
- ~~Strikethrough~~ (`~~text~~`)
- [Named links](url) (`[text](url)`)
- Inline images (`![alt](url)`)
- Code blocks with syntax highlighting
- LaTeX math expressions

#### Visual Organization
- Color labels (6+ colors)
- Tags (`#tag` and `@mention`)
- Inline dates with visual styling

---

### 3. Links & References

#### Internal Links
- `[[Page Name]]` syntax to link to any node
- Autocomplete suggestions while typing
- Links update automatically when target moves

#### Backlinks
- Panel showing all items that link to current node
- Click to navigate to linking item
- Backlinks update in real-time

#### Node Mirrors (Transclusion)
- Create a "mirror" of any node that appears in multiple locations
- Editing a mirror edits the source (and all other mirrors)
- Visual indicator distinguishing mirrors from regular nodes
- Mirrors include all children of the source
- `((node reference))` syntax to create mirrors
- Delete mirror without deleting source

---

### 4. Task Management

#### Checkboxes
- Toggle checkbox on any item (`Ctrl+Shift+C`)
- Checked items can be: shown / hidden / shown at bottom
- Strikethrough styling for completed items

#### Dates & Deadlines
- Natural language date input:
  - `!today`, `!tomorrow`, `!next monday`
  - `!2025-01-15`, `!jan 15`
  - `!in 3 days`, `!next week`
- Date picker UI as alternative
- Visual date badges on items
- Overdue highlighting (red) for past dates

#### Recurring Tasks
- Repeat patterns: daily, weekly, monthly, yearly
- Custom intervals: `!every 2 weeks`, `!every 3rd friday`
- On completion, next occurrence auto-generates

#### iCalendar Integration
- **Feed endpoint**: `GET /calendar/{token}/feed.ics`
- Token is unguessable UUID, rotatable if leaked
- All dated items appear as calendar events
- Tasks with dates appear as VTODO entries
- Subscribable URL for Google Calendar, Apple Calendar, etc.
- Filter by tag: `/calendar/{token}/feed.ics?tag=work`

---

### 5. Search & Navigation

#### Full-Text Search
- Search across all documents
- Search within current document (`Ctrl+F`)
- Results appear as-you-type
- Search in item content and notes

#### Filtered Search
- By tag: `#project`
- By date: `has:date`, `before:2025-02-01`, `overdue:`
- By checkbox: `is:checked`, `is:unchecked`
- By color: `color:red`
- Combined filters: `#work has:date overdue:`

#### Quick Navigation
- File Finder (`Ctrl+O`) - jump to any document
- Item Finder (`Ctrl+Shift+O`) - jump to any item
- Bookmarks for frequently accessed locations
- Recent documents list

---

### 6. Organization

#### Documents & Folders
- Unlimited documents
- Nested folder structure
- Drag-and-drop reorganization
- Document icons/emoji

#### Inbox
- Global inbox for quick capture
- Configurable inbox location
- Add to inbox from anywhere (`Ctrl+Shift+I`)
- Process inbox items by moving to proper location

#### Tags
- Tag pane showing all tags
- Click tag to see all items with that tag
- Tag hierarchy support (`#project/subproject`)
- Tag colors

---

### 7. Keyboard-First Design

#### Navigation
| Shortcut | Action |
|----------|--------|
| `↑` / `↓` | Move between items |
| `Tab` | Indent item |
| `Shift+Tab` | Unindent item |
| `Ctrl+↑` / `Ctrl+↓` | Swap item with sibling |
| `Ctrl+]` | Zoom into item |
| `Ctrl+[` | Zoom out |
| `Ctrl+.` | Collapse/expand item |

#### Editing
| Shortcut | Action |
|----------|--------|
| `Enter` | New item below |
| `Shift+Enter` | Edit note / new line in note |
| `Ctrl+Enter` | Toggle checkbox |
| `Ctrl+Shift+Backspace` | Delete item |
| `Ctrl+Z` / `Ctrl+Y` | Undo / Redo |

#### Formatting
| Shortcut | Action |
|----------|--------|
| `Ctrl+B` | Bold |
| `Ctrl+I` | Italic |
| `Ctrl+Backtick` | Code |
| `Ctrl+Shift+H` | Cycle heading level |
| `Ctrl+Shift+L` | Cycle color label |

#### All shortcuts customizable in settings.

---

### 8. Views & Display

#### View Modes
- **Outline view** (default) - hierarchical bullets
- **Article view** - rendered as flowing document
- **Mind map view** - visual node graph (stretch goal)

#### Themes
- Light theme
- Dark theme
- Sepia theme
- Custom CSS support

#### Display Options
- Font selection (sans-serif, serif, monospace)
- Font size adjustment
- Line spacing (cozy / comfortable / compact)
- Show/hide: checked items, notes, dates, tags

---

### 9. Import & Export

#### Import
- OPML files (Dynalist, Workflowy, OmniOutliner)
- Workflowy export format
- Plain text with indentation
- Markdown files

#### Export
- OPML
- Markdown
- Plain text (configurable indent: spaces, dashes, asterisks)
- HTML
- PDF (stretch goal)

#### Backup
- Automatic local backups
- Export all data as JSON
- Backup to cloud storage (Dropbox, Google Drive, S3)

---

### 10. API & Integrations

#### Architecture: Desktop-Primary with Thin Server

The desktop app (Tauri) is the primary interface for editing. A thin server provides:
- Inbox capture (mobile/API)
- Read-only document viewing
- Calendar feed

All editing happens on desktop; server never modifies document content.

#### Thin Server Endpoints
```
# No auth (token in URL provides security)
/calendar/{token}/feed.ics          # iCalendar feed
/calendar/{token}/feed.ics?tag=work # Filtered by tag

# Basic auth on /outline/*
/outline/inbox              POST    # Append to inbox.jsonl
/outline/viewer.html        GET     # Client-side SPA viewer (JS)
/outline/data/*             GET     # Synced files (state.json, etc.)
```

Single basic auth rule on `/outline/*` simplifies server config. Calendar uses token-based URL since calendar apps don't support auth. Rotate token if leaked.

#### Static Viewer
```
Usage: /outline/viewer.html?doc={doc-uuid}&zoom={node-id}
```

The viewer fetches `/outline/data/{doc-uuid}/state.json` and renders client-side.
No server-side rendering required. Zoom/navigation handled in browser.

#### Desktop App API (localhost only)
```
Full CRUD available via localhost when desktop app is running:

GET    /api/v1/documents              # List all documents
GET    /api/v1/documents/:id          # Get document with items
POST   /api/v1/documents              # Create document
PUT    /api/v1/documents/:id          # Update document
DELETE /api/v1/documents/:id          # Delete document

GET    /api/v1/items/:id              # Get item
POST   /api/v1/documents/:id/items    # Create item
PUT    /api/v1/items/:id              # Update item
DELETE /api/v1/items/:id              # Delete item
POST   /api/v1/items/:id/move         # Move item

GET    /api/v1/search?q=              # Full-text search
```

#### Browser Extensions
- Chrome clipper
- Firefox clipper
- Capture URL, selection, or full page
- Posts to thin server's `/api/v1/inbox` endpoint

---

## Data Model

### Node Schema
```
Node {
  id: uuid (primary key)
  document_id: uuid (foreign key)
  parent_id: uuid | null
  position: integer (sort order among siblings)

  content: text
  note: text | null

  node_type: enum [bullet, checkbox, heading]
  heading_level: integer | null (1-3)

  is_checked: boolean (default false)
  color: string | null

  is_mirror: boolean (default false)
  mirror_source_id: uuid | null (if mirror, points to source node)

  date: date | null
  date_recurrence: string | null (rrule format)

  collapsed: boolean (default false)

  created_at: timestamp
  updated_at: timestamp
}
```

### Mirror Behavior
- When `is_mirror = true`, display content from `mirror_source_id`
- Edits to mirror propagate to source and all other mirrors
- Deleting a mirror removes only that reference
- Deleting source converts mirrors to regular nodes (copy content)
- Mirrors can be nested anywhere in any document

### Link Storage
```
Link {
  id: uuid
  source_node_id: uuid (the node containing the link)
  target_node_id: uuid (the node being linked to)
  created_at: timestamp
}
```

---

## Technical Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    Desktop App (Tauri)                      │
├─────────────────────────────────────────────────────────────┤
│  Frontend (Svelte/React)    Local REST API (localhost)     │
│  Full editing UI            Full CRUD + Search             │
└─────────────────────────────────────────────────────────────┘
          │                              │
          │                              ▼
          │                   ┌─────────────────────┐
          │                   │   SQLite Cache      │
          │                   │   (FTS5 search)     │
          │                   └─────────────────────┘
          │
          ▼
┌─────────────────────────────────────────────────────────────┐
│                   Local File Storage                        │
├─────────────────────────────────────────────────────────────┤
│  meta.jsonl          documents/{uuid}/state.json            │
│  inbox.jsonl         documents/{uuid}/pending.*.jsonl       │
│  global/links.jsonl  deletions.jsonl                        │
└─────────────────────────────────────────────────────────────┘
          │
          │  Dropbox / Syncthing / rsync
          ▼
┌─────────────────────────────────────────────────────────────┐
│                    Thin Server                              │
├─────────────────────────────────────────────────────────────┤
│  /calendar/{token}/*.ics     iCal feed (no auth)            │
│  /outline/*                  Basic auth:                    │
│    ├─ /inbox       POST      Append to inbox.jsonl          │
│    ├─ /viewer.html GET       Static JS viewer               │
│    └─ /data/*      GET       Serve synced files             │
└─────────────────────────────────────────────────────────────┘
          ▲
          │
┌─────────────────────────────────────────────────────────────┐
│                    Mobile / Browser                         │
├─────────────────────────────────────────────────────────────┤
│  Capture to inbox    Read-only viewing                      │
│  (POST /inbox)       (viewer.html + state.json)            │
└─────────────────────────────────────────────────────────────┘
```

**Data flow:**
- Desktop writes to local files → File sync propagates to server
- Mobile/browser captures to inbox → File sync propagates to desktop
- Desktop processes inbox, merges pending files, maintains SQLite cache

---

## Implementation Phases

### Phase 1: Core Outliner (MVP)
- [ ] Hierarchical bullet list with infinite nesting
- [ ] Zoom in/out (hoisting)
- [ ] Collapse/expand nodes
- [ ] Basic text editing with undo/redo
- [ ] Keyboard navigation
- [ ] Local SQLite storage
- [ ] Single document support

### Phase 2: Multi-Document & Links
- [ ] Multiple documents in folders
- [ ] Internal links with `[[` syntax
- [ ] Backlinks panel
- [ ] Full-text search
- [ ] File finder / item finder

### Phase 3: Mirrors (Transclusion)
- [ ] Create mirrors with `((`  syntax
- [ ] Mirror resolution and display
- [ ] Edit propagation to source
- [ ] Visual mirror indicators
- [ ] Mirror lifecycle management

### Phase 4: Tasks & Calendar
- [ ] Checkbox items
- [ ] Date parsing (natural language)
- [ ] Date picker UI
- [ ] Recurring tasks
- [ ] **iCalendar feed endpoint**
- [ ] Overdue highlighting

### Phase 5: Polish & Import
- [ ] OPML import (migrate from Dynalist)
- [ ] Markdown formatting
- [ ] Tags and tag search
- [ ] Themes (light/dark)
- [ ] Keyboard shortcut customization
- [ ] Export formats

### Phase 6: Collaboration (Future)
- [ ] Multi-user support
- [ ] Document sharing
- [ ] Real-time collaboration
- [ ] Version history

---

## References

- [Dynalist Features](https://dynalist.io/features/full)
- [Dynalist API](https://apidocs.dynalist.io/)
- [Workflowy Mirrors](https://workflowy.com/feature/mirrors/)
- [iCalendar Specification (RFC 5545)](https://datatracker.ietf.org/doc/html/rfc5545)
- [OPML Specification](http://opml.org/spec2.opml)
