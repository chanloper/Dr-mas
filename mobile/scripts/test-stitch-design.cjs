// Design/accessibility and existing navigation checks. No real accounts or calls.
const {test}=require('node:test');const assert=require('node:assert/strict');const fs=require('node:fs');const path=require('node:path');const vm=require('node:vm');const ts=require('typescript');
const root=path.resolve(__dirname,'..');
function load(file,mocks={}){const exports={};vm.runInNewContext(ts.transpileModule(fs.readFileSync(path.join(root,file),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX}}).outputText,{exports,require:n=>n==='react/jsx-runtime'?require(n):n in mocks?mocks[n]:n==='./designTokens'?load('src/components/designTokens.ts'):(()=>{throw Error(n)})()});return exports;}
const nodes=n=>!n||typeof n!=='object'?[]:Array.isArray(n)?n.flatMap(nodes):[n,...nodes(n.props?.children)];
const native={StyleSheet:{create:x=>x,flatten:x=>x},ActivityIndicator:'ActivityIndicator',Pressable:'Pressable',Text:'Text',TextInput:'TextInput',View:'View',ScrollView:'ScrollView'};
const ui=load('src/components/ui.tsx',{react:{useState:v=>[v,()=>{}]},'react-native':native,'./AppIcon':{AppIcon:'AppIcon'}});
function luminance(hex){const channels=hex.slice(1).match(/../g).map(x=>parseInt(x,16)/255).map(x=>x<=.04045?x/12.92:((x+.055)/1.055)**2.4);return channels[0]*.2126+channels[1]*.7152+channels[2]*.0722;}
test('main text/button combinations meet 4.5 contrast and controls retain senior touch targets',()=>{
 for(const [fg,bg] of [[ui.C.ink,ui.C.bg],[ui.C.muted,ui.C.bg],[ui.C.white,ui.C.blue],[ui.C.white,ui.C.green],[ui.C.white,ui.C.danger],[ui.C.onDark,ui.C.dark]]){const l=[luminance(fg),luminance(bg)].sort((a,b)=>b-a);assert.ok((l[0]+.05)/(l[1]+.05)>=4.5);}
 assert.ok(ui.s.action.minHeight>=56);assert.ok(ui.s.input.minHeight>=56);assert.ok(ui.s.paragraph.fontSize>=16);assert.ok(ui.s.paragraph.lineHeight/ui.s.paragraph.fontSize>=1.5);
 for(const small of [true,false]){const button=ui.Action({label:'여러 줄로 표시되는 긴 한국어 확인 버튼',onPress(){},small});assert.equal(button.props.disabled,false);assert.ok(nodes(button).find(n=>n.type==='Text').props.style.at(-1).fontSize>=17);}
});
test('Stitch welcome role cards preserve authenticated entry and do not introduce prototype login or demo data',()=>{
 const roles=[];const {default:Welcome}=load('src/screens/WelcomeScreen.tsx',{react:{},'react-native':native,'expo-router':{Link:'Link'},'../features/app/context':{useDrMAS:()=>({selectRole:r=>roles.push(r)})},'../components/ui':{...ui,Chip:'Chip'}});
 const all=nodes(Welcome());all.find(n=>n.props?.accessibilityLabel==='환자로 시작하기').props.onPress();all.find(n=>n.props?.accessibilityLabel==='보호자로 시작하기').props.onPress();assert.deepEqual(roles,['patient','guardian']);assert.equal(all.find(n=>n.type==='Link').props.href,'/places');
 assert.ok(!JSON.stringify(all).includes('카카오 간편인증'));
});
