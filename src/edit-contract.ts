import {z} from 'zod';
import {effectSchema,type TimedEffect} from '../video/effect-contract.js';

const frame=z.number().int().nonnegative(),positive=z.number().int().positive(),sha=z.string().regex(/^[a-f0-9]{64}$/),id=z.string().regex(/^[a-zA-Z0-9_-]{1,100}$/);
const span=z.object({from:frame,to:positive}).strict();
const asset=z.object({file:z.string().min(1),sha256:sha,frames:positive,audio:z.boolean()}).strict();
const anchor=z.discriminatedUnion('kind',[
  z.object({kind:z.literal('word'),wordId:id,edge:z.enum(['start','end']),offset:z.number().int().min(-300).max(300)}).strict(),
  z.object({kind:z.literal('frame'),frame}).strict(),
]);
export const editContractSchema=z.object({
  version:z.literal(1),fps:z.literal(30),frames:positive,planFile:z.string().min(1),planSha256:sha,
  runtime:z.object({minFrames:positive,maxFrames:positive,reason:z.string().min(10).max(500)}).strict(),
  source:asset.extend({scanFps:z.literal(4),reviewedWindows:z.array(span).min(1).max(1000)}).strict(),
  narration:asset.extend({textSha256:sha,words:z.array(z.object({id,text:z.string().min(1).max(100),from:frame,to:positive}).strict()).min(1).max(20000),segments:z.array(span.extend({trim:frame}).strict()).min(1).max(2000)}).strict(),
  assets:z.array(asset).max(5000),
  events:z.array(z.object({id,category:z.enum(['graphic','transition','title','cta','demo','sound','motion']),source:span,description:z.string().min(5).max(500),required:z.boolean(),disposition:z.enum(['implemented','adapted','unresolved']),reason:z.string().min(10).max(1000).optional(),
    target:z.object({shotId:id,anchor,duration:positive,effect:effectSchema.optional(),sound:z.object({asset:z.string().min(1),peakSample:frame,samples:positive,gain:z.number().min(.001).max(1)}).strict().optional()}).strict().optional(),
  }).strict()).min(1).max(3000),
  demos:z.array(z.object({id,shotId:id,asset:z.string().min(1),from:frame,to:positive,trim:frame,gain:z.number().min(.01).max(1),audio:z.enum(['native','intentional-silence']),reason:z.string().min(10).max(500).optional()}).strict()).max(500),
}).strict();
export type EditContract=z.infer<typeof editContractSchema>;
export type PlanView={frames:number;shots:{id:string;from:number;to:number;asset?:string;trim?:number;parts?:{from:number;to:number;asset:string;trim:number}[]}[];speech:{from:number;to:number;trim:number}[];sound:{from:number;to:number;asset:string;trim:number;gain:number}[]};
export type AudioCue={id:string;asset:string;fromSample:number;trimSample:number;samples:number;gain:number;role:'narration'|'demo'|'sfx'};
export const samplesPerFrame=1600; // Pinned 48 kHz / 30 FPS, no floating-point seconds in the edit clock.
const normalize=(s:string)=>s.toLowerCase().replace(/['’]/g,'').replace(/[^\p{L}\p{N}]+/gu,' ').trim();
const fail=(message:string):never=>{throw new Error(message)};
function unique(values:string[],name:string){if(new Set(values).size!==values.length)fail(`Duplicate ${name}`)}
function partition(spans:{from:number;to:number}[],end:number,name:string){let at=0;for(const s of spans){if(s.from!==at||s.to<=s.from)fail(`${name} has a gap, overlap or unordered boundary at ${at}`);at=s.to}if(at!==end)fail(`${name} does not cover all ${end} frames`)}
function within(s:{from:number;to:number},end:number,name:string){if(s.to<=s.from||s.to>end)fail(`${name} is outside its media`)}

export function compileEditContract(input:unknown,plan:PlanView,script:string){
  const c=editContractSchema.parse(input),effects:TimedEffect[]=[],audio:AudioCue[]=[],unresolved:string[]=[];
  if(c.frames!==plan.frames)fail('Plan duration changed');
  partition(plan.shots,c.frames,'Picture coverage');
  if(c.runtime.minFrames>c.runtime.maxFrames||c.frames<c.runtime.minFrames||c.frames>c.runtime.maxFrames)fail('Runtime conflicts with the recorded pacing decision');
  partition(c.source.reviewedWindows,c.source.frames,'Source inventory review');
  partition(c.narration.segments.map(s=>({from:s.trim,to:s.trim+s.to-s.from})),c.narration.frames,'Narration coverage');
  if(!c.narration.audio)fail('Narration has no audio');
  if(c.narration.file===c.source.file)fail('Reference audio cannot replace the selected narration');
  if(c.narration.segments.length!==plan.speech.length||c.narration.segments.some((s,i)=>s.from!==plan.speech[i].from||s.to!==plan.speech[i].to||s.trim!==plan.speech[i].trim))fail('Rendered speech differs from the narration contract');
  unique(c.narration.words.map(w=>w.id),'word ID');unique(c.events.map(e=>e.id),'event ID');unique(c.assets.map(a=>a.file),'asset');unique(c.demos.map(d=>d.id),'demo ID');unique(plan.shots.map(s=>s.id),'shot ID');
  if(normalize(c.narration.words.map(w=>w.text).join(' '))!==normalize(script))fail('Word alignment does not contain the complete narration text');
  let wordEnd=0,segmentEnd=0;
  for(const w of c.narration.words){within(w,c.narration.frames,`Word ${w.id}`);if(w.from<wordEnd)fail('Word alignment is unordered or overlapping');wordEnd=w.to;}
  for(const s of c.narration.segments){within(s,c.frames,'Narration segment');if(s.from<segmentEnd)fail('Narration output overlaps');segmentEnd=s.to;
    if(c.narration.words.some(w=>(w.from<s.trim&&w.to>s.trim)||(w.from<s.trim+s.to-s.from&&w.to>s.trim+s.to-s.from)))fail('Narration cut splits a word');
    audio.push({id:`narration-${s.from}`,asset:c.narration.file,fromSample:s.from*samplesPerFrame,trimSample:s.trim*samplesPerFrame,samples:(s.to-s.from)*samplesPerFrame,gain:1,role:'narration'});
  }
  const words=new Map(c.narration.words.map(w=>[w.id,w])),assets=new Map(c.assets.map(a=>[a.file,a]));
  const resolve=(a:z.infer<typeof anchor>)=>{if(a.kind==='frame')return a.frame;const w=words.get(a.wordId);if(!w)fail(`Unknown word ${a.wordId}`);const pos=a.edge==='start'?w!.from:w!.to;const s=c.narration.segments.find(s=>pos>=s.trim&&(a.edge==='start'?pos<s.trim+s.to-s.from:pos<=s.trim+s.to-s.from));if(!s)fail(`Word ${a.wordId} has no narration mapping`);return s!.from+pos-s!.trim+a.offset;};
  for(const e of c.events){within(e.source,c.source.frames,`Source event ${e.id}`);if(e.disposition==='adapted'&&!e.reason)fail(`Adaptation ${e.id} needs a reason`);
    if(e.disposition==='unresolved'){if(e.required)unresolved.push(e.id);continue;}
    if(!e.target){if(e.required)fail(`Required event ${e.id} has no implementation`);continue;}
    const t=e.target,from=resolve(t.anchor),to=from+t.duration,shot=plan.shots.find(s=>s.id===t.shotId);
    if(from<0||!shot||from<shot.from||to>shot.to)fail(`Event ${e.id} exceeds its target shot`);
    if(t.effect){if(('travelFrames' in t.effect&&t.effect.travelFrames>=t.duration)||('attackFrames' in t.effect&&t.effect.attackFrames>=t.duration)||('enterFrames' in t.effect&&t.effect.enterFrames>=t.duration))fail(`Effect ${e.id} cannot complete in its window`);if('asset' in t.effect&&!assets.has(t.effect.asset))fail(`Effect ${e.id} asset is not pinned`);effects.push({id:e.id,from,to,effect:t.effect});}
    if(t.sound){const a=assets.get(t.sound.asset);if(!a?.audio)fail(`SFX ${e.id} needs a pinned audio asset`);if(t.sound.peakSample>=t.sound.samples||t.sound.samples>a!.frames*samplesPerFrame)fail(`SFX ${e.id} peak/length exceeds its asset`);const rawStart=from*samplesPerFrame-t.sound.peakSample,trimSample=Math.max(0,-rawStart),fromSample=Math.max(0,rawStart),samples=Math.min(t.sound.samples-trimSample,c.frames*samplesPerFrame-fromSample);if(samples<=0)fail(`SFX ${e.id} is outside output`);audio.push({id:e.id,asset:t.sound.asset,fromSample,trimSample,samples,gain:t.sound.gain,role:'sfx'});}
  }
  for(const d of c.demos){within(d,c.frames,`Demo ${d.id}`);const a=assets.get(d.asset),shot=plan.shots.find(s=>s.id===d.shotId);if(!a||!shot||d.trim+d.to-d.from>a.frames)fail(`Demo ${d.id} exceeds its source`);
    const parts=shot!.parts?.map(p=>({...p,from:p.from+shot!.from,to:p.to+shot!.from}))??[{asset:shot!.asset,from:shot!.from,to:shot!.to,trim:shot!.trim??0}];
    if(!parts.some(p=>p.asset===d.asset&&p.from===d.from&&p.to===d.to&&p.trim===d.trim))fail(`Demo ${d.id} video and audio are not paired`);
    if(c.narration.segments.some(s=>s.from<d.to&&s.to>d.from))fail(`Demo ${d.id} overlaps narration`);
    if(d.audio==='intentional-silence'){if(!d.reason)fail(`Silent demo ${d.id} needs a reason`);continue;}
    if(!a!.audio)fail(`Demo ${d.id} has no native audio`);
    if(!plan.sound.some(s=>s.asset===d.asset&&s.from===d.from&&s.to===d.to&&s.trim===d.trim&&s.gain===d.gain))fail(`Demo ${d.id} rendered audio differs from its video`);
    if(c.demos.some(other=>other!==d&&other.audio==='native'&&other.asset===d.asset&&other.trim<d.trim+d.to-d.from&&other.trim+other.to-other.from>d.trim))fail(`Demo ${d.id} repeats native dialogue`);
    audio.push({id:d.id,asset:d.asset,fromSample:d.from*samplesPerFrame,trimSample:d.trim*samplesPerFrame,samples:(d.to-d.from)*samplesPerFrame,gain:d.gain,role:'demo'});
  }
  for(const s of plan.sound)if(!c.demos.some(d=>d.audio==='native'&&d.asset===s.asset&&d.from===s.from&&d.to===s.to&&d.trim===s.trim&&d.gain===s.gain))fail('Rendered sound has no paired demo contract; attach SFX to events');
  for(const e of c.events.filter(e=>e.category==='demo'&&e.required&&e.disposition!=='unresolved'))if(!c.demos.some(d=>d.shotId===e.target?.shotId))fail(`Example ${e.id} has no audio disposition`);
  return {version:1 as const,frames:c.frames,effects,audio,unresolved,coverage:{total:c.events.length,required:c.events.filter(e=>e.required).length,implemented:c.events.filter(e=>e.disposition==='implemented').length,adapted:c.events.filter(e=>e.disposition==='adapted').length},visualReview:'Pending rendered audiovisual inspection; inventory declarations are not visual proof.'};
}
