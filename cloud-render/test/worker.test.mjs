import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import ts from 'typescript';
import * as protocol from '../protocol.mjs';

// Execute the actual Worker with only the platform storage/container boundaries replaced.
const source=await fs.readFile(new URL('../worker.ts',import.meta.url),'utf8');
const js=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
const module={exports:{}};
class DO {constructor(ctx,env){this.ctx=ctx;this.env=env;}}
new Function('require','exports','module',js)(name=>name==='cloudflare:workers'?{DurableObject:DO}:name==='@cloudflare/containers'?{Container:DO}:protocol,module.exports,module);
const {RenderControl,default:worker}=module.exports;
const runtime='a'.repeat(64),packageHash='b'.repeat(64);
const job=(from=0)=>({version:1,packageHash,runtimeHash:runtime,execution:'cloudflare',from,to:from+30,concurrency:2,encoder:'software'});
function fixture(cap=5){
  const values=new Map(),objects=new Map(),calls=[];
  const storage={async get(k){return structuredClone(values.get(k));},async put(k,v){values.set(k,structuredClone(v));},async list({prefix}){return new Map([...values].filter(([k])=>k.startsWith(prefix)).map(([k,v])=>[k,structuredClone(v)]));},async transaction(fn){return fn(storage);},async setAlarm(at){values.set('alarm',at);}};
  const p={version:1,renderer:'remotion',compositionId:'FullRemake',purpose:'benchmark',providers:protocol.POLICY,identity:{channelId:'test',avatar:'Sienna',voice:'Nelly',model:'Avatar III',speed:1},styleSha256:runtime,planSha256:runtime,frames:300,fps:30,width:1920,height:1080,ranges:[{from:0,to:300}],inputProps:{},files:[{path:'bundle/index.html',sha256:runtime,size:1}]};
  objects.set('packages/'+packageHash+'.json',{json:async()=>p});
  const env={OWNER_TOKEN:'test-owner-token',MAX_WORKERS:'4',PILOT_COMPUTE_USD:String(cap),RENDER_RUNTIME_SHA256:runtime,MEDIA:{async get(k){return objects.get(k);},async head(k){return objects.get(k);},async put(k,v,options){objects.set(k,{body:v,...options,size:typeof v==='string'?v.length:4,json:async()=>JSON.parse(v)});}},RENDERS:{getByName(id){return {async fetch(url){calls.push({id,path:new URL(url).pathname});return Response.json({status:'running',progress:.5});}};}}};
  const control=new RenderControl({storage},env);env.CONTROL={getByName(){return {fetch:(...a)=>control.fetch(new Request(...a))};}};
  const request=(path,body,authorized=true,method=body?'POST':'GET')=>worker.fetch(new Request('https://private.example'+path,{method,headers:authorized?{Authorization:'Bearer '+env.OWNER_TOKEN}:{},...(body?{body:JSON.stringify(body)}:{})}),env);
  return {request,control,values,objects,calls};
}
test('private route never exposes jobs without owner authentication',async()=>{const f=fixture();assert.equal((await f.request('/jobs',null,false)).status,401);assert.equal(f.values.size,0);});
test('duplicate submits reserve once; fifth active unit cannot spend',async()=>{const f=fixture();for(const n of [0,30,60,90])assert.equal((await f.request('/jobs',job(n))).status,202);const before=f.values.get('reservedUsd');assert.equal((await f.request('/jobs',job())).status,200);assert.equal(f.values.get('reservedUsd'),before);assert.equal((await f.request('/jobs',job(120))).status,400);assert.equal(f.values.get('reservedUsd'),before);});
test('budget and runtime mismatch fail before any reservation',async()=>{const f=fixture(.1);assert.equal((await f.request('/jobs',{...job(),runtimeHash:'c'.repeat(64)})).status,400);assert.equal(f.values.get('reservedUsd'),undefined);assert.equal((await f.request('/jobs',job())).status,400);assert.equal(f.values.get('reservedUsd'),undefined);});
test('alarm dispatches once, then polls; a deadline stops its worker',async()=>{const f=fixture();await f.request('/jobs',job());await f.control.alarm();await f.control.alarm();assert.deepEqual(f.calls.map(x=>x.path),['/run','/status']);const id=await protocol.digest(job()),record=f.values.get('job:'+id);record.createdAt=Date.now()-26*60*1000;f.values.set('job:'+id,record);await f.control.alarm();assert.equal(f.values.get('job:'+id).status,'failed');assert.equal(f.calls.at(-1).path,'/stop');assert.equal((await f.request('/results/'+id+'/video',{},true,'PUT')).status,400);});
test('proof cannot complete a different job or a missing output',async()=>{const f=fixture();await f.request('/jobs',job());await f.control.alarm();const id=await protocol.digest(job());assert.equal((await f.request('/results/'+id+'/proof',{jobHash:id,packageHash,job:job(),size:4,sha256:runtime},true,'PUT')).status,400);assert.equal(f.objects.has('results/'+id+'/proof.json'),false);});
