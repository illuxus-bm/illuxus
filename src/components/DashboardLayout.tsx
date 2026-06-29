import { SidebarProvider } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/AppSidebar";
import { AdminSidebar } from "@/components/AdminSidebar";
import { DashboardTopBar } from "@/components/DashboardTopBar";
import { useAuth } from "@/contexts/AuthContext";

/**
 * Standard dashboard chrome.
 *
 * Super admins (isAdmin=true) get the AdminSidebar — a completely separate
 * navigation showing only the platform control surfaces. Organisers and
 * team members get the AppSidebar. The two shells are fully independent so
 * there is no confusion between roles.
 */
export function DashboardLayout({ children }: { children: React.ReactNode }) {
  const { isAdmin } = useAuth();

  return (
    <SidebarProvider>
      <div className="min-h-screen flex flex-col w-full playful-app-bg">
        <DashboardTopBar />

        <div className="flex flex-1 w-full">
          {isAdmin ? <AdminSidebar /> : <AppSidebar />}
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
