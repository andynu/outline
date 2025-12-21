import type { DocumentState, Node, NodeChanges, Operation } from './types';

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
    console.log('[API] load_document via Tauri');
    const result = await tauriInvoke('load_document', { docId }) as DocumentState;
    console.log('[API] loaded', result.nodes.length, 'nodes');
    return result;
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

// Create a new document with a unique ID
export async function createDocument(): Promise<string> {
  await initTauri();
  if (tauriInvoke) {
    // Generate a new UUID for the document
    const newId = crypto.randomUUID();
    // Loading a non-existent document will create it
    await tauriInvoke('load_document', { docId: newId });
    return newId;
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

// Inbox item type
export interface InboxItem {
  id: string;
  content: string;
  note?: string;
  capture_date: string;
  captured_at: string;
  source?: string;
}

// Get all inbox items
export async function getInbox(): Promise<InboxItem[]> {
  await initTauri();
  if (tauriInvoke) {
    return tauriInvoke('get_inbox') as Promise<InboxItem[]>;
  }
  // Browser-only mode: return empty
  return [];
}

// Get inbox item count
export async function getInboxCount(): Promise<number> {
  await initTauri();
  if (tauriInvoke) {
    return tauriInvoke('get_inbox_count') as Promise<number>;
  }
  return 0;
}

// Clear processed inbox items
export async function clearInboxItems(ids: string[]): Promise<void> {
  await initTauri();
  if (tauriInvoke) {
    await tauriInvoke('clear_inbox_items', { ids });
    return;
  }
  // Browser-only mode: no-op
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
    const bullet = node.is_checked ? '- [x]' : (node.node_type === 'checkbox' ? '- [ ]' : '-');
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

// Helper: Strip HTML tags
function stripHtml(html: string): string {
  return html.replace(/<[^>]*>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .trim();
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
