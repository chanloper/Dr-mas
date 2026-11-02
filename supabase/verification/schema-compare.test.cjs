'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {inventory,bindReference,compare}=require('./schema-compare.cjs');

// Entirely synthetic catalogue metadata, never a real PostgreSQL execution.
function fixture() {
  const c=inventory();
  const indexes=c.explicitIndexes.map(i=>({table_name:i.table,name:i.name,definition_hash:'0'.repeat(64)}));
  for(let i=0;i<6;i++)indexes.push({table_name:'profiles',name:`synthetic_implicit_${i}`,definition_hash:'1'.repeat(64)});
  return {format:'drmas-p1-catalog-v1',server_major:17,exposed_schemas:null,
    tables:c.tables.map(t=>({name:t.name,rls:true,force_rls:false,owner:'postgres',grants:[],effective:[]})),
    columns:c.tables.flatMap(t=>t.columns.map(name=>({table_name:t.name,name,type:'synthetic',not_null:true,default_hash:null,grants:[],effective:[]}))),
    constraints:[['p',4],['u',2],['f',8],['c',12]].flatMap(([kind,n])=>Array.from({length:n},(_,i)=>({table_name:'profiles',name:`synthetic_${kind}_${i}`,kind,definition_hash:'2'.repeat(64)}))),
    indexes,policies:c.policies.map(p=>({table_name:p.table,name:p.name,using_hash:'3'.repeat(64),check_hash:null,roles:['authenticated']})),
    functions:c.functions.map(f=>({schema_name:f.schema,name:f.name,arguments:f.arguments,definition_hash:'4'.repeat(64),security_definer:true,owner:'postgres',config:['search_path=""'],grants:[]})),
    triggers:c.triggers.map(t=>({schema_name:t.schema,table_name:t.table,name:t.name,enabled:'O',definition_hash:'5'.repeat(64)})),
    schemas:[{name:'public',owner:'postgres',grants:[]},{name:'drmas_private',owner:'postgres',grants:[]}],
    roles:['anon','authenticated','service_role'].map(name=>({name,superuser:false,bypass_rls:name==='service_role',inherit:true,can_login:false})),
    enums:c.enums,public_objects:c.tables.map(t=>({name:t.name,kind:'r',rls:true}))};
}
test('local migration inventory includes complete app columns, five indexes, eight functions and three triggers',()=>{
  const c=inventory();assert.equal(c.tables.length,4);assert.equal(c.tables.flatMap(t=>t.columns).length,27);
  assert.equal(c.explicitIndexes.length,5);assert.equal(c.functions.length,8);assert.equal(c.triggers.length,3);assert.equal(c.policies.length,11);assert.equal(c.enums.length,2);
});
test('snapshot row ordering is ignored but matching catalogues never claim runtime RLS passed',()=>{
  const a=fixture(),b=structuredClone(a);b.tables.reverse();b.columns.reverse();b.constraints.reverse();
  const r=compare(bindReference(a,true),b);assert.equal(r.status,'catalogues_match');assert.equal(r.rlsRuntime,'unverified');assert.equal(r.authSettings,'unverified');assert.equal(r.apiExposure,'unverified');
});
test('missing columns, FK, indexes, altered RLS, grants, policies, RPC body and triggers are detected',()=>{
  const a=fixture(),reference=bindReference(a,true);
  for(const mutate of [
    b=>b.columns.pop(),b=>b.constraints.splice(b.constraints.findIndex(c=>c.kind==='f'),1),b=>b.indexes.pop(),
    b=>{b.tables[0].rls=false;},b=>{b.tables[0].grants.push({grantee:'anon',privilege:'SELECT',grantable:false});},
    b=>{b.policies[0].using_hash='9'.repeat(64);},b=>{b.functions[0].definition_hash='8'.repeat(64);},
    b=>{b.triggers[0].enabled='D';},b=>{b.roles[0].bypass_rls=true;},b=>{b.schemas[0].owner='untrusted-fixture-owner';}
  ]) {const b=structuredClone(a);mutate(b);assert.equal(compare(reference,b).status,'drift_detected');}
});
test('unreviewed, stale or incomplete reference cannot produce a comparison pass',()=>{
  const a=fixture();assert.throws(()=>bindReference(a,false),/REVIEWED_REFERENCE_REQUIRED/);
  const ref=bindReference(a,true);ref.migrationSha256='0'.repeat(64);assert.throws(()=>compare(ref,a),/REFERENCE_STALE_OR_UNREVIEWED/);
  const incomplete=fixture();incomplete.constraints.pop();assert.throws(()=>bindReference(incomplete,true),/REFERENCE_CONTRACT_MISMATCH/);
  const unsafe=fixture();unsafe.roles[0].superuser=true;assert.throws(()=>bindReference(unsafe,true),/REFERENCE_CONTRACT_MISMATCH/);
});
test('different PostgreSQL major stays unverified and enum label order changes are not hidden',()=>{
  const a=fixture(),ref=bindReference(a,true),b=structuredClone(a);b.server_major=18;
  assert.equal(compare(ref,b).status,'unverified');b.server_major=17;b.enums[0].labels.reverse();assert.equal(compare(ref,b).status,'drift_detected');
});
test('diff report never includes observed values or accepts unknown credential fields',()=>{
  const a=fixture(),b=structuredClone(a);b.tables[0].owner='synthetic-sensitive-marker';
  const result=JSON.stringify(compare(bindReference(a,true),b));assert.ok(!result.includes('synthetic-sensitive-marker'));assert.ok(result.includes('value-differs'));
  b.credential='synthetic-sensitive-marker';assert.throws(()=>compare(bindReference(a,true),b),/UNRECOGNIZED_CATALOG_FIELD/);
});
test('catalogue query is read-only metadata and emits definition fingerprints instead of user data or bodies',()=>{
  const text=fs.readFileSync(path.join(__dirname,'catalog-readonly.sql'),'utf8').replace(/--[^\n]*/g,'');
  assert.match(text,/begin transaction isolation level repeatable read read only;/i);assert.match(text.trim(),/rollback;$/i);
  assert.doesNotMatch(text,/\b(?:insert|update|delete|alter|create|drop|truncate|grant|revoke|do|call)\s+(?:table|schema|function|into|from|public\.)/i);
  assert.doesNotMatch(text,/\b(?:from|join)\s+(?:public\.(?:profiles|medications|medication_records|care_links)|auth\.users)\b/i);
  for(const name of ['pg_constraint','pg_index','pg_policy','pg_attribute','pg_trigger','aclexplode','has_column_privilege'])assert.ok(text.includes(name));
  assert.match(text,/sha256\(convert_to\(pg_get_functiondef/);
});

test('ACL fallback distinguishes absent column grants from table defaults without constructing ACL arrays',()=>{
  const sql=fs.readFileSync(path.join(__dirname,'catalog-readonly.sql'),'utf8').replace(/--[^\n]*/g,'');
  assert.match(sql,/aclexplode\(coalesce\(a\.attacl,acldefault\('c',c\.relowner\)\)\)/);
  for(const expression of ["c.relacl,acldefault('r',c.relowner)","p.proacl,acldefault('f',p.proowner)","n.nspacl,acldefault('n',n.nspowner)"])
    assert.ok(sql.includes(`aclexplode(coalesce(${expression}))`));
  assert.equal((sql.match(/\baclexplode\(/g)||[]).length,4);
  assert.doesNotMatch(sql,/'\{\}'::aclitem\[\]|\barray_(?:agg|cat)\s*\(/i);
});

test('function config export hashes each setting in order without raw configuration projection',()=>{
  const sql=fs.readFileSync(path.join(__dirname,'catalog-readonly.sql'),'utf8');
  assert.doesNotMatch(sql,/to_jsonb\(p\.proconfig\)/);
  assert.match(sql,/case when p\.proconfig is null then null else/);
  assert.match(sql,/sha256\(convert_to\(cfg\.setting,'UTF8'\)\)/);
  assert.match(sql,/order by cfg\.position/);
  assert.match(sql,/unnest\(p\.proconfig\) with ordinality/);
});

test('hashed config arrays remain compatible and detect changes, order, null and empty distinctly',()=>{
  const a=fixture();a.functions[0].config=['a'.repeat(64),'b'.repeat(64)];
  const ref=bindReference(a,true);
  assert.equal(compare(ref,structuredClone(a)).status,'catalogues_match');
  for(const config of [['a'.repeat(64),'c'.repeat(64)],['b'.repeat(64),'a'.repeat(64)],null,[]]) {
    const b=structuredClone(a);b.functions[0].config=config;
    assert.equal(compare(ref,b).status,'drift_detected');
  }
  ref.querySha256='0'.repeat(64);
  assert.throws(()=>compare(ref,a),/REFERENCE_STALE_OR_UNREVIEWED/);
});

test('PostgreSQL regression fixture stays read-only and covers null, native empty, explicit grants and dimensions',()=>{
  const sql=fs.readFileSync(path.join(__dirname,'acl-regression.sql'),'utf8').replace(/--[^\n]*/g,'');
  assert.match(sql,/begin transaction isolation level repeatable read read only;/);
  assert.match(sql.trim(),/rollback;$/);
  assert.doesNotMatch(sql,/\b(?:create|alter|drop|insert|update|delete|grant|revoke|call|do|copy)\b/i);
  assert.equal((sql.match(/union all/g)||[]).length,9);
  for(const s of ['null::aclitem[]',"'{20=r/10}'::aclitem[]","'{{20=r/10},{30=r/10}}'::aclitem[]"])
    assert.ok(sql.includes(s));
});

test('before and after ACL/config correction have only read-only statements and no external execution path',()=>{
  const after=fs.readFileSync(path.join(__dirname,'catalog-readonly.sql'),'utf8');
  const before=after.replace("acldefault('c',c.relowner)","'{}'::aclitem[]")
    .replace(/case when p\.proconfig is null then null else[\s\S]*?end as config,/, 'to_jsonb(p.proconfig) as config,');
  assert.ok(before.includes("coalesce(a.attacl,'{}'::aclitem[])"));
  for(const source of [before,after]) {
    const executable=source.replace(/--[^\n]*/g,'').replace(/'(?:''|[^'])*'/g,"''");
    const commands=executable.split(';').map(s=>s.trim()).filter(Boolean).map(s=>s.split(/\s+/)[0].toLowerCase());
    assert.deepEqual(commands,['begin','set','set','set','with','rollback']);
    assert.doesNotMatch(executable,/\b(?:create|alter|drop|insert|update|delete|truncate|grant|revoke|do|call|copy|execute|nextval|setval|pg_notify|dblink|http_post|http_get|lo_export|pg_read_file)\b/i);
    assert.doesNotMatch(executable,/\b(?:net|extensions)\s*\./i);
  }
});
