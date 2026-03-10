import { create } from 'zustand';
import * as api from '../lib/api';
import type { Bookmark } from '../lib/api';

interface BookmarkStore {
  bookmarks: Bookmark[];
  loaded: boolean;

  // Actions
  load: () => Promise<void>;
  add: (nodeId: string, documentId: string, label: string) => Promise<void>;
  remove: (nodeId: string) => Promise<void>;
  updateLabel: (nodeId: string, label: string) => Promise<void>;
  updateEmoji: (nodeId: string, emoji: string | null) => Promise<void>;
  reorder: (nodeIds: string[]) => Promise<void>;
  isBookmarked: (nodeId: string) => boolean;
}

export const useBookmarkStore = create<BookmarkStore>((set, get) => ({
  bookmarks: [],
  loaded: false,

  load: async () => {
    try {
      const state = await api.listBookmarks();
      set({ bookmarks: state.bookmarks, loaded: true });
    } catch (e) {
      console.error('Failed to load bookmarks:', e);
      set({ loaded: true });
    }
  },

  add: async (nodeId, documentId, label) => {
    const bookmark = await api.addBookmark(nodeId, documentId, label);
    set(state => ({
      bookmarks: [...state.bookmarks, bookmark],
    }));
  },

  remove: async (nodeId) => {
    await api.removeBookmark(nodeId);
    set(state => ({
      bookmarks: state.bookmarks.filter(b => b.node_id !== nodeId),
    }));
  },

  updateLabel: async (nodeId, label) => {
    const updated = await api.updateBookmarkLabel(nodeId, label);
    set(state => ({
      bookmarks: state.bookmarks.map(b =>
        b.node_id === nodeId ? updated : b
      ),
    }));
  },

  updateEmoji: async (nodeId, emoji) => {
    const updated = await api.updateBookmarkEmoji(nodeId, emoji);
    set(state => ({
      bookmarks: state.bookmarks.map(b =>
        b.node_id === nodeId ? updated : b
      ),
    }));
  },

  reorder: async (nodeIds) => {
    // Optimistic update: reorder locally first
    const { bookmarks } = get();
    const byId = new Map(bookmarks.map(b => [b.node_id, b]));
    const reordered = nodeIds.map(id => byId.get(id)).filter(Boolean) as Bookmark[];
    set({ bookmarks: reordered });

    try {
      await api.reorderBookmarks(nodeIds);
    } catch (e) {
      console.error('Failed to reorder bookmarks:', e);
      // Reload from backend on failure
      const state = await api.listBookmarks();
      set({ bookmarks: state.bookmarks });
    }
  },

  isBookmarked: (nodeId) => {
    return get().bookmarks.some(b => b.node_id === nodeId);
  },
}));
