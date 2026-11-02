import { test } from 'node:test';
import assert from 'node:assert/strict';
import { retrievalMetrics, rerankEvidence, sourceMatches } from '../src/retrieval-quality.js';
import { runQualityEvaluation, qualityState, qualityCases, qualityCandidates } from '../src/quality-fixtures.js';
import { answer } from '../src/answer.js';
import { GuardedProvider, defaultLimits } from '../src/gemini.js';
import { fixture, withRepo } from './helpers.js';
import { register } from '../src/repository.js';
test('Precision@K, Recall@K and MRR definitions include missing slots and unknown queries',()=>{
 const m=retrievalMetrics([{ids:['b','a'],relevantDocumentIds:['a','c']},{ids:[],relevantDocumentIds:[]}],2);
 assert.equal(m.precisionAtK,0.25);assert.equal(m.recallAtK,0.5);assert.equal(m.mrrAtK,0.25);assert.equal(m.answerableMrrAtK,0.5);assert.equal(m.abstentionRecall,1);assert.equal(m.abstentionPrecision,1);
});
test('calibration-only selection evaluated on distinct heldout cases, no Gemini calls',()=>{
 const r=runQualityEvaluation();assert.equal(r.actualApiCalls,0);assert.equal(r.scoresAreScripted,true);assert.equal(r.productionPolicyChanged,false);
 assert.equal(r.rerankedHeldout.nearMissReturned,0);assert.ok(r.baselineHeldout.nearMissReturned>0);
 const base=r.baselineHeldout.metrics[1]!,gated=r.rerankedHeldout.metrics[1]!;
 assert.ok(gated.mrrAtK!>base.mrrAtK!);assert.equal(gated.unsupportedAnswerRate,0);assert.equal(gated.abstentionRecall,1);assert.equal(r.rerankedHeldout.sourceConsistency,1);
});
test('source/chunk confusion is excluded before evidence acceptance',()=>{
 const q=qualityCases[0]!,hits=qualityCandidates(q);const target=hits.find(h=>h.documentId==='sleep-light')!;
 const bad={...target,sourceUrl:qualityState.documents.astronomy!.sourceUrl};assert.equal(sourceMatches(bad,qualityState),false);
 const mixed={...target,chunkId:hits.find(h=>h.documentId==='sleep-stats')!.chunkId};assert.equal(sourceMatches(mixed,qualityState),false);
 assert.equal(rerankEvidence([bad,mixed],q.facets,qualityState,{minVector:0.5,minFacetCoverage:1,minSeparation:0}).hits.length,0);
});
test('low-confidence and ambiguous candidates abstain rather than inventing evidence',()=>{
 const q=qualityCases[0]!;
 assert.equal(rerankEvidence(qualityCandidates(q),q.facets,qualityState,{minVector:0.99,minFacetCoverage:1,minSeparation:0}).hits.length,0);
 assert.equal(rerankEvidence(qualityCandidates(q),q.facets,qualityState,{minVector:0.5,minFacetCoverage:1,minSeparation:1}).reason,'ambiguous_evidence');
});
test('uncalibrated vector-only retrieval does not trigger answer generation',async()=>withRepo(async repo=>{
 const d=fixture('public','취침 환경과 수면 안내를 다루는 공개 가상 자료');d.rights.permission='permitted';await register(repo,d);
 const state=await repo.read();const id=Object.keys(state.chunks)[0]!;await repo.transaction(s=>{s.vectors[id]={profile:'gemini-embedding-001:768:retrieval:v1',values:[1,0]};});
 let generated=0;const api=new GuardedProvider(repo,{embed:async()=>[1,0],select:async()=>{generated++;return ''; }},{...defaultLimits,intervalMs:0});
 const result=await answer(repo,'잠들기가 힘들어요',{api,publicQuestion:true});assert.equal(result.status,'insufficient_evidence');assert.equal(result.reason,'uncalibrated_vector_only_evidence');assert.equal(generated,0);
}));
