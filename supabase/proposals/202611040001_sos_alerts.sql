-- DRAFT ONLY. Separate approval required before applying to Supabase Dev.
-- Requires 202611010001_auth_and_care.sql; independent of reconnect migration.
-- No push delivery, location, message body, or emergency-service integration.
begin;
set local lock_timeout = '5s';
set local statement_timeout = '60s';
create table public.sos_alerts (
 id uuid primary key default gen_random_uuid(),
 request_id uuid not null,
 patient_id uuid not null references public.profiles(id),
 guardian_id uuid not null references public.profiles(id),
 created_at timestamptz not null default now(),
 acknowledged_at timestamptz,
 check (patient_id <> guardian_id),
 check (acknowledged_at is null or acknowledged_at >= created_at),
 unique (request_id, guardian_id)
);
create index sos_alerts_guardian_inbox on public.sos_alerts(guardian_id, acknowledged_at, created_at desc);
create index sos_alerts_patient_history on public.sos_alerts(patient_id, created_at desc);
alter table public.sos_alerts enable row level security;
revoke all on public.sos_alerts from public, anon, authenticated;
grant select on public.sos_alerts to authenticated;
grant all on public.sos_alerts to service_role;
create policy sos_read_participant on public.sos_alerts for select to authenticated using (
 (patient_id = (select auth.uid()) and drmas_private.current_role() = 'patient')
 or (guardian_id = (select auth.uid()) and drmas_private.current_role() = 'guardian'
     and drmas_private.can_read_patient(patient_id))
);

create function public.request_sos_alert() returns integer
language plpgsql security definer set search_path = '' as $$
declare actor uuid := auth.uid(); batch uuid := gen_random_uuid(); recipient record; sent integer := 0;
begin
 -- Serialize requests by the authenticated patient; never trust a supplied user ID.
 perform 1 from public.profiles where id = actor and role = 'patient' for update;
 if not found then raise exception using errcode = '42501', message = 'SOS_FORBIDDEN'; end if;
 if exists (select 1 from public.sos_alerts where patient_id = actor and created_at > now() - interval '30 seconds') then
   raise exception using errcode = 'P0001', message = 'SOS_RATE_LIMIT';
 end if;
 -- Locks keep consent valid through insertion. Revocation subsequently hides alerts.
 for recipient in select c.guardian_id from public.care_links c
   join public.profiles g on g.id = c.guardian_id and g.role = 'guardian'
   where c.patient_id = actor and c.status = 'approved' for share of c
 loop
   insert into public.sos_alerts(request_id, patient_id, guardian_id) values (batch, actor, recipient.guardian_id);
   sent := sent + 1;
 end loop;
 if sent = 0 then raise exception using errcode = 'P0002', message = 'SOS_NO_GUARDIAN'; end if;
 return sent;
end $$;

create function public.acknowledge_sos_alert(alert_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare target public.sos_alerts%rowtype;
begin
 if auth.uid() is null or drmas_private.current_role() is distinct from 'guardian' then
   raise exception using errcode = '42501', message = 'SOS_FORBIDDEN';
 end if;
 select * into target from public.sos_alerts where id = alert_id and guardian_id = auth.uid() for update;
 if not found or drmas_private.can_read_patient(target.patient_id) is not true then
   raise exception using errcode = '42501', message = 'SOS_FORBIDDEN';
 end if;
 perform 1 from public.care_links c where c.patient_id = target.patient_id
   and c.guardian_id = auth.uid() and c.status = 'approved' for share of c;
 if not found then raise exception using errcode = '42501', message = 'SOS_FORBIDDEN'; end if;
 -- Idempotent acknowledgment; never alters another guardian's receipt.
 update public.sos_alerts set acknowledged_at = coalesce(acknowledged_at, now()) where id = target.id;
end $$;
revoke all on function public.request_sos_alert(), public.acknowledge_sos_alert(uuid) from public, anon;
grant execute on function public.request_sos_alert(), public.acknowledge_sos_alert(uuid) to authenticated;
commit;
