import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useOutlineStore } from '../../store/outlineStore';
import * as api from '../../lib/api';
import type { CaptureTarget } from '../../lib/api';

interface QuickCaptureModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentDocumentId?: string;
}

export function QuickCaptureModal({ isOpen, onClose, currentDocumentId }: QuickCaptureModalProps) {
  const [content, setContent] = useState('');
  const [captureTarget, setCaptureTarget] = useState<CaptureTarget | null>(null);
  const [targetNodeName, setTargetNodeName] = useState<string>('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  // Store access
  const load = useOutlineStore(state => state.load);
  const getNode = useOutlineStore(state => state.getNode);
  const nodes = useOutlineStore(state => state.nodes);

  // Load capture target when modal opens
  useEffect(() => {
    if (isOpen) {
      setContent('');
      setError(null);
      loadCaptureTarget();
      // Focus input after a brief delay
      setTimeout(() => {
        inputRef.current?.focus();
      }, 100);
    }
  }, [isOpen]);

  // Update target node name when we have the setting and nodes
  useEffect(() => {
    if (captureTarget && nodes.length > 0) {
      const node = getNode(captureTarget.node_id);
      if (node) {
        // Strip HTML tags for display
        const text = node.content.replace(/<[^>]*>/g, '').trim();
        setTargetNodeName(text || 'Capture Target');
      }
    }
  }, [captureTarget, nodes, getNode]);

  async function loadCaptureTarget() {
    setLoading(true);
    try {
      const target = await api.getDefaultCaptureTarget();
      setCaptureTarget(target);
      if (!target) {
        setError('No capture target configured. Use "otl target add" to set one up.');
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load capture target');
    } finally {
      setLoading(false);
    }
  }

  const handleSubmit = useCallback(async () => {
    if (!content.trim() || !captureTarget) return;

    setSubmitting(true);
    setError(null);

    try {
      // Check if we need to switch documents
      if (currentDocumentId !== captureTarget.document_id) {
        await load(captureTarget.document_id);
      }

      // Get the target node to find max position among children
      const store = useOutlineStore.getState();
      const targetChildren = store.nodes.filter(n => n.parent_id === captureTarget.node_id);
      const maxPosition = targetChildren.reduce((max, n) => Math.max(max, n.position), -1);
      const newPosition = maxPosition + 1;

      // Create the node as a child of the capture target node
      const result = await api.createNode(captureTarget.node_id, newPosition, content.trim());

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
  }, [content, captureTarget, currentDocumentId, load, onClose]);

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
          ) : error && !captureTarget ? (
            <div className="error-state">
              <p className="error-message">{error}</p>
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
          {captureTarget && (
            <span className="inbox-destination">
              <span className="inbox-icon">📥</span>
              <span className="inbox-name" title={`Document: ${captureTarget.document_id}`}>
                {targetNodeName || 'Capture Target'}
              </span>
            </span>
          )}
          <button
            className="capture-btn"
            onClick={handleSubmit}
            disabled={!content.trim() || !captureTarget || submitting}
          >
            {submitting ? 'Capturing...' : 'Capture'}
          </button>
        </div>
      </div>
    </div>
  );
}

export default QuickCaptureModal;
