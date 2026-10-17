import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import {z} from 'zod';
export const fingerprint=(value:string)=>crypto.createHash('sha256').update(value).digest('hex');
export const words=(value:string)=>value.trim().split(/\s+/).filter(Boolean).length;
const cueSchema=z.object({start:z.number().nonnegative(),end:z.number().positive(),text:z.string().min(1)}).refine(c=>c.end>c.start);
export const scriptPlanSchema=z.object({targetDuration:z.number().positive(),sourceHash:z.string(),narrationHash:z.string(),sections:z.array(z.object({start:z.number().nonnegative(),end:z.number().positive(),sourceWords:z.number().int().positive(),text:z.string().min(1)})).min(1)});
export type ScriptPlan=z.infer<typeof scriptPlanSchema>;
// YouTube rolling captions repeat the tail of the previous cue. Count only new words.
export function sourceBeats(captions:unknown){
  const cues=z.array(cueSchema).min(1).parse(captions),seen:string[]=[],beats:{start:number;end:number;text:string}[]=[];
  let previous=-1;
  for(const c of cues){
    if(c.start<previous)throw new Error('Source captions must be ordered.');previous=c.start;
    const next=c.text.trim().split(/\s+/);let overlap=Math.min(seen.length,next.length);
    while(overlap&&!seen.slice(-overlap).every((word,i)=>word===next[i]))overlap--;
    const fresh=next.slice(overlap);seen.push(...fresh);
    if(fresh.length)beats.push({...c,text:fresh.join(' ')});
  }
  return beats;
}
export function sourceSection(captions:unknown,start:number,end:number){return sourceBeats(captions).filter(c=>c.start>=start&&c.start<end).map(c=>c.text).join(' ')}
export function validateScriptPlan(script:string,reference:{duration:number;captions:unknown},plan:ScriptPlan){
  if(!plan||!Array.isArray(plan.sections)||!plan.sections.length)throw new Error('Save the reference timing and script sections before generation.');
  scriptPlanSchema.parse(plan);
  if(plan.sourceHash!==fingerprint(JSON.stringify(reference.captions)))throw new Error('Reference changed. Rebuild the timing plan before generation.');
  if(plan.narrationHash!==fingerprint(script)||plan.sections.map(s=>s.text.trim()).join('\n\n')!==script)throw new Error('Narration changed after timing validation. Revalidate the script sections.');
  if(!Number.isFinite(reference.duration)||reference.duration<=0||Math.round(plan.targetDuration*30)!==Math.round(reference.duration*30))throw new Error('Finished runtime must match the reference.');
  const beats=sourceBeats(reference.captions);
  let end=0,totalSource=0;
  for(const section of plan.sections){
    if(!Number.isFinite(section.start)||!Number.isFinite(section.end)||Math.abs(section.start-end)>1/30||section.end<=section.start)throw new Error('Script timing must cover the reference sequentially without gaps or overlaps.');
    const actualSource=words(beats.filter(c=>c.start>=section.start&&c.start<section.end).map(c=>c.text).join(' '));
    if(section.sourceWords!==actualSource)throw new Error('Source word budgets must match the saved captions; they cannot be supplied by the model.');
    if(Math.abs(words(section.text)/actualSource-1)>.06)throw new Error('A script section differs from its source word budget by more than 6%.');
    if(/^(?:TITLE:|SHOT PLAN\b|Capture\/evidence checklist:|\[.*\]$)/im.test(section.text))throw new Error('Production directions cannot be spoken narration.');
    totalSource+=section.sourceWords;end=section.end;
  }
  if(Math.abs(end-plan.targetDuration)>1/30)throw new Error('Script sections must cover the complete reference runtime.');
  if(Math.abs(words(script)/totalSource-1)>.02)throw new Error('Narration differs from the source word budget by more than 2%.');
  return {targetDuration:plan.targetDuration,words:words(script),sourceWords:totalSource,sections:plan.sections.length};
}
export async function checkSavedScriptPlan(dir:string,p:{script:string;reference?:Record<string,unknown>}){
  if(!p.reference?.duration||!p.reference.captions)throw new Error('Reference runtime and captions are required before HeyGen submission.');
  let plan:ScriptPlan;try{plan=JSON.parse(await fs.readFile(path.join(dir,'Reference timing.json'),'utf8'))}catch{throw new Error('Reference timing plan is missing. Do not submit the video.');}
  return validateScriptPlan(p.script,p.reference as {duration:number;captions:unknown},plan);
}

export function checkReferenceScan(reference?:Record<string,unknown>){
  const analysis=reference?.analysis as {sampleFps?:number;frameCount?:number;mediaDuration?:number;source?:string}|undefined;
  const frames=reference?.frames as {seconds:number;file:string}[]|undefined;
  if(analysis?.sampleFps!==4||!analysis.source||!Number.isFinite(analysis.mediaDuration)||!frames?.length||analysis.frameCount!==frames.length||Math.abs(frames.length-Number(analysis.mediaDuration)*4)>2)throw new Error('Download the complete reference and analyze it at 4 fps before submission.');
  if(frames.some((f,i)=>!f.file||!Number.isFinite(f.seconds)||Math.abs(f.seconds-i/4)>.001))throw new Error('The 4 fps reference scan has missing or misordered frames.');
  if(reference?.duration&&Math.abs(Number(analysis.mediaDuration)-Number(reference.duration))>1)throw new Error('Reference scan duration differs from the saved source.');
  return {frames:frames.length,sampleFps:4};
}

export function checkRuntime(actual:number,expected:number,fps=30){
  if(!Number.isFinite(actual)||!Number.isFinite(expected)||expected<=0||Math.round(actual*fps)!==Math.round(expected*fps))throw new Error(`Timeline runtime must match the reference (${expected}s), got ${actual}s.`);
}

export function checkReferenceStyle(timeline:{captions:unknown[];graphics:{kind:string}[];clips:{kind:string;start:number;duration:number}[];overlays:{layout?:string;start:number;duration:number}[]},reference?:Record<string,unknown>){
  const style=reference?.visualStyle as {burnedInCaptions?:boolean;addedLabels?:boolean;presenterInsetOnScreensOnly?:boolean}|undefined;
  if(style?.burnedInCaptions===false&&timeline.captions.length)throw new Error('This reference has no burned-in subtitles. Keep transcript captions as timing data or a sidecar, not an on-screen layer.');
  if(style?.addedLabels===false&&timeline.graphics.some(g=>g.kind!=='center-text'))throw new Error('This source-matched edit does not permit added titles, lower thirds or credit badges.');
  if(style?.presenterInsetOnScreensOnly)for(const o of timeline.overlays.filter(o=>o.layout==='circle')){
    if(!timeline.clips.some(c=>c.kind==='screen'&&o.start>=c.start-.001&&o.start+o.duration<=c.start+c.duration+.001))throw new Error('The reference uses the circular presenter on software shots, not over clean example or reference cards.');
  }
}

export function checkExport(info:{duration:number;video:boolean;audio:boolean;streams:any[]},expected:number,maxVolumeDb:number){
  const video=info.streams.find(s=>s.codec_type==='video'),rate=String(video?.avg_frame_rate||'0/1').split('/').map(Number);
  if(!info.video||!info.audio||Math.abs(info.duration-expected)>.05||video?.width!==1920||video?.height!==1080||Math.abs(rate[0]/rate[1]-30)>.001)throw new Error('Export must have video, audio, 1920 × 1080 at 30 fps, and the validated duration.');
  if(!Number.isFinite(maxVolumeDb)||maxVolumeDb<=-60)throw new Error('Export audio is missing or effectively silent.');
}
