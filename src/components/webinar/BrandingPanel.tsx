import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { Upload } from "lucide-react";
import type { Branding } from "./StageOverlays";

export function BrandingPanel({ sessionId, initial }: { sessionId: string; initial?: Branding }) {
  const [b, setB] = useState<Branding>(initial || {});
  const [saving, setSaving] = useState(false);

  useEffect(() => { setB(initial || {}); }, [sessionId]);

  const update = (patch: Partial<Branding>) => setB((prev) => ({ ...prev, ...patch }));

  const save = async () => {
    setSaving(true);
    const { error } = await supabase.from("webinar_sessions").update({ branding: b as any }).eq("id", sessionId);
    setSaving(false);
    if (error) toast.error(error.message); else toast.success("Branding updated");
  };

  const onLogo = async (file: File) => {
    const path = `webinar-branding/${sessionId}/logo-${Date.now()}-${file.name}`;
    const { error } = await supabase.storage.from("site-assets").upload(path, file, { upsert: true });
    if (error) return toast.error(error.message);
    const { data } = supabase.storage.from("site-assets").getPublicUrl(path);
    update({ logo_url: data.publicUrl });
  };

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div>
          <Label className="text-[12px]">Logo</Label>
          <div className="flex items-center gap-2 mt-1">
            {b.logo_url && <img src={b.logo_url} alt="" className="h-10 w-auto rounded border" />}
            <label className="inline-flex items-center gap-1 px-3 py-2 text-sm border rounded-md cursor-pointer hover:bg-muted">
              <Upload className="h-3 w-3" /> Upload
              <input type="file" accept="image/*" className="hidden"
                onChange={(e) => e.target.files?.[0] && onLogo(e.target.files[0])} />
            </label>
            {b.logo_url && <Button size="sm" variant="ghost" onClick={() => update({ logo_url: undefined })}>Remove</Button>}
          </div>
        </div>
        <div>
          <Label className="text-[12px]">Background image URL</Label>
          <Input className="mt-1" placeholder="https://…" value={b.background_url || ""} onChange={(e) => update({ background_url: e.target.value || null })} />
        </div>
        <div>
          <Label className="text-[12px]">Primary color</Label>
          <Input className="mt-1" type="color" value={b.primary_color || "#0ea5e9"} onChange={(e) => update({ primary_color: e.target.value })} />
        </div>
        <div>
          <Label className="text-[12px]">Accent color</Label>
          <Input className="mt-1" type="color" value={b.accent_color || "#22c55e"} onChange={(e) => update({ accent_color: e.target.value })} />
        </div>
      </div>

      <div className="border rounded-md p-3 space-y-2">
        <div className="flex items-center justify-between">
          <Label className="text-[13px] font-medium">Lower-third</Label>
          <Switch checked={!!b.lower_third?.visible}
            onCheckedChange={(v) => update({ lower_third: { ...(b.lower_third || {}), visible: v } })} />
        </div>
        <Input placeholder="Title (e.g. Jane Doe)" value={b.lower_third?.title || ""}
          onChange={(e) => update({ lower_third: { ...(b.lower_third || {}), title: e.target.value } })} />
        <Input placeholder="Subtitle (e.g. CTO, Acme)" value={b.lower_third?.subtitle || ""}
          onChange={(e) => update({ lower_third: { ...(b.lower_third || {}), subtitle: e.target.value } })} />
      </div>

      <div className="border rounded-md p-3 space-y-2">
        <div className="flex items-center justify-between">
          <Label className="text-[13px] font-medium">Banner ticker</Label>
          <Switch checked={!!b.banner?.visible}
            onCheckedChange={(v) => update({ banner: { ...(b.banner || {}), visible: v } })} />
        </div>
        <Input placeholder="Banner text" value={b.banner?.text || ""}
          onChange={(e) => update({ banner: { ...(b.banner || {}), text: e.target.value } })} />
        <Select value={b.banner?.position || "top"}
          onValueChange={(v: any) => update({ banner: { ...(b.banner || {}), position: v } })}>
          <SelectTrigger><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="top">Top</SelectItem>
            <SelectItem value="bottom">Bottom</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <Button onClick={save} disabled={saving}>{saving ? "Saving…" : "Save branding"}</Button>
    </div>
  );
}