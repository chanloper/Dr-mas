// Local synthetic render trees only; no Auth, network, calls or SOS.
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),ts=require('typescript');
const flow={};vm.runInNewContext(ts.transpileModule(fs.readFileSync('src/services/consultationFlow.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS}}).outputText,{exports:flow});
test('retrieval context preserves selected answers and contextual followups without inventing facts',()=>{
 const question='머리가 아파요';
 const query=flow.consultationSearchQuestion(question,[{key:'onset',text:'오늘 시작됐어요'},{key:'severity',text:'not-an-option'}]);
 assert.ok(query.startsWith(question));assert.ok(query.includes('오늘 시작됐어요'));
 assert.equal(query.includes('not-an-option'),false);assert.equal(flow.hasConsultationAnswers(query),true);
 assert.equal(flow.consultationSearchQuestion(question,[]),question);
 assert.ok(flow.followupSearchQuestion('이럴 때 병원에 가야 하나요?',question).startsWith(question));
 assert.equal(flow.followupSearchQuestion('다른 질문',question),'다른 질문');
});
const emergency={};vm.runInNewContext(ts.transpileModule(fs.readFileSync('src/services/emergencyGuidance.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS}}).outputText,{exports:emergency});
const nodes=v=>Array.isArray(v)?v.flatMap(nodes):v&&typeof v==='object'?[v,...nodes(v.props?.children)]:[];
test('later sudden severe headache always produces explanation after an initially negative safety answer',()=>{
 const app=mount(false,'머리가 아파요',true,true);
 app.click('해당 없어요 · 계속하기');app.click('네, 있어요');app.click('갑자기 시작해 바로 매우 심해졌어요');
 app.render();assert.equal(app.urgent,true);assert.equal(app.searched,0);
 assert.ok(app.render().some(node=>node.type==='EmergencyCallButton'));
 const reply=app.messages().at(-1).text;
 for(const value of ['갑자기 시작해 바로 매우 심해졌어요','119','뇌졸중','시작된 시각'])assert.ok(reply.includes(value));
 assert.equal(flow.followupSearchQuestion('집에서 어떻게 관리하면 되나요?','배가 아파요').startsWith('배가 아파요\n추가 질문:'),true);
});
test('saved interview resumes without repeating supplied answers or sending completed retrieval again',()=>{
 const first=mount(false,'배가 아파요',true,true);first.click('해당 없어요 · 계속하기');first.click('아니요, 없어요');first.render();
 const resume=mount(false,'배가 아파요',true,true,first.props.snapshot);resume.render();
 assert.equal(resume.render().some(n=>n.props?.label==='네, 있어요'),false);
 resume.click('가벼워요');resume.click('오늘 시작됐어요');resume.click('해당 증상은 없어요');resume.render();resume.render();
 assert.equal(resume.searched,1);assert.equal(resume.props.snapshot.searchRequested,true);
 const reopen=mount(false,'배가 아파요',true,true,resume.props.snapshot);reopen.render();reopen.render();assert.equal(reopen.searched,0);
});
test('licensed emergency explanation preserves compound uncertainty and stops retrieval immediately',()=>{
 const app=mount(false,'머리가 아파요',true,true);
 app.click('해당 없어요 · 계속하기');app.click('아니요, 없어요');app.click('가벼워요');app.click('오늘 시작됐어요');
 const selected='말이 어눌하거나 팔다리에 힘이 없거나 앞이 안 보여요';app.click(selected);app.render();
 assert.equal(app.urgent,true);assert.equal(app.searched,0);
 const reply=app.messages().at(-1).text;
 for(const word of [selected,'모두 발생했다고 판단하지','뇌졸중','확정한 것은 아니','사망이나 심각한 장애','119','시작된 시각','전화를 바로 끊지'])assert.ok(reply.includes(word),word);
 assert.equal(app.render().filter(n=>n.props?.accessibilityRole==='link').length,3);
 const unknown=emergency.emergencyGuidance('잘 모르겠어요','머리가 아파요');assert.equal(unknown.kind,'unspecified');assert.ok(!unknown.message.includes('뇌졸중'));
 assert.equal(emergency.emergencyGuidance('갑자기 극심해요','배가 아파요').kind,'unspecified');
 assert.equal(emergency.emergencyGuidance('시야 이상').clinicalReview,'required_not_completed');
 for(const source of Object.values(emergency.emergencySources)){assert.ok(source.url.startsWith('https://'));assert.ok(source.license.includes('제1유형'));}
});
function mount(followup=false,question='머리가 아파요',collectBeforeSearch=false,searchOnComplete=false,savedState){
 let cursor=0,slots=[],effects=[],searched=0,hospitals=0,advanced=0,urgent=false,lastQuery;
 const exports={};
 const hooks={useRef:initial=>{const i=cursor++;return slots[i]??=( {current:initial} );},useState:initial=>{const i=cursor++;if(!(i in slots))slots[i]=initial;return[slots[i],value=>{slots[i]=typeof value==='function'?value(slots[i]):value;}];},useEffect:fn=>effects.push(fn)};
 const mocks={'../services/emergencyGuidance':emergency,'../services/consultationFlow':flow,react:hooks,'react-native':{View:'View',Text:'Text',TextInput:'TextInput'},'./ChatMessage':{ChatMessage:'ChatMessage'},'./ui':{Action:'Action',s:{}},'./EmergencyCallButton':{EmergencyCallButton:'EmergencyCallButton'}};
 vm.runInNewContext(ts.transpileModule(fs.readFileSync('src/components/HeadacheConversation.tsx','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX}}).outputText,{exports,require:n=>n==='react/jsx-runtime'?require(n):mocks[n]});
 const props={question,active:true,followup,collectBeforeSearch,searchOnComplete,savedState,onStateChange:state=>{props.snapshot=state;},inputHandlerRef:{current:null},searchDisabled:false,onSearch:query=>{searched++;lastQuery=query;},onHospital:()=>hospitals++,onRestart(){},onAdvance:()=>advanced++,onEmergency:v=>{urgent=v;}};
 const render=()=>{cursor=0;const tree=exports.HeadacheConversation(props);while(effects.length)effects.shift()();return nodes(tree);};
 const click=label=>{const button=render().find(n=>n.props?.label===label);assert.ok(button,`missing ${label}`);button.props.onPress();};
 const messages=()=>render().filter(n=>n.type==='ChatMessage').map(n=>n.props.message);
 const type=text=>{render();assert.equal(typeof props.inputHandlerRef.current,'function');const result=props.inputHandlerRef.current(text);render();return result;};
 return{render,click,type,messages,props,get lastQuery(){return lastQuery;},get searched(){return searched;},get hospitals(){return hospitals;},get advanced(){return advanced;},get urgent(){return urgent;}};
}

test('natural answers fill the current consultation, skip supplied facts and search exact user wording once',()=>{
 const app=mount(false,'머리가 아파요',true,true);
 assert.equal(app.type('아니요, 해당 없어요'),'accepted');
 assert.equal(app.type('어제 저녁부터 아프고 속도 메스꺼워요'),'accepted');
 assert.equal(app.render().some(n=>n.props?.label==='오늘 시작됐어요'),false);
 assert.ok(app.render().some(n=>n.type==='Text'&&n.props.children==='얼마나 아픈가요?'));
 assert.equal(app.type('10점 중 7점 정도예요'),'accepted');
 assert.equal(app.type('해당 증상은 없어요'),'accepted');
 app.render();assert.equal(app.searched,1);assert.equal(app.urgent,false);
 for(const value of ['어제 저녁부터 아프고 속도 메스꺼워요','10점 중 7점 정도예요','해당 증상은 없어요'])assert.ok(app.lastQuery.includes(value));
 assert.match(app.messages().at(-1).text,/사용자가 답한 내용/);assert.match(app.messages().at(-1).text,/검색 결과와 공식 출처/);
 assert.equal(flow.consultationDisplayQuestion(app.lastQuery),'머리가 아파요');
});

test('additional natural symptoms retain prior answers, reject oversized input and preserve emergency priority',()=>{
 const app=mount(false,'머리가 아파요',true,true);app.click('해당 없어요 · 계속하기');
 assert.equal(app.type('어제 저녁부터요'),'accepted');
 assert.ok(app.render().some(n=>n.props?.label==='네, 있어요'),'a start time must not be stored as an answer about nausea');
 assert.equal(app.type('배도 아파요'),'accepted');
 assert.ok(app.render().some(n=>n.props?.label==='네, 있어요'),'an added symptom must not be treated as a nausea answer');
 assert.equal(app.type('x'.repeat(301)),'rejected');assert.equal(app.searched,0);
 app.type('아니요, 없어요');app.type('가벼워요');app.type('해당 증상은 없어요');
 assert.equal(app.searched,1);assert.ok(app.lastQuery.includes('배도 아파요'));assert.ok(app.lastQuery.includes('어제 저녁부터요'));
 const urgent=mount(false,'기침이 나요',true,true);urgent.click('해당 없어요 · 계속하기');
 urgent.type('숨쉬기가 어려워요');assert.equal(urgent.urgent,true);assert.equal(urgent.searched,0);assert.match(urgent.messages().at(-1).text,/119/);
 const duplicate=mount(false,'머리가 아파요',true,true);duplicate.click('해당 없어요 · 계속하기');duplicate.render();
 const handler=duplicate.props.inputHandlerRef.current;
 assert.equal(handler('속이 메스꺼워요'),'accepted');assert.equal(handler('속이 메스꺼워요'),'rejected');
 assert.equal(duplicate.messages().filter(m=>m.sender==='user'&&m.text==='속이 메스꺼워요').length,1);
});
test('completion automatically retrieves once with selected facts; disabled, stale and emergency interviews cannot send',()=>{
 for(const question of ['머리가 너무 아파요','배가 아프고 속이 메스꺼워요','기침이 계속 나요']){
  const app=mount(false,question,true,true);app.click('해당 없어요 · 계속하기');
  if(!question.includes('메스꺼'))app.click('아니요, 없어요');
  if(question.includes('메스꺼')){app.click('오늘 시작됐어요');app.click('가벼워요');}
  else{app.click('가벼워요');app.click('오늘 시작됐어요');}
  app.props.searchDisabled=true;app.click('해당 증상은 없어요');app.render();assert.equal(app.searched,0);
  app.props.searchDisabled=false;app.render();app.render();assert.equal(app.searched,1);
  assert.ok(app.lastQuery.startsWith(question));assert.ok(app.lastQuery.includes('동반 증상: 해당 증상은 없어요'));
  assert.equal(app.render().some(n=>n.props?.label==='답변을 반영해 공식 자료 찾기'),false);
  app.props.active=false;app.render();assert.equal(app.searched,1);
 }
 const urgent=mount(false,'갑자기 극심한 두통이 생겼어요',true,true);urgent.render();assert.equal(urgent.urgent,true);assert.equal(urgent.searched,0);
});
test('three symptom chats collect bounded answers before retrieval and send only selected facts',()=>{
 for(const question of ['머리가 계속 아파요','배가 아프고 속이 불편해요','기침이 계속 나요']){
  const app=mount(false,question,true);
  app.click('해당 없어요 · 계속하기');assert.equal(app.searched,0);
  app.click('아니요, 없어요');app.click('가벼워요');app.click('오늘 시작됐어요');app.click('해당 증상은 없어요');
  assert.ok(app.messages().at(-1).text.includes(question));
  app.click('답변을 반영해 공식 자료 찾기');assert.equal(app.searched,1);
  assert.ok(app.lastQuery.startsWith(question));assert.ok(app.lastQuery.includes('시작 시점: 오늘 시작됐어요'));
  assert.equal(/가슴 통증|숨쉬기 어렵|의식이 흐려|팔다리에 힘/.test(app.lastQuery),false);
 }
 assert.equal(flow.followupSearchQuestion('두통이 생기는 이유가 뭐예요?','머리가 계속 아파요').startsWith('머리가 계속 아파요'),true);
 assert.equal(flow.followupSearchQuestion('배가 왜 아파요?','머리가 계속 아파요'),'배가 왜 아파요?');
 assert.equal(flow.followupSearchQuestion('활명수는 어떻게 보관하나요?','머리가 계속 아파요'),'활명수는 어떻게 보관하나요?');
 const next=flow.followupSearchQuestion('그럼 이 증상은요?','머리가 계속 아파요\n[문진 답변]\n시작 시점: 오늘 시작됐어요\n추가 질문: 이전 질문');
 assert.equal(next.includes('이전 질문'),false);assert.ok(next.includes('오늘 시작됐어요'));
});
test('negative safety check searches once without forcing the three followup questions',()=>{
 const app=mount();const button=app.render().find(n=>n.props?.label==='해당 없음 · 공식 자료 찾기');
 button.props.onPress();button.props.onPress();assert.equal(app.searched,1);
 assert.equal(app.render().some(n=>n.props?.label==='오늘 시작됐어요'),false);assert.equal(app.urgent,false);
});
test('optional headache questions, answers and unchanged summary form one ordered chat; only current choices are visible',()=>{
 const app=mount(true);
 app.click('네, 있어요');
 const stale=app.render().find(n=>n.props?.label==='오늘 시작됐어요').props.onPress;
 stale();stale();
 assert.equal(app.messages().filter(m=>m.text==='오늘 시작됐어요').length,1);
 assert.equal(app.render().some(n=>n.props?.label==='오늘 시작됐어요'),false);
 app.click('문진 접기');
 assert.equal(app.render().some(n=>n.props?.label==='가벼워요'),false);
 app.click('두통 문진 이어보기');app.click('가벼워요');app.click('해당 증상은 없어요');
 const transcript=app.messages();assert.deepEqual(transcript.slice(3,9).map(m=>[m.sender,m.text]),[
  ['assistant','머리가 언제부터 아팠나요?'],['user','오늘 시작됐어요'],['assistant','얼마나 아픈가요?'],['user','가벼워요'],['assistant','새로 나타난 다음 증상이 있나요?'],['user','해당 증상은 없어요']]);
 assert.match(transcript.at(-1).text,/오늘 시작됐어요/);assert.match(transcript.at(-1).text,/진단 결과는 아니에요/);
 assert.equal(app.render().some(n=>n.type==='FeatureModal'),false);assert.equal(app.searched,0);assert.equal(app.urgent,false);
 app.click('병원 찾기');assert.equal(app.hospitals,1);app.click('답변을 반영해 공식 자료 찾기');assert.equal(app.searched,1);
 assert.ok(app.advanced>=5);
 app.props.active=false;assert.equal(app.render().some(n=>n.type==='Action'),false);assert.equal(app.messages().at(-1).text,transcript.at(-1).text);
});
test('existing red flags stop questions and append emergency guidance and a dial button in the same chat',()=>{
 for(const choices of [[],['네, 있어요','갑자기 시작해 바로 매우 심해졌어요'],['네, 있어요','오늘 시작됐어요','견디기 어려울 만큼 심해요'],['네, 있어요','오늘 시작됐어요','가벼워요','말이 어눌하거나 팔다리에 힘이 없거나 앞이 안 보여요'],['네, 있어요','오늘 시작됐어요','가벼워요','열이 나면서 목이 뻣뻣해요']]){
  const app=mount(choices.length>0);if(!choices.length)app.click('해당하거나 판단하기 어려워요');for(const choice of choices)app.click(choice);
  const transcript=app.messages();assert.equal(app.urgent,true);assert.match(transcript.at(-1).text,/119/);assert.equal(app.searched,0);
  assert.ok(app.render().some(n=>n.type==='EmergencyCallButton'));assert.equal(app.render().some(n=>n.type==='Action'),false);
  for(const choice of choices)assert.ok(transcript.some(m=>m.sender==='user'&&m.text===choice));
 }
});

test('answers choose a bounded next-question order with 3–4 choices and no invented disease list',()=>{
 for(const first of ['아니요, 없어요','잘 모르겠어요']){
    const app=mount(true);assert.equal(app.render().filter(n=>n.type==='Action').length,5,'three answer choices plus emergency and collapse controls');
  app.click(first);
  const order=first==='아니요, 없어요'?['얼마나 아픈가요?','머리가 언제부터 아팠나요?']:['머리가 언제부터 아팠나요?','얼마나 아픈가요?'];
  for(const expected of [...order,'새로 나타난 다음 증상이 있나요?']){
   assert.ok(app.render().some(n=>n.type==='Text'&&n.props.children===expected));
     assert.equal(app.render().filter(n=>n.type==='Action').length,6,'four answer choices plus emergency and collapse controls');
   app.click('잘 모르겠어요');
  }
  const transcript=app.messages();assert.equal(transcript.filter(m=>m.sender==='user').length,4);
  assert.equal(app.render().some(n=>n.props?.label==='잘 모르겠어요'),false);
  assert.ok(transcript.at(-1).text.includes('진단 결과는 아니에요'));
  assert.equal(/긴장형|편두통|감염성 질환/.test(transcript.map(m=>m.text).join('\n')),false);
  assert.equal(app.searched,0);
 }
});

test('symptom flow skips supplied facts; headache follow-up remains choice-based and bounded',()=>{
 assert.equal(flow.nextConsultationQuestion('머리가 아프고 속이 메스꺼워요',[]),'onset');
 assert.equal(flow.nextConsultationQuestion('오늘부터 머리가 조금 아프고 메스꺼워요',[]),'associated');
 assert.equal(flow.nextConsultationQuestion('기침이 계속 나요',[]),'fever');
 assert.equal(flow.nextConsultationQuestion('오늘부터 열이 나고 기침이 조금 나요',[]),'associated');
 assert.deepEqual(Array.from(flow.consultationQuestions('기침이 나요').fever.options),['네, 있어요','아니요, 없어요','잘 모르겠어요']);
 assert.deepEqual(Array.from(flow.consultationQuestions('배가 아파요').associated.options),['숨쉬기 어렵거나 의식이 흐려요','가슴 통증이 있어요','해당 증상은 없어요','잘 모르겠어요']);
 assert.equal(flow.explicitEmergency('기침이 나고 숨을 못 쉬어요'),true);
 assert.equal(flow.explicitEmergency('머리가 조금 불편해요'),false);
 const app=mount(true,'머리가 아파요');
 assert.equal(app.render().filter(n=>n.type==='Action').length,5,'three answer choices plus emergency and collapse controls');
 app.click('네, 있어요');app.click('오늘 시작됐어요');app.click('가벼워요');app.click('해당 증상은 없어요');
 const transcript=app.messages();assert.ok(transcript.some(m=>m.sender==='user'&&m.text==='오늘 시작됐어요'));
 assert.ok(transcript.some(m=>m.sender==='user'&&m.text==='가벼워요'));
 assert.ok(transcript.some(m=>m.sender==='user'&&m.text==='해당 증상은 없어요'));
 assert.match(transcript.at(-1).text,/진단 결과는 아니에요/);assert.equal(app.searched,0);
 assert.equal(app.render().some(n=>n.type==='TextInput'),false,'follow-up questions use the existing choices; the main AI composer is covered by the AiScreen UI test');
 app.click('답변을 반영해 공식 자료 찾기');assert.equal(app.searched,1);
});

test('abdominal and cough inputs keep their own wording and use existing common followup choices',()=>{
 for(const question of ['배가 아파요','기침이 계속 나요']){
  const initial=mount(false,question);
  assert.ok(initial.messages().some(m=>m.sender==='user'&&m.text===question));
  const text=initial.render().filter(n=>n.type==='Text').map(n=>n.props.children).flat().join(' ');
  assert.equal(text.includes('머리가 아프시군요'),false);
  initial.click('해당 없음 · 공식 자료 찾기');assert.equal(initial.searched,1);
  const app=mount(true,question);
  const expected=question.includes('기침')?'기침과 함께 열이 나는 느낌도 있으신가요?':'속이 메스껍거나 토할 것 같은 느낌도 있으신가요?';
  assert.ok(app.render().some(n=>n.type==='Text'&&n.props.children===expected));
  app.click('아니요, 없어요');app.click('가벼워요');app.click('오늘 시작됐어요');app.click('해당 증상은 없어요');
  assert.match(app.messages().at(-1).text,/진단 결과는 아니에요/);
  assert.ok(app.messages().at(-1).text.includes(question));assert.equal(app.urgent,false);
 }
});

test('explicit emergency input bypasses ordinary questions and search immediately',()=>{
 for(const question of ['기침이 나고 숨을 못 쉬어요','갑자기 극심한 두통이 생겼어요']){
  const app=mount(false,question);
  app.render();
  assert.equal(app.urgent,true);assert.equal(app.searched,0);
  assert.match(app.messages().at(-1).text,/119/);
  assert.ok(app.render().some(n=>n.type==='EmergencyCallButton'));
  assert.equal(app.render().some(n=>n.type==='Action'),false);
  assert.ok(app.messages().some(m=>m.sender==='user'&&m.text===question));
 }
});

test('compound symptoms already supplied in the first message are not asked again',()=>{
 const app=mount(true,'어제부터 머리가 아프고 메스꺼워요');
 assert.equal(app.render().some(n=>n.props?.label==='네, 있어요'),false);
 app.click('가벼워요');app.click('해당 증상은 없어요');
 assert.match(app.messages().at(-1).text,/어제부터/);
 assert.equal(app.render().some(n=>n.props?.label==='오늘 시작됐어요'),false);
});
