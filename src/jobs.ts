import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import {z} from 'zod';
import {atomicJson,serial,idSchema} from './core.js';
import {digest} from './render-cache.js';

const schema=z.object({id:z.string().uuid(),projectId:idSchema,action:z.string(),state:z.enum(['running','complete','failed']),input:z.unknown(),inputHash:z.string(),requestKey:z.string(),ownerPid:z.number().int(),startedAt:z.string(),heartbeatAt:z.string(),finishedAt:z.string().optional(),elapsedSeconds:z.number().optional(),error:z.string().optional(),recovery:z.string().optional(),result:z.unknown().optional()}).strict();
export type Job=z.infer<typeof schema>;
const alive=(pid:number)=>{try{process.kill(pid,0);return true}catch(e){return (e as NodeJS.ErrnoException).code==='EPERM'}};
export function createJobStore(root:string,pid=process.pid,isAlive=alive){
  const dir=path.join(root,'jobs'),locks=path.join(dir,'locks');
  const read=async(id:string)=>schema.parse(JSON.parse(await fs.readFile(path.join(dir,z.string().uuid().parse(id)+'.json'),'utf8')));
  const write=(job:Job)=>atomicJson(path.join(dir,job.id+'.json'),schema.parse(job));
  const list=async()=>{await fs.mkdir(locks,{recursive:true});const names=await fs.readdir(dir);return Promise.all(names.filter(f=>f.endsWith('.json')).map(f=>read(f.slice(0,-5))))};
  async function reconcile(){
    // Never replay an uncertain external action or spawn a second renderer after restart.
    for(const job of await list())if(job.state==='running'&&!isAlive(job.ownerPid)){job.state='failed';job.finishedAt=new Date().toISOString();job.error='Editor owner exited before a durable result. Inspect outputs/provider receipts before any new attempt.';job.recovery='No automatic replay; the last heartbeat is not proof of failure at the provider.';await write(job);}
  }
  async function reserve(projectId:string,action:string,input:unknown,requestKey:string=crypto.randomUUID()){
    idSchema.parse(projectId);z.string().min(1).max(200).parse(requestKey);await fs.mkdir(locks,{recursive:true});
    return serial('jobs:'+dir+projectId,async()=>{
      const inputHash=digest({action,input}),prior=(await list()).find(j=>j.projectId===projectId&&j.requestKey===requestKey);
      if(prior){if(prior.inputHash!==inputHash)throw new Error('Idempotency key was already used for different inputs');return {job:prior,created:false}}
      const lockFile=path.join(locks,projectId+'.json'),jobId=crypto.randomUUID();let handle;
      try{handle=await fs.open(lockFile,'wx')}catch(e){if((e as NodeJS.ErrnoException).code!=='EEXIST')throw e;
        const lock=z.object({pid:z.number().int(),jobId:z.string().uuid()}).parse(JSON.parse(await fs.readFile(lockFile,'utf8')));
        if(isAlive(lock.pid))throw new Error('A project operation is still running.');
        await reconcile();await fs.unlink(lockFile);handle=await fs.open(lockFile,'wx');
      }
      try{await handle.writeFile(JSON.stringify({pid,jobId}));await handle.sync()}finally{await handle.close()}
      const now=new Date().toISOString(),job:Job={id:jobId,projectId,action,state:'running',input:action==='browser.act'?{redacted:true}:input,inputHash,requestKey,ownerPid:pid,startedAt:now,heartbeatAt:now};
      // Keep the reservation on a persistence failure. An orphan lock must be reconciled, not retried blindly.
      await write(job);return {job,created:true};
    });
  }
  const update=(id:string,fn:(j:Job)=>void)=>serial('job-write:'+dir+id,async()=>{const j=await read(id);fn(j);await write(j);return j});
  async function execute<T>(job:Job,fn:()=>Promise<T>){
    let heartbeatError:unknown;const heartbeat=setInterval(()=>{void update(job.id,j=>{j.heartbeatAt=new Date().toISOString()}).catch(e=>{heartbeatError=e})},15000);heartbeat.unref();
    try{const result=await fn();if(heartbeatError)throw new Error('Operation returned, but its durable heartbeat failed; inspect the result before retrying.');await update(job.id,j=>{j.state='complete';j.result=result;j.finishedAt=new Date().toISOString();j.elapsedSeconds=(Date.now()-Date.parse(j.startedAt))/1000});return result}
    catch(e){await update(job.id,j=>{j.state='failed';j.error=String(e);j.finishedAt=new Date().toISOString();j.elapsedSeconds=(Date.now()-Date.parse(j.startedAt))/1000});throw e}
    finally{clearInterval(heartbeat);const file=path.join(locks,job.projectId+'.json');const lock=JSON.parse(await fs.readFile(file,'utf8'));if(lock.jobId!==job.id)throw new Error('Job ownership changed; refusing to release another job lock');await fs.unlink(file)}
  }
  return {list,read,reserve,execute,reconcile,publicJob:({input,result,...job}:Job)=>job};
}
