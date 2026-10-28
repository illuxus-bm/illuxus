import { useEffect } from "react";
import { motion, useMotionValue, useReducedMotion, useSpring } from "framer-motion";

/**
 * One text cursor for the whole app that glides to where the caret is
 * instead of jumping. Mounted once at the root, it follows whichever text
 * field has focus, hides that field's own caret and draws this one over it,
 * so every input — login, forms, search — gets it without being changed.
 *
 * Left alone (they keep the native caret): textareas, number and date
 * fields, centred or right-to-left text, the one-time-code field (it draws
 * its own caret), and anything marked `data-native-caret`.
 *
 * Email fields don't report where the caret is, so there it is drawn at the
 * end of the text — where it is while typing — and the native caret takes
 * over as soon as it could be anywhere else (a click into existing text, an
 * arrow or Home/End key).
 */

const CARET_TYPES = new Set(["text", "search", "password", "url", "tel", "email", ""]);
/** Keys that move the caret somewhere an email field won't tell us. */
const MOVE_KEYS = new Set(["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", "Home", "End", "PageUp", "PageDown"]);
const SPRING = { stiffness: 500, damping: 30, mass: 0.5 };
const INSTANT = { stiffness: 10000, damping: 100, mass: 0.1 };

const IS_FIREFOX = typeof navigator !== "undefined" && /firefox|fxios/i.test(navigator.userAgent);
const IS_CHROMIUM = typeof navigator !== "undefined" && /chrome|chromium|crios/i.test(navigator.userAgent);
/** The dot each browser draws for a password character. */
const PASSWORD_CHAR = IS_FIREFOX ? "●" : "•";

function eligible(el: Element | null): el is HTMLInputElement {
  if (!(el instanceof HTMLInputElement)) return false;
  if (!CARET_TYPES.has(el.type) || el.readOnly || el.disabled) return false;
  if (el.closest("[data-native-caret]") || el.hasAttribute("data-input-otp")) return false;
  const s = getComputedStyle(el);
  return s.direction !== "rtl" && (s.textAlign === "start" || s.textAlign === "left");
}

let canvas: HTMLCanvasElement | null = null;
function textWidth(text: string, input: HTMLInputElement, s: CSSStyleDeclaration): number {
  if (!text) return 0;
  canvas ??= document.createElement("canvas");
  const ctx = canvas.getContext("2d");
  if (!ctx) return 0;
  let size = parseFloat(s.fontSize);
  // Safari draws its password dots larger than the font's own bullet.
  if (input.type === "password" && !IS_FIREFOX && !IS_CHROMIUM) size += 6.25;
  ctx.font = `${s.fontStyle} ${s.fontWeight} ${size}px ${s.fontFamily}`;
  const spacing = parseFloat(s.letterSpacing) || 0;
  return ctx.measureText(text).width + spacing * text.length;
}

export function SmoothCaret() {
  const reduceMotion = useReducedMotion();
  const x = useMotionValue(0);
  const springX = useSpring(x, reduceMotion ? INSTANT : SPRING);
  const y = useMotionValue(0);
  const height = useMotionValue(0);
  const opacity = useMotionValue(0);

  useEffect(() => {
    let input: HTMLInputElement | null = null;
    let savedCaretColor = "";
    let frame = 0;
    let jump = false;
    const resize = typeof ResizeObserver === "undefined"
      ? { observe() {}, disconnect() {} }
      : new ResizeObserver(() => schedule());

    const place = () => {
      frame = 0;
      if (!input) return;
      const s = getComputedStyle(input);
      const r = input.getBoundingClientRect();
      const left = r.left + parseFloat(s.borderLeftWidth) + parseFloat(s.paddingLeft);
      const right = r.right - parseFloat(s.borderRightWidth) - parseFloat(s.paddingRight);
      // An email field reports no selection: the caret is taken to be at the end.
      const len = input.value.length;
      const start = input.selectionStart ?? len;
      const end = input.selectionEnd ?? len;
      const at = start === end || input.selectionDirection !== "backward" ? end : start;
      const before = input.type === "password" ? PASSWORD_CHAR.repeat(at) : input.value.slice(0, at);
      const caretX = left + textWidth(before, input, s) - input.scrollLeft;
      const h = Math.round(parseFloat(s.fontSize) * 1.15);
      const caretY = r.top + r.height / 2 - h / 2;

      // Hidden while text is selected, when the spot is outside the field,
      // or when something covers it (a dialog, a clipped scroll area).
      const inside = caretX >= left - 1 && caretX <= right + 1;
      const hit = document.elementFromPoint(Math.min(caretX, right - 1), r.top + r.height / 2);
      const visible = start === end && inside && !!hit && (hit === input || input.contains(hit));

      x.set(caretX);
      if (jump) { springX.jump(caretX); jump = false; }
      y.set(caretY);
      height.set(h);
      opacity.set(visible ? 1 : 0);
    };
    const schedule = () => { if (!frame) frame = requestAnimationFrame(place); };

    // Where the last pointer press landed: a click into an email field's
    // text puts the caret somewhere it won't report.
    let pressed: EventTarget | null = null;
    const onPointerDown = (e: PointerEvent) => {
      pressed = e.target;
      if (input && e.target === input && input.selectionStart === null) release();
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (input && e.target === input && input.selectionStart === null && MOVE_KEYS.has(e.key)) release();
    };

    const release = () => {
      if (!input) return;
      input.style.caretColor = savedCaretColor;
      input.removeEventListener("input", schedule);
      input.removeEventListener("scroll", schedule);
      resize.disconnect();
      input = null;
      opacity.set(0);
    };

    const onFocusIn = (e: FocusEvent) => {
      const target = e.target as Element | null;
      if (target === input) return;
      release();
      if (!eligible(target)) return;
      if (target.selectionStart === null && target.value && pressed === target) return;
      input = target;
      savedCaretColor = input.style.caretColor;
      input.style.caretColor = "transparent";
      input.addEventListener("input", schedule);
      input.addEventListener("scroll", schedule);
      resize.observe(input);
      jump = true; // appear at the caret, don't fly in from the last field
      schedule();
    };
    const onFocusOut = (e: FocusEvent) => { if (e.target === input) release(); };
    const onSelection = () => { if (input && document.activeElement === input) schedule(); };

    document.addEventListener("pointerdown", onPointerDown, true);
    document.addEventListener("keydown", onKeyDown, true);
    document.addEventListener("focusin", onFocusIn);
    document.addEventListener("focusout", onFocusOut);
    document.addEventListener("selectionchange", onSelection);
    window.addEventListener("scroll", schedule, true);
    window.addEventListener("resize", schedule);
    void document.fonts?.ready.then(schedule);
    if (document.activeElement) onFocusIn({ target: document.activeElement } as unknown as FocusEvent);

    return () => {
      release();
      if (frame) cancelAnimationFrame(frame);
      document.removeEventListener("pointerdown", onPointerDown, true);
      document.removeEventListener("keydown", onKeyDown, true);
      document.removeEventListener("focusin", onFocusIn);
      document.removeEventListener("focusout", onFocusOut);
      document.removeEventListener("selectionchange", onSelection);
      window.removeEventListener("scroll", schedule, true);
      window.removeEventListener("resize", schedule);
    };
  }, [x, springX, y, height, opacity]);

  return (
    <motion.div
      aria-hidden
      className="pointer-events-none fixed left-0 top-0 z-[2147483647] w-0.5 rounded-full bg-primary"
      style={{ x: springX, y, height, opacity }}
    />
  );
}
