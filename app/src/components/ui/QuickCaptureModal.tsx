import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useOutlineStore } from '../../store/outlineStore';
import * as api from '../../lib/api';
import type { InboxSetting } from '../../lib/api';

interface QuickCaptureModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentDocumentId?: string;
}

export function QuickCaptureModal({ isOpen, onClose, currentDocumentId }: QuickCaptureModalProps) {
  const [content, setContent] = useState('');
  const [inboxSetting, setInboxSetting] = useState<InboxSetting | null>(null);
  const [inboxNodeName, setInboxNodeName] = useState<string>('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  // Store access
  const load = useOutlineStore(state => state.load);
  const getNode = useOutlineStore(state => state.getNode);
  const nodes = useOutlineStore(state => state.nodes);

  // Load inbox setting when modal opens
  useEffect(() => {
    if (isOpen) {
      setContent('');
      setError(null);
      loadInboxInfo();
      // Focus input after a brief delay
      setTimeout(() => {
        inputRef.current?.focus();
      }, 100);
    }
  }, [isOpen]);

  // Update inbox node name when we have the setting and nodes
  useEffect(() => {
    if (inboxSetting && nodes.length > 0) {
      const node = getNode(inboxSetting.node_id);
      if (node) {
        // Strip HTML tags for display
        const text = node.content.replace(/<[^>]*>/g, '').trim();
        setInboxNodeName(text || 'Inbox');
      }
    }
  }, [inboxSetting, nodes, getNode]);

  async function loadInboxInfo() {
    setLoading(true);
    try {
      const setting = await api.getInboxSetting();
      setInboxSetting(setting);
      if (!setting) {
        setError('No inbox configured. Right-click an item and select "Set as Inbox" to configure.');
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load inbox settings');
    } finally {
      setLoading(false);
    }
  }

  const handleSubmit = useCallback(async () => {
    if (!content.trim() || !inboxSetting) return;

    setSubmitting(true);
    setError(null);

    try {
      // Check if we need to switch documents
      if (currentDocumentId !== inboxSetting.document_id) {
        await load(inboxSetting.document_id);
      }

      // Get the inbox node to find max position among children
      const store = useOutlineStore.getState();
      const inboxChildren = store.nodes.filter(n => n.parent_id === inboxSetting.node_id);
      const maxPosition = inboxChildren.reduce((max, n) => Math.max(max, n.position), -1);
      const newPosition = maxPosition + 1;

      // Create the node as a child of the inbox node
      const result = await api.createNode(inboxSetting.node_id, newPosition, content.trim());

      if (result) {
        store.updateFromState(result.state);
        // Success - close modal
        onClose();
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to capture item');
    } finally {
      setSubmitting(false);
    }
  }, [content, inboxSetting, currentDocumentId, load, onClose]);

  // Handle keyboard events
  useEffect(() => {
    if (!isOpen) return;

    const handleKeydown = (event: KeyboardEvent) => {
      const mod = event.ctrlKey || event.metaKey;

      // Escape closes modal
      if (event.key === 'Escape') {
        event.preventDefault();
        onClose();
        return;
      }

      // Enter (or Ctrl+Enter) submits
      if (event.key === 'Enter' && (mod || !event.shiftKey)) {
        // Shift+Enter allows newlines
        if (!event.shiftKey || mod) {
          event.preventDefault();
          handleSubmit();
          return;
        }
      }
    };

    window.addEventListener('keydown', handleKeydown);
    return () => window.removeEventListener('keydown', handleKeydown);
  }, [isOpen, onClose, handleSubmit]);

  const handleBackdropClick = useCallback((e: React.MouseEvent) => {
    if (e.target === e.currentTarget) {
      onClose();
    }
  }, [onClose]);

  if (!isOpen) {
    return null;
  }

  return (
    <div className="modal-backdrop" onClick={handleBackdropClick}>
      <div className="modal quick-capture-modal">
        <div className="modal-header">
          <h2>Quick Capture</h2>
          <button className="close-btn" onClick={onClose}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M18 6L6 18M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="modal-content">
          {loading ? (
            <div className="loading">Loading...</div>
          ) : error && !inboxSetting ? (
            <div className="error-state">
              <p className="error-message">{error}</p>
              <p className="error-hint">
                Open Settings (Ctrl+,) to view inbox configuration.
              </p>
            </div>
          ) : (
            <>
              <textarea
                ref={inputRef}
                className="capture-input"
                value={content}
                onChange={(e) => setContent(e.target.value)}
                placeholder="What's on your mind?"
                rows={3}
                disabled={submitting}
              />
              {error && <div className="capture-error">{error}</div>}
            </>
          )}
        </div>

        <div className="modal-footer">
          {inboxSetting && (
            <span className="inbox-destination">
              <span className="inbox-icon">📥</span>
              <span className="inbox-name" title={`Document: ${inboxSetting.document_id}`}>
                {inboxNodeName || 'Inbox'}
              </span>
            </span>
          )}
          <button
            className="capture-btn"
            onClick={handleSubmit}
            disabled={!content.trim() || !inboxSetting || submitting}
          >
            {submitting ? 'Capturing...' : 'Capture'}
          </button>
        </div>
      </div>
    </div>
  );
}

export default QuickCaptureModal;
