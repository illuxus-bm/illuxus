# Design Document: routing-auth-fixes

## Overview

Three interconnected bugs all trace back to a single root cause: `AuthContext` sets `loading = false` as soon as `getSession()` resolves, before the parallel `checkAdminRole()` and `loadAccountType()` calls complete. This gives downstream route guards a brief window where `isAdmin` is stale (`false`) while `loading` is already `false` — causing wrong routing decisions.

The fix is surgical: no new files, no DB changes, two files touched.

1. **`AuthContext.tsx`** — make `loading` reflect full resolution of all three async operations (session + role + profile).
2. **`App.tsx`** — fix `OrganizerRoute` to honour `isAdmin` as a bypass condition; fix `DashboardLanding` to wait on `loading` instead of patching it with a `refreshProfile()` side effect.

## Architecture

### Current (broken) flow

```
getSession() resolves
  → setSession / setUser
  → fire-and-forget: checkAdminRole()   (async, ~100ms)
  → fire-and-forget: loadAccountType()  (async, ~100ms)
  → setLoading(false)   ← TOO EARLY
                                        ← isAdmin still false here
    route guard reads isAdmin=false → wrong redirect
                                        ← checkAdminRole resolves, setIsAdmin(true)
                                           (too late, redirect already happened)
```

### Fixed flow

```
getSession() resolves
  → setSession / setUser
  → await Promise.all([checkAdminRole(), loadAccountType()])
    (both run in parallel — no extra latency vs current)
  → setLoading(false)   ← only now, after both resolve
    route guard reads isAdmin=true → correct routing
```

### Auth state change events

The `onAuthStateChange` listener has a similar issue: it fires `checkAdminRole` and `loadAccountType` inside `setTimeout(..., 0)` callbacks without resetting `loading`. For identity changes (sign-in / account switch), the fix is to reset `loading = true` before dispatching the two async calls, then set `loading = false` after both complete.

Token refresh events and no-op echoes already skip the async calls (the existing `prevUid === nextUid` short-circuit), so they are unaffected.

## Components and Interfaces

### `AuthContext.tsx` — changes

**`loading` lifecycle (initial mount)**

```typescript
// Before (fire-and-forget, sets loading too early)
supabase.auth.getSession().then(({ data: { session } }) => {
  setSession(session);
  setUser(session?.user ?? null);
  if (session?.user) {
    checkAdminRole(session.user.id);   // fire and forget
    loadAccountType(session.user.id);  // fire and forget
  }
  setLoading(false);  // ← races
});

// After (awaits both helpers before clearing loading)
supabase.auth.getSession().then(async ({ data: { session } }) => {
  if (!mounted) return;
  setSession(session);
  setUser(session?.user ?? null);
  if (session?.user) {
    await Promise.all([
      checkAdminRole(session.user.id),
      loadAccountType(session.user.id),
    ]);
  }
  if (!mounted) return;
  setLoading(false);
});
```

**`loading` lifecycle (auth state change — identity change only)**

```typescript
// Inside the onAuthStateChange handler, identity-change branch:
if (prevUid !== nextUid) {
  setUser(newSession?.user ?? null);
  if (newSession?.user) {
    setLoading(true);  // ← reset so guards wait
    Promise.all([
      checkAdminRole(newSession.user.id),
      loadAccountType(newSession.user.id),
    ]).then(() => {
      if (mounted) setLoading(false);
    });
  } else {
    setIsAdmin(false);
    setAccountType(null);
    setProfileCompleted(null);
    setLoading(false);
  }
}
```

`setTimeout` wrappers are removed — they were a workaround for Supabase's `INITIAL_SESSION` echo and are no longer needed because the `prevUid === nextUid` guard already handles that case.

### `App.tsx` — `OrganizerRoute`

**Current (broken)**

```tsx
if (accountType === "attendee" && !isAdmin && !isWorkspaceMember) {
  return <Navigate to="/my/tickets" replace />;
}
```

The condition is already correct in structure (`!isAdmin` is present), but it fires during the race window when `isAdmin` is still `false`. Once the `AuthContext` fix lands, `loading` will be `true` during that window, and the `if (loading || orgLoading) return <FullPageLoader />` guard at the top of `OrganizerRoute` will catch it before the redirect branch is reached.

No change to `OrganizerRoute`'s logic is strictly needed — the race fix alone corrects it. However, to make the intent explicit and resilient against future changes, the redirect condition should be left as-is (it already includes `!isAdmin`). No code change needed here beyond the `AuthContext` fix.

### `App.tsx` — `DashboardLanding`

**Current (broken)**

```tsx
function DashboardLanding() {
  const { loading, isAdmin, refreshProfile } = useAuth();
  useEffect(() => { refreshProfile(); }, []); // workaround that fires after redirect
  if (loading) return <FullPageLoader />;
  return <Navigate to={isAdmin ? "/dashboard/admin" : "/dashboard/events"} replace />;
}
```

**Fixed**

```tsx
function DashboardLanding() {
  const { loading, isAdmin } = useAuth();
  if (loading) return <FullPageLoader />;
  return <Navigate to={isAdmin ? "/dashboard/admin" : "/dashboard/events"} replace />;
}
```

Removing the `refreshProfile()` `useEffect` is safe because the race fix in `AuthContext` ensures `isAdmin` is already correct by the time `loading` becomes `false`. The `useEffect` was a band-aid that fired too late anyway (after the redirect had already happened).

## Data Models

No new data models. The existing `AuthContextType` interface is unchanged — only the internal sequencing of state updates changes.

```typescript
interface AuthContextType {
  session: Session | null;
  user: User | null;
  loading: boolean;          // now truly "all auth state settled"
  isAdmin: boolean;
  accountType: "attendee" | "organizer" | null;
  profileCompleted: boolean | null;
  refreshProfile: () => Promise<void>;
  signOut: () => Promise<void>;
}
```

## Correctness Properties

*A property is a characteristic or behavior that should hold true across all valid executions of a system — essentially, a formal statement about what the system should do. Properties serve as the bridge between human-readable specifications and machine-verifiable correctness guarantees.*

The project already uses `fast-check` for property-based testing (see `src/lib/attendance/__tests__/`). These properties should be implemented there.

### Property 1: Auth loading flag waits for all async helpers

*For any* authenticated session (any user ID), the `loading` flag SHALL NOT be set to `false` before both `checkAdminRole()` and `loadAccountType()` have resolved — regardless of which resolves first or how long each takes.

**Validates: Requirements 1.1, 1.4**

### Property 2: OrganizerRoute access-control policy correctness

*For any* combination of `(isAdmin: boolean, accountType: "attendee" | "organizer" | null, memberships: Membership[])`, the `OrganizerRoute` SHALL redirect to `/my/tickets` if and only if `accountType === "attendee"` AND `isAdmin === false` AND `memberships.length === 0`.

**Validates: Requirements 2.1, 2.2, 2.3, 5.1**

### Property 3: `loginRedirectFor` produces a valid, safe redirect for any in-app path

*For any* in-app path string (starting with `/`, not starting with `//`), `loginRedirectFor` SHALL return a string that starts with `/login?next=` and whose decoded `next` parameter equals the original path. For paths that are not valid in-app paths (empty, starting with `//`, or equal to `/login`), it SHALL return `/login` with no `next` parameter.

**Validates: Requirements 2.5, 4.2**

## Error Handling

- If `checkAdminRole()` throws (e.g. network error), the `Promise.all` will reject. The error should be caught and `loading` should still be set to `false` so the app doesn't hang. `isAdmin` should default to `false` on error (fail-safe). Use `logger.warn` from `@/lib/observability` — never `console.*`.
- If `loadAccountType()` throws, same pattern: catch, log with `logger.warn`, set `loading = false`, leave `accountType = null`.
- In practice, wrapping the `Promise.all` in a `try/catch` that calls `setLoading(false)` in a `finally` block covers both helpers cleanly.

```typescript
try {
  await Promise.all([
    checkAdminRole(session.user.id),
    loadAccountType(session.user.id),
  ]);
} catch (err) {
  logger.warn('auth profile fetch failed', { error_message: (err as Error)?.message });
} finally {
  if (mounted) setLoading(false);
}
```

## Testing Strategy

### Unit / example-based tests

These cover the concrete scenarios described in the requirements. Place in `src/contexts/__tests__/AuthContext.test.ts`:

- **No session**: `getSession` returns `null` → `loading` becomes `false` immediately, no calls to `checkAdminRole` or `loadAccountType`.
- **Session present**: `getSession` returns a user → `loading` remains `true` until both helpers resolve.
- **Sign-out**: `onAuthStateChange` fires a sign-out → `isAdmin`, `accountType`, `profileCompleted` all reset, `loading` becomes `false`.
- **Error in helpers**: one helper rejects → `loading` still becomes `false`, `isAdmin` defaults to `false`.

Place `DashboardLanding` tests in `src/App.test.tsx` or `src/pages/__tests__/DashboardLanding.test.tsx`:

- `loading = true` → renders `FullPageLoader`, no `Navigate`.
- `loading = false, isAdmin = true` → `Navigate` to `/dashboard/admin`.
- `loading = false, isAdmin = false` → `Navigate` to `/dashboard/events`.

### Property-based tests

Use `fast-check` per project convention. Place in `src/contexts/__tests__/auth-loading.pbt.test.ts` and `src/App.pbt.test.ts`.

**Property 1 test** — generate arbitrary pairs of async delay durations for `checkAdminRole` and `loadAccountType`. Assert that `loading` is never observed as `false` before both resolve.

**Property 2 test** — generate arbitrary `(isAdmin, accountType, memberships)` triples. For each, invoke the extracted `shouldRedirectToTickets(isAdmin, accountType, memberships)` pure function and assert the boolean result matches the policy spec. Run minimum 100 iterations.

**Property 3 test** — generate arbitrary path strings from `fast-check`'s string generators, split into valid in-app paths and invalid ones. Assert the output of `loginRedirectFor` matches the spec. Run minimum 100 iterations.

Tag format per project convention: `// Feature: routing-auth-fixes, Property N: <property text>`

### Dual testing approach

Unit tests catch concrete regressions; property tests verify the invariants hold across the full input space. Both are needed — the race condition was invisible to example-based tests because no test exercised the precise timing where `loading` settled before the helpers resolved.
