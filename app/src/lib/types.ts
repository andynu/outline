// Types matching Rust data structures

export type NodeType = 'bullet' | 'checkbox' | 'heading';

export interface Node {
  id: string;
  parent_id: string | null;
  position: number;
  content: string;
  note?: string;
  node_type: NodeType;
  heading_level?: number;
  is_checked: boolean;
  color?: string;
  tags?: string[];
  date?: string;
  date_recurrence?: string;
  recurrence?: string;  // Alias for date_recurrence (used by UI)
  collapsed: boolean;
  mirror_source_id?: string;
  created_at: string;
  updated_at: string;
}

export interface DocumentState {
  nodes: Node[];
}

export interface NodeChanges {
  content?: string;
  note?: string;
  node_type?: NodeType;
  heading_level?: number;
  is_checked?: boolean;
  color?: string;
  tags?: string[];
  date?: string;
  date_recurrence?: string;
  recurrence?: string;  // Alias for date_recurrence (used by UI)
  collapsed?: boolean;
  mirror_source_id?: string;
}

// Operation types matching Rust
export type Operation =
  | {
      op: 'create';
      id: string;
      parent_id: string | null;
      position: number;
      content: string;
      node_type: NodeType;
      updated_at: string;
    }
  | {
      op: 'update';
      id: string;
      changes: NodeChanges;
      updated_at: string;
    }
  | {
      op: 'move';
      id: string;
      parent_id: string | null;
      position: number;
      updated_at: string;
    }
  | {
      op: 'delete';
      id: string;
      updated_at: string;
    };

// UI state for tree view
export interface TreeNode {
  node: Node;
  depth: number;
  hasChildren: boolean;  // true if node has children (even when collapsed)
  children: TreeNode[];  // empty when collapsed
}

// Undo/Redo support
export interface UndoEntry {
  // Description for UI (e.g., "Delete item", "Edit text")
  description: string;
  // What to do to undo this operation
  undo: UndoAction;
  // What to do to redo this operation (after undo)
  redo: UndoAction;
  // Timestamp for grouping rapid operations
  timestamp: number;
}

export type UndoAction =
  | { type: 'create'; node: Node }                          // Recreate a deleted node
  | { type: 'delete'; id: string }                          // Delete a created node
  | { type: 'update'; id: string; changes: NodeChanges }    // Revert field changes
  | { type: 'move'; id: string; parentId: string | null; position: number }  // Move back
  | { type: 'swap'; id: string; position: number; otherId: string; otherPosition: number }  // Swap positions
