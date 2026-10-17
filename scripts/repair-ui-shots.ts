import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import {bundle} from '@remotion/bundler';
import {selectComposition,renderMedia} from '@remotion/renderer';
import {ROOT,projectDir,atomicJson,probe,run,FFMPEG} from '../src/core.js';
import type {FullPlan} from '../video/full-types.js';
const dir=projectDir('nano-banana-cartoon-workflow-28043a87');
const plan:FullPlan=JSON.parse(await fs.readFile(path.join(dir,'Source-runtime remake plan.json'),'utf8'));
const output=path.join(dir,'exports/source-runtime'),patchDir=path.join(output,'ui-repairs');
await fs.mkdir(patchDir,{recursive:true});
const browserExecutable='C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const serveUrl=await bundle({entryPoint:path.join(ROOT,'video/full-remake.tsx'),outDir:path.join(ROOT,`.render-bundle-patches-${process.pid}`)});
for(const n of (process.argv[2]??'1,2,3,5').split(',').map(Number)){
 const section=plan.sections[n],file=path.join(output,`section-${String(n).padStart(2,'0')}.mp4`);
 const shots=plan.shots.filter(s=>s.from>=section.from&&s.to<=section.to&&(s.asset?.endsWith('-v3.mp4')||s.asset?.endsWith('nineties-room-edit-v2.mp4')));
 if(!shots.length)continue;
 const currentProof=JSON.parse(await fs.readFile(file+'.proof.json','utf8'));
 const currentInfo=await probe(file),expected=section.to-section.from;
 const native=(info:Awaited<ReturnType<typeof probe>>)=>info.streams.some((v:any)=>v.codec_type==='video'&&v.r_frame_rate==='30/1'&&Number(v.nb_frames)===expected);
 if(currentProof.uiRepairVersion===2&&native(currentInfo)&&currentProof.repairedUiShots?.join(',')===shots.map(s=>s.id).join(',')){console.log(`Section ${n} UI repairs already applied.`);continue;}
 let base=file,proof=currentProof;
 if(!native(currentInfo)||currentProof.repairedUiShots){
  const history=path.join(output,'history');let found=false;
  for(const folder of await fs.readdir(history)){const candidate=path.join(history,folder,path.basename(file));
   if(!await fs.stat(candidate).then(()=>true,()=>false))continue;
   const prior=JSON.parse(await fs.readFile(candidate+'.proof.json','utf8'));
   if(!prior.repairedUiShots&&native(await probe(candidate))){base=candidate;proof=prior;found=true;break;}
  }
  assert(found,`Preserved native section ${n} is required before repair`);
 }
 const patches:string[]=[];
 for(const shot of shots){
  const target=path.join(patchDir,`${shot.id}-${shot.from}-${shot.to}.mp4`);patches.push(target);
  if(await fs.stat(target).then(()=>true,()=>false)){const info=await probe(target);assert(info.streams.some((v:any)=>v.codec_type==='video'&&v.r_frame_rate==='30/1'&&Number(v.nb_frames)===shot.to-shot.from));continue;}
  const inputProps={plan,offset:shot.from,length:shot.to-shot.from};
  const composition=await selectComposition({serveUrl,id:'FullRemake',inputProps,browserExecutable});
  await renderMedia({serveUrl,composition,inputProps,browserExecutable,codec:'h264',outputLocation:target+'.rendering.mp4',concurrency:6,crf:19,pixelFormat:'yuv420p',chromiumOptions:{gl:'swangle'}});
  await fs.rename(target+'.rendering.mp4',target);console.log(`Rendered corrected ${shot.id} in section ${n}.`);
 }
 const args=['-hide_banner','-loglevel','error','-y','-i',base,...patches.flatMap(p=>['-i',p])];
 const filters:string[]=[],labels:string[]=[];let cursor=0,k=0;
 const piece=(input:number,start:number,end:number)=>{const label=`p${k++}`;filters.push(`[${input}:v]trim=start_frame=${start}:end_frame=${end},settb=expr=1/30,setpts=N[${label}]`);labels.push(`[${label}]`)};
 shots.forEach((s,i)=>{const start=s.from-section.from,end=s.to-section.from;if(start>cursor)piece(0,cursor,start);piece(i+1,0,end-start);cursor=end});
 if(cursor<section.to-section.from)piece(0,cursor,section.to-section.from);
 filters.push(`${labels.join('')}concat=n=${labels.length}:v=1:a=0,fps=30[v]`);
 const repaired=file+'.repaired.mp4';
 await run(FFMPEG,[...args,'-filter_complex',filters.join(';'),'-map','[v]','-map','0:a:0','-c:v','libx264','-threads','4','-preset','veryfast','-crf','19','-r','30','-fps_mode','cfr','-frames:v',String(expected),'-pix_fmt','yuv420p','-c:a','copy','-movflags','+faststart',repaired]);
 const info=await probe(repaired);assert(Math.abs(info.duration-expected/30)<.05&&native(info),'Repair must retain exact30fps frame count and duration');
 const archive=path.join(output,'history',`ui-repair-${Date.now()}`);await fs.mkdir(archive,{recursive:true});
 await fs.rename(file,path.join(archive,path.basename(file)));await fs.rename(file+'.proof.json',path.join(archive,path.basename(file)+'.proof.json'));
 await fs.rename(repaired,file);await atomicJson(file+'.proof.json',{...proof,info,uiRepairVersion:2,repairedUiShots:shots.map(s=>s.id),repair:'Only incorrect model/output UI shots replaced; original section audio copied unchanged. Explicit30fps time base and frame-count acceptance.',qa:'Pending inspection of final repaired section',at:new Date().toISOString()});
 console.log(`Patched ${shots.length} UI shots in section ${n}.`);
}
