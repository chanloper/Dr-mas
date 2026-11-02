'use strict';
// Offline only: no SDK, environment-file loading, DB client or network transport.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const migrationPath = path.join(__dirname, '../migrations/202611010001_auth_and_care.sql');
const queryPath = path.join(__dirname, 'catalog-readonly.sql');
const hash = value => crypto.createHash('sha256').update(value).digest('hex');
const collections = ['tables','columns','constraints','indexes','policies','functions','triggers','schemas','roles','enums','public_objects'];
const setArrays = new Set([...collections, 'grants', 'effective']);
const safeFields = new Set(['format','server_major','exposed_schemas',...collections,'name','table_name','schema_name','rls','force_rls','owner','grants','grantee','privilege','grantable','effective','role','select','insert','update','delete','truncate','references','trigger','type','not_null','identity','generated','collation','default_hash','kind','validated','deferrable','deferred','definition_hash','unique_index','primary_index','valid','ready','command','permissive','using_hash','check_hash','arguments','result','language','security_definer','volatility','strict','leakproof','config','execute','enabled','usage','create','superuser','bypass_rls','inherit','can_login','labels']);
function inventory() {
  const bytes = fs.readFileSync(migrationPath), sql = bytes.toString('utf8');
  // Narrow inventory for this migration, not a general SQL parser.
  const tables = [...sql.matchAll(/create table public\.(\w+) \(([\s\S]*?)\n\);/g)].map(m => ({
    name:m[1],columns:[...m[2].matchAll(/^    (\w+) (?:uuid|text|time\b|timestamptz|boolean|date\b|public\.drmas_\w+)/gm)].map(x=>x[1])
  }));
  return {migrationSha256:hash(bytes),querySha256:hash(fs.readFileSync(queryPath)),tables,
    explicitIndexes:[...sql.matchAll(/create index (\w+) on public\.(\w+)\s*\([^;]+;/g)].map(m=>({name:m[1],table:m[2]})),
    functions:[...sql.matchAll(/create function (\w+)\.(\w+)\(([^)]*)\) returns ([^\r\n]+)/g)].map(m=>({schema:m[1],name:m[2],arguments:m[3],returns:m[4]})),
    policies:[...sql.matchAll(/create policy (\w+) on public\.(\w+)/g)].map(m=>({name:m[1],table:m[2]})),
    triggers:[...sql.matchAll(/create trigger (\w+)[^;]*? on (\w+)\.(\w+)/g)].map(m=>({name:m[1],schema:m[2],table:m[3]})),
    enums:[...sql.matchAll(/create type public\.(\w+) as enum \(([^)]+)\)/g)].map(m=>({name:m[1],labels:[...m[2].matchAll(/'([^']+)'/g)].map(x=>x[1])}))};
}
function readJson(file) {
  const data = fs.readFileSync(file);
  if(data.length>5_000_000)throw Error('SNAPSHOT_TOO_LARGE');
  try {return JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(data));}
  catch {throw Error('INVALID_SNAPSHOT_JSON');}
}
function validate(catalog) {
  if(!catalog||catalog.format!=='drmas-p1-catalog-v1'||!Number.isInteger(catalog.server_major)||catalog.server_major<14||collections.some(k=>!Array.isArray(catalog[k])))throw Error('INVALID_CATALOG');
  const walk = (value, depth=0) => {
    if(depth>30)throw Error('INVALID_CATALOG');
    if(Array.isArray(value)){if(value.length>10000)throw Error('INVALID_CATALOG');for(const x of value)walk(x,depth+1);}
    else if(value&&typeof value==='object')for(const [key,x] of Object.entries(value)){if(!safeFields.has(key))throw Error('UNRECOGNIZED_CATALOG_FIELD');walk(x,depth+1);}
  };
  walk(catalog);return catalog;
}
function canonical(value, field='') {
  if(Array.isArray(value)) {
    const items=value.map(x=>canonical(x));
    // Preserve enum label and per-setting config fingerprint order; both can carry meaning.
    return setArrays.has(field)?items.sort((a,b)=>JSON.stringify(a).localeCompare(JSON.stringify(b))):items;
  }
  if(value&&typeof value==='object')return Object.fromEntries(Object.keys(value).sort().map(key=>[key,canonical(value[key],key)]));
  return value;
}
function same(a,b) {return JSON.stringify(canonical(a))===JSON.stringify(canonical(b));}
function verifyReferenceInventory(catalog, contract=inventory()) {
  const expectedNames = contract.tables.map(t=>t.name).sort();
  if(!same(catalog.tables.map(t=>t.name).sort(),expectedNames)||catalog.tables.some(t=>t.rls!==true||t.force_rls!==false))throw Error('REFERENCE_CONTRACT_MISMATCH');
  const cols=contract.tables.flatMap(t=>t.columns.map(name=>`${t.name}.${name}`)).sort();
  if(!same(catalog.columns.map(c=>`${c.table_name}.${c.name}`).sort(),cols))throw Error('REFERENCE_CONTRACT_MISMATCH');
  for(const [key,expected,actual] of [
    ['policies',contract.policies.map(x=>`${x.table}.${x.name}`),catalog.policies.map(x=>`${x.table_name}.${x.name}`)],
    ['functions',contract.functions.map(x=>`${x.schema}.${x.name}`),catalog.functions.map(x=>`${x.schema_name}.${x.name}`)],
    ['triggers',contract.triggers.map(x=>`${x.schema}.${x.table}.${x.name}`),catalog.triggers.map(x=>`${x.schema_name}.${x.table_name}.${x.name}`)]
  ]) {
    if(!key||!same(expected.sort(),actual.sort()))throw Error('REFERENCE_CONTRACT_MISMATCH');
  }
  for(const i of contract.explicitIndexes)if(!catalog.indexes.some(x=>x.name===i.name&&x.table_name===i.table))throw Error('REFERENCE_CONTRACT_MISMATCH');
  for(const [kind,count] of [['p',4],['u',2],['f',8],['c',12]])if(catalog.constraints.filter(c=>c.kind===kind).length!==count)throw Error('REFERENCE_CONTRACT_MISMATCH');
  if(catalog.indexes.length!==11)throw Error('REFERENCE_CONTRACT_MISMATCH');
  if(!same(catalog.enums.map(e=>({name:e.name,labels:e.labels})).sort((a,b)=>a.name.localeCompare(b.name)),contract.enums.slice().sort((a,b)=>a.name.localeCompare(b.name))))throw Error('REFERENCE_CONTRACT_MISMATCH');
  if(!['anon','authenticated','service_role'].every(name=>catalog.roles.some(r=>r.name===name)))throw Error('REFERENCE_CONTRACT_MISMATCH');
  if(catalog.roles.some(r=>['anon','authenticated'].includes(r.name)&&(r.superuser||r.bypass_rls)))throw Error('REFERENCE_CONTRACT_MISMATCH');
}
function bindReference(catalog, reviewed) {
  if(reviewed!==true)throw Error('REVIEWED_REFERENCE_REQUIRED');
  validate(catalog);verifyReferenceInventory(catalog);
  const c=inventory();
  return {format:'drmas-p1-reference-v1',migrationSha256:c.migrationSha256,querySha256:c.querySha256,
    provenance:'operator-reviewed-disposable-reference',catalog:canonical(catalog)};
}
function compare(reference, observed) {
  const c=inventory();
  if(reference?.format!=='drmas-p1-reference-v1'||reference.migrationSha256!==c.migrationSha256||reference.querySha256!==c.querySha256||reference.provenance!=='operator-reviewed-disposable-reference')throw Error('REFERENCE_STALE_OR_UNREVIEWED');
  validate(reference.catalog);validate(observed);verifyReferenceInventory(reference.catalog,c);
  if(reference.catalog.server_major!==observed.server_major)return {status:'unverified',reason:'POSTGRES_MAJOR_MISMATCH',rlsRuntime:'unverified',authSettings:'unverified'};
  const a=canonical(reference.catalog),b=canonical(observed),differences=[];
  const walk=(x,y,p)=>{
    if(differences.length>=200)return;
    if(Array.isArray(x)&&Array.isArray(y)) {
      if(x.length!==y.length)differences.push({path:p,kind:'item-count'});
      for(let i=0;i<Math.min(x.length,y.length);i++)walk(x[i],y[i],`${p}[${i}]`);
    }else if(x&&y&&typeof x==='object'&&typeof y==='object') {
      for(const key of [...new Set([...Object.keys(x),...Object.keys(y)])].sort()) {
        if(!Object.hasOwn(x,key)||!Object.hasOwn(y,key))differences.push({path:`${p}.${key}`,kind:'field-presence'});
        else walk(x[key],y[key],`${p}.${key}`);
      }
    }else if(x!==y)differences.push({path:p,kind:'value-differs'});
  };
  walk(a,b,'catalog');
  return {status:differences.length?'drift_detected':'catalogues_match',differences,
    migrationSha256:c.migrationSha256,rlsRuntime:'unverified',authSettings:'unverified',
    apiExposure:observed.exposed_schemas===null||observed.exposed_schemas===undefined?'unverified':'requires-dashboard-confirmation',
    baselineProvenance:'operator-attestation-not-independently-proven'};
}
if(require.main===module) {
  const [command,...args]=process.argv.slice(2);
  try {
    let result;
    if(command==='inventory'&&!args.length)result=inventory();
    else if(command==='bind-reference'&&args.length===2&&args[1]==='--reviewed-disposable-reference')result=bindReference(readJson(args[0]),true);
    else if(command==='compare'&&args.length===2)result=compare(readJson(args[0]),readJson(args[1]));
    else throw Error('USAGE_INVENTORY_BIND_REFERENCE_COMPARE');
    console.log(JSON.stringify(result,null,2));
    if(result.status&&result.status!=='catalogues_match')process.exitCode=result.status==='unverified'?3:2;
  }catch {console.error('P1_OFFLINE_CHECK_FAILED: invalid input, stale/unreviewed reference, or contract mismatch; raw details suppressed');process.exitCode=1;}
}
module.exports={inventory,validate,canonical,verifyReferenceInventory,bindReference,compare};
