-- Beveiligingstest voor update 013 (bedrijven). Elke controle stopt het script met een duidelijke melding als hij faalt.
\set ON_ERROR_STOP 1
-- Hulpfuncties (alleen voor de test)
create or replace function public.t_fout(q text) returns text language plpgsql as $$
begin execute q; return 'GEEN FOUT'; exception when others then return sqlerrm; end $$;
grant execute on function public.t_fout(text) to authenticated;
create or replace function public.t_ids(tabel text) returns text language plpgsql as $$
declare r text; begin execute format('select coalesce(string_agg(id, '','' order by id), '''') from public.%I', tabel) into r; return r; end $$;
grant execute on function public.t_ids(text) to authenticated;
create or replace function public.t_is(wat text, kreeg text, verwacht text) returns void language plpgsql as $$
begin if kreeg is distinct from verwacht then raise exception 'MISLUKT: % → kreeg "%", verwacht "%"', wat, kreeg, verwacht; end if;
raise notice 'ok  %', wat; end $$;
grant execute on function public.t_is(text, text, text) to authenticated;
insert into auth.users (email) values ('beheer@b.nl'), ('inspecteur@b.nl'), ('beheer@a.nl'), ('vreemde@x.nl') on conflict do nothing;

-- ===== Platformbeheerder richt bedrijf B in =====
set role authenticated; select set_config('request.jwt.claims', '{"email":"eigenaar@platform.nl"}', false);
select public.bedrijf_opslaan('bedrijf-2', 'Bedrijf B');
select public.zet_bedrijfslid('beheer@b.nl', 'beheerder', 'bedrijf-2');
select public.zet_bedrijfslid('inspecteur@b.nl', 'lid', 'bedrijf-2');
select public.zet_bedrijfslid('beheer@a.nl', 'beheerder', 'bedrijf-1');
insert into public.projecten (id, data, gewijzigd) values ('pB', '{"naam":"Project B","bedrijfId":"bedrijf-2","leden":["inspecteur@b.nl"]}', now());
insert into public.objecten (id, project_id, data, gewijzigd) values ('oB1', 'pB', '{"code":"B1"}', now());
select public.t_is('platform ziet alle projecten', public.t_ids('projecten'), 'bibA,pA,pB');
select public.t_is('platform: info', (public.mijn_bedrijf_info() ->> 'platform'), 'true');
select public.t_is('platform: bedrijven', (select string_agg(id, ',' order by id) from public.bedrijven_lijst()), 'bedrijf-1,bedrijf-2');
select public.t_is('platform: pB in bedrijf-2', (select bedrijf_id from public.projecten where id = 'pB'), 'bedrijf-2');
select public.t_is('e-mail in twee bedrijven geweigerd', public.t_fout($$select public.zet_bedrijfslid('inspecteur@b.nl', 'lid', 'bedrijf-1')$$),
  'Dit e-mailadres hoort al bij een ander bedrijf. Gebruik een ander e-mailadres (aparte uitnodiging).');

-- ===== Bedrijfsbeheerder B =====
reset role; set role authenticated; select set_config('request.jwt.claims', '{"email":"beheer@b.nl"}', false);
select public.t_is('B-beheerder: rol', public.mijn_rol(), 'beheerder');
select public.t_is('B-beheerder: info', public.mijn_bedrijf_info() ->> 'bedrijfId' || '/' || (public.mijn_bedrijf_info() ->> 'platform'), 'bedrijf-2/false');
select public.t_is('B-beheerder ziet alleen projecten van B', public.t_ids('projecten'), 'pB');
select public.t_is('B-beheerder ziet alleen objecten van B', public.t_ids('objecten'), 'oB1');
select public.t_is('B-beheerder ziet geen werk van A', public.t_ids('werkzaamheden'), '');
select public.t_is('B-beheerder: bedrijven', (select string_agg(id, ',') from public.bedrijven_lijst()), 'bedrijf-2');
select public.t_is('B-beheerder: personen', (select string_agg(email, ',' order by email) from public.bedrijf_leden()), 'beheer@b.nl,inspecteur@b.nl');
select public.t_is('B-beheerder: personen van A opvragen geeft alleen B', (select string_agg(email, ',' order by email) from public.bedrijf_leden('bedrijf-1')), 'beheer@b.nl,inspecteur@b.nl');
-- nieuw project met een ander bedrijf in de gegevens: de server maakt er B van
insert into public.projecten (id, data, gewijzigd) values ('pB2', '{"naam":"Poging","bedrijfId":"bedrijf-1"}', now());
reset role; select public.t_is('nieuw project van B blijft in B', (select bedrijf_id || '/' || (data ->> 'bedrijfId') from public.projecten where id = 'pB2'), 'bedrijf-2/bedrijf-2');
set role authenticated;
update public.projecten set data = data || '{"bedrijfId":"bedrijf-1"}', gewijzigd = now() where id = 'pB';
reset role; select public.t_is('project van B kan niet naar A verhuizen', (select bedrijf_id from public.projecten where id = 'pB'), 'bedrijf-2');
set role authenticated;
select public.t_is('B-beheerder kan project van A niet wijzigen',
  public.t_fout($$update public.projecten set data = data || '{"naam":"gehackt"}', gewijzigd = now() where id = 'pA'$$), 'GEEN FOUT');
reset role; select public.t_is('project A ongewijzigd', (select data ->> 'naam' from public.projecten where id = 'pA'), 'Project A');
set role authenticated;
select public.t_is('B-beheerder kan geen object in A zetten',
  public.t_fout($$insert into public.objecten (id, project_id, data, gewijzigd) values ('hack', 'pA', '{}', now())$$),
  'new row violates row-level security policy for table "objecten"');
select public.t_is('B-beheerder kan geen werk in A zetten',
  public.t_fout($$insert into public.werkzaamheden (id, project_id, data, gewijzigd) values ('hack', 'pA', '{}', now())$$),
  'new row violates row-level security policy for table "werkzaamheden"');
select public.t_is('B-beheerder ziet geen foto van A', (select count(*)::text from storage.objects where name like 'pA/%'), '0');
select public.t_is('B-beheerder kan geen foto in A zetten',
  public.t_fout($$insert into storage.objects (bucket_id, name) values ('fotos', 'pA/hack.jpg')$$),
  'new row violates row-level security policy for table "objects"');
select public.t_is('B-beheerder: persoon van A koppelen geweigerd',
  public.t_fout($$select public.zet_bedrijfslid('inspecteur@a.nl', 'lid')$$), 'Dit e-mailadres hoort al bij een ander bedrijf. Gebruik een ander e-mailadres (aparte uitnodiging).');
select public.t_is('B-beheerder: in bedrijf A koppelen geweigerd',
  public.t_fout($$select public.zet_bedrijfslid('nieuw@x.nl', 'lid', 'bedrijf-1')$$), 'Je kunt alleen personen van je eigen bedrijf beheren');
select public.t_is('B-beheerder: persoon van A verwijderen geweigerd',
  public.t_fout($$select public.verwijder_bedrijfslid('inspecteur@a.nl')$$), 'Je kunt alleen personen van je eigen bedrijf beheren');
select public.t_is('B-beheerder: zichzelf verwijderen geweigerd',
  public.t_fout($$select public.verwijder_bedrijfslid('beheer@b.nl')$$), 'Je kunt jezelf niet uit het bedrijf verwijderen');
select public.t_is('B-beheerder: eigen bedrijf hernoemen mag', public.t_fout($$select public.bedrijf_opslaan('bedrijf-2', 'Bedrijf B bv')$$), 'GEEN FOUT');
select public.t_is('B-beheerder: naam gewijzigd', (select naam from public.bedrijven_lijst() where id = 'bedrijf-2'), 'Bedrijf B bv');
select public.t_is('B-beheerder: ander bedrijf hernoemen geweigerd', public.t_fout($$select public.bedrijf_opslaan('bedrijf-1', 'Gekaapt')$$), 'Alleen de platformbeheerder kan bedrijven beheren');
reset role; select public.t_is('naam bedrijf A ongewijzigd', (select naam from public.bedrijven where id = 'bedrijf-1'), 'Mijn bedrijf');
set role authenticated;
select public.t_is('B-beheerder: geen bedrijven aanmaken',
  public.t_fout($$select public.bedrijf_opslaan('bedrijf-3', 'X')$$), 'Alleen de platformbeheerder kan bedrijven beheren');
select public.t_is('B-beheerder: accountstatus alleen eigen bedrijf',
  (select string_agg(email, ',' order by email) from public.account_status(array['inspecteur@a.nl', 'inspecteur@b.nl', 'eigenaar@platform.nl'])), 'inspecteur@b.nl');
select public.t_is('B-beheerder: profiel van A aanpassen geweigerd',
  public.t_fout($$select public.zet_profiel('inspecteur@a.nl', 'x', 'y')$$), 'Alleen beheerders van het eigen bedrijf kunnen gegevens van anderen aanpassen');
select public.t_is('B-beheerder: eigen persoon toevoegen mag', public.t_fout($$select public.zet_bedrijfslid('nieuw@b.nl', 'lid')$$), 'GEEN FOUT');
select public.zet_bedrijfslid('nieuw@b.nl', 'beheerder');
select public.zet_bedrijfslid('nieuw@b.nl', null);
select public.t_is('koppelen zonder rol laat beheerder staan', (select rol from public.bedrijf_leden() where email = 'nieuw@b.nl'), 'beheerder');
-- iemand van A in de ledenlijst van een B-project zetten geeft hem geen toegang
update public.projecten set data = data || '{"leden":["inspecteur@b.nl","inspecteur@a.nl"]}', gewijzigd = now() where id = 'pB';

-- ===== Inspecteur van A (lid) =====
reset role; set role authenticated; select set_config('request.jwt.claims', '{"email":"inspecteur@a.nl"}', false);
select public.t_is('A-lid: rol', public.mijn_rol(), 'lid');
select public.t_is('A-lid ziet alleen eigen project (ook al staat hij in de ledenlijst van B)', public.t_ids('projecten'), 'pA');
select public.t_is('A-lid ziet geen objecten van B', public.t_ids('objecten'), 'oA1');
select public.t_is('A-lid ziet de bibliotheek niet', (select count(*)::text from public.projecten where id = 'bibA'), '0');
select public.t_is('A-lid kan geen project maken',
  public.t_fout($$insert into public.projecten (id, data, gewijzigd) values ('pX', '{}', now())$$), 'new row violates row-level security policy for table "projecten"');
select public.t_is('A-lid: personen leeg', (select count(*)::text from public.bedrijf_leden()), '0');
select public.t_is('A-lid ziet foto van eigen project', (select count(*)::text from storage.objects where name like 'pA/%'), '1');

-- ===== Opdrachtgever van A =====
reset role; set role authenticated; select set_config('request.jwt.claims', '{"email":"opdrachtgever@a.nl"}', false);
select public.t_is('opdrachtgever ziet ingediend werk niet', public.t_ids('werkzaamheden'), '');

-- ===== Bedrijfsbeheerder A =====
reset role; set role authenticated; select set_config('request.jwt.claims', '{"email":"beheer@a.nl"}', false);
select public.t_is('A-beheerder ziet project en bibliotheek van A', public.t_ids('projecten'), 'bibA,pA');
select public.t_is('A-beheerder ziet ingediend werk (geen opdrachtgever)', public.t_ids('werkzaamheden'), 'wA1');
select public.t_is('A-beheerder ziet foto van A', (select count(*)::text from storage.objects where name like 'pA/%'), '1');
select public.t_is('A-beheerder kan project in A wijzigen',
  public.t_fout($$update public.projecten set data = data || '{"omschrijving":"ok"}', gewijzigd = now() where id = 'pA'$$), 'GEEN FOUT');
reset role; select public.t_is('wijziging A doorgevoerd', (select data ->> 'omschrijving' from public.projecten where id = 'pA'), 'ok');

-- ===== Iemand zonder bedrijf =====
set role authenticated; select set_config('request.jwt.claims', '{"email":"vreemde@x.nl"}', false);
select public.t_is('vreemde: rol', public.mijn_rol(), 'geen');
select public.t_is('vreemde ziet geen projecten', public.t_ids('projecten'), '');
select public.t_is('vreemde ziet geen objecten', public.t_ids('objecten'), '');
select public.t_is('vreemde: laatste wijziging leeg', coalesce(public.laatste_wijziging()::text, 'leeg'), 'leeg');

-- ===== Lid uit bedrijf B halen: verliest toegang =====
reset role; set role authenticated; select set_config('request.jwt.claims', '{"email":"inspecteur@b.nl"}', false);
select public.t_is('B-lid ziet pB', public.t_ids('projecten'), 'pB');
reset role; set role authenticated; select set_config('request.jwt.claims', '{"email":"beheer@b.nl"}', false);
select public.verwijder_bedrijfslid('inspecteur@b.nl');
reset role; set role authenticated; select set_config('request.jwt.claims', '{"email":"inspecteur@b.nl"}', false);
select public.t_is('verwijderd B-lid ziet niets meer', public.t_ids('projecten'), '');
select public.t_is('verwijderd B-lid ziet geen objecten', public.t_ids('objecten'), '');
reset role;
\echo ALLE CONTROLES GESLAAGD
