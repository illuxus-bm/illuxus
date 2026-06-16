import { useRef, useState } from "react";
import { ImagePlus, Loader2, Trash2, Upload, Crop, Info } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import CoverCropDialog from "./CoverCropDialog";

interface Props {
  /** Existing event id, when editing. Omit for create flows. */
  eventId?: string;
  /** Owning user id — required so drafts uploads land in a known folder. */
  userId: string;
  imageUrl: string;
  onChange: (url: string) => void;
  /** Aspect of the preview tile. Defaults to 1:1 (matches public hero). */
  aspect?: "1/1";
  label?: string;
}

/** Recommended specs surfaced inside the picker. */
const SPECS = {
  ratio: "1:1 (square)",
  recommendedPx: "1200×1200 px",
  formats: "JPG, PNG, WebP",
  maxSize: "5 MB",
  outputPx: 1200,
  maxBytes: 5 * 1024 * 1024,
  ratioTolerance: 0.02, // ±2% counts as square
};

/**
 * Reusable cover image picker for event create/edit forms.
 * Uploads to the public `site-assets` bucket and exposes the resulting URL.
 * Also accepts a pasted URL as a fallback.
 */
export default function EventCoverPicker({
  eventId,
  userId,
  imageUrl,
  onChange,
  aspect = "1/1",
  label = "Cover image",
}: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [warning, setWarning] = useState<string | null>(null);
  const [cropOpen, setCropOpen] = useState(false);
  const [cropSrc, setCropSrc] = useState<string | null>(null);

  /** Read a File into a data URL so the cropper can load it without uploading first. */
  const fileToDataUrl = (file: File) =>
    new Promise<string>((resolve, reject) => {
      const fr = new FileReader();
      fr.onload = () => resolve(fr.result as string);
      fr.onerror = () => reject(new Error("Could not read file"));
      fr.readAsDataURL(file);
    });

  /** Get an image's natural dimensions from a URL/dataURL. */
  const probeImage = (src: string) =>
    new Promise<{ w: number; h: number }>((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve({ w: img.naturalWidth, h: img.naturalHeight });
      img.onerror = () => reject(new Error("Could not load image"));
      img.src = src;
    });

  const uploadBlob = async (blob: Blob, ext = "jpg") => {
    const folder = eventId ? `event-covers/${eventId}` : `event-covers/drafts/${userId}`;
    const path = `${folder}/${Date.now()}.${ext}`;
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
    if (file.size > SPECS.maxBytes) {
      setError("Image must be under 5MB.");
      return;
    }
    try {
      const dataUrl = await fileToDataUrl(file);
      const { w, h } = await probeImage(dataUrl);

      const ratio = w / h;
      const isSquare = Math.abs(ratio - 1) <= SPECS.ratioTolerance;

      // Always open the cropper so the user can position/zoom — required for non-square,
      // optional polish for square uploads.
      if (!isSquare) {
        setWarning(
          `Cover must be 1:1. Your image is ${w}×${h} — please crop to a square below.`
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

  const aspectClass = "aspect-square max-w-[260px]";

  return (
    <div className="space-y-2">
      {label ? <Label className="text-[12px]">{label}</Label> : null}
      <div
        className={`group relative ${aspectClass} w-full rounded-xl overflow-hidden bg-secondary border border-dashed border-border cursor-pointer hover:border-muted-foreground/40`}
        onClick={() => !uploading && inputRef.current?.click()}
        role="button"
        tabIndex={0}
      >
        {imageUrl ? (
          <>
            <img src={imageUrl} alt="Event cover" className="w-full h-full object-cover" />
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
                  onClick={(e) => {
                    e.stopPropagation();
                    setCropSrc(imageUrl);
                    setCropOpen(true);
                  }}
                  className="inline-flex items-center gap-1.5 h-8 px-3 rounded-md bg-white text-black text-[12px] font-medium shadow"
                >
                  <Crop className="h-3.5 w-3.5" /> Crop
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
            <span className="text-[12px] font-medium">Upload cover image</span>
            <span className="text-[11px] opacity-75">1:1 recommended · &lt;5MB</span>
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
      {/* Specs hint */}
      <div className="rounded-md border border-border bg-muted/30 px-2.5 py-2 flex items-start gap-2">
        <Info className="h-3.5 w-3.5 mt-0.5 text-muted-foreground flex-shrink-0" />
        <div className="text-[11px] leading-relaxed text-muted-foreground space-y-0.5">
          <div>
            <span className="font-medium text-foreground">Aspect:</span> {SPECS.ratio} ·{" "}
            <span className="font-medium text-foreground">Recommended:</span> {SPECS.recommendedPx}
          </div>
          <div>
            <span className="font-medium text-foreground">Formats:</span> {SPECS.formats} ·{" "}
            <span className="font-medium text-foreground">Max size:</span> {SPECS.maxSize}
          </div>
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
              if (Math.abs(ratio - 1) > SPECS.ratioTolerance) {
                setWarning(`Pasted image is ${w}×${h} (not 1:1). Opening cropper…`);
                // Auto-open the cropper so the user can fix it immediately
                setCropSrc(v);
                setCropOpen(true);
              }
            } catch {
              // ignore — could be CORS-protected; we just skip the check
            }
          }
        }}
        placeholder="…or paste an image URL"
        className="h-8 text-[12px]"
      />

      <CoverCropDialog
        open={cropOpen}
        src={cropSrc}
        outputSize={SPECS.outputPx}
        busy={uploading}
        onCancel={() => { setCropOpen(false); setCropSrc(null); }}
        onConfirm={handleCropConfirm}
      />
    </div>
  );
}