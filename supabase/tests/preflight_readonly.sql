-- OPTIONAL FUTURE REVIEW ONLY. Not executed by the agent.
-- Metadata/counts only: no user rows, emails, credentials, keys or function bodies.
begin read only;
select current_setting('server_version') as server_version;
select rolname, rolcanlogin, rolsuper, rolbypassrls from pg_roles
where rolname in ('anon','authenticated','service_role');
select n.nspname as schema_name, pg_get_userbyid(n.nspowner) as owner,
       has_schema_privilege('authenticated',n.oid,'CREATE') as client_can_create
from pg_namespace n where n.nspname in ('public','drmas_private');
select to_regclass('public.profiles') as profiles,
       to_regclass('public.medications') as medications,
       to_regclass('public.medication_records') as medication_records,
       to_regclass('public.care_links') as care_links;
select c.relname, c.relrowsecurity, c.relforcerowsecurity,
       pg_get_userbyid(c.relowner) as table_owner
from pg_class c join pg_namespace n on n.oid=c.relnamespace
where n.nspname='public' and c.relname in ('profiles','medications','medication_records','care_links');
select schemaname, tablename, policyname, roles, cmd from pg_policies
where schemaname='public' and tablename in ('profiles','medications','medication_records','care_links');
select n.nspname as function_schema, p.proname, p.prosecdef, p.proconfig,
       pg_get_userbyid(p.proowner) as function_owner
from pg_proc p join pg_namespace n on n.oid=p.pronamespace
where n.nspname='drmas_private'
   or (n.nspname='public' and p.proname in ('request_care_link','approve_care_link','revoke_care_link'));
select t.tgname, t.tgenabled from pg_trigger t
where t.tgrelid='auth.users'::regclass and not t.tgisinternal;
select count(*) as auth_user_count from auth.users;
-- Only query profiles conditionally: before migration this table does not exist.
do $$
declare missing bigint;
begin
    if to_regclass('public.profiles') is not null then
        execute 'select count(*) from auth.users u left join public.profiles p on p.id=u.id where p.id is null' into missing;
        raise notice 'Auth users without profile (count only): %', missing;
    end if;
end;
$$;
rollback;
