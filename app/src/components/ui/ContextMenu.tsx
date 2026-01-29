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
  }, [onClose]);

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
