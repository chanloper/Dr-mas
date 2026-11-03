\set ON_ERROR_STOP on
\set VERBOSITY terse
begin;
set local statement_timeout='45s';
set local lock_timeout='35s';
\ir guard.sql
do $$ begin if (select count(*) from drmas_reconnect_race.manifest where patient='74000000-0000-0000-0000-000000000001' and guardian='74000000-0000-0000-0000-000000000002')<>1 then raise exception 'FAIL race_manifest'; end if; end $$;
set local application_name='drmas_reconnect_race_A';
set local role authenticated;
do $$ begin perform set_config('request.jwt.claim.sub','74000000-0000-0000-0000-000000000002',true); perform public.request_care_link('74000000-0000-0000-0000-000000000001'); end $$;
reset role;
\echo READY session_A_waiting_start_B_now
-- B must actually wait on A, not merely execute sequentially.
do $$ declare deadline timestamptz:=clock_timestamp()+interval '30 seconds';
begin loop
 perform pg_stat_clear_snapshot();
 exit when exists(select 1 from pg_stat_activity s where s.application_name='drmas_reconnect_race_B' and pg_backend_pid()=any(pg_blocking_pids(s.pid)));
 if clock_timestamp()>deadline then raise exception 'FAIL concurrent_wait_not_observed'; end if;
 perform pg_sleep(0.1);
end loop;
update drmas_reconnect_race.manifest set a_observed_wait=true;
raise notice 'PASS concurrent_wait_observed'; end $$;
commit;
\echo PASS session_A_committed
