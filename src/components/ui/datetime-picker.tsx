import * as React from "react";
import { format, parse, isValid } from "date-fns";
import { Calendar as CalendarIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { TimePickerColumns } from "./time-picker";

export interface DateTimePickerProps {
  /** "YYYY-MM-DDTHH:mm" local-time string (datetime-local format). */
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  disabled?: boolean;
  min?: string;
  max?: string;
  className?: string;
}

function parseValue(v: string): Date | null {
  if (!v) return null;
  const d = parse(v, "yyyy-MM-dd'T'HH:mm", new Date());
  return isValid(d) ? d : null;
}

function toValue(d: Date): string {
  return format(d, "yyyy-MM-dd'T'HH:mm");
}

export function DateTimePicker({
  value, onChange, placeholder = "Pick date & time", disabled, min, max, className,
}: DateTimePickerProps) {
  const [open, setOpen] = React.useState(false);
  const date = parseValue(value);
  const minD = min ? parseValue(min) ?? undefined : undefined;
  const maxD = max ? parseValue(max) ?? undefined : undefined;
  const time24 = date ? format(date, "HH:mm") : "";

  const updateDate = (next: Date | undefined) => {
    if (!next) return;
    const base = date ?? new Date(next);
    const merged = new Date(next);
    merged.setHours(base.getHours(), base.getMinutes(), 0, 0);
    onChange(toValue(merged));
  };
  const updateTime = (t: string) => {
    const [h, m] = t.split(":").map(Number);
    const base = date ?? new Date();
    base.setHours(h || 0, m || 0, 0, 0);
    onChange(toValue(base));
  };

  const display = date ? format(date, "MM/dd/yyyy · h:mm a") : "";

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          disabled={disabled}
          aria-haspopup="dialog"
          aria-expanded={open}
          aria-label={display ? `Date and time: ${display}` : (placeholder || "Pick date and time")}
          className={cn(
            "flex items-center gap-2 h-10 w-full rounded-md border border-input bg-background px-3 text-left transition-colors",
            "hover:bg-muted/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40 focus-visible:ring-offset-1 focus-visible:ring-offset-background",
            disabled && "opacity-50 cursor-not-allowed",
            className,
          )}
        >
          <CalendarIcon className="h-4 w-4 text-muted-foreground shrink-0" />
          <span className={cn("flex-1 text-sm tabular-nums truncate", !display && "text-muted-foreground")}>
            {display || placeholder}
          </span>
          <span className="sr-only" aria-live="polite">
            {display ? `Selected ${display}` : ""}
          </span>
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" sideOffset={6} className="w-auto p-0 pointer-events-auto duration-150">
        <div className="flex flex-col sm:flex-row">
          <Calendar
            mode="single"
            selected={date ?? undefined}
            onSelect={updateDate}
            disabled={(d) => (minD ? d < new Date(minD.toDateString()) : false) || (maxD ? d > new Date(maxD.toDateString()) : false)}
            initialFocus
            className={cn("p-3 pointer-events-auto")}
          />
          <div className="border-t sm:border-t-0 sm:border-l border-border">
            <TimePickerColumns value={time24} onChange={updateTime} />
          </div>
        </div>
        <div className="flex items-center justify-between border-t border-border px-3 py-2">
          <Button type="button" variant="ghost" size="sm" className="h-7 px-2 text-[12px]" onClick={() => onChange("")}>
            Clear
          </Button>
          <div className="flex gap-1.5">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-7 px-2 text-[12px]"
              onClick={() => {
                const d = new Date();
                d.setMinutes(Math.round(d.getMinutes() / 5) * 5, 0, 0);
                onChange(toValue(d));
              }}
            >
              Now
            </Button>
            <Button type="button" size="sm" className="h-7 px-3 text-[12px]" onClick={() => setOpen(false)}>
              Done
            </Button>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}