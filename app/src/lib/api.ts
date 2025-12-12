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
