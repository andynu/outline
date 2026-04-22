/**
 * Popup positioning utilities.
 *
 * The outline container uses CSS `zoom` (see zoomStore) to scale content.
 * CSS `zoom` is non-standard: it affects `position: fixed` descendants' length
 * values (so `left: 100px` on a fixed element inside `zoom: 2` renders at 200px)
 * but does NOT affect the returned values of `getBoundingClientRect()` — those
 * are already in actual viewport pixels.
 *
 * When a popup is rendered inside a zoomed container, we need to divide the
 * desired viewport coords by the zoom factor so the final rendered position
 * matches the intended viewport location.
 *
 * We read the `--zoom-level` custom property on `<html>` which is written by
 * zoomStore, falling back to 1.
 */

export function getZoomLevel(): number {
  if (typeof document === 'undefined') return 1;
  const raw = getComputedStyle(document.documentElement)
    .getPropertyValue('--zoom-level')
    .trim();
  const parsed = parseFloat(raw);
  return isNaN(parsed) || parsed <= 0 ? 1 : parsed;
}

/**
 * Position a popup relative to a trigger element, clamping to the viewport
 * and accounting for CSS `zoom` on an ancestor container.
 *
 * All inputs are in actual viewport pixels (i.e., what you get back from
 * getBoundingClientRect, which is already zoom-scaled). The returned
 * `{left, top}` are in the popup's own CSS coordinate space — i.e., suitable
 * to drop straight into `style.left` / `style.top` for an element rendered
 * inside the zoomed container.
 *
 * @param trigger - trigger bounds (from getBoundingClientRect)
 * @param popupSize - popup's measured size from getBoundingClientRect
 *                    (already zoom-scaled — what actually appears on screen)
 * @param opts.margin - viewport margin; default 10
 * @param opts.preferBelow - if true (default), try to place below; otherwise above
 * @param opts.gap - gap between trigger and popup in viewport pixels; default 5
 */
export interface PopupPlacement {
  left: number;
  top: number;
}

export function placePopup(
  trigger: { left: number; right: number; top: number; bottom: number },
  popupSize: { width: number; height: number },
  opts: { margin?: number; preferBelow?: boolean; gap?: number } = {}
): PopupPlacement {
  const margin = opts.margin ?? 10;
  const preferBelow = opts.preferBelow ?? true;
  const gap = opts.gap ?? 5;
  const zoom = getZoomLevel();

  const viewportWidth = window.innerWidth;
  const viewportHeight = window.innerHeight;

  // All math below operates in actual viewport pixels. `popupSize` is
  // assumed to be in viewport pixels (zoom-scaled), matching what
  // getBoundingClientRect returns and what will physically render on screen.
  let left = trigger.left;
  let top = preferBelow ? trigger.bottom + gap : trigger.top - popupSize.height - gap;

  // Clamp horizontally so the popup never crosses either viewport edge.
  if (left + popupSize.width > viewportWidth - margin) {
    left = viewportWidth - popupSize.width - margin;
  }
  if (left < margin) left = margin;

  // Clamp vertically — flip above if there's no room below.
  if (top + popupSize.height > viewportHeight - margin) {
    if (preferBelow) {
      const above = trigger.top - popupSize.height - gap;
      if (above >= margin) {
        top = above;
      } else {
        top = viewportHeight - popupSize.height - margin;
      }
    } else {
      top = viewportHeight - popupSize.height - margin;
    }
  }
  if (top < margin) top = margin;

  // Convert viewport pixels to the popup's local (pre-zoom) coordinate space.
  // The popup renders inside a zoomed ancestor, so CSS `left`/`top` values
  // are multiplied by `zoom` at render time — divide to compensate.
  return {
    left: left / zoom,
    top: top / zoom,
  };
}
