import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { ThemeProvider, useTheme } from "../ThemeContext";
import { ThemeToggle } from "@/components/ThemeToggle";

// A controllable prefers-color-scheme.
let systemDark = false;
const listeners = new Set<() => void>();
const setSystem = (dark: boolean) => {
  systemDark = dark;
  listeners.forEach((l) => l());
};

beforeEach(() => {
  systemDark = false;
  listeners.clear();
  const store = new Map<string, string>();
  vi.stubGlobal("localStorage", {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => void store.set(k, String(v)),
    removeItem: (k: string) => void store.delete(k),
    clear: () => store.clear(),
  });
  document.documentElement.classList.remove("dark");
  vi.stubGlobal("matchMedia", (query: string) => ({
    get matches() { return query.includes("dark") ? systemDark : false; },
    media: query,
    addEventListener: (_: string, l: () => void) => listeners.add(l),
    removeEventListener: (_: string, l: () => void) => listeners.delete(l),
  }));
});
afterEach(() => vi.unstubAllGlobals());

function Probe() {
  const { theme, preference } = useTheme();
  return <p>{`${preference}:${theme}`}</p>;
}

const renderTheme = (ui = <Probe />) => render(<ThemeProvider>{ui}</ThemeProvider>);

describe("ThemeProvider", () => {
  it("follows the device by default, and keeps following it", () => {
    renderTheme();
    expect(screen.getByText("system:light")).toBeInTheDocument();
    act(() => setSystem(true));
    expect(screen.getByText("system:dark")).toBeInTheDocument();
    expect(document.documentElement).toHaveClass("dark");
    // Following the device stores nothing, so it survives the next launch.
    expect(window.localStorage.getItem("app-theme")).toBeNull();
  });

  it("keeps an explicit choice whatever the device does", () => {
    window.localStorage.setItem("app-theme", "light");
    renderTheme();
    act(() => setSystem(true));
    expect(screen.getByText("light:light")).toBeInTheDocument();
    expect(document.documentElement).not.toHaveClass("dark");
  });
});

describe("ThemeToggle", () => {
  it("offers light, device and dark, and returning to device clears the choice", () => {
    renderTheme(<><ThemeToggle /><Probe /></>);
    expect(screen.getByRole("radio", { name: "Match device" })).toHaveAttribute("aria-checked", "true");

    fireEvent.click(screen.getByRole("radio", { name: "Dark theme" }));
    expect(screen.getByText("dark:dark")).toBeInTheDocument();
    expect(window.localStorage.getItem("app-theme")).toBe("dark");

    fireEvent.click(screen.getByRole("radio", { name: "Match device" }));
    expect(screen.getByText("system:light")).toBeInTheDocument();
    expect(window.localStorage.getItem("app-theme")).toBeNull();
  });

  it("steps device → light → dark → device on the phone button", () => {
    renderTheme(<><ThemeToggle floating /><Probe /></>);
    const button = () => screen.getByRole("button", { name: /^Theme:/ });
    fireEvent.click(button());
    expect(screen.getByText("light:light")).toBeInTheDocument();
    fireEvent.click(button());
    expect(screen.getByText("dark:dark")).toBeInTheDocument();
    fireEvent.click(button());
    expect(screen.getByText("system:light")).toBeInTheDocument();
  });
});
