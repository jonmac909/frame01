import fs from 'node:fs/promises';
import path from 'node:path';
import {bundle} from '@remotion/bundler';
import {selectComposition,renderMedia,renderStill} from '@remotion/renderer';
import {ROOT,projectDir,atomicJson,probe} from '../src/core.js';
import type {FullPlan} from '../video/full-types.js';
const id='nano-banana-cartoon-workflow-28043a87',dir=projectDir(id),plan:FullPlan=JSON.parse(await fs.readFile(path.join(dir,'Source-runtime remake plan.json'),'utf8'));
const mode=process.argv[2]??'stills',selected=(process.argv[3]??'0').split(',').map(Number),browserExecutable='C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const serveUrl=await bundle({entryPoint:path.join(ROOT,'video/full-remake.tsx'),outDir:path.join(ROOT,`.render-bundle-full-${process.pid}`)});
const output=path.join(dir,'exports/source-runtime');await fs.mkdir(output,{recursive:true});
for(const n of selected){const section=plan.sections[n];if(!section)throw new Error('Unknown section');const inputProps={plan,offset:section.from,length:section.to-section.from},file=path.join(output,`section-${String(n).padStart(2,'0')}.mp4`);
 const required=new Set([plan.aroll,plan.whoosh,...plan.shots.filter(s=>s.to>section.from&&s.from<section.to).flatMap(s=>[s.asset,...s.parts?.map(p=>p.asset)??[]]).filter((x):x is string=>!!x)]);
 for(const asset of required)await fs.access(path.join(dir,asset));
 const composition=await selectComposition({serveUrl,id:'FullRemake',inputProps,browserExecutable});
 if(mode==='stills'){
  const points=[...new Set(plan.shots.filter(s=>s.from>=section.from&&s.from<section.to).flatMap(s=>[Math.min(section.to-1,s.to-1,s.from+30),Math.min(section.to-1,s.to-1,s.from+Math.floor((s.to-s.from)*.7))]))];
  for(const absolute of points)await renderStill({serveUrl,composition,inputProps,browserExecutable,frame:absolute-section.from,output:path.join(output,`section-${n}-frame-${absolute}.jpg`),imageFormat:'jpeg',jpegQuality:85,chromiumOptions:{gl:'swangle'}});
  console.log(JSON.stringify({section:n,stills:points.length}));
 }else{
  if(await fs.stat(file).then(()=>true,()=>false)){if(mode!=='repair'){console.log(`Existing section ${n}; verify instead of overwrite.`);continue}const archive=path.join(output,'history',new Date().toISOString().replace(/[:.]/g,'-'));await fs.mkdir(archive,{recursive:true});await fs.rename(file,path.join(archive,path.basename(file)));await fs.rename(file+'.proof.json',path.join(archive,path.basename(file)+'.proof.json'));console.log(`Archived section ${n} before targeted defect repair.`)}
  const began=Date.now();let previous=-1;await renderMedia({serveUrl,composition,inputProps,browserExecutable,codec:'h264',outputLocation:file+'.rendering.mp4',concurrency:6,crf:19,pixelFormat:'yuv420p',chromiumOptions:{gl:'swangle'},onProgress:p=>{const step=Math.floor(p.progress*20);if(step!==previous){previous=step;console.log(`Section ${n} ${section.name}: ${step*5}%`)}}});
  const elapsedSeconds=(Date.now()-began)/1000,info=await probe(file+'.rendering.mp4');if(Math.abs(info.duration-inputProps.length/30)>.05)throw new Error('Duration mismatch');await fs.rename(file+'.rendering.mp4',file);await atomicJson(file+'.proof.json',{section,frames:inputProps.length,elapsedSeconds,renderFps:inputProps.length/elapsedSeconds,info,qa:'Pending actual visual and audio inspection',at:new Date().toISOString()});console.log(JSON.stringify({section:n,file,duration:info.duration,elapsedSeconds,renderFps:inputProps.length/elapsedSeconds}));
 }
}
