import React, { useState, useEffect, useRef, useCallback } from 'react';

/** Validate a slug — mirrors outline_core::data::short_ids::validate_prefix.
 *  Returns an error string, or null if valid. */
function validateSlug(slug: string): string | null {
  if (slug.length === 0) return 'Slug cannot be empty';
  if (slug.length > 16) return 'Slug must be 16 characters or fewer';
  if (!/^[a-z0-9]+$/.test(slug)) {
    return 'Slug must be lowercase letters and digits only (no hyphens, spaces, or uppercase)';
  }
  return null;
}

interface RenameModalProps {
  isOpen: boolean;
  currentName: string;
  itemType: 'document' | 'folder' | 'bookmark';
  /** Optional current slug (short-ID prefix). Only used when itemType === 'document'. */
  currentSlug?: string;
  onRename: (newName: string, newSlug?: string) => void;
  onClose: () => void;
}

export function RenameModal({
  isOpen,
  currentName,
  itemType,
  currentSlug,
  onRename,
  onClose,
}: RenameModalProps) {
  const [name, setName] = useState(currentName);
  const [slug, setSlug] = useState(currentSlug ?? '');
  const inputRef = useRef<HTMLInputElement>(null);

  const showSlug = itemType === 'document' && currentSlug !== undefined;

  // Reset fields when modal opens with new values
  useEffect(() => {
    if (isOpen) {
      setName(currentName);
      setSlug(currentSlug ?? '');
    }
  }, [isOpen, currentName, currentSlug]);

  // Focus and select name input when modal opens
  useEffect(() => {
    if (isOpen && inputRef.current) {
      setTimeout(() => {
        inputRef.current?.focus();
        inputRef.current?.select();
      }, 50);
    }
  }, [isOpen]);

  const trimmedName = name.trim();
  const trimmedSlug = slug.trim();
  const nameValid = trimmedName.length > 0;
  const slugError = showSlug ? validateSlug(trimmedSlug) : null;
  const slugValid = !showSlug || slugError === null;
  const isValid = nameValid && slugValid;

  const nameChanged = trimmedName !== currentName;
  const slugChanged = showSlug && trimmedSlug !== (currentSlug ?? '');
  const hasChanged = nameChanged || slugChanged;

  const handleSubmit = useCallback(() => {
    if (!isValid || !hasChanged) {
      onClose();
      return;
    }
    // Only pass name if it actually changed — callers use undefined to skip.
    const outName = nameChanged ? trimmedName : currentName;
    const outSlug = showSlug && slugChanged ? trimmedSlug : undefined;
    onRename(outName, outSlug);
    onClose();
  }, [
    isValid,
    hasChanged,
    nameChanged,
    slugChanged,
    trimmedName,
    trimmedSlug,
    currentName,
    showSlug,
    onRename,
    onClose,
  ]);

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

  return (
    <div className="modal-backdrop" onClick={handleBackdropClick}>
      <div className="modal rename-modal" role="dialog" aria-modal="true" aria-labelledby="rename-title">
        <div className="modal-header">
          <h3 id="rename-title">Rename {itemType.charAt(0).toUpperCase() + itemType.slice(1)}</h3>
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

          {showSlug && (
            <>
              <label htmlFor="rename-slug-input" className="input-label" style={{ marginTop: '1rem' }}>
                Slug
              </label>
              <input
                id="rename-slug-input"
                type="text"
                className="rename-input"
                value={slug}
                onChange={(e) => setSlug(e.target.value)}
                placeholder="slug"
                autoCapitalize="off"
                autoCorrect="off"
                spellCheck={false}
              />
              <div className="input-hint" style={{ marginTop: '0.25rem', fontSize: '0.85em', opacity: 0.7 }}>
                {slugError ?? `Used in short IDs (e.g. ${trimmedSlug || 'slug'}-a3f2)`}
              </div>
            </>
          )}
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
