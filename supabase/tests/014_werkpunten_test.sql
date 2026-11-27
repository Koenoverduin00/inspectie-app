-- Beveiligingstest update 014: werkpunten volgen de toegang tot het project (draait na 013_bedrijven_test.sql).
\set ON_ERROR_STOP 1
reset role;
insert into public.werkpunten (id, project_id, data, gewijzigd) values ('wpB', 'pB', '{"status":"open"}', now()) on conflict do nothing;
insert into public.werkpunten (id, project_id, data, gewijzigd) values ('wpA', 'pA', '{"status":"open"}', now()) on conflict do nothing;
set role authenticated;
select set_config('request.jwt.claims', '{"email":"beheer@b.nl"}', false);
select public.t_is('beheerder B ziet alleen werkpunten van bedrijf B', public.t_ids('werkpunten'), 'wpB');
select public.t_is('beheerder B kan werkpunt B bijwerken', public.t_fout($$update public.werkpunten set data = '{"status":"gedaan"}' where id = 'wpB'$$), 'GEEN FOUT');
select public.t_is('beheerder B kan geen werkpunt in project A maken', (public.t_fout($$insert into public.werkpunten (id, project_id, data, gewijzigd) values ('wpX', 'pA', '{}', now())$$) <> 'GEEN FOUT')::text, 'true');
select set_config('request.jwt.claims', '{"email":"beheer@a.nl"}', false);
select public.t_is('beheerder A ziet werkpunt B niet', (public.t_ids('werkpunten') not like '%wpB%')::text, 'true');
select set_config('request.jwt.claims', '{"email":"vreemde@x.nl"}', false);
select public.t_is('buitenstaander ziet niets', public.t_ids('werkpunten'), '');
select set_config('request.jwt.claims', '{"email":"eigenaar@platform.nl"}', false);
select public.t_is('platformbeheerder ziet alles', public.t_ids('werkpunten'), 'wpA,wpB');
select public.t_is('laatste_wijziging werkt', (public.laatste_wijziging() is not null)::text, 'true');
reset role;
select 'ALLE CONTROLES 014 GESLAAGD';
