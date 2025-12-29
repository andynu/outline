import React, { memo } from 'react';
import type { TreeNode } from '../lib/types';
import { useOutlineStore } from '../store/outlineStore';

interface OutlineItemProps {
  item: TreeNode;
}

// Memoized to prevent unnecessary re-renders
export const OutlineItem = memo(function OutlineItem({ item }: OutlineItemProps) {
  const { node, depth, hasChildren, children } = item;
  const focusedId = useOutlineStore(state => state.focusedId);
  const setFocusedId = useOutlineStore(state => state.setFocusedId);

  const isFocused = focusedId === node.id;

  return (
    <div
      className={`outline-item ${isFocused ? 'focused' : ''}`}
      style={{ marginLeft: depth * 24 }}
    >
      <div className="item-row" onClick={() => setFocusedId(node.id)}>
        {node.node_type === 'checkbox' ? (
          <span className={`checkbox ${node.is_checked ? 'checked' : ''}`}>
            {node.is_checked ? '☑' : '☐'}
          </span>
        ) : (
          <span className="bullet">
            {hasChildren && node.collapsed ? '◉' : '●'}
          </span>
        )}
        <span className={`content ${node.is_checked ? 'checked' : ''}`}>
          {/* Strip HTML tags for now - will add TipTap later */}
          {node.content?.replace(/<[^>]*>/g, '') || '\u00A0'}
        </span>
      </div>

      {hasChildren && !node.collapsed && (
        <div className="children">
          {children.map(child => (
            <OutlineItem key={child.node.id} item={child} />
          ))}
        </div>
      )}
    </div>
  );
});

export default OutlineItem;
