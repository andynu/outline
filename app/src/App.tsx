import { useEffect, useState } from 'react';
import { useOutlineStore } from './store/outlineStore';
import { OutlineItem } from './components/OutlineItem';
import type { Node } from './lib/types';

function App() {
  const [stats, setStats] = useState({ nodes: 0, treeTime: 0, totalTime: 0 });
  const [loading, setLoading] = useState(true);

  const setNodes = useOutlineStore(state => state.setNodes);
  const getTree = useOutlineStore(state => state.getTree);

  useEffect(() => {
    async function loadData() {
      const startTime = performance.now();

      // Load benchmark data
      const response = await fetch('/benchmark-data.json');
      const nodes: Node[] = await response.json();

      const treeTime = performance.now();
      setNodes(nodes);
      setLoading(false);

      // Wait for React to render
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          const endTime = performance.now();
          setStats({
            nodes: nodes.length,
            treeTime: treeTime - startTime,
            totalTime: endTime - startTime
          });
        });
      });
    }

    loadData();
  }, [setNodes]);

  const tree = getTree();

  return (
    <div className="app">
      <div className="stats">
        {loading ? (
          'Loading...'
        ) : (
          <>
            <strong>React 18</strong><br />
            Nodes: {stats.nodes}<br />
            Data load: {stats.treeTime.toFixed(1)}ms<br />
            Total render: {stats.totalTime.toFixed(1)}ms
          </>
        )}
      </div>

      <h1>Outline - React 18</h1>

      <div className="outline-container">
        {tree.map(item => (
          <OutlineItem key={item.node.id} item={item} />
        ))}
      </div>
    </div>
  );
}

export default App;
