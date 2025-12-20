/**
 * Zoom Store
 *
 * Manages zoom level with localStorage persistence.
 * Zoom is applied via CSS transform scale on the root element.
 */

const MIN_ZOOM = 0.5;  // 50%
const MAX_ZOOM = 2.0;  // 200%
const DEFAULT_ZOOM = 1.0;
const ZOOM_STEP = 0.1;

class ZoomStore {
  private _zoom = $state(DEFAULT_ZOOM);

  constructor() {
    // Will be initialized in init() to support SSR
  }

  init() {
    // Load saved zoom level
    const saved = localStorage.getItem('outline-zoom');
    if (saved) {
      const parsed = parseFloat(saved);
      if (!isNaN(parsed) && parsed >= MIN_ZOOM && parsed <= MAX_ZOOM) {
        this._zoom = parsed;
      }
    }

    // Apply initial zoom
    this.applyZoom();
  }

  get level() {
    return this._zoom;
  }

  get percentage() {
    return Math.round(this._zoom * 100);
  }

  zoomIn() {
    this.setZoom(Math.min(this._zoom + ZOOM_STEP, MAX_ZOOM));
  }

  zoomOut() {
    this.setZoom(Math.max(this._zoom - ZOOM_STEP, MIN_ZOOM));
  }

  reset() {
    this.setZoom(DEFAULT_ZOOM);
  }

  setZoom(level: number) {
    this._zoom = Math.round(level * 10) / 10; // Round to 1 decimal
    localStorage.setItem('outline-zoom', String(this._zoom));
    this.applyZoom();
  }

  private applyZoom() {
    // Apply zoom via CSS custom property and zoom CSS property
    document.documentElement.style.setProperty('--zoom-level', String(this._zoom));
    // Apply actual zoom using CSS zoom property for comprehensive scaling
    document.documentElement.style.zoom = String(this._zoom);
  }
}

export const zoom = new ZoomStore();
