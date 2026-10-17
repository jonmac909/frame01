import fs from 'node:fs/promises';
import path from 'node:path';
import {COURSE,DATA,atomicJson,hash,projectDir,safePath,probe,mutate,event,run,FFMPEG,addAsset} from './core.js';
export const PACK=path.join(COURSE,'Bonus Resources','ULTIMATE FILMMAKING PACK 1');
type Entry={id:string;name:string;relativePath:string;category:'sfx'|'font'|'transition'|'background'|'lut';bytes:number;duration?:number};
let entries:Entry[]=[];
async function walk(dir:string):Promise<string[]>{const out:string[]=[];for(const item of await fs.readdir(dir,{withFileTypes:true})){const file=path.join(dir,item.name);if(item.isDirectory())out.push(...await walk(file));else out.push(file)}return out}
export async function indexLibrary(){
  const result:Entry[]=[];
  for(const file of await walk(PACK)){
    const rel=path.relative(PACK,file),ext=path.extname(file).toLowerCase();let category:Entry['category'];
    if(rel.startsWith('SFX')&&/\.(wav|mp3|m4a|ogg)$/.test(ext))category='sfx';
    else if(/\.(ttf|otf|woff2?)$/.test(ext))category='font';
    else if(/\.(cube|3dl)$/.test(ext))category='lut';
    else if(rel.startsWith('Film Transitions')&&/\.(mp4|mov|webm)$/.test(ext))category='transition';
    else if(rel.startsWith('Motion Backgrounds')&&/\.(mp4|mov|webm)$/.test(ext))category='background';
    else continue;
    const row:Entry={id:hash(rel).slice(0,16),name:path.basename(file,path.extname(file)),relativePath:rel,category,bytes:(await fs.stat(file)).size};
    if(['sfx','transition','background'].includes(category))try{row.duration=(await probe(file)).duration}catch{}
    result.push(row);
  }
  entries=result;await atomicJson(path.join(DATA,'filmmaking-library.json'),{root:PACK,at:new Date().toISOString(),entries});
  return {total:entries.length,categories:Object.fromEntries(['sfx','font','transition','background','lut'].map(c=>[c,entries.filter(e=>e.category===c).length]))};
}
async function ensure(){if(!entries.length)try{entries=JSON.parse(await fs.readFile(path.join(DATA,'filmmaking-library.json'),'utf8')).entries}catch{await indexLibrary()}}
export async function searchLibrary(query='',category?:string){await ensure();const terms=query.toLowerCase().split(/\s+/).filter(Boolean);return entries.filter(e=>(!category||e.category===category)&&terms.every(t=>(e.name+' '+e.relativePath).toLowerCase().includes(t))).slice(0,100)}
export async function importLibrary(id:string,assetId:string){
  await ensure();const entry=entries.find(e=>e.id===assetId);if(!entry)throw new Error('Search the filmmaking library and select an existing asset ID.');
  const source=safePath(PACK,entry.relativePath),file=`assets/pack-${entry.id}-${path.basename(source).replace(/[^a-z0-9_.-]/gi,'_')}`;
  await fs.mkdir(path.join(projectDir(id),'assets'),{recursive:true});await fs.copyFile(source,safePath(projectDir(id),file));
  await mutate(id,p=>{if(!p.assets.some(a=>a.file===file))p.assets.push({file,kind:entry.category,duration:entry.duration});event(p,'pack-import',`Imported ${entry.relativePath} from ULTIMATE FILMMAKING PACK 1.`)});
  return {...entry,file};
}
export async function gradeAsset(id:string,file:string,lut:string){
  if(!/\.(cube|3dl)$/i.test(lut))throw new Error('Choose an imported LUT file.');
  const dir=path.join(projectDir(id),'grading',Date.now().toString());await fs.mkdir(dir,{recursive:true});await fs.copyFile(safePath(projectDir(id),lut),path.join(dir,'grade'+path.extname(lut)));
  const output=`assets/graded-${Date.now()}.mp4`;
  await run(FFMPEG,['-y','-i',safePath(projectDir(id),file),'-vf',`lut3d=file=grade${path.extname(lut)}`,'-c:v','libx264','-crf','18','-preset','fast','-c:a','aac',safePath(projectDir(id),output)],{cwd:dir,timeout:1800000});await addAsset(id,output,'broll');return {file:output,lut};
}
