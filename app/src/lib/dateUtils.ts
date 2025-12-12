// Date utilities for task management

export type DateStatus = 'overdue' | 'today' | 'upcoming' | 'future' | 'completed';

/**
 * Get the status of a date relative to today
 */
export function getDateStatus(dateStr: string, isChecked: boolean): DateStatus {
  if (isChecked) return 'completed';

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const date = new Date(dateStr);
  date.setHours(0, 0, 0, 0);

  const diffDays = Math.floor((date.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));

  if (diffDays < 0) return 'overdue';
  if (diffDays === 0) return 'today';
  if (diffDays <= 7) return 'upcoming';
  return 'future';
}

/**
 * Format a date string for display relative to today
 */
export function formatDateRelative(dateStr: string): string {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const date = new Date(dateStr);
  date.setHours(0, 0, 0, 0);

  const diffDays = Math.floor((date.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));

  if (diffDays === -1) return 'Yesterday';
  if (diffDays === 0) return 'Today';
  if (diffDays === 1) return 'Tomorrow';
  if (diffDays > 1 && diffDays <= 7) {
    return date.toLocaleDateString('en-US', { weekday: 'short' });
  }

  // For dates more than a week away or in the past, show the date
  const sameYear = date.getFullYear() === today.getFullYear();
  if (sameYear) {
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  }
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

/**
 * Parse natural language date input into ISO date string
 * Supports: today, tomorrow, yesterday, next week, +Nd, weekday names, dates like "jan 15"
 */
export function parseNaturalDate(input: string): string | null {
  const trimmed = input.toLowerCase().trim();

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  // Relative dates
  if (trimmed === 'today' || trimmed === 'tod') {
    return formatISODate(today);
  }

  if (trimmed === 'tomorrow' || trimmed === 'tom') {
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);
    return formatISODate(tomorrow);
  }

  if (trimmed === 'yesterday') {
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);
    return formatISODate(yesterday);
  }

  // +N days pattern (e.g., +3d, +7d, +1w)
  const plusDaysMatch = trimmed.match(/^\+(\d+)([dwm])?$/);
  if (plusDaysMatch) {
    const amount = parseInt(plusDaysMatch[1], 10);
    const unit = plusDaysMatch[2] || 'd';
    const result = new Date(today);

    if (unit === 'd') {
      result.setDate(result.getDate() + amount);
    } else if (unit === 'w') {
      result.setDate(result.getDate() + amount * 7);
    } else if (unit === 'm') {
      result.setMonth(result.getMonth() + amount);
    }
    return formatISODate(result);
  }

  // Next week
  if (trimmed === 'next week' || trimmed === 'nw') {
    const nextWeek = new Date(today);
    nextWeek.setDate(nextWeek.getDate() + 7);
    return formatISODate(nextWeek);
  }

  // Weekday names (this or next occurrence)
  const weekdays = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
  const shortWeekdays = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];

  let targetDay = weekdays.indexOf(trimmed);
  if (targetDay === -1) {
    targetDay = shortWeekdays.indexOf(trimmed);
  }

  if (targetDay !== -1) {
    const result = new Date(today);
    const currentDay = result.getDay();
    let daysUntil = targetDay - currentDay;
    if (daysUntil <= 0) daysUntil += 7; // Next occurrence
    result.setDate(result.getDate() + daysUntil);
    return formatISODate(result);
  }

  // Month day patterns: "jan 15", "january 15", "jan15"
  const monthDayMatch = trimmed.match(/^(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\s*(\d{1,2})$/);
  if (monthDayMatch) {
    const months: Record<string, number> = {
      jan: 0, feb: 1, mar: 2, apr: 3, may: 4, jun: 5,
      jul: 6, aug: 7, sep: 8, oct: 9, nov: 10, dec: 11
    };
    const month = months[monthDayMatch[1]];
    const day = parseInt(monthDayMatch[2], 10);
    const result = new Date(today.getFullYear(), month, day);
    // If the date is in the past, use next year
    if (result < today) {
      result.setFullYear(result.getFullYear() + 1);
    }
    return formatISODate(result);
  }

  // ISO date format: 2025-01-15
  const isoMatch = trimmed.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (isoMatch) {
    return trimmed;
  }

  // MM/DD or DD/MM format
  const slashMatch = trimmed.match(/^(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?$/);
  if (slashMatch) {
    const [, first, second, yearPart] = slashMatch;
    // Assume MM/DD for US locale
    const month = parseInt(first, 10) - 1;
    const day = parseInt(second, 10);
    let year = today.getFullYear();
    if (yearPart) {
      year = parseInt(yearPart, 10);
      if (year < 100) year += 2000;
    }
    const result = new Date(year, month, day);
    if (!yearPart && result < today) {
      result.setFullYear(result.getFullYear() + 1);
    }
    return formatISODate(result);
  }

  return null;
}

/**
 * Format a Date object as ISO date string (YYYY-MM-DD)
 */
export function formatISODate(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/**
 * Get today's date as ISO string
 */
export function getTodayISO(): string {
  return formatISODate(new Date());
}

/**
 * Check if a date string is valid
 */
export function isValidDate(dateStr: string): boolean {
  const date = new Date(dateStr);
  return !isNaN(date.getTime());
}
