// Read-only local diagnostic. Outputs names/booleans only, never values.
const fs = require('node:fs');
const path = require('node:path');
const file = path.resolve(__dirname, '../.env');
const values = {};
if (fs.existsSync(file)) for (const line of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
  const match = line.match(/^\s*(?:export\s+)?([A-Z0-9_]+)\s*=\s*(.*?)\s*$/);
  if (match) values[match[1]] = match[2].replace(/^(['"])(.*)\1$/, '$2');
}
const publicNames = Object.keys(values).filter(key => key.startsWith('EXPO_PUBLIC_'));
const unsafeNames = publicNames.filter(key => /SECRET|PASSWORD|SERVICE_ROLE|OPENAI|KAKAO|TOKEN/.test(key)
  || /^(sk-|sb_secret_)/.test(values[key]));
let urlValid = false, expectedProjectMatches = false;
try {
  const url = new URL(values.EXPO_PUBLIC_SUPABASE_URL);
  urlValid = url.protocol === 'https:' && !url.username && !url.password && !url.search && !url.hash && url.pathname === '/';
  expectedProjectMatches = Boolean(values.EXPO_PUBLIC_EXPECTED_SUPABASE_REF) && url.hostname === `${values.EXPO_PUBLIC_EXPECTED_SUPABASE_REF}.supabase.co`;
} catch { /* Presence/format only. No network. */ }
console.log(JSON.stringify({ envFileExists: fs.existsSync(file), publicVariableNames: publicNames,
  checks: { urlValid, publicKeyFormat: /^sb_publishable_/.test(values.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? ''),
    environmentLabelValid: ['development', 'production'].includes(values.EXPO_PUBLIC_APP_ENV), expectedProjectMatches }, unsafePublicVariableNames: unsafeNames }, null, 2));
process.exitCode = unsafeNames.length ? 1 : 0;
