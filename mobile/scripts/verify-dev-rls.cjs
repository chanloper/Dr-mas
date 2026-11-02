// Opt-in, read-only data checks. Credentials enter masked TTY input, remain in
// memory, and are never written to files, command arguments, or output.
const fs = require('node:fs');
const path = require('node:path');
function readConfiguration() {
  const env = {};
  for (const line of fs.readFileSync(path.join(__dirname, '../.env'), 'utf8').split(/\r?\n/)) {
    const m = line.match(/^\s*(?:export\s+)?([A-Z0-9_]+)\s*=\s*(.*?)\s*$/);
    if (m) env[m[1]] = m[2].replace(/^(['"])(.*)\1$/, '$2');
  }
  return validateConfiguration(env);
}
function validateConfiguration(env) {
  const url = new URL(env.EXPO_PUBLIC_SUPABASE_URL);
  const ref = env.EXPO_PUBLIC_EXPECTED_SUPABASE_REF ?? '';
  if (env.EXPO_PUBLIC_APP_ENV !== 'development' || !/^[a-z0-9-]+$/.test(ref) || url.hostname !== `${ref}.supabase.co`
    || url.protocol !== 'https:' || url.port || url.username || url.password || url.search || url.hash || url.pathname !== '/'
    || !env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY?.startsWith('sb_publishable_')) throw Error('DEV_CONFIGURATION_REQUIRED');
  return { url: url.origin, key: env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY };
}
function hiddenInput(label) {
  return new Promise((resolve, reject) => {
    if (!process.stdin.isTTY || !process.stdout.isTTY) { reject(Error('TTY_REQUIRED')); return; }
    const characters = []; const previousRaw = process.stdin.isRaw;
    process.stdout.write(label); process.stdin.setEncoding('utf8'); process.stdin.setRawMode(true); process.stdin.resume();
    function finish(error) {
      process.stdin.off('data', onData); process.stdin.setRawMode(previousRaw ?? false); process.stdin.pause(); process.stdout.write('\n');
      if (error) { characters.length = 0; reject(error); } else { const value = characters.join(''); characters.length = 0; resolve(value); }
    }
    function onData(chunk) {
      if (chunk.includes('\x1b')) return;
      for (const character of chunk) {
        if (character === '\x03' || character === '\x04') { finish(Error('CANCELLED')); return; }
        if (character === '\r' || character === '\n') { finish(); return; }
        if (character === '\x7f' || character === '\b') characters.pop();
        else if (character >= ' ') characters.push(character);
      }
    }
    process.stdin.on('data', onData);
  });
}
async function probe(a, b, anon, ids, report) {
  if (!ids[0] || ids[0] === ids[1]) throw Error('TWO_ACCOUNTS_REQUIRED');
  const allowed = response => !response.error && Array.isArray(response.data);
  const denied = (response, anonymous = false) => response.error?.code === '42501' || anonymous && (response.status === 401 || response.status === 403)
    || allowed(response) && response.data.length === 0;
  for (const [index, client] of [a, b].entries()) {
    const own = await client.from('profiles').select('id,role').eq('id', ids[index]);
    if (!allowed(own) || own.data.length !== 1 || own.data[0].id !== ids[index] || own.data[0].role !== 'patient') throw Error('OWN_PROFILE_FAILED');
    report('PASS', `patient_${index === 0 ? 'A' : 'B'}_own_profile`);
    const other = await client.from('profiles').select('id').eq('id', ids[1 - index]);
    if (!denied(other)) throw Error('OTHER_PROFILE_VISIBLE');
    report('PASS', `patient_${index === 0 ? 'A' : 'B'}_other_profile_blocked`);
  }
  const schedules = await b.from('medications').select('id').eq('patient_id', ids[1]).limit(1);
  if (!allowed(schedules)) throw Error('FIXTURE_QUERY_FAILED');
  if (!schedules.data.length) report('UNVERIFIED', 'B_medication_fixture_missing');
  else {
    const id = schedules.data[0].id;
    const other = await a.from('medications').select('id').eq('id', id);
    if (!denied(other)) throw Error('OTHER_MEDICATION_VISIBLE');
    report('PASS', 'A_cannot_read_B_existing_medication');
    const records = await b.from('medication_records').select('medication_id,day').eq('medication_id', id).limit(1);
    if (!allowed(records)) throw Error('FIXTURE_QUERY_FAILED');
    if (!records.data.length) report('UNVERIFIED', 'B_record_fixture_missing');
    else {
      const otherRecord = await a.from('medication_records').select('medication_id').eq('medication_id', id).eq('day', records.data[0].day);
      if (!denied(otherRecord)) throw Error('OTHER_RECORD_VISIBLE');
      report('PASS', 'A_cannot_read_B_existing_record');
    }
  }
  for (const table of ['profiles', 'medications', 'medication_records']) {
    if (!denied(await anon.from(table).select(table === 'medication_records' ? 'medication_id' : 'id').limit(1), true)) throw Error('ANON_DATA_VISIBLE');
    report('PASS', `anonymous_${table}_blocked`);
  }
}
async function main() {
  if (!process.argv.includes('--dev-readonly') || !process.argv.includes('--synthetic-accounts-only')) {
    console.log('Run only with: node scripts/verify-dev-rls.cjs --dev-readonly --synthetic-accounts-only'); process.exitCode = 2; return;
  }
  const sessions = [];
  try {
    const config = readConfiguration();
    const { createClient } = require('@supabase/supabase-js');
    const make = () => createClient(config.url, config.key, {
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false, debug: false },
      global: { fetch: (input, init) => fetch(input, { ...init, signal: AbortSignal.timeout(15000) }) },
    });
    const clients = [], ids = [];
    for (const label of ['A', 'B']) {
      let email = await hiddenInput(`Test account ${label} email (hidden): `);
      let password = await hiddenInput(`Test account ${label} password (hidden): `);
      const client = make(); const result = await client.auth.signInWithPassword({ email: email.trim(), password });
      email = ''; password = '';
      if (result.error || !result.data.user?.id || !result.data.session) throw Error('LOGIN_FAILED');
      sessions.push(client); clients.push(client); ids.push(result.data.user.id);
    }
    let missingFixture = false;
    await probe(clients[0], clients[1], make(), ids, (status, name) => { if (status === 'UNVERIFIED') missingFixture = true; console.log(`${status} ${name}`); });
    if (missingFixture) process.exitCode = 3;
    console.log('UNVERIFIED write-denial and guardian-consent checks require a separately approved test.');
  } catch (error) {
    const safeCodes = new Set(['DEV_CONFIGURATION_REQUIRED', 'TTY_REQUIRED', 'CANCELLED', 'LOGIN_FAILED', 'TWO_ACCOUNTS_REQUIRED', 'OWN_PROFILE_FAILED', 'OTHER_PROFILE_VISIBLE', 'FIXTURE_QUERY_FAILED', 'OTHER_MEDICATION_VISIBLE', 'OTHER_RECORD_VISIBLE', 'ANON_DATA_VISIBLE']);
    const code = safeCodes.has(error?.message) ? error.message : 'CONFIGURATION_OR_CONNECTION';
    console.log(`FAIL ${code}: Check Dev settings, synthetic accounts, fixtures and access policies. No credentials were printed.`);
    process.exitCode = 1;
  } finally { await Promise.allSettled(sessions.map(client => client.auth.signOut({ scope: 'local' }))); }
}
module.exports = { validateConfiguration, probe };
if (require.main === module) void main();
