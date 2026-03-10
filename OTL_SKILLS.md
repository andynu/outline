# OTL CLI Skills Reference

This document is designed to be handed to an LLM so it can use the `otl` command-line tool to interact with Outline data.

## Overview

`otl` is the CLI for Outline, a hierarchical outliner. It provides full CRUD access to documents, nodes, search, and capture. Data lives in `~/.outline-data/` as JSONL files.

## Key Concepts

- **Documents** contain a tree of **nodes**. Each document has a UUID and a short prefix derived from its title (e.g., "personal", "inbox").
- **Nodes** are the items in the tree. Each has an ID, content (HTML), optional note, parent_id, position, type (bullet/checkbox/heading), and optional date/recurrence fields.
- **Short IDs** use `<doc-prefix>-<4char>` format (e.g., `personal-q4jo`). Use these everywhere instead of full UUIDs.
- **The document title** is the first root node (parent_id=null, position=0). It renders as a large editable header in the app.

## Global Flags

| Flag | Description |
|------|-------------|
| `--json` | Machine-readable JSON output (add to any command) |
| `--data-dir <DIR>` | Override data directory (default: `~/.outline-data/`) |
| `--doc <DOC>` | Set active document by ID, prefix, or name |

## Browsing & Navigation

```bash
# List all documents with IDs, prefixes, and item counts
otl doc list

# Show a node and its subtree (primary navigation method)
otl doc show <short-id>

# Show an entire document tree
otl doc show <doc-prefix>

# Show with JSON output for parsing
otl doc show <short-id> --json

# Limit tree depth
otl doc show <short-id> -L 2

# Flat list (no indentation)
otl doc show <short-id> --flat
```

**Tip:** `otl doc show` is the primary way to navigate. It shows each node with its short ID, making it easy to drill into subtrees.

## Search

```bash
# Full-text search across all documents
otl search "query"

# Search within a specific document
otl search "query" --doc personal

# Limit results
otl search "query" --limit 20

# Search with operators
otl search "is:completed has:date"

# Find nodes linking to a specific node
otl backlinks <short-id>
```

## Creating Nodes

```bash
# Create a child node under a parent
otl node create <parent-id> "content text"

# Create as checkbox
otl node create <parent-id> "buy groceries" --type checkbox

# Create with a note
otl node create <parent-id> "meeting notes" --note "Discussed Q3 plans"
```

## Updating Nodes

```bash
# Update content
otl node update --content "new text" <short-id>

# Check/uncheck a checkbox
otl node update --check <short-id>

# Set a note
otl node update --note "additional details" <short-id>

# Change node type
otl node update --type checkbox <short-id>
```

## Moving & Deleting Nodes

```bash
# Move a node to a new parent at a specific position
otl node move <short-id> --parent <parent-id> --position <pos>

# Delete a node and all its descendants
otl node delete <short-id>
```

## Quick Capture

Capture creates nodes directly in a configured target location. Useful for inbox-style workflows.

```bash
# Capture to default target
otl capture "buy milk"

# Capture to a named target
otl capture "meeting prep" --to work

# Capture as checkbox
otl capture "review PR" --type checkbox

# Capture with a note
otl capture "call dentist" --note "Ask about scheduling"

# Capture multiple items at once
otl capture "item one" "item two" "item three"

# Read from stdin
echo "piped content" | otl capture --stdin

# Get the new node's short ID (for scripting)
NEW_ID=$(otl capture "buy milk")
```

### Managing Capture Targets

```bash
# List configured targets
otl target list

# Add a target pointing to a specific node
otl target add inbox --node personal-q4jo

# Add a target pointing to a document root
otl target add work --doc work

# Set the default target
otl target set-default inbox

# Remove a target
otl target remove inbox
```

## Inbox Management

```bash
# List pending inbox items
otl inbox list

# Import inbox items to their destination
otl inbox import

# Clear a specific item
otl inbox clear <item-id>
```

## Folders (Document Organization)

```bash
# List folders
otl folder list

# Create a folder
otl folder create "Projects"

# Move a document into a folder
otl folder move-doc <doc-id> "Projects"

# Delete a folder (documents move to root)
otl folder delete "Projects"
```

## Import / Export

```bash
# Export
otl export markdown <doc-prefix>
otl export opml <doc-prefix>
otl export json <doc-prefix>

# Import
otl import opml <file-path>
otl import json <file-path>
```

## Compaction

Merge pending JSONL operations into state.json (reduces file size, speeds up loading):

```bash
otl compact                  # Active document
otl compact <doc-prefix>     # Specific document
```

## Common Workflows

### Browse a document and drill into a section

```bash
otl doc list                        # Find the document
otl doc show personal               # See top-level structure
otl doc show personal-q4jo          # Drill into a specific node
```

### Add a task with a due date

```bash
# Create the task
otl node create personal-q4jo "File taxes" --type checkbox

# The due date is set via the content using !(YYYY-MM-DD) syntax:
otl node update --content "File taxes !(2026-04-15)" <new-id>
```

### Search and update a node

```bash
otl search "quarterly review"       # Find the node
otl node update --content "Q1 2026 Quarterly Review" results-abcd
```

### Capture items from a script

```bash
# Capture multiple items from a file
while IFS= read -r line; do
  otl capture "$line" --to inbox
done < items.txt
```

### Get structured data for processing

```bash
# JSON output for piping to jq
otl doc show personal --json | jq '.nodes[] | select(.is_checked == true) | .content'
```

## Node Content Format

Node content is stored as HTML. Common patterns:

- Plain text: `<p>Hello world</p>`
- Bold: `<p><strong>important</strong></p>`
- Wiki link: `<p><a data-wiki-link="true" data-node-id="uuid">Link Text</a></p>`
- Hashtag: `<p><span data-hashtag="project">#project</span></p>`
- Due date: `<p>Task !(2026-03-15)</p>`
- Emoji: Unicode characters or `<img>` tags for custom emoji

When creating/updating content via CLI, plain text is fine — the app will render it correctly.

## Tips

- Always use `--json` when writing scripts that parse output
- Short IDs are stable and preferred over UUIDs for readability
- `otl doc show` output includes short IDs on every line — use them to navigate
- Capture targets persist across sessions — set them up once
- Run `otl compact` periodically to keep file sizes manageable
