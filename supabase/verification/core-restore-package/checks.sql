-- Runs in the same restore transaction. No patient IDs/rows are printed.
do $$ declare t text; different boolean;
begin
 foreach t in array array['profiles','care_links','medications','medication_records'] loop
  execute format('select exists((select * from public.%I except all select * from pg_temp.%I) union all (select * from pg_temp.%I except all select * from public.%I))',t,'expected_'||t,'expected_'||t,t) into different;
  if different then raise exception 'CORE_DATA_MISMATCH'; end if;
 end loop;
 if (select count(*) from auth.users)<>(select count(*) from public.profiles)
 or exists(select 1 from public.profiles p left join auth.users u on u.id=p.id where u.id is null)
 then raise exception 'AUTH_SURROGATE_MISMATCH'; end if;
 if (select count(*) from pg_constraint where conrelid in ('public.profiles'::regclass,'public.care_links'::regclass,'public.medications'::regclass,'public.medication_records'::regclass) and contype='f' and convalidated)<>8
 then raise exception 'FK_VALIDATION_MISMATCH'; end if;
 if (select count(*) from pg_class where oid in ('public.profiles'::regclass,'public.care_links'::regclass,'public.medications'::regclass,'public.medication_records'::regclass) and relrowsecurity)<>4
 then raise exception 'RLS_FLAGS_MISMATCH'; end if;
 if has_table_privilege('authenticated','public.care_links','INSERT,UPDATE,DELETE')
 or has_column_privilege('authenticated','public.profiles','role','UPDATE')
 or has_function_privilege('anon','public.request_care_link(uuid)','EXECUTE')
 or has_function_privilege('anon','public.approve_care_link(uuid)','EXECUTE')
 or has_function_privilege('anon','public.revoke_care_link(uuid)','EXECUTE')
 then raise exception 'PRIVILEGE_BOUNDARY_MISMATCH'; end if;
end $$;
-- Exhaustive read checks over restored identities, without exposing them.
do $$ declare actor record; expected_m bigint;expected_r bigint;actual_m bigint;actual_r bigint;changed bigint;
begin
 for actor in select id,role from public.profiles loop
  select count(*) into expected_m from public.medications m where
   (actor.role='patient' and m.patient_id=actor.id) or
   (actor.role='guardian' and exists(select 1 from public.care_links c join public.profiles p on p.id=c.patient_id where c.guardian_id=actor.id and c.patient_id=m.patient_id and c.status='approved' and p.role='patient'));
  select count(*) into expected_r from public.medication_records m where
   (actor.role='patient' and m.patient_id=actor.id) or
   (actor.role='guardian' and exists(select 1 from public.care_links c join public.profiles p on p.id=c.patient_id where c.guardian_id=actor.id and c.patient_id=m.patient_id and c.status='approved' and p.role='patient'));
  perform set_config('request.jwt.claim.sub',actor.id::text,true);
  set local role authenticated;
  select count(*) into actual_m from public.medications;
  select count(*) into actual_r from public.medication_records;
  if actual_m<>expected_m or actual_r<>expected_r then raise exception 'RESTORED_RLS_READ_MISMATCH'; end if;
  if exists(select 1 from public.care_links where patient_id<>actor.id and guardian_id<>actor.id)
  then raise exception 'PARTICIPANT_RLS_MISMATCH'; end if;
  update public.medications set title=title where patient_id<>actor.id;
  get diagnostics changed=row_count;
  if changed<>0 then raise exception 'CROSS_PATIENT_WRITE_ALLOWED'; end if;
  reset role;
 end loop;
 perform set_config('request.jwt.claim.sub','',true);
 set local role anon;
 begin perform count(*) from public.care_links; raise exception 'ANON_READ_ALLOWED';
 exception when insufficient_privilege then null; end;
 reset role;
end $$;
-- Data is compared AGAIN after access checks. Per-row differences never leave DB.
do $$ declare t text;different boolean;
begin foreach t in array array['profiles','care_links','medications','medication_records'] loop
 execute format('select exists((select * from public.%I except all select * from pg_temp.%I) union all (select * from pg_temp.%I except all select * from public.%I))',t,'expected_'||t,'expected_'||t,t) into different;
 if different then raise exception 'POST_CHECK_DATA_CHANGED'; end if;
end loop; end $$;
-- Safe counts only. Unrepresented role/status cases require the synthetic probe.
select (select count(*) from public.profiles) as profiles,
 (select count(*) from public.care_links) as links,
 (select count(*) from public.medications) as medications,
 (select count(*) from public.medication_records) as records;
