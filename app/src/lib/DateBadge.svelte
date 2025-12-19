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
    background: var(--date-overdue-bg);
    color: var(--date-overdue);
  }

  .date-badge.overdue:hover {
    background: var(--date-overdue-bg-hover);
  }

  .date-badge.today {
    background: var(--date-today-bg);
    color: var(--date-today);
  }

  .date-badge.today:hover {
    background: var(--date-today-bg-hover);
  }

  .date-badge.upcoming {
    background: var(--date-upcoming-bg);
    color: var(--date-upcoming);
  }

  .date-badge.upcoming:hover {
    background: var(--date-upcoming-bg-hover);
  }

  .date-badge.future {
    background: var(--date-future-bg);
    color: var(--date-future);
  }

  .date-badge.future:hover {
    background: var(--date-future-bg-hover);
  }

  .date-badge.completed {
    background: var(--date-completed-bg);
    color: var(--date-completed);
    text-decoration: line-through;
  }

  .date-badge.completed:hover {
    background: var(--date-completed-bg-hover);
  }
</style>
