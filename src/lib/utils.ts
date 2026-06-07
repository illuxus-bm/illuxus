import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/**
 * Build a "Open in Maps" URL for a venue/location pair. Uses Google Maps'
 * universal search URL which opens the native Maps app on iOS/Android and
 * google.com/maps on desktop. Returns null when both inputs are empty.
 */
export function mapsUrlFor(
  venue?: string | null,
  location?: string | null,
): string | null {
  const query = [venue, location].filter(Boolean).join(", ").trim();
  if (!query) return null;
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}`;
}
