// Disposable loopback cluster only. Never reads credentials or connects to Supabase.
const fs = require('node:fs'), os = require('node:os'), path = require('node:path'), net = require('node:net');
const { spawnSync } = require('node:child_process');
const bin = 'C:/Program Files/PostgreSQL/17/bin', root = path.resolve(__dirname, '../..');
const env = { ...process.env };
for (const key of Object.keys(env)) if (key.startsWith('PG')) delete env[key];
env.PGSSLMODE = 'disable'; env.PGCONNECT_TIMEOUT = '3';
let directory, port, started = false, stage = 'initialize';
function run(exe, args, input) {
  return spawnSync(path.join(bin, exe + '.exe'), args, { env, input, encoding: 'utf8', timeout: 45000, windowsHide: true });
}
function checked(exe, args, input) { const value=run(exe,args,input); if(value.status!==0)throw Error(stage); return value.stdout; }
const options = () => ['-X','-w','-h','127.0.0.1','-p',String(port),'-U','postgres','-d','postgres','-v','ON_ERROR_STOP=1','-qAt'];
const sql = text => checked('psql', options(), text);
function reject(role, query, pattern) {
  const value = run('psql', options(), `begin; set local role ${role}; ${query}; commit;`);
  if (value.status === 0 || !pattern.test(value.stderr)) throw Error(stage);
}
(async()=>{
  port = await new Promise((resolve,reject)=>{const server=net.createServer(); server.on('error',reject); server.listen(0,'127.0.0.1',()=>{const chosen=server.address().port;server.close(()=>resolve(chosen));});});
  directory=fs.mkdtempSync(path.join(os.tmpdir(),'drmas-kdca-control-'));
  const cluster=path.join(directory,'cluster');
  stage='initdb'; checked('initdb',['-D',cluster,'-U','postgres','-A','trust','--encoding=UTF8','--no-locale','--no-sync']);
  fs.appendFileSync(path.join(cluster,'postgresql.conf'),`\nlisten_addresses='127.0.0.1'\nport=${port}\nmax_connections=10\n`);
  stage='start'; checked('pg_ctl',['-D',cluster,'-l',path.join(directory,'postgres.log'),'-w','start']); started=true;
  sql('create role anon nologin; create role authenticated nologin; create role service_role nologin bypassrls; create table public.existing_application_sentinel(value text); insert into public.existing_application_sentinel values (\'UNCHANGED\');');
  stage='schema_and_initial_record';
  sql(fs.readFileSync(path.join(root,'supabase/proposals/202611160001_rag_kdca_controls.NOT-APPLIED.sql'),'utf8'));
  const initial=fs.readFileSync(path.join(root,'supabase/proposals/202611160002_rag_kdca_initial_control.NOT-APPLIED.sql'),'utf8');
  sql(initial); if(sql("select status from public.rag_kdca_controls where content_id='5830'").trim()!=='active')throw Error(stage);
  console.log('PASS isolated_schema_and_bound_initial_record');
  stage='role_permissions';
  reject('anon','select * from public.rag_kdca_controls',/permission denied/);
  reject('authenticated',"update public.rag_kdca_controls set status='revoked'",/permission denied/);
  reject('service_role',"update public.rag_kdca_controls set raw_hash=repeat('0',64)",/permission denied/);
  reject('service_role',"insert into public.rag_kdca_controls(content_id) values ('1')",/permission denied/);
  console.log('PASS public_denied_server_cannot_insert_or_replace_approval_hashes');
  stage='durable_revocation';
  sql("begin; set local role service_role; update public.rag_kdca_controls set status='revoked',operator='synthetic-operator',revision=2 where content_id='5830' and revision=1; commit;");
  reject('service_role',"update public.rag_kdca_controls set status='active',revision=3 where content_id='5830'",/KDCA_CONTROL_REVIEW_REQUIRED/);
  const repeated=run('psql',options(),initial);
  if(repeated.status===0||!/KDCA_EXISTING_CONTROL_PRESERVED_REVIEW_REQUIRED/.test(repeated.stderr))throw Error(stage);
  if(sql("select status from public.rag_kdca_controls where content_id='5830'").trim()!=='revoked')throw Error(stage);
  if(sql('select value from public.existing_application_sentinel').trim()!=='UNCHANGED')throw Error(stage);
  console.log('PASS revoked_record_survives_rebootstrap_and_unrelated_data_unchanged');
})().catch(()=>{console.error('FAIL_LOCAL_KDCA_SQL_'+stage.toUpperCase());process.exitCode=1;}).finally(()=>{
  if(started)run('pg_ctl',['-D',path.join(directory,'cluster'),'-m','immediate','-w','stop']);
  if(directory){const actual=path.resolve(directory), parent=path.resolve(os.tmpdir());if(path.dirname(actual)===parent&&path.basename(actual).startsWith('drmas-kdca-control-'))fs.rmSync(actual,{recursive:true,force:true});}
});
