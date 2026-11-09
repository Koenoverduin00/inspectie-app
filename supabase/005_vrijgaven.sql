-- =====================================================================
-- Update 005: flora- en fauna-vrijgaven (veldchecks).
-- Uitvoeren na 004_werkpakketten.sql (SQL Editor → Run). Veilig opnieuw uit te voeren.
-- Boomveiligheidscontroles worden als inspectie opgeslagen; daarvoor is geen nieuwe tabel nodig.
-- =====================================================================
create table if not exists public.vrijgaven (
  id             text primary key,
  project_id     text,
  data           jsonb not null default '{}'::jsonb,
  gewijzigd      timestamptz not null,
  verwijderd     boolean not null default false,
  sync_tijd      timestamptz not null default clock_timestamp(),
  gewijzigd_door uuid
);
create index if not exists vrijgaven_project_idx on public.vrijgaven (project_id);
create index if not exists vrijgaven_sync_tijd_idx on public.vrijgaven (sync_tijd);
alter table public.vrijgaven enable row level security;
revoke all on public.vrijgaven from anon;
grant select, insert, update on public.vrijgaven to authenticated;
drop policy if exists project_toegang on public.vrijgaven;
create policy project_toegang on public.vrijgaven for all to authenticated
  using (public.heeft_project(project_id)) with check (public.heeft_project(project_id));
drop trigger if exists bij_wijziging on public.vrijgaven;
create trigger bij_wijziging before insert or update on public.vrijgaven
  for each row execute function public.bij_wijziging();

notify pgrst, 'reload schema';
select count(*) as vrijgaven from public.vrijgaven;
