-- All synthetic mutations roll back inside this exception subtransaction.
do $$ declare a uuid:=gen_random_uuid(); b uuid:=gen_random_uuid(); g uuid:=gen_random_uuid(); h uuid:=gen_random_uuid(); link uuid; n bigint;
begin
 begin
  insert into auth.users(id,raw_user_meta_data) values(a,'{"display_name":"Synthetic restore A"}'),(b,'{"display_name":"Synthetic restore B"}'),(g,'{"display_name":"Synthetic restore G"}'),(h,'{"display_name":"Synthetic restore H"}');
  if (select count(*) from public.profiles where id in(a,b,g,h))<>4 then raise exception 'SIGNUP_TRIGGER_FAILED'; end if;
  update public.profiles set role='guardian' where id in(g,h);
  insert into public.medications(patient_id,title,time_local) values(a,'Synthetic restore schedule','08:00');
  perform set_config('request.jwt.claim.sub',g::text,true);
  set local role authenticated;
  link:=public.request_care_link(a);
  if exists(select 1 from public.medications where patient_id=a) then raise exception 'PENDING_READ_ALLOWED'; end if;
  begin perform public.approve_care_link(link); raise exception 'SELF_APPROVAL_ALLOWED'; exception when insufficient_privilege then null; end;
  perform set_config('request.jwt.claim.sub',b::text,true);
  if exists(select 1 from public.care_links where id=link) then raise exception 'OTHER_PATIENT_LINK_VISIBLE'; end if;
  begin perform public.approve_care_link(link); raise exception 'OTHER_PATIENT_APPROVAL_ALLOWED'; exception when insufficient_privilege then null; end;
  perform set_config('request.jwt.claim.sub',h::text,true);
  if exists(select 1 from public.care_links where id=link) then raise exception 'OTHER_GUARDIAN_LINK_VISIBLE'; end if;
  begin perform public.revoke_care_link(link); raise exception 'OTHER_GUARDIAN_REVOKE_ALLOWED'; exception when insufficient_privilege then null; end;
  perform set_config('request.jwt.claim.sub',a::text,true);
  perform public.approve_care_link(link);
  perform set_config('request.jwt.claim.sub',g::text,true);
  select count(*) into n from public.medications where patient_id=a;
  if n<>1 then raise exception 'APPROVED_READ_DENIED'; end if;
  update public.medications set title=title where patient_id=a;
  get diagnostics n=row_count;
  if n<>0 then raise exception 'GUARDIAN_WRITE_ALLOWED'; end if;
  perform set_config('request.jwt.claim.sub',a::text,true);
  perform public.revoke_care_link(link);
  perform set_config('request.jwt.claim.sub',g::text,true);
  if exists(select 1 from public.medications where patient_id=a) then raise exception 'REVOKED_READ_ALLOWED'; end if;
  reset role;
  raise exception using errcode='Z0001',message='ROLLBACK_SYNTHETIC_FIXTURES';
 exception when sqlstate 'Z0001' then null;
 end;
 if exists(select 1 from auth.users where id in(a,b,g,h)) or exists(select 1 from public.profiles where id in(a,b,g,h))
 then raise exception 'SYNTHETIC_FIXTURE_REMAINED'; end if;
end $$;
