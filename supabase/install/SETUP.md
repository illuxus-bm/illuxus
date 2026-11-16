# Moving illuxus to a new Supabase project

One SQL file, `supabase/install.sql`, creates the whole database that **illuxus** (web + mobile app) and **illuxus-venue** share. That's every table, function, trigger, row-security policy, grant, view, realtime table, storage bucket and policy, the scheduled job, and the reference data (plans, website content, vendor categories, badges, dial codes).

The SQL can't carry project secrets, edge functions or dashboard settings. The steps below cover those, so both apps connect to the new project.

> This sets up the **structure**, not your data. Users, events, registrations and so on aren't copied. See [Moving the data too](#moving-the-data-too).

---

## 1. Create the project and run the file

1. Create a new project at supabase.com and wait until it shows **Healthy**.
2. Get its connection string: **Project Settings → Database → Connection string → URI** (direct connection or session pooler). Keep the password private.
3. Run the file. It's about 1 MB, which is fine for `psql`; the dashboard editor can struggle with that size.

   **With psql** (recommended). No local install is needed if Docker is available:
   ```bash
   # from the illuxus repo root
   docker run --rm -v "$PWD/supabase:/w" supabase/postgres:17.6.1.127 \
     psql "postgresql://postgres:<PASSWORD>@db.<NEW-REF>.supabase.co:5432/postgres" \
     -v ON_ERROR_STOP=1 -f /w/install.sql
   ```
   **Or** Dashboard → SQL Editor → paste the whole file → Run.

4. Success ends with `NOTICE: illuxus install OK: 130 tables, 399 functions, 372 policies, 6 buckets, 4 plans`.

The file runs in **one transaction**: if anything fails, nothing is created, so you can fix the problem and run it again. On a database that already has the schema, it stops at once without changing anything.

## 2. Settings the database needs

The scheduled emails / WhatsApp job and the venue-response notifications call your edge functions. They read the project URL and key from `app_settings`. Until those rows exist they simply skip, so nothing breaks, but those features stay off.

Run in the SQL Editor of the **new** project:
```sql
INSERT INTO public.app_settings (key, value) VALUES
  ('supabase_url',     'https://<NEW-REF>.supabase.co'),
  ('service_role_key', '<new project service_role key>');   -- Project Settings → API
```

Vendor sign-up allowlist (illuxus-venue): `vendor_email_allowlist` wasn't copied, because it holds email addresses. Add the allowed vendor emails again, or set `VITE_VENDOR_ALLOWED_EMAILS` (step 5).

## 3. Auth settings (Dashboard → Authentication)

| Setting | Value |
|---|---|
| Site URL | `https://illuxus.com`, or your domain |
| Redirect URLs | your domains, e.g. `https://illuxus.com/**`, the venue app's domain, `capacitor://localhost/**` and `https://localhost/**` for the mobile apps, `http://localhost:8080/**` for local development |
| Email → **Confirm email** | **ON**. Sign-up security depends on it (see `RUN_ME_signup_email_verification.sql`) |
| Multi-factor → TOTP (authenticator app) | **Enabled** (two-factor sign-in) |
| SMTP | your SMTP server, so auth emails come from your domain |
| Email templates | copy your current templates if you customised them |

## 4. Edge functions

Set the secrets (**Project Settings → Edge Functions → Secrets**, or `npx supabase secrets set NAME=value --project-ref <NEW-REF>`). `SUPABASE_URL`, `SUPABASE_ANON_KEY` and `SUPABASE_SERVICE_ROLE_KEY` are provided automatically.

| Purpose | Secrets |
|---|---|
| Your domains / CORS | `PUBLIC_DOMAIN`, `PUBLIC_PUBLISHED_HOST`, `ALLOWED_ORIGINS`, optional `PREVIEW_ORIGIN_PATTERN` (regex for your own Vercel preview hosts), `ORGANIZER_DASHBOARD_URL`, `VENDOR_PORTAL_URL` |
| Email | `SMTP_HOST`, `SMTP_PORT`, `SMTP_USERNAME`, `SMTP_PASSWORD`, `SMTP_FROM`, `SUPPORT_EMAIL`, `SUPPORT_INBOX_EMAIL` (legacy fallbacks: `RESEND_FROM`, `RESEND_FROM_EMAIL`) |
| Webinars | `LIVEKIT_API_KEY`, `LIVEKIT_API_SECRET`, `LIVEKIT_WS_URL`; Agora: `AGORA_APP_ID`, `AGORA_APP_CERTIFICATE` |
| WhatsApp | `WHATSAPP_TOKEN`, `WHATSAPP_PHONE_NUMBER_ID`, `WHATSAPP_BUSINESS_ACCOUNT_ID`, `WHATSAPP_APP_SECRET`, `WHATSAPP_VERIFY_TOKEN`, `WHATSAPP_API_VERSION` |
| AI creatives | `GEMINI_API_KEY`, `GEMINI_COPY_MODEL`, `GEMINI_COPY_DAILY_QUOTA`, `GEMINI_PER_EVENT_DAILY_QUOTA` |

Deploy every function:
```bash
npx supabase login
npm run functions:deploy -- --project-ref <NEW-REF>
```
The script bundles each function into one file first and then runs `supabase functions deploy --use-api`. A plain `supabase functions deploy --use-api` fails with "Module not found" for the vendored libraries, because the CLI doesn't upload imports nested that deep. Name functions to deploy only those, for example `npm run functions:deploy -- livekit-token`.
Then update the webhooks that point at the old project:
- **LiveKit:** webhook URL → `https://<NEW-REF>.supabase.co/functions/v1/livekit-webhook`.
- **Meta / WhatsApp:** callback URL → `.../functions/v1/whatsapp-webhook`, with the same `WHATSAPP_VERIFY_TOKEN`.

## 5. Point the apps at the new project

Use the values from **Project Settings → API**.

| App | Where | Variables |
|---|---|---|
| illuxus (web) | Vercel project env + local `.env` | `VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY` (also used by `api/*`); keep the others (`VITE_PUBLIC_DOMAIN`, `VITE_GA4_ID`, `VITE_CLARITY_ID`, `VITE_OBSERVABILITY_DSN`, `VITE_AGORA_APP_ID`, …) |
| illuxus mobile apps | build env (CI) | the same `VITE_SUPABASE_*` values, then publish a new build or live update |
| illuxus-venue | its Vercel env + `.env` | `VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY`, `VITE_ILLUXUS_ORIGIN`, `VITE_VENDOR_ALLOWED_EMAILS` |
| Supabase CLI (repo) | `supabase/config.toml` | `project_id = "<NEW-REF>"` |

Redeploy both frontends. `index.html` takes the Supabase URL for its `preconnect` hint from `VITE_SUPABASE_URL` at build time.

## 6. Check it works

- Sign up with a new account. The confirmation email arrives, and after confirming, a `profiles` row exists (sign-up trigger).
- Create an organisation and an event, upload a cover image (storage), and open the public event page.
- Sign in to illuxus-venue with an allowed vendor email.
- Check the security headers and policy: `node scripts/csp-smoke.mjs https://<your-domain>`.

---

## Moving the data too

`install.sql` creates an empty database (plus reference data). To bring the existing users and content across as well, move the data with Supabase's backup/restore tools after the install, e.g. a data-only dump of the old project restored into the new one, including the `auth` schema for users. Plan a short maintenance window for that. Test it on a copy first, because user accounts and storage files (which live outside the database) both have to move.

## Keeping install.sql current

`install.sql` is generated. Don't edit it by hand. After schema changes reach production:
```bash
npx supabase db dump --linked -f supabase/prod_schema.sql   # needs Docker running
node scripts/build-install-sql.mjs
```
If the reference data changed, regenerate `supabase/install/seed.sql` as its header explains.

Without Docker you can't re-dump. Instead, list the migration in `supabase/post-dump-migrations.json`, and `install.sql` runs it after the dump. This is how 087 and 088 get in. They're safe to re-run, so they can stay listed after the next dump.

The generator also declares the parts a dump doesn't include: triggers on `auth.users`, storage buckets and policies, and the cron job. Update them in `scripts/build-install-sql.mjs` when those change.

**Known difference from production:** a fresh project grants the `pg_trgm` text-search helper functions to all roles; production lists no such grants. Postgres lets everyone execute those helpers by default anyway, and they touch no data.
