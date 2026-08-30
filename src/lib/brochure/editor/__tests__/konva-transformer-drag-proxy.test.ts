// Pins the Konva behaviour that `BrochureEditorCanvas`'s drag handling relies on.
//
// `BrochureEditorCanvas` does NOT move the other members of a multi-selection
// itself. It used to, and that was a bug: Konva's `Transformer` ALREADY proxies
// drag across every attached node, so the hand-written loop applied the delta a
// second time and the siblings ended up at `start + 2 * delta`.
//
// Removing that loop makes correct group drag depend entirely on an
// undocumented Konva implementation detail (`Transformer._proxyDrag`). If a
// Konva upgrade drops or changes it, group drag silently stops working — no type
// error, no exception, elements simply stop following each other. These tests
// exist to turn that into a loud failure.
//
// Two consequences are asserted, because the canvas depends on BOTH:
//   1. Siblings move by the initiator's delta.
//   2. Siblings are put into a real dragging state (`startDrag`), which is why
//      they each emit their own dragstart/dragmove/dragend — and therefore why
//      the canvas guards `handleDragStart` against re-entry and commits the
//      gesture exactly once.
import { afterEach, beforeEach, describe, expect, it } from "vitest";
// The browser entry, explicitly. Konva's `main` is `lib/index-node.js`, which
// `require`s the native `canvas` package; resolving that in the test runner
// would mean adding a native build dependency purely to read event listeners
// off a node. `lib/index.js` is the same code the app bundles.
import Konva from "konva/lib/index";
// The default import above is a value, not a namespace, so `Konva.Stage` isn't
// usable as a type annotation here.
import type { Stage } from "konva/lib/Stage";

let container: HTMLDivElement;
let stage: Stage;
let originalGetContext: typeof HTMLCanvasElement.prototype.getContext;

/**
 * Minimal 2D context stub.
 *
 * jsdom throws on `getContext("2d")` unless the native `canvas` package is
 * installed. These tests only inspect Konva's object graph — node positions and
 * event listeners — and never assert on pixels, so a proxy that answers every
 * drawing call with a no-op is sufficient and keeps `canvas` out of the
 * dependency tree.
 */
function stubCanvasContext() {
  const numericProps = new Set(["lineWidth", "globalAlpha", "miterLimit"]);
  return new Proxy(
    {},
    {
      get(target: Record<string, unknown>, prop: string) {
        if (prop in target) return target[prop];
        if (prop === "canvas") return undefined;
        if (prop === "measureText") return () => ({ width: 0 });
        if (prop === "getImageData") return () => ({ data: new Uint8ClampedArray(4) });
        if (prop === "createLinearGradient" || prop === "createPattern") {
          return () => ({ addColorStop: () => {} });
        }
        if (numericProps.has(prop)) return 1;
        return () => {};
      },
      set(target: Record<string, unknown>, prop: string, value: unknown) {
        target[prop] = value;
        return true;
      },
    },
  );
}

beforeEach(() => {
  originalGetContext = HTMLCanvasElement.prototype.getContext;
  HTMLCanvasElement.prototype.getContext =
    stubCanvasContext as unknown as typeof HTMLCanvasElement.prototype.getContext;

  container = document.createElement("div");
  document.body.appendChild(container);
  stage = new Konva.Stage({ container, width: 400, height: 400 });
});

afterEach(() => {
  stage?.destroy();
  container.remove();
  HTMLCanvasElement.prototype.getContext = originalGetContext;
});

/** Builds a layer with two draggable rects plus a transformer attached to both. */
function buildSelection() {
  const layer = new Konva.Layer();
  stage.add(layer);

  const a = new Konva.Rect({ x: 10, y: 10, width: 20, height: 20, draggable: true });
  const b = new Konva.Rect({ x: 100, y: 50, width: 20, height: 20, draggable: true });
  layer.add(a);
  layer.add(b);

  const tr = new Konva.Transformer();
  layer.add(tr);
  tr.nodes([a, b]);

  return { layer, a, b, tr };
}

describe("Konva Transformer multi-node drag proxy", () => {
  it("registers drag listeners on every attached node", () => {
    const { a, b, tr } = buildSelection();

    // If these are ever absent, the canvas must move siblings itself again.
    expect(Object.keys(a.eventListeners)).toContain("dragstart");
    expect(Object.keys(a.eventListeners)).toContain("dragmove");
    expect(Object.keys(b.eventListeners)).toContain("dragstart");
    expect(Object.keys(b.eventListeners)).toContain("dragmove");

    expect(tr.nodes()).toHaveLength(2);
  });

  it("moves the sibling by the initiator's delta on the first dragmove", () => {
    const { a, b } = buildSelection();
    const bStart = { x: b.x(), y: b.y() };

    // Konva captures `lastPos` on dragstart, then diffs against it on dragmove.
    a.fire("dragstart");
    a.position({ x: a.x() + 15, y: a.y() + 25 });
    a.fire("dragmove");

    expect(b.x()).toBe(bStart.x + 15);
    expect(b.y()).toBe(bStart.y + 25);
  });

  it("puts the sibling into a dragging state, which is why it emits its own drag events", () => {
    const { a, b } = buildSelection();

    a.fire("dragstart");
    a.position({ x: a.x() + 5, y: a.y() + 5 });
    a.fire("dragmove");

    // This is the detail that forces the canvas's re-entrancy guard: a node in
    // a dragging state will fire dragstart/dragmove/dragend of its own.
    expect(b.isDragging()).toBe(true);

    b.stopDrag();
  });

  it("applies the shift only once per gesture, not on every dragmove", () => {
    // Konva nulls its `lastPos` after the first proxied move, so subsequent
    // frames are driven by each node's own pointer offset. This is exactly why
    // the canvas cannot snap a multi-selection by nudging only the initiator:
    // nothing would carry that correction to the siblings.
    const { a, b } = buildSelection();
    const bStart = b.x();

    a.fire("dragstart");
    a.position({ x: a.x() + 10, y: a.y() });
    a.fire("dragmove");
    expect(b.x()).toBe(bStart + 10);

    a.position({ x: a.x() + 10, y: a.y() });
    a.fire("dragmove");
    expect(b.x()).toBe(bStart + 10); // unchanged by the second frame

    b.stopDrag();
  });

  it("does not proxy to nodes that are not attached to the transformer", () => {
    // The canvas relies on this when the organizer drags an UNSELECTED element:
    // it must move alone even though a transformer is attached elsewhere.
    const { layer, a, b } = buildSelection();
    const loose = new Konva.Rect({ x: 200, y: 200, width: 20, height: 20, draggable: true });
    layer.add(loose);

    loose.fire("dragstart");
    loose.position({ x: loose.x() + 30, y: loose.y() });
    loose.fire("dragmove");

    expect(a.x()).toBe(10);
    expect(b.x()).toBe(100);
  });

  it("stops proxying once the transformer is detached", () => {
    const { a, b, tr } = buildSelection();
    tr.nodes([a]);
    const bStart = b.x();

    a.fire("dragstart");
    a.position({ x: a.x() + 40, y: a.y() });
    a.fire("dragmove");

    expect(b.x()).toBe(bStart);
  });
});
