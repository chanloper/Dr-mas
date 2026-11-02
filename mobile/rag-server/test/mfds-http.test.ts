import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { LocalRepository } from '../src/repository.js';
import { createPilotHttpAdapter, safeMfdsCode } from '../src/ingestion/http.js';
import { pilotPreflight, runPilot, verifyPilot } from '../src/ingestion/pilot.js';
import { parseEasy } from '../src/ingestion/mfds.js';

const key='synthetic+/=key-ONLY';
const env={DATA_GO_KR_SERVICE_KEY:key};
const input={
  itemSeq:'999000001',itemName:'합성 검증약 (시험 전용)',entpName:'가상 제약사',
  efcyQesitm:'<script>syntheticUnsafeMarkup()</script><p>합성 효능 안내 &amp; 검증.</p>',
  useMethodQesitm:'<p>합성 사용법.</p><p>원문 문장을 보존합니다.</p>',
  atpnWarnQesitm:'<div>경고: &#xD569;&#49457; 정보입니다.</div>',
  atpnQesitm:'<p>주의사항: A &lt; B이며 &quot;시험&quot;입니다.</p>',
  intrcQesitm:'<p>상호작용 정보: 가상 항목.</p>',seQesitm:'<p>가상 부작용 안내.</p>',
  depositMethodQesitm:'<p>합성 보관 안내&nbsp;문장.</p>',openDe:'20200101',updateDe:'2026-11-02',
  extraOriginal:'보존되는 원본 필드'
};
const records=Array.from({length:5},(_,i)=>({...input,itemSeq:String(999000001+i)}));
const payload=(items:unknown[]=records,totalCount=123)=>JSON.stringify({header:{resultCode:'00',resultMsg:'NORMAL SERVICE'},body:{pageNo:1,numOfRows:5,totalCount,items}});
const response=(body=payload(),status=200)=>new Response(body,{status,headers:{'content-type':'application/json; charset=utf-8'}});
const fake=(fn:(url:URL,init:RequestInit)=>Promise<Response>):typeof fetch=>async(url,init)=>fn(new URL(String(url)),init??{});
async function inDirectory(fn:(directory:string)=>Promise<void>) {
  const directory=await mkdtemp(join(tmpdir(),'drmas-mfds-pilot-'));
  try{await fn(directory);}finally{await rm(directory,{recursive:true,force:true});}
}

test('pilot preflight and explicit approval gates make zero requests and never reveal key',async()=>inDirectory(async directory=>{
  let calls=0;const fetcher=fake(async()=>{calls++;return response();});
  const preflight=pilotPreflight(env);
  assert.equal(preflight.keyConfigured,true);assert.equal(preflight.keyValidity,'not_verified');
  assert.equal(preflight.networkRequests,0);assert.ok(!JSON.stringify(preflight).includes(key));
  await assert.rejects(runPilot({directory,env,fetch:fetcher}),/LIVE_MAX_5_APPROVAL_REQUIRED/);
  await assert.rejects(runPilot({directory,env,fetch:fetcher,approved:true}),/PORTAL_APPROVAL_CONFIRMATION_REQUIRED/);
  await assert.rejects(runPilot({directory,env:{},fetch:fetcher,approved:true,portalApproved:true}),/DATA_GO_KR_SERVICE_KEY_REQUIRED/);
  assert.equal(calls,0);
  const cli=(args:string[])=>spawnSync(process.execPath,['--import','tsx','src/mfds-pilot.ts',...args],{encoding:'utf8',env:{...process.env,...env}});
  const p=cli(['preflight']);assert.equal(p.status,0);assert.equal(JSON.parse(p.stdout).networkRequests,0);assert.ok(!p.stdout.includes(key));
  const blocked=cli(['collect']);assert.equal(blocked.status,1);assert.match(blocked.stderr,/LIVE_MAX_5_APPROVAL_REQUIRED/);
  const flags=cli(['collect','--approve-live-max-5','--portal-approved','--rows=100']);assert.equal(flags.status,1);assert.match(flags.stderr,/MFDS_INVALID_ARGUMENTS/);
}));

test('HTTP pilot preserves all raw fields and independently expected Korean/HTML clinical text, stays pending',async()=>inDirectory(async directory=>{
  let calls=0;
  const result=await runPilot({directory,approved:true,portalApproved:true,env,fetch:fake(async(url,init)=>{
    calls++;assert.equal(url.origin,'https://apis.data.go.kr');assert.equal(url.pathname,'/1471000/DrbEasyDrugInfoService/getDrbEasyDrugList');
    assert.equal(url.searchParams.get('ServiceKey'),key);assert.equal(url.searchParams.get('type'),'json');
    assert.equal(url.searchParams.get('pageNo'),'1');assert.equal(url.searchParams.get('numOfRows'),'5');
    assert.equal(init.redirect,'error');assert.equal(init.method,'GET');assert.ok(init.signal);return response();
  })});
  assert.equal(calls,1);assert.equal(result.verification.items,5);assert.equal(result.sourceExhausted,false);assert.equal(result.scopeCompleted,true);
  const store=new LocalRepository(join(directory,'ingestion')),rag=new LocalRepository(join(directory,'rag'));
  const state=await store.read(),r=await rag.read();
  assert.equal(Object.values(state.ingestion!.raw)[0]!.payload,payload());
  const original=parseEasy(new TextEncoder().encode(Object.values(state.ingestion!.raw)[0]!.payload)).items[0];
  assert.deepEqual(original,records[0]);
  const m=state.ingestion!.medicines['mfds-easy-999000001']!.value;
  assert.deepEqual({name:m.name,itemId:m.itemId,efficacy:m.efficacy,usage:m.usage,warning:m.warning,precaution:m.precaution,interaction:m.interaction,adverseEffects:m.adverseEffects,storage:m.storage},{
    name:'합성 검증약 (시험 전용)',itemId:'999000001',efficacy:'합성 효능 안내 & 검증.',usage:'합성 사용법. 원문 문장을 보존합니다.',warning:'경고: 합성 정보입니다.',
    precaution:'주의사항: A < B이며 "시험"입니다.',interaction:'상호작용 정보: 가상 항목.',adverseEffects:'가상 부작용 안내.',storage:'합성 보관 안내 문장.'
  });
  assert.equal(m.ingredient,null);assert.equal(m.publisher,'식품의약품안전처');assert.equal(m.updatedAt,'2026-11-02');
  assert.ok(result.verification.records.every(x=>x.fieldsMatched===10&&x.koreanSyllables>0&&x.htmlFields===7));
  assert.ok(Object.values(r.documents).every(d=>d.rights.permission==='pending'));
  assert.equal(Object.keys(r.vectors).length,0);assert.equal(r.usage.calls,0);
  for(const file of ['reservation.json','result.json','ingestion/state.json','rag/state.json','verification-report.json','verification-report.html']) {
    const text=await readFile(join(directory,file),'utf8');assert.ok(!text.includes(key));assert.ok(!text.includes(encodeURIComponent(key)));
  }
  const report=JSON.parse(await readFile(join(directory,'verification-report.json'),'utf8'));
  assert.equal(report.comparisons.length,5);assert.equal(report.permission,'pending');
  const efficacy=report.comparisons[0].fields.find((f:{targetField:string})=>f.targetField==='efficacy');
  assert.equal(efficacy.raw,input.efcyQesitm);assert.equal(efficacy.normalized,'합성 효능 안내 & 검증.');assert.equal(efficacy.matches,true);
  const html=await readFile(join(directory,'verification-report.html'),'utf8');
  assert.ok(html.includes('합성 검증약 (시험 전용)'));assert.ok(html.includes('&lt;script&gt;'));
  assert.ok(html.includes('&lt;p&gt;합성 효능 안내 &amp;amp; 검증.&lt;/p&gt;'));
  assert.ok(!html.includes('<script>'));assert.ok(html.includes('Content-Security-Policy'));
  assert.deepEqual(result.verification.reportFiles,['verification-report.json','verification-report.html']);
  await assert.rejects(runPilot({directory,approved:true,portalApproved:true,env,fetch:fake(async()=>{calls++;return response();})}),/ALREADY_RESERVED/);
  assert.equal(calls,1);assert.equal((await verifyPilot(directory)).status,'verified');
  // Offline verification must catch a wrong mapping or later mutation of every clinical field.
  for(const field of ['name','itemId','efficacy','usage','warning','precaution','interaction','adverseEffects','storage'] as const) {
    const previous=m[field];
    await store.transaction(s=>{s.ingestion!.medicines[m.id]!.value[field]='잘못 바뀐 내용';});
    await assert.rejects(verifyPilot(directory),/MFDS_VERIFICATION_FAILED/);
    await store.transaction(s=>{Object.assign(s.ingestion!.medicines[m.id]!.value,{[field]:previous});});
  }
  assert.equal((await verifyPilot(directory)).status,'verified');
}));

test('HTTP adapter blocks multi-page, >5 rows and repeated calls including after failure',async()=>{
  let calls=0;const fetcher=fake(async()=>{calls++;return response();});
  const adapter=createPilotHttpAdapter({approved:true,env,fetch:fetcher});
  await assert.rejects(adapter.load(2,5),/MFDS_PILOT_LIMIT/);await assert.rejects(adapter.load(1,6),/MFDS_PILOT_LIMIT/);assert.equal(calls,0);
  await adapter.load(1,5);await assert.rejects(adapter.load(1,5),/MFDS_PILOT_LIMIT/);assert.equal(calls,1);
  assert.throws(()=>createPilotHttpAdapter({approved:true,env,policy:{maxAttempts:4}}),/MFDS_INVALID_POLICY/);
  assert.throws(()=>createPilotHttpAdapter({approved:true,env,policy:{intervalMs:10}}),/MFDS_INVALID_POLICY/);
});

test('retryable HTTP and API failures obey interval and a shared three-attempt ceiling',async()=>{
  const starts:number[]=[];
  const adapter=createPilotHttpAdapter({approved:true,env,fetch:fake(async()=>{
    starts.push(Date.now());
    if(starts.length===1)return response('{"message":"busy"}',429);
    if(starts.length===2)return response('<OpenAPI_ServiceResponse><cmmMsgHeader><returnReasonCode>05</returnReasonCode></cmmMsgHeader></OpenAPI_ServiceResponse>');
    return response();
  })});
  await adapter.load(1,5);assert.equal(adapter.attempts(),3);
  for(let i=1;i<starts.length;i++)assert.ok(starts[i]!-starts[i-1]!>=1090);
  let failures=0;
  const exhausted=createPilotHttpAdapter({approved:true,env,policy:{maxAttempts:2},fetch:fake(async()=>{failures++;return response('{}',503);})});
  await assert.rejects(exhausted.load(1,5),/^MfdsError: MFDS_HTTP_5XX$/);assert.equal(failures,2);
});

test('auth/quota errors including XML are safe, non-retryable and preserve the one-shot reservation',async()=>inDirectory(async directory=>{
  for(const code of ['10','20','22','29','30','31']) {
    let calls=0;const adapter=createPilotHttpAdapter({approved:true,env,fetch:fake(async()=>{calls++;return response(`<OpenAPI_ServiceResponse><cmmMsgHeader><returnAuthMsg>${key}</returnAuthMsg><returnReasonCode>${code}</returnReasonCode></cmmMsgHeader></OpenAPI_ServiceResponse>`);})});
    await assert.rejects(adapter.load(1,5),/^MfdsError: MFDS_SECRET_ECHO_BLOCKED$/);assert.equal(calls,1);
    const xml=createPilotHttpAdapter({approved:true,env,fetch:fake(async()=>response(`<OpenAPI_ServiceResponse><cmmMsgHeader><returnReasonCode>${code}</returnReasonCode></cmmMsgHeader></OpenAPI_ServiceResponse>`))});
    await assert.rejects(xml.load(1,5),new RegExp(`MFDS_API_${code}`));assert.equal(xml.attempts(),1);
  }
  let calls=0;
  const fetcher=fake(async()=>{calls++;return response('{"header":{"resultCode":"30","resultMsg":"arbitrary upstream message"}}');});
  await assert.rejects(runPilot({directory,approved:true,portalApproved:true,env,fetch:fetcher}),/^MfdsError: MFDS_API_30$/);
  const failure=JSON.parse(await readFile(join(directory,'failure.json'),'utf8'));assert.equal(failure.code,'MFDS_API_30');assert.equal(failure.reservationRetained,true);
  await assert.rejects(runPilot({directory,approved:true,portalApproved:true,env,fetch:fetcher}),/ALREADY_RESERVED/);assert.equal(calls,1);
}));

test('timeout, broken UTF-8, oversized bodies, redirects and raw network errors never leak credentials',async()=>{
  const cases:Array<{fetch:typeof fetch;code:string;policy?:{timeoutMs?:number;maxBytes?:number}}>= [
    {fetch:fake(async()=>new Promise(()=>{})),code:'MFDS_TIMEOUT',policy:{timeoutMs:15}},
    {fetch:fake(async()=>new Response(new Uint8Array([0xff]))),code:'MFDS_INVALID_UTF8'},
    {fetch:fake(async()=>response(payload())),code:'MFDS_RESPONSE_TOO_LARGE',policy:{maxBytes:100}},
    {fetch:fake(async()=>new Response('redirect',{status:302,headers:{location:`https://untrusted.invalid/?key=${key}`}})),code:'MFDS_HTTP_ERROR'},
    {fetch:fake(async()=>{throw new Error(`fetch failed https://apis.data.go.kr?ServiceKey=${key}`);}),code:'MFDS_NETWORK_ERROR'},
    {fetch:fake(async()=>response(payload([{...input,itemName:'ECHO_KEY'}],1).replace('ECHO_KEY',[...key].map(c=>`\\u${c.charCodeAt(0).toString(16).padStart(4,'0')}`).join('')))),code:'MFDS_SECRET_ECHO_BLOCKED'},
    {fetch:fake(async()=>response(payload([{...input,itemName:'깨짐\uFFFD'}],1))),code:'success'},
    {fetch:fake(async()=>new Response(payload(),{headers:{'content-type':'application/json;charset=euc-kr'}})),code:'MFDS_NON_UTF8_CHARSET'}
  ];
  for(const c of cases) {
    const a=createPilotHttpAdapter({approved:true,env,fetch:c.fetch,policy:c.policy});
    if(c.code==='success') {await a.load(1,5);continue;} // Text integrity is checked in the shared transform, below.
    await assert.rejects(a.load(1,5),(error:unknown)=>{
      assert.equal(safeMfdsCode(error),c.code);assert.ok(!String(error).includes(key));assert.equal((error as Error).cause,undefined);return true;
    });assert.equal(a.attempts(),1);
  }
});

test('response audit rejects encoding corruption or >5 items before any RAG registration',async()=>{
  for(const body of [payload([{...input,itemName:'깨짐\uFFFD'}],1),payload([...records,{...input,itemSeq:'999000099'}],6)]) {
    await inDirectory(async directory=>{
      await assert.rejects(runPilot({directory,approved:true,portalApproved:true,env,fetch:fake(async()=>response(body))}));
      assert.equal(Object.keys((await new LocalRepository(join(directory,'rag')).read()).documents).length,0);
    });
  }
});

test('cancelled requests and a never-ending body are bounded by the timeout',async()=>{
  const signal=AbortSignal.abort();let calls=0;
  const a=createPilotHttpAdapter({approved:true,env,signal,fetch:fake(async()=>{calls++;return response();})});
  await assert.rejects(a.load(1,5),/MFDS_ABORTED/);assert.equal(calls,0);
  const stream=new ReadableStream<Uint8Array>({start(controller){controller.enqueue(new TextEncoder().encode('{'));}});
  const b=createPilotHttpAdapter({approved:true,env,policy:{timeoutMs:20},fetch:fake(async()=>new Response(stream))});
  await assert.rejects(b.load(1,5),/MFDS_TIMEOUT/);assert.equal(b.attempts(),1);
});

test('raw duplicate image variants remain five rows but four stored medicines and explicit report counts',async()=>inDirectory(async directory=>{
  const first=records.slice(0,4).map(x=>({...x,itemImage:'synthetic-image-A'}));
  const rows=[...first,{...first[3]!,itemImage:'synthetic-image-B'}];
  let requests=0;
  const result=await runPilot({directory,approved:true,portalApproved:true,env,fetch:fake(async()=>{requests++;return response(payload(rows));})});
  const v=result.verification;
  assert.equal(v.items,4);assert.equal(v.uniqueItems,4);assert.equal(v.rawRows,5);assert.equal(v.duplicateRows,1);assert.equal(v.recordUnit,'raw-row');assert.equal(v.records.length,5);
  assert.deepEqual(v.duplicates,[{itemId:first[3]!.itemSeq,rawRows:[4,5],occurrences:2,differingFields:['itemImage'],normalizedFieldsIdentical:true,classification:'metadata-variant'}]);
  assert.deepEqual(v.records.map(r=>r.rawRow),[1,2,3,4,5]);
  const rawStore=join(directory,'ingestion','state.json'),ragStore=join(directory,'rag','state.json');
  const before=[await readFile(rawStore),await readFile(ragStore)];
  await verifyPilot(directory);assert.equal(requests,1);
  assert.deepEqual(await readFile(rawStore),before[0]);assert.deepEqual(await readFile(ragStore),before[1]);
  const html=await readFile(join(directory,'verification-report.html'),'utf8');
  assert.ok(html.includes('원본 행: 5개 · 고유 품목: 4개 · 중복 행: 1개'));assert.ok(html.includes('itemImage'));
}));

test('report distinguishes missing, null, empty string, whitespace and empty markup without filling them',async()=>inDirectory(async directory=>{
  const rows=records.map(r=>({...r}) as Record<string,unknown>);
  delete rows[0]!.atpnWarnQesitm;
  rows[1]!.atpnWarnQesitm=null;rows[2]!.atpnWarnQesitm='';rows[3]!.atpnWarnQesitm=' \n\t ';rows[4]!.atpnWarnQesitm='<p>&nbsp;</p>';
  const result=await runPilot({directory,approved:true,portalApproved:true,env,fetch:fake(async()=>response(payload(rows)))});
  assert.deepEqual(result.verification.records.map(r=>r.emptyFieldDetails[0]!.rawStatus),['missing','null','empty-string','whitespace-only','empty-after-cleaning']);
  assert.ok(result.verification.records.every(r=>r.fieldsMatched===10&&r.emptyFields===1&&r.populatedFieldsMatched===9));
  const report=JSON.parse(await readFile(join(directory,'verification-report.json'),'utf8'));
  for(const record of report.comparisons) {
    const field=record.fields.find((f:{targetField:string})=>f.targetField==='warning');assert.equal(field.normalized,null);
  }
  const store=await new LocalRepository(join(directory,'ingestion')).read();
  assert.ok(Object.values(store.ingestion!.medicines).every(m=>m.value.warning===null&&m.value.ingredient===null));
}));

test('offline report rejects intact-Unicode but altered RAG chunks',async()=>inDirectory(async directory=>{
  await runPilot({directory,approved:true,portalApproved:true,env,fetch:fake(async()=>response())});
  const rag=new LocalRepository(join(directory,'rag'));
  await rag.transaction(s=>{Object.values(s.chunks)[0]!.text='변경된 가상 한국어 본문';});
  await assert.rejects(verifyPilot(directory),/MFDS_VERIFICATION_FAILED/);
}));
