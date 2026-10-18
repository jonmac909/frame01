// Run from the app: node --import tsx cloud-render/prepare.mjs PROJECT PLAN OUTPUT [FROM:TO,...]
import fs from 'node:fs/promises';
import path from 'node:path';
import {bundle} from '@remotion/bundler';
import {ROOT,projectDir,safePath,readProject} from '../src/core.ts';
import {sourceDependencies,sectionInputs} from '../src/render-cache.ts';
import {readProductionContract,validateProductionContract,prepareContractAudio} from '../src/production-contract.ts';
import {POLICY,digest,validatePackage,invariant} from './protocol.mjs';
import {fileHash,inside,atomicJson} from './local-files.mjs';

const [projectId,planName,outputArg,rangesArg]=process.argv.slice(2);
invariant(projectId&&planName&&outputArg,'Usage: PROJECT PLAN OUTPUT [FROM:TO,...]; ranges create a benchmark package');
const dir=projectDir(projectId),out=path.resolve(outputArg),project=await readProject(projectId),raw=await fs.readFile(safePath(dir,planName),'utf8'),plan=JSON.parse(raw);
invariant(Array.isArray(plan.sections)&&Array.isArray(plan.shots),'Portable v1 supports the existing full section compositor');
invariant(!plan.bakedEdit,'This plan describes post-render trimming. Package its original render plan and apply its saved finishing map separately.');
const purpose=rangesArg?'benchmark':'production',ranges=rangesArg?rangesArg.split(',').map(s=>{const [from,to]=s.split(':').map(Number);invariant(Number.isSafeInteger(from)&&Number.isSafeInteger(to)&&from>=0&&to>from&&to<=plan.frames,'Invalid benchmark range');return {from,to};}):[{from:0,to:plan.frames}];
const checked=project.contractVersion===1?await validateProductionContract(projectId,await readProductionContract(projectId),{requireComplete:true,measure:true}):undefined;
if(purpose==='production')invariant(checked&&checked.contract.planFile===planName,'Production packaging requires the saved complete contract; legacy packages are benchmark-only');
const deps=await sourceDependencies(ROOT,'video/full-remake.tsx'),styleSha256=await digest(deps),assets=new Set();
for(const span of ranges){const cut={...plan,sections:[{name:'portable-unit',...span,sourceFrom:0,sourceTo:1}]};for(const a of sectionInputs(cut,0).assets)assets.add(a);}
const effects=checked?.compiled.effects??[];for(const e of effects)if(e.effect.asset&&ranges.some(r=>e.from<r.to&&e.to>r.from))assets.add(e.effect.asset);
const stem=purpose==='production'?await prepareContractAudio(projectId,checked):undefined;if(stem)assets.add(stem);
await fs.mkdir(out,{recursive:true});invariant(!await fs.stat(path.join(out,'package.json')).then(()=>true,()=>false),'Package already exists; use a new directory');
// publicDir:null prevents bundling the application's unrelated public files.
await bundle({entryPoint:path.join(ROOT,'video/full-remake.tsx'),outDir:path.join(out,'bundle'),publicDir:null});
const files=[];
async function inventory(dir,prefix){for(const ent of await fs.readdir(dir,{withFileTypes:true})){const rel=prefix+'/'+ent.name,p=path.join(dir,ent.name);if(ent.isDirectory())await inventory(p,rel);else{invariant(ent.isFile(),'Non-file renderer entry');files.push({path:rel,sha256:await fileHash(p),size:(await fs.stat(p)).size});}}}
await inventory(path.join(out,'bundle'),'bundle');
for(const name of [...assets].sort()){
  const source=safePath(dir,name),real=await fs.realpath(source),root=await fs.realpath(dir);invariant(real.startsWith(root+path.sep),'Asset escapes project');
  const relative='media/'+name.replaceAll('\\','/'),dest=inside(out,relative),sha256=await fileHash(source);await fs.mkdir(path.dirname(dest),{recursive:true});
  // Copy instead of hardlink: later project edits cannot mutate a packaged render.
  await fs.copyFile(source,dest);invariant(await fileHash(dest)===sha256,'Asset changed while packaging');files.push({path:relative,sha256,size:(await fs.stat(dest)).size});
}
const font=plan.reviewEffects?.font,fontDataUrl=font?`data:font/ttf;base64,${(await fs.readFile(safePath(dir,font))).toString('base64')}`:undefined;
plan.baseUrl='';const props={plan,offset:0,length:plan.frames,effects,...fontDataUrl?{fontDataUrl}:{}};
const p={version:1,renderer:'remotion',compositionId:'FullRemake',purpose,providers:POLICY,identity:{channelId:projectId,avatar:project.avatar,voice:project.voice,model:project.model,tone:project.tone??'',speed:project.voiceSpeed??1},styleSha256,planSha256:await digest(raw),contractSha256:checked?.contractSha256??null,audioStem:stem?'media/'+stem:null,frames:plan.frames,fps:30,width:1920,height:1080,ranges,inputProps:props,files:files.sort((a,b)=>a.path.localeCompare(b.path))};
validatePackage(p);invariant(await digest(await sourceDependencies(ROOT,'video/full-remake.tsx'))===styleSha256,'Renderer changed during packaging');invariant(await fs.readFile(safePath(dir,planName),'utf8')===raw,'Plan changed during packaging');
await atomicJson(path.join(out,'package.json'),p);await atomicJson(path.join(out,'package.proof.json'),{packageHash:await digest(p),purpose,styleSha256,files:files.length,bytes:files.reduce((n,f)=>n+f.size,0),preparedAt:new Date().toISOString(),qa:'Packaging is not approval of rendered output.'});
console.log(JSON.stringify({packageHash:await digest(p),purpose,files:files.length,bytes:files.reduce((n,f)=>n+f.size,0),out,ranges}));
