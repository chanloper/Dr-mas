import { localChat } from './http-api.js';
import type { Repository } from './repository.js';
export type EvidenceReply = Awaited<ReturnType<typeof localChat>>;
export interface ConsultationRetriever { retrieve(question: string, signal: AbortSignal): Promise<EvidenceReply> }
// In-process adapter for the same retrieval used by /api/rag/chat, without
// generation. No HTTP route or JWT policy changes. Queries are never LLM-written.
export function localConsultationRetriever(repo: Repository): ConsultationRetriever {
  return { async retrieve(question, signal) {
    if (signal.aborted) throw Error('CANCELLED');
    const result = await localChat(repo, question);
    if (signal.aborted) throw Error('CANCELLED');
    return result;
  } };
}
