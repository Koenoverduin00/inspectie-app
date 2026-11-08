-- =====================================================================
-- Update 004: werkpakketten en overgeslagen objecten.
-- Uitvoeren na 003_projecten_gis_taken.sql (SQL Editor → Run). Veilig opnieuw uit te voeren.
-- =====================================================================
do $$
declare t text;
begin
  foreach t in array array['werkpakketten', 'overgeslagen'] loop
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
    execute format('create index if not exists %I on public.%I (project_id)', t || '_project_idx', t);
    execute format('create index if not exists %I on public.%I (sync_tijd)', t || '_sync_tijd_idx', t);
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke all on public.%I from anon', t);
    execute format('grant select, insert, update on public.%I to authenticated', t);
    execute format('drop policy if exists project_toegang on public.%I', t);
    execute format('create policy project_toegang on public.%I for all to authenticated
                    using (public.heeft_project(project_id)) with check (public.heeft_project(project_id))', t);
    execute format('drop trigger if exists bij_wijziging on public.%I', t);
    execute format('create trigger bij_wijziging before insert or update on public.%I
                    for each row execute function public.bij_wijziging()', t);
  end loop;
end $$;

notify pgrst, 'reload schema';

select table_name from information_schema.tables where table_schema = 'public' order by 1;
