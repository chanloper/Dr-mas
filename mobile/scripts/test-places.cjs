// Only synthetic results, in-memory permissions, and injected fetch. No sockets.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');
const root = path.resolve(__dirname, '../..');

test('browser network failures mention possible web origin configuration without claiming certainty or leaking data', async()=>{
 const client=loader({}, {window:{}})('mobile/src/services/placesClient.ts');
 await assert.rejects(client.createPlaceClient('https://dev-ref.supabase.co/functions/v1/search-places',async()=>{throw new TypeError('private fetch failure');})({category:'hospital',mode:'keyword',query:'합성 검색',page:1}),error=>error.code==='WEB_NETWORK'&&error.message.includes('접근 허용')&&!error.message.includes('private'));
});
function loader(overrides = {}, globals = {}) {
  const cache = new Map();
  function load(relative) {
    const file = path.resolve(root, relative); if (cache.has(file)) return cache.get(file);
    const exports = {}; cache.set(file, exports);
    const source = ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
    const context = { exports, URL, Request, Response, Headers, AbortController, TextEncoder, TextDecoder, Uint8Array, Date, setTimeout, clearTimeout,
      fetch: () => { throw Error('live fetch forbidden'); },
      process: { env: {} }, ...globals,
      require: name => {
        if (Object.hasOwn(overrides, name)) return overrides[name];
        if (name.startsWith('.')) { const resolved = path.resolve(path.dirname(file), name); return load(resolved.endsWith('.ts') ? resolved : `${resolved}.ts`); }
        throw Error(`unexpected dependency: ${name}`);
      },
    };
    vm.runInNewContext(source, context, { filename: file }); return exports;
  }
  return load;
}
const contract = loader()('mobile/src/services/placeContract.ts');
const query = { category: 'hospital', mode: 'keyword', query: '가상지역', page: 1 };
const doc = { id: '999901', place_name: '가상의료기관', category_name: '의료 > 병원', category_group_code: 'HP8', address_name: '가상주소', road_address_name: '', phone: '', distance: '', place_url: 'http://place.map.kakao.com/999901' };
const provider = (documents = [doc]) => ({ meta: { is_end: true }, documents });
const json = (data, status = 200) => new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json' } });
const endpoint = 'https://fixture.supabase.co/functions/v1/search-places';
test('institution phone links accept only valid provided numbers and never open automatically', async () => {
  const phone = loader()('mobile/src/services/placePhone.ts'); let calls = 0;
  assert.equal(phone.placePhoneUrl('02-1234-5678'), 'tel:0212345678');
  for (const value of ['', '119', 'tel:119', 'javascript:alert(1)', '02-1234;ext=5', '0'.repeat(31)]) assert.equal(phone.placePhoneUrl(value), null);
  assert.equal(await phone.requestPlaceDialer('', async () => { calls++; }), false); assert.equal(calls, 0);
  assert.equal(await phone.requestPlaceDialer('02-1234-5678', async url => { assert.equal(url, 'tel:0212345678'); calls++; }), true); assert.equal(calls, 1);
  assert.equal(await phone.requestPlaceDialer('02-1234-5678', async () => { throw Error('unsupported'); }), false);
});
function edgeFixture(settings = {}) {
  const calls = [], diagnostics = [], env = { SEARCH_PUBLIC_ENABLED: 'true', KAKAO_REST_API_KEY: 'fixture-only', UPSTASH_REDIS_REST_URL: 'https://fixture.upstash.io', UPSTASH_REDIS_REST_TOKEN: 'fixture-only', SEARCH_ALLOWED_ORIGINS: 'https://web.invalid', ...settings.env };
  const { createHandler } = loader()('supabase/functions/search-places/handler.ts');
  const handler = createHandler({ env: key => env[key], diagnose: event => diagnostics.push(event), now: () => Date.UTC(2026, 10, 1), fetch: async (url, init) => {
    calls.push({ url: String(url), init });
    if (String(url).includes('upstash.io')) { if (settings.redisThrow) throw Error('fixture secret must not escape'); return settings.redisRaw ? new Response(settings.redisRaw, { status: settings.redisStatus ?? 200 }) : json(settings.redis ?? { result: 1 }, settings.redisStatus ?? 200); }
    if (settings.kakaoThrow) throw Error('fixture secret must not escape');
    return json(settings.provider ?? provider(), settings.kakaoStatus ?? 200);
  } });
  const request = (body = query, headers = {}, method = 'POST') => new Request(endpoint, { method, headers: { 'Content-Type': 'application/json', ...headers }, ...(method === 'POST' ? { body: typeof body === 'string' ? body : JSON.stringify(body) } : {}) });
  return { handler, request, calls, diagnostics };
}

test('public mobile and Edge contracts stay byte-identical without cross-root Metro imports', () => {
  assert.equal(fs.readFileSync(path.join(root, 'mobile/src/services/placeContract.ts'), 'utf8'), fs.readFileSync(path.join(root, 'supabase/functions/_shared/placeContract.ts'), 'utf8'));
});
test('Kakao conversion preserves missing fields, ignores coordinate-less distance, and upgrades detail HTTPS', () => {
  const result = contract.normalizeKakao(provider([{ ...doc, distance: '42' }]), query);
  assert.equal(result.places[0].distanceMeters, null); assert.equal(result.places[0].phone, '');
  assert.equal(result.places[0].detailUrl, 'https://place.map.kakao.com/999901');
  assert.equal(contract.normalizeKakao(provider([{ ...doc, distance: '0' }]), { ...query, coordinates: { latitude: 0, longitude: 0 } }).places[0].distanceMeters, 0);
});
test('empty results remain empty and invalid provider categories/URLs are rejected', () => {
  assert.equal(contract.normalizeKakao(provider([]), query).places.length, 0);
  for (const value of ['javascript:alert(1)', 'https://place.map.kakao.com.evil.invalid/1', 'https://user@place.map.kakao.com/1', 'https://place.map.kakao.com/1?secret=x']) assert.throws(() => contract.safeDetailUrl(value));
  assert.throws(() => contract.normalizeKakao(provider([{ ...doc, category_group_code: 'FD6' }]), query));
});
test('invalid input, NaN coordinates, oversized query/page and arbitrary URLs cannot become proxy parameters', () => {
  for (const value of [{ ...query, query: '' }, { ...query, query: 'x'.repeat(81) }, { ...query, page: 4 }, { ...query, category: 'food' }, { ...query, coordinates: { latitude: NaN, longitude: 1 } }, { ...query, url: 'https://other.invalid' }, { ...query, mode: 'nearby', query: '' }]) assert.throws(() => contract.validateQuery(value));
});
test('public gate defaults closed and key/limiter configuration failure never calls Kakao', async () => {
  for (const [env, code] of [[{ SEARCH_PUBLIC_ENABLED: undefined }, 'PUBLIC_DISABLED'], [{ KAKAO_REST_API_KEY: '' }, 'KAKAO_NOT_CONFIGURED'], [{ UPSTASH_REDIS_REST_TOKEN: '' }, 'NOT_CONFIGURED'], [{ UPSTASH_REDIS_REST_URL: 'http://localhost' }, 'NOT_CONFIGURED'], [{ SEARCH_MAX_PER_DAY: '1001' }, 'NOT_CONFIGURED']]) {
    const f = edgeFixture({ env }); const response = await f.handler(f.request()); assert.equal(response.status, 503); assert.equal((await response.json()).code, code); assert.equal(f.calls.length, 0);
  }
});
test('Origin allowlist is exact; preflight has no wildcard; hostile origins never invoke providers', async () => {
  const f = edgeFixture(); const blocked = await f.handler(f.request(query, { Origin: 'https://web.invalid.evil.invalid' }));
  assert.equal(blocked.status, 403); assert.equal(f.calls.length, 0);
  const response = await f.handler(f.request(query, { Origin: 'https://web.invalid' }, 'OPTIONS'));
  assert.equal(response.status, 204); assert.equal(response.headers.get('access-control-allow-origin'), 'https://web.invalid');
  assert.equal(f.calls.length, 0);
});
test('invalid JSON, oversized streamed body, methods and input are rejected before quota or Kakao', async () => {
  const f = edgeFixture();
  for (const [body, status] of [['{', 400], ['x'.repeat(2049), 413], [{ ...query, page: 4 }, 400]]) assert.equal((await f.handler(f.request(body))).status, status);
  assert.equal((await f.handler(f.request(query, {}, 'GET'))).status, 405); assert.equal(f.calls.length, 0);
});
test('nearby category request fixes category/radius/size and maps x=longitude, y=latitude', async () => {
  const f = edgeFixture(); const response = await f.handler(f.request({ category: 'hospital', mode: 'nearby', query: '', coordinates: { latitude: 1, longitude: 2 }, page: 1 }));
  assert.equal(response.status, 200); assert.equal(f.calls.length, 2);
  const url = new URL(f.calls[1].url); assert.equal(url.pathname, '/v2/local/search/category.json');
  for (const [key, value] of Object.entries({ x: '2', y: '1', radius: '3000', size: '15', sort: 'distance', category_group_code: 'HP8' })) assert.equal(url.searchParams.get(key), value);
  const command = JSON.parse(f.calls[0].init.body); assert.equal(command[0], 'EVAL'); assert.equal(command[2], '3');
  assert.deepEqual(command.slice(6, 9), ['30', '500', '5000']);
  assert.equal((await response.text()).includes('fixture-only'), false);
});
test('Edge response maps Kakao x/y to latitude/longitude and omits invalid or missing coordinates', async () => {
  const documents = [
    { ...doc, x: '126.978', y: '37.5665' },
    { ...doc, id: '999902', place_url: 'https://place.map.kakao.com/999902', x: '181', y: '37.5665' },
    { ...doc, id: '999903', place_url: 'https://place.map.kakao.com/999903' },
  ];
  const f = edgeFixture({ provider: provider(documents) });
  const response = await f.handler(f.request(query));
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.deepEqual(body.places[0].coordinates, { latitude: 37.5665, longitude: 126.978 });
  assert.equal(Object.hasOwn(body.places[1], 'coordinates'), false);
  assert.equal(Object.hasOwn(body.places[2], 'coordinates'), false);
});
test('pharmacy keyword search filters PM9 without requiring coordinates or sending radius', async () => {
  const f = edgeFixture({ provider: provider([{ ...doc, category_group_code: 'PM9' }]) });
  const response = await f.handler(f.request({ ...query, category: 'pharmacy' })); assert.equal(response.status, 200);
  const url = new URL(f.calls[1].url); assert.equal(url.pathname, '/v2/local/search/keyword.json');
  assert.equal(url.searchParams.get('category_group_code'), 'PM9'); assert.equal(url.searchParams.has('radius'), false);
});
test('shared quota exhaustion and unavailable/malformed limiter fail closed before provider access', async () => {
  for (const settings of [{ redis: { result: 0 } }, { redisThrow: true }, { redis: { result: '1' } }, { redis: { error: 'fixture error' } }]) {
    const f = edgeFixture(settings), response = await f.handler(f.request()); assert.equal(response.status, settings.redis?.result === 0 ? 429 : 503);
    assert.equal(f.calls.length, 1); assert.equal((await response.text()).includes('fixture secret'), false);
  }
});
test('limiter failures produce fixed safe diagnostic categories and never invoke Kakao', async () => {
  const cases = [
    [{ redisThrow: true }, 'NETWORK', null],
    [{ redisStatus: 401, redis: { error: 'WRONGPASS private-token' } }, 'AUTH', 401],
    [{ redisStatus: 403, redis: { error: 'NOPERM private-key' } }, 'ACL', 403],
    [{ redisStatus: 400, redis: { error: 'ERR wrong number of arguments for EVAL private-script' } }, 'EVAL_ARGUMENTS', 400],
    [{ redisStatus: 400, redis: { error: 'WRONGTYPE private-key' } }, 'SCRIPT_OR_DATA', 400],
    [{ redisStatus: 429 }, 'PROVIDER_LIMIT', 429],
    [{ redisStatus: 500, redisRaw: 'private-upstream-html' }, 'HTTP_ERROR', 500],
    [{ redisRaw: 'private-invalid-json' }, 'INVALID_RESPONSE', 200],
    [{ redis: { result: '1' } }, 'INVALID_RESPONSE', 200],
  ];
  for (const [settings, code, status] of cases) {
    const f = edgeFixture(settings); const response = await f.handler(f.request());
    assert.equal(response.status, 503); assert.equal((await response.json()).code, 'LIMITER_UNAVAILABLE'); assert.equal(f.calls.length, 1);
    assert.equal(f.diagnostics.length, 1); assert.equal(f.diagnostics[0].code, code); assert.equal(f.diagnostics[0].httpStatus, status);
    assert.equal(Object.keys(f.diagnostics[0]).sort().join(','), 'code,event,httpStatus');
    assert.equal(JSON.stringify(f.diagnostics).includes('private'), false);
  }
});
test('REST EVAL uses flat Redis wire arguments and preserves fail-closed quota behavior', async () => {
  const f = edgeFixture(); assert.equal((await f.handler(f.request())).status, 200);
  const init = f.calls[0].init, command = JSON.parse(init.body);
  assert.equal(init.method, 'POST'); assert.equal(init.redirect, 'error'); assert.equal(init.headers.Authorization, 'Bearer fixture-only');
  assert.equal(command.length, 12); assert.equal(command[0], 'EVAL'); assert.equal(command[2], '3');
  assert.equal(command.slice(3, 6).every(x => typeof x === 'string' && x.startsWith('drmas:places:')), true);
  assert.deepEqual(command.slice(6), ['30', '500', '5000', '120', '172800', '3456000']);
  assert.equal(f.diagnostics.length, 0);
  const denied = edgeFixture({ redis: { result: 0 } }); assert.equal((await denied.handler(denied.request())).status, 429); assert.equal(denied.calls.length, 1);
});
test('provider key rejection, quota and network failures expose only fixed error codes', async () => {
  for (const [settings, code] of [[{ kakaoStatus: 401 }, 'KAKAO_KEY_REJECTED'], [{ kakaoStatus: 429 }, 'PROVIDER_LIMITED'], [{ kakaoThrow: true }, 'UPSTREAM_UNAVAILABLE'], [{ provider: { bad: true } }, 'UPSTREAM_UNAVAILABLE']]) {
    const f = edgeFixture(settings), response = await f.handler(f.request()); assert.equal((await response.json()).code, code);
  }
});
test('client has no auth dependency, validates endpoint, and maps empty/known errors without fabricated places', async () => {
  const { createPlaceClient } = loader()('mobile/src/services/placesClient.ts'); let calls = 0;
  const fetcher = async (_, init) => { calls++; assert.equal(init.headers.Authorization, undefined); assert.equal(JSON.parse(init.body).query, query.query); return json({ places: [], isEnd: true }); };
  for (const url of [undefined, 'http://fixture.supabase.co/functions/v1/search-places', 'https://fixture.supabase.co/functions/v1/other']) await assert.rejects(createPlaceClient(url, fetcher)(query), e => e.code === 'CONFIG');
  assert.equal(calls, 0); assert.equal((await createPlaceClient(endpoint, fetcher)(query)).places.length, 0);
  await assert.rejects(createPlaceClient(endpoint, async () => json({ code: 'KAKAO_NOT_CONFIGURED' }, 503))(query), e => e.code === 'KAKAO_NOT_CONFIGURED');
  await assert.rejects(createPlaceClient(endpoint, async () => json({ code: 'raw secret message' }, 500))(query), e => !e.message.includes('raw secret'));
});
test('client handles offline, invalid responses and cancellation safely', async () => {
  const { createPlaceClient } = loader()('mobile/src/services/placesClient.ts');
  await assert.rejects(createPlaceClient(endpoint, async () => { throw Error('raw private data'); })(query), e => e.code === 'NETWORK' && !e.message.includes('private'));
  await assert.rejects(createPlaceClient(endpoint, async () => json({ places: [{}], isEnd: true }))(query), e => e.code === 'INVALID_RESPONSE');
  const signal = new AbortController(); signal.abort();
  await assert.rejects(createPlaceClient(endpoint, async (_, init) => { assert.equal(init.signal.aborted, true); throw Error('aborted'); })(query, signal.signal), e => e.code === 'NETWORK');
});
test('foreground permission denied needs no position call; successful location uses balanced foreground only', async () => {
  let permission = 'denied', positionCalls = 0;
  const location = loader({ 'expo-location': { requestForegroundPermissionsAsync: async () => ({ status: permission }), hasServicesEnabledAsync: async () => true, Accuracy: { Balanced: 3 }, getCurrentPositionAsync: async opts => { positionCalls++; assert.equal(opts.accuracy, 3); return { coords: { latitude: 1, longitude: 2 } }; } } })('mobile/src/services/placeLocation.ts');
  await assert.rejects(location.currentPlaceLocation(), e => e.code === 'DENIED'); assert.equal(positionCalls, 0);
  permission = 'granted'; assert.equal((await location.currentPlaceLocation()).longitude, 2); assert.equal(positionCalls, 1);
});

test('web location requests are explicit, tolerate missing Permissions API, and distinguish denied/insecure/timeout', async () => {
  let calls = 0, failure = null;
  const window = { isSecureContext: true };
  const navigator = { geolocation: { getCurrentPosition(ok, fail, options) {
    calls++; assert.equal(options.timeout, 12000);
    if (failure) fail(failure); else ok({ coords: { latitude: 1, longitude: 2 } });
  } } };
  const api = loader({}, { window, navigator })('mobile/src/services/placeLocation.web.ts');
  assert.equal(calls, 0); assert.equal((await api.currentPlaceLocation()).longitude, 2);
  failure = { code: 1 }; await assert.rejects(api.currentPlaceLocation(), e => e.code === 'DENIED');
  failure = { code: 3 }; await assert.rejects(api.currentPlaceLocation(), e => e.code === 'UNAVAILABLE');
  window.isSecureContext = false; const count = calls;
  await assert.rejects(api.currentPlaceLocation(), e => e.code === 'INSECURE'); assert.equal(calls, count);
});

test('unconfigured or invalid public search endpoints fail locally without any fetch', async () => {
  const { createPlaceClient, validatePlaceEndpoint } = loader()('mobile/src/services/placesClient.ts');
  assert.equal(validatePlaceEndpoint(endpoint), endpoint);
  let calls = 0;
  for (const value of [undefined, 'http://fixture.supabase.co/functions/v1/search-places', 'https://evil.invalid/functions/v1/search-places']) {
    await assert.rejects(createPlaceClient(value, async () => { calls++; })(query), e => e.code === 'CONFIG');
  }
  assert.equal(calls, 0);
});

test('configured search endpoint cannot cross projects and missing deployments have a safe status', async () => {
  const { createPlaceClient, validatePlaceEndpoint } = loader()('mobile/src/services/placesClient.ts');
  assert.equal(validatePlaceEndpoint(endpoint, 'https://fixture.supabase.co'), endpoint);
  assert.throws(() => validatePlaceEndpoint(endpoint, 'https://other.supabase.co'), e => e.code === 'CONFIG');
  assert.throws(() => validatePlaceEndpoint(endpoint, 'http://fixture.supabase.co'), e => e.code === 'CONFIG');
  await assert.rejects(createPlaceClient(endpoint, async () => new Response('private gateway body', { status: 404 }))(query), e => e.code === 'FUNCTION_NOT_DEPLOYED' && !e.message.includes('private'));
});

function mountSearch({ location, search, initialCategory }) {
  const slots = [], effects = []; let cursor = 0, dirty = true, current, disposed = false, late = 0;
  const hooks = {
    useState(initial) { const i = cursor++; if (!(i in slots)) slots[i] = initial; return [slots[i], value => { if (disposed) { late++; return; } const next = typeof value === 'function' ? value(slots[i]) : value; if (!Object.is(next, slots[i])) { slots[i] = next; dirty = true; } }]; },
    useRef(initial) { const i = cursor++; if (!(i in slots)) slots[i] = { current: initial }; return slots[i]; },
    useEffect(effect, deps) { const i = cursor++, old = slots[i]; if (!old || deps.some((v, n) => !Object.is(v, old.deps[n]))) effects.push(() => { old?.cleanup?.(); slots[i] = { deps, cleanup: effect() }; }); },
  };
  class LocationError extends Error { constructor() { super('위치 권한 거부'); } }
  const hook = loader({ react: hooks, '../../services/places': { searchPlaces: search }, '../../services/placeLocation': { currentPlaceLocation: location, PlaceLocationError: LocationError } })('mobile/src/features/places/usePlaceSearch.ts');
  function render() { let count = 0; while (dirty && !disposed) { assert.ok(count++ < 30); dirty = false; cursor = 0; current = hook.usePlaceSearch(initialCategory); while (effects.length) effects.shift()(); } }
  render();
  return { get state() { render(); return current; }, get late() { return late; }, LocationError,
    async flush() { for (let i = 0; i < 5; i++) { render(); await new Promise(resolve => setImmediate(resolve)); } },
    dispose() { disposed = true; for (const s of slots) s?.cleanup?.(); },
  };
}
const defer = () => { let resolve; const promise = new Promise(done => { resolve = done; }); return { promise, resolve }; };

test('consultation pharmacy entry selects pharmacy without starting location or network until explicit search', async () => {
  let locations=0;const queries=[];
  const app=mountSearch({initialCategory:'pharmacy',location:async()=>{locations++;return {latitude:1,longitude:2};},
    search:async query=>{queries.push(query);return {places:[],isEnd:true};}});
  assert.equal(app.state.category,'pharmacy');assert.equal(locations,0);assert.equal(queries.length,0);
  app.state.changeKeyword('가상지역');await app.state.run('keyword');
  assert.equal(locations,0);assert.equal(queries[0].category,'pharmacy');assert.equal(queries[0].coordinates,undefined);
  await app.state.run('nearby');assert.equal(locations,1);assert.equal(queries[1].category,'pharmacy');
  app.dispose();
});
test('permission denial still permits a subsequent keyword search without requesting location', async () => {
  let calls = 0, locationCalls = 0; let app;
  app = mountSearch({ location: async () => { locationCalls++; throw new app.LocationError(); }, search: async input => { calls++; assert.equal(input.mode, 'keyword'); assert.equal(input.coordinates, undefined); return { places: [], isEnd: true }; } });
  await app.state.run('nearby'); assert.match(app.state.error, /위치/);
  app.state.changeKeyword('가상지역'); await app.state.run('keyword'); assert.equal(app.state.searched, true); assert.equal(calls, 1); assert.equal(locationCalls, 1); app.dispose();
});
test('category change cancels late results, and page retries use the successful snapshot', async () => {
  const pending = defer(); let count = 0; const pages = [];
  const app = mountSearch({ location: async () => ({ latitude: 1, longitude: 2 }), search: async input => { pages.push(input.page); if (++count === 1) return pending.promise; if (count === 3) throw Error('fixture page failure'); return { places: [], isEnd: input.page >= 2 }; } });
  app.state.changeKeyword('가상지역'); const old = app.state.run('keyword'); app.state.chooseCategory('pharmacy');
  pending.resolve({ places: [{ id: 'old' }], isEnd: false }); await old; assert.equal(app.state.places.length, 0); assert.equal(app.state.searched, false);
  await app.state.run('keyword'); await app.state.run('more'); assert.ok(app.state.error);
  await app.state.run('more'); assert.deepEqual(pages, [1, 1, 2, 2]); assert.equal(app.state.error, null); app.dispose();
});
test('unmount during location request never calls search or updates state after location completes', async () => {
  const pending = defer(); let calls = 0;
  const app = mountSearch({ location: () => pending.promise, search: async () => { calls++; return { places: [], isEnd: true }; } });
  const task = app.state.run('nearby'); app.dispose(); pending.resolve({ latitude: 1, longitude: 2 }); await task;
  assert.equal(calls, 0); assert.equal(app.late, 0);
});
test('new public route and entry links do not bypass or mutate the authentication controller', () => {
  const route = fs.readFileSync(path.join(root, 'mobile/src/app/places.tsx'), 'utf8');
  assert.equal(/useDrMAS|services\/auth|services\/supabase/.test(route), false);
  for (const screen of ['WelcomeScreen', 'AuthScreen', 'ServicesScreen']) assert.match(fs.readFileSync(path.join(root, `mobile/src/screens/${screen}.tsx`), 'utf8'), /\/places/);
  const appShell = fs.readFileSync(path.join(root, 'mobile/src/app/index.tsx'), 'utf8');
  assert.match(appShell, /patientHomeTabs/); assert.match(appShell, /key === 'places'\) \{ router\.push\('\/places'\); return; \}/);
  assert.match(fs.readFileSync(path.join(root, 'supabase/functions/search-places/.env.example'), 'utf8'), /SEARCH_PUBLIC_ENABLED=false/);
});
test('Expo manifest exports the public endpoint but never Kakao or Redis server secrets', () => {
  const source = ts.transpileModule(fs.readFileSync(path.join(root, 'mobile/app.config.ts'), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText;
  const sandbox = { exports: {}, process: { env: { EXPO_PUBLIC_PLACES_FUNCTION_URL: endpoint, KAKAO_REST_API_KEY: 'fixture-server-secret', UPSTASH_REDIS_REST_TOKEN: 'fixture-server-secret' } } };
  vm.runInNewContext(source, sandbox);
  const config = sandbox.exports.default({ config: { name: 'mobile', slug: 'mobile' } });
  assert.equal(config.extra.placesFunctionUrl, endpoint); assert.equal(JSON.stringify(config).includes('fixture-server-secret'), false);
});
