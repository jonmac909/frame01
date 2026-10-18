import fs from 'node:fs/promises';
import path from 'node:path';
import {bundle} from '@remotion/bundler';
import {selectComposition,renderMedia,renderStill} from '@remotion/renderer';
import {ROOT,projectDir,atomicJson,probe,safePath,readProject} from '../src/core.js';
import {hashFile,sourceDependencies,sectionSignature,validCachedSection} from '../src/render-cache.js';
import {readProductionContract,validateProductionContract} from '../src/production-contract.js';
import type {FullPlan} from '../video/full-types.js';
const id=process.argv[6]??'nano-banana-cartoon-workflow-28043a87',dir=projectDir(id),planName=process.argv[4]??'Source-runtime remake plan.json',plan:FullPlan=JSON.parse(await fs.readFile(safePath(dir,planName),'utf8'));
const mode=process.argv[2]??'stills',selected=(process.argv[3]??'0').split(',').map(Number),browserExecutable='C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
if(!['stills','render','repair'].includes(mode)||selected.some(n=>!Number.isSafeInteger(n)||n<0)||new Set(selected).size!==selected.length)throw new Error('Use a supported mode and unique section indexes.');
const project=await readProject(id),checked=project.contractVersion===1?await validateProductionContract(id,await readProductionContract(id),{requireComplete:true,measure:true}):undefined;
if(checked&&checked.contract.planFile!==planName)throw new Error('Source-event contract is bound to another plan.');
if(!checked)console.warn('Legacy project: source-event contract is not bound; rendered media is not quality acceptance.');
const effects=checked?.compiled.effects??[],planHash=await hashFile(safePath(dir,planName));
const dependencies=await sourceDependencies(ROOT,'video/full-remake.tsx'),settings={fps:30,width:1920,height:1080,codec:'h264',crf:19,pixelFormat:'yuv420p',gl:'swangle',concurrency:6,muted:Boolean(checked),browserSha256:await hashFile(browserExecutable)};
let serveUrl:string|undefined;
const exportName=process.argv[5]??'source-runtime';if(!/^[a-z0-9-]+$/.test(exportName)||path.basename(planName)!==planName)throw new Error('Use a project plan filename and simple export folder name.');
const output=path.join(dir,'exports',exportName);await fs.mkdir(output,{recursive:true});
const lockPath=path.join(output,'render-owner.json');let lock;
try{lock=await fs.open(lockPath,'wx')}catch(e){if((e as NodeJS.ErrnoException).code==='EEXIST')throw new Error('Export has a render-owner receipt. Inspect its process and partial files before clearing a stale receipt; never auto-replay.');throw e}
await lock.writeFile(JSON.stringify({pid:process.pid,mode,selected,planHash,startedAt:new Date().toISOString()}));await lock.sync();await lock.close();
try{
// Font requests enforce CORS; embed the existing local asset without relaxing the media server.
const fontDataUrl=plan.reviewEffects?`data:font/ttf;base64,${(await fs.readFile(safePath(dir,plan.reviewEffects.font))).toString('base64')}`:undefined;
for(const n of selected){const section=plan.sections[n];if(!section)throw new Error('Unknown section');const inputProps={plan,offset:section.from,length:section.to-section.from,fontDataUrl,effects},file=path.join(output,`section-${String(n).padStart(2,'0')}.mp4`);
 const localEffects=effects.filter(e=>e.from<section.to&&e.to>section.from),signature=await sectionSignature(ROOT,dir,plan,n,{...settings,effects:localEffects},dependencies),renderSignature=signature.signature;
 if(mode!=='stills'&&await validCachedSection(file,renderSignature,inputProps.length)){console.log(JSON.stringify({section:n,reused:true,renderSignature}));continue;}
 const required=new Set([plan.aroll,plan.whoosh,...plan.reviewEffects?[plan.reviewEffects.font,plan.reviewEffects.bananaCard]:[],...plan.sound.filter(s=>s.to>section.from&&s.from<section.to).map(s=>s.asset),...plan.shots.filter(s=>s.to>section.from&&s.from<section.to).flatMap(s=>[s.asset,...s.parts?.map(p=>p.asset)??[]]).filter((x):x is string=>!!x)]);
 for(const asset of required)await fs.access(path.join(dir,asset));
 serveUrl??=await bundle({entryPoint:path.join(ROOT,'video/full-remake.tsx'),outDir:path.join(ROOT,`.render-bundle-full-${process.pid}`)});
 const composition=await selectComposition({serveUrl,id:'FullRemake',inputProps,browserExecutable});
 if(mode==='stills'){
  const graphics=plan.reviewEffects?[...plan.reviewEffects.ctas,...plan.reviewEffects.titles].flatMap(s=>[s.from+Math.floor((s.to-s.from)*.25),s.from+Math.floor((s.to-s.from)*.7)]).concat(plan.reviewEffects.flashes.map(n=>n+4),[24,53,90,110,118]):[];
  const points=[...new Set([...plan.shots.filter(s=>s.from>=section.from&&s.from<section.to).flatMap(s=>[Math.min(section.to-1,s.to-1,s.from+30),Math.min(section.to-1,s.to-1,s.from+Math.floor((s.to-s.from)*.7))]),...graphics.filter(n=>n>=section.from&&n<section.to)])];
  for(const absolute of points)await renderStill({serveUrl,composition,inputProps,browserExecutable,frame:absolute-section.from,output:path.join(output,`section-${n}-frame-${absolute}.jpg`),imageFormat:'jpeg',jpegQuality:85,chromiumOptions:{gl:'swangle'}});
  console.log(JSON.stringify({section:n,stills:points.length}));
 }else{
  if(await fs.stat(file).then(()=>true,()=>false)){const archive=path.join(output,'history',new Date().toISOString().replace(/[:.]/g,'-'));await fs.mkdir(archive,{recursive:true});await fs.rename(file,path.join(archive,path.basename(file)));await fs.rename(file+'.proof.json',path.join(archive,path.basename(file)+'.proof.json')).catch(e=>{if((e as NodeJS.ErrnoException).code!=='ENOENT')throw e});console.log(`Archived changed section ${n} before replacement.`)}
  const began=Date.now();let previous=-1;await renderMedia({serveUrl,composition,inputProps,browserExecutable,codec:'h264',outputLocation:file+'.rendering.mp4',concurrency:6,crf:19,pixelFormat:'yuv420p',muted:Boolean(checked),chromiumOptions:{gl:'swangle'},onProgress:p=>{const step=Math.floor(p.progress*20);if(step!==previous){previous=step;console.log(`Section ${n} ${section.name}: ${step*5}%`)}}});
  const elapsedSeconds=(Date.now()-began)/1000,info=await probe(file+'.rendering.mp4');if(Math.abs(info.duration-inputProps.length/30)>.05)throw new Error('Duration mismatch');
  if(planHash!==await hashFile(safePath(dir,planName))||(await sectionSignature(ROOT,dir,plan,n,{...settings,effects:localEffects})).signature!==renderSignature)throw new Error('Inputs changed during rendering; partial output is retained but not reusable.');
  await fs.rename(file+'.rendering.mp4',file);await atomicJson(file+'.proof.json',{cacheVersion:2,section,frames:inputProps.length,renderSignature,dependencies:signature.evidence,outputSha256:await hashFile(file),elapsedSeconds,renderFps:inputProps.length/elapsedSeconds,info,qa:'Pending actual visual and audio inspection',at:new Date().toISOString()});console.log(JSON.stringify({section:n,file,duration:info.duration,elapsedSeconds,renderFps:inputProps.length/elapsedSeconds}));
 }
}
}finally{await fs.unlink(lockPath)}
