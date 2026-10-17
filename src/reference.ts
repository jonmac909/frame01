import fs from 'node:fs/promises';
import path from 'node:path';
import {readProject,projectDir,run,YTDLP,FFMPEG,mutate,event,addAsset,safePath,probe,atomicJson} from './core.js';
export const REFERENCE_SAMPLE_FPS=4;
const downloadOptions=['--ignore-config','--no-playlist','--js-runtimes',`node:${process.execPath}`,'--remote-components','ejs:github','--ffmpeg-location',path.dirname(FFMPEG),'--no-progress'];
export function parseVtt(vtt:string){
  const cues:{start:number;end:number;text:string}[]=[];
  const time=(v:string)=>v.replace(',','.').split(':').reduce((a,b)=>a*60+Number(b),0);
  for(const block of vtt.split(/\r?\n\s*\r?\n/)){
    const m=block.match(/([\d:.,]+) --> ([\d:.,]+)[^\r\n]*\r?\n([\s\S]*)/);if(!m)continue;
    const text=m[3].replace(/<[^>]*>/g,'').replace(/&amp;/g,'&').replace(/&gt;/g,'>').replace(/&lt;/g,'<').replace(/\s+/g,' ').trim();
    if(text&&cues.at(-1)?.text!==text)cues.push({start:time(m[1]),end:time(m[2]),text});
  }return cues;
}
export async function ingestReference(id:string){
  const p=await readProject(id);const url=new URL(p.referenceUrl);
  if(!['youtube.com','www.youtube.com','youtu.be','m.youtube.com'].includes(url.hostname))throw new Error('Reference URL must be YouTube. Use local import for other sources.');
  const dir=path.join(projectDir(id),'reference');await fs.mkdir(dir,{recursive:true});
  await run(YTDLP,[...downloadOptions,'--skip-download','--write-info-json','--write-auto-subs','--sub-langs','en-orig','--sub-format','vtt','-o',path.join(dir,'source.%(ext)s'),p.referenceUrl],{timeout:180000});
  const meta=JSON.parse(await fs.readFile(path.join(dir,'source.info.json'),'utf8'));let captions:any[]=[];
  try{captions=parseVtt(await fs.readFile(path.join(dir,'source.en-orig.vtt'),'utf8'))}catch{}
  await mutate(id,p=>{p.reference={title:meta.title,duration:meta.duration,channel:meta.channel,description:meta.description,captions};event(p,'reference','Reference metadata and available English captions saved.');});
  try{
    await run(YTDLP,[...downloadOptions,'-f','bestvideo[height<=1080]+bestaudio/best[height<=1080]','--merge-output-format','mp4','-o',path.join(dir,'source.%(ext)s'),p.referenceUrl],{timeout:1800000});
    await addAsset(id,'reference/source.mp4','reference');await analyzeReference(id,'reference/source.mp4');
  }catch(e){await mutate(id,p=>event(p,'reference-warning',`Video download unavailable. Import a local copy to analyze frames. ${String(e).slice(-500)}`))}
  return readProject(id);
}
export async function analyzeReference(id:string,file:string){
  const input=safePath(projectDir(id),file),info=await probe(input);
  if(!info.video||info.duration<=0)throw new Error('A complete downloaded reference video is required.');
  // A fresh directory prevents an earlier longer scan from leaving stale frames.
  const relative=`reference/analysis-${Date.now()}`,out=safePath(projectDir(id),relative);await fs.mkdir(out,{recursive:true});
  await run(FFMPEG,['-hide_banner','-loglevel','warning','-i',input,'-an','-vf',`fps=${REFERENCE_SAMPLE_FPS},scale=640:-2,select='gte(scene,0)',metadata=print:file=scene-scores.txt`,'-q:v','3','frame-%06d.jpg'],{cwd:out,timeout:1800000});
  const scores=parseSceneScores(await fs.readFile(path.join(out,'scene-scores.txt'),'utf8'));
  const files=(await fs.readdir(out)).filter(x=>/^frame-\d{6}\.jpg$/.test(x)).sort();
  if(files.length!==scores.length||Math.abs(files.length-info.duration*REFERENCE_SAMPLE_FPS)>2)throw new Error('Reference scan is incomplete; do not use it for editing.');
  const frames=files.map((f,i)=>({file:relative+'/'+f,seconds:scores[i].seconds,sceneScore:scores[i].score}));
  const cuts=scores.filter(s=>s.score>=.20).map(s=>s.seconds);
  const sheets=await createFrameSheets(id,relative,frames.length);
  const analysis={source:file,sampleFps:REFERENCE_SAMPLE_FPS,frameCount:frames.length,mediaDuration:info.duration,cutThreshold:.20,intervalSeconds:1/REFERENCE_SAMPLE_FPS,index:relative+'/frames.json',sheets,at:new Date().toISOString(),review:'Extraction and visual-change scan complete; semantic image review is still required.'};
  await atomicJson(path.join(out,'frames.json'),{...analysis,frames,cuts});
  return mutate(id,p=>{p.reference={...p.reference,cuts,frames,analysis};event(p,'analysis',`Scanned the complete local reference at 4 fps: ${frames.length} timestamped frames and ${cuts.length} candidate cuts. Image extraction alone does not complete visual review.`)});
}
export function parseSceneScores(text:string){
  return [...text.matchAll(/frame:\s*\d+[^\r\n]*pts_time:([\d.]+)\s*\r?\n(?:[^\r\n]*\r?\n)*?lavfi\.scene_score=([\d.]+)/g)].map(m=>({seconds:Number(m[1]),score:Number(m[2])}));
}
export async function createFrameSheets(id:string,relative:string,count:number){
  const out=safePath(projectDir(id),relative);
  const font=process.env.REVIEW_FONT_PATH||path.join(process.env.WINDIR||'C:\\Windows','Fonts','consola.ttf');
  await fs.copyFile(font,path.join(out,'review-font.ttf'));
  await run(FFMPEG,['-hide_banner','-loglevel','error','-y','-framerate','4','-i','frame-%06d.jpg','-vf',"scale=320:180,pad=320:204:0:0:color=0x11151c,drawtext=fontfile=review-font.ttf:text='%{pts\\:hms}':fontsize=16:fontcolor=white:x=4:y=183,tile=8x8",'-q:v','3','sheet-%03d.jpg'],{cwd:out,timeout:300000});
  return Array.from({length:Math.ceil(count/64)},(_,i)=>({file:`${relative}/sheet-${String(i+1).padStart(3,'0')}.jpg`,start:i*16,end:Math.min(count-1,(i+1)*64-1)/4,frames:Math.min(64,count-i*64)}));
}
export async function readReferenceFrames(id:string,offset=0,limit=32){
  const p=await readProject(id),frames=p.reference?.frames as {file:string;seconds:number;sceneScore:number}[]|undefined;
  if(!frames?.length)throw new Error('Download and analyze the reference at 4 fps first.');
  return {analysis:p.reference?.analysis,total:frames.length,offset,nextOffset:offset+limit<frames.length?offset+limit:null,frames:frames.slice(offset,offset+limit),inspect:'Use media.inspect with a sheet or frame file. Read every relevant frame around transitions before setting edit cues.'};
}
