/**
 * Store for custom emoji loaded from the Rust backend.
 * Custom emoji can be text-based (kaomoji) or image-based (GIF/PNG in ~/.outline-data/emoji/).
 */

import { create } from 'zustand';

export interface CustomEmoji {
  /** Relative image path within the emoji directory */
  src?: string;
  /** Text representation (e.g. kaomoji) */
  text?: string;
  added_at: string;
}

export interface CustomEmojiRegistry {
  version: number;
  emoji: Record<string, CustomEmoji>;
}

interface CustomEmojiState {
  /** Map of shortcode -> CustomEmoji */
  emoji: Record<string, CustomEmoji>;
  /** Resolved base URL for image emoji (asset protocol URL for emoji dir) */
  emojiBaseUrl: string | null;
  /** Whether the store has been loaded from the backend */
  loaded: boolean;
  /** Load custom emoji from backend */
  load: () => Promise<void>;
  /** Look up a custom emoji by shortcode, returns the emoji or null */
  lookup: (shortcode: string) => CustomEmoji | null;
  /** Resolve an image src to a full URL usable in <img> tags */
  resolveImageUrl: (src: string) => string | null;
}

export const useCustomEmojiStore = create<CustomEmojiState>((set, get) => ({
  emoji: {},
  emojiBaseUrl: null,
  loaded: false,

  load: async () => {
    if (get().loaded) return;
    try {
      const api = await import('../lib/api');
      // Check if we're in Tauri mode
      if (typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window) {
        const { invoke } = await import('@tauri-apps/api/core');
        const { convertFileSrc } = await import('@tauri-apps/api/core');

        const registry = await invoke('load_custom_emoji') as CustomEmojiRegistry;
        const dataDir = await api.getDataDirectory();

        // Build asset protocol URL for the emoji directory
        const emojiDirPath = dataDir.current.replace(/\/$/, '') + '/emoji';
        const baseUrl = convertFileSrc(emojiDirPath);

        set({
          emoji: registry.emoji,
          emojiBaseUrl: baseUrl,
          loaded: true,
        });
      } else {
        // Browser-only mode: no custom emoji
        set({ emoji: {}, emojiBaseUrl: null, loaded: true });
      }
    } catch (e) {
      console.error('[CustomEmoji] Failed to load:', e);
      set({ emoji: {}, emojiBaseUrl: null, loaded: true });
    }
  },

  lookup: (shortcode: string) => {
    const { emoji } = get();
    return emoji[shortcode.toLowerCase()] ?? null;
  },

  resolveImageUrl: (src: string) => {
    const { emojiBaseUrl } = get();
    if (!emojiBaseUrl) return null;
    return `${emojiBaseUrl}/${src}`;
  },
}));

/**
 * Resolve a custom emoji shortcode to insertable content.
 * Returns:
 * - { type: 'text', content: string } for text emoji
 * - { type: 'image', url: string, shortcode: string } for image emoji
 * - null if not a custom emoji
 */
export function resolveCustomEmoji(shortcode: string): {
  type: 'text';
  content: string;
} | {
  type: 'image';
  url: string;
  shortcode: string;
} | null {
  const store = useCustomEmojiStore.getState();
  const emoji = store.lookup(shortcode);
  if (!emoji) return null;

  if (emoji.text) {
    return { type: 'text', content: emoji.text };
  }

  if (emoji.src) {
    const url = store.resolveImageUrl(emoji.src);
    if (url) {
      return { type: 'image', url, shortcode };
    }
  }

  return null;
}
