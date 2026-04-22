/**
 * Session state persistence - remembers what the user was working on
 * across app restarts. Stored in localStorage (not synced between machines).
 *
 * Schema v2: zoom/focus/scroll are keyed per-document so switching between
 * documents does not clobber each other's state. Legacy flat shape (v1)
 * is migrated on load into the current document's slot.
 */

export interface PerDocumentState {
  zoomedNodeId?: string;
  focusedNodeId?: string;
  scrollTop?: number;
}

export interface SessionState {
  /** Currently active document id (the one to restore on startup). */
  documentId?: string;
  /** Per-document zoom/focus/scroll. Keys are document ids. */
  perDocument?: Record<string, PerDocumentState>;
  /** Millisecond timestamp of last save. */
  timestamp?: number;
}

/**
 * Legacy v1 shape that stored a single focused/zoomed/scroll globally.
 * Kept for typing the migration path.
 */
interface LegacySessionStateV1 {
  documentId?: string;
  zoomedNodeId?: string;
  focusedNodeId?: string;
  scrollTop?: number;
  timestamp?: number;
}

const STORAGE_KEY = 'outline-session-state';
let saveTimeout: number | null = null;

/**
 * Migrate an object parsed from localStorage into the current SessionState
 * shape. Idempotent: calling on an already-migrated state is a no-op.
 */
function migrate(raw: unknown): SessionState | undefined {
  if (typeof raw !== 'object' || raw === null) return undefined;
  const obj = raw as LegacySessionStateV1 & SessionState;

  // Already v2.
  if (obj.perDocument && typeof obj.perDocument === 'object') {
    return {
      documentId: obj.documentId,
      perDocument: obj.perDocument,
      timestamp: obj.timestamp,
    };
  }

  // v1 → v2 migration. If we have any of the flat fields and a documentId,
  // fold them into perDocument[documentId]. If there's no documentId, the
  // flat values can't be scoped to any doc — drop them (they'd be wrong
  // applied to whatever doc opens).
  const perDocument: Record<string, PerDocumentState> = {};
  if (obj.documentId) {
    const slot: PerDocumentState = {};
    if (obj.focusedNodeId) slot.focusedNodeId = obj.focusedNodeId;
    if (obj.zoomedNodeId) slot.zoomedNodeId = obj.zoomedNodeId;
    if (typeof obj.scrollTop === 'number') slot.scrollTop = obj.scrollTop;
    if (Object.keys(slot).length > 0) {
      perDocument[obj.documentId] = slot;
    }
  }

  return {
    documentId: obj.documentId,
    perDocument,
    timestamp: obj.timestamp,
  };
}

/**
 * Load the session state from localStorage.
 * Returns undefined if no session state is saved.
 */
export function loadSessionState(): SessionState | undefined {
  if (typeof window === 'undefined') return undefined;

  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (!stored) return undefined;

    const parsed = JSON.parse(stored);
    return migrate(parsed);
  } catch (e) {
    console.warn('Failed to load session state:', e);
    return undefined;
  }
}

/**
 * Retrieve the per-document slot for a given document id, or an empty object.
 */
export function getDocumentState(
  state: SessionState | undefined,
  documentId: string | undefined,
): PerDocumentState {
  if (!state || !documentId) return {};
  return state.perDocument?.[documentId] ?? {};
}

// Pending top-level updates (documentId) to merge before saving.
let pendingTopLevel: Partial<Pick<SessionState, 'documentId'>> = {};
// Pending per-document updates, keyed by documentId.
let pendingPerDocument: Record<string, PerDocumentState> = {};

function scheduleFlush(): void {
  if (saveTimeout !== null) {
    clearTimeout(saveTimeout);
  }
  saveTimeout = window.setTimeout(() => {
    try {
      const existing = loadSessionState() ?? {};
      const mergedPerDocument: Record<string, PerDocumentState> = {
        ...(existing.perDocument ?? {}),
      };
      for (const [docId, slot] of Object.entries(pendingPerDocument)) {
        mergedPerDocument[docId] = {
          ...(mergedPerDocument[docId] ?? {}),
          ...slot,
        };
      }

      const merged: SessionState = {
        ...existing,
        ...pendingTopLevel,
        perDocument: mergedPerDocument,
        timestamp: Date.now(),
      };
      localStorage.setItem(STORAGE_KEY, JSON.stringify(merged));
      pendingTopLevel = {};
      pendingPerDocument = {};
    } catch (e) {
      console.warn('Failed to save session state:', e);
    }
    saveTimeout = null;
  }, 500);
}

/**
 * Save top-level session fields (currently just `documentId`).
 * Debounced 500ms.
 */
export function saveSessionState(update: Partial<Pick<SessionState, 'documentId'>>): void {
  if (typeof window === 'undefined') return;
  pendingTopLevel = { ...pendingTopLevel, ...update };
  scheduleFlush();
}

/**
 * Save per-document fields (focus, zoom, scroll) for the given document id.
 * Debounced 500ms. Calls with different document ids within a single debounce
 * window are all merged on flush.
 */
export function savePerDocumentState(
  documentId: string,
  update: Partial<PerDocumentState>,
): void {
  if (typeof window === 'undefined') return;
  if (!documentId) return;
  pendingPerDocument[documentId] = {
    ...(pendingPerDocument[documentId] ?? {}),
    ...update,
  };
  scheduleFlush();
}

/**
 * Synchronously flush any pending writes. Useful before an action that
 * should take effect immediately (e.g. switching documents, where we want
 * the outgoing doc's state persisted before the new doc overwrites its
 * live values).
 */
export function flushSessionState(): void {
  if (typeof window === 'undefined') return;
  if (saveTimeout === null && Object.keys(pendingTopLevel).length === 0 && Object.keys(pendingPerDocument).length === 0) {
    return;
  }
  if (saveTimeout !== null) {
    clearTimeout(saveTimeout);
    saveTimeout = null;
  }
  try {
    const existing = loadSessionState() ?? {};
    const mergedPerDocument: Record<string, PerDocumentState> = {
      ...(existing.perDocument ?? {}),
    };
    for (const [docId, slot] of Object.entries(pendingPerDocument)) {
      mergedPerDocument[docId] = {
        ...(mergedPerDocument[docId] ?? {}),
        ...slot,
      };
    }
    const merged: SessionState = {
      ...existing,
      ...pendingTopLevel,
      perDocument: mergedPerDocument,
      timestamp: Date.now(),
    };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(merged));
    pendingTopLevel = {};
    pendingPerDocument = {};
  } catch (e) {
    console.warn('Failed to flush session state:', e);
  }
}

/**
 * Clear the saved session state.
 */
export function clearSessionState(): void {
  if (typeof window === 'undefined') return;

  if (saveTimeout !== null) {
    clearTimeout(saveTimeout);
    saveTimeout = null;
  }
  pendingTopLevel = {};
  pendingPerDocument = {};

  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch (e) {
    console.warn('Failed to clear session state:', e);
  }
}
