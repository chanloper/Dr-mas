// Pure mocks/config only. Never contacts Expo/FCM/Supabase or requests permissions.
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),ts=require('typescript');
const project='55555555-5555-4555-8555-555555555555';
const compile=p=>ts.transpileModule(fs.readFileSync(p,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
function api(){const b={exports:{},__DEV__:true,process:{env:{EXPO_PUBLIC_APP_ENV:'development',EXPO_PUBLIC_NOTIFICATION_DIAGNOSTICS:'1'}}};vm.runInNewContext(compile('src/dev/androidNotificationReadiness.ts'),b);return b;}
const context={enabled:true,platform:'android',expoGo:false,physicalDevice:true,androidPackage:'com.synthetic.fixture',projectId:project,fcmFileConfigured:false};
test('dev-only gate requires all three explicit conditions',()=>{
 const b=api();assert.equal(b.exports.notificationDiagnosticsEnabled(),true);b.__DEV__=false;assert.equal(b.exports.notificationDiagnosticsEnabled(),false);b.__DEV__=true;b.process.env.EXPO_PUBLIC_APP_ENV='production';assert.equal(b.exports.notificationDiagnosticsEnabled(),false);b.process.env.EXPO_PUBLIC_APP_ENV='development';delete b.process.env.EXPO_PUBLIC_NOTIFICATION_DIAGNOSTICS;assert.equal(b.exports.notificationDiagnosticsEnabled(),false);
});
test('Expo Go, web, non-device and disabled checks never import/read native permissions',async()=>{
 const {exports:a}=api();let calls=0;for(const change of [{expoGo:true},{platform:'web'},{physicalDevice:false},{enabled:false}]){const r=await a.inspectAndroidNotifications({...context,...change},async()=>{calls++;throw Error('private');});assert.equal(r.permission,'not_checked');assert.notEqual(r.runtime,'ANDROID_DEVICE');}assert.equal(calls,0);
});
test('permission reads report denied/granted/undetermined without token or registration claims',async()=>{
 const {exports:a}=api();for(const status of ['denied','granted','undetermined']){const r=await a.inspectAndroidNotifications(context,async()=>({status,canAskAgain:false}));assert.equal(r.permission,status);assert.equal(r.canAskAgain,false);assert.equal(r.token,'NOT_REQUESTED');assert.equal(r.serverRegistration,'NOT_IMPLEMENTED');assert.ok(!JSON.stringify(r).includes(project));assert.ok(!JSON.stringify(r).includes(context.androidPackage));}
});
test('missing identifiers remain missing and native failures expose no details',async()=>{
 const {exports:a}=api();const r=await a.inspectAndroidNotifications({...context,projectId:undefined,androidPackage:undefined},async()=>{throw Error('PRIVATE_TOKEN_OR_KEY');});assert.equal(r.packageConfigured,false);assert.equal(r.projectConfigured,false);assert.equal(r.permission,'error');assert.ok(!JSON.stringify(r).includes('PRIVATE'));
});
function config(env={},original={}){const box={exports:{},process:{env},URL};vm.runInNewContext(compile('app.config.ts'),box);return box.exports.default({config:{name:'mobile',slug:'mobile',...original}});}
test('config uses approved Android ID and preserves existing identity/plugin options',()=>{
 const empty=config();assert.equal(empty.android.package,'com.drmas.mobile');assert.equal(empty.extra.eas,undefined);
 const current=config({}, {android:{package:context.androidPackage,googleServicesFile:'./private/google-services.json'},extra:{eas:{projectId:project,other:'keep'}},plugins:[['expo-notifications',{defaultChannel:'keep'}],'expo-router']});
 assert.equal(current.android.package,context.androidPackage);assert.equal(current.extra.eas.projectId,project);assert.equal(current.extra.eas.other,'keep');assert.equal(current.android.googleServicesFile,'./google-services.json');assert.equal(current.plugins.filter(p=>(Array.isArray(p)?p[0]:p)==='expo-notifications').length,1);assert.equal(current.plugins[0][1].defaultChannel,'keep');
});
test('confirmed env identifiers are accepted but conflicts and incomplete build are rejected',()=>{
 const c=config({DRMAS_ANDROID_PACKAGE:'com.drmas.mobile',DRMAS_EAS_PROJECT_ID:project});assert.equal(c.android.package,'com.drmas.mobile');assert.equal(c.extra.eas.projectId,project);
 assert.throws(()=>config({DRMAS_ANDROID_PACKAGE:'com.other.app'}, {android:{package:context.androidPackage}}));assert.throws(()=>config({DRMAS_EAS_PROJECT_ID:'66666666-6666-4666-8666-666666666666'}, {extra:{eas:{projectId:project}}}));assert.throws(()=>config({EAS_BUILD:'true'}));assert.throws(()=>config({DRMAS_EAS_PROJECT_ID:'not-real'}));
});
test('development build profile is internal APK and status UI has no sending/registration calls',()=>{
 const profile=JSON.parse(fs.readFileSync('eas.json','utf8')).build.development;assert.equal(profile.developmentClient,true);assert.equal(profile.distribution,'internal');assert.equal(profile.android.buildType,'apk');
 const src=fs.readFileSync('src/dev/DevNotificationsPanel.tsx','utf8');assert.match(src,/if \(!notificationDiagnosticsEnabled\(\)\) return null/);assert.match(src,/await import\('expo-notifications'\)/);assert.ok(!/getExpoPushTokenAsync|requestPermissionsAsync|scheduleNotificationAsync|fetch\(|console\./.test(src));
});
