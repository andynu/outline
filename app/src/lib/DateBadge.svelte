<script lang="ts">
  import { formatDateRelative, getDateStatus } from './dateUtils';

  interface Props {
    date: string;
    isChecked?: boolean;
    onclick?: () => void;
  }

  let { date, isChecked = false, onclick }: Props = $props();

  let status = $derived(getDateStatus(date, isChecked));
  let displayText = $derived(formatDateRelative(date));
</script>

<button
  class="date-badge"
  class:overdue={status === 'overdue'}
  class:today={status === 'today'}
  class:upcoming={status === 'upcoming'}
  class:future={status === 'future'}
  class:completed={status === 'completed'}
  onclick={onclick}
  tabindex="-1"
  title={date}
>
  {displayText}
</button>

<style>
  .date-badge {
    display: inline-flex;
    align-items: center;
    padding: 1px 8px;
    border-radius: 10px;
    font-size: 0.8em;
    font-weight: 500;
    cursor: pointer;
    border: none;
    margin-left: 6px;
    transition: all 0.15s;
    white-space: nowrap;
  }

  .date-badge.overdue {
    background: #ffebee;
    color: #c62828;
  }

  .date-badge.overdue:hover {
    background: #ffcdd2;
  }

  .date-badge.today {
    background: #fff3e0;
    color: #e65100;
  }

  .date-badge.today:hover {
    background: #ffe0b2;
  }

  .date-badge.upcoming {
    background: #e3f2fd;
    color: #1565c0;
  }

  .date-badge.upcoming:hover {
    background: #bbdefb;
  }

  .date-badge.future {
    background: #f5f5f5;
    color: #616161;
  }

  .date-badge.future:hover {
    background: #eeeeee;
  }

  .date-badge.completed {
    background: #e8f5e9;
    color: #2e7d32;
    text-decoration: line-through;
  }

  .date-badge.completed:hover {
    background: #c8e6c9;
  }
</style>
