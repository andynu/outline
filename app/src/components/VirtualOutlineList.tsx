import { useRef, memo } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import { useOutlineStore, type FlatItem } from '../store/outlineStore';

// Single row component - memoized to prevent re-renders
const OutlineRow = memo(function OutlineRow({ item }: { item: FlatItem }) {
  const { node, depth, hasChildren } = item;
  const focusedId = useOutlineStore(state => state.focusedId);
  const setFocusedId = useOutlineStore(state => state.setFocusedId);

  const isFocused = focusedId === node.id;

  return (
    <div
      className={`outline-item ${isFocused ? 'focused' : ''}`}
      style={{ paddingLeft: depth * 24 }}
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
          {node.content?.replace(/<[^>]*>/g, '') || '\u00A0'}
        </span>
      </div>
    </div>
  );
});

// Row height estimate - adjust based on your actual row heights
const ESTIMATED_ROW_HEIGHT = 28;

export function VirtualOutlineList() {
  const parentRef = useRef<HTMLDivElement>(null);
  const getFlatList = useOutlineStore(state => state.getFlatList);

  const items = getFlatList();

  const virtualizer = useVirtualizer({
    count: items.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => ESTIMATED_ROW_HEIGHT,
    overscan: 20, // Render 20 extra items above/below viewport for smooth scrolling
  });

  const virtualItems = virtualizer.getVirtualItems();

  return (
    <div
      ref={parentRef}
      className="virtual-outline-container"
      style={{
        height: 'calc(100vh - 100px)',
        overflow: 'auto',
      }}
    >
      <div
        style={{
          height: virtualizer.getTotalSize(),
          width: '100%',
          position: 'relative',
        }}
      >
        {virtualItems.map((virtualRow) => {
          const item = items[virtualRow.index];
          return (
            <div
              key={item.node.id}
              style={{
                position: 'absolute',
                top: 0,
                left: 0,
                width: '100%',
                transform: `translateY(${virtualRow.start}px)`,
              }}
            >
              <OutlineRow item={item} />
            </div>
          );
        })}
      </div>
    </div>
  );
}

export default VirtualOutlineList;
