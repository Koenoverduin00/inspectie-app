-- =====================================================================
-- Update 013: bedrijven (aparte omgevingen per bedrijf in één database).
-- Uitvoeren na 012 (SQL Editor → Run). Het script kan veilig meerdere keren worden uitgevoerd.
--
-- Rollen:
--   * platformbeheerder – e-mailadres staat in public.teamleden (zoals voorheen de beheerders): ziet en beheert alle
--                         bedrijven, projecten en personen;
--   * bedrijfsbeheerder – staat in public.bedrijfsleden met rol 'beheerder': beheert alleen het eigen bedrijf
--                         (projecten, personen, bibliotheek);
--   * gebruiker         – staat in public.bedrijfsleden met rol 'lid': ziet alleen de projecten van het eigen bedrijf
--                         waar hij lid van is (zoals voorheen).
-- Elk e-mailadres hoort bij precies één bedrijf (sleutel op e-mail). Voor een ander bedrijf is een aparte uitnodiging
-- met een ander e-mailadres nodig.
--
-- Bestaande gegevens: alle projecten komen in het bedrijf 'bedrijf-1' (naam aan te passen in de app); alle huidige
-- projectleden worden lid van dat bedrijf. Er wordt niets verwijderd.
--
-- LET OP: iedereen in public.teamleden is daarna platformbeheerder en ziet alle bedrijven. Zie stap 7 onderaan om
-- collega's die alleen het eigen bedrijf mogen beheren om te zetten naar bedrijfsbeheerder.
-- =====================================================================

-- 1. Tabellen. Geen policies: lezen en wijzigen gaat alleen via de functies hieronder.
create table if not exists public.bedrijven (
  id         text primary key,
  naam       text not null,
  aangemaakt timestamptz not null default now(),
  verwijderd boolean not null default false
);
alter table public.bedrijven enable row level security;
revoke all on public.bedrijven from anon, authenticated;

create table if not exists public.bedrijfsleden (
  email      text primary key,                                   -- één bedrijf per e-mailadres
  bedrijf_id text not null references public.bedrijven (id),
  rol        text not null default 'lid' check (rol in ('lid', 'beheerder')),
  toegevoegd timestamptz not null default now()
);
create index if not exists bedrijfsleden_bedrijf_idx on public.bedrijfsleden (bedrijf_id);
alter table public.bedrijfsleden enable row level security;
revoke all on public.bedrijfsleden from anon, authenticated;

alter table public.projecten add column if not exists bedrijf_id text;
create index if not exists projecten_bedrijf_idx on public.projecten (bedrijf_id);

-- 2. Wie ben ik?
create or replace function public.is_platformbeheerder()
returns boolean language sql stable security definer set search_path = public
as $$ select exists (select 1 from public.teamleden where lower(email) = public.mijn_email()) $$;

create or replace function public.mijn_bedrijf()
returns text language sql stable security definer set search_path = public
as $$ select bedrijf_id from public.bedrijfsleden where email = public.mijn_email() $$;

create or replace function public.is_bedrijfsbeheerder()
returns boolean language sql stable security definer set search_path = public
as $$ select exists (select 1 from public.bedrijfsleden where email = public.mijn_email() and rol = 'beheerder') $$;

-- is_beheerder blijft "ziet alles" en betekent vanaf nu: platformbeheerder (zelfde definitie als voorheen).
create or replace function public.is_beheerder()
returns boolean language sql stable security definer set search_path = public
as $$ select public.is_platformbeheerder() $$;

-- Lid van dit project: alleen binnen het eigen bedrijf (met de vervaldatum van demo-accounts uit update 009).
create or replace function public.is_lid_van(pid text)
returns boolean language sql stable security definer set search_path = public
as $$
  select exists (
    select 1 from public.projecten p
    where p.id = pid and not p.verwijderd
      and p.bedrijf_id is not null and p.bedrijf_id = public.mijn_bedrijf()
      and coalesce(p.data -> 'leden', '[]'::jsonb) ? public.mijn_email()
      and not (
        case
          when coalesce(p.data -> 'ledenInfo' -> public.mijn_email() ->> 'rol', '') = 'demo'
               and coalesce(p.data -> 'ledenInfo' -> public.mijn_email() ->> 'verlooptOp', '') ~ '^\d{4}-\d{2}-\d{2}$'
            then (p.data -> 'ledenInfo' -> public.mijn_email() ->> 'verlooptOp')::date < current_date
          else false
        end
      )
  );
$$;

-- Bedrijfsbeheerder van het bedrijf van dit project.
create or replace function public.beheert_project(pid text)
returns boolean language sql stable security definer set search_path = public
as $$
  select exists (
    select 1 from public.projecten p
    join public.bedrijfsleden b on b.bedrijf_id = p.bedrijf_id
    where p.id = pid and b.email = public.mijn_email() and b.rol = 'beheerder'
  );
$$;

-- Toegang tot de inhoud van een project: bedrijfsbeheerder van dat bedrijf of lid van het project.
create or replace function public.heeft_toegang(pid text)
returns boolean language sql stable security definer set search_path = public
as $$ select public.beheert_project(pid) or public.is_lid_van(pid) $$;

-- heeft_project blijft bestaan (foto-opslag en oudere scripts): platformbeheerder of toegang.
create or replace function public.heeft_project(pid text)
returns boolean language sql stable security definer set search_path = public
as $$ select public.is_platformbeheerder() or public.heeft_toegang(pid) $$;

create or replace function public.mijn_rol()
returns text language sql stable security definer set search_path = public
as $$
  select case
    when public.is_platformbeheerder() or public.is_bedrijfsbeheerder() then 'beheerder'
    when public.mijn_bedrijf() is not null then 'lid'
    else 'geen' end;
$$;

-- Opdrachtgever (update 007): nooit voor een beheerder van dat project.
create or replace function public.is_opdrachtgever(pid text)
returns boolean language sql stable security definer set search_path = public
as $$
  select not public.is_platformbeheerder() and not public.beheert_project(pid) and exists (
    select 1 from public.projecten p
    where p.id = pid and not p.verwijderd
      and p.data -> 'ledenInfo' -> public.mijn_email() ->> 'rol' = 'opdrachtgever'
  );
$$;

revoke all on function public.is_platformbeheerder(), public.mijn_bedrijf(), public.is_bedrijfsbeheerder(), public.is_beheerder(),
  public.is_lid_van(text), public.beheert_project(text), public.heeft_toegang(text), public.heeft_project(text),
  public.mijn_rol(), public.is_opdrachtgever(text) from public, anon;
grant execute on function public.is_platformbeheerder(), public.mijn_bedrijf(), public.is_bedrijfsbeheerder(), public.is_beheerder(),
  public.is_lid_van(text), public.beheert_project(text), public.heeft_toegang(text), public.heeft_project(text),
  public.mijn_rol(), public.is_opdrachtgever(text) to authenticated;

-- 3. Het bedrijf van een project bepaalt de server, niet de app: alleen de platformbeheerder kiest het bedrijf
--    (via data.bedrijfId); voor anderen is het altijd het eigen bedrijf, en een project verhuist nooit.
create or replace function public.projecten_bedrijf()
returns trigger language plpgsql security definer set search_path = public
as $$
declare ik text := public.mijn_email();
begin
  if ik = '' or public.is_platformbeheerder() then
    -- SQL-editor / serverbeheer of platformbeheerder: het bedrijf uit de gegevens (of het bestaande).
    new.bedrijf_id := coalesce(nullif(new.data ->> 'bedrijfId', ''), case when tg_op = 'UPDATE' then old.bedrijf_id end, new.bedrijf_id);
  elsif tg_op = 'UPDATE' then
    new.bedrijf_id := old.bedrijf_id;
  else
    new.bedrijf_id := public.mijn_bedrijf();
  end if;
  if new.bedrijf_id is not null then
    new.data := jsonb_set(coalesce(new.data, '{}'::jsonb), '{bedrijfId}', to_jsonb(new.bedrijf_id));
  end if;
  return new;
end;
$$;
drop trigger if exists projecten_bedrijf on public.projecten;
create trigger projecten_bedrijf before insert or update on public.projecten
  for each row execute function public.projecten_bedrijf();

-- 4. Toegangsregels (RLS) met de bedrijfscontrole.
drop policy if exists project_lezen on public.projecten;
create policy project_lezen on public.projecten for select to authenticated
  using ((select public.is_platformbeheerder())
         or (bedrijf_id is not null and bedrijf_id = (select public.mijn_bedrijf())
             and ((select public.is_bedrijfsbeheerder()) or coalesce(data -> 'leden', '[]'::jsonb) ? (select public.mijn_email()))));
drop policy if exists project_beheren on public.projecten;
create policy project_beheren on public.projecten for insert to authenticated
  with check ((select public.is_platformbeheerder())
              or ((select public.is_bedrijfsbeheerder()) and bedrijf_id is not null and bedrijf_id = (select public.mijn_bedrijf())));
drop policy if exists project_wijzigen on public.projecten;
create policy project_wijzigen on public.projecten for update to authenticated
  using ((select public.is_platformbeheerder())
         or ((select public.is_bedrijfsbeheerder()) and bedrijf_id = (select public.mijn_bedrijf())))
  with check ((select public.is_platformbeheerder())
              or ((select public.is_bedrijfsbeheerder()) and bedrijf_id = (select public.mijn_bedrijf())));

do $$
declare t text;
begin
  foreach t in array array['lagen', 'objecten', 'taken', 'werkpakketten', 'overgeslagen', 'vrijgaven', 'meldingen'] loop
    if to_regclass('public.' || t) is null then continue; end if;
    execute format('drop policy if exists project_toegang on public.%I', t);
    execute format('create policy project_toegang on public.%I for all to authenticated
                    using ((select public.is_platformbeheerder()) or public.heeft_toegang(project_id))
                    with check ((select public.is_platformbeheerder()) or public.heeft_toegang(project_id))', t);
  end loop;

  foreach t in array array['werkzaamheden', 'inspecties'] loop
    execute format('drop policy if exists reg_lezen on public.%I', t);
    execute format('drop policy if exists reg_toevoegen on public.%I', t);
    execute format('drop policy if exists reg_wijzigen on public.%I', t);
    execute format('drop policy if exists project_toegang on public.%I', t);
    execute format('drop policy if exists teamleden_toegang on public.%I', t);
    execute format($f$
      create policy reg_lezen on public.%I for select to authenticated
      using (
        (select public.is_platformbeheerder())
        or public.beheert_project(project_id)
        or (public.is_lid_van(project_id) and (
          not public.is_opdrachtgever(project_id)
          or lower(coalesce(data -> 'beoordeling' ->> 'ingediendDoor', '')) = (select public.mijn_email())
          or (coalesce(data -> 'beoordeling' ->> 'status', 'goedgekeurd') = 'goedgekeurd'
              and (%L <> 'inspecties' or data ->> 'status' = 'afgerond'))
        ))
      )$f$, t, t);
    execute format('create policy reg_toevoegen on public.%I for insert to authenticated
                    with check ((select public.is_platformbeheerder()) or public.heeft_toegang(project_id))', t);
    execute format('create policy reg_wijzigen on public.%I for update to authenticated
                    using ((select public.is_platformbeheerder()) or public.heeft_toegang(project_id))
                    with check ((select public.is_platformbeheerder()) or public.heeft_toegang(project_id))', t);
  end loop;
end $$;
-- Foto's: de bestaande regel gebruikt heeft_project en volgt dus vanzelf de bedrijfscontrole.

-- 5. Personen: accountstatus en profiel alleen voor je eigen bedrijf (platformbeheerder: iedereen).
drop function if exists public.account_status(text[]);
create function public.account_status(emails text[])
returns table (email text, aangemaakt timestamptz, uitgenodigd timestamptz, bevestigd timestamptz, laatst_ingelogd timestamptz,
               naam text, organisatie text)
language sql stable security definer set search_path = public, auth
as $$
  select lower(u.email)::text, u.created_at, u.invited_at, u.email_confirmed_at, u.last_sign_in_at,
         u.raw_user_meta_data ->> 'naam', u.raw_user_meta_data ->> 'organisatie'
  from auth.users u
  where lower(u.email) in (select lower(x) from unnest(emails) as x)
    and (public.is_platformbeheerder()
         or (public.is_bedrijfsbeheerder()
             and exists (select 1 from public.bedrijfsleden b where b.email = lower(u.email) and b.bedrijf_id = public.mijn_bedrijf())));
$$;
revoke all on function public.account_status(text[]) from public, anon;
grant execute on function public.account_status(text[]) to authenticated;

create or replace function public.zet_profiel(p_email text, p_naam text, p_organisatie text)
returns void language plpgsql security definer set search_path = public, auth
as $$
begin
  if not (public.is_platformbeheerder()
          or (public.is_bedrijfsbeheerder()
              and exists (select 1 from public.bedrijfsleden b where b.email = lower(p_email) and b.bedrijf_id = public.mijn_bedrijf()))) then
    raise exception 'Alleen beheerders van het eigen bedrijf kunnen gegevens van anderen aanpassen';
  end if;
  update auth.users
     set raw_user_meta_data = coalesce(raw_user_meta_data, '{}'::jsonb) || jsonb_build_object('naam', p_naam, 'organisatie', p_organisatie)
   where lower(email) = lower(p_email);
end;
$$;
revoke all on function public.zet_profiel(text, text, text) from public, anon;
grant execute on function public.zet_profiel(text, text, text) to authenticated;

-- Snelle synchronisatie (update 011): ook voor bedrijfsleden.
create or replace function public.laatste_wijziging()
returns timestamptz language plpgsql stable security definer set search_path = public
as $$
declare t text; m timestamptz; uit timestamptz;
begin
  if not (public.is_platformbeheerder() or public.mijn_bedrijf() is not null) then return null; end if;
  foreach t in array array['projecten', 'lagen', 'objecten', 'inspecties', 'werkzaamheden', 'taken', 'werkpakketten',
                           'overgeslagen', 'vrijgaven', 'meldingen'] loop
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

-- 6. Functies voor de app: bedrijven en bedrijfsleden beheren.
-- Mijn bedrijf: id, naam, rol en of ik platformbeheerder ben.
create or replace function public.mijn_bedrijf_info()
returns jsonb language sql stable security definer set search_path = public
as $$
  select jsonb_build_object(
    'platform', public.is_platformbeheerder(),
    'bedrijfId', b.id, 'naam', b.naam,
    'rol', coalesce(l.rol, case when public.is_platformbeheerder() then 'beheerder' end))
  from (select 1) x
  left join public.bedrijfsleden l on l.email = public.mijn_email()
  left join public.bedrijven b on b.id = l.bedrijf_id;
$$;

-- Bedrijven: platformbeheerder alle, bedrijfsbeheerder alleen het eigen bedrijf.
create or replace function public.bedrijven_lijst()
returns table (id text, naam text, aangemaakt timestamptz, beheerders bigint, leden bigint, projecten bigint)
language sql stable security definer set search_path = public
as $$
  select b.id, b.naam, b.aangemaakt,
    (select count(*) from public.bedrijfsleden l where l.bedrijf_id = b.id and l.rol = 'beheerder'),
    (select count(*) from public.bedrijfsleden l where l.bedrijf_id = b.id),
    (select count(*) from public.projecten p where p.bedrijf_id = b.id and not p.verwijderd and coalesce(p.data ->> 'soort', '') <> 'bibliotheek')
  from public.bedrijven b
  where not b.verwijderd and (public.is_platformbeheerder() or (public.is_bedrijfsbeheerder() and b.id = public.mijn_bedrijf()))
  order by b.naam;
$$;

-- Bedrijf aanmaken: alleen de platformbeheerder. Hernoemen: de platformbeheerder, of de beheerder van dat bedrijf.
create or replace function public.bedrijf_opslaan(p_id text, p_naam text)
returns void language plpgsql security definer set search_path = public
as $$
begin
  if not public.is_platformbeheerder() then
    if public.is_bedrijfsbeheerder() and p_id = public.mijn_bedrijf() then
      if coalesce(trim(p_naam), '') = '' then raise exception 'Vul de naam van het bedrijf in'; end if;
      update public.bedrijven set naam = trim(p_naam) where id = p_id;
      return;
    end if;
    raise exception 'Alleen de platformbeheerder kan bedrijven beheren';
  end if;
  if coalesce(trim(p_naam), '') = '' then raise exception 'Vul de naam van het bedrijf in'; end if;
  insert into public.bedrijven (id, naam) values (p_id, trim(p_naam))
  on conflict (id) do update set naam = excluded.naam, verwijderd = false;
end;
$$;

-- Personen van een bedrijf (platformbeheerder: elk bedrijf; bedrijfsbeheerder: alleen het eigen).
create or replace function public.bedrijf_leden(p_bedrijf text default null)
returns table (email text, bedrijf_id text, rol text, toegevoegd timestamptz)
language sql stable security definer set search_path = public
as $$
  select l.email, l.bedrijf_id, l.rol, l.toegevoegd from public.bedrijfsleden l
  where (public.is_platformbeheerder() and (p_bedrijf is null or l.bedrijf_id = p_bedrijf))
     or (not public.is_platformbeheerder() and public.is_bedrijfsbeheerder() and l.bedrijf_id = public.mijn_bedrijf())
  order by l.rol desc, l.email;
$$;

-- Persoon aan een bedrijf koppelen (of de rol wijzigen). Een e-mailadres hoort bij maar één bedrijf.
-- Zonder rol (null): nieuw als 'lid', een bestaande rol blijft staan.
create or replace function public.zet_bedrijfslid(p_email text, p_rol text default null, p_bedrijf text default null)
returns void language plpgsql security definer set search_path = public
as $$
declare doel text; huidig text;
begin
  p_email := lower(trim(p_email));
  if p_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then raise exception 'Ongeldig e-mailadres: %', p_email; end if;
  if p_rol is not null and p_rol not in ('lid', 'beheerder') then raise exception 'Onbekende rol: %', p_rol; end if;
  if public.is_platformbeheerder() then
    doel := coalesce(p_bedrijf, public.mijn_bedrijf());
  elsif public.is_bedrijfsbeheerder() then
    doel := public.mijn_bedrijf();
    if p_bedrijf is not null and p_bedrijf <> doel then raise exception 'Je kunt alleen personen van je eigen bedrijf beheren'; end if;
  else
    raise exception 'Alleen beheerders kunnen personen toevoegen';
  end if;
  if doel is null or not exists (select 1 from public.bedrijven where id = doel and not verwijderd) then
    raise exception 'Onbekend bedrijf';
  end if;
  select bedrijf_id into huidig from public.bedrijfsleden where email = p_email;
  if huidig is not null and huidig <> doel then
    raise exception 'Dit e-mailadres hoort al bij een ander bedrijf. Gebruik een ander e-mailadres (aparte uitnodiging).';
  end if;
  insert into public.bedrijfsleden (email, bedrijf_id, rol) values (p_email, doel, coalesce(p_rol, 'lid'))
  on conflict (email) do update set rol = coalesce(p_rol, public.bedrijfsleden.rol);
end;
$$;

-- Persoon uit een bedrijf halen. Zijn projectlidmaatschappen tellen daarna niet meer (ook niet als ze in de
-- ledenlijst blijven staan). Een bedrijfsbeheerder kan zichzelf niet verwijderen.
create or replace function public.verwijder_bedrijfslid(p_email text)
returns void language plpgsql security definer set search_path = public
as $$
declare b text;
begin
  p_email := lower(trim(p_email));
  select bedrijf_id into b from public.bedrijfsleden where email = p_email;
  if b is null then return; end if;
  if not (public.is_platformbeheerder() or (public.is_bedrijfsbeheerder() and b = public.mijn_bedrijf())) then
    raise exception 'Je kunt alleen personen van je eigen bedrijf beheren';
  end if;
  if not public.is_platformbeheerder() and p_email = public.mijn_email() then
    raise exception 'Je kunt jezelf niet uit het bedrijf verwijderen';
  end if;
  delete from public.bedrijfsleden where email = p_email;
end;
$$;

revoke all on function public.mijn_bedrijf_info(), public.bedrijven_lijst(), public.bedrijf_opslaan(text, text),
  public.bedrijf_leden(text), public.zet_bedrijfslid(text, text, text), public.verwijder_bedrijfslid(text) from public, anon;
grant execute on function public.mijn_bedrijf_info(), public.bedrijven_lijst(), public.bedrijf_opslaan(text, text),
  public.bedrijf_leden(text), public.zet_bedrijfslid(text, text, text), public.verwijder_bedrijfslid(text) to authenticated;

-- 7. Bestaande gegevens naar het eerste bedrijf.
insert into public.bedrijven (id, naam) values ('bedrijf-1', 'Mijn bedrijf') on conflict (id) do nothing;
update public.projecten set data = data || '{"bedrijfId": "bedrijf-1"}'::jsonb where bedrijf_id is null;
insert into public.bedrijfsleden (email, bedrijf_id, rol)
  select distinct lower(l.email), p.bedrijf_id, 'lid'
  from public.projecten p, jsonb_array_elements_text(coalesce(p.data -> 'leden', '[]'::jsonb)) as l(email)
  where p.bedrijf_id is not null and not p.verwijderd and l.email ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$'
on conflict (email) do nothing;

-- Collega's die alleen het eigen bedrijf mogen beheren (geen platformbeheerder): haal de twee streepjes weg,
-- vul het e-mailadres in en voer deze twee regels uit.
-- insert into public.bedrijfsleden (email, bedrijf_id, rol) values ('collega@bedrijf.nl', 'bedrijf-1', 'beheerder') on conflict (email) do update set rol = 'beheerder';
-- delete from public.teamleden where lower(email) = 'collega@bedrijf.nl';

notify pgrst, 'reload schema';

-- Controle
select 'platformbeheerder' as rol, email, null as bedrijf from public.teamleden
union all
select l.rol, l.email, b.naam from public.bedrijfsleden l join public.bedrijven b on b.id = l.bedrijf_id
order by 1, 2;
