-- Approval required. Creates only KDCA control metadata; no existing tables changed.
begin;
create table public.rag_kdca_controls (
  content_id text primary key check (content_id ~ '^[0-9]{1,10}$'),
  document_version integer not null check (document_version > 0),
  raw_hash text not null check (raw_hash ~ '^[a-f0-9]{64}$'),
  content_hash text not null check (content_hash ~ '^[a-f0-9]{64}$'),
  snapshot_sha256 text not null check (snapshot_sha256 ~ '^[a-f0-9]{64}$'),
  status text not null check (status in ('active','revoked','changed_pending_review','refresh_failed')),
  verified_at timestamptz not null,
  operator text not null check (length(btrim(operator)) between 1 and 100),
  updated_at timestamptz not null default now(),
  revision integer not null default 1 check (revision > 0)
);
alter table public.rag_kdca_controls enable row level security;
revoke all on public.rag_kdca_controls from public, anon, authenticated, service_role;
grant select on public.rag_kdca_controls to service_role;
-- Runtime operator command can stop service; it cannot renew verification, replace
-- approved hashes, insert/upsert an active row, or delete the durable stop record.
grant update (status, operator, updated_at, revision) on public.rag_kdca_controls to service_role;
create function public.rag_kdca_stop_only() returns trigger language plpgsql
set search_path = '' as $$
begin
  if current_user = 'service_role' then
    if new.revision <> old.revision + 1 or (new.status = 'active' and old.status <> 'active') then
      raise exception 'KDCA_CONTROL_REVIEW_REQUIRED';
    end if;
  end if;
  return new;
end;
$$;
revoke all on function public.rag_kdca_stop_only() from public, anon, authenticated;
create trigger rag_kdca_stop_only before update on public.rag_kdca_controls
for each row execute function public.rag_kdca_stop_only();
notify pgrst, 'reload schema';
commit;
