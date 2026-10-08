-- Run ONCE in Supabase → SQL Editor (after migration_privileges.sql). Safe to re-run.
-- Adds per-privilege quotas and a settings table for the semester dates.

alter table public.ms_privileges add column if not exists quota_limit  numeric check (quota_limit is null or quota_limit >= 0);
alter table public.ms_privileges add column if not exists quota_period text    check (quota_period is null or quota_period in ('month', 'semester'));
alter table public.ms_privileges add column if not exists entry_max    numeric check (entry_max is null or entry_max > 0);

create table if not exists public.ms_settings (
  key   text primary key,
  value text not null
);
alter table public.ms_settings enable row level security;
revoke all on public.ms_settings from anon, authenticated;

-- Starting values (only if you haven't set them yet): ED 20 per month;
-- Offset Demerits 30 per semester, usual max 15 per entry.
update public.ms_privileges set quota_limit = 20, quota_period = 'month'
  where id = 'reduce-ed' and quota_limit is null;
update public.ms_privileges set quota_limit = 30, quota_period = 'semester', entry_max = 15
  where id = 'offset-demerits' and quota_limit is null;
