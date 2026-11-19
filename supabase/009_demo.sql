-- =====================================================================
-- Update 009: demo-accounts verlopen ook op de server.
-- Uitvoeren na 003 (SQL Editor → Run). Het script kan veilig meerdere keren worden uitgevoerd.
-- Wijzigt alleen de functie heeft_project: een projectlid met rol 'demo' en een verlopen einddatum
-- (data->'ledenInfo'->'<e-mail>'->>'verlooptOp') heeft geen toegang meer tot de inhoud van dat project.
-- Er worden geen gegevens gewijzigd of verwijderd.
-- =====================================================================
create or replace function public.heeft_project(pid text)
returns boolean language sql stable security definer set search_path = public
as $$
  select public.is_beheerder() or exists (
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
revoke all on function public.heeft_project(text) from public, anon;
grant execute on function public.heeft_project(text) to authenticated;
