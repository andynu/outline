<script lang="ts">
  import { onMount } from 'svelte';
  import BenchmarkItem from './BenchmarkItem.svelte';

  interface TreeNode {
    id: string;
    parent_id: string | null;
    position: number;
    content: string;
    node_type: string;
    is_checked: boolean;
    collapsed: boolean;
    children: TreeNode[];
  }

  let tree: TreeNode[] = $state([]);
  let stats = $state({ nodes: 0, treeTime: 0, totalTime: 0 });
  let loading = $state(true);

  function buildTree(nodes: any[]): TreeNode[] {
    const nodeMap = new Map<string, TreeNode>();
    const roots: TreeNode[] = [];

    nodes.forEach(n => {
      nodeMap.set(n.id, { ...n, children: [] });
    });

    nodes.forEach(n => {
      const node = nodeMap.get(n.id)!;
      if (n.parent_id && nodeMap.has(n.parent_id)) {
        nodeMap.get(n.parent_id)!.children.push(node);
      } else if (!n.parent_id) {
        roots.push(node);
      }
    });

    const sortChildren = (node: TreeNode) => {
      node.children.sort((a, b) => a.position - b.position);
      node.children.forEach(sortChildren);
    };
    roots.sort((a, b) => a.position - b.position);
    roots.forEach(sortChildren);

    return roots;
  }

  onMount(async () => {
    // Load data
    const response = await fetch('/benchmark-data.json');
    const nodes = await response.json();

    const startTime = performance.now();
    const builtTree = buildTree(nodes);
    const treeTime = performance.now();

    tree = builtTree;
    loading = false;

    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        const endTime = performance.now();
        stats = {
          nodes: nodes.length,
          treeTime: treeTime - startTime,
          totalTime: endTime - startTime
        };
      });
    });
  });
</script>

<div class="benchmark">
  <h1>Svelte 5 Tree Benchmark</h1>

  <div class="stats">
    {#if loading}
      Loading...
    {:else}
      <strong>Svelte 5</strong><br>
      Nodes: {stats.nodes}<br>
      Tree build: {stats.treeTime.toFixed(1)}ms<br>
      Total render: {stats.totalTime.toFixed(1)}ms
    {/if}
  </div>

  <div class="tree">
    {#each tree as node (node.id)}
      <BenchmarkItem {node} depth={0} />
    {/each}
  </div>
</div>

<style>
  .benchmark {
    font-family: -apple-system, BlinkMacSystemFont, sans-serif;
    margin: 20px;
  }

  .stats {
    position: fixed;
    top: 10px;
    right: 10px;
    background: #f0f0f0;
    padding: 10px;
    border-radius: 4px;
  }
</style>
