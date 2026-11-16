import { localChat, type LocalSearchTiming } from './http-api.js';
import { routeSafety, validateClaims } from './answer.js';
import { SearchIndex, insufficientEvidenceMessage } from './search.js';
import { hasChunkPermission } from './rights.js';
import type { Repository } from './repository.js';

type Generate = (prompt: string, signal: AbortSignal) => Promise<string>;
// Gemini generates a structured, extractive answer. Free prose is deliberately
// excluded: exact supporting quotations are verifiable without inventing support.
export async function groundedChat(repo: Repository, question: string, signal: AbortSignal, generate?: Generate, observeTiming?: (timing: LocalSearchTiming) => void) {
  if (signal.aborted) throw Error('CANCELLED');
  if (routeSafety(question) || !generate) return localChat(repo, question, { observeTiming });
  const state = structuredClone(await repo.read());
  const scopes = ['local_search', 'quotation', 'external_generation'] as const;
  for (const [id, chunk] of Object.entries(state.chunks)) {
    const doc = state.documents[chunk.documentId];
    if (doc?.rights.permission === 'test-only' || !scopes.every(scope => hasChunkPermission(doc, chunk, scope))) {
      delete state.chunks[id]; delete state.vectors[id];
    }
  }
  const hits = new SearchIndex(state).search(question).hits;
  const abstain = { status: 'insufficient_evidence', message: insufficientEvidenceMessage,
    disclaimer: '참고용 일반 정보이며 진단·처방이나 의료진의 판단을 대신하지 않습니다.', mode: 'local' as const, sources: [] };
  if (!hits.length) return abstain;
  const unchanged = async () => {
    const latest = await repo.read();
    return !signal.aborted && hits.every(hit => scopes.every(scope => hasChunkPermission(latest.documents[hit.documentId], latest.chunks[hit.chunkId], scope))
      && latest.documents[hit.documentId]?.contentHash === state.documents[hit.documentId]?.contentHash);
  };
  if (!await unchanged()) return abstain;
  const prompt = JSON.stringify({ task: '질문에 답하는 근거 원문을 선택하여 답변을 구성하세요. 불충분하거나 충돌하면 abstain=true. JSON {abstain,claims:[{chunkId,quote}]}만 출력하세요.',
    question, untrustedEvidence: hits.map(hit => ({ chunkId: hit.chunkId, text: hit.text })) });
  let claims;
  try { claims = validateClaims(await generate(prompt, signal), hits); }
  catch (error) {
    if (error instanceof Error && ['INVALID_CITATION', 'INVALID_MODEL_RESPONSE'].includes(error.message)) return abstain;
    throw error;
  }
  if (!claims.length || !await unchanged()) return abstain;
  // Keep the established 4,000-character message bound after adding the label.
  let length = 0;
  const bounded = claims.filter(claim => { length += claim.quote.length + 2; return length <= 3500; });
  const selected = [...new Map(bounded.map(claim => [claim.chunkId, claim])).values()];
  return { ...abstain, status: 'grounded_answer',
    message: 'Gemini가 질문에 관련된 근거를 선택해 구성한 원문 인용 답변입니다.\n' + bounded.map(claim => claim.quote).join('\n\n'),
    sources: selected.map(claim => {
      const hit = hits.find(hit => hit.chunkId === claim.chunkId)!;
      return { documentId: hit.documentId, chunkId: hit.chunkId, title: hit.title, quote: claim.quote,
        sourceUrl: hit.attribution?.datasetUrl ?? hit.sourceUrl, publisher: hit.publisher, updatedAt: hit.updatedAt,
        ...(hit.attribution ? { attribution: hit.attribution } : {}) };
    }) };
}
