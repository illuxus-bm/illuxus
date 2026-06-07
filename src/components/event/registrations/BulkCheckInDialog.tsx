import { useRef, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Upload, CheckCircle, XCircle, Clock, Loader2, ListChecks } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

interface Props {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  eventId: string;
}

type RowResult = {
  token: string;
  status: "ok" | "already" | "not_found" | "wrong_event" | "expired" | "cancelled" | "invalid" | "error";
  name?: string | null;
  message?: string;
};

const STATUS_LABEL: Record<RowResult["status"], string> = {
  ok: "Checked in",
  already: "Already in",
  not_found: "Not found",
  wrong_event: "Wrong event",
  expired: "Event ended",
  cancelled: "Cancelled",
  invalid: "Invalid",
  error: "Error",
};

function parseTokens(raw: string): string[] {
  return Array.from(
    new Set(
      raw
        .split(/[\s,;\n\r\t]+/)
        .map((s) => {
          const t = s.trim();
          if (!t) return "";
          try {
            const u = new URL(t);
            return u.searchParams.get("token") || u.searchParams.get("join") || t;
          } catch { return t; }
        })
        .filter(Boolean)
    )
  );
}

export default function BulkCheckInDialog({ open, onOpenChange, eventId }: Props) {
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [results, setResults] = useState<RowResult[]>([]);
  const [progress, setProgress] = useState({ done: 0, total: 0 });
  const fileRef = useRef<HTMLInputElement>(null);

  const reset = () => { setText(""); setResults([]); setProgress({ done: 0, total: 0 }); };

  const handleFile = async (f: File) => {
    const content = await f.text();
    setText((prev) => (prev ? prev + "\n" : "") + content);
  };

  const run = async () => {
    const tokens = parseTokens(text);
    if (tokens.length === 0) return;
    setBusy(true);
    setResults([]);
    setProgress({ done: 0, total: tokens.length });

    const out: RowResult[] = [];
    for (const token of tokens) {
      try {
        const { data, error } = await supabase.rpc("self_check_in", { p_token: token, p_event_id: eventId });
        if (error) {
          out.push({ token, status: "error", message: error.message });
        } else {
          const row = Array.isArray(data) ? data[0] : data;
          out.push({ token, status: (row?.status as RowResult["status"]) ?? "error", name: row?.name });
          // Tag checked-in source as 'bulk' if newly checked in
          if (row?.status === "ok" && row.id) {
            await supabase.from("registrations").update({ checked_in_method: "bulk" }).eq("id", row.id);
          }
        }
      } catch (e: any) {
        out.push({ token, status: "error", message: e?.message });
      }
      setProgress((p) => ({ ...p, done: p.done + 1 }));
      setResults([...out]);
    }
    setBusy(false);
  };

  const counts = results.reduce(
    (acc, r) => {
      if (r.status === "ok") acc.ok++;
      else if (r.status === "already") acc.already++;
      else acc.failed++;
      return acc;
    },
    { ok: 0, already: 0, failed: 0 }
  );

  return (
    <Dialog open={open} onOpenChange={(o) => { onOpenChange(o); if (!o) reset(); }}>
      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-base">
            <ListChecks className="h-4 w-4" /> Bulk check-in
          </DialogTitle>
          <DialogDescription className="text-[12px]">
            Paste QR codes, ticket IDs, or check-in links — one per line or separated by commas.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <Textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder={"ABCD1234\nXYZ987\nhttps://.../checkin/...?token=..."}
            rows={6}
            className="font-mono text-[12px]"
            disabled={busy}
          />
          <div className="flex items-center gap-2">
            <input
              ref={fileRef}
              type="file"
              accept=".txt,.csv,text/plain,text/csv"
              className="hidden"
              onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f); e.currentTarget.value = ""; }}
            />
            <Button type="button" size="sm" variant="outline" onClick={() => fileRef.current?.click()} disabled={busy}>
              <Upload className="h-3.5 w-3.5 mr-1.5" /> Upload .txt / .csv
            </Button>
            <span className="text-[12px] text-muted-foreground">
              {parseTokens(text).length} code{parseTokens(text).length === 1 ? "" : "s"} detected
            </span>
          </div>

          {(busy || results.length > 0) && (
            <div className="border border-border rounded-lg overflow-hidden">
              <div className="flex items-center justify-between px-3 py-2 bg-muted/30 text-[12px]">
                <span className="font-medium">
                  {progress.done}/{progress.total}
                </span>
                <div className="flex items-center gap-3">
                  <span className="text-green-600 flex items-center gap-1"><CheckCircle className="h-3 w-3" />{counts.ok}</span>
                  <span className="text-amber-600 flex items-center gap-1"><Clock className="h-3 w-3" />{counts.already}</span>
                  <span className="text-destructive flex items-center gap-1"><XCircle className="h-3 w-3" />{counts.failed}</span>
                </div>
              </div>
              <ul className="max-h-[220px] overflow-y-auto divide-y divide-border text-[12px]">
                {results.map((r, i) => (
                  <li key={i} className="flex items-center gap-2 px-3 py-1.5">
                    <span className={`shrink-0 h-1.5 w-1.5 rounded-full ${
                      r.status === "ok" ? "bg-green-500" : r.status === "already" ? "bg-amber-500" : "bg-destructive"
                    }`} />
                    <span className="truncate flex-1 font-mono text-muted-foreground">{r.name || r.token}</span>
                    <span className="text-[11px]">{STATUS_LABEL[r.status]}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={busy}>Close</Button>
          <Button onClick={run} disabled={busy || parseTokens(text).length === 0} className="gap-2">
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle className="h-4 w-4" />}
            Check in all
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
