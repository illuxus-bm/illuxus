import { useRef, useState } from "react";
import { ImagePlus, Loader2, Trash2, Upload, Crop, Info } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import CoverCropDialog from "./CoverCropDialog";

interface Props {
  /** Existing event id, when editing. Omit for create flows. */
  eventId?: string;
  /** Owning user id — used for drafts upload folder. */
  userId: string;
  imageUrl: string;
  onChange: (url: string) => void;
  /** Aspect ratio (width / height). e.g. 16/9 for landscape, 4/5 for portrait. */
  aspect: number;
  /** Human-readable aspect label, e.g. "16:9 (landscape)". */
  aspectLabel: string;
  /** Recommended pixel size shown in the helper, e.g. "1920×1080 px". */
  recommendedPx: string;
  /** Longest side of the exported image (px). */
  outputLongSide?: number;
  /** Picker label. */
  label?: string;
  /** Storage subfolder key (used in filename), e.g. "landscape" or "portrait". */
  variant: string;
}

const MAX_BYTES = 5 * 1024 * 1024;
const TOLERANCE = 0.03; // ±3% of target aspect counts as already-correct

/**
 * Reusable banner image picker that enforces a non-square aspect ratio.
 * Built on top of `CoverCropDialog` (parameterized by `aspect`).
 */
export default function EventBannerPicker({
  eventId,
  userId,
  imageUrl,
  onChange,
  aspect,
  aspectLabel,
  recommendedPx,
  outputLongSide = 1920,
  label = "Banner image",
  variant,
}: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [warning, setWarning] = useState<string | null>(null);
  const [cropOpen, setCropOpen] = useState(false);
  const [cropSrc, setCropSrc] = useState<string | null>(null);

  const fileToDataUrl = (file: File) =>
    new Promise<string>((resolve, reject) => {
      const fr = new FileReader();
      fr.onload = () => resolve(fr.result as string);
      fr.onerror = () => reject(new Error("Could not read file"));
      fr.readAsDataURL(file);
    });

  const probeImage = (src: string) =>
    new Promise<{ w: number; h: number }>((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve({ w: img.naturalWidth, h: img.naturalHeight });
      img.onerror = () => reject(new Error("Could not load image"));
      img.src = src;
    });

  const uploadBlob = async (blob: Blob, ext = "jpg") => {
    const folder = eventId ? `event-covers/${eventId}` : `event-covers/drafts/${userId}`;
    const path = `${folder}/banner-${variant}-${Date.now()}.${ext}`;
    const { error: upErr } = await supabase.storage
      .from("site-assets")
      .upload(path, blob, { cacheControl: "3600", upsert: true, contentType: blob.type || "image/jpeg" });
    if (upErr) throw upErr;
    const { data } = supabase.storage.from("site-assets").getPublicUrl(path);
    return data.publicUrl;
  };

  const handleFile = async (file: File) => {
    setError(null);
    setWarning(null);
    if (!file.type.startsWith("image/")) {
      setError("Please choose an image file (JPG, PNG, or WebP).");
      return;
    }
    if (file.size > MAX_BYTES) {
      setError("Image must be under 5MB.");
      return;
    }
    try {
      const dataUrl = await fileToDataUrl(file);
      const { w, h } = await probeImage(dataUrl);
      const ratio = w / h;
      const onTarget = Math.abs(ratio - aspect) / aspect <= TOLERANCE;
      if (!onTarget) {
        setWarning(
          `Banner should be ${aspectLabel}. Your image is ${w}×${h} — crop below.`,
        );
      }
      setCropSrc(dataUrl);
      setCropOpen(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not read image.");
    }
  };

  const handleCropConfirm = async (blob: Blob) => {
    setUploading(true);
    try {
      const url = await uploadBlob(blob, "jpg");
      onChange(url);
      setCropOpen(false);
      setCropSrc(null);
      setWarning(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Upload failed");
    } finally {
      setUploading(false);
    }
  };

  // Render preview tile at the target aspect ratio.
  const tileStyle: React.CSSProperties = { aspectRatio: String(aspect) };

  return (
    <div className="space-y-2">
      <Label className="text-[12px]">{label}</Label>
      <div
        className="group relative w-full rounded-xl overflow-hidden bg-secondary border border-dashed border-border cursor-pointer hover:border-muted-foreground/40"
        style={tileStyle}
        onClick={() => !uploading && inputRef.current?.click()}
        role="button"
        tabIndex={0}
      >
        {imageUrl ? (
          <>
            <img src={imageUrl} alt={`${label} preview`} className="w-full h-full object-cover" />
            <div className="absolute inset-0 bg-black/0 group-hover:bg-black/40 transition-colors flex items-center justify-center opacity-0 group-hover:opacity-100">
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={(e) => { e.stopPropagation(); inputRef.current?.click(); }}
                  className="inline-flex items-center gap-1.5 h-8 px-3 rounded-md bg-white text-black text-[12px] font-medium shadow"
                >
                  <Upload className="h-3.5 w-3.5" /> Replace
                </button>
                <button
                  type="button"
                  onClick={(e) => { e.stopPropagation(); onChange(""); }}
                  className="inline-flex items-center gap-1.5 h-8 px-3 rounded-md bg-white/90 text-destructive text-[12px] font-medium shadow"
                >
                  <Trash2 className="h-3.5 w-3.5" /> Remove
                </button>
              </div>
            </div>
          </>
        ) : (
          <div className="w-full h-full flex flex-col items-center justify-center gap-1 text-muted-foreground">
            <ImagePlus className="h-6 w-6" />
            <span className="text-[12px] font-medium">Upload {label.toLowerCase()}</span>
            <span className="text-[11px] opacity-75">{aspectLabel} · &lt;5MB</span>
          </div>
        )}
        {uploading && (
          <div className="absolute inset-0 bg-background/60 flex items-center justify-center">
            <Loader2 className="h-6 w-6 animate-spin opacity-70" />
          </div>
        )}
        <input
          ref={inputRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            e.target.value = "";
            if (f) handleFile(f);
          }}
        />
      </div>

      <div className="rounded-md border border-border bg-muted/30 px-2.5 py-2 flex items-start gap-2">
        <Info className="h-3.5 w-3.5 mt-0.5 text-muted-foreground flex-shrink-0" />
        <div className="text-[11px] leading-relaxed text-muted-foreground">
          <span className="font-medium text-foreground">Aspect:</span> {aspectLabel} ·{" "}
          <span className="font-medium text-foreground">Recommended:</span> {recommendedPx} ·{" "}
          <span className="font-medium text-foreground">Max:</span> 5 MB
        </div>
      </div>

      {warning && (
        <p className="text-[12px] text-amber-600 dark:text-amber-500 flex items-start gap-1.5">
          <Crop className="h-3.5 w-3.5 mt-0.5 flex-shrink-0" /> {warning}
        </p>
      )}
      {error && <p className="text-[12px] text-destructive">{error}</p>}
      <Input
        value={imageUrl}
        onChange={async (e) => {
          const v = e.target.value;
          onChange(v);
          setError(null);
          setWarning(null);
          if (v && /^https?:\/\//.test(v)) {
            try {
              const { w, h } = await probeImage(v);
              const ratio = w / h;
              if (Math.abs(ratio - aspect) / aspect > TOLERANCE) {
                setWarning(`Pasted image is ${w}×${h} (not ${aspectLabel}). Opening cropper…`);
                setCropSrc(v);
                setCropOpen(true);
              }
            } catch {
              // CORS-protected URLs can't be probed — skip.
            }
          }
        }}
        placeholder="…or paste an image URL"
        className="h-8 text-[12px]"
      />

      <CoverCropDialog
        open={cropOpen}
        src={cropSrc}
        aspect={aspect}
        outputSize={outputLongSide}
        busy={uploading}
        onCancel={() => { setCropOpen(false); setCropSrc(null); }}
        onConfirm={handleCropConfirm}
      />
    </div>
  );
}