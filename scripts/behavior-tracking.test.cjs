const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs'); const path = require('node:path'); const ts=require('typescript');const Module=require('node:module');
function load(){const file=path.resolve(__dirname,'../src/shared/platform/behavior-tracking.ts');const m=new Module(file);m._compile(ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,file);return m.exports;}
test('anonymous session survives reload, rotates after inactivity and keeps PII out of intake',async()=>{
 const saved=new Map();global.window={};global.sessionStorage={getItem:k=>saved.get(k),setItem:(k,v)=>saved.set(k,v)};
 const batches=[];const original=global.fetch;global.fetch=async(_,init)=>{batches.push(JSON.parse(init.body));return {ok:true};};
 try {const {createBehaviorTracking}=load();const send=createBehaviorTracking('/test');send('shop_view',{platform:'web',shop_id:'123',shop_type:'partner',email:'private@example.com'});await Promise.resolve();
 assert.deepEqual(batches[0].events.map(e=>e.event_name),['service_enter','shop_view']);assert(!JSON.stringify(batches).includes('private@example.com'));
 const id=batches[0].events[0].session_id;const reload=createBehaviorTracking('/test');reload('reserve_click',{platform:'web',shop_id:'123',route:'naver'});assert.equal(batches[1].events[0].session_id,id);assert.equal(batches[1].events[0].reservation_method,'naver');
 saved.set('syak:behavior-session',JSON.stringify({id,at:Date.now()-31*60000}));const later=createBehaviorTracking('/test');later('service_enter',{platform:'web'});assert.equal(batches[2].events.length,1);assert.notEqual(batches[2].events[0].session_id,id);
 } finally {global.fetch=original;delete global.window;delete global.sessionStorage;}
});
test('web and app use the identical behavior contract',{skip: !fs.existsSync(path.resolve(__dirname,'../../app/src/shared/lib/behaviorTracking.ts'))},()=>{assert.equal(fs.readFileSync(path.resolve(__dirname,'../src/shared/platform/behavior-tracking.ts'),'utf8'),fs.readFileSync(path.resolve(__dirname,'../../app/src/shared/lib/behaviorTracking.ts'),'utf8'));});
test('preview domains do not pollute production analytics',()=>{
 global.window={location:{hostname:'preview.vercel.app'}};const original=global.fetch;global.fetch=()=>{throw Error('must not send');};
 try {load().createBehaviorTracking('/test','zd1l2cqi0i')('service_enter',{platform:'web'});}finally{global.fetch=original;delete global.window;}
});
