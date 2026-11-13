const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs'); const path = require('node:path'); const ts=require('typescript');const Module=require('node:module');
function load(){const file=path.resolve(__dirname,'../src/shared/platform/behavior-tracking.ts');const m=new Module(file);m._compile(ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,file);return m.exports;}
test('Clarity receives approved behavior without a duplicate session or event collector',()=>{
 const original=global.fetch;const calls=[];const scripts=[];
 global.fetch=()=>{throw Error('must not send an internal event');};
 global.window={location:{hostname:'www.themuselab.kr'}};
 global.document={createElement:()=>({dataset:{}}),head:{appendChild:s=>scripts.push(s)}};
 global.sessionStorage={getItem:()=>{throw Error('must not create a separate session');},setItem:()=>{throw Error('must not create a separate session');}};
 try {
  const send=load().createClarityTracking('zd1l2cqi0i');
  send('shop_view',{platform:'web',shop_id:'123',shop_type:'partner',email:'private@example.com'});
  calls.push(...global.window.clarity.q);
  assert.equal(scripts.length,1);
  assert(calls.some(c=>c[0]==='event'&&c[1]==='shop_view'));
  assert(!calls.some(c=>c[0]==='event'&&c[1]==='service_enter'));
  assert(!JSON.stringify(calls).includes('private@example.com'));
  send('reserve_click',{platform:'web'});assert.equal(scripts.length,1);
 } finally {global.fetch=original;delete global.window;delete global.document;delete global.sessionStorage;}
});
test('web and app use the identical Clarity contract',{skip: !fs.existsSync(path.resolve(__dirname,'../../app/src/shared/lib/behaviorTracking.ts'))},()=>{assert.equal(fs.readFileSync(path.resolve(__dirname,'../src/shared/platform/behavior-tracking.ts'),'utf8'),fs.readFileSync(path.resolve(__dirname,'../../app/src/shared/lib/behaviorTracking.ts'),'utf8'));});
test('preview domains do not enter production Clarity',()=>{
 global.window={location:{hostname:'preview.vercel.app'}};
 try {load().createClarityTracking('zd1l2cqi0i')('service_enter',{platform:'web'});assert.equal(global.window.clarity,undefined);}finally{delete global.window;}
});
