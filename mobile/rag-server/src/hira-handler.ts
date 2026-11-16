import { ApiError } from './http-api.js';
import { createHiraClient, HiraError, readHiraQuery } from './hira-reference.js';

// Auth, body limit, CORS and per-user/IP quotas belong to createRagServer.
// This bridge cannot alter the clinical chat contract or register evidence.
export function createHiraReferenceHandler(key: string | undefined, transport?: typeof fetch) {
  const client = createHiraClient({ key, transport });
  return async (input: unknown, signal: AbortSignal) => {
    try { return await client(readHiraQuery(input), signal); }
    catch (error) {
      const code = error instanceof HiraError ? error.code : 'PROVIDER';
      const status = code === 'INVALID_INPUT' ? 400 : code === 'LIMITED' ? 429 : code === 'TIMEOUT' ? 504 : 503;
      throw new ApiError(status, `HIRA_${code}`);
    }
  };
}
