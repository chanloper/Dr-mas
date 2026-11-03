const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const sql = fs.readFileSync(path.join(__dirname,'reconnect-preflight-readonly.sql'),'utf8').replace(/--[^\n]*/g,'');
test('supplemental preflight stays read-only and excludes rows, function bodies and settings', () => {
 assert.match(sql,/begin transaction isolation level repeatable read read only;/);
 assert.match(sql,/rollback;/);
 assert.doesNotMatch(sql,/\b(create|alter|drop|insert|update|delete|truncate|copy|call|execute|do|commit)\b/i);
 assert.doesNotMatch(sql,/\b(prosrc|proconfig|rolpassword|rolconfig|pg_get_functiondef|dblink|pg_read_file)\b/i);
 assert.doesNotMatch(sql,/\b(?:from|join)\s+(?:public|auth)\./i);
 assert.equal(sql.split(';').filter(s=>s.trim()).length,6);
});
test('supplement preserves original comparator format and reviews owner, grantor, inheritance and pair FK dependencies', () => {
 for(const fragment of ['drmas-reconnect-preflight-v1','pg_auth_members','inherit_option','set_option','pg_depend','k.confrelid','uses_old_pair_index','a.grantor','owner_roles','closure_reason_exists']) assert.ok(sql.includes(fragment));
 assert.match(sql,/aclexplode\(coalesce\(p.proacl,acldefault\('f',p.proowner\)\)\)/);
 assert.doesNotMatch(sql,/array_agg|array_cat/);
});
