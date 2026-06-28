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
import { PWAUpdatePrompt } from "@/components/pwa/PWAUpdatePrompt";
import { PWAInstallPrompt } from "@/components/pwa/PWAInstallPrompt";
import { CookieConsent } from "@/components/CookieConsent";
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
const FeaturesPage = lazyWithLog("FeaturesPage", () => import("./pages/FeaturesPage.tsx"));
const PublicPricingPage = lazyWithLog("PublicPricingPage", () => import("./pages/PricingPage.tsx"));
const AboutPage = lazyWithLog("AboutPage", () => import("./pages/AboutPage.tsx"));
const ContactPage = lazyWithLog("ContactPage", () => import("./pages/ContactPage.tsx"));
const PrivacyPage = lazyWithLog("PrivacyPage", () => import("./pages/PrivacyPage.tsx"));
const TermsPage = lazyWithLog("TermsPage", () => import("./pages/TermsPage.tsx"));
const CookiePolicyPage = lazyWithLog("CookiePolicyPage", () => import("./pages/CookiePolicyPage.tsx"));
const GdprPage = lazyWithLog("GdprPage", () => import("./pages/GdprPage.tsx"));
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
const CommunityModerationPage = lazyWithLog("CommunityModerationPage", () => import("./pages/dashboard/community/CommunityModerationPage.tsx"));
const CommunitySettingsPage = lazyWithLog("CommunitySettingsPage", () => import("./pages/dashboard/community/CommunitySettingsPage.tsx"));
const CommunityCommunicationsPage = lazyWithLog("CommunityCommunicationsPage", () => import("./pages/dashboard/community/CommunityCommunicationsPage.tsx"));
const PublicOrgPage = lazyWithLog("PublicOrgPage", () => import("./pages/PublicOrgPage.tsx"));
const LandingBuilderPage = lazyWithLog("LandingBuilderPage", () => import("./pages/dashboard/LandingBuilderPage.tsx"));
const DiscoverFeed = lazyWithLog("DiscoverFeed", () => import("./pages/DiscoverFeed.tsx"));
const ProfilePage = lazyWithLog("ProfilePage", () => import("./pages/u/ProfilePage.tsx"));
const MyEventsPage = lazyWithLog("MyEventsPage", () => import("./pages/u/MyEventsPage.tsx"));
const MyApplicationsPage = lazyWithLog("MyApplicationsPage", () => import("./pages/u/MyApplicationsPage.tsx"));
const MyCommunitiesPage = lazyWithLog("MyCommunitiesPage", () => import("./pages/u/MyCommunitiesPage.tsx"));
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
const PlatformAnalyticsPage = lazyWithLog("PlatformAnalyticsPage", () => import("./pages/dashboard/admin/PlatformAnalyticsPage.tsx"));
const SupportTicketsPage = lazyWithLog("SupportTicketsPage", () => import("./pages/dashboard/admin/SupportTicketsPage.tsx"));
const TicketTrackPage = lazyWithLog("TicketTrackPage", () => import("./pages/TicketTrackPage.tsx"));
/**
 * Global TanStack Query client.
 *
 * Defaults are tuned for an event platform that's expected to handle at
 * least 50k concurrent users at peak:
 *
 * - staleTime: 30s — cuts the burst of identical refetches when an
 *   organiser hops between Speakers / Sponsors / Reports tabs that
 *   each render their own card lists. Hooks that need stricter
 *   freshness (live counters, webinar state) override per-query.
 * - gcTime: 5min — keeps inactive query data in memory for fast tab
 *   resume, then drops to limit the heap growth a single tab can
 *   accumulate over a long session.
 * - refetchOnWindowFocus: false — too noisy on a laptop with the tab
 *   in the background. Surfaces that genuinely need fresh data on
 *   focus (e.g. attendance counters) opt back in per-query.
 * - refetchOnReconnect: true — recovers cleanly after a flaky
 *   connection without needing a manual refresh.
 * - retry: 1 — one network retry is enough for transient blips. More
 *   amplifies the load when the backend is already struggling.
 * - retryDelay: exponential backoff capped at 8s.
 *
 * Per-query overrides live in their own hooks (`@/hooks/...`) and stay
 * the source of truth when the global default isn't appropriate.
 */
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      gcTime: 5 * 60_000,
      refetchOnWindowFocus: false,
      refetchOnReconnect: true,
      retry: 1,
      retryDelay: (attempt) => Math.min(1000 * 2 ** attempt, 8000),
    },
    mutations: {
      retry: 0,
    },
  },
});

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
        <PWAUpdatePrompt />
        <PWAInstallPrompt />
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
                {/* Static marketing / legal pages */}
                <Route path="/features" element={<RouteErrorBoundary><FeaturesPage /></RouteErrorBoundary>} />
                <Route path="/pricing" element={<RouteErrorBoundary><PublicPricingPage /></RouteErrorBoundary>} />
                <Route path="/about" element={<RouteErrorBoundary><AboutPage /></RouteErrorBoundary>} />
                <Route path="/contact" element={<RouteErrorBoundary><ContactPage /></RouteErrorBoundary>} />
                {/* Public ticket tracking — anyone with the ticket number + email can land here. */}
                <Route path="/support/ticket/:ticketNumber" element={<RouteErrorBoundary><TicketTrackPage /></RouteErrorBoundary>} />
                <Route path="/privacy" element={<RouteErrorBoundary><PrivacyPage /></RouteErrorBoundary>} />
                <Route path="/terms" element={<RouteErrorBoundary><TermsPage /></RouteErrorBoundary>} />
                <Route path="/cookies" element={<RouteErrorBoundary><CookiePolicyPage /></RouteErrorBoundary>} />
                <Route path="/gdpr" element={<RouteErrorBoundary><GdprPage /></RouteErrorBoundary>} />
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
                <Route path="/u/me/communities" element={<RouteErrorBoundary><AttendeeRoute><MyCommunitiesPage /></AttendeeRoute></RouteErrorBoundary>} />
                <Route path="/u/me/settings" element={<RouteErrorBoundary><AttendeeRoute><SettingsPage /></AttendeeRoute></RouteErrorBoundary>} />
                <Route path="/t/:id" element={<RouteErrorBoundary><AttendeeRoute><TicketDetailPage /></AttendeeRoute></RouteErrorBoundary>} />
                <Route path="/dashboard" element={<RouteErrorBoundary><Navigate to="/dashboard/events" replace /></RouteErrorBoundary>} />
                <Route path="/dashboard/events" element={<RouteErrorBoundary><ProtectedRoute><OnboardingGuard><EventsPage /></OnboardingGuard></ProtectedRoute></RouteErrorBoundary>} />
                <Route path="/dashboard/events/new" element={<RouteErrorBoundary><ProtectedRoute><OnboardingGuard><EventQuickCreatePage /></OnboardingGuard></ProtectedRoute></RouteErrorBoundary>} />
                <Route path="/dashboard/events/:id/guests" element={<RouteErrorBoundary><ProtectedRoute><OnboardingGuard><GuestListPage /></OnboardingGuard></ProtectedRoute></RouteErrorBoundary>} />
                <Route path="/dashboard/events/:id/broadcast" element={<RouteErrorBoundary><ProtectedRoute><OnboardingGuard><BroadcastPage /></OnboardingGuard></ProtectedRoute></RouteErrorBoundary>} />
                <Route path="/e/:id/live" element={<RouteErrorBoundary><EventLivePage /></RouteErrorBoundary>} />
                {/* Redirect /e/:id (back-button from live page) to the public event page */}
                <Route path="/e/:id" element={<RouteErrorBoundary><EventShortRedirect /></RouteErrorBoundary>} />
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
                <Route path="/dashboard/admin/analytics" element={<RouteErrorBoundary><SuperAdminRoute><PlatformAnalyticsPage /></SuperAdminRoute></RouteErrorBoundary>} />
                <Route path="/dashboard/admin/tickets" element={<RouteErrorBoundary><SuperAdminRoute><SupportTicketsPage /></SuperAdminRoute></RouteErrorBoundary>} />
                {/* Standalone /community area — open to any authenticated user (AttendeeRoute);
                    community-level RBAC is handled inside CommunityLayout via useCommunityBySlug */}
                <Route path="/community" element={<RouteErrorBoundary><AttendeeRoute><CommunityHubPage /></AttendeeRoute></RouteErrorBoundary>} />
                <Route path="/community/:slug" element={<RouteErrorBoundary><AttendeeRoute><CommunityHomePage /></AttendeeRoute></RouteErrorBoundary>} />
                <Route path="/community/:slug/feed" element={<RouteErrorBoundary><AttendeeRoute><CommunityFeedPage /></AttendeeRoute></RouteErrorBoundary>} />
                <Route path="/community/:slug/members" element={<RouteErrorBoundary><AttendeeRoute><CommunityMembersPage /></AttendeeRoute></RouteErrorBoundary>} />
                <Route path="/community/:slug/announcements" element={<RouteErrorBoundary><AttendeeRoute><CommunityAnnouncementsPage /></AttendeeRoute></RouteErrorBoundary>} />
                <Route path="/community/:slug/calendar" element={<RouteErrorBoundary><AttendeeRoute><CommunityCalendarPage /></AttendeeRoute></RouteErrorBoundary>} />
                <Route path="/community/:slug/resources" element={<RouteErrorBoundary><AttendeeRoute><CommunityResourcesPage /></AttendeeRoute></RouteErrorBoundary>} />
                <Route path="/community/:slug/chat" element={<RouteErrorBoundary><AttendeeRoute><CommunityChatPage /></AttendeeRoute></RouteErrorBoundary>} />
                <Route path="/community/:slug/communications" element={<RouteErrorBoundary><AttendeeRoute><CommunityCommunicationsPage /></AttendeeRoute></RouteErrorBoundary>} />
                <Route path="/community/:slug/moderation" element={<RouteErrorBoundary><AttendeeRoute><CommunityModerationPage /></AttendeeRoute></RouteErrorBoundary>} />
                <Route path="/community/:slug/settings" element={<RouteErrorBoundary><AttendeeRoute><CommunitySettingsPage /></AttendeeRoute></RouteErrorBoundary>} />
                {/* Backward-compat: any old /dashboard/community link still resolves */}
                <Route path="/dashboard/community" element={<RouteErrorBoundary><Navigate to="/community" replace /></RouteErrorBoundary>} />
                <Route path="/dashboard/community/*" element={<RouteErrorBoundary><DashboardCommunityRedirect /></RouteErrorBoundary>} />
                <Route path="*" element={<RouteErrorBoundary><NotFound /></RouteErrorBoundary>} />
                </Routes>
                </Suspense>
                </LazyRouteBoundary>
                <GlobalFooter />
                <GlobalCookieConsent />
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
 * Global site footer — shown on every public-facing page.
 * Suppressed only on dashboard, auth, onboarding, live/webinar, check-in,
 * sponsor portal, speaker portal, community, and preview routes.
 */
function GlobalFooter() {
  const { pathname } = useLocation();

  // Prefixes where the footer must NOT appear (app chrome / auth flows).
  const suppressed = [
    "/dashboard",
    "/onboarding",
    "/login",
    "/reset-password",
    "/complete-profile",
    "/sponsor",
    "/speaker",
    "/checkin",
    "/community",
    "/e/",
    "/support/",
    "/__preview",
  ];

  if (suppressed.some((p) => pathname === p || pathname.startsWith(p))) {
    return null;
  }

  return <Footer />;
}

/**
 * Cookie consent banner — suppressed on the same routes as GlobalFooter
 * (dashboard / onboarding / auth flows don't need the banner).
 */
function GlobalCookieConsent() {
  const { pathname } = useLocation();

  const suppressed = [
    "/dashboard",
    "/onboarding",
    "/login",
    "/reset-password",
    "/complete-profile",
    "/sponsor",
    "/speaker",
    "/checkin",
    "/community",
    "/e/",
    "/support/",
    "/__preview",
  ];

  if (suppressed.some((p) => pathname === p || pathname.startsWith(p))) {
    return null;
  }

  return <CookieConsent />;
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
 * Public landing page. Always renders the Index marketing page at `/`
 * regardless of auth state — signed-in users can navigate to `/discover`
 * (linked from the header / sidebar / nav) when they want the discovery feed.
 */
function HomeRoute() {
  return <Index />;
}

/** Permanent redirect from `/e/<id>` (used by the back-button on the live
 * webinar page) to the canonical public event URL `/events/<id>`.
 * Both UUIDs and slugs are valid — PublicEventPage handles both. */
function EventShortRedirect() {
  const { id } = useParams<{ id: string }>();
  return <Navigate to={`/events/${id || ""}`} replace />;
}

/** Permanent redirect from the legacy `/o/<slug>` org URL to `/org/<slug>`. */
function LegacyOrgRedirect() {
  const { slug } = useParams<{ slug: string }>();
  return <Navigate to={`/org/${slug || ""}`} replace />;
}

/** Permanent redirect from `/o/<orgSlug>/<eventSlug>` to `/org/<orgSlug>/events/<eventSlug>`. */
function LegacyEventRedirect() {
  const { orgSlug, eventSlug } = useParams<{ orgSlug: string; eventSlug: string }>();
  return <Navigate to={`/org/${orgSlug || ""}/events/${eventSlug || ""}`} replace />;
}

/**
 * Backward-compat: anything under `/dashboard/community/...` now lives at
 * `/community/...`. Forward to the new location preserving sub-paths.
 */
function DashboardCommunityRedirect() {
  const location = useLocation();
  const target = location.pathname.replace(/^\/dashboard\/community/, "/community") + location.search + location.hash;
  return <Navigate to={target} replace />;
}
