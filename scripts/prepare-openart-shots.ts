import fs from 'node:fs/promises';
import path from 'node:path';
import {projectDir,run,FFMPEG,addAsset,atomicJson} from '../src/core.js';
const id='nano-banana-cartoon-workflow-28043a87',dir=projectDir(id);
const first='recordings/openart-model-and-image-settings.mp4',second='recordings/openart-prompts-and-video-settings.mp4';
const shots=[
  ['model-selector',first,15,15,'780:500:890:55'],
  ['image-output',first,40,9,'480:220:880:510'],
  ['character-prompt',second,1,10,'1030:220:445:162'],
  ['expression-prompt',second,20,18,'1030:220:445:162'],
  ['kitchen-prompt',second,48,18,'1030:220:445:162'],
  ['video-references',second,73,8,'420:205:455:170'],
  ['video-output',second,84,10,'480:305:880:572'],
  ['animation-prompt',second,102,40,'1030:220:445:162'],
  ['watercolor-prompt',second,157,8,'1030:220:445:162'],
  ['dialogue-prompt',second,170,32,'1030:220:445:162'],
] as const;
await fs.mkdir(path.join(dir,'recordings/shots'),{recursive:true});
for(const [name,source,start,duration,crop] of shots){
  const file=`recordings/shots/${name}.mp4`;
  await run(FFMPEG,['-y','-ss',String(start),'-i',path.join(dir,source),'-t',String(duration),'-vf',`crop=${crop},scale=1720:900:force_original_aspect_ratio=decrease,pad=1920:1080:(ow-iw)/2:(oh-ih)/2:color=0x10141d,setsar=1,fps=30`,'-an','-c:v','libx264','-threads','2','-preset','fast','-crf','18',path.join(dir,file)],{timeout:600000});
  await addAsset(id,file,'screen');
  await atomicJson(path.join(dir,file+'.proof.json'),{source,sourceStart:start,duration,crop,purpose:'Crop real recorded controls and prompts; omit unrelated account gallery.',providerGenerations:0});
  console.log(file);
}
