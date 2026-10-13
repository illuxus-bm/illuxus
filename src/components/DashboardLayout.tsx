import { DashboardTopBar } from "@/components/DashboardTopBar";

/**
 * Standard dashboard chrome: the shared header with the navigation floating
 * in it as chips, over the page on its white panel. No sidebar.
 *
 * Which navigation shows is route-driven, not role-driven (DashboardTopBar):
 *   • `/dashboard/admin/*`  → the super admin's control tower.
 *   • everything else        → the organiser / team-member view.
 *
 * The admin navigation therefore only ever shows up on admin routes — when a
 * super admin clicks "Organizer dashboard" in the account menu and lands on
 * `/dashboard/events`, they see the regular organiser navigation because
 * they're acting in their organiser capacity at that moment.
 *
 * This keeps the two panels unambiguous even for users who hold both roles.
 * Auth-level gating (the `SuperAdminRoute` wrapper in `App.tsx`) still
 * enforces who can actually reach the admin routes — the layout only decides
 * which chrome to render once the user is there.
 */
export function DashboardLayout({ children }: { children: React.ReactNode }) {
  return (
    // `shell-notch` (index.css): the navigation is in the header, so the
    // panel takes the full width under it.
    <div className="app-shell shell-notch min-h-screen flex flex-col w-full">
      <DashboardTopBar />
      <main className="app-shell-panel flex-1">
        <div className="p-4 lg:p-6">
          {children}
        </div>
      </main>
    </div>
  );
}
