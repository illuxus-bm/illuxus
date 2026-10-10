// Tests for the two reference-matched Event_Promo templates ("Invitation
// Envelope" and "Stats Hero Banner").
//
// A creative is assembled from many independent shapes, and nothing fails
// when one of them is drawn without the content it belongs to — the output is
// just wrong: red accent ticks around a script line that isn't there, an empty
// panel where stats would go. These pin that content-bound shapes come and go
// with their content, and that the envelope's pieces stay in the order that
// makes it read as an envelope.
import { describe, expect, it } from "vitest";

import { buildEventPlan, type EventPromoLike, type PlanElement } from "../creative-renderer";
import { EVENT_TEMPLATES, PLATFORM_FORMATS, reflowTemplate, type CreativeTemplate } from "../creative-templates";

const template = (id: string): CreativeTemplate => {
  const found = EVENT_TEMPLATES.find((t) => t.id === id);
  if (!found) throw new Error(`template ${id} missing`);
  return found;
};
const format = (id: string) => {
  const found = PLATFORM_FORMATS.find((f) => f.id === id);
  if (!found) throw new Error(`format ${id} missing`);
  return found;
};

const INVITE = template("event-invite-envelope-ref");
const BANNER = template("event-stats-hero-ref");

const FULL: EventPromoLike = {
  id: "full",
  editionLabel: "Summer Edition",
  tagline: "You’re Invited",
  titleLead: "India’s Largest",
  title: "Virtual HR Summit",
  dateLabel: "23rd July, 2026",
  ctaLabel: "Register for FREE",
  stats: [
    { value: "6000+", label: "Attendees" },
    { value: "30+", label: "Speakers" },
  ],
};
const SPARSE: EventPromoLike = { id: "sparse", title: "Annual Product Summit" };

type Shape = Extract<PlanElement, { kind: "shape" }>;
const shapes = (promo: EventPromoLike, t: CreativeTemplate, formatId: string): Shape[] =>
  buildEventPlan(promo, t, format(formatId), {}).elements.filter((el): el is Shape => el.kind === "shape");
const keys = (list: Shape[]): string[] => list.map((s) => s.key);

describe("Invitation Envelope", () => {
  it("draws the accent ticks only when there is a script line for them to flank", () => {
    const withTagline = keys(shapes(FULL, INVITE, "instagram-post")).filter((k) => k.startsWith("tick"));
    expect(withTagline).toHaveLength(6);
    expect(keys(shapes(SPARSE, INVITE, "instagram-post")).some((k) => k.startsWith("tick"))).toBe(false);
    expect(keys(shapes({ ...FULL, tagline: "   " }, INVITE, "instagram-post")).some((k) => k.startsWith("tick"))).toBe(false);
  });

  it("always draws the envelope itself, whatever the content", () => {
    for (const promo of [FULL, SPARSE]) {
      const drawn = keys(shapes(promo, INVITE, "instagram-post"));
      for (const piece of ["envelopeFlap", "envelopeBack", "invitationCard", "envelopeSideL", "envelopeSideR", "envelopeBottom"]) {
        expect(drawn).toContain(piece);
      }
    }
  });

  it("layers the envelope back to front, so the card sits inside it", () => {
    const order = keys(shapes(FULL, INVITE, "instagram-post"));
    const at = (key: string) => order.indexOf(key);
    expect(at("envelopeFlap")).toBeLessThan(at("invitationCard"));
    expect(at("envelopeBack")).toBeLessThan(at("invitationCard"));
    // The front flaps come after the card: that is what tucks it in.
    expect(at("invitationCard")).toBeLessThan(at("envelopeSideL"));
    expect(at("invitationCard")).toBeLessThan(at("envelopeSideR"));
    expect(at("envelopeSideL")).toBeLessThan(at("envelopeBottom"));
  });

  it("opens the flap upward: its tip is above the card", () => {
    const boxes = reflowTemplate(INVITE, format("instagram-post")).shapeSlots;
    expect(boxes.envelopeFlap.y).toBeLessThan(boxes.invitationCard.y);
    // ...and the card's foot is below the top of the front flaps.
    expect(boxes.invitationCard.y + boxes.invitationCard.height).toBeGreaterThan(boxes.envelopeSideL.y);
  });

  it("gives every polygon normalised vertices inside its own box", () => {
    for (const slot of INVITE.shapeSlots ?? []) {
      if (slot.shape !== "polygon") continue;
      expect(slot.points!.length).toBeGreaterThanOrEqual(3);
      for (const [x, y] of slot.points!) {
        expect(x).toBeGreaterThanOrEqual(-1e-9);
        expect(x).toBeLessThanOrEqual(1 + 1e-9);
        expect(y).toBeGreaterThanOrEqual(-1e-9);
        expect(y).toBeLessThanOrEqual(1 + 1e-9);
      }
    }
  });

  it("keeps every shape inside the canvas as authored, so reflow never has to shove one", () => {
    for (const slot of INVITE.shapeSlots ?? []) {
      expect(slot.xPct - slot.widthPct / 2, slot.key).toBeGreaterThanOrEqual(-1e-6);
      expect(slot.xPct + slot.widthPct / 2, slot.key).toBeLessThanOrEqual(100 + 1e-6);
      expect(slot.yPct - slot.heightPct / 2, slot.key).toBeGreaterThanOrEqual(-1e-6);
      expect(slot.yPct + slot.heightPct / 2, slot.key).toBeLessThanOrEqual(100 + 1e-6);
    }
  });
});

describe("Stats Hero Banner", () => {
  const statFurniture = ["statsCard", "statDivider1", "statDivider2", "statDivider3"];

  it("draws the stats panel and its dividers only when there are stats", () => {
    const withStats = keys(shapes(FULL, BANNER, "linkedin-post"));
    for (const key of statFurniture) expect(withStats).toContain(key);

    for (const promo of [SPARSE, { ...FULL, stats: [] }, { ...FULL, stats: [{ value: "", label: "" }] }]) {
      const drawn = keys(shapes(promo, BANNER, "linkedin-post"));
      for (const key of statFurniture) expect(drawn).not.toContain(key);
    }
  });

  it("keeps the background sweeps regardless of content", () => {
    expect(keys(shapes(SPARSE, BANNER, "linkedin-post")).filter((k) => k.startsWith("aurora"))).toHaveLength(3);
  });

  it("lines each stat's value and label up on the same left edge, inside the panel", () => {
    const boxes = reflowTemplate(BANNER, format("linkedin-post"));
    const panel = boxes.shapeSlots.statsCard;
    for (const n of [1, 2, 3, 4]) {
      const value = boxes.textSlots[`statValue${n}`];
      const label = boxes.textSlots[`statLabel${n}`];
      expect(value.x).toBeCloseTo(label.x, 6);
      expect(value.x).toBeGreaterThan(panel.x);
      expect(value.x + value.width).toBeLessThanOrEqual(panel.x + panel.width);
      expect(BANNER.textSlots.find((s) => s.key === `statValue${n}`)?.align).toBe("left");
    }
  });

  it("puts each divider between two stat columns, never through one", () => {
    const boxes = reflowTemplate(BANNER, format("linkedin-post"));
    for (const n of [1, 2, 3]) {
      const divider = boxes.shapeSlots[`statDivider${n}`];
      const before = boxes.textSlots[`statValue${n}`];
      const after = boxes.textSlots[`statValue${n + 1}`];
      expect(divider.x).toBeGreaterThanOrEqual(before.x + before.width);
      expect(divider.x + divider.width).toBeLessThanOrEqual(after.x);
    }
  });
});
