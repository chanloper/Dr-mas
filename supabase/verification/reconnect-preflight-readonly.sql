-- PREPARED ONLY: no remote execution authorized by adding this file.
-- First use the existing catalog-readonly.sql unchanged (v1 comparator input).
-- This supplemental result is NOT schema-compare.cjs input. Save privately.
-- Metadata only: never reads application rows or emits function bodies/settings.
begin transaction isolation level repeatable read read only;
set local statement_timeout = '15s';
set local lock_timeout = '2s';
set local search_path = pg_catalog;
with pair_key as (
 select k.oid,k.conindid from pg_constraint k
 where k.conrelid=to_regclass('public.care_links')
 and k.conname='care_links_patient_id_guardian_id_key' and k.contype='u'
), fk_dependencies as (
 select n.nspname as schema_name,c.relname as table_name,k.conname as name,
 k.convalidated as validated,k.condeferrable as deferrable,
 k.conindid in (select conindid from pair_key) as uses_old_pair_index,
 encode(sha256(convert_to(pg_get_constraintdef(k.oid,false),'UTF8')),'hex') as definition_hash
 from pg_constraint k join pg_class c on c.oid=k.conrelid
 join pg_namespace n on n.oid=c.relnamespace
 where k.contype='f' and (k.confrelid=to_regclass('public.care_links')
 or k.conrelid=to_regclass('public.care_links'))
), dependencies as (
 select d.classid::regclass::text as catalog,d.deptype,
 count(*) as dependency_count
 from pg_depend d where
 (d.refclassid='pg_constraint'::regclass and d.refobjid in (select oid from pair_key))
 or (d.refclassid='pg_class'::regclass and d.refobjid in (select conindid from pair_key))
 group by d.classid,d.deptype
), rpc_grants as (
 select n.nspname as schema_name,p.proname as name,
 pg_get_function_identity_arguments(p.oid) as arguments,
 pg_get_userbyid(p.proowner) as owner,p.prosecdef as security_definer,
 pg_get_userbyid(a.grantor) as grantor,
 case when a.grantee=0 then 'PUBLIC' else pg_get_userbyid(a.grantee) end as grantee,
 a.privilege_type as privilege,a.is_grantable as grantable
 from pg_proc p join pg_namespace n on n.oid=p.pronamespace
 cross join lateral aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) a
 where n.nspname='public' and p.proname in ('request_care_link','approve_care_link','revoke_care_link')
), memberships as (
 select parent.rolname as granted_role,member.rolname as member,
 m.admin_option,m.inherit_option,m.set_option
 from pg_auth_members m join pg_roles parent on parent.oid=m.roleid
 join pg_roles member on member.oid=m.member
 -- All direct edges allow private review of transitive owner/client role paths.
 -- No passwords or role settings are selected.
), owner_roles as (
 select r.rolname as name,r.rolsuper as superuser,r.rolbypassrls as bypass_rls,
 r.rolcanlogin as can_login,r.rolinherit as inherit
 from pg_roles r where r.oid in (
 select p.proowner from pg_proc p join pg_namespace n on n.oid=p.pronamespace
 where n.nspname='drmas_private' or (n.nspname='public' and p.proname in
 ('request_care_link','approve_care_link','revoke_care_link')))
)
select jsonb_build_object(
 'format','drmas-reconnect-preflight-v1',
 'server_major',current_setting('server_version_num')::int/10000,
 'old_pair_constraint_count',(select count(*) from pair_key),
 'closure_reason_exists',exists(select 1 from pg_attribute where attrelid=to_regclass('public.care_links') and attname='closure_reason' and not attisdropped),
 'new_index_exists',to_regclass('public.care_links_one_active_pair') is not null,
 'fk_dependencies',coalesce((select jsonb_agg(to_jsonb(x) order by schema_name,table_name,name) from fk_dependencies x),'[]'::jsonb),
 'dependencies',coalesce((select jsonb_agg(to_jsonb(x) order by catalog,deptype) from dependencies x),'[]'::jsonb),
 'rpc_grants',coalesce((select jsonb_agg(to_jsonb(x) order by schema_name,name,arguments,grantee,grantor) from rpc_grants x),'[]'::jsonb),
 'role_memberships',coalesce((select jsonb_agg(to_jsonb(x) order by granted_role,member) from memberships x),'[]'::jsonb),
 'owner_roles',coalesce((select jsonb_agg(to_jsonb(x) order by name) from owner_roles x),'[]'::jsonb)
) as reconnect_preflight;
rollback;
