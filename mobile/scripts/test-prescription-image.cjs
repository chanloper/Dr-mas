const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');
const path = require('node:path');
function load(name, globals = {}, modules = {}) {
  const exports = {};
  const code = ts.transpileModule(fs.readFileSync(path.join(__dirname, '../src/services', name + '.ts'), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  vm.runInNewContext(code, { exports, URL, Uint8Array, ...globals, require: key => modules[key] });
  return exports;
}
const policy = load('prescriptionImagePolicy');
const jpeg = [255, 216, 255, 0];
test('size boundaries reject empty, oversized and non-integer images', () => {
  policy.validateImageSize(10 * 1024 * 1024);
  for (const size of [0, -1, 10485761, NaN, 1.5]) assert.throws(() => policy.validateImageSize(size), { code: 'SIZE' });
});
test('actual JPEG PNG WebP headers accepted; disguised files rejected', () => {
  assert.equal(policy.validateImageHeader(new Uint8Array(jpeg)), 'image/jpeg');
  assert.equal(policy.validateImageHeader(new Uint8Array([137,80,78,71,13,10,26,10])), 'image/png');
  assert.equal(policy.validateImageHeader(new Uint8Array([82,73,70,70,0,0,0,0,87,69,66,80])), 'image/webp');
  assert.throws(() => policy.validateImageHeader(new Uint8Array([37,80,68,70]), 'image/jpeg'), { code: 'TYPE' });
  assert.throws(() => policy.validateImageHeader(new Uint8Array(jpeg), 'image/png'), { code: 'TYPE' });
});
test('cleanup ownership excludes originals, traversal and other cache files', () => {
  assert.equal(policy.isPickerCacheFile('file:///cache/ImagePicker/test.jpg', 'file:///cache/'), true);
  for (const uri of ['file:///photos/test.jpg','file:///cache/other.jpg','file:///cache/ImagePicker/../secret','file:///cache/ImagePicker/nested/a.jpg','https://example.com/a']) assert.equal(policy.isPickerCacheFile(uri, 'file:///cache/'), false);
});
function browser() {
  let input, created = 0, revoked = 0;
  const api = load('prescriptionImage.web', {
    document: { createElement: () => (input = { style: {}, remove() {}, click() {} }), body: { appendChild() {} } },
    URL: { createObjectURL: () => { created++; return 'blob:synthetic'; }, revokeObjectURL: () => { revoked++; } },
  }, { './prescriptionImagePolicy': policy });
  return { api, get input() { return input; }, get created() { return created; }, get revoked() { return revoked; } };
}
test('web selected image remains local and release is idempotent', async () => {
  const b = browser(); const promise = b.api.pickPrescriptionImage('album');
  b.input.files = [{ size: 4, type: 'image/jpeg', slice: () => ({ arrayBuffer: async () => new Uint8Array(jpeg).buffer }) }];
  b.input.onchange(); const result = await promise;
  assert.equal(result.uri, 'blob:synthetic'); assert.equal(b.created, 1);
  await result.release(); await result.release(); assert.equal(b.revoked, 1);
});
test('web cancel and explicit abort return no image', async () => {
  const b = browser(); const p = b.api.pickPrescriptionImage('album'); b.input.oncancel(); assert.equal(await p, null);
  const controller = new AbortController(); const p2 = b.api.pickPrescriptionImage('album', controller.signal); controller.abort(); assert.equal(await p2, null); assert.equal(b.created, 0);
});
test('web oversized selection rejected before reading', async () => {
  const b = browser(); const p = b.api.pickPrescriptionImage('album');
  b.input.files = [{ size: 10485761, slice: () => { throw Error('must not read'); } }];
  b.input.onchange(); await assert.rejects(p, { code: 'SIZE' }); assert.equal(b.created, 0);
});
test('web late file read after cancellation creates no preview', async () => {
  const b = browser(); let finish; const controller = new AbortController(); const p = b.api.pickPrescriptionImage('album', controller.signal);
  b.input.files = [{ size: 4, type: 'image/jpeg', slice: () => ({ arrayBuffer: () => new Promise(resolve => { finish = resolve; }) }) }];
  b.input.onchange(); controller.abort(); finish(new Uint8Array(jpeg).buffer);
  assert.equal(await p, null); await Promise.resolve(); assert.equal(b.created, 0);
});
function native({ permission = true, uri = 'file:///cache/ImagePicker/test.jpg', header = jpeg, canceled = false } = {}) {
  let deleted = 0, permissionRequests = 0, closed = 0;
  const picker = {
    requestCameraPermissionsAsync: async () => { permissionRequests++; return { granted: permission }; },
    launchCameraAsync: async () => ({ canceled, assets: [{ uri, mimeType: 'image/jpeg' }] }),
    launchImageLibraryAsync: async () => ({ canceled, assets: [{ uri, mimeType: 'image/jpeg' }] }),
  };
  class File {
    constructor(value) { this.uri = value; this.size = 4; this.exists = true; }
    delete() { deleted++; }
    open() { return { readBytes: async () => new Uint8Array(header), close: () => { closed++; } }; }
  }
  const api = load('prescriptionImage', {}, { './prescriptionImagePolicy': policy, 'expo-image-picker': picker, 'expo-file-system': { File, FileMode: { ReadOnly: 1 }, Paths: { cache: { uri: 'file:///cache/' } } } });
  return { api, get deleted() { return deleted; }, get permissionRequests() { return permissionRequests; }, get closed() { return closed; } };
}
test('native gallery reads header and only releases owned cache', async () => {
  const n = native(); const image = await n.api.pickPrescriptionImage('album');
  assert.equal(n.permissionRequests, 0); assert.equal(n.closed, 1);
  await image.release(); await image.release(); assert.equal(n.deleted, 1);
  const original = native({ uri: 'file:///photos/original.jpg' });
  await (await original.api.pickPrescriptionImage('album')).release(); assert.equal(original.deleted, 0);
});
test('native denied camera permission and canceled picker return safe outcomes', async () => {
  const n = native({ permission: false }); await assert.rejects(n.api.pickPrescriptionImage('camera'), { code: 'PERMISSION' });
  assert.equal(n.permissionRequests, 1); assert.equal(n.deleted, 0);
  assert.equal(await native({ canceled: true }).api.pickPrescriptionImage('album'), null);
});
test('native disguised image rejected with owned temporary file cleanup', async () => {
  const n = native({ header: [37,80,68,70] });
  await assert.rejects(n.api.pickPrescriptionImage('album'), { code: 'TYPE' });
  assert.equal(n.closed, 1); assert.equal(n.deleted, 1);
});
