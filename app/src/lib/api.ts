import { invoke } from '@tauri-apps/api/core';
import type { DocumentState, NodeChanges, Operation } from './types';

// Load document from Rust backend
export async function loadDocument(docId?: string): Promise<DocumentState> {
  return invoke<DocumentState>('load_document', { docId });
}

// Save a raw operation
export async function saveOp(op: Operation): Promise<DocumentState> {
  return invoke<DocumentState>('save_op', { op });
}

// Create a new node
export async function createNode(
  parentId: string | null,
  position: number,
  content: string
): Promise<{ id: string; state: DocumentState }> {
  const result = await invoke<[string, DocumentState]>('create_node', {
    parentId,
    position,
    content
  });
  return { id: result[0], state: result[1] };
}

// Update a node's fields
export async function updateNode(id: string, changes: NodeChanges): Promise<DocumentState> {
  return invoke<DocumentState>('update_node', { id, changes });
}

// Move a node to new parent/position
export async function moveNode(
  id: string,
  parentId: string | null,
  position: number
): Promise<DocumentState> {
  return invoke<DocumentState>('move_node', { id, parentId, position });
}

// Delete a node and its descendants
export async function deleteNode(id: string): Promise<DocumentState> {
  return invoke<DocumentState>('delete_node', { id });
}

// Compact document (merge pending into state.json)
export async function compactDocument(): Promise<void> {
  return invoke('compact_document');
}
