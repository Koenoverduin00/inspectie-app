-- =====================================================================
-- Update 014: werklocaties uit het koppelschema (schouw/inspectie → werkpakket).
-- Uitvoeren na 013 (SQL Editor → Run). Het script kan veilig meerdere keren worden uitgevoerd.
-- Maakt alleen een nieuwe tabel aan; bestaande gegevens worden niet gewijzigd.
-- Elk doorgezet gebrek is één regel (vaste sleutel inspectie:gebrek:relatie), met status en besluit.
-- =====================================================================
create table if not exists public.werkpunten (
  id             text primary key,
  project_id     text,
  data           jsonb not null default '{}'::jsonb,
  gewijzigd      timestamptz not null,
  verwijderd     boolean not null default false,
  sync_tijd      timestamptz not null default clock_timestamp(),
  gewijzigd_door uuid
);
create index if not exists werkpunten_project_idx on public.werkpunten (project_id);
create index if not exists werkpunten_sync_tijd_idx on public.werkpunten (sync_tijd);
alter table public.werkpunten enable row level security;
revoke all on public.werkpunten from anon;
grant select, insert, update on public.werkpunten to authenticated;

-- Zelfde toegang als de andere projectgegevens: platformbeheerder, of lid/beheerder van het project binnen het eigen bedrijf.
drop policy if exists project_toegang on public.werkpunten;
create policy project_toegang on public.werkpunten for all to authenticated
  using ((select public.is_platformbeheerder()) or public.heeft_toegang(project_id))
  with check ((select public.is_platformbeheerder()) or public.heeft_toegang(project_id));

drop trigger if exists bij_wijziging on public.werkpunten;
create trigger bij_wijziging before insert or update on public.werkpunten
  for each row execute function public.bij_wijziging();

-- Snelle synchronisatie: ook wijzigingen in werkpunten tellen mee.
create or replace function public.laatste_wijziging()
returns timestamptz language plpgsql stable security definer set search_path = public
as $$
declare t text; m timestamptz; uit timestamptz;
begin
  if not (public.is_platformbeheerder() or public.mijn_bedrijf() is not null) then return null; end if;
  foreach t in array array['projecten', 'lagen', 'objecten', 'inspecties', 'werkzaamheden', 'taken', 'werkpakketten',
                           'overgeslagen', 'vrijgaven', 'meldingen', 'werkpunten'] loop
    if to_regclass('public.' || t) is not null then
      execute format('select max(sync_tijd) from public.%I', t) into m;
      if m is not null and (uit is null or m > uit) then uit := m; end if;
    end if;
  end loop;
  return uit;
end;
$$;
revoke all on function public.laatste_wijziging() from public, anon;
grant execute on function public.laatste_wijziging() to authenticated;

notify pgrst, 'reload schema';
select count(*) as werkpunten from public.werkpunten;
