\set ON_ERROR_STOP on
\set VERBOSITY terse
begin;
set local statement_timeout='45s';
set local lock_timeout='35s';
\ir guard.sql
do $$ begin if (select count(*) from drmas_reconnect_race.manifest where patient='74000000-0000-0000-0000-000000000001' and guardian='74000000-0000-0000-0000-000000000002')<>1 then raise exception 'FAIL race_manifest'; end if; end $$;
do $$ begin
 if not (select a_observed_wait and b_duplicate from drmas_reconnect_race.manifest) then raise exception 'FAIL session_results_incomplete'; end if;
 if (select count(*) from public.care_links where patient_id='74000000-0000-0000-0000-000000000001' and guardian_id='74000000-0000-0000-0000-000000000002' and status in ('pending','approved'))<>1
 or (select count(*) from public.care_links where patient_id='74000000-0000-0000-0000-000000000001' and guardian_id='74000000-0000-0000-0000-000000000002')<>1 then raise exception 'FAIL active_pair_count'; end if;
 raise notice 'PASS real_concurrency_one_active_pair'; end $$;
rollback;
