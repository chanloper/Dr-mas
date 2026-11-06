// Synthetic users and injected SDK responses only. No network, email or writes.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs'), vm = require('node:vm'), ts = require('typescript');
const A = '11111111-1111-4111-8111-111111111111', B = '22222222-2222-4222-8222-222222222222';
const source = ts.transpileModule(fs.readFileSync('src/services/account.ts', 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
const scope = { exports: {} }; vm.runInNewContext(source, scope);
function fixture() {
  let id = A, error = null, responseId = A, hold;
  const calls = [];
  const client = { auth: {
    getUser: async () => ({ data: { user: id ? { id, email: 'synthetic@example.invalid' } : null }, error: null }),
    reauthenticate: async () => { calls.push({ method: 'reauthenticate' }); return { error }; },
    updateUser: async payload => { calls.push({ method: 'updateUser', payload }); return hold ?? { data: { user: { id: responseId } }, error }; },
  }, from(table) {
    const request = { table, filters: [] }; calls.push(request);
    const q = { select(fields) { request.fields = fields; return q; }, update(payload) { request.payload = payload; return q; },
      eq(key, value) { request.filters.push([key, value]); return q; },
      single: async () => ({ data: { id: responseId, display_name: request.payload?.display_name ?? 'Synthetic', role: 'patient' }, error }),
    }; return q;
  } };
  return { repo: scope.exports.createAccountRepository(client), calls, actor: value => { id = value; }, error: value => { error = value; }, responseId: value => { responseId = value; }, hold: value => { hold = value; } };
}
test('profile read and name save use only the verified owner and existing columns', async () => {
  const f = fixture(); const read = await f.repo.read(A); assert.equal(read.role, 'patient');
  const saved = await f.repo.updateName(A, '  Synthetic Updated  '); assert.equal(saved.name, 'Synthetic Updated');
  assert.deepEqual(Object.keys(f.calls[1].payload), ['display_name']); assert.equal(f.calls[1].payload.display_name, 'Synthetic Updated');
  assert.deepEqual(f.calls[1].filters, [['id', A]]); assert.equal(f.calls[1].fields, 'id,display_name,role');
});
test('wrong-account and expired sessions stop before any profile or password mutation', async () => {
  const f = fixture();
  for (const id of [B, null]) { f.actor(id); await assert.rejects(f.repo.updateName(A, 'name'), e => e.code === 'AUTH'); await assert.rejects(f.repo.changePassword(A, { password: 'fictional-password', confirmation: 'fictional-password' }), e => e.code === 'AUTH'); }
  assert.equal(f.calls.length, 0);
});
test('invalid names, password mismatch and malformed codes stop before SDK writes', async () => {
  const f = fixture(); for (const name of ['', ' '.repeat(3), 'x'.repeat(101), { role: 'guardian' }]) await assert.rejects(f.repo.updateName(A, name), e => e.code === 'INPUT');
  await assert.rejects(f.repo.changePassword(A, { password: 'fictional-password', confirmation: 'different' }), e => e.code === 'PASSWORD');
  await assert.rejects(f.repo.changePassword(A, { password: 'fictional-password', confirmation: 'fictional-password', nonce: 'bad!' }), e => e.code === 'CODE');
  assert.equal(f.calls.length, 0);
});
test('password changes use updateUser with optional nonce/current password and never role/email metadata', async () => {
  const f = fixture(); await f.repo.changePassword(A, { password: 'fictional-new-password', confirmation: 'fictional-new-password', currentPassword: 'fictional-old-password', nonce: '123456' });
  assert.deepEqual(Object.keys(f.calls[0].payload).sort(), ['current_password', 'nonce', 'password']);
  assert.equal(f.calls[0].method, 'updateUser');
});
test('server reauthentication requirement is preserved; email is requested only by explicit requestCode', async () => {
  const f = fixture(); f.error({ code: 'reauthentication_needed', message: 'private detail' });
  await assert.rejects(f.repo.changePassword(A, { password: 'fictional-password', confirmation: 'fictional-password' }), e => e.code === 'REAUTH_REQUIRED' && !e.message.includes('private'));
  assert.equal(f.calls.length, 1); f.error(null); await f.repo.requestCode(A); assert.equal(f.calls[1].method, 'reauthenticate');
});
test('permissions, OTP expiry and policy failures use safe messages without raw errors', async () => {
  for (const [code, expected] of [['42501', 'FORBIDDEN'], ['weak_password', 'POLICY'], ['reauthentication_not_valid', 'CODE_INVALID'], ['same_password', 'SAME_PASSWORD'], ['over_request_rate_limit', 'RATE_LIMIT']]) {
    const f = fixture(); f.error({ code, message: 'private detail' });
    await assert.rejects(f.repo.changePassword(A, { password: 'fictional-password', confirmation: 'fictional-password' }), e => e.code === expected && !e.message.includes('private'));
  }
});
test('duplicate password submissions are serialized without auto retry', async () => {
  const f = fixture(); let release; f.hold(new Promise(resolve => { release = resolve; }));
  const input = { password: 'fictional-password', confirmation: 'fictional-password' };
  const task = f.repo.changePassword(A, input); await new Promise(resolve => setImmediate(resolve));
  await assert.rejects(f.repo.changePassword(A, input), e => e.code === 'BUSY');
  release({ data: { user: { id: A } }, error: null }); await task; assert.equal(f.calls.length, 1);
});
test('foreign or missing response rows never report profile success', async () => {
  const f = fixture(); f.responseId(B); await assert.rejects(f.repo.updateName(A, 'Synthetic'), e => e.code === 'RESPONSE');
});
