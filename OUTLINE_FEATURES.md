# Outline Application - Complete Feature Reference

A comprehensive catalog of all features, keyboard shortcuts, and UI controls in the Outline application (Tauri 2 + Svelte 5).

---

## Table of Contents

1. [Core Features](#core-features)
2. [Keyboard Shortcuts](#keyboard-shortcuts)
3. [Context Menu Actions](#context-menu-actions)
4. [Toolbar Buttons](#toolbar-buttons)
5. [Sidebar Controls](#sidebar-controls)
6. [Modal Dialogs](#modal-dialogs)
7. [Inline Syntax](#inline-syntax)
8. [Data & Sync](#data--sync)

---

## Core Features

### Hierarchical Outliner
- Unlimited nesting depth
- Create items: Enter creates sibling, Tab indents
- Split items: Enter mid-text splits content
- Merge items: Backspace at start, Delete at end
- Drag & drop reordering
- Multi-selection with Ctrl+Click and Shift+Click

### Node Types
| Type | Description |
|------|-------------|
| **Bullet** | Default item type (•) |
| **Checkbox** | Task item with completion state (☐/☑) |
| **Heading** | Styled heading (levels 1-6) |

### Node Properties
- **Content**: Rich text (bold, italic, links, code)
- **Note**: Multi-line text note (Shift+Enter to edit)
- **Date**: Due date (YYYY-MM-DD format)
- **Recurrence**: iCalendar RRULE for repeating tasks
- **Tags**: Extracted from #hashtags in content
- **Color**: Optional color label
- **Collapsed**: Expand/collapse state

### Collapse & Expand
- Toggle individual items
- Collapse/expand all items
- Expand to specific depth level (1-4)
- Collapse all siblings

### Zoom (Focus Mode)
- Zoom into any item to show only its subtree
- Breadcrumb navigation while zoomed
- Zoom out to parent or full document

### Multi-Selection
- Ctrl+Click: Toggle individual selection
- Shift+Click: Range select
- Ctrl+A: Select all visible items
- Bulk operations on selection (delete, indent, check)

### Undo/Redo
- 100-item undo stack per session
- Supports: create, delete, move, update, swap
- Cleared on external sync/reload

---

## Keyboard Shortcuts

### Application

| Shortcut | Action |
|----------|--------|
| `Ctrl+S` | Save/Compact document |
| `Ctrl+Z` | Undo |
| `Ctrl+Y` / `Ctrl+Shift+Z` | Redo |
| `Ctrl+Q` | Quit application |
| `Ctrl+/` or `?` | Show keyboard shortcuts |
| `Ctrl+,` | Open settings |

### Editing

| Shortcut | Action |
|----------|--------|
| `Enter` | Create new sibling (or split at cursor) |
| `Shift+Enter` | Edit/toggle note |
| `Tab` | Indent item |
| `Shift+Tab` | Outdent item |
| `Ctrl+Shift+Backspace` | Delete item |
| `Backspace` (at start) | Merge with previous |
| `Delete` (at end) | Merge with next sibling |

### Navigation

| Shortcut | Action |
|----------|--------|
| `↑` / `↓` | Move focus up/down |
| `Shift+↑` | Move item up |
| `Shift+↓` | Move item down |
| `Ctrl+Home` | Jump to first item |
| `Ctrl+End` | Jump to last item |
| `Alt+H` | Go to parent |
| `Alt+L` | Go to first child |
| `Alt+K` | Go to previous sibling |
| `Alt+J` | Go to next sibling |
| `Ctrl+O` | Quick Navigator: documents |
| `Ctrl+Shift+O` | Quick Navigator: items |
| `Ctrl+Shift+M` | Quick Move: relocate item |

### Search & View

| Shortcut | Action |
|----------|--------|
| `Ctrl+F` | Search in current document |
| `Ctrl+Shift+F` | Global search all documents |
| `Ctrl+I` | Show Inbox panel |
| `Ctrl+Shift+H` | Toggle hide completed items |
| `Ctrl+Shift+#` | Show Tags panel |
| `Ctrl+Shift+T` | Show Date Views panel |
| `Ctrl+Shift+G` | Web search selected text |
| `Escape` | Clear selection → filter → zoom (priority) |

### View Controls

| Shortcut | Action |
|----------|--------|
| `Ctrl+.` | Toggle collapse on focused item |
| `Ctrl+Shift+.` | Collapse all |
| `Ctrl+Shift+,` | Expand all |
| `Ctrl+]` | Zoom into focused item |
| `Ctrl+[` | Zoom out to parent |
| `Ctrl+=` / `Ctrl++` | Zoom in (UI scale) |
| `Ctrl+-` | Zoom out (UI scale) |
| `Ctrl+0` | Reset zoom to 100% |
| `Ctrl+Scroll` | Zoom in/out with mouse wheel |

### Tasks & Dates

| Shortcut | Action |
|----------|--------|
| `Ctrl+Shift+X` | Toggle checkbox/bullet type |
| `Ctrl+Enter` | Check/uncheck item |
| `Ctrl+D` | Open date picker |
| `Ctrl+Shift+D` | Clear date |
| `Ctrl+R` | Open recurrence picker |

### Rich Text Formatting

| Shortcut | Action |
|----------|--------|
| `Ctrl+B` | Bold |
| `Ctrl+I` | Italic |
| `**text**` | Bold (Markdown) |
| `*text*` | Italic (Markdown) |

---

## Context Menu Actions

Right-click on any item to access:

### Item Actions
| Action | Shortcut | Description |
|--------|----------|-------------|
| Mark Complete/Incomplete | `Ctrl+Enter` | Toggle checkbox state |
| Convert to Checkbox/Bullet | `Ctrl+Shift+X` | Toggle item type |
| Copy | `Ctrl+C` | Copy to clipboard |
| Web Search | `Ctrl+Shift+G` | Search item content online |

### Collapse/Expand
| Action | Shortcut | Description |
|--------|----------|-------------|
| Expand/Collapse | `Ctrl+.` | Toggle focused item |
| Collapse All | `Ctrl+Shift+.` | Collapse entire document |
| Collapse Siblings | - | Collapse siblings of focused |
| Expand to Level 1-4 | - | Expand to specific depth |

### Zoom
| Action | Shortcut | Description |
|--------|----------|-------------|
| Zoom In | `Ctrl+]` | Focus on item's subtree |
| Zoom Out | `Ctrl+[` | Zoom to parent level |

### Hierarchy
| Action | Shortcut | Description |
|--------|----------|-------------|
| Indent | `Tab` | Make child of previous sibling |
| Outdent | `Shift+Tab` | Move to parent's level |

### Maintenance
| Action | Description |
|--------|-------------|
| Delete Completed Children | Remove all checked children |
| Export to Markdown... | Export item + children to .md file |
| Set as Inbox / Clear Inbox | Configure quick capture target |

---

## Toolbar Buttons

### Left Section
| Button | Icon | Action |
|--------|------|--------|
| Toggle Sidebar | ☰ | Show/hide document sidebar |
| Save | 💾 | Compact and save document |
| Inbox | 📥 | Open inbox panel (shows count badge) |
| Date Views | 📅 | Open date views (Today/Upcoming/Overdue) |
| Tags | 🏷️ | Open tags panel |
| Hide Completed | 👁️ | Toggle completed item visibility |
| Collapse All | ⊟ | Collapse all items |
| Expand All | ⊞ | Expand all items |
| Help | ❓ | Show keyboard shortcuts |
| Settings | ⚙️ | Open settings modal |

### Right Section
| Button | Icon | Action |
|--------|------|--------|
| Theme Toggle | ☀️/🌙 | Switch light/dark mode |
| Search | 🔍 | Open search modal |

---

## Sidebar Controls

### Document List
- Click: Switch to document
- Double-click: Rename document
- Right-click: Context menu (rename, move, delete)
- Drag: Move document to folder

### Folder Management
- Click chevron: Expand/collapse folder
- Double-click header: Rename folder
- Right-click: Context menu
- Drag documents into folder

### Document Context Menu
| Action | Description |
|--------|-------------|
| Rename | Edit document title |
| Move to Root | Move out of folder |
| Move to [Folder] | Move into specific folder |

### Folder Context Menu
| Action | Description |
|--------|-------------|
| Rename | Edit folder name |
| Delete Folder | Remove folder (moves docs to root) |

### Footer Buttons
| Button | Description |
|--------|-------------|
| New Folder | Create new folder |
| New Document | Create new document |

---

## Modal Dialogs

### Search Modal (`Ctrl+F`)
- Search current document or all documents
- Arrow keys to navigate results
- Enter to jump to result
- Escape to close
- Real-time search as you type

### Quick Navigator (`Ctrl+O` / `Ctrl+Shift+O`)
- **Documents mode** (`Ctrl+O`): Switch between documents
- **Items mode** (`Ctrl+Shift+O`): Jump to any item
- Fuzzy search matching
- Keyboard navigation

### Quick Move (`Ctrl+Shift+M`)
- Search for destination node
- Move focused or selected items
- Shows destination path

### Date Views Panel (`Ctrl+Shift+T`)
| Tab | Description |
|-----|-------------|
| Today | Items due today |
| Upcoming | Items due soon (7 days) |
| Overdue | Past-due items |
| All | All dated items |

### Tags Panel (`Ctrl+Shift+#`)
- List all hashtags with usage counts
- Click tag to view matching items
- Click item to navigate
- Filter by tag

### Inbox Panel (`Ctrl+I`)
- View captured items
- Process: Create node and Quick Move
- Dismiss: Remove from inbox
- Grouped by capture date

### Date Picker (`Ctrl+D`)
- Calendar date selection
- Quick buttons: Today, Tomorrow, Next Week
- Clear button to remove date

### Recurrence Picker (`Ctrl+R`)
- Patterns: None, Daily, Weekly, Monthly, Yearly
- Custom intervals
- Weekday selection for weekly

### Settings Modal (`Ctrl+,`)
**Appearance:**
- Theme: Light / Dark / System
- Font size: 8-32px
- Font family selection

**Behavior:**
- Auto-save interval
- Confirm delete on backspace
- Start with collapsed items

**Search:**
- Search engine (DuckDuckGo, Google, custom)

**Data:**
- Data directory path
- Pick custom directory

**Inbox:**
- Current inbox configuration
- Clear inbox button
- Import inbox items

### Keyboard Shortcuts Modal (`Ctrl+/`)
- Complete reference organized by category
- Escape to close

---

## Inline Syntax

### Wiki Links
```
[[Node Title]]
[[uuid-of-node]]
```
- Auto-complete suggestion when typing `[[`
- Click to navigate to linked node
- Backlinks panel shows incoming links

### Hashtags
```
#project
#urgent
#2024
```
- Click to filter by tag
- Tags panel shows all tags
- Pattern: `#` + alphanumeric/underscore/hyphen

### Mentions
```
@john
@team
```
- Click to filter by mention
- Pattern: `@` + alphanumeric/underscore/hyphen

### Inline Dates
```
!(2024-12-31)
!(today)
```
- Renders as clickable date badge
- Color-coded by status
- Click to edit date

### Markdown Formatting
```
**bold text**
*italic text*
`code`
[link text](url)
```

---

## Data & Sync

### Storage Structure
```
~/.outline-data/
├── documents/
│   └── {uuid}/
│       ├── state.json          # Merged document state
│       ├── pending.{host}.jsonl # Per-machine operations
│       └── ...
├── inbox.jsonl                  # Quick capture queue
├── config.json                  # App settings
├── folders.jsonl                # Folder metadata
└── .cache/
    └── outline.db              # SQLite FTS5 index
```

### Multi-Machine Sync
- Each machine writes to `pending.{hostname}.jsonl`
- On load, all pending files replayed in timestamp order
- Conflicts resolved via Last-Write-Wins (updated_at)
- Compatible with Dropbox, Syncthing, etc.
- Auto-compaction at 1000 ops or 1MB

### Import/Export Formats

| Format | Import | Export | Description |
|--------|--------|--------|-------------|
| OPML | ✓ | ✓ | Outline Processor Markup Language |
| Markdown | ✓ (paste) | ✓ | Full hierarchy with indentation |
| JSON | ✓ | ✓ | Complete backup format |
| iCalendar | - | ✓ | Calendar feed of dated items |

### Session Persistence
- Remembers last document
- Remembers zoom state per document
- Remembers focused node
- Remembers scroll position

---

## Status Bar

### Left Section
- Word count (total)
- Content words
- Note words
- Item count
- "(hiding completed)" indicator

### Right Section
- Zoom percentage
- Save status: "Saving..." / "Saved"

---

## Quick Capture

### Activation
- Keyboard: `Ctrl+Shift+Q` (when configured)
- Inbox icon in toolbar

### Process
1. Enter text in Quick Capture modal
2. Submit with Enter or Ctrl+Enter
3. Item added to inbox queue
4. Open Inbox panel to process
5. Process: Creates node + opens Quick Move
6. Dismiss: Removes from queue

### Inbox Configuration
- Set target node via context menu "Set as Inbox"
- Items imported as children of inbox node
- Configuration persists across sessions

---

## Platform Notes

- **macOS**: Use `Cmd` instead of `Ctrl`
- **Tauri Desktop**: Full filesystem access, native dialogs
- **Browser Mode**: Limited to mock API (development only)
