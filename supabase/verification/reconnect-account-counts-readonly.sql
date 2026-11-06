-- Diagnostic only; do not create, request, approve, revoke or reset anything.
-- Confirm DrMAS-Dev/main and replace UUIDs locally using the actual test accounts.
-- Outputs account labels, roles and counts only. No IDs or counterpart details.
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
), account_counts as (
 select t.label, p.id is not null as profile_exists,
   p.role::text as actual_role,
   coalesce(p.role::text = t.expected_role, false) as role_matches,
   (select count(*) from public.care_links c where c.patient_id = t.id) as as_patient,
   (select count(*) from public.care_links c where c.guardian_id = t.id) as as_guardian,
   (select count(*) from public.care_links c where
     (c.patient_id = t.id or c.guardian_id = t.id) and c.status = 'pending') as pending,
   (select count(*) from public.care_links c where
     (c.patient_id = t.id or c.guardian_id = t.id) and c.status = 'approved') as approved,
   (select count(*) from public.care_links c where
     (c.patient_id = t.id or c.guardian_id = t.id) and c.status = 'revoked') as revoked
 from targets t left join public.profiles p on p.id = t.id
)
select jsonb_build_object(
 'format', 'drmas-reconnect-account-counts-v1',
 'read_only', current_setting('transaction_read_only') = 'on',
 'four_distinct_accounts', (select count(distinct id) = 4 from targets),
 'accounts', (select jsonb_agg(to_jsonb(c) order by c.label) from account_counts c),
 'a_g_pair_total', (select count(*) from public.care_links c
   where c.patient_id = (select id from targets where label = 'A')
     and c.guardian_id = (select id from targets where label = 'G')),
 'ordinary_user_rls', 'not_tested_by_admin_query'
) as reconnect_account_counts;
rollback;
