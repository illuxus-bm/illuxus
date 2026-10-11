// Unit tests for src/lib/creatives/studio/edits.ts — the patches that carry
// an organiser's canvas edits on top of a template.
import { describe, expect, it } from "vitest";

import {
  addNode,
  applyEdits,
  duplicateNode,
  EMPTY_EDITS,
  hasEdits,
  hitTest,
  isBackdrop,
  moveBy,
  patchNode,
  removeNode,
  reorderNode,
  setBounds,
} from "../edits";
import { nodeBounds, type Scene, type SceneNode, type TextNode } from "../scene";

const text = (id: string, value: string, x = 100): TextNode => ({
  kind: "text", id, text: value, x, y: 100, w: 200, h: 50, family: "Poppins", weight: 400, size: 40, color: "#000",
});

const scene = (nodes: SceneNode[]): Scene => ({ width: 1000, height: 1000, background: "#fff", nodes });

const BASE = scene([
  { kind: "rect", id: "bg", x: 0, y: 0, w: 1000, h: 1000, fill: "#eee" },
  { kind: "image", id: "photo", src: "a.jpg", fit: "cover", x: 0, y: 0, w: 400, h: 400 },
  text("name", "Maela Agatha"),
  text("title", "DevOps Connect", 500),
]);

const ids = (s: Scene): Array<string | undefined> => s.nodes.map((n) => n.id);

describe("applyEdits", () => {
  it("returns the base scene untouched when there is nothing to apply", () => {
    expect(applyEdits(BASE, EMPTY_EDITS)).toBe(BASE);
    expect(applyEdits(BASE, undefined)).toBe(BASE);
    expect(hasEdits(EMPTY_EDITS)).toBe(false);
  });

  it("patches, removes and adds nodes", () => {
    let edits = patchNode(EMPTY_EDITS, "name", { x: 300, color: "#f00" });
    edits = removeNode(edits, "photo");
    edits = addNode(edits, text("", "New line")).edits;
    const result = applyEdits(BASE, edits);
    expect(result.nodes.find((n) => n.id === "name")).toMatchObject({ x: 300, color: "#f00", text: "Maela Agatha" });
    expect(ids(result)).not.toContain("photo");
    expect(result.nodes[result.nodes.length - 1]).toMatchObject({ kind: "text", text: "New line" });
    expect(hasEdits(edits)).toBe(true);
    // The base is never mutated.
    expect(BASE.nodes.find((n) => n.id === "name")).toMatchObject({ x: 100 });
  });

  it("keeps following the event data for anything not overridden", () => {
    const edits = patchNode(EMPTY_EDITS, "name", { x: 300 });
    const nextSpeaker = scene(BASE.nodes.map((n) => (n.id === "name" ? { ...n, text: "John Levis" } as SceneNode : n)));
    expect(applyEdits(nextSpeaker, edits).nodes.find((n) => n.id === "name")).toMatchObject({ x: 300, text: "John Levis" });
  });

  it("does not stamp one speaker's retyped name or replaced photo on another's creative", () => {
    let edits = patchNode(EMPTY_EDITS, "name", { text: "Dr. Maela Agatha", x: 300 });
    edits = patchNode(edits, "photo", { src: "retouched.jpg" });
    edits = patchNode(edits, "title", { text: "DevOps Connect — Bengaluru" });
    const other = scene(
      BASE.nodes.map((n) => (n.id === "name" ? ({ ...n, text: "John Levis" } as SceneNode) : n.id === "photo" ? ({ ...n, src: "b.jpg" } as SceneNode) : n)),
    );
    const result = applyEdits(other, edits, BASE);
    expect(result.nodes.find((n) => n.id === "name")).toMatchObject({ text: "John Levis", x: 300 });
    expect(result.nodes.find((n) => n.id === "photo")).toMatchObject({ src: "b.jpg" });
    // Shared copy is the same on both, so the edit carries over.
    expect(result.nodes.find((n) => n.id === "title")).toMatchObject({ text: "DevOps Connect — Bengaluru" });
  });

  it("edits a node the organiser added, and deletes it cleanly", () => {
    const added = addNode(EMPTY_EDITS, text("", "Mine"));
    const patched = patchNode(added.edits, added.id, { text: "Changed" });
    expect(patched.patches).toEqual({});
    expect(applyEdits(BASE, patched).nodes.find((n) => n.id === added.id)).toMatchObject({ text: "Changed" });
    const removed = removeNode(patched, added.id);
    expect(removed.added).toEqual([]);
    expect(removed.removed).toEqual([]);
  });

  it("gives duplicates a new id and an offset", () => {
    const result = duplicateNode(BASE, EMPTY_EDITS, "name");
    expect(result).not.toBeNull();
    const copy = applyEdits(BASE, result!.edits).nodes.find((n) => n.id === result!.id) as TextNode;
    expect(copy.id).not.toBe("name");
    expect(copy.text).toBe("Maela Agatha");
    expect(copy.x).toBeGreaterThan(100);
    expect(duplicateNode(BASE, EMPTY_EDITS, "missing")).toBeNull();
  });
});

describe("reorderNode", () => {
  it("moves a node through the stack", () => {
    expect(ids(applyEdits(BASE, reorderNode(BASE, EMPTY_EDITS, "photo", "front")))).toEqual(["bg", "name", "title", "photo"]);
    expect(ids(applyEdits(BASE, reorderNode(BASE, EMPTY_EDITS, "title", "back")))).toEqual(["title", "bg", "photo", "name"]);
    expect(ids(applyEdits(BASE, reorderNode(BASE, EMPTY_EDITS, "photo", "forward")))).toEqual(["bg", "name", "photo", "title"]);
    expect(ids(applyEdits(BASE, reorderNode(BASE, EMPTY_EDITS, "name", "backward")))).toEqual(["bg", "name", "photo", "title"]);
  });

  it("is a no-op at the ends", () => {
    expect(reorderNode(BASE, EMPTY_EDITS, "title", "front")).toBe(EMPTY_EDITS);
    expect(reorderNode(BASE, EMPTY_EDITS, "bg", "backward")).toBe(EMPTY_EDITS);
  });

  it("keeps nodes the saved order has never seen in their natural place", () => {
    const edits = reorderNode(BASE, EMPTY_EDITS, "photo", "front");
    const grown = scene([BASE.nodes[0], text("extra", "New speaker"), ...BASE.nodes.slice(1)]);
    const result = ids(applyEdits(grown, edits));
    expect(result[result.length - 1]).toBe("photo");
    expect(result.indexOf("extra")).toBeLessThan(result.indexOf("photo"));
    expect(result).toHaveLength(5);
  });
});

describe("geometry", () => {
  const nodes: SceneNode[] = [
    text("t", "Hi"),
    { kind: "ellipse", id: "e", cx: 500, cy: 500, rx: 100, ry: 50, fill: "#000" },
    { kind: "line", id: "l", x1: 100, y1: 100, x2: 300, y2: 200, color: "#000", width: 4 },
    { kind: "icon", id: "i", name: "pin", x: 10, y: 20, size: 40, color: "#000" },
    { kind: "dots", id: "d", x: 50, y: 50, cols: 4, rows: 3, gap: 20, r: 2, color: "#000" },
  ];

  it.each(nodes)("moves a $kind by exactly the delta", (node) => {
    const before = nodeBounds(node);
    const after = nodeBounds({ ...node, ...moveBy(node, 15, -25) } as SceneNode);
    expect(after.x).toBeCloseTo(before.x + 15, 6);
    expect(after.y).toBeCloseTo(before.y - 25, 6);
    expect(after.w).toBeCloseTo(before.w, 6);
    expect(after.h).toBeCloseTo(before.h, 6);
  });

  it.each(nodes.filter((n) => n.kind !== "dots" && n.kind !== "icon"))("resizes a $kind to the target box", (node) => {
    const target = { x: 40, y: 60, w: 320, h: 180 };
    const after = nodeBounds({ ...node, ...setBounds(node, target) } as SceneNode);
    expect(after.x).toBeCloseTo(target.x, 4);
    expect(after.y).toBeCloseTo(target.y, 4);
    expect(after.w).toBeCloseTo(target.w, 4);
    expect(after.h).toBeCloseTo(target.h, 4);
  });

  it("scales type with a corner drag but not an edge drag", () => {
    const node = text("t", "Hi");
    expect(setBounds(node, { x: 100, y: 100, w: 400, h: 100 }, true).size).toBe(80);
    expect(setBounds(node, { x: 100, y: 100, w: 400, h: 100 }).size).toBeUndefined();
  });

  it("never collapses a node to nothing", () => {
    const patch = setBounds(text("t", "Hi"), { x: 0, y: 0, w: -50, h: 0 });
    expect(patch.w).toBeGreaterThan(0);
    expect(patch.h).toBeGreaterThan(0);
  });
});

describe("hitTest", () => {
  it("picks the topmost node under the pointer", () => {
    const stacked = scene([...BASE.nodes, { kind: "rect", id: "top", x: 90, y: 90, w: 100, h: 100, fill: "#000" }]);
    expect(hitTest(stacked, 120, 120)).toBe("top");
    expect(hitTest(stacked, 250, 120)).toBe("name");
  });

  it("ignores the backdrop, so empty canvas deselects", () => {
    expect(isBackdrop(BASE, BASE.nodes[0])).toBe(true);
    expect(hitTest(BASE, 900, 900)).toBeNull();
  });

  it("gives thin lines some slack", () => {
    const withRule = scene([{ kind: "line", id: "rule", x1: 100, y1: 500, x2: 600, y2: 500, color: "#000", width: 2 }]);
    expect(hitTest(withRule, 300, 505)).toBe("rule");
    expect(hitTest(withRule, 300, 530)).toBeNull();
  });

  it("tests a rotated node in its own frame", () => {
    // 400 × 40 turned a quarter: it now stands 40 wide and 400 tall.
    const turned = scene([{ ...text("side", "SPEAKER"), x: 300, y: 480, w: 400, h: 40, rotation: -90 }]);
    expect(hitTest(turned, 500, 320)).toBe("side");
    expect(hitTest(turned, 320, 500)).toBeNull();
  });
});
