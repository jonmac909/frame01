import fs from 'node:fs/promises';
import {createReadStream} from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {parse} from '@babel/parser';
import type {FullPlan} from '../video/full-types.js';

export function canonical(value:unknown):string {if(value===null||typeof value!=='object')return JSON.stringify(value);if(Array.isArray(value))return '['+value.map(canonical).join(',')+']';return '{'+Object.entries(value).filter(([,v])=>v!==undefined).sort(([a],[b])=>a.localeCompare(b)).map(([k,v])=>JSON.stringify(k)+':'+canonical(v)).join(',')+'}'}
export const digest=(value:unknown)=>createHash('sha256').update(canonical(value)).digest('hex');
export async function hashFile(file:string){const h=createHash('sha256');for await(const chunk of createReadStream(file))h.update(chunk);return h.digest('hex')}
function inside(root:string,file:string){const p=path.resolve(root,file),rel=path.relative(root,p);if(!rel||rel.startsWith('..')||path.isAbsolute(rel))throw new Error('Dependency path leaves its root');return p}
export async function sourceDependencies(root:string,entry:string){
  const result:Record<string,string>={};
  async function visit(file:string){const absolute=inside(root,file),relative=path.relative(root,absolute).replaceAll('\\','/');if(result[relative])return;
    const text=await fs.readFile(absolute,'utf8');result[relative]=await hashFile(absolute);
    if(!/\.[cm]?[jt]sx?$/.test(relative))return;
    const imports:string[]=[],tree=parse(text,{sourceType:'module',plugins:['typescript','jsx']});
    function inspect(node:unknown){
      if(!node||typeof node!=='object')return;
      const n=node as {type?:string;source?:{value?:unknown};callee?:{type?:string;name?:string};arguments?:{type?:string;value?:unknown}[];argument?:{value?:unknown}};
      if(['ImportDeclaration','ExportNamedDeclaration','ExportAllDeclaration'].includes(n.type??'')&&typeof n.source?.value==='string')imports.push(n.source.value);
      if(n.type==='TSImportType'&&typeof n.argument?.value==='string')imports.push(n.argument.value);
      if(n.type==='CallExpression'&&(n.callee?.type==='Import'||n.callee?.type==='Identifier'&&n.callee.name==='require')){const arg=n.arguments?.[0];if(arg?.type!=='StringLiteral'||typeof arg.value!=='string')throw new Error(`Dynamic render imports must be explicit in ${relative}`);imports.push(arg.value)}
      for(const value of Object.values(node))if(Array.isArray(value))value.forEach(inspect);else inspect(value);
    }inspect(tree);
    for(const specifier of imports.filter(name=>name.startsWith('.'))){
      const base=path.resolve(path.dirname(absolute),specifier),without=base.replace(/\.(js|jsx)$/,'');
      const choices=[base,without+'.ts',without+'.tsx',path.join(base,'index.ts'),path.join(base,'index.tsx')];let found:string|undefined;
      for(const candidate of choices)if(await fs.stat(candidate).then(s=>s.isFile(),()=>false)){found=candidate;break}
      if(!found)throw new Error(`Unresolved render dependency ${specifier} in ${relative}`);await visit(found);
    }
  }
  await visit(entry);
  for(const file of ['package.json','package-lock.json','tsconfig.json'])if(await fs.stat(path.join(root,file)).then(()=>true,()=>false))result[file]=await hashFile(path.join(root,file));
  return result;
}
export function sectionInputs(plan:FullPlan,index:number){
  const section=plan.sections[index];if(!section)throw new Error('Unknown section');const overlap=(s:{from:number;to:number})=>s.from<section.to&&s.to>section.from;
  const shots=plan.shots.filter(overlap),speech=plan.speech.filter(overlap),sound=plan.sound.filter(overlap),sfx=plan.sfx.filter(n=>n<section.to&&n+24>section.from);
  const review=plan.reviewEffects,reviewEffects=review?{font:review.font,bananaCard:shots.some(s=>s.kind==='intro')?review.bananaCard:undefined,flashes:review.flashes.filter(n=>n<section.to&&n+13>section.from),ctas:review.ctas.filter(overlap),titles:review.titles.filter(overlap)}:undefined;
  const assets=new Set<string>();
  if(speech.length||shots.some(s=>s.kind==='presenter'||s.kind.startsWith('screen')))assets.add(plan.aroll);
  if(sfx.length)assets.add(plan.whoosh);
  if(reviewEffects){assets.add(reviewEffects.font);if(reviewEffects.bananaCard)assets.add(reviewEffects.bananaCard)}
  for(const s of sound)assets.add(s.asset);
  for(const s of shots){if(s.asset)assets.add(s.asset);for(const p of s.parts??[])assets.add(p.asset);
    if(s.kind==='teaser')for(const file of ['local-opening-workshop-wide.png','opening-dialogue-first-timed.mp4','opening-dialogue-second-clean.mp4',...review?[]:['local-opening-dialogue-second.mp4']])assets.add('assets/'+file);
    if(s.kind==='montage')for(const key of ['3d-badger-scene','watercolor-village','rubber-hose-magic','paper-underwater','nineties-dialogue','anime-bridge','clay-kite'])assets.add(`assets/local-${key}-motion.mp4`);
  }
  // Presenter hold behavior can read the nearest off-section speech boundary.
  const previous=plan.speech.filter(s=>s.to<=section.from).at(-1),next=plan.speech.find(s=>s.from>=section.to);
  // Default flash uses the shot preceding this section.
  const precedingShot=plan.shots.filter(s=>s.to<=section.from).at(-1);
  return {slice:{fps:plan.fps,section,ending:section.to>=plan.frames-18?plan.frames:null,aroll:assets.has(plan.aroll)?plan.aroll:null,whoosh:sfx.length?plan.whoosh:null,shots,speech,sound,sfx,reviewEffects,previousSpeech:previous,nextSpeech:next,precedingShot:precedingShot?{kind:precedingShot.kind,to:precedingShot.to}:null},assets:[...assets].sort()};
}
export async function sectionSignature(root:string,project:string,plan:FullPlan,index:number,settings:unknown,dependencies?:Record<string,string>){
  const inputs=sectionInputs(plan,index),assets:Record<string,string>={};
  const extra=(settings as {effects?:{effect:{asset?:string}}[]})?.effects??[];
  for(const file of new Set([...inputs.assets,...extra.flatMap(e=>e.effect.asset?[e.effect.asset]:[])]))assets[file]=await hashFile(inside(project,file));
  const evidence={schemaVersion:2,inputs:inputs.slice,assets,dependencies:dependencies??await sourceDependencies(root,'video/full-remake.tsx'),settings};
  return {signature:digest(evidence),evidence};
}
export async function validCachedSection(file:string,signature:string,frames:number){
  try{const proof=JSON.parse(await fs.readFile(file+'.proof.json','utf8'));return proof.cacheVersion===2&&proof.renderSignature===signature&&proof.frames===frames&&proof.outputSha256===await hashFile(file)}catch(e){if((e as NodeJS.ErrnoException).code==='ENOENT'||e instanceof SyntaxError)return false;throw e}
}
