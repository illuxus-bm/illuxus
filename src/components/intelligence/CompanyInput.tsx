import { useEffect, useId, useRef, useState, type ComponentProps } from "react";
import { BadgeCheck, Building2, Loader2 } from "lucide-react";
import { Input } from "@/components/ui/input";
import { supabaseRpc } from "@/lib/observability";
import { cn } from "@/lib/utils";

export interface CompanySuggestion {
  company_id: string;
  name: string;
  verified: boolean;
}

type InputProps = Omit<ComponentProps<typeof Input>, "value" | "onChange" | "role">;

interface Props extends InputProps {
  value: string;
  onChange: (value: string) => void;
}

/** Characters typed before suggestions are fetched, and the pause after typing. */
export const COMPANY_SUGGEST_MIN = 2;
const DEBOUNCE_MS = 200;

/**
 * A company text box that suggests companies already on record
 * (`suggest_companies`, migration 061) as the person types. The value is
 * always plain text — picking a suggestion fills in its name, and any other
 * name can still be typed. Works signed in or out; a failed or rate-limited
 * lookup just shows no suggestions.
 */
export function CompanyInput({ value, onChange, className, onKeyDown, onFocus, ...inputProps }: Props) {
  const [results, setResults] = useState<CompanySuggestion[]>([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [highlight, setHighlight] = useState(-1);
  // The name last picked, so choosing a suggestion doesn't search for it again.
  const picked = useRef<string | null>(null);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const listId = useId();

  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) setOpen(false);
    };
    window.addEventListener("mousedown", onClick);
    return () => window.removeEventListener("mousedown", onClick);
  }, []);

  useEffect(() => {
    const q = value.trim();
    if (q.length < COMPANY_SUGGEST_MIN || q === picked.current) {
      setResults([]);
      setOpen(false);
      return;
    }
    let live = true;
    const timer = window.setTimeout(async () => {
      setLoading(true);
      const { data, error } = await supabaseRpc<CompanySuggestion[]>("suggest_companies", { _q: q, _limit: 8 });
      if (!live) return;
      setLoading(false);
      const rows = !error && Array.isArray(data) ? data : [];
      setResults(rows);
      setHighlight(-1);
      // Nothing worth showing when the only suggestion is exactly what was typed.
      setOpen(rows.length > 0 && !(rows.length === 1 && rows[0].name.toLowerCase() === q.toLowerCase()));
    }, DEBOUNCE_MS);
    return () => {
      live = false;
      window.clearTimeout(timer);
    };
  }, [value]);

  const choose = (s: CompanySuggestion) => {
    picked.current = s.name;
    onChange(s.name);
    setOpen(false);
  };

  return (
    <div ref={wrapperRef} className="relative">
      <Input
        {...inputProps}
        value={value}
        role="combobox"
        aria-autocomplete="list"
        aria-expanded={open}
        aria-controls={listId}
        aria-activedescendant={open && highlight >= 0 ? `${listId}-${highlight}` : undefined}
        autoComplete="off"
        className={cn(loading && "pr-9", className)}
        onChange={(e) => {
          picked.current = null;
          onChange(e.target.value);
        }}
        onFocus={(e) => {
          if (results.length > 0) setOpen(true);
          onFocus?.(e);
        }}
        onKeyDown={(e) => {
          if (open && results.length > 0) {
            if (e.key === "ArrowDown") {
              e.preventDefault();
              setHighlight((h) => Math.min(h + 1, results.length - 1));
              return;
            }
            if (e.key === "ArrowUp") {
              e.preventDefault();
              setHighlight((h) => Math.max(h - 1, 0));
              return;
            }
            if (e.key === "Enter" && highlight >= 0) {
              e.preventDefault();
              choose(results[highlight]);
              return;
            }
            if (e.key === "Escape") {
              e.preventDefault();
              setOpen(false);
              return;
            }
          }
          onKeyDown?.(e);
        }}
      />
      {loading && (
        <Loader2 className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 animate-spin text-muted-foreground" />
      )}
      {open && results.length > 0 && (
        <ul
          id={listId}
          role="listbox"
          className="absolute z-50 mt-1 max-h-72 w-full overflow-y-auto rounded-md border border-border bg-popover py-1 shadow-lg"
        >
          {results.map((s, i) => (
            <li
              key={s.company_id}
              id={`${listId}-${i}`}
              role="option"
              aria-selected={i === highlight}
              // mousedown, so the pick lands before the input loses focus.
              onMouseDown={(e) => {
                e.preventDefault();
                choose(s);
              }}
              onMouseEnter={() => setHighlight(i)}
              className={cn(
                "flex cursor-pointer items-center gap-2 px-3 py-2 text-sm transition-colors",
                i === highlight ? "bg-primary/10 text-foreground" : "hover:bg-muted",
              )}
            >
              <Building2 className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
              <span className="truncate">{s.name}</span>
              {s.verified && <BadgeCheck className="ml-auto h-3.5 w-3.5 shrink-0 text-primary" aria-label="Verified" />}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export default CompanyInput;
