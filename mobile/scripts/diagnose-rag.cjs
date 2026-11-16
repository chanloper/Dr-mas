// No credentials, questions, response bodies or env mutations. Connectivity only.
const fs = require('node:fs');
const os = require('node:os');
for (const file of ['.env.local', '.env']) if (fs.existsSync(file)) process.loadEnvFile(file);
async function main() {
  let base;
  try {
    base = new URL(process.env.EXPO_PUBLIC_RAG_API_URL);
    if (!['http:', 'https:'].includes(base.protocol) || base.username || base.password || base.search || base.hash || base.pathname !== '/') throw Error();
  } catch { console.log('RAG_CONFIG_INVALID'); process.exitCode = 1; return; }
  const addresses = Object.values(os.networkInterfaces()).flat().filter(x => x.family === 'IPv4' && !x.internal).map(x => x.address);
  console.log(JSON.stringify({ endpoint: base.origin, localIPv4: addresses, generation: 'Server may return grounded_answer only with configured model and permitted evidence; this probe does not test generation' }));
  if (['localhost', '127.0.0.1', '10.0.2.2'].includes(base.hostname)) console.log('PHYSICAL_ANDROID_REQUIRES_REACHABLE_SERVER_ADDRESS');
  if (/^(192\.168\.|10\.|172\.)/.test(base.hostname) && !addresses.includes(base.hostname)) console.log('VERIFY_SERVER_HOST: configured LAN address differs from this PC; it may be another host');
  const started = Date.now();
  try {
    // Missing Authorization must fail before auth verification or document search.
    const response = await fetch(new URL('/api/rag/chat', base), { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}', redirect: 'error', signal: AbortSignal.timeout(4000) });
    console.log(JSON.stringify({ stage: 'HTTP connectivity', status: response.status, ms: Date.now() - started, authenticatedSearchVerified: false }));
    if (response.status !== 401) process.exitCode = 1;
  } catch (error) {
    console.log(JSON.stringify({ stage: 'HTTP connectivity', error: error.name, code: error.cause?.code ?? null, ms: Date.now() - started }));
    process.exitCode = 1;
  }
}
void main();
