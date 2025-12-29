import React, { useEffect, useCallback } from 'react';

interface KeyboardShortcutsModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export function KeyboardShortcutsModal({ isOpen, onClose }: KeyboardShortcutsModalProps) {
  // Keyboard handler
  useEffect(() => {
    if (!isOpen) return;

    const handleKeydown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        onClose();
      }
    };

    window.addEventListener('keydown', handleKeydown);
    return () => window.removeEventListener('keydown', handleKeydown);
  }, [isOpen, onClose]);

  const handleBackdropClick = useCallback((event: React.MouseEvent) => {
    if (event.target === event.currentTarget) {
      onClose();
    }
  }, [onClose]);

  if (!isOpen) {
    return null;
  }

  return (
    <div className="modal-backdrop" onClick={handleBackdropClick}>
      <div className="modal keyboard-shortcuts-modal">
        <div className="modal-header">
          <h2>Keyboard Shortcuts</h2>
          <button className="close-btn" onClick={onClose} aria-label="Close">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M18 6L6 18M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="shortcut-grid">
          <div className="shortcut-group">
            <h4>Application</h4>
            <ul>
              <li><kbd>Ctrl+S</kbd> Save</li>
              <li><kbd>Ctrl+Z</kbd> Undo</li>
              <li><kbd>Ctrl+Y</kbd> Redo</li>
              <li><kbd>Ctrl+Q</kbd> Quit</li>
              <li><kbd>Ctrl+/</kbd> This help</li>
              <li><kbd>Ctrl+,</kbd> Settings</li>
            </ul>
          </div>
          <div className="shortcut-group">
            <h4>Editing</h4>
            <ul>
              <li><kbd>Enter</kbd> New sibling</li>
              <li><kbd>Tab</kbd> Indent</li>
              <li><kbd>Shift+Tab</kbd> Outdent</li>
              <li><kbd>Ctrl+Shift+Backspace</kbd> Delete</li>
            </ul>
          </div>
          <div className="shortcut-group">
            <h4>Navigation</h4>
            <ul>
              <li><kbd>↑</kbd> / <kbd>↓</kbd> Move focus</li>
              <li><kbd>Shift+↑</kbd> Move up</li>
              <li><kbd>Shift+↓</kbd> Move down</li>
              <li><kbd>Ctrl+Home</kbd> First item</li>
              <li><kbd>Ctrl+End</kbd> Last item</li>
              <li><kbd>Alt+H</kbd> Go to parent</li>
              <li><kbd>Alt+L</kbd> Go to child</li>
              <li><kbd>Alt+K</kbd> Prev sibling</li>
              <li><kbd>Alt+J</kbd> Next sibling</li>
              <li><kbd>Ctrl+O</kbd> Go to document</li>
              <li><kbd>Ctrl+Shift+O</kbd> Go to item</li>
              <li><kbd>Ctrl+Shift+M</kbd> Move item to...</li>
            </ul>
          </div>
          <div className="shortcut-group">
            <h4>Search & View</h4>
            <ul>
              <li><kbd>Ctrl+F</kbd> Search document</li>
              <li><kbd>Ctrl+Shift+F</kbd> Global search</li>
              <li><kbd>Ctrl+I</kbd> Inbox</li>
              <li><kbd>Ctrl+Shift+H</kbd> Hide completed</li>
              <li><kbd>Ctrl+Shift+#</kbd> Tags panel</li>
              <li><kbd>Ctrl+Shift+G</kbd> Web search</li>
            </ul>
          </div>
          <div className="shortcut-group">
            <h4>View</h4>
            <ul>
              <li><kbd>Ctrl+.</kbd> Toggle collapse</li>
              <li><kbd>Ctrl+Shift+.</kbd> Collapse all</li>
              <li><kbd>Ctrl+Shift+,</kbd> Expand all</li>
            </ul>
          </div>
          <div className="shortcut-group">
            <h4>Tasks & Dates</h4>
            <ul>
              <li><kbd>Ctrl+Shift+X</kbd> Toggle checkbox</li>
              <li><kbd>Ctrl+Enter</kbd> Check/uncheck</li>
              <li><kbd>Ctrl+D</kbd> Set date</li>
              <li><kbd>Ctrl+Shift+D</kbd> Clear date</li>
              <li><kbd>Ctrl+R</kbd> Set recurrence</li>
              <li><kbd>Ctrl+Shift+T</kbd> Date views</li>
            </ul>
          </div>
          <div className="shortcut-group">
            <h4>Formatting</h4>
            <ul>
              <li><kbd>Ctrl+B</kbd> Bold</li>
              <li><kbd>Ctrl+I</kbd> Italic</li>
              <li><kbd>**text**</kbd> Bold</li>
              <li><kbd>*text*</kbd> Italic</li>
            </ul>
          </div>
        </div>

        <div className="modal-footer">
          <span className="hint">
            <kbd>Esc</kbd> Close
          </span>
        </div>
      </div>
    </div>
  );
}

export default KeyboardShortcutsModal;
