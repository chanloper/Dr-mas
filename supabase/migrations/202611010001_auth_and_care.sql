-- REVIEW ARTIFACT ONLY. Not applied to any remote project.
-- Target: a separately reviewed Supabase PostgreSQL project, NOT MariaDB.
-- Apply once under a trusted migration owner. No legacy reads/imports/deletes.
begin;
set local lock_timeout = '5s';
set local statement_timeout = '60s';

-- Refuse to reuse a pre-existing schema with unknown ownership/grants.
create schema drmas_private;
revoke all on schema drmas_private from public, anon, authenticated;
grant usage on schema drmas_private to authenticated;

create type public.drmas_role as enum ('patient', 'guardian');
create type public.drmas_link_status as enum ('pending', 'approved', 'revoked');

create table public.profiles (
    id uuid primary key references auth.users(id) on delete cascade,
    display_name text not null check (char_length(display_name) between 1 and 100),
    role public.drmas_role not null default 'patient',
    created_at timestamptz not null default now()
);

create table public.care_links (
    id uuid primary key default gen_random_uuid(),
    patient_id uuid not null references public.profiles(id),
    guardian_id uuid not null references public.profiles(id),
    requested_by uuid not null references public.profiles(id),
    status public.drmas_link_status not null default 'pending',
    approved_by uuid references public.profiles(id),
    approved_at timestamptz,
    revoked_at timestamptz,
    created_at timestamptz not null default now(),
    unique (patient_id, guardian_id),
    check (patient_id <> guardian_id),
    check (requested_by = guardian_id),
    check ((approved_by is null and approved_at is null) or (approved_by is not null and approved_by = patient_id and approved_at is not null)),
    check (status <> 'approved' or (approved_by is not null and approved_by = patient_id and approved_at is not null and revoked_at is null)),
    check (status <> 'pending' or (approved_by is null and approved_at is null and revoked_at is null)),
    check (status <> 'revoked' or revoked_at is not null)
);
create index care_links_guardian on public.care_links (guardian_id, patient_id, status);
create index care_links_requested_by on public.care_links (requested_by);
create index care_links_approved_by on public.care_links (approved_by) where approved_by is not null;

create table public.medications (
    id uuid primary key default gen_random_uuid(),
    patient_id uuid not null references public.profiles(id),
    title text not null check (char_length(title) between 1 and 200),
    detail text not null default '' check (char_length(detail) <= 2000),
    time_local time not null check (time_local < time '24:00:00'),
    timezone text not null default 'Asia/Seoul' check (char_length(timezone) between 1 and 100),
    active boolean not null default true,
    created_at timestamptz not null default now(),
    unique (id, patient_id)
);
create index medications_patient on public.medications(patient_id);

create function drmas_private.validate_medication_timezone() returns trigger
language plpgsql security invoker set search_path = '' as $$
begin
    if not exists (select 1 from pg_catalog.pg_timezone_names where name = new.timezone) then
        raise exception 'Invalid medication timezone' using errcode = '23514';
    end if;
    return new;
end;
$$;
revoke all on function drmas_private.validate_medication_timezone() from public, anon, authenticated;
create trigger drmas_medication_timezone before insert or update of timezone on public.medications
for each row execute function drmas_private.validate_medication_timezone();

create table public.medication_records (
    medication_id uuid not null,
    patient_id uuid not null references public.profiles(id),
    day date not null,
    taken boolean not null default false,
    taken_at timestamptz,
    created_at timestamptz not null default now(),
    primary key (medication_id, day),
    foreign key (medication_id, patient_id) references public.medications(id, patient_id),
    check ((taken and taken_at is not null) or (not taken and taken_at is null))
);
create index medication_records_patient on public.medication_records(patient_id, day);

create function drmas_private.keep_record_identity() returns trigger
language plpgsql security invoker set search_path = '' as $$
begin
    if new.medication_id is distinct from old.medication_id
       or new.patient_id is distinct from old.patient_id
       or new.day is distinct from old.day then
        raise exception 'Medication record identity cannot change' using errcode = '23514';
    end if;
    return new;
end;
$$;
revoke all on function drmas_private.keep_record_identity() from public, anon, authenticated;
create trigger drmas_record_identity before update on public.medication_records
for each row execute function drmas_private.keep_record_identity();

-- Privileged helpers use a fixed empty search_path and qualified object names.
-- They are owned by the trusted migration owner, never by an application role.
create function drmas_private.current_role() returns public.drmas_role
language sql stable security definer set search_path = '' as $$
    select role from public.profiles where id = (select auth.uid());
$$;
revoke all on function drmas_private.current_role() from public, anon;
grant execute on function drmas_private.current_role() to authenticated;

create function drmas_private.handle_new_user() returns trigger
language plpgsql security definer set search_path = '' as $$
declare label text;
begin
    label := left(coalesce(nullif(trim(new.raw_user_meta_data ->> 'display_name'), ''), '사용자'), 100);
    -- Never copy role/requestedRole/app claims from client-controlled metadata.
    insert into public.profiles(id, display_name, role) values (new.id, label, 'patient');
    return new;
end;
$$;
revoke all on function drmas_private.handle_new_user() from public, anon, authenticated;
create trigger drmas_auth_user_created after insert on auth.users
for each row execute function drmas_private.handle_new_user();

alter table public.profiles enable row level security;
alter table public.care_links enable row level security;
alter table public.medications enable row level security;
alter table public.medication_records enable row level security;

revoke all on public.profiles, public.care_links, public.medications, public.medication_records from public, anon, authenticated;
grant all on public.profiles, public.care_links, public.medications, public.medication_records to service_role;
grant select on public.profiles, public.care_links, public.medications, public.medication_records to authenticated;
grant update (display_name) on public.profiles to authenticated;
grant insert, delete on public.medications, public.medication_records to authenticated;
grant update (title, detail, time_local, timezone, active) on public.medications to authenticated;
-- Upsert payload includes key fields. RLS WITH CHECK enforces ownership and the
-- composite FK prevents using another patient's medication. The identity trigger
-- permits unchanged upsert key values but rejects actual owner/schedule/day changes.
grant update (medication_id, patient_id, day, taken, taken_at) on public.medication_records to authenticated;

create policy profiles_read_self on public.profiles for select to authenticated using (id = (select auth.uid()));
create policy profiles_edit_name on public.profiles for update to authenticated using (id = (select auth.uid())) with check (id = (select auth.uid()));
-- No insert/delete policy or role column UPDATE grant exists for client roles.
create policy care_links_read_participant on public.care_links for select to authenticated
using (patient_id = (select auth.uid()) or guardian_id = (select auth.uid()));
-- All connection writes go through narrow approval RPCs below.

create function drmas_private.can_read_patient(target uuid) returns boolean
language sql stable security definer set search_path = '' as $$
    select (target = (select auth.uid()) and drmas_private.current_role() = 'patient')
    or (drmas_private.current_role() = 'guardian' and exists (
        select 1 from public.care_links c join public.profiles p on p.id = c.patient_id
        where c.patient_id = target and c.guardian_id = (select auth.uid())
          and c.status = 'approved' and p.role = 'patient'
    ));
$$;
revoke all on function drmas_private.can_read_patient(uuid) from public, anon;
grant execute on function drmas_private.can_read_patient(uuid) to authenticated;

create policy medications_read on public.medications for select to authenticated using (drmas_private.can_read_patient(patient_id));
create policy medications_add_self on public.medications for insert to authenticated with check (patient_id = (select auth.uid()) and drmas_private.current_role() = 'patient');
create policy medications_edit_self on public.medications for update to authenticated using (patient_id = (select auth.uid()) and drmas_private.current_role() = 'patient') with check (patient_id = (select auth.uid()) and drmas_private.current_role() = 'patient');
create policy medications_remove_self on public.medications for delete to authenticated using (patient_id = (select auth.uid()) and drmas_private.current_role() = 'patient');
create policy records_read on public.medication_records for select to authenticated using (drmas_private.can_read_patient(patient_id));
create policy records_add_self on public.medication_records for insert to authenticated with check (patient_id = (select auth.uid()) and drmas_private.current_role() = 'patient');
create policy records_edit_self on public.medication_records for update to authenticated using (patient_id = (select auth.uid()) and drmas_private.current_role() = 'patient') with check (patient_id = (select auth.uid()) and drmas_private.current_role() = 'patient');
create policy records_remove_self on public.medication_records for delete to authenticated using (patient_id = (select auth.uid()) and drmas_private.current_role() = 'patient');

create function public.request_care_link(target_patient uuid) returns uuid
language plpgsql security definer set search_path = '' as $$
declare result uuid;
begin
    if auth.uid() is null or drmas_private.current_role() is distinct from 'guardian'
       or not exists (select 1 from public.profiles where id = target_patient and role = 'patient')
       or target_patient = auth.uid() then
        raise exception 'Connection request not permitted' using errcode = '42501';
    end if;
    insert into public.care_links(patient_id, guardian_id, requested_by)
    values (target_patient, auth.uid(), auth.uid()) returning id into result;
    -- A revoked pair cannot be silently reactivated by repeating this RPC.
    return result;
end;
$$;
create function public.approve_care_link(link_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
begin
    if auth.uid() is null or drmas_private.current_role() is distinct from 'patient' then
        raise exception 'Approval not permitted' using errcode = '42501';
    end if;
    update public.care_links c set status = 'approved', approved_by = auth.uid(), approved_at = now()
    where c.id = link_id and c.patient_id = auth.uid() and c.status = 'pending'
      and exists (select 1 from public.profiles p where p.id = c.guardian_id and p.role = 'guardian');
    if not found then raise exception 'Approval not permitted' using errcode = '42501'; end if;
end;
$$;
create function public.revoke_care_link(link_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
begin
    if auth.uid() is null then raise exception 'Revocation not permitted' using errcode = '42501'; end if;
    update public.care_links set status = 'revoked', revoked_at = now()
    where id = link_id and (patient_id = auth.uid() or guardian_id = auth.uid()) and status <> 'revoked';
    if not found then raise exception 'Revocation not permitted' using errcode = '42501'; end if;
end;
$$;
revoke all on function public.request_care_link(uuid), public.approve_care_link(uuid), public.revoke_care_link(uuid) from public, anon;
grant execute on function public.request_care_link(uuid), public.approve_care_link(uuid), public.revoke_care_link(uuid) to authenticated;
commit;
