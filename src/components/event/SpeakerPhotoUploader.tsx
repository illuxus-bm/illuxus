import { useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Upload, X, User } from "lucide-react";
import { uuid } from "@/lib/uuid";

const MAX_BYTES = 2 * 1024 * 1024;
const ALLOWED = ["image/png", "image/jpeg", "image/webp"];

/**
 * Square (1:1) speaker portrait uploader. Writes to the existing `site-assets`
 * bucket under `speaker-photos/` and emits the public URL.
 */
export default function SpeakerPhotoUploader({
  value, onChange,
}: { value: string | null | undefined; onChange: (url: string | null) => void }) {
  const [uploading, setUploading] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const pick = () => inputRef.current?.click();

  const upload = async (file: File) => {
    if (!ALLOWED.includes(file.type)) {
      toast.error("Use PNG, JPG or WebP");
      return;
    }
    if (file.size > MAX_BYTES) {
      toast.error("Photo must be under 2 MB");
      return;
    }
    setUploading(true);
    try {
      const ext = file.name.split(".").pop()?.toLowerCase() || "png";
      const path = `speaker-photos/${uuid()}.${ext}`;
      const { error } = await supabase.storage.from("site-assets").upload(path, file, {
        cacheControl: "3600",
        upsert: false,
        contentType: file.type,
      });
      if (error) throw error;
      const { data } = supabase.storage.from("site-assets").getPublicUrl(path);
      onChange(data.publicUrl);
      toast.success("Photo uploaded");
    } catch (e: any) {
      toast.error("Upload failed", { description: e?.message });
    } finally {
      setUploading(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  };

  return (
    <div className="flex items-center gap-3">
      <div className="h-20 w-20 rounded-full border border-border bg-muted/30 flex items-center justify-center overflow-hidden shrink-0 aspect-square">
        {value ? (
          <img src={value} alt="Speaker" className="h-full w-full object-cover" />
        ) : (
          <User className="h-8 w-8 text-muted-foreground" />
        )}
      </div>
      <div className="flex flex-col gap-1">
        <div className="flex items-center gap-2">
          <Button type="button" size="sm" variant="outline" className="h-7 text-[12px] gap-1.5" onClick={pick} disabled={uploading}>
            <Upload className="h-3 w-3" /> {uploading ? "Uploading…" : value ? "Replace" : "Upload photo"}
          </Button>
          {value && (
            <Button type="button" size="sm" variant="ghost" className="h-7 text-[12px] gap-1 text-destructive" onClick={() => onChange(null)}>
              <X className="h-3 w-3" /> Remove
            </Button>
          )}
        </div>
        <p className="text-[11px] text-muted-foreground">Square crop · PNG, JPG, WebP · max 2 MB</p>
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