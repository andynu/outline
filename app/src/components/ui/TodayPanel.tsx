import React, { useState, useMemo, useEffect, useCallback, useRef } from 'react';
import { getDateStatus, formatDateRelative, formatISODate, type DateStatus } from '../../lib/dateUtils';
import { DateBadge } from './DateBadge';
import { getAllDatedNodes, updateNodeInDocument } from '../../lib/api';
import type { DatedNodeInfo } from '../../lib/types';

interface TodayPanelProps {
  isOpen: boolean;
  onClose: () => void;
  onNavigate: (nodeId: string, documentId: string) => void;
  currentDocumentId?: string;
}

function stripHtml(html: string): string {
  return html
    .replace(/<[^>]*>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .trim();
}

/**
 * Check if a node is currently deferred (defer_date is in the future).
 * Overdue items are never considered deferred regardless of defer_date.
 */
function isDeferred(node: DatedNodeInfo): boolean {
  if (!node.defer_date) return false;
  const status = getDateStatus(node.date, node.is_checked);
  if (status === 'overdue') return false;
  const today = formatISODate(new Date());
  return node.defer_date > today;
}

export function TodayPanel({ isOpen, onClose, onNavigate, currentDocumentId }: TodayPanelProps) {
  const [allDatedNodes, setAllDatedNodes] = useState<DatedNodeInfo[]>([]);
  const [loading, setLoading] = useState(false);
  const [checkingNodes, setCheckingNodes] = useState<Set<string>>(new Set());
  const refreshTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Load dated nodes when panel opens
  const loadNodes = useCallback(() => {
    setLoading(true);
    getAllDatedNodes().then(nodes => {
      setAllDatedNodes(nodes);
      setLoading(false);
    }).catch(err => {
      console.error('Failed to load dated nodes:', err);
      setLoading(false);
    });
  }, []);

  useEffect(() => {
    if (!isOpen) return;
    loadNodes();
  }, [isOpen, loadNodes]);

  // Auto-refresh every 60 seconds when open
  useEffect(() => {
    if (!isOpen) return;
    refreshTimerRef.current = setInterval(loadNodes, 60000);
    return () => {
      if (refreshTimerRef.current) clearInterval(refreshTimerRef.current);
    };
  }, [isOpen, loadNodes]);

  // Filter to today and overdue items (not deferred, not completed)
  const todayItems = useMemo(() => {
    return allDatedNodes
      .filter(node => {
        const status = getDateStatus(node.date, node.is_checked);
        if (status === 'completed') return false;
        if (isDeferred(node)) return false;
        return status === 'today' || status === 'overdue';
      })
      .sort((a, b) => {
        // Overdue first, then today
        const aStatus = getDateStatus(a.date, a.is_checked);
        const bStatus = getDateStatus(b.date, b.is_checked);
        if (aStatus === 'overdue' && bStatus !== 'overdue') return -1;
        if (bStatus === 'overdue' && aStatus !== 'overdue') return 1;
        return a.date.localeCompare(b.date);
      });
  }, [allDatedNodes]);

  const overdueCount = useMemo(() => {
    return todayItems.filter(n => getDateStatus(n.date, n.is_checked) === 'overdue').length;
  }, [todayItems]);

  const todayCount = useMemo(() => {
    return todayItems.filter(n => getDateStatus(n.date, n.is_checked) === 'today').length;
  }, [todayItems]);

  const hasMultipleDocuments = useMemo(() => {
    const docIds = new Set(todayItems.map(n => n.document_id));
    return docIds.size > 1;
  }, [todayItems]);

  // Handle checking off a task
  const handleCheckOff = useCallback(async (e: React.MouseEvent, node: DatedNodeInfo) => {
    e.stopPropagation();

    setCheckingNodes(prev => new Set(prev).add(node.id));

    try {
      await updateNodeInDocument(node.id, node.document_id, { is_checked: true });

      // Optimistically update local state
      setAllDatedNodes(prev => prev.map(n =>
        n.id === node.id ? { ...n, is_checked: true } : n
      ));
    } catch (err) {
      console.error('Failed to check off item:', err);
    } finally {
      setCheckingNodes(prev => {
        const next = new Set(prev);
        next.delete(node.id);
        return next;
      });
    }
  }, []);

  // Handle navigating to an item
  const handleItemClick = useCallback((node: DatedNodeInfo) => {
    onNavigate(node.id, node.document_id);
  }, [onNavigate]);

  // Handle keyboard events
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

  if (!isOpen) {
    return null;
  }

  return (
    <aside className="today-panel">
      <div className="today-panel-header">
        <h2>
          Today
          {todayItems.length > 0 && (
            <span className="today-panel-count">{todayItems.length}</span>
          )}
        </h2>
        <button className="today-panel-close" onClick={onClose} aria-label="Close Today panel">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <line x1="18" y1="6" x2="6" y2="18" />
            <line x1="6" y1="6" x2="18" y2="18" />
          </svg>
        </button>
      </div>

      <div className="today-panel-content">
        {loading && todayItems.length === 0 ? (
          <div className="today-panel-empty">Loading...</div>
        ) : todayItems.length === 0 ? (
          <div className="today-panel-empty">
            <span className="today-panel-empty-icon">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" width="32" height="32">
                <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/>
                <polyline points="22 4 12 14.01 9 11.01"/>
              </svg>
            </span>
            Nothing due today
          </div>
        ) : (
          <>
            {overdueCount > 0 && (
              <div className="today-panel-section">
                <div className="today-panel-section-header overdue">
                  Overdue
                  <span className="today-panel-section-count">{overdueCount}</span>
                </div>
                {todayItems
                  .filter(n => getDateStatus(n.date, n.is_checked) === 'overdue')
                  .map(node => (
                    <TodayPanelItem
                      key={`${node.document_id}-${node.id}`}
                      node={node}
                      checking={checkingNodes.has(node.id)}
                      showDocument={hasMultipleDocuments}
                      onCheckOff={handleCheckOff}
                      onClick={handleItemClick}
                    />
                  ))}
              </div>
            )}
            {todayCount > 0 && (
              <div className="today-panel-section">
                {overdueCount > 0 && (
                  <div className="today-panel-section-header">
                    Due Today
                    <span className="today-panel-section-count">{todayCount}</span>
                  </div>
                )}
                {todayItems
                  .filter(n => getDateStatus(n.date, n.is_checked) === 'today')
                  .map(node => (
                    <TodayPanelItem
                      key={`${node.document_id}-${node.id}`}
                      node={node}
                      checking={checkingNodes.has(node.id)}
                      showDocument={hasMultipleDocuments}
                      onCheckOff={handleCheckOff}
                      onClick={handleItemClick}
                    />
                  ))}
              </div>
            )}
          </>
        )}
      </div>

      <div className="today-panel-footer">
        <button className="today-panel-refresh" onClick={loadNodes} title="Refresh">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="14" height="14">
            <polyline points="23 4 23 10 17 10"/>
            <path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/>
          </svg>
        </button>
      </div>
    </aside>
  );
}

interface TodayPanelItemProps {
  node: DatedNodeInfo;
  checking: boolean;
  showDocument: boolean;
  onCheckOff: (e: React.MouseEvent, node: DatedNodeInfo) => void;
  onClick: (node: DatedNodeInfo) => void;
}

function TodayPanelItem({ node, checking, showDocument, onCheckOff, onClick }: TodayPanelItemProps) {
  const status = getDateStatus(node.date, node.is_checked);
  const isCheckbox = node.node_type === 'checkbox';
  const content = stripHtml(node.content) || 'Untitled';

  return (
    <button
      className={`today-panel-item ${status} ${node.is_checked ? 'checked' : ''} ${checking ? 'checking' : ''}`}
      onClick={() => onClick(node)}
      title={`Click to navigate${isCheckbox ? ', or use checkbox to complete' : ''}`}
    >
      {isCheckbox && (
        <span
          className={`today-panel-checkbox ${node.is_checked ? 'checked' : ''}`}
          onClick={(e) => !node.is_checked && !checking && onCheckOff(e, node)}
          role="checkbox"
          aria-checked={node.is_checked}
          aria-label={`Mark "${content}" as complete`}
        >
          {checking ? (
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="spinner">
              <circle cx="12" cy="12" r="10" strokeDasharray="31.4 31.4" />
            </svg>
          ) : node.is_checked ? (
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <polyline points="20 6 9 17 4 12" />
            </svg>
          ) : null}
        </span>
      )}
      <div className="today-panel-item-content">
        <span className={`today-panel-item-text ${node.is_checked ? 'strikethrough' : ''}`}>
          {content}
        </span>
        {showDocument && (
          <span className="today-panel-item-doc">{node.document_title}</span>
        )}
      </div>
      <DateBadge
        date={node.date}
        dateEnd={node.date_end}
        isChecked={node.is_checked}
      />
    </button>
  );
}

export default TodayPanel;
