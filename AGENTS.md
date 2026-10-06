# Merit Store — notes for AI assistants
- Stack: TanStack Start + Vite, deployed on Netlify; Supabase Postgres via server functions only.
- Never import `src/server/*.server.ts` from client code. Never expose `SUPABASE_SERVICE_ROLE_KEY` via `VITE_`.
- Every server function must use `authMiddleware` (any signed-in role) or `adminMiddleware`.
- Business rules live in `src/lib/rules.ts` (unit-tested in `tests/`). Schema: `supabase/schema.sql`.
