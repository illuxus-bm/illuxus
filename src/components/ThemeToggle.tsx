import { Moon, Sun } from "lucide-react";
import { useTheme } from "@/contexts/ThemeContext";
import { cn } from "@/lib/utils";

interface ThemeToggleProps {
  className?: string;
  size?: "sm" | "md";
}

/**
 * Two-state pill toggle (sun / moon) — persists via ThemeProvider.
 * Active option gets a raised "thumb" with shadow; inactive is muted.
 */
export function ThemeToggle({ className, size = "md" }: ThemeToggleProps) {
  const { theme, setTheme } = useTheme();
  const dimensions = size === "sm" ? "h-8 p-0.5" : "h-9 p-0.5";
  const iconWrap = size === "sm" ? "h-7 w-7" : "h-8 w-8";

  return (
    <div
      role="radiogroup"
      aria-label="Theme"
      className={cn(
        "inline-flex items-center rounded-full border border-border bg-secondary/60",
        dimensions,
        className,
      )}
    >
      <button
        type="button"
        role="radio"
        aria-checked={theme === "light"}
        aria-label="Light theme"
        onClick={() => setTheme("light")}
        className={cn(
          "inline-flex items-center justify-center rounded-full transition-all duration-200",
          iconWrap,
          theme === "light"
            ? "bg-background text-foreground shadow-sm"
            : "text-muted-foreground hover:text-foreground",
        )}
      >
        <Sun className="h-4 w-4" strokeWidth={2} />
      </button>
      <button
        type="button"
        role="radio"
        aria-checked={theme === "dark"}
        aria-label="Dark theme"
        onClick={() => setTheme("dark")}
        className={cn(
          "inline-flex items-center justify-center rounded-full transition-all duration-200",
          iconWrap,
          theme === "dark"
            ? "bg-background text-foreground shadow-sm"
            : "text-muted-foreground hover:text-foreground",
        )}
      >
        <Moon className="h-4 w-4" strokeWidth={2} />
      </button>
    </div>
  );
}