/**
 * The organization's brand kit: its logos, colours, fonts and brand files.
 *
 * One kit per workspace, stored as the `snapshot` of a `brand_kits` row
 * (migrations 025 and 044). Files live in the public `site-assets` bucket
 * under `brand-kits/<org id>/`. The snapshot keeps the keys the creatives
 * feature already reads (`primaryColor`, `accentColor`, `fontFamily`,
 * `logoUrl`) in step with the kit, and leaves any key it doesn't know alone.
 */
import { supabase } from "@/integrations/supabase/client";

export interface BrandAsset {
  url: string;
  /** Storage path inside `site-assets`, kept so the file can be deleted. */
  path: string;
  name: string;
  size: number;
  type: string;
  uploadedAt: string;
}

export interface BrandColor {
  name: string;
  hex: string;
}

export const LOGO_SLOTS = ["cmyk", "white", "black", "icon"] as const;
export type LogoSlot = (typeof LOGO_SLOTS)[number];

export interface BrandKit {
  logos: Record<LogoSlot, BrandAsset | null>;
  colors: BrandColor[];
  headingFont: string;
  bodyFont: string;
  tagline: string;
  /** How the brand should and shouldn't be used, in the organiser's words. */
  notes: string;
  guidelines: BrandAsset | null;
  resources: BrandAsset[];
}

export const BRAND_KIT_NAME = "Organization brand kit";
export const BRAND_BUCKET = "site-assets";
export const MAX_BRAND_FILE_BYTES = 25 * 1024 * 1024;
export const MAX_BRAND_COLORS = 8;
export const MAX_BRAND_RESOURCES = 30;

const HEX_RE = /^#[0-9a-f]{6}$/i;
export const isHex = (v: unknown): v is string => typeof v === "string" && HEX_RE.test(v);

export const emptyBrandKit = (): BrandKit => ({
  logos: { cmyk: null, white: null, black: null, icon: null },
  colors: [],
  headingFont: "",
  bodyFont: "",
  tagline: "",
  notes: "",
  guidelines: null,
  resources: [],
});

const str = (v: unknown, max: number): string => (typeof v === "string" ? v.slice(0, max) : "");

function parseAsset(v: unknown): BrandAsset | null {
  if (!v || typeof v !== "object") return null;
  const a = v as Record<string, unknown>;
  if (typeof a.url !== "string" || !/^https?:\/\//i.test(a.url)) return null;
  return {
    url: a.url,
    path: str(a.path, 500),
    name: str(a.name, 200) || "file",
    size: typeof a.size === "number" && a.size >= 0 ? a.size : 0,
    type: str(a.type, 100),
    uploadedAt: str(a.uploadedAt, 40),
  };
}

/** Reads a stored snapshot. Anything missing or malformed becomes empty. */
export function parseBrandKit(snapshot: unknown): BrandKit {
  const kit = emptyBrandKit();
  if (!snapshot || typeof snapshot !== "object") return kit;
  const s = snapshot as Record<string, unknown>;
  const logos = (s.logos && typeof s.logos === "object" ? s.logos : {}) as Record<string, unknown>;
  for (const slot of LOGO_SLOTS) kit.logos[slot] = parseAsset(logos[slot]);
  if (Array.isArray(s.colors)) {
    kit.colors = s.colors
      .map((c) => (c && typeof c === "object" ? (c as Record<string, unknown>) : {}))
      .filter((c) => isHex(c.hex))
      .slice(0, MAX_BRAND_COLORS)
      .map((c) => ({ name: str(c.name, 40), hex: (c.hex as string).toLowerCase() }));
  } else {
    // A kit saved by the creatives feature has only these two.
    if (isHex(s.primaryColor)) kit.colors.push({ name: "Primary", hex: s.primaryColor.toLowerCase() });
    if (isHex(s.accentColor)) kit.colors.push({ name: "Accent", hex: s.accentColor.toLowerCase() });
  }
  kit.headingFont = str(s.headingFont, 80) || str(s.fontFamily, 80);
  kit.bodyFont = str(s.bodyFont, 80);
  kit.tagline = str(s.tagline, 200);
  kit.notes = str(s.notes, 4000);
  kit.guidelines = parseAsset(s.guidelines);
  if (Array.isArray(s.resources)) {
    kit.resources = s.resources.map(parseAsset).filter((a): a is BrandAsset => a !== null).slice(0, MAX_BRAND_RESOURCES);
  }
  return kit;
}

const IMAGE_EXT_RE = /\.(png|jpe?g|webp|gif|svg)(\?|$)/i;
/** Whether a browser can show the file as a picture (a CMYK PDF or .ai cannot). */
export const isPreviewable = (asset: BrandAsset | null): boolean =>
  !!asset && (/^image\/(png|jpeg|webp|gif|svg\+xml)$/i.test(asset.type) || IMAGE_EXT_RE.test(asset.name));

/** The snapshot to store: the kit, over whatever else the row already held. */
export function toBrandSnapshot(kit: BrandKit, previous: unknown = {}): Record<string, unknown> {
  const base = previous && typeof previous === "object" ? { ...(previous as Record<string, unknown>) } : {};
  const logo = [kit.logos.black, kit.logos.cmyk, kit.logos.white, kit.logos.icon].find((a) => isPreviewable(a));
  return {
    ...base,
    logos: kit.logos,
    colors: kit.colors,
    headingFont: kit.headingFont.trim(),
    bodyFont: kit.bodyFont.trim(),
    tagline: kit.tagline.trim(),
    notes: kit.notes.trim(),
    guidelines: kit.guidelines,
    resources: kit.resources,
    primaryColor: kit.colors[0]?.hex ?? null,
    accentColor: kit.colors[1]?.hex ?? null,
    fontFamily: kit.headingFont.trim() || null,
    logoUrl: logo?.url ?? null,
    updatedAt: new Date().toISOString(),
  };
}

export interface LoadedBrandKit {
  id: string | null;
  kit: BrandKit;
  snapshot: unknown;
}

/** Turns "table missing / permission denied" into something an organiser can act on. */
export function explainBrandKitError(message: string): string {
  return /permission denied|does not exist|schema cache|PGRST205|42501|42P01/i.test(message)
    ? "The brand kit isn't switched on for this workspace yet — database update 044 still needs to be applied."
    : message;
}

export async function loadBrandKit(orgId: string): Promise<LoadedBrandKit> {
  const { data, error } = await supabase
    .from("brand_kits")
    .select("id, snapshot")
    .eq("org_id", orgId)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();
  if (error) throw new Error(explainBrandKitError(error.message));
  return { id: data?.id ?? null, kit: parseBrandKit(data?.snapshot), snapshot: data?.snapshot ?? {} };
}

/** Creates the workspace's kit, or updates it. Returns the row id. */
export async function saveBrandKit(args: {
  orgId: string;
  userId: string;
  id: string | null;
  kit: BrandKit;
  previousSnapshot: unknown;
}): Promise<{ id: string; snapshot: Record<string, unknown> }> {
  const snapshot = toBrandSnapshot(args.kit, args.previousSnapshot);
  if (args.id) {
    const { data, error } = await supabase
      .from("brand_kits")
      .update({ snapshot: snapshot as never })
      .eq("id", args.id)
      .select("id");
    if (error) throw new Error(explainBrandKitError(error.message));
    if (!data || data.length === 0) throw new Error("Only the workspace's owners and admins can change the brand kit.");
    return { id: args.id, snapshot };
  }
  const { data, error } = await supabase
    .from("brand_kits")
    .insert({ org_id: args.orgId, name: BRAND_KIT_NAME, snapshot: snapshot as never, created_by: args.userId })
    .select("id")
    .single();
  if (error) {
    throw new Error(
      /row-level security/i.test(error.message)
        ? "Only the workspace's owners and admins can change the brand kit."
        : explainBrandKitError(error.message),
    );
  }
  return { id: data.id, snapshot };
}

export function brandAssetPath(orgId: string, slot: string, fileName: string, now = Date.now()): string {
  const base = fileName.split(/[\\/]/).pop() ?? "";
  const match = /^(.*)\.([A-Za-z0-9]{1,8})$/.exec(base);
  const ext = match ? match[2].toLowerCase() : "";
  const stem = (match ? match[1] : base)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60) || "file";
  return `brand-kits/${orgId}/${slot}-${now}-${stem}${ext ? `.${ext}` : ""}`;
}

export async function uploadBrandAsset(orgId: string, slot: string, file: File): Promise<BrandAsset> {
  if (file.size > MAX_BRAND_FILE_BYTES) throw new Error("That file is larger than 25 MB.");
  const path = brandAssetPath(orgId, slot, file.name);
  const { error } = await supabase.storage
    .from(BRAND_BUCKET)
    .upload(path, file, { contentType: file.type || "application/octet-stream", cacheControl: "31536000" });
  if (error) throw new Error(error.message);
  const { data } = supabase.storage.from(BRAND_BUCKET).getPublicUrl(path);
  return { url: data.publicUrl, path, name: file.name, size: file.size, type: file.type, uploadedAt: new Date().toISOString() };
}

/** Best-effort removal of files no longer in the saved kit. */
export async function deleteBrandAssetFiles(paths: string[]): Promise<void> {
  const own = paths.filter((p) => p.startsWith("brand-kits/"));
  if (own.length === 0) return;
  await supabase.storage.from(BRAND_BUCKET).remove(own);
}

export const brandAssetPaths = (kit: BrandKit): string[] =>
  [...LOGO_SLOTS.map((s) => kit.logos[s]), kit.guidelines, ...kit.resources]
    .filter((a): a is BrandAsset => a !== null)
    .map((a) => a.path)
    .filter(Boolean);

export function formatBytes(bytes: number): string {
  if (!bytes) return "";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
