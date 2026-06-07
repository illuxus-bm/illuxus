import { useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Upload, X, Image as ImageIcon } from "lucide-react";

const MAX_BYTES = 2 * 1024 * 1024;
const ALLOWED = ["image/png", "image/jpeg", "image/webp", "image/svg+xml"];

export default function SponsorLogoUploader({
  value, onChange,
}: { value: string | null | undefined; onChange: (url: string | null) => void }) {
  const [uploading, setUploading] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const pick = () => inputRef.current?.click();

  const upload = async (file: File) => {
    if (!ALLOWED.includes(file.type)) {
      toast.error("Use PNG, JPG, WebP or SVG");
      return;
    }
    if (file.size > MAX_BYTES) {
      toast.error("Logo must be under 2 MB");
      return;
    }
    setUploading(true);
    try {
      const ext = file.name.split(".").pop()?.toLowerCase() || "png";
      const path = `sponsor-logos/${crypto.randomUUID()}.${ext}`;
      const { error } = await supabase.storage.from("site-assets").upload(path, file, {
        cacheControl: "3600",
        upsert: false,
        contentType: file.type,
      });
      if (error) throw error;
      const { data } = supabase.storage.from("site-assets").getPublicUrl(path);
      onChange(data.publicUrl);
      toast.success("Logo uploaded");
    } catch (e: any) {
      toast.error("Upload failed", { description: e?.message });
    } finally {
      setUploading(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  };

  return (
    <div className="flex items-center gap-3">
      <div className="h-10 w-20 rounded-md border border-border bg-muted/30 flex items-center justify-center overflow-hidden shrink-0">
        {value ? (
          <img src={value} alt="Logo" className="h-full w-full object-contain" />
        ) : (
          <ImageIcon className="h-5 w-5 text-muted-foreground" />
        )}
      </div>
      <div className="flex flex-col gap-1">
        <div className="flex items-center gap-2">
          <Button type="button" size="sm" variant="outline" className="h-7 text-[12px] gap-1.5" onClick={pick} disabled={uploading}>
            <Upload className="h-3 w-3" /> {uploading ? "Uploading…" : value ? "Replace" : "Upload"}
          </Button>
          {value && (
            <Button type="button" size="sm" variant="ghost" className="h-7 text-[12px] gap-1 text-destructive" onClick={() => onChange(null)}>
              <X className="h-3 w-3" /> Remove
            </Button>
          )}
        </div>
        <p className="text-[11px] text-muted-foreground">PNG, JPG, SVG · max 2 MB</p>
      </div>
      <input
        ref={inputRef}
        type="file"
        accept={ALLOWED.join(",")}
        className="hidden"
        onChange={(e) => { const f = e.target.files?.[0]; if (f) upload(f); }}
      />
    </div>
  );
}