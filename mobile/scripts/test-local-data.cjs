const { test } = require('node:test');
const assert = require('node:assert/strict');
const { createHarness } = require('./controller-harness.cjs');
const deferred = () => { let resolve, reject; const promise = new Promise((yes, no) => { resolve = yes; reject = no; }); return { promise, resolve, reject }; };

function fixture(options = {}) {
  const data = new Map(), reads = [], writes = [], listeners = new Set();
  let id = 'account-a', failRead = false, failWrite = false, getOverride, setOverride;
  let clock = new Date(2026, 10, 1, 12).getTime();
  class Clock extends Date { constructor() { super(clock); } static now() { return clock; } }
  const day = () => { const d = new Clock(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
  const storage = {
    async getItem(key) { reads.push(key); if (failRead) throw Error('fixture'); return getOverride ? getOverride(key) : data.get(key) ?? null; },
    async setItem(key, value) { writes.push(key); if (failWrite) throw Error('fixture'); if (setOverride) await setOverride(key, value); else data.set(key, value); },
  };
  const account = () => ({ id, role: 'patient', name: 'Fictional', email: 'fictional@example.invalid' });
  const auth = {
    AuthError: class extends Error {}, authErrorMessage: () => '인증 오류',
    readToken: async () => options.noSession ? null : 'fixture-token',
    getCurrentUser: async () => account(), saveToken: async () => {},
    login: async () => ({ accessToken: 'fixture-token' }),
    clearToken: async () => { listeners.forEach(fn => fn()); if (options.failLogout) throw Error('fixture'); },
    watchSession: callback => { listeners.add(callback); return () => listeners.delete(callback); },
  };
  const harness = createHarness({ auth, storage, DateImpl: Clock });
  const key = who => harness.service.medicationKey(who, day());
  async function login(app, who) {
    id = who; app.state.setEmail('fictional@example.invalid'); app.state.setPassword('password123');
    await app.state.submitAuth(); await app.flush();
  }
  return { ...harness, auth, data, reads, writes, key, day, login,
    signedOut() { listeners.forEach(fn => fn()); },
    failRead(value) { failRead = value; }, failWrite(value) { failWrite = value; },
    getOverride(value) { getOverride = value; }, setOverride(value) { setOverride = value; },
    nextDay() { clock += 86400000; },
  };
}
const checked = app => Array.from(app.state.meds.filter(m => m.taken), m => m.id);

test('authenticated IDs isolate same-role accounts; initial reads never write; legacy bytes remain untouched', async () => {
  const f = fixture(), legacy = `drmas.medication.v1.${f.day()}`;
  f.data.set(legacy, '["3"]');
  const app = f.mount(); await app.flush();
  assert.deepEqual(checked(app), []); assert.equal(f.writes.length, 0);
  await app.state.toggleMedication('1'); await app.flush();
  assert.equal(f.data.get(f.key('account-a')), '["1"]');
  await app.state.signOut(); await app.flush(); await f.login(app, 'account-b');
  assert.deepEqual(checked(app), []);
  await app.state.toggleMedication('2'); await app.flush();
  await app.state.signOut(); await app.flush(); await f.login(app, 'account-a');
  assert.deepEqual(checked(app), ['1']); assert.equal(f.data.get(f.key('account-b')), '["2"]');
  assert.equal(f.data.get(legacy), '["3"]'); assert.ok(f.reads.every(key => !key.includes('.v1.')));
  app.dispose();
});

test('no medication read, display or write before the account is server verified', async () => {
  const f = fixture(), pending = deferred(); f.auth.getCurrentUser = () => pending.promise;
  f.data.set(f.key('account-a'), '["1"]'); const app = f.mount(); await app.flush();
  assert.equal(app.state.user, null); assert.equal(app.state.meds.length, 0); assert.equal(f.reads.length, 0);
  await app.state.toggleMedication('1'); app.state.startSOS(); app.state.sendChat();
  assert.equal(f.writes.length, 0); assert.equal(app.state.sosLeft, null);
  pending.resolve({ id: 'account-a', role: 'patient', name: 'Fictional', email: 'fictional@example.invalid' });
  await app.flush(); assert.deepEqual(checked(app), ['1']); app.dispose();
});

test('read failure preserves stored bytes, blocks toggles and recovers only through a successful retry', async () => {
  const f = fixture(); f.data.set(f.key('account-a'), '["1"]'); f.failRead(true);
  const app = f.mount(); await app.flush(); assert.equal(app.state.medsReady, false);
  assert.match(app.state.medsError, /읽지/); await app.state.toggleMedication('2'); await app.flush();
  assert.equal(f.writes.length, 0); assert.equal(f.data.get(f.key('account-a')), '["1"]');
  f.failRead(false); app.state.retryMedications(); await app.flush();
  assert.equal(app.state.medsError, null); assert.deepEqual(checked(app), ['1']); assert.equal(f.writes.length, 0); app.dispose();
});

for (const [name, raw] of [['invalid-json', '{'], ['null', 'null'], ['object', '{}'], ['non-string-id', '[1]']]) {
  test(`parse failure (${name}) never overwrites or deletes the original`, async () => {
    const f = fixture(); f.data.set(f.key('account-a'), raw); const app = f.mount(); await app.flush();
    assert.equal(app.state.medsReady, false); assert.match(app.state.medsError, /형식/);
    await app.state.toggleMedication('1'); app.state.retryMedications(); await app.flush();
    assert.equal(f.writes.length, 0); assert.equal(f.data.get(f.key('account-a')), raw); app.dispose();
  });
}

test('save failure retains the last confirmed display and requires a reread before any further write', async () => {
  const f = fixture(); f.data.set(f.key('account-a'), '["1"]'); const app = f.mount(); await app.flush();
  f.failWrite(true); await app.state.toggleMedication('2'); await app.flush();
  assert.deepEqual(checked(app), ['1']); assert.equal(app.state.medsReady, false); assert.match(app.state.medsError, /저장하지/);
  await app.state.toggleMedication('3'); assert.equal(f.writes.length, 1); assert.equal(f.data.get(f.key('account-a')), '["1"]');
  f.failWrite(false); app.state.retryMedications(); await app.flush(); await app.state.toggleMedication('2'); await app.flush();
  assert.deepEqual(checked(app), ['1', '2']); app.dispose();
});

test('unrecognised string IDs survive edits to visible schedules', async () => {
  const f = fixture(); f.data.set(f.key('account-a'), '["1","future-id"]'); const app = f.mount(); await app.flush();
  await app.state.toggleMedication('2'); assert.equal(f.data.get(f.key('account-a')), '["1","future-id","2"]'); app.dispose();
});

test('uncertain write acknowledgement is reconciled by rereading, never by an automatic rollback write', async () => {
  const f = fixture(); f.data.set(f.key('account-a'), '["1"]'); const app = f.mount(); await app.flush();
  f.setOverride(async (key, value) => { f.data.set(key, value); throw Error('fixture acknowledgement failure'); });
  await app.state.toggleMedication('2'); await app.flush(); assert.deepEqual(checked(app), ['1']);
  assert.equal(f.writes.length, 1); assert.equal(app.state.medsReady, false);
  f.setOverride(undefined); app.state.retryMedications(); await app.flush();
  assert.deepEqual(checked(app), ['1', '2']); assert.equal(f.writes.length, 1); app.dispose();
});

test('late account A write failure cannot change account B error or readiness', async () => {
  const f = fixture(), pending = deferred(); const app = f.mount(); await app.flush();
  f.setOverride(() => pending.promise); const saving = app.state.toggleMedication('1'); await app.flush();
  f.signedOut(); await app.flush(); await f.login(app, 'account-b');
  pending.reject(Error('fixture')); await saving; await app.flush();
  assert.equal(app.state.user.id, 'account-b'); assert.equal(app.state.medsReady, true);
  assert.equal(app.state.medsError, null); assert.equal(app.state.medsSaving, false); app.dispose();
});

for (const outcome of ['resolve', 'reject']) {
  test(`late account A read ${outcome} cannot change account B display or error`, async () => {
    const f = fixture(), pending = deferred();
    f.getOverride(key => key === f.key('account-a') ? pending.promise : '["2"]');
    const app = f.mount(); await app.flush(); f.signedOut(); await app.flush(); await f.login(app, 'account-b');
    assert.deepEqual(checked(app), ['2']);
    if (outcome === 'resolve') pending.resolve('["1"]'); else pending.reject(Error('fixture'));
    await app.flush(); assert.equal(app.state.user.id, 'account-b'); assert.deepEqual(checked(app), ['2']);
    assert.equal(app.state.medsError, null); assert.equal(f.writes.length, 0); app.dispose();
  });
}

test('A -> B -> A invalidates the first A request even though the user ID matches again', async () => {
  const f = fixture(), pending = deferred(); let first = true;
  f.getOverride(key => { if (key === f.key('account-a') && first) { first = false; return pending.promise; } return '["3"]'; });
  const app = f.mount(); await app.flush(); f.signedOut(); await app.flush(); await f.login(app, 'account-b');
  f.signedOut(); await app.flush(); await f.login(app, 'account-a'); assert.equal(app.state.medsReady, false);
  pending.resolve('["1"]'); await app.flush(); assert.deepEqual(checked(app), ['3']); app.dispose();
});

test('manual logout, failed remote logout and SDK SIGNED_OUT clear all private memory and pending SOS callbacks', async () => {
  for (const mode of ['manual', 'failed', 'event']) {
    const f = fixture({ failLogout: mode === 'failed' }); const app = f.mount(); await app.flush();
    await app.state.toggleMedication('1'); app.state.setChatInput('fixture question'); app.state.sendChat();
    app.state.setChatInput('unsent fixture'); app.state.setShowPassword(true); app.state.setSosDelay(30);
    app.state.setSosLeft(1); await app.flush(); await app.tick(); assert.equal(app.state.sosNotice, true);
    app.state.setSosAcknowledged(true); app.state.setSosLeft(30); await app.flush();
    const callbacks = app.timers();
    if (mode === 'event') f.signedOut(); else await app.state.signOut();
    await app.flush(); callbacks.forEach(fn => fn()); await app.flush();
    assert.equal(app.state.user, null); assert.equal(app.state.meds.length, 0); assert.equal(app.state.medsReady, false);
    assert.equal(app.state.chatInput, ''); assert.equal(app.state.messages.length, 1);
    assert.equal(app.state.sosLeft, null); assert.equal(app.state.sosNotice, false); assert.equal(app.state.sosAcknowledged, false);
    assert.equal(app.state.sosDelay, 10); assert.equal(app.state.showPassword, false); assert.equal(app.state.email, '');
    assert.equal(f.data.get(f.key('account-a')), '["1"]'); app.dispose();
  }
});

test('in-flight write is confined to its original user, ignores extra taps, and precedes that user reread', async () => {
  const f = fixture(), pending = deferred(); const app = f.mount(); await app.flush();
  f.setOverride(async (key, value) => { await pending.promise; f.data.set(key, value); });
  const saving = app.state.toggleMedication('1'); await app.flush();
  await app.state.toggleMedication('2'); assert.equal(f.writes.length, 1); assert.equal(app.state.medsSaving, true);
  f.signedOut(); await app.flush(); await f.login(app, 'account-b'); assert.deepEqual(checked(app), []);
  f.signedOut(); await app.flush(); await f.login(app, 'account-a'); assert.equal(app.state.medsReady, false);
  pending.resolve(); await saving; await app.flush(); assert.deepEqual(checked(app), ['1']); assert.equal(app.state.medsError, null); app.dispose();
});

test('day transition never copies the previous day or writes until an explicit loaded-day edit', async () => {
  const f = fixture(); f.data.set(f.key('account-a'), '["1"]'); const oldKey = f.key('account-a');
  const app = f.mount(); await app.flush(); f.nextDay(); app.activate(); await app.flush();
  assert.deepEqual(checked(app), []); assert.equal(f.writes.length, 0); assert.equal(f.data.get(oldKey), '["1"]');
  await app.state.toggleMedication('2'); assert.equal(f.data.get(f.key('account-a')), '["2"]'); assert.equal(f.data.get(oldKey), '["1"]'); app.dispose();
});

test('unmount invalidates pending read/write completions without scheduling state updates', async () => {
  const f = fixture(), pending = deferred(); f.getOverride(() => pending.promise);
  const app = f.mount(); await app.flush(); app.dispose(); pending.resolve('["1"]'); await app.flush();
  assert.equal(app.lateUpdates, 0); assert.equal(f.writes.length, 0);
  f.getOverride(undefined); const second = f.mount(); await second.flush(); const write = deferred();
  f.setOverride(async (key, value) => { await write.promise; f.data.set(key, value); });
  const saving = second.state.toggleMedication('2'); await second.flush(); second.dispose(); write.resolve(); await saving;
  assert.equal(second.lateUpdates, 0);
});

test('SIGNED_OUT during authentication restoration prevents late account acceptance', async () => {
  const f = fixture(), pending = deferred(); f.auth.getCurrentUser = () => pending.promise;
  const app = f.mount(); await app.flush(); f.signedOut(); pending.resolve({ id: 'account-a', role: 'patient' });
  await app.flush(); assert.equal(app.state.user, null); assert.equal(f.reads.length, 0); app.dispose();
});

test('queued writes cancelled before execution never touch storage', async () => {
  const f = fixture(), pending = deferred(); f.getOverride(() => pending.promise);
  const store = f.service.localMedications; const reading = store.read('account-a', f.day());
  const saving = store.write('account-a', f.day(), ['1'], () => false);
  pending.resolve(null); await reading; assert.equal(await saving, false); assert.equal(f.writes.length, 0);
});
