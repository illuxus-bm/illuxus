import { useMemo, useState } from "react";
import { Columns3, Download, FileSpreadsheet, Loader2, Mail, Phone } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuCheckboxItem, DropdownMenuContent, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Empty, FilterSelect, NoData, Pager, SearchBox, SortHead, TableShell, td, tr, useIntelQuery, usePager, type Sort } from "@/components/intelligence/parts";
import { useDebounced } from "@/hooks/useOrgPeopleSearch";
import { dataSharing, formatShareValue, toCsv, type ShareField, type ShareRow } from "@/lib/sponsors/data-sharing";
import { cn } from "@/lib/utils";
import { friendlyError } from "@/lib/friendly-error";
import { safeUrl } from "@/lib/safe-url";

const DEFAULT_COLUMNS = ["full_name", "participant_type", "designation", "company", "email", "mobile", "linkedin_url", "attendance"];
const ATTENDANCE = [["all", "All attendance"], ["attended", "Attended"], ["not_attended", "Didn't attend"]];
const TYPES = [["all", "Speakers and attendees"], ["speaker", "Speakers"], ["attendee", "Attendees"]];

/** Email, mobile and LinkedIn as working links; everything else as text. */
function Value({ field, row }: { field: string; row: ShareRow }) {
  const v = formatShareValue(field, row[field]);
  if (!v) return <span className="text-muted-foreground">—</span>;
  if (field === "email") return <a href={`mailto:${v}`} className="text-primary hover:underline">{v}</a>;
  if (field === "mobile") return <a href={`tel:${v.replace(/\s+/g, "")}`} className="whitespace-nowrap hover:underline">{v}</a>;
  if ((field === "linkedin_url" || field === "company_website") && /^https?:\/\//i.test(v)) {
    return <a href={safeUrl(v)} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">{field === "linkedin_url" ? "Profile" : v.replace(/^https?:\/\//i, "")}</a>;
  }
  if (field === "attendance") return <Badge variant={v === "Attended" ? "default" : "secondary"} className="text-[10px]">{v}</Badge>;
  if (field === "participant_type") {
    return (
      <span className={cn("inline-flex items-center rounded-md px-2 py-0.5 text-[11px] font-semibold",
                          v === "Speaker" ? "bg-blue-500/10 text-blue-600 dark:text-blue-300" : "bg-muted text-muted-foreground")}>{v}</span>
    );
  }
  return <>{v}</>;
}

/**
 * Every participant in one share, searched, filtered and sorted on the server
 * and read a page at a time. Used by sponsors and by the organiser who shared.
 */
export function SharedDataTable({ shareId, canExport, fileName }: { shareId: string; canExport: boolean; fileName: string }) {
  const [text, setText] = useState("");
  const q = useDebounced(text, 250);
  const [filter, setFilter] = useState("all");
  const [type, setType] = useState("all");
  const [sort, setSort] = useState<Sort>({ column: "full_name", dir: "asc" });
  const [shown, setShown] = useState<string[]>(DEFAULT_COLUMNS);
  const [open, setOpen] = useState<ShareRow | null>(null);
  const [exporting, setExporting] = useState(false);
  const pager = usePager(JSON.stringify([q, filter, type, sort]));
  const query = useIntelQuery(["shared-rows", shareId, q, filter, type, sort, pager.size, pager.offset],
    () => dataSharing.rows(shareId, { q, filter, type, sort: sort.column, dir: sort.dir, limit: pager.size, offset: pager.offset }));
  const fields = query.data?.fields ?? [];
  const columns = useMemo(() => fields.filter((f) => shown.includes(f.key)), [fields, shown]);
  const onSort = (column: string) => setSort((s) => (s.column === column ? { column, dir: s.dir === "asc" ? "desc" : "asc" } : { column, dir: "asc" }));

  const download = async (kind: "csv" | "xlsx") => {
    setExporting(true);
    try {
      const all = await dataSharing.export(shareId);
      if (kind === "csv") {
        const blob = new Blob(["﻿" + toCsv(all.fields, all.rows)], { type: "text/csv;charset=utf-8" });
        const a = Object.assign(document.createElement("a"), { href: URL.createObjectURL(blob), download: `${fileName}.csv` });
        a.click();
        URL.revokeObjectURL(a.href);
      } else {
        const { downloadWorkbook } = await import("@/lib/reports/excel");
        await downloadWorkbook(`${fileName}.xlsx`, [{
          name: "Participants",
          columns: all.fields.map((f: ShareField) => ({ header: f.label, key: f.key, width: f.key === "email" || f.key === "linkedin_url" ? 32 : 20 })),
          rows: all.rows.map((r) => Object.fromEntries(all.fields.map((f) => [f.key, formatShareValue(f.key, r[f.key])]))),
        }]);
      }
      toast.success(`${all.rows.length.toLocaleString()} participants downloaded`);
    } catch (e) {
      toast.error(friendlyError(e));
    } finally {
      setExporting(false);
    }
  };

  return (
    <div className="space-y-3">
      <div className="flex flex-col gap-2 lg:flex-row lg:items-center">
        <SearchBox value={text} onChange={setText} className="w-full lg:max-w-sm lg:flex-1" placeholder="Name, company, designation, email or mobile" />
        <div className="flex flex-wrap items-center gap-2">
          <FilterSelect label="Type" value={type} onChange={setType} options={TYPES} />
          <FilterSelect label="Attendance" value={filter} onChange={setFilter} options={ATTENDANCE} />
        </div>
        <span className="flex flex-wrap items-center gap-2 lg:ml-auto">
          <DropdownMenu>
            <DropdownMenuTrigger asChild><Button variant="outline" className="h-10 rounded-xl"><Columns3 className="mr-1.5 h-4 w-4" /> Columns</Button></DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="max-h-80 overflow-y-auto">
              <DropdownMenuLabel className="text-[12px]">Show columns</DropdownMenuLabel>
              <DropdownMenuSeparator />
              {fields.map((f) => (
                <DropdownMenuCheckboxItem key={f.key} checked={shown.includes(f.key)} onSelect={(e) => e.preventDefault()}
                                          onCheckedChange={(on) => setShown((s) => (on ? [...s, f.key] : s.filter((k) => k !== f.key)))}>
                  {f.label}
                </DropdownMenuCheckboxItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
          {canExport && (
            <>
              <Button variant="outline" className="h-10 rounded-xl" disabled={exporting} onClick={() => void download("csv")}>
                {exporting ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <Download className="mr-1.5 h-4 w-4" />} CSV
              </Button>
              <Button variant="outline" className="h-10 rounded-xl" disabled={exporting} onClick={() => void download("xlsx")}><FileSpreadsheet className="mr-1.5 h-4 w-4" /> Excel</Button>
            </>
          )}
        </span>
      </div>
      {!query.data ? <NoData query={query} /> : query.data.rows.length === 0 ? <Empty>No participants match.</Empty> : (
        <TableShell dimmed={query.isPlaceholderData}>
          <thead>
            <tr className="border-b border-border">
              {columns.map((f) => <SortHead key={f.key} label={f.label} column={f.key} sort={sort} onSort={onSort} />)}
            </tr>
          </thead>
          <tbody>
            {query.data.rows.map((r, i) => (
              <tr key={`${pager.offset}-${i}`} className={cn(tr, "cursor-pointer hover:bg-muted/20")} onClick={() => setOpen(r)}>
                {columns.map((f) => (
                  <td key={f.key} className={cn(td, f.key === "full_name" && "font-medium")} onClick={(e) => { if ((e.target as HTMLElement).closest("a")) e.stopPropagation(); }}>
                    <Value field={f.key} row={r} />
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </TableShell>
      )}
      <Pager pager={pager} total={query.data?.total ?? 0} updating={query.isFetching} label="participants" />
      <p className="text-[12px] text-muted-foreground">
        Contact details appear only for participants who agreed to share them with sponsors. Use them for this event's follow-up, as agreed with the organiser.
      </p>
      <Sheet open={!!open} onOpenChange={(o) => !o && setOpen(null)}>
        <SheetContent className="w-full overflow-y-auto sm:max-w-lg">
          <SheetHeader>
            <SheetTitle className="text-base font-semibold">{open?.full_name ?? "Participant"}</SheetTitle>
            <SheetDescription className="text-[12px]">{[open?.designation, open?.company].filter(Boolean).join(" · ")}</SheetDescription>
          </SheetHeader>
          {open && (
            <div className="mt-4 space-y-4 pb-8">
              {!open.email && !open.mobile && (
                <p className="text-[12px] text-muted-foreground">This participant didn't give permission to share their contact details with sponsors.</p>
              )}
              <div className="flex flex-wrap gap-2">
                {open.email && <Button asChild variant="outline" className="h-9 rounded-xl"><a href={`mailto:${open.email}`}><Mail className="mr-1.5 h-4 w-4" /> Email</a></Button>}
                {open.mobile && <Button asChild variant="outline" className="h-9 rounded-xl"><a href={`tel:${String(open.mobile).replace(/\s+/g, "")}`}><Phone className="mr-1.5 h-4 w-4" /> Call</a></Button>}
              </div>
              <dl className="divide-y divide-border rounded-2xl border border-border bg-card text-[13px]">
                {fields.map((f) => (
                  <div key={f.key} className="grid grid-cols-[9rem_1fr] gap-3 px-4 py-2.5">
                    <dt className="text-muted-foreground">{f.label}</dt>
                    <dd className="min-w-0 break-words"><Value field={f.key} row={open} /></dd>
                  </div>
                ))}
              </dl>
            </div>
          )}
        </SheetContent>
      </Sheet>
    </div>
  );
}

export default SharedDataTable;
