/**
 * Session state persistence - remembers what the user was working on
 * across app restarts. Stored in localStorage (not synced between machines).
 */

export interface SessionState {
  documentId?: string;
  zoomedNodeId?: string;
  focusedNodeId?: string;
  scrollTop?: number;
  timestamp?: number;
}

const STORAGE_KEY = 'outline-session-state';
let saveTimeout: number | null = null;

/**
 * Load the session state from localStorage.
 * Returns undefined if no session state is saved.
 */
export function loadSessionState(): SessionState | undefined {
  if (typeof window === 'undefined') return undefined;

  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (!stored) return undefined;

    const state = JSON.parse(stored) as SessionState;

    // Validate basic structure
    if (typeof state !== 'object' || state === null) return undefined;

    return state;
  } catch (e) {
    console.warn('Failed to load session state:', e);
    return undefined;
  }
}

// Pending state updates to merge before saving
let pendingUpdates: SessionState = {};

/**
 * Save the session state to localStorage.
 * This merges with existing state and is debounced to avoid excessive writes.
 */
export function saveSessionState(update: Partial<SessionState>): void {
  if (typeof window === 'undefined') return;

  // Merge with pending updates
  pendingUpdates = { ...pendingUpdates, ...update };

  // Cancel any pending save
  if (saveTimeout !== null) {
    clearTimeout(saveTimeout);
  }

  // Debounce saves by 500ms
  saveTimeout = window.setTimeout(() => {
    try {
      // Load existing state and merge with pending updates
      const existingState = loadSessionState() || {};
      const mergedState = {
        ...existingState,
        ...pendingUpdates,
        timestamp: Date.now(),
      };
      localStorage.setItem(STORAGE_KEY, JSON.stringify(mergedState));
      pendingUpdates = {}; // Clear pending updates after successful save
    } catch (e) {
      console.warn('Failed to save session state:', e);
    }
    saveTimeout = null;
  }, 500);
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

  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch (e) {
    console.warn('Failed to clear session state:', e);
  }
}
