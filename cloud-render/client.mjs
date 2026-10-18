import fs from 'node:fs/promises';
import path from 'node:path';
import {createReadStream} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {digest,validatePackage,validateJob,invariant} from './protocol.mjs';
import {atomicJson,inside,saveVerified,verifiedFiles} from './local-files.mjs';

export async function cloudClient(configFile){
  const c=JSON.parse(await fs.readFile(configFile,'utf8'));invariant(new URL(c.url).protocol==='https:'&&typeof c.token==='string'&&c.token.length>=32,'Private cloud config required');
  const request=async(endpoint,init={})=>{const r=await fetch(c.url.replace(/\/$/,'')+endpoint,{...init,headers:{Authorization:'Bearer '+c.token,...init.headers},signal:AbortSignal.timeout(300000)});if(!r.ok)throw new Error(`Cloud ${r.status}: ${(await r.text()).slice(0,500)}`);return r;};
  return {request, async upload(root){
    const p=validatePackage(JSON.parse(await fs.readFile(path.join(root,'package.json'),'utf8')));await verifiedFiles(root,p);const packageHash=await digest(p);let sent=0,reused=0;
    for(const f of [...new Map(p.files.map(f=>[f.sha256,f])).values()]){
      const head=await fetch(c.url+'/blobs/'+f.sha256,{method:'HEAD',headers:{Authorization:'Bearer '+c.token},signal:AbortSignal.timeout(30000)});
      if(head.ok&&Number(head.headers.get('Content-Length'))===f.size){reused++;continue;}invariant(head.ok||head.status===404,'Cannot verify remote blob');
      const file=inside(root,f.path);
      if(f.size<32*1024**2)await request('/blobs/'+f.sha256,{method:'PUT',body:createReadStream(file),duplex:'half'});
      else{
        const {uploadId}=await (await request('/blobs/'+f.sha256+'/multipart',{method:'POST'})).json(),parts=[],partSize=16*1024**2;
        for(let start=0,part=1;start<f.size;start+=partSize,part++)parts.push(await (await request('/blobs/'+f.sha256+'/part?uploadId='+encodeURIComponent(uploadId)+'&part='+part,{method:'PUT',body:createReadStream(file,{start,end:Math.min(start+partSize,f.size)-1}),duplex:'half'})).json());
        await request('/blobs/'+f.sha256+'/complete',{method:'POST',body:JSON.stringify({uploadId,parts})});
      }
      sent+=f.size;
    }
    await request('/packages/'+packageHash,{method:'PUT',body:JSON.stringify(p)});return {packageHash,uploadedBytes:sent,reusedBlobs:reused};
  },async submit(job){validateJob(job);return (await request('/jobs',{method:'POST',body:JSON.stringify(job)})).json();},async status(id){return (await request('/jobs'+(id?'/'+id:''))).json();},async download(id,out){
    const proof=await (await request('/results/'+id+'/proof')).json();invariant(proof.jobHash===id,'Wrong output identity');await fs.mkdir(out,{recursive:true});const file=path.join(out,id+'.mp4');await saveVerified((await request('/results/'+id+'/video')).body,file,{size:proof.size,sha256:proof.sha256});await atomicJson(file+'.proof.json',proof);return {file,...proof};
  }};
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  try{const [action,config,arg,out]=process.argv.slice(2),client=await cloudClient(config);let result;
    if(action==='upload')result=await client.upload(arg);
    else if(action==='submit')result=await client.submit(JSON.parse(await fs.readFile(arg,'utf8')));
    else if(action==='status')result=await client.status(arg);
    else if(action==='download')result=await client.download(arg,out);
    else throw new Error('Use upload, submit, status or download');console.log(JSON.stringify(result));
  }catch(e){console.error(e.message);process.exitCode=1;}
}
