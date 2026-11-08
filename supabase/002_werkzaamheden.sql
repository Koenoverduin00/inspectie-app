-- =====================================================================
-- Update: tabel voor geregistreerde werkzaamheden.
-- Alleen nodig als je supabase/schema.sql al eerder hebt uitgevoerd.
-- Uitvoeren in Supabase: SQL Editor → New query → plakken → Run.
-- =====================================================================
create table if not exists public.werkzaamheden (
  id             text primary key,
  data           jsonb not null default '{}'::jsonb,
  gewijzigd      timestamptz not null,
  verwijderd     boolean not null default false,
  sync_tijd      timestamptz not null default clock_timestamp(),
  gewijzigd_door uuid
);
create index if not exists werkzaamheden_sync_tijd_idx on public.werkzaamheden (sync_tijd);
alter table public.werkzaamheden enable row level security;
revoke all on public.werkzaamheden from anon;
grant select, insert, update on public.werkzaamheden to authenticated;
drop policy if exists teamleden_toegang on public.werkzaamheden;
create policy teamleden_toegang on public.werkzaamheden for all to authenticated
  using (public.is_teamlid()) with check (public.is_teamlid());
drop trigger if exists bij_wijziging on public.werkzaamheden;
create trigger bij_wijziging before insert or update on public.werkzaamheden
  for each row execute function public.bij_wijziging();

-- Controle: staat er geen voorbeeldadres in de lijst met teamleden?
-- Zie je 'jouw@email.nl', verwijder het dan met:
--   delete from public.teamleden where email = 'jouw@email.nl';
select email from public.teamleden;
