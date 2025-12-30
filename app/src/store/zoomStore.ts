/**
 * Zoom Store
 *
 * Manages zoom level with localStorage persistence.
 * Zoom is applied via CSS zoom property on the root element.
 */
import { create } from 'zustand';

const MIN_ZOOM = 0.5;  // 50%
const MAX_ZOOM = 2.0;  // 200%
const DEFAULT_ZOOM = 1.0;
const ZOOM_STEP = 0.1;
const STORAGE_KEY = 'outline-zoom';

interface ZoomState {
  level: number;
  percentage: number;
  zoomIn: () => void;
  zoomOut: () => void;
  reset: () => void;
  setZoom: (level: number) => void;
  init: () => void;
}

function applyZoom(level: number) {
  // Apply zoom via CSS custom property and zoom CSS property
  document.documentElement.style.setProperty('--zoom-level', String(level));
  // Apply actual zoom using CSS zoom property for comprehensive scaling
  document.documentElement.style.zoom = String(level);
}

export const useZoomStore = create<ZoomState>((set, get) => ({
  level: DEFAULT_ZOOM,
  percentage: 100,

  init: () => {
    // Load saved zoom level from localStorage
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) {
      const parsed = parseFloat(saved);
      if (!isNaN(parsed) && parsed >= MIN_ZOOM && parsed <= MAX_ZOOM) {
        set({ level: parsed, percentage: Math.round(parsed * 100) });
        applyZoom(parsed);
        return;
      }
    }
    // Apply default zoom
    applyZoom(DEFAULT_ZOOM);
  },

  zoomIn: () => {
    const { level } = get();
    const newLevel = Math.min(level + ZOOM_STEP, MAX_ZOOM);
    const rounded = Math.round(newLevel * 10) / 10;
    set({ level: rounded, percentage: Math.round(rounded * 100) });
    localStorage.setItem(STORAGE_KEY, String(rounded));
    applyZoom(rounded);
  },

  zoomOut: () => {
    const { level } = get();
    const newLevel = Math.max(level - ZOOM_STEP, MIN_ZOOM);
    const rounded = Math.round(newLevel * 10) / 10;
    set({ level: rounded, percentage: Math.round(rounded * 100) });
    localStorage.setItem(STORAGE_KEY, String(rounded));
    applyZoom(rounded);
  },

  reset: () => {
    set({ level: DEFAULT_ZOOM, percentage: 100 });
    localStorage.setItem(STORAGE_KEY, String(DEFAULT_ZOOM));
    applyZoom(DEFAULT_ZOOM);
  },

  setZoom: (level: number) => {
    const clamped = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, level));
    const rounded = Math.round(clamped * 10) / 10;
    set({ level: rounded, percentage: Math.round(rounded * 100) });
    localStorage.setItem(STORAGE_KEY, String(rounded));
    applyZoom(rounded);
  },
}));
