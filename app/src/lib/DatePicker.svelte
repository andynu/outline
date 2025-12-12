<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import { parseNaturalDate, formatISODate, getTodayISO } from './dateUtils';

  interface Props {
    position: { x: number; y: number };
    currentDate?: string;
    onSelect: (date: string | null) => void;
    onClose: () => void;
  }

  let { position, currentDate, onSelect, onClose }: Props = $props();

  let inputValue = $state(currentDate || '');
  let inputElement: HTMLInputElement | undefined = $state();
  let parsedDate = $derived(parseNaturalDate(inputValue));
  let isValid = $derived(parsedDate !== null || inputValue === '');

  onMount(() => {
    inputElement?.focus();
    inputElement?.select();

    // Add click outside listener
    const handleClickOutside = (e: MouseEvent) => {
      const target = e.target as Element;
      if (!target.closest('.date-picker')) {
        onClose();
      }
    };

    // Delay to avoid immediate close
    setTimeout(() => {
      document.addEventListener('click', handleClickOutside);
    }, 0);

    return () => {
      document.removeEventListener('click', handleClickOutside);
    };
  });

  function handleKeyDown(e: KeyboardEvent) {
    if (e.key === 'Escape') {
      e.preventDefault();
      onClose();
    } else if (e.key === 'Enter') {
      e.preventDefault();
      handleSubmit();
    } else if (e.key === 'Backspace' && inputValue === '') {
      e.preventDefault();
      onSelect(null); // Clear the date
    }
  }

  function handleSubmit() {
    if (inputValue === '') {
      onSelect(null); // Clear the date
    } else if (parsedDate) {
      onSelect(parsedDate);
    }
  }

  function setQuickDate(offset: number) {
    const date = new Date();
    date.setDate(date.getDate() + offset);
    onSelect(formatISODate(date));
  }
</script>

<div class="date-picker" style="left: {position.x}px; top: {position.y}px;">
  <div class="date-picker-header">
    <input
      bind:this={inputElement}
      bind:value={inputValue}
      onkeydown={handleKeyDown}
      class="date-input"
      class:invalid={!isValid}
      placeholder="today, tomorrow, jan 15..."
      spellcheck="false"
    />
  </div>

  {#if parsedDate && inputValue}
    <div class="preview">
      {new Date(parsedDate).toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })}
    </div>
  {/if}

  <div class="quick-dates">
    <button class="quick-date" onclick={() => setQuickDate(0)}>Today</button>
    <button class="quick-date" onclick={() => setQuickDate(1)}>Tomorrow</button>
    <button class="quick-date" onclick={() => setQuickDate(7)}>Next week</button>
    <button class="quick-date" onclick={() => onSelect(null)}>Clear</button>
  </div>

  <div class="hints">
    <span>today</span>
    <span>+3d</span>
    <span>mon</span>
    <span>jan 15</span>
  </div>
</div>

<style>
  .date-picker {
    position: fixed;
    z-index: 1000;
    background: white;
    border: 1px solid #ddd;
    border-radius: 8px;
    box-shadow: 0 4px 16px rgba(0, 0, 0, 0.15);
    padding: 12px;
    min-width: 240px;
  }

  .date-picker-header {
    margin-bottom: 8px;
  }

  .date-input {
    width: 100%;
    padding: 8px 12px;
    border: 1px solid #ddd;
    border-radius: 6px;
    font-size: 14px;
    outline: none;
    box-sizing: border-box;
  }

  .date-input:focus {
    border-color: #2196f3;
    box-shadow: 0 0 0 2px rgba(33, 150, 243, 0.2);
  }

  .date-input.invalid {
    border-color: #f44336;
  }

  .preview {
    padding: 8px 12px;
    background: #f5f5f5;
    border-radius: 6px;
    font-size: 13px;
    color: #666;
    margin-bottom: 8px;
  }

  .quick-dates {
    display: flex;
    gap: 6px;
    flex-wrap: wrap;
    margin-bottom: 8px;
  }

  .quick-date {
    padding: 4px 10px;
    border: 1px solid #ddd;
    border-radius: 4px;
    background: white;
    font-size: 12px;
    cursor: pointer;
    transition: all 0.1s;
  }

  .quick-date:hover {
    background: #f5f5f5;
    border-color: #ccc;
  }

  .hints {
    display: flex;
    gap: 8px;
    font-size: 11px;
    color: #999;
  }

  .hints span {
    background: #f5f5f5;
    padding: 2px 6px;
    border-radius: 3px;
  }
</style>
