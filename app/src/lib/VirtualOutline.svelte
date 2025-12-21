<script lang="ts">
  import { createVirtualizer } from '@tanstack/svelte-virtual';
  import { outline } from './outline.svelte';
  import FlatOutlineItem from './FlatOutlineItem.svelte';
  import { onMount } from 'svelte';

  interface Props {
    onNavigateToNode?: (nodeId: string) => void;
  }

  let { onNavigateToNode }: Props = $props();

  let scrollElement: HTMLDivElement | null = $state(null);
  let mounted = $state(false);

  // Get flat list from outline store
  let flatList = $derived(outline.getFlatList());

  onMount(() => {
    mounted = true;
  });

  // Recreate virtualizer when scrollElement or flatList.length changes
  // This is the Svelte 5 equivalent of Svelte 4's reactive `$: virtualizer = ...`
  let virtualizer = $derived.by(() => {
    // Access dependencies to track them
    const el = scrollElement;
    const count = flatList.length;
    const list = flatList;

    if (!el) {
      // Return a dummy virtualizer when no scroll element
      return createVirtualizer({
        count: 0,
        getScrollElement: () => null,
        estimateSize: () => 28,
      });
    }

    return createVirtualizer({
      count,
      getScrollElement: () => el,
      estimateSize: () => 28,
      overscan: 10,
      getItemKey: (index: number) => list[index]?.node.id ?? index,
    });
  });

  // Get virtual items from the store
  let virtualItems = $derived($virtualizer.getVirtualItems());
  let totalSize = $derived($virtualizer.getTotalSize());

  // Scroll to focused item when focus changes
  $effect(() => {
    const focusedId = outline.focusedId;
    if (!focusedId || !scrollElement) return;

    const index = flatList.findIndex(item => item.node.id === focusedId);
    if (index >= 0) {
      $virtualizer.scrollToIndex(index, { align: 'auto' });
    }
  });
</script>

<div
  bind:this={scrollElement}
  class="virtual-scroll-container"
>
  <div
    class="virtual-scroll-content"
    style="height: {totalSize}px;"
  >
    {#each virtualItems as virtualRow (virtualRow.key)}
      {@const item = flatList[virtualRow.index]}
      {#if item}
        <div
          class="virtual-row"
          style="
            position: absolute;
            top: 0;
            left: 0;
            width: 100%;
            transform: translateY({virtualRow.start}px);
          "
          data-index={virtualRow.index}
        >
          <FlatOutlineItem
            {item}
            {onNavigateToNode}
            measureElement={$virtualizer.measureElement}
          />
        </div>
      {/if}
    {/each}
  </div>
</div>

<style>
  .virtual-scroll-container {
    height: 100%;
    overflow-y: auto;
    /* Use size instead of strict to allow fixed positioned children to escape */
    contain: size layout;
  }

  .virtual-scroll-content {
    width: 100%;
    position: relative;
  }

  .virtual-row {
    /* Remove containment that creates stacking context issues */
  }
</style>
