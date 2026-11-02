'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const { createHandlers, errorHandler, createApp } = require('../src/app');
const { ApiError } = require('../src/auth');
const { readConfig } = require('../src/config');
function response() {
  return { statusCode: 200, body: null, status(code) { this.statusCode = code; return this; }, json(body) { this.body = body; return this; }, end() { this.ended = true; } };
}
test('handlers implement the mobile JSON status and authorization contract without a socket', async () => {
  const service = {
    register: async body => { assert.equal(body.requestedRole, 'patient'); return { accessToken: 'opaque' }; },
    login: async () => ({ accessToken: 'opaque' }),
    me: async auth => { assert.equal(auth, 'Bearer token'); return { id: '1', email: 'person@example.invalid', name: 'Name', role: 'patient' }; },
    logout: async auth => { assert.equal(auth, 'Bearer token'); },
  };
  const handlers = createHandlers(service);
  let res = response();
  await handlers.register({ body: { requestedRole: 'patient' } }, res);
  assert.equal(res.statusCode, 201);
  assert.deepEqual(res.body, { accessToken: 'opaque' });
  res = response();
  await handlers.login({ body: {} }, res);
  assert.equal(res.statusCode, 200);
  res = response();
  await handlers.me({ headers: { authorization: 'Bearer token' } }, res);
  assert.equal(res.body.role, 'patient');
  res = response();
  await handlers.logout({ headers: { authorization: 'Bearer token' } }, res);
  assert.equal(res.statusCode, 204);
  assert.equal(res.ended, true);
  // Construction only: no listen(), DB connector, or legacy server is used.
  assert.equal(typeof createApp(service).handle, 'function');
});
test('raw connector errors and secrets never appear in error responses', () => {
  const res = response();
  errorHandler(new Error('SELECT password FROM Users; private-token'), {}, res, () => {});
  assert.equal(res.statusCode, 503);
  assert.equal(JSON.stringify(res.body).includes('private-token'), false);
  const invalid = response();
  errorHandler(new ApiError(409, 'EMAIL_EXISTS', '이미 가입된 이메일입니다.'), {}, invalid, () => {});
  assert.equal(invalid.statusCode, 409);
  assert.equal(invalid.body.code, 'EMAIL_EXISTS');
});
test('configuration requires explicit DB target and never includes values in its errors', () => {
  assert.throws(() => readConfig({}), /DB_HOST/);
  const env = { DB_HOST: 'test.invalid', DB_USER: 'test', DB_PASS: 'not-a-real-secret', DB_NAME: 'isolated' };
  assert.equal(readConfig(env).database.database, 'isolated');
  assert.equal(readConfig(env).database.port, 3306);
  assert.throws(() => readConfig({ ...env, DB_PORT: 'not-a-real-secret' }), error => !error.message.includes('not-a-real-secret') && error.message.includes('DB_PORT'));
});
