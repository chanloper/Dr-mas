// Fictional accounts/inputs; no native storage, sockets, health records or calls.
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),ts=require('typescript');
const {createHarness}=require('./controller-harness.cjs');
function load(path){const m={exports:{}};vm.runInNewContext(ts.transpileModule(fs.readFileSync(path,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS}}).outputText,m);return m.exports;}
const history=load('src/services/consultationHistory.ts');
function fixture(){
 let id='fictional-a',calls=0;const listeners=new Set(),writes=[];
 const auth={AuthError:class extends Error{},authErrorMessage:()=> 'fixture',readToken:async()=> 'fixture-only',getCurrentUser:async()=>({id,role:'patient',name:'Fictional',email:'example@example.invalid'}),watchSession:fn=>{listeners.add(fn);return()=>listeners.delete(fn);},clearToken:async()=>listeners.forEach(fn=>fn()),login:async()=>({accessToken:'fixture-only'}),saveToken:async()=>{}};
 const h=createHarness({auth,storage:{getItem:async()=>null,setItem:async(k,v)=>writes.push([k,v])},rag:{sendRagChat:async()=>{calls++;return {text:'합성 응답',status:'insufficient_evidence',sources:[]};},ragErrorMessage:()=> 'fixture'}});
 return {...h,writes,get calls(){return calls;},async login(app,next){id=next;app.state.setEmail('example@example.invalid');app.state.setPassword('fixture-only');await app.state.submitAuth();await app.flush();}};
}
test('opt-in memory history preserves sources drafts and interviews across menu changes and session switches',async()=>{
 const f=fixture(),app=f.mount();await app.flush();app.state.setTab('ai');await app.flush();
 app.state.consultation.update('consent',true);
 app.state.setChatInput('가상 상담 초안');
 app.state.consultation.update('interviews',[{question:'가상 증상',anchor:1}]);
 const original=app.state.consultation.current.id;
 app.state.setTab('home');await app.flush();app.state.setTab('ai');await app.flush();
 assert.equal(app.state.chatInput,'가상 상담 초안');assert.equal(app.state.consultation.current.interviews.length,1);
 await app.state.sendChat('가상 일반 질문');await app.flush();
 app.state.newConsultation();await app.flush();assert.equal(app.state.consultation.records.length,1);
 assert.equal(app.state.chatInput,'');assert.notEqual(app.state.consultation.current.id,original);
 app.state.openConsultation(original);await app.flush();assert.equal(app.state.chatInput,'가상 상담 초안');
 assert.ok(app.state.messages.some(m=>m.text==='합성 응답'));assert.equal(app.state.consultation.current.reopened,true);
 app.state.deleteConsultation(original);await app.flush();assert.equal(app.state.consultation.records.length,0);assert.equal(app.state.chatInput,'');
 assert.equal(f.writes.length,0,'no consultation plaintext is written to native/browser storage');app.dispose();
});
test('emergency followups stay local retain original danger sources and never resume ordinary retrieval',async()=>{
 const f=fixture(),app=f.mount();await app.flush();
 app.state.setChatInput('갑자기 머리가 매우 심하게 아파요.');await app.flush();await app.state.sendChat();await app.flush();
 assert.equal(app.state.messages.at(-1).status,'emergency');assert.ok(app.state.consultation.current.emergency);assert.equal(f.calls,0);
 app.state.consultation.update('consent',true);
 for(const question of ['왜 위험한가요?','119에 어떤 내용을 전달해야 하나요?','구급차가 도착할 때까지 어떻게 해야 하나요?','주변에 사람이 없으면 어떻게 해야 하나요?','증상이 사라졌는데 어떻게 해야 하나요?']){
  app.state.setChatInput(question);await app.flush();await app.state.sendChat();await app.flush();
  const last=app.state.messages.at(-1);assert.equal(last.status,'emergency');assert.ok(last.text.includes('119'));assert.ok(last.emergency.sources.length);
  assert.ok(app.state.consultation.current.emergency);assert.equal(app.state.chatInput,'');
 }
 assert.equal(f.calls,0);const id=app.state.consultation.current.id;
 app.state.newConsultation();await app.flush();app.state.openConsultation(id);await app.flush();
 assert.ok(app.state.consultation.current.emergency);assert.equal(app.state.consultation.current.reopened,true);
 assert.equal(app.state.messages.at(-1).emergency.reported.includes('갑자기'),true);app.dispose();
});
test('logout and account switching erase history and stale callbacks cannot expose prior account data',async()=>{
 const f=fixture(),app=f.mount();await app.flush();
 app.state.consultation.update('consent',true);app.state.setChatInput('private fictional draft');
 const stale=app.state.consultation.update;
 await app.state.signOut();await app.flush();assert.equal(app.state.consultation.records.length,0);assert.equal(app.state.chatInput,'');
 await f.login(app,'fictional-b');stale('draft','stale old account');await app.flush();
 assert.equal(app.state.chatInput,'');assert.equal(app.state.consultation.records.length,0);
 await app.state.signOut();await app.flush();await f.login(app,'fictional-a');stale('draft','stale same account before logout');await app.flush();assert.equal(app.state.chatInput,'');
 assert.equal(f.writes.length,0);app.dispose();
 const reset=history.emptyConsultations('a');reset.records[0].consent=true;
 assert.equal(history.visibleConsultations(reset,'b').records[0].consent,false);
 assert.equal(history.beginConsultation(history.emptyConsultations('a')).records.length,1,'no-consent conversation is discarded, never archived');
});
