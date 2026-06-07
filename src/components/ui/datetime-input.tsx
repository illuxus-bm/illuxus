import * as React from "react";
import { format, parse, isValid } from "date-fns";
import { Calendar as CalendarIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

/**
 * Themed date picker. Replaces native `<input type="date">` with a
 * Popover + Calendar so the dropdown matches our design system instead of
 * leaking the browser's chrome.
 *
 * Value contract: "YYYY-MM-DD" string (same as the native date input).
 * `variant` is kept for backwards compatibility but only `date` is supported
 * — use `TimePicker` or `DateTimePicker` for the other variants.
 */
export interface DateTimeInputProps {
  variant?: "date";
  value: string;
  onChange: (e: { target: { value: string } }) => void;
  min?: string;
  max?: string;
  disabled?: boolean;
  placeholder?: string;
  className?: string;
  invalid?: boolean;
}

function parseISO(v?: string): Date | null {
  if (!v) return null;
  const d = parse(v, "yyyy-MM-dd", new Date());
  return isValid(d) ? d : null;
}

export function DateTimeInput({
  value, onChange, min, max, disabled, placeholder = "Pick a date", className, invalid,
}: DateTimeInputProps) {
  const [open, setOpen] = React.useState(false);
  const date = parseISO(value);
  const minD = parseISO(min);
  const maxD = parseISO(max);
  const display = date ? format(date, "EEE, MMM d, yyyy") : "";

  const emit = (d: Date | undefined) => {
    onChange({ target: { value: d ? format(d, "yyyy-MM-dd") : "" } });
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          disabled={disabled}
          className={cn(
            "flex items-center gap-2 h-10 w-full rounded-md border border-input bg-background px-3 text-left transition-colors",
            "hover:bg-accent/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:border-ring",
            invalid && "border-destructive focus-visible:ring-destructive",
            disabled && "opacity-50 cursor-not-allowed",
            className,
          )}
        >
          <CalendarIcon className="h-4 w-4 text-muted-foreground shrink-0" />
          <span className={cn("flex-1 text-sm tabular-nums truncate", !display && "text-muted-foreground")}>
            {display || placeholder}
          </span>
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-auto p-0 pointer-events-auto">
        <Calendar
          mode="single"
          selected={date ?? undefined}
          onSelect={(d) => { emit(d); setOpen(false); }}
          disabled={(d) => (minD ? d < new Date(minD.toDateString()) : false) || (maxD ? d > new Date(maxD.toDateString()) : false)}
          initialFocus
          className={cn("p-3 pointer-events-auto")}
        />
        <div className="flex items-center justify-between border-t border-border px-2 py-1.5">
          <Button type="button" variant="ghost" size="sm" className="h-7 text-[12px]" onClick={() => { emit(undefined); }}>
            Clear
          </Button>
          <Button type="button" variant="ghost" size="sm" className="h-7 text-[12px]" onClick={() => { emit(new Date()); setOpen(false); }}>
            Today
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}