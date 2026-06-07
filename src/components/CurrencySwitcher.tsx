import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { buildCurrencyList, useFxRates, relativeTime } from "@/lib/fx";
import { ArrowLeftRight } from "lucide-react";

const STORAGE_KEY = "analytics:displayCurrency";

export function getStoredDisplayCurrency(fallback = "INR"): string {
  try {
    return localStorage.getItem(STORAGE_KEY) || fallback;
  } catch {
    return fallback;
  }
}

export function setStoredDisplayCurrency(code: string) {
  try { localStorage.setItem(STORAGE_KEY, code); } catch {}
}

export function CurrencySwitcher({
  value,
  onChange,
  extra = [],
  compact = false,
}: {
  value: string;
  onChange: (code: string) => void;
  extra?: string[];
  compact?: boolean;
}) {
  const { rates } = useFxRates();
  const options = buildCurrencyList(extra);

  return (
    <div className={`inline-flex items-center gap-2 ${compact ? "" : "bg-card border border-border rounded-lg px-2.5 py-1.5"}`}>
      <ArrowLeftRight className="h-3.5 w-3.5 text-muted-foreground" />
      <span className="text-[11px] uppercase tracking-wide text-muted-foreground">Display</span>
      <Select value={value} onValueChange={(v) => { onChange(v); setStoredDisplayCurrency(v); }}>
        <SelectTrigger className="h-7 w-[110px] text-[12px] font-medium border-0 bg-transparent shadow-none focus:ring-0 px-2">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {options.map((o) => (
            <SelectItem key={o.code} value={o.code} className="text-[12px]">
              <span className="font-mono">{o.code}</span>
              <span className="text-muted-foreground ml-2">{o.label}</span>
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      {rates?.fetched_at && (
        <span className="text-[10px] text-muted-foreground hidden sm:inline">· rates {relativeTime(rates.fetched_at)}</span>
      )}
    </div>
  );
}