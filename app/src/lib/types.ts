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
  tags: string[];
  date?: string;
  date_recurrence?: string;
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
  children: TreeNode[];
}
