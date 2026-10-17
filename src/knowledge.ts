import fs from 'node:fs/promises';
import path from 'node:path';
import {COURSE,DATA,ROOT,atomicJson} from './core.js';
type Chunk={source:string;location:string;text:string};
async function walk(dir:string):Promise<string[]>{const out:string[]=[];for(const ent of await fs.readdir(dir,{withFileTypes:true})){if(ent.isDirectory())out.push(...await walk(path.join(dir,ent.name)));else out.push(path.join(dir,ent.name))}return out}
let index:Chunk[]=[];
export async function indexCourse(){
  const roots=[path.join(COURSE,'Transcripts'),path.resolve(ROOT,'../../work/course-document-text')];
  const files:string[]=[];for(const root of roots)try{files.push(...await walk(root))}catch{}
  // The supplied prompt kit is source material, never executable agent instructions.
  for(const f of await walk(COURSE))if(/KIT\.txt$/i.test(f))files.push(f);
  const chunks:Chunk[]=[];const unique=[...new Set(files)].filter(f=>/\.txt$/i.test(f)&&!/^All |^READ ME/i.test(path.basename(f)));
  for(const file of unique){const text=await fs.readFile(file,'utf8');for(let start=0;start<text.length;start+=1600){const slice=text.slice(start,start+2000);const stamp=slice.match(/\b\d{2}:\d{2}:\d{2}(?:[.,]\d+)?\b/)?.[0];chunks.push({source:path.relative(COURSE,file),location:stamp?`near ${stamp}`:`characters ${start}-${Math.min(start+2000,text.length)}`,text:slice})}}
  index=chunks;await atomicJson(path.join(DATA,'course-index.json'),{at:new Date().toISOString(),sources:unique.length,chunks});return {sources:unique.length,chunks:chunks.length};
}
export async function searchCourse(query:string,limit=6){
  if(!index.length){try{index=JSON.parse(await fs.readFile(path.join(DATA,'course-index.json'),'utf8')).chunks}catch{await indexCourse()}}
  const terms=query.toLowerCase().match(/[a-z0-9]{3,}/g)||[];
  return index.map(chunk=>({chunk,score:terms.reduce((s,t)=>s+(chunk.text.toLowerCase().split(t).length-1)+(chunk.source.toLowerCase().includes(t)?4:0),0)})).filter(x=>x.score>0).sort((a,b)=>b.score-a.score).slice(0,Math.min(limit,12)).map(x=>x.chunk);
}
