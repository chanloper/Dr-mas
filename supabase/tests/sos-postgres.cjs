// Actual disposable PostgreSQL 17 integration runner. Synthetic data only.
// Never connects to existing clusters. Stops its owned cluster in finally.
const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {spawnSync,spawn}=require('node:child_process');
const net=require('node:net');
const bin=process.env.DRMAS_PG_BIN||'C:/Program Files/PostgreSQL/17/bin';
const port=55434,db='drmas_sos_test',root=path.resolve(__dirname,'../..');
const A='10000000-0000-0000-0000-000000000001',B='10000000-0000-0000-0000-000000000002',G='10000000-0000-0000-0000-000000000003',H='10000000-0000-0000-0000-000000000004';
let temp,started=false,stage='preflight';
// No inherited connection URLs, password files, services, options or SSL overrides.
const env={...process.env};for(const k of Object.keys(env))if(k.startsWith('PG'))delete env[k];
env.PGCONNECT_TIMEOUT='3';env.PGSSLMODE='disable';
function run(exe,args,input){const r=spawnSync(path.join(bin,exe+'.exe'),args,{input,encoding:'utf8',env,timeout:90000,windowsHide:true});if(r.status!==0){const state=(r.stderr||'').match(/ERROR:\s+([0-9A-Z]{5}):/)?.[1]||'UNAVAILABLE';throw Error(`FAIL stage=${stage} exit=${r.status} SQLSTATE=${state}`);}return r.stdout;}
const args=()=>['-X','-w','-h','127.0.0.1','-p',String(port),'-U','postgres','-d',db,'-v','ON_ERROR_STOP=1','-v','VERBOSITY=verbose','-qAt'];
function sql(text){return run('psql',args(),text);}
function file(p){return fs.readFileSync(path.join(root,p),'utf8');}
function session(who){return `set local role authenticated; set local "request.jwt.claim.sub"='${who}';`;}
const helpers=`create schema sos_test; grant usage on schema sos_test to authenticated,anon;
create function sos_test.ok(v boolean) returns void language plpgsql as $$ begin if v is distinct from true then raise exception 'ASSERTION' using errcode='P0004'; end if; end $$;
create function sos_test.denied(q text, expected text) returns void language plpgsql security invoker as $$ declare actual text; begin begin execute q; exception when others then get stacked diagnostics actual=returned_sqlstate; if actual=expected then return; end if; raise; end; raise exception 'UNEXPECTED_ALLOW' using errcode='P0004'; end $$;
revoke all on all functions in schema sos_test from public; grant execute on all functions in schema sos_test to authenticated,anon;`;
const fixtures=`insert into auth.users(id,raw_user_meta_data) values ('${A}','{"display_name":"Synthetic A"}'),('${B}','{"display_name":"Synthetic B"}'),('${G}','{"display_name":"Synthetic G"}'),('${H}','{"display_name":"Synthetic H"}');
update public.profiles set role='guardian' where id in ('${G}','${H}');
insert into public.care_links(patient_id,guardian_id,requested_by,status,approved_by,approved_at) values ('${A}','${G}','${G}','approved','${A}',now());
insert into public.care_links(patient_id,guardian_id,requested_by) values ('${A}','${H}','${H}');`;
function check(label,text){stage=label;sql('begin; set local statement_timeout=\'8s\'; '+text+' rollback;');console.log('PASS '+label);}
function asyncSql(text){const child=spawn(path.join(bin,'psql.exe'),args(),{env,windowsHide:true,stdio:['pipe','pipe','pipe']});let stderr='';child.stdout.resume();child.stderr.on('data',b=>{stderr+=b;});const done=new Promise((resolve,reject)=>{child.on('error',()=>reject(Error('FAIL process_start')));child.on('close',code=>code===0?resolve():reject(Error(`FAIL stage=${stage} exit=${code} SQLSTATE=${stderr.match(/ERROR:\s+([0-9A-Z]{5}):/)?.[1]||'UNAVAILABLE'}`)));});child.stdin.end(text);return {done};}
async function waitFor(predicate){for(let i=0;i<100;i++){if(predicate())return;await new Promise(r=>setTimeout(r,50));}throw Error('FAIL concurrency_handshake_timeout');}
async function main(){
 await new Promise((resolve,reject)=>{const probe=net.createServer();probe.once('error',()=>reject(Error('FAIL port_in_use')));probe.listen(port,'127.0.0.1',()=>probe.close(resolve));});
 if(!run('postgres',['--version']).includes('17.'))throw Error('FAIL version');
 temp=fs.mkdtempSync(path.join(os.tmpdir(),'drmas-sos-'));
 // Disposable synthetic cluster only; crash-durability is not under test.
 stage='initdb';run('initdb',['-D',path.join(temp,'cluster'),'-U','postgres','-A','trust','--encoding=UTF8','--no-locale','--no-sync']);
 fs.appendFileSync(path.join(temp,'cluster','postgresql.conf'),`\nlisten_addresses='127.0.0.1'\nport=${port}\nmax_connections=15\n`);
 stage='start';run('pg_ctl',['-D',path.join(temp,'cluster'),'-l',path.join(temp,'server.log'),'-w','start']);started=true;
 stage='create_db';run('psql',['-X','-w','-h','127.0.0.1','-p',String(port),'-U','postgres','-d','postgres','-v','ON_ERROR_STOP=1','-c',`create database ${db}`]);
 stage='target_guard';if(sql(`select current_database()='${db}' and inet_server_addr()='127.0.0.1'::inet and inet_server_port()=${port} and current_setting('server_version_num')::int/10000=17;`).trim()!=='t')throw Error('FAIL target_guard');
 stage='bootstrap';sql(file('supabase/tests/local_bootstrap.sql').replaceAll('drmas_rls_test',db));
 stage='initial';sql(file('supabase/migrations/202611010001_auth_and_care.sql'));
 stage='baseline_rls';sql(file('supabase/tests/rls_access.sql').replaceAll('drmas_rls_test',db));console.log('PASS baseline_rls');
 stage='sos_on_initial';sql(file('supabase/proposals/202611040001_sos_alerts.sql'));
 stage='helpers';sql(helpers);
 check('approved_only_and_role_boundaries',fixtures+session(A)+`select sos_test.ok(public.request_sos_alert()=1); select sos_test.ok((select count(*)=1 from public.sos_alerts)); select sos_test.denied('select public.request_sos_alert()','P0001'); reset role; ${session(G)} select sos_test.ok((select count(*)=1 from public.sos_alerts)); select sos_test.denied('select public.request_sos_alert()','42501'); reset role; ${session(H)} select sos_test.ok((select count(*)=0 from public.sos_alerts)); reset role; ${session(B)} select sos_test.ok((select count(*)=0 from public.sos_alerts)); select sos_test.denied('select public.request_sos_alert()','P0002');`);
 check('ack_idempotency_revocation_and_foreign_id',fixtures+session(A)+`select sos_test.ok(public.request_sos_alert()=1); select sos_test.denied('select public.acknowledge_sos_alert(id) from public.sos_alerts','42501'); reset role;
 select set_config('sos.test_id',(select id::text from public.sos_alerts),true);
 ${session(H)} select sos_test.denied('select public.acknowledge_sos_alert(current_setting(''sos.test_id'')::uuid)','42501'); reset role;
 ${session(G)} select public.acknowledge_sos_alert(current_setting('sos.test_id')::uuid); select set_config('sos.ack',(select acknowledged_at::text from public.sos_alerts),true); select public.acknowledge_sos_alert(current_setting('sos.test_id')::uuid); select sos_test.ok((select acknowledged_at::text=current_setting('sos.ack') from public.sos_alerts)); reset role;
 ${session(A)} select public.revoke_care_link(id) from public.care_links where guardian_id='${G}'; reset role;
 ${session(G)} select sos_test.ok((select count(*)=0 from public.sos_alerts)); select sos_test.denied('select public.acknowledge_sos_alert(current_setting(''sos.test_id'')::uuid)','42501');`);
 check('anonymous_missing_identity_and_direct_writes',fixtures+session(A)+`select sos_test.denied('insert into public.sos_alerts(request_id,patient_id,guardian_id) values (gen_random_uuid(),auth.uid(),gen_random_uuid())','42501'); select sos_test.denied('update public.sos_alerts set acknowledged_at=now()','42501'); select sos_test.denied('delete from public.sos_alerts','42501'); set local "request.jwt.claim.sub"=''; select sos_test.ok((select count(*)=0 from public.sos_alerts)); select sos_test.denied('select public.request_sos_alert()','42501'); reset role; set local role anon; select sos_test.denied('select public.request_sos_alert()','42501'); select sos_test.denied('select * from public.sos_alerts','42501');`);
 stage='post_sos_rls_regression';sql(file('supabase/tests/rls_access.sql').replaceAll('drmas_rls_test',db));console.log('PASS post_sos_rls_regression');
 stage='reconnect_after_sos';sql(file('supabase/proposals/202611030001_care_link_rerequest.sql'));console.log('PASS reconnect_after_sos');
 stage='reconnect_regression';sql(file('supabase/tests/reconnect/single-session.sql')
   .replace('\\ir guard.sql',()=>file('supabase/tests/reconnect/guard.sql').replaceAll('drmas_rls_test',db).replaceAll('55432',String(port)))
   .replace('\\ir helpers.sql',()=>file('supabase/tests/reconnect/helpers.sql')));console.log('PASS reconnect_regression');
 // Committed fixtures exist only in this disposable cluster for real two-session tests.
 stage='race_setup';sql(fixtures);
 stage='concurrent_send';const one=asyncSql(`set application_name='sos_race_a'; begin; set local statement_timeout='12s'; ${session(A)} select sos_test.ok(public.request_sos_alert()=1); select pg_sleep(4); commit;`);
 await waitFor(()=>sql("select count(*)=1 from pg_stat_activity where application_name='sos_race_a' and wait_event='PgSleep';").trim()==='t');
 const two=asyncSql(`set application_name='sos_race_b'; begin; set local statement_timeout='12s'; set local lock_timeout='10s'; ${session(A)} select sos_test.denied('select public.request_sos_alert()','P0001'); commit;`);
 await waitFor(()=>sql("select count(*)=1 from pg_stat_activity where application_name='sos_race_b' and wait_event_type='Lock';").trim()==='t');
 await Promise.all([one.done,two.done]);sql('select sos_test.ok((select count(*)=1 from public.sos_alerts));');console.log('PASS actual_send_lock_wait_one_request');
 stage='concurrent_ack';const first=asyncSql(`set application_name='sos_ack_a'; begin; set local statement_timeout='12s'; ${session(G)} select public.acknowledge_sos_alert(id) from public.sos_alerts; select pg_sleep(3); commit;`);
 await waitFor(()=>sql("select count(*)=1 from pg_stat_activity where application_name='sos_ack_a' and wait_event='PgSleep';").trim()==='t');
 const second=asyncSql(`set application_name='sos_ack_b'; begin; set local statement_timeout='12s'; ${session(G)} select public.acknowledge_sos_alert(id) from public.sos_alerts; commit;`);
 await waitFor(()=>sql("select count(*)=1 from pg_stat_activity where application_name='sos_ack_b' and wait_event_type='Lock';").trim()==='t');
 await Promise.all([first.done,second.done]);sql('select sos_test.ok((select count(*)=1 and bool_and(acknowledged_at is not null) from public.sos_alerts));');console.log('PASS actual_ack_lock_wait_idempotent');
 // Remove synthetic fixtures only, leave all schema intact for this run.
 stage='cleanup';sql('begin; delete from public.sos_alerts; delete from public.care_links; delete from auth.users; commit; select sos_test.ok((select count(*)=0 from public.profiles));');console.log('PASS synthetic_cleanup');
}
main().catch(e=>{console.error(/^FAIL [a-zA-Z0-9_= .-]+$/.test(e.message)?e.message:`FAIL stage=${stage}`);process.exitCode=1;}).finally(()=>{
 if(started || temp && fs.existsSync(path.join(temp,'cluster','postmaster.pid'))){try{stage='stop';run('pg_ctl',['-D',path.join(temp,'cluster'),'-m','fast','-w','stop']);console.log('PASS owned_cluster_stopped');}catch{console.error('FAIL STOP_UNCONFIRMED');process.exitCode=1;}}
});
