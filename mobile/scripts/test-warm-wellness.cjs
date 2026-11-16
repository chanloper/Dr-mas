// Synthetic rendering only; no API calls, accounts, health content or SOS sends.
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),ts=require('typescript');
function load(file,mocks={}){const exports={};vm.runInNewContext(ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX,esModuleInterop:true}}).outputText,{exports,URL,Date,require:n=>n==='react/jsx-runtime'?require(n):n in mocks?mocks[n]:(()=>{throw Error(n)})()});return exports;}
const nodes=n=>!n||typeof n!=='object'?[]:Array.isArray(n)?n.flatMap(nodes):[n,...nodes(n.props?.children)];
const feed=load('src/services/healthNews.ts'),tokens=load('src/components/designTokens.ts').designTokens;
const native=Object.fromEntries(['Text','View','ScrollView','Pressable'].map(n=>[n,n]));
const ui={C:{white:tokens.colors.white,sage:tokens.colors.secondaryContainer,container:tokens.colors.surfaceContainer,lavender:tokens.colors.lavender},s:{},Action:'Action',Panel:'Panel',StatusMessage:'StatusMessage'};
const item=(id)=>({contentId:id,title:'합성 제목 '+id,summary:'테스트 작성자가 만든 비의료 가상 본문',category:'합성 테스트',publisher:'테스트 기관',sourceUrl:'https://example.org/'+id,verification:'verified'});
function carousel(items){let slots=[],cursor=0;const scrolls=[],opened=[];const ref={current:{scrollTo:v=>scrolls.push(v)}};
 const hooks={useEffect(){},useRef:()=>ref,useState:initial=>{const i=cursor++;if(!(i in slots))slots[i]=initial;return[slots[i],v=>{slots[i]=typeof v==='function'?v(slots[i]):v;}];}};
 const {HealthNewsCarousel}=load('src/components/HealthNewsCarousel.tsx',{react:hooks,'react-native':{...native,Linking:{openURL:async url=>opened.push(url)}},'./FeatureModal':{FeatureModal:'FeatureModal'},'./ui':ui,'../services/healthNews':feed});
 return{render(){cursor=0;return nodes(HealthNewsCarousel(items===undefined?{}:{items}));},scrolls,opened};
}
test('production feed is empty and cannot invent dates or health headlines',()=>{
 assert.equal(feed.homeHealthNews.length,0);const all=carousel().render();
 assert.ok(all.some(n=>n.props?.children==='건강소식 준비 중'));assert.equal(all.some(n=>n.type==='ScrollView'),false);
 assert.equal(feed.healthNewsDate(item('a')),'날짜 미제공');assert.equal(feed.healthNewsDate({...item('a'),updatedAt:'2026-02-30'}),'날짜 미제공');
 assert.equal(feed.healthNewsDate({...item('a'),updatedAt:'2026-11-09'}),'갱신 2026-11-09');
});
test('feed rejects unreviewed content, duplicate IDs and credential-bearing or insecure URLs',()=>{
 assert.equal(feed.reviewedHealthNews([item('a'),item('a'),{...item('b'),verification:'pending'},{...item('c'),sourceUrl:'http://example.org'},{...item('d'),sourceUrl:'https://example.org?TOKEN=synthetic'}]).length,1);
});

test('feed hides expired registered originals and does not invent refreshed dates',()=>{
 assert.equal(feed.reviewedHealthNews([{...item('expired'),validUntil:'2020-01-01T00:00:00Z'},{...item('invalid'),validUntil:'invalid'}]).length,0);
 assert.equal(feed.reviewedHealthNews([{...item('fresh'),validUntil:new Date(Date.now()+60000).toISOString()}]).length,1);
});
test('swipe offset, arrows, last-page bounds and details share the same reviewed record',async()=>{
 const app=carousel([item('a'),item('b'),item('c')]);let all=app.render();
 const list=all.find(n=>n.type==='ScrollView');assert.equal(list.props.horizontal,true);assert.equal(list.props.directionalLockEnabled,true);
 all.find(n=>n.props?.label==='다음 소식').props.onPress();assert.equal(app.scrolls.at(-1).x,264);
 all=app.render();all.find(n=>n.type==='ScrollView').props.onScroll({nativeEvent:{contentOffset:{x:528}}});
 all=app.render();assert.equal(all.find(n=>n.props?.label==='다음 소식').props.disabled,true);
 const card=all.find(n=>n.props?.accessibilityLabel==='합성 제목 c, 상세 보기');card.props.onPress();
 all=app.render();const modal=all.find(n=>n.type==='FeatureModal');assert.equal(modal.props.visible,true);assert.equal(modal.props.title,'합성 제목 c');
 await all.find(n=>n.props?.label==='공식 원문 열기').props.onPress();assert.deepEqual(app.opened,['https://example.org/c']);
 modal.props.onClose();assert.equal(app.render().find(n=>n.type==='FeatureModal').props.visible,false);
 assert.equal(feed.healthNewsPage(-200,264,3),0);assert.equal(feed.healthNewsPage(9999,264,3),2);
});
test('320/390px layout leaves a next-card hint and preserves senior typography/touch targets',()=>{
 for(const width of [280,320,390]){assert.ok(feed.healthNewsCardWidth(width)<width);const app=carousel([item('a'),item('b')]);let all=app.render();all.find(n=>n.type==='ScrollView').props.onLayout({nativeEvent:{layout:{width}}});
 all=app.render();const card=all.find(n=>n.props?.accessibilityLabel==='합성 제목 a, 상세 보기');assert.equal(card.props.style({pressed:false}).width,feed.healthNewsCardWidth(width));}
 assert.equal(tokens.typography.body,17);assert.equal(tokens.touch,56);
});
test('all normal text/surface pairs and primary actions meet WCAG AA 4.5',()=>{
 function lum(hex){const c=hex.slice(1).match(/../g).map(v=>parseInt(v,16)/255).map(v=>v<=.04045?v/12.92:((v+.055)/1.055)**2.4);return c[0]*.2126+c[1]*.7152+c[2]*.0722;}
 const c=tokens.colors;
 for(const bg of [c.surface,c.white,c.surfaceLow,c.surfaceContainer,c.secondaryContainer,c.lavender])for(const fg of [c.onSurface,c.onSurfaceVariant,c.primary,c.onSecondaryContainer,'#59665F'])assert.ok((Math.max(lum(fg),lum(bg))+.05)/(Math.min(lum(fg),lum(bg))+.05)>=4.5,`${fg} on ${bg}`);
 for(const bg of [c.primary,c.primaryContainer,c.secondary,c.error])assert.ok((lum(c.white)+.05)/(lum(bg)+.05)>=4.5);
});
test('patient home shows account-bound compact summaries and delegates SOS to the header',()=>{
 const tabs=[],user={id:'synthetic-user',name:'테스트'};
 const {default:Home}=load('src/screens/PatientHome.tsx',{'expo-router':{useRouter:()=>({push(){}})},'../services/registeredHealthNews':{loadRegisteredHealthNews:async()=>[]},react:{useEffect(){},useState:fn=>[fn(),()=>{}]},'react-native':{...native,Animated:{View:'AnimatedView',Value:class{}}},'../features/app/context':{useDrMAS:()=>({user,sosDelay:47,setTab:v=>tabs.push(v)})},'../components/ui':{...ui,Chip:'Chip',AppIcon:'AppIcon'},'../components/DashboardSummaries':{PatientMedicationSummary:'Medication',PatientConnectionsSummary:'Family'},'../components/SosPanel':{SosPanel:'SOS'},'../components/HealthNewsCarousel':{HealthNewsCarousel:'News'}});
 const all=nodes(Home()),types=all.map(n=>n.type);assert.ok(types.indexOf('Family')<types.indexOf('News'));assert.ok(types.indexOf('Medication')<types.indexOf('Family'));assert.equal(types.includes('SOS'),false);
 const med=all.find(n=>n.type==='Medication'),family=all.find(n=>n.type==='Family');
 assert.equal(med.props.user,user);assert.equal(family.props.patientId,user.id);assert.equal(med.props.compact,true);assert.equal(family.props.compact,true);
 med.props.onOpen();family.props.onManage();all.find(n=>n.props?.label==='AI 건강 상담 시작').props.onPress();assert.deepEqual(tabs,['medication','settings','ai']);
 assert.equal(new Set([med.key,family.key]).size,2);
});
