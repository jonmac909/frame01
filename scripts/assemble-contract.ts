import fs from 'node:fs/promises';
import path from 'node:path';
import {projectDir,safePath,run,FFMPEG,probe,atomicJson,ROOT} from '../src/core.js';
import {readProductionContract,validateProductionContract,prepareContractAudio} from '../src/production-contract.js';
import {hashFile,sectionSignature,validCachedSection} from '../src/render-cache.js';
import {checkExport} from '../src/preflight.js';
import type {FullPlan} from '../video/full-types.js';

const [id,exportName,name='master.mp4']=process.argv.slice(2);if(!id||!/^[a-z0-9-]+$/.test(exportName)||!/^[-a-zA-Z0-9 _]+\.mp4$/.test(name))throw new Error('Usage: assemble-contract.ts PROJECT EXPORT MASTER.mp4');
const dir=projectDir(id),checked=await validateProductionContract(id,await readProductionContract(id),{requireComplete:true,measure:true}),plan:FullPlan=JSON.parse(await fs.readFile(safePath(dir,checked.contract.planFile),'utf8'));
const output=path.join(dir,'exports',exportName),destination=path.join(output,name),lockPath=path.join(output,'assembly-owner.json');await fs.mkdir(output,{recursive:true});const lock=await fs.open(lockPath,'wx');await lock.writeFile(JSON.stringify({pid:process.pid,startedAt:new Date().toISOString(),contractSha256:checked.contractSha256}));await lock.sync();await lock.close();
try{
  const parts:string[]=[];let boundary=0;
  for(let i=0;i<plan.sections.length;i++){
    const section=plan.sections[i];if(section.from!==boundary||section.to<=section.from)throw new Error('Section boundaries have gaps or overlaps');boundary=section.to;
    const file=path.join(output,`section-${String(i).padStart(2,'0')}.mp4`),proof=JSON.parse(await fs.readFile(file+'.proof.json','utf8'));
    const localEffects=checked.compiled.effects.filter(e=>e.from<section.to&&e.to>section.from),settings={...proof.dependencies.settings,effects:localEffects};
    if(settings.muted!==true)throw new Error('Contract assembly requires silent picture renders and its controlled audio stem');
    const signature=await sectionSignature(ROOT,dir,plan,i,settings);
    if(!await validCachedSection(file,signature.signature,section.to-section.from))throw new Error(`Section ${i} is missing, changed or stale`);
    parts.push(`file '${path.basename(file)}'`);
  }
  if(boundary!==checked.contract.frames)throw new Error('Sections do not cover the complete master');
  const audio=await prepareContractAudio(id,checked),concat=path.join(output,'contract-concat.txt');await fs.writeFile(concat,parts.join('\n')+'\n');
  const partial=destination+'.assembling.mp4';
  await run(FFMPEG,['-v','error','-y','-f','concat','-safe','1','-i',concat,'-i',safePath(dir,audio),'-map','0:v:0','-map','1:a:0','-c:v','copy','-c:a','aac','-b:a','192k','-movflags','+faststart',partial],{timeout:1800000});
  const info=await probe(partial),levels=await run(FFMPEG,['-i',partial,'-vn','-af','volumedetect','-f','null','-'],{timeout:1800000});checkExport(info,checked.contract.frames/30,Number(levels.match(/max_volume: ([-\d.]+) dB/)?.[1]??NaN));
  await validateProductionContract(id,checked.contract,{requireComplete:true});
  if(await fs.stat(destination).then(()=>true,()=>false)){const history=path.join(output,'history',new Date().toISOString().replace(/[:.]/g,'-'));await fs.mkdir(history,{recursive:true});await fs.rename(destination,path.join(history,name));await fs.rename(destination+'.proof.json',path.join(history,name+'.proof.json')).catch(e=>{if((e as NodeJS.ErrnoException).code!=='ENOENT')throw e})}
  await fs.rename(partial,destination);await atomicJson(destination+'.proof.json',{file:destination,sha256:await hashFile(destination),contractSha256:checked.contractSha256,audioStem:audio,frames:checked.contract.frames,info,qa:'Technical validation complete. All 4 FPS visual review, phrase listening, example sync and feedback evidence are still required.'});console.log(JSON.stringify({file:destination,duration:info.duration,sha256:await hashFile(destination)}));
}finally{await fs.unlink(lockPath)}
