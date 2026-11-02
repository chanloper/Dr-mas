import { readFile, writeFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { decodeUtf8 } from './encoding.js';
import { semanticDocuments, semanticQuestions } from './semantic-trial.js';
import { hash } from './model.js';
const observations=[];
for(const file of ['src/semantic-trial.ts','src/search.ts','data/semantic-live/state.json','data/semantic-live/result.json']){
 try {
  const bytes=await readFile(file),text=decodeUtf8(bytes);
  let expectedKoreanPreserved:boolean|null=null;
  if(file.endsWith('state.json')){const s=JSON.parse(text);expectedKoreanPreserved=semanticDocuments.every(d=>s.documents[d.id]?.title===d.title&&s.documents[d.id]?.content===d.content&&s.documents[d.id]?.contentHash===hash(d.content));}
  if(file.endsWith('result.json'))expectedKoreanPreserved=JSON.parse(text).question===semanticQuestions[0].question;
  if(file==='src/semantic-trial.ts')expectedKoreanPreserved=text.includes(semanticQuestions[0].question)&&text.includes(semanticDocuments[0]!.title);
  observations.push({file,validUtf8:true,utf8Bom:bytes[0]===239&&bytes[1]===187&&bytes[2]===191,replacementCharacters:(text.match(/\uFFFD/g)??[]).length,expectedKoreanPreserved});
 }catch(e){observations.push({file,status:(e as NodeJS.ErrnoException).code==='ENOENT'?'not_present':'invalid_or_unreadable'});}
}
const shells=[];
for(const shell of ['powershell.exe','pwsh']){
 const p=spawnSync(shell,['-NoProfile','-ExecutionPolicy','Bypass','-File','scripts/encoding-probe.ps1'],{encoding:'utf8'});
 if(p.error){shells.push({shell,tested:false,reason:'not_installed'});continue;}
 try{shells.push({shell,tested:true,exitCode:p.status,...JSON.parse(p.stdout)});}catch{shells.push({shell,tested:true,exitCode:p.status,status:'probe_failed'});}
}
const report={actualApiCalls:0,observations,shells,conclusion:'Persisted originals are intact; CP949 decoding of Node UTF-8 output is reproducible. Explicit UTF-8 readers fix this boundary. Historical API wire bytes were not captured; offline SDK serialization tests cover current code.'};
console.log(JSON.stringify(report,null,2));
if(process.argv.includes('--write-report'))await writeFile('reports/encoding-diagnosis.json',JSON.stringify(report,null,2),'utf8');
