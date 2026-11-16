-- Approval required. Bound to the existing reviewed registration; no source revalidation.
begin;
do $$ begin
 if timestamptz '2026-11-16T09:16:30.378Z' <= now() - interval '24 hours' then
  raise exception 'KDCA_SOURCE_VERIFICATION_EXPIRED';
 end if;
end $$;
insert into public.rag_kdca_controls
(content_id,document_version,raw_hash,content_hash,snapshot_sha256,status,verified_at,operator)
values ('5830',1,'ec5cde998f984fa57104e36a60e53d7a2bea1b89e80a33c58fc4336542496dd0','fe18303f356b834970af45460b1ec68f6ce37977d79fb466755816a6de8e0562','0ca7ab26c21a48478614926ea35dcdb2974a6c507acb550d91f9a3375266fc64','active','2026-11-16T09:16:30.378Z','Codex: existing user-approved registration')
on conflict (content_id) do nothing;
do $$ begin
 if not exists (select 1 from public.rag_kdca_controls where content_id='5830'
  and status='active' and document_version=1
  and raw_hash='ec5cde998f984fa57104e36a60e53d7a2bea1b89e80a33c58fc4336542496dd0' and content_hash='fe18303f356b834970af45460b1ec68f6ce37977d79fb466755816a6de8e0562'
  and snapshot_sha256='0ca7ab26c21a48478614926ea35dcdb2974a6c507acb550d91f9a3375266fc64'
  and verified_at > now() - interval '24 hours' and verified_at <= now()) then
  raise exception 'KDCA_EXISTING_CONTROL_PRESERVED_REVIEW_REQUIRED';
 end if;
end $$;
commit;
