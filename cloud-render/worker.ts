import {Container} from '@cloudflare/containers';
import {DurableObject} from 'cloudflare:workers';
import {SHA,digest,validatePackage,validateJob,invariant,estimateReservation} from './protocol.mjs';

interface Env {MEDIA:R2Bucket; RENDERS:DurableObjectNamespace<RenderContainer>; CONTROL:DurableObjectNamespace<RenderControl>; OWNER_TOKEN:string; MAX_WORKERS:string; PILOT_COMPUTE_USD:string; RENDER_RUNTIME_SHA256:string; RENDER_IMAGE_SHA256:string;}
const json=(data:unknown,status=200)=>Response.json(data,{status});
const deadlineMs=25*60*1000;
type RecordJob={id:string;job:any;status:string;createdAt:number;updatedAt:number;base:string;progress?:number;error?:string;proof?:any};

export class RenderContainer extends Container<Env>{
  defaultPort=8080;
  sleepAfter='60s';
  envVars={FRAME01_IMAGE_SHA256:this.env.RENDER_IMAGE_SHA256};
  override async fetch(request:Request){
    const pathname=new URL(request.url).pathname;
    if(pathname==='/stop'){await this.destroy();return json({stopped:true});}
    if(pathname==='/status'){
      const state=await this.getState();
      if(!['running','healthy'].includes(state.status))return json({status:'failed',error:'Container stopped; inspect retained inputs before an explicit retry'});
    }
    return this.containerFetch(request);
  }
}

export class RenderControl extends DurableObject<Env>{
  async fetch(request:Request){
    const u=new URL(request.url);
    if(request.method==='POST'){
      const {job,base}=await request.json() as any;validateJob(job);
      invariant(job.execution==='cloudflare'&&job.runtimeHash===this.env.RENDER_RUNTIME_SHA256,'Wrong or obsolete cloud renderer');
      invariant(job.imageHash===this.env.RENDER_IMAGE_SHA256,'Wrong or obsolete container image');
      invariant(job.encoder==='software'&&job.concurrency<=4,'Cloud supports software encoding and concurrency <= 4');
      const id=await digest(job),prior=await this.ctx.storage.get<RecordJob>('job:'+id);if(prior)return json(prior);
      const manifest=await this.env.MEDIA.get('packages/'+job.packageHash+'.json');invariant(manifest,'Upload the package first');const p=validatePackage(await manifest!.json());invariant(job.to<=p.frames,'Range exceeds package');
      invariant(p.ranges.some((r:any)=>job.from>=r.from&&job.to<=r.to),'Range is not in the packaged asset coverage');
      invariant(job.trial===undefined||p.purpose==='benchmark','Trials are benchmark-only');
      const record:RecordJob={id,job,base,status:'queued',createdAt:Date.now(),updatedAt:Date.now()};
      await this.ctx.storage.transaction(async tx=>{
        if(await tx.get('job:'+id))return;
        const all=await tx.list<RecordJob>({prefix:'job:'}),active=[...all.values()].filter(j=>['queued','running'].includes(j.status));
        invariant(active.length<Number(this.env.MAX_WORKERS),'All render workers are occupied');
        const reserved=(await tx.get<number>('reservedUsd'))??0,next=reserved+estimateReservation(deadlineMs/1000);
        invariant(next<=Number(this.env.PILOT_COMPUTE_USD),'Pilot compute reservation cap reached');
        await tx.put('reservedUsd',next);await tx.put('job:'+id,record);
      });
      await this.ctx.storage.setAlarm(Date.now()+1000);return json(record,202);
    }
    const id=u.searchParams.get('id');if(id)return json(await this.ctx.storage.get('job:'+id)??{error:'Unknown job'},await this.ctx.storage.get('job:'+id)?200:404);
    const jobs=[...(await this.ctx.storage.list<RecordJob>({prefix:'job:'})).values()];return json({reservedComputeUsd:await this.ctx.storage.get('reservedUsd')??0,computeCapUsd:Number(this.env.PILOT_COMPUTE_USD),maxWorkers:Number(this.env.MAX_WORKERS),jobs});
  }
  override async alarm(){
    const jobs=[...(await this.ctx.storage.list<RecordJob>({prefix:'job:'})).values()].filter(j=>['queued','running'].includes(j.status));
    await Promise.all(jobs.map(async j=>{
      const stub=this.env.RENDERS.getByName(j.id);
      try{
        const proof=await this.env.MEDIA.get('results/'+j.id+'/proof.json');
        if(proof){j.proof=await proof.json();j.status='complete';}
        else if(Date.now()-j.createdAt>deadlineMs){j.status='failed';j.error='25-minute worker deadline; retained inputs were not resubmitted';}
        else if(j.status==='queued'){
          // Persist the attempt before the external call. An uncertain POST is reconciled by status, never replayed.
          j.status='running';await this.ctx.storage.put('job:'+j.id,j);
          const r=await stub.fetch('http://container/run',{method:'POST',body:JSON.stringify({job:j.job,base:j.base,token:this.env.OWNER_TOKEN})});
          if(!r.ok)throw new Error('Container start returned '+r.status);
        }else{
          const r=await stub.fetch('http://container/status'),s=await r.json() as any;j.progress=s.progress??j.progress;
          if(s.status==='failed'||s.status==='idle'){j.status='failed';j.error=s.error??'Worker lost its in-flight job; inspect before retry';}
          if(s.status==='complete'){invariant(await this.env.MEDIA.head('results/'+j.id+'/proof.json'),'No durable output proof');j.status='complete';j.proof=s.proof;}
        }
      }catch(e){j.status='failed';j.error=(e as Error).message;}
      if(!['queued','running'].includes(j.status)){try{await stub.fetch('http://container/stop',{method:'POST'});}catch{/* sleep timeout is the second stop path */}}
      j.updatedAt=Date.now();await this.ctx.storage.put('job:'+j.id,j);
    }));
    if([... (await this.ctx.storage.list<RecordJob>({prefix:'job:'})).values()].some(j=>['queued','running'].includes(j.status)))await this.ctx.storage.setAlarm(Date.now()+20000);
  }
}

async function handle(request:Request,env:Env){
  if(!env.OWNER_TOKEN||request.headers.get('Authorization')!=='Bearer '+env.OWNER_TOKEN)return json({error:'Unauthorized'},401);
  const u=new URL(request.url),parts=u.pathname.split('/').filter(Boolean),[kind,id,action]=parts;
  if(kind==='health')return json({ok:true,runtimeHash:env.RENDER_RUNTIME_SHA256,imageHash:env.RENDER_IMAGE_SHA256,providers:{images:'local:Qwen Image 2.1',clips:'local:LTX 2.5',aroll:'HeyGen'},maxWorkers:Number(env.MAX_WORKERS)});
  if(kind==='jobs')return env.CONTROL.getByName('frame01-pilot-v1').fetch(request.method==='POST'?new Request('http://control/',{method:'POST',body:JSON.stringify({job:await request.json(),base:u.origin})}):new Request('http://control/?'+(id?'id='+id:'')));
  invariant(SHA.test(id??''),'Expected SHA256 identity');
  if(kind==='blobs'){
    const key='blobs/'+id;
    if(request.method==='HEAD'){const obj=await env.MEDIA.head(key);return new Response(null,{status:obj?200:404,headers:obj?{'Content-Length':String(obj.size)}:{}});}
    if(request.method==='GET'){const obj=await env.MEDIA.get(key);return obj?new Response(obj.body,{headers:{'Content-Length':String(obj.size)}}):json({error:'Missing blob'},404);}
    if(action==='multipart'&&request.method==='POST'){const m=await env.MEDIA.createMultipartUpload(key);return json({uploadId:m.uploadId});}
    if(action==='part'&&request.method==='PUT'){const uploadId=u.searchParams.get('uploadId'),part=Number(u.searchParams.get('part'));invariant(uploadId&&Number.isSafeInteger(part)&&part>=1&&part<=10000,'Invalid upload part');const m=env.MEDIA.resumeMultipartUpload(key,uploadId!);return json(await m.uploadPart(part,request.body!));}
    if(action==='complete'&&request.method==='POST'){const {uploadId,parts}=await request.json() as any;await env.MEDIA.resumeMultipartUpload(key,uploadId).complete(parts);return json({stored:true});}
    if(request.method==='PUT'){invariant(request.body,'Missing blob body');await env.MEDIA.put(key,request.body!);return json({stored:true});}
  }
  if(kind==='packages'){
    const key='packages/'+id+'.json';
    if(request.method==='GET'){const obj=await env.MEDIA.get(key);return obj?new Response(obj.body,{headers:{'Content-Type':'application/json'}}):json({error:'Missing package'},404);}
    if(request.method==='PUT'){const p=validatePackage(await request.json());invariant(await digest(p)===id,'Package hash mismatch');for(const f of p.files){const obj=await env.MEDIA.head('blobs/'+f.sha256);invariant(obj?.size===f.size,'Missing/wrong-size input blob');}await env.MEDIA.put(key,JSON.stringify(p));return json({stored:true});}
  }
  if(kind==='results'){
    invariant(action==='video'||action==='proof','Unknown output');const key='results/'+id+(action==='video'?'/video.mp4':'/proof.json');
    if(request.method==='GET'){const o=await env.MEDIA.get(key);return o?new Response(o.body,{headers:{'Content-Type':action==='video'?'video/mp4':'application/json','Content-Length':String(o.size)}}):json({error:'Missing result'},404);}
    if(request.method==='PUT'){
      const r=await env.CONTROL.getByName('frame01-pilot-v1').fetch('http://control/?id='+id);const j=await r.json() as RecordJob;
      invariant(j.status==='running','Output is not owned by an active render');
      if(action==='proof'){
        const proof=await request.json() as any,video=await env.MEDIA.head('results/'+id+'/video.mp4');
        invariant(proof.jobHash===id&&proof.packageHash===j.job.packageHash&&await digest(proof.job)===id,'Proof identity mismatch');
        invariant(video&&video.size===proof.size&&video.customMetadata?.sha256===proof.sha256,'Output receipt mismatch');
        await env.MEDIA.put(key,JSON.stringify(proof));
      }else{const hash=request.headers.get('X-Output-Hash');invariant(SHA.test(hash??''),'Missing output hash');await env.MEDIA.put(key,request.body!,{customMetadata:{sha256:hash!},httpMetadata:{contentType:'video/mp4'}});}
      return json({stored:true});
    }
  }
  return json({error:'Unknown route'},404);
}
export default {async fetch(request:Request,env:Env){try{return await handle(request,env);}catch(e){return json({error:(e as Error).message},400);}}};
