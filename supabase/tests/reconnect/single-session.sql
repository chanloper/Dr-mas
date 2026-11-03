\set ON_ERROR_STOP on
\set VERBOSITY terse
begin;
set local statement_timeout='45s';
set local lock_timeout='35s';
\ir guard.sql
\ir helpers.sql
 do $$ begin if exists(select 1 from auth.users where id in ('73000000-0000-0000-0000-000000000001','73000000-0000-0000-0000-000000000002','73000000-0000-0000-0000-000000000003','73000000-0000-0000-0000-000000000004')) then raise exception 'FAIL fixture_collision'; end if; end $$;
insert into auth.users(id,raw_user_meta_data) values
('73000000-0000-0000-0000-000000000001','{"display_name":"Synthetic A"}'),('73000000-0000-0000-0000-000000000002','{"display_name":"Synthetic B"}'),
('73000000-0000-0000-0000-000000000003','{"display_name":"Synthetic G"}'),('73000000-0000-0000-0000-000000000004','{"display_name":"Synthetic H"}');
update public.profiles set role='guardian' where id in ('73000000-0000-0000-0000-000000000003','73000000-0000-0000-0000-000000000004');
insert into public.medications(id,patient_id,title,time_local) values
('73000000-0000-0000-0000-000000000001','73000000-0000-0000-0000-000000000001','Synthetic schedule A','08:00'),('73000000-0000-0000-0000-000000000002','73000000-0000-0000-0000-000000000002','Synthetic schedule B','09:00');
insert into public.medication_records(medication_id,patient_id,day) values
('73000000-0000-0000-0000-000000000001','73000000-0000-0000-0000-000000000001','2026-01-01'),('73000000-0000-0000-0000-000000000002','73000000-0000-0000-0000-000000000002','2026-01-01');
set local role authenticated;
do $$ begin perform set_config('request.jwt.claim.sub','73000000-0000-0000-0000-000000000003',true); end $$;
select drmas_reconnect_test.denied($q$select public.request_care_link('73000000-0000-0000-0000-000000000003')$q$,'42501','self_request_denied');
select drmas_reconnect_test.denied($q$select public.request_care_link('73000000-0000-0000-0000-999999999999')$q$,'42501','missing_target_denied');
do $$ begin perform set_config('drmas_test.old',public.request_care_link('73000000-0000-0000-0000-000000000001')::text,true); end $$;
select drmas_reconnect_test.ok((select count(*)=0 from public.medications),'pending_schedule_denied');
select drmas_reconnect_test.ok((select count(*)=0 from public.medication_records),'pending_records_denied');
select drmas_reconnect_test.denied($q$select public.request_care_link('73000000-0000-0000-0000-000000000001')$q$,'23505','duplicate_pending_denied');
select drmas_reconnect_test.denied($q$select public.approve_care_link(current_setting('drmas_test.old')::uuid)$q$,'42501','self_approval_denied');
do $$ begin perform set_config('request.jwt.claim.sub','73000000-0000-0000-0000-000000000002',true); end $$;
select drmas_reconnect_test.ok((select count(*)=0 from public.care_links),'unrelated_link_hidden');
select drmas_reconnect_test.denied($q$select public.approve_care_link(current_setting('drmas_test.old')::uuid)$q$,'42501','unrelated_approval_denied');
select drmas_reconnect_test.denied($q$select public.revoke_care_link(current_setting('drmas_test.old')::uuid)$q$,'42501','unrelated_close_denied');
select drmas_reconnect_test.denied($q$update public.care_links set status='approved'$q$,'42501','direct_write_denied');
do $$ begin perform set_config('request.jwt.claim.sub','73000000-0000-0000-0000-000000000004',true); end $$;
select drmas_reconnect_test.ok((select count(*)=0 from public.care_links),'unrelated_link_hidden');
select drmas_reconnect_test.denied($q$select public.approve_care_link(current_setting('drmas_test.old')::uuid)$q$,'42501','unrelated_approval_denied');
select drmas_reconnect_test.denied($q$select public.revoke_care_link(current_setting('drmas_test.old')::uuid)$q$,'42501','unrelated_close_denied');
select drmas_reconnect_test.denied($q$update public.care_links set status='approved'$q$,'42501','direct_write_denied');
do $$ begin perform set_config('request.jwt.claim.sub','73000000-0000-0000-0000-000000000001',true); end $$;
select public.approve_care_link(current_setting('drmas_test.old')::uuid);
do $$ begin perform set_config('request.jwt.claim.sub','73000000-0000-0000-0000-000000000003',true); end $$;
select drmas_reconnect_test.ok((select count(*)=1 from public.medications),'approved_only_linked_schedule');
select drmas_reconnect_test.ok((select count(*)=1 from public.medication_records),'approved_only_linked_records');
select drmas_reconnect_test.denied($q$select public.request_care_link('73000000-0000-0000-0000-000000000001')$q$,'23505','duplicate_approved_denied');
do $$ begin perform set_config('request.jwt.claim.sub','73000000-0000-0000-0000-000000000001',true); end $$;
select public.revoke_care_link(current_setting('drmas_test.old')::uuid);
do $$ begin perform set_config('request.jwt.claim.sub','73000000-0000-0000-0000-000000000003',true); end $$;
select drmas_reconnect_test.ok((select count(*)=0 from public.medication_records),'revoked_read_denied');
do $$ begin perform set_config('drmas_test.new',public.request_care_link('73000000-0000-0000-0000-000000000001')::text,true); end $$;
select drmas_reconnect_test.ok((current_setting('drmas_test.new')::uuid<>current_setting('drmas_test.old')::uuid),'fresh_request_id');
select drmas_reconnect_test.ok((select status='pending' and approved_by is null and approved_at is null and closure_reason is null from public.care_links where id=current_setting('drmas_test.new')::uuid),'fresh_consent_required');
select drmas_reconnect_test.ok((select count(*)=0 from public.medication_records),'rerequest_read_denied');
do $$ begin perform set_config('request.jwt.claim.sub','73000000-0000-0000-0000-000000000001',true); end $$;
select drmas_reconnect_test.denied($q$select public.approve_care_link(current_setting('drmas_test.old')::uuid)$q$,'42501','stale_id_denied');
select public.approve_care_link(current_setting('drmas_test.new')::uuid);
do $$ begin perform set_config('request.jwt.claim.sub','73000000-0000-0000-0000-000000000003',true); end $$;
select drmas_reconnect_test.ok((select count(*)=1 from public.medication_records),'reapproved_read_allowed');
select drmas_reconnect_test.ok((select status='revoked' and closure_reason='revoked' and approved_by='73000000-0000-0000-0000-000000000001' and approved_at is not null from public.care_links where id=current_setting('drmas_test.old')::uuid),'old_approval_preserved');
select public.revoke_care_link(current_setting('drmas_test.new')::uuid);
do $$ begin perform set_config('drmas_test.reject',public.request_care_link('73000000-0000-0000-0000-000000000001')::text,true); end $$;
do $$ begin perform set_config('request.jwt.claim.sub','73000000-0000-0000-0000-000000000001',true); end $$;
select public.revoke_care_link(current_setting('drmas_test.reject')::uuid);
do $$ begin perform set_config('request.jwt.claim.sub','73000000-0000-0000-0000-000000000003',true); end $$;
select drmas_reconnect_test.ok((select closure_reason='rejected' from public.care_links where id=current_setting('drmas_test.reject')::uuid),'rejected_reason');
do $$ begin perform set_config('drmas_test.cancel',public.request_care_link('73000000-0000-0000-0000-000000000001')::text,true); end $$;
select public.revoke_care_link(current_setting('drmas_test.cancel')::uuid);
select drmas_reconnect_test.ok((select closure_reason='cancelled' from public.care_links where id=current_setting('drmas_test.cancel')::uuid),'cancelled_reason');
do $$ begin perform set_config('drmas_test.last',public.request_care_link('73000000-0000-0000-0000-000000000001')::text,true); end $$;
select drmas_reconnect_test.ok((select count(*)=0 from public.medication_records),'cancel_retry_requires_consent');
select drmas_reconnect_test.ok((select count(*)=1 from public.care_links where status in ('pending','approved')),'one_active_pair');
reset role;
rollback;
\echo PASS single_session_rolled_back
