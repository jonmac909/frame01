import fs from 'node:fs/promises';
import path from 'node:path';
import {projectDir,run,FFMPEG,atomicJson,addAsset} from '../src/core.js';
const id='nano-banana-cartoon-workflow-28043a87',dir=projectDir(id);
const image='recordings/window-1792253789934-6626b3.mp4',video='recordings/window-1792254123294-93a62f.mp4';
const rows:[string,string,number,number][]=[
 ['watercolor-image-prompt-v2',image,78,8],['rubber-image-prompt-v2',image,99,8],['paper-image-prompt-v2',image,135,8],['nineties-image-prompt-v2',image,162,8],['anime-image-prompt-v2',image,183,8],['clay-image-prompt-v2',image,210,8],
 ['nineties-video-prompt-v2',video,112,10],['watercolor-video-prompt-v2',video,174,8],['rubber-video-prompt-v2',video,194,4.5],['paper-video-prompt-v2',video,200.3,4.5],['anime-video-prompt-v2',video,206.6,4.5],['clay-video-prompt-v2',video,214,8],
 ['nineties-room-edit-v2','recordings/window-1792254736008-8b0627.mp4',85,4],
 ['model-selector-v3','recordings/window-1792255728751-f8c1b7.mp4',12,5],
 ['image-output-v3','recordings/window-1792255728751-f8c1b7.mp4',27,8],
 ['video-output-v3','recordings/window-1792255860323-3c8137.mp4',22,7],
 ['video-references-v3','recordings/shots/video-references.mp4',2,5]
];
const settingsCrops:Record<string,string>={'model-selector-v3':'1036:790:860:98','image-output-v3':'810:370:850:708','video-output-v3':'810:506:850:568','video-references-v3':'1920:1080:0:0'};
for(const [name,source,start,duration]of rows){const file=`recordings/shots/${name}.mp4`,crop=settingsCrops[name]??(name==='nineties-room-edit-v2'?'1028:310:446:164':source===image?'1068:280:426:164':'1340:400:290:164');
 if(await fs.access(path.join(dir,file)).then(()=>true,()=>false)){const proof=JSON.parse(await fs.readFile(path.join(dir,file+'.proof.json'),'utf8'));if(proof.crop===crop&&proof.start===start&&proof.duration===duration)continue;await fs.rename(path.join(dir,file),path.join(dir,file+`.previous-${Date.now()}.mp4`));}
 await run(FFMPEG,['-hide_banner','-loglevel','error','-y','-ss',String(start),'-i',path.join(dir,source),'-t',String(duration),'-vf',`crop=${crop},scale=1720:900:force_original_aspect_ratio=decrease,pad=1920:1080:(ow-iw)/2:(oh-ih)/2:color=0x10141d,setsar=1,fps=30`,'-an','-c:v','libx264','-threads','2','-preset','fast','-crf','18',path.join(dir,file)]);
 await addAsset(id,file,'screen');await atomicJson(path.join(dir,file+'.proof.json'),{source,start,duration,crop,realBrowserActions:true,galleryExcluded:true,providerGenerationSubmissions:0,qa:'Pending every selected frame at4fps'});console.log(file);
}
await atomicJson(path.join(dir,'Walkthrough insert manifest.json'),rows.map(([key,source,start,duration])=>({key,file:`recordings/shots/${key}.mp4`,source,start,duration})));
