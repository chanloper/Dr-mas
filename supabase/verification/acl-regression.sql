-- Synthetic read-only PostgreSQL 14+ regression. Local disposable DB only.
-- No application tables, roles, GRANTs or functions are created or modified.
-- Every row must have passed=true. This is not a Dev/RLS test.
begin transaction isolation level repeatable read read only;
set local statement_timeout = '15s';
set local search_path = pg_catalog;
with checks as (
  select 'generic_empty_is_not_native_acl' as name,
    coalesce(array_ndims('{}'::aclitem[]),0) <> 1 as passed
  union all
  select 'column_default_is_native_1d', array_ndims(acldefault('c',10::oid)) = 1
  union all
  select 'null_column_has_no_extra_grants',
    (select count(*) from aclexplode(coalesce(null::aclitem[],acldefault('c',10::oid)))) = 0
  union all
  select 'native_empty_stays_empty',
    (select count(*) from aclexplode(coalesce(acldefault('c',10::oid),acldefault('c',10::oid)))) = 0
  union all
  select 'explicit_column_grant_is_preserved',
    (select count(*) from aclexplode(coalesce('{20=r/10}'::aclitem[],acldefault('c',10::oid)))
      where grantee=20 and grantor=10 and privilege_type='SELECT' and not is_grantable) = 1
  union all
  select 'table_defaults_keep_owner_select',
    exists(select 1 from aclexplode(coalesce(null::aclitem[],acldefault('r',10::oid)))
      where grantee=10 and privilege_type='SELECT')
  union all
  select 'function_defaults_keep_public_execute',
    exists(select 1 from aclexplode(coalesce(null::aclitem[],acldefault('f',10::oid)))
      where grantee=0 and privilege_type='EXECUTE')
  union all
  select 'schema_defaults_keep_owner_usage',
    exists(select 1 from aclexplode(coalesce(null::aclitem[],acldefault('n',10::oid)))
      where grantee=10 and privilege_type='USAGE')
  union all
  select 'explicit_revocation_does_not_restore_defaults',
    (select count(*) from aclexplode(coalesce(acldefault('c',10::oid),acldefault('r',10::oid)))) = 0
  union all
  select 'multidimensional_fixture_is_distinct',
    array_ndims('{{20=r/10},{30=r/10}}'::aclitem[]) = 2
)
select name,passed from checks order by name;
rollback;
