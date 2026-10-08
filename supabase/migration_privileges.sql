-- Run ONCE in Supabase → SQL Editor if you already ran the first schema.sql.
-- Adds "disable" and the accountability unit label to privileges. Safe to re-run.
alter table public.ms_privileges add column if not exists active boolean not null default true;
alter table public.ms_privileges add column if not exists unit_label text;

update public.ms_privileges set unit_label = 'ED Hours to Reduce'
  where id = 'reduce-ed' and unit_label is null;
update public.ms_privileges set unit_label = 'Demerits to Offset'
  where id = 'offset-demerits' and unit_label is null;
