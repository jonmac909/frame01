import fs from 'node:fs/promises';
import path from 'node:path';
import {projectDir,atomicJson} from '../src/core.js';
const dir=path.join(projectDir('nano-banana-cartoon-workflow-28043a87'),'reference/cameras');
const requests=JSON.parse(await fs.readFile(path.join(dir,'requests.json'),'utf8'));
const rises=new Set(['badger-sheet-teaser','badger-expressions-intro','badger-kitchen-intro','badger-kitchen-detail','watercolor-world','watercolor-fox','watercolor-rabbit','watercolor-boat-intro','nineties-partner','nineties-room-open','nineties-room-closed','clay-world']);
let frames=0,tracked=0;const report=[];
for(const request of requests){
  const raw=JSON.parse(await fs.readFile(path.join(dir,request.key+'.json'),'utf8'));
  if(raw.coverage<.85)throw new Error(request.key+': insufficient measured coverage; inspect source.');
  const poses=raw.poses as {frame:number;scale:number;x:number;y:number}[];
  const first=poses[0],last=poses.at(-1)!;const complete=[];
  for(let frame=0;frame<raw.frames;frame++){
    const measured=poses.find(p=>p.frame===frame);
    if(measured){complete.push(measured);continue}
    if(frame<first.frame){
      // Only source-reviewed upward card reveals use this entrance repair.
      // The first .43 viewport displacement is the approved reveal's measurement.
      const progress=first.frame?frame/first.frame:1;
      const eased=1-Math.pow(1-progress,3);
      complete.push({frame,scale:first.scale,x:first.x,y:rises.has(request.key)?.43+(first.y-.43)*eased:first.y});
    }else if(frame>last.frame)complete.push({...last,frame});
    else throw new Error('Unexpected interior tracking gap.');
  }
  await atomicJson(path.join(dir,request.key+'.poses.json'),complete.map(p=>({frame:p.frame,scale:+p.scale.toFixed(6),x:+p.x.toFixed(6),y:+p.y.toFixed(6)})));
  frames+=raw.frames;tracked+=raw.trackedFrames;
  report.push({key:request.key,frames:raw.frames,tracked:raw.trackedFrames,coverage:raw.coverage,leadingRepair:first.frame,trailingHold:raw.frames-last.frame-1,rise:rises.has(request.key)});
}
await atomicJson(path.join(dir,'tracking-proof.json'),{frames,tracked,coverage:tracked/frames,tracks:report,source:'reference/source.mp4',fps:30,limitations:['Tracking gaps at blurred entrances and flash exits are explicitly repaired or held.','Rendered movement has not yet been compared with source; these tracks alone do not prove visual equivalence.']});
console.log(JSON.stringify({frames,tracked,coverage:tracked/frames,tracks:report.length}));
