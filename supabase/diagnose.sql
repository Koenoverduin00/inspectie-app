-- =====================================================================
-- Diagnose: waarom reageert de database traag of helemaal niet?
-- Alleen lezen: dit script wijzigt en verwijdert niets. Plak het in Supabase → SQL Editor → Run.
-- =====================================================================

-- 1. Wat draait er nu, en hoe lang al? Regels met een lange duur of 'Lock' bij wacht_op houden de rest op.
select pid,
       usename                                   as gebruiker,
       state                                     as toestand,
       wait_event_type || ': ' || wait_event     as wacht_op,
       now() - coalesce(xact_start, query_start) as duur,
       left(query, 120)                          as opdracht
from pg_stat_activity
where datname = current_database()
  and pid <> pg_backend_pid()
  and state <> 'idle'
order by duur desc nulls last;

-- 2. Wie wacht op wie (vergrendelingen)?
select w.pid                    as wachtend_pid,
       left(w.query, 80)        as wachtende_opdracht,
       b.pid                    as blokkerend_pid,
       left(b.query, 80)        as blokkerende_opdracht,
       now() - b.xact_start     as blokkeert_al
from pg_stat_activity w
join lateral unnest(pg_blocking_pids(w.pid)) as bp(pid) on true
join pg_stat_activity b on b.pid = bp.pid;

-- 3. Reageren de functies van de app? (In de SQL Editor ben je niet ingelogd: 'geen' en false zijn hier normaal.)
select public.mijn_rol() as rol, public.is_teamlid() as teamlid;

-- 4. Hoe groot zijn de tabellen?
select relname as tabel, n_live_tup as rijen, pg_size_pretty(pg_total_relation_size(relid)) as grootte
from pg_stat_user_tables
where schemaname = 'public'
order by pg_total_relation_size(relid) desc;
