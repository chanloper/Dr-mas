'use strict';
// Offline only. pg_restore is NEVER called with a database/connection argument.
const fs=require('node:fs'),path=require('node:path'),cp=require('node:child_process'),crypto=require('node:crypto');
const {buildSelection,copyBlocks,tables}=require('./selection.cjs');
const {validate}=require('../schema-compare.cjs');
const sha=b=>crypto.createHash('sha256').update(b).digest('hex');
function unwrap(v){for(let i=0;i<8;i++){if(Array.isArray(v)&&v.length===1)v=v[0];else if(v?.snapshot!==undefined)v=v.snapshot;else if(typeof v==='string')v=JSON.parse(v);else return v;}throw Error('CATALOG_WRAPPER');}
function main(){
 const [dump,out,expected]=process.argv.slice(2);
 if(!dump||!out||!expected||!/^V:[\\/]/i.test(out)||!/^V:[\\/]/i.test(dump))throw Error('PRIVATE_V_PATHS_REQUIRED');
 const stat=fs.statSync(dump);if(!stat.isFile()||stat.size!==418588)throw Error('BACKUP_SIZE_MISMATCH');
 const digest=sha(fs.readFileSync(dump));
 if(fs.readFileSync(dump+'.sha256','utf8').trim()!==digest+'  '+path.basename(dump))throw Error('CHECKSUM_MISMATCH');
 if(fs.existsSync(out))throw Error('OUTPUT_ALREADY_EXISTS');
 const catalog=unwrap(JSON.parse(fs.readFileSync(expected,'utf8').replace(/^\uFEFF/,'')));
 validate(catalog);if(catalog.server_major!==17)throw Error('EXPECTED_MAJOR');
 const exe='C:/Program Files/PostgreSQL/17/bin/pg_restore.exe';
 function restore(args){const r=cp.spawnSync(exe,args,{encoding:'utf8',maxBuffer:64*1024*1024});if(r.status!==0||r.stderr.trim())throw Error('ARCHIVE_READ_FAILED');return r.stdout;}
 const plan=buildSelection(restore(['--list',dump]));
 fs.mkdirSync(out,{recursive:false}); // User must pre-create/secure the parent directory.
 const save=(n,s)=>fs.writeFileSync(path.join(out,n),s,{flag:'wx'});
 save('selected.private.list',plan.selected.join('\n')+'\n');
 save('excluded.private.list',plan.excluded.join('\n')+'\n');
 const list=path.join(out,'selected.private.list');
 const pre=restore(['--use-list='+list,'--section=pre-data','--file=-',dump]);
 const data=restore(['--use-list='+list,'--section=data','--file=-',dump]);
 const post=restore(['--use-list='+list,'--section=post-data','--file=-',dump]);
 // Fail closed on dependencies/executable paths outside this package's scope.
 if(/\b(?:vault|net|storage)\.|CREATE (?:EXTENSION|EVENT TRIGGER|SERVER|SUBSCRIPTION)|\bdblink\s*\(/i.test(pre+'\n'+post))throw Error('UNREVIEWED_CORE_DEPENDENCY');
 const blocks=copyBlocks(data),profile=blocks.find(x=>x.table==='profiles');
 const idColumn=profile.columns.indexOf('id');if(idColumn<0)throw Error('PROFILE_ID_MISSING');
 const ids=profile.rows.map(r=>r.split('\t')[idColumn]);
 if(new Set(ids).size!==ids.length||ids.some(x=>!/^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(x)))throw Error('AUTH_REFERENCE_IDS_INVALID');
 let expectedCopy='';
 for(const t of tables){const b=blocks.find(x=>x.table===t);
  expectedCopy+=`create temp table expected_${t} as select * from public.${t} with no data;\nCOPY pg_temp.expected_${t} (${b.columns.join(', ')}) FROM stdin;\n`+b.rows.map(r=>r+'\n').join('')+'\\.\n';}
 const bootstrap=fs.readFileSync(path.join(__dirname,'bootstrap.sql'),'utf8');
 const checks=fs.readFileSync(path.join(__dirname,'checks.sql'),'utf8');
 const synthetic=fs.readFileSync(path.join(__dirname,'synthetic.sql'),'utf8');
 const sql=`\\set ON_ERROR_STOP on\n\\set VERBOSITY sqlstate\n\\set QUIET on\nbegin;\n${bootstrap}\n\\echo STAGE archived_pre_data\n${pre}\n`+
 `\\echo STAGE auth_reference_stubs\nCOPY auth.users (id) FROM stdin;\n${ids.map(x=>x+'\n').join('')}\\.\n`+
 `\\echo STAGE core_data\n${data}\n${expectedCopy}\n\\echo STAGE archived_post_data\n${post}\n`+
 `set local row_security=on;\nset local statement_timeout='60s';\nset local lock_timeout='5s';\n\\echo STAGE exact_data_fk_privilege_rls\n${checks}\n\\echo STAGE synthetic_boundaries\n${synthetic}\ncommit;\n\\echo PASS restore_transaction_committed_NOT_FINAL_PASS\n`;
 save('restore.private.sql',sql);
 save('expected-catalog.private.json',JSON.stringify(catalog));
 // Standard query emits only metadata to private storage, not the terminal.
 const catalogSQL=fs.readFileSync(path.join(__dirname,'../catalog-readonly.sql'),'utf8');
 save('export-catalog.private.sql',`\\set ON_ERROR_STOP on\n\\set VERBOSITY sqlstate\n\\set QUIET on\n\\pset format unaligned\n\\pset tuples_only on\n`+
 fs.readFileSync(path.join(__dirname,'target-readonly.sql'),'utf8')+'\n'+catalogSQL);
 const files={};for(const n of fs.readdirSync(out))files[n]=sha(fs.readFileSync(path.join(out,n)));
 save('manifest.private.json',JSON.stringify({format:'drmas-core-restore-package-v1',backupSha256:digest,files,counts:Object.fromEntries(blocks.map(b=>[b.table,b.rows.length])),selected:plan.selected.length,excluded:plan.excluded.length,originalPgDumpExit:'unknown',scope:'core-data-only-auth-surrogate'},null,2));
 console.log('PREPARED_PRIVATE_PACKAGE_NOT_EXECUTED');
 console.log(JSON.stringify({selected:plan.selected.length,excluded:plan.excluded.length}));
}
if(require.main===module){try{main()}catch{console.error('PREPARATION_FAILED_DETAILS_SUPPRESSED; do not execute partial package');process.exitCode=1;}}
module.exports={unwrap};
