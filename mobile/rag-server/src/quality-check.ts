import { writeFile } from 'node:fs/promises';
import { runQualityEvaluation } from './quality-fixtures.js';
const result=runQualityEvaluation();
console.log(JSON.stringify({mode:result.mode,actualApiCalls:0,scoresAreScripted:true,documents:result.documents,calibrationQueries:result.calibrationQueries,heldoutQueries:result.heldoutQueries,selectedPolicy:result.selectedPolicy,productionPolicyChanged:false,baseline:result.baselineHeldout.metrics,reranked:result.rerankedHeldout.metrics,nearMissReturned:{baseline:result.baselineHeldout.nearMissReturned,reranked:result.rerankedHeldout.nearMissReturned},sourceConsistency:result.rerankedHeldout.sourceConsistency},null,2));
if(process.argv.includes('--write-report'))await writeFile('reports/retrieval-quality.json',JSON.stringify(result,null,2),'utf8');
