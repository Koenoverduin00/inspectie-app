-- =====================================================================
-- Inspectie & Registratie – database-inrichting voor Supabase
-- Uitvoeren in Supabase: SQL Editor → New query → plakken → Run.
-- Het script kan veilig meerdere keren worden uitgevoerd.
-- =====================================================================

-- 1. Teamleden: alleen deze e-mailadressen hebben toegang tot de gegevens.
create table if not exists public.teamleden (
  email      text primary key,
  toegevoegd timestamptz not null default now()
);
alter table public.teamleden enable row level security;  -- geen policies: alleen beheer via de SQL-editor

create or replace function public.is_teamlid()
returns boolean
language sql stable security definer
set search_path = public
as $$
  select exists (
    select 1 from public.teamleden
    where lower(email) = lower(coalesce(auth.jwt() ->> 'email', ''))
  );
$$;
revoke all on function public.is_teamlid() from public, anon;
grant execute on function public.is_teamlid() to authenticated;

-- 2. Synchronisatie: server-tijdstempel bijhouden; een oudere versie overschrijft nooit een nieuwere.
create or replace function public.bij_wijziging()
returns trigger
language plpgsql
as $$
begin
  if tg_op = 'UPDATE' and new.gewijzigd < old.gewijzigd then
    return null;  -- oudere wijziging negeren (laatste wijziging wint)
  end if;
  new.sync_tijd := clock_timestamp();
  new.gewijzigd_door := auth.uid();
  return new;
end;
$$;

-- 3. Tabellen voor objecten en inspecties (de gegevens zelf staan als JSON in "data").
do $$
declare t text;
begin
  foreach t in array array['objecten', 'inspecties'] loop
    execute format($f$
      create table if not exists public.%I (
        id             text primary key,
        data           jsonb not null default '{}'::jsonb,
        gewijzigd      timestamptz not null,
        verwijderd     boolean not null default false,
        sync_tijd      timestamptz not null default clock_timestamp(),
        gewijzigd_door uuid
      )$f$, t);
    execute format('create index if not exists %I on public.%I (sync_tijd)', t || '_sync_tijd_idx', t);
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke all on public.%I from anon', t);
    execute format('grant select, insert, update on public.%I to authenticated', t);
    execute format('drop policy if exists teamleden_toegang on public.%I', t);
    execute format('create policy teamleden_toegang on public.%I for all to authenticated
                    using (public.is_teamlid()) with check (public.is_teamlid())', t);
    execute format('drop trigger if exists bij_wijziging on public.%I', t);
    execute format('create trigger bij_wijziging before insert or update on public.%I
                    for each row execute function public.bij_wijziging()', t);
  end loop;
end $$;

-- 4. Privé opslag voor foto's.
insert into storage.buckets (id, name, public)
values ('fotos', 'fotos', false)
on conflict (id) do nothing;

drop policy if exists "fotos_teamleden" on storage.objects;
create policy "fotos_teamleden" on storage.objects for all to authenticated
  using (bucket_id = 'fotos' and public.is_teamlid())
  with check (bucket_id = 'fotos' and public.is_teamlid());

-- 5. Voeg jezelf (en later collega-inspecteurs) toe als teamlid.
--    Vervang het voorbeeldadres door het e-mailadres waarmee je in de app inlogt.
insert into public.teamleden (email) values ('jouw@email.nl')
on conflict (email) do nothing;
