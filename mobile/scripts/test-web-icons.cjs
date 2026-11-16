const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),ts=require('typescript');
function load(file,mocks){const exports={};vm.runInNewContext(ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX}}).outputText,{exports,require:n=>n==='react/jsx-runtime'?require(n):mocks[n]});return exports;}
const tokens=load('src/components/designTokens.ts',{});
const web=load('src/components/AppIcon.web.tsx',{'./designTokens':tokens});
test('every supported icon has web SVG artwork without a font or fallback glyph',()=>{
 const names=['home','medication','assistant','services','settings','prescription','places','health','family','sos','call','chevronDown','chevronUp','pulse','sleep'];
 const artwork=new Set();for(const name of names){const icon=web.AppIcon({name,size:30,color:'#205D78'});assert.equal(icon.type,'svg');assert.equal(icon.props.width,30);assert.equal(icon.props['aria-hidden'],'true');assert.equal(icon.props.children.type,'path');assert.ok(icon.props.children.props.d.length>5);artwork.add(icon.props.children.props.d);}
 assert.equal(artwork.size,names.length);
});
test('existing Unicode aliases retain the same semantic SVG and unknown names have a real icon',()=>{
 for(const [alias,name]of [['⌂','home'],['◷','medication'],['✧','assistant'],['♧','family'],['⚠','sos']])assert.equal(web.AppIcon({name:alias}).props.children.props.d,web.AppIcon({name}).props.children.props.d);
 assert.equal(web.AppIcon({name:'unknown'}).props.children.props.d,web.AppIcon({name:'health'}).props.children.props.d);
});
test('document background and focus color agree with Warm Wellness tokens',()=>{
 const html=fs.readFileSync('src/app/+html.tsx','utf8');assert.ok(html.includes(tokens.designTokens.colors.surface));assert.ok(html.includes(tokens.designTokens.colors.primary));
});
