# Outline Architecture Documentation

This directory contains architecture diagrams and documentation for the Outline project.

## Quick Links

| Document | Description |
|----------|-------------|
| [Onboarding Guide](ONBOARDING.md) | Start here! Quick setup and codebase orientation |
| [Key Concepts](CONCEPTS.md) | Deep-dive into core concepts (nodes, operations, sync, etc.) |
| [Codebase Tour](CODEBASE-TOUR.md) | File-by-file guide to the codebase |

---

## C4 Architecture Diagrams

### Level 1: System Context

Shows Outline and its relationship with users and external systems.

![System Context Diagram](c4-level1-context.svg)

### Level 2: Container Diagram

Shows the major containers that make up the Outline system.

![Container Diagram](c4-level2-container.svg)

### Level 3: Component Diagrams

#### Frontend Components (Svelte 5 + TipTap)

Shows the internal structure of the frontend: UI components, TipTap extensions, state management, and API bridge.

![Frontend Components](c4-level3-frontend.svg)

#### Backend Components (Rust/Tauri)

Shows the internal structure of the Rust backend: command handlers, data layer, search module, and import/export.

![Backend Components](c4-level3-backend.svg)

### Data Flow

Shows how user actions become persisted state, and how multi-machine sync works.

![Data Flow](data-flow.svg)

---

## Rendering Diagrams

Diagrams are written in [D2](https://d2lang.com/). To render:

```bash
# Render single diagram
d2 c4-level1-context.d2 c4-level1-context.svg

# Render all diagrams
for f in *.d2; do d2 "$f" "${f%.d2}.svg"; done

# Watch mode (auto-refresh on changes)
d2 --watch c4-level2-container.d2
```

---

## C4 Model Levels

1. **System Context** - The big picture: who uses Outline and what external systems it integrates with
2. **Container** - The high-level technology decisions: runtime units like Desktop App (Tauri), Server (Ruby), and Storage (JSONL/SQLite)
3. **Component** - The internal structure of each container (Frontend and Backend)
4. **Code** - (As needed) Class/module level detail for complex areas

---

## Additional Resources

Historical architecture decision documents:
- [Data Format](architecture-data-format.md) - JSONL format design
- [WAL Sync](architecture-wal-sync.md) - Multi-machine sync approach
- [Compaction Strategies](architecture-compaction-strategies.md) - Pending file management
- [Client-Server Split](architecture-client-server-split.md) - Desktop vs server responsibilities
