import { ReactNode } from "react";
import { Link } from "react-router-dom";
import { ArrowLeft, Users2 } from "lucide-react";
import { ThemeToggle } from "@/components/ThemeToggle";
import { useSiteContent } from "@/hooks/useSiteContent";
import { useTheme } from "@/contexts/ThemeContext";
import { NotificationBell } from "@/components/community/notifications/NotificationBell";

/**
 * Standalone shell for the Community area. Intentionally separate from
 * DashboardLayout so /community/* feels like its own product surface
 * rather than a tab inside the org dashboard.
 */
export function CommunityShell({ children }: { children: ReactNode }) {
  const { content } = useSiteContent();
  const { theme: appTheme } = useTheme();
  const { brandName, logoUrl, logoUrlDark } = content.navbar;
  const activeLogoUrl = appTheme === "dark" ? (logoUrlDark || logoUrl) : logoUrl;

  return (
    <div className="min-h-screen bg-background flex flex-col">
      {/* Top bar */}
      <header className="sticky top-0 z-30 border-b border-border bg-card/80 backdrop-blur supports-[backdrop-filter]:bg-card/60">
        <div className="mx-auto max-w-7xl flex items-center gap-3 px-3 sm:px-4 h-12">
          <Link
            to="/dashboard"
            className="inline-flex items-center gap-1 text-[12px] text-muted-foreground hover:text-foreground transition-colors shrink-0"
            aria-label="Back to dashboard"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">Dashboard</span>
          </Link>
          <span className="h-4 w-px bg-border" aria-hidden />
          <Link to="/community" className="inline-flex items-center gap-2 min-w-0">
            {activeLogoUrl ? (
              <img src={activeLogoUrl} alt={brandName} className="h-5 w-auto max-w-[120px] object-contain" />
            ) : (
              <span className="text-sm font-semibold tracking-tight truncate">{brandName}</span>
            )}
            <span className="inline-flex items-center gap-1 text-[11px] font-medium text-muted-foreground border border-border rounded-full px-2 py-0.5">
              <Users2 className="h-3 w-3" />
              Community
            </span>
          </Link>
          <div className="ml-auto flex items-center gap-1">
            <NotificationBell />
            <ThemeToggle size="sm" />
          </div>
        </div>
      </header>

      <main className="flex-1 mx-auto w-full max-w-7xl px-3 sm:px-4 py-4">
        {children}
      </main>
    </div>
  );
}
