import { readJsonUtf8, assertTextIntegrity } from './encoding.js';
import { mkdir, writeFile, rename, open, unlink } from 'node:fs/promises';
import { join } from 'node:path';
import { emptyState, hash, splitDocument, validateDocument, type State } from './model.js';
export interface Repository { read(): Promise<State>; transaction<T>(fn:(state:State)=>Promise<T>|T):Promise<T> }
/** One atomic snapshot per transaction. Lock rejects concurrent writers across processes. */
export class LocalRepository implements Repository {
  constructor(public readonly directory: string) {}
  async read():Promise<State> {
    try {
      const state = await readJsonUtf8(join(this.directory,'state.json')) as State;
      if (state.schema !== 1) throw new Error('UNSUPPORTED_SCHEMA');
      for(const d of Object.values(state.documents))validateDocument(d);
      for(const c of Object.values(state.chunks))assertTextIntegrity(c.text);
      return state;
    } catch(e) { if ((e as NodeJS.ErrnoException).code === 'ENOENT') return emptyState(); throw e; }
  }
  async transaction<T>(fn:(state:State)=>Promise<T>|T):Promise<T> {
    await mkdir(this.directory,{recursive:true});
    const lockPath=join(this.directory,'writer.lock');
    const lock=await open(lockPath,'wx').catch(()=>{throw new Error('STORE_BUSY: another writer or stale lock; see README');});
    const temp=join(this.directory,`state.${process.pid}.tmp`);
    try {
      const state=await this.read(); const result=await fn(state);
      await writeFile(temp,JSON.stringify(state),'utf8');
      await rename(temp,join(this.directory,'state.json'));
      return result;
    } finally { await lock.close(); await unlink(lockPath); await unlink(temp).catch(()=>{}); }
  }
}
export async function register(repo:Repository,input:unknown) {
  const d=validateDocument(input); const contentHash=hash(d.content);
  return repo.transaction(state=>{
    const old=state.documents[d.id];
    const duplicate=Object.values(state.documents).find(x=>x.id!==d.id && (x.contentHash===contentHash || x.sourceUrl===d.sourceUrl));
    if (duplicate) return {status:'duplicate',documentId:duplicate.id};
    if (old && old.contentHash===contentHash) {
      state.documents[d.id]={...d,contentHash,version:old.version};
      return {status:'metadata-updated',documentId:d.id};
    }
    const doc={...d,contentHash,version:(old?.version??0)+1};
    for (const [id,c] of Object.entries(state.chunks)) if (c.documentId===d.id) {delete state.chunks[id]; delete state.vectors[id];}
    state.documents[d.id]=doc;
    for (const c of splitDocument(doc)) state.chunks[c.id]=c;
    return {status:old?'updated':'created',documentId:d.id,version:doc.version};
  });
}
export async function removeDocument(repo:Repository,id:string) {
  return repo.transaction(s=>{ const found=!!s.documents[id]; delete s.documents[id]; for(const [key,c] of Object.entries(s.chunks)) if(c.documentId===id){delete s.chunks[key];delete s.vectors[key];} return {deleted:found}; });
}
