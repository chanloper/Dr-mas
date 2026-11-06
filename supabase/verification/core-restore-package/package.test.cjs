const {test}=require('node:test');const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path');
const {selectEntry,copyBlocks}=require('./selection.cjs');
const read=n=>fs.readFileSync(path.join(__dirname,n),'utf8');
test('selection keeps core dependencies and denies managed executables and unrelated objects',()=>{
 for(const text of ['TABLE public profiles postgres','TABLE DATA public care_links postgres','FK CONSTRAINT public profiles profiles_id_fkey postgres','TYPE public drmas_role postgres','ACL public COLUMN profiles.display_name postgres','FUNCTION drmas_private current_role() postgres','ACL drmas_private FUNCTION "current_role"() postgres','TRIGGER auth users drmas_auth_user_created supabase_auth_admin'])assert.ok(selectEntry('1; 0 0 '+text));
 for(const text of ['TABLE DATA auth users supabase_auth_admin','FUNCTION public rls_auto_enable() postgres','EVENT TRIGGER - auto_rls supabase_admin','EXTENSION - supabase_vault supabase_admin','DEFAULT ACL public DEFAULT PRIVILEGES FOR TABLES postgres','ACL - SCHEMA public pg_database_owner','TABLE public unexpected postgres'])assert.equal(selectEntry('1; 0 0 '+text),false);
});
test('COPY framing preserves escaped tabs, nulls, empty fields and zero-row tables',()=>{
 const sql=['profiles','care_links','medications','medication_records'].map((t,i)=>`COPY public.${t} (id, value) FROM stdin;\n`+(i===0?'00000000-0000-0000-0000-000000000001\tSynthetic\\ttext\n':i===1?'00000000-0000-0000-0000-000000000002\t\\N\n':i===2?'00000000-0000-0000-0000-000000000003\t\n':'')+'\\.\n').join('');
 const b=copyBlocks(sql);assert.deepEqual(b.map(x=>x.rows.length),[1,1,1,0]);assert.ok(b[0].rows[0].includes('\\t'));assert.ok(b[1].rows[0].endsWith('\\N'));assert.ok(b[2].rows[0].endsWith('\t'));assert.throws(()=>copyBlocks(sql.replace('\\.','missing')),/COPY_/);
});
test('restore has isolated target, fail-closed fresh cluster and no pre-trigger Auth collision',()=>{
 const b=read('bootstrap.sql');for(const item of ['55433','drmas_core_restore_verify','REQUIRES_FRESH_CLUSTER_AND_DB','nologin','nobypassrls'])assert.ok(b.includes(item));
 const p=read('prepare.cjs');assert.ok(p.indexOf('STAGE auth_reference_stubs')<p.indexOf('STAGE archived_post_data'));
 assert.match(p,/flag:'wx'/);assert.match(p,/CHECKSUM_MISMATCH/);assert.doesNotMatch(p,/PGPASSWORD|DATABASE_URL|--dbname|--host|--port/);
});
test('data assertions cover full multiset and FK/ACL/RLS; synthetic mutations roll back',()=>{
 const s=read('checks.sql');assert.ok((s.match(/except all/g)||[]).length>=4);for(const label of ['FK_VALIDATION_MISMATCH','PRIVILEGE_BOUNDARY_MISMATCH','RESTORED_RLS_READ_MISMATCH','CROSS_PATIENT_WRITE_ALLOWED','POST_CHECK_DATA_CHANGED'])assert.ok(s.includes(label));
 const synthetic=read('synthetic.sql');assert.match(synthetic,/exception when sqlstate 'Z0001' then null/);assert.match(synthetic,/SYNTHETIC_FIXTURE_REMAINED/);assert.doesNotMatch(synthetic,/delete from|truncate/i);
 const v=read('verify.cjs');assert.ok(v.indexOf('CORE_DATA_PARTIAL_RESTORE_PASS')>v.indexOf('CATALOG_CATEGORY_MISMATCH_'));assert.match(v,/FULL_SUPABASE_RESTORE_UNVERIFIED/);
});
