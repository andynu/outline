import React, { useState, useEffect, useCallback } from 'react';
import * as api from '../../lib/api';
import type { BacklinkResult } from '../../lib/api';

interface BacklinksPanelProps {
  nodeId: string | null;
  onNavigate: (nodeId: string) => void;
}

function stripHtml(html: string): string {
  const div = document.createElement('div');
  div.textContent = html;
  return div.textContent || '';
}

function truncate(text: string, maxLength: number = 60): string {
  if (text.length <= maxLength) return text;
  return text.slice(0, maxLength) + '...';
}

export function BacklinksPanel({ nodeId, onNavigate }: BacklinksPanelProps) {
  const [backlinks, setBacklinks] = useState<BacklinkResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [expanded, setExpanded] = useState(true);

  // Load backlinks when nodeId changes
  useEffect(() => {
    if (nodeId) {
      setLoading(true);
      setBacklinks([]); // Clear old backlinks immediately
      api.getBacklinks(nodeId)
        .then(results => setBacklinks(results))
        .catch(e => {
          console.error('Failed to load backlinks:', e);
          setBacklinks([]);
        })
        .finally(() => setLoading(false));
    } else {
      setBacklinks([]);
    }
  }, [nodeId]);

  const handleClick = useCallback((result: BacklinkResult) => {
    onNavigate(result.source_node_id);
  }, [onNavigate]);

  if (backlinks.length === 0) {
    return null;
  }

  return (
    <div className="backlinks-panel">
      <button
        className="panel-header"
        onClick={() => setExpanded(prev => !prev)}
      >
        <span className="expand-icon">{expanded ? '▼' : '▶'}</span>
        <span className="panel-title">
          {loading ? 'Backlinks...' : `${backlinks.length} backlink${backlinks.length !== 1 ? 's' : ''}`}
        </span>
      </button>

      {expanded && !loading && (
        <div className="backlinks-list">
          {backlinks.map(link => (
            <div
              key={link.source_node_id}
              className="backlink-item"
              onClick={() => handleClick(link)}
            >
              {truncate(stripHtml(link.content))}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default BacklinksPanel;
