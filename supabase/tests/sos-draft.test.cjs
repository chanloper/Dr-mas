// Source contract checks only. NOT an executed PostgreSQL/RLS test.
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const sql=fs.readFileSync(path.join(__dirname,'../proposals/202611040001_sos_alerts.sql'),'utf8');
test('SOS draft adds isolated objects without changing old tables or policies',()=>{
 assert.match(sql,/begin;/);assert.match(sql,/commit;/);
 assert.equal(/drop\s|truncate\s|delete\s+from|alter table public\.(profiles|care_links|medications|medication_records)/i.test(sql),false);
 assert.match(sql,/alter table public\.sos_alerts enable row level security/);
 assert.match(sql,/unique \(request_id, guardian_id\)/);
});
test('SOS definer RPCs restrict identity, current consent, roles and direct writes',()=>{
 assert.equal((sql.match(/security definer set search_path = ''/g)||[]).length,2);
 assert.match(sql,/id = actor and role = 'patient' for update/);
 assert.match(sql,/c\.status = 'approved' for share of c/);
 assert.match(sql,/guardian_id = auth\.uid\(\) for update/);
 assert.match(sql,/can_read_patient\(target\.patient_id\) is not true/);
 assert.match(sql,/revoke all on public.sos_alerts from public, anon, authenticated/);
 assert.match(sql,/grant select on public.sos_alerts to authenticated/);
 assert.equal(/grant\s+(insert|update|delete|all)[^;]+to authenticated/i.test(sql),false);
 assert.match(sql,/from public, anon;/);
});
test('request serialization, consent locks, cooldown and acknowledgment idempotency remain explicit',()=>{
 assert.match(sql,/interval '30 seconds'/);assert.match(sql,/SOS_NO_GUARDIAN/);
 assert.match(sql,/coalesce\(acknowledged_at, now\(\)\)/);
 assert.equal(/http|net\.|dblink|vault\./i.test(sql),false);
});
