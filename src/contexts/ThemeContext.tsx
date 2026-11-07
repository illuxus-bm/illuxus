import { createContext, useCallback, useContext, useEffect, useState, ReactNode } from "react";

/** What the page shows. */
type Theme = "light" | "dark";
/** What the person chose: a theme, or whatever the device is set to. */
export type ThemePreference = Theme | "system";

interface ThemeContextValue {
  /** The theme in effect, after resolving "system". */
  theme: Theme;
  /** The person's choice. "system" until they pick light or dark. */
  preference: ThemePreference;
  /** light → dark → light, as an explicit choice. */
  toggle: () => void;
  setTheme: (t: ThemePreference) => void;
}

const ThemeContext = createContext<ThemeContextValue | undefined>(undefined);
// Only an explicit "light" or "dark" is stored. No entry means "system",
// which index.html's inline script resolves the same way before React loads.
const STORAGE_KEY = "app-theme";
const DARK_QUERY = "(prefers-color-scheme: dark)";

function applyTheme(theme: Theme) {
  const root = document.documentElement;
  root.classList.toggle("dark", theme === "dark");
  root.style.colorScheme = theme;
}

function systemTheme(): Theme {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") return "light";
  return window.matchMedia(DARK_QUERY).matches ? "dark" : "light";
}

function readPreference(): ThemePreference {
  if (typeof window === "undefined") return "system";
  try {
    const stored = window.localStorage.getItem(STORAGE_KEY);
    return stored === "light" || stored === "dark" ? stored : "system";
  } catch {
    return "system";
  }
}

function writePreference(p: ThemePreference) {
  try {
    if (p === "system") window.localStorage.removeItem(STORAGE_KEY);
    else window.localStorage.setItem(STORAGE_KEY, p);
  } catch {
    /* private mode / storage blocked: the choice lasts for this visit */
  }
}

const resolve = (p: ThemePreference): Theme => (p === "system" ? systemTheme() : p);

// Apply theme immediately at module evaluation time — before the first React
// render — so the dashboard and landing page never flash the wrong theme.
if (typeof window !== "undefined") {
  applyTheme(resolve(readPreference()));
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [preference, setPreference] = useState<ThemePreference>(readPreference);
  const [system, setSystem] = useState<Theme>(systemTheme);
  const theme: Theme = preference === "system" ? system : preference;

  // Follow the device as it changes (scheduled dark mode, Control Centre,
  // Quick Settings), like a native app does.
  useEffect(() => {
    if (typeof window.matchMedia !== "function") return;
    const mq = window.matchMedia(DARK_QUERY);
    const onChange = () => setSystem(mq.matches ? "dark" : "light");
    onChange();
    mq.addEventListener?.("change", onChange);
    return () => mq.removeEventListener?.("change", onChange);
  }, []);

  useEffect(() => {
    applyTheme(theme);
  }, [theme]);

  const setTheme = useCallback((p: ThemePreference) => {
    // Apply synchronously so the page changes in the same frame as the tap.
    applyTheme(resolve(p));
    writePreference(p);
    setPreference(p);
  }, []);

  const toggle = useCallback(() => setTheme(theme === "dark" ? "light" : "dark"), [setTheme, theme]);

  return (
    <ThemeContext.Provider value={{ theme, preference, toggle, setTheme }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme(): ThemeContextValue {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error("useTheme must be used within ThemeProvider");
  return ctx;
}
