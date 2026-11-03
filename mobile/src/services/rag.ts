import { readToken } from './auth';
import { requestRag } from './ragClient';
export { ragErrorMessage } from './ragClient';
export function sendRagChat(question: string) {
  return requestRag(question, {
    url: process.env.EXPO_PUBLIC_RAG_API_URL,
    development: __DEV__, token: readToken,
  });
}
