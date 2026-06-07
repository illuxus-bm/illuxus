import * as React from "react";
import { Clock } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

export interface TimePickerProps {
  /** 24-hour "HH:mm" string. Empty string for unset. */
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  disabled?: boolean;
  /** Minute increment shown in the list. Defaults to 5. */
  step?: number;
  className?: string;
  /** When provided, renders just the columns (no trigger). Used by DateTimePicker. */
  inline?: boolean;
}

const HOURS_12 = Array.from({ length: 12 }, (_, i) => i + 1);

function parse24(value: string): { hour12: number; minute: number; meridiem: "AM" | "PM" } | null {
  if (!value) return null;
  const [hStr, mStr] = value.split(":");
  const h = Number(hStr);
  const m = Number(mStr);
  if (!Number.isFinite(h) || !Number.isFinite(m)) return null;
  const meridiem = h >= 12 ? "PM" : "AM";
  const hour12 = ((h + 11) % 12) + 1;
  return { hour12, minute: m, meridiem };
}

function to24(hour12: number, minute: number, meridiem: "AM" | "PM"): string {
  let h = hour12 % 12;
  if (meridiem === "PM") h += 12;
  return `${String(h).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
}

function formatDisplay(value: string): string {
  const p = parse24(value);
  if (!p) return "";
  return `${String(p.hour12).padStart(2, "0")}:${String(p.minute).padStart(2, "0")} ${p.meridiem}`;
}

const colCls =
  "max-h-[220px] overflow-y-auto flex flex-col items-center gap-0.5 px-1.5 py-1 snap-y snap-mandatory scroll-py-2 outline-none " +
  "[&::-webkit-scrollbar]:w-1.5 [&::-webkit-scrollbar-thumb]:bg-border [&::-webkit-scrollbar-thumb]:rounded-full";

function ColumnButton({
  selected, onClick, children, ariaLabel,
}: { selected: boolean; onClick: () => void; children: React.ReactNode; ariaLabel?: string }) {
  const ref = React.useRef<HTMLButtonElement>(null);
  React.useEffect(() => {
    if (selected) ref.current?.scrollIntoView({ block: "center", behavior: "auto" });
  }, [selected]);
  return (
    <button
      ref={ref}
      type="button"
      role="option"
      aria-selected={selected}
      aria-label={ariaLabel}
      tabIndex={selected ? 0 : -1}
      data-selected={selected || undefined}
      onClick={onClick}
      className={cn(
        "h-8 w-12 shrink-0 snap-center rounded-md text-sm font-medium tabular-nums",
        "text-muted-foreground hover:bg-muted hover:text-foreground active:scale-[0.97]",
        "transition-[transform,background-color,color] duration-100",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40 focus-visible:ring-offset-1 focus-visible:ring-offset-popover",
        selected && "bg-primary text-primary-foreground hover:bg-primary hover:text-primary-foreground",
      )}
    >
      {children}
    </button>
  );
}

export function TimePickerColumns({
  value, onChange, step = 5,
}: { value: string; onChange: (v: string) => void; step?: number }) {
  const parsed = parse24(value) ?? { hour12: 12, minute: 0, meridiem: "AM" as const };
  const minutes = React.useMemo(
    () => Array.from({ length: Math.ceil(60 / step) }, (_, i) => i * step),
    [step],
  );
  const set = (next: Partial<typeof parsed>) => {
    const merged = { ...parsed, ...next };
    onChange(to24(merged.hour12, merged.minute, merged.meridiem));
  };
  return (
    <div className="flex items-stretch p-2.5 gap-1.5">
      <Column label="Hr" listLabel="Hour">
        {HOURS_12.map((h) => (
          <ColumnButton key={h} selected={parsed.hour12 === h} ariaLabel={`${h} hour`} onClick={() => set({ hour12: h })}>
            {String(h).padStart(2, "0")}
          </ColumnButton>
        ))}
      </Column>
      <div className="w-px bg-border/60 my-2" />
      <Column label="Min" listLabel="Minute">
        {minutes.map((m) => (
          <ColumnButton key={m} selected={parsed.minute === m} ariaLabel={`${m} minutes`} onClick={() => set({ minute: m })}>
            {String(m).padStart(2, "0")}
          </ColumnButton>
        ))}
      </Column>
      <div className="w-px bg-border/60 my-2" />
      <Column label="" listLabel="Period" width="w-14">
        {(["AM", "PM"] as const).map((mer) => (
          <ColumnButton key={mer} selected={parsed.meridiem === mer} ariaLabel={mer} onClick={() => set({ meridiem: mer })}>
            {mer}
          </ColumnButton>
        ))}
      </Column>
    </div>
  );
}

function Column({
  label, listLabel, children, width,
}: { label: string; listLabel: string; children: React.ReactNode; width?: string }) {
  return (
    <div className="flex flex-col items-center">
      <div className="h-5 mb-1 text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
        {label}
      </div>
      <div className={cn(colCls, width)} role="listbox" aria-label={listLabel}>
        {children}
      </div>
    </div>
  );
}

export function TimePicker({
  value, onChange, placeholder = "--:-- --", disabled, step = 5, className,
}: TimePickerProps) {
  const [open, setOpen] = React.useState(false);
  const display = formatDisplay(value);
  const now = () => {
    const d = new Date();
    const rounded = Math.round(d.getMinutes() / step) * step;
    d.setMinutes(rounded, 0, 0);
    onChange(`${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`);
  };
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          disabled={disabled}
          aria-haspopup="dialog"
          aria-expanded={open}
          aria-label={display ? `Time: ${display}` : "Pick a time"}
          className={cn(
            "flex items-center gap-2 h-10 w-full rounded-md border border-input bg-background px-3 text-left transition-colors",
            "hover:bg-muted/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40 focus-visible:ring-offset-1 focus-visible:ring-offset-background",
            disabled && "opacity-50 cursor-not-allowed",
            className,
          )}
        >
          <Clock className="h-4 w-4 text-muted-foreground shrink-0" />
          <span className={cn("flex-1 text-sm tabular-nums", !display && "text-muted-foreground")}>
            {display || placeholder}
          </span>
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" sideOffset={6} className="w-auto p-0 pointer-events-auto duration-150">
        <TimePickerColumns value={value} onChange={onChange} step={step} />
        <div className="flex items-center justify-between border-t border-border px-3 py-2">
          <Button type="button" variant="ghost" size="sm" className="h-7 px-2 text-[12px]" onClick={() => onChange("")}>
            Clear
          </Button>
          <div className="flex gap-1.5">
            <Button type="button" variant="ghost" size="sm" className="h-7 px-2 text-[12px]" onClick={now}>
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