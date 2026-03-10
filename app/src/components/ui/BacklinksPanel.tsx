import React, { useState, useEffect, useCallback } from 'react';
import * as api from '../../lib/api';
import type { BacklinkResult, UnlinkedReference } from '../../lib/api';
import { stripHtml } from '../../lib/utils';

interface BacklinksPanelProps {
  nodeId: string | null;
  nodeContent: string;
  onNavigate: (nodeId: string, documentId: string) => void;
}

function truncate(text: string, maxLength: number = 80): string {
  if (text.length <= maxLength) return text;
  return text.slice(0, maxLength) + '...';
}

export function BacklinksPanel({ nodeId, nodeContent, onNavigate }: BacklinksPanelProps) {
  const [backlinks, setBacklinks] = useState<BacklinkResult[]>([]);
  const [unlinked, setUnlinked] = useState<UnlinkedReference[]>([]);
  const [backlinkExpanded, setBacklinkExpanded] = useState(true);
  const [unlinkedExpanded, setUnlinkedExpanded] = useState(false);
  const [linking, setLinking] = useState<string | null>(null); // source_node_id being linked

  const searchText = stripHtml(nodeContent);

  // Load backlinks and unlinked references when nodeId changes
  useEffect(() => {
    if (!nodeId) {
      setBacklinks([]);
      setUnlinked([]);
      return;
    }

    setBacklinks([]);
    setUnlinked([]);

    api.getBacklinks(nodeId)
      .then(results => setBacklinks(results))
      .catch(e => {
        console.error('Failed to load backlinks:', e);
        setBacklinks([]);
      });

    // Only search for unlinked references if text is meaningful
    if (searchText.length >= 3) {
      api.getUnlinkedReferences(nodeId, searchText)
        .then(results => setUnlinked(results))
        .catch(e => {
          console.error('Failed to load unlinked references:', e);
          setUnlinked([]);
        });
    }
  }, [nodeId, searchText]);

  const handleBacklinkClick = useCallback((result: BacklinkResult) => {
    onNavigate(result.source_node_id, result.source_document_id);
  }, [onNavigate]);

  const handleUnlinkedClick = useCallback((result: UnlinkedReference) => {
    onNavigate(result.source_node_id, result.source_document_id);
  }, [onNavigate]);

  const handleLink = useCallback(async (ref: UnlinkedReference, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!nodeId) return;

    setLinking(ref.source_node_id);
    try {
      await api.convertMentionToLink(
        ref.source_node_id,
        ref.source_document_id,
        nodeId,
        searchText
      );
      // Remove from unlinked list and add to backlinks
      setUnlinked(prev => prev.filter(u => u.source_node_id !== ref.source_node_id));
      setBacklinks(prev => [...prev, {
        source_node_id: ref.source_node_id,
        source_document_id: ref.source_document_id,
        content: ref.content,
      }]);
    } catch (e) {
      console.error('Failed to convert mention to link:', e);
    } finally {
      setLinking(null);
    }
  }, [nodeId, searchText]);

  if (backlinks.length === 0 && unlinked.length === 0) {
    return null;
  }

  return (
    <div className="backlinks-panel">
      {/* Formal backlinks section */}
      {backlinks.length > 0 && (
        <>
          <button
            className="panel-header"
            onClick={() => setBacklinkExpanded(prev => !prev)}
          >
            <span className="expand-icon">{backlinkExpanded ? '▼' : '▶'}</span>
            <span className="panel-title">
              {backlinks.length} backlink{backlinks.length !== 1 ? 's' : ''}
            </span>
          </button>

          {backlinkExpanded && (
            <div className="backlinks-list">
              {backlinks.map(link => (
                <div
                  key={link.source_node_id}
                  className="backlink-item"
                  role="button"
                  tabIndex={0}
                  onClick={() => handleBacklinkClick(link)}
                  onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); handleBacklinkClick(link); } }}
                >
                  {truncate(stripHtml(link.content))}
                </div>
              ))}
            </div>
          )}
        </>
      )}

      {/* Unlinked references section */}
      {unlinked.length > 0 && (
        <>
          <button
            className="panel-header unlinked-header"
            onClick={() => setUnlinkedExpanded(prev => !prev)}
          >
            <span className="expand-icon">{unlinkedExpanded ? '▼' : '▶'}</span>
            <span className="panel-title">
              {unlinked.length} unlinked reference{unlinked.length !== 1 ? 's' : ''}
            </span>
          </button>

          {unlinkedExpanded && (
            <div className="backlinks-list unlinked-list">
              {unlinked.map(ref_ => (
                <div
                  key={ref_.source_node_id}
                  className="backlink-item unlinked-item"
                  role="button"
                  tabIndex={0}
                  onClick={() => handleUnlinkedClick(ref_)}
                  onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); handleUnlinkedClick(ref_); } }}
                >
                  <span className="unlinked-content">
                    {truncate(stripHtml(ref_.content))}
                  </span>
                  <button
                    className="link-btn"
                    onClick={(e) => handleLink(ref_, e)}
                    disabled={linking === ref_.source_node_id}
                    title="Convert to wiki link"
                  >
                    {linking === ref_.source_node_id ? '...' : 'Link'}
                  </button>
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}

export default BacklinksPanel;
