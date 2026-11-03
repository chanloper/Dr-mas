-- Metadata and reserved-fixture counts only. No bootstrap, DDL or data changes.
\set ON_ERROR_STOP on
\set VERBOSITY terse
begin read only;
set local statement_timeout='10s';
set local lock_timeout='2s';
do $$ begin
 if current_database()<>'drmas_rls_test'
 or inet_server_addr() is distinct from '127.0.0.1'::inet
 or inet_server_port()<>55432
 or current_setting('server_version_num')::int/10000<>17
 then raise exception 'FAIL cleanup_check_target'; end if;
end $$;
with ids(id) as (values
 ('73000000-0000-0000-0000-000000000001'::uuid),
 ('73000000-0000-0000-0000-000000000002'::uuid),
 ('73000000-0000-0000-0000-000000000003'::uuid),
 ('73000000-0000-0000-0000-000000000004'::uuid),
 ('74000000-0000-0000-0000-000000000001'::uuid),
 ('74000000-0000-0000-0000-000000000002'::uuid))
select
 (select count(*) from auth.users where id in (select id from ids)) as test_users,
 (select count(*) from public.profiles where id in (select id from ids)) as test_profiles,
 (select count(*) from public.care_links where patient_id in (select id from ids)
   or guardian_id in (select id from ids) or requested_by in (select id from ids)
   or approved_by in (select id from ids)) as test_links,
 (select count(*) from public.medications where patient_id in (select id from ids)
   or id in (select id from ids)) as test_medications,
 (select count(*) from public.medication_records where patient_id in (select id from ids)
   or medication_id in (select id from ids)) as test_records,
 to_regnamespace('drmas_reconnect_test') is null as single_helpers_removed,
 to_regnamespace('drmas_reconnect_race') is null as race_helpers_removed,
 (select count(*) from pg_stat_activity where pid<>pg_backend_pid()
   and application_name in ('drmas_reconnect_race_A','drmas_reconnect_race_B')) as remaining_race_sessions;
rollback;
