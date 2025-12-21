use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use uuid::Uuid;

use super::document::DocumentState;
use super::node::{Node, NodeType};

/// Operations that can be applied to a document
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "op", rename_all = "snake_case")]
pub enum Operation {
    /// Create a new node
    Create {
        id: Uuid,
        parent_id: Option<Uuid>,
        position: i32,
        content: String,
        #[serde(default)]
        node_type: NodeType,
        updated_at: DateTime<Utc>,
    },

    /// Update fields of an existing node
    Update {
        id: Uuid,
        #[serde(default)]
        changes: NodeChanges,
        updated_at: DateTime<Utc>,
    },

    /// Move a node to a new parent and/or position
    Move {
        id: Uuid,
        parent_id: Option<Uuid>,
        position: i32,
        updated_at: DateTime<Utc>,
    },

    /// Delete a node (and implicitly its children)
    Delete {
        id: Uuid,
        updated_at: DateTime<Utc>,
    },
}

/// Fields that can be changed in an Update operation
#[derive(Debug, Clone, Default, Serialize, Deserialize)]
pub struct NodeChanges {
    #[serde(skip_serializing_if = "Option::is_none")]
    pub content: Option<String>,

    #[serde(skip_serializing_if = "Option::is_none")]
    pub note: Option<String>,

    #[serde(skip_serializing_if = "Option::is_none")]
    pub node_type: Option<NodeType>,

    #[serde(skip_serializing_if = "Option::is_none")]
    pub heading_level: Option<u8>,

    #[serde(skip_serializing_if = "Option::is_none")]
    pub is_checked: Option<bool>,

    #[serde(skip_serializing_if = "Option::is_none")]
    pub color: Option<String>,

    #[serde(skip_serializing_if = "Option::is_none")]
    pub tags: Option<Vec<String>>,

    #[serde(skip_serializing_if = "Option::is_none")]
    pub date: Option<String>,

    #[serde(skip_serializing_if = "Option::is_none")]
    pub date_recurrence: Option<String>,

    #[serde(skip_serializing_if = "Option::is_none")]
    pub collapsed: Option<bool>,

    #[serde(skip_serializing_if = "Option::is_none")]
    pub mirror_source_id: Option<Uuid>,
}

impl Operation {
    /// Get the timestamp of this operation
    pub fn updated_at(&self) -> DateTime<Utc> {
        match self {
            Operation::Create { updated_at, .. } => *updated_at,
            Operation::Update { updated_at, .. } => *updated_at,
            Operation::Move { updated_at, .. } => *updated_at,
            Operation::Delete { updated_at, .. } => *updated_at,
        }
    }

    /// Apply this operation to a document state
    pub fn apply(&self, state: &mut DocumentState) {
        match self {
            Operation::Create {
                id,
                parent_id,
                position,
                content,
                node_type,
                updated_at,
            } => {
                // Check if node already exists (idempotent)
                if state.nodes.iter().any(|n| n.id == *id) {
                    return;
                }

                let node = Node {
                    id: *id,
                    parent_id: *parent_id,
                    position: *position,
                    content: content.clone(),
                    note: None,
                    node_type: node_type.clone(),
                    heading_level: None,
                    is_checked: false,
                    color: None,
                    tags: Vec::new(),
                    date: None,
                    date_recurrence: None,
                    collapsed: false,
                    mirror_source_id: None,
                    created_at: *updated_at,
                    updated_at: *updated_at,
                };

                state.nodes.push(node);
            }

            Operation::Update {
                id,
                changes,
                updated_at,
            } => {
                if let Some(node) = state.nodes.iter_mut().find(|n| n.id == *id) {
                    // Only apply if this update is newer
                    if *updated_at > node.updated_at {
                        if let Some(ref content) = changes.content {
                            node.content = content.clone();
                        }
                        if let Some(ref note) = changes.note {
                            node.note = Some(note.clone());
                        }
                        if let Some(ref node_type) = changes.node_type {
                            node.node_type = node_type.clone();
                        }
                        if let Some(heading_level) = changes.heading_level {
                            node.heading_level = Some(heading_level);
                        }
                        if let Some(is_checked) = changes.is_checked {
                            node.is_checked = is_checked;
                        }
                        if let Some(ref color) = changes.color {
                            node.color = Some(color.clone());
                        }
                        if let Some(ref tags) = changes.tags {
                            node.tags = tags.clone();
                        }
                        if let Some(ref date) = changes.date {
                            // Empty string means clear the date
                            node.date = if date.is_empty() { None } else { Some(date.clone()) };
                        }
                        if let Some(ref date_recurrence) = changes.date_recurrence {
                            // Empty string means clear the recurrence
                            node.date_recurrence = if date_recurrence.is_empty() { None } else { Some(date_recurrence.clone()) };
                        }
                        if let Some(collapsed) = changes.collapsed {
                            node.collapsed = collapsed;
                        }
                        if let Some(mirror_source_id) = changes.mirror_source_id {
                            node.mirror_source_id = Some(mirror_source_id);
                        }
                        node.updated_at = *updated_at;
                    }
                }
            }

            Operation::Move {
                id,
                parent_id,
                position,
                updated_at,
            } => {
                if let Some(node) = state.nodes.iter_mut().find(|n| n.id == *id) {
                    // Only apply if this move is newer
                    if *updated_at > node.updated_at {
                        node.parent_id = *parent_id;
                        node.position = *position;
                        node.updated_at = *updated_at;
                    }
                }
            }

            Operation::Delete { id, .. } => {
                // Remove the node and all its descendants
                let mut to_delete = vec![*id];
                let mut i = 0;
                while i < to_delete.len() {
                    let parent_id = to_delete[i];
                    for node in state.nodes.iter() {
                        if node.parent_id == Some(parent_id) && !to_delete.contains(&node.id) {
                            to_delete.push(node.id);
                        }
                    }
                    i += 1;
                }

                state.nodes.retain(|n| !to_delete.contains(&n.id));
            }
        }
    }
}

/// Helper to create a Create operation
pub fn create_op(parent_id: Option<Uuid>, position: i32, content: String) -> Operation {
    Operation::Create {
        id: Uuid::now_v7(),
        parent_id,
        position,
        content,
        node_type: NodeType::default(),
        updated_at: Utc::now(),
    }
}

/// Helper to create a Create operation with a specific ID (for undo/redo)
pub fn create_op_with_id(
    id: Uuid,
    parent_id: Option<Uuid>,
    position: i32,
    content: String,
    node_type: NodeType,
) -> Operation {
    Operation::Create {
        id,
        parent_id,
        position,
        content,
        node_type,
        updated_at: Utc::now(),
    }
}

/// Helper to create an Update operation
pub fn update_op(id: Uuid, changes: NodeChanges) -> Operation {
    Operation::Update {
        id,
        changes,
        updated_at: Utc::now(),
    }
}

/// Helper to create a Move operation
pub fn move_op(id: Uuid, parent_id: Option<Uuid>, position: i32) -> Operation {
    Operation::Move {
        id,
        parent_id,
        position,
        updated_at: Utc::now(),
    }
}

/// Helper to create a Delete operation
pub fn delete_op(id: Uuid) -> Operation {
    Operation::Delete {
        id,
        updated_at: Utc::now(),
    }
}
