'use strict';

// Opt-in Windows integration runner. Never reads .env, DB_* or production URLs.
const fs = require('node:fs');
const path = require('node:path');
const net = require('node:net');
const { spawn } = require('node:child_process');
const { once } = require('node:events');
const { randomBytes, createHash } = require('node:crypto');
const assert = require('node:assert/strict');
const mariadb = require('mariadb');
const bcrypt = require('bcrypt');
const { createApp } = require('../src/app');
const { createAuthService } = require('../src/auth');
const { createRepository } = require('../src/repository');
const { readConfig } = require('../src/config');

const workspace = path.resolve(__dirname, '../..');
const results = [];
const digest = value => createHash('sha256').update(value).digest('hex');
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
const canonical = value => path.resolve(value).replace(/[\\/]+$/, '').toLowerCase();
function ensure(value, label) { if (!value) throw Object.assign(new Error(label), { code: 'TEST_ASSERTION' }); }
async function check(label, task) {
  try { await task(); results.push({ label, status: 'PASS' }); console.log(`PASS ${label}`); }
  catch (error) {
    // Do not print assertions' actual/expected values, SQL, tokens or passwords.
    results.push({ label, status: 'FAIL', code: typeof error.code === 'string' ? error.code : 'TEST_FAILURE' });
    console.log(`FAIL ${label}`);
  }
}
async function port() {
  const probe = net.createServer();
  probe.listen(0, '127.0.0.1'); await once(probe, 'listening');
  const value = probe.address().port;
  await new Promise(resolve => probe.close(resolve));
  return value;
}
async function runProcess(executable, args) {
  const child = spawn(executable, args, { windowsHide: true, stdio: 'ignore' });
  const [code] = await once(child, 'exit');
  ensure(code === 0, 'local initialization failed');
}
async function main() {
  ensure(process.platform === 'win32', 'This runner requires local Windows MariaDB binaries');
  ensure(process.argv.includes('--run-isolated-local'), 'Explicit --run-isolated-local is required');
  const index = process.argv.indexOf('--mariadb-bin');
  ensure(index >= 0 && process.argv[index + 1], 'An explicit --mariadb-bin path is required');
  const bin = path.resolve(process.argv[index + 1]);
  const installer = path.join(bin, 'mariadb-install-db.exe');
  const executable = path.join(bin, 'mariadbd.exe');
  ensure(fs.existsSync(installer) && fs.existsSync(executable), 'MariaDB binaries are unavailable; do not install or connect automatically');
  const testRoot = path.join(workspace, '.local-auth-tests');
  fs.mkdirSync(testRoot, { recursive: true });
  const runDir = fs.mkdtempSync(path.join(testRoot, 'run-'));
  ensure(path.dirname(runDir) === testRoot, 'Unsafe data path');
  const datadir = path.join(runDir, 'data');
  const rootPassword = randomBytes(32).toString('hex');
  const appPassword = randomBytes(32).toString('hex');
  const dbPort = await port();
  const configFile = path.join(runDir, 'server.ini');
  fs.writeFileSync(configFile, `[mysqld]\nbind-address=127.0.0.1\nskip-name-resolve\ninnodb-buffer-pool-size=64M\nmax-connections=20\n`);
  console.log('Initializing a NEW local data directory; no existing service/configuration is used.');
  await runProcess(installer, [`--datadir=${datadir}`, `--password=${rootPassword}`, `--port=${dbPort}`, `--config=${configFile}`, '--silent']);
  const daemon = spawn(executable, [
    `--defaults-file=${path.join(datadir, 'my.ini')}`, `--datadir=${datadir}`, `--port=${dbPort}`,
    '--bind-address=127.0.0.1', '--skip-name-resolve', '--skip-log-bin', '--skip-slave-start',
    `--pid-file=${path.join(runDir, 'mariadb.pid')}`, `--log-error=${path.join(runDir, 'mariadb.log')}`,
  ], { windowsHide: true, stdio: 'ignore' });
  let spawnError = false;
  daemon.on('error', () => { spawnError = true; });
  let admin;
  let identityVerified = false;
  const pools = [];
  const servers = [];
  let metadata;
  try {
    for (let attempt = 0; attempt < 100; attempt++) {
      if (spawnError || daemon.exitCode !== null) break;
      try {
        admin = await mariadb.createConnection({ host: '127.0.0.1', port: dbPort, user: 'root', password: rootPassword, timezone: 'Z', connectTimeout: 500, multipleStatements: false });
        break;
      } catch { await pause(200); }
    }
    ensure(admin, 'Isolated server did not become available; no alternate DB will be used');
    const [identity] = await admin.query('SELECT @@datadir AS datadir, @@port AS port, VERSION() AS version');
    ensure(canonical(identity.datadir) === canonical(datadir) && Number(identity.port) === dbPort, 'Test server identity mismatch; refuse all DDL');
    identityVerified = true;
    metadata = { version: identity.version, host: '127.0.0.1', dbPort, dataDirectory: path.relative(workspace, datadir), http: '127.0.0.1 ephemeral ports', variants: ['schema.sql', 'server.js'] };
    await admin.query("CREATE USER 'drmas_test_app'@'127.0.0.1' IDENTIFIED BY ?", [appPassword]);
    const dummyHash = await bcrypt.hash(randomBytes(20).toString('hex'), 10);
    const sql = fs.readFileSync(path.join(workspace, 'database/schema.sql'), 'utf8');
    const schemaMatch = sql.match(/CREATE TABLE `Users` \([\s\S]*?\) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;/);
    const legacy = fs.readFileSync(path.join(workspace, 'mas_project/server.js'), 'utf8');
    const runtimeMatch = legacy.match(/CREATE TABLE IF NOT EXISTS Users \([^`]+\)/);
    ensure(schemaMatch && runtimeMatch, 'Legacy schema fixture could not be extracted');
    const migration = fs.readFileSync(path.join(workspace, 'database/migrations/001_mobile_auth.sql'), 'utf8');
    const statements = migration.replace(/--[^\n]*/g, '').split(';').map(item => item.trim()).filter(Boolean);
    ensure(statements.length === 2 && statements.every(item => /^CREATE TABLE `mobile_auth_/.test(item)), 'Unexpected migration statements');
    for (const [variant, fixture] of [['schema', schemaMatch[0]], ['runtime', `${runtimeMatch[0]} ENGINE=InnoDB`]]) {
      const db = `drmas_auth_test_${path.basename(runDir).replace(/[^a-z0-9]/gi, '').toLowerCase()}_${variant}`;
      ensure(/^drmas_auth_test_[a-z0-9_]+$/.test(db), 'Unsafe database name');
      await admin.query(`CREATE DATABASE \`${db}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`);
      await admin.query(`USE \`${db}\``);
      await admin.query(fixture);
      const originalHash = await bcrypt.hash('legacy-local-only', 10);
      await admin.query('INSERT INTO Users (login_id, password, username, age, gender) VALUES (?, ?, ?, ?, ?)', ['legacy_fictional', originalHash, '가상기존계정', 40, 'Other']);
      const [original] = await admin.query('SELECT * FROM Users WHERE login_id = ?', ['legacy_fictional']);
      const [ddl] = await admin.query('SHOW CREATE TABLE Users');
      await admin.query(`GRANT SELECT, INSERT ON \`${db}\`.Users TO 'drmas_test_app'@'127.0.0.1'`);
      const config = readConfig({ DB_HOST: '127.0.0.1', DB_PORT: String(dbPort), DB_USER: 'drmas_test_app', DB_PASS: appPassword, DB_NAME: db });
      const pool = mariadb.createPool(config.database); pools.push(pool);
      const service = createAuthService({ repository: createRepository(pool), passwords: bcrypt, dummyHash });
      const server = createApp(service).listen(0, '127.0.0.1'); servers.push(server); await once(server, 'listening');
      const base = `http://127.0.0.1:${server.address().port}`;
      const input = { email: 'patient@example.invalid', password: 'fictional-password', name: '가상환자', requestedRole: 'patient' };
      async function http(route, { method = 'GET', body, token, raw } = {}) {
        const response = await fetch(base + route, { method, signal: AbortSignal.timeout(10000), headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) }, ...(body || raw ? { body: raw || JSON.stringify(body) } : {}) });
        const text = await response.text();
        return { status: response.status, body: text ? JSON.parse(text) : null, cache: response.headers.get('cache-control') };
      }
      const label = text => `${variant}: ${text}`;
      await check(label('missing migration returns HTTP 503 and rolls back Users insert'), async () => {
        ensure((await http('/auth/register', { method: 'POST', body: input })).status === 503);
        ensure(Number((await admin.query('SELECT COUNT(*) AS n FROM Users'))[0].n) === 1);
      });
      await check(label('migration applies without changing legacy schema or seed row'), async () => {
        const [immediatelyBefore] = await admin.query('SHOW CREATE TABLE Users');
        for (const statement of statements) await admin.query(statement);
        assert.deepEqual((await admin.query('SELECT * FROM Users WHERE user_id = ?', [original.user_id]))[0], original);
        assert.deepEqual((await admin.query('SHOW CREATE TABLE Users'))[0], immediatelyBefore);
        ensure((await admin.query("SHOW TABLES LIKE 'mobile_auth_%'")).length === 2);
      });
      await admin.query(`GRANT SELECT, INSERT ON \`${db}\`.mobile_auth_accounts TO 'drmas_test_app'@'127.0.0.1'`);
      await admin.query(`GRANT SELECT, INSERT, DELETE ON \`${db}\`.mobile_auth_sessions TO 'drmas_test_app'@'127.0.0.1'`);
      let registerToken;
      let loginToken;
      let userId;
      await check(label('HTTP registration 201, /me 200, no-store, persisted bcrypt and token digest'), async () => {
        const registered = await http('/auth/register', { method: 'POST', body: input });
        ensure(registered.status === 201 && registered.cache === 'no-store'); registerToken = registered.body.accessToken;
        const me = await http('/auth/me', { token: registerToken }); ensure(me.status === 200 && me.body.role === 'patient' && me.body.email === input.email); userId = me.body.id;
        const [row] = await admin.query('SELECT u.password, s.token_hash, s.credential_hash, s.expires_at FROM Users u JOIN mobile_auth_sessions s ON s.user_id=u.user_id WHERE u.user_id=?', [userId]);
        ensure(await bcrypt.compare(input.password, row.password)); ensure(row.token_hash === digest(registerToken)); ensure(row.credential_hash === digest(row.password));
        ensure(row.expires_at.getTime() > Date.now());
      });
      await check(label('duplicate email HTTP 409 does not leave an orphan Users row'), async () => {
        const before = Number((await admin.query('SELECT COUNT(*) AS n FROM Users'))[0].n);
        ensure((await http('/auth/register', { method: 'POST', body: { ...input, email: input.email.toUpperCase() } })).status === 409);
        ensure(Number((await admin.query('SELECT COUNT(*) AS n FROM Users'))[0].n) === before);
      });
      await check(label('concurrent registration yields one 201 and one 409 with one user'), async () => {
        const before = Number((await admin.query('SELECT COUNT(*) AS n FROM Users'))[0].n);
        const body = { ...input, email: 'concurrent@example.invalid' };
        const responses = await Promise.all([http('/auth/register', { method: 'POST', body }), http('/auth/register', { method: 'POST', body })]);
        ensure(responses.map(item => item.status).sort().join(',') === '201,409');
        ensure(Number((await admin.query('SELECT COUNT(*) AS n FROM Users'))[0].n) === before + 1);
      });
      await check(label('HTTP login 200; wrong password and unknown email 401'), async () => {
        const logged = await http('/auth/login', { method: 'POST', body: { email: input.email, password: input.password } }); ensure(logged.status === 200); loginToken = logged.body.accessToken;
        ensure((await http('/auth/login', { method: 'POST', body: { email: input.email, password: 'incorrect-fictional' } })).status === 401);
        ensure((await http('/auth/login', { method: 'POST', body: { email: 'unknown@example.invalid', password: input.password } })).status === 401);
      });
      await check(label('HTTP /me rejects missing and malformed Bearer token'), async () => {
        ensure((await http('/auth/me')).status === 401); ensure((await http('/auth/me', { token: 'malformed' })).status === 401);
      });
      await check(label('HTTP logout 204 deletes session; copied token then returns 401'), async () => {
        ensure((await http('/auth/logout', { method: 'POST', token: loginToken })).status === 204);
        ensure((await http('/auth/me', { token: loginToken })).status === 401);
        ensure((await admin.query('SELECT token_hash FROM mobile_auth_sessions WHERE token_hash=?', [digest(loginToken)])).length === 0);
        ensure((await http('/auth/me', { token: registerToken })).status === 200);
      });
      await check(label('real expired DB session is rejected over HTTP'), async () => {
        await admin.query('UPDATE mobile_auth_sessions SET expires_at=UTC_TIMESTAMP(3)-INTERVAL 1 SECOND WHERE token_hash=?', [digest(registerToken)]);
        ensure((await http('/auth/me', { token: registerToken })).status === 401);
      });
      await check(label('guardian signup is rejected; server-approved guardian overrides requested role'), async () => {
        ensure((await http('/auth/register', { method: 'POST', body: { ...input, email: 'unapproved@example.invalid', requestedRole: 'guardian' } })).status === 403);
        await admin.query('INSERT INTO mobile_auth_accounts (user_id,email,role) VALUES (?,?,?)', [original.user_id, 'guardian@example.invalid', 'guardian']);
        const logged = await http('/auth/login', { method: 'POST', body: { email: 'guardian@example.invalid', password: 'legacy-local-only', role: 'patient' } }); ensure(logged.status === 200);
        ensure((await http('/auth/me', { token: logged.body.accessToken })).body.role === 'guardian');
      });
      await check(label('password change invalidates an existing HTTP session'), async () => {
        const logged = await http('/auth/login', { method: 'POST', body: { email: input.email, password: input.password } }); ensure(logged.status === 200);
        await admin.query('UPDATE Users SET password=? WHERE user_id=?', [await bcrypt.hash('fictional-changed-password', 10), userId]);
        ensure((await http('/auth/me', { token: logged.body.accessToken })).status === 401);
      });
      await check(label('JSON parser rejects malformed body 400 and oversized body 413'), async () => {
        ensure((await http('/auth/login', { method: 'POST', raw: '{broken' })).status === 400);
        ensure((await http('/auth/login', { method: 'POST', body: { value: 'a'.repeat(9000) } })).status === 413);
      });
      await check(label('foreign key restrictions protect referenced synthetic users'), async () => {
        await assert.rejects(admin.query('DELETE FROM Users WHERE user_id=?', [userId]), error => error.code === 'ER_ROW_IS_REFERENCED_2');
      });
      await check(label('reapplying migration fails explicitly and original user remains unchanged'), async () => {
        await assert.rejects(admin.query(statements[0]), error => error.code === 'ER_TABLE_EXISTS_ERROR');
        assert.deepEqual((await admin.query('SELECT * FROM Users WHERE user_id=?', [original.user_id]))[0], original);
        // Rolled-back registration legitimately advances AUTO_INCREMENT. Compare
        // definitions without that counter; all column/index/engine clauses remain.
        const definition = row => row['Create Table'].replace(/\bAUTO_INCREMENT=\d+\b/g, 'AUTO_INCREMENT=<counter>');
        assert.equal(definition((await admin.query('SHOW CREATE TABLE Users'))[0]), definition(ddl));
      });
      await new Promise(resolve => server.close(resolve)); servers.splice(servers.indexOf(server), 1);
      await pool.end(); pools.splice(pools.indexOf(pool), 1);
    }
  } finally {
    for (const server of servers) { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); }
    for (const pool of pools) await pool.end();
    if (admin) {
      if (identityVerified) {
        try { await admin.query('SHUTDOWN'); } catch { /* Expected disconnect is possible on shutdown. */ }
      }
      try { await admin.end(); } catch { /* Server has stopped. */ }
    }
    if (daemon.exitCode === null) {
      await Promise.race([once(daemon, 'exit'), pause(5000)]);
      if (daemon.exitCode === null) { daemon.kill(); await once(daemon, 'exit'); }
    }
    const summary = { ...metadata, passed: results.filter(item => item.status === 'PASS').length, failed: results.filter(item => item.status === 'FAIL').length, cases: results, isolatedServerStopped: daemon.exitCode !== null };
    fs.writeFileSync(path.join(runDir, 'results.json'), JSON.stringify(summary, null, 2));
    console.log(`Results: ${summary.passed} passed, ${summary.failed} failed. Isolated server stopped: ${summary.isolatedServerStopped}.`);
    console.log(`Report: ${path.relative(workspace, path.join(runDir, 'results.json'))}`);
  }
  ensure(results.length === 28 && results.every(item => item.status === 'PASS'), 'Integration checks failed');
}
main().catch(() => { console.error('Local integration run did not complete successfully. No alternate database is used; inspect the sanitized report.'); process.exitCode = 1; });
