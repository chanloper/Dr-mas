// Loopback GETs against exported files only; never runs app APIs or sends SOS.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const root = path.resolve(__dirname, '../dist');
test('Vercel static configuration and local exported pages/assets are accessible', async () => {
  const config = JSON.parse(fs.readFileSync(path.resolve(__dirname, '../vercel.json'), 'utf8'));
  assert.equal(config.buildCommand, 'npm run build:web'); assert.equal(config.outputDirectory, 'dist');
  assert.equal(config.cleanUrls, true); assert.equal(config.rewrites, undefined);
  const server = http.createServer((req, res) => {
    const name = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
    let file = path.resolve(root, `.${name === '/' ? '/index.html' : name}`);
    if (!file.startsWith(root + path.sep)) { res.writeHead(404).end(); return; }
    if (!path.extname(file)) file += '.html';
    if (!fs.existsSync(file) || !fs.statSync(file).isFile()) { res.writeHead(404).end(); return; }
    res.setHeader('Content-Type', file.endsWith('.html') ? 'text/html; charset=utf-8' : file.endsWith('.js') ? 'application/javascript' : 'application/octet-stream');
    res.end(fs.readFileSync(file));
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  try {
    const base = `http://127.0.0.1:${server.address().port}`;
    for (const route of ['/', '/account', '/places', '/prescription', '/health', '/fall']) {
      const response = await fetch(base + route); assert.equal(response.status, 200);
      const html = await response.text(); assert.match(html, /<html/);
      const scripts = [...html.matchAll(/<script[^>]+src="([^"]+)"/g)]; assert.ok(scripts.length);
      for (const [, asset] of scripts) { assert.ok(asset.startsWith('/')); assert.equal((await fetch(base + asset)).status, 200); }
    }
    assert.equal((await fetch(base + '/not-a-real-route')).status, 404);
  } finally { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); }
});
