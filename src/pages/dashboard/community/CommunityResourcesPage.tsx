import { useState } from "react";
import { useParams } from "react-router-dom";
import { CommunityLayout } from "@/components/community/layout/CommunityLayout";
import { useCommunityBySlug } from "@/hooks/community/useCommunity";
import { useDeleteResource, useResources, useUploadResource } from "@/hooks/community/useCommunityResources";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Download, FileText, Trash2, Upload } from "lucide-react";
import { canUploadResource } from "@/lib/community/rbac";
import { toast } from "sonner";
import { format } from "date-fns";

function fmtSize(b: number) {
  if (b < 1024) return `${b} B`;
  if (b < 1024 * 1024) return `${(b / 1024).toFixed(1)} KB`;
  return `${(b / 1024 / 1024).toFixed(1)} MB`;
}

export default function CommunityResourcesPage() {
  const { slug } = useParams<{ slug: string }>();
  const { data } = useCommunityBySlug(slug);
  const role = data?.membership?.role ?? null;
  const resources = useResources(data?.community?.id);
  const upload = useUploadResource(data?.community?.id);
  const del = useDeleteResource(data?.community?.id);

  const [open, setOpen] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [category, setCategory] = useState<"learning" | "event" | "sponsor" | "session" | "general">("general");

  const reset = () => { setFile(null); setTitle(""); setDescription(""); setCategory("general"); };

  const handleUpload = async () => {
    if (!file) return toast.error("Pick a file");
    if (!title.trim()) return toast.error("Title is required");
    try {
      await upload.mutateAsync({ file, title: title.trim(), description: description.trim() || undefined, category });
      toast.success("Resource uploaded");
      setOpen(false);
      reset();
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Upload failed");
    }
  };

  return (
    <CommunityLayout>
      <div className="space-y-3">
        <div className="flex items-center justify-between gap-2">
          <h2 className="text-[15px] font-semibold">Resources</h2>
          {canUploadResource(role) && (
            <Button size="sm" className="h-8 text-[12px] gap-1.5" onClick={() => setOpen(true)}>
              <Upload className="h-3.5 w-3.5" /> Upload
            </Button>
          )}
        </div>

        {resources.isLoading ? (
          <p className="text-sm text-muted-foreground py-8 text-center">Loading…</p>
        ) : !resources.data?.length ? (
          <div className="border border-dashed border-border rounded-xl p-8 text-center">
            <FileText className="h-6 w-6 text-muted-foreground/40 mx-auto mb-2" />
            <p className="text-sm text-muted-foreground">No resources yet.</p>
          </div>
        ) : (
          <ul className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {resources.data.map((r) => (
              <li key={r.id} className="border border-border rounded-xl bg-card p-3 flex flex-col gap-2">
                <div className="flex items-start gap-2">
                  <div className="h-9 w-9 rounded-md bg-emerald-500/10 text-emerald-600 flex items-center justify-center shrink-0">
                    <FileText className="h-4 w-4" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-[13px] font-medium truncate">{r.title}</p>
                    <p className="text-[11px] text-muted-foreground truncate">{r.file_name} · {fmtSize(r.file_size)}</p>
                  </div>
                </div>
                {r.description && <p className="text-[12px] text-muted-foreground line-clamp-2">{r.description}</p>}
                <div className="flex items-center justify-between mt-auto pt-1">
                  <span className="text-[11px] text-muted-foreground">
                    {format(new Date(r.created_at), "MMM d, yyyy")}
                  </span>
                  <div className="flex items-center gap-1">
                    <Button
                      asChild
                      size="sm"
                      variant="outline"
                      className="h-7 text-[11px] gap-1"
                    >
                      <a href={r.file_url} target="_blank" rel="noopener noreferrer" download={r.file_name}>
                        <Download className="h-3 w-3" /> Download
                      </a>
                    </Button>
                    {(canUploadResource(role) || role === "moderator" || role === "manager") && (
                      <Button
                        size="icon"
                        variant="ghost"
                        className="h-7 w-7 text-destructive hover:bg-destructive/10"
                        onClick={async () => {
                          if (!confirm(`Delete "${r.title}"?`)) return;
                          try {
                            await del.mutateAsync(r.id);
                            toast.success("Deleted");
                          } catch (err: unknown) {
                            toast.error(err instanceof Error ? err.message : "Delete failed");
                          }
                        }}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    )}
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>

      <Dialog open={open} onOpenChange={(o) => { setOpen(o); if (!o) reset(); }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Upload resource</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <label className="text-[12px] text-muted-foreground">File</label>
              <Input
                type="file"
                onChange={(e) => setFile(e.target.files?.[0] ?? null)}
                className="mt-1"
              />
            </div>
            <div>
              <label className="text-[12px] text-muted-foreground">Title</label>
              <Input value={title} onChange={(e) => setTitle(e.target.value)} className="mt-1 h-8 text-sm" />
            </div>
            <div>
              <label className="text-[12px] text-muted-foreground">Category</label>
              <Select value={category} onValueChange={(v) => setCategory(v as typeof category)}>
                <SelectTrigger className="h-8 text-[12px] mt-1">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="general">General</SelectItem>
                  <SelectItem value="learning">Learning</SelectItem>
                  <SelectItem value="event">Event</SelectItem>
                  <SelectItem value="session">Session</SelectItem>
                  <SelectItem value="sponsor">Sponsor</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="text-[12px] text-muted-foreground">Description (optional)</label>
              <Textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                className="mt-1 text-sm"
              />
            </div>
          </div>
          <DialogFooter>
            <Button size="sm" variant="ghost" onClick={() => setOpen(false)}>Cancel</Button>
            <Button size="sm" onClick={handleUpload} disabled={upload.isPending}>
              {upload.isPending ? "Uploading…" : "Upload"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </CommunityLayout>
  );
}
