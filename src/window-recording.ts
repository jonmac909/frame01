import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import {spawn,type ChildProcessWithoutNullStreams} from 'node:child_process';
import {z} from 'zod';
import {ROOT,DATA,FFMPEG,run,projectDir,safePath,readProject,addAsset,mutate,event,atomicJson,serial,probe} from './core.js';
import {normalizeRecording} from './recording.js';
import {configureObs,closeOwnedObs,OBS_EXE} from './obs-recording.js';

const windowSchema=z.object({hwnd:z.number().int().positive(),pid:z.number().int().positive(),title:z.string(),process:z.literal('chrome'),width:z.number().int(),height:z.number().int(),outerWidth:z.number().int(),outerHeight:z.number().int(),minimized:z.boolean(),foreground:z.boolean(),captureHwnd:z.number().int().positive(),captureWidth:z.number().int(),captureHeight:z.number().int()});
export type CaptureWindow=z.infer<typeof windowSchema>;
export type RecordingOptions={windowId?:number;title?:string;maxSeconds?:number;viewport?:{width:number;height:number}};
type Receipt={projectId:string;file:string;raw:string;target:CaptureWindow;originalTitle?:string;startedAt:string;pid:number;maxSeconds:number;state:'recording'|'complete'|'interrupted';error?:string};
type Session={receipt:Receipt;child:ChildProcessWithoutNullStreams;closed:Promise<number|null>;log:string;stop?:Promise<any>;timer?:NodeJS.Timeout};
const sessions=new Map<string,Session>();
const receiptPath=(id:string)=>path.join(projectDir(id),'recordings/window-recording.json');
const lockFile=path.join(DATA,'window-recording.lock.json');

export async function recordingWindows():Promise<CaptureWindow[]> {
 if(process.platform!=='win32')throw new Error('Automatic existing-Chrome capture requires Windows.');
 const source=path.join(ROOT,'scripts/capture-windows.cs'),helper=path.join(ROOT,'bin/capture-windows.exe');
 const built=await fs.stat(helper).catch(()=>undefined);
 if(!built||built.mtimeMs<(await fs.stat(source)).mtimeMs){
  await fs.mkdir(path.dirname(helper),{recursive:true});
  const compiler=path.join(process.env.SystemRoot||'C:\\Windows','Microsoft.NET/Framework64/v4.0.30319/csc.exe');
  await run(compiler,['/nologo','/target:exe','/r:System.Web.Extensions.dll',`/out:${helper}`,source],{timeout:30000});
 }
 const text=await run(helper,[],{timeout:15000});
 return z.array(windowSchema).parse(JSON.parse(text.replace(/^\uFEFF/,'').trim()));
}
export function selectRecordingWindow(windows:CaptureWindow[],options:RecordingOptions):CaptureWindow {
 const matches=windows.filter(w=>options.windowId!==undefined?w.hwnd===options.windowId:options.title?w.title.toLowerCase().includes(options.title.toLowerCase()):true);
 if(matches.length!==1)throw new Error(`Choose exactly one observed Chrome window using record.windows and windowId (found ${matches.length}). The agent selects it; no extension attachment is needed.`);
 const target=matches[0];
 if(target.minimized||target.captureWidth<320||target.captureHeight<180)throw new Error('Restore the selected Chrome walkthrough window with computer/browser controls before recording.');
 return target;
}
export async function prepareRecordingWindow(url:string) {
 const target=new URL(url);
 if(!['http:','https:'].includes(target.protocol)||target.hostname==='app.heygen.com')throw new Error('Prepare a real software walkthrough URL; HeyGen stays on its guarded surface.');
 const before=await recordingWindows();if(!before.length)throw new Error('The existing signed-in Chrome must be running.');
 const existing=new Set(before.map(w=>w.hwnd));
 const chrome=process.env.CHROME_PATH||'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
 const child=spawn(chrome,['--new-window','--window-size=1920,1200',target.toString()],{windowsHide:true,stdio:'ignore'});
 let launchError:Error|undefined;child.on('error',e=>launchError=e);child.unref();
 for(let attempt=0;attempt<20;attempt++){
  if(launchError)throw launchError;
  const windows=(await recordingWindows()).filter(w=>!existing.has(w.hwnd)&&!w.minimized&&w.captureWidth>=320&&w.captureHeight>=180);
  if(windows.length===1)return {window:windows[0],url:target.toString(),browser:'Existing Chrome profile; a dedicated walkthrough window, without cookie copying or a browser restart.'};
  if(windows.length>1)throw new Error('More than one Chrome window appeared; select the intended one with record.windows.');
  await new Promise(r=>setTimeout(r,500));
 }
 throw new Error('Chrome did not expose a new walkthrough window. Inspect record.windows; do not create repeated windows.');
}
async function save(id:string,receipt:Receipt){await atomicJson(receiptPath(id),receipt)}
async function claim(id:string){
 await fs.mkdir(DATA,{recursive:true});
 try {const handle=await fs.open(lockFile,'wx');await handle.writeFile(JSON.stringify({projectId:id,ownerPid:process.pid}));await handle.close();}
 catch(e){if((e as NodeJS.ErrnoException).code!=='EEXIST')throw e;const prior=JSON.parse(await fs.readFile(lockFile,'utf8'));let live=true;try{process.kill(prior.ownerPid,0)}catch{live=false}if(live)throw new Error('A Frame 01 window recorder is already owned by a running process. Inspect record.status; never start a duplicate.');await fs.unlink(lockFile);return claim(id)}
}
async function release(id:string){
 const owner=await fs.readFile(lockFile,'utf8').then(s=>JSON.parse(s),()=>undefined);
 if(owner?.projectId===id&&owner.ownerPid===process.pid)await fs.unlink(lockFile).catch(()=>{});
}
async function restoreTitle(receipt:Receipt){
 if(!receipt.originalTitle)return;
 try{
  const current=(await recordingWindows()).find(w=>w.hwnd===receipt.target.hwnd&&w.pid===receipt.target.pid);
  if(current?.title===receipt.target.title)await run(path.join(ROOT,'bin/capture-windows.exe'),['--label',String(current.hwnd),receipt.originalTitle],{timeout:15000});
 }catch{/* The window may already be closed; never modify a different window. */}
}
export async function startWindowRecording(id:string,options:RecordingOptions={}) {
 return serial('window-recording',async()=>{
  await readProject(id);if(sessions.size)throw new Error('A window recording is already active. Stop it before starting another.');
  let target=selectRecordingWindow(await recordingWindows(),options);const maxSeconds=options.maxSeconds??1800;
  let cropTop=target.height-target.captureHeight;
  if(options.viewport){
   const ratio=target.width/options.viewport.width,header=target.height-Math.round(options.viewport.height*ratio);
   if(header<30||header>500)throw new Error('Page viewport does not match the selected Chrome window. Refresh its live geometry.');
   // Size only the explicitly selected walkthrough window; retain its position/z order.
   await run(path.join(ROOT,'bin/capture-windows.exe'),['--size',String(target.hwnd),String(1920+target.outerWidth-target.width),String(1080+header+target.outerHeight-target.height)],{timeout:15000});
   await new Promise(r=>setTimeout(r,500));target=selectRecordingWindow(await recordingWindows(),{windowId:target.hwnd});
   cropTop=target.height-1080;
  }
  if(!Number.isInteger(maxSeconds)||maxSeconds<2||maxSeconds>7200)throw new Error('Recording duration must be 2-7200 seconds.');
  await claim(id);
  const suffix=Date.now()+'-'+crypto.randomBytes(3).toString('hex'),file=`recordings/window-${suffix}.mp4`,raw=`recordings/raw/window-${suffix}/capture.mkv`;
  // Bind modern Windows Graphics Capture to one observed Chrome window with a unique label.
  const captureTitle='Frame 01 recording '+suffix;
  const receipt:Receipt={projectId:id,file,raw,target:{...target,title:captureTitle},originalTitle:target.title,startedAt:new Date().toISOString(),pid:0,maxSeconds,state:'recording'};
  let started:Session|undefined;
  try {
   await run(path.join(ROOT,'bin/capture-windows.exe'),['--label',String(target.hwnd),captureTitle],{timeout:15000});
   target=receipt.target;
   await fs.mkdir(path.join(projectDir(id),'recordings'),{recursive:true});
   const obsArgs=await configureObs(target,path.dirname(safePath(projectDir(id),raw)),Math.max(0,cropTop));
   const child=spawn(OBS_EXE,obsArgs,{cwd:path.dirname(OBS_EXE),windowsHide:true,stdio:'pipe'});
   receipt.pid=child.pid??0;
   let resolveClose!:(code:number|null)=>void;
   const session:Session={receipt,child,closed:new Promise(r=>resolveClose=r),log:''};started=session;sessions.set(id,session);
   child.on('error',e=>{session.log+=String(e);resolveClose(-1)});child.on('close',code=>resolveClose(code));
   child.stderr.on('data',b=>{session.log=(session.log+b.toString()).slice(-12000)});
   await save(id,receipt);
   let ready=false;
   for(let attempt=0;attempt<60;attempt++){
    if(child.exitCode!==null)throw new Error('OBS did not start recording. '+session.log.slice(-1500));
    const file=await fs.stat(safePath(projectDir(id),raw)).catch(()=>undefined);if(file&&file.size>1024){ready=true;break}
    await new Promise(r=>setTimeout(r,500));
   }
   if(!ready)throw new Error('OBS has not confirmed a saved recording. Inspect its local log before retrying.');
   session.timer=setTimeout(()=>{void stopWindowRecording(id).catch(async e=>{receipt.state='interrupted';receipt.error=String(e);await save(id,receipt)})},maxSeconds*1000);session.timer.unref();
   await mutate(id,p=>event(p,'recording-started',`Automatic Chrome window capture: ${target.title}. No extension gesture, microphone or GPU encoder.`));
   return {recording:true,backend:'obs-wgc',target,file,raw,maxSeconds};
  }catch(e){
   if(started){started.child.kill();await started.closed}
   receipt.state='interrupted';receipt.error=String(e);await save(id,receipt).catch(()=>{});
   sessions.delete(id);await restoreTitle(receipt);await release(id);throw e;
  }
 });
}
export async function windowRecordingStatus(id:string){
 const current=sessions.get(id);if(current)return {...current.receipt,recording:current.child.exitCode===null&&!current.child.killed};
 const saved=await fs.readFile(receiptPath(id),'utf8').then(s=>JSON.parse(s),()=>undefined);
 return saved?{...saved,recording:false,recoveryRequired:saved.state==='recording'}:{recording:false};
}
export async function stopWindowRecording(id:string) {
 const session=sessions.get(id);if(session?.stop)return session.stop;
 const finish=async()=>{
  const receipt:Receipt=session?.receipt??JSON.parse(await fs.readFile(receiptPath(id),'utf8'));
  if(receipt.state==='complete')return {file:receipt.file,reused:true};
  if(session){
   if(session.timer)clearTimeout(session.timer);
   if(session.child.exitCode===null&&!session.child.killed)await closeOwnedObs(session.child.pid!);
   const timer=setTimeout(()=>session.child.kill(),20000);
   try{const code=await session.closed;if(code!==0)throw new Error('Window recording failed; raw MKV preserved. '+session.log.slice(-1500))}finally{clearTimeout(timer)}
  }else {let live=true;try{process.kill(receipt.pid,0)}catch{live=false}if(live)throw new Error('The prior recorder is still running. Do not start another or kill an unidentified process.');}
  const source=safePath(projectDir(id),receipt.raw),destination=safePath(projectDir(id),receipt.file);
  const rawScan=await run(FFMPEG,['-hide_banner','-i',source,'-vf','blackdetect=d=0.1:pix_th=0.02:pic_th=0.99','-an','-f','null','-'],{timeout:1800000});
  const black=[...rawScan.matchAll(/black_start:([\d.]+) black_end:([\d.]+)/g)].map(m=>({start:Number(m[1]),end:Number(m[2])}));
  if(black.some(b=>b.start>.05||b.end>3))throw new Error('Raw capture contains a blank interval beyond initial capture warmup. Raw MKV preserved.');
  const trimStart=black.length?Math.ceil((black[0].end+1/30)*30)/30:0;
  // OBS may buffer before readiness and while closing; bound the imported clip as well as the stop timer.
  const info=await normalizeRecording(source,destination,{trimStart,withoutAudio:true,maxDuration:receipt.maxSeconds}),video=info.streams.find((s:any)=>s.codec_type==='video');
  if(info.duration<.5)throw new Error('Recording is too short. Raw capture preserved.');
  const review=receipt.file.replace('.mp4','-review'),reviewDir=safePath(projectDir(id),review);await fs.mkdir(reviewDir,{recursive:true});
  const scan=await run(FFMPEG,['-hide_banner','-i',destination,'-vf','blackdetect=d=0.5:pix_th=0.02:pic_th=0.99','-an','-f','null','-'],{timeout:1800000});
  if(/black_start:/.test(scan))throw new Error('Recording contains a blank interval. Inspect the preserved capture before using it.');
  await run(FFMPEG,['-y','-i',destination,'-vf','fps=4,scale=480:270,tile=4x4','-fps_mode','vfr',path.join(reviewDir,'sheet-%03d.jpg')],{timeout:1800000});
  const proof={...receipt,state:'complete',duration:info.duration,width:video.width,height:video.height,fps:video.avg_frame_rate,frames:Number(video.nb_frames),captureWarmupRemoved:trimStart,sha256:crypto.createHash('sha256').update(await fs.readFile(destination)).digest('hex'),reviewSheets:review,reviewFps:4,visualReview:'pending',audio:'No microphone or system audio captured; use narration in the edit.',backend:'obs-wgc',at:new Date().toISOString()};
  await atomicJson(destination+'.proof.json',proof);receipt.state='complete';await save(id,receipt);await addAsset(id,receipt.file,'screen');
  await mutate(id,p=>event(p,'recording-stopped',`Saved automatic capture ${receipt.file}, ${info.duration.toFixed(2)}s, 1080p30. Inspect its 4fps review sheets before use.`));
  return {file:receipt.file,duration:info.duration,proof:receipt.file+'.proof.json',reviewSheets:review,backend:'obs-wgc'};
 };
 const promise=finish().catch(async e=>{
  if(session){session.receipt.state='interrupted';session.receipt.error=String(e);await save(id,session.receipt).catch(()=>{})}
  throw e;
 }).finally(async()=>{
  if(session){
   if(session.child.exitCode===null&&!session.child.killed){session.child.kill();await session.closed}
   await restoreTitle(session.receipt);await release(id);
  }
  sessions.delete(id);
 });if(session)session.stop=promise;return promise;
}
export function hasWindowRecording(id:string){return sessions.has(id)}
export function shutdownWindowRecordings(){for(const session of sessions.values())session.child.kill();}
