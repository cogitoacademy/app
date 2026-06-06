'use client';

import { useState } from 'react';
import { format, parseISO } from 'date-fns';
import { Popover } from '@base-ui/react/popover';
import { IconCalendar } from '@tabler/icons-react';
import { cn } from '@cogito-app/ui/lib/utils';
import { Calendar } from './calendar';

export type DatePickerProps = {
  value?: string;
  onChange: (value: string) => void;
  placeholder?: string;
  disabled?: boolean;
};

export function DatePicker({
  value,
  onChange,
  placeholder = 'Pick a date',
  disabled,
}: DatePickerProps) {
  const [open, setOpen] = useState(false);

  const date = value ? parseISO(value) : undefined;

  const handleSelect = (selectedDate: Date | undefined) => {
    if (selectedDate) {
      onChange(format(selectedDate, 'yyyy-MM-dd'));
    } else {
      onChange('');
    }
    setOpen(false);
  };

  return (
    <Popover.Root open={open} onOpenChange={setOpen}>
      <Popover.Trigger
        disabled={disabled}
        className={cn(
          'flex items-center gap-2 w-full',
          'h-9.5 px-4 rounded',
          'bg-secondary text-secondary-foreground',
          'ring ring-secondary-border',
          'text-sm font-medium',
          'hover:not-[[data-disabled]]:bg-accent',
          'focus-visible:outline-2 focus-visible:outline-offset-2 outline-primary',
          'data-[popup-open]:bg-accent',
          'disabled:opacity-70 disabled:cursor-not-allowed',
          'transition-colors',
        )}
      >
        <IconCalendar className="size-4 text-muted" />
        <span className={cn(!date && 'text-muted')}>
          {date ? format(date, 'PPP') : placeholder}
        </span>
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Positioner align="start" sideOffset={4}>
          <Popover.Popup
            className={cn(
              'z-50 bg-popover text-popover-foreground',
              'border border-popover-border rounded-xl',
              'shadow-popover outline-none',
              'data-[starting-style]:opacity-0 data-[ending-style]:opacity-0',
              'data-[starting-style]:scale-95 data-[ending-style]:scale-95',
              'transition-[opacity,scale]',
            )}
          >
            <Calendar
              mode="single"
              selected={date}
              onSelect={handleSelect}
            />
          </Popover.Popup>
        </Popover.Positioner>
      </Popover.Portal>
    </Popover.Root>
  );
}
