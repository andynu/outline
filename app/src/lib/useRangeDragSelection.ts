import { useEffect, RefObject } from 'react';
import { useSelectionStore } from '../store/selectionStore';
import { useOutlineStore } from '../store/outlineStore';

/**
 * Distance in CSS pixels the pointer must move after mousedown before a
 * range-drag gesture begins. Small enough to feel responsive, large enough
 * that a regular click never trips it.
 */
const DRAG_THRESHOLD_PX = 5;

/**
 * CSS selectors that should NEVER start a range-drag when the mousedown
 * lands inside them. These are areas with their own mouse behavior:
 *   - .drag-handle      : reorder drag (HTML5 drag-and-drop)
 *   - .editor-container : focused TipTap editor — user is selecting text
 *   - .hover-menu-btn   : three-dot context menu button
 *   - .short-id-badge   : clickable badge that copies short ID
 *   - .date-badge       : clickable date editor triggers
 *   - .recurrence-indicator, .bookmark-indicator : clickable badges
 *   - .note-content     : note body (has its own link click handler)
 *   - a, button, input, textarea : interactive elements
 */
const EXCLUDED_SELECTOR = [
  '.drag-handle',
  '.editor-container',
  '.hover-menu-btn',
  '.short-id-badge',
  '.date-badge',
  '.recurrence-indicator',
  '.bookmark-indicator',
  '.note-content',
  'a',
  'button',
  'input',
  'textarea',
].join(',');

/**
 * Extract the node id for an .outline-item ancestor of the given element.
 *
 * Our outline items don't carry a data-node-id attribute on the wrapper
 * itself today, so we locate the item by its DOM position and map it back
 * to the id via the visible-nodes array. That mapping happens at use-site;
 * this helper just returns the DOM element so callers can identify items
 * by pointer hit-testing.
 */
function findOutlineItemElement(el: Element | null): HTMLElement | null {
  if (!el) return null;
  const item = (el as HTMLElement).closest('.outline-item');
  return item as HTMLElement | null;
}

/**
 * Install a click-and-drag range selection gesture on the outline container.
 *
 * Behavior:
 *   - Mousedown on an outline item (outside excluded areas) arms a pending drag.
 *   - If the pointer moves more than DRAG_THRESHOLD_PX before mouseup, the
 *     drag begins: selection is extended from the anchor item to whatever
 *     item the cursor is currently over, and keeps updating on mousemove.
 *   - On mouseup, if a drag actually happened, the subsequent click event
 *     is swallowed so it doesn't re-focus the release target.
 *   - If the threshold was never crossed, nothing is suppressed and normal
 *     click behavior (focus the item) runs as usual.
 *
 * The gesture coexists with existing behavior:
 *   - Shift+click still calls selectRange via the existing click handler.
 *   - Ctrl/Cmd+click still toggles selection.
 *   - Drag-handle drag-to-reorder is unaffected (excluded area).
 *   - Text selection inside the focused TipTap editor is unaffected
 *     (.editor-container is an excluded area).
 */
export function useRangeDragSelection(
  containerRef: RefObject<HTMLElement | null>,
): void {
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    // Mutable gesture state shared between listeners. Kept local to the
    // effect so only one active gesture exists per container at a time.
    let anchorItemId: string | null = null;
    let startX = 0;
    let startY = 0;
    let dragActive = false;
    // Last item id we extended to — used to avoid redundant selectRange calls
    // when the pointer moves within the same item.
    let lastToId: string | null = null;
    // Set to true between drag start and the following click so we can
    // suppress that click. Cleared in the click capture handler.
    let suppressNextClick = false;

    const resolveItemId = (el: HTMLElement): string | null => {
      // Build a flat list of rendered .outline-item elements in DOM order and
      // match it up with the store's visible nodes. Since getVisibleNodes()
      // returns items in the same order they're rendered, index-based mapping
      // works without requiring extra DOM attributes.
      const all = Array.from(container.querySelectorAll('.outline-item')) as HTMLElement[];
      const idx = all.indexOf(el);
      if (idx < 0) return null;

      const visible = useOutlineStore.getState().getVisibleNodes();
      if (idx >= visible.length) return null;
      return visible[idx].id;
    };

    const onMouseDown = (e: MouseEvent) => {
      // Only primary button, no modifiers (shift/ctrl/meta have existing semantics
      // via the per-item click handlers — don't interfere).
      if (e.button !== 0) return;
      if (e.shiftKey || e.ctrlKey || e.metaKey || e.altKey) return;

      const target = e.target as HTMLElement | null;
      if (!target) return;

      // Ignore mousedowns on interactive or excluded regions.
      if (target.closest(EXCLUDED_SELECTOR)) return;

      const itemEl = findOutlineItemElement(target);
      if (!itemEl) return;

      // We need to resolve the anchor id now because the visible-node list
      // and DOM order are stable during a single drag gesture.
      const id = resolveItemId(itemEl);
      if (!id) return;

      anchorItemId = id;
      startX = e.clientX;
      startY = e.clientY;
      dragActive = false;
      lastToId = null;
    };

    const onMouseMove = (e: MouseEvent) => {
      if (!anchorItemId) return;

      if (!dragActive) {
        const dx = e.clientX - startX;
        const dy = e.clientY - startY;
        if (dx * dx + dy * dy < DRAG_THRESHOLD_PX * DRAG_THRESHOLD_PX) return;
        dragActive = true;
        // Seed selection with just the anchor so the UI flips into multi-select
        // mode immediately once the threshold is crossed.
        useSelectionStore.getState().selectRangeFromAnchor(anchorItemId, anchorItemId);
        lastToId = anchorItemId;
        // Blow away any native text selection the browser started on mousedown
        // so we don't end up with ugly blue-highlighted text on top of our
        // multi-select visuals.
        window.getSelection()?.removeAllRanges();
      }

      // While the drag is active, keep the browser from expanding its own
      // text selection in response to pointer movement.
      if (dragActive) e.preventDefault();

      // Hit-test the element currently under the pointer to find the target item.
      // elementFromPoint ignores children of the anchor inside its own bounds.
      const hit = document.elementFromPoint(e.clientX, e.clientY);
      const itemEl = findOutlineItemElement(hit);
      if (!itemEl) return;

      const toId = resolveItemId(itemEl);
      if (!toId || toId === lastToId) return;

      lastToId = toId;
      useSelectionStore.getState().selectRangeFromAnchor(anchorItemId, toId);
      // Keep native selection clear throughout the drag.
      window.getSelection()?.removeAllRanges();
    };

    const onMouseUp = () => {
      if (dragActive) {
        // Prevent the upcoming click event from re-focusing the release target
        // or otherwise acting on the drag endpoint.
        suppressNextClick = true;
      }
      anchorItemId = null;
      dragActive = false;
      lastToId = null;
    };

    // Capture-phase click suppressor — runs before any per-item click handler,
    // so we can stop propagation and preventDefault cleanly.
    const onClickCapture = (e: MouseEvent) => {
      if (!suppressNextClick) return;
      suppressNextClick = false;
      e.stopPropagation();
      e.preventDefault();
    };

    container.addEventListener('mousedown', onMouseDown);
    // mousemove/mouseup on window so the gesture continues even if the pointer
    // leaves the container (e.g. auto-scroll, or drag off the bottom edge).
    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);
    // Use capture so we intercept before bubbling click listeners on items.
    container.addEventListener('click', onClickCapture, true);

    return () => {
      container.removeEventListener('mousedown', onMouseDown);
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);
      container.removeEventListener('click', onClickCapture, true);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [containerRef.current]);
}
