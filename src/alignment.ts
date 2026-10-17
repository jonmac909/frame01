import fs from 'node:fs/promises';
import path from 'node:path';
import {readProject,projectDir,safePath,probe,atomicJson,mutate,event} from './core.js';
import {parseVtt} from './reference.js';
import {fingerprint,validateScriptPlan,type ScriptPlan} from './preflight.js';
const normalize=(s:string)=>s.toLowerCase().replace(/[^\p{L}\p{N}]/gu,'');
type Cue={start:number;end:number;text:string};
export function alignSections(script:string,sections:ScriptPlan['sections'],captions:Cue[],mediaDuration:number){
  if(!captions.length||!Number.isFinite(mediaDuration)||mediaDuration<=0)throw new Error('Measured A-roll and timed captions are required.');
  let offset=0,last=0;
  const spans=captions.map(c=>{
    if(!Number.isFinite(c.start)||!Number.isFinite(c.end)||c.start<last-.001||c.end<=c.start||c.end>mediaDuration+.05)throw new Error('Caption timings must be ordered and inside the measured A-roll.');
    const startOffset=offset;offset+=normalize(c.text).length;last=c.end;return {...c,startOffset,endOffset:offset};
  });
  if(normalize(script)!==normalize(captions.map(c=>c.text).join(' ')))throw new Error('A-roll captions do not match the complete saved narration.');
  if(normalize(sections.map(s=>s.text).join(' '))!==normalize(script))throw new Error('Script sections do not match the saved narration.');
  let position=0;
  const starts=sections.map(s=>{
    const cue=spans.find(c=>c.startOffset===position);
    if(!cue)throw new Error('A section boundary falls inside a caption. Use measured word alignment; do not estimate the cut.');
    position+=normalize(s.text).length;return cue.start;
  });
  return sections.map((s,i)=>{
    const sourceStart=starts[i],sourceEnd=starts[i+1]??mediaDuration,speechDuration=sourceEnd-sourceStart,gapSeconds=s.end-s.start-speechDuration;
    if(gapSeconds<-.04)throw new Error(`Section ${i+1} exceeds its reference window. Do not accelerate speech automatically.`);
    return {index:i,targetStart:s.start,targetEnd:s.end,sourceStart,sourceEnd,speechDuration,gapSeconds:Math.max(0,gapSeconds)};
  });
}
export async function alignAroll(id:string,input:{file:string;path:string}){
  const p=await readProject(id),dir=projectDir(id);
  if(!p.assets.some(a=>a.file===input.file&&a.kind==='aroll'))throw new Error('Choose an imported A-roll asset.');
  const plan:ScriptPlan=JSON.parse(await fs.readFile(path.join(dir,'Reference timing.json'),'utf8'));
  validateScriptPlan(p.script,p.reference as {duration:number;captions:unknown},plan);
  const text=await fs.readFile(input.path,'utf8'),captions=parseVtt(text),info=await probe(safePath(dir,input.file));
  if(!info.audio||!info.video)throw new Error('A-roll needs both video and audio.');
  const sections=alignSections(p.script,plan.sections,captions,info.duration);
  const proof={asset:input.file,mediaDuration:info.duration,scriptHash:fingerprint(p.script),captionsHash:fingerprint(text),timingHash:fingerprint(JSON.stringify(plan)),basis:'HeyGen-exported caption boundaries; full narration text matched. Not an independent audio transcription.',sections,captions};
  await fs.writeFile(path.join(dir,'A-roll captions.srt'),text);
  await atomicJson(path.join(dir,'A-roll alignment.json'),proof);
  await mutate(id,p=>{p.heygen.asset=input.file;event(p,'aroll-aligned',`Matched all narration and ${sections.length} section boundaries to ${captions.length} HeyGen subtitle cues. Source duration ${info.duration}s. No speech speed changes.`)});
  return {file:'A-roll alignment.json',mediaDuration:info.duration,sections,captions:captions.length,basis:proof.basis};
}
