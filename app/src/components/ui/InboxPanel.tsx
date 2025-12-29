import React, { useState, useMemo, useEffect, useCallback } from 'react';
import * as api from '../../lib/api';
import type { InboxItem } from '../../lib/api';

interface InboxPanelProps {
  isOpen: boolean;
  onClose: () => void;
  onProcess: (item: InboxItem) => void;
}

function formatDate(dateStr: string): string {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const itemDate = new Date(dateStr);
  itemDate.setHours(0, 0, 0, 0);

  const diffDays = Math.floor((today.getTime() - itemDate.getTime()) / (1000 * 60 * 60 * 24));

  if (diffDays === 0) return 'Today';
  if (diffDays === 1) return 'Yesterday';
  if (diffDays < 7) return `${diffDays} days ago`;

  return itemDate.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });
}

function formatTime(isoStr: string): string {
  return new Date(isoStr).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
}

export function InboxPanel({ isOpen, onClose, onProcess }: InboxPanelProps) {
  const [items, setItems] = useState<InboxItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState(0);

  // Group items by capture_date
  const groupedItems = useMemo(() => {
    const groups: Record<string, InboxItem[]> = {};
    for (const item of items) {
      const date = item.capture_date || 'Unknown';
      if (!groups[date]) groups[date] = [];
      groups[date].push(item);
    }
    // Sort dates descending
    const sortedDates = Object.keys(groups).sort().reverse();
    return sortedDates.map(date => ({ date, items: groups[date] }));
  }, [items]);

  // Load inbox when panel opens
  const loadInbox = useCallback(async () => {
    setLoading(true);
    try {
      const inboxItems = await api.getInbox();
      setItems(inboxItems);
      setSelectedIndex(0);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (isOpen) {
      loadInbox();
    }
  }, [isOpen, loadInbox]);

  // Ensure selectedIndex is valid
  useEffect(() => {
    if (items.length > 0 && selectedIndex >= items.length) {
      setSelectedIndex(Math.max(0, items.length - 1));
    }
  }, [items.length, selectedIndex]);

  // Handle keyboard events
  useEffect(() => {
    if (!isOpen) return;

    const handleKeydown = (event: KeyboardEvent) => {
      switch (event.key) {
        case 'ArrowDown':
          event.preventDefault();
          setSelectedIndex(prev => Math.min(prev + 1, items.length - 1));
          break;
        case 'ArrowUp':
          event.preventDefault();
          setSelectedIndex(prev => Math.max(prev - 1, 0));
          break;
        case 'Enter':
          event.preventDefault();
          if (items[selectedIndex]) {
            onProcess(items[selectedIndex]);
          }
          break;
        case 'Delete':
        case 'Backspace':
          if (event.ctrlKey || event.metaKey) {
            event.preventDefault();
            const item = items[selectedIndex];
            if (item) {
              api.clearInboxItems([item.id]).then(() => loadInbox());
            }
          }
          break;
        case 'Escape':
          event.preventDefault();
          onClose();
          break;
      }
    };

    window.addEventListener('keydown', handleKeydown);
    return () => window.removeEventListener('keydown', handleKeydown);
  }, [isOpen, items, selectedIndex, onProcess, onClose, loadInbox]);

  const handleBackdropClick = useCallback((e: React.MouseEvent) => {
    if (e.target === e.currentTarget) {
      onClose();
    }
  }, [onClose]);

  const dismissItem = useCallback(async (item: InboxItem, e: React.MouseEvent) => {
    e.stopPropagation();
    await api.clearInboxItems([item.id]);
    await loadInbox();
  }, [loadInbox]);

  const getFlatIndex = useCallback((item: InboxItem): number => {
    return items.findIndex(i => i.id === item.id);
  }, [items]);

  if (!isOpen) {
    return null;
  }

  return (
    <div className="modal-backdrop" onClick={handleBackdropClick}>
      <div className="modal inbox-modal">
        <div className="modal-header">
          <h2>Inbox</h2>
          <span className="badge">{items.length}</span>
        </div>

        <div className="items-container">
          {loading ? (
            <div className="loading">Loading...</div>
          ) : items.length === 0 ? (
            <div className="empty">
              <p>No items in inbox</p>
              <p className="hint">Capture items from mobile at /outline/capture</p>
            </div>
          ) : (
            groupedItems.map(group => (
              <div key={group.date} className="date-group">
                <div className="date-header">{formatDate(group.date)}</div>
                {group.items.map(item => {
                  const flatIdx = getFlatIndex(item);
                  return (
                    <div
                      key={item.id}
                      className={`inbox-item ${flatIdx === selectedIndex ? 'selected' : ''}`}
                      onClick={() => setSelectedIndex(flatIdx)}
                      onDoubleClick={() => onProcess(item)}
                    >
                      <div className="item-content">{item.content}</div>
                      {item.note && (
                        <div className="item-note">{item.note}</div>
                      )}
                      <div className="item-meta">
                        <span className="item-time">{formatTime(item.captured_at)}</span>
                        {item.source && (
                          <span className="item-source">via {item.source}</span>
                        )}
                        <button
                          className="dismiss-btn"
                          onClick={(e) => dismissItem(item, e)}
                          title="Dismiss"
                        >
                          ×
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            ))
          )}
        </div>

        <div className="modal-footer">
          <span className="hint">
            <kbd>↑↓</kbd> Select
            <kbd>Enter</kbd> Move to... (Ctrl+Shift+M)
            <kbd>Ctrl+Del</kbd> Dismiss
            <kbd>Esc</kbd> Close
          </span>
        </div>
      </div>
    </div>
  );
}

export default InboxPanel;
