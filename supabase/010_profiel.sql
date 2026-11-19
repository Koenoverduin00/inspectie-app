-- =====================================================================
-- Update 010: naam en organisatie van een account (vastgelegd bij de eerste inlog).
-- Uitvoeren na 006 (SQL Editor → Run). Het script kan veilig meerdere keren worden uitgevoerd.
--
-- 1. account_status geeft beheerders ook de naam en organisatie terug die iemand bij de eerste inlog invulde.
-- 2. zet_profiel laat een beheerder (tabel teamleden) die gegevens corrigeren. Medewerkers kunnen ze in de app
--    niet meer wijzigen nadat ze zijn vastgelegd.
-- Er worden geen gegevens verwijderd; alleen deze twee functies worden (opnieuw) aangemaakt.
-- =====================================================================
drop function if exists public.account_status(text[]);
create function public.account_status(emails text[])
returns table (email text, aangemaakt timestamptz, uitgenodigd timestamptz, bevestigd timestamptz, laatst_ingelogd timestamptz,
               naam text, organisatie text)
language sql stable security definer set search_path = public, auth
as $$
  select lower(u.email)::text, u.created_at, u.invited_at, u.email_confirmed_at, u.last_sign_in_at,
         u.raw_user_meta_data ->> 'naam', u.raw_user_meta_data ->> 'organisatie'
  from auth.users u
  where public.is_beheerder()
    and lower(u.email) in (select lower(x) from unnest(emails) as x);
$$;
revoke all on function public.account_status(text[]) from public, anon;
grant execute on function public.account_status(text[]) to authenticated;

create or replace function public.zet_profiel(p_email text, p_naam text, p_organisatie text)
returns void
language plpgsql security definer set search_path = public, auth
as $$
begin
  if not public.is_beheerder() then
    raise exception 'Alleen beheerders kunnen gegevens van anderen aanpassen';
  end if;
  update auth.users
     set raw_user_meta_data = coalesce(raw_user_meta_data, '{}'::jsonb)
                              || jsonb_build_object('naam', p_naam, 'organisatie', p_organisatie)
   where lower(email) = lower(p_email);
end;
$$;
revoke all on function public.zet_profiel(text, text, text) from public, anon;
grant execute on function public.zet_profiel(text, text, text) to authenticated;

notify pgrst, 'reload schema';
