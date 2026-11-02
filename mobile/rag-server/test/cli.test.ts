import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
const invoke=(args:string[])=>spawnSync(process.execPath,['--import','tsx','src/cli.ts',...args],{encoding:'utf8',env:{...process.env,GEMINI_API_KEY:'',GEMINI_GENERATION_MODEL:''}});
test('CLI indexing without key reports configuration error without network',()=>{
 const r=invoke(['index','--live']);assert.equal(r.status,1);assert.match(r.stderr,/GEMINI_API_KEY_REQUIRED/);
});
test('CLI live ask validates model and consent before spending',()=>{
 const consent=invoke(['ask','일반질문','--live']);assert.equal(consent.status,1);assert.match(consent.stderr,/PUBLIC_NONPERSONAL_QUESTION_REQUIRED/);
 const model=invoke(['ask','일반질문','--live','--public-question']);assert.equal(model.status,1);assert.match(model.stderr,/GEMINI_GENERATION_MODEL_REQUIRED/);
});
test('CLI emergency bypasses missing API configuration',()=>{
 const r=invoke(['ask','숨을 못 쉬겠어요','--live']);assert.equal(r.status,0);assert.equal(JSON.parse(r.stdout).status,'emergency');
});
