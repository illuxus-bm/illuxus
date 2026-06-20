import { ReactNode } from "react";
import { Link, useNavigate } from "react-router-dom";
import { ArrowLeft, Users2 } from "lucide-react";
import { ThemeToggle } from "@/components/ThemeToggle";
import { useSiteContent } from "@/hooks/useSiteContent";
import { useTheme } from "@/contexts/ThemeContext";
import { NotificationBell } from "@/components/community/notifications/NotificationBell";
import { SidebarProvider } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/AppSidebar";

/**
 * Standalone shell for the Community area. Renders the dashboard's left
 * AppSidebar so users keep the same global nav (Events, Reports, Portals,
 * Billing, etc.) while inside the community surface, plus a community-
 * specific top bar with the back button, brand mark, and notification bell.
 */
export function CommunityShell({ children }: { children: ReactNode }) {
  const { content } = useSiteContent();
  const { theme: appTheme } = useTheme();
  const navigate = useNavigate();
  const { brandName, logoUrl, logoUrlDark } = content.navbar;
  const activeLogoUrl = appTheme === "dark" ? (logoUrlDark || logoUrl) : logoUrl;

  const handleBack = () => {
    if (window.history.length > 2) {
      navigate(-1);
    } else {
      navigate("/dashboard");
    }
  };

  return (
    <SidebarProvider>
      <div className="min-h-screen bg-background flex flex-col w-full">
        {/* Top bar */}
        <header className="sticky top-0 z-30 border-b border-border bg-card/80 backdrop-blur supports-[backdrop-filter]:bg-card/60">
          <div className="mx-auto max-w-7xl flex items-center gap-3 px-3 sm:px-4 h-12">
            <button
              onClick={handleBack}
              className="inline-flex items-center gap-1 text-[12px] text-muted-foreground hover:text-foreground transition-colors shrink-0"
              aria-label="Go back"
            >
              <ArrowLeft className="h-3.5 w-3.5" />
            </button>
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

        <div className="flex flex-1 w-full min-w-0">
          <AppSidebar />
          <main className="flex-1 min-w-0 overflow-y-auto">
            <div className="mx-auto w-full max-w-7xl px-3 sm:px-4 py-4">
              {children}
            </div>
          </main>
        </div>
      </div>
    </SidebarProvider>
  );
}
