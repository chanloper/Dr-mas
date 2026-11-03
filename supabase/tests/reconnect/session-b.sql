\set ON_ERROR_STOP on
\set VERBOSITY terse
begin;
set local statement_timeout='45s';
set local lock_timeout='35s';
\ir guard.sql
do $$ begin if (select count(*) from drmas_reconnect_race.manifest where patient='74000000-0000-0000-0000-000000000001' and guardian='74000000-0000-0000-0000-000000000002')<>1 then raise exception 'FAIL race_manifest'; end if; end $$;
set local application_name='drmas_reconnect_race_B';
set local role authenticated;
do $$ begin
 perform set_config('request.jwt.claim.sub','74000000-0000-0000-0000-000000000002',true);
 begin perform public.request_care_link('74000000-0000-0000-0000-000000000001');
 exception when unique_violation then perform set_config('drmas_test.race_duplicate','yes',true); end;
 if current_setting('drmas_test.race_duplicate',true) is distinct from 'yes' then raise exception 'FAIL duplicate_not_rejected'; end if;
 raise notice 'PASS concurrent_duplicate_23505'; end $$;
reset role;
update drmas_reconnect_race.manifest set b_duplicate=true;
commit;
\echo PASS session_B_committed
