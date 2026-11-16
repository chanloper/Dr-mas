import { readToken } from './auth';
import { requestHira, type HiraQuery } from './hiraClient';
export { hiraErrorMessage } from './hiraClient';
export const lookupHira = (query: HiraQuery, signal: AbortSignal) => requestHira(query, {
  url: process.env.EXPO_PUBLIC_RAG_API_URL, development: __DEV__, token: readToken, signal,
});
