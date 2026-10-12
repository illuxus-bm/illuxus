import { SidebarProvider } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/AppSidebar";
import { AdminSidebar } from "@/components/AdminSidebar";
import { DashboardTopBar } from "@/components/DashboardTopBar";
import { useLocation } from "react-router-dom";
// Shares the landing page canvas (drafting grid, poster headlines).
import "@/components/landing/landing.css";

/**
 * Standard dashboard chrome.
 *
 * Sidebar choice is route-driven, not role-driven:
 *   • `/dashboard/admin/*`  → AdminSidebar (super admin control tower).
 *   • everything else        → AppSidebar (organiser / team-member view).
 *
 * The admin sidebar therefore only ever shows up on admin routes — when a
 * super admin clicks "Organizer dashboard" in the header dropdown and
 * lands on `/dashboard/events`, they see the regular organiser sidebar
 * because they're acting in their organiser capacity at that moment.
 *
 * This keeps the two panels visually distinct and unambiguous even for
 * users who hold both roles. Auth-level gating (the `SuperAdminRoute`
 * wrapper in `App.tsx`) still enforces who can actually reach the admin
 * routes — the layout only decides which chrome to render once the user
 * is there.
 */
export function DashboardLayout({ children }: { children: React.ReactNode }) {
  const { pathname } = useLocation();
  const isAdminRoute = pathname.startsWith("/dashboard/admin");

  return (
    <SidebarProvider>
      <div className="relative min-h-screen flex flex-col w-full playful-app-bg">
        {/* Drafting grid from the landing page, fixed so content glides over it. */}
        <div aria-hidden="true" className="blueprint-grid pointer-events-none fixed inset-0 z-0" />
        <DashboardTopBar />

        <div className="relative flex flex-1 w-full">
          {isAdminRoute ? <AdminSidebar /> : <AppSidebar />}
          <main className="relative z-[1] flex-1 min-w-0 overflow-y-auto">
            <div className="p-4 sm:p-6 lg:p-8">
              {children}
            </div>
          </main>
        </div>
      </div>
    </SidebarProvider>
  );
}
