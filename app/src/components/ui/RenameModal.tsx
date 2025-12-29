import React, { useState, useEffect, useRef, useCallback } from 'react';

interface RenameModalProps {
  isOpen: boolean;
  currentName: string;
  itemType: 'document' | 'folder';
  onRename: (newName: string) => void;
  onClose: () => void;
}

export function RenameModal({ isOpen, currentName, itemType, onRename, onClose }: RenameModalProps) {
  const [name, setName] = useState(currentName);
  const inputRef = useRef<HTMLInputElement>(null);

  // Reset name when modal opens with new currentName
  useEffect(() => {
    if (isOpen) {
      setName(currentName);
    }
  }, [isOpen, currentName]);

  // Focus and select input when modal opens
  useEffect(() => {
    if (isOpen && inputRef.current) {
      setTimeout(() => {
        inputRef.current?.focus();
        inputRef.current?.select();
      }, 50);
    }
  }, [isOpen]);

  const handleSubmit = useCallback(() => {
    const trimmedName = name.trim();
    if (trimmedName && trimmedName !== currentName) {
      onRename(trimmedName);
    }
    onClose();
  }, [name, currentName, onRename, onClose]);

  // Keyboard handler
  useEffect(() => {
    if (!isOpen) return;

    const handleKeydown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        onClose();
      } else if (event.key === 'Enter') {
        event.preventDefault();
        handleSubmit();
      }
    };

    window.addEventListener('keydown', handleKeydown);
    return () => window.removeEventListener('keydown', handleKeydown);
  }, [isOpen, onClose, handleSubmit]);

  const handleBackdropClick = useCallback((event: React.MouseEvent) => {
    if (event.target === event.currentTarget) {
      onClose();
    }
  }, [onClose]);

  if (!isOpen) {
    return null;
  }

  const isValid = name.trim().length > 0;
  const hasChanged = name.trim() !== currentName;

  return (
    <div className="modal-backdrop" onClick={handleBackdropClick}>
      <div className="modal rename-modal" role="dialog" aria-modal="true" aria-labelledby="rename-title">
        <div className="modal-header">
          <h2 id="rename-title">Rename {itemType}</h2>
          <button className="close-btn" onClick={onClose} aria-label="Close">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M18 6L6 18M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="modal-content">
          <label htmlFor="rename-input" className="input-label">
            Name
          </label>
          <input
            ref={inputRef}
            id="rename-input"
            type="text"
            className="rename-input"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder={`Enter ${itemType} name...`}
          />
        </div>

        <div className="modal-footer">
          <button className="btn-cancel" onClick={onClose}>
            Cancel
          </button>
          <button
            className="btn-primary"
            onClick={handleSubmit}
            disabled={!isValid || !hasChanged}
          >
            Rename
          </button>
        </div>
      </div>
    </div>
  );
}

export default RenameModal;
