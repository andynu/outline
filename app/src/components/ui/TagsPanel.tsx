import React, { useState, useMemo, useEffect, useCallback } from 'react';
import { useOutlineStore } from '../../store/outlineStore';
import type { Node } from '../../lib/types';

interface TagsPanelProps {
  isOpen: boolean;
  onClose: () => void;
  onNavigate: (nodeId: string) => void;
  onTagSearch: (tag: string) => void;
}

// Extract hashtags from plain text
const HASHTAG_PATTERN = /(?:^|(?<=\s))#([a-zA-Z][a-zA-Z0-9_-]*)/g;

function extractHashtags(text: string): string[] {
  const tags: string[] = [];
  for (const match of text.matchAll(HASHTAG_PATTERN)) {
    tags.push(match[1]); // The tag without #
  }
  return tags;
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

export function TagsPanel({ isOpen, onClose, onNavigate, onTagSearch }: TagsPanelProps) {
  const nodes = useOutlineStore(state => state.nodes);
  const [selectedTag, setSelectedTag] = useState<string | null>(null);

  // Get all tags with counts, sorted by count descending
  const tagsWithCounts = useMemo(() => {
    const tagMap = new Map<string, { count: number; nodeIds: string[] }>();

    for (const node of nodes) {
      const plainText = node.content.replace(/<[^>]*>/g, '');
      const contentTags = extractHashtags(plainText);

      for (const tag of contentTags) {
        const existing = tagMap.get(tag);
        if (existing) {
          existing.count++;
          if (!existing.nodeIds.includes(node.id)) {
            existing.nodeIds.push(node.id);
          }
        } else {
          tagMap.set(tag, { count: 1, nodeIds: [node.id] });
        }
      }
    }

    return Array.from(tagMap.entries())
      .map(([tag, data]) => ({ tag, ...data }))
      .sort((a, b) => b.count - a.count);
  }, [nodes]);

  // Get nodes for selected tag
  const nodesForTag = useMemo(() => {
    if (!selectedTag) return [];
    return nodes.filter(node => {
      const plainText = node.content.replace(/<[^>]*>/g, '');
      const tags = extractHashtags(plainText);
      return tags.includes(selectedTag);
    });
  }, [nodes, selectedTag]);

  // Handle keyboard events
  useEffect(() => {
    if (!isOpen) return;

    const handleKeydown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        if (selectedTag) {
          setSelectedTag(null);
        } else {
          onClose();
        }
      }
    };

    window.addEventListener('keydown', handleKeydown);
    return () => window.removeEventListener('keydown', handleKeydown);
  }, [isOpen, selectedTag, onClose]);

  // Reset selected tag when modal closes
  useEffect(() => {
    if (!isOpen) {
      setSelectedTag(null);
    }
  }, [isOpen]);

  const handleBackdropClick = useCallback((e: React.MouseEvent) => {
    if (e.target === e.currentTarget) {
      onClose();
    }
  }, [onClose]);

  const handleTagClick = useCallback((tag: string) => {
    setSelectedTag(tag);
  }, []);

  const handleNodeClick = useCallback((nodeId: string) => {
    onNavigate(nodeId);
    onClose();
  }, [onNavigate, onClose]);

  const handleSearchTag = useCallback((tag: string) => {
    onTagSearch(tag);
    onClose();
  }, [onTagSearch, onClose]);

  const handleBack = useCallback(() => {
    setSelectedTag(null);
  }, []);

  if (!isOpen) {
    return null;
  }

  return (
    <div className="modal-backdrop" onClick={handleBackdropClick}>
      <div className="modal tags-modal">
        <div className="modal-header">
          {selectedTag && (
            <button className="back-btn" onClick={handleBack} aria-label="Back">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M19 12H5M12 19l-7-7 7-7"/>
              </svg>
            </button>
          )}
          <h2>{selectedTag ? `#${selectedTag}` : 'Tags'}</h2>
          <button className="close-btn" onClick={onClose} aria-label="Close">×</button>
        </div>

        <div className="results">
          {selectedTag ? (
            // Show nodes with selected tag
            <>
              {nodesForTag.length === 0 ? (
                <div className="empty-state">No items with this tag</div>
              ) : (
                <>
                  <div className="tag-header">
                    <span className="tag-count">{nodesForTag.length} item{nodesForTag.length === 1 ? '' : 's'}</span>
                    <button className="search-btn" onClick={() => handleSearchTag(selectedTag)}>
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <circle cx="11" cy="11" r="8"/>
                        <path d="m21 21-4.35-4.35"/>
                      </svg>
                      Search all
                    </button>
                  </div>
                  {nodesForTag.map(node => (
                    <button
                      key={node.id}
                      className={`result-item ${node.is_checked ? 'checked' : ''}`}
                      onClick={() => handleNodeClick(node.id)}
                    >
                      <div className="result-content">
                        {node.node_type === 'checkbox' && (
                          <span className={`checkbox-indicator ${node.is_checked ? 'checked' : ''}`}>
                            {node.is_checked ? '✓' : ''}
                          </span>
                        )}
                        <span className={`content-text ${node.is_checked ? 'strikethrough' : ''}`}>
                          {stripHtml(node.content) || 'Untitled'}
                        </span>
                      </div>
                    </button>
                  ))}
                </>
              )}
            </>
          ) : (
            // Show all tags
            <>
              {tagsWithCounts.length === 0 ? (
                <div className="empty-state">
                  No tags yet. Use #hashtags in your content to create tags.
                </div>
              ) : (
                tagsWithCounts.map(({ tag, count }) => (
                  <button key={tag} className="tag-item" onClick={() => handleTagClick(tag)}>
                    <span className="tag-name">#{tag}</span>
                    <span className="tag-count-badge">{count}</span>
                  </button>
                ))
              )}
            </>
          )}
        </div>

        <div className="modal-footer">
          <span className="hint">
            {selectedTag ? 'Press Escape to go back' : 'Press Escape to close'}
          </span>
        </div>
      </div>
    </div>
  );
}

export default TagsPanel;
