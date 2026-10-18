import {z} from 'zod';
import fs from 'node:fs/promises';
import path from 'node:path';
import {atomicJson,projectDir,safePath,mutate} from './core.js';
import {hashFile} from './render-cache.js';
const frame=z.number().int().nonnegative(),positive=z.number().int().positive(),file=z.string().min(1).max(400),span={from:frame,to:positive};
export const sectionPlanSchema=z.object({fps:z.literal(30),frames:positive,aroll:file,whoosh:file,
  shots:z.array(z.object({id:z.string().regex(/^[a-zA-Z0-9_-]{1,100}$/),...span,sourceStart:frame,sourceEnd:positive,kind:z.enum(['presenter','image','screen-still','screen-recording','example','text']),asset:file.optional(),trim:frame.optional(),card:z.boolean().optional(),note:z.string().max(1000).optional(),
    camera:z.array(z.object({frame,scale:z.number().min(.1).max(5),x:z.number().min(-5).max(5),y:z.number().min(-5).max(5)}).strict()).min(2).max(200).optional(),
    words:z.array(z.object({text:z.string().min(1).max(100),from:frame,highlight:z.boolean().optional()}).strict()).max(100).optional(),
    parts:z.array(z.object({...span,asset:file,trim:frame,scale:z.number().min(1).max(3).optional(),origin:z.string().regex(/^\d{1,3}% \d{1,3}%$/).optional()}).strict()).max(100).optional(),
  }).strict()).min(1).max(3000),
  speech:z.array(z.object({...span,trim:frame}).strict()).min(1).max(2000),sound:z.array(z.object({...span,asset:file,trim:frame,gain:z.number().min(.01).max(1)}).strict()).max(500),
  // New SFX are anchored through the contract, never independent timestamps.
  sfx:z.array(frame).max(0),sections:z.array(z.object({name:z.string().min(1).max(100),...span,sourceFrom:frame,sourceTo:positive}).strict()).min(1).max(100),limitations:z.array(z.string().max(1000)).max(100),
}).strict();
export async function saveSectionPlan(id:string,input:unknown){
  const plan=sectionPlanSchema.parse(input);let end=0;
  for(const s of plan.shots){if(s.from!==end||s.to<=s.from)throw new Error('Shots must cover the picture without gaps or overlap.');end=s.to;
    if(s.kind==='text'&&!s.words?.length)throw new Error('Text shots require explicit measured word timing.');
    if(['image','screen-still'].includes(s.kind)&&!s.asset)throw new Error('Image/screen shots need an asset.');
    if(['example','screen-recording'].includes(s.kind)&&!s.parts?.length)throw new Error('Video shots need explicit media parts.');
    if(s.camera?.some((p,i)=>p.frame>=s.to-s.from||(i>0&&p.frame<=s.camera![i-1].frame)))throw new Error('Camera frames must increase within their shot.');
    if(s.words?.some(w=>w.from>=s.to-s.from))throw new Error('Word reveals exceed the shot.');
  }
  if(end!==plan.frames)throw new Error('Picture does not cover the full plan.');end=0;
  for(const s of plan.sections){if(s.from!==end||s.to<=s.from)throw new Error('Sections must cover the plan without gaps or overlap.');end=s.to;}if(end!==plan.frames)throw new Error('Sections do not cover the full plan.');
  const filename='Full edit plan.json',destination=path.join(projectDir(id),filename);
  // Existing source-specific compositor kinds remain legacy; future plans use the typed catalog.
  await atomicJson(destination,{...plan,baseUrl:`http://127.0.0.1:${process.env.PORT||4317}/media/${id}`});await mutate(id,p=>{p.contractVersion=1});return {planFile:filename,planSha256:await hashFile(destination),frames:plan.frames,sections:plan.sections,next:'contract.save'};
}
export async function readSectionPlan(id:string,file:string,offset=0,limit=20){const p=JSON.parse(await fs.readFile(safePath(projectDir(id),file),'utf8'));if(!Array.isArray(p.shots)||!Array.isArray(p.sections))throw new Error('Not a section plan');return {planFile:file,planSha256:await hashFile(safePath(projectDir(id),file)),frames:p.frames,sections:p.sections,totalShots:p.shots.length,offset,nextOffset:offset+limit<p.shots.length?offset+limit:null,shots:p.shots.slice(offset,offset+limit)}}
