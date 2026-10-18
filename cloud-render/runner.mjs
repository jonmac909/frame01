import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import http from 'node:http';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {fileURLToPath} from 'node:url';
import {selectComposition,renderMedia} from '@remotion/renderer';
import {validatePackage,validateJob,digest,invariant} from './protocol.mjs';
import {atomicJson,fileHash,inside,verifiedFiles,serveFile} from './local-files.mjs';
import {runtimeHash} from './runtime.mjs';
const exec=promisify(execFile);
export async function renderUnit(root,input,output,onProgress=()=>{}){
  const began=performance.now(),job=validateJob(input),p=validatePackage(JSON.parse(await fs.readFile(path.join(root,'package.json'),'utf8')));
  invariant(job.runtimeHash===await runtimeHash(),'Renderer changed; prepare a new job instead of reusing cached output');
  invariant(job.execution===(process.env.FRAME01_CLOUD==='1'?'cloudflare':'local'),'Wrong execution destination');
  invariant(job.trial===undefined||p.purpose==='benchmark','Trial renders are benchmark-only');
  invariant(await digest(p)===job.packageHash,'Package identity mismatch');invariant(job.to<=p.frames,'Unit exceeds composition');invariant(p.ranges.some(r=>job.from>=r.from&&job.to<=r.to),'Range is not packaged');await verifiedFiles(root,p);
  const signature=await digest(job);await fs.mkdir(output,{recursive:true});const file=path.join(output,signature+'.mp4'),proofFile=file+'.proof.json';
  try{const proof=JSON.parse(await fs.readFile(proofFile,'utf8'));if(proof.jobHash===signature&&await fileHash(file)===proof.sha256)return {...proof,cached:true,file};}catch(e){if(e.code!=='ENOENT'&&!(e instanceof SyntaxError))throw e;}
  const lock=await fs.open(file+'.lock','wx');await lock.writeFile(JSON.stringify({pid:process.pid,startedAt:new Date().toISOString()}));await lock.close();
  const allowed=new Set(p.files.map(f=>f.path)),server=http.createServer((req,res)=>{let name;try{name=decodeURIComponent(new URL(req.url,'http://localhost').pathname).slice(1);if(!name)name='bundle/index.html';if(!allowed.has(name))throw new Error();serveFile(req,res,inside(root,name));}catch{res.writeHead(404);res.end();}});
  let tmp=file+'.partial.mp4';
  try{
    await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(0,'127.0.0.1',resolve);});
    const base='http://127.0.0.1:'+server.address().port,props=structuredClone(p.inputProps);
    if(props.plan)props.plan.baseUrl=base+'/media';else props.baseUrl=base+'/media';
    const browserExecutable=process.env.CHROME_PATH||(process.platform==='win32'?'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe':undefined);
    const common={serveUrl:base+'/bundle/index.html',id:p.compositionId,inputProps:props,browserExecutable,chromiumOptions:{gl:'swangle'}};
    const composition=await selectComposition(common);invariant(composition.durationInFrames===p.frames&&composition.fps===30,'Composition metadata mismatch');
    const opts=job.encoder==='nvenc'?{hardwareAcceleration:'required',videoBitrate:job.videoBitrate}:{crf:19};
    const t=performance.now();await renderMedia({...common,composition,codec:'h264',outputLocation:tmp,frameRange:[job.from,job.to-1],concurrency:job.concurrency,muted:true,pixelFormat:'yuv420p',...opts,onProgress:x=>onProgress(x.progress),timeoutInMilliseconds:120000});
    const renderSeconds=(performance.now()-t)/1000,probe=process.env.FFPROBE_PATH||(process.platform==='win32'?'C:\\ffmpeg\\bin\\ffprobe.exe':'ffprobe');
    const info=JSON.parse((await exec(probe,['-v','error','-show_streams','-show_format','-of','json',tmp],{windowsHide:true})).stdout),v=info.streams.find(s=>s.codec_type==='video');
    invariant(Number(v?.nb_frames)===job.to-job.from&&v.width===1920&&v.height===1080&&v.avg_frame_rate==='30/1','Rendered frame count or format mismatch');
    invariant(!info.streams.some(s=>s.codec_type==='audio'),'Unit audio must be assembled once from the complete stem');
    await fs.rename(tmp,file);
    const proof={version:1,jobHash:signature,packageHash:job.packageHash,job,from:job.from,to:job.to,frames:job.to-job.from,sha256:await fileHash(file),size:(await fs.stat(file)).size,renderSeconds,totalSeconds:(performance.now()-began)/1000,renderFps:(job.to-job.from)/renderSeconds,machine:{cpu:os.cpus()[0]?.model,logicalCpus:os.availableParallelism(),ramBytes:os.totalmem(),platform:process.platform},qa:'Technical frame validation only; audiovisual acceptance is pending.'};
    await atomicJson(proofFile,proof);return {...proof,file,cached:false};
  }finally{server.closeAllConnections();await new Promise(r=>server.close(r));await fs.unlink(file+'.lock');}
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  let last=-1;
  const [root,jobFile,output]=process.argv.slice(2);renderUnit(root,JSON.parse(await fs.readFile(jobFile,'utf8')),output,p=>{const percent=Math.floor(p*10)*10;if(percent!==last){last=percent;process.stdout.write(JSON.stringify({percent})+'\n');}}).then(result=>console.log(JSON.stringify(result))).catch(e=>{console.error(e.message);process.exitCode=1;});
}
