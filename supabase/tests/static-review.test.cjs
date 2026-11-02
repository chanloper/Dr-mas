'use strict';
// Source-contract checks only. These are NOT a PostgreSQL parser or RLS engine.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '../..');
const sql = fs.readFileSync(path.join(root, 'supabase/migrations/202611010001_auth_and_care.sql'), 'utf8');
const tables = ['profiles', 'medications', 'medication_records', 'care_links'];
test('actual table names and RLS declarations are complete', () => {
  assert.deepEqual([...sql.matchAll(/create table public\.(\w+)/g)].map(match => match[1]).sort(), [...tables].sort());
  for (const table of tables) assert.ok(sql.includes(`alter table public.${table} enable row level security;`));
});
test('fresh private schema refuses unknown pre-existing ownership and grants', () => {
  assert.match(sql, /create schema drmas_private;/);
  assert.doesNotMatch(sql, /create schema if not exists/);
  assert.match(sql, /revoke all on schema drmas_private from public, anon, authenticated/);
});
test('profile role and connection state have no client write grant', () => {
  assert.match(sql, /grant update \(display_name\) on public.profiles to authenticated/);
  assert.doesNotMatch(sql, /grant update\s*\([^)]*\brole\b[^)]*\)/i);
  assert.doesNotMatch(sql, /grant (?:all|insert|update|delete)[^;]*on public\.care_links[^;]*to authenticated/i);
  assert.match(sql, /revoke all on public.profiles, public.care_links, public.medications, public.medication_records from public, anon, authenticated/);
});
test('trigger assigns a server role independently from signup metadata', () => {
  assert.match(sql, /insert into public.profiles\(id, display_name, role\) values \(new.id, label, 'patient'\)/);
  assert.doesNotMatch(sql, /raw_user_meta_data\s*->>\s*'(?:role|requestedRole)'/);
});
test('privileged functions use explicit empty search paths and restricted execution', () => {
  const functions = [...sql.matchAll(/create function ([\w.]+)\([\s\S]*?as \$\$[\s\S]*?\$\$;/g)].map(match => match[0]);
  assert.equal(functions.length, 8);
  for (const fn of functions) assert.ok(fn.includes("set search_path = ''"));
  assert.match(sql, /revoke all on function public.request_care_link\(uuid\), public.approve_care_link\(uuid\), public.revoke_care_link\(uuid\) from public, anon/);
});
test('read helper requires current roles and approved patient relationship', () => {
  assert.ok(sql.includes("drmas_private.current_role() = 'guardian'"));
  assert.ok(sql.includes("c.status = 'approved' and p.role = 'patient'"));
  assert.ok(sql.includes('c.guardian_id = (select auth.uid())'));
  assert.ok(sql.includes("c.patient_id = auth.uid() and c.status = 'pending'"));
});
test('cross-owner foreign key, consent checks and timezone validation are present', () => {
  assert.ok(sql.includes('foreign key (medication_id, patient_id) references public.medications(id, patient_id)'));
  assert.ok(sql.includes('approved_by is not null and approved_by = patient_id'));
  assert.ok(sql.includes('select 1 from pg_catalog.pg_timezone_names where name = new.timezone'));
  assert.ok(sql.includes("time_local < time '24:00:00'"));
  assert.ok(sql.includes('new.medication_id is distinct from old.medication_id'));
});
test('migration is transactional and contains no destructive reset or legacy imports', () => {
  const commands = sql.replace(/--[^\n]*/g, '').trim();
  assert.match(commands, /^begin;/); assert.match(commands, /commit;$/);
  assert.doesNotMatch(commands, /\b(?:drop|truncate)\s+(?:table|schema|database)\b/i);
  assert.doesNotMatch(commands, /\b(?:Users|Facilities|login_id|DB_PASS)\b/);
});
test('local runtime test is guarded, uses non-owner roles and rolls back fixtures', () => {
  const fixture = fs.readFileSync(path.join(__dirname, 'rls_access.sql'), 'utf8');
  assert.ok(fixture.includes("current_database() <> 'drmas_rls_test'"));
  assert.ok(fixture.includes('set local role anon;'));
  assert.ok(fixture.includes('set local role authenticated;'));
  assert.match(fixture.trim(), /rollback;$/);
  assert.ok((fixture.match(/select drmas_test\.(?:ok|denied|zero_write)\(/g) || []).length >= 40);
});
