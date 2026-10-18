import http from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';
import {fork} from 'node:child_process';
import {createReadStream} from 'node:fs';
import {validatePackage,validateJob,digest,invariant,SHA} from './protocol.mjs';
import {inside,saveVerified,atomicJson} from './local-files.mjs';

const scratch=process.env.RENDER_SCRATCH||'/tmp/frame01',port=Number(process.env.PORT||8080);let active=null;
const reply=(res,code,value)=>{res.writeHead(code,{'Content-Type':'application/json'});res.end(JSON.stringify(value));};
async function body(req){let b='';for await(const s of req){b+=s;invariant(b.length<1024*1024,'Request too large');}return JSON.parse(b);}
async function run(input){
  const {job,base,token}=input;validateJob(job);invariant(job.encoder==='software'&&job.concurrency<=4,'Cloud workers use CPU encoding and at most four browser tabs');
  const u=new URL(base);invariant(u.protocol==='https:'&&!u.username&&!u.password,'Expected HTTPS coordinator');
  const id=await digest(job);if(active){invariant(active.id===id,'Container already occupied');return active;}
  const state={id,status:'running',startedAt:Date.now(),progress:0};active=state;
  // This promise owns exactly one child; the hard deadline also covers downloads.
  const timer=setTimeout(()=>{state.status='failed';state.error='Render unit exceeded 20-minute deadline';if(state.child)state.child.kill('SIGKILL');process.exit(1);},20*60*1000);
  (async()=>{
    const headers={Authorization:'Bearer '+token},api=async(endpoint,init={})=>{const r=await fetch(base+endpoint,{...init,headers:{...headers,...init.headers},signal:AbortSignal.timeout(120000)});if(!r.ok)throw new Error('Coordinator '+r.status);return r;};
    const p=validatePackage(await (await api('/packages/'+job.packageHash)).json());invariant(await digest(p)===job.packageHash,'Manifest hash mismatch');
    const root=path.join(scratch,'package');await fs.mkdir(root,{recursive:true});
    // A fixed isolated scratch root is owned solely by this one-job container.
    for(const f of p.files){const r=await api('/blobs/'+f.sha256);await saveVerified(r.body,inside(root,f.path),f);}
    await atomicJson(path.join(root,'package.json'),p);const jobFile=path.join(scratch,'job.json');await atomicJson(jobFile,job);
    const child=fork(new URL('./runner-child.mjs',import.meta.url),[root,jobFile,path.join(scratch,'out')],{stdio:['ignore','pipe','pipe','ipc']});state.child=child;let result,err='';child.stderr.on('data',b=>{err=(err+b).slice(-3000);});child.on('message',m=>{if(m.progress!==undefined)state.progress=m.progress;if(m.result)result=m.result;});
    await new Promise((resolve,reject)=>{child.once('error',reject);child.once('exit',code=>code===0&&result?resolve():reject(new Error(err||'Render child failed')));});
    const stream=createReadStream(result.file);await api('/results/'+id+'/video',{method:'PUT',body:stream,duplex:'half',headers:{'Content-Type':'video/mp4','X-Output-Hash':result.sha256}});
    const {file,...proof}=result;await api('/results/'+id+'/proof',{method:'PUT',body:JSON.stringify(proof),headers:{'Content-Type':'application/json'}});
    state.status='complete';state.proof=proof;
  })().catch(e=>{state.status='failed';state.error=e.message;}).finally(()=>{clearTimeout(timer);delete state.child;});
  return state;
}
http.createServer(async(req,res)=>{try{
  if(req.url==='/health')return reply(res,200,{ok:true});
  if(req.method==='POST'&&req.url==='/run'){const s=await run(await body(req));return reply(res,202,{id:s.id,status:s.status});}
  if(req.method==='GET'&&req.url==='/status')return reply(res,200,active?{id:active.id,status:active.status,startedAt:active.startedAt,progress:active.progress,error:active.error,proof:active.proof}:{status:'idle'});
  reply(res,404,{error:'Unknown route'});
}catch(e){reply(res,400,{error:e.message});}}).listen(port,'0.0.0.0');
