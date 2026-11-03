const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const ts=require('typescript');
const {createHarness}=require('./controller-harness.cjs');
function load(){const sandbox={exports:{},URL,AbortController,setTimeout,clearTimeout};vm.runInNewContext(ts.transpileModule(fs.readFileSync('src/services/ragClient.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,sandbox);return sandbox.exports;}
const response=(status=200)=>({ok:status===200,status,json:async()=>({status:'insufficient_evidence',message:'확인된 자료가 부족하여 답변할 수 없습니다',disclaimer:'진단·처방을 대신하지 않습니다',sources:[]})});
test('client sends only question and bearer to configured server',async()=>{
 const {requestRag}=load();let count=0;
 const text=await requestRag('일반 질문',{url:'https://rag.example',development:false,token:async()=>'synthetic-token',transport:async(url,init)=>{count++;assert.equal(url,'https://rag.example/api/rag/chat');assert.equal(init.headers.Authorization,'Bearer synthetic-token');assert.deepEqual(JSON.parse(init.body),{question:'일반 질문'});return response();}});
 assert.equal(count,1);assert.match(text,/확인된 자료가 부족/);
});
test('invalid endpoint and expired session never send token',async()=>{
 const {requestRag}=load();const common={development:false,token:async()=>null,transport:async()=>{throw Error('must not call');}};
 for(const url of ['http://public.example','https://user:pass@rag.example','https://rag.example?key=x'])await assert.rejects(requestRag('질문',{...common,url}),e=>e.code==='CONFIG');
 await assert.rejects(requestRag('질문',{...common,url:'https://rag.example'}),e=>e.code==='UNAUTHORIZED');
});
test('network, timeout, rate limit, auth and server errors are distinct',async()=>{
 const {requestRag}=load();const common={url:'https://rag.example',development:false,token:async()=>'synthetic'};
 for(const [status,code]of [[401,'UNAUTHORIZED'],[403,'UNAUTHORIZED'],[429,'RATE_LIMITED'],[500,'SERVER'],[504,'TIMEOUT']])await assert.rejects(requestRag('질문',{...common,transport:async()=>response(status)}),e=>e.code===code);
 await assert.rejects(requestRag('질문',{...common,transport:async()=>{throw Error('private');}}),e=>e.code==='NETWORK');
 await assert.rejects(requestRag('질문',{...common,timeoutMs:10,transport:async()=>new Promise(()=>{})}),e=>e.code==='TIMEOUT');
});
test('invented/malformed citation is not shown and valid quote is rendered',async()=>{
 const {requestRag}=load();const common={url:'https://rag.example',development:false,token:async()=>'synthetic'};
 const body={status:'local_evidence',message:'자료 인용',disclaimer:'참고용',sources:[]};
 await assert.rejects(requestRag('질문',{...common,transport:async()=>({...response(),json:async()=>body})}),e=>e.code==='SERVER');
 body.sources=[{documentId:'fixture',chunkId:'fixture-1',title:'합성 자료',quote:'테스트 인용문',sourceUrl:'https://example.org/fixture'}];
 assert.match(await requestRag('질문',{...common,transport:async()=>({...response(),json:async()=>body})}),/합성 자료 \[fixture\]/);
});

function mountChat(rag){
 const auth={readToken:async()=>'fictional-session',getCurrentUser:async()=>({id:'fictional-user',name:'Fictional',email:'fictional@example.invalid',role:'patient'}),watchSession:()=>()=>{},clearToken:async()=>{},authErrorMessage:()=> '오류'};
 return createHarness({auth,storage:{getItem:async()=>null,setItem:async()=>{}},rag}).mount();
}
test('controller sends question once and suppresses reply after logout',async()=>{
 let resolve,calls=0;
 const app=mountChat({sendRagChat:async question=>{calls++;assert.equal(question,'일반 질문');return new Promise(r=>{resolve=r;});},ragErrorMessage:()=> '오류'});
 await app.flush();app.state.setChatInput('일반 질문');const pending=app.state.sendChat();
 app.state.setChatInput('두 번째 질문');await app.state.sendChat();assert.equal(calls,1);
 await app.state.signOut();await app.flush();resolve('다른 세션에 보이면 안 되는 합성 응답');await pending;await app.flush();
 assert.ok(!app.state.messages.some(m=>m.text.includes('합성 응답')));app.dispose();
});
test('controller shows safe failure and discards response on unmount',async()=>{
 const app=mountChat({sendRagChat:async()=>{throw Error('private upstream');},ragErrorMessage:()=> '네트워크를 확인해 주세요'});
 await app.flush();app.state.setChatInput('일반 질문');await app.state.sendChat();await app.flush();assert.match(app.state.messages.at(-1).text,/네트워크/);app.dispose();
 let resolve;const other=mountChat({sendRagChat:()=>new Promise(r=>{resolve=r;}),ragErrorMessage:()=> '오류'});
 await other.flush();other.state.setChatInput('일반 질문');const pending=other.state.sendChat();other.dispose();resolve('late');await pending;assert.equal(other.lateUpdates,0);
});
