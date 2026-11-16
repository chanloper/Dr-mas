import { loadEnvFile } from 'node:process';
import { fileURLToPath } from 'node:url';
import { createHiraClient, HiraError, hiraRequest, type HiraQuery } from './hira-reference.js';

// Preflight is the default. A live invocation performs one bounded page, with
// no retries, registration, Gemini use or writes to the RAG repository.
try {
  const [mode, text, ...flags] = process.argv.slice(2);
  if (!text || !['disease-name', 'disease-code', 'hospital-name'].includes(mode ?? '') || flags.some(f => f !== '--live') || flags.length > 1) throw new HiraError('INVALID_INPUT');
  const query: HiraQuery = mode === 'hospital-name' ? { kind: 'hospital', name: text, page: 1, rows: 5 }
    : { kind: 'disease', query: text, by: mode === 'disease-code' ? 'code' : 'name', page: 1, rows: 5 };
  hiraRequest(query);
  try { loadEnvFile(fileURLToPath(new URL('../.env', import.meta.url))); } catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw new HiraError('NOT_CONFIGURED'); }
  if (!flags.includes('--live')) console.log(JSON.stringify({ mode: 'preflight', networkRequests: 0, keyConfigured: !!process.env.DATA_GO_KR_SERVICE_KEY?.trim(), keyValidity: 'not_verified', queryKind: query.kind, clinicalEvidence: false, registration: false }));
  else console.log(JSON.stringify(await createHiraClient({ key: process.env.DATA_GO_KR_SERVICE_KEY })(query), null, 2));
} catch (error) {
  console.error(error instanceof HiraError ? error.code : 'HIRA_OPERATION_FAILED'); process.exitCode = 1;
}
