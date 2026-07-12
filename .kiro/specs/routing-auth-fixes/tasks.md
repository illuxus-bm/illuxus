# Implementation Plan: routing-auth-fixes

## Overview

Fix three interconnected routing bugs by correcting the auth loading race condition in `AuthContext`, removing the now-unnecessary `refreshProfile()` workaround in `DashboardLanding`, and verifying that `OrganizerRoute`'s existing `!isAdmin` bypass condition is sufficient once the race is fixed. Two files are touched: `src/contexts/AuthContext.tsx` and `src/App.tsx`.

## Tasks

- [ ] 1. Fix the auth loading race in `AuthContext.tsx`
  - In the `getSession().then(...)` callback, replace the two fire-and-forget calls with `await Promise.all([checkAdminRole(...), loadAccountType(...)])` wrapped in `try/catch/finally`.
  - Move `setLoading(false)` into the `finally` block so it always runs — even if one helper throws — and never runs before both resolve.
  - Confirm the `if (!mounted) return` guard is checked both before the `Promise.all` and inside `finally` to avoid setState-after-unmount.
  - In the `onAuthStateChange` identity-change branch, remove the `setTimeout` wrappers. Set `loading = true` before dispatching the `Promise.all`, and set `loading = false` in `finally` when it settles.
  - Use `logger.warn` from `@/lib/observability` for any error caught in the `catch` block. Never use `console.*`.
  - _Requirements: 1.1, 1.2, 1.3, 1.4, 1.5, 6.1, 6.2_

  - [ ]* 1.1 Write unit tests for AuthContext loading lifecycle
    - Test: no session → `loading` becomes `false` immediately, `checkAdminRole` and `loadAccountType` are not called.
    - Test: session present → `loading` stays `true` until both helpers resolve, then becomes `false`.
    - Test: sign-out event → `isAdmin`, `accountType`, `profileCompleted` reset to defaults, `loading` becomes `false`.
    - Test: one helper rejects → `loading` still becomes `false`, `isAdmin` defaults to `false`.
    - Place in `src/contexts/__tests__/AuthContext.test.ts`.
    - _Requirements: 1.2, 1.3, 1.5, 6.2_

  - [ ]* 1.2 Write property test for auth loading flag (Property 1)
    - **Property 1: Auth loading flag waits for all async helpers**
    - **Validates: Requirements 1.1, 1.4**
    - Use `fast-check` to generate arbitrary pairs of async delay durations for the two helpers.
    - Assert `loading` is never observed as `false` before both resolve, across all generated timing combinations.
    - Run minimum 100 iterations.
    - Tag: `// Feature: routing-auth-fixes, Property 1: loading flag waits for all async helpers`
    - Place in `src/contexts/__tests__/auth-loading.pbt.test.ts`.

- [ ] 2. Fix `DashboardLanding` in `App.tsx`
  - Remove the `useEffect(() => { refreshProfile(); }, [])` call — it was a workaround for the race and is now unnecessary.
  - Remove `refreshProfile` from the `useAuth()` destructure in `DashboardLanding`.
  - The `if (loading) return <FullPageLoader />` check already exists and is correct. Verify it comes before the `<Navigate>` element.
  - _Requirements: 3.1, 3.2, 3.3, 3.4_

  - [ ]* 2.1 Write unit tests for DashboardLanding
    - Test: `loading = true` → renders `FullPageLoader`, no `Navigate` in output.
    - Test: `loading = false, isAdmin = true` → `Navigate` to `/dashboard/admin`.
    - Test: `loading = false, isAdmin = false` → `Navigate` to `/dashboard/events`.
    - Place in `src/pages/__tests__/DashboardLanding.test.tsx` (create file).
    - _Requirements: 3.1, 3.2, 3.3_

- [ ] 3. Verify `OrganizerRoute` is correct without additional changes
  - Read the current `OrganizerRoute` implementation and confirm `!isAdmin` is already present in the redirect condition: `accountType === "attendee" && !isAdmin && !isWorkspaceMember`.
  - Confirm no logic change is needed — the race fix in Task 1 means `loading` will be `true` during the race window, and the `if (loading || orgLoading) return <FullPageLoader />` guard fires before the redirect branch is ever reached.
  - If the condition is correct as-is, leave it unchanged. Add a concise comment explaining the `isAdmin` bypass for future readers.
  - _Requirements: 2.1, 2.2, 2.3, 2.4, 5.1_

  - [ ]* 3.1 Write property test for OrganizerRoute access-control policy (Property 2)
    - **Property 2: OrganizerRoute access-control policy correctness**
    - **Validates: Requirements 2.1, 2.2, 2.3, 5.1**
    - Extract the redirect decision into a pure function `shouldRedirectToTickets(isAdmin: boolean, accountType: string | null, membershipCount: number): boolean`.
    - Use `fast-check` to generate arbitrary `(isAdmin, accountType, memberships)` triples.
    - Assert the output equals `accountType === "attendee" && !isAdmin && membershipCount === 0`.
    - Run minimum 100 iterations.
    - Tag: `// Feature: routing-auth-fixes, Property 2: OrganizerRoute policy correctness`
    - Place in `src/App.pbt.test.ts` (create file).

  - [ ]* 3.2 Write property test for `loginRedirectFor` (Property 3)
    - **Property 3: loginRedirectFor produces a valid, safe redirect for any in-app path**
    - **Validates: Requirements 2.5, 4.2**
    - Use `fast-check` to generate arbitrary path strings (valid in-app paths and invalid ones).
    - For valid paths (starts with `/`, not `//`, not `/login`): assert output starts with `/login?next=` and `decodeURIComponent` of the `next` param equals the original path.
    - For invalid paths: assert output equals `/login`.
    - Run minimum 100 iterations.
    - Tag: `// Feature: routing-auth-fixes, Property 3: loginRedirectFor safe redirect`
    - Place in `src/App.pbt.test.ts`.

- [ ] 4. Checkpoint — run the full test suite
  - Run `bun run test` and confirm all existing tests pass plus any new tests from Tasks 1–3.
  - Run `bun run lint` and confirm no ESLint errors (especially `no-console`).
  - Ensure all tests pass; ask the user if any questions arise.
  - _Requirements: all_

## Task Dependency Graph

```json
{
  "waves": [
    { "wave": 1, "tasks": ["1"] },
    { "wave": 2, "tasks": ["2", "3"] },
    { "wave": 3, "tasks": ["4"] }
  ]
}
```

## Notes

- Tasks marked with `*` are optional and can be skipped for a faster fix-only pass.
- `OrganizerRoute` requires no logic change — only a comment clarifying the `!isAdmin` bypass intent.
- The `setTimeout` wrappers in the `onAuthStateChange` handler were a workaround for Supabase's `INITIAL_SESSION` echo; the existing `prevUid === nextUid` guard already handles that, so removing `setTimeout` is safe.
- Never use `console.*` — use `logger` from `@/lib/observability`.
- Never call `supabase.rpc()` directly — use `supabaseRpc` if any RPC is needed (none needed here).
- Do not edit `src/components/ui/` primitives.
