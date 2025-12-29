import React, { useState, useEffect, useCallback } from 'react';

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
}

// TODO: This is a stub. Full settings migration requires:
// - Migrate settings.svelte to React (useSettingsStore)
// - Migrate theme.svelte to React (useThemeStore)
// - Add data directory API calls

export function SettingsModal({ isOpen, onClose }: SettingsModalProps) {
  // Keyboard handler for escape
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
      <div className="modal settings-modal" role="dialog" aria-modal="true" aria-labelledby="settings-title">
        <div className="modal-header">
          <h2 id="settings-title">Settings</h2>
          <button className="close-btn" onClick={onClose} aria-label="Close">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M18 6L6 18M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="modal-content">
          <section className="settings-section">
            <h3>Settings</h3>
            <p className="section-hint">
              Full settings will be available after completing the React migration.
            </p>
          </section>
        </div>

        <div className="modal-footer">
          <button className="btn-close" onClick={onClose}>
            Close
          </button>
        </div>
      </div>
    </div>
  );
}

export default SettingsModal;
