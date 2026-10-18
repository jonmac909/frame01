import fs from 'node:fs/promises';
import path from 'node:path';
import {atomicJson,projectDir,safePath,readProject,mutate,probe,hash,serial,run,FFMPEG,type Timeline} from './core.js';
import {compileEditContract,editContractSchema,type EditContract,type PlanView,type AudioCue} from './edit-contract.js';
import {hashFile,digest} from './render-cache.js';
import {checkReferenceScan} from './preflight.js';
import {mixAudioCues} from './audio-clock.js';

export const contractFile='Edit contract.json';
export function timelinePlan(t:Timeline):PlanView{
  const f=(n:number)=>Math.round(n*30),frames=Math.max(...t.clips.map(c=>f(c.start+c.duration)));
  return {frames,shots:t.clips.map(c=>({id:c.id,from:f(c.start),to:f(c.start+c.duration),asset:c.asset,trim:f(c.trim)})),speech:t.speech??(t.narration?[{from:0,to:frames,trim:0}]:t.clips.filter(c=>c.kind==='aroll').map(c=>({from:f(c.start),to:f(c.start+c.duration),trim:f(c.trim)}))),sound:t.audio.map(a=>({from:f(a.start),to:f(a.start+a.duration),trim:f(a.trim),asset:a.asset,gain:a.volume}))};
}
async function projectFile(dir:string,file:string){const candidate=safePath(dir,file),actual=await fs.realpath(candidate),realRoot=await fs.realpath(dir);safePath(realRoot,path.relative(realRoot,actual));return actual}
export async function validateProductionContract(id:string,input:unknown,options:{requireComplete?:boolean;measure?:boolean}={}){
  const c=editContractSchema.parse(input),dir=projectDir(id),p=await readProject(id),file=await projectFile(dir,c.planFile),bytes=await fs.readFile(file);
  if(hash(bytes.toString('utf8'))!==c.planSha256)throw new Error('Edit plan changed; rebind and validate the contract.');
  if(hash(p.script)!==c.narration.textSha256)throw new Error('Narration script changed; word timing is stale.');
  checkReferenceScan(p.reference);
  if(p.reference?.analysis&&String((p.reference.analysis as {source?:string}).source).replaceAll('\\','/')!==c.source.file.replaceAll('\\','/'))throw new Error('Contract source differs from the scanned reference.');
  const raw=JSON.parse(bytes.toString('utf8')),isTimeline=Array.isArray(raw.clips),plan:PlanView=isTimeline?timelinePlan(raw):raw;
  if(isTimeline&&digest(raw)!==digest(p.timeline))throw new Error('Saved timeline changed; save the current timeline before binding its contract.');
  if(!isTimeline&&raw.aroll!==c.narration.file)throw new Error('Plan A-roll differs from the aligned narration.');
  if(isTimeline&&raw.narration&&raw.narration!==c.narration.file)throw new Error('Timeline narration differs from the aligned asset.');
  const compiled=compileEditContract(c,plan,p.script);
  const pinned=[c.source,c.narration,...c.assets],seen=new Map<string,string>();
  for(const a of pinned){if(seen.has(a.file)){if(seen.get(a.file)!==a.sha256)throw new Error('Conflicting asset hashes');continue;}seen.set(a.file,a.sha256);
    const file=await projectFile(dir,a.file);if(await hashFile(file)!==a.sha256)throw new Error(`Asset changed: ${a.file}; timing/render proof is stale.`);
    if(options.measure){const info=await probe(file);if(info.audio!==a.audio)throw new Error(`Audio-stream declaration is wrong: ${a.file}`);if(info.duration&&Math.abs(Math.round(info.duration*30)-a.frames)>1)throw new Error(`Measured duration differs: ${a.file}`);}
  }
  // Every visible asset must be pinned too; a source-video path is never remake footage.
  for(const shot of plan.shots)for(const asset of [shot.asset,...shot.parts?.map(p=>p.asset)??[]].filter((v):v is string=>!!v)){if(asset===c.source.file)throw new Error('Reference footage cannot be used in the remake.');if(!seen.has(asset))throw new Error(`Visible asset is not pinned: ${asset}`)}
  for(const e of compiled.effects)if('asset' in e.effect&&e.effect.asset===c.source.file)throw new Error('Reference footage cannot be used as an effect.');
  if(options.requireComplete&&compiled.unresolved.length)throw new Error(`Unresolved required source events: ${compiled.unresolved.slice(0,20).join(', ')}`);
  return {contract:c,compiled,contractSha256:digest(c)};
}
export async function saveProductionContract(id:string,input:unknown){
  return serial('production-contract:'+id,async()=>{const checked=await validateProductionContract(id,input,{measure:true});await atomicJson(path.join(projectDir(id),contractFile),checked.contract);await mutate(id,p=>{p.contractVersion=1});return contractSummary(checked)});
}
const contractSummary=(r:Awaited<ReturnType<typeof validateProductionContract>>)=>({file:contractFile,contractSha256:r.contractSha256,frames:r.contract.frames,runtime:r.contract.runtime,coverage:r.compiled.coverage,unresolved:r.compiled.unresolved.slice(0,30),unresolvedCount:r.compiled.unresolved.length,effects:r.compiled.effects.length,audioCues:r.compiled.audio.length,visualReview:r.compiled.visualReview});
export async function readProductionContract(id:string){return editContractSchema.parse(JSON.parse(await fs.readFile(path.join(projectDir(id),contractFile),'utf8')))}
export async function checkProductionContract(id:string){return contractSummary(await validateProductionContract(id,await readProductionContract(id),{requireComplete:true,measure:true}))}
export async function readContractEvents(id:string,offset=0,limit=20){const c=await readProductionContract(id);return {total:c.events.length,offset,nextOffset:offset+limit<c.events.length?offset+limit:null,events:c.events.slice(offset,offset+limit)}}

export function audioFilter(cues:AudioCue[],frames:number){
  const samples=frames*1600,filters=cues.map((c,i)=>`[${i}:a]aresample=48000,aformat=sample_fmts=fltp:channel_layouts=stereo,atrim=start_sample=${c.trimSample}:end_sample=${c.trimSample+c.samples},asetpts=PTS-STARTPTS,volume=${c.gain},adelay=${c.fromSample}S:all=1[a${i}]`);
  if(!cues.length)throw new Error('Audio requires complete narration');
  filters.push(`${cues.map((_,i)=>`[a${i}]`).join('')}amix=inputs=${cues.length}:normalize=0:dropout_transition=0,apad=whole_len=${samples},atrim=end_sample=${samples},asetpts=N/SR/TB[out]`);return filters.join(';\n');
}
export async function prepareContractAudio(id:string,checked:Awaited<ReturnType<typeof validateProductionContract>>){
  const dir=projectDir(id),key=checked.contractSha256,relative=`exports/contract-audio-${key}.wav`,destination=safePath(dir,relative),receipt=destination+'.proof.json';
  try{const proof=JSON.parse(await fs.readFile(receipt,'utf8'));if(proof.contractSha256===key&&proof.sha256===await hashFile(destination))return relative}catch(e){if((e as NodeJS.ErrnoException).code!=='ENOENT'&&!(e instanceof SyntaxError))throw e}
  await fs.mkdir(path.dirname(destination),{recursive:true});
  const decoded=new Map<string,string>(),cache=path.join(dir,'exports','decoded-audio');await fs.mkdir(cache,{recursive:true});
  for(const asset of new Set(checked.compiled.audio.map(c=>c.asset))){const file=safePath(dir,asset),sourceHash=await hashFile(file),pcm=path.join(cache,sourceHash+'.f32');
    // A complete receipt is required; a crashed decoder's partial file is never reused.
    let reusable=false;try{const proof=JSON.parse(await fs.readFile(pcm+'.json','utf8'));reusable=proof.sha256===await hashFile(pcm)}catch(e){if((e as NodeJS.ErrnoException).code!=='ENOENT'&&!(e instanceof SyntaxError))throw e}
    if(!reusable){await run(FFMPEG,['-v','error','-y','-i',file,'-vn','-ar','48000','-ac','2','-c:a','pcm_f32le','-f','f32le',pcm+'.partial'],{timeout:1800000});await fs.rename(pcm+'.partial',pcm);await atomicJson(pcm+'.json',{sourceHash,sha256:await hashFile(pcm),sampleRate:48000,channels:2});}decoded.set(asset,pcm);
  }
  const raw=destination+'.mix.f32',mix=await mixAudioCues(checked.compiled.audio,decoded,raw,checked.contract.frames);
  await run(FFMPEG,['-v','error','-y','-f','f32le','-ar','48000','-ac','2','-i',raw,'-c:a','pcm_s24le',destination+'.rendering.wav'],{timeout:1800000});
  const info=await probe(destination+'.rendering.wav');if(!info.audio||Math.abs(info.duration*48000-checked.contract.frames*1600)>1)throw new Error('Audio assembly sample count mismatch');
  await fs.rename(destination+'.rendering.wav',destination);await atomicJson(receipt,{contractSha256:key,sha256:await hashFile(destination),...mix,cues:checked.compiled.audio,qa:'Exact samples and unclipped mix checked; listening remains required.'});await fs.unlink(raw);return relative;
}
