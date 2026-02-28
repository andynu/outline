import React, { useRef, useEffect, useCallback, useState } from 'react';

type MenuItem = {
  label: string;
  action: () => void;
  disabled?: boolean;
  separator?: false;
  shortcut?: string;
} | {
  separator: true;
  label?: undefined;
  action?: undefined;
  disabled?: undefined;
  shortcut?: undefined;
};

interface ContextMenuProps {
  items: MenuItem[];
  position: { x: number; y: number };
  onClose: () => void;
}

export function ContextMenu({ items, position, onClose }: ContextMenuProps) {
  const menuRef = useRef<HTMLDivElement>(null);
  const [adjustedPosition, setAdjustedPosition] = useState(position);
  const [focusedIndex, setFocusedIndex] = useState(-1);

  // Get indices of actionable (non-separator, non-disabled) items
  const actionableIndices = items.reduce<number[]>((acc, item, i) => {
    if (!item.separator && !item.disabled) acc.push(i);
    return acc;
  }, []);

  // Adjust position to keep menu on-screen
  useEffect(() => {
    if (menuRef.current) {
      const rect = menuRef.current.getBoundingClientRect();
      const viewportWidth = window.innerWidth;
      const viewportHeight = window.innerHeight;

      let x = position.x;
      let y = position.y;

      // Adjust if menu extends past right edge
      if (x + rect.width > viewportWidth - 10) {
        x = viewportWidth - rect.width - 10;
      }

      // Adjust if menu extends past bottom edge
      if (y + rect.height > viewportHeight - 10) {
        y = viewportHeight - rect.height - 10;
      }

      // Ensure menu doesn't go above top edge
      if (y < 10) {
        y = 10;
      }

      // Ensure menu doesn't go past left edge
      if (x < 10) {
        x = 10;
      }

      setAdjustedPosition({ x, y });
    }
  }, [position]);

  // Close on click outside and escape
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
      document.addEventListener('keydown', handleKeydown);
    }, 0);

    return () => {
      clearTimeout(timeoutId);
      document.removeEventListener('click', handleClickOutside);
      document.removeEventListener('keydown', handleKeydown);
    };
  }, [onClose, focusedIndex, actionableIndices, items]);

  // Focus the button when focusedIndex changes
  useEffect(() => {
    if (focusedIndex >= 0 && menuRef.current) {
      const buttons = menuRef.current.querySelectorAll<HTMLButtonElement>('button[role="menuitem"]');
      // Map focusedIndex to button index (skip separators)
      let buttonIdx = 0;
      for (let i = 0; i < items.length; i++) {
        if (i === focusedIndex) break;
        if (!items[i].separator) buttonIdx++;
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
      style={{ left: adjustedPosition.x, top: adjustedPosition.y }}
      role="menu"
    >
      {items.map((item, index) => {
        if (item.separator) {
          return <div key={index} className="separator" />;
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
