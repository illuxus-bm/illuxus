import { Monitor, Moon, Sun, type LucideIcon } from "lucide-react";
import { useTheme, type ThemePreference } from "@/contexts/ThemeContext";
import { cn } from "@/lib/utils";

interface ThemeToggleProps {
  className?: string;
  size?: "sm" | "md";
  /**
   * The header's version: a floating chip (`float-chip`, index.css) sized to
   * sit with the other chips. Phones have no room for the three-way switch,
   * so there it is one round button that steps through the choices.
   */
  floating?: boolean;
}

const OPTIONS: Array<{ value: ThemePreference; label: string; icon: LucideIcon }> = [
  { value: "light", label: "Light theme", icon: Sun },
  { value: "system", label: "Match device", icon: Monitor },
  { value: "dark", label: "Dark theme", icon: Moon },
];

// The phone button's order: from following the device to each fixed choice.
const NEXT: Record<ThemePreference, ThemePreference> = { system: "light", light: "dark", dark: "system" };

/**
 * Light / match device / dark — persists via ThemeProvider. "Match device"
 * follows the phone or computer's own setting as it changes, which is the
 * default until the person picks one.
 */
export function ThemeToggle({ className, size = "md", floating = false }: ThemeToggleProps) {
  const { preference, setTheme } = useTheme();
  const dimensions = size === "sm" ? "h-8 p-0.5" : "h-9 p-0.5";
  const iconWrap = size === "sm" ? "h-7 w-7" : "h-8 w-8";

  if (floating) {
    const current = OPTIONS.find((o) => o.value === preference) ?? OPTIONS[1];
    const next = OPTIONS.find((o) => o.value === NEXT[preference])!;
    const label = `Theme: ${current.label}. Switch to ${next.label.toLowerCase()}`;
    return (
      <>
        <button
          type="button"
          className="shell-icon-btn float-chip sm:hidden"
          onClick={() => setTheme(next.value)}
          title={label}
          aria-label={label}
        >
          <current.icon className="h-4 w-4" />
        </button>
        <ThemeToggle size="sm" className={cn("float-chip hidden h-9 p-[3px] sm:inline-flex lg:h-10 lg:p-[5px]", className)} />
      </>
    );
  }

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
      {OPTIONS.map(({ value, label, icon: Icon }) => {
        const checked = preference === value;
        return (
          <button
            key={value}
            type="button"
            role="radio"
            aria-checked={checked}
            aria-label={label}
            title={label}
            onClick={() => setTheme(value)}
            className={cn(
              "inline-flex items-center justify-center rounded-full transition-all duration-200",
              iconWrap,
              checked ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground",
            )}
          >
            <Icon className="h-4 w-4" strokeWidth={2} />
          </button>
        );
      })}
    </div>
  );
}
