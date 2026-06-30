import { SidebarProvider } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/AppSidebar";
import { AdminSidebar } from "@/components/AdminSidebar";
import { DashboardTopBar } from "@/components/DashboardTopBar";
import { useLocation } from "react-router-dom";

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
      <div className="min-h-screen flex flex-col w-full playful-app-bg">
        <DashboardTopBar />

        <div className="flex flex-1 w-full">
          {isAdminRoute ? <AdminSidebar /> : <AppSidebar />}
          <main className="flex-1 min-w-0 overflow-y-auto">
            <div className="p-4 lg:p-6">
              {children}
            </div>
          </main>
        </div>
      </div>
    </SidebarProvider>
  );
}
