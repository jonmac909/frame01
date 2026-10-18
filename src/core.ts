import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {spawn} from 'node:child_process';
import {z} from 'zod';
import {checkSavedScriptPlan,checkRuntime,checkReferenceScan,checkReferenceStyle} from './preflight.js';

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const DATA = process.env.EDITOR_DATA_DIR || path.join(ROOT, 'data');
export const COURSE = process.env.COURSE_DIR || path.resolve(ROOT, '../CapCut Lab - Matt Loui');
export const FFMPEG = process.env.FFMPEG_PATH || 'C:\\ffmpeg\\bin\\ffmpeg.exe';
export const FFPROBE = process.env.FFPROBE_PATH || 'C:\\ffmpeg\\bin\\ffprobe.exe';
export const YTDLP = process.env.YTDLP_PATH || 'C:\\Users\\jonst\\AppData\\Local\\Programs\\Python\\Python310\\Scripts\\yt-dlp.exe';
export const idSchema = z.string().regex(/^[a-z0-9][a-z0-9-]{0,79}$/);
export const clipSchema = z.object({
  id:z.string().min(1), asset:z.string().min(1), start:z.number().min(0), duration:z.number().positive(),
  trim:z.number().min(0).default(0), kind:z.enum(['aroll','screen','broll','image']), muted:z.boolean().default(false),
  layout:z.enum(['full','card']).default('full'),entrance:z.enum(['none','rise','swipe']).default('none'),
  zoom:z.number().min(1).max(3).optional(),zoomEnd:z.number().min(1).max(3).optional(),focusX:z.number().min(0).max(100).optional(),focusXEnd:z.number().min(0).max(100).optional(),focusY:z.number().min(0).max(100).optional(),
  // Positions are viewport fractions, measured against a reference frame.
  camera:z.array(z.object({frame:z.number().int().min(0),scale:z.number().min(.1).max(5),x:z.number().min(-5).max(5),y:z.number().min(-5).max(5)})).min(2).refine(points=>points.every((p,i)=>i===0||p.frame>points[i-1].frame),'Camera frames must be strictly increasing').optional(),
});
export const timelineSchema = z.object({
  fps:z.literal(30).default(30), width:z.literal(1920).default(1920), height:z.literal(1080).default(1080),
  title:z.string(), accent:z.string().regex(/^#[0-9a-fA-F]{6}$/).default('#d4fa72'),
  narration:z.string().optional(),
  runtime:z.object({mode:z.enum(['source-window','natural']),minFrames:z.number().int().positive(),maxFrames:z.number().int().positive(),reason:z.string().min(10).max(500)}).strict().optional(),
  speech:z.array(z.object({from:z.number().int().nonnegative(),to:z.number().int().positive(),trim:z.number().int().nonnegative()}).strict()).optional(),
  font:z.string().optional(),
  audio:z.array(z.object({id:z.string(),asset:z.string(),start:z.number().min(0),duration:z.number().positive(),trim:z.number().min(0).default(0),volume:z.number().min(0).max(1).default(.22),fade:z.number().min(0).max(1).default(.04)})).default([]),
  overlays:z.array(z.object({id:z.string(),asset:z.string(),start:z.number().min(0),duration:z.number().positive(),trim:z.number().min(0).default(0),blend:z.enum(['normal','screen','multiply']).default('screen'),opacity:z.number().min(0).max(1).default(1),layout:z.enum(['full','circle']).default('full')})).default([]),
  clips:z.array(clipSchema).min(1),
  captions:z.array(z.object({start:z.number().min(0),end:z.number().positive(),text:z.string().min(1)})).default([]),
  graphics:z.array(z.object({start:z.number().min(0),duration:z.number().positive(),text:z.string().max(180),kind:z.enum(['title','step','lower-third','center-text','credit'])})).default([]),
});
export type Timeline=z.infer<typeof timelineSchema>;
export type Operation={attemptedAt:string; state:'pending'|'confirmed'|'uncertain'; url?:string; error?:string};
export type Project={
  id:string; title:string; referenceUrl:string; avatar:string; voice:string; model:'Avatar III'|'Avatar IV'; tone?:string; voiceSpeed?:number; createdAt:string;
  script:string; notes:string; timeline?:Timeline; reference?:Record<string,unknown>;contractVersion?:1;
  heygen:{draft?:Operation; video?:Operation; verified?:{avatar:string;voice:string;model:string;tone?:string;voiceSpeed?:number;at:string;scriptHash:string}; asset?:string; acceptedTestVoiceSpeed?:number};
  events:{at:string;type:string;message:string}[]; assets:{file:string;kind:string;duration?:number}[];
  render?:{file:string;at:string;duration:number}; sessionId?:string;
};
const queues=new Map<string,Promise<unknown>>();
export function serial<T>(key:string, fn:()=>Promise<T>):Promise<T>{
  const result=(queues.get(key)||Promise.resolve()).catch(()=>{}).then(fn);
  queues.set(key,result); return result.finally(()=>{if(queues.get(key)===result) queues.delete(key)});
}
export function projectDir(id:string){return path.join(DATA,'projects',idSchema.parse(id))}
export function safePath(root:string,relative:string){
  const resolved=path.resolve(root,relative); const rel=path.relative(root,resolved);
  if(!rel || rel.startsWith('..') || path.isAbsolute(rel)) throw new Error('Path must stay inside the project.');
  return resolved;
}
export async function atomicJson(file:string,value:unknown){
  await fs.mkdir(path.dirname(file),{recursive:true}); const temp=file+'.'+crypto.randomUUID()+'.tmp';
  const handle=await fs.open(temp,'w');try{await handle.writeFile(JSON.stringify(value,null,2));await handle.sync()}finally{await handle.close()}await fs.rename(temp,file);
}
export async function readProject(id:string):Promise<Project>{return JSON.parse(await fs.readFile(path.join(projectDir(id),'project.json'),'utf8'))}
export async function mutate(id:string,fn:(p:Project)=>void|Promise<void>){
  return serial('project:'+id,async()=>{const p=await readProject(id); await fn(p); await atomicJson(path.join(projectDir(id),'project.json'),p); return p});
}
export function event(p:Project,type:string,message:string){p.events.push({at:new Date().toISOString(),type,message})}
export async function createProject(input:{title:string;referenceUrl:string;avatar:string;voice:string;model?:'Avatar III'|'Avatar IV';tone?:string}){
  const parsed=z.object({title:z.string().min(1).max(180),referenceUrl:z.string().url(),avatar:z.string().min(1),voice:z.string().min(1),model:z.enum(['Avatar III','Avatar IV']).default('Avatar III'),tone:z.string().min(1).default('Warm')}).parse(input);
  const id=(parsed.title.toLowerCase().replace(/[^a-z0-9]+/g,'-').slice(0,45)||'video')+'-'+crypto.randomBytes(4).toString('hex');
  const p:Project={...parsed,voiceSpeed:1,contractVersion:1,id,createdAt:new Date().toISOString(),script:'',notes:'',heygen:{},events:[],assets:[]};
  event(p,'created','Project created. HeyGen allowance: one draft, one submitted video.');
  await atomicJson(path.join(projectDir(id),'project.json'),p);return p;
}
export async function listProjects(){
  await fs.mkdir(path.join(DATA,'projects'),{recursive:true});const dirs=await fs.readdir(path.join(DATA,'projects'));
  const out=await Promise.all(dirs.filter(x=>idSchema.safeParse(x).success).map(id=>readProject(id).catch(()=>null)));
  return out.filter((p):p is Project=>!!p).sort((a,b)=>b.createdAt.localeCompare(a.createdAt));
}
export async function reserveHeyGen(id:string,kind:'draft'|'video'|'replacement-video'){
  if(kind==='replacement-video')return (await import('./heygen-replacement.js')).reserveReplacement(id);
  return mutate(id,async p=>{
    if(p.heygen[kind])throw new Error(`This project has already used its one HeyGen ${kind} attempt. Reconcile the existing item; never create a replacement.`);
    if(kind==='video'){
      if(p.heygen.draft?.state!=='confirmed')throw new Error('Confirm the existing draft first.');
      const v=p.heygen.verified;
      if(!v||v.avatar!==p.avatar||v.voice!==p.voice||v.model!==p.model||v.tone!==p.tone||v.voiceSpeed!==(p.voiceSpeed??1)||v.scriptHash!==hash(p.script))throw new Error('Verify the selected avatar, voice, motion model, tone, voice speed, and final script in the current draft before submitting.');
      await checkSavedScriptPlan(projectDir(id),p);
      checkReferenceScan(p.reference);
    }
    // Exclusive durable reservation also protects against another process and a crash
    // between reservation and project.json persistence. Never remove this receipt.
    const attemptedAt=new Date().toISOString();let receipt;
    try{receipt=await fs.open(path.join(projectDir(id),`heygen-${kind}-attempt.json`),'wx')}catch(e){if((e as NodeJS.ErrnoException).code==='EEXIST')throw new Error(`This project has already used its one HeyGen ${kind} attempt. Reconcile the existing item; never create a replacement.`);throw e}
    try{await receipt.writeFile(JSON.stringify({attemptedAt,kind,scriptHash:hash(p.script)}));await receipt.sync()}finally{await receipt.close()}
    p.heygen[kind]={attemptedAt,state:'pending'};
    event(p,'heygen-reserved',`Reserved the ONLY ${kind} attempt before clicking. A crash or timeout does not reset this allowance.`);
  });
}
export function hash(s:string){return crypto.createHash('sha256').update(s).digest('hex')}
export async function validateTimeline(id:string,input:unknown){
  const t=timelineSchema.parse(input);const end=Math.max(...t.clips.map(c=>c.start+c.duration));
  const p=await readProject(id);
  checkReferenceStyle(t,p.reference);
  if(t.runtime){const frames=Math.round(end*t.fps),r=t.runtime;if(r.minFrames>r.maxFrames||frames<r.minFrames||frames>r.maxFrames)throw new Error('Timeline runtime conflicts with the recorded pacing decision.');if(r.mode==='source-window'&&p.reference?.duration){const source=Math.round(Number(p.reference.duration)*30);if(r.minFrames<source-900||r.maxFrames>source+900)throw new Error('Source-window runtime exceeds the permitted 30 seconds.');}}
  else if(p.reference?.duration)checkRuntime(end,Number(p.reference.duration),t.fps);
  const ids=[...t.clips,...t.audio,...t.overlays].map(c=>c.id);
  if(new Set(ids).size!==ids.length)throw new Error('Each timeline clip, audio layer, and overlay needs a unique ID.');
  const ordered=[...t.clips].sort((a,b)=>a.start-b.start);let covered=0;
  for(const c of ordered){
    if(p.assets.some(a=>a.file===c.asset&&a.kind==='reference')||/^reference[\\/]/i.test(c.asset))throw new Error('Reference footage cannot be used in the remake.');
    if(Math.round(c.duration*t.fps)<1)throw new Error('Each clip must contain at least one frame.');
    if(c.start>covered+1/t.fps)throw new Error(`Timeline gap before ${c.id}.`);
    if(c.start<covered-1/t.fps)throw new Error('V1 uses sequential clips; overlapping clips are not supported.');
    covered=c.start+c.duration;
    const info=await probe(safePath(projectDir(id),c.asset));
    if(c.kind==='image'){
      if(!/\.(png|jpg|jpeg)$/i.test(c.asset)||c.trim!==0)throw new Error('Still-image clips require a PNG/JPEG and zero trim.');
    }else if(c.trim+c.duration>info.duration+.1)throw new Error(`${c.id} runs past its source media.`);
    if(!info.video)throw new Error(`${c.asset} has no video stream.`);
  }
  for(const c of t.captions)if(c.end<=c.start||c.end>end+.04)throw new Error('Caption times must be ordered and inside the timeline.');
  for(const g of t.graphics)if(g.start+g.duration>end+.04)throw new Error('Graphic runs past the timeline.');
  if(t.narration){const info=await probe(safePath(projectDir(id),t.narration));if(!info.audio||(!t.speech&&info.duration<end-.1)||t.speech?.some(s=>s.trim+s.to-s.from>Math.round(info.duration*30)+1))throw new Error('Narration must contain audio covering its complete mapped segments.');}
  for(const a of t.audio){const info=await probe(safePath(projectDir(id),a.asset));if(!info.audio||a.trim+a.duration>info.duration+.1||a.start+a.duration>end+.04)throw new Error(`Sound effect ${a.id} exceeds its source or timeline, or has no audio.`);}
  for(const o of t.overlays){const info=await probe(safePath(projectDir(id),o.asset));if(!info.video||o.trim+o.duration>info.duration+.1||o.start+o.duration>end+.04)throw new Error(`Overlay ${o.id} exceeds its source or timeline.`);}
  if(t.font){if(!/\.(ttf|otf|woff2?)$/i.test(t.font))throw new Error('Choose an imported font.');await fs.access(safePath(projectDir(id),t.font));}
  return t;
}
export async function run(exe:string,args:string[],options:{cwd?:string;timeout?:number}={}):Promise<string>{
  return new Promise((resolve,reject)=>{
    const child=spawn(exe,args,{cwd:options.cwd||ROOT,windowsHide:true,shell:false});let output='';
    const timer=setTimeout(()=>{child.kill();reject(new Error(`Timed out: ${path.basename(exe)}`))},options.timeout||180000);
    const capture=(data:Buffer)=>{output=(output+data.toString()).slice(-150000)};
    child.stdout.on('data',capture);child.stderr.on('data',capture);
    child.on('error',e=>{clearTimeout(timer);reject(e)});
    child.on('close',code=>{clearTimeout(timer);code===0?resolve(output):reject(new Error(`${path.basename(exe)} exited ${code}: ${output.slice(-4000)}`))});
  });
}
export async function probe(file:string){
  const raw=JSON.parse(await run(FFPROBE,['-v','error','-show_format','-show_streams','-of','json',file]));
  return {duration:Number(raw.format.duration)||0,video:raw.streams.some((s:any)=>s.codec_type==='video'),audio:raw.streams.some((s:any)=>s.codec_type==='audio'),streams:raw.streams};
}
export async function addAsset(id:string,file:string,kind:string){
  const info=await probe(safePath(projectDir(id),file));
  return mutate(id,p=>{p.assets=p.assets.filter(a=>a.file!==file);p.assets.push({file,kind,duration:info.duration});event(p,'asset',`${kind}: ${file} (${info.duration.toFixed(1)}s)`)});
}
