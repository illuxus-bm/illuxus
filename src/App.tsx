import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Suspense, lazy } from "react";
import { BrowserRouter, Route, Routes, Navigate, useParams, useLocation } from "react-router-dom";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AuthProvider, useAuth } from "@/contexts/AuthContext";
import { OrgProvider, useOrg } from "@/contexts/OrgContext";
import { SiteContentProvider } from "@/hooks/useSiteContent";
import { ThemeProvider } from "@/contexts/ThemeContext";
import SiteHead from "@/components/SiteHead";
import Footer from "@/components/Footer";
import { FullPageLoader } from "@/components/FullPageLoader";
import { LazyRouteBoundary } from "@/components/LazyRouteBoundary";
// Eagerly-loaded landing & auth pages (small + needed for first paint / SEO)
import Index from "./pages/Index.tsx";
import NotFound from "./pages/NotFound.tsx";
import LoginPage from "./pages/LoginPage.tsx";

/**
 * Wraps a lazy() loader with console diagnostics so we can see in preview
 * logs which chunk failed when a dynamic import errors out.
 */
function lazyWithLog<T extends { default: React.ComponentType<any> }>(
  name: string,
  loader: () => Promise<T>,
) {
  return lazy(() => {
    // eslint-disable-next-line no-console
    console.info(`[LazyRoute] loading ${name}`);
    return loader().catch((err) => {
      // eslint-disable-next-line no-console
      console.error(`[LazyRoute] failed to load ${name}`, {
        name: err?.name,
        message: err?.message,
      });
      throw err;
    });
  });
}
// Everything else is code-split so the initial bundle stays light and route
// transitions show the global loading screen instead of a frozen UI.
const ResetPasswordPage = lazyWithLog("ResetPasswordPage", () => import("./pages/ResetPasswordPage.tsx"));
const OnboardingPage = lazyWithLog("OnboardingPage", () => import("./pages/OnboardingPage.tsx"));
const Dashboard = lazyWithLog("Dashboard", () => import("./pages/Dashboard.tsx"));
const EventsPage = lazyWithLog("EventsPage", () => import("./pages/dashboard/EventsPage.tsx"));
const AttendeesPage = lazyWithLog("AttendeesPage", () => import("./pages/dashboard/AttendeesPage.tsx"));
const TicketsPage = lazyWithLog("TicketsPage", () => import("./pages/dashboard/TicketsPage.tsx"));
const AnalyticsPage = lazyWithLog("AnalyticsPage", () => import("./pages/dashboard/AnalyticsPage.tsx"));
const SettingsPage = lazyWithLog("SettingsPage", () => import("./pages/dashboard/SettingsPage.tsx"));
const MarketingPage = lazyWithLog("MarketingPage", () => import("./pages/dashboard/MarketingPage.tsx"));
const ReportsPage = lazyWithLog("ReportsPage", () => import("./pages/dashboard/ReportsPage.tsx"));
const HelpPage = lazyWithLog("HelpPage", () => import("./pages/dashboard/HelpPage.tsx"));
const EventDetailPage = lazyWithLog("EventDetailPage", () => import("./pages/dashboard/EventDetailPage.tsx"));
const PricingPage = lazyWithLog("PricingPage", () => import("./pages/PricingPage.tsx"));
const PublicEventPage = lazyWithLog("PublicEventPage", () => import("./pages/PublicEventPage.tsx"));
const AdminPanelPage = lazyWithLog("AdminPanelPage", () => import("./pages/dashboard/AdminPanelPage.tsx"));
const SiteEditorPage = lazyWithLog("SiteEditorPage", () => import("./pages/dashboard/admin/SiteEditorPage.tsx"));
const AuditLogPage = lazyWithLog("AuditLogPage", () => import("./pages/dashboard/admin/AuditLogPage.tsx"));
const PublicOrgPage = lazyWithLog("PublicOrgPage", () => import("./pages/PublicOrgPage.tsx"));
const LandingBuilderPage = lazyWithLog("LandingBuilderPage", () => import("./pages/dashboard/LandingBuilderPage.tsx"));
const DomainsPage = lazyWithLog("DomainsPage", () => import("./pages/dashboard/DomainsPage.tsx"));
const DiscoverFeed = lazyWithLog("DiscoverFeed", () => import("./pages/DiscoverFeed.tsx"));
const ProfilePage = lazyWithLog("ProfilePage", () => import("./pages/u/ProfilePage.tsx"));
const MyEventsPage = lazyWithLog("MyEventsPage", () => import("./pages/u/MyEventsPage.tsx"));
const MyApplicationsPage = lazyWithLog("MyApplicationsPage", () => import("./pages/u/MyApplicationsPage.tsx"));
const TicketDetailPage = lazyWithLog("TicketDetailPage", () => import("./pages/t/TicketDetailPage.tsx"));
const EventQuickCreatePage = lazyWithLog("EventQuickCreatePage", () => import("./pages/dashboard/EventQuickCreatePage.tsx"));
const GuestListPage = lazyWithLog("GuestListPage", () => import("./pages/dashboard/event/GuestListPage.tsx"));
const BroadcastPage = lazyWithLog("BroadcastPage", () => import("./pages/dashboard/event/BroadcastPage.tsx"));
const EventLivePage = lazyWithLog("EventLivePage", () => import("./pages/EventLivePage.tsx"));
const EventsListingPage = lazyWithLog("EventsListingPage", () => import("./pages/EventsListingPage.tsx"));
const CompleteProfilePage = lazyWithLog("CompleteProfilePage", () => import("./pages/CompleteProfilePage.tsx"));
const SelfCheckInPage = lazyWithLog("SelfCheckInPage", () => import("./pages/SelfCheckInPage.tsx"));
const SponsorEventsPage = lazyWithLog("SponsorEventsPage", () => import("./pages/sponsor/SponsorEventsPage.tsx"));
const SponsorEventDetailPage = lazyWithLog("SponsorEventDetailPage", () => import("./pages/sponsor/SponsorEventDetailPage.tsx"));
const SponsorAcceptInvitePage = lazyWithLog("SponsorAcceptInvitePage", () => import("./pages/sponsor/AcceptInvitePage.tsx"));
const SpeakerEventsPage = lazyWithLog("SpeakerEventsPage", () => import("./pages/speaker/SpeakerEventsPage.tsx"));
const SpeakerEventDetailPage = lazyWithLog("SpeakerEventDetailPage", () => import("./pages/speaker/SpeakerEventDetailPage.tsx"));
const QuickViewsPreviewPage = lazyWithLog("QuickViewsPreviewPage", () => import("./pages/dev/QuickViewsPreviewPage.tsx"));
const queryClient = new QueryClient();

/**
 * Block access to authenticated routes until the user has completed
 * the mandatory profile (title, name, company, mobile, city, etc.).
 */
/**
 * Forces every signed-in user — attendee, organizer, or admin — through the
 * "Complete your profile" screen before they can reach app routes. Admins are
 * exempt so support staff can always log in. The gate intentionally renders a
 * loader while the profile flag is still resolving so the dashboard never
 * flashes for an incomplete profile.
 */
const ProfileGate = ({ children }: { children: React.ReactNode }) => {
  const { profileCompleted, isAdmin, loading } = useAuth();
  const { org, loading: orgLoading } = useOrg();
  if (loading || orgLoading) return <FullPageLoader />;
  if (profileCompleted === null) return <FullPageLoader />;
  // If the user has an org, they've already been using the platform — skip profile gate.
  // This prevents blocking returning organizers whose profile_completed flag is stale.
  if (!profileCompleted && !isAdmin && !org) return <Navigate to="/complete-profile" replace />;
  return <>{children}</>;
};

const ProtectedRoute = ({ children }: { children: React.ReactNode }) => {
  const { user, loading } = useAuth();
  if (loading) return <FullPageLoader />;
  if (!user) return <Navigate to="/login" replace />;
  return <AuthOrgGate><ProfileGate>{children}</ProfileGate></AuthOrgGate>;
};

// Attendees can't access organizer dashboard pages — redirect them to their tickets.
const OrganizerRoute = ({ children }: { children: React.ReactNode }) => {
  const { user, loading, accountType, isAdmin } = useAuth();
  if (loading) return <FullPageLoader />;
  if (!user) return <Navigate to="/login" replace />;
  if (accountType === "attendee" && !isAdmin) return <Navigate to="/my/tickets" replace />;
  return <AuthOrgGate><ProfileGate>{children}</ProfileGate></AuthOrgGate>;
};

// Route for attendee-only pages (just requires auth).
const AttendeeRoute = ({ children }: { children: React.ReactNode }) => {
  const { user, loading } = useAuth();
  if (loading) return <FullPageLoader />;
  if (!user) return <Navigate to="/login" replace />;
  return <ProfileGate>{children}</ProfileGate>;
};

// Gate routes that require platform-level (super) admin role.
const SuperAdminRoute = ({ children }: { children: React.ReactNode }) => {
  const { user, loading, isAdmin } = useAuth();
  if (loading) return <FullPageLoader />;
  if (!user) return <Navigate to="/login" replace />;
  if (!isAdmin) return <Navigate to="/dashboard" replace />;
  return <ProfileGate>{children}</ProfileGate>;
};

// Wait for org context to finish loading before rendering any authenticated route.
// This prevents the onboarding page from briefly flashing during the login -> dashboard
// redirect for users who already have an organization.
const AuthOrgGate = ({ children }: { children: React.ReactNode }) => {
  const { loading } = useOrg();
  if (loading) return <FullPageLoader />;
  return <>{children}</>;
};

const OnboardingGuard = ({ children }: { children: React.ReactNode }) => {
  const { loading, onboardingCompleted, org } = useOrg();
  const { accountType, isAdmin } = useAuth();
  if (loading) return <FullPageLoader />;
  // Attendees never go through organizer onboarding — push them to their tickets page.
  if (accountType === "attendee" && !isAdmin) return <Navigate to="/my/tickets" replace />;
  // If the user has an org, they've completed onboarding regardless of the profile flag.
  // The profile flag can get out of sync if it wasn't set during legacy onboarding.
  if (!org && !onboardingCompleted) return <Navigate to="/onboarding" replace />;
  return <>{children}</>;
};

const App = () => (
  <QueryClientProvider client={queryClient}>
    <ThemeProvider>
      <TooltipProvider>
        <Toaster />
        <Sonner />
        <BrowserRouter>
          <AuthProvider>
            <OrgProvider>
              <SiteContentProvider>
              <SiteHead />
              <LazyRouteBoundary>
              <Suspense fallback={<FullPageLoader />}>
              <Routes>
              <Route path="/" element={<HomeRoute />} />
              <Route path="/discover" element={<DiscoverFeed />} />
              {/* Lu.ma-style public events browser. */}
              <Route path="/events" element={<EventsListingPage />} />
              {/* Canonical org + event public URLs (Lu.ma-style with /org prefix). */}
              <Route path="/org/:slug" element={<PublicOrgPage />} />
              <Route path="/org/:orgSlug/events/:eventSlug" element={<PublicEventPage />} />
              {/* Standalone event lookup by id/slug (no org context). */}
              <Route path="/events/:id" element={<PublicEventPage />} />
              {/* Legacy redirects — keep old links working forever. */}
              <Route path="/o/:slug" element={<LegacyOrgRedirect />} />
              <Route path="/o/:orgSlug/:eventSlug" element={<LegacyEventRedirect />} />
              <Route path="/login" element={<LoginPage />} />
              <Route path="/reset-password" element={<ResetPasswordPage />} />
              <Route
                path="/complete-profile"
                element={
                  <RequireAuthOnly>
                    <CompleteProfilePage />
                  </RequireAuthOnly>
                }
              />
              <Route path="/onboarding" element={<OrganizerRoute><OnboardingPage /></OrganizerRoute>} />
              <Route path="/my/tickets" element={<Navigate to="/u/me/events" replace />} />
              <Route path="/u/me" element={<AttendeeRoute><ProfilePage /></AttendeeRoute>} />
              <Route path="/u/me/events" element={<AttendeeRoute><MyEventsPage /></AttendeeRoute>} />
              <Route path="/u/me/applications" element={<AttendeeRoute><MyApplicationsPage /></AttendeeRoute>} />
              <Route path="/u/me/settings" element={<AttendeeRoute><SettingsPage /></AttendeeRoute>} />
              <Route path="/t/:id" element={<AttendeeRoute><TicketDetailPage /></AttendeeRoute>} />
              <Route path="/dashboard" element={<Navigate to="/dashboard/events" replace />} />
              <Route path="/dashboard/events" element={<ProtectedRoute><OnboardingGuard><EventsPage /></OnboardingGuard></ProtectedRoute>} />
              <Route path="/dashboard/events/new" element={<ProtectedRoute><OnboardingGuard><EventQuickCreatePage /></OnboardingGuard></ProtectedRoute>} />
              <Route path="/dashboard/events/:id/guests" element={<ProtectedRoute><OnboardingGuard><GuestListPage /></OnboardingGuard></ProtectedRoute>} />
              <Route path="/dashboard/events/:id/broadcast" element={<ProtectedRoute><OnboardingGuard><BroadcastPage /></OnboardingGuard></ProtectedRoute>} />
              <Route path="/e/:id/live" element={<EventLivePage />} />
              <Route path="/checkin/:eventId" element={<SelfCheckInPage />} />
              <Route path="/sponsor" element={<SponsorEventsPage />} />
              <Route path="/sponsor/events/:eventId" element={<SponsorEventDetailPage />} />
              <Route path="/sponsor/accept" element={<SponsorAcceptInvitePage />} />
              <Route path="/speaker" element={<SpeakerEventsPage />} />
              <Route path="/speaker/events/:eventId" element={<SpeakerEventDetailPage />} />
              {import.meta.env.DEV && (
                <Route path="/__preview/quick-views" element={<QuickViewsPreviewPage />} />
              )}
              <Route path="/dashboard/events/:id" element={<ProtectedRoute><OnboardingGuard><EventDetailPage /></OnboardingGuard></ProtectedRoute>} />
              <Route path="/dashboard/attendees" element={<ProtectedRoute><OnboardingGuard><AttendeesPage /></OnboardingGuard></ProtectedRoute>} />
              <Route path="/dashboard/tickets" element={<ProtectedRoute><OnboardingGuard><TicketsPage /></OnboardingGuard></ProtectedRoute>} />
              <Route path="/dashboard/analytics" element={<ProtectedRoute><OnboardingGuard><AnalyticsPage /></OnboardingGuard></ProtectedRoute>} />
              <Route path="/dashboard/settings" element={<ProtectedRoute><OnboardingGuard><SettingsPage /></OnboardingGuard></ProtectedRoute>} />
              <Route path="/dashboard/marketing" element={<ProtectedRoute><OnboardingGuard><MarketingPage /></OnboardingGuard></ProtectedRoute>} />
              <Route path="/dashboard/landing-builder" element={<ProtectedRoute><OnboardingGuard><LandingBuilderPage /></OnboardingGuard></ProtectedRoute>} />
              <Route path="/dashboard/domains" element={<ProtectedRoute><OnboardingGuard><DomainsPage /></OnboardingGuard></ProtectedRoute>} />
              <Route path="/dashboard/reports" element={<ProtectedRoute><OnboardingGuard><ReportsPage /></OnboardingGuard></ProtectedRoute>} />
              <Route path="/dashboard/help" element={<ProtectedRoute><OnboardingGuard><HelpPage /></OnboardingGuard></ProtectedRoute>} />
              <Route path="/dashboard/billing" element={<ProtectedRoute><OnboardingGuard><PricingPage /></OnboardingGuard></ProtectedRoute>} />
              <Route path="/dashboard/admin" element={<SuperAdminRoute><AdminPanelPage /></SuperAdminRoute>} />
              <Route path="/dashboard/admin/site" element={<SuperAdminRoute><SiteEditorPage /></SuperAdminRoute>} />
              <Route path="/dashboard/admin/audit" element={<SuperAdminRoute><AuditLogPage /></SuperAdminRoute>} />
              <Route path="*" element={<NotFound />} />
              </Routes>
              </Suspense>
              </LazyRouteBoundary>
              <GlobalFooter />
              </SiteContentProvider>
            </OrgProvider>
          </AuthProvider>
        </BrowserRouter>
      </TooltipProvider>
    </ThemeProvider>
  </QueryClientProvider>
);

export default App;

/**
 * Global site footer rendered on public-facing pages.
 * Hidden on app/dashboard, auth, onboarding, live event, check-in and sponsor routes
 * where a marketing footer would feel out of place.
 */
function GlobalFooter() {
  const { pathname } = useLocation();
  const hiddenPrefixes = [
    "/dashboard",
    "/onboarding",
    "/login",
    "/reset-password",
    "/complete-profile",
    "/sponsor",
    "/speaker",
    "/checkin",
    "/e/", // live event
    "/__preview",
  ];
  // EventsListingPage and Index already render their own <Footer />.
  const ownsFooter = ["/", "/events"].includes(pathname);
  if (ownsFooter) return null;
  if (hiddenPrefixes.some((p) => pathname === p || pathname.startsWith(p + "/") || pathname.startsWith(p))) {
    return null;
  }
  return <Footer />;
}

/**
 * Lightweight auth gate that does NOT enforce profile completion —
 * used for the profile-completion page itself (otherwise it would
 * redirect to itself in a loop).
 */
function RequireAuthOnly({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  if (loading) return <FullPageLoader />;
  if (!user) return <Navigate to="/login" replace />;
  return <>{children}</>;
}

/**
 * Public landing for signed-out visitors and platform admins.
 * Signed-in attendees and organizers see the Lu.ma-style discovery feed instead.
 */
function HomeRoute() {
  const { user, loading, isAdmin } = useAuth();
  if (loading) return <Index />;
  if (!user || isAdmin) return <Index />;
  return <DiscoverFeed />;
}

/**
 * Permanent redirect from the legacy `/o/<slug>` org URL to `/org/<slug>`.
 * Keeps shared links and bookmarks working after the URL scheme changed.
 */
function LegacyOrgRedirect() {
  const { slug } = useParams<{ slug: string }>();
  return <Navigate to={`/org/${slug || ""}`} replace />;
}

/** Permanent redirect from `/o/<orgSlug>/<eventSlug>` to `/org/<orgSlug>/events/<eventSlug>`. */
function LegacyEventRedirect() {
  const { orgSlug, eventSlug } = useParams<{ orgSlug: string; eventSlug: string }>();
  return <Navigate to={`/org/${orgSlug || ""}/events/${eventSlug || ""}`} replace />;
}
