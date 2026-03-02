import React, { useMemo } from 'react';
import { formatDateRelative, formatDateRange, getDateStatus } from '../../lib/dateUtils';

interface DateBadgeProps {
  date: string;
  dateEnd?: string;
  isChecked?: boolean;
  onClick?: () => void;
}

export function DateBadge({ date, dateEnd, isChecked = false, onClick }: DateBadgeProps) {
  const status = useMemo(() => getDateStatus(date, isChecked), [date, isChecked]);
  const displayText = useMemo(() => formatDateRange(date, dateEnd), [date, dateEnd]);
  const titleText = dateEnd ? `${date} - ${dateEnd}` : date;

  const className = `date-badge ${status}`;

  return (
    <button
      className={className}
      onClick={onClick}
      tabIndex={-1}
      title={titleText}
    >
      {displayText}
    </button>
  );
}

export default DateBadge;
