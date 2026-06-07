import { useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Input } from "@/components/ui/input";
import { Loader2, MapPin } from "lucide-react";
import { cn } from "@/lib/utils";

export interface CitySuggestion {
  id: string;
  name: string;
  region: string | null;
  country: string;
  country_code: string;
  label: string;
  population: number;
}

interface Props {
  value: CitySuggestion | null;
  onChange: (city: CitySuggestion | null) => void;
  placeholder?: string;
  required?: boolean;
  id?: string;
}

/**
 * Global city autocomplete backed by the `cities` table.
 * Type a partial name (e.g. "Mumb") and pick a result like
 * "Mumbai, Maharashtra, India".
 */
export default function CityAutocomplete({ value, onChange, placeholder, required, id }: Props) {
  const [query, setQuery] = useState(value?.label ?? "");
  const [results, setResults] = useState<CitySuggestion[]>([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [highlight, setHighlight] = useState(0);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const debounceRef = useRef<number | null>(null);

  // Keep the input in sync if value is set externally
  useEffect(() => {
    if (value) setQuery(value.label);
  }, [value]);

  // Close dropdown on outside click
  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    window.addEventListener("mousedown", onClick);
    return () => window.removeEventListener("mousedown", onClick);
  }, []);

  // Debounced search
  useEffect(() => {
    if (debounceRef.current) window.clearTimeout(debounceRef.current);
    const q = query.trim();
    if (q.length < 1 || q === value?.label) {
      setResults([]);
      return;
    }
    debounceRef.current = window.setTimeout(async () => {
      setLoading(true);
      const { data, error } = await supabase.rpc("search_cities", { _q: q, _limit: 8 });
      setLoading(false);
      if (!error && data) {
        setResults(data as CitySuggestion[]);
        setOpen(true);
        setHighlight(0);
      } else {
        setResults([]);
      }
    }, 180);
    return () => {
      if (debounceRef.current) window.clearTimeout(debounceRef.current);
    };
  }, [query, value?.label]);

  const handleSelect = (city: CitySuggestion) => {
    onChange(city);
    setQuery(city.label);
    setOpen(false);
  };

  return (
    <div ref={wrapperRef} className="relative">
      <div className="relative">
        <MapPin className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
        <Input
          id={id}
          value={query}
          required={required}
          placeholder={placeholder ?? "Search city (e.g. Mumbai)"}
          onChange={(e) => {
            setQuery(e.target.value);
            if (value) onChange(null);
          }}
          onFocus={() => results.length > 0 && setOpen(true)}
          onKeyDown={(e) => {
            if (!open) return;
            if (e.key === "ArrowDown") {
              e.preventDefault();
              setHighlight((h) => Math.min(h + 1, results.length - 1));
            } else if (e.key === "ArrowUp") {
              e.preventDefault();
              setHighlight((h) => Math.max(h - 1, 0));
            } else if (e.key === "Enter" && results[highlight]) {
              e.preventDefault();
              handleSelect(results[highlight]);
            } else if (e.key === "Escape") {
              setOpen(false);
            }
          }}
          className="pl-9"
          autoComplete="off"
        />
        {loading && (
          <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 animate-spin text-muted-foreground" />
        )}
      </div>

      {open && results.length > 0 && (
        <div className="absolute z-50 mt-1 w-full max-h-72 overflow-y-auto rounded-md border border-border bg-popover shadow-lg">
          {results.map((c, i) => (
            <button
              key={c.id}
              type="button"
              onClick={() => handleSelect(c)}
              onMouseEnter={() => setHighlight(i)}
              className={cn(
                "w-full text-left px-3 py-2 text-sm flex items-center gap-2 transition-colors",
                i === highlight ? "bg-accent text-accent-foreground" : "hover:bg-accent/60",
              )}
            >
              <MapPin className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
              <span className="truncate">{c.label}</span>
            </button>
          ))}
        </div>
      )}

      {open && !loading && results.length === 0 && query.trim().length >= 1 && (
        <div className="absolute z-50 mt-1 w-full rounded-md border border-border bg-popover shadow-lg px-3 py-2 text-xs text-muted-foreground">
          No matching cities found.
        </div>
      )}
    </div>
  );
}