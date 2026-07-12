# Requirements Document

## Introduction

Three interconnected routing bugs affect super admins in the illuxus platform. The root cause is a race condition in `AuthContext` that resolves `loading` to `false` before the admin-role check has completed. This causes downstream route guards — `OrganizerRoute` and `DashboardLanding` — to make incorrect routing decisions during the window between session restoration and role resolution. This spec captures the requirements needed to eliminate those bugs without regressing any non-admin routing behaviour.

## Glossary

- **AuthContext**: React context (`src/contexts/AuthContext.tsx`) that owns the auth session, `loading` flag, `isAdmin`, `accountType`, and `profileCompleted` state.
- **Loading flag**: The `loading: boolean` value exposed by `AuthContext`; route guards treat `true` as "wait, not ready" and render a full-page loader.
- **Admin check**: The async `checkAdminRole()` function that queries `user_roles` to determine whether the current user is a super admin.
- **Profile load**: The async `loadAccountType()` function that queries `profiles` to populate `accountType` and `profileCompleted`.
- **OrganizerRoute**: Route guard in `App.tsx` that redirects pure attendees to `/my/tickets`; workspace members and super admins must bypass this redirect.
- **DashboardLanding**: The `/dashboard` smart-redirect component that sends super admins to `/dashboard/admin` and everyone else to `/dashboard/events`.
- **SuperAdminRoute**: Route guard that requires `isAdmin === true`; already works correctly once the race is fixed.
- **FullPageLoader**: The spinner component rendered while auth state is resolving.
- **`?next=` param**: A query parameter on `/login` that encodes the destination URL the user was trying to reach before being redirected to login.

## Requirements

### Requirement 1: Auth loading flag reflects full resolution

**User Story:** As a route guard, I need to know when all auth state — session, admin role, and account type — has fully resolved, so that I never make a routing decision based on partial data.

#### Acceptance Criteria

1. WHEN `getSession()` resolves with an active session, THE `AuthContext` SHALL keep `loading` set to `true` until both `checkAdminRole()` and `loadAccountType()` have also resolved.
2. WHEN `getSession()` resolves with no session (unauthenticated), THE `AuthContext` SHALL set `loading` to `false` immediately, as no further async work is needed.
3. WHEN `getSession()` resolves with an active session and both `checkAdminRole()` and `loadAccountType()` complete, THE `AuthContext` SHALL set `loading` to `false` in a single state transition.
4. WHEN the auth state change listener detects a user identity change (sign-in or account switch), THE `AuthContext` SHALL reset `loading` to `true` until the corresponding `checkAdminRole()` and `loadAccountType()` calls complete.
5. WHEN the auth state change listener detects a sign-out event, THE `AuthContext` SHALL set `isAdmin` to `false`, `accountType` to `null`, `profileCompleted` to `null`, and `loading` to `false`.
6. THE `AuthContext` SHALL resolve `loading` to `false` within 5 seconds of initial mount under normal network conditions, so the full-page loader is not shown for an unreasonable duration.

### Requirement 2: OrganizerRoute bypasses redirect for super admins

**User Story:** As a super admin, I want to access any organizer-gated route — including `/dashboard/events/:id/guests` — without being redirected to `/my/tickets`, regardless of what my `accountType` value is.

#### Acceptance Criteria

1. WHEN a super admin (`isAdmin === true`) navigates to an `OrganizerRoute`-protected path, THE `OrganizerRoute` SHALL render the requested page without redirecting.
2. WHEN an attendee (`accountType === "attendee"`) who is not a super admin and has no workspace memberships navigates to an `OrganizerRoute`-protected path, THE `OrganizerRoute` SHALL redirect to `/my/tickets`.
3. WHEN an attendee who is an invited workspace member navigates to an `OrganizerRoute`-protected path, THE `OrganizerRoute` SHALL render the requested page without redirecting.
4. WHILE auth or org context is still loading, THE `OrganizerRoute` SHALL render a `FullPageLoader` and not make any redirect decision.
5. WHEN an unauthenticated user navigates to an `OrganizerRoute`-protected path, THE `OrganizerRoute` SHALL redirect to the `/login?next=<path>` URL.

### Requirement 3: DashboardLanding waits for full auth resolution before redirecting

**User Story:** As a super admin, I want the `/dashboard` landing to send me to `/dashboard/admin` reliably, so that I don't end up on the organizer events page because the admin check hadn't finished yet.

#### Acceptance Criteria

1. WHILE `AuthContext.loading` is `true`, THE `DashboardLanding` SHALL render a `FullPageLoader` and SHALL NOT emit a `<Navigate>` element.
2. WHEN `AuthContext.loading` becomes `false` and `isAdmin` is `true`, THE `DashboardLanding` SHALL redirect to `/dashboard/admin`.
3. WHEN `AuthContext.loading` becomes `false` and `isAdmin` is `false`, THE `DashboardLanding` SHALL redirect to `/dashboard/events`.
4. THE `DashboardLanding` SHALL NOT call `refreshProfile()` in a `useEffect` as a workaround for stale admin state, because the loading race fix in Requirement 1 makes that workaround unnecessary.

### Requirement 4: Super admin post-login destination

**User Story:** As a super admin, I want to land on `/dashboard/admin` after signing in, so that I reach the platform control surfaces without an extra navigation step.

#### Acceptance Criteria

1. WHEN a super admin completes sign-in without a `?next=` parameter, THE `LoginPage` SHALL redirect to `/dashboard`, and the resolved `DashboardLanding` SHALL then send them to `/dashboard/admin`.
2. WHEN any authenticated user completes sign-in with a `?next=<path>` parameter, THE `LoginPage` SHALL redirect to `<path>` rather than to `/dashboard`, regardless of role.

### Requirement 5: Non-admin routing behaviour is unchanged

**User Story:** As any non-admin user (organizer, workspace member, or attendee), I want every route guard to behave exactly as it did before this fix, so that my routing experience is not affected.

#### Acceptance Criteria

1. WHEN an organizer (`accountType === "organizer"`) navigates to any `OrganizerRoute`-protected path, THE `OrganizerRoute` SHALL render the requested page without redirecting.
2. WHEN an attendee with no workspace membership navigates to a `SuperAdminRoute`-protected path, THE `SuperAdminRoute` SHALL redirect to `/dashboard`.
3. WHEN any unauthenticated user navigates to a `ProtectedRoute`-protected path, THE `ProtectedRoute` SHALL redirect to `/login?next=<path>`.
4. THE `OnboardingGuard` behaviour SHALL remain unchanged for organizers, workspace members, and attendees.

### Requirement 6: Loading screen duration is imperceptible

**User Story:** As any user, I want the full-page loader to appear for no longer than it does today, so that the fix doesn't introduce a visible extra delay.

#### Acceptance Criteria

1. WHEN the session is restored from local storage and role/profile data is fetched, THE `AuthContext` SHALL run `checkAdminRole()` and `loadAccountType()` in parallel using `Promise.all`, not sequentially.
2. WHEN there is no active session, THE `AuthContext` SHALL not make any additional network calls before setting `loading` to `false`.
