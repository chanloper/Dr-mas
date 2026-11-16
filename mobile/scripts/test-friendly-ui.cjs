// Synthetic render trees and mocked link opening only. No network, Auth or SOS.
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),ts=require('typescript');
const compile=p=>ts.transpileModule(fs.readFileSync(p,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX}}).outputText;
function load(p,mocks){const b={exports:{},URL,require:name=>{if(name==='../services/registeredHealthNews')return {loadRegisteredHealthNews:async()=>[]};if(name==='react/jsx-runtime')return require(name);if(name in mocks)return mocks[name];if(name==='../components/PublicMedicineInfo')return {PublicMedicineInfo:'PublicMedicineInfo'};if(name==='../app/places')return {PlacesContent:'PlacesContent'};if(name==='../services/emergencyGuidance')return load('src/services/emergencyGuidance.ts',{});if(name==='../services/consultationFlow')return load('src/services/consultationFlow.ts',{});throw Error(name);}};vm.runInNewContext(compile(p),b);return b.exports;}
const nodes=n=>!n||typeof n!=='object'?[]:Array.isArray(n)?n.flatMap(nodes):[n,...nodes(n.props?.children)];
const text=tree=>nodes(tree).filter(n=>n.type==='Text').map(n=>JSON.stringify(n.props.children)).join(' ');
const source={documentId:'synthetic',chunkId:'synthetic:1',title:'합성 자료',quote:'원문 그대로 유지할 합성 문장입니다. '.repeat(100),publisher:'합성 기관',sourceUrl:'https://www.data.go.kr/data/15075057/openapi.do',attribution:{datasetName:'합성 데이터',itemCode:'synthetic',termsLabel:'합성 이용 조건',termsUrl:'https://www.data.go.kr/catalog/15075057/openapi.json'}};
const native={Platform:{OS:'android'},Text:'Text',View:'View',Keyboard:{dismiss(){}},AccessibilityInfo:{isReduceMotionEnabled:async()=>true,addEventListener:()=>({remove(){}})},Animated:{View:'AnimatedView',Value:class{constructor(value){this.value=value;}setValue(value){this.value=value;}stopAnimation(){}},timing:(value,options)=>({start(){value.setValue(options.toValue);},stop(){}})}};
const ui={Action:'Action',C:{white:'#fff',muted:'#52657A',ink:'#1E293B'},s:{}};
test('emergency chat remains sendable offline and history deletion uses cross-platform confirmation',()=>{
 let cursor=0,sent=0,searched=0,deleted=0;const slots=[];
 const record={id:1,consent:true,reopened:true,createdAt:'2026-11-14',interviews:[],snapshots:{},emergency:{reported:'가상 위험 확인'}};
 const model={messages:[{id:1,sender:'user',text:'가상 위험 확인'}],chatInput:'119에 어떤 내용을 전달하나요?',chatLoading:false,
  consultation:{current:record,records:[record],update(){}},sendEmergencyQuestion(){sent++;},sendChat(){searched++;},setChatInput(v){model.chatInput=v;},deleteConsultation(){deleted++;}};
 const hooks={useState:v=>{const i=cursor++;if(!(i in slots))slots[i]=v;return[slots[i],v=>slots[i]=typeof v==='function'?v(slots[i]):v]},useRef:v=>{const i=cursor++;return slots[i]??(slots[i]={current:v})},useEffect(){}};
 const {ConsultationChat}=load('src/screens/AiScreen.tsx',{
  react:hooks,'react-native':{...native,Keyboard:{dismiss(){}},Pressable:'Pressable',ScrollView:'ScrollView',TextInput:'TextInput',useWindowDimensions:()=>({width:360,fontScale:1})},
  '../features/app/context':{useDrMAS:()=>model},'../components/ui':{...ui,AppIcon:'AppIcon',StatusMessage:'StatusMessage'},
  '../components/ChatMessage':{ChatMessage:'ChatMessage'},'../components/EvidenceDetailsModal':{EvidenceDetailsModal:'EvidenceDetailsModal'},
  '../components/FeatureModal':{FeatureModal:'FeatureModal'},'../services/rag':{ragConfigured:()=>false},'expo-router':{useRouter:()=>({push(){}})},
  '../components/EmergencyCallButton':{EmergencyCallButton:'EmergencyCallButton'},'../components/HeadacheConversation':{HeadacheConversation:'HeadacheConversation'},'../components/HiraReferencePanel':{HiraReferencePanel:'HiraReferencePanel'},
 });
 const render=()=>{cursor=0;return nodes(ConsultationChat());};
 let tree=render();assert.equal(tree.find(n=>n.props?.label==='보내기').props.disabled,false);
 tree.find(n=>n.props?.label==='보내기').props.onPress();assert.equal(sent,1);assert.equal(searched,0);
 assert.ok(render().some(n=>n.type==='EmergencyCallButton'));
 assert.ok(text(ConsultationChat()).includes('과거 상담 기록'));
 render().find(n=>n.props?.label==='상담 기록').props.onPress();
 render().find(n=>n.props?.label==='상담 기록 전체 삭제').props.onPress();assert.equal(deleted,0);
 tree=render();assert.ok(tree.some(n=>n.type==='FeatureModal'&&n.props.visible&&n.props.title==='상담 기록 확인'));
 tree.find(n=>n.props?.label==='삭제 확인').props.onPress();assert.equal(deleted,1);
});
test('health guidance renders only explicit exact original sections and emergency sources without generation',()=>{
 const {ChatMessage,healthEvidenceSections}=load('src/components/ChatMessage.tsx',{'react-native':native,'./ui':ui});
 const quote='원인: 합성 원인 표식입니다.\n생활 관리: 합성 관리 표식입니다.\n위험 신호: 합성 위험 표식입니다.';
 const sections=healthEvidenceSections(quote);assert.equal(sections.length,3);
 for(const section of sections)assert.ok(quote.includes(section.quote));
 assert.equal(healthEvidenceSections('관련 정보가 없는 합성 원문입니다.').length,0);
 const tree=ChatMessage({message:{id:1,sender:'assistant',status:'local_evidence',outcome:'response',text:'',sources:[{...source,attribution:undefined,title:'두통 합성 검증',quote}]},onEvidence(){}});
 assert.ok(text(tree).includes('자료에 없는'));assert.ok(text(tree).includes('합성 관리 표식'));
 const urgent=ChatMessage({message:{id:2,sender:'assistant',status:'emergency',outcome:'response',text:'일반 안내'},question:'새롭게 언어 장애가 생겼어요',onEvidence(){}});
 assert.ok(text(urgent).includes('뇌졸중'));assert.ok(text(urgent).includes('확정한 것은 아니'));
 assert.equal(nodes(urgent).filter(n=>n.props?.accessibilityRole==='link').length,3);
});

test('followup management retains only current topic context and resets without prior messages',()=>{
 const {followupSearchQuestion}=load('src/services/consultationFlow.ts',{});
 const first='배가 아프고 설사를 해요', next='그러면 어떻게 관리해야 해요?';
 const query=followupSearchQuestion(next,first);
 assert.equal(query,first+'\n추가 질문: '+next);
 assert.ok(followupSearchQuestion('집에서는 어떻게 해야 하나요?',query).startsWith(query));
 assert.equal(followupSearchQuestion('기침이 계속 나요',query),'기침이 계속 나요');
 assert.equal(followupSearchQuestion(next),next,'new consultation/account has no prior context');
 assert.equal(followupSearchQuestion('오늘 날씨가 궁금해요','날씨 알려주세요'),'오늘 날씨가 궁금해요');
});

test('health excerpts appear once with prevention label and contextual evidence limitation',()=>{
 const {ChatMessage}=load('src/components/ChatMessage.tsx',{'react-native':native,'./ui':ui});
 const quote='관련 질환: 합성 증상 설명입니다.\n생활 관리: 합성 예방 정보입니다.';
 const tree=ChatMessage({message:{id:1,sender:'assistant',status:'local_evidence',outcome:'response',text:'',sources:[{...source,documentId:'hira-public-test',title:'복통 합성 검증',quote}]},onEvidence(){}});
 const displayed=nodes(tree).filter(n=>n.type==='Text').map(n=>n.props.children);
 assert.equal(displayed.filter(value=>typeof value==='string'&&value.includes('합성 예방 정보입니다.')).length,1);
 assert.equal(displayed.filter(value=>value==='생활 관리').length,0);
 assert.ok(text(tree).includes('예방 정보 · 증상 발생 후 대처법'));
 assert.ok(text(tree).includes('임상 검토는 아직 완료되지'));
 assert.ok(displayed.includes('생활 관리: 합성 예방 정보입니다.'),'exact original preserved');
 const missing=ChatMessage({message:{id:2,sender:'assistant',status:'insufficient_evidence',outcome:'response',text:''},question:'배가 아프고 설사를 해요\n추가 질문: 그러면 어떻게 관리해야 해요?',onEvidence(){}});
 assert.ok(text(missing).includes('배의 불편함도 함께 검색했지만'));
 assert.ok(text(missing).includes('추측하지 않을게요'));
});

test('information-first chat searches immediately, retains followups and opens existing services without mandatory interviews',async()=>{
 let cursor=0;const slots=[],sent=[];
 const previous='머리가 계속 아파요\n[문진 답변]\n시작 시점: 오늘 시작됐어요';
 const model={messages:[{id:1,sender:'user',text:previous},{id:2,sender:'assistant',outcome:'response',status:'insufficient_evidence',text:'근거 부족'}],chatInput:'이럴 때 병원에 가야 하나요?',setChatInput:v=>model.chatInput=v,sendChat:(q,clear)=>{sent.push(q);if(clear)model.chatInput='';},chatLoading:false};
 const hooks={useState:v=>{const i=cursor++;if(!(i in slots))slots[i]=v;return[slots[i],v=>slots[i]=typeof v==='function'?v(slots[i]):v]},useRef:v=>{const i=cursor++;return slots[i]??(slots[i]={current:v})},useEffect(){}};
 const {ConsultationChat:AiScreen}=load('src/screens/AiScreen.tsx',{
  react:hooks,'react-native':{...native,Platform:{OS:'web'},Keyboard:{dismiss(){}},Pressable:'Pressable',ScrollView:'ScrollView',TextInput:'TextInput',useWindowDimensions:()=>({width:360,fontScale:1})},
  '../features/app/context':{useDrMAS:()=>model},'../components/ui':{...ui,AppIcon:'AppIcon',StatusMessage:'StatusMessage'},
  '../components/ChatMessage':{ChatMessage:'ChatMessage'},'../components/EvidenceDetailsModal':{EvidenceDetailsModal:'EvidenceDetailsModal'},
  '../components/FeatureModal':{FeatureModal:'FeatureModal'},'../services/rag':{ragConfigured:()=>true},'expo-router':{useRouter:()=>({push(){}})},
  '../components/EmergencyCallButton':{EmergencyCallButton:'EmergencyCallButton'},'../components/HeadacheConversation':{HeadacheConversation:'HeadacheConversation'},'../components/HiraReferencePanel':{HiraReferencePanel:'HiraReferencePanel'},
 });
 const render=()=>{cursor=0;return nodes(AiScreen())};
 render().find(n=>n.type==='TextInput').props.onFocus();render().find(n=>n.type==='TextInput').props.onBlur();assert.equal(render().find(n=>n.type==='TextInput').props.numberOfLines,4,'web blur must not move send before pointer-up');
 render().find(n=>n.props?.label==='보내기').props.onPress();
 assert.ok(sent[0].startsWith(previous));assert.ok(sent[0].includes('추가 질문: 이럴 때 병원에 가야 하나요?'));assert.equal(model.chatInput,'');
 await Promise.resolve(); // Separate user input events, after the submit microtask.
 model.chatInput='배가 아프고 속이 불편해요';render().find(n=>n.props?.label==='보내기').props.onPress();
 assert.equal(sent[1],'배가 아프고 속이 불편해요');assert.equal(render().some(n=>n.type==='HeadacheConversation'),false);
 await Promise.resolve();
 render().find(n=>n.props?.label==='병원 찾기').props.onPress();assert.ok(render().some(n=>n.type==='PlacesContent'&&n.props.initialCategory==='hospital'));
 render().find(n=>n.props?.label==='의약품 공식 정보 조회').props.onPress();assert.ok(render().some(n=>n.type==='PublicMedicineInfo'));
 model.messages.push({id:10,sender:'user',text:'배가 아프고 속이 불편해요'});
 render().find(n=>n.props?.label==='선택 문진으로 더 확인').props.onPress();
 const interview=render().filter(n=>n.type==='HeadacheConversation').at(-1);
 assert.equal(interview.props.question,'배가 아프고 속이 불편해요');assert.equal(interview.props.collectBeforeSearch,true);assert.equal(interview.props.searchOnComplete,true);assert.equal(sent.length,2);
 const typed=[];interview.props.inputHandlerRef.current=value=>{typed.push(value);return 'accepted';};
 model.chatInput='어제 저녁부터요';render().find(n=>n.props?.label==='보내기').props.onPress();
 assert.deepEqual(typed,['어제 저녁부터요']);assert.equal(sent.length,2);assert.equal(model.chatInput,'');
 await Promise.resolve();
 interview.props.inputHandlerRef.current=()=> 'rejected';model.chatInput='보존할 초안';render().find(n=>n.props?.label==='보내기').props.onPress();assert.equal(model.chatInput,'보존할 초안');
 interview.props.inputHandlerRef.current=null;
 interview.props.onSearch('복통 테스트 문맥');assert.equal(sent[2],'복통 테스트 문맥');
 model.messages.push({id:3,sender:'user',text:previous},{id:4,sender:'assistant',outcome:'error',text:'시간 초과'});
 model.chatInput='별도로 작성 중인 초안';
 render().find(n=>n.props?.label==='같은 질문 다시 시도').props.onPress();
 assert.equal(sent.at(-1),previous);assert.equal(model.chatInput,'별도로 작성 중인 초안');
 const shown=render().filter(n=>n.type==='ChatMessage'&&n.props.message.sender==='user').map(n=>n.props.message.text);
 assert.ok(shown.every(t=>!t.includes('[문진 답변]')));
 assert.ok(model.messages[0].text.includes('[문진 답변]'),'display must not mutate request history');
 model.messages.at(-1).outcome='cancelled';
 render().find(n=>n.props?.label==='같은 질문 다시 시도').props.onPress();
 assert.equal(sent.at(-1),previous);assert.equal(model.chatInput,'별도로 작성 중인 초안');
 // Even without selected-answer metadata, a contextual followup must not launch
 // another automatic interview after each insufficient-evidence response.
 const followup='어제부터 머리가 아파요\n추가 질문: 이럴 때 병원에 가야 하나요?';
 model.messages.push({id:5,sender:'user',text:followup},{id:6,sender:'assistant',outcome:'response',status:'insufficient_evidence',text:'근거 부족'});
 assert.equal(render().some(n=>n.type==='HeadacheConversation'&&n.props.question===followup),false);
});

test('missing evidence gives a plain next step without hiding errors or pretending a source exists',()=>{
 const {ChatMessage}=load('src/components/ChatMessage.tsx',{'react-native':native,'./ui':ui});
 const tree=ChatMessage({message:{id:1,sender:'assistant',status:'insufficient_evidence',outcome:'response',text:'serialized response'},onEvidence(){}});
 assert.ok(text(tree).includes('현재 등록된 공식 자료'));assert.ok(text(tree).includes('추측하지 않을게요'));
 assert.equal(text(tree).includes('serialized response'),false);assert.equal(nodes(tree).some(n=>n.type==='Action'),false);
 const error=ChatMessage({message:{id:2,sender:'assistant',outcome:'error',text:'연결 오류'},onEvidence(){}});
 assert.ok(text(error).includes('연결 오류'));assert.equal(text(error).includes('현재 등록된 공식 자료'),false);
});

test('medicine preview prioritizes exact requested sections and retains the full original source for details',()=>{
 const {ChatMessage,questionQuote}=load('src/components/ChatMessage.tsx',{'react-native':native,'./ui':ui});
 // Non-clinical authored fixture only. No actual medicine record is registered.
 const quote='의약품명: 합성제품\n효능: 합성 효능 표식입니다.\n사용법: 합성 사용법 표식입니다.\n주의사항: 합성 주의 표식입니다. 조건을 생략하지 않습니다.\n보관방법: 합성 보관 표식입니다. 두 번째 가상 문장도 유지합니다.';
 for(const [question,expected] of [
  ['합성제품 보관방법','보관방법: 합성 보관 표식입니다. 두 번째 가상 문장도 유지합니다.'],
  ['합성제품 복용법','사용법: 합성 사용법 표식입니다.'],
  ['합성제품 주의사항','주의사항: 합성 주의 표식입니다. 조건을 생략하지 않습니다.'],
  ['합성제품 효능','효능: 합성 효능 표식입니다.'],
 ]){assert.equal(questionQuote(quote,question),expected);assert.ok(quote.includes(expected));}
 assert.equal(questionQuote(quote,'합성제품 설명'),quote);
 assert.equal(questionQuote('제목 없는 합성 본문','합성제품 보관방법'),'제목 없는 합성 본문');
 const multiple=questionQuote(quote,'합성제품 주의사항과 보관방법');assert.ok(quote.includes(multiple));assert.ok(multiple.startsWith('주의사항:'));assert.ok(multiple.includes('보관방법:'));
 const message={id:1,sender:'assistant',outcome:'response',status:'local_evidence',text:quote,sources:[{...source,documentId:'mfds-easy-000000000',publisher:'식품의약품안전처',quote}]};
 const original=JSON.stringify(message);let opened=0;
 const all=nodes(ChatMessage({message,question:'합성제품 보관방법',onEvidence:()=>opened++}));
 assert.ok(all.some(n=>n.type==='Text'&&n.props.children==='질문 관련 원문 · 일부 미리보기'));
 assert.ok(all.some(n=>n.type==='Text'&&n.props.children===questionQuote(quote,'보관방법')));
 all.find(n=>n.props?.label==='원문 전체와 출처 보기').props.onPress();assert.equal(opened,1);
 assert.equal(JSON.stringify(message),original,'full quotation, IDs and attribution must stay unchanged');
});

test('composer collapses without clearing drafts or jumping history and expands the same input on focus',()=>{
 let cursor=0,scrolled=0,blurred=0,dismissed=0,registered=false,remove=0;const slots=[],listeners={};
 const model={messages:[{id:1,sender:'user',text:'합성 질문'},{id:2,sender:'assistant',text:'긴 원문 '.repeat(100)}],chatInput:'작성 중인\n두 줄 초안',setChatInput:v=>{model.chatInput=v},sendChat(){},chatLoading:false};
 const hooks={useState:v=>{const i=cursor++;if(!(i in slots))slots[i]=v;return[slots[i],v=>slots[i]=typeof v==='function'?v(slots[i]):v]},useRef:v=>{const i=cursor++;return slots[i]??(slots[i]={current:v})},useEffect:fn=>{if(!registered){registered=true;fn()}}};
 const keyboard={dismiss(){dismissed++},addListener:(event,callback)=>{listeners[event]=callback;return{remove:()=>remove++}}};
 const {ConsultationChat:AiScreen}=load('src/screens/AiScreen.tsx',{
  react:hooks,'react-native':{...native,Keyboard:keyboard,Pressable:'Pressable',ScrollView:'ScrollView',TextInput:'TextInput',useWindowDimensions:()=>({width:320,fontScale:1.5})},
  '../features/app/context':{useDrMAS:()=>model},'../components/ui':{...ui,AppIcon:'AppIcon',StatusMessage:'StatusMessage'},
  '../components/ChatMessage':{ChatMessage:'ChatMessage'},'../components/EvidenceDetailsModal':{EvidenceDetailsModal:'EvidenceDetailsModal'},
  '../components/FeatureModal':{FeatureModal:'FeatureModal'},'../services/rag':{ragConfigured:()=>true},'expo-router':{useRouter:()=>({push(){}})},
  '../components/EmergencyCallButton':{EmergencyCallButton:'EmergencyCallButton'},'../components/HeadacheConversation':{HeadacheConversation:'HeadacheConversation'},'../components/HiraReferencePanel':{HiraReferencePanel:'HiraReferencePanel'},
 });
 const render=()=>{cursor=0;return nodes(AiScreen())};
 let all=render(),field=all.find(n=>n.type==='TextInput'),list=all.find(n=>n.type==='ScrollView');
 list.props.ref.current={scrollToEnd:()=>scrolled++};field.props.ref.current={blur:()=>blurred++};
 assert.equal(field.props.style.at(-1).maxHeight,56);assert.equal(field.props.numberOfLines,1);
 assert.equal(all.some(n=>n.props?.accessibilityLabel==='음성 입력 안내 · 준비 중'),false);
 field.props.onFocus();all=render();field=all.find(n=>n.type==='TextInput');
 assert.equal(field.props.style.at(-1).maxHeight,140);assert.equal(field.props.numberOfLines,4);
 assert.equal(field.props.multiline,true);assert.equal(field.props.value,model.chatInput);
 assert.ok(all.some(n=>n.type==='View'&&n.props.style?.flexDirection==='column'));
 field.props.onChangeText('수정한 초안\n계속 작성');
 list=all.find(n=>n.type==='ScrollView');list.props.onScrollBeginDrag();
 list.props.onScroll({nativeEvent:{contentOffset:{y:100},layoutMeasurement:{height:300},contentSize:{height:2000}}});list.props.onScrollEndDrag();
 all=render();field=all.find(n=>n.type==='TextInput');
 assert.equal(field.props.style.at(-1).maxHeight,56);assert.equal(field.props.value,'수정한 초안\n계속 작성');assert.equal(dismissed,1);
 const current=all.find(n=>n.type==='ScrollView');current.props.onLayout();current.props.onContentSizeChange();assert.equal(scrolled,0);
 const latest=all.find(n=>n.props?.label==='최근 대화로 이동');assert.ok(latest);assert.equal(nodes(current).includes(latest),false);latest.props.onPress();assert.equal(scrolled,1);
 field.props.onFocus();listeners.keyboardDidHide();all=render();field=all.find(n=>n.type==='TextInput');
 assert.equal(field.props.style.at(-1).maxHeight,56);assert.equal(field.props.value,'수정한 초안\n계속 작성');assert.equal(blurred,1);
 assert.equal(nodes(all.find(n=>n.type==='ScrollView')).some(n=>n.type==='TextInput'),false);
 assert.equal(remove,0);
});

test('interview stays between earlier and later RAG messages; explicit answers resume scrolling but reading history does not jump',()=>{
 let cursor=0,scrolled=0;const slots=[];
 const ref={current:{scrollToEnd:()=>scrolled++}},following={current:true};
 const model={messages:[{id:1,sender:'user',text:'이전 질문'},{id:2,sender:'assistant',text:'이전 답변'}],chatInput:'머리가 아파요',setChatInput:v=>{model.chatInput=v;},sendChat(){},chatLoading:false};
 const {ConsultationChat:AiScreen}=load('src/screens/AiScreen.tsx',{
  react:{useEffect(){},useState:v=>{const i=cursor++;if(!(i in slots))slots[i]=v;return[slots[i],v=>{slots[i]=typeof v==='function'?v(slots[i]):v;}];},useRef:v=>v===null?ref:v===true?following:{current:false}},
  'react-native':{...native,Pressable:'Pressable',ScrollView:'ScrollView',TextInput:'TextInput',useWindowDimensions:()=>({width:320,fontScale:1.5})},
  '../features/app/context':{useDrMAS:()=>model},'../components/ui':{...ui,AppIcon:'AppIcon',StatusMessage:'StatusMessage'},
  '../components/ChatMessage':{ChatMessage:'ChatMessage'},'../components/EvidenceDetailsModal':{EvidenceDetailsModal:'EvidenceDetailsModal'},
  '../components/FeatureModal':{FeatureModal:'FeatureModal'},'../services/rag':{ragConfigured:()=>true},'expo-router':{useRouter:()=>({push(){}})},
  '../components/EmergencyCallButton':{EmergencyCallButton:'EmergencyCallButton'},'../components/HeadacheConversation':{HeadacheConversation:'HeadacheConversation'},'../components/HiraReferencePanel':{HiraReferencePanel:'HiraReferencePanel'},
 });
 const render=()=>{cursor=0;return nodes(AiScreen());};
 let all=render();all.find(n=>n.props?.label==='보내기').props.onPress();all=render();
 const list=all.find(n=>n.type==='ScrollView');
 let timeline=nodes(list).filter(n=>['ChatMessage','HeadacheConversation'].includes(n.type));
 assert.deepEqual(timeline.map(n=>n.type),['ChatMessage','ChatMessage','HeadacheConversation']);
 const interview=timeline.at(-1);assert.equal(interview.props.question,'머리가 아파요');assert.equal(interview.props.active,true);
 const compactInput=all.find(n=>n.type==='TextInput');assert.equal(compactInput.props.style.at(-1).minHeight,56);
 assert.equal(all.some(n=>n.props?.accessibilityLabel==='음성 입력 안내 · 준비 중'),false);
 list.props.onContentSizeChange();assert.equal(scrolled,1);
 list.props.onScroll({nativeEvent:{contentOffset:{y:0},layoutMeasurement:{height:300},contentSize:{height:1200}}});
 list.props.onContentSizeChange();assert.equal(scrolled,2,'layout-driven scroll events must not disable following');
 list.props.onScrollBeginDrag();
 list.props.onScroll({nativeEvent:{contentOffset:{y:0},layoutMeasurement:{height:300},contentSize:{height:1200}}});
 list.props.onScrollEndDrag();
 list.props.onContentSizeChange();assert.equal(scrolled,2);
 interview.props.onAdvance();list.props.onContentSizeChange();assert.equal(scrolled,3);
 model.messages.push({id:3,sender:'user',text:'머리가 아파요'},{id:4,sender:'assistant',text:'자료 응답',status:'insufficient_evidence',outcome:'response'});
 all=render();timeline=nodes(all.find(n=>n.type==='ScrollView')).filter(n=>['ChatMessage','HeadacheConversation'].includes(n.type));
 assert.deepEqual(timeline.map(n=>n.type),['ChatMessage','ChatMessage','HeadacheConversation','ChatMessage','HeadacheConversation']);
 assert.equal(timeline[2].props.active,false);
 const followup=all.filter(n=>n.type==='HeadacheConversation').at(-1);assert.equal(followup.props.followup,true);assert.equal(followup.props.active,true);
 assert.equal(all.some(n=>n.props?.label==='원하면 두통 추가 문진'),false);
 assert.equal(all.filter(n=>n.type==='HeadacheConversation').length,2);
 all=render();assert.equal(all.filter(n=>n.type==='HeadacheConversation').length,2,'same response must not restart questions');
 model.messages.push({id:5,sender:'user',text:'머리가 아파요'},{id:6,sender:'assistant',text:'서버 오류',outcome:'error'});
 all=render();assert.equal(all.some(n=>n.props?.label==='원하면 두통 추가 문진'),false,'API errors are not insufficient evidence');
});

test('chat shows exact quote preview with one details action and never implies free generation',()=>{
 const {ChatMessage}=load('src/components/ChatMessage.tsx',{'react-native':native,'./ui':ui});let opened=0;
 const message={sender:'assistant',status:'local_evidence',outcome:'response',sources:[source],text:'LONG SERIALIZED REPLY'};
 const tree=ChatMessage({message,onEvidence:()=>opened++}),all=nodes(tree);
 const preview=all.find(n=>n.props?.numberOfLines===3);assert.equal(preview.props.children,source.quote);
 assert.ok(!text(tree).includes(message.text));assert.ok(text(tree).includes('새로운 의료 조언을 만든 답변은 아니에요'));
 assert.equal(all.filter(n=>n.type==='Action').length,1);all.find(n=>n.type==='Action').props.onPress();assert.equal(opened,1);
 assert.equal(nodes(ChatMessage({message:{sender:'assistant',text:'출처 없는 안내'},onEvidence(){}})).filter(n=>n.type==='Action').length,0);
 const failed=ChatMessage({message:{...message,outcome:'error',text:'연결 오류'},onEvidence(){}});
 assert.ok(text(failed).includes('연결 오류'));assert.equal(nodes(failed).some(n=>n.props?.numberOfLines),false);
 const mine=ChatMessage({message:{sender:'user',text:'합성 질문'},onEvidence(){}});assert.ok(text(mine).includes('내 질문'));
 const synthetic=ChatMessage({message:{...message,sources:[{...source,documentId:'synthetic_card_alpha',publisher:'Dr.MAS 합성 테스트'}]},onEvidence(){}});
 assert.ok(text(synthetic).includes('실제 의료정보가 아니에요'));assert.equal(text(synthetic).includes('공식 자료의 원문'),false);
 const urgent=ChatMessage({message:{...message,status:'emergency',text:'응급 안내 원문'},onEvidence(){}});
 assert.ok(text(urgent).includes('응급 안내 원문'));assert.equal(nodes(urgent).some(n=>n.type==='Action'),false);
});
test('source modal preserves exact provenance and adds a separate verified policy guide',async()=>{
 let cursor=0;const slots=[],opened=[];
 const hooks={useState:v=>{const i=cursor++;if(!(i in slots))slots[i]=v;return [slots[i],v=>{slots[i]=typeof v==='function'?v(slots[i]):v;}];},useRef:v=>({current:v}),useEffect(){}};
 const links=load('src/services/evidenceLinks.ts',{});
 const {EvidenceDetailsModal}=load('src/components/EvidenceDetailsModal.tsx',{
  react:hooks,'react-native':{...native,Linking:{openURL:async url=>opened.push(url)}},'./ui':ui,'./FeatureModal':{FeatureModal:'FeatureModal'},
  '../services/ragClient':{safeRagSourceUrl:url=>{const u=new URL(url);if(u.protocol!=='https:'||u.username)throw Error();return u.href;}},'../services/evidenceLinks':links,
 });
 const original='Original server response including disclaimer';
 const render=()=>{cursor=0;return EvidenceDetailsModal({message:original,sources:[source],onClose(){}});};
 let tree=render();assert.equal(tree.props.fullHeight,true);assert.ok(text(tree).includes(source.quote));assert.ok(!text(tree).includes(original));
 const actions=nodes(tree).filter(n=>n.type==='Action');
 for(const label of ['공식 데이터셋 링크 열기 ↗','이용 조건 원본 기록 열기 (JSON) ↗','공식 이용정책 안내 읽기 ↗'])actions.find(n=>n.props.label===label).props.onPress();
 await new Promise(r=>setImmediate(r));
 assert.deepEqual(opened,[source.sourceUrl,source.attribution.termsUrl,'https://www.data.go.kr/ugs/selectPortalPolicyView.do']);
 actions.find(n=>n.props.label==='받은 응답 전체 펼치기').props.onPress();tree=render();assert.ok(text(tree).includes(original));
 assert.equal(links.evidenceLinkInfo('https://example.org/unknown.json').guideUrl,undefined);
 const empty=EvidenceDetailsModal({message:'출처: fake https://example.org',sources:[],onClose(){}});
 assert.equal(nodes(empty).some(n=>n.type==='Action'),false);
});
test('evidence modal reserves header/footer space and bounds scrolling on compact screens',()=>{
 const {FeatureModal}=load('src/components/FeatureModal.tsx',{
  'react-native':{...native,Modal:'Modal',KeyboardAvoidingView:'KeyboardAvoidingView',ScrollView:'ScrollView',Platform:{OS:'android'},useWindowDimensions:()=>({width:320,height:420})},
  'react-native-safe-area-context':{useSafeAreaInsets:()=>({top:24,bottom:20,left:0,right:0})},'./ui':ui,
 });
 const all=nodes(FeatureModal({visible:true,fullHeight:true,title:'긴 제목',children:'긴 원문'.repeat(500),onClose(){}}));
 const card=all.find(n=>n.props?.accessibilityViewIsModal),children=card.props.children;
 assert.ok(card.props.style.height<=376);assert.equal(children[0].props.style.flexShrink,0);assert.equal(children[2].props.style.flexShrink,0);
 assert.equal(children[1].type,'ScrollView');assert.equal(children[1].props.style.minHeight,0);assert.equal(children[1].props.style.flexGrow,1);
});

test('wellness chat suggestions only fill input; latest conversations scroll and composer remains outside list',()=>{
 let sent=0,scrolled=0,cancelled=0,configured=true;const requests=[],routes=[];
 const ref={current:{scrollToEnd:()=>scrolled++}};
 const following={current:true};
 const model={messages:[],chatInput:'',setChatInput:value=>{model.chatInput=value;},sendChat:q=>{sent++;requests.push(q);},chatLoading:false,cancelChat:()=>cancelled++};
 const {ConsultationChat:AiScreen}=load('src/screens/AiScreen.tsx',{
  react:{useEffect(){},useRef:value=>value===null?ref:value===true?following:{current:false},useState:v=>[v,()=>{}]},
  'react-native':{...native,Pressable:'Pressable',ScrollView:'ScrollView',TextInput:'TextInput',useWindowDimensions:()=>({width:320,fontScale:1.5})},
  '../features/app/context':{useDrMAS:()=>model},'../components/ui':{...ui,AppIcon:'AppIcon',StatusMessage:'StatusMessage'},
  '../components/ChatMessage':{ChatMessage:'ChatMessage'},'../components/EvidenceDetailsModal':{EvidenceDetailsModal:'EvidenceDetailsModal'},
  '../components/FeatureModal':{FeatureModal:'FeatureModal'},'../services/rag':{ragConfigured:()=>configured},
  'expo-router':{useRouter:()=>({push:route=>routes.push(route)})},
  '../components/EmergencyCallButton':{EmergencyCallButton:'EmergencyCallButton'},
  '../components/HeadacheConversation':{HeadacheConversation:'HeadacheConversation'}, '../components/HiraReferencePanel':{HiraReferencePanel:'HiraReferencePanel'},
 });
 let tree=AiScreen(),all=nodes(tree),scroll=all.find(n=>n.type==='ScrollView');
 assert.ok(all.some(n=>n.props?.children==='어디가 불편하세요?'));
 assert.ok(all.some(n=>n.props?.children==='자세히 찾기 ›'));
 assert.equal(all.some(n=>n.props?.accessibilityLabel==='음성 입력 안내 · 준비 중'),false);
 assert.equal(nodes(scroll).some(n=>n.props?.accessibilityLabel==='음성 입력 안내 · 준비 중'),false);
 scroll.props.onContentSizeChange();assert.equal(scrolled,0);
 const suggestion=all.find(n=>n.props?.accessibilityLabel==='추천 질문: 머리가 아파요');
 suggestion.props.onPress();assert.equal(model.chatInput,'머리가 아파요');assert.equal(sent,0);
 model.messages=[{id:1,sender:'user',text:'합성 질문'},{id:2,sender:'assistant',text:'합성 응답'}];
 tree=AiScreen();all=nodes(tree);scroll=all.find(n=>n.type==='ScrollView');scroll.props.onContentSizeChange();assert.equal(scrolled,1);
 assert.equal(nodes(scroll).some(n=>n.type==='TextInput'),false);
 assert.equal(all.filter(n=>n.type==='ScrollView').length,1);
 assert.equal(all.filter(n=>n.type==='ChatMessage').length,2);
 all.find(n=>n.props?.label==='병원 찾기').props.onPress();
 all.find(n=>n.props?.label==='약국 찾기').props.onPress();
 assert.equal(JSON.stringify(routes),JSON.stringify([
  {pathname:'/places',params:{category:'hospital'}},{pathname:'/places',params:{category:'pharmacy'}}
 ]));
 model.messages[1].outcome='response';model.messages[1].status='emergency';
 const emergencyNodes=nodes(AiScreen());
 assert.equal(emergencyNodes.some(n=>n.type==='EmergencyCallButton'),true);
 assert.equal(emergencyNodes.some(n=>n.props?.label==='약국 찾기'),false);
 delete model.messages[1].status;
 scroll.props.onScrollBeginDrag();scroll.props.onScroll({nativeEvent:{contentOffset:{y:0},layoutMeasurement:{height:400},contentSize:{height:1200}}});scroll.props.onScrollEndDrag();
 scroll.props.onContentSizeChange();assert.equal(scrolled,1,'reading older messages must not force a jump');
 model.chatInput='합성 자료 질문';all=nodes(AiScreen());all.find(n=>n.props?.label==='보내기').props.onPress();assert.equal(sent,1);
 scroll.props.onContentSizeChange();assert.equal(scrolled,2,'explicit send resumes following');
 model.chatLoading=true;all=nodes(AiScreen());assert.equal(all.find(n=>n.props?.label==='확인 중').props.disabled,true);
 all.find(n=>n.props?.label==='검색 요청 취소').props.onPress();assert.equal(cancelled,1);
 model.chatLoading=false;configured=false;all=nodes(AiScreen());assert.equal(all.find(n=>n.props?.label==='보내기').props.disabled,true);
 const sentBefore=sent;
 for(const draft of ['ㅁ','머','머리','머리가 아파요','머리가 조금 아파요','']) {
  const input=all.find(n=>n.type==='TextInput');assert.equal(input.props.editable,true);
  assert.notEqual(input.props.readOnly,true);assert.notEqual(input.props.disabled,true);
  input.props.onChangeText(draft);all=nodes(AiScreen());assert.equal(all.find(n=>n.type==='TextInput').props.value,draft);
 }
 model.chatInput='머리가 아파요';all=nodes(AiScreen());all.find(n=>n.props?.label==='보내기').props.onPress();
 assert.equal(sent,sentBefore);assert.equal(model.chatInput,'머리가 아파요','blocked send must preserve draft');
 configured=true;model.messages[1].outcome='error';all=nodes(AiScreen());
 all.find(n=>n.props?.label==='같은 질문 다시 시도').props.onPress();assert.equal(requests.at(-1),'합성 질문');
 model.chatLoading=true;model.chatStage='session';assert.ok(nodes(AiScreen()).some(n=>n.type==='StatusMessage'&&n.props.children==='로그인 상태를 확인하고 있어요.'));
 assert.equal(nodes(AiScreen()).some(n=>n.props?.label==='같은 질문 다시 시도'),false);
 model.chatStage='http';assert.ok(nodes(AiScreen()).some(n=>n.type==='StatusMessage'&&n.props.children.includes('응답을 기다리고 있어요.')));
 model.chatStage='response';assert.ok(nodes(AiScreen()).some(n=>n.type==='StatusMessage'&&n.props.children==='받은 자료와 출처를 확인하고 있어요.'));
});

test('patient home keeps unavailable metrics honest and preserves family, SOS and shortcuts',()=>{
 const tabs=[],routes=[];
 const {default:PatientHome}=load('src/screens/PatientHome.tsx',{
    react:{useState:value=>[typeof value==='function'?value():value,()=>{}],useRef:value=>({current:value}),useEffect:()=>{}},'react-native':{...native,Pressable:'Pressable'},'expo-router':{useRouter:()=>({push:path=>routes.push(path)})},
  '../features/app/context':{useDrMAS:()=>({user:{id:'synthetic-patient'},meds:[],takenCount:0,sosDelay:47,setTab:tab=>tabs.push(tab)})},
  '../components/ui':{...ui,AppIcon:'AppIcon',Panel:'Panel',QuickTile:'QuickTile',TitleRow:'TitleRow',Chip:'Chip'},
  '../components/DashboardSummaries':{PatientMedicationSummary:'PatientMedicationSummary',PatientConnectionsSummary:'PatientConnectionsSummary'},
  '../components/SosPanel':{SosPanel:'SosPanel'},'../components/HealthNewsCarousel':{HealthNewsCarousel:'HealthNewsCarousel'},'../components/MedicationStatus':{MedicationStatus:'MedicationStatus'},
 });
 const all=nodes(PatientHome());assert.equal(all.filter(n=>n.type==='Text'&&n.props.children==='—').length,2);
 all.find(n=>n.type==='PatientConnectionsSummary').props.onManage();assert.deepEqual(tabs,['settings']);
 assert.equal(all.some(n=>n.type==='SosPanel'),false,'SOS is accessed from the persistent header');
 assert.equal(all.find(n=>n.type==='PatientMedicationSummary').props.compact,true);
 assert.equal(all.find(n=>n.type==='PatientConnectionsSummary').props.compact,true);
 all.find(n=>n.type==='Action'&&n.props.label==='AI 건강 상담 시작').props.onPress();assert.equal(tabs.at(-1),'ai');
 all.find(n=>n.type==='Action'&&n.props.label==='건강 데이터 확인').props.onPress();assert.equal(routes.at(-1),'/health');
 all.find(n=>n.type==='HealthNewsCarousel').props.onMore();assert.equal(tabs.at(-1),'ai');
});

test('header search and menu use distinct drawn shapes without font or heart fallback',()=>{
 const {AppIcon}=load('src/components/AppIcon.tsx',{'expo-symbols':{SymbolView:'SymbolView'},'react-native':native});
 const search=nodes(AppIcon({name:'search'})),menu=nodes(AppIcon({name:'menu'}));
 assert.equal(search.some(n=>n.type==='SymbolView'),false);assert.equal(menu.some(n=>n.type==='SymbolView'),false);
 assert.ok(search.some(n=>n.props?.style?.borderRadius===22&&n.props.style.borderWidth===2));
 assert.equal(menu.filter(n=>n.props?.style?.height===2).length,3);
 assert.equal(AppIcon({name:'unsupported-icon'}).props.children,'?');
});

test('web-specific icon resolution includes search and menu SVGs rather than the health fallback',()=>{
 const {AppIcon}=load('src/components/AppIcon.web.tsx',{'./designTokens':{designTokens:{colors:{primary:'#205C73'}}}});
 const path=name=>nodes(AppIcon({name})).find(n=>n.type==='path').props.d;
 assert.equal(AppIcon({name:'search'}).type,'svg');
 assert.equal(path('menu'),'M3 5h18M3 12h18M3 19h18');
 assert.notEqual(path('search'),path('health'));assert.notEqual(path('menu'),path('health'));
 assert.notEqual(path('unknown'),path('health'));
});

test('dashboard search and menu connect existing destinations and open role-bound SOS only on demand',()=>{
 let cursor=0;const slots=[],tabs=[],routes=[];let history=0;
 const hooks={useState:value=>{const i=cursor++;if(!(i in slots))slots[i]=value;return[slots[i],next=>slots[i]=next]}};
 const module=load('src/components/DashboardNavigation.tsx',{
  react:hooks,'react-native':{...native,Pressable:'Pressable',TextInput:'TextInput'},'expo-router':{useRouter:()=>({push:value=>routes.push(value)})},
  '../features/app/context':{useDrMAS:()=>({user:{id:'synthetic-guardian',role:'guardian'},roleLabel:'보호자',setTab:tab=>tabs.push(tab),sosDelay:30})},
  './ui':{...ui,AppIcon:'AppIcon'},'./FeatureModal':{FeatureModal:'FeatureModal'},'./PublicMedicineInfo':{PublicMedicineInfo:'PublicMedicineInfo'},'./HealthNewsCarousel':{HealthNewsCarousel:'HealthNewsCarousel'},'./SosPanel':{SosPanel:'SosPanel'},
 });
 assert.equal(module.filterDashboardDestinations('약국').length,1);
 assert.equal(module.filterDashboardDestinations('없는기능').length,0);
 const render=()=>{cursor=0;return nodes(module.DashboardNavigation({onHistory:()=>history++}))};
 assert.equal(render().some(n=>n.type==='SosPanel'),false);
 render().find(n=>n.props?.accessibilityLabel==='전체 메뉴').props.onPress();
 const cards=()=>render().find(n=>n.type===module.DashboardDestinationCards);
 cards().props.onOpen(module.dashboardDestinations.find(item=>item.title==='약국 찾기'));assert.equal(routes.at(-1).params.category,'pharmacy');
 cards().props.onOpen(module.dashboardDestinations.find(item=>item.title==='상담 기록'));assert.equal(history,1);
 cards().props.onOpen(module.dashboardDestinations.find(item=>item.title==='복약 관리'));assert.equal(tabs.at(-1),'medication');
 render().find(n=>n.props?.label==='SOS').props.onPress();assert.equal(render().find(n=>n.type==='SosPanel').props.actor.role,'guardian');
});

test('existing Expo symbol library maps navigation and legacy tile icons consistently',()=>{
 const {AppIcon}=load('src/components/AppIcon.tsx',{'expo-symbols':{SymbolView:'SymbolView'},'react-native':native});
 const home=AppIcon({name:'home'}),legacy=AppIcon({name:'⌂'});
 assert.equal(home.type,'SymbolView');assert.equal(home.props.name.android,'home');
 assert.equal(legacy.props.name.android,home.props.name.android);assert.equal(home.props.accessible,false);
 assert.equal(AppIcon({name:'assistant'}).props.name.web,'chat_bubble');
});

function composerFixture(platform='web') {
 let cursor=0;const slots=[],sent=[];
 const model={messages:[],chatInput:'합성 입력',setChatInput:v=>model.chatInput=v,
  sendChat:(q,clear)=>{sent.push(q);if(clear)model.chatInput='';},chatLoading:false};
 const hooks={useState:v=>{const i=cursor++;if(!(i in slots))slots[i]=v;return[slots[i],v=>slots[i]=typeof v==='function'?v(slots[i]):v]},useRef:v=>{const i=cursor++;return slots[i]??(slots[i]={current:v})},useEffect(){}};
 const {ConsultationChat}=load('src/screens/AiScreen.tsx',{
  react:hooks,'react-native':{...native,Platform:{OS:platform},Pressable:'Pressable',ScrollView:'ScrollView',TextInput:'TextInput',useWindowDimensions:()=>({width:360,fontScale:1})},
  '../features/app/context':{useDrMAS:()=>model},'../components/ui':{...ui,AppIcon:'AppIcon',StatusMessage:'StatusMessage'},
  '../components/ChatMessage':{ChatMessage:'ChatMessage'},'../components/EvidenceDetailsModal':{EvidenceDetailsModal:'EvidenceDetailsModal'},
  '../components/FeatureModal':{FeatureModal:'FeatureModal'},'../services/rag':{ragConfigured:()=>true},'expo-router':{useRouter:()=>({push(){}})},
  '../components/EmergencyCallButton':{EmergencyCallButton:'EmergencyCallButton'},'../components/HeadacheConversation':{HeadacheConversation:'HeadacheConversation'},'../components/HiraReferencePanel':{HiraReferencePanel:'HiraReferencePanel'},
 });
 return {model,sent,render(){cursor=0;return nodes(ConsultationChat());}};
}
test('web composer Enter sends once; Shift Enter and IME retain native editing',async()=>{
 const app=composerFixture();let prevented=0;
 const original=app.render(),input=original.find(n=>n.type==='TextInput');
 const key=extra=>input.props.onKeyPress({nativeEvent:{key:'Enter',...extra},preventDefault(){prevented++;}});
 key({shiftKey:true});key({isComposing:true});key({keyCode:229});
 assert.equal(app.sent.length,0);assert.equal(prevented,0);
 key({});original.find(n=>n.props?.label==='보내기').props.onPress();key({repeat:true});
 assert.equal(app.sent.length,1);assert.equal(prevented,2);
 await Promise.resolve();
 app.model.chatInput=' \n ';app.render().find(n=>n.type==='TextInput').props.onKeyPress({nativeEvent:{key:'Enter'},preventDefault(){}});
 assert.equal(app.sent.length,1);
 app.model.chatInput='다음 합성 입력';app.model.chatLoading=true;
 app.render().find(n=>n.type==='TextInput').props.onKeyPress({nativeEvent:{key:'Enter'},preventDefault(){}});
 assert.equal(app.sent.length,1);
 app.model.chatLoading=false;app.render().find(n=>n.props?.label==='보내기').props.onPress();
 assert.equal(app.sent.length,2);
});
test('web composer change leaves Android multiline keyboard props unchanged',()=>{
 const app=composerFixture('android'),input=app.render().find(n=>n.type==='TextInput');
 assert.equal(input.props.multiline,true);assert.equal(input.props.onKeyPress,undefined);assert.equal(input.props.onSubmitEditing,undefined);
});
