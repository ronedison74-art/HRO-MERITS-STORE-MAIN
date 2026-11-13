-- Run ONCE in Supabase -> SQL Editor if you already ran the first schema.sql.
-- Adds the reason that is typed when a pending availment is marked Invalid. Safe to re-run.
alter table public.ms_transactions add column if not exists invalid_reason text;
