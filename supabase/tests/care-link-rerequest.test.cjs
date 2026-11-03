const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const sql = fs.readFileSync(path.join(__dirname, '../proposals/202611030001_care_link_rerequest.sql'), 'utf8');

// Synthetic policy oracle only: not a PostgreSQL, RPC or RLS implementation test.
function fixture() {
  const roles = { patientA: 'patient', patientB: 'patient', guardianA: 'guardian', guardianB: 'guardian' };
  const rows = [];
  const get = (id, actor) => {
    const row = rows.find(r => r.id === id && [r.patient, r.guardian].includes(actor));
    if (!row) throw Error('forbidden');
    return row;
  };
  return {
    rows,
    request(actor, patient) {
      if (roles[actor] !== 'guardian' || roles[patient] !== 'patient' || actor === patient) throw Error('forbidden');
      if (rows.some(r => r.patient === patient && r.guardian === actor && r.status !== 'revoked')) throw Error('duplicate');
      const row = { id: rows.length + 1, patient, guardian: actor, status: 'pending', approvedBy: null, reason: null };
      rows.push(row);
      return row.id;
    },
    approve(actor, id) {
      const row = get(id, actor);
      if (actor !== row.patient || row.status !== 'pending') throw Error('forbidden');
      row.status = 'approved'; row.approvedBy = actor;
    },
    close(actor, id) {
      const row = get(id, actor);
      if (row.status === 'revoked') throw Error('forbidden');
      row.reason = row.status === 'approved' ? 'revoked' : actor === row.patient ? 'rejected' : 'cancelled';
      row.status = 'revoked';
    },
    list(actor) { return rows.filter(r => [r.patient, r.guardian].includes(actor)); },
    canRead(actor, patient) {
      return roles[patient] === 'patient' && (actor === patient || roles[actor] === 'guardian' && rows.some(r => r.guardian === actor && r.patient === patient && r.status === 'approved'));
    },
  };
}

test('old global uniqueness includes terminal history and blocks another INSERT', () => {
  const history = [{ patient: 'patientA', guardian: 'guardianA', status: 'revoked' }];
  assert.equal(history.some(r => r.patient === 'patientA' && r.guardian === 'guardianA'), true);
});

for (const termination of ['rejected', 'cancelled', 'revoked']) {
  test(`${termination}: fresh request preserves history and requires new consent`, () => {
    const f = fixture(); const old = f.request('guardianA', 'patientA');
    if (termination === 'revoked') f.approve('patientA', old);
    f.close(termination === 'cancelled' ? 'guardianA' : 'patientA', old);
    assert.equal(f.rows[0].reason, termination);
    const history = structuredClone(f.rows[0]);
    const next = f.request('guardianA', 'patientA');
    assert.notEqual(next, old);
    assert.deepEqual(f.rows[0], history);
    assert.equal(f.rows[1].approvedBy, null);
    assert.equal(f.canRead('guardianA', 'patientA'), false);
    assert.throws(() => f.approve('patientA', old), /forbidden/);
    assert.equal(f.rows[1].status, 'pending');
    f.approve('patientA', next);
    assert.equal(f.canRead('guardianA', 'patientA'), true);
    f.close('guardianA', next);
    assert.equal(f.canRead('guardianA', 'patientA'), false);
  });
}

test('duplicate intents cannot replace pending or approved consent in the policy model', () => {
  const f = fixture(); const id = f.request('guardianA', 'patientA');
  assert.throws(() => f.request('guardianA', 'patientA'), /duplicate/);
  f.approve('patientA', id);
  const original = structuredClone(f.rows);
  assert.throws(() => f.request('guardianA', 'patientA'), /duplicate/);
  assert.deepEqual(f.rows, original);
});

test('unrelated participants cannot list, approve, close or read another pair', () => {
  const f = fixture(); const id = f.request('guardianA', 'patientA');
  for (const actor of ['patientB', 'guardianB', undefined]) {
    assert.deepEqual(f.list(actor), []);
    assert.throws(() => f.approve(actor, id), /forbidden/);
    assert.throws(() => f.close(actor, id), /forbidden/);
    assert.equal(f.canRead(actor, 'patientA'), false);
  }
  assert.throws(() => f.approve('guardianA', id), /forbidden/);
  for (const [actor, target] of [['guardianA', 'guardianA'], ['patientA', 'patientB'], ['guardianA', 'missing'], [undefined, 'patientA']]) {
    assert.throws(() => f.request(actor, target), /forbidden/);
  }
});

test('SQL protects active pairs before removing global uniqueness and never resurrects rows', () => {
  assert.match(sql, /create unique index care_links_one_active_pair[\s\S]*?where status in \('pending', 'approved'\)/i);
  assert.ok(sql.indexOf('create unique index') < sql.indexOf('drop constraint'));
  assert.match(sql, /on conflict \(patient_id, guardian_id\) where status in \('pending', 'approved'\) do nothing/i);
  assert.match(sql, /errcode = '23505'/);
  assert.doesNotMatch(sql, /do update|delete from|truncate|drop table|disable row level security|alter type/i);
  assert.match(sql, /closure_reason is null or closure_reason in \('rejected', 'cancelled', 'revoked'\)/);
});

test('SQL keeps authenticated participant checks, fixed search paths and restricted execute grants', () => {
  assert.equal((sql.match(/security definer set search_path = ''/g) || []).length, 2);
  assert.match(sql, /actor is null or drmas_private.current_role\(\) is distinct from 'guardian'/);
  assert.match(sql, /target_patient = actor/);
  assert.match(sql, /p.role = 'patient'/);
  assert.match(sql, /c.patient_id = actor or c.guardian_id = actor\)[\s\S]*?for update/);
  assert.match(sql, /from public, anon/);
  assert.match(sql, /grant execute[\s\S]*?to authenticated/);
  assert.doesNotMatch(sql, /grant (?:all|insert|update|delete)\b/i);
  assert.match(sql, /CARE_LINK_RLS_BASELINE_REQUIRED/);
});
