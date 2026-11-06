// Offline configuration regression. No EAS API, build, or credentials.
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),ts=require('typescript');
const source=fs.readFileSync('app.config.ts','utf8');
function resolve(env={}) {
 const compiled=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
 const sandbox={exports:{},process:{env},URL,require(){throw Error('Native runtime modules must not load in app config');}};
 vm.runInNewContext(compiled,sandbox);
 return sandbox.exports.default({config:JSON.parse(fs.readFileSync('app.json','utf8')).expo});
}
test('dynamic config preserves the user-linked existing EAS owner slug and project',()=>{
 const c=resolve();assert.equal(c.slug,'dr-mas-mobile');assert.equal(c.owner,'kang21-71607871s-team');assert.equal(c.extra.eas.projectId,'94d68c0e-f0cd-48f8-9d7e-1e89b8b8c347');
});
test('configuration resolves without importing expo-constants or other native runtime entries',()=>{
 assert.ok(resolve().plugins.some(p=>(Array.isArray(p)?p[0]:p)==='expo-notifications'));
 assert.ok(!/from\s+['"]expo-constants['"]|require\(['"]expo-constants['"]\)/.test(source));
});
test('approved Android applicationId resolves in development build without overriding EAS identity',()=>{
 assert.equal(resolve().android.package,'com.drmas.mobile');
 assert.equal(resolve({EAS_BUILD:'true',EAS_BUILD_PLATFORM:'android',EXPO_PUBLIC_APP_ENV:'development'}).android.package,'com.drmas.mobile');
 assert.throws(()=>resolve({DRMAS_ANDROID_PACKAGE:'com.other.app'}));
 assert.throws(()=>resolve({DRMAS_EAS_PROJECT_ID:'66666666-6666-4666-8666-666666666666'}));
});
test('Firebase file is linked by path only and excluded from Git',()=>{
 const c=resolve();assert.equal(c.android.googleServicesFile,'./google-services.json');
 assert.ok(!JSON.stringify(c).includes('private_key'));
 const cp=require('node:child_process');
 assert.equal(cp.spawnSync('git',['check-ignore','--quiet','google-services.json']).status,0);
 assert.notEqual(cp.spawnSync('git',['ls-files','--error-unmatch','google-services.json'],{stdio:'ignore'}).status,0);
});
test('EAS File variable wins as a path while local execution has a safe fallback',()=>{
 const remotePath='/home/expo/environment-secrets/synthetic-google-services.json';
 const c=resolve({GOOGLE_SERVICES_JSON:remotePath,EAS_BUILD:'true',EAS_BUILD_PLATFORM:'android'});
 assert.equal(c.android.googleServicesFile,remotePath);
 assert.equal(c.android.package,'com.drmas.mobile');assert.equal(c.extra.eas.projectId,'94d68c0e-f0cd-48f8-9d7e-1e89b8b8c347');
 assert.ok(!JSON.stringify(c.extra).includes(remotePath));
 assert.equal(resolve({GOOGLE_SERVICES_JSON:''}).android.googleServicesFile,'./google-services.json');
 assert.throws(()=>resolve({GOOGLE_SERVICES_JSON:'{"private_key":"synthetic"}'}));
 const profile=JSON.parse(fs.readFileSync('eas.json','utf8')).build.development;assert.equal(profile.environment,'development');assert.equal(profile.env.GOOGLE_SERVICES_JSON,undefined);
});
test('Firebase service-account patterns and private credential directory remain Git ignored',()=>{
 const cp=require('node:child_process');for(const p of ['synthetic-firebase-adminsdk-test.json','synthetic-service-account.json','synthetic_service_account.json','synthetic-private-key.json','private-credentials/any.json'])assert.equal(cp.spawnSync('git',['check-ignore','--quiet','--no-index',p]).status,0);
});
