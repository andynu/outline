<script lang="ts">
  import { onMount, onDestroy } from 'svelte';

  type MenuItem = {
    label: string;
    action: () => void;
    disabled?: boolean;
    separator?: false;
    shortcut?: string;
  } | {
    separator: true;
    label?: undefined;
    action?: undefined;
    disabled?: undefined;
    shortcut?: undefined;
  };

  interface Props {
    items: MenuItem[];
    position: { x: number; y: number };
    onClose: () => void;
  }

  let { items, position, onClose }: Props = $props();
  let menuElement: HTMLDivElement | undefined = $state();

  onMount(() => {
    // Close on click outside
    const handleClickOutside = (event: MouseEvent) => {
      if (menuElement && !menuElement.contains(event.target as Node)) {
        onClose();
      }
    };

    // Close on escape
    const handleKeydown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onClose();
      }
    };

    // Delay to avoid immediate close from the same click
    setTimeout(() => {
      document.addEventListener('click', handleClickOutside);
      document.addEventListener('keydown', handleKeydown);
    }, 0);

    return () => {
      document.removeEventListener('click', handleClickOutside);
      document.removeEventListener('keydown', handleKeydown);
    };
  });

  function handleItemClick(item: MenuItem) {
    if (!item.separator && item.action && !item.disabled) {
      item.action();
      onClose();
    }
  }

  // Adjust position to keep menu in viewport
  let adjustedPosition = $derived(() => {
    if (!menuElement) return position;

    const rect = menuElement.getBoundingClientRect();
    let x = position.x;
    let y = position.y;

    // Adjust horizontal
    if (x + rect.width > window.innerWidth) {
      x = window.innerWidth - rect.width - 10;
    }

    // Adjust vertical
    if (y + rect.height > window.innerHeight) {
      y = window.innerHeight - rect.height - 10;
    }

    return { x, y };
  });
</script>

<div
  class="context-menu"
  bind:this={menuElement}
  style="left: {adjustedPosition().x}px; top: {adjustedPosition().y}px"
  role="menu"
>
  {#each items as item}
    {#if item.separator}
      <div class="separator"></div>
    {:else}
      <button
        class="menu-item"
        class:disabled={item.disabled}
        onclick={() => handleItemClick(item)}
        disabled={item.disabled}
        role="menuitem"
      >
        <span class="label">{item.label}</span>
        {#if item.shortcut}
          <span class="shortcut">{item.shortcut}</span>
        {/if}
      </button>
    {/if}
  {/each}
</div>

<style>
  .context-menu {
    position: fixed;
    background: var(--bg-elevated);
    border: 1px solid var(--border-primary);
    border-radius: 8px;
    box-shadow: 0 4px 16px var(--modal-overlay);
    padding: 4px 0;
    min-width: 180px;
    z-index: 2000;
  }

  .menu-item {
    display: flex;
    align-items: center;
    justify-content: space-between;
    width: 100%;
    padding: 8px 12px;
    background: none;
    border: none;
    cursor: pointer;
    text-align: left;
    font-size: 13px;
    color: var(--text-primary);
  }

  .menu-item:hover:not(.disabled) {
    background: var(--accent-primary-lighter);
    color: var(--accent-primary);
  }

  .menu-item.disabled {
    color: var(--text-tertiary);
    cursor: not-allowed;
  }

  .shortcut {
    font-size: 11px;
    color: var(--text-tertiary);
    margin-left: 20px;
  }

  .menu-item:hover:not(.disabled) .shortcut {
    color: var(--accent-primary-light);
  }

  .separator {
    height: 1px;
    background: var(--border-primary);
    margin: 4px 0;
  }
</style>
