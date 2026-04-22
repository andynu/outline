import type { DatedNodeInfo, DocumentState, Node, NodeChanges, NodeType, Operation } from './types';
import { stripHtml } from './utils';

// Check if we're running in Tauri
let tauriInvoke: ((cmd: string, args?: Record<string, unknown>) => Promise<unknown>) | null | undefined = undefined;

async function initTauri() {
  if (tauriInvoke !== undefined) return; // Already checked
  try {
    // Check if we're in a Tauri environment (Tauri 2 uses __TAURI_INTERNALS__)
    if (typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window) {
      const { invoke } = await import('@tauri-apps/api/core');
      if (invoke) {
        tauriInvoke = invoke;
        console.log('[API] Tauri mode enabled');
        return;
      }
    }
  } catch (e) {
    console.error('[API] Failed to init Tauri:', e);
  }
  // Not in Tauri - use mock mode
  console.log('[API] Browser-only mock mode');
  tauriInvoke = null;
}

// In-memory state for browser-only mode
let mockState: DocumentState = { nodes: [] };
let mockIdCounter = 1;

function generateId(): string {
  return `mock-${Date.now()}-${mockIdCounter++}`;
}

// Base36 alphabet used by the Rust backend for short IDs.
const BASE36_ALPHABET = '0123456789abcdefghijklmnopqrstuvwxyz';

// Generate a 4-char base36 short_id not already used in the mock state.
// Mirrors Rust's assign_short_ids so browser-only mode behaves like the
// real backend — newly created nodes get a short_id immediately.
function generateMockShortId(): string {
  const existing = new Set(
    mockState.nodes.map(n => n.short_id).filter((s): s is string => !!s)
  );
  for (let attempt = 0; attempt < 1000; attempt++) {
    let code = '';
    for (let i = 0; i < 4; i++) {
      code += BASE36_ALPHABET[Math.floor(Math.random() * 36)];
    }
    if (!existing.has(code)) return code;
  }
  // Extremely unlikely fallback — 36^4 = ~1.68M codes.
  return `x${Date.now().toString(36).slice(-3)}`;
}

// Load benchmark data from static file
async function loadBenchmarkData(): Promise<Node[]> {
  try {
    const response = await fetch('/benchmark-data.json');
    const data = await response.json();
    const now = new Date().toISOString();
    // Add missing timestamp fields
    return data.map((node: Partial<Node>) => ({
      ...node,
      created_at: now,
      updated_at: now,
    }));
  } catch (e) {
    console.error('[API] Failed to load benchmark data:', e);
    return [];
  }
}

function createMockData(): DocumentState {
  const now = new Date().toISOString();
  // Use stable IDs for initial mock data so session state can restore correctly
  const root1Id = 'mock-root-1';
  const root2Id = 'mock-root-2';
  const root3Id = 'mock-root-3';

  return {
    doc_id: 'mock-doc',
    doc_prefix: 'mock',
    nodes: [
      {
        id: root1Id,
        parent_id: null,
        position: 0,
        content: 'Welcome to Outline',
        node_type: 'bullet',
        is_checked: false,
        collapsed: false,
        short_id: 'a1b2',
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
        short_id: 'c3d4',
        created_at: now,
        updated_at: now,
      },
      {
        id: 'mock-child-2-1',
        parent_id: root2Id,
        position: 0,
        content: 'Press Enter to create a new item',
        node_type: 'bullet',
        is_checked: false,
        collapsed: false,
        short_id: 'e5f6',
        created_at: now,
        updated_at: now,
      },
      {
        id: 'mock-child-2-2',
        parent_id: root2Id,
        position: 1,
        content: 'Press Tab to indent',
        node_type: 'bullet',
        is_checked: false,
        collapsed: false,
        short_id: 'g7h8',
        created_at: now,
        updated_at: now,
      },
      {
        id: 'mock-child-2-3',
        parent_id: root2Id,
        position: 2,
        content: 'Press Shift+Tab to outdent',
        node_type: 'bullet',
        is_checked: false,
        collapsed: false,
        short_id: 'i9j0',
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
        short_id: 'k1l2',
        created_at: now,
        updated_at: now,
      },
      {
        id: 'mock-child-3-1',
        parent_id: root3Id,
        position: 0,
        content: 'Hierarchical notes',
        node_type: 'bullet',
        is_checked: false,
        collapsed: false,
        short_id: 'm3n4',
        created_at: now,
        updated_at: now,
      },
      {
        id: 'mock-child-3-2',
        parent_id: root3Id,
        position: 1,
        content: 'Rich text editing',
        node_type: 'bullet',
        is_checked: false,
        collapsed: false,
        short_id: 'o5p6',
        created_at: now,
        updated_at: now,
      },
      {
        id: 'mock-child-3-3',
        parent_id: root3Id,
        position: 2,
        content: 'Cross-device sync (coming soon)',
        node_type: 'bullet',
        is_checked: false,
        collapsed: false,
        short_id: 'q7r8',
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
    console.log('[API] load_document via Tauri');
    const result = await tauriInvoke('load_document', { docId }) as DocumentState;
    console.log('[API] loaded', result.nodes.length, 'nodes');
    return result;
  }

  // Browser-only mode: check for benchmark query param
  const useBenchmark = typeof window !== 'undefined' &&
    new URLSearchParams(window.location.search).has('benchmark');

  if (useBenchmark) {
    console.log('[API] load_document via benchmark data');
    const nodes = await loadBenchmarkData();
    mockState = { nodes };
    console.log('[API] loaded', nodes.length, 'benchmark nodes');
    return mockState;
  }

  console.log('[API] load_document via mock');
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

// Save multiple operations in a single batch (avoids O(n) IPC round-trips)
export async function saveOps(ops: Operation[]): Promise<DocumentState> {
  await initTauri();
  if (tauriInvoke) {
    return tauriInvoke('save_ops', { ops }) as Promise<DocumentState>;
  }
  // Browser-only mode: apply operations in memory
  for (const op of ops) {
    if (op.op === 'move') {
      mockState.nodes = mockState.nodes.map(n => {
        if (n.id === op.id) {
          return { ...n, parent_id: op.parent_id, position: op.position, updated_at: new Date().toISOString() };
        }
        return n;
      });
    } else if (op.op === 'update' && 'changes' in op) {
      mockState.nodes = mockState.nodes.map(n => {
        if (n.id === op.id) {
          return { ...n, ...op.changes, updated_at: new Date().toISOString() };
        }
        return n;
      });
    }
  }
  return { nodes: [...mockState.nodes] };
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
    short_id: generateMockShortId(),
    created_at: now,
    updated_at: now,
  };
  mockState.nodes = [...mockState.nodes, newNode];
  return { id: newId, state: { nodes: [...mockState.nodes] } };
}

// Create a node with a specific ID (for undo/redo)
export async function createNodeWithId(
  id: string,
  parentId: string | null,
  position: number,
  content: string,
  nodeType: NodeType
): Promise<{ id: string; state: DocumentState }> {
  await initTauri();
  if (tauriInvoke) {
    const result = await tauriInvoke('create_node_with_id', {
      id,
      parentId,
      position,
      content,
      nodeType
    }) as [string, DocumentState];
    return { id: result[0], state: result[1] };
  }

  // Browser-only mode: create in memory with specific ID
  const now = new Date().toISOString();
  const newNode: Node = {
    id,
    parent_id: parentId,
    position,
    content,
    node_type: nodeType,
    is_checked: false,
    collapsed: false,
    short_id: generateMockShortId(),
    created_at: now,
    updated_at: now,
  };
  mockState.nodes.push(newNode);
  return { id, state: { ...mockState } };
}

// Update a node's fields
export async function updateNode(id: string, changes: NodeChanges): Promise<DocumentState> {
  await initTauri();
  if (tauriInvoke) {
    console.log('[API] update_node via Tauri:', id, changes);
    try {
      const result = await tauriInvoke('update_node', { id, changes }) as DocumentState;
      console.log('[API] update_node success');
      return result;
    } catch (e) {
      console.error('[API] update_node ERROR:', e);
      throw e;
    }
  }
  console.log('[API] update_node via mock:', id, changes);

  // Browser-only mode: update in memory with new array reference
  mockState.nodes = mockState.nodes.map(n => {
    if (n.id === id) {
      return { ...n, ...changes, updated_at: new Date().toISOString() };
    }
    return n;
  });
  return { nodes: [...mockState.nodes] };
}

// Update a node in a specific document (cross-document operations).
// Returns the updated DocumentState when the target is the currently loaded document,
// so the caller can refresh the outline view. Returns null for other documents.
export async function updateNodeInDocument(nodeId: string, documentId: string, changes: NodeChanges): Promise<DocumentState | null> {
  await initTauri();
  if (tauriInvoke) {
    console.log('[API] update_node_in_document via Tauri:', nodeId, documentId, changes);
    try {
      const result = await tauriInvoke('update_node_in_document', { nodeId, documentId, changes }) as DocumentState | null;
      console.log('[API] update_node_in_document success, current_doc_updated:', result != null);
      return result ?? null;
    } catch (e) {
      console.error('[API] update_node_in_document ERROR:', e);
      throw e;
    }
  }
  // Browser-only mode: no-op (mock doesn't support cross-document)
  console.log('[API] update_node_in_document via mock (no-op):', nodeId, documentId, changes);
  return null;
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

  // Browser-only mode: update in memory with new array reference
  mockState.nodes = mockState.nodes.map(n => {
    if (n.id === id) {
      return { ...n, parent_id: parentId, position, updated_at: new Date().toISOString() };
    }
    return n;
  });
  return { nodes: [...mockState.nodes] };
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
  return { nodes: [...mockState.nodes] };
}

// Compact document (merge pending into state.json)
export async function compactDocument(): Promise<void> {
  await initTauri();
  if (tauriInvoke) {
    return tauriInvoke('compact_document') as Promise<void>;
  }
  // Browser-only mode: no-op
}

// Check if document has external changes from sync
export async function checkForChanges(): Promise<boolean> {
  await initTauri();
  if (tauriInvoke) {
    return tauriInvoke('check_for_changes') as Promise<boolean>;
  }
  // Browser-only mode: no external changes possible
  return false;
}

// Reload document if there are external changes, returns new state or null
export async function reloadIfChanged(): Promise<DocumentState | null> {
  await initTauri();
  if (tauriInvoke) {
    return tauriInvoke('reload_if_changed') as Promise<DocumentState | null>;
  }
  // Browser-only mode: no external changes possible
  return null;
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
  title_node_id?: string;  // ID of the first root node (for renaming)
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

// Get all nodes with dates across all documents
export async function getAllDatedNodes(): Promise<DatedNodeInfo[]> {
  await initTauri();
  if (tauriInvoke) {
    return tauriInvoke('get_all_dated_nodes') as Promise<DatedNodeInfo[]>;
  }
  // Browser-only mode: return dated nodes from current mock state
  return mockState.nodes
    .filter(n => n.date)
    .map(n => ({
      id: n.id,
      content: n.content,
      date: n.date!,
      date_end: n.date_end,
      node_type: n.node_type,
      is_checked: n.is_checked,
      date_recurrence: n.date_recurrence,
      defer_date: n.defer_date,
      document_id: 'mock-doc',
      document_title: 'Mock Document',
    }));
}

// Delete a document by ID
export async function deleteDocument(docId: string): Promise<void> {
  await initTauri();
  if (tauriInvoke) {
    await tauriInvoke('delete_document', { docId });
    return;
  }
  // Browser-only mode: no-op
}

// Create a new document with a unique ID
export async function createDocument(): Promise<string> {
  await initTauri();
  if (tauriInvoke) {
    // Generate a new UUID for the document
    const newId = crypto.randomUUID();
    // Use the explicit create_document command — load_document no longer
    // auto-seeds on missing folders (see otl-sj95).
    const state = await tauriInvoke('create_document', { docId: newId }) as DocumentState;
    return state.doc_id ?? newId;
  }
  // Browser-only mode: return mock ID
  return 'mock-doc-' + Date.now();
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

// Unlinked reference result
export interface UnlinkedReference {
  source_node_id: string;
  source_document_id: string;
  content: string;
}

// Get unlinked references for a node (mentions of its text without formal wiki links)
export async function getUnlinkedReferences(
  nodeId: string,
  searchText: string
): Promise<UnlinkedReference[]> {
  await initTauri();
  if (tauriInvoke) {
    return tauriInvoke('get_unlinked_references', { nodeId, searchText }) as Promise<UnlinkedReference[]>;
  }
  // Browser-only mode: return empty array
  return [];
}

// Convert a plain text mention to a wiki link
export async function convertMentionToLink(
  sourceNodeId: string,
  sourceDocumentId: string,
  targetNodeId: string,
  mentionText: string
): Promise<void> {
  await initTauri();
  if (tauriInvoke) {
    await tauriInvoke('convert_mention_to_link', {
      sourceNodeId,
      sourceDocumentId,
      targetNodeId,
      mentionText,
    });
    return;
  }
  // Browser-only mode: no-op
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

// Import OPML content into the current document
export async function importOpml(content: string): Promise<DocumentState> {
  await initTauri();
  if (tauriInvoke) {
    return tauriInvoke('import_opml', { content }) as Promise<DocumentState>;
  }
  // Browser-only mode: parse OPML client-side (basic implementation)
  // This is a simplified fallback - real parsing happens in Rust
  console.warn('OPML import not fully supported in browser-only mode');
  return mockState;
}

// Result from importing OPML as a new document
export interface ImportOpmlResult {
  doc_id: string;
  title: string;
  node_count: number;
}

// Import OPML content as a new document
export async function importOpmlAsDocument(content: string): Promise<ImportOpmlResult> {
  await initTauri();
  if (tauriInvoke) {
    return tauriInvoke('import_opml_as_document', { content }) as Promise<ImportOpmlResult>;
  }
  // Browser-only mode: create mock document
  console.warn('OPML import as document not fully supported in browser-only mode');
  return {
    doc_id: 'mock-import-' + Date.now(),
    title: 'Imported Document',
    node_count: 0,
  };
}

// Export current document to OPML format
export async function exportOpml(title: string): Promise<string> {
  await initTauri();
  if (tauriInvoke) {
    return tauriInvoke('export_opml', { title }) as Promise<string>;
  }
  // Browser-only mode: generate basic OPML
  return generateMockOpml(title);
}

// Export current document to Markdown format
export async function exportMarkdown(): Promise<string> {
  await initTauri();
  if (tauriInvoke) {
    return tauriInvoke('export_markdown') as Promise<string>;
  }
  // Browser-only mode: generate basic markdown
  return generateMockMarkdown();
}

// Export current document to JSON backup format
export async function exportJson(): Promise<string> {
  await initTauri();
  if (tauriInvoke) {
    return tauriInvoke('export_json') as Promise<string>;
  }
  // Browser-only mode: return mock state as JSON
  return JSON.stringify({
    version: 1,
    exported_at: new Date().toISOString(),
    nodes: mockState.nodes,
  }, null, 2);
}

// Export current document to standalone HTML
export async function exportHtml(title: string, darkMode: boolean = false): Promise<string> {
  await initTauri();
  if (tauriInvoke) {
    return tauriInvoke('export_html', { title, darkMode }) as Promise<string>;
  }
  // Browser-only mode: generate basic HTML
  return generateMockHtml(title, darkMode);
}

// Import JSON backup into the current document
export async function importJson(content: string): Promise<DocumentState> {
  await initTauri();
  if (tauriInvoke) {
    return tauriInvoke('import_json', { content }) as Promise<DocumentState>;
  }
  // Browser-only mode: parse JSON and merge into state
  try {
    const backup = JSON.parse(content);
    if (backup.nodes) {
      mockState.nodes = [...mockState.nodes, ...backup.nodes];
    }
    return { ...mockState };
  } catch {
    throw new Error('Invalid JSON backup format');
  }
}

// Helper: Generate basic OPML for browser-only mode
function generateMockOpml(title: string): string {
  const lines: string[] = [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<opml version="2.0">',
    '<head>',
    `<title>${escapeXml(title)}</title>`,
    '</head>',
    '<body>',
  ];

  function addNode(node: Node, indent: number) {
    const spaces = '  '.repeat(indent);
    const text = escapeXml(stripHtml(node.content));
    const children = mockState.nodes.filter(n => n.parent_id === node.id);

    if (children.length > 0) {
      lines.push(`${spaces}<outline text="${text}">`);
      children.sort((a, b) => a.position - b.position);
      for (const child of children) {
        addNode(child, indent + 1);
      }
      lines.push(`${spaces}</outline>`);
    } else {
      lines.push(`${spaces}<outline text="${text}"/>`);
    }
  }

  const roots = mockState.nodes.filter(n => !n.parent_id);
  roots.sort((a, b) => a.position - b.position);
  for (const root of roots) {
    addNode(root, 1);
  }

  lines.push('</body>');
  lines.push('</opml>');
  return lines.join('\n');
}

// Helper: Generate basic Markdown for browser-only mode
function generateMockMarkdown(): string {
  const lines: string[] = [];

  function addNode(node: Node, depth: number) {
    const indent = '  '.repeat(depth);
    const text = stripHtml(node.content);
    const bullet = node.is_checked ? '- [x]' : (node.node_type === 'checkbox' ? '- [ ]' : (node.node_type === 'numbered' ? '1.' : '-'));
    lines.push(`${indent}${bullet} ${text}`);

    if (node.note) {
      const noteIndent = '  '.repeat(depth + 1);
      lines.push(`${noteIndent}${node.note}`);
    }

    const children = mockState.nodes.filter(n => n.parent_id === node.id);
    children.sort((a, b) => a.position - b.position);
    for (const child of children) {
      addNode(child, depth + 1);
    }
  }

  const roots = mockState.nodes.filter(n => !n.parent_id);
  roots.sort((a, b) => a.position - b.position);
  for (const root of roots) {
    addNode(root, 0);
  }

  return lines.join('\n');
}

// Helper: Generate basic HTML for browser-only mode
function generateMockHtml(title: string, darkMode: boolean): string {
  const bg = darkMode ? '#1a1a2e' : '#ffffff';
  const fg = darkMode ? '#e0e0e0' : '#1a1a1a';
  const lines: string[] = [
    '<!DOCTYPE html>',
    '<html lang="en">',
    '<head>',
    '<meta charset="UTF-8">',
    `<title>${escapeXml(title)}</title>`,
    '<style>',
    `body { background: ${bg}; color: ${fg}; font-family: sans-serif; padding: 2rem; max-width: 48rem; margin: 0 auto; }`,
    'ul { list-style: disc; padding-left: 1.5rem; }',
    'li { margin: 0.25rem 0; }',
    '</style>',
    '</head>',
    '<body>',
    '<div class="outline">',
  ];

  function addNode(node: Node, children: Node[]) {
    const text = stripHtml(node.content);
    const prefix = node.is_checked ? '[x] ' : (node.node_type === 'checkbox' ? '[ ] ' : (node.node_type === 'numbered' ? `${node.position + 1}. ` : ''));
    lines.push(`<li>${prefix}${escapeXml(text)}`);
    const nodeChildren = mockState.nodes.filter(n => n.parent_id === node.id);
    nodeChildren.sort((a, b) => a.position - b.position);
    if (nodeChildren.length > 0) {
      lines.push('<ul>');
      for (const child of nodeChildren) {
        addNode(child, []);
      }
      lines.push('</ul>');
    }
    lines.push('</li>');
  }

  const roots = mockState.nodes.filter(n => !n.parent_id);
  roots.sort((a, b) => a.position - b.position);
  lines.push('<ul>');
  for (const root of roots) {
    addNode(root, []);
  }
  lines.push('</ul>');

  lines.push('</div>');
  lines.push('</body>');
  lines.push('</html>');
  return lines.join('\n');
}


// Helper: Escape XML special characters
function escapeXml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

// Data directory info from backend
export interface DataDirectoryInfo {
  current: string;
  default: string;
  is_custom: boolean;
}

// Get the current data directory configuration
export async function getDataDirectory(): Promise<DataDirectoryInfo> {
  await initTauri();
  if (tauriInvoke) {
    return tauriInvoke('get_data_directory') as Promise<DataDirectoryInfo>;
  }
  // Browser-only mode: return mock info
  return {
    current: '~/.outline-data',
    default: '~/.outline-data',
    is_custom: false,
  };
}

// Set the data directory (requires app restart to take full effect)
export async function setDataDirectory(path: string | null): Promise<DataDirectoryInfo> {
  await initTauri();
  if (tauriInvoke) {
    return tauriInvoke('set_data_directory', { path }) as Promise<DataDirectoryInfo>;
  }
  // Browser-only mode: return mock info
  return {
    current: path || '~/.outline-data',
    default: '~/.outline-data',
    is_custom: !!path,
  };
}

// Open a directory picker dialog and return the selected path
export async function pickDirectory(): Promise<string | null> {
  await initTauri();
  if (tauriInvoke) {
    return tauriInvoke('pick_directory') as Promise<string | null>;
  }
  // Browser-only mode: not supported
  console.warn('Directory picker not available in browser-only mode');
  return null;
}

// Open a file picker dialog and return the file content
export async function pickAndReadFile(filters: { name: string; extensions: string[] }[]): Promise<{ name: string; content: string } | null> {
  await initTauri();
  if (tauriInvoke) {
    return tauriInvoke('pick_and_read_file', { filters }) as Promise<{ name: string; content: string } | null>;
  }
  // Browser-only mode: use HTML file input
  return new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = filters.flatMap(f => f.extensions.map(e => `.${e}`)).join(',');
    input.onchange = async (e) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (!file) {
        resolve(null);
        return;
      }
      const content = await file.text();
      resolve({ name: file.name, content });
    };
    input.oncancel = () => resolve(null);
    input.click();
  });
}

// Import OPML from a file picker
export async function importOpmlFromPicker(): Promise<ImportOpmlResult | null> {
  const file = await pickAndReadFile([{ name: 'OPML', extensions: ['opml', 'xml'] }]);
  if (!file) return null;

  return importOpmlAsDocument(file.content);
}

// Open a URL in the system's default browser
export async function openUrl(url: string): Promise<void> {
  await initTauri();
  if (tauriInvoke) {
    // Use Tauri shell plugin to open URL
    const { open } = await import('@tauri-apps/plugin-shell');
    await open(url);
  } else {
    // Browser-only mode: use window.open
    window.open(url, '_blank', 'noopener,noreferrer');
  }
}

// ============================================================================
// Folder Management
// ============================================================================

// Folder structure for organizing documents
export interface Folder {
  id: string;
  name: string;
  position: number;
  collapsed: boolean;
}

// State of all folders and document assignments
export interface FolderState {
  folders: Folder[];
  document_folders: Record<string, string>; // doc_id -> folder_id
  document_order: Record<string, string[]>; // folder_id -> [doc_id, ...], "__root__" for root level
}

// Get all folders and document-folder assignments
export async function getFolders(): Promise<FolderState> {
  await initTauri();
  if (tauriInvoke) {
    return tauriInvoke('get_folders') as Promise<FolderState>;
  }
  // Browser-only mode: return empty state
  return {
    folders: [],
    document_folders: {},
    document_order: {},
  };
}

// Create a new folder
export async function createFolder(name: string): Promise<Folder> {
  await initTauri();
  if (tauriInvoke) {
    return tauriInvoke('create_folder', { name }) as Promise<Folder>;
  }
  // Browser-only mode: create mock folder
  return {
    id: 'mock-folder-' + Date.now(),
    name,
    position: 0,
    collapsed: false,
  };
}

// Update a folder's name or collapsed state
export async function updateFolder(
  id: string,
  name?: string,
  collapsed?: boolean
): Promise<Folder> {
  await initTauri();
  if (tauriInvoke) {
    return tauriInvoke('update_folder', { id, name, collapsed }) as Promise<Folder>;
  }
  // Browser-only mode: return mock folder
  return {
    id,
    name: name || 'Folder',
    position: 0,
    collapsed: collapsed || false,
  };
}

// Delete a folder (documents move to root level)
export async function deleteFolder(id: string): Promise<void> {
  await initTauri();
  if (tauriInvoke) {
    return tauriInvoke('delete_folder', { id }) as Promise<void>;
  }
  // Browser-only mode: no-op
}

// Move a document to a folder (or root level if folderId is null)
export async function moveDocumentToFolder(
  docId: string,
  folderId: string | null,
  position?: number
): Promise<void> {
  await initTauri();
  if (tauriInvoke) {
    return tauriInvoke('move_document_to_folder', {
      docId,
      folderId,
      position,
    }) as Promise<void>;
  }
  // Browser-only mode: no-op
}

// Reorder folders by providing the new order of folder IDs
export async function reorderFolders(folderIds: string[]): Promise<void> {
  await initTauri();
  if (tauriInvoke) {
    return tauriInvoke('reorder_folders', { folderIds }) as Promise<void>;
  }
  // Browser-only mode: no-op
}

// Reorder documents within a folder (or root level with folderKey "__root__")
export async function reorderDocuments(folderKey: string, docIds: string[]): Promise<void> {
  await initTauri();
  if (tauriInvoke) {
    return tauriInvoke('reorder_documents', { folderKey, docIds }) as Promise<void>;
  }
  // Browser-only mode: no-op
}

// ============================================================================
// Export Selection
// ============================================================================

// Export selected nodes to markdown format
export async function exportSelectionMarkdown(
  nodeIds: string[],
  includeCompletedChildren: boolean = true
): Promise<string> {
  await initTauri();
  if (tauriInvoke) {
    return tauriInvoke('export_selection_markdown', {
      nodeIds,
      includeCompletedChildren,
    }) as Promise<string>;
  }
  // Browser-only mode: generate markdown for selected nodes
  return generateSelectionMarkdown(nodeIds, includeCompletedChildren);
}

// Save content to a file using a native file dialog
export async function saveToFileWithDialog(
  content: string,
  suggestedFilename: string,
  extension: string
): Promise<string | null> {
  await initTauri();
  if (tauriInvoke) {
    return tauriInvoke('save_to_file_with_dialog', {
      content,
      suggestedFilename,
      extension,
    }) as Promise<string | null>;
  }
  // Browser-only mode: use download link
  const blob = new Blob([content], { type: 'text/plain' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = suggestedFilename;
  a.click();
  URL.revokeObjectURL(url);
  return suggestedFilename;
}

// Helper: Generate markdown for selected nodes in browser-only mode
function generateSelectionMarkdown(nodeIds: string[], includeCompletedChildren: boolean): string {
  const lines: string[] = [];
  const nodeSet = new Set(nodeIds);

  function addNode(node: Node, depth: number) {
    if (!includeCompletedChildren && node.is_checked && !nodeSet.has(node.id)) {
      return;
    }

    const indent = '  '.repeat(depth);
    const text = stripHtml(node.content);
    const bullet = node.is_checked ? '- [x]' : (node.node_type === 'checkbox' ? '- [ ]' : (node.node_type === 'numbered' ? '1.' : '-'));
    lines.push(`${indent}${bullet} ${text}`);

    if (node.note) {
      const noteIndent = '  '.repeat(depth + 1);
      lines.push(`${noteIndent}${node.note}`);
    }

    const children = mockState.nodes.filter(n => n.parent_id === node.id);
    children.sort((a, b) => a.position - b.position);
    for (const child of children) {
      addNode(child, depth + 1);
    }
  }

  // Process each selected node as a root
  for (const nodeId of nodeIds) {
    const node = mockState.nodes.find(n => n.id === nodeId);
    if (node) {
      addNode(node, 0);
    }
  }

  return lines.join('\n');
}

// Export selected nodes to plain text format (indented, no markdown syntax)
export async function exportSelectionPlainText(
  nodeIds: string[],
  includeCompletedChildren: boolean = true
): Promise<string> {
  await initTauri();
  if (tauriInvoke) {
    return tauriInvoke('export_selection_plain_text', {
      nodeIds,
      includeCompletedChildren,
    }) as Promise<string>;
  }
  // Browser-only mode: generate plain text for selected nodes
  return generateSelectionPlainText(nodeIds, includeCompletedChildren);
}

// Helper: Generate plain text for selected nodes in browser-only mode
function generateSelectionPlainText(nodeIds: string[], includeCompletedChildren: boolean): string {
  const lines: string[] = [];
  const nodeSet = new Set(nodeIds);

  function addNode(node: Node, depth: number) {
    if (!includeCompletedChildren && node.is_checked && !nodeSet.has(node.id)) {
      return;
    }

    const indent = '  '.repeat(depth);
    const text = stripHtml(node.content);
    lines.push(`${indent}${text}`);

    if (node.note) {
      const noteIndent = '  '.repeat(depth + 1);
      lines.push(`${noteIndent}${node.note}`);
    }

    const children = mockState.nodes.filter(n => n.parent_id === node.id);
    children.sort((a, b) => a.position - b.position);
    for (const child of children) {
      addNode(child, depth + 1);
    }
  }

  // Process each selected node as a root
  for (const nodeId of nodeIds) {
    const node = mockState.nodes.find(n => n.id === nodeId);
    if (node) {
      addNode(node, 0);
    }
  }

  return lines.join('\n');
}

// ============================================================================
// Capture Target
// ============================================================================

// Capture target type (where quick capture items go)
export interface CaptureTarget {
  document_id: string;
  node_id: string;
  default: boolean;
}

// Get the default capture target
export async function getDefaultCaptureTarget(): Promise<CaptureTarget | null> {
  await initTauri();
  if (tauriInvoke) {
    return tauriInvoke('get_default_capture_target') as Promise<CaptureTarget | null>;
  }
  // Browser-only mode: return null
  return null;
}

// ============================================================================
// Bookmarks
// ============================================================================

export interface Bookmark {
  node_id: string;
  document_id: string;
  label: string;
  emoji?: string | null;
  created_at: string;
}

export interface BookmarkState {
  bookmarks: Bookmark[];
}

// Get all bookmarks
export async function listBookmarks(): Promise<BookmarkState> {
  await initTauri();
  if (tauriInvoke) {
    return tauriInvoke('list_bookmarks') as Promise<BookmarkState>;
  }
  return { bookmarks: [] };
}

// Add a bookmark
export async function addBookmark(nodeId: string, documentId: string, label: string): Promise<Bookmark> {
  await initTauri();
  if (tauriInvoke) {
    return tauriInvoke('add_bookmark', { nodeId, documentId, label }) as Promise<Bookmark>;
  }
  return { node_id: nodeId, document_id: documentId, label, created_at: new Date().toISOString() };
}

// Remove a bookmark
export async function removeBookmark(nodeId: string): Promise<void> {
  await initTauri();
  if (tauriInvoke) {
    await tauriInvoke('remove_bookmark', { nodeId });
    return;
  }
}

// Update a bookmark's label
export async function updateBookmarkLabel(nodeId: string, label: string): Promise<Bookmark> {
  await initTauri();
  if (tauriInvoke) {
    return tauriInvoke('update_bookmark_label', { nodeId, label }) as Promise<Bookmark>;
  }
  return { node_id: nodeId, document_id: '', label, created_at: new Date().toISOString() };
}

// Update a bookmark's emoji
export async function updateBookmarkEmoji(nodeId: string, emoji: string | null): Promise<Bookmark> {
  await initTauri();
  if (tauriInvoke) {
    return tauriInvoke('update_bookmark_emoji', { nodeId, emoji }) as Promise<Bookmark>;
  }
  return { node_id: nodeId, document_id: '', label: '', emoji, created_at: new Date().toISOString() };
}

// Reorder bookmarks
export async function reorderBookmarks(nodeIds: string[]): Promise<void> {
  await initTauri();
  if (tauriInvoke) {
    await tauriInvoke('reorder_bookmarks', { nodeIds });
  }
}

// Custom emoji types
export interface CustomEmoji {
  src?: string;
  text?: string;
  added_at: string;
}

export interface CustomEmojiRegistry {
  version: number;
  emoji: Record<string, CustomEmoji>;
}

// Load custom emoji registry
export async function loadCustomEmoji(): Promise<CustomEmojiRegistry> {
  await initTauri();
  if (tauriInvoke) {
    return tauriInvoke('load_custom_emoji') as Promise<CustomEmojiRegistry>;
  }
  return { version: 1, emoji: {} };
}

// Add a custom emoji (image or text)
export async function addCustomEmoji(
  shortcode: string,
  src?: string,
  text?: string,
): Promise<CustomEmojiRegistry> {
  await initTauri();
  if (tauriInvoke) {
    return tauriInvoke('add_custom_emoji', {
      shortcode,
      src: src ?? null,
      text: text ?? null,
    }) as Promise<CustomEmojiRegistry>;
  }
  return { version: 1, emoji: {} };
}

// Remove a custom emoji by shortcode
export async function removeCustomEmoji(shortcode: string): Promise<CustomEmojiRegistry> {
  await initTauri();
  if (tauriInvoke) {
    return tauriInvoke('remove_custom_emoji', { shortcode }) as Promise<CustomEmojiRegistry>;
  }
  return { version: 1, emoji: {} };
}

// Copy an image file to the emoji images directory, returns relative path
export async function copyEmojiImage(sourcePath: string): Promise<string> {
  await initTauri();
  if (tauriInvoke) {
    return tauriInvoke('copy_emoji_image', { sourcePath }) as Promise<string>;
  }
  throw new Error('Copy emoji image not available in browser-only mode');
}

// Pick an emoji image file using native dialog
export async function pickEmojiImage(): Promise<string | null> {
  await initTauri();
  if (tauriInvoke) {
    return tauriInvoke('pick_emoji_image') as Promise<string | null>;
  }
  // Browser-only fallback: use HTML file input
  return new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.png,.gif,.svg,.webp,.jpg,.jpeg';
    input.onchange = (e) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (!file) {
        resolve(null);
        return;
      }
      // In browser mode we can't get the real path, return the name
      resolve(file.name);
    };
    input.oncancel = () => resolve(null);
    input.click();
  });
}

