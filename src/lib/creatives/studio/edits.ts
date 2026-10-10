/**
 * Free-form edits on top of a template.
 *
 * A template builds a scene from the event's data; the organiser can then
 * move, restyle, delete or add anything on the canvas. Those changes are kept
 * as a small set of patches against node ids rather than as a frozen copy of
 * the scene, so the creative keeps following the event — pick another speaker
 * or fix the venue and the moved, recoloured elements stay moved and
 * recoloured.
 *
 * Everything here is pure; the canvas component and the studio only call in.
 */
import { nodeBounds, type Bounds, type Scene, type SceneNode } from "./scene";

export type NodePatch = Record<string, unknown>;

export interface SceneEdits {
  /** Property overrides for template nodes, by node id. */
  patches: Record<string, NodePatch>;
  /** Template nodes the organiser deleted. */
  removed: string[];
  /** Nodes the organiser added. */
  added: SceneNode[];
  /** Back-to-front node ids, once the organiser has reordered layers. */
  order?: string[];
}

export const EMPTY_EDITS: SceneEdits = { patches: {}, removed: [], added: [] };

export function hasEdits(edits: SceneEdits | undefined): boolean {
  if (!edits) return false;
  return Object.keys(edits.patches).length > 0 || edits.removed.length > 0 || edits.added.length > 0 || Boolean(edits.order);
}

/** Keys whose value comes from the event rather than from the design. */
const DATA_KEYS = ["text", "src"] as const;

/**
 * The scene the organiser sees: `base` with their edits applied.
 *
 * `reference` is the base scene the edits were made on. When it is given —
 * exporting the same design for every speaker — a text or image override is
 * skipped on any node whose own content differs from the reference's, so
 * retyping one speaker's name doesn't stamp it on everyone else's creative.
 */
export function applyEdits(base: Scene, edits: SceneEdits | undefined, reference?: Scene): Scene {
  if (!edits || !hasEdits(edits)) return base;
  const removed = new Set(edits.removed);
  const referenceById = new Map((reference?.nodes ?? []).map((n) => [n.id, n as unknown as NodePatch]));

  let nodes: SceneNode[] = base.nodes
    .filter((node) => !node.id || !removed.has(node.id))
    .map((node) => {
      const patch = node.id ? edits.patches[node.id] : undefined;
      if (!patch) return node;
      const applied: NodePatch = { ...patch };
      const original = referenceById.get(node.id);
      if (original) {
        for (const key of DATA_KEYS) {
          if (key in applied && original[key] !== (node as unknown as NodePatch)[key]) delete applied[key];
        }
      }
      return { ...node, ...applied } as SceneNode;
    });
  nodes = nodes.concat(edits.added);

  if (edits.order) {
    const rank = new Map(edits.order.map((id, i) => [id, i]));
    // Nodes the saved order doesn't know (a speaker was added since) keep
    // their natural place rather than jumping to the front or back.
    const keyed = nodes.map((node, i) => ({ node, key: rank.get(node.id ?? "") ?? i - 0.5 }));
    keyed.sort((a, b) => a.key - b.key);
    nodes = keyed.map((entry) => entry.node);
  }
  return { ...base, nodes };
}

const isAdded = (edits: SceneEdits, id: string): boolean => edits.added.some((n) => n.id === id);

/** Merges `patch` into the node's edits. */
export function patchNode(edits: SceneEdits, id: string, patch: NodePatch): SceneEdits {
  if (isAdded(edits, id)) {
    return { ...edits, added: edits.added.map((n) => (n.id === id ? ({ ...n, ...patch } as SceneNode) : n)) };
  }
  return { ...edits, patches: { ...edits.patches, [id]: { ...edits.patches[id], ...patch } } };
}

export function removeNode(edits: SceneEdits, id: string): SceneEdits {
  const order = edits.order?.filter((other) => other !== id);
  if (isAdded(edits, id)) return { ...edits, added: edits.added.filter((n) => n.id !== id), order };
  const { [id]: _dropped, ...patches } = edits.patches;
  return { ...edits, patches, removed: [...edits.removed, id], order };
}

let addedCount = 0;
function newId(): string {
  addedCount += 1;
  return `added-${Date.now().toString(36)}-${addedCount}`;
}

/** Adds `node` on top of everything else. */
export function addNode(edits: SceneEdits, node: SceneNode): { edits: SceneEdits; id: string } {
  const id = newId();
  return {
    id,
    edits: { ...edits, added: [...edits.added, { ...node, id }], order: edits.order ? [...edits.order, id] : undefined },
  };
}

/** Copies the node `id` of the applied `scene`, offset so the copy is visible. */
export function duplicateNode(scene: Scene, edits: SceneEdits, id: string): { edits: SceneEdits; id: string } | null {
  const source = scene.nodes.find((n) => n.id === id);
  if (!source) return null;
  const offset = Math.round(scene.width * 0.025);
  return addNode(edits, { ...source, ...moveBy(source, offset, offset) } as SceneNode);
}

export type LayerMove = "front" | "forward" | "backward" | "back";

/** Moves the node `id` of the applied `scene` through the layer stack. */
export function reorderNode(scene: Scene, edits: SceneEdits, id: string, move: LayerMove): SceneEdits {
  const ids = scene.nodes.map((n) => n.id ?? "");
  const from = ids.indexOf(id);
  if (from < 0) return edits;
  const to = move === "front" ? ids.length - 1 : move === "back" ? 0 : Math.max(0, Math.min(ids.length - 1, from + (move === "forward" ? 1 : -1)));
  if (to === from) return edits;
  ids.splice(from, 1);
  ids.splice(to, 0, id);
  return { ...edits, order: ids };
}

// ─── Geometry ────────────────────────────────────────────────────────────────

/** The patch that shifts `node` by `(dx, dy)`. */
export function moveBy(node: SceneNode, dx: number, dy: number): NodePatch {
  switch (node.kind) {
    case "ellipse":
      return { cx: node.cx + dx, cy: node.cy + dy };
    case "line":
      return { x1: node.x1 + dx, y1: node.y1 + dy, x2: node.x2 + dx, y2: node.y2 + dy };
    default:
      return { x: node.x + dx, y: node.y + dy };
  }
}

const MIN_SIZE = 8;

/**
 * The patch that makes `node` occupy `target`. `scaleText` also scales a text
 * node's type with its width — what dragging a corner does, as opposed to
 * dragging an edge, which only changes where the text wraps.
 */
export function setBounds(node: SceneNode, target: Bounds, scaleText = false): NodePatch {
  const w = Math.max(MIN_SIZE, target.w);
  const h = Math.max(MIN_SIZE, target.h);
  const current = nodeBounds(node);
  switch (node.kind) {
    case "ellipse":
      return { cx: target.x + w / 2, cy: target.y + h / 2, rx: w / 2, ry: h / 2 };
    case "line": {
      // Bounds include half the stroke on every side; scale the endpoints
      // within the box that is left once that is taken off.
      const pad = node.width / 2;
      const innerW = current.w - pad * 2;
      const innerH = current.h - pad * 2;
      const fx = innerW > 0 ? Math.max(0, w - pad * 2) / innerW : 1;
      const fy = innerH > 0 ? Math.max(0, h - pad * 2) / innerH : 1;
      const ox = current.x + pad;
      const oy = current.y + pad;
      return {
        x1: target.x + pad + (node.x1 - ox) * fx,
        y1: target.y + pad + (node.y1 - oy) * fy,
        x2: target.x + pad + (node.x2 - ox) * fx,
        y2: target.y + pad + (node.y2 - oy) * fy,
      };
    }
    case "dots": {
      const gap = node.cols > 1 ? Math.max(node.r * 2, (w - node.r * 2) / (node.cols - 1)) : node.gap;
      return { x: target.x + node.r, y: target.y + node.r, gap };
    }
    case "icon":
      return { x: target.x, y: target.y, size: Math.min(w, h) };
    case "text": {
      const patch: NodePatch = { x: target.x, y: target.y, w, h };
      if (scaleText && current.w > 0) {
        const factor = w / current.w;
        patch.size = node.size * factor;
        if (node.minSize !== undefined) patch.minSize = node.minSize * factor;
        if (node.letterSpacing) patch.letterSpacing = node.letterSpacing * factor;
      }
      return patch;
    }
    default:
      return { x: target.x, y: target.y, w, h };
  }
}

/**
 * A node that fills the canvas is a backdrop: clicking the canvas should
 * select what is on it, not the sheet behind. It can still be picked from the
 * layers list.
 */
export function isBackdrop(scene: Scene, node: SceneNode): boolean {
  const b = nodeBounds(node);
  return b.w * b.h >= scene.width * scene.height * 0.8;
}

/** The id of the topmost node under `(x, y)`, or `null`. */
export function hitTest(scene: Scene, x: number, y: number): string | null {
  for (let i = scene.nodes.length - 1; i >= 0; i -= 1) {
    const node = scene.nodes[i];
    if (!node.id || isBackdrop(scene, node)) continue;
    const b = nodeBounds(node);
    if (b.w <= 0 || b.h <= 0) continue;
    // Thin rules are hard to hit; give them a little slack.
    const padX = Math.max(0, (14 - b.w) / 2);
    const padY = Math.max(0, (14 - b.h) / 2);
    let px = x;
    let py = y;
    if (node.rotation) {
      // Test in the node's own frame.
      const cx = b.x + b.w / 2;
      const cy = b.y + b.h / 2;
      const angle = (-node.rotation * Math.PI) / 180;
      px = cx + (x - cx) * Math.cos(angle) - (y - cy) * Math.sin(angle);
      py = cy + (x - cx) * Math.sin(angle) + (y - cy) * Math.cos(angle);
    }
    if (px >= b.x - padX && px <= b.x + b.w + padX && py >= b.y - padY && py <= b.y + b.h + padY) return node.id;
  }
  return null;
}

/** A short human label for a node, for the layers list. */
export function nodeLabel(node: SceneNode): string {
  switch (node.kind) {
    case "text":
      return node.text.replace(/\s+/g, " ").trim().slice(0, 40) || "Text";
    case "image":
      return node.role === "speaker-photo" ? "Speaker photo" : node.role?.includes("logo") ? "Logo" : "Image";
    case "rect":
      return "Rectangle";
    case "ellipse":
      return "Circle";
    case "line":
      return "Line";
    case "dots":
      return "Dot pattern";
    case "icon":
      return `Icon · ${node.name}`;
  }
}
