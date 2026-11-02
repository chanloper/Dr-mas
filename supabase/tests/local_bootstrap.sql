-- LOCAL EMPTY POSTGRES ONLY. Never run on Supabase, Cloudtype or a shared cluster.
-- This is a minimal auth/role stand-in, not a Supabase Auth integration test.
begin;
do $$
begin
    if current_database() <> 'drmas_rls_test'
       or (inet_server_addr() is not null and inet_server_addr() not in ('127.0.0.1'::inet, '::1'::inet)) then
        raise exception 'Refusing non-local or incorrectly named test database';
    end if;
    if exists (select 1 from pg_namespace where nspname = 'auth')
       or exists (select 1 from pg_roles where rolname in ('anon', 'authenticated', 'service_role')) then
        raise exception 'Requires an isolated empty cluster with no existing auth roles/schema';
    end if;
end;
$$;
create role anon nologin nobypassrls;
create role authenticated nologin nobypassrls;
create role service_role nologin bypassrls;
create schema auth;
create table auth.users (
    id uuid primary key,
    email text,
    raw_user_meta_data jsonb not null default '{}'::jsonb
);
create function auth.uid() returns uuid
language sql stable set search_path = '' as $$
    select coalesce(nullif(current_setting('request.jwt.claim.sub', true), ''),
        nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub')::uuid;
$$;
revoke all on schema auth from public;
grant usage on schema auth to anon, authenticated, service_role;
revoke all on auth.users from public, anon, authenticated;
revoke all on function auth.uid() from public;
grant execute on function auth.uid() to anon, authenticated, service_role;
commit;
