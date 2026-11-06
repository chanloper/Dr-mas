-- PREPARED ONLY. Run with explicit approval on the intended Dev connection.
-- Private output: aggregate fingerprints/counts, never rows/IDs/medical text.
begin transaction isolation level repeatable read read only;
set local statement_timeout='30s';
set local lock_timeout='2s';
set local search_path=pg_catalog;
set local timezone='UTC';
with fingerprints as (
 select 'profiles' as name,count(*) as rows,
 encode(sha256(convert_to(coalesce(jsonb_agg(to_jsonb(t) order by t.id),'[]'::jsonb)::text,'UTF8')),'hex') as fingerprint
 from public.profiles t
 union all
 select 'care_links',count(*),
 encode(sha256(convert_to(coalesce(jsonb_agg(to_jsonb(t)-'closure_reason' order by t.id),'[]'::jsonb)::text,'UTF8')),'hex')
 from public.care_links t
 union all
 select 'medications',count(*),
 encode(sha256(convert_to(coalesce(jsonb_agg(to_jsonb(t) order by t.id),'[]'::jsonb)::text,'UTF8')),'hex')
 from public.medications t
 union all
 select 'medication_records',count(*),
 encode(sha256(convert_to(coalesce(jsonb_agg(to_jsonb(t) order by t.medication_id,t.day),'[]'::jsonb)::text,'UTF8')),'hex')
 from public.medication_records t
)
select jsonb_build_object(
 'format','drmas-reconnect-data-preservation-v1',
 'server_major',current_setting('server_version_num')::int/10000,
 'read_only',current_setting('transaction_read_only')='on',
 'old_pair_constraint_count',(select count(*) from pg_constraint where conrelid='public.care_links'::regclass and conname='care_links_patient_id_guardian_id_key' and contype='u'),
 'new_index_present',to_regclass('public.care_links_one_active_pair') is not null,
 'closure_reason_present',exists(select 1 from pg_attribute where attrelid='public.care_links'::regclass and attname='closure_reason' and not attisdropped),
 'fingerprints',(select jsonb_agg(to_jsonb(x) order by name) from fingerprints x),
 'states',(select coalesce(jsonb_object_agg(status,n),'{}'::jsonb) from (select status::text,count(*) as n from public.care_links group by status) s),
 'rls_table_count',(select count(*) from pg_class where oid in ('public.profiles'::regclass,'public.care_links'::regclass,'public.medications'::regclass,'public.medication_records'::regclass) and relrowsecurity)
) as preservation;
rollback;
