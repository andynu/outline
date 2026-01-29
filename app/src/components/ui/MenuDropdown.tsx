import React, { useEffect, useRef, useCallback } from 'react';

interface MenuItem {
  label: string;
  shortcut?: string;
  action: () => void;
  separator?: false;
  disabled?: boolean;
}

interface MenuSeparator {
  separator: true;
}

export type MenuEntry = MenuItem | MenuSeparator;

interface MenuDropdownProps {
  label: string;
  items: MenuEntry[];
  isOpen: boolean;
  onOpen: () => void;
  onClose: () => void;
}

export function MenuDropdown({ label, items, isOpen, onOpen, onClose }: MenuDropdownProps) {
  const buttonRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  const handleButtonClick = useCallback(() => {
    if (isOpen) {
      onClose();
    } else {
      onOpen();
    }
  }, [isOpen, onOpen, onClose]);

  const handleItemClick = useCallback((item: MenuItem) => {
    item.action();
    onClose();
  }, [onClose]);

  // Handle keyboard and click outside
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && isOpen) {
        onClose();
        buttonRef.current?.focus();
      }
    };

    const handleClickOutside = (event: MouseEvent) => {
      if (!isOpen) return;
      const target = event.target as Node;
      if (buttonRef.current?.contains(target)) return;
      if (menuRef.current?.contains(target)) return;
      onClose();
    };

    document.addEventListener('click', handleClickOutside);
    document.addEventListener('keydown', handleKeyDown);

    return () => {
      document.removeEventListener('click', handleClickOutside);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [isOpen, onClose]);

  return (
    <div className="menu-dropdown">
      <button
        ref={buttonRef}
        className={`menu-trigger ${isOpen ? 'open' : ''}`}
        onClick={handleButtonClick}
        aria-expanded={isOpen}
        aria-haspopup="menu"
      >
        {label}
      </button>

      {isOpen && (
        <div ref={menuRef} className="menu-content" role="menu">
          {items.map((item, index) => {
            if (item.separator) {
              return <div key={`sep-${index}`} className="menu-separator" role="separator"></div>;
            }
            return (
              <button
                key={item.label}
                className="menu-item-btn"
                role="menuitem"
                onClick={() => !item.disabled && handleItemClick(item)}
                disabled={item.disabled}
              >
                <span className="item-label">{item.label}</span>
                {item.shortcut && (
                  <span className="item-shortcut">{item.shortcut}</span>
                )}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

export default MenuDropdown;
