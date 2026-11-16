// Explicit collection pilot; never imported by the running HTTP server.
import { loadEnvFile } from 'node:process';
import { fileURLToPath } from 'node:url';
import { mkdir, mkdtemp, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { kdcaCatalog, readKdcaToken, requireKdcaLiveReady } from './kdca-catalog.js';
import { fetchKdca, kdcaDocument } from './kdca-healthinfo.js';
import { LocalRepository, register } from './repository.js';

async function main() {
  if(process.argv.slice(2).join(' ')!=='--live-5830') throw Error('KDCA_EXPLICIT_PILOT_REQUIRED');
  try{loadEnvFile(fileURLToPath(new URL('../.env',import.meta.url)));}catch(e){if((e as NodeJS.ErrnoException).code!=='ENOENT')throw Error('KDCA_CONFIG_INVALID');}
  // Even an enabled flag is not approval or a resolved secure transport contract.
  // Check before reading the issued TOKEN. No flag/base URL enables live fetch yet.
  requireKdcaLiveReady(process.env);
  const entry=kdcaCatalog.find(c=>c.contentId==='5830')!;
  const token=readKdcaToken(entry,process.env);
  const payload=await fetchKdca(entry,token);
  const document=kdcaDocument(payload,entry,new Date().toISOString());
  const base=fileURLToPath(new URL('../data/',import.meta.url));await mkdir(base,{recursive:true});
  // No output-path option: cannot target or replace data/local.
  const directory=await mkdtemp(join(base,'kdca-pilot-'));
  await writeFile(join(directory,'raw.xml'),payload.rawXml,{encoding:'utf8',flag:'wx'});
  const repo=new LocalRepository(directory);await register(repo,document);
  console.log(JSON.stringify({result:'COLLECTED_REVIEW_PENDING',contentId:payload.contentId,sections:payload.sections.length,documents:1,directory,searchEnabled:false,externalAiEnabled:false}));
}
main().catch(error=>{
  const code=error instanceof Error&&/^KDCA_[A-Z_]+$/.test(error.message)?error.message:'KDCA_PILOT_FAILED';
  console.error(code);process.exitCode=1;
});
