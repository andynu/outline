import React, { useState, useEffect, useCallback } from 'react';
import * as api from '../../lib/api';
import { useCustomEmojiStore } from '../../store/customEmojiStore';
import type { CustomEmoji } from '../../store/customEmojiStore';

interface CustomEmojiManagerProps {
  isOpen: boolean;
  onClose: () => void;
}

export function CustomEmojiManager({ isOpen, onClose }: CustomEmojiManagerProps) {
  // Emoji list from store
  const emoji = useCustomEmojiStore(s => s.emoji);
  const emojiBaseUrl = useCustomEmojiStore(s => s.emojiBaseUrl);
  const reload = useCustomEmojiStore(s => s.reload);

  // Add form state
  const [selectedFilePath, setSelectedFilePath] = useState<string | null>(null);
  const [selectedFileName, setSelectedFileName] = useState('');
  const [shortcode, setShortcode] = useState('');
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [isAdding, setIsAdding] = useState(false);
  const [error, setError] = useState('');
  const [removingShortcode, setRemovingShortcode] = useState<string | null>(null);

  // Reset form state when modal opens
  useEffect(() => {
    if (isOpen) {
      resetForm();
    }
  }, [isOpen]);

  // Escape to close
  useEffect(() => {
    if (!isOpen) return;
    const handleKeydown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeydown);
    return () => window.removeEventListener('keydown', handleKeydown);
  }, [isOpen, onClose]);

  function resetForm() {
    setSelectedFilePath(null);
    setSelectedFileName('');
    setShortcode('');
    setPreviewUrl(null);
    setError('');
    setIsAdding(false);
  }

  function filenameToShortcode(filename: string): string {
    // Remove extension, lowercase, spaces to underscores
    const name = filename.replace(/\.[^.]+$/, '');
    return name.toLowerCase().replace(/\s+/g, '_').replace(/[^a-z0-9_-]/g, '');
  }

  const handlePickImage = useCallback(async () => {
    setError('');
    try {
      const path = await api.pickEmojiImage();
      if (path == null) return;

      setSelectedFilePath(path);
      // Extract filename from path
      const parts = path.replace(/\\/g, '/').split('/');
      const filename = parts[parts.length - 1];
      setSelectedFileName(filename);
      setShortcode(filenameToShortcode(filename));

      // Create preview URL using Tauri asset protocol
      if (typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window) {
        const { convertFileSrc } = await import('@tauri-apps/api/core');
        setPreviewUrl(convertFileSrc(path));
      } else {
        // Browser fallback -- won't work for real files
        setPreviewUrl(null);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to pick image');
    }
  }, []);

  const handleAdd = useCallback(async () => {
    if (!selectedFilePath || !shortcode.trim()) return;

    const trimmedShortcode = shortcode.trim().toLowerCase();

    // Validate shortcode format
    if (!/^[a-z0-9_-]+$/.test(trimmedShortcode)) {
      setError('Shortcode may only contain lowercase letters, numbers, underscores, and hyphens');
      return;
    }

    // Check for duplicates
    if (emoji[trimmedShortcode]) {
      setError(`Shortcode ":${trimmedShortcode}:" already exists`);
      return;
    }

    setIsAdding(true);
    setError('');
    try {
      // 1. Copy image file to emoji directory
      const relativePath = await api.copyEmojiImage(selectedFilePath);

      // 2. Register the emoji
      await api.addCustomEmoji(trimmedShortcode, relativePath);

      // 3. Reload store
      await reload();

      // 4. Reset form
      resetForm();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to add emoji');
    } finally {
      setIsAdding(false);
    }
  }, [selectedFilePath, shortcode, emoji, reload]);

  const handleRemove = useCallback(async (sc: string) => {
    setRemovingShortcode(sc);
    setError('');
    try {
      await api.removeCustomEmoji(sc);
      await reload();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to remove emoji');
    } finally {
      setRemovingShortcode(null);
    }
  }, [reload]);

  function resolveImageUrl(src: string): string | null {
    if (!emojiBaseUrl) return null;
    return `${emojiBaseUrl}/${src}`;
  }

  const handleBackdropClick = useCallback((e: React.MouseEvent) => {
    if (e.target === e.currentTarget) onClose();
  }, [onClose]);

  if (!isOpen) return null;

  const emojiEntries = Object.entries(emoji);

  return (
    <div className="modal-backdrop" onClick={handleBackdropClick}>
      <div
        className="modal custom-emoji-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="custom-emoji-title"
      >
        <div className="modal-header">
          <h2 id="custom-emoji-title">Custom Emoji</h2>
          <button className="close-btn" onClick={onClose} aria-label="Close">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M18 6L6 18M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="modal-content">
          {/* Add new emoji section */}
          <section className="custom-emoji-add-section">
            <h3>Add New Emoji</h3>

            <div className="custom-emoji-add-form">
              {/* File picker */}
              <div className="custom-emoji-file-row">
                <button
                  className="custom-emoji-pick-btn"
                  onClick={handlePickImage}
                  disabled={isAdding}
                >
                  {selectedFileName || 'Choose Image...'}
                </button>
                <span className="custom-emoji-file-hint">PNG, SVG, GIF, WebP</span>
              </div>

              {/* Preview */}
              {previewUrl && (
                <div className="custom-emoji-preview-row">
                  <span className="custom-emoji-preview-label">Preview:</span>
                  <div className="custom-emoji-preview-container">
                    <div className="custom-emoji-preview-bg custom-emoji-preview-light">
                      <img src={previewUrl} alt="Preview" className="custom-emoji-preview-img" />
                    </div>
                    <div className="custom-emoji-preview-bg custom-emoji-preview-dark">
                      <img src={previewUrl} alt="Preview" className="custom-emoji-preview-img" />
                    </div>
                  </div>
                </div>
              )}

              {/* Shortcode input */}
              {selectedFilePath && (
                <div className="custom-emoji-shortcode-row">
                  <label htmlFor="emoji-shortcode" className="custom-emoji-shortcode-label">
                    Shortcode:
                  </label>
                  <div className="custom-emoji-shortcode-input-wrap">
                    <span className="custom-emoji-shortcode-colon">:</span>
                    <input
                      id="emoji-shortcode"
                      type="text"
                      className="custom-emoji-shortcode-input"
                      value={shortcode}
                      onChange={e => setShortcode(e.target.value)}
                      placeholder="my_emoji"
                      disabled={isAdding}
                    />
                    <span className="custom-emoji-shortcode-colon">:</span>
                  </div>
                </div>
              )}

              {/* Error message */}
              {error && <div className="custom-emoji-error">{error}</div>}

              {/* Add button */}
              {selectedFilePath && (
                <button
                  className="custom-emoji-add-btn"
                  onClick={handleAdd}
                  disabled={isAdding || !shortcode.trim()}
                >
                  {isAdding ? 'Adding...' : 'Add Emoji'}
                </button>
              )}
            </div>
          </section>

          {/* Existing emoji list */}
          {emojiEntries.length > 0 && (
            <section className="custom-emoji-list-section">
              <h3>Your Custom Emoji ({emojiEntries.length})</h3>
              <div className="custom-emoji-list">
                {emojiEntries.map(([sc, ce]: [string, CustomEmoji]) => {
                  const imgUrl = ce.src ? resolveImageUrl(ce.src) : null;
                  return (
                    <div key={sc} className="custom-emoji-list-item">
                      <div className="custom-emoji-list-item-preview">
                        {imgUrl ? (
                          <img src={imgUrl} alt={sc} className="custom-emoji-list-item-img" />
                        ) : ce.text ? (
                          <span className="custom-emoji-list-item-text">{ce.text}</span>
                        ) : null}
                      </div>
                      <span className="custom-emoji-list-item-shortcode">:{sc}:</span>
                      <button
                        className="custom-emoji-list-item-remove"
                        onClick={() => handleRemove(sc)}
                        disabled={removingShortcode === sc}
                        title={`Remove :${sc}:`}
                        aria-label={`Remove :${sc}:`}
                      >
                        {removingShortcode === sc ? '...' : (
                          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="14" height="14">
                            <path d="M18 6L6 18M6 6l12 12" />
                          </svg>
                        )}
                      </button>
                    </div>
                  );
                })}
              </div>
            </section>
          )}
        </div>

        <div className="modal-footer">
          <button className="btn-close" onClick={onClose}>Close</button>
        </div>
      </div>
    </div>
  );
}

export default CustomEmojiManager;
