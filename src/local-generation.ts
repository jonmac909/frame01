import fs from 'node:fs/promises';
import path from 'node:path';
import {projectDir,safePath,atomicJson,hash,mutate,event,addAsset,serial} from './core.js';
const gateway='http://127.0.0.1:7875',queue='http://127.0.0.1:7880';
export type LocalRequest={assetKey:string;kind:'image'|'video';prompt:string;sourceImage?:string;sound?:boolean};
type Receipt={request:LocalRequest;requestHash:string;seed:number;createdAt:string;jobId?:string;file?:string};
export function assertLocalIdle(q:any,g:any){
  if(!q||!Array.isArray(q.jobs)||!Array.isArray(q.autoaigen_busy)||!Array.isArray(q.autoaigen_waiting)||q.switching||q.jobs.length||q.autoaigen_busy.length||q.autoaigen_waiting.length)throw new Error('GPU1 queue is unavailable or busy. Wait; never preempt it.');
  const card=g?.gpus?.find((x:any)=>x.id==='gpu1');
  if(!card||card.state!=='available'||card.generator_busy||card.jobs?.length||card.queued||card.upcoming?.length)throw new Error('GPU1 has active or queued work. Wait before submitting an example.');
}
async function get(url:string){const r=await fetch(url,{signal:AbortSignal.timeout(15000)});if(!r.ok)throw new Error(`Local generation service returned ${r.status}`);return r.json()}
function receiptPath(id:string,key:string){if(!/^[a-z0-9][a-z0-9-]{0,60}$/.test(key))throw new Error('Use a simple asset key.');return path.join(projectDir(id),'generation',key+'.json')}
export async function generateLocal(id:string,input:LocalRequest){
  return serial('local-generation:'+id,async()=>{
    const file=receiptPath(id,input.assetKey),requestHash=hash(JSON.stringify(input));
    const existing:Receipt|undefined=await fs.readFile(file,'utf8').then(s=>JSON.parse(s),e=>{if(e.code==='ENOENT')return;throw e});
    if(existing){if(existing.requestHash!==requestHash)throw new Error('This asset key already has different generation inputs. Inspect it instead of overwriting.');return {assetKey:input.assetKey,jobId:existing.jobId,file:existing.file,reused:true,message:'Existing request only. Collect it; never submit it again automatically.'}}
    const [q,g]=await Promise.all([get(queue+'/api/status'),get(gateway+'/api/gpus')]);assertLocalIdle(q,g);
    const seed=parseInt(requestHash.slice(0,7),16),body:any={kind:input.kind==='image'?'qwenimage':'ltx',prompt:input.prompt,seed,width:1024,height:576,steps:input.kind==='image'?30:8,count:1,duration:10,profile:'official',sound:input.kind==='video'&&input.sound===true,device:'gpu1',priority:false};
    if(input.kind==='video'&&!input.sourceImage)throw new Error('LTX examples require a saved PNG reference.');
    if(input.sourceImage){
      if(!input.sourceImage.endsWith('.png'))throw new Error('Local examples require a saved PNG reference.');
      body.image_base64=(await fs.readFile(safePath(projectDir(id),input.sourceImage))).toString('base64');
    }
    const receipt:Receipt={request:input,requestHash,seed,createdAt:new Date().toISOString()};
    await fs.mkdir(path.dirname(file),{recursive:true});const handle=await fs.open(file,'wx');try{await handle.writeFile(JSON.stringify(receipt));await handle.sync()}finally{await handle.close()}
    const response=await fetch(gateway+'/api/jobs',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body),signal:AbortSignal.timeout(20000)});
    if(!response.ok)throw new Error('Generation request was not confirmed. Inspect the existing receipt; do not retry automatically.');
    const result=await response.json() as {id:string};if(!/^[a-f0-9]{32}$/.test(result.id))throw new Error('Invalid generator job ID.');
    receipt.jobId=result.id;await atomicJson(file,receipt);
    await mutate(id,p=>event(p,'local-generation',`GPU1 ${input.kind==='image'?'Qwen Image 2.1':'LTX 2.5'}: ${input.assetKey}, job ${result.id}, seed ${seed}.`));
    return {assetKey:input.assetKey,jobId:result.id,seed,provider:body.kind,device:'GPU1'};
  });
}
export async function collectLocal(id:string,key:string){
  return serial('local-collect:'+id+':'+key,async()=>{
    const receiptFile=receiptPath(id,key),r:Receipt=JSON.parse(await fs.readFile(receiptFile,'utf8'));
    if(r.file)return {file:r.file,reused:true};
    if(!r.jobId)throw new Error('Submission outcome is unknown. Inspect the existing gateway job before doing anything else.');
    const state=await get(gateway+'/api/jobs/'+r.jobId);
    if(state.status!=='done')return {assetKey:key,jobId:r.jobId,status:state.status,progress:state.progress,message:state.message};
    const file=`assets/local-${key}.${r.request.kind==='image'?'png':'mp4'}`,destination=safePath(projectDir(id),file);
    const response=await fetch(`${gateway}/api/jobs/${r.jobId}/file/0`,{signal:AbortSignal.timeout(60000)});if(!response.ok)throw new Error('Generated media is unavailable; do not mark this asset complete.');
    const bytes=Buffer.from(await response.arrayBuffer());if(!bytes.length)throw new Error('Generated media is empty.');
    await fs.mkdir(path.dirname(destination),{recursive:true});await fs.writeFile(destination+'.tmp',bytes);await fs.rename(destination+'.tmp',destination);
    if(r.request.kind==='video')await addAsset(id,file,'broll');
    else await mutate(id,p=>{if(!p.assets.some(a=>a.file===file))p.assets.push({file,kind:'image'});event(p,'asset',`Local Qwen Image 2.1 illustration: ${file}`)});
    r.file=file;await atomicJson(receiptFile,r);return {file,bytes:bytes.length,seed:r.seed,provider:r.request.kind==='image'?'Qwen Image 2.1':'LTX 2.5',attribution:'Locally generated illustration; not an OpenArt model output.'};
  });
}
