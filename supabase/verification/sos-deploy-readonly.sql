-- PREPARED ONLY: run manually on confirmed DrMAS-Dev/main, before and after
-- the separately approved SOS migration. Metadata/fingerprint output is private.
-- Does not invoke SOS/care RPCs or emit identifiers, rows or function text.
begin transaction isolation level repeatable read read only;
set local statement_timeout = '15s';
set local lock_timeout = '2s';
set local search_path = pg_catalog;
set local timezone = 'UTC';
with sos_table as (
 select c.* from pg_class c where c.oid = to_regclass('public.sos_alerts')
), rpc as (
 select p.* from pg_proc p join pg_namespace n on n.oid = p.pronamespace
 where n.nspname = 'public' and p.proname in ('request_sos_alert', 'acknowledge_sos_alert')
), rpc_checks as (
 select p.proname as name, p.prosecdef as security_definer,
   p.proconfig = array['search_path=""']::text[] as empty_search_path,
   p.proowner = (select proowner from pg_proc where oid = to_regprocedure('public.request_care_link(uuid)')) as same_owner_as_care_rpc,
   has_function_privilege('authenticated', p.oid, 'EXECUTE') as authenticated_execute,
   has_function_privilege('anon', p.oid, 'EXECUTE') as anon_execute,
   exists(select 1 from aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) x
     where x.grantee = 0 and x.privilege_type = 'EXECUTE') as public_execute,
   encode(sha256(convert_to(pg_get_functiondef(p.oid), 'UTF8')), 'hex') as definition_hash
 from rpc p where p.prokind = 'f'
)
select jsonb_build_object(
 'format', 'drmas-sos-deploy-check-v1',
 'read_only', current_setting('transaction_read_only') = 'on',
 'server_major', current_setting('server_version_num')::int / 10000,
 'baseline', jsonb_build_object(
   'current_role_helper', to_regprocedure('drmas_private.current_role()') is not null,
   'patient_read_helper', to_regprocedure('drmas_private.can_read_patient(uuid)') is not null,
   'closure_reason', exists(select 1 from pg_attribute where attrelid = to_regclass('public.care_links') and attname = 'closure_reason' and not attisdropped),
   'active_pair_index', to_regclass('public.care_links_one_active_pair') is not null),
 'sos_table_exists', exists(select 1 from sos_table),
 'sos_relation_is_table', coalesce((select relkind = 'r' from sos_table), false),
 'sos_rls', coalesce((select relrowsecurity from sos_table), false),
 'sos_column_count', (select count(*) from pg_attribute where attrelid = to_regclass('public.sos_alerts') and attnum > 0 and not attisdropped),
 'sos_valid_index_count', (select count(*) from pg_index where indrelid = to_regclass('public.sos_alerts') and indisvalid and indisready),
 'sos_valid_constraint_count', (select count(*) from pg_constraint where conrelid = to_regclass('public.sos_alerts') and convalidated),
 'sos_policy_count', (select count(*) from pg_policy where polrelid = to_regclass('public.sos_alerts')),
 'sos_user_trigger_count', (select count(*) from pg_trigger where tgrelid = to_regclass('public.sos_alerts') and not tgisinternal),
 'sos_authenticated_select', coalesce((select has_table_privilege('authenticated', oid, 'SELECT') from sos_table), false),
 'sos_authenticated_direct_write', coalesce((select has_table_privilege('authenticated', oid, 'INSERT,UPDATE,DELETE,TRUNCATE') from sos_table), false),
 'sos_anon_any_table_privilege', coalesce((select has_table_privilege('anon', oid, 'SELECT,INSERT,UPDATE,DELETE,TRUNCATE') from sos_table), false),
 'sos_rpc_count', (select count(*) from rpc),
 'request_signature', exists(select 1 from pg_proc where oid = to_regprocedure('public.request_sos_alert()') and prorettype = 'integer'::regtype),
 'ack_signature', exists(select 1 from pg_proc where oid = to_regprocedure('public.acknowledge_sos_alert(uuid)') and prorettype = 'void'::regtype),
 'sos_rpc_checks', coalesce((select jsonb_agg(to_jsonb(r) order by r.name) from rpc_checks r), '[]'::jsonb),
 -- Complements reconnect-data-preservation-readonly.sql, which excludes closure_reason.
 'care_closure_fingerprint', (select encode(sha256(convert_to(coalesce(
   jsonb_agg(jsonb_build_object('id', id, 'reason', closure_reason) order by id), '[]'::jsonb)::text, 'UTF8')), 'hex') from public.care_links),
 'runtime_jwt_rls', 'unverified_by_admin_query'
) as sos_deploy_check;
rollback;
