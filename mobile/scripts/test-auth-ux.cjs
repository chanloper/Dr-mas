// Synthetic accounts and element props only; no native renderer or network.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');
const React = require('react');
const { createHarness } = require('./controller-harness.cjs');
class AuthError extends Error { constructor(code, message = '서비스 이용 정보를 확인해 주세요.') { super(message); this.code = code; } }
const profile = { id: 'fictional-id', name: 'Fictional', email: 'fictional@example.invalid', role: 'patient' };
function fixture(restore = false) {
  let registrations = 0, logins = 0, medicationReads = 0;
  const api = { AuthError, authErrorMessage: e => e instanceof AuthError ? e.message : '연결을 확인해 주세요.',
    readToken: async () => restore ? 'fixture-session' : null, watchSession: () => () => {},
    register: async () => { registrations++; return { accessToken: 'fixture-session' }; },
    login: async () => { logins++; return { accessToken: 'fixture-session' }; },
    getCurrentUser: async () => profile, saveToken: async () => {}, clearToken: async () => {},
  };
  const harness = createHarness({ auth: api, storage: { getItem: async () => { medicationReads++; return null; }, setItem: async () => {} } });
  return { ...harness, api, get registrations() { return registrations; }, get logins() { return logins; }, get medicationReads() { return medicationReads; } };
}
function fill(app, registering = false) {
  app.state.setRoute(registering ? 'register' : 'login'); app.state.setName('Fictional'); app.state.setEmail(profile.email);
  app.state.setPassword('fixture-password'); app.state.setConfirm('fixture-password');
}

test('transient login failure retains inputs in memory; successful retry clears them and still verifies the profile', async () => {
  const f = fixture(), app = f.mount(); await app.flush(); fill(app);
  f.api.login = async () => { throw new AuthError('NETWORK'); };
  app.state.setShowPassword(true); app.state.setShowConfirmPassword(true);
  await app.state.submitAuth(); await app.flush();
  assert.ok(app.state.password.length > 0); assert.equal(app.state.email, profile.email);
  assert.equal(app.state.showPassword, false); assert.equal(app.state.showConfirmPassword, false);
  assert.equal(app.state.user, null); assert.equal(f.medicationReads, 0);
  f.api.login = async () => ({ accessToken: 'fixture-session' });
  await app.state.submitAuth(); await app.flush(); assert.equal(app.state.route, 'dashboard');
  assert.equal(app.state.password, ''); assert.equal(app.state.confirm, ''); app.dispose();
});
test('accepted signup with missing profile switches to login, explains partial completion and blocks repeat signup', async () => {
  const f = fixture(), app = f.mount(); await app.flush(); fill(app, true);
  f.api.getCurrentUser = async () => { throw new AuthError('PROFILE_SCHEMA'); };
  await app.state.submitAuth(); await app.flush();
  assert.equal(f.registrations, 1); assert.equal(app.state.route, 'login'); assert.equal(app.state.signupProcessed, true);
  assert.match(app.state.authNotice, /다시 가입하지/); assert.ok(app.state.authError); assert.equal(app.state.user, null);
  assert.equal(app.state.password, ''); assert.equal(app.state.confirm, ''); assert.equal(f.medicationReads, 0);
  app.state.setRoute('register'); await app.state.submitAuth(); assert.equal(f.registrations, 1); assert.equal(app.state.route, 'login');
  app.state.setPassword('fixture-password'); f.api.getCurrentUser = async () => profile;
  await app.state.submitAuth(); await app.flush(); assert.equal(f.logins, 1); assert.equal(app.state.route, 'dashboard');
  assert.equal(app.state.authNotice, null); assert.equal(app.state.signupProcessed, false); app.dispose();
});
test('rejected signup preserves inputs but confirmation response clears passwords and uses informational status', async () => {
  const f = fixture(), app = f.mount(); await app.flush(); fill(app, true);
  f.api.register = async () => { throw new AuthError('RATE_LIMITED'); };
  await app.state.submitAuth(); await app.flush(); assert.equal(app.state.route, 'register'); assert.ok(app.state.confirm.length > 0);
  assert.equal(app.state.signupProcessed, false);
  f.api.register = async () => ({ requiresEmailConfirmation: true });
  await app.state.submitAuth(); await app.flush(); assert.equal(app.state.route, 'login');
  assert.match(app.state.authNotice, /이메일/); assert.equal(app.state.authError, null); assert.equal(app.state.password, ''); app.dispose();
});
test('pending login keeps form lifecycle initialized and prevents duplicate requests', async () => {
  const f = fixture(), app = f.mount(); await app.flush(); fill(app); let release, calls = 0;
  f.api.login = () => { calls++; return new Promise(resolve => { release = resolve; }); };
  const first = app.state.submitAuth(); await app.flush();
  assert.equal(app.state.authInitialized, true); assert.equal(app.state.authLoading, true);
  await app.state.submitAuth(); assert.equal(calls, 1);
  release({ accessToken: 'fixture-session' }); await first; await app.flush(); assert.equal(app.state.authLoading, false); app.dispose();
});
test('restored session with missing profile remains locked and directs existing account to login', async () => {
  const f = fixture(true); f.api.getCurrentUser = async () => { throw new AuthError('PROFILE_SCHEMA'); };
  const app = f.mount(); await app.flush(); assert.equal(app.state.authInitialized, true);
  assert.equal(app.state.user, null); assert.equal(app.state.signupProcessed, true); assert.match(app.state.authNotice, /다시 가입할 필요/);
  assert.equal(f.medicationReads, 0); app.dispose();
});

function screen(overrides = {}) {
  const source = ts.transpileModule(fs.readFileSync(path.join(__dirname, '../src/screens/AuthScreen.tsx'), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX },
  }).outputText;
  const refs = [], focused = [], stateListeners = []; let submits = 0, dismisses = 0;
  const noop = () => {};
  const context = { route: 'register', role: 'patient', roleLabel: '환자', name: '', email: '', password: '', confirm: '', authLoading: false,
    authNotice: null, authError: null, signupProcessed: false, showPassword: false, showConfirmPassword: false,
    setRoute: noop, setName: noop, setEmail: noop, setPassword: noop, setConfirm: noop, setAuthError: noop, setAuthNotice: noop, signOut: noop,
    submitAuth: () => { submits++; }, ...overrides };
  context.setShowPassword = value => { context.showPassword = typeof value === 'function' ? value(context.showPassword) : value; };
  context.setShowConfirmPassword = value => { context.showConfirmPassword = typeof value === 'function' ? value(context.showConfirmPassword) : value; };
  const sandbox = { exports: {}, require: name => {
    if (name === 'react/jsx-runtime') return require(name);
    if (name === 'react') return { ...React, useRef: () => { const index = refs.length; const ref = { current: { focus: () => focused.push(index) } }; refs.push(ref); return ref; }, useEffect: fn => fn() };
    if (name === 'expo-router') return { Link: 'Link' };
    if (name === 'react-native') return { ...Object.fromEntries(['ActivityIndicator', 'KeyboardAvoidingView', 'Pressable', 'ScrollView', 'Text', 'TextInput', 'View'].map(key => [key, key])), Platform: { OS: 'android' }, Keyboard: { dismiss: () => { dismisses++; } }, AppState: { addEventListener: (_, fn) => { stateListeners.push(fn); return { remove: noop }; } } };
    if (name === '../features/app/context') return { useDrMAS: () => context };
    if (name === '../components/ui') return { Action: 'Action', Chip: 'Chip', Field: 'Field', Panel: 'Panel', C: { blue: 'blue', danger: 'red' }, s: {} };
    throw Error('unexpected UI dependency');
  } };
  vm.runInNewContext(source, sandbox);
  const nodes = [];
  function visit(node) {
    if (Array.isArray(node)) { node.forEach(visit); return; }
    if (!node || typeof node !== 'object') return;
    if (typeof node.type === 'function') { visit(node.type(node.props)); return; }
    nodes.push(node); visit(node.props?.children);
  }
  visit(sandbox.exports.default());
  return { nodes, focused, context, background: () => stateListeners.forEach(fn => fn('background')), get submits() { return submits; }, get dismisses() { return dismisses; } };
}
test('signup fields offer next/done focus flow, autofill and independently labelled password toggles', () => {
  const ui = screen({ showPassword: true }); const fields = ui.nodes.filter(n => n.type === 'Field');
  fields[0].props.onSubmitEditing(); fields[1].props.onSubmitEditing(); fields[2].props.onSubmitEditing();
  assert.deepEqual(ui.focused, [0, 1, 2]); assert.equal(fields[2].props.autoComplete, 'new-password');
  assert.equal(fields[2].props.secureTextEntry, false); assert.equal(fields[3].props.secureTextEntry, true);
  assert.equal(fields[1].props.autoCorrect, false); assert.equal(fields[2].props.autoCapitalize, 'none');
  fields[3].props.onSubmitEditing(); assert.equal(ui.submits, 1); assert.equal(ui.dismisses, 1);
  assert.ok(ui.nodes.some(n => n.props?.accessibilityLabel === '비밀번호 숨기기'));
  assert.ok(ui.nodes.some(n => n.props?.accessibilityLabel === '비밀번호 확인 보기'));
  ui.background(); assert.equal(ui.context.showPassword, false); assert.equal(ui.context.showConfirmPassword, false);
});
test('busy auth disables fields and submit; existing-account status does not offer signup again', () => {
  const ui = screen({ route: 'login', authLoading: true, signupProcessed: true });
  assert.ok(ui.nodes.filter(n => n.type === 'Field').every(n => n.props.editable === false));
  const action = ui.nodes.find(n => n.type === 'Action' && n.props.label === '처리 중…');
  assert.equal(action.props.disabled, true); action.props.onPress(); assert.equal(ui.submits, 0);
  assert.equal(ui.nodes.some(n => n.type === 'Text' && typeof n.props.children === 'string' && n.props.children.includes('회원가입')), false);
  const fields = ui.nodes.filter(n => n.type === 'Field'); assert.equal(fields[1].props.returnKeyType, 'done'); assert.equal(fields[1].props.autoComplete, 'current-password');
  assert.equal(ui.nodes.find(n => n.type === 'KeyboardAvoidingView').props.behavior, 'height');
});
test('user screens no longer contain development/student copy while incomplete-service warnings remain', () => {
  const dir = path.join(__dirname, '../src/screens');
  for (const file of fs.readdirSync(dir).filter(file => file.endsWith('.tsx'))) {
    const source = fs.readFileSync(path.join(dir, file), 'utf8');
    assert.equal(/체험용|시연용|졸업작품|과제|\bMVP\b|\bMAP\b|UI 체험/.test(source), false, file);
  }
  assert.match(fs.readFileSync(path.join(dir, 'AiScreen.tsx'), 'utf8'), /자동 의료 상담이 제공되지 않습니다/);
  assert.match(fs.readFileSync(path.join(dir, 'PatientHome.tsx'), 'utf8'), /119 신고나 보호자 연락은 이루어지지 않습니다/);
});
