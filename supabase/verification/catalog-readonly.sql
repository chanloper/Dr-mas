-- PREPARED ONLY: do not run against DrMAS-Dev without separate approval.
-- Metadata only. No application rows, Auth users, secrets or function bodies.
-- Same query on a trusted disposable reference and the approved Dev target.
begin transaction isolation level repeatable read read only;
set local statement_timeout = '15s';
set local lock_timeout = '2s';
set local search_path = pg_catalog;

with
targets as (
  select c.* from pg_class c join pg_namespace n on n.oid=c.relnamespace
  where n.nspname='public' and c.relkind in ('r','p')
    and c.relname in ('profiles','medications','medication_records','care_links')
),
client_roles as (
  select oid,rolname from pg_roles where rolname in ('anon','authenticated','service_role')
),
tables_data as (
  select c.relname as name, c.relrowsecurity as rls, c.relforcerowsecurity as force_rls,
    pg_get_userbyid(c.relowner) as owner,
    coalesce((select jsonb_agg(jsonb_build_object(
      'grantee',case when a.grantee=0 then 'PUBLIC' else pg_get_userbyid(a.grantee) end,
      'privilege',a.privilege_type,'grantable',a.is_grantable)
      order by a.grantee,a.privilege_type)
      from aclexplode(coalesce(c.relacl,acldefault('r',c.relowner))) a),'[]'::jsonb) as grants,
    (select jsonb_agg(jsonb_build_object('role',r.rolname,
      'select',has_table_privilege(r.oid,c.oid,'SELECT'),
      'insert',has_table_privilege(r.oid,c.oid,'INSERT'),
      'update',has_table_privilege(r.oid,c.oid,'UPDATE'),
      'delete',has_table_privilege(r.oid,c.oid,'DELETE'),
      'truncate',has_table_privilege(r.oid,c.oid,'TRUNCATE'),
      'references',has_table_privilege(r.oid,c.oid,'REFERENCES'),
      'trigger',has_table_privilege(r.oid,c.oid,'TRIGGER')) order by r.rolname)
      from client_roles r) as effective
  from targets c
),
columns_data as (
  select c.relname as table_name,a.attname as name,format_type(a.atttypid,a.atttypmod) as type,
    a.attnotnull as not_null,a.attidentity as identity,a.attgenerated as generated,
    coll.collname as collation,
    encode(sha256(convert_to(pg_get_expr(d.adbin,d.adrelid),'UTF8')),'hex') as default_hash,
    coalesce((select jsonb_agg(jsonb_build_object(
      'grantee',case when x.grantee=0 then 'PUBLIC' else pg_get_userbyid(x.grantee) end,
      'privilege',x.privilege_type,'grantable',x.is_grantable) order by x.grantee,x.privilege_type)
      -- A generic '{}'::aclitem[] is zero-dimensional, not a native empty ACL.
      -- Column defaults contain no extra grants; table-level rights stay in effective.
      from aclexplode(coalesce(a.attacl,acldefault('c',c.relowner))) x),'[]'::jsonb) as grants,
    (select jsonb_agg(jsonb_build_object('role',r.rolname,
      'select',has_column_privilege(r.oid,c.oid,a.attnum,'SELECT'),
      'insert',has_column_privilege(r.oid,c.oid,a.attnum,'INSERT'),
      'update',has_column_privilege(r.oid,c.oid,a.attnum,'UPDATE'),
      'references',has_column_privilege(r.oid,c.oid,a.attnum,'REFERENCES')) order by r.rolname)
      from client_roles r) as effective
  from targets c join pg_attribute a on a.attrelid=c.oid
  left join pg_attrdef d on d.adrelid=c.oid and d.adnum=a.attnum
  left join pg_collation coll on coll.oid=a.attcollation
  where a.attnum>0 and not a.attisdropped
),
constraints_data as (
  select c.relname as table_name,k.conname as name,k.contype as kind,
    k.convalidated as validated,k.condeferrable as deferrable,k.condeferred as deferred,
    encode(sha256(convert_to(pg_get_constraintdef(k.oid,false),'UTF8')),'hex') as definition_hash
  from targets c join pg_constraint k on k.conrelid=c.oid
),
indexes_data as (
  select c.relname as table_name,i.relname as name,x.indisunique as unique_index,
    x.indisprimary as primary_index,x.indisvalid as valid,x.indisready as ready,
    encode(sha256(convert_to(pg_get_indexdef(i.oid),'UTF8')),'hex') as definition_hash
  from targets c join pg_index x on x.indrelid=c.oid join pg_class i on i.oid=x.indexrelid
),
policies_data as (
  select c.relname as table_name,p.polname as name,p.polcmd as command,p.polpermissive as permissive,
    (select jsonb_agg(case when x=0 then 'PUBLIC' else pg_get_userbyid(x) end order by x)
      from unnest(p.polroles) x) as roles,
    encode(sha256(convert_to(pg_get_expr(p.polqual,p.polrelid),'UTF8')),'hex') as using_hash,
    encode(sha256(convert_to(pg_get_expr(p.polwithcheck,p.polrelid),'UTF8')),'hex') as check_hash
  from targets c join pg_policy p on p.polrelid=c.oid
),
functions_data as (
  select n.nspname as schema_name,p.proname as name,p.prokind as kind,
    pg_get_function_identity_arguments(p.oid) as arguments,
    pg_get_function_result(p.oid) as result,l.lanname as language,
    p.prosecdef as security_definer,p.provolatile as volatility,p.proisstrict as strict,
    p.proleakproof as leakproof,pg_get_userbyid(p.proowner) as owner,
    -- Keep the config array/null contract and order, but never export setting text.
    case when p.proconfig is null then null else
      coalesce((select jsonb_agg(
        encode(sha256(convert_to(cfg.setting,'UTF8')),'hex') order by cfg.position)
        from unnest(p.proconfig) with ordinality cfg(setting,position)), '[]'::jsonb)
    end as config,
    case when p.prokind in ('f','p') then
      encode(sha256(convert_to(pg_get_functiondef(p.oid),'UTF8')),'hex') end as definition_hash,
    (select jsonb_agg(jsonb_build_object(
      'grantee',case when x.grantee=0 then 'PUBLIC' else pg_get_userbyid(x.grantee) end,
      'privilege',x.privilege_type,'grantable',x.is_grantable) order by x.grantee,x.privilege_type)
      from aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) x) as grants,
    (select jsonb_agg(jsonb_build_object('role',r.rolname,
      'execute',has_function_privilege(r.oid,p.oid,'EXECUTE')) order by r.rolname)
      from client_roles r) as effective
  from pg_proc p join pg_namespace n on n.oid=p.pronamespace join pg_language l on l.oid=p.prolang
  where n.nspname='drmas_private' or (n.nspname='public'
    and p.proname in ('request_care_link','approve_care_link','revoke_care_link'))
),
triggers_data as (
  select n.nspname as schema_name,c.relname as table_name,t.tgname as name,t.tgenabled as enabled,
    encode(sha256(convert_to(pg_get_triggerdef(t.oid,false),'UTF8')),'hex') as definition_hash
  from pg_trigger t join pg_class c on c.oid=t.tgrelid join pg_namespace n on n.oid=c.relnamespace
  where not t.tgisinternal and (c.oid in (select oid from targets)
    or (n.nspname='auth' and c.relname='users'))
),
schemas_data as (
  select n.nspname as name,pg_get_userbyid(n.nspowner) as owner,
    (select jsonb_agg(jsonb_build_object(
      'grantee',case when x.grantee=0 then 'PUBLIC' else pg_get_userbyid(x.grantee) end,
      'privilege',x.privilege_type,'grantable',x.is_grantable) order by x.grantee,x.privilege_type)
      from aclexplode(coalesce(n.nspacl,acldefault('n',n.nspowner))) x) as grants,
    (select jsonb_agg(jsonb_build_object('role',r.rolname,
      'usage',has_schema_privilege(r.oid,n.oid,'USAGE'),
      'create',has_schema_privilege(r.oid,n.oid,'CREATE')) order by r.rolname)
      from client_roles r) as effective
  from pg_namespace n where n.nspname in ('public','drmas_private')
),
roles_data as (
  select rolname as name,rolsuper as superuser,rolbypassrls as bypass_rls,
    rolinherit as inherit,rolcanlogin as can_login
  from pg_roles where rolname in ('anon','authenticated','service_role')
),
enums_data as (
  select t.typname as name,jsonb_agg(e.enumlabel order by e.enumsortorder) as labels
  from pg_type t join pg_namespace n on n.oid=t.typnamespace join pg_enum e on e.enumtypid=t.oid
  where n.nspname='public' and t.typname in ('drmas_role','drmas_link_status') group by t.typname
),
public_objects as (
  select c.relname as name,c.relkind as kind,c.relrowsecurity as rls
  from pg_class c join pg_namespace n on n.oid=c.relnamespace
  where n.nspname='public' and c.relkind in ('r','p','v','m','f')
)
select jsonb_build_object(
  'format','drmas-p1-catalog-v1',
  'server_major',current_setting('server_version_num')::integer/10000,
  'exposed_schemas',current_setting('pgrst.db_schemas',true),
  'tables',coalesce((select jsonb_agg(to_jsonb(x) order by x.name) from tables_data x),'[]'::jsonb),
  'columns',coalesce((select jsonb_agg(to_jsonb(x) order by x.table_name,x.name) from columns_data x),'[]'::jsonb),
  'constraints',coalesce((select jsonb_agg(to_jsonb(x) order by x.table_name,x.name) from constraints_data x),'[]'::jsonb),
  'indexes',coalesce((select jsonb_agg(to_jsonb(x) order by x.table_name,x.name) from indexes_data x),'[]'::jsonb),
  'policies',coalesce((select jsonb_agg(to_jsonb(x) order by x.table_name,x.name) from policies_data x),'[]'::jsonb),
  'functions',coalesce((select jsonb_agg(to_jsonb(x) order by x.schema_name,x.name,x.arguments) from functions_data x),'[]'::jsonb),
  'triggers',coalesce((select jsonb_agg(to_jsonb(x) order by x.schema_name,x.table_name,x.name) from triggers_data x),'[]'::jsonb),
  'schemas',coalesce((select jsonb_agg(to_jsonb(x) order by x.name) from schemas_data x),'[]'::jsonb),
  'roles',coalesce((select jsonb_agg(to_jsonb(x) order by x.name) from roles_data x),'[]'::jsonb),
  'enums',coalesce((select jsonb_agg(to_jsonb(x) order by x.name) from enums_data x),'[]'::jsonb),
  'public_objects',coalesce((select jsonb_agg(to_jsonb(x) order by x.name) from public_objects x),'[]'::jsonb)
) as snapshot;
rollback;
