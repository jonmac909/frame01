import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import type {Express} from 'express';
import express from 'express';
import {DATA,idSchema,atomicJson,projectDir,readProject,mutate,event,reserveHeyGen,hash,addAsset,serial,safePath} from './core.js';
import {normalizeRecording} from './recording.js';
type Kind='heygen'|'walkthrough';
type Attachment={projectId:string;kind:Kind;tabId:number;url:string;lastSeen:number;snapshot?:any};
type Command={id:string;projectId:string;kind:Kind;tabId:number;method:string;args:any};
const tabs=new Map<string,Attachment>(),queue:Command[]=[],pending=new Map<string,{resolve:(r:any)=>void;reject:(e:Error)=>void;timer:NodeJS.Timeout}>();
const key=(id:string,kind:Kind)=>id+':'+kind;
const attachmentFile=path.join(DATA,'chrome-attachments.json');
// Keep only already-authorized tab mappings across a local server restart.
// Chrome still enforces the extension's tab/site permission on every action.
const savedAttachments=await fs.readFile(attachmentFile,'utf8').then(s=>JSON.parse(s),e=>{if(e.code==='ENOENT')return [];throw e});
if(!Array.isArray(savedAttachments))throw new Error('Invalid saved Chrome attachments.');
for(const t of savedAttachments){
  idSchema.parse(t.projectId);const u=new URL(t.url);
  if(!['heygen','walkthrough'].includes(t.kind)||!Number.isInteger(t.tabId)||!['http:','https:'].includes(u.protocol)||(t.kind==='heygen')!==(u.hostname==='app.heygen.com'))throw new Error('Invalid saved Chrome attachment.');
  await readProject(t.projectId);tabs.set(key(t.projectId,t.kind),{projectId:t.projectId,kind:t.kind,tabId:t.tabId,url:t.url,lastSeen:0});
}
const persistAttachments=()=>serial('chrome-attachments',()=>atomicJson(attachmentFile,[...tabs.values()].map(({projectId,kind,tabId,url})=>({projectId,kind,tabId,url}))));
const blocked=/\b(create|generate|submit|duplicate|copy video|new video|new draft|use template|use avatar|use this|publish|render|delete|buy|purchase|upgrade)\b/i;
export function bridgeStatus(){return [...tabs.values()].map(t=>({projectId:t.projectId,kind:t.kind,tabId:t.tabId,url:t.url,online:Date.now()-t.lastSeen<45000}))}
export function hasBridge(id:string,kind:Kind){return tabs.has(key(id,kind))}
async function command(id:string,kind:Kind,method:string,args:any={}){
  const tab=tabs.get(key(id,kind));if(!tab)throw new Error(`Attach your existing Chrome ${kind} tab using the Frame 01 extension. No new browser or profile will be opened.`);
  const cmd:Command={id:crypto.randomUUID(),projectId:id,kind,tabId:tab.tabId,method,args};queue.push(cmd);
  return new Promise<any>((resolve,reject)=>{const timer=setTimeout(()=>{pending.delete(cmd.id);const i=queue.indexOf(cmd);if(i>=0)queue.splice(i,1);reject(new Error('Chrome did not confirm the action. Inspect the same tab; do not repeat a HeyGen creation or submission.'))},method==='record.stop'?1830000:35000);pending.set(cmd.id,{resolve,reject,timer})});
}
async function snapshot(id:string,kind:Kind){
  const snap=await command(id,kind,'snapshot');const tab=tabs.get(key(id,kind))!;
  if(snap.imageBase64){const file=`browser/${kind}.jpg`;await fs.mkdir(path.join(projectDir(id),'browser'),{recursive:true});await fs.writeFile(path.join(projectDir(id),file),Buffer.from(snap.imageBase64,'base64'));delete snap.imageBase64;snap.screenshot=file}
  tab.url=snap.url;tab.snapshot=snap;return snap;
}
function element(id:string,kind:Kind,ref:string){const tab=tabs.get(key(id,kind));const el=tab?.snapshot?.elements.find((e:any)=>e.ref===ref);if(!el)throw new Error('Take a fresh snapshot and use its observed element reference.');return el}
async function verify(id:string){
  const p=await readProject(id),snap=await command(id,'heygen','inspect');
  if(!p.heygen.draft?.url||new URL(snap.url).pathname!==new URL(p.heygen.draft.url).pathname)throw new Error('Open the saved draft.');
  const text=(snap.text+' '+snap.values).toLowerCase(),normalize=(v:string)=>v.toLowerCase().replace(/[^a-z0-9]/g,'');
  for(const selected of [p.avatar,p.voice,p.model,p.tone].filter((v):v is string=>!!v))if(!text.includes(selected.toLowerCase()))throw new Error(`The draft does not visibly confirm ${selected}.`);
  if(!p.script.trim()||!normalize(text).includes(normalize(p.script)))throw new Error('The complete final script is not visible in the draft.');
  if(snap.voiceSpeed!==(p.voiceSpeed??1))throw new Error('Visibly verify the required voice speed (default 1.0x). Never accelerate narration to fit runtime.');
  const observedHash=hash(p.script);
  return mutate(id,p=>{if(hash(p.script)!==observedHash)throw new Error('Script changed during verification.');p.heygen.verified={avatar:p.avatar,voice:p.voice,model:p.model,tone:p.tone,voiceSpeed:snap.voiceSpeed,at:new Date().toISOString(),scriptHash:observedHash};event(p,'heygen-verified','Verified the existing Chrome draft selections, voice speed and full script.');});
}
export async function bridgeAction(id:string,name:string,args:any){
  const kind:Kind=args.kind||'heygen';
  if(name==='browser.open'||name==='browser.snapshot')return snapshot(id,kind);
  if(name==='browser.navigate'){
    const u=new URL(args.url);if(!['http:','https:'].includes(u.protocol))throw new Error('Only web URLs are allowed.');
    if(kind==='walkthrough'&&u.hostname==='app.heygen.com')throw new Error('Use the guarded HeyGen tab.');
    if(kind==='heygen'&&(u.hostname!=='app.heygen.com'||/(create|new|generate)/i.test(u.pathname)))throw new Error('Open an existing HeyGen page or use the guarded draft action.');
    const current=new URL(tabs.get(key(id,kind))?.url||'https://invalid');if(u.origin!==current.origin)throw new Error('Navigate to the other site yourself and reattach that tab. This keeps browser access limited to the site you chose.');
    await command(id,kind,'navigate',{url:u.toString()});return snapshot(id,kind);
  }
  if(name==='browser.act'){
    if(args.action!=='scroll'){
      const el=element(id,kind,args.ref);
      if(kind==='heygen'&&(blocked.test(el.text+' '+el.href)||args.action==='press'&&/enter/i.test(args.value)))throw new Error('Use the dedicated one-draft or one-video action.');
      if(el.sensitive)throw new Error('Complete sensitive form fields yourself in Chrome.');
      if(kind==='walkthrough'&&(/heygen\.com/.test(el.href)||/heygen\.com/.test(tabs.get(key(id,kind))?.url||'')))throw new Error('HeyGen is only available through the guarded surface.');
    }
    await command(id,kind,'act',args);await mutate(id,p=>event(p,'browser',`${kind}: ${args.action}`));return snapshot(id,kind);
  }
  if(name==='heygen.verify')return verify(id);
  if(name==='heygen.create_draft'||name==='heygen.submit_video')return serial('heygen-action:'+id,async()=>{
    const type=name==='heygen.create_draft'?'draft':'video';const el=element(id,'heygen',args.ref);
    if(type==='draft'&&!/create|new video|use avatar|use this|studio/i.test(el.text))throw new Error('Select the observed draft creation control.');
    if(type==='video'){if(!/generate|submit|create video|render/i.test(el.text))throw new Error('Select the final generation control.');await verify(id)}
    await reserveHeyGen(id,type);
    try{await command(id,'heygen','act',{action:'click',ref:args.ref});await mutate(id,p=>{p.heygen[type]!.state='uncertain';event(p,'heygen-click',`${type} clicked once. Reconcile its observed ID before continuing.`)})}catch(e){await mutate(id,p=>{p.heygen[type]!.state='uncertain';p.heygen[type]!.error=String(e)});throw e}
    return snapshot(id,'heygen');
  });
  if(name==='heygen.download'){
    const p=await readProject(id);if(!p.heygen.video?.url)throw new Error('Link the existing generated video first.');const el=element(id,'heygen',args.ref);if(!/download/i.test(el.text))throw new Error('Select the observed Download control.');
    await command(id,'heygen','act',{action:'click',ref:args.ref});await mutate(id,p=>event(p,'download-requested','Clicked the existing video download. Import the completed MP4 from your Chrome download folder.'));return {message:'Download requested in existing Chrome. Import the saved MP4 after it completes.'};
  }
  if(name==='record.start'){await command(id,'walkthrough','record.start');await mutate(id,p=>event(p,'recording-started','Recording the attached existing Chrome tab.'));return {recording:true}}
  if(name==='record.stop'){const result=await command(id,'walkthrough','record.stop');await mutate(id,p=>event(p,'recording-stopped',`Saved ${result.file}`));return result}
  throw new Error('Unsupported Chrome bridge action.');
}
export function installBridge(app:Express){
  app.post('/bridge/attach',async(req,res)=>{const {projectId,kind,tabId,url}=req.body;await readProject(projectId);if(!['heygen','walkthrough'].includes(kind)||!Number.isInteger(tabId))throw new Error('Invalid attachment.');const u=new URL(url);if(!['http:','https:'].includes(u.protocol))throw new Error('Attach a website tab.');if((kind==='heygen')!==(u.hostname==='app.heygen.com'))throw new Error('Attach HeyGen as HeyGen and other websites as walkthrough.');tabs.set(key(projectId,kind),{projectId,kind,tabId,url,lastSeen:Date.now()});await persistAttachments();res.json({ok:true})});
  app.post('/bridge/detach',async(req,res)=>{tabs.delete(key(req.body.projectId,req.body.kind));await persistAttachments();res.json({ok:true})});
  app.post('/bridge/poll',(req,res)=>{for(const t of tabs.values())t.lastSeen=Date.now();const cmd=queue.shift();res.json(cmd||{idle:true})});
  app.post('/bridge/result',(req,res)=>{const p=pending.get(req.body.id);if(p){clearTimeout(p.timer);pending.delete(req.body.id);req.body.error?p.reject(new Error(req.body.error)):p.resolve(req.body.result)}res.json({ok:true})});
  app.post('/bridge/recording/:id',express.raw({type:'video/webm',limit:'900mb'}),async(req,res)=>{
    const id=req.params.id;await readProject(id);if(!hasBridge(id,'walkthrough'))throw new Error('No attached walkthrough tab.');
    const file=`recordings/chrome-${Date.now()}.mp4`,raw=file.replace('.mp4','.webm');await fs.mkdir(path.join(projectDir(id),'recordings'),{recursive:true});await fs.writeFile(safePath(projectDir(id),raw),req.body);
    await normalizeRecording(safePath(projectDir(id),raw),safePath(projectDir(id),file));await addAsset(id,file,'screen');res.json({file});
  });
}
