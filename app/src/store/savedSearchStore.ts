import { create } from 'zustand';

export interface SavedSearch {
  id: string;
  name: string;
  query: string;
}

interface SavedSearchState {
  savedSearches: SavedSearch[];
  addSavedSearch: (name: string, query: string) => void;
  removeSavedSearch: (id: string) => void;
}

const STORAGE_KEY = 'outline-saved-searches';

function loadFromStorage(): SavedSearch[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return JSON.parse(raw);
  } catch {
    // ignore
  }
  return [];
}

function saveToStorage(searches: SavedSearch[]) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(searches));
}

export const useSavedSearchStore = create<SavedSearchState>((set) => ({
  savedSearches: loadFromStorage(),

  addSavedSearch: (name, query) => {
    const search: SavedSearch = {
      id: crypto.randomUUID(),
      name,
      query,
    };
    set((state) => {
      const updated = [...state.savedSearches, search];
      saveToStorage(updated);
      return { savedSearches: updated };
    });
  },

  removeSavedSearch: (id) => {
    set((state) => {
      const updated = state.savedSearches.filter((s) => s.id !== id);
      saveToStorage(updated);
      return { savedSearches: updated };
    });
  },
}));
