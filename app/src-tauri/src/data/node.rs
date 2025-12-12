use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use uuid::Uuid;

/// Node type determines display and behavior
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Default)]
#[serde(rename_all = "snake_case")]
pub enum NodeType {
    #[default]
    Bullet,
    Checkbox,
    Heading,
}

/// A single node in the outline tree
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Node {
    /// Unique identifier (UUID v7)
    pub id: Uuid,

    /// Parent node ID (null for root nodes)
    #[serde(skip_serializing_if = "Option::is_none")]
    pub parent_id: Option<Uuid>,

    /// Position among siblings (0-indexed)
    pub position: i32,

    /// Primary text content (may contain rich text HTML from TipTap)
    pub content: String,

    /// Optional note/description text
    #[serde(skip_serializing_if = "Option::is_none")]
    pub note: Option<String>,

    /// Display type of the node
    #[serde(default)]
    pub node_type: NodeType,

    /// Heading level (1-6, only valid when node_type is Heading)
    #[serde(skip_serializing_if = "Option::is_none")]
    pub heading_level: Option<u8>,

    /// Checkbox state (only valid when node_type is Checkbox)
    #[serde(default)]
    pub is_checked: bool,

    /// Color label
    #[serde(skip_serializing_if = "Option::is_none")]
    pub color: Option<String>,

    /// Tags extracted from content or manually applied
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub tags: Vec<String>,

    /// Due date for tasks
    #[serde(skip_serializing_if = "Option::is_none")]
    pub date: Option<String>,

    /// Recurrence rule in iCal RRULE format
    #[serde(skip_serializing_if = "Option::is_none")]
    pub date_recurrence: Option<String>,

    /// Whether children are hidden
    #[serde(default)]
    pub collapsed: bool,

    /// If set, this node is a mirror of another node
    #[serde(skip_serializing_if = "Option::is_none")]
    pub mirror_source_id: Option<Uuid>,

    /// Creation timestamp
    pub created_at: DateTime<Utc>,

    /// Last modification timestamp (used for LWW conflict resolution)
    pub updated_at: DateTime<Utc>,
}

impl Node {
    /// Create a new node with default values
    pub fn new(content: String) -> Self {
        let now = Utc::now();
        Self {
            id: Uuid::now_v7(),
            parent_id: None,
            position: 0,
            content,
            note: None,
            node_type: NodeType::default(),
            heading_level: None,
            is_checked: false,
            color: None,
            tags: Vec::new(),
            date: None,
            date_recurrence: None,
            collapsed: false,
            mirror_source_id: None,
            created_at: now,
            updated_at: now,
        }
    }

    /// Create a new child node under this parent
    pub fn new_child(parent_id: Uuid, position: i32, content: String) -> Self {
        let mut node = Self::new(content);
        node.parent_id = Some(parent_id);
        node.position = position;
        node
    }
}
