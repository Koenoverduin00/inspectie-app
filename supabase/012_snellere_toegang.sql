-- =====================================================================
-- Update 012: lichtere toegangscontrole (RLS), zodat de database ook bij veel gegevens snel blijft.
-- Uitvoeren na 003, 004, 005, 007, 008 en 009 (SQL Editor → Run). Het script kan veilig meerdere keren worden uitgevoerd.
--
-- Wie wat mag zien en wijzigen blijft precies hetzelfde. Alleen de manier van controleren verandert:
--   * "Ben ik beheerder?" wordt nog maar één keer per opdracht bepaald in plaats van voor elke rij;
--   * voor projectleden is er één functie (is_lid_van) in plaats van een stapel geneste functies per rij.
-- Er worden geen gegevens gewijzigd of verwijderd.
-- =====================================================================

-- Lid van dit project (zonder de beheerderscontrole), met de vervaldatum van demo-accounts uit update 009.
create or replace function public.is_lid_van(pid text)
returns boolean language sql stable security definer set search_path = public
as $$
  select exists (
    select 1 from public.projecten p
    where p.id = pid and not p.verwijderd
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
revoke all on function public.is_lid_van(text) from public, anon;
grant execute on function public.is_lid_van(text) to authenticated;

-- heeft_project blijft bestaan (foto-opslag en oudere scripts gebruiken hem) met dezelfde betekenis.
create or replace function public.heeft_project(pid text)
returns boolean language sql stable security definer set search_path = public
as $$ select public.is_beheerder() or public.is_lid_van(pid) $$;
revoke all on function public.heeft_project(text) from public, anon;
grant execute on function public.heeft_project(text) to authenticated;

-- Beheerders zien alles: de controle (select …) wordt één keer per opdracht uitgerekend.
do $$
declare t text;
begin
  foreach t in array array['lagen', 'objecten', 'taken', 'werkpakketten', 'overgeslagen', 'vrijgaven', 'meldingen'] loop
    if to_regclass('public.' || t) is null then continue; end if;
    execute format('drop policy if exists project_toegang on public.%I', t);
    execute format('create policy project_toegang on public.%I for all to authenticated
                    using ((select public.is_beheerder()) or public.is_lid_van(project_id))
                    with check ((select public.is_beheerder()) or public.is_lid_van(project_id))', t);
  end loop;

  -- Werkzaamheden en inspecties: opdrachtgevers zien alleen wat geaccepteerd is (update 007), verder hetzelfde als hierboven.
  foreach t in array array['werkzaamheden', 'inspecties'] loop
    execute format('drop policy if exists reg_lezen on public.%I', t);
    execute format('drop policy if exists reg_toevoegen on public.%I', t);
    execute format('drop policy if exists reg_wijzigen on public.%I', t);
    execute format('drop policy if exists project_toegang on public.%I', t);
    execute format('drop policy if exists teamleden_toegang on public.%I', t);
    execute format($f$
      create policy reg_lezen on public.%I for select to authenticated
      using (
        (select public.is_beheerder())
        or (public.is_lid_van(project_id) and (
          not public.is_opdrachtgever(project_id)
          or lower(coalesce(data -> 'beoordeling' ->> 'ingediendDoor', '')) = (select public.mijn_email())
          or (coalesce(data -> 'beoordeling' ->> 'status', 'goedgekeurd') = 'goedgekeurd'
              and (%L <> 'inspecties' or data ->> 'status' = 'afgerond'))
        ))
      )$f$, t, t);
    execute format('create policy reg_toevoegen on public.%I for insert to authenticated
                    with check ((select public.is_beheerder()) or public.is_lid_van(project_id))', t);
    execute format('create policy reg_wijzigen on public.%I for update to authenticated
                    using ((select public.is_beheerder()) or public.is_lid_van(project_id))
                    with check ((select public.is_beheerder()) or public.is_lid_van(project_id))', t);
  end loop;
end $$;

-- Projecten: leden zien hun project; alleen beheerders maken en wijzigen projecten.
drop policy if exists project_lezen on public.projecten;
create policy project_lezen on public.projecten for select to authenticated
  using ((select public.is_beheerder()) or coalesce(data -> 'leden', '[]'::jsonb) ? (select public.mijn_email()));
drop policy if exists project_beheren on public.projecten;
create policy project_beheren on public.projecten for insert to authenticated
  with check ((select public.is_beheerder()));
drop policy if exists project_wijzigen on public.projecten;
create policy project_wijzigen on public.projecten for update to authenticated
  using ((select public.is_beheerder())) with check ((select public.is_beheerder()));

-- Opruimen en statistieken bijwerken, zodat de database de snelste weg kiest.
analyze public.projecten, public.objecten, public.inspecties, public.werkzaamheden, public.werkpakketten;
