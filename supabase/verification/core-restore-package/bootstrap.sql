-- Minimal local Auth surrogate, NOT Supabase Auth restoration.
do $$ begin
 if current_database()<>'drmas_core_restore_verify'
 or inet_server_addr() is distinct from '127.0.0.1'::inet or inet_server_port()<>55433
 or current_setting('server_version_num')::int/10000<>17 or current_user<>'postgres'
 then raise exception 'TARGET_GUARD'; end if;
 if exists(select 1 from pg_namespace where nspname in ('auth','drmas_private'))
 or exists(select 1 from pg_roles where rolname in ('anon','authenticated','service_role','supabase_auth_admin'))
 or exists(select 1 from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relkind in ('r','p','v','m','S','f'))
 then raise exception 'REQUIRES_FRESH_CLUSTER_AND_DB'; end if;
end $$;
create role anon nologin nosuperuser nobypassrls;
create role authenticated nologin nosuperuser nobypassrls;
create role service_role nologin nosuperuser bypassrls;
create role supabase_auth_admin nologin nosuperuser nobypassrls;
revoke create on schema public from public;
grant usage on schema public to anon,authenticated,service_role;
create schema auth;
create table auth.users(id uuid primary key,raw_user_meta_data jsonb not null default '{}'::jsonb);
create function auth.uid() returns uuid language sql stable set search_path='' as $$
 select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid;
$$;
revoke all on schema auth from public;
grant usage on schema auth to anon,authenticated,service_role;
revoke all on auth.users from public,anon,authenticated;
revoke all on function auth.uid() from public;
grant execute on function auth.uid() to anon,authenticated,service_role;
