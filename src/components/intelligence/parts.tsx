/**
 * The Intelligence Centre's building blocks, matching the Events and Reports
 * pages: stat tiles, filled search, segmented filters, period picker, tables.
 */
import { useCallback, useEffect, useRef, useState, type ElementType, type ReactNode } from "react";
import { keepPreviousData, useQuery, type UseQueryResult } from "@tanstack/react-query";
import { ArrowDown, ArrowUp, ChevronLeft, ChevronRight, ChevronsUpDown, Inbox, Loader2, Search } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn } from "@/lib/utils";

export const fail = (e: unknown) => toast.error(e instanceof Error ? e.message : String(e));
export const PAGE_SIZES = [25, 50, 100];
export const th = "px-4 py-3 text-left text-[11px] font-medium uppercase tracking-wide text-muted-foreground";
export const td = "px-4 py-2.5";
export const tr = "border-b border-border last:border-0";
/** A text filter beside the search box. */
export const filterInput = "h-10 rounded-xl border-transparent bg-muted/60 text-sm focus-visible:bg-background";

/** A cached read that keeps showing the last result while the next one loads. */
export function useIntelQuery<T>(key: unknown[], fn: () => Promise<T>) {
  const query = useQuery({ queryKey: ["intel", ...key], queryFn: fn, placeholderData: keepPreviousData, retry: false, refetchOnWindowFocus: false });
  const reported = useRef(0);
  useEffect(() => {
    if (query.error && query.errorUpdatedAt !== reported.current) {
      reported.current = query.errorUpdatedAt;
      fail(query.error);
    }
  }, [query.error, query.errorUpdatedAt]);
  return query;
}

/** Page state tied to the list's filters: changing any of them returns to the first page. */
export function usePager(filterKey: string, initialSize = PAGE_SIZES[0]) {
  const [state, setState] = useState({ key: filterKey, page: 0 });
  const [size, setSizeState] = useState(initialSize);
  const page = state.key === filterKey ? state.page : 0;
  const setPage = useCallback((p: number) => setState({ key: filterKey, page: p }), [filterKey]);
  const setSize = (s: number) => { setSizeState(s); setPage(0); };
  return { page, size, offset: page * size, setPage, setSize };
}
export type PagerState = ReturnType<typeof usePager>;

export function Pager({ pager, total, updating, label = "records", sizes = PAGE_SIZES }: { pager: PagerState; total: number; updating: boolean; label?: string; sizes?: number[] }) {
  const { page, size, setPage, setSize } = pager;
  const pages = Math.max(1, Math.ceil(total / size));
  // The last rows of the last page can be merged or decided away.
  useEffect(() => { if (!updating && page > 0 && page >= pages) setPage(pages - 1); }, [updating, page, pages, setPage]);
  if (total === 0) return null;
  return (
    <div className="flex flex-wrap items-center justify-between gap-2 text-[12px] text-muted-foreground">
      <span className="flex items-center gap-2 tabular-nums">
        {page * size + 1}–{Math.min((page + 1) * size, total)} of {total} {label}
        {updating && <span className="inline-flex items-center gap-1"><Loader2 className="h-3 w-3 animate-spin" /> Updating…</span>}
      </span>
      <span className="flex items-center gap-2">
        {sizes.length > 1 && (
          <FilterSelect small label={`${label} per page`} value={String(size)} onChange={(v) => setSize(Number(v))} options={sizes.map((s) => [String(s), `${s} per page`])} />
        )}
        <Button size="sm" variant="outline" className="h-8 w-8 p-0" disabled={page === 0} onClick={() => setPage(page - 1)} aria-label={`Previous page of ${label}`}><ChevronLeft className="h-4 w-4" /></Button>
        <span className="tabular-nums">Page {page + 1} of {pages}</span>
        <Button size="sm" variant="outline" className="h-8 w-8 p-0" disabled={page + 1 >= pages} onClick={() => setPage(page + 1)} aria-label={`Next page of ${label}`}><ChevronRight className="h-4 w-4" /></Button>
      </span>
    </div>
  );
}

export interface Sort { column: string; dir: "asc" | "desc" }

export function SortHead({ label, column, sort, onSort, className }: { label: string; column: string; sort: Sort; onSort: (column: string) => void; className?: string }) {
  const active = sort.column === column;
  const Icon = !active ? ChevronsUpDown : sort.dir === "asc" ? ArrowUp : ArrowDown;
  return (
    <th className={cn(th, className)} aria-sort={!active ? "none" : sort.dir === "asc" ? "ascending" : "descending"}>
      <button type="button" className="inline-flex items-center gap-1 font-medium uppercase tracking-wide hover:text-foreground" onClick={() => onSort(column)}>
        {label} <Icon className={cn("h-3 w-3", !active && "opacity-40")} />
      </button>
    </th>
  );
}

export const Skeleton = ({ className = "" }: { className?: string }) => <div className={`animate-pulse rounded-lg bg-muted/60 ${className}`} />;

/** The bordered table every admin page uses. */
export function TableShell({ dimmed, children }: { dimmed?: boolean; children: ReactNode }) {
  return (
    <div className={cn("overflow-hidden rounded-2xl border border-border bg-card transition-opacity", dimmed && "opacity-60")}>
      <div className="overflow-x-auto"><table className="w-full text-sm">{children}</table></div>
    </div>
  );
}

/** What a list shows before it has anything: placeholders while loading, a way to retry after a failure. */
export function NoData({ query, rows = 6 }: { query: UseQueryResult<unknown>; rows?: number }) {
  if (query.isError) {
    return (
      <div className="rounded-lg border border-dashed border-border py-10 text-center text-[13px] text-muted-foreground">
        This couldn't be loaded. <Button size="sm" variant="outline" className="ml-2 h-8" onClick={() => void query.refetch()}>Try again</Button>
      </div>
    );
  }
  return <div className="space-y-2" aria-label="Loading">{Array.from({ length: rows }).map((_, i) => <Skeleton key={i} className="h-9 w-full" />)}</div>;
}

export const Empty = ({ children }: { children: ReactNode }) => (
  <div className="rounded-lg border border-dashed border-border py-10 text-center">
    <Inbox className="mx-auto mb-3 h-8 w-8 text-muted-foreground/40" />
    <p className="text-[13px] text-muted-foreground">{children}</p>
  </div>
);

export function KpiTile({ icon: Icon, label, value, hint, onClick, loading }: { icon: ElementType; label: string; value: number | string | undefined; hint?: string; onClick?: () => void; loading?: boolean }) {
  return (
    <button type="button" onClick={onClick} disabled={!onClick}
            className={cn("block h-full w-full rounded-2xl border border-border bg-card p-4 text-left transition-colors", onClick && "hover:bg-muted/30")}>
      <span className="flex items-center justify-between gap-2">
        <span className="text-[12px] font-medium text-muted-foreground">{label}</span>
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-muted text-muted-foreground"><Icon className="h-4 w-4" /></span>
      </span>
      {loading ? <Skeleton className="mt-2 h-7 w-20" /> : <span className="mt-2 block text-[28px] font-medium leading-none tracking-tight tabular-nums">{typeof value === "number" ? value.toLocaleString() : value ?? "—"}</span>}
      <span className="mt-1.5 block truncate text-[12px] text-muted-foreground">{hint ?? "\u00A0"}</span>
    </button>
  );
}

/** The segmented control the Events and Reports pages filter with. */
export function Chips({ value, onChange, options, label = "Filter" }: { value: string; onChange: (v: string) => void; options: string[][]; label?: string }) {
  return (
    <div className="flex max-w-full overflow-x-auto rounded-xl bg-muted p-1" role="group" aria-label={label}>
      {options.map(([v, text]) => (
        <button key={v} type="button" aria-pressed={value === v} onClick={() => onChange(v)}
                className={cn("h-8 shrink-0 whitespace-nowrap rounded-lg px-3 text-[13px] font-medium transition-colors", value === v ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground")}>
          {text}
        </button>
      ))}
    </div>
  );
}

export const PERIODS = [["all", "All time"], ["7d", "7 days"], ["30d", "30 days"], ["90d", "90 days"], ["ytd", "This year"]];

/** The first day of a period, as yyyy-mm-dd; empty for all time. */
export function periodStart(period: string, today = new Date()): string {
  const d = new Date(today);
  if (period === "ytd") d.setMonth(0, 1);
  else if (period === "7d" || period === "30d" || period === "90d") d.setDate(d.getDate() - (Number(period.slice(0, -1)) - 1));
  else return "";
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export function FilterSelect({ label, value, onChange, options, small }: { label: string; value: string; onChange: (v: string) => void; options: string[][]; small?: boolean }) {
  return (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger aria-label={label} className={cn("w-auto gap-2 text-[13px]", small ? "h-8" : "h-10 rounded-xl")}><SelectValue /></SelectTrigger>
      <SelectContent>{options.map(([v, l]) => <SelectItem key={v} value={v} className="text-[13px]">{l}</SelectItem>)}</SelectContent>
    </Select>
  );
}

export function SearchBox({ value, onChange, placeholder, className }: { value: string; onChange: (v: string) => void; placeholder: string; className?: string }) {
  return (
    <div className={cn("relative", className)}>
      <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
      <Input value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} aria-label={placeholder} className={cn(filterInput, "w-full pl-10")} />
    </div>
  );
}
