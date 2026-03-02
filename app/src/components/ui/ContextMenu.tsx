import React, { useRef, useEffect, useCallback, useState } from 'react';

export type ColorOption = {
  name: string;
  value: string;  // color value (e.g., 'red') or '' for clear
  cssColor: string;  // CSS color for the swatch
};

type MenuItem = {
  label: string;
  action: () => void;
  disabled?: boolean;
  separator?: false;
  shortcut?: string;
  colorPicker?: undefined;
  headingPicker?: undefined;
} | {
  separator: true;
  label?: undefined;
  action?: undefined;
  disabled?: undefined;
  shortcut?: undefined;
  colorPicker?: undefined;
  headingPicker?: undefined;
} | {
  colorPicker: true;
  label: string;
  colors: ColorOption[];
  currentColor?: string;
  onSelectColor: (color: string) => void;
  separator?: false;
  action?: undefined;
  disabled?: undefined;
  shortcut?: undefined;
  headingPicker?: undefined;
} | {
  headingPicker: true;
  currentLevel: number | null;
  onSelect: (level: number) => void;
  separator?: false;
  label?: undefined;
  action?: undefined;
  disabled?: undefined;
  shortcut?: undefined;
  colorPicker?: undefined;
};

interface ContextMenuProps {
  items: MenuItem[];
  position: { x: number; y: number };
  onClose: () => void;
}

/** Custom event name used to coordinate context menu exclusivity across the app. */
export const CLOSE_ALL_CONTEXT_MENUS = 'close-all-context-menus';

/** Dispatch a close event so all open context menus dismiss themselves. */
export function closeAllContextMenus() {
  document.dispatchEvent(new CustomEvent(CLOSE_ALL_CONTEXT_MENUS));
}

export function ContextMenu({ items, position, onClose }: ContextMenuProps) {
  const menuRef = useRef<HTMLDivElement>(null);
  const [adjustedPosition, setAdjustedPosition] = useState(position);
  const [maxHeight, setMaxHeight] = useState<number | undefined>(undefined);
  const [isPositioned, setIsPositioned] = useState(false);
  const [focusedIndex, setFocusedIndex] = useState(-1);
  const instanceId = useRef(Symbol('context-menu'));

  // Get indices of actionable (non-separator, non-disabled, non-colorPicker, non-headingPicker) items
  const actionableIndices = items.reduce<number[]>((acc, item, i) => {
    if (!item.separator && !item.disabled && !('colorPicker' in item && item.colorPicker) && !('headingPicker' in item && item.headingPicker)) acc.push(i);
    return acc;
  }, []);

  // Adjust position to keep menu on-screen
  useEffect(() => {
    if (menuRef.current) {
      const menu = menuRef.current;
      const viewportWidth = window.innerWidth;
      const viewportHeight = window.innerHeight;
      const padding = 10;

      const menuWidth = menu.offsetWidth;
      // Use scrollHeight to get the full content height, even if CSS max-height
      // has already constrained offsetHeight
      const menuHeight = menu.scrollHeight;

      let x = position.x;
      let y = position.y;

      // Adjust if menu extends past right edge
      if (x + menuWidth > viewportWidth - padding) {
        // Try flipping to the left of the click point
        const flippedX = position.x - menuWidth;
        if (flippedX >= padding) {
          x = flippedX;
        } else {
          // If flipping doesn't fit either, pin to right edge with padding
          x = viewportWidth - menuWidth - padding;
        }
      }

      // Ensure menu doesn't go past left edge
      if (x < padding) {
        x = padding;
      }

      // Keep the menu top near the click point. If the menu would extend
      // below the viewport, cap its height and let it scroll rather than
      // pushing the menu far away from the click point.
      const availableBelow = viewportHeight - y - padding;
      const availableAbove = y - padding;

      if (menuHeight <= availableBelow) {
        // Menu fits below the click point — no adjustment needed
        setMaxHeight(undefined);
      } else if (menuHeight <= availableAbove) {
        // Menu fits above the click point — flip upward
        y = y - menuHeight;
        setMaxHeight(undefined);
      } else {
        // Menu doesn't fully fit in either direction.
        // Use whichever direction has more space, and cap the height with scrolling.
        if (availableBelow >= availableAbove) {
          // Keep top near click point, cap height to available space below
          setMaxHeight(availableBelow);
        } else {
          // Position at top padding, cap height to available space above click point
          y = padding;
          setMaxHeight(availableAbove);
        }
      }

      // Ensure menu doesn't go above top edge
      if (y < padding) {
        y = padding;
      }

      setAdjustedPosition({ x, y });
      setIsPositioned(true);
    }
  }, [position]);

  // Close when another context menu opens (global coordination).
  // On mount, broadcast close so any previously open menu dismisses itself.
  useEffect(() => {
    const id = instanceId.current;

    // Tell all other context menus to close.
    document.dispatchEvent(new CustomEvent(CLOSE_ALL_CONTEXT_MENUS, { detail: id }));

    const handleCloseAll = (e: Event) => {
      // Ignore the event we just dispatched ourselves.
      if ((e as CustomEvent).detail === id) return;
      onClose();
    };

    document.addEventListener(CLOSE_ALL_CONTEXT_MENUS, handleCloseAll);
    return () => {
      document.removeEventListener(CLOSE_ALL_CONTEXT_MENUS, handleCloseAll);
    };
  }, [onClose]);

  // Close on click outside, right-click outside, and escape
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        onClose();
      }
    };

    const handleKeydown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onClose();
        return;
      }

      if (!actionableIndices.length) return;

      const currentActionablePos = actionableIndices.indexOf(focusedIndex);

      switch (event.key) {
        case 'ArrowDown': {
          event.preventDefault();
          const next = currentActionablePos < 0 ? 0 : Math.min(currentActionablePos + 1, actionableIndices.length - 1);
          setFocusedIndex(actionableIndices[next]);
          break;
        }
        case 'ArrowUp': {
          event.preventDefault();
          const prev = currentActionablePos <= 0 ? 0 : currentActionablePos - 1;
          setFocusedIndex(actionableIndices[prev]);
          break;
        }
        case 'Home': {
          event.preventDefault();
          setFocusedIndex(actionableIndices[0]);
          break;
        }
        case 'End': {
          event.preventDefault();
          setFocusedIndex(actionableIndices[actionableIndices.length - 1]);
          break;
        }
        case 'Enter': {
          event.preventDefault();
          if (focusedIndex >= 0) {
            const item = items[focusedIndex];
            if (item && !item.separator && item.action && !item.disabled) {
              item.action();
              onClose();
            }
          }
          break;
        }
      }
    };

    // Delay to avoid immediate close from the same click
    const timeoutId = setTimeout(() => {
      document.addEventListener('click', handleClickOutside);
      document.addEventListener('contextmenu', handleClickOutside);
      document.addEventListener('keydown', handleKeydown);
    }, 0);

    return () => {
      clearTimeout(timeoutId);
      document.removeEventListener('click', handleClickOutside);
      document.removeEventListener('contextmenu', handleClickOutside);
      document.removeEventListener('keydown', handleKeydown);
    };
  }, [onClose, focusedIndex, actionableIndices, items]);

  // Focus the button when focusedIndex changes
  useEffect(() => {
    if (focusedIndex >= 0 && menuRef.current) {
      const buttons = menuRef.current.querySelectorAll<HTMLButtonElement>('button[role="menuitem"]');
      // Map focusedIndex to button index (skip separators, colorPicker, and headingPicker rows)
      let buttonIdx = 0;
      for (let i = 0; i < items.length; i++) {
        if (i === focusedIndex) break;
        const it = items[i];
        if (!it.separator && !('colorPicker' in it && it.colorPicker) && !('headingPicker' in it && it.headingPicker)) buttonIdx++;
      }
      buttons[buttonIdx]?.focus();
    }
  }, [focusedIndex, items]);

  const handleItemClick = useCallback((item: MenuItem) => {
    if (!item.separator && item.action && !item.disabled) {
      item.action();
      onClose();
    }
  }, [onClose]);

  return (
    <div
      ref={menuRef}
      className="context-menu"
      style={{
        left: isPositioned ? adjustedPosition.x : -9999,
        top: isPositioned ? adjustedPosition.y : -9999,
        visibility: isPositioned ? 'visible' : 'hidden',
        ...(maxHeight != null ? { maxHeight } : {}),
      }}
      role="menu"
    >
      {items.map((item, index) => {
        if (item.separator) {
          return <div key={index} className="separator" />;
        }

        if ('colorPicker' in item && item.colorPicker) {
          return (
            <div key={index} className="menu-item color-picker-row">
              <span className="label">{item.label}</span>
              <span className="color-swatches">
                {item.colors.map((color) => (
                  <button
                    key={color.value}
                    className={`color-swatch ${item.currentColor === color.value || (!item.currentColor && color.value === '') ? 'active' : ''}`}
                    style={color.value ? { backgroundColor: color.cssColor } : undefined}
                    onClick={() => { item.onSelectColor(color.value); onClose(); }}
                    title={color.name}
                    aria-label={`Set color: ${color.name}`}
                  >
                    {!color.value && <span className="clear-icon">&#x2715;</span>}
                  </button>
                ))}
              </span>
            </div>
          );
        }

        if ('headingPicker' in item && item.headingPicker) {
          const levels = [1, 2, 3, 4, 5, 6, 0];
          return (
            <div key={index} className="menu-item heading-picker-row">
              <span className="label">H</span>
              <span className="heading-buttons">
                {levels.map((level) => (
                  <button
                    key={level}
                    className={`heading-btn ${item.currentLevel === level || (level === 0 && item.currentLevel == null) ? 'active' : ''}`}
                    onClick={() => { item.onSelect(level); onClose(); }}
                    title={level === 0 ? 'Normal text (Ctrl+0)' : `Heading ${level} (Ctrl+${level})`}
                    aria-label={level === 0 ? 'Normal text' : `Heading ${level}`}
                  >
                    {level === 0 ? 'N' : level}
                  </button>
                ))}
              </span>
            </div>
          );
        }

        return (
          <button
            key={index}
            className={`menu-item ${item.disabled ? 'disabled' : ''}`}
            onClick={() => handleItemClick(item)}
            disabled={item.disabled}
            role="menuitem"
          >
            <span className="label">{item.label}</span>
            {item.shortcut && (
              <span className="shortcut">{item.shortcut}</span>
            )}
          </button>
        );
      })}
    </div>
  );
}

export default ContextMenu;
