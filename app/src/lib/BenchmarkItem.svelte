<script lang="ts">
  // Simplified tree item for benchmarking - no TipTap, no reactivity, just rendering
  interface TreeNode {
    id: string;
    content: string;
    node_type: string;
    is_checked: boolean;
    collapsed: boolean;
    children: TreeNode[];
  }

  interface Props {
    node: TreeNode;
    depth: number;
  }

  let { node, depth }: Props = $props();

  const hasChildren = node.children.length > 0;
</script>

<div class="outline-item" style="margin-left: {depth * 24}px">
  <div class="item-row">
    {#if node.node_type === 'checkbox'}
      <input
        type="checkbox"
        class="checkbox"
        checked={node.is_checked}
        disabled
      />
    {:else}
      <span class="bullet">
        {#if hasChildren && node.collapsed}◉{:else}●{/if}
      </span>
    {/if}
    <span class="content" class:checked={node.is_checked}>
      {node.content || '\u00A0'}
    </span>
  </div>
  {#if hasChildren && !node.collapsed}
    <div class="children">
      {#each node.children as child (child.id)}
        <svelte:self node={child} depth={0} />
      {/each}
    </div>
  {/if}
</div>

<style>
  .outline-item { margin-left: 24px; }
  .item-row { display: flex; align-items: center; padding: 2px 0; }
  .bullet { width: 20px; text-align: center; color: #666; }
  .checkbox { width: 14px; height: 14px; margin-right: 6px; }
  .content { flex: 1; min-height: 24px; line-height: 24px; }
  .checked { text-decoration: line-through; color: #999; }
</style>
