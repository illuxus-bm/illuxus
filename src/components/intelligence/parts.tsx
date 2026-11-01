/**
 * The Intelligence Centre's building blocks, in the same style as the other
 * Super Admin pages: KPI tiles, bordered tables, filter chips, pagers.
 */
import { useCallback, useEffect, useRef, useState, type ElementType, type ReactNode } from "react";
import { keepPreviousData, useQuery, type UseQueryResult } from "@tanstack/react-query";
import { ArrowDown, ArrowUp, ChevronLeft, ChevronRight, ChevronsUpDown, Loader2, Search } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn } from "@/lib/utils";

export const fail = (e: unknown) => toast.error(e instanceof Error ? e.message : String(e));
export const PAGE_SIZES = [25, 50, 100];
export const th = "text-left font-medium text-muted-foreground px-4 py-2.5";
export const td = "px-4 py-3";
export const tr = "border-b border-border/50 last:border-0";

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
          <FilterSelect label={`${label} per page`} value={String(size)} onChange={(v) => setSize(Number(v))} options={sizes.map((s) => [String(s), `${s} per page`])} />
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
      <button type="button" className="inline-flex items-center gap-1 hover:text-foreground" onClick={() => onSort(column)}>
        {label} <Icon className={cn("h-3 w-3", !active && "opacity-40")} />
      </button>
    </th>
  );
}

export const Skeleton = ({ className = "" }: { className?: string }) => <div className={`animate-pulse rounded-lg bg-muted/60 ${className}`} />;

/** The bordered table every admin page uses. */
export function TableShell({ dimmed, children }: { dimmed?: boolean; children: ReactNode }) {
  return (
    <div className={cn("overflow-hidden rounded-xl border border-border bg-card transition-opacity", dimmed && "opacity-60")}>
      <div className="overflow-x-auto"><table className="w-full text-[13px]">{children}</table></div>
    </div>
  );
}

/** What a list shows before it has anything: placeholders while loading, a way to retry after a failure. */
export function NoData({ query, rows = 6 }: { query: UseQueryResult<unknown>; rows?: number }) {
  if (query.isError) {
    return (
      <div className="rounded-xl border border-border bg-card py-8 text-center text-[13px] text-muted-foreground">
        This couldn't be loaded. <Button size="sm" variant="outline" className="ml-2 h-8" onClick={() => void query.refetch()}>Try again</Button>
      </div>
    );
  }
  return <div className="space-y-2" aria-label="Loading">{Array.from({ length: rows }).map((_, i) => <Skeleton key={i} className="h-9 w-full" />)}</div>;
}

export const Empty = ({ children }: { children: ReactNode }) => (
  <div className="rounded-xl border border-border bg-card py-8 text-center text-[13px] text-muted-foreground">{children}</div>
);

export function KpiTile({ icon: Icon, label, value, hint, onClick, loading }: { icon: ElementType; label: string; value: number | string | undefined; hint?: string; onClick?: () => void; loading?: boolean }) {
  return (
    <button type="button" onClick={onClick} disabled={!onClick}
            className={cn("flex h-full flex-col items-start justify-start gap-1.5 rounded-xl border border-border bg-card p-4 text-left transition-colors", onClick && "hover:bg-muted/20")}>
      <div className="flex items-center gap-2">
        <Icon className="h-3.5 w-3.5 text-muted-foreground" />
        <span className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">{label}</span>
      </div>
      {loading ? <Skeleton className="h-8 w-20" /> : <p className="text-2xl font-bold tabular-nums tracking-tight">{value ?? "—"}</p>}
      {hint && <p className="text-[11px] text-muted-foreground">{hint}</p>}
    </button>
  );
}

export function Chips({ value, onChange, options }: { value: string; onChange: (v: string) => void; options: string[][] }) {
  return (
    <div className="flex flex-wrap items-center gap-1">
      {options.map(([v, label]) => (
        <button key={v} type="button" aria-pressed={value === v} onClick={() => onChange(v)}
                className={cn("rounded border px-2.5 py-1 text-[12px] transition-colors", value === v ? "border-primary bg-primary/10 text-primary" : "border-border hover:bg-muted")}>
          {label}
        </button>
      ))}
    </div>
  );
}

export function FilterSelect({ label, value, onChange, options }: { label: string; value: string; onChange: (v: string) => void; options: string[][] }) {
  return (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger aria-label={label} className="h-8 w-auto gap-2 text-[12px]"><SelectValue /></SelectTrigger>
      <SelectContent>{options.map(([v, l]) => <SelectItem key={v} value={v} className="text-[12px]">{l}</SelectItem>)}</SelectContent>
    </Select>
  );
}

export function SearchBox({ value, onChange, placeholder, className }: { value: string; onChange: (v: string) => void; placeholder: string; className?: string }) {
  return (
    <div className={cn("relative", className)}>
      <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
      <Input value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} aria-label={placeholder} className="h-8 w-full pl-8 text-sm" />
    </div>
  );
}
