import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, render, screen } from "@testing-library/react";
import { useState } from "react";

// The values the caret sets, read directly. The animation library's own
// rendering isn't under test; it was checked in a browser.
const motion = vi.hoisted(() => ({ values: [] as Array<{ value: number; jumps: number }> }));
vi.mock("framer-motion", () => {
  const make = (value: number) => {
    const v = { value, jumps: 0, set(n: number) { v.value = n; }, jump(n: number) { v.value = n; v.jumps += 1; } };
    return v;
  };
  return {
    useReducedMotion: () => false,
    // Called in order: x, y, height, opacity. Held across renders.
    useMotionValue: (() => {
      let i = 0;
      return (initial: number) => {
        const at = i++ % 4;
        motion.values[at] ??= make(initial);
        return motion.values[at];
      };
    })(),
    useSpring: (source: unknown) => source,
    motion: { div: () => <div data-testid="caret" /> },
  };
});

import { SmoothCaret } from "../SmoothCaret";

const caret = () => ({ x: motion.values[0].value, y: motion.values[1].value, opacity: motion.values[3].value, jumps: motion.values[0].jumps });

// Frames run when the test says so.
let frames: FrameRequestCallback[] = [];
const runFrame = () => act(() => { const due = frames; frames = []; due.forEach((f) => f(0)); });

let top = 100;
let left = 50;
const rect = () => ({ left, right: left + 300, top, bottom: top + 40, width: 300, height: 40, x: left, y: top, toJSON() {} }) as DOMRect;

function Field({ type = "text" }: { type?: string }) {
  const [show, setShow] = useState(true);
  return (
    <>
      <SmoothCaret />
      {show && <input aria-label="Field" type={type} defaultValue="" style={{ fontSize: "16px", paddingLeft: "10px", paddingRight: "10px", borderWidth: "1px", textAlign: "left" }} />}
      <button onClick={() => setShow(false)}>Remove</button>
    </>
  );
}

const focusField = () => {
  const field = screen.getByLabelText("Field") as HTMLInputElement;
  act(() => field.focus());
  return field;
};

beforeEach(() => {
  frames = [];
  top = 100;
  left = 50;
  motion.values.forEach((v) => { v.value = 0; v.jumps = 0; });
  vi.stubGlobal("requestAnimationFrame", (f: FrameRequestCallback) => { frames.push(f); return frames.length; });
  vi.stubGlobal("cancelAnimationFrame", () => { frames = []; });
  vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(rect);
  document.elementFromPoint = vi.fn(() => document.activeElement);
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("SmoothCaret", () => {
  it("hides the field's own caret and shows its own over the field", () => {
    render(<Field />);
    const field = focusField();
    runFrame();
    expect(field.style.caretColor).toBe("transparent");
    expect(caret().opacity).toBe(1);
  });

  it("stays with a field that moves with no event, like a dialog animating in", () => {
    render(<Field />);
    focusField();
    runFrame();
    const before = caret();
    top = 300;
    left = 200;
    runFrame();
    expect(caret().y - before.y).toBe(200);
    expect(caret().x - before.x).toBe(150);
  });

  it("moves with the field at once instead of gliding after it", () => {
    render(<Field />);
    focusField();
    runFrame();
    const before = caret().jumps;
    runFrame();
    expect(caret().jumps).toBe(before);
    left = 200;
    runFrame();
    expect(caret().jumps).toBe(before + 1);
  });

  it("keeps running while the field has focus, and stops when it loses it", () => {
    render(<Field />);
    const field = focusField();
    runFrame();
    expect(frames).toHaveLength(1);
    act(() => field.blur());
    expect(frames).toHaveLength(0);
    expect(field.style.caretColor).toBe("");
  });

  it("hides when something covers the field", () => {
    render(<Field />);
    focusField();
    runFrame();
    expect(caret().opacity).toBe(1);
    document.elementFromPoint = vi.fn(() => document.body);
    runFrame();
    expect(caret().opacity).toBe(0);
  });

  it("disappears when the focused field is removed", () => {
    render(<Field />);
    focusField();
    runFrame();
    act(() => screen.getByRole("button", { name: "Remove" }).click());
    runFrame();
    expect(caret().opacity).toBe(0);
    expect(frames).toHaveLength(0);
  });

  it("gives the field its caret back if it stops being eligible", () => {
    render(<Field />);
    const field = focusField();
    runFrame();
    act(() => { field.disabled = true; });
    runFrame();
    expect(field.style.caretColor).toBe("");
    expect(frames).toHaveLength(0);
  });

  it("leaves fields that have no caret position alone", () => {
    render(<Field type="number" />);
    const field = focusField();
    expect(frames).toHaveLength(0);
    expect(field.style.caretColor).toBe("");
  });
});
