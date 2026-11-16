/* global __dirname */
// Synthetic transports only; never loads credentials or calls an operating API.
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const {test}=require('node:test'),assert=require('node:assert/strict'),ts=require('typescript');
function load(file){
  file=path.resolve(__dirname,'../..',file);const exports={};
  vm.runInNewContext(ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,
    {exports,URL,Request,Response,AbortController,TextEncoder,TextDecoder,Uint8Array,atob,Date,setTimeout,clearTimeout,
      require:name=>load(path.resolve(path.dirname(file),name))});return exports;
}
const api=load('supabase/functions/check-dur/handler.ts');
const contract=load('mobile/src/services/durContract.ts');
const env={DUR_ENABLED:'true',MFDS_DUR_SERVICE_KEY:'SYNTHETIC_KEY_ONLY',SUPABASE_URL:'https://fixture.supabase.co',SUPABASE_PUBLISHABLE_KEY:'sb_publishable_fixture',UPSTASH_REDIS_REST_URL:'https://fixture.upstash.io',UPSTASH_REDIS_REST_TOKEN:'SYNTHETIC_REDIS_ONLY'};
const json=v=>new Response(JSON.stringify(v));
const page=(items,total=items.length)=>({header:{resultCode:'00'},body:{items,totalCount:total}});
const query={mode:'search',query:'타이레놀정500밀리그람',page:1};
const approved={ITEM_NAME:'타이레놀정500밀리그람(합성 테스트)',ITEM_SEQ:'999000001',ENTP_NAME:'합성제조사',ITEM_INGR_NAME:'합성성분',CANCEL_NAME:'정상',CANCEL_DATE:null};
const drugs=[{name:'합성가정',itemSeq:'999000001'},{name:'합성나정',itemSeq:'999000002'}];
async function run(body,provider){
  const diagnostics=[],urls=[];let admissions=0;
  const handler=api.createHandler({env:key=>env[key],diagnose:value=>diagnostics.push(value),fetch:async(url,init)=>{
    const u=new URL(url);if(u.hostname.endsWith('supabase.co'))return json({id:'PRIVATE_SYNTHETIC_USER'});
    if(u.hostname.endsWith('upstash.io')){admissions++;return json({result:1});}
    urls.push(u);assert.equal(init.redirect,'error');return provider(u);
  }});
  const response=await handler(new Request('https://fixture.supabase.co/functions/v1/check-dur',{method:'POST',headers:{Authorization:'Bearer PRIVATE_SYNTHETIC_TOKEN','Content-Type':'application/json'},body:JSON.stringify(body)}));
  return {status:response.status,body:await response.json(),diagnostics,urls,admissions};
}
test('approval search uses official operation/item_name and returns selectable manufacturer and exact item code',async()=>{
  const r=await run(query,u=>{
    assert.equal(u.pathname,'/1471000/DrugPrdtPrmsnInfoService08/getDrugPrdtPrmsnInq08');
    assert.equal(u.searchParams.get('item_name'),query.query);assert.equal(u.searchParams.has('itemName'),false);
    assert.equal(u.searchParams.get('numOfRows'),'100');assert.equal(u.searchParams.get('pageNo'),'1');
    return json(page([approved,{...approved,ITEM_SEQ:'bad'},{...approved,ITEM_SEQ:'999000003',CANCEL_NAME:'취하'}]));
  });
  assert.equal(r.status,200);contract.validateDurSearchResult(r.body);
  assert.equal(r.body.outcome,'matched');assert.equal(r.body.candidates.length,1);
  assert.equal(r.body.candidates[0].itemSeq,'999000001');assert.equal(r.body.candidates[0].manufacturer,'합성제조사');
  assert.equal(r.body.candidates[0].ingredient,'합성성분');assert.equal(r.admissions,1);
  assert.equal(r.diagnostics[0].totalCount,3);assert.equal(r.diagnostics[0].beforeFilter,3);assert.equal(r.diagnostics[0].afterFilter,1);
  assert.deepEqual(Object.keys(r.diagnostics[0]).sort(),['afterFilter','beforeFilter','elapsedMs','providerResultCode','totalCount']);
  const serialized=JSON.stringify(r.diagnostics);
  for(const value of [query.query,env.MFDS_DUR_SERVICE_KEY,env.UPSTASH_REDIS_REST_TOKEN,'PRIVATE_SYNTHETIC_USER','PRIVATE_SYNTHETIC_TOKEN','https://'])assert.equal(serialized.includes(value),false);
});
test('original empty, all-filtered and incomplete responses are distinct',async()=>{
  for(const [input,outcome]of [[page([]),'empty'],[page([{...approved,ITEM_SEQ:'invalid'}]),'filtered'],[page([approved],100),'incomplete'],[page([],100),'incomplete']]){
    const r=await run(query,()=>json(input));assert.equal(r.status,200);assert.equal(r.body.outcome,outcome);contract.validateDurSearchResult(r.body);
  }
});
test('HTTP-200 provider errors and parse failures remain errors rather than zero-result success',async()=>{
  const rejected=await run(query,()=>json({header:{resultCode:'30'},body:{totalCount:0,items:[]}}));
  assert.equal(rejected.status,502);assert.equal(rejected.body.code,'PROVIDER_REJECTED');assert.equal(rejected.diagnostics[0].providerResultCode,'30');
  for(const provider of [()=>new Response('not-json'),()=>json({header:{resultCode:'00'},body:{totalCount:'invalid',items:[]}})]){
    const r=await run(query,provider);assert.equal(r.status,502);assert.equal(r.body.code,'PROVIDER_RESPONSE_INVALID');
  }
  const http=await run(query,()=>new Response('unavailable',{status:503}));assert.equal(http.status,502);assert.equal(http.body.code,'UPSTREAM_UNAVAILABLE');
  const wrongPage=page([approved]);wrongPage.body.pageNo=2;
  const mismatch=await run(query,()=>json(wrongPage));assert.equal(mismatch.status,502);assert.equal(mismatch.body.code,'PROVIDER_RESPONSE_INVALID');
});
test('DUR comparison is code-based, checks reverse direction and never infers a relation from names',async()=>{
  const r=await run({drugs},u=>{
    assert.equal(u.pathname,'/1471000/DURPrdlstInfoService03/getUsjntTabooInfoList03');assert.equal(u.searchParams.has('itemName'),false);
    const own=drugs.find(d=>d.itemSeq===u.searchParams.get('itemSeq'));assert.ok(own);
    return json(page([{ITEM_SEQ:own.itemSeq,ITEM_NAME:'공식 표기 차이',MIXTURE_ITEM_SEQ:own===drugs[1]?drugs[0].itemSeq:'999000099',PROHBT_CONTENT:'합성 금기 정보'}]));
  });
  assert.equal(r.status,200);assert.equal(r.body.warnings.length,1);assert.equal(r.body.comparisonStatus,'matched');contract.validateDurResult(r.body);
  assert.equal(r.admissions,r.urls.length);
  const mismatch=await run({drugs},()=>json(page([{ITEM_SEQ:'999000099',ITEM_NAME:'합성가정'}])));
  assert.equal(mismatch.status,502);assert.equal(mismatch.body.code,'PROVIDER_RESPONSE_INVALID');
  const missing=await run({drugs:[{name:'합성가정'}]},()=>{throw Error('must not query');});assert.equal(missing.status,400);assert.equal(missing.urls.length,0);
});
test('complete unmatched, unregistered and incomplete/repeated pages never produce an assurance of safety',async()=>{
  const unmatched=await run({drugs},u=>json(page([{ITEM_SEQ:u.searchParams.get('itemSeq'),ITEM_NAME:'합성 품목',MIXTURE_ITEM_SEQ:'999000099'}])));
  assert.equal(unmatched.body.comparisonStatus,'no_registered_match');assert.equal(unmatched.body.warnings.length,0);assert.equal(unmatched.body.incomplete,false);
  const absent=await run({drugs},()=>json(page([])));assert.equal(absent.body.comparisonStatus,'unverified');
  const repeated=await run({drugs},u=>json(page(Array.from({length:100},()=>({ITEM_SEQ:u.searchParams.get('itemSeq'),ITEM_NAME:'합성 품목',MIXTURE_ITEM_SEQ:'999000099'})),101)));
  assert.equal(repeated.status,200);assert.equal(repeated.urls.length,3);assert.equal(repeated.body.incomplete,true);assert.equal(repeated.body.comparisonStatus,'unverified');
  assert.equal(repeated.diagnostics.at(-1).afterFilter,0);contract.validateDurResult(repeated.body);
  const gap=await run({drugs},u=>json(page([{ITEM_SEQ:u.searchParams.get('itemSeq'),ITEM_NAME:'합성 품목'}],101)));
  assert.equal(gap.body.incomplete,true);assert.equal(gap.body.comparisonStatus,'unverified');
});
test('mobile and Edge contracts stay identical',()=>{
  assert.equal(fs.readFileSync(path.resolve(__dirname,'../src/services/durContract.ts'),'utf8'),fs.readFileSync(path.resolve(__dirname,'../../supabase/functions/_shared/durContract.ts'),'utf8'));
});
