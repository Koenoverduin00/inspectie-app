# Beveiligingstest voor de database (RLS)

Deze map test de toegangsregels van de Supabase-database op een gewone PostgreSQL 16, met een kleine nabootsing
van Supabase (`supabase-shim.sql`: rollen `anon`/`authenticated`, `auth.jwt()`, `auth.users`, `storage.objects`).

`run.sh` maakt een verse database, voert `schema.sql` en alle updates (002 t/m 012) uit, zet een beginsituatie neer,
draait update 013 twee keer (moet herhaalbaar zijn) en voert daarna `013_bedrijven_test.sql` uit. Daarna volgt
update 014 (ook twee keer) met `014_werkpunten_test.sql`: werklocaties volgen dezelfde scheiding per bedrijf en project. Die controleert
onder andere dat een beheerder van bedrijf B niets van bedrijf A kan zien of wijzigen (projecten, gegevens, foto's,
personen, profielen), dat een project niet naar een ander bedrijf kan verhuizen en dat een e-mailadres maar bij één
bedrijf hoort.

```bash
export PGTEST=/var/tmp/pgtest
mkdir -p $PGTEST && chown postgres $PGTEST
su postgres -c "/usr/lib/postgresql/16/bin/initdb -D $PGTEST/data -A trust -U postgres"
su postgres -c "/usr/lib/postgresql/16/bin/pg_ctl -D $PGTEST/data -o '-p 54330 -k $PGTEST' -l $PGTEST/log start"
supabase/tests/run.sh      # eindigt met: ALLE CONTROLES GESLAAGD
```
