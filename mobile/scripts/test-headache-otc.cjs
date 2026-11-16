/* global __dirname */
// Synthetic provider/auth/quota responses only. No credentials or operating data.
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const assert=require('node:assert/strict'),{test}=require('node:test');
const ts=require('typescript');
const root=path.resolve(__dirname,'../..');
function load(relative){
  const file=path.resolve(root,relative),exports={};
  vm.runInNewContext(ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,
    {exports,URL,Request,Response,AbortController,TextEncoder,TextDecoder,Uint8Array,Date,atob,setTimeout,clearTimeout,
      require:name=>load(path.resolve(path.dirname(file),name))});
  return exports;
}
const api=load('supabase/functions/_shared/headacheOtc.ts'),client=load('mobile/src/services/headacheMedicines.ts');
const item={itemSeq:'199303108',itemName:'타이레놀정500밀리그람(아세트아미노펜)(수출명:TylenolExtraStrengthCaplets)',entpName:'SYNTHETIC',efcyQesitm:'합성 두통 효능'};
const approval={ITEM_SEQ:item.itemSeq,ITEM_NAME:item.itemName,ENTP_NAME:item.entpName,ETC_OTC_CODE:'일반의약품',CANCEL_NAME:'정상',CANCEL_DATE:null,
  MAIN_ITEM_INGR:'합성 성분',EE_DOC_DATA:'<DOC><P>합성 두통 효능</P></DOC>',UD_DOC_DATA:'<DOC><![CDATA[합성 용법 원문입니다. 실제 용량 아님.]]></DOC>',
  NB_DOC_DATA:'<DOC><P>합성 경고를 누락하지 않습니다.</P></DOC>',PACK_UNIT:'8정'};
const page=items=>({header:{resultCode:'00'},body:{items,totalCount:items.length,pageNo:1,numOfRows:3}});
const lookup=(overrides={},easy={})=>api.headacheOtc('SYNTHETIC_KEY_NOT_REAL',async url=>{
  assert.equal(url.protocol,'https:');assert.equal(url.hostname,'apis.data.go.kr');
  if(url.pathname.includes('DrbEasy')){assert.equal(url.searchParams.get('efcyQesitm'),'두통');return page([{...item,...easy}]);}
  assert.equal(url.searchParams.get('item_seq'),item.itemSeq);return page([{...approval,...overrides}]);
});
const health={status:'local_evidence',message:'기존 원문',disclaimer:'기존 안내',text:'기존 원문 및 출처',sources:[{documentId:'kdca-5830',chunkId:'kdca-test',title:'두통',quote:'합성 건강 원문',sourceUrl:'https://example.org/synthetic'}]};
test('exact approval join returns OTC ingredients, approved efficacy/use, complete precautions and official source',async()=>{
  const result=await lookup();assert.equal(result.sources.length,2);
  assert.match(result.sources[0].quote,/성분: 합성 성분/);assert.match(result.sources[0].quote,/허가 효능: 합성 두통 효능/);
  assert.match(result.sources[0].quote,/합성 용법 원문/);assert.match(result.sources[1].quote,/합성 경고를 누락하지/);
  assert.match(result.sources[0].quote,/공식 지정 8정/);assert.match(result.sources[1].quote,/병용금기 검사는 하지 않았습니다/);
  assert.equal(result.sources[0].sourceUrl,'https://nedrug.mfds.go.kr/pbp/CCBBB01/getItemDetail?itemSeq=199303108');
  const enriched=await client.withHeadacheMedicines(health,'머리가 아파요',async()=>result);
  assert.equal(enriched.sources[0],health.sources[0]);assert.equal(enriched.message,health.message);assert.equal(enriched.sources.length,3);
});
test('prescription, cancelled, mismatched or incomplete products never become candidates',async()=>{
  for(const change of [{ETC_OTC_CODE:'전문의약품'},{ETC_OTC_CODE:null},{CANCEL_NAME:'취하'},{CANCEL_NAME:null},{CANCEL_DATE:'20260101'},
    {ITEM_SEQ:'999000001'},{ITEM_NAME:'OTHER'},{ENTP_NAME:'OTHER'},{MAIN_ITEM_INGR:null},{EE_DOC_DATA:'다른 효능'},{UD_DOC_DATA:null},{NB_DOC_DATA:null}]){
    assert.equal((await lookup(change)).sources.length,0,JSON.stringify(change));
  }
  assert.equal((await lookup({}, {efcyQesitm:'다른 효능'})).sources.length,0);
});
test('convenience classification requires exact designated product AND packaging; no inventory claims',async()=>{
  const unknown=await lookup({PACK_UNIT:'10정'});
  assert.match(unknown.sources[0].quote,/편의점 구매 가능 여부를 분류하지/);
  assert.doesNotMatch(unknown.sources[0].quote,/공식 지정 8정/);
});
test('precautions are complete across bounded source chunks; oversize never silently truncates',async()=>{
  const heading=await lookup({NB_DOC_DATA:'<DOC><ARTICLE title="다음 사람은 복용하지 말 것"><P>합성 금기 대상</P></ARTICLE></DOC>'});
  assert.match(heading.sources[1].quote,/다음 사람은 복용하지 말 것 합성 금기 대상/);
  const precaution='합성 경고. '.repeat(700);
  const result=await lookup({NB_DOC_DATA:precaution});
  assert.equal(result.sources.length,3);
  const reconstructed=result.sources.slice(1).map(s=>s.quote.split('\n')[1]).join('');
  assert.equal(reconstructed,precaution.trim());assert.ok(result.sources.every(s=>s.quote.length<=4000));
  assert.equal((await lookup({NB_DOC_DATA:'합성 경고 '.repeat(2500)})).sources.length,0);
});
test('emergency/privacy/professional, expired or missing KDCA evidence never triggers medicine lookup',async()=>{
  let calls=0;const run=async()=>{calls++;return lookup();};
  for(const status of ['emergency','privacy','professional','insufficient_evidence'])await client.withHeadacheMedicines({...health,status},'머리가 아파요',run);
  await client.withHeadacheMedicines({...health,sources:[]},'머리가 아파요',run);
  await client.withHeadacheMedicines(health,'갑자기 극심한 두통과 한쪽 팔에 힘이 없어요',run);
  await client.withHeadacheMedicines(health,'아이 머리가 아파요',run);
  assert.equal(calls,0);
  assert.equal(await client.withHeadacheMedicines(health,'두통',async()=>{throw Error('synthetic failure');}),health);
});
test('client rejects wrong origins, invalid response and incomplete single-source medication',async()=>{
  const good=await lookup();
  for(const bad of [{...good,sources:[good.sources[0]]},{...good,sources:good.sources.map(s=>({...s,sourceUrl:'https://example.org/untrusted'}))},
    {...good,checkedAt:'invalid'},{...good,sources:good.sources.map(s=>({...s,quote:'x'.repeat(4001)}))}]){
    assert.equal(await client.withHeadacheMedicines(health,'두통',async()=>bad),health);
  }
});
test('existing authenticated DUR endpoint gates every new official request through shared quota without patient data',async()=>{
  const env={DUR_ENABLED:'true',MFDS_DUR_SERVICE_KEY:'SYNTHETIC_KEY_NOT_REAL',SUPABASE_URL:'https://fixture.supabase.co',
    SUPABASE_PUBLISHABLE_KEY:'sb_publishable_fixture',UPSTASH_REDIS_REST_URL:'https://fixture.upstash.io',UPSTASH_REDIS_REST_TOKEN:'SYNTHETIC_REDIS'};
  let providers=0,admissions=0;
  const handler=load('supabase/functions/check-dur/handler.ts').createHandler({env:key=>env[key],fetch:async(url,init)=>{
    const u=new URL(String(url));const json=v=>new Response(JSON.stringify(v));
    if(u.hostname.endsWith('supabase.co'))return json({id:'synthetic-user'});
    if(u.hostname.endsWith('upstash.io')){admissions++;return json({result:1});}
    providers++;assert.equal(init.redirect,'error');assert.equal(init.body,undefined);
    return json(u.pathname.includes('DrbEasy')?page([item]):page([approval]));
  }});
  const request=(body,token=true)=>new Request('https://fixture.supabase.co/functions/v1/check-dur',{method:'POST',headers:{'Content-Type':'application/json',...(token?{Authorization:'Bearer synthetic.jwt.token'}:{})},body:JSON.stringify(body)});
  assert.equal((await handler(request({mode:'related-otc',symptom:'두통'},false))).status,401);assert.equal(providers,0);
  assert.equal((await handler(request({mode:'related-otc',symptom:'두통',patientId:'forbidden'}))).status,400);assert.equal(providers,0);
  const response=await handler(request({mode:'related-otc',symptom:'두통'}));assert.equal(response.status,200);
  const result=await response.json();assert.equal(result.sources.length,2);assert.equal(providers,2);assert.equal(admissions,2);
  assert.equal(JSON.stringify(result).includes(env.MFDS_DUR_SERVICE_KEY),false);
});
