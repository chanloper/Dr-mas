const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');
const read = file => fs.readFileSync(path.resolve(__dirname, '../src', file), 'utf8');

test('consultation navigation accepts only a single supported category and defaults safely', () => {
  const exports = {};
  vm.runInNewContext(ts.transpileModule(read('services/placeRoute.ts'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS },
  }).outputText, { exports });
  assert.equal(exports.placeRouteCategory('pharmacy'), 'pharmacy');
  for (const input of ['hospital', undefined, null, ['pharmacy'], 'javascript:alert(1)', { category: 'pharmacy' }]) {
    assert.equal(exports.placeRouteCategory(input), 'hospital');
  }
});

test('consultation links only carry category; navigation does not start location or search', () => {
  const screen = read('screens/AiScreen.tsx');
  assert.match(screen, /params: \{ category: 'hospital' \}/);
  assert.match(screen, /params: \{ category: 'pharmacy' \}/);
  assert.doesNotMatch(screen, /currentPlaceLocation|searchPlaces\(|coordinates:|symptomText:/);
  assert.match(screen, /emergency \? <>[\s\S]*?<EmergencyCallButton/);
  assert.match(read('app/places.tsx'), /PlacesContent key=\{category\} initialCategory=\{category\}/);
  const hook = read('features/places/usePlaceSearch.ts');
  assert.match(hook, /useState<Category>\(initialCategory\)/);
  assert.match(hook, /mode === 'nearby' \?[^\n]*await currentPlaceLocation\(\)/);
});
