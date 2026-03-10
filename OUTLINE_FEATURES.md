# Outline Application - Complete Feature Reference

A comprehensive catalog of all features, keyboard shortcuts, and UI controls in the Outline application (Tauri 2 + React 19).

**Legend:** ✓ Implemented | ◐ Partial | ✗ Not Implemented

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
| Feature | Status | Notes |
|---------|--------|-------|
| Unlimited nesting depth | ✓ | |
| Create items: Enter creates sibling | ✓ | |
| Tab indents | ✓ | |
| Split items: Enter mid-text | ✓ | |
| Merge items: Backspace at start | ✓ | |
| Merge items: Delete at end | ✓ | |
| Drag & drop reordering | ✓ | |
| Multi-selection with Ctrl+Click | ✓ | |
| Multi-selection with Shift+Click | ✓ | |

### Node Types
| Type | Status | Description |
|------|--------|-------------|
| **Bullet** | ✓ | Default item type (•) |
| **Checkbox** | ✓ | Task item with completion state (☐/☑) |
| **Heading** | ✓ | Styled heading (levels 1-6) |

### Document Title Editor
| Feature | Status | Notes |
|---------|--------|-------|
| Rich TipTap editor for document title | ✓ | First root node rendered as title header |
| Emoji shortcodes in title (`:smile:`) | ✓ | Same suggestion popup as items |
| Hashtags in title (`#tag`) | ✓ | With autocomplete suggestions |
| Custom image emoji in title | ✓ | |
| Enter in title focuses first child | ✓ | Creates child if none exist |
| ArrowDown from title enters tree | ✓ | |
| ArrowUp from first item enters title | ✓ | |
| Sidebar rename focuses title editor | ✓ | For currently-loaded document |
| Sidebar title updates on edit | ✓ | Debounced 500ms refresh |

### Node Properties
| Property | Status | Notes |
|----------|--------|-------|
| Content (rich text) | ✓ | Bold, italic, links, code |
| Note (multi-line) | ✓ | Shift+Enter to edit |
| Date (due date) | ✓ | YYYY-MM-DD format |
| Recurrence | ✓ | iCalendar RRULE |
| Tags (from #hashtags) | ✓ | Extracted automatically |
| Color label | ◐ | Schema present, UI pending |
| Collapsed state | ✓ | |

### Collapse & Expand
| Feature | Status | Notes |
|---------|--------|-------|
| Toggle individual items | ✓ | |
| Collapse all items | ✓ | |
| Expand all items | ✓ | |
| Expand to specific depth (1-4) | ✓ | |
| Collapse all siblings | ✓ | |

### Zoom (Focus Mode)
| Feature | Status | Notes |
|---------|--------|-------|
| Zoom into any item | ✓ | |
| Breadcrumb navigation | ✓ | |
| Zoom out to parent/full doc | ✓ | |

### Multi-Selection
| Feature | Status | Notes |
|---------|--------|-------|
| Ctrl+Click toggle | ✓ | |
| Shift+Click range select | ✓ | |
| Ctrl+A select all visible | ✓ | |
| Bulk delete | ✓ | |
| Bulk indent/outdent | ✓ | |
| Bulk check/uncheck | ✓ | |

### Undo/Redo
| Feature | Status | Notes |
|---------|--------|-------|
| 100-item undo stack | ✓ | |
| Create/delete operations | ✓ | |
| Move operations | ✓ | |
| Update operations | ✓ | |
| Swap operations | ✓ | |
| Cleared on external sync | ✓ | |

---

## Keyboard Shortcuts

### Application

| Shortcut | Action | Status |
|----------|--------|--------|
| `Ctrl+S` | Save/Compact document | ✓ |
| `Ctrl+Z` | Undo | ✓ |
| `Ctrl+Y` / `Ctrl+Shift+Z` | Redo | ✓ |
| `Ctrl+Q` | Quit application | ✓ |
| `Ctrl+/` or `?` | Show keyboard shortcuts | ✓ |
| `Ctrl+,` | Open settings | ✓ |

### Editing

| Shortcut | Action | Status |
|----------|--------|--------|
| `Enter` | Create new sibling (or split at cursor) | ✓ |
| `Shift+Enter` | Edit/toggle note | ✓ |
| `Tab` | Indent item | ✓ |
| `Shift+Tab` | Outdent item | ✓ |
| `Ctrl+Shift+Backspace` | Delete item | ✓ |
| `Backspace` (at start) | Merge with previous | ✓ |
| `Delete` (at end) | Merge with next sibling | ✓ |

### Navigation

| Shortcut | Action | Status |
|----------|--------|--------|
| `↑` / `↓` | Move focus up/down | ✓ |
| `Shift+↑` | Move item up | ✓ |
| `Shift+↓` | Move item down | ✓ |
| `Ctrl+Home` | Jump to first item | ✓ |
| `Ctrl+End` | Jump to last item | ✓ |
| `Alt+H` | Go to parent | ✓ |
| `Alt+L` | Go to first child | ✓ |
| `Alt+K` | Go to previous sibling | ✓ |
| `Alt+J` | Go to next sibling | ✓ |
| `Ctrl+O` | Quick Navigator: documents | ✓ |
| `Ctrl+Shift+O` | Quick Navigator: items | ✓ |
| `Ctrl+Shift+M` | Quick Move: relocate item | ✓ |

### Search & View

| Shortcut | Action | Status |
|----------|--------|--------|
| `Ctrl+F` | Search in current document | ✓ |
| `Ctrl+Shift+F` | Global search all documents | ✓ |
| `Ctrl+I` | Show Inbox panel | ✓ |
| `Ctrl+Shift+H` | Toggle hide completed items | ✓ |
| `Ctrl+Shift+#` | Show Tags panel | ✓ |
| `Ctrl+Shift+T` | Show Date Views panel | ✓ |
| `Ctrl+Shift+G` | Web search selected text | ✓ |
| `Escape` | Clear selection → filter → zoom | ✓ |

### View Controls

| Shortcut | Action | Status |
|----------|--------|--------|
| `Ctrl+.` | Toggle collapse on focused item | ✓ |
| `Ctrl+Shift+.` | Collapse all | ✓ |
| `Ctrl+Shift+,` | Expand all | ✓ |
| `Ctrl+]` | Zoom into focused item | ✓ |
| `Ctrl+[` | Zoom out to parent | ✓ |
| `Ctrl+=` / `Ctrl++` | Zoom in (UI scale) | ✓ |
| `Ctrl+-` | Zoom out (UI scale) | ✓ |
| `Ctrl+0` | Reset zoom to 100% | ✓ |
| `Ctrl+Scroll` | Zoom in/out with mouse wheel | ✓ |

### Tasks & Dates

| Shortcut | Action | Status |
|----------|--------|--------|
| `Ctrl+Shift+X` | Toggle checkbox/bullet type | ✓ |
| `Ctrl+Enter` | Check/uncheck item | ✓ |
| `Ctrl+D` | Open date picker | ✓ |
| `Ctrl+Shift+D` | Clear date | ✓ |
| `Ctrl+R` | Open recurrence picker | ✓ |

### Rich Text Formatting

| Shortcut | Action | Status |
|----------|--------|--------|
| `Ctrl+B` | Bold | ✓ |
| `Ctrl+I` | Italic | ✓ |
| `**text**` | Bold (Markdown) | ✓ |
| `*text*` | Italic (Markdown) | ✓ |

### Quick Capture

| Shortcut | Action | Status |
|----------|--------|--------|
| `Ctrl+Shift+Q` | Quick Capture modal | ✓ |

---

## Context Menu Actions

Right-click on any item to access:

### Item Actions
| Action | Shortcut | Status |
|--------|----------|--------|
| Mark Complete/Incomplete | `Ctrl+Enter` | ✓ |
| Convert to Checkbox/Bullet | `Ctrl+Shift+X` | ✓ |
| Copy | `Ctrl+C` | ✓ |
| Web Search | `Ctrl+Shift+G` | ✓ |

### Collapse/Expand
| Action | Shortcut | Status |
|--------|----------|--------|
| Expand/Collapse | `Ctrl+.` | ✓ |
| Collapse All | `Ctrl+Shift+.` | ✓ |
| Collapse Siblings | - | ✓ |
| Expand to Level 1-4 | - | ✓ |

### Zoom
| Action | Shortcut | Status |
|--------|----------|--------|
| Zoom In | `Ctrl+]` | ✓ |
| Zoom Out | `Ctrl+[` | ✓ |

### Hierarchy
| Action | Shortcut | Status |
|--------|----------|--------|
| Indent | `Tab` | ✓ |
| Outdent | `Shift+Tab` | ✓ |

### Maintenance
| Action | Status |
|--------|--------|
| Delete Completed Children | ✓ |
| Export to Markdown... | ✓ |
| Set as Inbox / Clear Inbox | ✓ |

---

## Toolbar Buttons

### Left Section
| Button | Icon | Status |
|--------|------|--------|
| Toggle Sidebar | ☰ | ✓ |
| Save | 💾 | ✓ |
| Inbox | 📥 | ✓ |
| Date Views | 📅 | ✓ |
| Tags | 🏷️ | ✓ |
| Hide Completed | 👁️ | ✓ |
| Collapse All | ⊟ | ✓ |
| Expand All | ⊞ | ✓ |
| Help | ❓ | ✓ |
| Settings | ⚙️ | ✓ |

### Right Section
| Button | Icon | Status |
|--------|------|--------|
| Theme Toggle | ☀️/🌙 | ✓ |
| Search | 🔍 | ✓ |

---

## Sidebar Controls

### Document List
| Feature | Status |
|---------|--------|
| Click: Switch to document | ✓ |
| Double-click: Rename document | ✓ |
| Right-click: Context menu | ✓ |
| Drag: Move document to folder | ✓ |

### Folder Management
| Feature | Status |
|---------|--------|
| Click chevron: Expand/collapse | ✓ |
| Double-click header: Rename | ✓ |
| Right-click: Context menu | ✓ |
| Drag documents into folder | ✓ |

### Document Context Menu
| Action | Status |
|--------|--------|
| Rename (focuses title editor for current doc) | ✓ |
| Bookmark | ✓ |
| Move to Root | ✓ |
| Move to [Folder] | ✓ |

### Folder Context Menu
| Action | Status |
|--------|--------|
| Rename | ✓ |
| Delete Folder | ✓ |

### Footer Buttons
| Button | Status |
|--------|--------|
| New Folder | ✓ |
| New Document | ✓ |

---

## Modal Dialogs

### Search Modal (`Ctrl+F`)
| Feature | Status |
|---------|--------|
| Search current document or all documents | ✓ |
| Arrow keys to navigate results | ✓ |
| Enter to jump to result | ✓ |
| Escape to close | ✓ |
| Real-time search as you type | ✓ |

### Quick Navigator (`Ctrl+O` / `Ctrl+Shift+O`)
| Feature | Status |
|---------|--------|
| Documents mode (`Ctrl+O`) | ✓ |
| Items mode (`Ctrl+Shift+O`) | ✓ |
| Fuzzy search matching | ✓ |
| Keyboard navigation | ✓ |

### Quick Move (`Ctrl+Shift+M`)
| Feature | Status |
|---------|--------|
| Search for destination node | ✓ |
| Move focused or selected items | ✓ |
| Shows destination path | ✓ |

### Date Views Panel (`Ctrl+Shift+T`)
| Tab | Status |
|-----|--------|
| Today | ✓ |
| Upcoming | ✓ |
| Overdue | ✓ |
| All | ✓ |

### Tags Panel (`Ctrl+Shift+#`)
| Feature | Status |
|---------|--------|
| List all hashtags with usage counts | ✓ |
| Click tag to view matching items | ✓ |
| Click item to navigate | ✓ |
| Filter by tag | ✓ |

### Inbox Panel (`Ctrl+I`)
| Feature | Status |
|---------|--------|
| View captured items | ✓ |
| Process: Create node and Quick Move | ✓ |
| Dismiss: Remove from inbox | ✓ |
| Grouped by capture date | ✓ |

### Date Picker (`Ctrl+D`)
| Feature | Status |
|---------|--------|
| Calendar date selection | ✓ |
| Quick buttons: Today, Tomorrow, Next Week | ✓ |
| Clear button to remove date | ✓ |

### Recurrence Picker (`Ctrl+R`)
| Feature | Status |
|---------|--------|
| Patterns: None, Daily, Weekly, Monthly, Yearly | ✓ |
| Custom intervals | ✓ |
| Weekday selection for weekly | ✓ |

### Settings Modal (`Ctrl+,`)

**Appearance:**
| Setting | Status |
|---------|--------|
| Theme: Light / Dark / System | ✓ |
| Font size: 8-32px | ✓ |
| Font family selection | ✓ |

**Behavior:**
| Setting | Status |
|---------|--------|
| Auto-save interval | ✓ |
| Confirm delete on backspace | ✓ |
| Start with collapsed items | ✓ |

**Search:**
| Setting | Status |
|---------|--------|
| Search engine selection | ✓ |

**Data:**
| Setting | Status |
|---------|--------|
| Data directory path | ✓ |
| Pick custom directory | ✓ |

**Inbox:**
| Setting | Status |
|---------|--------|
| Current inbox configuration | ✓ |
| Clear inbox button | ✓ |
| Import inbox items | ✓ |

### Keyboard Shortcuts Modal (`Ctrl+/`)
| Feature | Status |
|---------|--------|
| Complete reference organized by category | ✓ |
| Escape to close | ✓ |

---

## Inline Syntax

### Wiki Links
| Feature | Status |
|---------|--------|
| `[[Node Title]]` syntax | ✓ |
| `[[uuid-of-node]]` syntax | ✓ |
| Auto-complete suggestion when typing `[[` | ✓ |
| Click to navigate to linked node | ✓ |
| Backlinks panel shows incoming links | ✓ |

### Hashtags
| Feature | Status |
|---------|--------|
| `#project` syntax | ✓ |
| Click to filter by tag | ✓ |
| Tags panel shows all tags | ✓ |
| Pattern: `#` + alphanumeric/underscore/hyphen | ✓ |

### Mentions
| Feature | Status |
|---------|--------|
| `@john` syntax | ✓ |
| Click to filter by mention | ✓ |
| Pattern: `@` + alphanumeric/underscore/hyphen | ✓ |

### Inline Dates
| Feature | Status |
|---------|--------|
| `!(2024-12-31)` syntax | ✓ |
| `!(today)` natural language | ✓ |
| Renders as clickable date badge | ✓ |
| Color-coded by status | ✓ |
| Click to edit date | ✓ |

### Emoji Shortcodes
| Feature | Status |
|---------|--------|
| `:shortcode:` → Unicode emoji conversion | ✓ |
| Suggestion popup while typing `:` | ✓ |
| Search/filter emoji by name | ✓ |
| Custom image emoji (uploaded) | ✓ |
| Custom emoji management UI | ✓ |
| Custom emoji renders inline in content | ✓ |

### Markdown Formatting
| Feature | Status |
|---------|--------|
| `**bold text**` | ✓ |
| `*italic text*` | ✓ |
| `` `code` `` | ✓ |
| `[link text](url)` | ✓ |

---

## Bookmarks

| Feature | Status |
|---------|--------|
| Bookmark any node from context menu | ✓ |
| Bookmarks section in sidebar | ✓ |
| Click bookmark to navigate to node | ✓ |
| Custom emoji label per bookmark | ✓ |
| Emoji picker for bookmark labels | ✓ |
| Remove bookmark from context menu | ✓ |

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
| Feature | Status |
|---------|--------|
| Each machine writes to `pending.{hostname}.jsonl` | ✓ |
| On load, all pending files replayed in timestamp order | ✓ |
| Conflicts resolved via Last-Write-Wins (updated_at) | ✓ |
| Compatible with Dropbox, Syncthing, etc. | ✓ |
| Auto-compaction at 1000 ops or 1MB | ✓ |

### Import/Export Formats

| Format | Import | Export | Status |
|--------|--------|--------|--------|
| OPML | ✓ | ✓ | ✓ |
| Markdown | ✓ (paste) | ✓ | ✓ |
| JSON | ✓ | ✓ | ✓ |
| iCalendar | - | ✓ | ✓ |

### Session Persistence
| Feature | Status |
|---------|--------|
| Remembers last document | ✓ |
| Remembers zoom state per document | ✓ |
| Remembers focused node | ✓ |
| Remembers scroll position | ✓ |

---

## Status Bar

### Left Section
| Feature | Status |
|---------|--------|
| Word count (total) | ✓ |
| Content words | ✓ |
| Note words | ✓ |
| Item count | ✓ |
| "(hiding completed)" indicator | ✓ |

### Right Section
| Feature | Status |
|---------|--------|
| Zoom percentage | ✓ |
| Save status: "Saving..." / "Saved" | ✓ |

---

## Quick Capture

### Activation
| Feature | Status |
|---------|--------|
| Keyboard: `Ctrl+Shift+Q` | ✓ |
| Inbox icon in toolbar | ✓ |

### Process
| Feature | Status |
|---------|--------|
| Enter text in Quick Capture modal | ✓ |
| Submit with Enter or Ctrl+Enter | ✓ |
| Item added to inbox queue | ✓ |
| Open Inbox panel to process | ✓ |
| Process: Creates node + opens Quick Move | ✓ |
| Dismiss: Removes from queue | ✓ |

### Inbox Configuration
| Feature | Status |
|---------|--------|
| Set target node via context menu "Set as Inbox" | ✓ |
| Items imported as children of inbox node | ✓ |
| Configuration persists across sessions | ✓ |

---

## Platform Notes

- **macOS**: Use `Cmd` instead of `Ctrl`
- **Tauri Desktop**: Full filesystem access, native dialogs
- **Browser Mode**: Limited to mock API (development only)

---

## Summary

**All major features are implemented.** The only partial implementation is:
- **Color labels**: Schema exists in node properties but UI for setting colors is not yet built

This is a feature-complete hierarchical outliner with:
- Rich text editing via TipTap with inline document title editor
- Emoji shortcodes and custom image emoji
- Task management with dates and recurrence
- Cross-linking with wiki links and backlinks
- Bookmarks with custom emoji labels
- Full-text search with SQLite FTS5
- Multi-machine sync via file-based replication
- Quick capture from desktop, mobile, and CLI (`otl`)
