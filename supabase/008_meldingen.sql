-- =====================================================================
-- Update 008: storingen- en gebrekenregister (meldingen die kantoor klaarzet of buiten worden gemeld).
-- Uitvoeren na 003 (SQL Editor → Run). Het script kan veilig meerdere keren worden uitgevoerd.
-- Maakt alleen een nieuwe tabel aan; bestaande gegevens worden niet gewijzigd.
-- =====================================================================
create table if not exists public.meldingen (
  id             text primary key,
  project_id     text,
  data           jsonb not null default '{}'::jsonb,
  gewijzigd      timestamptz not null,
  verwijderd     boolean not null default false,
  sync_tijd      timestamptz not null default clock_timestamp(),
  gewijzigd_door uuid
);
create index if not exists meldingen_project_idx on public.meldingen (project_id);
create index if not exists meldingen_sync_tijd_idx on public.meldingen (sync_tijd);
alter table public.meldingen enable row level security;
revoke all on public.meldingen from anon;
grant select, insert, update on public.meldingen to authenticated;
drop policy if exists project_toegang on public.meldingen;
create policy project_toegang on public.meldingen for all to authenticated
  using (public.heeft_project(project_id)) with check (public.heeft_project(project_id));
drop trigger if exists bij_wijziging on public.meldingen;
create trigger bij_wijziging before insert or update on public.meldingen
  for each row execute function public.bij_wijziging();

notify pgrst, 'reload schema';
select count(*) as meldingen from public.meldingen;
