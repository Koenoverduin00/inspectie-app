-- =====================================================================
-- Update 003: projecten, GIS-lagen, taken en toegang per project.
-- Uitvoeren na schema.sql en 002_werkzaamheden.sql (SQL Editor → Run).
-- Het script kan veilig meerdere keren worden uitgevoerd.
--
-- Rollen:
--   * beheerder – e-mailadres staat in public.teamleden; maakt projecten aan en ziet alles.
--   * lid       – e-mailadres staat in de ledenlijst van een project (data->'leden');
--                 ziet en bewerkt alleen de inhoud van die projecten.
-- =====================================================================

create or replace function public.mijn_email()
returns text language sql stable
as $$ select lower(coalesce(auth.jwt() ->> 'email', '')) $$;

create or replace function public.is_beheerder()
returns boolean language sql stable security definer set search_path = public
as $$ select exists (select 1 from public.teamleden where lower(email) = public.mijn_email()) $$;

-- Oude naam blijft werken voor eerdere versies van de app.
create or replace function public.is_teamlid()
returns boolean language sql stable security definer set search_path = public
as $$ select public.is_beheerder() $$;

-- 1. Projecten (zelfde opbouw als de andere tabellen; project_id = id).
create table if not exists public.projecten (
  id             text primary key,
  project_id     text,
  data           jsonb not null default '{}'::jsonb,
  gewijzigd      timestamptz not null,
  verwijderd     boolean not null default false,
  sync_tijd      timestamptz not null default clock_timestamp(),
  gewijzigd_door uuid
);

create or replace function public.heeft_project(pid text)
returns boolean language sql stable security definer set search_path = public
as $$
  select public.is_beheerder() or exists (
    select 1 from public.projecten p
    where p.id = pid and not p.verwijderd
      and coalesce(p.data -> 'leden', '[]'::jsonb) ? public.mijn_email()
  );
$$;

create or replace function public.mijn_rol()
returns text language sql stable security definer set search_path = public
as $$
  select case
    when public.is_beheerder() then 'beheerder'
    when exists (select 1 from public.projecten p where not p.verwijderd
                 and coalesce(p.data -> 'leden', '[]'::jsonb) ? public.mijn_email()) then 'lid'
    else 'geen' end;
$$;

revoke all on function public.mijn_email(), public.is_beheerder(), public.is_teamlid(),
  public.heeft_project(text), public.mijn_rol() from public, anon;
grant execute on function public.mijn_email(), public.is_beheerder(), public.is_teamlid(),
  public.heeft_project(text), public.mijn_rol() to authenticated;

-- 2. Nieuwe tabellen voor GIS-lagen en taken.
do $$
declare t text;
begin
  foreach t in array array['lagen', 'taken'] loop
    execute format($f$
      create table if not exists public.%I (
        id             text primary key,
        project_id     text,
        data           jsonb not null default '{}'::jsonb,
        gewijzigd      timestamptz not null,
        verwijderd     boolean not null default false,
        sync_tijd      timestamptz not null default clock_timestamp(),
        gewijzigd_door uuid
      )$f$, t);
  end loop;
end $$;

-- 3. Project-kolom, index, rechten, beveiliging en trigger voor alle tabellen.
do $$
declare t text;
begin
  foreach t in array array['projecten', 'lagen', 'objecten', 'inspecties', 'werkzaamheden', 'taken'] loop
    execute format('alter table public.%I add column if not exists project_id text', t);
    execute format('create index if not exists %I on public.%I (project_id)', t || '_project_idx', t);
    execute format('create index if not exists %I on public.%I (sync_tijd)', t || '_sync_tijd_idx', t);
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke all on public.%I from anon', t);
    execute format('grant select, insert, update on public.%I to authenticated', t);
    execute format('drop policy if exists teamleden_toegang on public.%I', t);
    execute format('drop policy if exists project_toegang on public.%I', t);
    execute format('drop policy if exists project_lezen on public.%I', t);
    execute format('drop policy if exists project_beheren on public.%I', t);
    execute format('drop policy if exists project_wijzigen on public.%I', t);
    execute format('drop trigger if exists bij_wijziging on public.%I', t);
    execute format('create trigger bij_wijziging before insert or update on public.%I
                    for each row execute function public.bij_wijziging()', t);
    if t = 'projecten' then
      -- Leden zien hun project; alleen beheerders maken en wijzigen projecten.
      execute 'create policy project_lezen on public.projecten for select to authenticated
               using (public.is_beheerder() or coalesce(data -> ''leden'', ''[]''::jsonb) ? public.mijn_email())';
      execute 'create policy project_beheren on public.projecten for insert to authenticated
               with check (public.is_beheerder())';
      execute 'create policy project_wijzigen on public.projecten for update to authenticated
               using (public.is_beheerder()) with check (public.is_beheerder())';
    else
      execute format('create policy project_toegang on public.%I for all to authenticated
                      using (public.heeft_project(project_id)) with check (public.heeft_project(project_id))', t);
    end if;
  end loop;
end $$;

-- 4. Foto's staan per project in een eigen map: fotos/<project-id>/<foto-id>.jpg
drop policy if exists "fotos_teamleden" on storage.objects;
drop policy if exists "fotos_project" on storage.objects;
create policy "fotos_project" on storage.objects for all to authenticated
  using (bucket_id = 'fotos' and public.heeft_project((storage.foldername(name))[1]))
  with check (bucket_id = 'fotos' and public.heeft_project((storage.foldername(name))[1]));

notify pgrst, 'reload schema';

-- Controle
select 'beheerder' as rol, email from public.teamleden;
