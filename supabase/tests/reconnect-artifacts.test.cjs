const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const dir = path.join(__dirname, 'reconnect');
const read = n => fs.readFileSync(path.join(dir, n), 'utf8');
const entrypoints = ['single-session.sql', 'concurrency-setup.sql', 'session-a.sql', 'session-b.sql', 'concurrency-verify.sql', 'concurrency-cleanup.sql'];

test('all integration entrypoints require guarded local transactions and stop on error', () => {
  for (const name of entrypoints) {
    const sql = read(name);
    assert.match(sql, /\\set ON_ERROR_STOP on/);
    assert.match(sql, /\\set VERBOSITY terse/);
    assert.ok(sql.indexOf('begin;') < sql.indexOf('\\ir guard.sql'));
    assert.match(sql, /statement_timeout='45s'/);
    assert.match(sql, /lock_timeout='35s'/);
    assert.doesNotMatch(sql, /\\connect|dblink|COPY|TRUNCATE|DROP DATABASE|CASCADE|\\!|\\i .*migration/i);
  }
  const guard = read('guard.sql');
  for (const expected of ['drmas_rls_test', '127.0.0.1', '55432', 'rpc_grant_contract', 'rpc_or_auth_definition_contract']) assert.ok(guard.includes(expected));
  // Expected prosrc bodies are comparison literals, never executed by the guard.
  const executable = guard.replace(/\$expected\$[\s\S]*?\$expected\$/g, "''");
  assert.doesNotMatch(executable, /\b(?:insert|update|delete|create|drop|alter)\s+(?:table|schema|role|into|from)/i);
});

test('expected RPC source literals stay synchronized with reviewed SQL files', () => {
  const literals = [...read('guard.sql').matchAll(/\$expected\$([\s\S]*?)\$expected\$/g)].map(m => m[1].trim());
  const sources = ['../proposals/202611030001_care_link_rerequest.sql', '../migrations/202611010001_auth_and_care.sql', 'local_bootstrap.sql']
    .map(n => fs.readFileSync(path.join(__dirname, n), 'utf8').replace(/\r/g, ''));
  assert.equal(literals.length, 6);
  for (const literal of literals) assert.ok(sources.some(s => s.includes(literal)));
});

test('single-session assertions cover fresh consent, history, reapproval and participant RLS', () => {
  const sql = read('single-session.sql');
  for (const label of ['pending_records_denied', 'unrelated_link_hidden', 'unrelated_approval_denied', 'unrelated_close_denied', 'stale_id_denied', 'fresh_consent_required', 'reapproved_read_allowed', 'old_approval_preserved', 'rejected_reason', 'cancelled_reason', 'cancel_retry_requires_consent']) assert.ok(sql.includes(label));
  assert.match(sql, /set local role authenticated/);
  assert.match(sql, /rollback;\s*\\echo PASS single_session_rolled_back/);
  assert.doesNotMatch(sql, /\bcommit;|\bdelete from/i);
  assert.match(read('helpers.sql'), /security invoker/);
});

test('real race requires observed cross-backend blocking plus exact duplicate SQLSTATE', () => {
  const a = read('session-a.sql'); const b = read('session-b.sql');
  assert.match(a, /pg_backend_pid\(\)=any\(pg_blocking_pids\(s.pid\)\)/);
  assert.match(a, /interval '30 seconds'/);
  assert.match(a, /a_observed_wait=true/);
  assert.match(b, /exception when unique_violation/);
  assert.match(b, /duplicate_not_rejected/);
  const verify = read('concurrency-verify.sql');
  assert.match(verify, /a_observed_wait and b_duplicate/);
  assert.equal((verify.match(/count\(\*\) from public.care_links/g) || []).length, 2);
});

test('race cleanup is manifest guarded and deletes only reserved synthetic fixtures', () => {
  const cleanup = read('concurrency-cleanup.sql');
  assert.match(cleanup, /cleanup_scope/);
  assert.match(cleanup, /pg_stat_activity/);
  const deletes = cleanup.split('\n').filter(l => /^delete /i.test(l));
  assert.equal(deletes.length, 3);
  for (const line of deletes) {
    assert.match(line, / where /i);
    assert.match(line, /74000000-0000-0000-0000-00000000000[12]/);
  }
  assert.doesNotMatch(cleanup, /drop table public\.|drop schema public|cascade/i);
});

test('residual fixture check uses read-only transaction, fixed target and counts only', () => {
  const sql = read('cleanup-readonly.sql');
  assert.match(sql, /begin read only;/);
  assert.match(sql, /rollback;/);
  assert.match(sql, /inet_server_port\(\)<>55432/);
  assert.match(sql, /current_database\(\)<>'drmas_rls_test'/);
  assert.match(sql, /inet_server_addr\(\) is distinct from '127.0.0.1'::inet/);
  assert.doesNotMatch(sql, /\b(?:delete|insert|update|drop|alter|create|truncate|execute)\b/i);
  assert.equal((sql.match(/as test_(?:users|profiles|links|medications|records)/g)||[]).length, 5);
});
