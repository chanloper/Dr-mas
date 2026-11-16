const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');
function load(file, mocks = {}) {
  const module = { exports: {} };
  const code = ts.transpileModule(fs.readFileSync(file, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  vm.runInNewContext(code, { module, exports: module.exports, Date, require: name => {
    if (name in mocks) return mocks[name];
    throw new Error('Unexpected dependency');
  } });
  return module.exports;
}
const heart = load('src/features/wearable/heartRate.ts');
const start = Date.parse('2026-01-01T00:00:00Z'), end = start + 10000;
const record = (offset, origin = heart.SAMSUNG_HEALTH, method = 2) => ({
  metadata: { dataOrigin: origin, recordingMethod: method },
  samples: [{ time: new Date(start + offset).toISOString(), beatsPerMinute: 72 }],
});
assert.equal(heart.latestHeartRate([], start, end), null);
assert.equal(heart.latestHeartRate([record(1, 'other.app'), record(2, heart.SAMSUNG_HEALTH, 3)], start, end), null);
assert.equal(heart.latestHeartRate([record(-1), record(11000)], start, end), null);
assert.equal(heart.latestHeartRate([record(5000), record(1000)], start, end).time, new Date(start + 5000).toISOString());
assert.equal(heart.latestHeartRate([record(1000)], start, end).device, undefined);
(async () => {
  let nativeCalls = 0, reads = 0;
  const platform = { OS: 'web' }, constants = { executionEnvironment: 'bare' };
  const hc = {
    SdkAvailabilityStatus: { SDK_AVAILABLE: 3, SDK_UNAVAILABLE_PROVIDER_UPDATE_REQUIRED: 2 },
    getSdkStatus: async () => { nativeCalls++; return 3; }, initialize: async () => true,
    getGrantedPermissions: async () => [],
    requestPermission: async permissions => { assert.equal(permissions.length, 1); assert.equal(permissions[0].accessType, 'read'); return permissions; },
    readRecords: async (type, options) => {
      reads++; assert.equal(type, 'HeartRate'); assert.equal(options.dataOriginFilter[0], heart.SAMSUNG_HEALTH);
      return { records: [] };
    },
  };
  const service = load('src/features/wearable/healthConnect.ts', {
    'react-native': { Platform: platform }, 'expo-constants': { default: constants, __esModule: true },
    './heartRate': heart, 'react-native-health-connect': hc,
  });
  assert.equal((await service.readSamsungHeartRate(true)).status, 'unsupported');
  platform.OS = 'android'; constants.executionEnvironment = 'storeClient';
  assert.equal((await service.readSamsungHeartRate(true)).status, 'build-required');
  assert.equal(nativeCalls, 0);
  constants.executionEnvironment = 'bare';
  assert.equal((await service.readSamsungHeartRate(false)).status, 'denied'); assert.equal(reads, 0);
  assert.equal((await service.readSamsungHeartRate(true)).status, 'ready'); assert.equal(reads, 1);
  hc.getSdkStatus = async () => { throw Error('sensitive native detail'); };
  assert.equal((await service.readSamsungHeartRate(true)).status, 'error');
  console.log('Health Connect: 10 focused checks PASS (synthetic unit fixtures only)');
})().catch(() => { console.error('Health Connect test FAIL'); process.exitCode = 1; });
