import { Link } from "react-router-dom";
import type { LucideIcon } from "lucide-react";
import { useAppTabBar } from "@/hooks/useAppChrome";
import { hapticSelection } from "@/lib/native/haptics";

/**
 * A screen's main action as a round button floating over its bottom-right
 * corner, just above the tab bar — only while the tab bar shows. Screens
 * hide their own copy of the action then (`useAppTabBar().visible`).
 */
export function AppFab({ to, label, icon: Icon }: { to: string; label: string; icon: LucideIcon }) {
  const { visible } = useAppTabBar();
  if (!visible) return null;
  return (
    <Link
      to={to}
      onClick={hapticSelection}
      aria-label={label}
      title={label}
      className="app-fab app-chrome fixed z-40 flex h-14 w-14 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-[0_12px_28px_-8px_hsl(var(--primary)/0.6)] transition-transform active:scale-95"
    >
      <Icon className="h-6 w-6" strokeWidth={2.25} />
    </Link>
  );
}
