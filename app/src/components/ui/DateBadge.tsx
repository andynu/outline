import React, { useMemo } from 'react';
import { formatDateRelative, getDateStatus } from '../../lib/dateUtils';

interface DateBadgeProps {
  date: string;
  isChecked?: boolean;
  onClick?: () => void;
}

export function DateBadge({ date, isChecked = false, onClick }: DateBadgeProps) {
  const status = useMemo(() => getDateStatus(date, isChecked), [date, isChecked]);
  const displayText = useMemo(() => formatDateRelative(date), [date]);

  const className = `date-badge ${status}`;

  return (
    <button
      className={className}
      onClick={onClick}
      tabIndex={-1}
      title={date}
    >
      {displayText}
    </button>
  );
}

export default DateBadge;
