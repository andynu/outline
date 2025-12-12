<script lang="ts">
  import { onMount } from 'svelte';

  interface Props {
    position: { x: number; y: number };
    currentRecurrence?: string;
    onSelect: (rrule: string | null) => void;
    onClose: () => void;
  }

  let { position, currentRecurrence, onSelect, onClose }: Props = $props();

  type FrequencyType = 'none' | 'daily' | 'weekly' | 'monthly' | 'yearly';

  // Parse current recurrence into UI state
  let frequency = $state<FrequencyType>('none');
  let interval = $state(1);
  let weekdays = $state<string[]>([]);

  // Parse existing RRULE on mount
  onMount(() => {
    if (currentRecurrence) {
      parseRRule(currentRecurrence);
    }

    // Add click outside listener
    const handleClickOutside = (e: MouseEvent) => {
      const target = e.target as Element;
      if (!target.closest('.recurrence-picker')) {
        onClose();
      }
    };

    setTimeout(() => {
      document.addEventListener('click', handleClickOutside);
    }, 0);

    return () => {
      document.removeEventListener('click', handleClickOutside);
    };
  });

  function parseRRule(rrule: string) {
    const parts = rrule.split(';');
    for (const part of parts) {
      const [key, value] = part.split('=');
      switch (key) {
        case 'FREQ':
          if (value === 'DAILY') frequency = 'daily';
          else if (value === 'WEEKLY') frequency = 'weekly';
          else if (value === 'MONTHLY') frequency = 'monthly';
          else if (value === 'YEARLY') frequency = 'yearly';
          break;
        case 'INTERVAL':
          interval = parseInt(value, 10) || 1;
          break;
        case 'BYDAY':
          weekdays = value.split(',');
          break;
      }
    }
  }

  function buildRRule(): string | null {
    if (frequency === 'none') return null;

    let rrule = `FREQ=${frequency.toUpperCase()}`;

    if (interval > 1) {
      rrule += `;INTERVAL=${interval}`;
    }

    if (frequency === 'weekly' && weekdays.length > 0) {
      rrule += `;BYDAY=${weekdays.join(',')}`;
    }

    return rrule;
  }

  function handleApply() {
    onSelect(buildRRule());
  }

  function handleClear() {
    onSelect(null);
  }

  function handleKeyDown(e: KeyboardEvent) {
    if (e.key === 'Escape') {
      e.preventDefault();
      onClose();
    } else if (e.key === 'Enter') {
      e.preventDefault();
      handleApply();
    }
  }

  function toggleWeekday(day: string) {
    if (weekdays.includes(day)) {
      weekdays = weekdays.filter(d => d !== day);
    } else {
      weekdays = [...weekdays, day];
    }
  }

  const weekdayOptions = [
    { value: 'MO', label: 'Mon' },
    { value: 'TU', label: 'Tue' },
    { value: 'WE', label: 'Wed' },
    { value: 'TH', label: 'Thu' },
    { value: 'FR', label: 'Fri' },
    { value: 'SA', label: 'Sat' },
    { value: 'SU', label: 'Sun' },
  ];

  let previewText = $derived(() => {
    if (frequency === 'none') return 'No recurrence';
    let text = '';
    const pluralize = interval > 1;
    switch (frequency) {
      case 'daily':
        text = pluralize ? `Every ${interval} days` : 'Daily';
        break;
      case 'weekly':
        text = pluralize ? `Every ${interval} weeks` : 'Weekly';
        if (weekdays.length > 0) {
          const dayNames = weekdays.map(d =>
            weekdayOptions.find(o => o.value === d)?.label || d
          );
          text += ` on ${dayNames.join(', ')}`;
        }
        break;
      case 'monthly':
        text = pluralize ? `Every ${interval} months` : 'Monthly';
        break;
      case 'yearly':
        text = pluralize ? `Every ${interval} years` : 'Yearly';
        break;
    }
    return text;
  });
</script>

<div class="recurrence-picker" style="left: {position.x}px; top: {position.y}px;" onkeydown={handleKeyDown}>
  <div class="picker-header">
    <h3>Repeat</h3>
  </div>

  <div class="picker-body">
    <div class="form-row">
      <label>Frequency</label>
      <select bind:value={frequency} class="frequency-select">
        <option value="none">Does not repeat</option>
        <option value="daily">Daily</option>
        <option value="weekly">Weekly</option>
        <option value="monthly">Monthly</option>
        <option value="yearly">Yearly</option>
      </select>
    </div>

    {#if frequency !== 'none'}
      <div class="form-row">
        <label>Every</label>
        <div class="interval-row">
          <input
            type="number"
            bind:value={interval}
            min="1"
            max="99"
            class="interval-input"
          />
          <span class="interval-unit">
            {#if frequency === 'daily'}
              {interval === 1 ? 'day' : 'days'}
            {:else if frequency === 'weekly'}
              {interval === 1 ? 'week' : 'weeks'}
            {:else if frequency === 'monthly'}
              {interval === 1 ? 'month' : 'months'}
            {:else if frequency === 'yearly'}
              {interval === 1 ? 'year' : 'years'}
            {/if}
          </span>
        </div>
      </div>

      {#if frequency === 'weekly'}
        <div class="form-row">
          <label>On days</label>
          <div class="weekday-grid">
            {#each weekdayOptions as day}
              <button
                class="weekday-btn"
                class:selected={weekdays.includes(day.value)}
                onclick={() => toggleWeekday(day.value)}
              >
                {day.label}
              </button>
            {/each}
          </div>
        </div>
      {/if}
    {/if}

    <div class="preview">
      {previewText()}
    </div>
  </div>

  <div class="picker-footer">
    <button class="btn-clear" onclick={handleClear}>Clear</button>
    <button class="btn-apply" onclick={handleApply}>Apply</button>
  </div>
</div>

<style>
  .recurrence-picker {
    position: fixed;
    z-index: 1000;
    background: white;
    border: 1px solid #ddd;
    border-radius: 8px;
    box-shadow: 0 4px 16px rgba(0, 0, 0, 0.15);
    min-width: 280px;
  }

  .picker-header {
    padding: 12px 16px;
    border-bottom: 1px solid #eee;
  }

  .picker-header h3 {
    margin: 0;
    font-size: 14px;
    font-weight: 600;
  }

  .picker-body {
    padding: 12px 16px;
  }

  .form-row {
    margin-bottom: 12px;
  }

  .form-row label {
    display: block;
    font-size: 12px;
    font-weight: 500;
    color: #666;
    margin-bottom: 4px;
  }

  .frequency-select {
    width: 100%;
    padding: 8px 12px;
    border: 1px solid #ddd;
    border-radius: 6px;
    font-size: 14px;
    background: white;
    cursor: pointer;
  }

  .interval-row {
    display: flex;
    align-items: center;
    gap: 8px;
  }

  .interval-input {
    width: 60px;
    padding: 8px 12px;
    border: 1px solid #ddd;
    border-radius: 6px;
    font-size: 14px;
    text-align: center;
  }

  .interval-unit {
    font-size: 14px;
    color: #666;
  }

  .weekday-grid {
    display: flex;
    gap: 4px;
    flex-wrap: wrap;
  }

  .weekday-btn {
    padding: 6px 10px;
    border: 1px solid #ddd;
    border-radius: 4px;
    background: white;
    font-size: 12px;
    cursor: pointer;
    transition: all 0.1s;
  }

  .weekday-btn:hover {
    background: #f5f5f5;
  }

  .weekday-btn.selected {
    background: #2196f3;
    border-color: #2196f3;
    color: white;
  }

  .preview {
    padding: 8px 12px;
    background: #f5f5f5;
    border-radius: 6px;
    font-size: 13px;
    color: #666;
    margin-top: 8px;
  }

  .picker-footer {
    display: flex;
    justify-content: flex-end;
    gap: 8px;
    padding: 12px 16px;
    border-top: 1px solid #eee;
  }

  .btn-clear {
    padding: 8px 16px;
    border: 1px solid #ddd;
    border-radius: 6px;
    background: white;
    font-size: 13px;
    cursor: pointer;
  }

  .btn-clear:hover {
    background: #f5f5f5;
  }

  .btn-apply {
    padding: 8px 16px;
    border: none;
    border-radius: 6px;
    background: #2196f3;
    color: white;
    font-size: 13px;
    cursor: pointer;
  }

  .btn-apply:hover {
    background: #1976d2;
  }
</style>
