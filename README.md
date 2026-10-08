# Merit Store (Netlify + Supabase)

Cadet privilege / merit tracker. TanStack Start app deployed on **Netlify**, data in **Supabase Postgres**,
sign-in by **email magic link** with two roles:

| Role | Can use |
|---|---|
| **admin** | Everything, incl. Admin page (roster, privilege costs, users), removing records (needs the confirmation password) |
| **encoder** | Portal, Encode, Confirm, Records (view/export), Reports |

All database access happens in server functions that verify the login token and the role on every call.
The browser only holds the public anon key (used for sign-in); it cannot read any table.

## 1. Supabase (new project)
1. Create a new project.
2. SQL Editor → paste `supabase/schema.sql`, **change the email at the bottom to yours**, Run.
3. Authentication → URL Configuration: set **Site URL** to your Netlify URL and add it (and `http://localhost:3000`) to **Redirect URLs**.
4. Authentication → Sign In / Providers: you may turn **off** "Allow new users to sign up" (the app only emails people an admin added).
5. Strongly recommended: Authentication → SMTP → set up your own SMTP. Supabase's built-in email is heavily rate-limited (a few emails/hour) and will block sign-ins.
6. Project Settings → API: copy the URL, anon key, and service_role key.

### Updating an existing database
If you installed before a feature was added, run these once (safe to re-run), in this order, in the SQL Editor:
1. `supabase/migration_privileges.sql` — privilege disable + quantity labels
2. `supabase/migration_quotas.sql` — ED / demerit quotas and semester dates

## 2. Netlify
1. `npm install` (this also installs `@netlify/vite-plugin-tanstack-start`; run `npm install -D @netlify/vite-plugin-tanstack-start` once to pin its version).
2. Push to Git, create a site from the repo (build command `vite build`, publish `dist/client` — already in `netlify.toml`).
3. Site configuration → Environment variables, add (see `.env.example`):
   `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `ADMIN_ACTION_PASSWORD`.
   Keep the service-role key out of any `VITE_` variable.
4. Deploy. Open the site → enter your admin email → click the emailed link.
5. Admin page → **Users & Roles** → add encoders.

## Fleet quotas (Quota ED / Quota DR on the Fleet card)
Fleet Merits' cadet card shows **Quota ED** and **Quota DR** (units used so far). Merit Store provides them
through a small read-only endpoint, so Fleet's database is never written to:

`GET https://<your-merit-store-site>/.netlify/functions/quota?name=<exact cadet name>`
→ `{ "found": true, "ed": 12, "dr": 5, "edLimit": 20, "drLimit": 30, "asOf": "2026-10-08" }`

- ED = Reduce ED units used **this calendar month**; DR = Offset Demerits units used **this semester**
  (set the dates in Admin → Current Semester). Counted when merits were deducted (Confirmed or Not Confirmed).
- Only the Fleet site's origin is allowed by CORS (`QUOTA_ALLOWED_ORIGINS`, default `https://fleethro.netlify.app`).
  The endpoint only returns numbers for an exact cadet name. Dates use `QUOTA_TIMEZONE` (default `Asia/Manila`).
- Fleet's `index.html` fetches this after loading the card and falls back to its own numbers if the call fails.
- Optional/advanced: if you ever get write access to Fleet's database you can instead push quotas into it
  (`VITE_PUSH_FLEET_QUOTAS=true` shows an Admin button and updates Fleet after each Confirm/Remove).

## Local development
Copy `.env.example` to `.env`, fill it in, then `npm run dev` (or `netlify dev`).
`npm test` runs the merit-rule unit tests. `npm run build` builds and type-checks.

## Behavior notes
- No offline/localStorage fallback: if the database is unreachable, saving fails with an error instead of silently keeping data on one device.
- ED / demerit quotas (Admin → Privileges) only warn on Encode; they count entries once merits were deducted (Confirmed or Not Confirmed), by confirmation date. Semester quotas use the dates under Admin → Current Semester.
- Merit costs are set by Admin and enforced on the server (not editable on Encode).
- Transaction IDs and balance changes are generated/applied atomically in Postgres, so two operators can't collide.
- Fleet Merits sync/push still runs from the browser using the Fleet anon key (unchanged).
