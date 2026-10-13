/**
 * Templates: the workspace's own certificate templates, and the built-in
 * gallery to start from. Every thumbnail is drawn from the template's
 * configuration by the same renderer as the PDF.
 */
import { useMemo, useState } from "react";
import { Archive, ArchiveRestore, Copy, Eye, Globe2, Loader2, MoreHorizontal, Pencil, Sparkles, Type } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { TEMPLATES, TEMPLATE_CATEGORIES, buildTemplate, type TemplateSpec } from "@/lib/certificates/certificate-templates";
import type { CertificateDesign } from "@/lib/certificates/certificate-design";
import type { EventContext, Registrant, TemplateRow } from "@/lib/certificates/certificate-api";
import CertificatePreviewDialog from "./CertificatePreviewDialog";
import { useThumbnail } from "./useThumbnail";

interface Props {
  event: EventContext;
  templates: TemplateRow[];
  registrants: Registrant[];
  canEdit: boolean;
  busyId: string | null;
  logoUrl: string | null;
  onCustomizeBuiltIn: (spec: TemplateSpec) => void;
  onUseBuiltIn: (spec: TemplateSpec) => void;
  onEdit: (row: TemplateRow) => void;
  onUse: (row: TemplateRow) => void;
  onDuplicate: (row: TemplateRow) => void;
  onRename: (row: TemplateRow, name: string) => void;
  onArchive: (row: TemplateRow, archived: boolean) => void;
  onShare: (row: TemplateRow, allEvents: boolean) => void;
}

function Thumb({ cacheKey, build, orientation }: { cacheKey: string; build: () => CertificateDesign | null; orientation: "landscape" | "portrait" }) {
  const url = useThumbnail(cacheKey, build);
  return (
    <div className="flex aspect-[4/3] items-center justify-center overflow-hidden rounded-t-xl bg-muted/50 p-3">
      {url ? (
        <img src={url} alt="" className={cn("max-h-full max-w-full bg-white shadow-[0_6px_18px_-8px_rgb(0_0_0/0.35)]", orientation === "portrait" ? "h-full" : "w-full")} />
      ) : (
        <div className={cn("animate-pulse rounded-sm bg-muted", orientation === "portrait" ? "h-full aspect-[210/297]" : "w-full aspect-[297/210]")} />
      )}
    </div>
  );
}

const statusBadge = (row: TemplateRow) =>
  row.status === "published" ? <Badge className="bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 border-emerald-500/20 text-[10.5px]" variant="outline">Published v{row.current_version}</Badge>
  : row.status === "archived" ? <Badge variant="outline" className="text-[10.5px]">Archived</Badge>
  : <Badge variant="outline" className="text-[10.5px]">Draft</Badge>;

export default function TemplatesTab(props: Props) {
  const { event, templates } = props;
  const [category, setCategory] = useState<string>("all");
  const [orientation, setOrientation] = useState<"all" | "landscape" | "portrait">("all");
  const [showArchived, setShowArchived] = useState(false);
  const [preview, setPreview] = useState<{ title: string; subtitle: string; design: CertificateDesign; spec?: TemplateSpec; row?: TemplateRow } | null>(null);
  const [renaming, setRenaming] = useState<{ row: TemplateRow; name: string } | null>(null);

  const mine = useMemo(
    () => templates.filter((t) => (showArchived ? t.status === "archived" : t.status !== "archived")),
    [templates, showArchived],
  );
  const gallery = TEMPLATES.filter((t) => (category === "all" || t.category === category) && (orientation === "all" || t.orientation === orientation));
  const archivedCount = templates.filter((t) => t.status === "archived").length;

  const scopeLabel = (row: TemplateRow) => (row.event_id === null ? "All events" : row.event_id === event.id ? "This event" : "Another event");

  return (
    <div className="space-y-8">
      {/* Your templates */}
      <section>
        <div className="mb-3 flex flex-wrap items-end justify-between gap-2">
          <div>
            <h2 className="text-[15px] font-semibold">Your templates</h2>
            <p className="text-[12.5px] text-muted-foreground">Saved for {event.org_name || "your workspace"}. Reuse them on any of your events.</p>
          </div>
          {archivedCount > 0 && (
            <Button size="sm" variant="ghost" className="h-7 text-[12px]" onClick={() => setShowArchived((v) => !v)}>
              {showArchived ? "Show active" : `Archived (${archivedCount})`}
            </Button>
          )}
        </div>
        {mine.length === 0 ? (
          <div className="rounded-xl border border-dashed border-border px-4 py-8 text-center text-[13px] text-muted-foreground">
            {showArchived ? "No archived templates." : "No templates yet — start from one of the designs below."}
          </div>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {mine.map((row) => (
              <article key={row.id} className="overflow-hidden rounded-xl border border-border bg-card">
                <Thumb cacheKey={`row:${row.id}:${row.updated_at}`} build={() => row.design} orientation={row.orientation} />
                <div className="space-y-2.5 p-3.5">
                  <div className="flex items-start gap-2">
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-[13.5px] font-semibold">{row.name}</p>
                      <p className="truncate text-[11.5px] text-muted-foreground">{row.category || "Custom"} · {row.orientation === "landscape" ? "Landscape" : "Portrait"} · {scopeLabel(row)}</p>
                    </div>
                    {statusBadge(row)}
                  </div>
                  <div className="flex items-center gap-1.5">
                    <Button size="sm" className="h-7 flex-1 text-[12px]" disabled={!props.canEdit || row.status === "archived" || props.busyId === row.id} onClick={() => props.onUse(row)}>
                      {props.busyId === row.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : "Use template"}
                    </Button>
                    <Button size="sm" variant="outline" className="h-7 gap-1 text-[12px]" disabled={!props.canEdit || row.status === "archived"} onClick={() => props.onEdit(row)}>
                      <Pencil className="h-3 w-3" /> Edit
                    </Button>
                    <Button size="icon" variant="outline" className="h-7 w-7" onClick={() => setPreview({ title: row.name, subtitle: `${row.category || "Custom"} · ${row.orientation}`, design: row.design, row })} aria-label={`Preview ${row.name}`}>
                      <Eye className="h-3.5 w-3.5" />
                    </Button>
                    {props.canEdit && (
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button size="icon" variant="ghost" className="h-7 w-7" aria-label="More actions"><MoreHorizontal className="h-4 w-4" /></Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" className="w-52">
                          <DropdownMenuItem onSelect={() => props.onDuplicate(row)}><Copy className="mr-2 h-3.5 w-3.5" />Duplicate</DropdownMenuItem>
                          <DropdownMenuItem onSelect={() => setRenaming({ row, name: row.name })}><Type className="mr-2 h-3.5 w-3.5" />Rename</DropdownMenuItem>
                          <DropdownMenuItem onSelect={() => props.onShare(row, row.event_id !== null)}>
                            <Globe2 className="mr-2 h-3.5 w-3.5" />{row.event_id === null ? "Limit to this event" : "Make available to all events"}
                          </DropdownMenuItem>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem onSelect={() => props.onArchive(row, row.status !== "archived")}>
                            {row.status === "archived" ? <><ArchiveRestore className="mr-2 h-3.5 w-3.5" />Restore</> : <><Archive className="mr-2 h-3.5 w-3.5" />Archive</>}
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    )}
                  </div>
                </div>
              </article>
            ))}
          </div>
        )}
      </section>

      {/* Built-in gallery */}
      <section>
        <div className="mb-3">
          <h2 className="flex items-center gap-1.5 text-[15px] font-semibold"><Sparkles className="h-4 w-4 text-primary" />Start from a design</h2>
          <p className="text-[12.5px] text-muted-foreground">{TEMPLATES.length} editable designs across {TEMPLATE_CATEGORIES.length} styles. Customizing makes your own copy; the original stays here.</p>
        </div>
        <div className="mb-4 flex flex-wrap items-center gap-1.5">
          {["all", ...TEMPLATE_CATEGORIES].map((c) => (
            <button key={c} type="button" onClick={() => setCategory(c)}
              className={cn("rounded-full border px-3 py-1 text-[12px] transition-colors", category === c ? "border-foreground bg-foreground text-background" : "border-border text-muted-foreground hover:text-foreground")}>
              {c === "all" ? "All" : c}
            </button>
          ))}
          <div className="ml-auto flex rounded-full border border-border p-0.5">
            {(["all", "landscape", "portrait"] as const).map((o) => (
              <button key={o} type="button" onClick={() => setOrientation(o)}
                className={cn("rounded-full px-2.5 py-0.5 text-[11.5px] capitalize", orientation === o ? "bg-muted text-foreground" : "text-muted-foreground")}>
                {o}
              </button>
            ))}
          </div>
        </div>
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {gallery.map((spec) => (
            <article key={spec.id} className="overflow-hidden rounded-xl border border-border bg-card">
              <Thumb cacheKey={`tpl:${spec.id}`} build={() => buildTemplate(spec)} orientation={spec.orientation} />
              <div className="space-y-2.5 p-3.5">
                <div>
                  <p className="text-[13.5px] font-semibold">{spec.name}</p>
                  <p className="text-[11.5px] text-muted-foreground">{spec.category} · {spec.orientation === "landscape" ? "A4 landscape" : "A4 portrait"}</p>
                  <p className="mt-1 line-clamp-2 text-[12px] text-muted-foreground">{spec.description}</p>
                </div>
                <div className="flex items-center gap-1.5">
                  <Button size="sm" className="h-7 flex-1 text-[12px]" disabled={!props.canEdit || props.busyId === spec.id} onClick={() => props.onUseBuiltIn(spec)}>
                    {props.busyId === spec.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : "Use template"}
                  </Button>
                  <Button size="sm" variant="outline" className="h-7 text-[12px]" disabled={!props.canEdit} onClick={() => props.onCustomizeBuiltIn(spec)}>Customize</Button>
                  <Button size="icon" variant="outline" className="h-7 w-7" aria-label={`Preview ${spec.name}`}
                    onClick={() => setPreview({ title: spec.name, subtitle: `${spec.category} · ${spec.description}`, design: buildTemplate(spec, { logoUrl: props.logoUrl }), spec })}>
                    <Eye className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </div>
            </article>
          ))}
        </div>
      </section>

      <CertificatePreviewDialog
        open={!!preview}
        onOpenChange={(o) => { if (!o) setPreview(null); }}
        title={preview?.title ?? ""}
        subtitle={preview?.subtitle}
        design={preview?.design ?? null}
        event={event}
        registrants={props.registrants}
        footer={preview && props.canEdit ? (
          <>
            <Button variant="outline" size="sm" onClick={() => { const p = preview; setPreview(null); if (p.spec) props.onCustomizeBuiltIn(p.spec); else if (p.row) props.onEdit(p.row); }}>
              {preview.spec ? "Customize" : "Edit"}
            </Button>
            <Button size="sm" onClick={() => { const p = preview; setPreview(null); if (p.spec) props.onUseBuiltIn(p.spec); else if (p.row) props.onUse(p.row); }}>Use template</Button>
          </>
        ) : undefined}
      />

      <Dialog open={!!renaming} onOpenChange={(o) => { if (!o) setRenaming(null); }}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader><DialogTitle className="text-base">Rename template</DialogTitle></DialogHeader>
          <Input autoFocus value={renaming?.name ?? ""} maxLength={120} onChange={(e) => setRenaming((r) => (r ? { ...r, name: e.target.value } : r))}
            onKeyDown={(e) => { if (e.key === "Enter" && renaming?.name.trim()) { props.onRename(renaming.row, renaming.name); setRenaming(null); } }} />
          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => setRenaming(null)}>Cancel</Button>
            <Button size="sm" disabled={!renaming?.name.trim()} onClick={() => { if (renaming) { props.onRename(renaming.row, renaming.name); setRenaming(null); } }}>Save</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
