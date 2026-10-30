"use client";

import { CalendarDays } from "lucide-react";
import { useState } from "react";
import type { DateRange } from "react-day-picker";
import { vi } from "react-day-picker/locale";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { useStableCallback } from "@/hooks/use-stable-callback";
import {
  formatDateRange,
  fromIsoDay,
  joinDateRange,
  parseDateRange,
  toIsoDay,
} from "@/lib/date-range";
import * as m from "@/paraglide/messages";
import { getLocale } from "@/paraglide/runtime";

type Props = {
  id: string;
  value: unknown;
  disabled: boolean;
  onChange: (value: string | null) => void;
};

// One calendar to pick the first and the last day, instead of two date inputs
export function DateRangeField({ id, value, disabled, onChange }: Props) {
  const [open, setOpen] = useState(false);
  const range = parseDateRange(value);
  const selected: DateRange | undefined = range
    ? { from: fromIsoDay(range.from), to: fromIsoDay(range.to) }
    : undefined;

  const handleSelect = useStableCallback((next: DateRange | undefined) => {
    if (!next?.from) {
      onChange(null);
      return;
    }
    // A first click alone is a one-day range; the second click extends it
    onChange(
      joinDateRange(toIsoDay(next.from), toIsoDay(next.to ?? next.from))
    );
  });

  return (
    <Popover onOpenChange={setOpen} open={open}>
      <PopoverTrigger asChild>
        <Button
          className="w-full justify-start font-normal"
          disabled={disabled}
          id={id}
          type="button"
          variant="outline"
        >
          <CalendarDays className="size-4" />
          {formatDateRange(value, getLocale()) ?? (
            <span className="text-muted-foreground">
              {m.date_range_placeholder()}
            </span>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-auto p-0">
        <Calendar
          defaultMonth={selected?.from}
          locale={getLocale() === "vi" ? vi : undefined}
          mode="range"
          onSelect={handleSelect}
          selected={selected}
        />
      </PopoverContent>
    </Popover>
  );
}
