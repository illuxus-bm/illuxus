/**
 * Layout audit for the Creative Studio.
 *
 * While a design is drawn with an audit list attached (see `renderStudio`),
 * every text block, picture and organiser mark records the box it painted.
 * `findOverlaps` then checks the rules a finished graphic must obey:
 *
 *   • text never sits on a picture (photo, logo, banner),
 *   • two pieces of text never share space,
 *   • the organiser's mark never sits on text or a picture,
 *   • nothing runs off the canvas.
 *
 * The check is pure geometry, so it runs in unit tests; the browser harness
 * feeds it the boxes from real renders of every design at every size.
 */
import type { AuditBox } from "./studio-draw";

export interface AuditIssue {
  rule: "text-on-picture" | "text-on-text" | "mark-overlap" | "off-canvas";
  a: string;
  b?: string;
  /** Overlap (or overflow) in pixels, for the report. */
  amount: number;
}

/** How far two boxes interpenetrate; 0 when they are apart or merely touch. */
function overlap(a: AuditBox, b: AuditBox): number {
  const w = Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x);
  const h = Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y);
  return w > 0 && h > 0 ? Math.min(w, h) : 0;
}

const name = (b: AuditBox) => `${b.kind}:${b.label.slice(0, 28)}`;

/**
 * @param tolerance pixels of interpenetration to ignore (anti-aliasing,
 *                  rounding, a descender grazing a neighbour).
 */
export function findOverlaps(boxes: readonly AuditBox[], width: number, height: number, tolerance = 2): AuditIssue[] {
  const issues: AuditIssue[] = [];
  for (const b of boxes) {
    const out = Math.max(-b.x, -b.y, b.x + b.w - width, b.y + b.h - height);
    if (out > tolerance) issues.push({ rule: "off-canvas", a: name(b), amount: Math.round(out) });
  }
  for (let i = 0; i < boxes.length; i++) {
    for (let j = i + 1; j < boxes.length; j++) {
      const a = boxes[i], b = boxes[j];
      const amount = overlap(a, b);
      if (amount <= tolerance) continue;
      const kinds = [a.kind, b.kind].sort().join("+");
      const rule: AuditIssue["rule"] | null =
        kinds === "media+text" ? "text-on-picture"
        : kinds === "text+text" ? "text-on-text"
        : kinds.includes("mark") ? "mark-overlap"
        : null; // picture on picture is a design choice (e.g. a logo on its plate)
      if (rule) issues.push({ rule, a: name(a), b: name(b), amount: Math.round(amount) });
    }
  }
  return issues;
}
