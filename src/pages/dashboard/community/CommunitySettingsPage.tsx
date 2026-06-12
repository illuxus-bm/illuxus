import { useEffect, useState } from "react";
import { Navigate, useParams } from "react-router-dom";
import { CommunityLayout } from "@/components/community/layout/CommunityLayout";
import { useCommunityBySlug } from "@/hooks/community/useCommunity";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { canManageSettings } from "@/lib/community/rbac";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { useQueryClient } from "@tanstack/react-query";

export default function CommunitySettingsPage() {
  const { slug } = useParams<{ slug: string }>();
  const { data } = useCommunityBySlug(slug);
  const role = data?.membership?.role ?? null;
  const qc = useQueryClient();

  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [rules, setRules] = useState("");
  const [bannerUrl, setBannerUrl] = useState("");
  const [logoUrl, setLogoUrl] = useState("");
  const [visibility, setVisibility] = useState<"public" | "members_only" | "private">("members_only");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!data?.community) return;
    setName(data.community.name);
    setDescription(data.community.description ?? "");
    setRules(data.community.rules ?? "");
    setBannerUrl(data.community.banner_url ?? "");
    setLogoUrl(data.community.logo_url ?? "");
    setVisibility(data.community.visibility);
  }, [data?.community]);

  if (!data?.community) return null;
  if (!canManageSettings(role)) return <Navigate to={`/dashboard/community/${slug}/feed`} replace />;

  const save = async () => {
    setSaving(true);
    const { error } = await supabase
      .from("communities" as never)
      .update({
        name,
        description: description || null,
        rules: rules || null,
        banner_url: bannerUrl || null,
        logo_url: logoUrl || null,
        visibility,
      } as never)
      .eq("id", data.community!.id);
    setSaving(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success("Saved");
    qc.invalidateQueries({ queryKey: ["community"] });
  };

  return (
    <CommunityLayout>
      <div className="max-w-2xl space-y-4">
        <div>
          <Label className="text-[12px]">Name</Label>
          <Input value={name} onChange={(e) => setName(e.target.value)} className="mt-1 h-9 text-sm" />
        </div>
        <div>
          <Label className="text-[12px]">Description</Label>
          <Textarea value={description} onChange={(e) => setDescription(e.target.value)} className="mt-1 text-sm" />
        </div>
        <div>
          <Label className="text-[12px]">Community rules</Label>
          <Textarea value={rules} onChange={(e) => setRules(e.target.value)} className="mt-1 text-sm" placeholder="One rule per line, shown in the community sidebar." />
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <Label className="text-[12px]">Banner URL</Label>
            <Input value={bannerUrl} onChange={(e) => setBannerUrl(e.target.value)} className="mt-1 h-9 text-sm" />
          </div>
          <div>
            <Label className="text-[12px]">Logo URL</Label>
            <Input value={logoUrl} onChange={(e) => setLogoUrl(e.target.value)} className="mt-1 h-9 text-sm" />
          </div>
        </div>
        <div>
          <Label className="text-[12px]">Visibility</Label>
          <Select value={visibility} onValueChange={(v) => setVisibility(v as typeof visibility)}>
            <SelectTrigger className="mt-1 h-9 text-sm">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="public">Public — anyone can browse</SelectItem>
              <SelectItem value="members_only">Members only — sign-in required</SelectItem>
              <SelectItem value="private">Private — invite only</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="flex justify-end">
          <Button size="sm" onClick={save} disabled={saving} className="h-8 text-[12px]">
            {saving ? "Saving…" : "Save"}
          </Button>
        </div>
      </div>
    </CommunityLayout>
  );
}
