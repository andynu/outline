# Outline CLI

Command-line interface for managing Outline documents, nodes, and search.

## Building

```bash
cd app/src-tauri
cargo build -p outline-cli
```

The binary is at `app/src-tauri/target/debug/otl`. For a release build:

```bash
cargo build -p outline-cli --release
# -> app/src-tauri/target/release/otl
```

To install it on your PATH:

```bash
cargo install --path crates/outline-cli
```

## Data directory

By default the CLI reads from `~/.outline-data/`. Override with `--data-dir`:

```bash
otl --data-dir /path/to/data doc list
```

## Global options

These can be passed to any command:

| Flag | Description |
|---|---|
| `--json` | Output JSON instead of human-readable text |
| `--data-dir <DIR>` | Override data directory |
| `--doc <DOC>` | Set active document (ID, short prefix, or name) |

## Commands

### Documents

```bash
otl doc list                    # List all documents
otl doc show <ID>               # Show document tree
otl doc show <ID> --flat        # Flat list (no indentation)
otl doc show <ID> -L 2          # Limit tree depth
otl doc delete <ID>             # Delete a document
```

### Nodes

```bash
otl node create <PARENT> <POSITION> <CONTENT>   # Create a node
otl node update <ID> --content "new text"        # Update content
otl node update <ID> --note "a note"             # Set note
otl node update <ID> --type checkbox             # Change type
otl node move <ID> <NEW_PARENT> <POSITION>       # Move a node
otl node delete <ID>                             # Delete node + descendants
```

Node IDs can be full UUIDs or short IDs (e.g. `inbox-a3x`).

### Capture

Quick-add items to a configured target location:

```bash
otl capture 'buy milk'                        # Single item to default target
otl capture 'a' 'b' 'c'                       # Three separate items
otl capture 'task' --type checkbox             # As checkbox
otl capture 'item' --note 'details here'      # With a note
otl capture 'item' --to work                  # To named target
echo "from pipe" | otl capture --stdin         # From stdin
otl capture 'item' --json                     # JSON output
```

Short IDs are printed to stdout (one per line), status to stderr. This makes capture pipeable:

```bash
NEW_ID=$(otl capture 'buy milk')
```

### Capture targets

```bash
otl target list                                           # List targets
otl target add inbox --doc mydoc                          # Doc root as target
otl target add inbox --node mydoc-a3x                     # Node (infers doc)
otl target add inbox --doc mydoc --node <NODE_ID>         # Explicit both
otl target set-default inbox                              # Set default
otl target remove inbox                                   # Remove
```

### Search

```bash
otl search "query"                # Search all documents
otl search "query" --doc <ID>     # Search within a document
otl search "query" --limit 50     # Limit results
```

### Backlinks

```bash
otl backlinks <NODE_ID>           # Find nodes linking to this node
```

### Inbox

```bash
otl inbox list                    # List pending inbox items
otl inbox import                  # Import inbox items to destination
otl inbox clear <ID>              # Remove specific item
```

### Folders

```bash
otl folder list                           # List folders
otl folder create <NAME>                  # Create a folder
otl folder delete <NAME>                  # Delete a folder
otl folder move-doc <DOC_ID> <FOLDER>     # Move doc to folder
```

### Import / Export

```bash
otl export opml <DOC_ID>          # Export as OPML
otl export markdown <DOC_ID>      # Export as Markdown
otl export json <DOC_ID>          # Export as JSON backup

otl import opml <FILE>            # Import OPML file
otl import json <FILE>            # Import JSON backup
```

### Compact

Merge pending operations into `state.json`:

```bash
otl compact                       # Active document
otl compact <DOC_ID>              # Specific document
```

## Running tests

```bash
cd app/src-tauri
cargo test -p outline-core
```
