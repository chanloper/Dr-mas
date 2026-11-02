-- NOT EXECUTED. Local drmas_rls_test database only, after bootstrap + migration.
-- Run as its trusted owner using psql -X -v ON_ERROR_STOP=1. Never as app code.
-- Fixtures/helpers live in one transaction and are rolled back even after success.
begin;
do $$
begin
    if current_database() <> 'drmas_rls_test'
       or (inet_server_addr() is not null and inet_server_addr() not in ('127.0.0.1'::inet, '::1'::inet)) then
        raise exception 'Refusing non-local or incorrectly named test database';
    end if;
    if exists (select 1 from pg_roles where rolname in ('anon', 'authenticated') and (rolsuper or rolbypassrls)) then
        raise exception 'Client roles must not bypass RLS';
    end if;
    if exists (select 1 from auth.users) then
        raise exception 'This test requires empty synthetic auth fixtures';
    end if;
end;
$$;

create schema drmas_test;
grant usage on schema drmas_test to authenticated, anon;
create function drmas_test.ok(condition boolean, label text) returns void
language plpgsql security invoker set search_path = '' as $$
begin
    if condition is distinct from true then raise exception 'FAIL: %', label; end if;
    raise notice 'PASS: %', label;
end;
$$;
create function drmas_test.denied(statement text, expected_states text[], label text) returns void
language plpgsql security invoker set search_path = '' as $$
declare state text;
begin
    begin
        execute statement;
    exception when others then
        get stacked diagnostics state = returned_sqlstate;
        if state = any(expected_states) then raise notice 'PASS: %', label; return; end if;
        raise exception 'FAIL: % (unexpected SQLSTATE %)', label, state;
    end;
    raise exception 'FAIL: % (statement unexpectedly permitted)', label;
end;
$$;
create function drmas_test.zero_write(statement text, label text) returns void
language plpgsql security invoker set search_path = '' as $$
declare affected bigint;
begin
    execute statement;
    get diagnostics affected = row_count;
    perform drmas_test.ok(affected = 0, label);
end;
$$;
revoke all on all functions in schema drmas_test from public;
grant execute on all functions in schema drmas_test to authenticated, anon;

-- Owner-only fixture setup. No credentials or real user records are used.
insert into auth.users(id, email, raw_user_meta_data) values
('10000000-0000-0000-0000-000000000001', 'patient-a@example.invalid', '{"display_name":"Patient A","role":"guardian"}'),
('10000000-0000-0000-0000-000000000002', 'patient-b@example.invalid', '{"display_name":"Patient B"}'),
('10000000-0000-0000-0000-000000000003', 'guardian-a@example.invalid', '{"display_name":"Guardian A"}'),
('10000000-0000-0000-0000-000000000004', 'guardian-b@example.invalid', '{"display_name":"Guardian B"}');
select drmas_test.ok((select count(*) = 4 from public.profiles where role = 'patient'), 'signup metadata cannot assign guardian');
-- Only the trusted owner approves guardian roles in fixtures.
update public.profiles set role = 'guardian' where id in ('10000000-0000-0000-0000-000000000003','10000000-0000-0000-0000-000000000004');
insert into public.medications(id,patient_id,title,time_local) values
('20000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000001','Schedule A','08:00'),
('20000000-0000-0000-0000-000000000002','10000000-0000-0000-0000-000000000002','Schedule B','09:00');
insert into public.medication_records(medication_id,patient_id,day) values
('20000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000001','2026-11-01'),
('20000000-0000-0000-0000-000000000002','10000000-0000-0000-0000-000000000002','2026-11-01');
select drmas_test.ok((select count(*) = 4 from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relname in ('profiles','medications','medication_records','care_links') and c.relrowsecurity), 'all four user tables enable RLS');
select drmas_test.ok(not has_column_privilege('authenticated','public.profiles','role','UPDATE'), 'role update privilege absent');
select drmas_test.ok(not has_table_privilege('authenticated','public.care_links','INSERT,UPDATE,DELETE'), 'direct connection writes absent');
select drmas_test.ok(not has_schema_privilege('authenticated','drmas_private','CREATE'), 'client cannot create private schema objects');

set local role anon;
do $$ begin perform set_config('request.jwt.claim.sub','',true); end $$;
select drmas_test.denied('select * from public.profiles',array['42501'],'anon profiles denied');
select drmas_test.denied('select * from public.medications',array['42501'],'anon schedules denied');
select drmas_test.denied('select * from public.medication_records',array['42501'],'anon records denied');
select drmas_test.denied('select * from public.care_links',array['42501'],'anon connections denied');
select drmas_test.denied($q$select public.request_care_link('10000000-0000-0000-0000-000000000001')$q$,array['42501'],'anon RPC denied');

set local role authenticated;
select drmas_test.ok((select count(*)=0 from public.profiles),'authenticated role without subject sees no profiles');
select drmas_test.ok((select count(*)=0 from public.medications),'authenticated role without subject sees no schedules');
select drmas_test.denied($q$select public.request_care_link('10000000-0000-0000-0000-000000000001')$q$,array['42501'],'missing subject cannot request connection');
do $$ begin perform set_config('request.jwt.claim.sub','10000000-0000-0000-0000-000000000001',true); end $$;
select drmas_test.ok((select count(*)=1 from public.profiles),'patient sees own profile only');
select drmas_test.ok((select count(*)=1 from public.medications),'patient sees own schedules only');
select drmas_test.ok((select count(*)=1 from public.medication_records),'patient sees own records only');
select drmas_test.denied($q$update public.profiles set role='guardian'$q$,array['42501'],'patient cannot promote role');
select drmas_test.denied($q$insert into public.profiles(id,display_name,role) values ('10000000-0000-0000-0000-000000000001','x','guardian')$q$,array['42501'],'patient cannot insert profile role');
select drmas_test.denied($q$insert into public.medications(patient_id,title,time_local) values ('10000000-0000-0000-0000-000000000002','x','10:00')$q$,array['42501'],'patient cannot insert for another patient');
select drmas_test.zero_write($q$update public.medications set title='x' where patient_id='10000000-0000-0000-0000-000000000002'$q$,'patient cannot update another patient');
select drmas_test.zero_write($q$delete from public.medication_records where patient_id='10000000-0000-0000-0000-000000000002'$q$,'patient cannot delete another patient records');
select drmas_test.denied($q$update public.medications set patient_id='10000000-0000-0000-0000-000000000002' where id='20000000-0000-0000-0000-000000000001'$q$,array['42501'],'schedule ownership column cannot change');
select drmas_test.denied($q$update public.medication_records set patient_id='10000000-0000-0000-0000-000000000002' where medication_id='20000000-0000-0000-0000-000000000001'$q$,array['23514'],'record identity trigger rejects ownership reassignment');
select drmas_test.denied($q$update public.medication_records set day='2026-11-02' where medication_id='20000000-0000-0000-0000-000000000001'$q$,array['23514'],'record date identity cannot change');
select drmas_test.denied($q$insert into public.medication_records(medication_id,patient_id,day) values ('20000000-0000-0000-0000-000000000002','10000000-0000-0000-0000-000000000001','2026-11-02')$q$,array['23503'],'composite FK blocks cross-patient schedule reference');
select drmas_test.denied($q$insert into public.medications(patient_id,title,time_local,timezone) values ('10000000-0000-0000-0000-000000000001','x','10:00','Invalid/Timezone')$q$,array['23514'],'invalid timezone rejected');
select drmas_test.denied($q$insert into public.medications(patient_id,title,time_local) values ('10000000-0000-0000-0000-000000000001','x','24:00')$q$,array['23514'],'ambiguous 24-hour clock endpoint rejected');
select drmas_test.denied($q$update public.medication_records set taken=true, taken_at=null where medication_id='20000000-0000-0000-0000-000000000001'$q$,array['23514'],'taken flag and timestamp must agree');
update public.profiles set display_name='Updated A' where id='10000000-0000-0000-0000-000000000001';
select drmas_test.ok((select display_name='Updated A' from public.profiles),'patient may edit own display name');
update public.medication_records set taken=true,taken_at=now() where medication_id='20000000-0000-0000-0000-000000000001';
select drmas_test.ok((select taken from public.medication_records),'patient may update own record');
insert into public.medication_records(medication_id,patient_id,day,taken,taken_at)
values ('20000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000001','2026-11-01',false,null)
on conflict (medication_id,day) do update set
    medication_id=excluded.medication_id,patient_id=excluded.patient_id,day=excluded.day,taken=excluded.taken,taken_at=excluded.taken_at;
select drmas_test.ok((select not taken from public.medication_records),'patient cloud upsert payload is permitted');

do $$ begin perform set_config('request.jwt.claim.sub','10000000-0000-0000-0000-000000000003',true); end $$;
select drmas_test.ok((select count(*)=0 from public.medications),'unconnected guardian cannot read schedules');
select drmas_test.ok((select count(*)=0 from public.medication_records),'unconnected guardian cannot read records');
select drmas_test.denied($q$insert into public.care_links(patient_id,guardian_id,requested_by,status,approved_by,approved_at) values ('10000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000003','10000000-0000-0000-0000-000000000003','approved','10000000-0000-0000-0000-000000000001',now())$q$,array['42501'],'guardian cannot fabricate an approved link');
do $$ begin perform set_config('drmas_test.link_id',public.request_care_link('10000000-0000-0000-0000-000000000001')::text,true); end $$;
select drmas_test.ok((select status='pending' from public.care_links),'request remains pending');
select drmas_test.ok((select count(*)=0 from public.medications),'pending guardian cannot read');
select drmas_test.denied($q$select public.approve_care_link(current_setting('drmas_test.link_id')::uuid)$q$,array['42501'],'guardian cannot self-approve');
select drmas_test.denied($q$update public.care_links set status='approved'$q$,array['42501'],'guardian cannot directly change status');

do $$ begin perform set_config('request.jwt.claim.sub','10000000-0000-0000-0000-000000000004',true); end $$;
select drmas_test.ok((select count(*)=0 from public.care_links),'unrelated guardian cannot see another link');
select drmas_test.denied($q$select public.revoke_care_link(current_setting('drmas_test.link_id')::uuid)$q$,array['42501'],'unrelated guardian cannot revoke');
do $$ begin perform set_config('request.jwt.claim.sub','10000000-0000-0000-0000-000000000002',true); end $$;
select drmas_test.denied($q$select public.approve_care_link(current_setting('drmas_test.link_id')::uuid)$q$,array['42501'],'another patient cannot approve');

do $$ begin perform set_config('request.jwt.claim.sub','10000000-0000-0000-0000-000000000001',true); end $$;
select public.approve_care_link(current_setting('drmas_test.link_id')::uuid);
select drmas_test.ok((select status='approved' and approved_by=auth.uid() from public.care_links),'patient explicitly approves');
do $$ begin perform set_config('request.jwt.claim.sub','10000000-0000-0000-0000-000000000003',true); end $$;
select drmas_test.ok((select count(*)=1 from public.medications),'approved guardian reads linked patient only');
select drmas_test.ok((select count(*)=1 from public.medication_records),'approved guardian reads linked records only');
select drmas_test.ok((select count(*)=1 from public.profiles),'approval does not expose patient profile or email');
select drmas_test.denied($q$insert into public.medication_records(medication_id,patient_id,day) values ('20000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000001','2026-11-02')$q$,array['42501'],'approved guardian cannot write records');
select drmas_test.zero_write('update public.medication_records set taken=false,taken_at=null','approved guardian cannot edit records');
select drmas_test.zero_write('delete from public.medications','approved guardian cannot delete schedules');
do $$ begin perform set_config('request.jwt.claim.sub','10000000-0000-0000-0000-000000000004',true); end $$;
select drmas_test.ok((select count(*)=0 from public.medication_records),'unapproved guardian still reads nothing');

-- Trusted owner changes fixture roles to test that old approvals do not override current roles.
reset role;
update public.profiles set role='patient' where id='10000000-0000-0000-0000-000000000003';
set local role authenticated;
do $$ begin perform set_config('request.jwt.claim.sub','10000000-0000-0000-0000-000000000003',true); end $$;
select drmas_test.ok((select count(*)=0 from public.medications),'guardian role removal blocks old approval');
reset role;
update public.profiles set role='guardian' where id='10000000-0000-0000-0000-000000000003';
set local role authenticated;
do $$ begin perform set_config('request.jwt.claim.sub','10000000-0000-0000-0000-000000000001',true); end $$;
select public.revoke_care_link(current_setting('drmas_test.link_id')::uuid);
do $$ begin perform set_config('request.jwt.claim.sub','10000000-0000-0000-0000-000000000003',true); end $$;
select drmas_test.ok((select count(*)=0 from public.medication_records),'revocation removes guardian read access');
select drmas_test.denied($q$select public.request_care_link('10000000-0000-0000-0000-000000000001')$q$,array['23505'],'revoked pair cannot silently reactivate');
select drmas_test.denied($q$select public.approve_care_link(current_setting('drmas_test.link_id')::uuid)$q$,array['42501'],'revoked link cannot self-approve');

reset role;
-- No fixture/helper persists. Migration itself remains in the isolated local DB.
rollback;
