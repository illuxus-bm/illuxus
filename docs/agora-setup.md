# Agora setup — in-house webinar studio

This guide walks through configuring Agora as the live video backend for the
in-house webinar studio. It covers the two-side setup (server-side secrets in
Supabase, client-side env in Vite), the per-event canary flag, and a
verification checklist for confirming the studio is actually running on
Agora and not falling back to LiveKit.

The platform ships with both LiveKit and Agora wired in. The
`getWebinarProvider()` resolver picks the active backend per render in
this order:

1. `events.video_provider` (per-event override — `'livekit'` or `'agora'`)
2. `VITE_WEBINAR_PROVIDER` build-env default
3. Hard fallback: `'livekit'`

So flipping a single event to Agora is one column write; flipping the
whole platform is one env var.

> **Reference**: this integration follows the Web SDK 4.x Interactive Live
> Streaming quickstart at
> <https://docs.agora.io/en/interactive-live-streaming/get-started/get-started-sdk>.
> The two non-obvious knobs the docs prescribe — the channel `mode: "live"`
> and the audience latency level — are both wired in `useAgoraClient`
> (`src/lib/webinar/useAgoraClient.ts`).

---

## 1. Create an Agora account and project

1. Sign up at <https://console.agora.io>.
2. Create a project. **Authentication mode: "Secured mode: APP ID + Token"**.
   Don't use "Testing mode: APP ID" — token signing is required.
3. From the project settings, grab two strings:
   - **App ID** — public, embedded in the client bundle.
   - **App Certificate** — secret, never ship to the browser.
4. Note the project's primary region. Agora routes to the nearest data
   centre automatically; the region is only relevant if you later enable
   Cloud Recording or use the RESTful API.

> **Free tier**: Agora gives every account 10,000 free minutes per month
> across audio + video + interactive streaming. That's plenty for staging
> and small-scale production.

---

## 2. Configure Supabase secrets

The `agora-token` edge function signs short-lived RTC and RTM tokens
server-side. It needs both halves of the project credentials.

In the Supabase dashboard → **Project Settings → Edge Functions → Secrets**,
add:

| Key                   | Value                                     |
| --------------------- | ----------------------------------------- |
| `AGORA_APP_ID`        | App ID from step 1                        |
| `AGORA_APP_CERTIFICATE` | App Certificate from step 1            |

Optional, only if you later wire Cloud Recording (deferred to a follow-up
commit, not used by today's stage):

| Key                   | Value                                     |
| --------------------- | ----------------------------------------- |
| `AGORA_CUSTOMER_ID`   | RESTful API credential — Customer ID      |
| `AGORA_CUSTOMER_KEY`  | RESTful API credential — Customer Secret  |
| `AGORA_REGION`        | optional, e.g. `ap-south-1`               |

After adding the secrets, redeploy the edge function (or just push a
no-op change) so the new env is picked up:

```sh
supabase functions deploy agora-token
```

---

## 3. Configure the Vite build env

The browser side needs the App ID so `useAgoraSessionToken` can pass it
into `useAgoraClient.join()`. Add to your `.env.production`,
`.env.development`, and any deployment env (Vercel project settings,
etc.):

```env
# Required: same value as AGORA_APP_ID. Public — embedded in the bundle.
VITE_AGORA_APP_ID="<paste app id>"

# Optional: makes Agora the platform default. Without this, you can still
# opt individual events in via Settings → Live video provider → Agora.
VITE_WEBINAR_PROVIDER="agora"
```

Restart `bun run dev` after changing env vars.

> **Don't put `AGORA_APP_CERTIFICATE` in the Vite env.** That's the
> signing secret. It must only live in Supabase secrets where the edge
> function can read it.

---

## 4. Apply the database migration

Migration `014_video_provider.sql` adds an `events.video_provider`
column with a check constraint of `(NULL, 'livekit', 'agora')`. NULL
means "use the platform default".

```sh
supabase db push
```

If you're using the SQL editor:

```sql
ALTER TABLE public.events
  ADD COLUMN IF NOT EXISTS video_provider text;

ALTER TABLE public.events DROP CONSTRAINT IF EXISTS events_video_provider_check;
ALTER TABLE public.events
  ADD CONSTRAINT events_video_provider_check
  CHECK (video_provider IS NULL OR video_provider IN ('livekit', 'agora'));
```

---

## 5. Pick the canary scope

There are two ways to flip an event onto Agora.

### Per-event (recommended for the first canary)

1. Dashboard → open the event → **Settings** tab.
2. Find **Live video provider**.
3. Change from "Platform default" to **Agora**.
4. Save.

The page persists `events.video_provider = 'agora'` and from then on
both the host's Broadcast page and the public live page render the
Agora stage for that event only. Every other event keeps using whatever
the platform default is.

### Platform default

Set `VITE_WEBINAR_PROVIDER=agora` in the build env and redeploy. Every
event whose `video_provider` is NULL now resolves to Agora. Use this
once you're confident the canary worked.

To roll back, either flip the event setting back to "Platform default"
(NULL), or change the env var.

---

## 6. How the client maps to the Interactive Live Streaming docs

The Web SDK 4.x quickstart prescribes a specific sequence for ILS. Here's
how each step maps to our code so future contributors can follow the
canonical path:

| Doc step                                    | Our wiring |
| ------------------------------------------- | ---------- |
| `AgoraRTC.createClient({ mode: "live" })` | `useAgoraClient` creates the client with `mode: "live"` and `codec: "vp8"`. |
| `setClientRole("host" \| "audience")`     | `useAgoraClient` calls `setClientRole(role)` before joining. |
| Audience latency level                      | Audience joins set `{ level: 2 }` by default (`AUDIENCE_LEVEL_ULTRA_LOW_LATENCY`) so promotions to host are sub-500ms. Override with `audienceLatencyLevel: 'low'` for the cheaper CDN path. |
| `client.join(appId, channel, token, uid)` | Driven by `useAgoraSessionToken`, which fetches a signed token from the `agora-token` edge function. |
| Host: `createMicrophoneAudioTrack` + `createCameraVideoTrack` + `publish` | `client.publish()` in `useAgoraClient` creates and publishes both tracks. `AgoraWebinarStage` calls `publish()` automatically when the host's connection state flips to `"CONNECTED"`. |
| Audience: subscribe via `user-published`  | Hooked in `useAgoraClient`; remote tracks are exposed as `remoteUsers` so consumers can call `videoTrack.play(el)` on a `<div>`. |
| Render local + remote video                 | `AgoraWebinarStage` calls `videoTrack.play(containerEl)` for both, mirrors only the local tile. |
| Token rotation                              | The SDK fires `token-privilege-will-expire` ~30s before expiry. `useAgoraClient` invokes the caller-supplied `onTokenWillExpire` callback and hot-rotates via `client.renewToken()` — no teardown / rejoin. |
| Leave on unmount                            | `useAgoraClient`'s effect cleanup calls `unpublish()` and `client.leave()`, then closes captured tracks. |

If you ever need to debug "is this matching the docs?", the
`useAgoraClient` JSDoc at the top of the file has the canonical doc URL
and a one-line summary for each step.

---

## 7. Verify it's actually running on Agora

Open the host page → click **Go Live** → join the studio. Then check:

1. **Network tab** — you should see a POST to
   `…/functions/v1/agora-token` returning `{ rtc: { token, expireAt, uid } }`.
   You should **not** see a call to `livekit-token` (when the event is
   on Agora).
2. **Browser console** — the observability logger emits these events
   (filter to `kind=info` or search the message):
   - `agora token fetched` — signed-token round-trip from the edge fn.
   - `agora joined` — `client.join()` resolved successfully.
   - `agora token will expire` (~30s before expiry) — followed by
     `agora token renewed` once the rotation completes. No
     `agora joined` log between them = no reconnect.
   - On host: no extra log; the publish is silent unless it errors.
   You should **not** see `LiveKitRoom` or `room-event` chatter.
3. **DOM** — the studio shell wraps each tile in a `<div>` whose
   inner DOM Agora populates with a `<video id="video_…">` element.
   LiveKit tiles use `<video>` directly inside `lk-participant-tile`
   wrappers, so their absence confirms Agora is rendering.
4. **Other browser** — open the public live page in a second browser /
   incognito window. The viewer's tile of you should appear within ~2s
   of you publishing your camera. The control bar's network-quality
   chip ("Excellent" / "Good" / "Fair" / "Poor") populates once Agora's
   first network-quality event fires (~2s).
5. **Audience interactivity** — promote an audience member to host
   (raise hand → accept). The promotion should complete in ~500ms.
   If it takes 2s+, ULTRA_LOW_LATENCY isn't being honoured — confirm
   `audienceLatencyLevel: 'ultra-low'` in `AgoraWebinarStage`.

If steps 1 and 2 pass but step 3 doesn't (i.e. you see the connecting
spinner forever), check the console for an error message starting with
`agora join failed` — usually a wrong App ID, an unsigned token, or an
expired token.

---

## 8. Troubleshooting

| Symptom                                   | Cause                                                  | Fix |
| ----------------------------------------- | ------------------------------------------------------ | --- |
| Stage shows "Agora is not configured"     | `VITE_AGORA_APP_ID` missing in build env               | Add it and rebuild. |
| Stage flashes connecting then errors with `gateway error / dynamic key expired` | Token signing failing on the server side               | Check `AGORA_APP_ID` / `AGORA_APP_CERTIFICATE` Supabase secrets match the project. Redeploy the edge function. |
| Token fetch 500s                          | Edge function not deployed yet                         | `supabase functions deploy agora-token`. |
| Token fetch 400 with `"channel required"` | Calling code passed an empty session id                | Confirm the webinar session row exists for the event. |
| Two browsers see each other join but no video | Camera permission denied / blocked                     | Browser address bar → allow camera + mic, refresh. |
| Studio still uses LiveKit despite the toggle | Page cached before migration / env change         | Hard refresh (Cmd+Shift+R), then check `events.video_provider`. |
| `livekit-token` still being called        | Event's `video_provider` is NULL and `VITE_WEBINAR_PROVIDER` is `livekit` (or unset) | Flip the event's setting, or set the platform default to `agora`. |
| Audience-to-host promotion takes 2s+      | Audience joined on the high-latency CDN path           | Confirm `audienceLatencyLevel: 'ultra-low'` is being passed. Check the `setClientRole` call in `useAgoraClient` and the option in `AgoraWebinarStage`. |
| Mid-stream reconnect after exactly 1h     | Token rotation isn't running                           | Check the console for `agora token will expire` — if it fires but no `agora token renewed`, the `onTokenWillExpire` callback didn't return a fresh token (look at `agora token renewal failed` for the underlying error). |

---

## 9. What's wired today vs deferred

**Working in this commit**

- Channel join / leave with `mode: "live"` (matches the Interactive Live
  Streaming quickstart)
- Host: auto-publishes camera + mic when connected
- Audience: subscribes to all remote users automatically with
  `AUDIENCE_LEVEL_ULTRA_LOW_LATENCY` so promotions to host are sub-500ms
- Mic / camera toggle in the control bar
- Network-quality indicator
- SDK-event-driven token rotation via `token-privilege-will-expire` →
  `client.renewToken()` (no reconnect mid-session)
- Per-event provider switch in Settings

**Intentionally deferred — follow-up commits**

- Screen-share (Agora supports it; needs a separate `createScreenVideoTrack` path)
- RTM chat / data channel for the existing webinar sidebar
- Cloud recording (Acquire → Start → Query → Stop REST flow + webhook)
- Layouts other than grid (focus / side-by-side / PIP — LiveKit-only today)
- Agora webhook integration for `participant_joined` / `participant_left`
  (so the existing analytics pipeline keeps working when on Agora)
- Bridge of Agora participants to the existing webinar sidebar's
  participant list

These live behind the existing `WebinarStage` provider switch, so when
they land, no UI rewrite is needed — just an internal swap of which
component renders.

---

## 10. Reference: relevant files

| Path                                                            | Role |
| --------------------------------------------------------------- | ---- |
| `supabase/migrations/014_video_provider.sql`                    | DB column + check constraint |
| `supabase/functions/agora-token/index.ts`                       | Server-side token signer (RTC + RTM) |
| `src/lib/webinar/provider.ts`                                   | Provider resolver |
| `src/lib/webinar/useAgoraClient.ts`                             | Low-level RTC client hook (channel profile, role, audience latency, token rotation) |
| `src/lib/webinar/useAgoraSessionToken.ts`                       | Token fetch from edge function with caller-driven refresh |
| `src/components/webinar/AgoraWebinarStage.tsx`                  | Agora-backed stage UI (grid, control bar, error overlays) |
| `src/components/webinar/WebinarStage.tsx`                       | Branches on provider |
| `src/components/event/EventSettingsSection.tsx`                 | Per-event provider select |
| `src/pages/dashboard/event/BroadcastPage.tsx`                   | Host page |
| `src/pages/EventLivePage.tsx`                                   | Viewer page |

External:

- [Interactive Live Streaming quickstart (Web SDK 4.x)](https://docs.agora.io/en/interactive-live-streaming/get-started/get-started-sdk)
- [Token authentication workflow](https://docs.agora.io/en/interactive-live-streaming/token-authentication/authentication-workflow)
- [Connection status management](https://docs.agora.io/en/interactive-live-streaming/enhance-call-quality/connection-status-management)
