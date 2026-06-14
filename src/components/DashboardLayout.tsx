import { SidebarProvider } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/AppSidebar";
import { DashboardTopBar } from "@/components/DashboardTopBar";

/**
 * Standard organizer dashboard chrome — provides the brand top bar plus the
 * primary AppSidebar nav. Each dashboard page renders its content as
 * `children` and the layout takes care of the consistent shell.
 *
 * Per-event surfaces (e.g. `EventDetailPage`) intentionally render their own
 * shell so they can swap in `EventSidebar`, but they reuse `<DashboardTopBar />`
 * directly so the brand bar stays present at the top of every organizer tab.
 */
export function DashboardLayout({ children }: { children: React.ReactNode }) {
  return (
    <SidebarProvider>
      <div className="min-h-screen flex flex-col w-full playful-app-bg">
        <DashboardTopBar />

        <div className="flex flex-1 w-full">
          <AppSidebar />
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
