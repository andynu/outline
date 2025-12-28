# The TCommand Pattern: Operation-Based Undo/Redo

A pattern extracted from Photoshop 1.0 (1990) for building robust, memory-efficient undo systems—particularly suited to applications recording modifications into delta logs.

## Core Concept

Instead of storing full state snapshots, each user action is encapsulated as a **Command object** that knows:

1. How to **do** the operation
2. How to **undo** it (reverse)
3. How to **redo** it (re-apply)
4. What **minimal data** it needs to store

```
┌─────────────────────────────────────────────────────────┐
│                     Command Stack                        │
├─────────────────────────────────────────────────────────┤
│  ← Undo direction                    Redo direction →   │
│                                                         │
│  ┌─────────┐  ┌─────────┐  ┌─────────┐  ┌─────────┐    │
│  │ Insert  │  │ Delete  │  │  Move   │  │ Indent  │    │
│  │ Node    │  │ Nodes   │  │ Node    │  │ Node    │    │
│  │ {data}  │  │ {data}  │  │ {data}  │  │ {data}  │    │
│  └─────────┘  └─────────┘  └─────────┘  └─────────┘    │
│                              ▲                          │
│                              │                          │
│                         [current]                       │
└─────────────────────────────────────────────────────────┘
```

## The Command Interface

### Minimal Interface (JavaScript/TypeScript)

```typescript
interface Command {
  // Unique identifier for the command type
  readonly type: string;

  // Execute the operation (returns success)
  execute(): boolean;

  // Reverse the operation
  undo(): void;

  // Re-apply the operation (often same as execute, but not always)
  redo(): void;

  // Human-readable description for UI
  getDescription(): string;

  // Serializable delta for persistence/sync
  toDelta(): Delta;
}
```

### For Delta Log Systems

When commands need to be persisted or synced:

```typescript
interface Delta {
  id: string;           // Unique delta ID
  type: string;         // Command type
  timestamp: number;    // When it occurred
  data: unknown;        // Command-specific payload
  inverse?: unknown;    // Data needed for undo (optional optimization)
}

interface PersistableCommand extends Command {
  // Reconstruct command from delta
  static fromDelta(delta: Delta, context: AppContext): Command;

  // Can this command be merged with another?
  canMerge(other: Command): boolean;

  // Merge with another command (for coalescing rapid edits)
  merge(other: Command): Command;
}
```

## Outliner Application Example

For an outliner recording modifications to a delta log:

### Command Types

```typescript
// Base context all commands need
interface OutlinerContext {
  getNode(id: string): OutlineNode | null;
  getParent(id: string): OutlineNode | null;
  getSiblings(id: string): OutlineNode[];
}

// Insert a new node
class InsertNodeCommand implements PersistableCommand {
  readonly type = 'INSERT_NODE';

  constructor(
    private ctx: OutlinerContext,
    private nodeData: {
      id: string;
      content: string;
      parentId: string | null;
      afterSiblingId: string | null;
    }
  ) {}

  execute(): boolean {
    // Insert node into tree
    return this.ctx.insertNode(this.nodeData);
  }

  undo(): void {
    // Remove the node we inserted
    this.ctx.removeNode(this.nodeData.id);
  }

  redo(): void {
    this.execute();
  }

  getDescription(): string {
    return `Insert "${this.nodeData.content.slice(0, 20)}..."`;
  }

  toDelta(): Delta {
    return {
      id: generateId(),
      type: this.type,
      timestamp: Date.now(),
      data: this.nodeData
    };
  }

  static fromDelta(delta: Delta, ctx: OutlinerContext): InsertNodeCommand {
    return new InsertNodeCommand(ctx, delta.data as InsertNodeCommand['nodeData']);
  }

  canMerge(other: Command): boolean {
    return false; // Insertions don't merge
  }

  merge(other: Command): Command {
    return this;
  }
}

// Delete node(s)
class DeleteNodesCommand implements PersistableCommand {
  readonly type = 'DELETE_NODES';

  // Store everything needed to restore
  private deletedSubtrees: SerializedNode[] = [];

  constructor(
    private ctx: OutlinerContext,
    private nodeIds: string[]
  ) {}

  execute(): boolean {
    // Capture full subtrees before deletion (for undo)
    this.deletedSubtrees = this.nodeIds.map(id =>
      this.ctx.serializeSubtree(id)
    );

    // Delete nodes
    this.nodeIds.forEach(id => this.ctx.removeNode(id));
    return true;
  }

  undo(): void {
    // Restore subtrees in reverse order
    this.deletedSubtrees.reverse().forEach(subtree => {
      this.ctx.restoreSubtree(subtree);
    });
  }

  redo(): void {
    this.nodeIds.forEach(id => this.ctx.removeNode(id));
  }

  toDelta(): Delta {
    return {
      id: generateId(),
      type: this.type,
      timestamp: Date.now(),
      data: { nodeIds: this.nodeIds },
      // Include deleted data for sync/restore
      inverse: { subtrees: this.deletedSubtrees }
    };
  }
}

// Move node (reparent or reorder)
class MoveNodeCommand implements PersistableCommand {
  readonly type = 'MOVE_NODE';

  private previousPosition: {
    parentId: string | null;
    afterSiblingId: string | null;
  } | null = null;

  constructor(
    private ctx: OutlinerContext,
    private nodeId: string,
    private newParentId: string | null,
    private afterSiblingId: string | null
  ) {}

  execute(): boolean {
    // Capture current position for undo
    const node = this.ctx.getNode(this.nodeId);
    if (!node) return false;

    this.previousPosition = {
      parentId: node.parentId,
      afterSiblingId: this.ctx.getPreviousSibling(this.nodeId)?.id ?? null
    };

    // Move node
    return this.ctx.moveNode(this.nodeId, this.newParentId, this.afterSiblingId);
  }

  undo(): void {
    if (this.previousPosition) {
      this.ctx.moveNode(
        this.nodeId,
        this.previousPosition.parentId,
        this.previousPosition.afterSiblingId
      );
    }
  }

  redo(): void {
    this.ctx.moveNode(this.nodeId, this.newParentId, this.afterSiblingId);
  }

  toDelta(): Delta {
    return {
      id: generateId(),
      type: this.type,
      timestamp: Date.now(),
      data: {
        nodeId: this.nodeId,
        newParentId: this.newParentId,
        afterSiblingId: this.afterSiblingId
      },
      inverse: this.previousPosition
    };
  }
}

// Edit node content (with merge support for rapid typing)
class EditContentCommand implements PersistableCommand {
  readonly type = 'EDIT_CONTENT';

  private previousContent: string = '';

  constructor(
    private ctx: OutlinerContext,
    private nodeId: string,
    private newContent: string,
    private timestamp: number = Date.now()
  ) {}

  execute(): boolean {
    const node = this.ctx.getNode(this.nodeId);
    if (!node) return false;

    this.previousContent = node.content;
    node.content = this.newContent;
    return true;
  }

  undo(): void {
    const node = this.ctx.getNode(this.nodeId);
    if (node) {
      node.content = this.previousContent;
    }
  }

  redo(): void {
    const node = this.ctx.getNode(this.nodeId);
    if (node) {
      node.content = this.newContent;
    }
  }

  // Merge rapid edits to same node within 2 seconds
  canMerge(other: Command): boolean {
    if (!(other instanceof EditContentCommand)) return false;
    if (other.nodeId !== this.nodeId) return false;
    return other.timestamp - this.timestamp < 2000;
  }

  merge(other: Command): Command {
    if (!(other instanceof EditContentCommand)) return this;

    // Keep original previousContent, take new content
    const merged = new EditContentCommand(
      this.ctx,
      this.nodeId,
      other.newContent,
      other.timestamp
    );
    merged.previousContent = this.previousContent;
    return merged;
  }

  toDelta(): Delta {
    return {
      id: generateId(),
      type: this.type,
      timestamp: this.timestamp,
      data: {
        nodeId: this.nodeId,
        content: this.newContent
      },
      inverse: { content: this.previousContent }
    };
  }
}

// Indent/outdent (changes depth)
class IndentCommand implements PersistableCommand {
  readonly type = 'INDENT';

  private previousParentId: string | null = null;
  private previousAfterSiblingId: string | null = null;

  constructor(
    private ctx: OutlinerContext,
    private nodeId: string,
    private direction: 'indent' | 'outdent'
  ) {}

  execute(): boolean {
    const node = this.ctx.getNode(this.nodeId);
    if (!node) return false;

    // Capture current position
    this.previousParentId = node.parentId;
    this.previousAfterSiblingId = this.ctx.getPreviousSibling(this.nodeId)?.id ?? null;

    if (this.direction === 'indent') {
      // Make this node a child of the previous sibling
      const prevSibling = this.ctx.getPreviousSibling(this.nodeId);
      if (!prevSibling) return false;

      return this.ctx.moveNode(this.nodeId, prevSibling.id, null);
    } else {
      // Outdent: make this node a sibling of its parent
      const parent = this.ctx.getParent(this.nodeId);
      if (!parent) return false;

      return this.ctx.moveNode(this.nodeId, parent.parentId, parent.id);
    }
  }

  undo(): void {
    this.ctx.moveNode(this.nodeId, this.previousParentId, this.previousAfterSiblingId);
  }

  redo(): void {
    this.execute();
  }
}
```

## The Command Manager

Orchestrates command execution and manages the undo/redo stacks:

```typescript
class CommandManager {
  private undoStack: Command[] = [];
  private redoStack: Command[] = [];
  private maxHistorySize: number;

  // For delta log persistence
  private deltaLog: Delta[] = [];
  private onDeltaEmit?: (delta: Delta) => void;

  constructor(options: {
    maxHistorySize?: number;
    onDeltaEmit?: (delta: Delta) => void;
  } = {}) {
    this.maxHistorySize = options.maxHistorySize ?? 100;
    this.onDeltaEmit = options.onDeltaEmit;
  }

  execute(command: Command): boolean {
    const success = command.execute();

    if (success) {
      // Try to merge with last command
      const lastCommand = this.undoStack[this.undoStack.length - 1];
      if (lastCommand?.canMerge?.(command)) {
        this.undoStack[this.undoStack.length - 1] = lastCommand.merge(command);
      } else {
        this.undoStack.push(command);
      }

      // Clear redo stack on new action
      this.redoStack = [];

      // Emit delta for persistence/sync
      if (this.onDeltaEmit && 'toDelta' in command) {
        this.onDeltaEmit((command as PersistableCommand).toDelta());
      }

      // Trim history
      if (this.undoStack.length > this.maxHistorySize) {
        this.undoStack.shift();
      }
    }

    return success;
  }

  undo(): boolean {
    const command = this.undoStack.pop();
    if (!command) return false;

    command.undo();
    this.redoStack.push(command);

    return true;
  }

  redo(): boolean {
    const command = this.redoStack.pop();
    if (!command) return false;

    command.redo();
    this.undoStack.push(command);

    return true;
  }

  // Get description for UI ("Undo: Insert node")
  getUndoDescription(): string | null {
    const command = this.undoStack[this.undoStack.length - 1];
    return command?.getDescription() ?? null;
  }

  getRedoDescription(): string | null {
    const command = this.redoStack[this.redoStack.length - 1];
    return command?.getDescription() ?? null;
  }

  canUndo(): boolean {
    return this.undoStack.length > 0;
  }

  canRedo(): boolean {
    return this.redoStack.length > 0;
  }

  // For persistence: rebuild state from delta log
  static replayDeltas(
    deltas: Delta[],
    ctx: OutlinerContext,
    commandRegistry: Map<string, typeof PersistableCommand>
  ): void {
    for (const delta of deltas) {
      const CommandClass = commandRegistry.get(delta.type);
      if (CommandClass) {
        const command = CommandClass.fromDelta(delta, ctx);
        command.execute();
      }
    }
  }
}
```

## Compound Commands

For operations that involve multiple atomic changes:

```typescript
class CompoundCommand implements Command {
  readonly type = 'COMPOUND';
  private commands: Command[] = [];

  constructor(
    private description: string,
    commands: Command[]
  ) {
    this.commands = commands;
  }

  execute(): boolean {
    for (const cmd of this.commands) {
      if (!cmd.execute()) {
        // Rollback on failure
        this.undoExecuted();
        return false;
      }
    }
    return true;
  }

  private undoExecuted(): void {
    // Undo in reverse order
    for (let i = this.commands.length - 1; i >= 0; i--) {
      this.commands[i].undo();
    }
  }

  undo(): void {
    this.undoExecuted();
  }

  redo(): void {
    for (const cmd of this.commands) {
      cmd.redo();
    }
  }

  getDescription(): string {
    return this.description;
  }

  toDelta(): Delta {
    return {
      id: generateId(),
      type: this.type,
      timestamp: Date.now(),
      data: {
        description: this.description,
        deltas: this.commands
          .filter((c): c is PersistableCommand => 'toDelta' in c)
          .map(c => c.toDelta())
      }
    };
  }
}

// Usage: batch multiple operations
const batchDelete = new CompoundCommand(
  'Delete 5 items',
  selectedIds.map(id => new DeleteNodesCommand(ctx, [id]))
);
commandManager.execute(batchDelete);
```

## Mixins Approach (Alternative to Inheritance)

For those who prefer composition over inheritance:

```typescript
// Command factory with mixins
interface CommandConfig<T> {
  type: string;
  description: string | ((data: T) => string);
  execute: (ctx: OutlinerContext, data: T) => { success: boolean; inverse?: unknown };
  undo: (ctx: OutlinerContext, data: T, inverse: unknown) => void;
  canMerge?: (data: T, otherData: T) => boolean;
  merge?: (data: T, otherData: T) => T;
}

function createCommandType<T>(config: CommandConfig<T>) {
  return class implements PersistableCommand {
    readonly type = config.type;
    private inverse: unknown = null;

    constructor(
      private ctx: OutlinerContext,
      private data: T,
      private timestamp = Date.now()
    ) {}

    execute(): boolean {
      const result = config.execute(this.ctx, this.data);
      this.inverse = result.inverse;
      return result.success;
    }

    undo(): void {
      config.undo(this.ctx, this.data, this.inverse);
    }

    redo(): void {
      this.execute();
    }

    getDescription(): string {
      return typeof config.description === 'function'
        ? config.description(this.data)
        : config.description;
    }

    canMerge(other: Command): boolean {
      if (!config.canMerge) return false;
      if (other.type !== this.type) return false;
      return config.canMerge(this.data, (other as any).data);
    }

    merge(other: Command): Command {
      if (!config.merge) return this;
      const mergedData = config.merge(this.data, (other as any).data);
      return new (this.constructor as any)(this.ctx, mergedData, (other as any).timestamp);
    }

    toDelta(): Delta {
      return {
        id: generateId(),
        type: this.type,
        timestamp: this.timestamp,
        data: this.data,
        inverse: this.inverse
      };
    }

    static fromDelta(delta: Delta, ctx: OutlinerContext) {
      const instance = new this(ctx, delta.data as T, delta.timestamp);
      (instance as any).inverse = delta.inverse;
      return instance;
    }
  };
}

// Usage: define commands declaratively
const EditContent = createCommandType<{ nodeId: string; content: string }>({
  type: 'EDIT_CONTENT',
  description: (d) => `Edit "${d.content.slice(0, 20)}..."`,

  execute: (ctx, data) => {
    const node = ctx.getNode(data.nodeId);
    if (!node) return { success: false };
    const oldContent = node.content;
    node.content = data.content;
    return { success: true, inverse: { oldContent } };
  },

  undo: (ctx, data, inverse: { oldContent: string }) => {
    const node = ctx.getNode(data.nodeId);
    if (node) node.content = inverse.oldContent;
  },

  canMerge: (a, b) => a.nodeId === b.nodeId,

  merge: (a, b) => ({ nodeId: a.nodeId, content: b.content })
});
```

## Key Benefits for Delta Logs

1. **Minimal storage**: Only store what changed, not full state
2. **Semantic operations**: "Insert node" vs "state changed somehow"
3. **Efficient sync**: Send deltas over network, not snapshots
4. **Conflict resolution**: Operation types inform merge strategies
5. **Auditability**: Log shows exactly what happened
6. **Partial replay**: Can replay subset of operations

## Memory Comparison

For an outliner with 1000 nodes, average 100 chars each:

| Approach | Per-Operation Memory |
|----------|---------------------|
| Full snapshot | ~100KB (full tree) |
| TCommand (edit) | ~200 bytes (node ID + old/new content) |
| TCommand (move) | ~50 bytes (node ID + positions) |
| TCommand (delete) | ~1KB (subtree backup) |

With 50 operations in history:
- Snapshot approach: ~5MB
- TCommand approach: ~25KB (500x smaller)

## When to Use Each Approach

**Use TCommand pattern when:**
- Memory efficiency matters
- You need delta logs / sync
- Operations have semantic meaning
- Undo descriptions are valuable
- You want to merge rapid edits

**Use snapshot approach when:**
- State is small (< 10KB)
- Operations are complex/interdependent
- Simplicity is more important than efficiency
- You don't need to persist/sync

---

*Pattern extracted from Adobe Photoshop 1.0 (1990), adapted for modern JavaScript/TypeScript applications.*
