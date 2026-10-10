/**
 * Reading an image the organizer picked, dropped or pasted into the editor.
 *
 * One implementation for every way an image arrives — the properties panel's
 * picker, the palette's Image button, a file dropped on the canvas — so they
 * all accept the same files, enforce the same limit and report the same
 * errors.
 *
 * Images become data URLs inlined in the document JSON: saving the brochure
 * carries the image with it and no storage bucket is involved.
 */

/** Largest file we'll inline as a data URL. */
export const MAX_IMAGE_BYTES = 5 * 1024 * 1024;

export type ImageFileResult =
  | { status: "ok"; dataUrl: string; width: number; height: number }
  | { status: "rejected"; title: string; description?: string };

/**
 * Reads `file` as a data URL and measures it. Never throws — a rejected file
 * comes back as `{ status: "rejected" }` with a message for a toast, because every
 * caller wants to tell the organizer why nothing happened rather than fail
 * silently.
 */
export async function readImageFile(file: File): Promise<ImageFileResult> {
  if (!file.type.startsWith("image/")) {
    return { status: "rejected", title: "That file isn't an image", description: "Pick a PNG, JPG, WebP or SVG." };
  }
  if (file.size > MAX_IMAGE_BYTES) {
    const mb = (file.size / (1024 * 1024)).toFixed(1);
    return {
      status: "rejected",
      title: "Image is too large",
      description: `${mb} MB — the limit is 5 MB. Resize it, or paste a URL instead.`,
    };
  }

  const dataUrl = await new Promise<string>((resolve) => {
    const reader = new FileReader();
    reader.onload = () => resolve(typeof reader.result === "string" ? reader.result : "");
    reader.onerror = () => resolve("");
    reader.readAsDataURL(file);
  });
  if (!dataUrl) return { status: "rejected", title: "Couldn't read that file" };

  // Natural size, so a new image element can be created at the picture's own
  // proportions instead of a fixed box that crops it.
  const size = await new Promise<{ width: number; height: number }>((resolve) => {
    const img = new window.Image();
    img.onload = () => resolve({ width: img.naturalWidth, height: img.naturalHeight });
    img.onerror = () => resolve({ width: 0, height: 0 });
    img.src = dataUrl;
  });
  return { status: "ok", dataUrl, width: size.width, height: size.height };
}

/**
 * Size, in mm, for a newly placed image: its own proportions, scaled to take up
 * at most `share` of the page in either direction. Falls back to a 4:3 box when
 * the natural size is unknown (an SVG without dimensions).
 */
export function placedImageSizeMm(
  naturalWidth: number,
  naturalHeight: number,
  pageWidth: number,
  pageHeight: number,
  share = 0.45,
): { width: number; height: number } {
  const ratio = naturalWidth > 0 && naturalHeight > 0 ? naturalWidth / naturalHeight : 4 / 3;
  const maxW = pageWidth * share;
  const maxH = pageHeight * share;
  const width = Math.min(maxW, maxH * ratio);
  return { width, height: width / ratio };
}
