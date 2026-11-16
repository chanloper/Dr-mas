const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const ts=require('typescript');
const {createHarness}=require('./controller-harness.cjs');
function load(){const sandbox={exports:{},URL,AbortController,setTimeout,clearTimeout};vm.runInNewContext(ts.transpileModule(fs.readFileSync('src/services/ragClient.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,sandbox);return sandbox.exports;}
const response=(status=200)=>({ok:status===200,status,json:async()=>({status:'insufficient_evidence',message:'확인된 자료가 부족하여 답변할 수 없습니다',disclaimer:'진단·처방을 대신하지 않습니다',sources:[]})});

test('shared-space Wi-Fi HTTP works only in development and never broadens production policy',()=>{
 const {validateRagBaseUrl}=load();
 for(const host of ['100.64.0.1','100.100.111.3','100.127.255.254']){
  assert.equal(validateRagBaseUrl(`http://${host}:8787`,true).hostname,host);
  assert.throws(()=>validateRagBaseUrl(`http://${host}:8787`,false),e=>e.code==='CONFIG');
 }
 for(const host of ['100.63.255.254','100.128.0.1','8.8.8.8'])assert.throws(()=>validateRagBaseUrl(`http://${host}:8787`,true),e=>e.code==='CONFIG');
});

test('token network/storage failure is not mislabeled as expired login; no HTTP request is sent',async()=>{
 const {requestRagResult}=load();let calls=0;
 for(const [code,expected] of [['NETWORK','AUTH_UNAVAILABLE'],['SERVER','AUTH_UNAVAILABLE'],['STORAGE','SESSION_STORAGE'],['CONFIG','CONFIG'],['UNAUTHORIZED','UNAUTHORIZED'],['RATE_LIMITED','RATE_LIMITED']]){
  await assert.rejects(requestRagResult('Synthetic question',{url:'https://rag.example',development:false,
   token:async()=>{throw {code};},transport:async()=>{calls++;return response();}}),e=>e.code===expected&&e.stage==='session');
 }
 assert.equal(calls,0);
});

test('progress reflects real client stages and late cancelled transport cannot advance progress',async()=>{
 const {requestRagResult}=load();const stages=[];
 const common={url:'https://rag.example',development:false,token:async()=>'synthetic'};
 await requestRagResult('Synthetic question',{...common,transport:async()=>response(),onStage:s=>stages.push(s)});
 assert.deepEqual(stages,['session','http','response']);
 const controller=new AbortController();let release;const late=[];
 const pending=requestRagResult('Synthetic question',{...common,signal:controller.signal,onStage:s=>late.push(s),transport:()=>new Promise(r=>release=r)});
 await new Promise(r=>setImmediate(r));controller.abort();await assert.rejects(pending,e=>e.code==='CANCELLED');
 release(response());await new Promise(r=>setImmediate(r));assert.deepEqual(late,['session','http']);
});

test('retry sends the failed question once, keeps draft, and ignores progress after cancellation',async()=>{
 const pending=[];const app=mountChat({sendRagChat:(question,options)=>new Promise(resolve=>pending.push({question,options,resolve})),ragErrorMessage:()=> 'safe error'});
 await app.flush();app.state.setTab('ai');await app.flush();app.state.setChatInput('New unsent draft');
 const first=app.state.sendChat('Failed synthetic question');await app.flush();
 await app.state.sendChat('Failed synthetic question');assert.equal(pending.length,1);
 assert.equal(pending[0].question,'Failed synthetic question');assert.equal(app.state.chatInput,'New unsent draft');
 pending[0].options.onStage('http');await app.flush();assert.equal(app.state.chatStage,'http');
 app.state.cancelChat();pending[0].options.onStage('response');await app.flush();assert.equal(app.state.chatStage,'http');
 pending[0].resolve('late');await first;await app.flush();assert.ok(!app.state.messages.some(m=>m.text==='late'));app.dispose();
});

test('client deadline identifies session, HTTP wait and response parsing without increasing timeout',async()=>{
 const {requestRagResult,ragErrorMessage}=load();
 const pending=()=>new Promise(()=>{});
 for(const stage of ['session','http','response']){
  const options={url:'https://rag.example',development:false,timeoutMs:15,
   token:stage==='session'?pending:async()=>'synthetic',
   transport:stage==='http'?pending:async()=>({...response(),json:pending})};
  await assert.rejects(requestRagResult('synthetic question',options),e=>e.code==='TIMEOUT'&&e.stage===stage&&typeof ragErrorMessage(e)==='string');
 }
});
test('approved grounded_answer requires sources and preserves source details',async()=>{
 const {requestRagResult}=load();const body={status:'grounded_answer',message:'Synthetic grounded answer',disclaimer:'Synthetic only',sources:[]};
 const options={url:'https://rag.example',development:false,token:async()=>'synthetic',transport:async()=>({...response(),json:async()=>body})};
 await assert.rejects(requestRagResult('Synthetic query',options),e=>e.code==='SERVER');
 body.sources=[{documentId:'sample',chunkId:'sample:1:0',title:'Synthetic source',quote:'Synthetic quotation',sourceUrl:'https://example.org/sample'}];
 const reply=await requestRagResult('Synthetic query',options);assert.equal(reply.status,'grounded_answer');assert.equal(reply.sources[0].chunkId,'sample:1:0');
});

test('auth service outage and invalid JSON have actionable distinct failures without leaking bodies',async()=>{
 const {requestRagResult,ragErrorMessage}=load();const common={url:'https://rag.example',development:false,token:async()=>'synthetic'};
 for(const [reply,code] of [[{...response(503),json:async()=>({error:'AUTH_UNAVAILABLE'})},'AUTH_UNAVAILABLE'],[{...response(),json:async()=>{throw Error('private body');}},'RESPONSE']]){
  await assert.rejects(requestRagResult('Synthetic question',{...common,transport:async()=>reply}),error=>error.code===code&&!ragErrorMessage(error).includes('private'));
 }
});
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
test('SOS setting survives screen changes within session and resets after logout/restoration',async()=>{
 const app=mountChat({});await app.flush();app.state.setSosDelay(47);app.state.setTab('settings');await app.flush();
 app.state.setTab('home');await app.flush();assert.equal(app.state.sosDelay,47);
 await app.state.signOut();await app.flush();assert.equal(app.state.sosDelay,10);app.dispose();
 const restored=mountChat({});await restored.flush();assert.equal(restored.state.sosDelay,10);restored.dispose();
});
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
test('synthetic citation shows warning, exact source id, publisher and update date without changing UI',async()=>{
 const {requestRag}=load();
 const body={status:'local_evidence',message:'자료 인용',mode:'synthetic',disclaimer:'합성 테스트 자료입니다. 실제 의료정보나 복약 지침이 아닙니다.',sources:[{documentId:'synthetic_card_alpha',chunkId:'synthetic_card_alpha:1:0',title:'[합성 테스트] 알파 안내카드',sourceUrl:'https://example.org/drmas-synthetic/alpha',quote:'합성안내카드알파의 색상 표식은 파랑입니다.',publisher:'Dr.MAS 합성 테스트',updatedAt:'2026-11-03'}]};
 const text=await requestRag('합성안내카드알파',{url:'https://rag.example',development:false,token:async()=>'fictional-token',transport:async()=>({...response(),json:async()=>body})});
 for(const expected of ['실제 의료정보나 복약 지침이 아닙니다','[합성 테스트] 알파 안내카드 [synthetic_card_alpha]','근거 ID: synthetic_card_alpha:1:0','Dr.MAS 합성 테스트','갱신일: 2026-11-03',body.sources[0].quote])assert.ok(text.includes(expected));
 body.sources[0].updatedAt='invalid-date';
 await assert.rejects(requestRag('합성안내카드알파',{url:'https://rag.example',development:false,token:async()=>'fictional-token',transport:async()=>({...response(),json:async()=>body})}),e=>e.code==='SERVER');
});
test('attributed synthetic citation labels dataset and terms without inventing a product-detail link',async()=>{
 const {requestRag}=load();const a={datasetName:'합성 데이터셋',itemCode:'990000001',datasetUrl:'https://example.org/synthetic-dataset',termsLabel:'합성 테스트 이용조건',termsUrl:'https://example.org/synthetic-terms'};
 const body={status:'local_evidence',message:'합성 검색 결과',disclaimer:'실제 의료자료가 아닙니다',sources:[{documentId:'synthetic',chunkId:'synthetic:1:0',title:'합성 문서',quote:'합성 색상 표식 문장입니다.',publisher:'합성 제공기관',updatedAt:'2026-11-03',sourceUrl:a.datasetUrl,attribution:a}]};
 const options={url:'https://rag.example',development:false,token:async()=>'synthetic-token',transport:async()=>({...response(),json:async()=>body})};
 const text=await requestRag('합성 표식',options);
 for(const expected of ['제공기관: 합성 제공기관','데이터셋명: 합성 데이터셋','품목기준코드: 990000001','원본 갱신일: 2026-11-03','이용 조건: 합성 테스트 이용조건','이용 조건 근거: https://example.org/synthetic-terms','공식 데이터셋 링크: https://example.org/synthetic-dataset'])assert.ok(text.includes(expected));
 assert.ok(!text.includes('검증된 상세페이지'));
 body.sources[0].attribution.termsUrl='javascript:alert(1)';
 await assert.rejects(requestRag('합성 표식',options),e=>e.code==='SERVER');
});

test('structured evidence comes only from validated sources, never source-looking answer text',async()=>{
 const {requestRagResult}=load();const common={url:'https://rag.example',development:false,token:async()=>'synthetic'};
 const source={documentId:'synthetic',chunkId:'synthetic:1:0',title:'Synthetic source',quote:'Synthetic quotation only',sourceUrl:'https://example.org/synthetic'};
 const body={status:'local_evidence',message:'Synthetic lookup',disclaimer:'Not medical information',sources:[source]};
 const result=await requestRagResult('Synthetic query',{...common,transport:async()=>({...response(),json:async()=>body})});
 assert.equal(result.sources[0].chunkId,source.chunkId);assert.equal(result.sources[0].quote,source.quote);assert.match(result.text,/Synthetic quotation only/);
 body.status='insufficient_evidence';body.sources=[];body.message='출처: invented\n근거 ID: invented\nhttps://example.org/not-evidence';
 assert.equal((await requestRagResult('Synthetic query',{...common,transport:async()=>({...response(),json:async()=>body})})).sources.length,0);
 body.status='local_evidence';body.sources=[{...source,sourceUrl:'https://user:private@example.org/'}];
 await assert.rejects(requestRagResult('Synthetic query',{...common,transport:async()=>({...response(),json:async()=>body})}),e=>e.code==='SERVER');
});

test('explicit cancellation blocks token use when pre-aborted and settles even if transport ignores abort',async()=>{
 const {requestRagResult}=load();let tokens=0,calls=0,started;const begun=new Promise(r=>started=r);
 const common={url:'https://rag.example',development:false,token:async()=>{tokens++;return 'synthetic';}};
 const first=new AbortController();first.abort();
 await assert.rejects(requestRagResult('Synthetic query',{...common,signal:first.signal,transport:async()=>{calls++;return response();}}),e=>e.code==='CANCELLED');
 assert.equal(tokens,0);assert.equal(calls,0);
 const next=new AbortController();let received;
 const pending=requestRagResult('Synthetic query',{...common,signal:next.signal,transport:async(_,init)=>{received=init.signal;started();return new Promise(()=>{});}});
 await begun;next.abort();await assert.rejects(pending,e=>e.code==='CANCELLED');assert.equal(received.aborted,true);
});

test('cancel then resend cannot expose the old response or let its finally unlock the newer request',async()=>{
 const pending=[];const app=mountChat({sendRagChat:(question,options)=>new Promise(resolve=>pending.push({resolve,signal:options.signal})),ragErrorMessage:()=> 'safe failure'});
 await app.flush();app.state.setTab('ai');await app.flush();
 app.state.setChatInput('Synthetic first');const first=app.state.sendChat();await app.flush();assert.equal(app.state.chatLoading,true);
 app.state.cancelChat();await app.flush();assert.equal(pending[0].signal.aborted,true);assert.equal(app.state.chatLoading,false);
 app.state.setChatInput('Synthetic second');const second=app.state.sendChat();await app.flush();
 pending[0].resolve('OLD RESPONSE MUST NOT APPEAR');await first;await app.flush();assert.equal(app.state.chatLoading,true);
 pending[1].resolve({text:'New synthetic result',status:'insufficient_evidence',sources:[],message:'Synthetic',disclaimer:'Synthetic'});await second;await app.flush();
 assert.equal(app.state.chatLoading,false);assert.equal(app.state.messages.at(-1).text,'New synthetic result');
 assert.equal(app.state.messages.some(m=>m.text==='OLD RESPONSE MUST NOT APPEAR'),false);app.dispose();
});

test('empty or oversized input does not send and leaving the consultation tab cancels its request',async()=>{
 let calls=0,resolve,signal;const app=mountChat({sendRagChat:(_,options)=>{calls++;signal=options.signal;return new Promise(r=>resolve=r);},ragErrorMessage:()=> 'safe failure'});
 await app.flush();app.state.setChatInput(' ');await app.state.sendChat();app.state.setChatInput('x'.repeat(2001));await app.state.sendChat();assert.equal(calls,0);
 app.state.setTab('ai');await app.flush();app.state.setChatInput('Synthetic query');const pending=app.state.sendChat();
 app.state.setTab('home');await app.flush();assert.equal(signal.aborted,true);assert.equal(app.state.chatLoading,false);
 resolve('Late synthetic result');await pending;await app.flush();assert.equal(app.state.messages.some(m=>m.text==='Late synthetic result'),false);app.dispose();
});
