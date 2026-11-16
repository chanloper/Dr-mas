// Element inspection and mocked browser opening only; no patient data or network.
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),ts=require('typescript');
const compile=p=>ts.transpileModule(fs.readFileSync(p,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX}}).outputText;
function nodes(n){return !n||typeof n!=='object'?[]:Array.isArray(n)?n.flatMap(nodes):[n,...nodes(n.props?.children)];}
test('guardian route exposes only public medicine information, patient retains own workflow',()=>{
 const box={exports:{},require:name=>{
  if(name==='react/jsx-runtime')return require(name);
  if(name==='react')return require(name);
  if(name==='../components/FeaturePage')return {FeaturePage:'FeaturePage'};
  if(name==='../components/PublicMedicineInfo')return {PublicMedicineInfo:'PublicMedicineInfo'};
  if(name==='react-native')return {View:'View'};
  return {};
 }};vm.runInNewContext(compile('src/app/prescription.tsx'),box);
 const route=box.exports.default();assert.ok(!route.props.patientOnly);
 const guardian=route.props.children({id:'synthetic-guardian',role:'guardian'});
 assert.equal(guardian.type,'PublicMedicineInfo');assert.equal(nodes(guardian).length,1);
 const patient=route.props.children({id:'synthetic-patient',role:'patient'});
 assert.ok(nodes(patient).some(n=>n.type==='PublicMedicineInfo'));
 assert.ok(nodes(patient).some(n=>typeof n.type==='function'));
});
test('public search opens only the official URL without personal query; DUR remains disabled',async()=>{
 const opened=[];const box={exports:{},require:name=>{
  if(name==='react/jsx-runtime')return require(name);
  if(name==='react')return {useState:()=>[false,()=>{}]};
  if(name==='react-native')return {Text:'Text',View:'View',Linking:{openURL:async url=>opened.push(url)}};
  if(name==='./ui')return {Action:'Action',Panel:'Panel',TitleRow:'TitleRow',StatusMessage:'StatusMessage',s:{}};
  throw Error(name);
 }};vm.runInNewContext(compile('src/components/PublicMedicineInfo.tsx'),box);
 const tree=nodes(box.exports.PublicMedicineInfo()),actions=tree.filter(n=>n.type==='Action');
 assert.equal(actions.find(n=>n.props.label.includes('DUR')).props.disabled,true);
 actions.find(n=>n.props.label.includes('외부 브라우저')).props.onPress();await new Promise(r=>setImmediate(r));
 assert.deepEqual(opened,['https://nedrug.mfds.go.kr/searchDrug']);
});
