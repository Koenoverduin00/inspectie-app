-- =====================================================================
-- Update 006: accountstatus van personen (voor de pagina Personen).
-- Uitvoeren na 003 (SQL Editor → Run). Het script kan veilig meerdere keren worden uitgevoerd.
--
-- Geeft per e-mailadres alleen terug óf er een account is en wanneer iemand is uitgenodigd, het adres heeft
-- bevestigd en voor het laatst heeft ingelogd. Wachtwoorden staan versleuteld (gehasht) in Supabase en zijn
-- door niemand in te zien; deze functie geeft ze ook niet terug.
-- Alleen beheerders (tabel teamleden) krijgen resultaat; voor anderen is de uitkomst leeg.
-- =====================================================================

create or replace function public.account_status(emails text[])
returns table (email text, aangemaakt timestamptz, uitgenodigd timestamptz, bevestigd timestamptz, laatst_ingelogd timestamptz)
language sql stable security definer set search_path = public, auth
as $$
  select lower(u.email)::text, u.created_at, u.invited_at, u.email_confirmed_at, u.last_sign_in_at
  from auth.users u
  where public.is_beheerder()
    and lower(u.email) in (select lower(x) from unnest(emails) as x);
$$;

revoke all on function public.account_status(text[]) from public, anon;
grant execute on function public.account_status(text[]) to authenticated;
