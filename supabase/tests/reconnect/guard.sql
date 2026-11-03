-- Read-only guard; required inside every test transaction.
do $$ begin
 if current_database()<>'drmas_rls_test' or inet_server_addr() is distinct from '127.0.0.1'::inet
 or inet_server_port()<>55432 or current_setting('server_version_num')::int/10000<>17 or current_user<>'postgres'
 then raise exception 'FAIL target_guard'; end if;
 if exists(select 1 from pg_roles where rolname in ('anon','authenticated') and (rolsuper or rolbypassrls))
 or (select count(*) from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public'
 and c.relname in ('profiles','care_links','medications','medication_records') and c.relrowsecurity)<>4
 then raise exception 'FAIL rls_baseline'; end if;
 if not exists(select 1 from pg_index where indexrelid=to_regclass('public.care_links_one_active_pair') and indisunique and indisvalid and indpred is not null)
 or exists(select 1 from pg_constraint where conrelid='public.care_links'::regclass and conname='care_links_patient_id_guardian_id_key')
 then raise exception 'FAIL reconnect_baseline'; end if;
end $$;
do $$ begin if not exists(select 1 from pg_proc p where p.oid=to_regprocedure('public.request_care_link(uuid)') and btrim(replace(p.prosrc,E'\r',''))=btrim($expected$
declare
    actor uuid := auth.uid();
    result uuid;
begin
    if actor is null or drmas_private.current_role() is distinct from 'guardian'
       or target_patient = actor
       or not exists (select 1 from public.profiles p where p.id = target_patient and p.role = 'patient') then
        raise exception 'Connection request not permitted' using errcode = '42501';
    end if;
    -- A new request always gets a fresh row ID and no approval metadata.
    -- Never update/resurrect a previously approved or revoked relationship.
    insert into public.care_links(patient_id, guardian_id, requested_by)
    values (target_patient, actor, actor)
    on conflict (patient_id, guardian_id) where status in ('pending', 'approved') do nothing
    returning id into result;
    if result is null then
        raise exception 'An active connection already exists' using errcode = '23505';
    end if;
    return result;
end;
$expected$) and p.prosecdef=true and p.proconfig=array['search_path=""']::text[] and pg_get_userbyid(p.proowner)='postgres') then raise exception 'FAIL rpc_or_auth_definition_contract'; end if; end $$;
do $$ begin if not exists(select 1 from pg_proc p where p.oid=to_regprocedure('public.revoke_care_link(uuid)') and btrim(replace(p.prosrc,E'\r',''))=btrim($expected$
declare
    actor uuid := auth.uid();
    link public.care_links%rowtype;
    reason text;
begin
    if actor is null then raise exception 'Revocation not permitted' using errcode = '42501'; end if;
    select c.* into link from public.care_links c
    where c.id = link_id and (c.patient_id = actor or c.guardian_id = actor)
    for update;
    if not found or link.status = 'revoked' then
        raise exception 'Revocation not permitted' using errcode = '42501';
    end if;
    reason := case when link.status = 'approved' then 'revoked'
                   when link.patient_id = actor then 'rejected'
                   else 'cancelled' end;
    update public.care_links c set status = 'revoked', revoked_at = pg_catalog.now(), closure_reason = reason
    where c.id = link.id;
end;
$expected$) and p.prosecdef=true and p.proconfig=array['search_path=""']::text[] and pg_get_userbyid(p.proowner)='postgres') then raise exception 'FAIL rpc_or_auth_definition_contract'; end if; end $$;
do $$ begin if not exists(select 1 from pg_proc p where p.oid=to_regprocedure('public.approve_care_link(uuid)') and btrim(replace(p.prosrc,E'\r',''))=btrim($expected$
begin
    if auth.uid() is null or drmas_private.current_role() is distinct from 'patient' then
        raise exception 'Approval not permitted' using errcode = '42501';
    end if;
    update public.care_links c set status = 'approved', approved_by = auth.uid(), approved_at = now()
    where c.id = link_id and c.patient_id = auth.uid() and c.status = 'pending'
      and exists (select 1 from public.profiles p where p.id = c.guardian_id and p.role = 'guardian');
    if not found then raise exception 'Approval not permitted' using errcode = '42501'; end if;
end;
$expected$) and p.prosecdef=true and p.proconfig=array['search_path=""']::text[] and pg_get_userbyid(p.proowner)='postgres') then raise exception 'FAIL rpc_or_auth_definition_contract'; end if; end $$;
do $$ begin if not exists(select 1 from pg_proc p where p.oid=to_regprocedure('drmas_private.can_read_patient(uuid)') and btrim(replace(p.prosrc,E'\r',''))=btrim($expected$
    select (target = (select auth.uid()) and drmas_private.current_role() = 'patient')
    or (drmas_private.current_role() = 'guardian' and exists (
        select 1 from public.care_links c join public.profiles p on p.id = c.patient_id
        where c.patient_id = target and c.guardian_id = (select auth.uid())
          and c.status = 'approved' and p.role = 'patient'
    ));
$expected$) and p.prosecdef=true and p.proconfig=array['search_path=""']::text[] and pg_get_userbyid(p.proowner)='postgres') then raise exception 'FAIL rpc_or_auth_definition_contract'; end if; end $$;
do $$ begin if not exists(select 1 from pg_proc p where p.oid=to_regprocedure('drmas_private.current_role()') and btrim(replace(p.prosrc,E'\r',''))=btrim($expected$
    select role from public.profiles where id = (select auth.uid());
$expected$) and p.prosecdef=true and p.proconfig=array['search_path=""']::text[] and pg_get_userbyid(p.proowner)='postgres') then raise exception 'FAIL rpc_or_auth_definition_contract'; end if; end $$;
do $$ begin if not exists(select 1 from pg_proc p where p.oid=to_regprocedure('auth.uid()') and btrim(replace(p.prosrc,E'\r',''))=btrim($expected$
    select coalesce(nullif(current_setting('request.jwt.claim.sub', true), ''),
        nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub')::uuid;
$expected$) and p.prosecdef=false and p.proconfig=array['search_path=""']::text[] and pg_get_userbyid(p.proowner)='postgres') then raise exception 'FAIL rpc_or_auth_definition_contract'; end if; end $$;
do $$ begin
 if not has_function_privilege('authenticated','public.request_care_link(uuid)','EXECUTE')
 or not has_function_privilege('authenticated','public.approve_care_link(uuid)','EXECUTE')
 or not has_function_privilege('authenticated','public.revoke_care_link(uuid)','EXECUTE')
 or has_function_privilege('anon','public.request_care_link(uuid)','EXECUTE')
 or has_function_privilege('anon','public.approve_care_link(uuid)','EXECUTE')
 or has_function_privilege('anon','public.revoke_care_link(uuid)','EXECUTE')
 or has_table_privilege('authenticated','public.care_links','INSERT,UPDATE,DELETE')
 then raise exception 'FAIL rpc_grant_contract'; end if;
 if (select count(*) from pg_policy where polrelid='public.care_links'::regclass)<>1
 or not exists(select 1 from pg_policy where polrelid='public.care_links'::regclass and polname='care_links_read_participant' and polcmd='r' and polroles=array[(select oid from pg_roles where rolname='authenticated')])
 then raise exception 'FAIL participant_policy_contract'; end if;
end $$;
