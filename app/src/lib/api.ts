import type { DocumentState, Node, NodeChanges, Operation } from './types';

// Check if we're running in Tauri
let tauriInvoke: ((cmd: string, args?: Record<string, unknown>) => Promise<unknown>) | null | undefined = undefined;

async function initTauri() {
  if (tauriInvoke !== undefined) return; // Already checked
  try {
    // Check if we're in a Tauri environment
    if (typeof window !== 'undefined' && '__TAURI__' in window) {
      const { invoke } = await import('@tauri-apps/api/core');
      if (invoke) {
        tauriInvoke = invoke;
        return;
      }
    }
  } catch {
    // Ignore import errors
  }
  // Not in Tauri - use mock mode
  tauriInvoke = null;
}

// In-memory state for browser-only mode
let mockState: DocumentState = { nodes: [] };
let mockIdCounter = 1;

function generateId(): string {
  return `mock-${Date.now()}-${mockIdCounter++}`;
}

function createMockData(): DocumentState {
  const now = new Date().toISOString();
  const root1Id = generateId();
  const root2Id = generateId();
  const root3Id = generateId();

  return {
    nodes: [
      {
        id: root1Id,
        parent_id: null,
        position: 0,
        content: 'Welcome to Outline',
        node_type: 'bullet',
        is_checked: false,
        collapsed: false,
        created_at: now,
        updated_at: now,
      },
      {
        id: root2Id,
        parent_id: null,
        position: 1,
        content: 'Getting Started',
        node_type: 'bullet',
        is_checked: false,
        collapsed: false,
        created_at: now,
        updated_at: now,
      },
      {
        id: generateId(),
        parent_id: root2Id,
        position: 0,
        content: 'Press Enter to create a new item',
        node_type: 'bullet',
        is_checked: false,
        collapsed: false,
        created_at: now,
        updated_at: now,
      },
      {
        id: generateId(),
        parent_id: root2Id,
        position: 1,
        content: 'Press Tab to indent',
        node_type: 'bullet',
        is_checked: false,
        collapsed: false,
        created_at: now,
        updated_at: now,
      },
      {
        id: generateId(),
        parent_id: root2Id,
        position: 2,
        content: 'Press Shift+Tab to outdent',
        node_type: 'bullet',
        is_checked: false,
        collapsed: false,
        created_at: now,
        updated_at: now,
      },
      {
        id: root3Id,
        parent_id: null,
        position: 2,
        content: 'Features',
        node_type: 'bullet',
        is_checked: false,
        collapsed: false,
        created_at: now,
        updated_at: now,
      },
      {
        id: generateId(),
        parent_id: root3Id,
        position: 0,
        content: 'Hierarchical notes',
        node_type: 'bullet',
        is_checked: false,
        collapsed: false,
        created_at: now,
        updated_at: now,
      },
      {
        id: generateId(),
        parent_id: root3Id,
        position: 1,
        content: 'Rich text editing',
        node_type: 'bullet',
        is_checked: false,
        collapsed: false,
        created_at: now,
        updated_at: now,
      },
      {
        id: generateId(),
        parent_id: root3Id,
        position: 2,
        content: 'Cross-device sync (coming soon)',
        node_type: 'bullet',
        is_checked: false,
        collapsed: false,
        created_at: now,
        updated_at: now,
      },
    ],
  };
}

// Load document from Rust backend or use mock data
export async function loadDocument(docId?: string): Promise<DocumentState> {
  await initTauri();
  if (tauriInvoke) {
    return tauriInvoke('load_document', { docId }) as Promise<DocumentState>;
  }
  // Browser-only mode: use mock data
  if (mockState.nodes.length === 0) {
    mockState = createMockData();
  }
  return mockState;
}

// Save a raw operation
export async function saveOp(op: Operation): Promise<DocumentState> {
  await initTauri();
  if (tauriInvoke) {
    return tauriInvoke('save_op', { op }) as Promise<DocumentState>;
  }
  // Browser-only mode: operations not persisted
  return mockState;
}

// Create a new node
export async function createNode(
  parentId: string | null,
  position: number,
  content: string
): Promise<{ id: string; state: DocumentState }> {
  await initTauri();
  if (tauriInvoke) {
    const result = await tauriInvoke('create_node', {
      parentId,
      position,
      content
    }) as [string, DocumentState];
    return { id: result[0], state: result[1] };
  }

  // Browser-only mode: create in memory
  const now = new Date().toISOString();
  const newId = generateId();
  const newNode: Node = {
    id: newId,
    parent_id: parentId,
    position,
    content,
    node_type: 'bullet',
    is_checked: false,
    collapsed: false,
    created_at: now,
    updated_at: now,
  };
  mockState.nodes.push(newNode);
  return { id: newId, state: { ...mockState } };
}

// Update a node's fields
export async function updateNode(id: string, changes: NodeChanges): Promise<DocumentState> {
  await initTauri();
  if (tauriInvoke) {
    return tauriInvoke('update_node', { id, changes }) as Promise<DocumentState>;
  }

  // Browser-only mode: update in memory
  const node = mockState.nodes.find(n => n.id === id);
  if (node) {
    Object.assign(node, changes, { updated_at: new Date().toISOString() });
  }
  return { ...mockState };
}

// Move a node to new parent/position
export async function moveNode(
  id: string,
  parentId: string | null,
  position: number
): Promise<DocumentState> {
  await initTauri();
  if (tauriInvoke) {
    return tauriInvoke('move_node', { id, parentId, position }) as Promise<DocumentState>;
  }

  // Browser-only mode: update in memory
  const node = mockState.nodes.find(n => n.id === id);
  if (node) {
    node.parent_id = parentId;
    node.position = position;
    node.updated_at = new Date().toISOString();
  }
  return { ...mockState };
}

// Delete a node and its descendants
export async function deleteNode(id: string): Promise<DocumentState> {
  await initTauri();
  if (tauriInvoke) {
    return tauriInvoke('delete_node', { id }) as Promise<DocumentState>;
  }

  // Browser-only mode: delete from memory (including descendants)
  const toDelete = new Set<string>();
  toDelete.add(id);

  // Find all descendants
  let changed = true;
  while (changed) {
    changed = false;
    for (const node of mockState.nodes) {
      if (node.parent_id && toDelete.has(node.parent_id) && !toDelete.has(node.id)) {
        toDelete.add(node.id);
        changed = true;
      }
    }
  }

  mockState.nodes = mockState.nodes.filter(n => !toDelete.has(n.id));
  return { ...mockState };
}

// Compact document (merge pending into state.json)
export async function compactDocument(): Promise<void> {
  await initTauri();
  if (tauriInvoke) {
    return tauriInvoke('compact_document') as Promise<void>;
  }
  // Browser-only mode: no-op
}

// Search result from backend
export interface SearchResult {
  node_id: string;
  document_id: string;
  content: string;
  note: string | null;
  snippet: string;
  rank: number;
}

// Document info from list_documents
export interface DocumentInfo {
  id: string;
  title: string;
  node_count: number;
}

// Search for nodes matching a query
export async function search(
  query: string,
  docId?: string,
  limit?: number
): Promise<SearchResult[]> {
  await initTauri();
  if (tauriInvoke) {
    return tauriInvoke('search', { query, docId, limit }) as Promise<SearchResult[]>;
  }
  // Browser-only mode: simple client-side search
  const results: SearchResult[] = [];
  const queryLower = query.toLowerCase();
  for (const node of mockState.nodes) {
    if (node.content.toLowerCase().includes(queryLower)) {
      results.push({
        node_id: node.id,
        document_id: 'mock-doc',
        content: node.content,
        note: node.note || null,
        snippet: node.content,
        rank: 0,
      });
    }
  }
  return results.slice(0, limit || 50);
}

// List all documents
export async function listDocuments(): Promise<DocumentInfo[]> {
  await initTauri();
  if (tauriInvoke) {
    return tauriInvoke('list_documents') as Promise<DocumentInfo[]>;
  }
  // Browser-only mode: return mock document
  return [
    {
      id: 'mock-doc',
      title: 'Mock Document',
      node_count: mockState.nodes.length,
    },
  ];
}

// Backlink result from get_backlinks
export interface BacklinkResult {
  source_node_id: string;
  source_document_id: string;
  content: string;
}

// Get backlinks for a node
export async function getBacklinks(nodeId: string): Promise<BacklinkResult[]> {
  await initTauri();
  if (tauriInvoke) {
    return tauriInvoke('get_backlinks', { nodeId }) as Promise<BacklinkResult[]>;
  }
  // Browser-only mode: return empty array
  return [];
}

// Calculate the next occurrence for a recurring task
export async function getNextOccurrence(
  rruleStr: string,
  afterDate: string
): Promise<string | null> {
  await initTauri();
  if (tauriInvoke) {
    return tauriInvoke('get_next_occurrence', { rruleStr, afterDate }) as Promise<string | null>;
  }
  // Browser-only mode: simple calculation for daily/weekly
  // This is a fallback - real RRULE parsing happens in Rust
  const after = new Date(afterDate);
  after.setDate(after.getDate() + 1);
  const year = after.getFullYear();
  const month = String(after.getMonth() + 1).padStart(2, '0');
  const day = String(after.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

// Generate iCalendar feed for all dated items
export async function generateIcalFeed(): Promise<string> {
  await initTauri();
  if (tauriInvoke) {
    return tauriInvoke('generate_ical_feed') as Promise<string>;
  }
  // Browser-only mode: return empty calendar
  return `BEGIN:VCALENDAR
VERSION:2.0
PRODID:-//Outline//NONSGML v1.0//EN
CALSCALE:GREGORIAN
METHOD:PUBLISH
X-WR-CALNAME:Outline Tasks
END:VCALENDAR
`;
}
