<script lang="ts">
  import { onMount, onDestroy } from 'svelte';

  interface MenuItem {
    label: string;
    shortcut?: string;
    action: () => void;
    separator?: false;
  }

  interface MenuSeparator {
    separator: true;
  }

  type MenuEntry = MenuItem | MenuSeparator;

  interface Props {
    label: string;
    items: MenuEntry[];
    isOpen: boolean;
    onOpen: () => void;
    onClose: () => void;
  }

  let { label, items, isOpen, onOpen, onClose }: Props = $props();
  let buttonRef: HTMLButtonElement | undefined = $state();
  let menuRef: HTMLDivElement | undefined = $state();

  function handleButtonClick() {
    if (isOpen) {
      onClose();
    } else {
      onOpen();
    }
  }

  function handleItemClick(item: MenuItem) {
    item.action();
    onClose();
  }

  function handleKeyDown(event: KeyboardEvent) {
    if (event.key === 'Escape' && isOpen) {
      onClose();
      buttonRef?.focus();
    }
  }

  function handleClickOutside(event: MouseEvent) {
    if (!isOpen) return;
    const target = event.target as Node;
    if (buttonRef && buttonRef.contains(target)) return;
    if (menuRef && menuRef.contains(target)) return;
    onClose();
  }

  onMount(() => {
    document.addEventListener('click', handleClickOutside);
    document.addEventListener('keydown', handleKeyDown);
  });

  onDestroy(() => {
    document.removeEventListener('click', handleClickOutside);
    document.removeEventListener('keydown', handleKeyDown);
  });
</script>

<div class="menu-dropdown">
  <button
    bind:this={buttonRef}
    class="menu-trigger"
    class:open={isOpen}
    onclick={handleButtonClick}
    aria-expanded={isOpen}
    aria-haspopup="menu"
  >
    {label}
  </button>

  {#if isOpen}
    <div bind:this={menuRef} class="menu-content" role="menu">
      {#each items as item}
        {#if item.separator}
          <div class="menu-separator" role="separator"></div>
        {:else}
          <button
            class="menu-item-btn"
            role="menuitem"
            onclick={() => handleItemClick(item)}
          >
            <span class="item-label">{item.label}</span>
            {#if item.shortcut}
              <span class="item-shortcut">{item.shortcut}</span>
            {/if}
          </button>
        {/if}
      {/each}
    </div>
  {/if}
</div>

<style>
  .menu-dropdown {
    position: relative;
  }

  .menu-trigger {
    padding: 6px 12px;
    background: transparent;
    border: none;
    font-size: 13px;
    color: var(--text-primary);
    cursor: pointer;
    border-radius: 4px;
    margin: 2px 0;
  }

  .menu-trigger:hover,
  .menu-trigger.open {
    background: var(--bg-tertiary);
  }

  .menu-content {
    position: absolute;
    top: 100%;
    left: 0;
    min-width: 200px;
    background: var(--bg-elevated);
    border: 1px solid var(--border-primary);
    border-radius: 6px;
    box-shadow: 0 4px 12px var(--modal-overlay);
    padding: 4px 0;
    z-index: 100;
  }

  .menu-item-btn {
    display: flex;
    align-items: center;
    justify-content: space-between;
    width: 100%;
    padding: 8px 12px;
    background: transparent;
    border: none;
    font-size: 13px;
    color: var(--text-primary);
    cursor: pointer;
    text-align: left;
  }

  .menu-item-btn:hover {
    background: var(--bg-tertiary);
  }

  .item-label {
    flex: 1;
  }

  .item-shortcut {
    margin-left: 24px;
    color: var(--text-tertiary);
    font-size: 12px;
  }

  .menu-separator {
    height: 1px;
    background: var(--border-primary);
    margin: 4px 0;
  }
</style>
