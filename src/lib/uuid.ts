/**
 * Cross-context UUID v4 generator.
 *
 * Why this exists: `crypto.randomUUID()` is only available in **secure contexts**
 * (HTTPS or localhost). When the app is accessed via a non-secure origin like
 * `http://192.168.x.x:4173`, `crypto.randomUUID` is undefined and a hard error
 * is thrown the first time it's called. This helper falls back to a random
 * generator that works everywhere.
 *
 * NOTE: For browser code only. Edge Functions (Deno) always have `crypto.randomUUID`.
 */
export function uuid(): string {
  // Use the native API when available (HTTPS/localhost — most browsers)
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  // Fallback: getRandomValues-based v4
  if (typeof crypto !== "undefined" && typeof crypto.getRandomValues === "function") {
    const bytes = new Uint8Array(16);
    crypto.getRandomValues(bytes);
    bytes[6] = (bytes[6] & 0x0f) | 0x40; // version 4
    bytes[8] = (bytes[8] & 0x3f) | 0x80; // variant
    const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, "0"));
    return `${hex.slice(0, 4).join("")}-${hex.slice(4, 6).join("")}-${hex.slice(6, 8).join("")}-${hex.slice(8, 10).join("")}-${hex.slice(10, 16).join("")}`;
  }
  // Last-resort fallback (very unlikely path) — Math.random is sufficient for
  // non-cryptographic IDs like email/upload identifiers.
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    return (c === "x" ? r : (r & 0x3) | 0x8).toString(16);
  });
}
