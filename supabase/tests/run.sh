#!/bin/bash
# Gebruik: start een lege PostgreSQL 16 op poort 54330 met socket in $PGTEST (zie supabase/tests/README.md) en voer dit script uit.
# Verse testdatabase: Supabase-nabootsing, alle updates, beginsituatie, update 013 (2x) en de beveiligingstest.
N=${PGTEST:-/var/tmp/pgtest}
P="psql -q -h $N -p 54330 -U postgres -v ON_ERROR_STOP=1"
$P -d postgres -c "drop database if exists test" -c "create database test" >/dev/null || exit 1
cd "$(dirname "$0")/.."
$P -d test -f tests/supabase-shim.sql >/dev/null || exit 1
for f in schema.sql 002_werkzaamheden.sql 003_projecten_gis_taken.sql 004_werkpakketten.sql 005_vrijgaven.sql 006_accountstatus.sql 007_opdrachtgever.sql 008_meldingen.sql 009_demo.sql 010_profiel.sql 011_snelle_sync.sql 012_snellere_toegang.sql; do $P -d test -f $f >/dev/null 2>&1 || { echo "FOUT in $f"; exit 1; }; done
$P -d test >/dev/null <<'SQL'
insert into public.teamleden (email) values ('eigenaar@platform.nl');
insert into auth.users (email) values ('eigenaar@platform.nl'), ('inspecteur@a.nl'), ('opdrachtgever@a.nl');
insert into public.projecten (id, data, gewijzigd) values
  ('pA', '{"naam":"Project A","leden":["inspecteur@a.nl","opdrachtgever@a.nl"],"ledenInfo":{"opdrachtgever@a.nl":{"rol":"opdrachtgever"}}}', now()),
  ('bibA', '{"naam":"Formulier X","soort":"bibliotheek"}', now());
insert into public.objecten (id, project_id, data, gewijzigd) values ('oA1', 'pA', '{"code":"A1"}', now());
insert into public.werkzaamheden (id, project_id, data, gewijzigd) values ('wA1', 'pA', '{"objectId":"oA1","beoordeling":{"status":"ingediend","ingediendDoor":"inspecteur@a.nl"}}', now());
insert into storage.objects (bucket_id, name) values ('fotos', 'pA/f1.jpg');
SQL
$P -d test -f 013_bedrijven.sql >/dev/null 2>&1 || { echo "FOUT in 013 (1e keer)"; exit 1; }
$P -d test -f 013_bedrijven.sql >/dev/null 2>&1 || { echo "FOUT in 013 (2e keer)"; exit 1; }
$P -d test -f tests/013_bedrijven_test.sql 2>&1 | grep -E "MISLUKT|ERROR|GESLAAGD|ok " | sed 's/psql:[^:]*:[0-9]*: //'
