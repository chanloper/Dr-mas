-- DRAFT MIGRATION: PREPARED ONLY. NOT EXECUTED ON OR APPROVED FOR DEV.
-- Kept outside migrations/ so normal CLI migration discovery cannot apply it.
-- Requires a verified 202611010001 baseline and a trusted existing function owner.
-- No existing row is deleted, reactivated, or backfilled.
begin;
set local lock_timeout = '5s';
set local statement_timeout = '60s';
set local search_path = pg_catalog;

lock table public.care_links in access exclusive mode;
do $$
begin
    if not exists (
        select 1 from pg_catalog.pg_class c
        where c.oid = 'public.care_links'::regclass and c.relrowsecurity
    ) then raise exception 'CARE_LINK_RLS_BASELINE_REQUIRED'; end if;
    if not exists (
        select 1 from pg_catalog.pg_constraint k
        where k.conrelid = 'public.care_links'::regclass
          and k.conname = 'care_links_patient_id_guardian_id_key' and k.contype = 'u'
          and k.conkey = array[
            (select a.attnum from pg_catalog.pg_attribute a where a.attrelid = k.conrelid and a.attname = 'patient_id'),
            (select a.attnum from pg_catalog.pg_attribute a where a.attrelid = k.conrelid and a.attname = 'guardian_id')
          ]::smallint[]
    ) then raise exception 'CARE_LINK_PAIR_CONSTRAINT_BASELINE_REQUIRED'; end if;
end;
$$;

alter table public.care_links add column closure_reason text;
alter table public.care_links add constraint care_links_closure_reason_check check (
    (status <> 'revoked' and closure_reason is null)
    or (status = 'revoked' and (closure_reason is null or closure_reason in ('rejected', 'cancelled', 'revoked')))
);
-- Existing revoked rows keep NULL: their historical reason is unknown.
-- Create protection before removing the old global pair constraint.
create unique index care_links_one_active_pair on public.care_links(patient_id, guardian_id)
where status in ('pending', 'approved');
alter table public.care_links drop constraint care_links_patient_id_guardian_id_key;

create or replace function public.request_care_link(target_patient uuid) returns uuid
language plpgsql security definer set search_path = '' as $$
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
$$;

create or replace function public.revoke_care_link(link_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
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
$$;

-- CREATE OR REPLACE retains existing function owners; do not apply under an
-- unreviewed owner. Explicitly preserve client execute restrictions.
revoke all on function public.request_care_link(uuid), public.revoke_care_link(uuid) from public, anon;
grant execute on function public.request_care_link(uuid), public.revoke_care_link(uuid) to authenticated;
-- approve_care_link, medication RLS, participant SELECT RLS and table DML GRANTs
-- remain unchanged. Stale approval IDs still cannot approve a fresh request.
commit;
