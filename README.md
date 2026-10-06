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

## 2. Netlify
1. `npm install` (this also installs `@netlify/vite-plugin-tanstack-start`; run `npm install -D @netlify/vite-plugin-tanstack-start` once to pin its version).
2. Push to Git, create a site from the repo (build command `vite build`, publish `dist/client` — already in `netlify.toml`).
3. Site configuration → Environment variables, add (see `.env.example`):
   `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `ADMIN_ACTION_PASSWORD`.
   Keep the service-role key out of any `VITE_` variable.
4. Deploy. Open the site → enter your admin email → click the emailed link.
5. Admin page → **Users & Roles** → add encoders.

## Local development
Copy `.env.example` to `.env`, fill it in, then `npm run dev` (or `netlify dev`).
`npm test` runs the merit-rule unit tests. `npm run build` builds and type-checks.

## Behavior notes
- No offline/localStorage fallback: if the database is unreachable, saving fails with an error instead of silently keeping data on one device.
- Merit costs are set by Admin and enforced on the server (not editable on Encode).
- Transaction IDs and balance changes are generated/applied atomically in Postgres, so two operators can't collide.
- Fleet Merits sync/push still runs from the browser using the Fleet anon key (unchanged).
