'use strict';
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const {validate,canonical}=require('../schema-compare.cjs');
function verify(){
 const [out,phase]=process.argv.slice(2);if(!out||!/^V:[\\/]/i.test(out)||!['before','after'].includes(phase))throw Error('PRIVATE_PATH_AND_PHASE_REQUIRED');
 const manifest=JSON.parse(fs.readFileSync(path.join(out,'manifest.private.json'),'utf8'));
 if(manifest.format!=='drmas-core-restore-package-v1')throw Error('MANIFEST_FORMAT');
 for(const [n,digest] of Object.entries(manifest.files)){
  if(path.basename(n)!==n)throw Error('MANIFEST_PATH');
  if(crypto.createHash('sha256').update(fs.readFileSync(path.join(out,n))).digest('hex')!==digest)throw Error('PACKAGE_CHANGED');
 }
 if(phase==='before'){console.log('PACKAGE_HASHES_PASS_NOT_RESTORE_PASS');return;}
 if(fs.readFileSync(path.join(out,'restore-exit.txt'),'utf8').trim()!=='0'||fs.readFileSync(path.join(out,'export-exit.txt'),'utf8').trim()!=='0')throw Error('EXECUTION_EXIT_NOT_ZERO');
 const actual=JSON.parse(fs.readFileSync(path.join(out,'actual-catalog.private.json'),'utf8').trim());
 const expected=JSON.parse(fs.readFileSync(path.join(out,'expected-catalog.private.json'),'utf8'));
 validate(actual);validate(expected);if(actual.server_major!==17)throw Error('MAJOR');
 // Auth surrogate, public schema ACL/defaults and cluster managed roles are deliberately NOT parity claims.
 for(const key of ['tables','columns','constraints','indexes','policies','functions','triggers','enums']){
  if(JSON.stringify(canonical(actual[key],key))!==JSON.stringify(canonical(expected[key],key)))throw Error('CATALOG_CATEGORY_MISMATCH_'+key);
 }
 if(JSON.stringify(canonical(actual.schemas.filter(s=>s.name==='drmas_private'),'schemas'))!==JSON.stringify(canonical(expected.schemas.filter(s=>s.name==='drmas_private'),'schemas')))throw Error('CATALOG_CATEGORY_MISMATCH_private_schema');
 if(actual.roles.some(r=>['anon','authenticated'].includes(r.name)&&(r.superuser||r.bypass_rls)))throw Error('CATALOG_CATEGORY_MISMATCH_client_roles');
 console.log('CORE_DATA_PARTIAL_RESTORE_PASS');
 console.log('FULL_SUPABASE_RESTORE_UNVERIFIED; REAL_JWT_UNVERIFIED; ORIGINAL_PG_DUMP_EXIT_UNKNOWN');
}
try{verify()}catch(e){const safe=/^(?:CATALOG_CATEGORY_MISMATCH_[a-z]+|PACKAGE_CHANGED|EXECUTION_EXIT_NOT_ZERO|MAJOR|MANIFEST_FORMAT|MANIFEST_PATH|PRIVATE_PATH_AND_PHASE_REQUIRED)$/.test(e.message)?e.message:'INVALID_OR_INCOMPLETE_PRIVATE_ARTIFACT';console.error('PARTIAL_RESTORE_NOT_PASS: '+safe);process.exitCode=1;}
