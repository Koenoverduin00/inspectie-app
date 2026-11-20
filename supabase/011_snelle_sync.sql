-- =====================================================================
-- Update 011: snellere synchronisatie tussen pc en telefoon.
-- Uitvoeren na 004 (SQL Editor → Run). Het script kan veilig meerdere keren worden uitgevoerd.
--
-- Maakt alleen de functie laatste_wijziging aan. De app vraagt daarmee elke paar seconden met één klein verzoek
-- of er op de server iets is gewijzigd, en synchroniseert alleen dan. Zonder dit script controleert de app eens
-- per minuut. De functie geeft alleen een tijdstip terug (geen gegevens) en gebruikt de bestaande sync_tijd-indexen.
-- Er worden geen gegevens gewijzigd of verwijderd.
-- =====================================================================
create or replace function public.laatste_wijziging()
returns timestamptz
language plpgsql stable security definer set search_path = public
as $$
declare
  t text;
  m timestamptz;
  uit timestamptz;
begin
  if not public.is_teamlid() then
    return null;
  end if;
  foreach t in array array['projecten', 'lagen', 'objecten', 'inspecties', 'werkzaamheden', 'taken', 'werkpakketten',
                           'overgeslagen', 'vrijgaven', 'meldingen'] loop
    if to_regclass('public.' || t) is not null then
      execute format('select max(sync_tijd) from public.%I', t) into m;
      if m is not null and (uit is null or m > uit) then
        uit := m;
      end if;
    end if;
  end loop;
  return uit;
end;
$$;
revoke all on function public.laatste_wijziging() from public, anon;
grant execute on function public.laatste_wijziging() to authenticated;
