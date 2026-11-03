\set ON_ERROR_STOP on
\set VERBOSITY terse
begin;
set local statement_timeout='45s';
set local lock_timeout='35s';
\ir guard.sql
create schema drmas_reconnect_race;
create table drmas_reconnect_race.manifest(patient uuid primary key,guardian uuid not null,a_observed_wait boolean not null default false,b_duplicate boolean not null default false);
do $$ begin if exists(select 1 from auth.users where id in ('74000000-0000-0000-0000-000000000001','74000000-0000-0000-0000-000000000002')) then raise exception 'FAIL race_fixture_collision'; end if; end $$;
insert into auth.users(id,raw_user_meta_data) values ('74000000-0000-0000-0000-000000000001','{"display_name":"Synthetic Race Patient"}'),('74000000-0000-0000-0000-000000000002','{"display_name":"Synthetic Race Guardian"}');
update public.profiles set role='guardian' where id='74000000-0000-0000-0000-000000000002';
insert into drmas_reconnect_race.manifest(patient,guardian) values('74000000-0000-0000-0000-000000000001','74000000-0000-0000-0000-000000000002');
commit;
\echo PASS race_setup
