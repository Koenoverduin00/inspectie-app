-- =====================================================================
-- Update 007: opdrachtgever ziet alleen geaccepteerde registraties.
-- Uitvoeren na 003 (SQL Editor → Run). Het script kan veilig meerdere keren worden uitgevoerd.
--
-- Een projectlid is opdrachtgever als in het project data->'ledenInfo'->'<e-mail>'->>'rol' = 'opdrachtgever'
-- (in de app: Werkpakketten → Toewijzen → kolom Organisatie). Voor een opdrachtgever geeft de server
-- werkzaamheden en inspecties pas terug als ze door de opdrachtnemer zijn goedgekeurd:
--   * beoordeling.status = 'goedgekeurd' (registraties van vóór de goedkeuring – zonder beoordeling – tellen als goedgekeurd);
--   * inspecties bovendien alleen als ze zijn afgerond (geen concepten);
--   * eigen registraties (beoordeling.ingediendDoor = eigen e-mailadres) blijven zichtbaar.
-- Beheerders (tabel teamleden) en opdrachtnemers zien alles in hun projecten, zoals voorheen.
-- =====================================================================

create or replace function public.is_opdrachtgever(pid text)
returns boolean language sql stable security definer set search_path = public
as $$
  select not public.is_beheerder() and exists (
    select 1 from public.projecten p
    where p.id = pid and not p.verwijderd
      and p.data -> 'ledenInfo' -> public.mijn_email() ->> 'rol' = 'opdrachtgever'
  );
$$;

revoke all on function public.is_opdrachtgever(text) from public, anon;
grant execute on function public.is_opdrachtgever(text) to authenticated;

do $$
declare t text;
begin
  foreach t in array array['werkzaamheden', 'inspecties'] loop
    execute format('drop policy if exists project_toegang on public.%I', t);
    execute format('drop policy if exists teamleden_toegang on public.%I', t);
    execute format('drop policy if exists reg_lezen on public.%I', t);
    execute format('drop policy if exists reg_toevoegen on public.%I', t);
    execute format('drop policy if exists reg_wijzigen on public.%I', t);
    -- Lezen: projectleden; een opdrachtgever alleen wat geaccepteerd is (of zelf ingediend).
    execute format($f$
      create policy reg_lezen on public.%I for select to authenticated
      using (
        public.heeft_project(project_id) and (
          not public.is_opdrachtgever(project_id)
          or lower(coalesce(data -> 'beoordeling' ->> 'ingediendDoor', '')) = public.mijn_email()
          or (coalesce(data -> 'beoordeling' ->> 'status', 'goedgekeurd') = 'goedgekeurd'
              and (%L <> 'inspecties' or data ->> 'status' = 'afgerond'))
        )
      )$f$, t, t);
    -- Toevoegen en wijzigen: zoals voorheen, alle projectleden.
    execute format('create policy reg_toevoegen on public.%I for insert to authenticated
                    with check (public.heeft_project(project_id))', t);
    execute format('create policy reg_wijzigen on public.%I for update to authenticated
                    using (public.heeft_project(project_id)) with check (public.heeft_project(project_id))', t);
  end loop;
end $$;
