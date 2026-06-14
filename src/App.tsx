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
import RootErrorBoundary from "@/lib/observability/boundaries/RootErrorBoundary";
import RouteErrorBoundary from "@/lib/observability/boundaries/RouteErrorBoundary";
import { logger } from "@/lib/observability";
// Eagerly-loaded landing & auth pages (small + needed for first paint / SEO)
import Index from "./pages/Index.tsx";
import NotFound from "./pages/NotFound.tsx";
import LoginPage from "./pages/LoginPage.tsx";

/**
 * Wraps a lazy() loader with structured logger diagnostics so we can see in
 * preview logs which chunk failed when a dynamic import errors out.
 */
function lazyWithLog<T extends { default: React.ComponentType<any> }>(
  name: string,
  loader: () => Promise<T>,
) {
  return lazy(() => {
    logger.debug('lazy-route loading', { name });
    return loader().catch((err) => {
      logger.error('lazy-route load failed', {
        name,
        error_name: err?.name,
        error_message: err?.message,
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
const TicketsPage = lazyWithLog("TicketsPage", () => import("./pages/dashboard/TicketsPage.tsx"));
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
const CommunityHubPage = lazyWithLog("CommunityHubPage", () => import("./pages/dashboard/community/CommunityHubPage.tsx"));
const CommunityHomePage = lazyWithLog("CommunityHomePage", () => import("./pages/dashboard/community/CommunityHomePage.tsx"));
const CommunityFeedPage = lazyWithLog("CommunityFeedPage", () => import("./pages/dashboard/community/CommunityFeedPage.tsx"));
const CommunityMembersPage = lazyWithLog("CommunityMembersPage", () => import("./pages/dashboard/community/CommunityMembersPage.tsx"));
const CommunityAnnouncementsPage = lazyWithLog("CommunityAnnouncementsPage", () => import("./pages/dashboard/community/CommunityAnnouncementsPage.tsx"));
const CommunityCalendarPage = lazyWithLog("CommunityCalendarPage", () => import("./pages/dashboard/community/CommunityCalendarPage.tsx"));
const CommunityResourcesPage = lazyWithLog("CommunityResourcesPage", () => import("./pages/dashboard/community/CommunityResourcesPage.tsx"));
const CommunityChatPage = lazyWithLog("CommunityChatPage", () => import("./pages/dashboard/community/CommunityChatPage.tsx"));
const CommunityLeaderboardPage = lazyWithLog("CommunityLeaderboardPage", () => import("./pages/dashboard/community/CommunityLeaderboardPage.tsx"));
const CommunityModerationPage = lazyWithLog("CommunityModerationPage", () => import("./pages/dashboard/community/CommunityModerationPage.tsx"));
const CommunitySettingsPage = lazyWithLog("CommunitySettingsPage", () => import("./pages/dashboard/community/CommunitySettingsPage.tsx"));
const PublicOrgPage = lazyWithLog("PublicOrgPage", () => import("./pages/PublicOrgPage.tsx"));
const LandingBuilderPage = lazyWithLog("LandingBuilderPage", () => import("./pages/dashboard/LandingBuilderPage.tsx"));
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
const SelfCheckOutPage = lazyWithLog("SelfCheckOutPage", () => import("./pages/SelfCheckOutPage.tsx"));
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
          <RootErrorBoundary>
            <AuthProvider>
              <OrgProvider>
                <SiteContentProvider>
                <SiteHead />
                <LazyRouteBoundary>
                <Suspense fallback={<FullPageLoader />}>
                <Routes>
                <Route path="/" element={<RouteErrorBoundary><HomeRoute /></RouteErrorBoundary>} />
                <Route path="/discover" element={<RouteErrorBoundary><DiscoverFeed /></RouteErrorBoundary>} />
                {/* Lu.ma-style public events browser. */}
                <Route path="/events" element={<RouteErrorBoundary><EventsListingPage /></RouteErrorBoundary>} />
                {/* Canonical org + event public URLs (Lu.ma-style with /org prefix). */}
                <Route path="/org/:slug" element={<RouteErrorBoundary><PublicOrgPage /></RouteErrorBoundary>} />
                <Route path="/org/:orgSlug/events/:eventSlug" element={<RouteErrorBoundary><PublicEventPage /></RouteErrorBoundary>} />
                {/* Standalone event lookup by id/slug (no org context). */}
                <Route path="/events/:id" element={<RouteErrorBoundary><PublicEventPage /></RouteErrorBoundary>} />
                {/* Legacy redirects — keep old links working forever. */}
                <Route path="/o/:slug" element={<RouteErrorBoundary><LegacyOrgRedirect /></RouteErrorBoundary>} />
                <Route path="/o/:orgSlug/:eventSlug" element={<RouteErrorBoundary><LegacyEventRedirect /></RouteErrorBoundary>} />
                <Route path="/login" element={<RouteErrorBoundary><LoginPage /></RouteErrorBoundary>} />
                <Route path="/reset-password" element={<RouteErrorBoundary><ResetPasswordPage /></RouteErrorBoundary>} />
                <Route
                  path="/complete-profile"
                  element={
                    <RouteErrorBoundary>
                      <RequireAuthOnly>
                        <CompleteProfilePage />
                      </RequireAuthOnly>
                    </RouteErrorBoundary>
                  }
                />
                <Route path="/onboarding" element={<RouteErrorBoundary><OrganizerRoute><OnboardingPage /></OrganizerRoute></RouteErrorBoundary>} />
                <Route path="/my/tickets" element={<RouteErrorBoundary><Navigate to="/u/me/events" replace /></RouteErrorBoundary>} />
                <Route path="/u/me" element={<RouteErrorBoundary><AttendeeRoute><ProfilePage /></AttendeeRoute></RouteErrorBoundary>} />
                <Route path="/u/me/events" element={<RouteErrorBoundary><AttendeeRoute><MyEventsPage /></AttendeeRoute></RouteErrorBoundary>} />
                <Route path="/u/me/applications" element={<RouteErrorBoundary><AttendeeRoute><MyApplicationsPage /></AttendeeRoute></RouteErrorBoundary>} />
                <Route path="/u/me/settings" element={<RouteErrorBoundary><AttendeeRoute><SettingsPage /></AttendeeRoute></RouteErrorBoundary>} />
                <Route path="/t/:id" element={<RouteErrorBoundary><AttendeeRoute><TicketDetailPage /></AttendeeRoute></RouteErrorBoundary>} />
                <Route path="/dashboard" element={<RouteErrorBoundary><Navigate to="/dashboard/events" replace /></RouteErrorBoundary>} />
                <Route path="/dashboard/events" element={<RouteErrorBoundary><ProtectedRoute><OnboardingGuard><EventsPage /></OnboardingGuard></ProtectedRoute></RouteErrorBoundary>} />
                <Route path="/dashboard/events/new" element={<RouteErrorBoundary><ProtectedRoute><OnboardingGuard><EventQuickCreatePage /></OnboardingGuard></ProtectedRoute></RouteErrorBoundary>} />
                <Route path="/dashboard/events/:id/guests" element={<RouteErrorBoundary><ProtectedRoute><OnboardingGuard><GuestListPage /></OnboardingGuard></ProtectedRoute></RouteErrorBoundary>} />
                <Route path="/dashboard/events/:id/broadcast" element={<RouteErrorBoundary><ProtectedRoute><OnboardingGuard><BroadcastPage /></OnboardingGuard></ProtectedRoute></RouteErrorBoundary>} />
                <Route path="/e/:id/live" element={<RouteErrorBoundary><EventLivePage /></RouteErrorBoundary>} />
                <Route path="/checkin/:eventId" element={<RouteErrorBoundary><SelfCheckInPage /></RouteErrorBoundary>} />
                <Route path="/checkout/:eventId" element={<RouteErrorBoundary><SelfCheckOutPage /></RouteErrorBoundary>} />
                <Route path="/sponsor" element={<RouteErrorBoundary><SponsorEventsPage /></RouteErrorBoundary>} />
                <Route path="/sponsor/events/:eventId" element={<RouteErrorBoundary><SponsorEventDetailPage /></RouteErrorBoundary>} />
                <Route path="/sponsor/accept" element={<RouteErrorBoundary><SponsorAcceptInvitePage /></RouteErrorBoundary>} />
                <Route path="/speaker" element={<RouteErrorBoundary><SpeakerEventsPage /></RouteErrorBoundary>} />
                <Route path="/speaker/events/:eventId" element={<RouteErrorBoundary><SpeakerEventDetailPage /></RouteErrorBoundary>} />
                {import.meta.env.DEV && (
                  <Route path="/__preview/quick-views" element={<RouteErrorBoundary><QuickViewsPreviewPage /></RouteErrorBoundary>} />
                )}
                <Route path="/dashboard/events/:id" element={<RouteErrorBoundary><ProtectedRoute><OnboardingGuard><EventDetailPage /></OnboardingGuard></ProtectedRoute></RouteErrorBoundary>} />
                <Route path="/dashboard/tickets" element={<RouteErrorBoundary><ProtectedRoute><OnboardingGuard><TicketsPage /></OnboardingGuard></ProtectedRoute></RouteErrorBoundary>} />
                <Route path="/dashboard/analytics" element={<RouteErrorBoundary><Navigate to="/dashboard/reports" replace /></RouteErrorBoundary>} />
                <Route path="/dashboard/settings" element={<RouteErrorBoundary><ProtectedRoute><OnboardingGuard><SettingsPage /></OnboardingGuard></ProtectedRoute></RouteErrorBoundary>} />
                <Route path="/dashboard/marketing" element={<RouteErrorBoundary><ProtectedRoute><OnboardingGuard><MarketingPage /></OnboardingGuard></ProtectedRoute></RouteErrorBoundary>} />
                <Route path="/dashboard/landing-builder" element={<RouteErrorBoundary><ProtectedRoute><OnboardingGuard><LandingBuilderPage /></OnboardingGuard></ProtectedRoute></RouteErrorBoundary>} />
                <Route path="/dashboard/reports" element={<RouteErrorBoundary><ProtectedRoute><OnboardingGuard><ReportsPage /></OnboardingGuard></ProtectedRoute></RouteErrorBoundary>} />
                <Route path="/dashboard/help" element={<RouteErrorBoundary><ProtectedRoute><OnboardingGuard><HelpPage /></OnboardingGuard></ProtectedRoute></RouteErrorBoundary>} />
                <Route path="/dashboard/billing" element={<RouteErrorBoundary><ProtectedRoute><OnboardingGuard><PricingPage /></OnboardingGuard></ProtectedRoute></RouteErrorBoundary>} />
                <Route path="/dashboard/admin" element={<RouteErrorBoundary><SuperAdminRoute><AdminPanelPage /></SuperAdminRoute></RouteErrorBoundary>} />
                <Route path="/dashboard/admin/site" element={<RouteErrorBoundary><SuperAdminRoute><SiteEditorPage /></SuperAdminRoute></RouteErrorBoundary>} />
                <Route path="/dashboard/admin/audit" element={<RouteErrorBoundary><SuperAdminRoute><AuditLogPage /></SuperAdminRoute></RouteErrorBoundary>} />
                <Route path="/dashboard/community" element={<RouteErrorBoundary><ProtectedRoute><OnboardingGuard><CommunityHubPage /></OnboardingGuard></ProtectedRoute></RouteErrorBoundary>} />
                <Route path="/dashboard/community/:slug" element={<RouteErrorBoundary><ProtectedRoute><OnboardingGuard><CommunityHomePage /></OnboardingGuard></ProtectedRoute></RouteErrorBoundary>} />
                <Route path="/dashboard/community/:slug/feed" element={<RouteErrorBoundary><ProtectedRoute><OnboardingGuard><CommunityFeedPage /></OnboardingGuard></ProtectedRoute></RouteErrorBoundary>} />
                <Route path="/dashboard/community/:slug/members" element={<RouteErrorBoundary><ProtectedRoute><OnboardingGuard><CommunityMembersPage /></OnboardingGuard></ProtectedRoute></RouteErrorBoundary>} />
                <Route path="/dashboard/community/:slug/announcements" element={<RouteErrorBoundary><ProtectedRoute><OnboardingGuard><CommunityAnnouncementsPage /></OnboardingGuard></ProtectedRoute></RouteErrorBoundary>} />
                <Route path="/dashboard/community/:slug/calendar" element={<RouteErrorBoundary><ProtectedRoute><OnboardingGuard><CommunityCalendarPage /></OnboardingGuard></ProtectedRoute></RouteErrorBoundary>} />
                <Route path="/dashboard/community/:slug/resources" element={<RouteErrorBoundary><ProtectedRoute><OnboardingGuard><CommunityResourcesPage /></OnboardingGuard></ProtectedRoute></RouteErrorBoundary>} />
                <Route path="/dashboard/community/:slug/chat" element={<RouteErrorBoundary><ProtectedRoute><OnboardingGuard><CommunityChatPage /></OnboardingGuard></ProtectedRoute></RouteErrorBoundary>} />
                <Route path="/dashboard/community/:slug/leaderboard" element={<RouteErrorBoundary><ProtectedRoute><OnboardingGuard><CommunityLeaderboardPage /></OnboardingGuard></ProtectedRoute></RouteErrorBoundary>} />
                <Route path="/dashboard/community/:slug/moderation" element={<RouteErrorBoundary><ProtectedRoute><OnboardingGuard><CommunityModerationPage /></OnboardingGuard></ProtectedRoute></RouteErrorBoundary>} />
                <Route path="/dashboard/community/:slug/settings" element={<RouteErrorBoundary><ProtectedRoute><OnboardingGuard><CommunitySettingsPage /></OnboardingGuard></ProtectedRoute></RouteErrorBoundary>} />
                <Route path="*" element={<RouteErrorBoundary><NotFound /></RouteErrorBoundary>} />
                </Routes>
                </Suspense>
                </LazyRouteBoundary>
                <GlobalFooter />
                </SiteContentProvider>
              </OrgProvider>
            </AuthProvider>
          </RootErrorBoundary>
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
