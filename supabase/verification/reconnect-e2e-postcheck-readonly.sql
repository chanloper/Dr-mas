-- PREPARED ONLY. Run manually on the confirmed DrMAS-Dev/main target.
-- Replace all four placeholders locally with verified SYNTHETIC account UUIDs.
-- Outputs labels, roles, counts and booleans only; no IDs, timestamps or content.
-- Latest revoked A-G row is the candidate old link. Multiple test cycles require
-- the operator to confirm that this is the intended cycle (IDs are not emitted).
-- Admin metadata/data inspection is NOT an ordinary-user JWT/RLS test.
begin transaction isolation level repeatable read read only;
set local statement_timeout = '15s';
set local lock_timeout = '2s';
set local search_path = pg_catalog;

with targets(label, id, expected_role) as (
 values
   ('A', '<PATIENT_A_UUID>'::uuid, 'patient'),
   ('B', '<PATIENT_B_UUID>'::uuid, 'patient'),
   ('G', '<GUARDIAN_G_UUID>'::uuid, 'guardian'),
   ('H', '<GUARDIAN_H_UUID>'::uuid, 'guardian')
), roles as (
 select t.label, t.expected_role, p.role::text as actual_role,
   p.id is not null as profile_exists,
   coalesce(p.role::text = t.expected_role, false) as role_matches
 from targets t left join public.profiles p on p.id = t.id
), pair as (
 select c.id, c.status, c.requested_by, c.approved_by, c.approved_at,
   c.revoked_at, c.created_at, c.closure_reason, c.patient_id, c.guardian_id
 from public.care_links c
 where c.patient_id = (select id from targets where label = 'A')
   and c.guardian_id = (select id from targets where label = 'G')
), old_link as (
 select * from pair where status = 'revoked'
 order by revoked_at desc nulls last, created_at desc, id desc limit 1
), new_link as (
 select * from pair where status = 'approved'
 order by created_at desc, id desc limit 1
), medication_counts as (
 select t.label,
   (select count(*) from public.medications m where m.patient_id = t.id) as schedules,
   (select count(*) from public.medications m where m.patient_id = t.id and m.active) as active_schedules,
   (select count(*) from public.medication_records r where r.patient_id = t.id) as records
 from targets t where t.label in ('A', 'B')
)
select jsonb_build_object(
 'format', 'drmas-reconnect-e2e-postcheck-v1',
 'read_only', current_setting('transaction_read_only') = 'on',
 'four_distinct_accounts', (select count(distinct id) = 4 from targets),
 'roles', (select jsonb_agg(to_jsonb(r) order by r.label) from roles r),
 'all_profiles_and_roles_match', (select bool_and(profile_exists and role_matches) from roles),
 'pair_counts', jsonb_build_object(
   'pending', (select count(*) from pair where status = 'pending'),
   'approved', (select count(*) from pair where status = 'approved'),
   'revoked', (select count(*) from pair where status = 'revoked')),
 'old_link_exists', exists(select 1 from old_link),
 'new_link_exists', exists(select 1 from new_link),
 'distinct_old_and_new_ids', coalesce((select o.id <> n.id from old_link o cross join new_link n), false),
 'one_active_approved_no_pending', (select count(*) filter (where status = 'approved') = 1
   and count(*) filter (where status = 'pending') = 0 from pair),
 'old_approval_and_revocation_present', coalesce((select
   o.approved_by = o.patient_id and o.approved_at is not null and o.revoked_at is not null
   and o.created_at <= o.approved_at and o.approved_at <= o.revoked_at
   and o.requested_by = o.guardian_id and o.closure_reason = 'revoked'
   from old_link o), false),
 'new_approval_valid', coalesce((select
   n.status = 'approved' and n.approved_by = n.patient_id and n.approved_at is not null
   and n.revoked_at is null and n.closure_reason is null and n.requested_by = n.guardian_id
   and n.created_at <= n.approved_at from new_link n), false),
 'new_request_after_old_revocation', coalesce((select n.created_at >= o.revoked_at
   from old_link o cross join new_link n), false),
 'medication_counts', (select jsonb_agg(to_jsonb(m) order by m.label) from medication_counts m),
 'historical_value_equality', 'unverified_without_per_link_before_snapshot',
 'ordinary_user_jwt_rls', 'not_tested_by_admin_query'
) as reconnect_e2e_postcheck;

rollback;
