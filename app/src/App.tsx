import { useEffect, useState, useMemo } from 'react';
import { useOutlineStore } from './store/outlineStore';
import { OutlineItem } from './components/OutlineItem';
import { VirtualOutlineList } from './components/VirtualOutlineList';
import type { Node, TreeNode } from './lib/types';

// Build tree from nodes array
function buildTreeFromNodes(nodes: Node[]): TreeNode[] {
  const childrenByParent = new Map<string | null, Node[]>();

  for (const node of nodes) {
    const parentId = node.parent_id;
    const siblings = childrenByParent.get(parentId) ?? [];
    siblings.push(node);
    childrenByParent.set(parentId, siblings);
  }

  for (const children of childrenByParent.values()) {
    children.sort((a, b) => a.position - b.position);
  }

  function buildLevel(parentId: string | null, depth: number): TreeNode[] {
    const children = childrenByParent.get(parentId) ?? [];
    return children.map(node => {
      const nodeChildren = childrenByParent.get(node.id) ?? [];
      const hasChildren = nodeChildren.length > 0;
      return {
        node,
        depth,
        hasChildren,
        children: hasChildren && !node.collapsed
          ? buildLevel(node.id, depth + 1)
          : []
      };
    });
  }

  return buildLevel(null, 0);
}

function App() {
  const [useVirtual, setUseVirtual] = useState(false);

  // Store state and actions
  const loading = useOutlineStore(state => state.loading);
  const error = useOutlineStore(state => state.error);
  const nodes = useOutlineStore(state => state.nodes);
  const load = useOutlineStore(state => state.load);

  // Load document on mount
  useEffect(() => {
    load();
  }, [load]);

  // Compute tree from nodes with useMemo for performance
  const tree = useMemo(() => buildTreeFromNodes(nodes), [nodes]);
  const visibleCount = useMemo(() => {
    function count(items: TreeNode[]): number {
      return items.reduce((sum, item) => sum + 1 + count(item.children), 0);
    }
    return count(tree);
  }, [tree]);

  if (loading) {
    return (
      <div className="app">
        <div className="loading">Loading...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="app">
        <div className="error">Error: {error}</div>
      </div>
    );
  }

  return (
    <div className="app">
      <div className="stats">
        <strong>React 18 {useVirtual ? '(Virtual)' : '(Tree)'}</strong><br />
        Nodes: {nodes.length}<br />
        Visible: {visibleCount}
        <div style={{ marginTop: '10px' }}>
          <button
            onClick={() => setUseVirtual(!useVirtual)}
            style={{
              padding: '4px 8px',
              cursor: 'pointer',
              background: 'var(--bg-elevated)',
              border: '1px solid var(--border-primary)',
              borderRadius: '4px',
            }}
          >
            Toggle: {useVirtual ? 'Virtual' : 'Tree'}
          </button>
        </div>
      </div>

      <h1>Outline - React 18</h1>

      {useVirtual ? (
        <VirtualOutlineList />
      ) : (
        <div className="outline-container">
          {tree.map(item => (
            <OutlineItem key={item.node.id} item={item} />
          ))}
        </div>
      )}
    </div>
  );
}

export default App;
