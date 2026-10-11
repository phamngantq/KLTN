import type { SelectHTMLAttributes } from 'react';
import { minutesToTime } from '../../../shared/time';

/** 'HH:MM' options on the 30-minute grid. Starts: 00:00–23:30, ends: 00:30–24:00. */
export const START_TIMES = Array.from({ length: 48 }, (_, i) => minutesToTime(i * 30));
export const END_TIMES = Array.from({ length: 48 }, (_, i) => minutesToTime((i + 1) * 30));

interface TimeSelectProps extends Omit<SelectHTMLAttributes<HTMLSelectElement>, 'children'> {
  kind: 'start' | 'end';
  invalid?: boolean;
}

/** Compact labelled-by-aria time picker for dense schedule rows (label supplied via aria-label). */
export function TimeSelect({ kind, invalid = false, className = '', ...props }: TimeSelectProps) {
  return (
    <select
      aria-invalid={invalid}
      className={`min-h-11 rounded-md border border-border-strong bg-bg px-2 text-fg focus-visible:outline-2 focus-visible:outline-focus aria-[invalid=true]:border-danger ${className}`}
      {...props}
    >
      {(kind === 'start' ? START_TIMES : END_TIMES).map((time) => (
        <option key={time} value={time}>
          {time}
        </option>
      ))}
    </select>
  );
}
