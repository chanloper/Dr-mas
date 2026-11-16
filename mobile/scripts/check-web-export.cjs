// Offline artifact audit. Prints counts only, never secrets, hashes or URLs.
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
function files(dir) { return fs.readdirSync(dir, { withFileTypes: true }).flatMap(e => e.isDirectory() ? files(path.join(dir, e.name)) : [path.join(dir, e.name)]); }
const dist = path.join(root, 'dist');
if (!fs.existsSync(path.join(dist, 'index.html'))) { console.error('STATIC_EXPORT_MISSING'); process.exit(1); }
const secrets = new Set();
for (const file of ['.env', '.env.local', 'rag-server/.env']) {
  const absolute = path.join(root, file); if (!fs.existsSync(absolute)) continue;
  for (const line of fs.readFileSync(absolute, 'utf8').split(/\r?\n/)) {
    const match = line.match(/^\s*(?:export\s+)?([A-Z0-9_]+)\s*=\s*(.*?)\s*$/);
    if (!match || !/SERVICE_KEY|API_KEY|SERVICE_ROLE|SECRET|TOKEN|PASSWORD/.test(match[1])) continue;
    const value = match[2].replace(/^(['"])(.*)\1$/, '$2').trim();
    if (value.length >= 12) { secrets.add(value); secrets.add(encodeURIComponent(value)); }
  }
}
const artifacts = files(dist);
let secretMatches = 0;
for (const file of artifacts) {
  const data = fs.readFileSync(file);
  for (const value of secrets) if (data.includes(Buffer.from(value))) secretMatches++;
}
const forbiddenFiles = artifacts.filter(f => /(?:^|[\\/])(?:\.env(?:\..*)?|state\.json|server\.ts)$/.test(f)).length;
const html = artifacts.filter(f => f.endsWith('.html'));
console.log(JSON.stringify({ htmlFiles: html.length, artifacts: artifacts.length, localSecretValueMatches: secretMatches, forbiddenFiles,
  note: 'Known local secrets only; not a complete secret scanner. Public Supabase publishable configuration is expected.' }));
process.exitCode = secretMatches || forbiddenFiles ? 1 : 0;
