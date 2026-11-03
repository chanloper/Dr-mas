\set ON_ERROR_STOP on
\set VERBOSITY terse
begin;
set local statement_timeout='45s';
set local lock_timeout='35s';
\ir guard.sql
do $$ begin if (select count(*) from drmas_reconnect_race.manifest where patient='74000000-0000-0000-0000-000000000001' and guardian='74000000-0000-0000-0000-000000000002')<>1 then raise exception 'FAIL race_manifest'; end if; end $$;
-- Only after both session processes have exited, including failure cases.
do $$ begin
 if exists(select 1 from pg_stat_activity where pid<>pg_backend_pid() and application_name in ('drmas_reconnect_race_A','drmas_reconnect_race_B'))
 or exists(select 1 from public.care_links where (patient_id in ('74000000-0000-0000-0000-000000000001','74000000-0000-0000-0000-000000000002') or guardian_id in ('74000000-0000-0000-0000-000000000001','74000000-0000-0000-0000-000000000002')) and not(patient_id='74000000-0000-0000-0000-000000000001' and guardian_id='74000000-0000-0000-0000-000000000002'))
 or exists(select 1 from public.medications where patient_id in ('74000000-0000-0000-0000-000000000001','74000000-0000-0000-0000-000000000002'))
 or exists(select 1 from public.medication_records where patient_id in ('74000000-0000-0000-0000-000000000001','74000000-0000-0000-0000-000000000002')) then raise exception 'FAIL cleanup_scope'; end if;
end $$;
delete from public.care_links where patient_id='74000000-0000-0000-0000-000000000001' and guardian_id='74000000-0000-0000-0000-000000000002';
delete from public.profiles where id in ('74000000-0000-0000-0000-000000000001','74000000-0000-0000-0000-000000000002');
delete from auth.users where id in ('74000000-0000-0000-0000-000000000001','74000000-0000-0000-0000-000000000002');
drop table drmas_reconnect_race.manifest;
drop schema drmas_reconnect_race;
commit;
\echo PASS race_fixtures_removed
